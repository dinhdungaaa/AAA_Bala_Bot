import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BotConfig, KnowledgeSource, KnowledgeChunk, ChatSession, FAQItem, WorkspaceUser, ScheduleItem, ReminderLog } from './src/types';
import { AsyncLocalStorage } from 'async_hooks';

let _supabaseClient: SupabaseClient | null = null;
const requestConfigStorage = new AsyncLocalStorage<{ url: string; key: string }>();
const scopedClients = new Map<string, SupabaseClient>();

// Keep dynamic configurations in memory if the user overrides them from UI
let dynamicConfig = {
  url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  key: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim()
};

export function updateDynamicConfig(url: string, key: string) {
  dynamicConfig.url = url;
  dynamicConfig.key = key;
  _supabaseClient = null; // Forces re-initialization
}

export function withSupabaseConfig<T>(config: { url: string; key: string } | null, fn: () => T): T {
  if (!config?.url || !config?.key) return fn();
  return requestConfigStorage.run({ url: config.url, key: config.key }, fn);
}

export function getSupabaseConfig() {
  const requestConfig = requestConfigStorage.getStore();
  const url = (requestConfig?.url || dynamicConfig.url || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (requestConfig?.key || dynamicConfig.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  return {
    url,
    key,
    keyMasked: key ? `${key.substring(0, 10)}...${key.substring(key.length - 4)}` : "",
    isConfigured: !!(url && key)
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  const requestConfig = requestConfigStorage.getStore();
  if (requestConfig?.url && requestConfig?.key) {
    const cacheKey = `${requestConfig.url}|${requestConfig.key}`;
    const cached = scopedClients.get(cacheKey);
    if (cached) return cached;
    try {
      const client = createClient(requestConfig.url, requestConfig.key, {
        auth: {
          persistSession: false
        }
      });
      scopedClients.set(cacheKey, client);
      return client;
    } catch (e) {
      console.error("Failed to initialize request-scoped Supabase client:", e);
      return null;
    }
  }

  if (_supabaseClient) return _supabaseClient;
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    return null;
  }
  try {
    _supabaseClient = createClient(config.url, config.key, {
      auth: {
        persistSession: false
      }
    });
    return _supabaseClient;
  } catch (e: any) {
    console.error("Failed to initialize Supabase client:", e);
    return null;
  }
}

// Check connection to Supabase and see if tables exist
export async function testConnection(): Promise<{
  connected: boolean;
  message: string;
  missingTables: string[];
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { connected: false, message: "Chưa cấu hình SUPABASE_URL hoặc API Key.", missingTables: [] };
  }

  const tablesToCheck = ['bots', 'knowledge_sources', 'knowledge_chunks', 'chat_sessions', 'faq_items'];
  const missingTables: string[] = [];

  try {
    // Try to query bots
    const { error: botsError } = await client.from('bots').select('id').limit(1);
    if (botsError && (botsError.message.includes('relation') || botsError.code === 'PGRST116' || botsError.code === '42P01')) {
      missingTables.push('bots');
    }

    const { error: srcError } = await client.from('knowledge_sources').select('id').limit(1);
    if (srcError && (srcError.message.includes('relation') || srcError.code === 'PGRST116' || srcError.code === '42P01')) {
      missingTables.push('knowledge_sources');
    }

    const { error: chkError } = await client.from('knowledge_chunks').select('id').limit(1);
    if (chkError && (chkError.message.includes('relation') || chkError.code === 'PGRST116' || chkError.code === '42P01')) {
      missingTables.push('knowledge_chunks');
    }

    const { error: sessError } = await client.from('chat_sessions').select('id').limit(1);
    if (sessError && (sessError.message.includes('relation') || sessError.code === 'PGRST116' || sessError.code === '42P01')) {
      missingTables.push('chat_sessions');
    }

    const { error: faqError } = await client.from('faq_items').select('id').limit(1);
    if (faqError && (faqError.message.includes('relation') || faqError.code === 'PGRST116' || faqError.code === '42P01')) {
      missingTables.push('faq_items');
    }

    if (missingTables.length === tablesToCheck.length) {
      return {
        connected: true,
        message: "Kết nối thành công đến Supabase! Tuy nhiên chưa tạo các bảng dữ liệu. Vui lòng bấm 'Khởi tạo Bảng' hoặc chạy SQL Schema.",
        missingTables
      };
    } else if (missingTables.length > 0) {
      return {
        connected: true,
        message: `Kết nối thành công! Thiếu các bảng: ${missingTables.join(', ')}.`,
        missingTables
      };
    }

    return {
      connected: true,
      message: "Kết nối thành công và các bảng dữ liệu đã sẵn sàng trên Supabase! ✨",
      missingTables: []
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Lỗi kết nối: ${err.message || err}`,
      missingTables: []
    };
  }
}

// Generate the beautiful SQL schema for prompt / display in UI
export function getSQLSchema(): string {
  return `-- SQL SCRIPT CHO SUPABASE - SAAS BALABOT CHĂM SÓC KHÁCH HÀNG TELEGRAM 2026
-- Vui lòng copy đoạn script này và dán vào tab SQL Editor trên Supabase Dashboard

-- 1. BẢNG BOTS CẤU HÌNH
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  "userId" TEXT,
  name TEXT NOT NULL,
  description TEXT,
  field TEXT,
  language TEXT DEFAULT 'vi',
  tone TEXT DEFAULT 'friendly',
  "allowPricing" BOOLEAN DEFAULT TRUE,
  "allowProductConsulting" BOOLEAN DEFAULT TRUE,
  "escalationTrigger" TEXT DEFAULT 'fallback_limit',
  "telegramToken" TEXT,
  "telegramStatus" TEXT DEFAULT 'not_connected',
  "telegramBotUsername" TEXT,
  "telegramWebhookActive" BOOLEAN DEFAULT FALSE,
  "welcomeMessage" TEXT,
  "fallbackMessage" TEXT,
  "fallbackEmail" TEXT,
  "fallbackPhone" TEXT,
  "fallbackZalo" TEXT,
  "fallbackWebsite" TEXT,
  "limitToKnowledge" BOOLEAN DEFAULT TRUE,
  "restrictedTopics" TEXT,
  "workingHours" TEXT,
  status TEXT DEFAULT 'needs_token',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BẢNG NGUỒN TRI THỨC (KNOWLEDGE SOURCES)
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  "botId" TEXT REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  "contentSummary" TEXT,
  "fullText" TEXT,
  category TEXT,
  status TEXT DEFAULT 'processing',
  "errorMessage" TEXT,
  "fileSize" TEXT,
  "urlCount" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG PHÂN MẢNH KHO TRI THỨC (KNOWLEDGE CHUNKS)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  "botId" TEXT REFERENCES bots(id) ON DELETE CASCADE,
  "sourceId" TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  "isActive" BOOLEAN DEFAULT TRUE
);

-- 4. BẢNG CHÂN DUNG KHÁCH HÀNG & LỊCH SỬ CHAT (CHAT SESSIONS)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  "botId" TEXT REFERENCES bots(id) ON DELETE CASCADE,
  "telegramUserId" TEXT,
  "telegramUsername" TEXT,
  "telegramFullName" TEXT,
  "lastMessageText" TEXT,
  "lastMessageTime" TIMESTAMPTZ,
  status TEXT DEFAULT 'bot_answered',
  "internalNotes" TEXT,
  messages JSONB DEFAULT '[]'::jsonb
);

-- 5. BẢNG FAQ (CÂU HỎI THƯỜNG GẶP)
CREATE TABLE IF NOT EXISTS faq_items (
  id TEXT PRIMARY KEY,
  "botId" TEXT REFERENCES bots(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  "useCount" INTEGER DEFAULT 0
);

-- BẬT CHÍNH SÁCH BẢO MẬT (Để đơn giản cho Client khi test, tạm thời tắt RLS hoặc cấp quyền)
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;

-- Xóa các policy cũ nếu đã tồn tại để tránh lỗi khi chạy lại tập lệnh SQL nhiều lần
DROP POLICY IF EXISTS "Allow public read" ON bots;
DROP POLICY IF EXISTS "Allow public insert" ON bots;
DROP POLICY IF EXISTS "Allow public update" ON bots;
DROP POLICY IF EXISTS "Allow public delete" ON bots;

DROP POLICY IF EXISTS "Allow public read src" ON knowledge_sources;
DROP POLICY IF EXISTS "Allow public insert src" ON knowledge_sources;
DROP POLICY IF EXISTS "Allow public delete src" ON knowledge_sources;

DROP POLICY IF EXISTS "Allow public read chk" ON knowledge_chunks;
DROP POLICY IF EXISTS "Allow public insert chk" ON knowledge_chunks;
DROP POLICY IF EXISTS "Allow public update chk" ON knowledge_chunks;
DROP POLICY IF EXISTS "Allow public delete chk" ON knowledge_chunks;

DROP POLICY IF EXISTS "Allow public read sess" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public insert sess" ON chat_sessions;
DROP POLICY IF EXISTS "Allow public update sess" ON chat_sessions;

DROP POLICY IF EXISTS "Allow public read faq" ON faq_items;
DROP POLICY IF EXISTS "Allow public insert faq" ON faq_items;
DROP POLICY IF EXISTS "Allow public update faq" ON faq_items;
DROP POLICY IF EXISTS "Allow public delete faq" ON faq_items;

-- Tạo các policy cho phép FULL quyền nếu dùng API Key (hoặc ẩn RLS cho dev nhanh)
CREATE POLICY "Allow public read" ON bots FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON bots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON bots FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON bots FOR DELETE USING (true);

CREATE POLICY "Allow public read src" ON knowledge_sources FOR SELECT USING (true);
CREATE POLICY "Allow public insert src" ON knowledge_sources FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete src" ON knowledge_sources FOR DELETE USING (true);

CREATE POLICY "Allow public read chk" ON knowledge_chunks FOR SELECT USING (true);
CREATE POLICY "Allow public insert chk" ON knowledge_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update chk" ON knowledge_chunks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete chk" ON knowledge_chunks FOR DELETE USING (true);

CREATE POLICY "Allow public read sess" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert sess" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sess" ON chat_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public read faq" ON faq_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert faq" ON faq_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update faq" ON faq_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete faq" ON faq_items FOR DELETE USING (true);

-- =========================================================================
-- 6. HƯỚNG DẪN CẤU HÌNH SUPABASE STORAGE (POLICY CHO PRODUCTION MODE BUCKET)
-- Chạy đoạn SQL này để cho phép tải lên, xem, và xóa file trong bucket "knowledge-sources"
-- =========================================================================

-- Cho phép đọc tập tin công khai từ bucket "knowledge-sources"
CREATE POLICY "Cho phép đọc files công khai" 
ON storage.objects FOR SELECT TO public 
USING (bucket_id = 'knowledge-sources');

-- Cho phép upload tập tin vào bucket "knowledge-sources"
CREATE POLICY "Cho phép tải lên files" 
ON storage.objects FOR INSERT TO public 
WITH CHECK (bucket_id = 'knowledge-sources');

-- Cho phép xóa tập tin khỏi bucket "knowledge-sources"
CREATE POLICY "Cho phép xóa files" 
ON storage.objects FOR DELETE TO public 
USING (bucket_id = 'knowledge-sources');

-- =========================================================================
-- 7. BẢNG LỊCH NHẮC TỰ ĐỘNG (SCHEDULES)
-- =========================================================================
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  "botId" TEXT REFERENCES bots(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  "daysOfWeek" INTEGER[],
  "dayOfMonth" INTEGER,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  content TEXT NOT NULL,
  "aiEnhanced" BOOLEAN DEFAULT FALSE,
  "aiTone" TEXT DEFAULT 'friendly',
  "targetType" TEXT DEFAULT 'group',
  "targetChatIds" TEXT[],
  "targetNames" TEXT[],
  frequency TEXT DEFAULT 'daily',
  status TEXT DEFAULT 'active',
  label TEXT NOT NULL,
  category TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "lastTriggeredAt" TIMESTAMPTZ,
  "lastContent" TEXT,
  "triggerCount" INTEGER DEFAULT 0,
  "maxTriggers" INTEGER
);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read schedules" ON schedules;
DROP POLICY IF EXISTS "Allow public insert schedules" ON schedules;
DROP POLICY IF EXISTS "Allow public update schedules" ON schedules;
DROP POLICY IF EXISTS "Allow public delete schedules" ON schedules;
CREATE POLICY "Allow public read schedules" ON schedules FOR SELECT USING (true);
CREATE POLICY "Allow public insert schedules" ON schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update schedules" ON schedules FOR UPDATE USING (true);
CREATE POLICY "Allow public delete schedules" ON schedules FOR DELETE USING (true);

-- =========================================================================
-- 8. BẢNG LOG NHẮC NHỞ (REMINDER LOGS)
-- =========================================================================
CREATE TABLE IF NOT EXISTS reminder_logs (
  id TEXT PRIMARY KEY,
  "scheduleId" TEXT REFERENCES schedules(id) ON DELETE CASCADE,
  "botId" TEXT,
  "triggeredAt" TIMESTAMPTZ DEFAULT NOW(),
  content TEXT,
  "targetChatIds" TEXT[],
  status TEXT DEFAULT 'sent',
  "errorMessage" TEXT
);

ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read rlogs" ON reminder_logs;
DROP POLICY IF EXISTS "Allow public insert rlogs" ON reminder_logs;
CREATE POLICY "Allow public read rlogs" ON reminder_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert rlogs" ON reminder_logs FOR INSERT WITH CHECK (true);

-- =========================================================================
-- 9. BẢNG CẤU HÌNH SUPABASE CỦA TỪNG USER (PERSISTENT ACROSS RESTARTS)
-- Lưu Supabase URL + Key cho từng user để không bị mất khi server restart/deploy
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_configs (
  email TEXT PRIMARY KEY,
  supabase_url TEXT NOT NULL,
  supabase_key TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read user_configs" ON user_configs;
DROP POLICY IF EXISTS "Allow public insert user_configs" ON user_configs;
DROP POLICY IF EXISTS "Allow public update user_configs" ON user_configs;
CREATE POLICY "Allow public read user_configs" ON user_configs FOR SELECT USING (true);
CREATE POLICY "Allow public insert user_configs" ON user_configs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update user_configs" ON user_configs FOR UPDATE USING (true);
`;
}

// Push local database state to Supabase when user triggers dynamic provisioning
export async function syncLocalToSupabase(data: {
  bots: BotConfig[];
  sources: KnowledgeSource[];
  chunks: KnowledgeChunk[];
  sessions: ChatSession[];
  faqs: FAQItem[];
}): Promise<{ success: boolean; message: string; counts: any }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, message: "Client Supabase chưa được cài đặt đúng.", counts: {} };

  const counts = { bots: 0, sources: 0, chunks: 0, sessions: 0, faqs: 0 };

  try {
    // 1. Bots
    if (data.bots.length > 0) {
      const { error } = await client.from('bots').upsert(data.bots);
      if (error) throw new Error(`Lỗi đồng bộ bots: ${error.message}`);
      counts.bots = data.bots.length;
    }

    // 2. Sources
    if (data.sources.length > 0) {
      const { error } = await client.from('knowledge_sources').upsert(data.sources);
      if (error) throw new Error(`Lỗi đồng bộ sources: ${error.message}`);
      counts.sources = data.sources.length;
    }

    // 3. Chunks
    if (data.chunks.length > 0) {
      // transform chunks to match database schema (tags array)
      const formattedChunks = data.chunks.map(c => ({
        id: c.id,
        botId: c.botId,
        sourceId: c.sourceId,
        title: c.title,
        content: c.content,
        category: c.category,
        tags: c.tags,
        isActive: c.isActive
      }));
      const { error } = await client.from('knowledge_chunks').upsert(formattedChunks);
      if (error) throw new Error(`Lỗi đồng bộ chunks: ${error.message}`);
      counts.chunks = data.chunks.length;
    }

    // 4. Chat Sessions
    if (data.sessions.length > 0) {
      const formattedSessions = data.sessions.map(s => ({
        id: s.id,
        botId: s.botId,
        telegramUserId: s.telegramUserId,
        telegramUsername: s.telegramUsername,
        telegramFullName: s.telegramFullName,
        lastMessageText: s.lastMessageText,
        lastMessageTime: s.lastMessageTime,
        status: s.status,
        internalNotes: s.internalNotes,
        messages: s.messages // is JSONB
      }));
      const { error } = await client.from('chat_sessions').upsert(formattedSessions);
      if (error) throw new Error(`Lỗi đồng bộ chat_sessions: ${error.message}`);
      counts.sessions = data.sessions.length;
    }

    // 5. FAQ Items
    if (data.faqs.length > 0) {
      const { error } = await client.from('faq_items').upsert(data.faqs);
      if (error) throw new Error(`Lỗi đồng bộ faq_items: ${error.message}`);
      counts.faqs = data.faqs.length;
    }

    return {
      success: true,
      message: "Đồng bộ thành công dữ liệu mẫu lên Supabase của bạn! 🎉",
      counts
    };
  } catch (err: any) {
    console.error("Supabase sync error:", err);
    return {
      success: false,
      message: `Đồng bộ thất bại: ${err.message || err}`,
      counts
    };
  }
}

// SAFE WRAPPING CRUD OPERATIONS (falls back to local arrays if Supabase error/missing tables)

// Bots CRUD
export async function dbGetBots(localFallback: BotConfig[]): Promise<BotConfig[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('bots').select('*').order('createdAt', { ascending: false });
    if (error) {
      console.warn("Supabase dbGetBots select error, using local fallback:", error);
      return localFallback;
    }
    const dbBots = data as BotConfig[];
    
    // Merge database bots with local fallback bots.
    // If a bot exists in local fallback, preserve fields that may be missing in DB schema (like userId)
    const merged = dbBots.map(dbBot => {
      const localBot = localFallback.find(b => b.id === dbBot.id);
      if (localBot) {
        return {
          ...localBot,
          ...dbBot,
          userId: dbBot.userId || localBot.userId // PRESERVE userId from local fallback if missing in DB!
        };
      }
      return dbBot;
    });

    for (const localBot of localFallback) {
      if (!merged.some(b => b.id === localBot.id)) {
        merged.push(localBot);
      }
    }
    return merged;
  } catch (err: any) {
    console.warn("Supabase dbGetBots failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbSaveBot(bot: BotConfig): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('bots').insert(bot);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveBot failed:", err);
    return false;
  }
}

export async function dbUpdateBot(id: string, updates: Partial<BotConfig>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('bots').update(updates).eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbUpdateBot failed:", err);
    return false;
  }
}

export async function dbDeleteBot(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('bots').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteBot failed:", err);
    return false;
  }
}

// Sources CRUD
export async function dbGetSources(botId: string, localFallback: KnowledgeSource[]): Promise<KnowledgeSource[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('knowledge_sources').select('*').eq('botId', botId).order('createdAt', { ascending: false });
    if (error) {
      console.warn("Supabase dbGetSources select error, using local fallback:", error);
      return localFallback;
    }
    const dbSources = data as KnowledgeSource[];
    
    // Merge database sources with local fallback sources to resist temporary sync lags or DB insertion issues
    const merged = [...dbSources];
    for (const localSource of localFallback) {
      if (!merged.some(s => s.id === localSource.id)) {
        merged.push(localSource);
      }
    }
    
    // Sort sources by createdAt descending (newest first)
    merged.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return merged;
  } catch (err: any) {
    console.warn("Supabase dbGetSources failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbSaveSource(source: KnowledgeSource): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('knowledge_sources').insert(source);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveSource failed:", err);
    return false;
  }
}

export async function dbDeleteSource(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('knowledge_sources').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteSource failed:", err);
    return false;
  }
}

// Chunks CRUD
export async function dbGetChunks(botId: string, localFallback: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('knowledge_chunks').select('*').eq('botId', botId);
    if (error) {
      console.warn("Supabase dbGetChunks select error, using local fallback:", error);
      return localFallback;
    }
    const dbChunks = (data as any[]).map(c => ({
      ...c,
      tags: Array.isArray(c.tags) ? c.tags : []
    })) as KnowledgeChunk[];

    // Merge database chunks with local fallback chunks
    const merged = [...dbChunks];
    for (const localChunk of localFallback) {
      if (!merged.some(c => c.id === localChunk.id)) {
        merged.push(localChunk);
      }
    }
    return merged;
  } catch (err: any) {
    console.warn("Supabase dbGetChunks failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbSaveChunk(chunk: KnowledgeChunk): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('knowledge_chunks').insert({
      id: chunk.id,
      botId: chunk.botId,
      sourceId: chunk.sourceId,
      title: chunk.title,
      content: chunk.content,
      category: chunk.category,
      tags: chunk.tags,
      isActive: chunk.isActive
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveChunk failed:", err);
    return false;
  }
}

export async function dbUpdateChunk(id: string, updates: Partial<KnowledgeChunk>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
     const formattedUpdates: any = { ...updates };
     const { error } = await client.from('knowledge_chunks').update(formattedUpdates).eq('id', id);
     if (error) throw error;
     return true;
  } catch (err) {
    console.error("Supabase dbUpdateChunk failed:", err);
    return false;
  }
}

export async function dbDeleteChunk(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('knowledge_chunks').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteChunk failed:", err);
    return false;
  }
}

// Conversations CRUD
export async function dbGetConversations(botId: string, localFallback: ChatSession[]): Promise<ChatSession[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('chat_sessions').select('*').eq('botId', botId).order('lastMessageTime', { ascending: false });
    if (error) throw error;
    return data as ChatSession[];
  } catch (err: any) {
    console.warn("Supabase dbGetConversations failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbSaveConversation(convo: ChatSession): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('chat_sessions').insert({
      id: convo.id,
      botId: convo.botId,
      telegramUserId: convo.telegramUserId,
      telegramUsername: convo.telegramUsername,
      telegramFullName: convo.telegramFullName,
      lastMessageText: convo.lastMessageText,
      lastMessageTime: convo.lastMessageTime,
      status: convo.status,
      internalNotes: convo.internalNotes,
      messages: convo.messages
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveConversation failed:", err);
    return false;
  }
}

export async function dbUpdateConversation(sessId: string, updates: Partial<ChatSession>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('chat_sessions').update(updates).eq('id', sessId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbUpdateConversation failed:", err);
    return false;
  }
}

// FAQ CRUD
export async function dbGetFAQs(botId: string, localFallback: FAQItem[]): Promise<FAQItem[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('faq_items').select('*').eq('botId', botId).order('useCount', { ascending: false });
    if (error) throw error;
    return data as FAQItem[];
  } catch (err: any) {
    console.warn("Supabase dbGetFAQs failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbSaveFAQ(faq: FAQItem): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('faq_items').insert(faq);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveFAQ failed:", err);
    return false;
  }
}

export async function dbDeleteFAQ(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('faq_items').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteFAQ failed:", err);
    return false;
  }
}

// ================= SUPABASE STORAGE HELPER FUNCTIONS =================

export async function dbEnsureBucketExists(bucketName: string = "knowledge-sources"): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { data: buckets, error: getBucketsError } = await client.storage.listBuckets();
    if (getBucketsError) throw getBucketsError;
    const exists = buckets.some(b => b.name === bucketName);
    if (!exists) {
      const { error: createBucketError } = await client.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 20971520 // 20MB limit
      });
      if (createBucketError) throw createBucketError;
    }
    return true;
  } catch (err) {
    console.error("Supabase dbEnsureBucketExists failed:", err);
    return false;
  }
}

export async function dbUploadFile(
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer | ArrayBuffer | string,
  contentType?: string
): Promise<{ success: boolean; path?: string; publicUrl?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized." };
  try {
    await dbEnsureBucketExists(bucketName);

    const { data, error } = await client.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: contentType
      });

    if (error) throw error;

    const { data: { publicUrl } } = client.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return {
      success: true,
      path: data.path,
      publicUrl: publicUrl
    };
  } catch (err: any) {
    console.error("Supabase dbUploadFile failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function dbListStorageFiles(bucketName: string = "knowledge-sources"): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  try {
    await dbEnsureBucketExists(bucketName);
    const { data, error } = await client.storage.from(bucketName).list("", {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) throw error;

    return data.map(file => {
      const { data: { publicUrl } } = client!.storage.from(bucketName).getPublicUrl(file.name);
      return {
        ...file,
        publicUrl
      };
    });
  } catch (err) {
    console.error("Supabase dbListStorageFiles failed:", err);
    return [];
  }
}

export async function dbDeleteStorageFile(fieldName: string, bucketName: string = "knowledge-sources"): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.storage.from(bucketName).remove([fieldName]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteStorageFile failed:", err);
    return false;
  }
}

// ================= SUPABASE AUTH HELPER FUNCTIONS =================

export async function dbSignUpUser(
  email: string, 
  password: string, 
  redirectTo?: string
): Promise<{ success: boolean; user?: any; session?: any; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized." };
  try {
    // Auto-confirm email so users can sign in immediately (no email verification).
    // Needs a service-role key; if the active key isn't admin-capable, fall back
    // to the normal sign-up flow below.
    try {
      const { data: adminData, error: adminError } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: email.split("@")[0] }
      });
      if (!adminError && adminData?.user) {
        return { success: true, user: adminData.user, session: null };
      }
      // If the user already exists, surface a clear message instead of falling through.
      if (adminError && /already.*(registered|exists)|duplicate|been registered/i.test(adminError.message || "")) {
        return { success: false, error: adminError.message };
      }
    } catch (adminErr) {
      console.warn("admin.createUser auto-confirm unavailable, falling back to signUp:", adminErr);
    }

    const signUpOptions: any = {};
    if (redirectTo) {
      signUpOptions.redirectTo = redirectTo;
    }

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: signUpOptions
    });
    if (error) throw error;
    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err: any) {
    console.error("Supabase dbSignUpUser error:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function dbSignInUser(email: string, password: string): Promise<{ success: boolean; user?: any; session?: any; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized." };
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (!error) {
      return { success: true, user: data.user, session: data.session };
    }

    // Rescue legacy accounts created while "Confirm email" was on: auto-confirm
    // them (service-role only) and retry once. No-op if key isn't admin-capable.
    if (/not confirmed|email.*confirm/i.test(error.message || "")) {
      try {
        const { data: list } = await (client as any).auth.admin.listUsers({ page: 1, perPage: 200 });
        const target = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
        if (target?.id) {
          await client.auth.admin.updateUserById(target.id, { email_confirm: true } as any);
          const retry = await client.auth.signInWithPassword({ email, password });
          if (!retry.error) {
            return { success: true, user: retry.data.user, session: retry.data.session };
          }
        }
      } catch (rescueErr) {
        console.warn("Auto-confirm rescue on signin failed:", rescueErr);
      }
    }
    throw error;
  } catch (err: any) {
    console.error("Supabase dbSignInUser error:", err);
    return { success: false, error: err.message || String(err) };
  }
}

// ================= SCHEDULE / REMINDER CRUD =================

function mapDbSchedule(row: any): ScheduleItem {
  if (!row) return row;
  return {
    id: row.id,
    botId: row.botId || row.botid,
    time: row.time,
    daysOfWeek: row.daysOfWeek || row.daysofweek,
    dayOfMonth: row.dayOfMonth !== undefined ? row.dayOfMonth : row.dayofmonth,
    startDate: row.startDate || row.startdate || row.start_date,
    endDate: row.endDate || row.enddate || row.end_date,
    content: row.content,
    aiEnhanced: row.aiEnhanced !== undefined ? row.aiEnhanced : row.aienhanced,
    aiTone: row.aiTone || row.aitone,
    targetType: row.targetType || row.targettype || 'group',
    targetChatIds: Array.isArray(row.targetChatIds || row.targetchatids) ? (row.targetChatIds || row.targetchatids) : [],
    targetNames: Array.isArray(row.targetNames || row.targetnames) ? (row.targetNames || row.targetnames) : [],
    frequency: row.frequency || 'daily',
    status: row.status || 'active',
    label: row.label || '',
    category: row.category,
    createdAt: row.createdAt || row.createdat || row.created_at,
    lastTriggeredAt: row.lastTriggeredAt || row.lasttriggeredat || row.last_triggered_at,
    lastContent: row.lastContent || row.lastcontent || row.last_content,
    triggerCount: Number(row.triggerCount !== undefined ? row.triggerCount : (row.triggercount !== undefined ? row.triggercount : 0)),
    maxTriggers: row.maxTriggers !== undefined ? Number(row.maxTriggers) : (row.maxtriggers !== undefined ? Number(row.maxtriggers) : undefined)
  };
}

function mapDbReminderLog(row: any): ReminderLog {
  if (!row) return row;
  return {
    id: row.id,
    scheduleId: row.scheduleId || row.scheduleid,
    botId: row.botId || row.botid,
    triggeredAt: row.triggeredAt || row.triggeredat || row.triggered_at,
    content: row.content,
    targetChatIds: Array.isArray(row.targetChatIds || row.targetchatids) ? (row.targetChatIds || row.targetchatids) : [],
    status: row.status || 'sent',
    errorMessage: row.errorMessage || row.errormessage || row.error_message
  };
}

export async function dbGetSchedules(botId: string, localFallback: ScheduleItem[]): Promise<ScheduleItem[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('schedules').select('*').eq('botId', botId).order('createdAt', { ascending: false });
    if (error) {
      console.warn("Supabase dbGetSchedules select error, using local fallback:", error);
      return localFallback;
    }
    const dbSchedules = (data as any[]).map(mapDbSchedule);
    const merged = [...dbSchedules];
    for (const local of localFallback) {
      if (!merged.some(s => s.id === local.id)) {
        merged.push(local);
      }
    }
    return merged;
  } catch (err: any) {
    console.warn("Supabase dbGetSchedules failed (using local data fallback):", err.message || err);
    return localFallback;
  }
}

export async function dbGetAllActiveSchedules(localFallback: ScheduleItem[]): Promise<ScheduleItem[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback.filter(s => s.status === 'active');
  try {
    const { data, error } = await client.from('schedules').select('*').eq('status', 'active');
    if (error) {
      console.warn("Supabase dbGetAllActiveSchedules error, using local fallback:", error);
      return localFallback.filter(s => s.status === 'active');
    }
    const dbSchedules = (data as any[]).map(mapDbSchedule);
    const merged = [...dbSchedules];
    for (const local of localFallback.filter(s => s.status === 'active')) {
      if (!merged.some(s => s.id === local.id)) {
        merged.push(local);
      }
    }
    return merged;
  } catch (err: any) {
    console.warn("Supabase dbGetAllActiveSchedules failed:", err.message || err);
    return localFallback.filter(s => s.status === 'active');
  }
}

export async function dbSaveSchedule(schedule: ScheduleItem): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('schedules').upsert(schedule);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveSchedule failed:", err);
    return false;
  }
}

export async function dbUpdateSchedule(id: string, updates: Partial<ScheduleItem>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('schedules').update(updates).eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbUpdateSchedule failed:", err);
    return false;
  }
}

export async function dbDeleteSchedule(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('schedules').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbDeleteSchedule failed:", err);
    return false;
  }
}

export async function dbSaveReminderLog(log: ReminderLog): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('reminder_logs').insert(log);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Supabase dbSaveReminderLog failed:", err);
    return false;
  }
}

export async function dbGetReminderLogs(botId: string, localFallback: ReminderLog[], limit: number = 50): Promise<ReminderLog[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback.slice(0, limit);
  try {
    const { data, error } = await client.from('reminder_logs').select('*').eq('botId', botId).order('triggeredAt', { ascending: false }).limit(limit);
    if (error) {
      console.warn("Supabase dbGetReminderLogs error, using local fallback:", error);
      return localFallback.slice(0, limit);
    }
    const dbLogs = (data as any[]).map(mapDbReminderLog);
    const merged = [...dbLogs];
    for (const local of localFallback) {
      if (!merged.some(l => l.id === local.id)) {
        merged.push(local);
      }
    }
    return merged.slice(0, limit);
  } catch (err: any) {
    console.warn("Supabase dbGetReminderLogs failed:", err.message || err);
    return localFallback.slice(0, limit);
  }
}

// ================= USER CONFIG PERSISTENCE (SURVIVES RESTARTS) =================

export async function dbSaveUserConfig(email: string, url: string, key: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('user_configs').upsert({
      email: email.toLowerCase(),
      supabase_url: url,
      supabase_key: key,
      updatedAt: new Date().toISOString()
    }, { onConflict: 'email' });
    if (error) {
      // Table might not exist yet - that's OK, we have JSON fallback
      console.warn("dbSaveUserConfig: table may not exist yet:", error.message);
      return false;
    }
    console.log(`[UserConfig] Saved config for ${email} to Supabase DB`);
    return true;
  } catch (err: any) {
    console.warn("dbSaveUserConfig failed (non-critical):", err.message || err);
    return false;
  }
}

export async function dbGetUserConfig(email: string): Promise<{ url: string; key: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('user_configs')
      .select('supabase_url, supabase_key')
      .eq('email', email.toLowerCase())
      .single();
    if (error || !data) return null;
    return { url: data.supabase_url, key: data.supabase_key };
  } catch (err: any) {
    console.warn("dbGetUserConfig failed (non-critical):", err.message || err);
    return null;
  }
}

