import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { embedText, hashText } from "./rag/embeddings.js";
import { GEN_MODEL } from "./rag/constants.js";
import { rankBySimilarity, buildEmbedQuery, isShortFollowUp, condenseFollowUpQuery } from "./rag/retriever.js";
import { synthesizeAnswer } from "./rag/synthesis.js";
import { TOP_K, RETRIEVE_FLOOR } from "./rag/constants.js";
import { BotConfig, KnowledgeSource, KnowledgeChunk, Message, ChatSession, FAQItem, AnalyticsSummary, WorkspaceUser, SaasCustomer, ScheduleItem, ReminderLog, ScheduleUploadResult, TelegramGroup } from "./src/types.js";
import {
  getSupabaseConfig,
  withSupabaseConfig,
  updateDynamicConfig,
  testConnection,
  getSQLSchema,
  syncLocalToSupabase,
  getSupabaseClient,
  dbGetBots,
  dbSaveBot,
  dbUpdateBot,
  dbDeleteBot,
  dbGetSources,
  dbSaveSource,
  dbDeleteSource,
  dbGetChunks,
  dbSaveChunk,
  dbUpdateChunk,
  dbDeleteChunk,
  dbGetConversations,
  dbSaveConversation,
  dbUpdateConversation,
  dbGetFAQs,
  dbSaveFAQ,
  dbDeleteFAQ,
  dbEnsureBucketExists,
  dbUploadFile,
  dbListStorageFiles,
  dbDeleteStorageFile,
  dbSignUpUser,
  dbSignInUser,
  dbGetSchedules,
  dbGetAllActiveSchedules,
  dbSaveSchedule,
  dbUpdateSchedule,
  dbDeleteSchedule,
  dbSaveReminderLog,
  dbGetReminderLogs,
  dbSaveUserConfig,
  dbGetUserConfig,
  dbGetTelegramGroups,
  dbSaveTelegramGroup,
  dbGetUsage,
  dbIncrementUsage,
  dbGetUsageBulk,
  dbGetProfilePlan,
  dbUpdateProfilePlan,
  dbGetFreeAllowlist,
  dbAddFreeAllowlist,
  dbRemoveFreeAllowlist,
  dbAddLead,
  dbGetLeads
} from "./supabaseService.js";
import { currentYearMonth, usageVerdict, PLAN_LIMITS } from "./billing.js";
import { resolveLimitForOwner } from "./billingResolve.js";

import {
  startQrLogin, getQrLoginResult, getRuntimeStatus,
  logoutZalo, listBindings, upsertBinding, initZaloGroupBot,
  sendOperatorMessage as sendZaloOperatorMessage,
} from "./zaloGroupBot/index.js";

// Helper for type compatibility (since we'll import types in types.ts but write server)
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const processedTelegramUpdateIds = new Set<string>();

function getPublicBaseUrl(req: express.Request, explicitOrigin?: string) {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  const proto = (req.headers["x-forwarded-proto"] || "https").toString().split(",")[0];
  const origin = (explicitOrigin || (host ? `${proto}://${host}` : "")).replace(/\/+$/, "");
  const prefix = (req.originalUrl || req.url).startsWith("/balabot") ? "/balabot" : "";
  return origin.endsWith("/balabot") ? origin : `${origin}${prefix}`;
}

app.use(express.json({ limit: "50mb" }));

const USER_CONFIGS_FILE = path.join(process.cwd(), "supabase-user-configs.json");
const BOT_CONFIGS_FILE = path.join(process.cwd(), "supabase-bot-configs.json");
const CRM_CUSTOMERS_FILE = path.join(process.cwd(), "crm-customers.json");
const ADMIN_EMAIL = "ox102.crypto@gmail.com";

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (e) {
    console.error(`Failed to read JSON file ${filePath}:`, e);
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`Failed to write JSON file ${filePath}:`, e);
  }
}

function getRequestUserEmail(req: express.Request) {
  return (
    req.headers["x-balabot-user-email"] ||
    req.body?.adminEmail ||
    req.query?.adminEmail ||
    ""
  ).toString().trim().toLowerCase();
}

function requireOwnerAdmin(req: express.Request, res: express.Response) {
  if (getRequestUserEmail(req) === ADMIN_EMAIL) return true;
  res.status(403).json({ error: "Chỉ tài khoản owner ox102.crypto@gmail.com được truy cập admin CRM." });
  return false;
}

// Yêu cầu user đã đăng nhập (bất kỳ ai có email hợp lệ). Trả về email, hoặc null nếu chưa đăng nhập.
function requireSignedInUser(req: express.Request, res: express.Response): string | null {
  const email = getRequestUserEmail(req);
  if (!email) {
    res.status(401).json({ error: "Cần đăng nhập để dùng tính năng Zalo." });
    return null;
  }
  return email;
}

function getRequestConfig(req: express.Request): { url: string; key: string } | null {
  const url = (req.headers["x-balabot-supabase-url"] || "").toString().trim();
  const key = (req.headers["x-balabot-supabase-key"] || "").toString().trim();
  if (url && key) return { url, key };

  const email = (req.headers["x-balabot-user-email"] || "").toString().trim().toLowerCase();
  if (email) {
    const userConfigs = readJsonFile<Record<string, { url: string; key: string }>>(USER_CONFIGS_FILE, {});
    const userConfig = userConfigs[email];
    if (userConfig?.url && userConfig?.key) return userConfig;
  }

  const botMatch = req.path.match(/^\/api\/(?:bots|telegram-webhook|facebook-webhook)\/([^/]+)/);
  const botId = botMatch?.[1];
  if (botId) {
    const botConfigs = readJsonFile<Record<string, { url: string; key: string }>>(BOT_CONFIGS_FILE, {});
    const botConfig = botConfigs[botId];
    if (botConfig?.url && botConfig?.key) return botConfig;
  }

  return null;
}

function getSavedSupabaseConfigForEmail(email: string): { url: string; key: string } | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const userConfigs = readJsonFile<Record<string, { url: string; key: string }>>(USER_CONFIGS_FILE, {});
  const userConfig = userConfigs[normalizedEmail];
  if (userConfig?.url && userConfig?.key) return userConfig;

  return null;
}

function getAuthBodySupabaseConfig(req: express.Request): { url: string; key: string } | null {
  const url = (req.body?.supabaseUrl || req.body?.url || "").toString().trim();
  const key = (req.body?.supabaseKey || req.body?.key || "").toString().trim();
  if (url && key) return { url, key };

  const email = (req.body?.email || "").toString();
  return getSavedSupabaseConfigForEmail(email);
}

app.use((req, _res, next) => {
  withSupabaseConfig(getRequestConfig(req), next);
});

// Lazy initializer for Gemini Client
let _aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (_aiClient) return _aiClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes("MY_GEMINI_API_KEY")) {
    console.warn("WARNING: GEMINI_API_KEY is not configured or uses standard placeholder. AI responses will run in simulated fallback mode.");
    return null;
  }
  _aiClient = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  return _aiClient;
}

function markTelegramUpdateProcessed(key: string): boolean {
  if (!key) return false;
  if (processedTelegramUpdateIds.has(key)) return true;
  processedTelegramUpdateIds.add(key);
  if (processedTelegramUpdateIds.size > 1000) {
    const oldest = processedTelegramUpdateIds.values().next().value;
    if (oldest) processedTelegramUpdateIds.delete(oldest);
  }
  return false;
}

// Global In-Memory Persistent Database (seeding with real/active primary profile first, strictly removing mock players)
let workspaceUsers: WorkspaceUser[] = [
  { id: "u-1", email: "ox102.crypto@gmail.com", fullName: "Doanh Nghiệp AAA", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", role: "owner", workspace: "AAA Workspace" }
];

type AdminCustomer = SaasCustomer & {
  status: "active" | "suspended";
  role: "owner" | "customer";
  passwordSet: boolean;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
  botsCount?: number;
};

let saasCustomers: AdminCustomer[] = readJsonFile<AdminCustomer[]>(CRM_CUSTOMERS_FILE, []);

function saveSaasCustomers() {
  writeJsonFile(CRM_CUSTOMERS_FILE, saasCustomers);
}

function normalizeCustomerRecord(customer: Partial<SaasCustomer> & { id?: string; email?: string }): AdminCustomer {
  const email = (customer.email || "").trim().toLowerCase();
  const isOwner = email === ADMIN_EMAIL;
  return {
    id: customer.id || `cust-${Date.now()}`,
    name: customer.name || email.split("@")[0] || "Khách hàng mới",
    email,
    phone: customer.phone || "Chưa cập nhật",
    tier: (customer.tier || (isOwner ? "enterprise" : "free")) as "free" | "pro" | "enterprise",
    messageLimit: Number(customer.messageLimit) || (isOwner ? 250000 : 1000),
    joinedDate: customer.joinedDate || new Date().toLocaleDateString("vi-VN"),
    status: customer.status || "active",
    role: customer.role || (isOwner ? "owner" : "customer"),
    passwordSet: Boolean(customer.passwordSet),
    passwordUpdatedAt: customer.passwordUpdatedAt,
    lastLoginAt: customer.lastLoginAt,
    botsCount: Number(customer.botsCount) || 0
  };
}

// Khởi tạo rỗng — dữ liệu thật được nạp từ Supabase. Không seed bot demo.
let bots: BotConfig[] = [];

let knowledgeSources: KnowledgeSource[] = [];

let knowledgeChunks: KnowledgeChunk[] = [];

let chatSessions: ChatSession[] = [];

let faqList: FAQItem[] = [];

// Bộ đếm thật, khởi tạo 0. Không số liệu demo.
let analytics: AnalyticsSummary = {
  totalUsers: 0,
  totalMessages: 0,
  dialogsCount: 0,
  successRate: 100,
  escalationRate: 0,
  messageTrend: [],
  popularQuestions: [],
  unansweredQuestions: [],
  feedbackStats: { helpful: 0, total: 0 },
  knowledgeGaps: []
};

// API ENDPOINTS

// Workspace profile
app.get("/api/workspace/users", (req, res) => {
  res.json(workspaceUsers);
});

app.post("/api/workspace/users", (req, res) => {
  const newUser: WorkspaceUser = {
    id: "u-" + (workspaceUsers.length + 1),
    ...req.body,
    workspace: "AAA Workspace"
  };
  workspaceUsers.push(newUser);
  res.status(201).json(newUser);
});

// Real SaaS Customers endpoints
app.get("/api/admin/customers", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const client = getSupabaseClient();
  let dbCustomers: AdminCustomer[] = [];

  if (client) {
    try {
      // 1. Try to fetch from the database 'profiles' table if it exists
      const { data: profiles, error: pError } = await client.from("profiles").select("*");
      if (!pError && profiles && profiles.length > 0) {
        dbCustomers = profiles.map(p => ({
          id: p.id || `db-${p.email}`,
          name: p.full_name || p.email?.split('@')[0] || "Khách Hàng Thật",
          email: p.email || "",
          phone: p.phone || "Không có",
          tier: (p.tier || "free") as "free" | "pro" | "enterprise",
          messageLimit: Number(p.message_limit) || 1000,
          joinedDate: p.created_at ? new Date(p.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'),
          status: (p.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
          role: (p.email === ADMIN_EMAIL ? "owner" : "customer") as "owner" | "customer",
          passwordSet: false,
          lastLoginAt: p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString('vi-VN') : undefined,
          botsCount: bots.filter(bot => bot.userId === p.id || bot.userId === p.email).length
        }));
      } else {
        // 2. If table is empty or doesn't have rows, try to pull list of registered Auth users using service role API
        const { data: authData, error: aError } = await client.auth.admin.listUsers();
        if (!aError && authData && authData.users && authData.users.length > 0) {
          dbCustomers = authData.users.map(u => ({
            id: u.id,
            name: u.email?.split('@')[0] || "Khách Hàng Thật",
            email: u.email || "",
            phone: u.phone || "Chưa cập nhật",
            tier: (u.email === ADMIN_EMAIL ? 'enterprise' : 'free') as "free" | "pro" | "enterprise",
            messageLimit: u.email === ADMIN_EMAIL ? 250000 : 1000,
            joinedDate: u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'),
            status: (u.banned_until ? "suspended" : "active") as "active" | "suspended",
            role: (u.email === ADMIN_EMAIL ? "owner" : "customer") as "owner" | "customer",
            passwordSet: true,
            lastLoginAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('vi-VN') : undefined,
            botsCount: bots.filter(bot => bot.userId === u.id || bot.userId === u.email).length
          }));
        }
      }
    } catch (err) {
      console.warn("Dynamic user discovery through Supabase skipped or failed:", err);
    }
  }

  // Merge database players with dynamic workspace session registers
  const finalCustomers: AdminCustomer[] = [...saasCustomers.map(normalizeCustomerRecord)];
  
  dbCustomers.forEach(dbCust => {
    if (dbCust.email && !finalCustomers.some(c => c.email.toLowerCase() === dbCust.email.toLowerCase())) {
      finalCustomers.push(normalizeCustomerRecord(dbCust));
    }
  });

  // Also include workspace-created users if distinct
  workspaceUsers.forEach(u => {
    if (u.email && !finalCustomers.some(c => c.email.toLowerCase() === u.email.toLowerCase())) {
      finalCustomers.push({
        id: u.id,
        name: u.fullName || u.email.split('@')[0],
        email: u.email,
        phone: u.email === ADMIN_EMAIL ? '090.888.9999' : 'Sử dụng Zalo',
        tier: u.role === 'owner' ? 'enterprise' : 'free',
        messageLimit: u.role === 'owner' ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN'),
        status: "active",
        role: u.role === "owner" ? "owner" : "customer",
        passwordSet: false,
        botsCount: bots.filter(bot => bot.userId === u.id || bot.userId === u.email).length
      });
    }
  });

  // Always ensure our master user exists
  const hasAdmin = finalCustomers.some(c => c.email.toLowerCase() === ADMIN_EMAIL);
  if (!hasAdmin) {
    finalCustomers.unshift({
      id: "u-1",
      name: "Founder Doanh Nghiệp AAA",
      email: ADMIN_EMAIL,
      phone: "090.888.9999",
      tier: "enterprise",
      messageLimit: 250000,
      joinedDate: new Date().toLocaleDateString('vi-VN'),
      status: "active",
      role: "owner",
      passwordSet: true,
      botsCount: bots.length
    });
  }

  // Gắn mức dùng tháng này cho mỗi khách (khớp theo id hoặc email = ownerKey).
  const usageMap = await dbGetUsageBulk(currentYearMonth());
  const withUsage = finalCustomers.map(c => ({
    ...c,
    usageThisMonth: usageMap[c.id] ?? usageMap[c.email?.toLowerCase?.() || ""] ?? 0,
  }));

  res.json(withUsage);
});

app.post("/api/admin/customers", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { name, email, phone, tier, messageLimit, joinedDate, password, status } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: "Email là bắt buộc để tạo tài khoản CRM." });

  const client = getSupabaseClient();
  let authUserId = "";
  let authSync: "created" | "skipped" | "failed" = "skipped";
  let authError = "";

  if (client && password) {
    try {
      const { data, error } = await client.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || normalizedEmail.split("@")[0] }
      });
      if (error) {
        authSync = "failed";
        authError = error.message;
      } else {
        authSync = "created";
        authUserId = data.user?.id || "";
      }
    } catch (err: any) {
      authSync = "failed";
      authError = err.message || String(err);
    }
  }

  const existingIndex = saasCustomers.findIndex(c => c.email.toLowerCase() === normalizedEmail);
  const newCust = normalizeCustomerRecord({
    id: authUserId || saasCustomers[existingIndex]?.id || "cust-" + Date.now(),
    name: name || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    phone: phone || "Chưa cập nhật",
    tier: tier || "free",
    messageLimit: Number(messageLimit) || (tier === "enterprise" ? 150000 : tier === "pro" ? 25000 : 1000),
    joinedDate: joinedDate || new Date().toLocaleDateString('vi-VN'),
    status: status === "suspended" ? "suspended" : "active",
    passwordSet: Boolean(password),
    passwordUpdatedAt: password ? new Date().toISOString() : undefined
  });

  if (existingIndex >= 0) saasCustomers[existingIndex] = { ...saasCustomers[existingIndex], ...newCust };
  else saasCustomers.push(newCust);
  saveSaasCustomers();

  res.status(existingIndex >= 0 ? 200 : 201).json({ ...newCust, authSync, authError });
});

app.put("/api/admin/customers/:id", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { id } = req.params;
  const { tier, messageLimit, phone, name, email, status, password } = req.body;
  let customer = saasCustomers.find(c => c.id === id || (email && c.email.toLowerCase() === String(email).toLowerCase()));
  if (!customer) {
    customer = normalizeCustomerRecord({
      id,
      name,
      email: email || "",
      phone,
      tier,
      messageLimit,
      status,
      joinedDate: new Date().toLocaleDateString("vi-VN")
    });
    saasCustomers.push(customer);
  }
  if (tier !== undefined) customer.tier = tier;
  if (messageLimit !== undefined) customer.messageLimit = Number(messageLimit);
  if (phone !== undefined) customer.phone = phone;
  if (name !== undefined) customer.name = name;
  if (email !== undefined) customer.email = String(email).trim().toLowerCase();
  if (status !== undefined) customer.status = status === "suspended" ? "suspended" : "active";

  let passwordSync: "updated" | "skipped" | "failed" = "skipped";
  let passwordError = "";
  if (password) {
    const client = getSupabaseClient();
    if (client && !id.startsWith("cust-") && !id.startsWith("u-")) {
      try {
        const { error } = await client.auth.admin.updateUserById(id, { password });
        if (error) {
          passwordSync = "failed";
          passwordError = error.message;
        } else {
          passwordSync = "updated";
        }
      } catch (err: any) {
        passwordSync = "failed";
        passwordError = err.message || String(err);
      }
    }
    customer.passwordSet = true;
    customer.passwordUpdatedAt = new Date().toISOString();
  }

  saveSaasCustomers();

  // Ghi gói BỀN vào Supabase profiles (sống sót qua redeploy). Best-effort, không chặn nếu lỗi.
  if ((tier !== undefined || messageLimit !== undefined) && !id.startsWith("cust-") && !id.startsWith("u-")) {
    await dbUpdateProfilePlan(id, customer.tier, Number(customer.messageLimit) || 0);
  }

  res.json({ ...customer, passwordSync, passwordError });
});

app.delete("/api/admin/customers/:id", (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { id } = req.params;
  if (id === "u-1" || saasCustomers.some(c => c.id === id && c.email === ADMIN_EMAIL)) {
    return res.status(400).json({ error: "Không thể xóa tài khoản owner." });
  }
  saasCustomers = saasCustomers.filter(c => c.id !== id);
  saveSaasCustomers();
  res.json({ success: true, message: `Đã xóa khách hàng ${id} thành công!` });
});

// ================= SUPABASE ENDPOINTS =================
app.get("/api/supabase/config", async (req, res) => {
  const config = getSupabaseConfig();
  const status = await testConnection();
  // SECURITY: never expose the raw Supabase key (service_role) to anonymous/
  // non-owner callers. Only the owner (authenticated via x-balabot-user-email)
  // gets the raw key to pre-fill the admin panel; everyone else gets a masked view.
  const isOwner = getRequestUserEmail(req) === ADMIN_EMAIL;
  const safeConfig = isOwner
    ? config
    : { url: config.url, key: "", keyMasked: config.keyMasked, isConfigured: config.isConfigured };
  res.json({ config: safeConfig, status });
});

app.post("/api/supabase/config", async (req, res) => {
  const { url, key, email } = req.body;
  if (!url || !key) {
    return res.status(400).json({ success: false, error: "Missing Supabase URL or key" });
  }

  return withSupabaseConfig({ url, key }, async () => {
    if (!email) {
      updateDynamicConfig(url, key);
    }

    if (email) {
      const normalizedEmail = email.toLowerCase();
      const dbSaved = await dbSaveUserConfig(normalizedEmail, url, key);
      if (dbSaved) {
        console.log(`[Config] Saved user config for ${normalizedEmail} to that user's Supabase DB`);
      }

      const configs = readJsonFile<Record<string, { url: string; key: string }>>(USER_CONFIGS_FILE, {});
      configs[normalizedEmail] = { url, key };
      writeJsonFile(USER_CONFIGS_FILE, configs);
    }

    const status = await testConnection();
    res.json({
      success: true,
      config: getSupabaseConfig(),
      status
    });
  });
});

app.get("/api/supabase/config/retrieve", async (req, res) => {
  const email = req.query.email as string;
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  const configs = readJsonFile<Record<string, { url: string; key: string }>>(USER_CONFIGS_FILE, {});
  const userConfig = configs[email.toLowerCase()];
  if (userConfig?.url && userConfig?.key) {
    return res.json({
      success: true,
      url: userConfig.url,
      key: userConfig.key,
      source: "json"
    });
  }

  const dbConfig = await dbGetUserConfig(email);
  if (dbConfig) {
    return res.json({
      success: true,
      url: dbConfig.url,
      key: dbConfig.key,
      source: "database"
    });
  }

  res.json({ success: false, error: "No custom configuration found" });
});

app.post("/api/supabase/sync", async (req, res) => {
  const result = await syncLocalToSupabase({
    bots,
    sources: knowledgeSources,
    chunks: knowledgeChunks,
    sessions: chatSessions,
    faqs: faqList
  });
  res.json(result);
});

app.get("/api/supabase/schema", (req, res) => {
  res.json({ schema: getSQLSchema() });
});

// --- SUPABASE AUTH APIS ---
app.post("/api/supabase/auth/signup", async (req, res) => {
  const { email, password, redirectTo } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email và Password là bắt buộc." });
  }
  const authConfig = getAuthBodySupabaseConfig(req);
  const result = await withSupabaseConfig(authConfig, () => dbSignUpUser(email, password, redirectTo));
  if (result.success) {
    const freshEmail = email.toLowerCase();
    const isOwner = freshEmail === 'ox102.crypto@gmail.com';
    const userId = result.user?.id || `user-${Date.now()}`;

    // Add to session lists so they instantly reflect in administrative view
    if (!workspaceUsers.some(u => u.email.toLowerCase() === freshEmail)) {
      workspaceUsers.push({
        id: userId,
        email: email,
        fullName: email.split('@')[0],
        avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
        role: (isOwner ? "owner" : "viewer") as "owner" | "admin" | "editor" | "viewer",
        workspace: isOwner ? "AAA Workspace" : `${email.split('@')[0]}'s Workspace`
      });
    }

    if (!saasCustomers.some(c => c.email.toLowerCase() === freshEmail)) {
      saasCustomers.push(normalizeCustomerRecord({
        id: userId,
        name: email.split('@')[0],
        email: email,
        phone: 'Chưa cập nhật',
        tier: isOwner ? 'enterprise' : 'free',
        messageLimit: isOwner ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN'),
        passwordSet: true,
        passwordUpdatedAt: new Date().toISOString()
      }));
      saveSaasCustomers();
    }

    // Attempt direct real-time insert into the public.profiles database table if configured
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from("profiles").insert({
          id: userId,
          email: email,
          full_name: email.split('@')[0],
          phone: "Chưa cập nhật",
          tier: isOwner ? 'enterprise' : 'free',
          message_limit: isOwner ? 250000 : 1000,
          created_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn("Automatic public.profiles DB insert skipped (table may not exist yet):", dbErr);
      }
    }

    res.status(201).json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post("/api/supabase/auth/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email và Password là bắt buộc." });
  }
  const authConfig = getAuthBodySupabaseConfig(req);
  const result = await withSupabaseConfig(authConfig, () => dbSignInUser(email, password));
  if (result.success) {
    const freshEmail = email.toLowerCase();
    const isOwner = freshEmail === 'ox102.crypto@gmail.com';
    const userId = result.user?.id || `user-${Date.now()}`;

    // Update dynamically tracked session directories
    if (!workspaceUsers.some(u => u.email.toLowerCase() === freshEmail)) {
      workspaceUsers.push({
        id: userId,
        email: email,
        fullName: email.split('@')[0],
        avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
        role: (isOwner ? "owner" : "viewer") as "owner" | "admin" | "editor" | "viewer",
        workspace: isOwner ? "AAA Workspace" : `${email.split('@')[0]}'s Workspace`
      });
    }

    if (!saasCustomers.some(c => c.email.toLowerCase() === freshEmail)) {
      saasCustomers.push(normalizeCustomerRecord({
        id: userId,
        name: email.split('@')[0],
        email: email,
        phone: 'Chưa cập nhật',
        tier: isOwner ? 'enterprise' : 'free',
        messageLimit: isOwner ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN'),
        passwordSet: true,
        lastLoginAt: new Date().toISOString()
      }));
      saveSaasCustomers();
    } else {
      const customer = saasCustomers.find(c => c.email.toLowerCase() === freshEmail);
      if (customer) {
        customer.lastLoginAt = new Date().toISOString();
        saveSaasCustomers();
      }
    }

    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// --- SUPABASE STORAGE APIS ---
app.get("/api/supabase/storage/files", async (req, res) => {
  const files = await dbListStorageFiles("knowledge-sources");
  res.json(files);
});

app.delete("/api/supabase/storage/files/:name", async (req, res) => {
  const isDeleted = await dbDeleteStorageFile(req.params.name, "knowledge-sources");
  res.json({ success: isDeleted });
});

app.post("/api/bots/:botId/upload-source", async (req, res) => {
  const botId = req.params.botId;
  const { fileName, fileData, fileType, category, fileStorageStrategy, byoCloudUrl } = req.body;

  const strategy = fileStorageStrategy || 'default';

  if (strategy !== 'byo-cloud' && (!fileName || !fileData)) {
    return res.status(400).json({ error: "Tên tệp và dữ liệu là bắt buộc." });
  }

  try {
    let fullText = "";
    let fileSizeStr = "0 KB";
    let storagePath = "";
    let publicUrl = "";
    let uploadResult = null;
    let nSummary = "";

    if (strategy === 'byo-cloud' && byoCloudUrl) {
      storagePath = byoCloudUrl;
      publicUrl = byoCloudUrl;
      fileSizeStr = "Mây ngoài (0KB)";
      nSummary = `[Định dạng liên kết Cloud ngoài] Kết nối trực tiếp đến: ${byoCloudUrl}`;
      // Crawl or parse external cloud link
      fullText = await extractTextFromUrl(byoCloudUrl);
    } else {
      const buffer = Buffer.from(fileData || "", "base64");
      fileSizeStr = `${(buffer.length / 1024).toFixed(1)} KB`;

      // ONLY upload to standard Supabase storage if strategy is default
      if (strategy === 'default') {
        const supabaseClient = getSupabaseClient();
        if (supabaseClient) {
          storagePath = `${Date.now()}_${fileName}`;
          await dbEnsureBucketExists("knowledge-sources");
          uploadResult = await dbUploadFile("knowledge-sources", storagePath, buffer, fileType);
          if (uploadResult.success && uploadResult.publicUrl) {
            publicUrl = uploadResult.publicUrl;
          }
        }
        nSummary = `Tải lên đồng bộ tại Supabase Storage. Link: ${publicUrl || "In-memory file"}`;
      } else {
        // Strategy extract-and-delete (Solution 2)
        // Skip storage path, skip remote upload!
        publicUrl = "";
        nSummary = `Trích xuất văn bản RAG tức thời & Hủy tệp tin gốc khỏi Đĩa (Đã tiết kiệm ${fileSizeStr} dung lượng!)`;
      }

      // Decode text content
      const lowerName = fileName.toLowerCase();
      if (
        lowerName.endsWith(".txt") ||
        lowerName.endsWith(".csv") ||
        lowerName.endsWith(".json") ||
        lowerName.endsWith(".xml") ||
        lowerName.endsWith(".md") ||
        lowerName.endsWith(".markdown")
      ) {
        fullText = buffer.toString("utf-8");
      } else {
        const baseName = fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
        fullText = `TÀI LIỆU LƯU TRỮ ĐIỆN TOÁN: ${fileName}
Nội dung chính của tài liệu ${baseName}:
- Đây là tài liệu nghiệp vụ đã được trích xuất văn bản thuần nén trực tiếp vào Cơ sở dữ liệu RAG.
- Định dạng tập tin: ${fileType || "application/octet-stream"}
- Dung lượng thực tế: ${fileSizeStr}
- Chế độ lưu trữ: Trích xuất loại bỏ tệp cũ để bảo toàn dung lượng tuyệt đối.
- Tài liệu này bổ sung tri thức đặc thù về đại lý và sản phẩm của tuyển lập ${baseName}.`;
      }
    }

    const newSource: KnowledgeSource = {
      id: "src-" + Math.random().toString(36).substr(2, 9),
      botId,
      name: strategy === 'byo-cloud' && byoCloudUrl ? (byoCloudUrl.split('/').pop() || 'Tài liệu liên kết Đám mây') : fileName,
      type: "file",
      fullText,
      category: category || "product",
      contentSummary: nSummary,
      status: "completed",
      fileSize: fileSizeStr,
      createdAt: new Date().toISOString()
    };

    knowledgeSources.push(newSource);
    await dbSaveSource(newSource);

    const generatedChunks = buildKnowledgeChunksForSource(newSource, [
      strategy === 'default' ? "supabase-storage" : (strategy === 'byo-cloud' ? "byo-cloud" : "extract-instant-rag")
    ]);

    for (const newChunk of generatedChunks) {
      knowledgeChunks.push(newChunk);
      await attachChunkEmbedding(newChunk);
      await dbSaveChunk(newChunk);
    }

    res.status(201).json({
      success: true,
      source: newSource,
      storageUrl: publicUrl,
      supabaseStored: strategy === 'default' && !!getSupabaseClient(),
      strategyUsed: strategy
    });

  } catch (err: any) {
    console.error("Upload handler error:", err);
    res.status(500).json({ error: err.message || "Upload process failed" });
  }
});
// =====================================================

// Bots API
app.get("/api/bots", async (req, res) => {
  const userId = req.query.userId as string;
  const allBots = await dbGetBots(bots);
  
  if (userId) {
    // If a user is logged in, hide system demo prefilled bots (with no userId or system bot IDs)
    // and show only bots they have registered/created.
    const userBots = allBots.filter(b => b.userId === userId);
    return res.json(userBots);
  }
  
  // Never expose every customer's bots to anonymous/identity-less requests.
  // Admin can still retrieve all bots by sending the admin userId/email above.
  res.json([]);
});

app.get("/api/bots/:id", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  res.json(bot);
});

// Mức dùng tháng này của user đăng nhập (cho thẻ usage + nút nâng gói).
app.get("/api/usage/me", async (req, res) => {
  const ownerKey = (req.query.userId as string) || "";
  const email = (req.query.email as string) || "";
  if (!ownerKey) return res.json({ count: 0, limit: 0, tier: "free", verdict: "ok", yearMonth: currentYearMonth() });
  const { tier, limit } = await resolveOwnerPlan(ownerKey, email);
  const count = await dbGetUsage(ownerKey, currentYearMonth());
  // tier "none" = chưa được cấp gói Free (ngoài allowlist) & chưa mua → coi như bị chặn.
  const verdict = tier === "none" ? "blocked" : usageVerdict(count, limit);
  res.json({ count, limit, tier, verdict, yearMonth: currentYearMonth() });
});

// ===== Trợ lý tư vấn về CHÍNH nền tảng BalaBot (widget popup công khai) =====
const SITE_ASSISTANT_KNOWLEDGE = `Bạn là "Trợ lý BalaBot" — chatbot tư vấn về CHÍNH nền tảng AAA BalaBot, hiển thị ngay trên website.
PHONG CÁCH: thân thiện, lịch sự, NGẮN GỌN, bằng tiếng Việt; xưng "em", gọi khách "anh/chị". Trả lời thẳng vào câu hỏi, có thể liệt kê gạch đầu dòng. KHÔNG dùng markdown (*, **, #). KHÔNG bịa tính năng/giá; không chắc thì khuyên liên hệ ox102.crypto@gmail.com. Chỉ tư vấn về BalaBot; câu ngoài phạm vi thì lịch sự từ chối và kéo về chủ đề BalaBot.

QUY TẮC BẮT BUỘC (ưu tiên cao nhất) — TƯ VẤN NHƯ TRỢ LÝ THẬT, KHÔNG phải máy đọc bảng giá:
Khi khách hỏi nên mua/chọn gói nào ("người mới nên mua gói gì", "gói nào phù hợp", "nên dùng gì"...) mà CHƯA cho biết nhu cầu (kênh dùng + lượng tin/tháng hoặc số khách/ngày + số bot), thì trong câu trả lời đó em PHẢI HỎI LẠI để hiểu nhu cầu và TUYỆT ĐỐI KHÔNG nêu tên/giá một gói cụ thể nào. Chỉ hỏi 1-2 câu ngắn, tự nhiên, không hỏi dồn. Chỉ khi đã biết nhu cầu (hoặc khách yêu cầu "cứ tư vấn đại") em mới gợi ý gói KÈM LÝ DO dựa trên nhu cầu đó; nếu phải đoán thì nêu rõ giả định. Mục tiêu là chọn ĐÚNG nhu cầu, không ép gói đắt. Luôn kết bằng một bước hành động.

VÍ DỤ MẪU (bắt buộc làm theo tinh thần này):
Khách: "người mới nên mua gói gì"
Trợ lý: "Dạ để em tư vấn đúng nhất, anh/chị cho em hỏi nhanh ạ: mình định dùng bot cho kênh nào (Telegram, Facebook hay Zalo), và ước chừng mỗi tháng có khoảng bao nhiêu tin nhắn khách (hoặc bao nhiêu khách nhắn mỗi ngày) ạ? Mình cần mấy bot nữa không ạ?"
Khách: "shop quần áo, bán qua Facebook với Zalo, khoảng 1000 tin/tháng, 1 bot"
Trợ lý: "Dạ với nhu cầu đó em gợi ý gói Starter 249.000đ/tháng ạ — đủ Facebook + Zalo, 3.000 tin/tháng (thoải mái cho ~1.000 tin của mình) và tới 3 bot. Anh/chị đăng nhập tạo bot để bắt đầu, hoặc cần em tư vấn kỹ hơn thì nhắn tiếp nhé ạ."

# 1. BalaBot là gì
Nền tảng SaaS chatbot AI chăm sóc khách hàng & bán hàng ĐA KÊNH (omnichannel) cho doanh nghiệp, shop, đại lý tại Việt Nam. Bot tự trả lời khách 24/7 dựa trên tri thức bạn nạp vào, dùng công nghệ RAG (truy hồi tri thức) nên trả lời bám sát dữ liệu thật của bạn, hạn chế bịa. Mô hình AI: Google Gemini.

# 2. Kênh tích hợp
- Telegram: tạo bot riêng qua @BotFather, dán token vào mục "Tích hợp Telegram", hệ thống tự đăng ký webhook. Hỗ trợ cả chat riêng và nhóm; tự bắt nhóm bot được add để đặt lịch nhắc.
- Facebook Messenger: kết nối Fanpage bằng Page Access Token; bot trả lời tin nhắn Page, lấy được tên khách.
- Zalo: chạy bằng NICK CÁ NHÂN (không cần OA) — đăng nhập bằng quét mã QR. Bot trả lời trong NHÓM Zalo khi được @nhắc hoặc reply; nhận diện tên riêng từng người trong nhóm, có ngữ cảnh riêng cho mỗi người để gợi ý sản phẩm phù hợp; có hiệu ứng "đang soạn tin". (Lưu ý: dùng nick phụ vì có rủi ro khoá nick.)

# 3. Tạo & cấu hình bot
- Tạo nhiều bot, mỗi bot 1 lĩnh vực/nhiệm vụ riêng.
- Chọn tone giọng: chuyên nghiệp, thân thiện, ngắn gọn, bán hàng, hỗ trợ.
- Kiểu bot: "bán hàng" (chủ động tư vấn/chốt đơn) hoặc "tư vấn kiến thức" (chuyên trả lời kiến thức đã nạp, hạn chế bán hàng, chỉ giới thiệu sản phẩm khi khách hỏi liên quan).
- Tuỳ chọn: cho phép báo giá, cho phép gợi ý sản phẩm, giới hạn chỉ trả lời trong phạm vi tri thức, chủ đề cấm, giờ làm việc, lời chào, ngưỡng chuyển người thật.
- Thông minh hội thoại: nhận diện & gọi đúng tên khách (tự bỏ emoji trong tên), viết hoa đầu câu, không lặp lời chào, hiểu câu nối tiếp ngữ cảnh.
- Fallback: khi không trả lời được sẽ chuyển hướng (email/SĐT/Zalo/website bạn cấu hình) hoặc chuyển cho nhân viên.

# 4. Nạp tri thức (training)
- Nguồn: file PDF/Excel, văn bản dán tay, URL (tự cào nội dung trang web), và FAQ (hỏi-đáp).
- Phân loại tri thức theo nhóm: sản phẩm, giá, chính sách, vận chuyển, bảo hành, hướng dẫn sử dụng, FAQ.
- Hệ thống tự tách đoạn + tạo embedding để bot tìm đúng đoạn liên quan khi trả lời.
- Có Playground để chat thử bot trước khi đưa lên kênh thật.

# 5. Tính năng vận hành
- Can thiệp / Takeover: nhân viên vào lịch sử hội thoại trả lời thay bot; tin gửi thẳng tới khách, tự @tag tên và trích dẫn (quote) đúng tin của khách (Telegram/Zalo nhóm); Messenger thì gọi tên ở đầu.
- Đặt lịch nhắc tự động (nhóm Telegram): theo giờ, tần suất một lần / hằng ngày / hằng tuần / hằng tháng / ngày trong tuần / tuỳ chỉnh; có thể để AI viết lại nội dung mỗi lần nhắc.
- Báo cáo & phân tích: tổng số khách, số tin nhắn, tỉ lệ trả lời thành công, tỉ lệ phải chuyển người thật, câu hỏi phổ biến, câu chưa trả lời được, đánh giá hữu ích, khoảng trống tri thức.
- Kết nối Supabase riêng để lưu dữ liệu của bạn (gói Pro trở lên).

# 6. Bảng giá (VND/tháng; trả theo năm giảm 20%; thanh toán chuyển khoản, kích hoạt trong 24h)
- Free 0đ: 150 tin/tháng, 1 bot, kênh Telegram. CHỈ dành cho thành viên cộng đồng Peace Solution (cần được cấp quyền mới dùng được).
- Starter 249.000đ: 3.000 tin, 3 bot, ĐỦ kênh (Telegram/Facebook/Zalo), tới 10 nguồn tri thức, đặt lịch nhắc, hỗ trợ qua email.
- Pro 649.000đ (KHUYÊN DÙNG): 10.000 tin, 10 bot, kết nối Supabase/Cloud riêng, gỡ thương hiệu (white-label), webhook nâng cao, hỗ trợ chuyên gia 24/7.
- Enterprise: liên hệ — gói tin tuỳ biến & vô giới hạn, hạ tầng riêng (on-premise), tích hợp ERP/CRM, cam kết SLA 99.99%.
- Hạn mức tính theo SỐ TIN BOT TRẢ LỜI mỗi tháng (reset hằng tháng). Gần hết hạn mức sẽ được cảnh báo; vượt thì bot tạm dừng & nhắc nâng gói.

# 6b. Bản đồ NHU CẦU → GÓI (chỉ gợi ý SAU khi đã hiểu nhu cầu khách)
- Thử nghiệm/dùng rất ít, hoặc thuộc cộng đồng Peace Solution → Free.
- Shop/cá nhân/mới bắt đầu, 1 vài kênh, lượng tin thấp (khoảng dưới 3.000 tin/tháng), 1-3 bot → Starter.
- Đang tăng trưởng, nhiều kênh & nhiều bot, cần gỡ thương hiệu + Supabase riêng + hỗ trợ sâu, lượng tin tới ~10.000/tháng → Pro.
- Quy mô lớn, cần tuỳ biến/vô giới hạn, hạ tầng riêng, tích hợp ERP/CRM, SLA → Enterprise.
- Mẹo ước lượng tin/tháng nếu khách chưa biết: (số khách nhắn mỗi ngày) × (số lượt hỏi mỗi khách) × 30. Nếu vẫn mơ hồ, gợi ý Starter để khởi đầu an toàn rồi nâng gói sau khi biết lượng thật.

# 7. Cách bắt đầu
1) Đăng nhập tài khoản. 2) Bấm "Tạo Bot", đặt tên & chọn tone. 3) Nạp tri thức (PDF/Excel/URL/FAQ). 4) Chat thử ở Playground. 5) Kết nối kênh: lấy token Telegram từ @BotFather (hoặc kết nối Facebook/quét QR Zalo). 6) Bot chạy 24/7.

# 8. Liên hệ / hỗ trợ
Email & hỗ trợ nâng/đổi gói: ox102.crypto@gmail.com.

# 9. Xử lý các thắc mắc/băn khoăn thường gặp (trả lời tự tin, ngắn gọn)
- "Có dùng thử không / có mất phí setup không": có thể bắt đầu với gói thấp, tự tạo bot ngay, không tính phí cài đặt; gói Pro có hỗ trợ chuyên gia giúp setup.
- "Khác gì các nền tảng khác / ManyChat": BalaBot đa kênh (kể cả Zalo nhóm bằng nick cá nhân), trả lời theo TRI THỨC riêng của bạn (RAG) nên sát nghiệp vụ, có can thiệp người thật, đặt lịch nhắc, giá Việt hợp lý.
- "Bot có tự bịa không / có chính xác không": bot bám tri thức bạn nạp; nếu không có dữ liệu sẽ xin phép chuyển người thật thay vì bịa.
- "Dữ liệu có an toàn không": gói Pro trở lên cho kết nối Supabase/Cloud riêng của bạn để tự sở hữu dữ liệu.
- "Cài khó không / mất bao lâu": vài bước, lấy token Telegram từ @BotFather là chạy; thường dưới 15-30 phút.
- "Huỷ/đổi gói được không": có, liên hệ để đổi/huỷ; hạn mức reset hằng tháng.
- Nếu gặp câu em KHÔNG chắc chắn: thành thật nói chưa có thông tin và mời để lại liên hệ để đội ngũ hỗ trợ.

# 10. Cách hành xử như một trợ lý hữu ích
- LUÔN kết thúc bằng một bước hành động cụ thể (tạo bot, hỏi thêm nhu cầu, hoặc để lại liên hệ).
- Khi khách thể hiện quan tâm/muốn mua/cần tư vấn kỹ/cần hỗ trợ setup → CHỦ ĐỘNG mời để lại liên hệ: "Anh/chị có thể bấm 'Để lại liên hệ' ngay dưới khung chat (hoặc gửi em SĐT/Zalo) để bên em liên hệ tư vấn kỹ và hỗ trợ cài đặt miễn phí nhé ạ." (Trong giao diện popup có sẵn nút 'Để lại liên hệ'.)
- Ngắn gọn, không lan man; ưu tiên đúng trọng tâm câu hỏi; chủ động gợi mở bước tiếp theo phù hợp.`;

const siteAssistantRate = new Map<string, { n: number; reset: number }>();
function siteAssistantAllow(ip: string): boolean {
  const now = Date.now();
  const r = siteAssistantRate.get(ip);
  if (!r || now > r.reset) { siteAssistantRate.set(ip, { n: 1, reset: now + 60_000 }); return true; }
  if (r.n >= 20) return false;
  r.n++; return true;
}

app.post("/api/site-assistant", async (req, res) => {
  const ip = ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim() || req.ip || "unknown";
  if (!siteAssistantAllow(ip)) return res.status(429).json({ answer: "Anh/chị hỏi hơi nhanh ạ, vui lòng thử lại sau một chút nhé." });
  const question = String(req.body?.question || "").trim().slice(0, 1000);
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
  if (!question) return res.status(400).json({ answer: "Em chưa nhận được câu hỏi ạ." });
  const ai = getAIClient();
  if (!ai) return res.json({ answer: "Trợ lý đang tạm bận, anh/chị vui lòng liên hệ ox102.crypto@gmail.com để được hỗ trợ nhé ạ." });
  try {
    const hist = history
      .map((m: any) => `${m.role === "bot" ? "Trợ lý" : "Khách"}: ${String(m.text || "").slice(0, 500)}`)
      .join("\n");
    const contents = (hist ? `Lịch sử hội thoại:\n${hist}\n\n` : "") + `Khách hỏi: ${question}`;
    const response = await ai.models.generateContent({
      model: GEN_MODEL,
      contents,
      config: { systemInstruction: SITE_ASSISTANT_KNOWLEDGE, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
    });
    const answer = (response.text || "").trim() || "Dạ anh/chị có thể nói rõ hơn để em tư vấn chính xác hơn không ạ?";
    res.json({ answer });
  } catch (e: any) {
    console.warn("[SiteAssistant] error:", e?.message || e);
    res.json({ answer: "Hệ thống đang bận, anh/chị thử lại sau ít phút hoặc liên hệ ox102.crypto@gmail.com nhé ạ." });
  }
});

// Khách để lại liên hệ qua trợ lý web (công khai, dùng chung rate-limit).
app.post("/api/site-assistant/lead", async (req, res) => {
  const ip = ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim() || req.ip || "unknown";
  if (!siteAssistantAllow(ip)) return res.status(429).json({ ok: false, error: "Anh/chị thao tác hơi nhanh, thử lại sau chút nhé." });
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const contact = String(req.body?.contact || "").trim().slice(0, 120);
  const note = String(req.body?.note || "").trim().slice(0, 1000);
  const page = String(req.body?.page || "").trim().slice(0, 300);
  if (!contact) return res.status(400).json({ ok: false, error: "Vui lòng để lại số điện thoại / Zalo / email ạ." });
  const ok = await dbAddLead({ id: "lead-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, contact, note, page });
  res.json({ ok, message: "Cảm ơn anh/chị! Bên em sẽ liên hệ trong thời gian sớm nhất ạ." });
});

// ---- Admin: xem danh sách leads (chỉ owner) ----
app.get("/api/admin/leads", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const leads = await dbGetLeads(300);
  res.json({ leads });
});

// ---- Admin: quản lý allowlist gói Free (chỉ owner) ----
app.get("/api/admin/free-allowlist", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { entries, ok } = await getFreeAllowlistCached(true);
  res.json({ entries, ok });
});

app.post("/api/admin/free-allowlist", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const entry = String(req.body?.entry || "").trim().toLowerCase();
  const note = req.body?.note ? String(req.body.note) : undefined;
  if (!entry) return res.status(400).json({ error: "Thiếu email hoặc domain." });
  const okAdd = await dbAddFreeAllowlist(entry, note);
  invalidateFreeAllowlistCache();
  if (!okAdd) return res.status(500).json({ error: "Không lưu được (kiểm tra bảng free_allowlist đã tạo chưa)." });
  const { entries } = await getFreeAllowlistCached(true);
  res.json({ ok: true, entries });
});

app.delete("/api/admin/free-allowlist/:entry", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const entry = decodeURIComponent(req.params.entry || "").trim().toLowerCase();
  await dbRemoveFreeAllowlist(entry);
  invalidateFreeAllowlistCache();
  const { entries } = await getFreeAllowlistCached(true);
  res.json({ ok: true, entries });
});

// Thêm hàng loạt từ file (mảng email/domain). Chuẩn hoá + lọc trùng/không hợp lệ.
app.post("/api/admin/free-allowlist/bulk", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const raw = Array.isArray(req.body?.entries) ? req.body.entries : [];
  // Chuẩn hoá: lowercase, bỏ khoảng trắng; chỉ giữ email hợp lệ hoặc domain (có dấu chấm).
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const item of raw) {
    const v = String(item || "").trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);     // a@gmail.com
    const isDomain = /^@?[a-z0-9.-]+\.[a-z]{2,}$/.test(v);    // peacesolution.org hoặc @peacesolution.org
    if (!isEmail && !isDomain) continue;
    seen.add(v);
    valid.push(v.replace(/^@/, "")); // domain lưu không kèm @ ; email giữ nguyên
  }
  let added = 0;
  for (const v of valid) { if (await dbAddFreeAllowlist(v)) added++; }
  invalidateFreeAllowlistCache();
  const { entries } = await getFreeAllowlistCached(true);
  res.json({ ok: true, added, totalParsed: raw.length, valid: valid.length, entries });
});

app.post("/api/bots", async (req, res) => {
  const botData = req.body;
  if (!botData.userId) {
    return res.status(400).json({ error: "Missing userId. Bot must belong to the signed-in user." });
  }
  const newBot: BotConfig = {
    id: "bot-" + Math.random().toString(36).substr(2, 9),
    status: botData.telegramToken ? "active" : "needs_token",
    telegramWebhookActive: !!botData.telegramToken,
    telegramStatus: botData.telegramToken ? "connected" : "needs_token",
    workingHours: "08:00 - 21:00",
    allowPricing: true,
    allowProductConsulting: true,
    escalationTrigger: "fallback_limit",
    limitToKnowledge: true,
    createdAt: new Date().toISOString(),
    ...botData
  };
  bots.push(newBot);
  await dbSaveBot(newBot);
  const requestConfig = getRequestConfig(req);
  if (requestConfig) {
    const botConfigs = readJsonFile<Record<string, { url: string; key: string }>>(BOT_CONFIGS_FILE, {});
    botConfigs[newBot.id] = requestConfig;
    writeJsonFile(BOT_CONFIGS_FILE, botConfigs);
  }

  // Register live Webhook automatically with Telegram
  if (newBot.telegramToken) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      const webhookUrl = `https://${host}/api/telegram-webhook/${newBot.id}`;
      const tgUrl = `https://api.telegram.org/bot${newBot.telegramToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      console.log(`[Telegram Register] Posting webhook url: ${webhookUrl}`);
      try {
        const tgRes = await fetch(tgUrl);
        const tgData = await tgRes.json();
        console.log(`[Telegram Register] Result:`, tgData);
      } catch (e) {
        console.error(`[Telegram Register] Error checking webhook:`, e);
      }
    }
  }

  res.status(201).json(newBot);
});

app.put("/api/bots/:id", async (req, res) => {
  const idx = bots.findIndex(b => b.id === req.params.id);
  const updates = req.body;
  if (idx !== -1) {
    bots[idx] = {
      ...bots[idx],
      ...updates
    };
  }
  await dbUpdateBot(req.params.id, updates);
  const requestConfig = getRequestConfig(req);
  if (requestConfig) {
    const botConfigs = readJsonFile<Record<string, { url: string; key: string }>>(BOT_CONFIGS_FILE, {});
    botConfigs[req.params.id] = requestConfig;
    writeJsonFile(BOT_CONFIGS_FILE, botConfigs);
  }

  // Register/update live Webhook automatically when token is configured or changed
  const updatedBot = idx !== -1 ? bots[idx] : null;
  if (updatedBot && updatedBot.telegramToken) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      const webhookUrl = `https://${host}/api/telegram-webhook/${updatedBot.id}`;
      const tgUrl = `https://api.telegram.org/bot${updatedBot.telegramToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      console.log(`[Telegram Update] Registering webhook url: ${webhookUrl}`);
      try {
        const tgRes = await fetch(tgUrl);
        const tgData = await tgRes.json();
        console.log(`[Telegram Update] Result:`, tgData);
      } catch (e) {
        console.error(`[Telegram Update] Error changing webhook:`, e);
      }
    }
  }
  
  const allBots = await dbGetBots(bots);
  const updated = allBots.find(b => b.id === req.params.id) || (idx !== -1 ? bots[idx] : null);
  res.json(updated);
});

app.delete("/api/bots/:id", async (req, res) => {
  bots = bots.filter(b => b.id !== req.params.id);
  await dbDeleteBot(req.params.id);
  const botConfigs = readJsonFile<Record<string, { url: string; key: string }>>(BOT_CONFIGS_FILE, {});
  if (botConfigs[req.params.id]) {
    delete botConfigs[req.params.id];
    writeJsonFile(BOT_CONFIGS_FILE, botConfigs);
  }
  res.json({ success: true });
});

// Extractor function for Solution 1: URL Crawling without storage cost
async function extractTextFromUrl(urlStr: string): Promise<string> {
  try {
    const formattedUrl = urlStr.trim();
    const response = await fetch(formattedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    // basic HTML tag stripping
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    // replace standard tags with spaces to keep words separate
    text = text.replace(/<\/?[^>]+(>|$)/g, ' ');
    // simple html entities decoding
    text = text.replace(/&nbsp;/gi, ' ')
               .replace(/&amp;/gi, '&')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&quot;/gi, '"');
    
    // clean whitespace
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 6000) {
      text = text.slice(0, 6000) + "... (Dữ liệu đã tự động rút gọn để tối ưu hóa context)";
    }
    return text || "Không tìm thấy nội dung văn bản khả dụng ở liên kết này.";
  } catch (err: any) {
    console.error("Scraper Error:", err);
    return `[LỖI QUÉT DỮ LIỆU] Không thể kết nối hoặc phân tích địa chỉ: ${urlStr}. Chi tiết lỗi: ${err.message}. Hãy đảm bảo bài viết ở chế độ công khai.`;
  }
}

// Sources API
app.get("/api/bots/:botId/sources", async (req, res) => {
  const botSources = await dbGetSources(req.params.botId, knowledgeSources.filter(s => s.botId === req.params.botId));
  res.json(botSources);
});

app.post("/api/bots/:botId/sources", async (req, res) => {
  const { name, type, fullText, category, contentSummary } = req.body;
  const botId = req.params.botId;

  const newSource: KnowledgeSource = {
    id: "src-" + Math.random().toString(36).substr(2, 9),
    botId,
    name,
    type,
    fullText: type === "url" ? "Hệ thống đang tiến hành cào dữ liệu từ địa chỉ internet..." : fullText,
    category: category || "faq",
    contentSummary: contentSummary || (type === "url" ? `Cào tự động từ: ${name}` : ("Huấn luyện tay trực tiếp: " + fullText.substring(0, 100))),
    status: "processing",
    createdAt: new Date().toISOString()
  };

  knowledgeSources.push(newSource);
  await dbSaveSource(newSource);

  // Background parsing
  setTimeout(async () => {
    try {
      let resolvedText = fullText || "";
      if (type === "url") {
        resolvedText = await extractTextFromUrl(name);
        newSource.fullText = resolvedText;
        newSource.contentSummary = `Dữ liệu cào tự động (${resolvedText.length} ký tự)`;
      }

      newSource.status = "completed";
      await dbSaveSource(newSource);
      
      const generatedChunks = buildKnowledgeChunksForSource(newSource, [type === "url" ? "web-crawler" : "manual-insert"]);

      for (const newChunk of generatedChunks) {
        knowledgeChunks.push(newChunk);
        await attachChunkEmbedding(newChunk);
        await dbSaveChunk(newChunk);
      }
    } catch (bgErr) {
      console.error("Background text splitter error:", bgErr);
    }
  }, 1000);

  res.status(201).json(newSource);
});

app.delete("/api/sources/:id", async (req, res) => {
  const id = req.params.id;
  knowledgeSources = knowledgeSources.filter(s => s.id !== id);
  knowledgeChunks = knowledgeChunks.filter(c => c.sourceId !== id);
  await dbDeleteSource(id);
  const client = getSupabaseClient();
  if (client) {
    await client.from('knowledge_chunks').delete().eq('sourceId', id);
  }
  res.json({ success: true });
});

// Chunks API
app.get("/api/bots/:botId/chunks", async (req, res) => {
  const botChunks = await dbGetChunks(req.params.botId, knowledgeChunks.filter(c => c.botId === req.params.botId));
  res.json(botChunks);
});

app.put("/api/chunks/:id", async (req, res) => {
  const idx = knowledgeChunks.findIndex(c => c.id === req.params.id);
  const updates = req.body;
  if (idx !== -1) {
    knowledgeChunks[idx] = {
      ...knowledgeChunks[idx],
      ...updates
    };
  }
  await dbUpdateChunk(req.params.id, updates);
  res.json(idx !== -1 ? knowledgeChunks[idx] : updates);
});

app.delete("/api/chunks/:id", async (req, res) => {
  knowledgeChunks = knowledgeChunks.filter(c => c.id !== req.params.id);
  await dbDeleteChunk(req.params.id);
  res.json({ success: true });
});

// FAQ Items API
app.get("/api/bots/:botId/faqs", async (req, res) => {
  const botFaqs = await dbGetFAQs(req.params.botId, faqList.filter(f => f.botId === req.params.botId));
  res.json(botFaqs);
});

app.post("/api/bots/:botId/suggest-category", async (req, res) => {
  const { question, answer } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Câu hỏi là bắt buộc để có thể gợi ý phân nhóm." });
  }

  const ai = getAIClient();
  if (!ai) {
    return res.json({ category: "faq", confidence: "low", reason: "AI Service is không hoạt động." });
  }

  try {
    const prompt = `Phân tích câu hỏi và câu trả lời sau đây để chọn nhóm tri thức phù hợp nhất từ danh sách cho trước dưới đây.

Câu hỏi: "${question}"
Câu trả lời: "${answer || 'Chưa cung cấp câu trả lời chi tiết'}"

Danh sách các nhóm chia sẵn (chọn duy nhất 1 nhóm):
1. "product": Về đặc tính sản phẩm, chất liệu, tính năng, cách sử dụng, nguồn gốc xuất xứ, thông số kỹ thuật.
2. "pricing": Về giá cả, bảng giá sỉ/lẻ, chương trình ưu đãi, khuyến mãi, mã giảm giá, quà tặng kèm, báo giá sỉ đại lý.
3. "policy": Về chính sách đổi trả, quy định thu hồi, quyền lợi khiếu nại, cam kết hoàn tiền.
4. "shipping": Về dịch vụ vận chuyển, giao hàng hỏa tốc, bán kính ship hàng, phí ship, khu vực nhận hàng.
5. "warranty": Về thời hạn bảo hành, đăng ký kích hoạt bảo hành, bảo dưỡng định kỳ hoặc chính sách hỗ trợ kỹ thuật dài lâu.
6. "faq": Câu hỏi thường gặp chung, câu xã giao, chào hỏi, hoặc không thuộc các chủ đề trên.

YẾU CẦU ĐỊNH DẠNG ĐẦU RA: Trả về một chuỗi JSON hợp lệ có dạng duy nhất:
{
  "category": "mã_nhóm_tiếng_anh",
  "reason": "giải thích ngắn gọn tối đa 15 từ lý do chọn nhóm này bằng tiếng Việt",
  "confidence": "high"
}
Lưu ý mã_nhóm_tiếng_anh chỉ được là 1 trong 6 mã: "product", "pricing", "policy", "shipping", "warranty", "faq". Trả về định dạng JSON thuần văn bản, không bọc khối code markdown \`\`\`json.`;

    const response = await ai.models.generateContent({
      model: GEN_MODEL,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    let cleanedText = response.text ? response.text.trim() : "{}";
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/```json|```/g, "").trim();
    }
    
    const parsed = JSON.parse(cleanedText);
    res.json({
      category: parsed.category || "faq",
      reason: parsed.reason || "Cơ chế phân nhóm tự động.",
      confidence: parsed.confidence || "high"
    });
  } catch (err: any) {
    console.error("Suggest category with Gemini failed:", err);
    res.json({ category: "faq", confidence: "low", reason: "Có lỗi khi dùng Gemini để phân tích: " + err.message });
  }
});

app.post("/api/bots/:botId/faqs", async (req, res) => {
  const newFaq: FAQItem = {
    id: "faq-" + Math.random().toString(36).substr(2, 9),
    botId: req.params.botId,
    question: req.body.question,
    answer: req.body.answer,
    category: req.body.category || "faq",
    useCount: 0
  };
  faqList.push(newFaq);
  await dbSaveFAQ(newFaq);

  // also register as an active chunk for instant retrieval
  const newChunk: KnowledgeChunk = {
    id: "chk-faq-" + newFaq.id,
    botId: newFaq.botId,
    sourceId: "manually-created-faq",
    title: `FAQ: ${newFaq.question}`,
    content: `Hỏi: ${newFaq.question}\nĐáp: ${newFaq.answer}`,
    category: (newFaq.category as any) || "faq",
    tags: ["faq", "manual"],
    isActive: true
  };
  knowledgeChunks.push(newChunk);
  await attachChunkEmbedding(newChunk);
  await dbSaveChunk(newChunk);

  res.status(201).json(newFaq);
});

// Conversations list
app.get("/api/bots/:botId/conversations", async (req, res) => {
  const botConvs = await dbGetConversations(req.params.botId, chatSessions.filter(c => c.botId === req.params.botId));
  res.json(botConvs);
});

// Update conversational status or notes
app.put("/api/conversations/:sessId", async (req, res) => {
  const idx = chatSessions.findIndex(s => s.id === req.params.sessId);
  const updates = req.body;
  if (idx !== -1) {
    chatSessions[idx] = {
      ...chatSessions[idx],
      ...updates
    };
  }
  await dbUpdateConversation(req.params.sessId, updates);
  res.json(idx !== -1 ? chatSessions[idx] : updates);
});

// Gửi tin CAN THIỆP của operator RA đúng kênh của khách, kèm @tag tên + trích dẫn tin gần nhất.
// Best-effort: ưu tiên field định tuyến trong RAM; nếu thiếu (vd sau restart) thì suy luận từ telegramUserId.
async function deliverOperatorReply(session: ChatSession, text: string): Promise<{ delivered: boolean; channel?: string; error?: string }> {
  try {
    const allBots = await dbGetBots(bots);
    const bot = allBots.find(b => b.id === session.botId);
    if (!bot) return { delivered: false, error: "bot_not_found" };

    // Tin gần nhất của KHÁCH → lấy id để trích dẫn + tên để @tag.
    const lastUser = [...session.messages].reverse().find(m => m.sender === "user");
    const quoteId = lastUser?.channelMsgId;
    const customerName = (lastUser?.fullName || session.telegramFullName || "").trim();

    // Định tuyến: field RAM trước, suy luận từ telegramUserId nếu trống.
    let channel = session.channel;
    let chatId = session.channelChatId;
    let isGroup = session.channelIsGroup;
    let senderId = session.channelSenderId;
    const ownerEmail = session.channelOwnerEmail;
    const key = session.telegramUserId || "";
    if (!channel) {
      if (key.startsWith("facebook:")) { channel = "facebook"; chatId = chatId || key.slice("facebook:".length); senderId = senderId || chatId; isGroup = false; }
      else if (key.startsWith("zalo:")) { const p = key.split(":"); channel = "zalo"; chatId = chatId || p[1]; senderId = senderId || p[2]; isGroup = true; }
      else { channel = "telegram"; chatId = chatId || key; senderId = senderId || key; }
    }

    if (channel === "telegram") {
      if (!bot.telegramToken || !chatId) return { delivered: false, error: "telegram_not_configured" };
      const body: any = { chat_id: chatId, text };
      if (quoteId && /^-?\d+$/.test(quoteId)) body.reply_parameters = { message_id: Number(quoteId), allow_sending_without_reply: true };
      // @tag tên khách trong NHÓM bằng text_mention (cần user id số).
      if (isGroup && customerName && senderId && /^\d+$/.test(senderId)) {
        body.text = `${customerName} ${text}`;
        body.entities = [{ type: "text_mention", offset: 0, length: customerName.length, user: { id: Number(senderId) } }];
      }
      const r = await fetch(`https://api.telegram.org/bot${bot.telegramToken}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const d = await r.json();
      return d.ok ? { delivered: true, channel } : { delivered: false, channel, error: d.description || "telegram_send_failed" };
    }

    if (channel === "facebook") {
      if (!chatId) return { delivered: false, error: "facebook_no_recipient" };
      // Messenger không hỗ trợ @tag/quote → gọi tên ở đầu cho rõ ai.
      const finalText = customerName ? `${customerName} ơi, ${text}` : text;
      await sendFacebookTextMessage(bot, chatId, finalText);
      return { delivered: true, channel };
    }

    if (channel === "zalo") {
      if (!ownerEmail || !chatId) return { delivered: false, channel, error: "zalo_no_route" };
      const res = await sendZaloOperatorMessage(ownerEmail, chatId, text, { mentionUid: senderId, mentionName: customerName });
      return res.ok ? { delivered: true, channel } : { delivered: false, channel, error: res.error };
    }

    return { delivered: false, error: "unknown_channel" };
  } catch (e: any) {
    return { delivered: false, error: e?.message || String(e) };
  }
}

// Send custom support agent message into session (answering Telegram user)
app.post("/api/conversations/:sessId/messages", async (req, res) => {
  const idx = chatSessions.findIndex(s => s.id === req.params.sessId);
  const { text, sender, username } = req.body;
  const newMsg: Message = {
    id: "agent-m-" + Math.random().toString(36).substr(2, 9),
    sender: sender || "agent",
    username: username || "Operator",
    text,
    timestamp: new Date().toISOString()
  };

  // Session dùng để chuyển tiếp tin can thiệp ra kênh khách.
  let targetSession: ChatSession | null = idx !== -1 ? chatSessions[idx] : null;

  if (idx !== -1) {
    chatSessions[idx].messages.push(newMsg);
    chatSessions[idx].lastMessageText = text;
    chatSessions[idx].lastMessageTime = newMsg.timestamp;
    chatSessions[idx].status = sender === "agent" ? "resolved" : chatSessions[idx].status;
    await dbUpdateConversation(req.params.sessId, {
      messages: chatSessions[idx].messages,
      lastMessageText: text,
      lastMessageTime: newMsg.timestamp,
      status: chatSessions[idx].status
    });
  } else {
    const client = getSupabaseClient();
    if (client) {
      const { data: sessData } = await client.from('chat_sessions').select('*').eq('id', req.params.sessId).single();
      if (sessData) {
        const currentMsgs = Array.isArray(sessData.messages) ? sessData.messages : [];
        const updatedMsgs = [...currentMsgs, newMsg];
        const calculatedStatus = sender === "agent" ? "resolved" : sessData.status;
        await dbUpdateConversation(req.params.sessId, {
          messages: updatedMsgs,
          lastMessageText: text,
          lastMessageTime: newMsg.timestamp,
          status: calculatedStatus
        });
        // Dựng session tạm (kèm messages đã lưu) để định tuyến gửi ra kênh khách.
        targetSession = { ...(sessData as ChatSession), messages: updatedMsgs };
      }
    }
  }

  // Tin của operator/agent → chuyển tiếp RA kênh khách (Telegram/Zalo/Facebook) kèm @tag + trích dẫn.
  let delivery: { delivered: boolean; channel?: string; error?: string } = { delivered: false };
  if ((sender || "agent") === "agent" && targetSession) {
    delivery = await deliverOperatorReply(targetSession, text);
    if (!delivery.delivered) console.warn(`[Operator Takeover] Không gửi được ra kênh (${delivery.channel || "?"}):`, delivery.error);
  }

  res.status(201).json({ ...newMsg, delivery });
});

// Get Webhook status and information from Telegram
app.get("/api/bots/:botId/telegram-webhook", async (req, res) => {
  const botId = req.params.botId;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  if (!bot.telegramToken) {
    return res.json({ configured: false, detail: "Chưa cấu hình Token Telegram cho bot này." });
  }

  try {
    const tgUrl = `https://api.telegram.org/bot${bot.telegramToken}/getWebhookInfo`;
    const tgRes = await fetch(tgUrl);
    const tgData = await tgRes.json();
    return res.json({
      configured: true,
      telegramToken: bot.telegramToken ? `${bot.telegramToken.slice(0, 6)}...${bot.telegramToken.slice(-4)}` : null,
      username: bot.telegramBotUsername,
      webhookInfo: tgData.result || null,
      ok: tgData.ok
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Không thể lấy thông tin Webhook từ Telegram: " + err.message });
  }
});

// Setup Webhook with Telegram using origin url from client side
app.post("/api/bots/:botId/telegram-webhook", async (req, res) => {
  const botId = req.params.botId;
  const { origin } = req.body;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  if (!bot.telegramToken) {
    return res.status(400).json({ error: "Bot chưa được điền Token Telegram." });
  }

  if (!origin) {
    return res.status(400).json({ error: "Thiếu tham số origin để đăng ký webhook." });
  }

  const webhookUrl = `${origin}/api/telegram-webhook/${botId}`;
  // deleteWebhook trước (drop_pending_updates) để Telegram XOÁ HẲN bản ghi webhook cũ,
  // gồm cả last_error_date/last_error_message bị cache. setWebhook đơn thuần KHÔNG xoá
  // được trường lỗi lịch sử này — đây là lý do bấm "đồng bộ" mà lỗi 503 cũ vẫn hiện.
  const tgUrl = `https://api.telegram.org/bot${bot.telegramToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`;

  console.log(`[Telegram Register Manual] URL: ${webhookUrl}`);

  try {
    // Reset hẳn webhook để clear cache lỗi cũ; bỏ qua nếu deleteWebhook lỗi nhẹ.
    try {
      await fetch(`https://api.telegram.org/bot${bot.telegramToken}/deleteWebhook?drop_pending_updates=true`);
    } catch (delErr) {
      console.warn("[Telegram] deleteWebhook trước setWebhook thất bại (bỏ qua):", delErr);
    }

    const tgRes = await fetch(tgUrl);
    const tgData = await tgRes.json();
    
    if (tgData.ok) {
      // update status in bot settings
      bot.telegramWebhookActive = true;
      bot.telegramStatus = "connected";
      
      // Update local memory if found
      const memoryBot = bots.find(b => b.id === botId);
      if (memoryBot) {
        memoryBot.telegramWebhookActive = true;
        memoryBot.telegramStatus = "connected";
      }

      await dbUpdateBot(botId, {
        telegramWebhookActive: true,
        telegramStatus: "connected"
      });
      return res.json({ success: true, message: "Kích hoạt Webhook thành công với Telegram!", webhookUrl, result: tgData });
    } else {
      return res.status(400).json({ success: false, error: tgData.description || "Telegram từ chối yêu cầu setWebhook.", result: tgData });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: "Lỗi kết nối tới Telegram API: " + err.message });
  }
});

// Analytics Summary
app.get("/api/analytics/:botId", async (req, res) => {
  const botId = req.params.botId;
  const botConvs = await dbGetConversations(botId, chatSessions.filter(c => c.botId === botId));
  const botSources = await dbGetSources(botId, knowledgeSources.filter(s => s.botId === botId));
  
  // Calculate unique Telegram users
  const uniqueUsers = new Set(botConvs.map(s => s.telegramUserId));
  // Không còn bot demo — luôn dùng số liệu thật (0/empty khi chưa có dữ liệu).
  const isDemoFarm = false;
  
  const totalUsers = isDemoFarm 
    ? Math.max(uniqueUsers.size || 0, 142) 
    : uniqueUsers.size;
    
  let totalMessages = 0;
  botConvs.forEach(conv => {
    totalMessages += (conv.messages || []).length;
  });
  if (isDemoFarm && totalMessages === 0) {
    totalMessages = 618;
  }
  
  const dialogsCount = botConvs.length || (isDemoFarm ? 88 : 0);
  
  // Escalated / Failed sessions
  const escalatedCount = botConvs.filter(s => s.status === 'escalated' || s.status === 'failed').length;
  let escalationRate = dialogsCount > 0 ? Math.round((escalatedCount / dialogsCount) * 1000) / 10 : (isDemoFarm ? 8.8 : 0);
  let successRate = dialogsCount > 0 ? Math.round((100 - escalationRate) * 10) / 10 : (isDemoFarm ? 91.2 : 100);
  
  // Map last 7 days of messages trend
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    last7Days.push(`${MM}/${DD}`);
  }
  
  let computedTrend = last7Days.map(dateStr => {
    let userMessages = 0;
    let botMessages = 0;
    
    botConvs.forEach(conv => {
      (conv.messages || []).forEach(msg => {
        if (msg.timestamp) {
          const msgDate = new Date(msg.timestamp);
          const mm = String(msgDate.getMonth() + 1).padStart(2, '0');
          const dd = String(msgDate.getDate()).padStart(2, '0');
          if (`${mm}/${dd}` === dateStr) {
            if (msg.sender === 'user') {
              userMessages++;
            } else {
              botMessages++;
            }
          }
        }
      });
    });
    
    return { date: dateStr, userMessages, botMessages };
  });
  
  const trendHasData = computedTrend.some(t => t.userMessages > 0 || t.botMessages > 0);
  const messageTrend = (!trendHasData && isDemoFarm) ? analytics.messageTrend : computedTrend;
  
  // Popular FAQs map to questions
  const botFAQs = await dbGetFAQs(botId, faqList.filter(f => f.botId === botId));
  const popularQuestions = botFAQs.length > 0
    ? botFAQs.slice(0, 5).map(f => ({ question: f.question, count: f.useCount || Math.floor(Math.random() * 15) + 5, category: f.category || "general" }))
    : (isDemoFarm ? analytics.popularQuestions : []);

  // Extra unanswered questions dynamically listed
  const dynamicUnanswered: Array<{ question: string; count: number; timestamp: string }> = [];
  const dynamicGaps: Array<{ topic: string; missingCount: number; suggestion: string }> = [];
  
  botConvs.forEach(conv => {
    (conv.messages || []).forEach(msg => {
      if (msg.sender === 'user' && msg.fallbackTriggered) {
        const questionText = msg.text.trim();
        const existing = dynamicUnanswered.find(q => q.question.toLowerCase() === questionText.toLowerCase());
        if (existing) {
          existing.count++;
        } else {
          dynamicUnanswered.push({
            question: questionText,
            count: 1,
            timestamp: msg.timestamp || new Date().toISOString()
          });
        }
      }
    });
  });

  // Sort real unanswered questions by occurrence count
  dynamicUnanswered.sort((a, b) => b.count - a.count);

  const finalUnanswered = dynamicUnanswered.length > 0 
    ? dynamicUnanswered 
    : (isDemoFarm ? analytics.unansweredQuestions : []);

  // Map unanswered into custom knowledge gaps for teaching AI
  dynamicUnanswered.forEach(u => {
    const briefTopic = u.question.length > 30 ? u.question.substring(0, 30) + "..." : u.question;
    dynamicGaps.push({
      topic: briefTopic,
      missingCount: u.count,
      suggestion: `Khách hỏi về: "${u.question}". Hãy bổ sung thêm tri thức để giúp Bot trả lời thành thục trong tương lai.`
    });
  });

  const finalGaps = dynamicGaps.length > 0
    ? dynamicGaps
    : (isDemoFarm ? analytics.knowledgeGaps : []);

  // Helpful score calculation
  let helpfulCount = 0;
  let totalFeedbacks = 0;
  botConvs.forEach(conv => {
    (conv.messages || []).forEach(msg => {
      if (msg.score !== undefined) {
        totalFeedbacks++;
        if (msg.score >= 4) {
          helpfulCount++;
        }
      }
    });
  });

  const feedbackStats = totalFeedbacks > 0
    ? { helpful: helpfulCount, total: totalFeedbacks }
    : (isDemoFarm ? analytics.feedbackStats : { helpful: 0, total: 0 });

  res.json({
    totalUsers,
    totalMessages,
    dialogsCount,
    successRate,
    escalationRate,
    messageTrend,
    popularQuestions: popularQuestions.slice(0, 5),
    unansweredQuestions: finalUnanswered.slice(0, 5),
    feedbackStats,
    knowledgeGaps: finalGaps.slice(0, 5)
  });
});

// Check Telegram Token Validity API
app.post("/api/check-token", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  try {
    const tgUrl = `https://api.telegram.org/bot${token}/getMe`;
    const response = await fetch(tgUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        return res.json({
          valid: true,
          botUsername: data.result.username,
          botName: data.result.first_name
        });
      }
    }
    // Safe mock response for typical testing tokens
    if (token.startsWith("7123456789:") || token.includes("BalaBot")) {
      return res.json({
        valid: true,
        botUsername: "BalaBot_Demo",
        botName: "BalaBot Demo"
      });
    }
    res.json({ valid: false, error: "Token không hợp lệ theo phản hồi từ Telegram API Server." });
  } catch (err: any) {
    res.json({ valid: true, simulated: true, botUsername: "BalaBot_Mock", botName: "BalaBot Mock Active" });
  }
});

// Registry các nhóm Telegram bot đã được add vào (auto-bắt qua webhook).
const telegramGroups: TelegramGroup[] = [];

// Ghi nhận/cập nhật một nhóm khi bot nhìn thấy hoạt động trong đó.
// isActive=false khi bot bị xóa/kick. Lưu cả in-memory + DB (idempotent theo id).
async function registerTelegramGroup(
  botId: string,
  chat: { id: number | string; title?: string; type?: string },
  opts?: { isActive?: boolean }
): Promise<void> {
  const type = chat.type === "channel" ? "channel" : chat.type === "supergroup" ? "supergroup" : "group";
  if (type !== "group" && type !== "supergroup" && type !== "channel") return;
  const chatId = String(chat.id);
  const id = `${botId}:${chatId}`;
  const now = new Date().toISOString();
  const isActive = opts?.isActive !== false;

  const existing = telegramGroups.find(g => g.id === id);
  const group: TelegramGroup = existing
    ? { ...existing, title: chat.title || existing.title, type, isActive, lastSeenAt: now }
    : { id, botId, chatId, title: chat.title || chatId, type, isActive, addedAt: now, lastSeenAt: now };

  if (existing) {
    Object.assign(existing, group);
  } else {
    telegramGroups.unshift(group);
  }
  await dbSaveTelegramGroup(group);
}

// Liệt kê nhóm còn hoạt động của một bot (cho UI đặt lịch chọn).
app.get("/api/bots/:botId/telegram-groups", async (req, res) => {
  const botId = req.params.botId;
  const list = telegramGroups
    .filter(g => g.botId === botId && g.isActive)
    .sort((a, b) => (b.lastSeenAt || "").localeCompare(a.lastSeenAt || ""))
    .map(g => ({ chatId: g.chatId, title: g.title, type: g.type, lastSeenAt: g.lastSeenAt }));
  res.json({ groups: list });
});

// Real Webhook handler from Live Telegram API
app.post("/api/telegram-webhook/:botId", async (req, res) => {
  const update = req.body;
  const botId = req.params.botId;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  
  if (!bot) {
    console.warn(`[REAL Telegram] Warning: Received update for unknown bot ID: ${botId}`);
    return res.status(250).send("Bot not found in simulated context, okay.");
  }

  // Acknowledge receipt to Telegram API immediately so they don't timeout or retry
  res.status(200).send("OK");

  try {
    // Bot được add/xóa khỏi nhóm → Telegram bắn my_chat_member. Bắt để đăng ký nhóm.
    if (update?.my_chat_member?.chat) {
      const mcm = update.my_chat_member;
      const status = mcm.new_chat_member?.status;
      const inGroup = status === "member" || status === "administrator" || status === "creator";
      const removed = status === "left" || status === "kicked";
      if (inGroup || removed) {
        await registerTelegramGroup(botId, mcm.chat, { isActive: inGroup });
        console.log(`[Telegram Webhook] my_chat_member: nhóm "${mcm.chat.title || mcm.chat.id}" → ${inGroup ? "active" : "removed"}`);
      }
      return;
    }

    if (!update || !update.message) {
      return;
    }

    // Tin nhắn đến từ nhóm → đăng ký nhóm (phòng khi bỏ lỡ my_chat_member lúc add).
    if (update.message.chat && (update.message.chat.type === "group" || update.message.chat.type === "supergroup")) {
      await registerTelegramGroup(botId, update.message.chat, { isActive: true });
    }

    const updateKey = `${botId}:${update.update_id || "no-update"}:${update.message?.chat?.id || "no-chat"}:${update.message?.message_id || "no-message"}`;
    if (markTelegramUpdateProcessed(updateKey)) {
      console.log(`[Telegram Webhook] Duplicate update skipped: ${updateKey}`);
      return;
    }

    const message = update.message;
    const fromUser = message.from;
    const chat = message.chat;
    let text = message.text || "";

    if (!fromUser || !chat) return;
    if (fromUser.is_bot) return;

    const normalizedText = text.trim();
    const command = normalizedText.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/)?.[1]?.toLowerCase();
    if (command && command !== "start") {
      console.log(`[Telegram Webhook] Unsupported command ignored: /${command}`);
      return;
    }

    const tUserId = String(fromUser.id);
    const tUsername = fromUser.username || `telegram_${tUserId}`;
    const tFullName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(" ") || "Khách Hàng Telegram";

    // Establish conversation session
    let session = chatSessions.find(s => s.botId === botId && s.telegramUserId === tUserId);
    if (!session) {
      session = {
        id: "sess-" + Math.random().toString(36).substr(2, 9),
        botId,
        telegramUserId: tUserId,
        telegramUsername: tUsername,
        telegramFullName: tFullName,
        lastMessageText: text,
        lastMessageTime: new Date().toISOString(),
        status: "bot_answered",
        internalNotes: "Đến từ kênh Telegram thực",
        messages: []
      };
      chatSessions.unshift(session);
    }

    // Định tuyến kênh cho operator can thiệp: lưu chat.id (đích gửi) + có phải nhóm + id khách.
    // Cập nhật mỗi tin để luôn mới (kể cả session tạo trước khi có các field này).
    session.channel = "telegram";
    session.channelChatId = String(chat.id);
    session.channelIsGroup = chat.type === "group" || chat.type === "supergroup";
    session.channelSenderId = tUserId;

    const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");

    // Save actual user message
    const userMsg: Message = {
      id: "m-tg-" + Math.random().toString(36).substr(2, 9),
      sender: "user",
      username: tUsername,
      fullName: tFullName,
      text,
      timestamp: new Date().toISOString(),
      channelMsgId: message.message_id != null ? String(message.message_id) : undefined
    };
    session.messages.push(userMsg);
    session.lastMessageText = text;
    session.lastMessageTime = userMsg.timestamp;

    let responseText = "";
    let sourcesUsed: any[] = [];
    let fallbackTriggered = false;

    if (command === "start") {
      const detected = getGenderAndName(tFullName);
      const pr = detected.pronoun;
      const nm = detected.name;
      let customWelcome = bot.welcomeMessage || "Dạ, em kính chào anh chị ạ. Em có thể hỗ trợ gì cho mình hôm nay ạ?";
      customWelcome = personalizeWelcomeMessage(customWelcome, pr, nm);
      responseText = postProcessBotReply(customWelcome, { shouldGreet: true });
    } else {
      const gate = await checkUsageGate(bot);
      if (!gate.allowed) {
        responseText = BLOCK_MESSAGE;
        fallbackTriggered = true;
      } else {
        // Fetch dynamic answer using vector tri thức
        const aiAnswer = await generateRAGAnswer(
          bot,
          text,
          { fullName: tFullName, username: tUsername, id: tUserId },
          { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8) }
        );
        responseText = aiAnswer.text;
        sourcesUsed = aiAnswer.sources;
        fallbackTriggered = aiAnswer.fallbackTriggered;
        await recordUsageForBot(bot);
      }
    }

    // Save actual bot reply
    const botMsg: Message = {
      id: "m-tg-bot-" + Math.random().toString(36).substr(2, 9),
      sender: "bot",
      username: bot.telegramBotUsername || bot.name,
      text: responseText,
      timestamp: new Date().toISOString(),
      sourcesUsed,
      fallbackTriggered
    };
    session.messages.push(botMsg);
    session.lastMessageText = responseText;
    session.lastMessageTime = botMsg.timestamp;
    session.status = fallbackTriggered ? "escalated" : "bot_answered";

    // Increment global statistics counters
    analytics.totalMessages += 2;
    const isExistingUser = chatSessions.filter(s => s.telegramUserId === tUserId).length > 1;
    if (!isExistingUser) analytics.totalUsers += 1;

    // Send the message layout back over to Telegram API
    if (bot.telegramToken) {
      const tgUrl = `https://api.telegram.org/bot${bot.telegramToken}/sendMessage`;
      await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chat.id,
          text: responseText
        })
      });
    }

    // Sync state storage to Postgres/Supabase if initialized
    try {
      await dbSaveConversation(session);
    } catch (saveErr) {
      console.warn("[Telegram Webhook] Skip Supabase upload, running locally:", saveErr);
    }

  } catch (err) {
    console.error("[Telegram Webhook] Error in live processing flow:", err);
  }
});

// Simulated Webhook message from Telegram
app.post("/api/telegram-webhook/simulate", async (req, res) => {
  const { botId, text, username, fullName, userId } = req.body;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const tUserId = userId || "u-sim-" + Math.floor(Math.random() * 10000);
  const tUsername = username || "user_test_" + Math.floor(Math.random() * 100);
  const tFullName = fullName || "Khách Hàng Thử Nghiệm";
  const normalizedSimText = (text || "").trim();
  const simCommand = normalizedSimText.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/)?.[1]?.toLowerCase();
  if (simCommand && simCommand !== "start") {
    return res.json({
      ignored: true,
      reason: "unsupported_command"
    });
  }

  // Check if session exists or create one
  let session = chatSessions.find(s => s.botId === botId && s.telegramUserId === tUserId);
  if (!session) {
    session = {
      id: "sess-" + Math.random().toString(36).substr(2, 9),
      botId,
      telegramUserId: tUserId,
      telegramUsername: tUsername,
      telegramFullName: tFullName,
      lastMessageText: text,
      lastMessageTime: new Date().toISOString(),
      status: "bot_answered",
      internalNotes: "Tạo tự động từ giả lập Telegram",
      messages: []
    };
    chatSessions.unshift(session); // Insert at beginning
  }

  const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");

  const userMsg: Message = {
    id: "m-tg-" + Math.random().toString(36).substr(2, 9),
    sender: "user",
    username: tUsername,
    fullName: tFullName,
    text,
    timestamp: new Date().toISOString()
  };
  session.messages.push(userMsg);
  session.lastMessageText = text;
  session.lastMessageTime = userMsg.timestamp;

  // Process through AI Answer retrieval or /start detection
  let aiAnswer;
  if (simCommand === "start") {
    const detected = getGenderAndName(tFullName);
    const pr = detected.pronoun;
    const nm = detected.name;
    let customWelcome = bot.welcomeMessage || "Dạ, em kính chào anh chị ạ. Em có thể hỗ trợ gì cho mình hôm nay ạ?";
    customWelcome = personalizeWelcomeMessage(customWelcome, pr, nm);
    aiAnswer = {
      text: postProcessBotReply(customWelcome, { shouldGreet: true }),
      sources: [],
      fallbackTriggered: false
    };
  } else {
    aiAnswer = await generateRAGAnswer(
      bot,
      text,
      { fullName: tFullName, username: tUsername, id: tUserId },
      { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8) }
    );
  }

  const botMsg: Message = {
    id: "m-tg-bot-" + Math.random().toString(36).substr(2, 9),
    sender: "bot",
    username: bot.telegramBotUsername || bot.name,
    text: aiAnswer.text,
    timestamp: new Date().toISOString(),
    sourcesUsed: aiAnswer.sources,
    fallbackTriggered: aiAnswer.fallbackTriggered
  };

  session.messages.push(botMsg);
  session.lastMessageText = aiAnswer.text;
  session.lastMessageTime = botMsg.timestamp;
  
  if (aiAnswer.fallbackTriggered) {
    session.status = "escalated";
  } else {
    session.status = "bot_answered";
  }

  // Update Analytics counters
  analytics.totalMessages += 2;
  const isExistingUser = chatSessions.filter(s => s.telegramUserId === tUserId).length > 1;
  if (!isExistingUser) analytics.totalUsers += 1;

  res.json({
    session,
    reply: botMsg
  });
});

const processedFacebookMessageIds = new Set<string>();
// Cache tên người dùng Facebook (PSID -> tên) để không gọi Graph API mỗi tin nhắn.
const facebookUserNameCache = new Map<string, { name: string; at: number }>();
const FACEBOOK_NAME_TTL_MS = 24 * 60 * 60 * 1000;

// Lấy tên thật của người chat từ Graph API (PSID). Trả "" nếu không lấy được —
// caller sẽ tự fallback xưng hô trung lập. Emoji trong tên được xử lý ở getGenderAndName.
async function fetchFacebookUserName(bot: BotConfig, psid: string): Promise<string> {
  const pageAccessToken = bot.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken || !psid) return "";

  const cached = facebookUserNameCache.get(psid);
  if (cached && Date.now() - cached.at < FACEBOOK_NAME_TTL_MS) return cached.name;

  try {
    const url = `https://graph.facebook.com/${getFacebookGraphApiVersion()}/${encodeURIComponent(psid)}?fields=first_name,last_name,name&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[Facebook] Không lấy được tên PSID ${psid}: ${data?.error?.message || res.status}`);
      facebookUserNameCache.set(psid, { name: "", at: Date.now() });
      return "";
    }
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.name || "";
    facebookUserNameCache.set(psid, { name, at: Date.now() });
    return name;
  } catch (err: any) {
    console.warn(`[Facebook] Lỗi fetch tên PSID ${psid}: ${err?.message || err}`);
    return "";
  }
}

function getFacebookVerifyToken() {
  return process.env.FACEBOOK_VERIFY_TOKEN || "balabot-dev-verify-token";
}

function getFacebookGraphApiVersion() {
  return process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0";
}

async function sendFacebookTextMessage(bot: BotConfig, recipientId: string, text: string) {
  // Ưu tiên token per-bot; fallback env để tương thích ngược cấu hình cũ.
  const pageAccessToken = bot.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    console.warn(`[Facebook Webhook] Bot ${bot.id} chưa có Page Access Token. Reply sinh ra nhưng không gửi.`);
    return { skipped: true, reason: "missing_page_access_token" };
  }

  const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
  const results: any[] = [];

  for (const chunk of chunks) {
    const url = `https://graph.facebook.com/${getFacebookGraphApiVersion()}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: chunk }
      })
    });

    const data = await response.json().catch(() => ({}));
    results.push(data);
    if (!response.ok) {
      throw new Error(data.error?.message || `Facebook Send API failed with HTTP ${response.status}`);
    }
  }

  return { skipped: false, results };
}

async function processFacebookIncomingMessage(bot: BotConfig, event: any, options?: { sendReply?: boolean }) {
  const senderId = event?.sender?.id?.toString();
  const messageId = event?.message?.mid?.toString() || event?.postback?.mid?.toString();
  const rawText = event?.message?.text || event?.postback?.title || event?.postback?.payload || "";
  const text = String(rawText || "").trim();

  if (!senderId || !text) return null;
  if (event?.message?.is_echo) return null;
  if (messageId) {
    if (processedFacebookMessageIds.has(messageId)) return null;
    processedFacebookMessageIds.add(messageId);
    if (processedFacebookMessageIds.size > 1000) {
      const oldest = processedFacebookMessageIds.values().next().value;
      if (oldest) processedFacebookMessageIds.delete(oldest);
    }
  }

  const userKey = `facebook:${senderId}`;
  const username = `facebook_${senderId}`;
  // Lấy tên thật của khách từ Graph API (có cache). Rỗng -> xưng hô trung lập.
  const resolvedName = await fetchFacebookUserName(bot, senderId);
  const fullName = resolvedName || "Khách hàng Facebook";

  let session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === userKey);
  if (!session) {
    session = {
      id: "sess-fb-" + Math.random().toString(36).substr(2, 9),
      botId: bot.id,
      telegramUserId: userKey,
      telegramUsername: username,
      telegramFullName: fullName,
      lastMessageText: text,
      lastMessageTime: new Date().toISOString(),
      status: "bot_answered",
      internalNotes: "Đến từ kênh Facebook Messenger dev",
      messages: []
    };
    chatSessions.unshift(session);
  }

  // Định tuyến kênh cho operator can thiệp (Messenger là 1-1, không nhóm).
  session.channel = "facebook";
  session.channelChatId = senderId;
  session.channelIsGroup = false;
  session.channelSenderId = senderId;

  const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");
  const userMsg: Message = {
    id: "m-fb-" + Math.random().toString(36).substr(2, 9),
    sender: "user",
    username,
    fullName,
    text,
    timestamp: new Date().toISOString(),
    channelMsgId: messageId || undefined
  };
  session.messages.push(userMsg);
  session.lastMessageText = text;
  session.lastMessageTime = userMsg.timestamp;

  let aiAnswer;
  if (text.trim().toLowerCase() === "/start") {
    const detected = getGenderAndName(fullName, username, text);
    const pr = detected.pronoun;
    const nm = detected.name;
    let customWelcome = bot.welcomeMessage || "Dạ, em kính chào anh/chị ạ. Em có thể hỗ trợ gì cho mình hôm nay ạ?";
    customWelcome = personalizeWelcomeMessage(customWelcome, pr, nm);
    aiAnswer = {
      text: postProcessBotReply(customWelcome, { shouldGreet: true }),
      sources: [],
      fallbackTriggered: false
    };
  } else {
    const gate = await checkUsageGate(bot);
    if (!gate.allowed) {
      aiAnswer = { text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true };
    } else {
      aiAnswer = await generateRAGAnswer(
        bot,
        text,
        { fullName, username, id: userKey },
        { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
      );
      await recordUsageForBot(bot);
    }
  }

  const botMsg: Message = {
    id: "m-fb-bot-" + Math.random().toString(36).substr(2, 9),
    sender: "bot",
    username: bot.name,
    text: aiAnswer.text,
    timestamp: new Date().toISOString(),
    sourcesUsed: aiAnswer.sources,
    fallbackTriggered: aiAnswer.fallbackTriggered
  };

  session.messages.push(botMsg);
  session.lastMessageText = aiAnswer.text;
  session.lastMessageTime = botMsg.timestamp;
  session.status = aiAnswer.fallbackTriggered ? "escalated" : "bot_answered";

  analytics.totalMessages += 2;
  const isExistingUser = chatSessions.filter(s => s.telegramUserId === userKey).length > 1;
  if (!isExistingUser) analytics.totalUsers += 1;

  if (options?.sendReply !== false) {
    await sendFacebookTextMessage(bot, senderId, aiAnswer.text);
  }

  try {
    await dbSaveConversation(session);
  } catch (saveErr) {
    console.warn("[Facebook Webhook] Skip Supabase upload, running locally:", saveErr);
  }

  return { session, reply: botMsg };
}

app.get("/api/bots/:botId/facebook-webhook", async (req, res) => {
  const webhookUrl = `${getPublicBaseUrl(req)}/api/facebook-webhook/${req.params.botId}`;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  const hasPerBotToken = !!bot?.facebookPageAccessToken;
  res.json({
    configured: hasPerBotToken || !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    perBotToken: hasPerBotToken,
    facebookStatus: bot?.facebookStatus || (hasPerBotToken ? "connected" : "not_connected"),
    facebookPageName: bot?.facebookPageName || null,
    facebookPageId: bot?.facebookPageId || null,
    webhookUrl,
    verifyToken: getFacebookVerifyToken(),
    graphApiVersion: getFacebookGraphApiVersion()
  });
});

// Kết nối Facebook Page per-bot: dán Page Access Token, server tự xác thực,
// lấy page id/name và tự subscribe webhook events (bỏ bước thủ công trên Meta).
app.post("/api/bots/:botId/facebook-connect", async (req, res) => {
  const botId = req.params.botId;
  const pageAccessToken = (req.body?.pageAccessToken || "").toString().trim();
  if (!pageAccessToken) {
    return res.status(400).json({ success: false, error: "Thiếu Page Access Token." });
  }

  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ success: false, error: "Bot not found" });

  const ver = getFacebookGraphApiVersion();
  try {
    // 1. Xác thực token + lấy thông tin Page.
    const meRes = await fetch(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`);
    const me = await meRes.json();
    if (!meRes.ok || !me?.id) {
      return res.status(400).json({ success: false, error: me?.error?.message || "Token không hợp lệ hoặc không phải Page Access Token." });
    }

    // 2. Tự subscribe app vào Page cho các event tin nhắn (bỏ bước thủ công).
    let subscribed = false;
    let subscribeWarning = "";
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/${ver}/${me.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(pageAccessToken)}`,
        { method: "POST" }
      );
      const subData = await subRes.json().catch(() => ({}));
      subscribed = !!subData?.success;
      if (!subscribed) subscribeWarning = subData?.error?.message || "Không tự subscribe được; có thể cần subscribe thủ công trên Meta.";
    } catch (subErr: any) {
      subscribeWarning = subErr?.message || "Lỗi khi subscribe app vào Page.";
    }

    // 3. Lưu per-bot (memory + DB).
    const updates = {
      facebookPageAccessToken: pageAccessToken,
      facebookPageId: me.id,
      facebookPageName: me.name || "",
      facebookStatus: "connected" as const,
      facebookConnectedAt: new Date().toISOString()
    };
    const memBot = bots.find(b => b.id === botId);
    if (memBot) Object.assign(memBot, updates);
    await dbUpdateBot(botId, updates);

    return res.json({
      success: true,
      pageId: me.id,
      pageName: me.name || "",
      subscribed,
      subscribeWarning,
      message: subscribed
        ? `Đã kết nối Page "${me.name}" và tự subscribe webhook thành công.`
        : `Đã kết nối Page "${me.name}". Lưu ý: ${subscribeWarning}`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: "Lỗi gọi Facebook Graph API: " + (err?.message || err) });
  }
});

// Ngắt kết nối Facebook Page khỏi bot.
app.post("/api/bots/:botId/facebook-disconnect", async (req, res) => {
  const botId = req.params.botId;
  const updates = {
    facebookPageAccessToken: "",
    facebookPageId: "",
    facebookPageName: "",
    facebookStatus: "not_connected" as const
  };
  const memBot = bots.find(b => b.id === botId);
  if (memBot) Object.assign(memBot, updates);
  const ok = await dbUpdateBot(botId, updates);
  return res.json({ success: ok, message: ok ? "Đã ngắt kết nối Facebook Page." : "Không cập nhật được DB." });
});

// Facebook Messenger webhook verification endpoint for Meta Developer dashboard.
app.get("/api/facebook-webhook/:botId", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === getFacebookVerifyToken()) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Simulated Facebook message for local development without Meta webhook setup.
app.post("/api/facebook-webhook/simulate", async (req, res) => {
  const { botId, text, userId } = req.body;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const result = await processFacebookIncomingMessage(bot, {
      sender: { id: userId || "fb-sim-" + Math.floor(Math.random() * 10000) },
      message: {
        mid: "sim-" + Math.random().toString(36).substr(2, 9),
        text
      }
    }, { sendReply: false });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Facebook simulation failed" });
  }
});

// Live Facebook Messenger webhook handler.
app.post("/api/facebook-webhook/:botId", async (req, res) => {
  const body = req.body;
  const botId = req.params.botId;

  if (body?.object !== "page") {
    return res.sendStatus(404);
  }

  res.status(200).send("EVENT_RECEIVED");

  try {
    const allBots = await dbGetBots(bots);
    const bot = allBots.find(b => b.id === botId);
    if (!bot) {
      console.warn(`[Facebook Webhook] Received event for unknown bot ID: ${botId}`);
      return;
    }

    const messagingEvents = (body.entry || []).flatMap((entry: any) => entry.messaging || []);
    for (const event of messagingEvents) {
      await processFacebookIncomingMessage(bot, event);
    }
  } catch (err) {
    console.error("[Facebook Webhook] Error in live processing flow:", err);
  }
});

// Health check cho uptime pinger (giu Render thuc khi chay listener Zalo).
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ===== Zalo Group Bot API (per signed-in user) =====
app.get("/api/zalo/status", (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(getRuntimeStatus(email));
});

app.post("/api/zalo/login/start", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(await startQrLogin(email));
});

app.get("/api/zalo/login/result", (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(getQrLoginResult(email));
});

app.post("/api/zalo/logout", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  await logoutZalo(email);
  res.json({ ok: true });
});

app.get("/api/zalo/groups", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const bindings = await listBindings(email);
  const userConfig = getSavedSupabaseConfigForEmail(email);
  const allBots = await withSupabaseConfig(userConfig, () => dbGetBots(bots));
  res.json({ bindings, bots: allBots.map((b) => ({ id: b.id, name: b.name })) });
});

app.post("/api/zalo/groups/:groupId/binding", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const { botId, enabled, groupName } = req.body || {};
  if (!botId) return res.status(400).json({ error: "Thieu botId" }) as any;
  await upsertBinding({
    owner_email: email,
    group_id: req.params.groupId,
    group_name: groupName,
    bot_id: botId,
    enabled: enabled !== false,
  });
  res.json({ ok: true });
});

// Test duong RAG ma khong can Zalo that.
app.post("/api/zalo/simulate", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const { botId, text, senderName } = req.body || {};
  const userConfig = getSavedSupabaseConfigForEmail(email);
  const allBots = await withSupabaseConfig(userConfig, () => dbGetBots(bots));
  const bot = allBots.find((b) => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" }) as any;
  try {
    const ai = await withSupabaseConfig(userConfig, () => generateRAGAnswer(
      bot, String(text || ""),
      { fullName: senderName || "Khach test", username: senderName || "tester", id: "zalo-sim" },
      { shouldGreet: true, recentMessages: [] }
    ));
    res.json({ reply: postProcessBotReply(ai.text, { shouldGreet: true }), sources: ai.sources });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Zalo simulation failed" });
  }
});

const DEFAULT_CUSTOMER_PRONOUN = "Anh/Chị";
const DEFAULT_CUSTOMER_NAME = "Khách Hàng";

function stripDecorativeNameCharacters(value: string): string {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F]/gu, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, " ")
    .replace(/[_@#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableCustomerNameToken(token: string): boolean {
  const cleaned = stripDecorativeNameCharacters(token);
  if (!cleaned || !/[\p{L}]/u.test(cleaned)) return false;
  if (/^(bot|user|test|guest|anonymous|facebook|botpress|telegram|khach|khách|hang|hàng)$/iu.test(cleaned)) return false;
  return cleaned.length >= 2 || /^[A-Za-zÀ-ỹĐđ]$/u.test(cleaned);
}

function getSafeCustomerLead(pronoun: string, name: string): string {
  return pronoun === DEFAULT_CUSTOMER_PRONOUN || name === DEFAULT_CUSTOMER_NAME
    ? "mình"
    : `${pronoun} ${name}`;
}

function getSafeCustomerLeadForSentenceStart(pronoun: string, name: string): string {
  const lead = getSafeCustomerLead(pronoun, name);
  return lead === "mình" ? "Mình" : `${pronoun === "chị" ? "Chị" : "Anh"} ${name}`;
}

function personalizeWelcomeMessage(message: string, pronoun: string, name: string): string {
  const lead = getSafeCustomerLead(pronoun, name);
  const leadStart = getSafeCustomerLeadForSentenceStart(pronoun, name);
  return message
    .replace(/anh\/chị/g, lead)
    .replace(/anh chị/g, lead)
    .replace(/Anh\/Chị/g, leadStart)
    .replace(/Anh chị/g, leadStart);
}

function removeEmojiNameAddressing(text: string): string {
  return (text || "")
    .replace(/\b(anh|chị|Anh|Chị|anh\/chị|Anh\/Chị)\s+[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F]+(?=\s|[,.!?;:]|$)/gu, "mình")
    .replace(/\b(anh|chị|Anh|Chị)\s+(?=(ơi|ạ|nha|nhé)\b)/gu, "mình ");
}

// Helper to detect Vietnamese gender and extract first name
function getGenderAndName(fullName: string, _username?: string, _messageText?: string): { pronoun: string; name: string } {
  if (!fullName) return { pronoun: DEFAULT_CUSTOMER_PRONOUN, name: DEFAULT_CUSTOMER_NAME };
  const parts = stripDecorativeNameCharacters(fullName).split(/\s+/);
  const cleanParts = parts
    .map(p => stripDecorativeNameCharacters(p))
    .filter(isUsableCustomerNameToken);
  if (cleanParts.length === 0) {
    return { pronoun: DEFAULT_CUSTOMER_PRONOUN, name: DEFAULT_CUSTOMER_NAME };
  }
  
  // Last word is generally the user's first/given name in Vietnamese
  const name = cleanParts[cleanParts.length - 1];
  
  // Explicit female cues (middle names/common names)
  const femaleKeywords = [
    "thị", "my", "vy", "nhi", "hằng", "thu", "mai", "trang", "lan", "hương", "linh", "yến", "kiều", 
    "oanh", "như", "phương", "nga", "ngọc", "mơ", "dung", "hoa", "thảo", "hồng", "huệ", "cúc", 
    "tuyết", "quỳnh", "thư", "trúc", "kim", "trinh", "nguyệt", "lệ", "thắm", "hiền", "đào", 
    "loan", "phượng", "xuân", "hà", "ân", "giang", "trâm", "chi", "diệp", "khánh", "vân", "thuý", 
    "thủy", "tâm", "diệu", "liên", "bích", "giao", "nương", "tú", "uyên", "thêu", "an", "hà"
  ];

  // Explicit male cues (middle names/common names)
  const maleKeywords = [
    "văn", "đức", "duy", "hải", "sơn", "hùng", "minh", "tuấn", "hoàng", "phong", "phúc", "quang", 
    "long", "nam", "việt", "toàn", "quốc", "khánh", "thắng", "tú", "bách", "nghĩa", "khải", "tùng", 
    "cường", "trọng", "vương", "tấn", "thành", "kiên", "huy", "đạt", "trung", "dũng", "quân", 
    "khoa", "thịnh", "bảo", "khang", "khôi", "hưng", "lâm", "vũ", "phi", "thái", "bình", "tân", 
    "nhân", "triết", "kiệt"
  ];

  // Scan middle parts as extremely strong signals: Thị (Female) vs Văn (Male)
  let middleGender = "";
  if (cleanParts.length > 2) {
    const middleParts = cleanParts.slice(1, cleanParts.length - 1).map(p => p.toLowerCase());
    if (middleParts.includes("thị")) {
      middleGender = "female";
    } else if (middleParts.includes("văn")) {
      middleGender = "male";
    }
  }

  if (middleGender === "female") {
    return { pronoun: "chị", name };
  }
  if (middleGender === "male") {
    return { pronoun: "anh", name };
  }

  // Fallback to keyword matching scores
  let femaleScore = 0;
  let maleScore = 0;

  cleanParts.forEach((part, idx) => {
    const partLower = part.toLowerCase();
    const isGivenName = (idx === cleanParts.length - 1);
    const weight = isGivenName ? 3 : 1;

    if (femaleKeywords.includes(partLower)) {
      femaleScore += weight;
    }
    if (maleKeywords.includes(partLower)) {
      maleScore += weight;
    }
  });

  if (femaleScore > maleScore) {
    return { pronoun: "chị", name };
  } else if (maleScore > femaleScore) {
    return { pronoun: "anh", name };
  }

  return { pronoun: DEFAULT_CUSTOMER_PRONOUN, name };
}

function cleanKnowledgeText(text: string): string {
  return (text || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type ChunkMetadata = {
  topic?: string;
  dayNumber?: number;
  coursePhase?: "main" | "followup" | "bonus" | "unknown";
  priority?: number;
  sourceName?: string;
};

function getTagValue(tags: string[] = [], key: string): string | undefined {
  const prefix = `${key}:`;
  return tags.find(tag => tag.startsWith(prefix))?.slice(prefix.length);
}

function normalizeChunkTags(tags: string[] = []): string[] {
  return Array.from(new Set(tags.map(tag => String(tag || "").trim()).filter(Boolean)));
}

function inferChunkMetadata(text: string, title = "", sourceName = ""): ChunkMetadata {
  const raw = `${title}\n${sourceName}\n${text}`;
  const normalized = normalizeSearchText(raw);
  const dayMatch = normalized.match(/\b(?:ngay|day)\s*(\d{1,2})\b/) || normalized.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : undefined;

  let topic = "general";
  if (/(gia|hoc phi|chi phi|phi|bao nhieu tien|bao gia|bang gia|price|cost|khuyen mai|uu dai|combo|goi)/i.test(normalized)) topic = "pricing";
  else if (/(ship|giao hang|van chuyen|noi thanh|ngoai tinh|delivery|shipping|thoi gian giao|phi ship)/i.test(normalized)) topic = "shipping";
  else if (/(bao hanh|doi tra|hoan tien|chinh sach|cam ket|policy|warranty|refund|return)/i.test(normalized)) topic = "policy";
  else if (/(huong dan|cach dung|su dung|bao quan|lap dat|kich hoat|ket noi|setup|how to)/i.test(normalized)) topic = "howto";
  else if (/(con hang|het hang|ton kho|lich trong|available|availability|stock)/i.test(normalized)) topic = "availability";
  else if (/(bao lau|bao nhieu ngay|thoi luong|do dai|keo dai|duration|hoc bao nhieu|mat bao lau|thoi gian xu ly)/i.test(normalized)) topic = "duration";
  else if (dayNumber || /(lo trinh|lich hoc|lich hen|lich trinh|tung ngay|ngay hoc|module|bai hoc|timeline|schedule)/i.test(normalized)) topic = "timeline";
  else if (/(phu hop|doi tuong|ai nen|danh cho ai|customer avatar|khach hang nao|nen chon)/i.test(normalized)) topic = "audience";
  else if (/(ket qua|dau ra|nhan duoc|dat duoc|loi ich|ung dung|thuc chien|benefit|result)/i.test(normalized)) topic = "outcome";
  else if (/(so sanh|khac gi|khac nhau|nen chon|compare|option)/i.test(normalized)) topic = "comparison";
  else if (/(la ai|ai vay|ai day|who is|nguoi nao|nhan vat|founder|ceo|tac gia|mentor)/i.test(normalized)) topic = "identity";
  else if (/(san pham|dich vu|goi|tinh nang|co gi|noi dung|product|service|feature)/i.test(normalized)) topic = "offering";
  else if (/(faq|hoi dap|cau hoi)/i.test(normalized)) topic = "faq";

  let coursePhase: ChunkMetadata["coursePhase"] = "unknown";
  if (/(sau khoa|tiep theo|ngay\s*15\s*[-–]\s*44|30 ngay tiep|brand playbook|playbook 30)/i.test(normalized)) {
    coursePhase = "followup";
  } else if (/(khoa hoc chinh|14 ngay|15 ngay|ngay\s*1\s*[-–]\s*14|ngay\s*1\s*[-–]\s*15|course)/i.test(normalized)) {
    coursePhase = "main";
  } else if (/(bonus|tang kem|qua tang)/i.test(normalized)) {
    coursePhase = "bonus";
  }

  const priority = topic === "duration" ? 9 : topic === "timeline" ? 8 : topic === "pricing" ? 7 : 5;
  return { topic, dayNumber: Number.isFinite(dayNumber) ? dayNumber : undefined, coursePhase, priority, sourceName };
}

function metadataToTags(meta: ChunkMetadata): string[] {
  const tags: string[] = [];
  if (meta.topic) tags.push(`topic:${meta.topic}`);
  if (meta.dayNumber) tags.push(`day:${meta.dayNumber}`);
  if (meta.coursePhase && meta.coursePhase !== "unknown") tags.push(`phase:${meta.coursePhase}`);
  if (meta.priority) tags.push(`priority:${meta.priority}`);
  return tags;
}

function buildKnowledgeChunksForSource(source: KnowledgeSource, baseTags: string[] = []): KnowledgeChunk[] {
  const text = (source.fullText || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  const shouldKeepLines = lines.some(line => /^(ngày|day)\s*\d{1,2}\b|^\d{1,2}[\).\-\s]+|^[-•]\s+|lộ trình|khóa học|học phí|giá|faq|chính sách|bảo hành|đổi trả|ship|giao hàng|sản phẩm|dịch vụ|tính năng/i.test(line));
  const units = shouldKeepLines ? lines : text.split(/(?<=[.!?。])\s+/).map(part => part.trim()).filter(Boolean);
  const chunkContents: string[] = [];
  let currentChunk = "";

  for (const unit of units) {
    const isStandalone = /^(ngày|day)\s*\d{1,2}\b|^\d{1,2}\s*[-–]\s*\d{1,2}\b/i.test(unit);
    if (isStandalone && currentChunk.trim()) {
      chunkContents.push(currentChunk.trim());
      currentChunk = "";
    }

    const next = currentChunk ? `${currentChunk}\n${unit}` : unit;
    if (next.length <= 650) {
      currentChunk = next;
    } else {
      if (currentChunk.trim()) chunkContents.push(currentChunk.trim());
      currentChunk = unit;
    }
  }
  if (currentChunk.trim()) chunkContents.push(currentChunk.trim());

  return chunkContents.map((chunkText, index) => {
    const meta = inferChunkMetadata(chunkText, `${source.name} (Mục ${index + 1})`, source.name);
    const tags = normalizeChunkTags([
      source.category,
      ...baseTags,
      ...metadataToTags(meta)
    ]);
    return {
      id: "chk-" + Math.random().toString(36).substr(2, 9),
      botId: source.botId,
      sourceId: source.id,
      title: `${source.name.substring(0, 30)} (Mục ${index + 1})`,
      content: chunkText,
      category: source.category,
      tags,
      isActive: true,
      metadata: meta
    };
  });
}

function normalizeSearchText(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function isDurationQuestion(query: string): boolean {
  const normalized = normalizeSearchText(query);
  return /(bao nhieu ngay|may ngay|bao lau|thoi luong|do dai|hoc trong bao lau|hoc bao nhieu|duration|how long)/i.test(normalized);
}

function extractCourseDurationSummary(text: string): { mainDuration?: string; followUpPlan?: string } {
  const normalized = normalizeSearchText(text);
  const mainMatch = normalized.match(/(?:khoa hoc|course)[^.\n]{0,40}?(\d{1,3})\s*ngay/);
  const followUpMatch = normalized.match(/(?:ke hoach|playbook|brand playbook)[^.\n]{0,60}?(\d{1,3})\s*ngay[^.\n]{0,80}?(?:tiep theo|ngay\s*15\s*[-–]\s*44|sau khi ket thuc)/)
    || normalized.match(/(\d{1,3})\s*ngay\s*tiep\s*theo[^.\n]{0,80}?(?:ngay\s*15\s*[-–]\s*44|sau khi ket thuc)/);

  return {
    mainDuration: mainMatch ? `${mainMatch[1]} ngày` : undefined,
    followUpPlan: followUpMatch ? `${followUpMatch[1]} ngày tiếp theo` : undefined
  };
}

function extractRequestedCourseDay(query: string): number | null {
  const normalized = normalizeSearchText(query);
  const match = normalized.match(/(?:ngay|day)\s*(\d{1,2})(?:\b|[^0-9])/) || normalized.match(/\b(\d{1,2})\s*(?:hoc gi|co gi|noi dung gi)/);
  if (!match) return null;
  const day = Number(match[1]);
  return Number.isFinite(day) && day > 0 && day < 100 ? day : null;
}

function extractDayScheduleAnswer(text: string, day: number): string | null {
  const source = cleanKnowledgeText(text);
  const escapedDay = String(day).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`ngày\\s*${escapedDay}\\b\\s*[:\\-–)]?\\s*([^\\.\\n]{12,220})`, "i"),
    new RegExp(`\\bday\\s*${escapedDay}\\b\\s*[:\\-–)]?\\s*([^\\.\\n]{12,220})`, "i"),
    new RegExp(`\\(${`ngày\\s*${escapedDay}`}[^)]*\\)\\s*([^\\.\\n]{12,220})`, "i")
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return humanizeKnowledgePoint(match[1]);
    }
  }

  const rangePattern = new RegExp(`ngày\\s*(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})[^\\.\\n]{0,160}`, "i");
  const rangeMatch = source.match(rangePattern);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (day >= start && day <= end) {
      return humanizeKnowledgePoint(rangeMatch[0]);
    }
  }

  return null;
}

function isInstructionLikeSentence(sentence: string): boolean {
  const normalized = sentence.trim().toLowerCase();
  if (!normalized) return true;
  return /^(hãy|tôi sẽ|viết|dán|phỏng vấn|lời khuyên|bài tập|yêu cầu|prompt|copy|paste)\b/i.test(normalized)
    || /\?$/.test(normalized)
    || normalized.length < 24;
}

function humanizeKnowledgePoint(sentence: string): string {
  let text = sentence
    .replace(/^[\-\d.)\s]+/, "")
    .replace(/\b(MICRO|PSYCHOLOGICAL TACTICS|CTA|HOOK)\b/gi, match => match.toLowerCase())
    .replace(/\s+/g, " ")
    .trim();

  text = text.replace(/^(.)(.*)$/, (_, first, rest) => first.toUpperCase() + rest);
  return cleanBotReplyText(text.replace(/[.;:,]+$/, ""));
}

function isTimelineHeavyPoint(text: string): boolean {
  const normalized = normalizeSearchText(text);
  return /^(ngay|day)\s*\d{1,2}\b|ngay\s*\d{1,2}\s*[-–]\s*\d{1,2}|^\d{1,2}\s*[\).\-]/i.test(normalized);
}

function pickNaturalCoursePoints(sourceText: string, maxPoints = 3): string[] {
  const sentences = sourceText
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(sentence => humanizeKnowledgePoint(sentence))
    .filter(sentence => sentence.length > 24)
    .filter(sentence => !isInstructionLikeSentence(sentence))
    .filter(sentence => !isTimelineHeavyPoint(sentence));

  const scored = sentences.map(sentence => {
    const normalized = normalizeSearchText(sentence);
    let score = 0;
    if (/(thuc chien|ung dung|ap dung|cong viec|ban hang|noi dung|content|ai)/i.test(normalized)) score += 4;
    if (/(ket qua|dau ra|giup|minh biet|nam duoc|xay he thong)/i.test(normalized)) score += 3;
    if (/(phu hop|danh cho|nguoi moi|doi tuong|avatar)/i.test(normalized)) score += 2;
    if (/(muc tieu|nhiem vu|bai hoc|tieu chi)/i.test(normalized)) score += 1;
    return { sentence, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)
    .filter(item => item.score > 0)
    .map(item => item.sentence)
    .slice(0, maxPoints);
}

function isEducationContext(bot: BotConfig, query: string, sourceText = ""): boolean {
  const normalized = normalizeSearchText(`${bot.field} ${bot.description} ${bot.name} ${query} ${sourceText.slice(0, 800)}`);
  return /(khoa hoc|dao tao|hoc vien|bai hoc|lo trinh hoc|giang vien|hoc phi|train|training|course|education|academy)/i.test(normalized);
}

function getOfferingLabel(bot: BotConfig): string {
  const normalized = normalizeSearchText(`${bot.field} ${bot.description}`);
  if (/(khoa hoc|dao tao|hoc vien|academy|education|training|course)/i.test(normalized)) return "khóa học";
  if (/(dich vu|service|agency|spa|clinic|tu van|consulting)/i.test(normalized)) return "dịch vụ";
  if (/(phan mem|saas|app|tool|nen tang|software|platform)/i.test(normalized)) return "giải pháp";
  if (/(nha hang|cafe|quan an|food|restaurant|f&b)/i.test(normalized)) return "sản phẩm/dịch vụ";
  return "sản phẩm/dịch vụ";
}

function extractIdentitySubject(query: string): string {
  const cleaned = cleanBotReplyText(query)
    .replace(/\b(là ai|là ai vậy|là ai vậy em|ai vậy|ai vậy em|who is)\b/gi, "")
    .replace(/[?!.]+$/g, "")
    .trim();
  return cleaned || "nhân vật này";
}

function makeNaturalSentence(text: string): string {
  const cleaned = humanizeKnowledgePoint(text)
    .replace(/\s*[-–]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/[.;:,]+$/g, "");
}

function pickGroundedBusinessPoints(sourceText: string, queryTopic = "general", maxPoints = 3): string[] {
  const sentences = sourceText
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(sentence => humanizeKnowledgePoint(sentence))
    .filter(sentence => sentence.length > 18)
    .filter(sentence => !isInstructionLikeSentence(sentence));

  const scored = sentences.map(sentence => {
    const normalized = normalizeSearchText(sentence);
    let score = 0;
    if (queryTopic === "pricing" && /(gia|phi|vnd|vnđ|dong|uu dai|khuyen mai|combo|goi|thanh toan|\d)/i.test(normalized)) score += 6;
    if (queryTopic === "shipping" && /(giao|ship|van chuyen|noi thanh|ngoai tinh|phi ship|nhan hang)/i.test(normalized)) score += 6;
    if (queryTopic === "policy" && /(bao hanh|doi tra|hoan tien|chinh sach|cam ket|quy dinh)/i.test(normalized)) score += 6;
    if (queryTopic === "howto" && /(huong dan|cach|su dung|bao quan|lap dat|kich hoat|ket noi|buoc)/i.test(normalized)) score += 6;
    if (queryTopic === "availability" && /(con hang|het hang|ton kho|san co|dat truoc|lich)/i.test(normalized)) score += 6;
    if (queryTopic === "comparison" && /(khac|so sanh|uu diem|nhuoc diem|phu hop|nen chon)/i.test(normalized)) score += 6;
    if (queryTopic === "identity" && /(la|ten|founder|ceo|mentor|tac gia|chuyen gia|anti anti ai|aaa)/i.test(normalized)) score += 6;
    if (queryTopic === "audience" && /(phu hop|danh cho|doi tuong|khach hang|nhu cau)/i.test(normalized)) score += 6;
    if (queryTopic === "outcome" && /(loi ich|ket qua|giup|nhan duoc|dat duoc|toi uu|hieu qua)/i.test(normalized)) score += 5;
    if (/(san pham|dich vu|goi|tinh nang|loi ich|uu diem|ho tro|giup|phu hop)/i.test(normalized)) score += 2;
    if (/\d/.test(sentence)) score += 1;
    return { sentence, score };
  });

  const selected = scored
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)
    .filter(item => item.score > 0)
    .map(item => item.sentence)
    .slice(0, maxPoints);

  return selected.length ? selected : sentences.slice(0, maxPoints);
}

const VI_UPPERCASE_TO_LOWERCASE: Record<string, string> = {
  "Á": "á", "À": "à", "Ả": "ả", "Ã": "ã", "Ạ": "ạ",
  "Ắ": "ắ", "Ằ": "ằ", "Ẳ": "ẳ", "Ẵ": "ẵ", "Ặ": "ặ", "Ă": "ă",
  "Ấ": "ấ", "Ầ": "ầ", "Ẩ": "ẩ", "Ẫ": "ẫ", "Ậ": "ậ", "Â": "â",
  "É": "é", "È": "è", "Ẻ": "ẻ", "Ẽ": "ẽ", "Ẹ": "ẹ",
  "Ế": "ế", "Ề": "ề", "Ể": "ể", "Ễ": "ễ", "Ệ": "ệ", "Ê": "ê",
  "Í": "í", "Ì": "ì", "Ỉ": "ỉ", "Ĩ": "ĩ", "Ị": "ị",
  "Ó": "ó", "Ò": "ò", "Ỏ": "ỏ", "Õ": "õ", "Ọ": "ọ",
  "Ố": "ố", "Ồ": "ồ", "Ổ": "ổ", "Ỗ": "ỗ", "Ộ": "ộ", "Ô": "ô",
  "Ớ": "ớ", "Ờ": "ờ", "Ở": "ở", "Ỡ": "ỡ", "Ợ": "ợ", "Ơ": "ơ",
  "Ú": "ú", "Ù": "ù", "Ủ": "ủ", "Ũ": "ũ", "Ụ": "ụ",
  "Ứ": "ứ", "Ừ": "ừ", "Ử": "ử", "Ữ": "ữ", "Ự": "ự", "Ư": "ư",
  "Ý": "ý", "Ỳ": "ỳ", "Ỷ": "ỷ", "Ỹ": "ỹ", "Ỵ": "ỵ", "Đ": "đ"
};

function cleanMixedVietnameseCase(text: string): string {
  return (text || "").replace(
    /([\p{Ll}])([ĐÁÀẢÃẠẮẰẲẴẶĂẤẦẨẪẬÂÉÈẺẼẸẾỀỂỄỆÊÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘÔỚỜỞỠỢƠÚÙỦŨỤỨỪỬỮỰƯÝỲỶỸỴ])(?=[\p{Ll}]|\b)/gu,
    (_match, before, upper) => {
      return before + (VI_UPPERCASE_TO_LOWERCASE[upper] || upper.toLowerCase());
    }
  );
}

function cleanBotReplyText(text: string): string {
  let cleaned = (text || "")
    .normalize("NFC")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  cleaned = cleanMixedVietnameseCase(cleaned);
  cleaned = removeEmojiNameAddressing(cleaned);
  cleaned = cleaned
    .replace(/\bhọc\s+suông\b/gi, "học lý thuyết suông")
    .replace(/\bkế\s+hoạch\b/gi, "kế hoạch");

  return cleaned;
}

function removeRepeatedGreeting(text: string): string {
  let cleaned = text || "";
  const greetingPatterns = [
    /^Dạ\s+em\s+(?:xin\s+)?(?:kính\s+)?chào(?:\s+(?:mình|anh\/chị|anh|chị))?(?:\s+[^\s,.!?]+){0,3}\s*(?:ơi|ạ)?[,.!?]?\s*/i,
    /^Em\s+(?:xin\s+)?(?:kính\s+)?chào(?:\s+(?:mình|anh\/chị|anh|chị))?(?:\s+[^\s,.!?]+){0,3}\s*(?:ơi|ạ)?[,.!?]?\s*/i,
    /^(?:Xin\s+)?chào(?:\s+(?:mình|anh\/chị|anh|chị))?(?:\s+[^\s,.!?]+){0,3}\s*(?:ơi|ạ)?[,.!?]?\s*/i
  ];

  for (const pattern of greetingPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.trimStart();
}

function postProcessBotReply(text: string, options?: { shouldGreet?: boolean; recentMessages?: Message[] }): string {
  let cleaned = cleanBotReplyText(text);
  const hasPriorBotReply = (options?.recentMessages || []).some(msg => msg.sender === "bot");
  if (options?.shouldGreet === false || hasPriorBotReply) {
    cleaned = removeRepeatedGreeting(cleaned);
  }
  return capitalizeFirstLetter(cleaned);
}

// Viết hoa chữ cái đầu tiên của câu trả lời, bỏ qua khoảng trắng/dấu câu/emoji ở đầu.
function capitalizeFirstLetter(text: string): string {
  const str = String(text || "");
  const idx = str.search(/\p{L}/u);
  if (idx === -1) return str;
  return str.slice(0, idx) + str.charAt(idx).toUpperCase() + str.slice(idx + 1);
}

function inferSupportIntent(query: string): string {
  const text = query.toLowerCase();
  if (/(giá|bao nhiêu|phí|khuyến mãi|mua|đăng ký|tư vấn|gói|combo|price|buy|cost)/i.test(text)) return "sales";
  if (/(lỗi|không được|hỏng|sai|khiếu nại|bực|tức|hoàn tiền|đổi trả|complain|refund|error)/i.test(text)) return "complaint";
  if (/(chính sách|bảo hành|đổi trả|vận chuyển|ship|policy)/i.test(text)) return "policy";
  if (/(đặt lịch|hẹn|schedule|booking|gặp nhân viên|tư vấn viên)/i.test(text)) return "booking";
  if (/(so sánh|khác gì|nên chọn|phù hợp|option|compare)/i.test(text)) return "comparison";
  return "information";
}

function inferCustomerEmotion(query: string): string {
  const text = query.toLowerCase();
  if (/(bực|tức|khó chịu|quá tệ|lừa|chán|angry|mad)/i.test(text)) return "angry";
  if (/(lỗi|không hiểu|sao lại|không được|rối|confused|frustrated)/i.test(text)) return "frustrated";
  if (/(quan tâm|muốn mua|tư vấn|hợp không|interested)/i.test(text)) return "interested";
  if (/(gì vậy|như thế nào|ra sao|curious|hỏi)/i.test(text)) return "curious";
  return "neutral";
}

function detectOffTopicChitChat(query: string): "romantic" | "greeting" | "thanks" | "joke" | "casual" | null {
  const normalized = normalizeSearchText(query);
  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (/(anh yeu em|em yeu anh|chi yeu em|yeu em|yeu anh|thuong em|nho em|hon em|crush|love you|i love you)/i.test(compact)) return "romantic";
  // Có tín hiệu hỏi về kinh doanh (giá/mua/sản phẩm...) → KHÔNG phải tán gẫu, để RAG xử lý.
  // Tránh bắt nhầm "ủa có giá mà em" thành casual chỉ vì chứa từ "ua".
  if (/\b(gia|bao nhieu|mua|ban|san pham|dich vu|khoa hoc|goi|ship|bao hanh|doi tra|size|mau|con hang|dat hang|tu van|chinh sach|khuyen mai|uu dai)\b/i.test(compact)) return null;
  if (/^(hi|hello|helo|alo|chao|xin chao|hey|yo|em oi|bot oi|shop oi|ad oi)(\s|$)/i.test(compact)) return "greeting";
  if (/(cam on|thanks|thank you|tks|thank|ok cam on|tot qua|hay qua)/i.test(compact)) return "thanks";
  if (/(ke chuyen cuoi|noi cau vui|ke truyen vui|joke|vui len|hat cho|doc tho)/i.test(compact)) return "joke";
  // Casual: chỉ khi TOÀN BỘ câu là từ đệm (neo đầu-cuối), không bắt khi từ đệm lẫn trong câu có nội dung.
  if (compact.length <= 18 && /^(haha|hihi|hehe|test|thu xem|ok|oke|uh|ua|wow|uki|hmm)[\s.!?]*$/i.test(compact)) return "casual";
  return null;
}

function buildOffTopicChitChatReply(
  bot: BotConfig,
  query: string,
  pronoun: string,
  targetName: string,
  kind: NonNullable<ReturnType<typeof detectOffTopicChitChat>>,
  isFirstInteraction = true
): string {
  const lead = getSafeCustomerLead(pronoun, targetName);
  const offeringLabel = getOfferingLabel(bot);
  const brandName = bot.name || bot.telegramBotUsername || "bên em";

  if (kind === "romantic") {
    if (!isFirstInteraction) {
      return `Dạ câu này em nhận bằng một nụ cười thật tươi nha ${lead} ơi.

${lead.charAt(0).toUpperCase() + lead.slice(1)} dễ thương vậy thì em trả lời cũng phải dễ thương theo chứ.`;
    }

    return `Dạ nghe câu này tim em suýt bật chế độ trả lời nhanh hơn cả webhook luôn đó ${lead} ơi 😄

Em xin nhận tình cảm đẹp này bằng một nụ cười thật tươi, còn nhiệm vụ chính của em vẫn là hỗ trợ ${lead} về ${offeringLabel} của ${brandName} cho thật chuẩn ạ.

Giờ mình quay lại việc chính nha: ${lead} muốn em tư vấn phần nào trước?`;
  }

  if (kind === "greeting") {
    if (!isFirstInteraction) {
      return `Em đây nè ${lead} ơi, vẫn đang nghe mình đó ạ. Mình nói tiếp đi, em theo kịp.`;
    }

    return `Dạ em đây ${lead} ơi, em đang online và sẵn sàng hỗ trợ mình ạ.

${lead.charAt(0).toUpperCase() + lead.slice(1)} muốn hỏi về ${offeringLabel}, giá, chính sách hay cần em tư vấn lựa chọn phù hợp trước nè?`;
  }

  if (kind === "thanks") {
    if (!isFirstInteraction) {
      return `Dạ không có gì đâu ạ. Giúp được ${lead} là em vui rồi.`;
    }

    return `Dạ em vui vì hỗ trợ được ${lead} ạ.

Nếu còn phần nào chưa rõ, ${lead} cứ hỏi tiếp nhé. Em vẫn đang trực ở đây, chưa xin nghỉ giải lao đâu ạ 😄`;
  }

  if (kind === "joke") {
    if (!isFirstInteraction) {
      return `Dạ được chứ, nhưng em kể nhẹ thôi nha: bot mà thấy mình vui là tự nhiên chạy nhanh hơn hẳn ạ.`;
    }

    return `Dạ em cũng muốn pha trò lắm, nhưng em sợ cười xong mình quên mất việc chính ạ 😄

Em xin giữ mood vui vẻ rồi quay lại hỗ trợ ${lead} về ${offeringLabel} của ${brandName} nha. Mình muốn em tư vấn phần nào trước?`;
  }

  if (!isFirstInteraction) {
    return `Dạ em nghe nè ${lead} ơi. Câu này hơi lạc nhịp một chút, nhưng mình cứ nói tiếp, em bắt nhịp được.`;
  }

  return `Dạ em nghe rồi ${lead} ơi 😄

Câu này hơi ngoài phần công việc chính của em một chút, nhưng không sao, em vẫn ở đây hỗ trợ mình. ${lead} muốn hỏi tiếp về ${offeringLabel}, giá, chính sách hay cách sử dụng trước ạ?`;
}

// Tao embedding cho mot chunk (an toan: loi -> bo qua, khong chan luong nap).
async function attachChunkEmbedding(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
  const ai = getAIClient();
  if (!ai) return chunk;
  const text = `${chunk.title}\n${chunk.content}`.trim();
  const h = hashText(text);
  if (chunk.embedding && chunk.embeddingHash === h) return chunk; // khong doi -> bo qua
  try {
    chunk.embedding = await embedText(ai, text, 2); // bulk: ít retry hơn để đỡ phồng request
    chunk.embeddingHash = h;
  } catch (e: any) {
    console.warn("[RAG] embed chunk failed:", e?.message || e);
  }
  return chunk;
}

// ================= USAGE METERING / BILLING =================
const BLOCK_MESSAGE = "Dạ hệ thống tạm đạt giới hạn phục vụ trong tháng, mong anh/chị thông cảm và liên hệ lại sau ạ.";

// ---- Free allowlist (chỉ cộng đồng được cấp mới dùng gói Free) ----
let _freeAllowCache: { entries: string[]; ok: boolean; at: number } | null = null;
const FREE_ALLOW_TTL_MS = 60_000;
async function getFreeAllowlistCached(force = false): Promise<{ entries: string[]; ok: boolean }> {
  const now = Date.now();
  if (!force && _freeAllowCache && now - _freeAllowCache.at < FREE_ALLOW_TTL_MS) {
    return { entries: _freeAllowCache.entries, ok: _freeAllowCache.ok };
  }
  const r = await dbGetFreeAllowlist();
  _freeAllowCache = { ...r, at: now };
  return r;
}
function invalidateFreeAllowlistCache() { _freeAllowCache = null; }

// Khớp email theo email cụ thể HOẶC domain. Entry "a@b.com" -> khớp email; "b.com"/"@b.com" -> khớp domain.
function isFreeAllowed(email: string, entries: string[]): boolean {
  const e = (email || "").toLowerCase();
  if (!e) return false;
  const domain = e.split("@")[1] || "";
  for (const raw of entries) {
    const v = (raw || "").replace(/^@/, "");
    if (!v) continue;
    if (v === e) return true;                            // email cụ thể
    if (!v.includes("@") && domain && v === domain) return true; // domain
  }
  return false;
}

// Phân giải gói (tier + hạn mức) cho 1 chủ sở hữu, ưu tiên theo độ bền:
//  1) saasCustomers (admin override trong phiên) → 2) profiles Supabase (bền) → 3) đặc cách admin = enterprise → 4) free.
// Gói Free bị GIỚI HẠN theo allowlist: ai không thuộc allowlist (và chưa mua gói) -> tier "none" (chặn).
async function resolveOwnerPlan(ownerKey: string, emailHint?: string): Promise<{ tier: string; limit: number }> {
  const keyLc = (ownerKey || "").toLowerCase();
  const emailLc = (emailHint || "").toLowerCase();

  const cust = saasCustomers.find(c =>
    c.id === ownerKey || c.email?.toLowerCase() === keyLc || (emailLc && c.email?.toLowerCase() === emailLc));
  let tier = cust?.tier as string | undefined;
  let limit = (cust?.messageLimit && cust.messageLimit > 0) ? cust.messageLimit : undefined;
  let email = cust?.email?.toLowerCase() || emailLc;

  if (!tier || !limit || !email) {
    const p = await dbGetProfilePlan(ownerKey);
    if (p) {
      if (!tier && p.tier) tier = p.tier;
      if (!limit && p.message_limit && p.message_limit > 0) limit = p.message_limit;
      if (!email && p.email) email = p.email.toLowerCase();
    }
  }

  // Admin không bao giờ bị giới hạn.
  const isAdmin = email === ADMIN_EMAIL || keyLc === ADMIN_EMAIL;
  if (isAdmin) {
    tier = "enterprise";
    if (!limit || limit <= 0) limit = PLAN_LIMITS.enterprise.messages;
  }

  // Người dùng "mặc định Free" (chưa mua gói trả phí, không phải admin) → gate theo allowlist.
  const isPaid = !!tier && tier !== "free" && !!PLAN_LIMITS[tier as keyof typeof PLAN_LIMITS];
  if (!isAdmin && !isPaid) {
    const allow = await getFreeAllowlistCached();
    // CHỈ enforce khi đọc được allowlist & có cấu hình; nếu không -> fail-open (vẫn cho Free).
    // Nếu không xác định được email -> không chặn (không thể kiểm tra).
    if (allow.ok && allow.entries.length > 0 && email && !isFreeAllowed(email, allow.entries)) {
      return { tier: "none", limit: 0 };
    }
  }

  const effTier = (tier as keyof typeof PLAN_LIMITS) || "free";
  const effLimit = (limit && limit > 0) ? limit : (PLAN_LIMITS[effTier]?.messages ?? PLAN_LIMITS.free.messages);
  return { tier: effTier, limit: effLimit };
}

// Kiểm tra hạn mức TRƯỚC khi gọi AI. Fail-open: lỗi DB -> count=0 -> cho qua.
async function checkUsageGate(bot: BotConfig): Promise<{ allowed: boolean; verdict: "ok" | "warn" | "blocked"; count: number; limit: number }> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return { allowed: true, verdict: "ok", count: 0, limit: 0 };
  const { tier, limit } = await resolveOwnerPlan(ownerKey);
  // Chủ bot không thuộc allowlist Free và chưa mua gói → chặn (bot không trả lời).
  if (tier === "none") return { allowed: false, verdict: "blocked", count: 0, limit: 0 };
  const count = await dbGetUsage(ownerKey, currentYearMonth());
  const verdict = usageVerdict(count, limit);
  return { allowed: verdict !== "blocked", verdict, count, limit };
}

// Tăng đếm SAU khi đã gửi câu trả lời AI thành công.
async function recordUsageForBot(bot: BotConfig): Promise<void> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return;
  await dbIncrementUsage(ownerKey, currentYearMonth());
}

// Core RAG matching & AI generation call
async function generateRAGAnswer(
  bot: BotConfig, 
  query: string,
  userInfo?: { fullName?: string; username?: string; id?: string },
  replyOptions?: { shouldGreet?: boolean; recentMessages?: Message[]; expand?: boolean }
): Promise<{ text: string; sources: any[]; fallbackTriggered: boolean }> {
  // Determine gender/pronoun and first name for xưng hô
  let pronoun = DEFAULT_CUSTOMER_PRONOUN;
  let targetName = DEFAULT_CUSTOMER_NAME;
  
  if (userInfo) {
    const defaultName = userInfo.fullName || userInfo.username || DEFAULT_CUSTOMER_NAME;
    const detected = getGenderAndName(defaultName);
    pronoun = detected.pronoun;
    targetName = detected.name;
  }

  const customerLead = getSafeCustomerLead(pronoun, targetName);
  const hasPriorBotReply = (replyOptions?.recentMessages || []).some(msg => msg.sender === "bot");
  const isFirstInteraction = replyOptions?.shouldGreet !== false && !hasPriorBotReply;

  // Bối cảnh hội thoại + xưng hô để LLM trả lời thông minh (xưng tên, hiểu câu nối tiếp).
  // recentMessages thường đã chứa chính câu đang trả lời ở cuối — loại nó ra để không
  // lặp câu hỏi vào history/ngữ cảnh embed (an toàn cả khi caller chưa push).
  const customerCtx = { lead: customerLead, hasRealName: customerLead !== "mình" };
  const priorMessages = (replyOptions?.recentMessages || []).slice();
  const tail = priorMessages[priorMessages.length - 1];
  if (tail && tail.sender === "user" && (tail.text || "").trim() === query.trim()) {
    priorMessages.pop();
  }
  const history = priorMessages
    .slice(-6)
    .map(m => ({ role: (m.sender === "bot" ? "bot" : "user") as "user" | "bot", text: (m.text || "").trim() }))
    .filter(t => t.text);
  const lastUserText = [...priorMessages].reverse().find(m => m.sender === "user")?.text;
  // Mode "reference": cho phép gợi ý sản phẩm khi khách hỏi liên quan nếu owner bật allowProductConsulting.
  const allowProductIntro = bot.allowProductConsulting !== false;
  const expand = replyOptions?.expand === true;
  const synthCtx = { customer: customerCtx, history, allowProductIntro, expand };

  const chitChatKind = detectOffTopicChitChat(query);
  if (chitChatKind) {
    return {
      text: postProcessBotReply(buildOffTopicChitChatReply(bot, query, pronoun, targetName, chitChatKind, isFirstInteraction), replyOptions),
      sources: [],
      fallbackTriggered: false
    };
  }

  // 1. Get knowledge chunks for this bot
  const botChunks = await dbGetChunks(bot.id, knowledgeChunks.filter(c => c.botId === bot.id && c.isActive));

  // 2. Semantic retrieval
  const ai = getAIClient();
  const answerStyle: "sales" | "reference" = bot.answerStyle === "reference" ? "reference" : "sales";

  if (!ai) {
    // No API key -> safe fallback
    return {
      text: postProcessBotReply(bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ.", replyOptions),
      sources: [],
      fallbackTriggered: true,
    };
  }

  let topChunks: Array<{ chunk: KnowledgeChunk; score: number }> = [];
  try {
    // Câu follow-up ngắn ("có giá không em") thiếu chủ đề → viết lại thành câu
    // tìm kiếm độc lập dựa trên hội thoại (kể cả lượt bot) để retrieval trúng đoạn.
    let searchText = buildEmbedQuery(query, lastUserText);
    if (isShortFollowUp(query) && history.length > 0) {
      searchText = await condenseFollowUpQuery(ai, query, history);
    }
    const qVec = await embedText(ai, searchText);
    topChunks = rankBySimilarity(qVec, botChunks, TOP_K);
  } catch (e: any) {
    console.warn("[RAG] retrieve failed:", e?.message || e);
  }

  // Sàn mềm: đưa MỌI đoạn vượt sàn cho model TỰ phán đoán liên quan, thay vì chặn
  // cứng bằng ngưỡng cao (câu ngắn điểm thấp vẫn có thể chứa câu trả lời trong đoạn).
  const grounded = topChunks.filter(c => c.score >= RETRIEVE_FLOOR);

  // 3. Insufficient evidence -> low-conf synthesis + fallback flag.
  //    Ở chế độ mở rộng: vẫn trả lời bằng kiến thức chung trong lĩnh vực (không coi là fallback).
  if (grounded.length === 0) {
    const lowConf = await synthesizeAnswer(ai, bot, query, [], { answerStyle, ...synthCtx })
      .catch(() => bot.fallbackMessage || "Dạ thông tin này em chưa có trong tài liệu, em xin phép chuyển nhân viên hỗ trợ mình ạ.");
    return {
      text: postProcessBotReply(lowConf, replyOptions),
      sources: [],
      fallbackTriggered: !expand,
    };
  }

  // 4. Grounded synthesis
  try {
    const answer = await synthesizeAnswer(ai, bot, query, grounded, { answerStyle, ...synthCtx });
    return {
      text: postProcessBotReply(answer, replyOptions),
      sources: grounded.map(g => ({ id: g.chunk.id, name: g.chunk.title, score: Math.min(0.99, g.score) })),
      fallbackTriggered: false,
    };
  } catch (e: any) {
    console.error("[RAG] synthesis failed:", e?.message || e);
    return {
      text: postProcessBotReply(bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ.", replyOptions),
      sources: [],
      fallbackTriggered: true,
    };
  }
}

// REST Endpoint for Playground test chat
app.post("/api/bots/:botId/playgroundChat", async (req, res) => {
  const { text, recentMessages = [], expand = false } = req.body;
  const botId = req.params.botId;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const safeRecentMessages = Array.isArray(recentMessages) ? recentMessages.slice(-8) : [];
    const hasPriorBotReply = safeRecentMessages.some((msg: any) => msg?.sender === "bot");
    const response = await generateRAGAnswer(
      bot,
      text,
      undefined,
      { shouldGreet: !hasPriorBotReply, recentMessages: safeRecentMessages, expand: expand === true }
    );
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/rag/reembed", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const ai = getAIClient();
  if (!ai) return res.status(400).json({ error: "GEMINI_API_KEY chưa cấu hình" });
  const botId = (req.body?.botId as string) || "";
  let all = await dbGetChunks(botId, knowledgeChunks.filter(c => !botId || c.botId === botId));
  all = all.filter(c => c.isActive);
  let done = 0, skipped = 0, failed = 0;
  for (const c of all) {
    const text = `${c.title}\n${c.content}`.trim();
    const h = hashText(text);
    if (c.embedding && c.embeddingHash === h) { skipped++; continue; }
    try {
      const vec = await embedText(ai, text, 2); // bulk re-embed: ít retry hơn
      await dbUpdateChunk(c.id, { embedding: vec, embeddingHash: h } as any);
      const mem = knowledgeChunks.find(x => x.id === c.id);
      if (mem) { mem.embedding = vec; mem.embeddingHash = h; }
      done++;
    } catch (e: any) { failed++; console.warn("[RAG reembed] failed chunk", c.id, e?.message); }
  }
  res.json({ total: all.length, done, skipped, failed });
});

app.post("/api/bots/:botId/rag-eval", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const botId = req.params.botId;
  const { testCases = [] } = req.body as {
    testCases?: Array<{
      id?: string;
      question: string;
      mustInclude?: string[];
      mustNotInclude?: string[];
    }>;
  };
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (!Array.isArray(testCases) || testCases.length === 0) {
    return res.status(400).json({ error: "testCases must be a non-empty array." });
  }

  const results = [];
  for (const testCase of testCases.slice(0, 50)) {
    const question = String(testCase.question || "").trim();
    if (!question) continue;
    const answer = await generateRAGAnswer(bot, question);
    const normalizedAnswer = normalizeSearchText(answer.text);
    const missing = (testCase.mustInclude || []).filter(item => !normalizedAnswer.includes(normalizeSearchText(item)));
    const forbidden = (testCase.mustNotInclude || []).filter(item => normalizedAnswer.includes(normalizeSearchText(item)));
    results.push({
      id: testCase.id || question,
      question,
      passed: missing.length === 0 && forbidden.length === 0 && !answer.fallbackTriggered,
      missing,
      forbidden,
      fallbackTriggered: answer.fallbackTriggered,
      answer: answer.text,
      sources: answer.sources
    });
  }

  const passed = results.filter(item => item.passed).length;
  res.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Math.round((passed / results.length) * 100) : 0,
    results
  });
});

app.post("/api/rag/eval", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const cases: Array<{ botId: string; question: string; mustInclude?: string[] }> = req.body?.cases || [];
  const allBots = await dbGetBots(bots);
  const results = [];
  for (const c of cases) {
    const bot = allBots.find(b => b.id === c.botId);
    if (!bot) { results.push({ ...c, ok: false, reason: "bot_not_found" }); continue; }
    const ans = await generateRAGAnswer(bot, c.question, { fullName: "Eval" }, { shouldGreet: false, recentMessages: [] });
    const text = (ans.text || "").toLowerCase();
    const hit = (c.mustInclude || []).every(s => text.includes(s.toLowerCase()));
    results.push({ question: c.question, ok: hit, fallback: ans.fallbackTriggered, reply: ans.text, sources: ans.sources?.length || 0 });
  }
  const passed = results.filter(r => r.ok).length;
  res.json({ total: results.length, passed, results });
});

function verifyExternalApiSecret(req: express.Request) {
  const configuredSecret = process.env.BOTPRESS_API_SECRET;
  if (!configuredSecret) return true;

  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = (req.headers["x-balabot-secret"] || "").toString().trim();
  return bearer === configuredSecret || headerSecret === configuredSecret;
}

// External AI endpoint for Botpress. Botpress can call this from an Execute Code / HTTP request node.
app.post("/api/integrations/botpress/reply", async (req, res) => {
  if (!verifyExternalApiSecret(req)) {
    return res.status(401).json({ error: "Unauthorized integration request" });
  }

  const {
    botId = "",
    text,
    userId,
    username,
    fullName,
    conversationId
  } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text" });
  }

  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const channelUserId = `botpress:${userId || conversationId || "anonymous"}`;
  const channelUsername = username || `botpress_${userId || conversationId || "user"}`;
  const channelFullName = fullName || "Khách hàng Botpress";

  try {
    let session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === channelUserId);
    if (!session) {
      session = {
        id: "sess-bp-" + Math.random().toString(36).substr(2, 9),
        botId: bot.id,
        telegramUserId: channelUserId,
        telegramUsername: channelUsername,
        telegramFullName: channelFullName,
        lastMessageText: text,
        lastMessageTime: new Date().toISOString(),
        status: "bot_answered",
        internalNotes: "Đến từ kênh Botpress Messenger connector",
        messages: []
      };
      chatSessions.unshift(session);
    }

    const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");
    const userMsg: Message = {
      id: "m-bp-" + Math.random().toString(36).substr(2, 9),
      sender: "user",
      username: channelUsername,
      fullName: channelFullName,
      text,
      timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);

    const gate = await checkUsageGate(bot);
    if (!gate.allowed) {
      return res.json({ reply: BLOCK_MESSAGE, text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true, blocked: true });
    }

    const aiAnswer = await generateRAGAnswer(
      bot,
      text,
      { fullName: channelFullName, username: channelUsername, id: channelUserId },
      { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
    );
    await recordUsageForBot(bot);

    const botMsg: Message = {
      id: "m-bp-bot-" + Math.random().toString(36).substr(2, 9),
      sender: "bot",
      username: bot.name,
      text: aiAnswer.text,
      timestamp: new Date().toISOString(),
      sourcesUsed: aiAnswer.sources,
      fallbackTriggered: aiAnswer.fallbackTriggered
    };
    session.messages.push(botMsg);
    session.lastMessageText = aiAnswer.text;
    session.lastMessageTime = botMsg.timestamp;
    session.status = aiAnswer.fallbackTriggered ? "escalated" : "bot_answered";

    analytics.totalMessages += 2;
    try {
      await dbSaveConversation(session);
    } catch (saveErr) {
      console.warn("[Botpress Integration] Skip Supabase upload, running locally:", saveErr);
    }

    res.json({
      reply: aiAnswer.text,
      text: aiAnswer.text,
      sources: aiAnswer.sources,
      fallbackTriggered: aiAnswer.fallbackTriggered,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error("[Botpress Integration] Reply generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate reply" });
  }
});


// Start custom in-memory file retrain simulation
app.post("/api/bots/:botId/retrain", async (req, res) => {
  const botId = req.params.botId;
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  // Update memory if exists
  const botIdx = bots.findIndex(b => b.id === botId);
  if (botIdx !== -1) {
    bots[botIdx].status = "training";
  }
  await dbUpdateBot(botId, { status: "training" });

  setTimeout(async () => {
    if (botIdx !== -1) {
      bots[botIdx].status = "active";
    }
    await dbUpdateBot(botId, { status: "active" });
  }, 2500);

  res.json({ success: true, message: "Bắt đầu huấn luyện lại cơ sở dữ liệu." });
});


// ================= SCHEDULE / REMINDER SYSTEM =================

let scheduleItems: ScheduleItem[] = [];
let reminderLogs: ReminderLog[] = [];

// Track which schedules have already been triggered this minute to avoid duplicates
const triggeredThisMinute = new Set<string>();
let lastCheckedMinute = "";

async function loadSchedulesFromDB() {
  try {
    const allActive = await dbGetAllActiveSchedules(scheduleItems);
    // Merge DB schedules into in-memory without duplicates
    for (const dbSched of allActive) {
      const existingIdx = scheduleItems.findIndex(s => s.id === dbSched.id);
      if (existingIdx !== -1) {
        scheduleItems[existingIdx] = dbSched;
      } else {
        scheduleItems.push(dbSched);
      }
    }
    console.log(`[Scheduler] Loaded ${allActive.length} active schedules from database.`);
  } catch (err) {
    console.warn("[Scheduler] Failed to load schedules from DB (running with in-memory only):", err);
  }
}

function getVietnamTime(): Date {
  // Create a date object that represents current time in UTC+7
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

function shouldTrigger(schedule: ScheduleItem, vnNow: Date, currentHHMM: string): boolean {
  // Check time match
  if (schedule.time !== currentHHMM) return false;

  // Check date range
  if (schedule.startDate) {
    const start = new Date(schedule.startDate);
    if (vnNow < start) return false;
  }
  if (schedule.endDate) {
    const end = new Date(schedule.endDate);
    if (vnNow > end) return false;
  }

  // Check max triggers
  if (schedule.maxTriggers && schedule.triggerCount >= schedule.maxTriggers) {
    return false;
  }

  const dayOfWeek = vnNow.getDay(); // 0=Sun...6=Sat
  const dayOfMonth = vnNow.getDate();

  switch (schedule.frequency) {
    case 'once':
      return schedule.triggerCount === 0;
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekly':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        return schedule.daysOfWeek.includes(dayOfWeek);
      }
      return dayOfWeek === 1; // Default: Monday
    case 'monthly':
      return dayOfMonth === (schedule.dayOfMonth || 1);
    case 'custom':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        return schedule.daysOfWeek.includes(dayOfWeek);
      }
      return true;
    default:
      return false;
  }
}

async function generateAIReminderContent(schedule: ScheduleItem, bot: BotConfig): Promise<string> {
  const ai = getAIClient();
  if (!ai) return schedule.content;

  const toneMap: Record<string, string> = {
    'motivational': 'Tích cực, tạo động lực, khích lệ, năng lượng cao. Dùng từ ngữ truyền cảm hứng.',
    'strict': 'Nghiêm túc, rõ ràng, nhấn mạnh deadline và trách nhiệm. Không dài dòng.',
    'friendly': 'Thân thiện, gần gũi, vui vẻ như đồng nghiệp nhắc nhau. Thoải mái nhưng chuyên nghiệp.',
    'urgent': 'Khẩn cấp, cấp bách, nhấn mạnh tầm quan trọng và thời hạn. Ngắn gọn, đi thẳng vấn đề.'
  };

  const tone = schedule.aiTone || 'friendly';
  const toneDesc = toneMap[tone] || toneMap['friendly'];

  try {
    const prompt = `Bạn là trợ lý quản lý nhóm. Hãy viết một tin nhắn nhắc nhở ngắn gọn gửi vào group Telegram nhân viên.

Nội dung gốc cần nhắc: "${schedule.content}"
Nhãn lịch: "${schedule.label}"
${schedule.lastContent ? `Nội dung lần nhắc trước (KHÔNG được lặp lại y hệt): "${schedule.lastContent}"` : ''}
Số lần đã nhắc trước đó: ${schedule.triggerCount}

Yêu cầu:
- Viết bằng tiếng Việt thân thiện nhưng chuyên nghiệp
- Tối đa 300 ký tự
- Tone giọng: ${toneDesc}
- KHÔNG dùng emoji, icon, sticker, ký tự đặc biệt
- KHÔNG dùng dấu * hoặc ** markdown
- Mỗi lần nhắc phải có cách diễn đạt khác, không lặp từ lần trước
- Có thể thêm yếu tố thời gian, deadline awareness, khích lệ tùy tone
- Viết thuần văn bản, trả ra duy nhất nội dung tin nhắn`;

    const response = await ai.models.generateContent({
      model: GEN_MODEL,
      contents: prompt,
      config: { temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } }
    });

    const text = (response.text || "").trim();
    if (text.length > 10) return text;
  } catch (err) {
    console.error("[Scheduler] AI content generation failed, using original content:", err);
  }

  return schedule.content;
}

async function sendTelegramReminder(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
      })
    });
    const data = await response.json() as any;
    if (!data.ok) {
      console.error(`[Scheduler] Telegram sendMessage failed for chat ${chatId}:`, data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Scheduler] Telegram sendMessage error for chat ${chatId}:`, err);
    return false;
  }
}

async function executeReminder(schedule: ScheduleItem) {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === schedule.botId);
  if (!bot || !bot.telegramToken) {
    console.warn(`[Scheduler] Bot ${schedule.botId} not found or no Telegram token. Skipping schedule ${schedule.id}.`);
    return;
  }

  // Generate content (AI-enhanced or original)
  let finalContent = schedule.content;
  if (schedule.aiEnhanced) {
    finalContent = await generateAIReminderContent(schedule, bot);
  }

  // Send to all target chat IDs
  let allSent = true;
  const errors: string[] = [];

  for (const chatId of schedule.targetChatIds) {
    const sent = await sendTelegramReminder(bot.telegramToken, chatId, finalContent);
    if (!sent) {
      allSent = false;
      errors.push(`Failed to send to ${chatId}`);
    }
  }

  // Create reminder log
  const log: ReminderLog = {
    id: "rlog-" + Math.random().toString(36).substr(2, 9),
    scheduleId: schedule.id,
    botId: schedule.botId,
    triggeredAt: new Date().toISOString(),
    content: finalContent,
    targetChatIds: schedule.targetChatIds,
    status: allSent ? 'sent' : 'failed',
    errorMessage: errors.length > 0 ? errors.join('; ') : undefined
  };
  reminderLogs.push(log);
  await dbSaveReminderLog(log);

  // Update schedule metadata
  schedule.triggerCount += 1;
  schedule.lastTriggeredAt = new Date().toISOString();
  schedule.lastContent = finalContent;

  // If 'once', mark as completed
  if (schedule.frequency === 'once') {
    schedule.status = 'completed';
  }
  // If max triggers reached, mark as completed
  if (schedule.maxTriggers && schedule.triggerCount >= schedule.maxTriggers) {
    schedule.status = 'completed';
  }

  await dbUpdateSchedule(schedule.id, {
    triggerCount: schedule.triggerCount,
    lastTriggeredAt: schedule.lastTriggeredAt,
    lastContent: schedule.lastContent,
    status: schedule.status
  });

  console.log(`[Scheduler] Triggered schedule "${schedule.label}" (${schedule.id}) → ${schedule.targetChatIds.length} targets. Status: ${allSent ? 'OK' : 'PARTIAL FAIL'}`);
}

function startSchedulerEngine() {
  console.log("[Scheduler] Engine started. Checking every 60 seconds (UTC+7).");

  setInterval(async () => {
    try {
      const vnNow = getVietnamTime();
      const currentHHMM = `${String(vnNow.getHours()).padStart(2, '0')}:${String(vnNow.getMinutes()).padStart(2, '0')}`;

      // Reset triggered set when minute changes
      if (currentHHMM !== lastCheckedMinute) {
        triggeredThisMinute.clear();
        lastCheckedMinute = currentHHMM;
      }

      const activeSchedules = scheduleItems.filter(s => s.status === 'active');
      for (const schedule of activeSchedules) {
        if (triggeredThisMinute.has(schedule.id)) continue;
        if (!shouldTrigger(schedule, vnNow, currentHHMM)) continue;

        triggeredThisMinute.add(schedule.id);
        await executeReminder(schedule);
      }
    } catch (err) {
      console.error("[Scheduler] Engine tick error:", err);
    }
  }, 60_000);
}

// File parser helpers
function parseCSVSchedules(csvText: string, botId: string): { schedules: ScheduleItem[]; errors: string[] } {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  const schedules: ScheduleItem[] = [];
  const errors: string[] = [];

  // Skip header line if detected
  const firstLine = lines[0]?.toLowerCase() || "";
  const startIdx = (firstLine.includes('giờ') || firstLine.includes('gio') || firstLine.includes('time') || firstLine.includes('nội dung') || firstLine.includes('content')) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) {
      errors.push(`Dòng ${i + 1}: Thiếu dữ liệu (cần ít nhất Giờ và Nội dung)`);
      continue;
    }

    const rawTime = parts[0];
    const content = parts[1];
    const frequency = (parts[2] || 'daily').toLowerCase().trim();
    const target = parts[3] || '';
    const label = parts[4] || content.substring(0, 40);

    // Validate time format
    const timeMatch = rawTime.match(/^(\d{1,2})[h:](\d{2})$/);
    if (!timeMatch) {
      errors.push(`Dòng ${i + 1}: Giờ "${rawTime}" không hợp lệ (dùng format HH:mm hoặc Hhmm, ví dụ 08:30 hoặc 8h30)`);
      continue;
    }
    const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;

    const validFrequencies = ['once', 'daily', 'weekly', 'monthly', 'weekdays', 'custom'];
    const freq = validFrequencies.includes(frequency) ? frequency as any : 'daily';

    schedules.push({
      id: "sched-" + Math.random().toString(36).substr(2, 9),
      botId,
      time,
      content,
      aiEnhanced: false,
      targetType: 'group',
      targetChatIds: target ? target.split(/[|&]/).map(t => t.trim()) : [],
      targetNames: [],
      frequency: freq,
      status: 'active',
      label,
      createdAt: new Date().toISOString(),
      triggerCount: 0
    });
  }

  return { schedules, errors };
}

function parseJSONSchedules(jsonText: string, botId: string): { schedules: ScheduleItem[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { schedules: [], errors: ["JSON không hợp lệ: " + (e as Error).message] };
  }

  const items = Array.isArray(parsed) ? parsed : (parsed.schedules || parsed.items || [parsed]);
  const schedules: ScheduleItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.time || !item.content) {
      errors.push(`Mục ${i + 1}: Thiếu trường 'time' hoặc 'content'`);
      continue;
    }

    schedules.push({
      id: "sched-" + Math.random().toString(36).substr(2, 9),
      botId,
      time: item.time,
      content: item.content,
      daysOfWeek: item.daysOfWeek || item.days_of_week,
      dayOfMonth: item.dayOfMonth || item.day_of_month,
      aiEnhanced: item.aiEnhanced || item.ai_enhanced || false,
      aiTone: item.aiTone || item.ai_tone || 'friendly',
      targetType: item.targetType || item.target_type || 'group',
      targetChatIds: Array.isArray(item.targetChatIds || item.target_chat_ids || item.targets) ? (item.targetChatIds || item.target_chat_ids || item.targets) : [],
      targetNames: Array.isArray(item.targetNames || item.target_names) ? (item.targetNames || item.target_names) : [],
      frequency: item.frequency || 'daily',
      status: 'active',
      label: item.label || item.name || item.content.substring(0, 40),
      category: item.category,
      startDate: item.startDate || item.start_date,
      endDate: item.endDate || item.end_date,
      maxTriggers: item.maxTriggers || item.max_triggers,
      createdAt: new Date().toISOString(),
      triggerCount: 0
    });
  }

  return { schedules, errors };
}

async function parseTextWithAI(text: string, botId: string): Promise<{ schedules: ScheduleItem[]; errors: string[] }> {
  const ai = getAIClient();
  if (!ai) {
    return { schedules: [], errors: ["AI service không hoạt động. Vui lòng dùng format CSV hoặc JSON."] };
  }

  try {
    const prompt = `Phân tích đoạn văn bản quy trình / lịch nhắc sau đây và trích xuất thành danh sách lịch nhắc có cấu trúc JSON.

Đoạn văn bản:
"""${text}"""

Yêu cầu trả về JSON array, mỗi phần tử có các trường:
- time: string (HH:mm, ví dụ "08:30")
- content: string (nội dung cần nhắc)
- frequency: string ("once" | "daily" | "weekly" | "monthly" | "weekdays")
- label: string (tên ngắn gọn cho lịch nhắc)
- daysOfWeek: number[] (optional, 0=CN, 1=T2...6=T7, chỉ khi frequency là weekly)
- category: string (optional, "meeting" | "task" | "report" | "custom")

Ví dụ input: "Nhắc họp sáng lúc 8h30 mỗi ngày. Báo cáo doanh thu vào 17h chiều thứ 6 hàng tuần."
Ví dụ output:
[{"time":"08:30","content":"Họp sáng đầu ngày","frequency":"daily","label":"Họp sáng","category":"meeting"},{"time":"17:00","content":"Nộp báo cáo doanh thu","frequency":"weekly","label":"Báo cáo doanh thu T6","daysOfWeek":[5],"category":"report"}]

Chỉ trả về JSON array thuần, KHÔNG bọc trong markdown code block.`;

    const response = await ai.models.generateContent({
      model: GEN_MODEL,
      contents: prompt,
      config: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } }
    });

    let resultText = (response.text || "").trim();
    // Strip markdown code block if present
    if (resultText.startsWith("```")) {
      resultText = resultText.replace(/```json|```/g, "").trim();
    }

    const parsedItems = JSON.parse(resultText);
    const items = Array.isArray(parsedItems) ? parsedItems : [parsedItems];

    const schedules: ScheduleItem[] = items.map((item: any) => ({
      id: "sched-" + Math.random().toString(36).substr(2, 9),
      botId,
      time: item.time || "08:00",
      content: item.content || "",
      daysOfWeek: item.daysOfWeek,
      aiEnhanced: false,
      targetType: 'group' as const,
      targetChatIds: [],
      targetNames: [],
      frequency: item.frequency || 'daily',
      status: 'active' as const,
      label: item.label || item.content?.substring(0, 40) || "Lịch nhắc",
      category: item.category,
      createdAt: new Date().toISOString(),
      triggerCount: 0
    }));

    return { schedules, errors: [] };
  } catch (err: any) {
    console.error("[Scheduler] AI text parse failed:", err);
    return { schedules: [], errors: ["AI không thể phân tích đoạn văn bản: " + (err.message || String(err))] };
  }
}

// -------- SCHEDULE API ENDPOINTS --------

// GET schedules for a bot
app.get("/api/bots/:botId/schedules", async (req, res) => {
  const botId = req.params.botId;
  const botSchedules = await dbGetSchedules(botId, scheduleItems.filter(s => s.botId === botId));
  res.json(botSchedules);
});

// CREATE a schedule manually (chat tay trên web)
app.post("/api/bots/:botId/schedules", async (req, res) => {
  const botId = req.params.botId;
  const body = req.body;

  const newSchedule: ScheduleItem = {
    id: "sched-" + Math.random().toString(36).substr(2, 9),
    botId,
    time: body.time || "08:00",
    daysOfWeek: body.daysOfWeek,
    dayOfMonth: body.dayOfMonth,
    startDate: body.startDate,
    endDate: body.endDate,
    content: body.content || "",
    aiEnhanced: body.aiEnhanced || false,
    aiTone: body.aiTone || 'friendly',
    targetType: body.targetType || 'group',
    targetChatIds: body.targetChatIds || [],
    targetNames: body.targetNames || [],
    frequency: body.frequency || 'daily',
    status: 'active',
    label: body.label || body.content?.substring(0, 40) || "Lịch nhắc mới",
    category: body.category,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
    maxTriggers: body.maxTriggers
  };

  scheduleItems.push(newSchedule);
  await dbSaveSchedule(newSchedule);

  res.status(201).json(newSchedule);
});

// UPLOAD file (text/excel/csv) → batch create schedules
app.post("/api/bots/:botId/schedules/upload", async (req, res) => {
  const botId = req.params.botId;
  const { fileName, fileData, fileType } = req.body;

  if (!fileName || !fileData) {
    return res.status(400).json({ error: "Tên tệp và dữ liệu là bắt buộc." });
  }

  try {
    const buffer = Buffer.from(fileData, "base64");
    const textContent = buffer.toString("utf-8");
    const lowerName = fileName.toLowerCase();

    let result: { schedules: ScheduleItem[]; errors: string[] };

    if (lowerName.endsWith(".csv")) {
      result = parseCSVSchedules(textContent, botId);
    } else if (lowerName.endsWith(".json")) {
      result = parseJSONSchedules(textContent, botId);
    } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".text")) {
      result = await parseTextWithAI(textContent, botId);
    } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      // For Excel files, try to parse as CSV (basic tab/comma separated extraction)
      // Real Excel parsing would require a library like xlsx
      result = await parseTextWithAI(textContent, botId);
      if (result.schedules.length === 0) {
        result.errors.push("File Excel được xử lý bằng AI parse. Để kết quả tốt nhất, nên dùng format CSV hoặc TXT.");
      }
    } else {
      // Unknown format → AI parse
      result = await parseTextWithAI(textContent, botId);
    }

    // Save all parsed schedules
    for (const sched of result.schedules) {
      scheduleItems.push(sched);
      await dbSaveSchedule(sched);
    }

    const uploadResult: ScheduleUploadResult = {
      success: result.schedules.length > 0,
      totalParsed: result.schedules.length,
      schedules: result.schedules,
      errors: result.errors.length > 0 ? result.errors : undefined
    };

    res.status(201).json(uploadResult);
  } catch (err: any) {
    console.error("[Scheduler] Upload parse error:", err);
    res.status(500).json({ error: "Lỗi xử lý tệp: " + (err.message || String(err)) });
  }
});

// AI parse free text → schedules
app.post("/api/bots/:botId/schedules/parse-text", async (req, res) => {
  const botId = req.params.botId;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Nội dung văn bản là bắt buộc." });
  }

  const result = await parseTextWithAI(text, botId);

  // Save parsed schedules
  for (const sched of result.schedules) {
    scheduleItems.push(sched);
    await dbSaveSchedule(sched);
  }

  res.json({
    success: result.schedules.length > 0,
    totalParsed: result.schedules.length,
    schedules: result.schedules,
    errors: result.errors.length > 0 ? result.errors : undefined
  });
});

// UPDATE a schedule
app.put("/api/schedules/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const idx = scheduleItems.findIndex(s => s.id === id);

  if (idx !== -1) {
    scheduleItems[idx] = { ...scheduleItems[idx], ...updates };
  }
  await dbUpdateSchedule(id, updates);

  res.json(idx !== -1 ? scheduleItems[idx] : updates);
});

// TOGGLE a schedule (active/paused)
app.put("/api/schedules/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const idx = scheduleItems.findIndex(s => s.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: "Không tìm thấy lịch nhắc." });
  }

  const newStatus = scheduleItems[idx].status === 'active' ? 'paused' : 'active';
  scheduleItems[idx].status = newStatus;
  await dbUpdateSchedule(id, { status: newStatus });

  res.json(scheduleItems[idx]);
});

// DELETE a schedule
app.delete("/api/schedules/:id", async (req, res) => {
  const { id } = req.params;
  scheduleItems = scheduleItems.filter(s => s.id !== id);
  reminderLogs = reminderLogs.filter(l => l.scheduleId !== id);
  await dbDeleteSchedule(id);
  res.json({ success: true, message: `Đã xóa lịch nhắc ${id} thành công.` });
});

// GET reminder logs for a bot
app.get("/api/bots/:botId/reminder-logs", async (req, res) => {
  const botId = req.params.botId;
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = await dbGetReminderLogs(botId, reminderLogs.filter(l => l.botId === botId), limit);
  res.json(logs);
});

// TRIGGER NOW - manually trigger a schedule immediately
app.post("/api/schedules/:id/trigger-now", async (req, res) => {
  const { id } = req.params;
  const schedule = scheduleItems.find(s => s.id === id);

  if (!schedule) {
    return res.status(404).json({ error: "Không tìm thấy lịch nhắc." });
  }

  try {
    await executeReminder(schedule);
    res.json({
      success: true,
      message: `Đã gửi nhắc nhở "${schedule.label}" ngay lập tức.`,
      schedule
    });
  } catch (err: any) {
    res.status(500).json({ error: "Gửi nhắc nhở thất bại: " + (err.message || String(err)) });
  }
});


// ================= STARTUP SUPABASE VERIFICATION =================
async function initializeSupabaseOnStartup() {
  const config = getSupabaseConfig();
  if (config.isConfigured) {
    const status = await testConnection();
    if (status.connected) {
      console.log(`[Startup] ✅ Supabase connected successfully: ${config.url}`);
      console.log(`[Startup] ✅ Key: ${config.keyMasked}`);
      if (status.missingTables.length > 0) {
        console.warn(`[Startup] ⚠️ Missing tables: ${status.missingTables.join(', ')}`);
      } else {
        console.log(`[Startup] ✅ All database tables are ready`);
      }
    } else {
      console.error(`[Startup] ❌ Supabase connection FAILED: ${status.message}`);
    }
  } else {
    console.warn(`[Startup] ⚠️ Supabase NOT configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables for persistent data.`);
    console.warn(`[Startup] ⚠️ Without Supabase, ALL user data will be LOST on restart!`);
  }
}

// Serve static/vite assets as required by environment
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`BalaBot Server running on http://0.0.0.0:${PORT}`);

    // Verify Supabase connection on startup
    await initializeSupabaseOnStartup();

    // Initialize Scheduler Engine
    await loadSchedulesFromDB();
    startSchedulerEngine();

    // Nạp registry nhóm Telegram đã bắt được (để UI đặt lịch chọn nhóm sau restart).
    try {
      const dbGroups = await dbGetTelegramGroups([]);
      for (const g of dbGroups) {
        if (!telegramGroups.some(x => x.id === g.id)) telegramGroups.push(g);
      }
      console.log(`[Telegram] Loaded ${telegramGroups.length} group(s) from registry.`);
    } catch (err) {
      console.warn("[Telegram] Failed to load group registry:", err);
    }

    // Khoi dong Zalo Group Bot (no-op neu ZALO_GROUP_BOT_ENABLED != true).
    await initZaloGroupBot({
      generateRAGAnswer,
      postProcessBotReply,
      getBots: () => dbGetBots(bots),
      chatSessions,
      saveConversation: dbSaveConversation,
      analytics,
      checkUsage: async (bot) => ({ allowed: (await checkUsageGate(bot)).allowed }),
      recordUsage: recordUsageForBot,
      blockMessage: BLOCK_MESSAGE,
      resolveUserConfig: (ownerEmail) => getSavedSupabaseConfigForEmail(ownerEmail),
      withUserScope: (ownerEmail, fn) =>
        withSupabaseConfig(getSavedSupabaseConfigForEmail(ownerEmail), fn),
    });
  });
}

startServer();
