import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BotConfig, KnowledgeSource, KnowledgeChunk, ChatSession, FAQItem, WorkspaceUser } from './src/types';

let _supabaseClient: SupabaseClient | null = null;

// Keep dynamic configurations in memory if the user overrides them from UI
let dynamicConfig = {
  url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""
};

export function updateDynamicConfig(url: string, key: string) {
  dynamicConfig.url = url;
  dynamicConfig.key = key;
  _supabaseClient = null; // Forces re-initialization
}

export function getSupabaseConfig() {
  const url = dynamicConfig.url || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = dynamicConfig.key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  return {
    url,
    key,
    keyMasked: key ? `${key.substring(0, 10)}...${key.substring(key.length - 4)}` : "",
    isConfigured: !!(url && key)
  };
}

export function getSupabaseClient(): SupabaseClient | null {
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
  } catch (e) {
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

  const tablesToCheck = ['bots', 'knowledge_sources', 'knowledge_chunks', 'chat_sessions', 'faq_items', 'profiles'];
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

    const { error: profError } = await client.from('profiles').select('id').limit(1);
    if (profError && (profError.message.includes('relation') || profError.code === 'PGRST116' || profError.code === '42P01')) {
      missingTables.push('profiles');
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

-- 6. BẢNG HỒ SƠ KHÁCH HÀNG & GÓI CƯỚC (PROFILES)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  tier TEXT DEFAULT 'free',
  message_limit INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public update profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public delete profiles" ON profiles;

CREATE POLICY "Allow public read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update profiles" ON profiles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete profiles" ON profiles FOR DELETE USING (true);

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
    if (error) throw error;
    return {
      success: true,
      user: data.user,
      session: data.session
    };
  } catch (err: any) {
    console.error("Supabase dbSignInUser error:", err);
    return { success: false, error: err.message || String(err) };
  }
}


