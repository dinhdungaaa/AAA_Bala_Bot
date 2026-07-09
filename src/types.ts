export interface BotConfig {
  id: string;
  userId?: string;
  name: string;
  description: string;
  field: string;
  language: string;
  tone: 'professional' | 'friendly' | 'brief' | 'sales' | 'support';
  allowPricing: boolean;
  allowProductConsulting: boolean;
  escalationTrigger: 'fallback_limit' | 'explicit' | 'always' | 'never';
  telegramToken: string;
  telegramStatus: 'not_connected' | 'connected' | 'error' | 'testing';
  telegramBotUsername?: string;
  telegramWebhookActive: boolean;
  // Facebook Messenger — per-bot (giống Telegram), thay vì biến môi trường toàn cục.
  facebookPageAccessToken?: string;
  facebookPageId?: string;
  facebookPageName?: string;
  facebookStatus?: 'not_connected' | 'connected' | 'expired';
  facebookConnectedAt?: string;
  // Botcake bridge — kênh tạm qua nền tảng đã được Meta duyệt.
  botcakeBridgeKey?: string;
  // Botcake async bridge — cấu hình gọi ngược send_flow API.
  botcakePageId?: string;
  botcakeAccessToken?: string;
  botcakeReplyFlowId?: string;
  welcomeMessage: string;
  fallbackMessage: string;
  fallbackEmail: string;
  fallbackPhone: string;
  fallbackZalo: string;
  fallbackWebsite: string;
  limitToKnowledge: boolean;
  restrictedTopics: string;
  workingHours: string;
  status: 'active' | 'inactive' | 'training' | 'needs_token';
  createdAt: string;
  answerStyle?: 'sales' | 'reference';
  // Trợ lý bán hàng: mục tiêu hội thoại + chat id Telegram nhận thông báo lead.
  conversationGoal?: 'lead' | 'order' | 'consult';
  notifyTelegramChatId?: string;
  // Widget chat nhúng website của chủ shop. widgetKey rỗng/null = tính năng tắt.
  widgetKey?: string | null;
  widgetColor?: string;
  widgetTitle?: string;
  widgetGreeting?: string;
}

export interface KnowledgeSource {
  id: string;
  botId: string;
  name: string;
  type: 'file' | 'text' | 'faq' | 'url';
  contentSummary: string;
  fullText: string;
  category: 'product' | 'policy' | 'pricing' | 'shipping' | 'warranty' | 'hdsd' | 'faq';
  status: 'processing' | 'indexed' | 'completed' | 'error';
  errorMessage?: string;
  fileSize?: string;
  urlCount?: number;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  botId: string;
  sourceId: string;
  title: string;
  content: string;
  category: 'product' | 'policy' | 'pricing' | 'shipping' | 'warranty' | 'hdsd' | 'faq';
  tags: string[];
  isActive: boolean;
  embedding?: number[];
  embeddingHash?: string;
  metadata?: {
    topic?: string;
    dayNumber?: number;
    coursePhase?: 'main' | 'followup' | 'bonus' | 'unknown';
    priority?: number;
    sourceName?: string;
  };
}

export interface Message {
  id: string;
  sender: 'user' | 'bot' | 'agent';
  username: string; // Telegram user or internal operator
  fullName?: string;
  text: string;
  timestamp: string;
  sourcesUsed?: Array<{ id: string; name: string; score: number }>;
  score?: number; // feedback score 1-5 or thumbs
  feedbackCorrect?: boolean;
  fallbackTriggered?: boolean;
  isEscalated?: boolean;
  // ID gốc của tin nhắn trên kênh (Telegram message_id / Zalo msgId / FB mid) —
  // dùng để operator trích dẫn (reply/quote) đúng tin của khách khi can thiệp.
  channelMsgId?: string;
  // Câu trả lời này là kết quả của nút "Mở rộng trả lời" (có dùng kiến thức ngoài tài liệu).
  expanded?: boolean;
}

export interface ChatSession {
  id: string;
  botId: string;
  telegramUserId: string;
  telegramUsername: string;
  telegramFullName: string;
  lastMessageText: string;
  lastMessageTime: string;
  status: 'bot_answered' | 'failed' | 'escalated' | 'resolved' | 'needs_review';
  internalNotes: string;
  messages: Message[];
  // Định tuyến kênh để operator gửi tin can thiệp tới đúng nơi (kèm tag tên + trích dẫn).
  channel?: 'telegram' | 'facebook' | 'zalo' | 'botcake' | 'web';
  channelChatId?: string;     // đích gửi: Telegram chat.id / Zalo groupId / FB psid
  channelIsGroup?: boolean;   // true nếu là nhóm (cần @tag + reply rõ người)
  channelSenderId?: string;   // id khách trên kênh (để @mention)
  channelOwnerEmail?: string; // chủ session Zalo (để gửi qua đúng phiên zca-js)
  // Người đang xử lý: đến thời điểm này bot IM LẶNG (mỗi tin nhân viên gửi lại gia hạn).
  // null/quá hạn = bot hoạt động bình thường.
  humanTakeoverUntil?: string | null;
}

export interface FAQItem {
  id: string;
  botId: string;
  question: string;
  answer: string;
  category: string;
  useCount: number;
}

// Nhóm Telegram mà bot đã được add vào — tự bắt qua webhook (my_chat_member / tin nhắn group)
// để người dùng chọn từ dropdown khi đặt lịch nhắc, thay vì gõ tay chat_id âm.
export interface TelegramGroup {
  id: string;          // `${botId}:${chatId}` — khóa upsert idempotent
  botId: string;
  chatId: string;      // ID nhóm (số âm) dạng chuỗi
  title: string;
  type: 'group' | 'supergroup' | 'channel';
  isActive: boolean;   // false khi bot bị xóa/kick khỏi nhóm
  addedAt: string;
  lastSeenAt: string;
}

export interface AnalyticsSummary {
  totalUsers: number;
  totalMessages: number;
  dialogsCount: number;
  successRate: number;
  escalationRate: number;
  messageTrend: Array<{ date: string; userMessages: number; botMessages: number }>;
  popularQuestions: Array<{ question: string; count: number; category: string }>;
  unansweredQuestions: Array<{ question: string; count: number; timestamp: string }>;
  feedbackStats: { helpful: number; total: number };
  knowledgeGaps: Array<{ topic: string; missingCount: number; suggestion: string }>;
}

export interface WorkspaceUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  workspace: string;
}

export interface SaasCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: 'free' | 'starter' | 'pro' | 'business' | 'enterprise';
  messageLimit: number;
  joinedDate: string;
  status?: 'active' | 'suspended';
  role?: 'owner' | 'customer';
  passwordSet?: boolean;
  passwordUpdatedAt?: string;
  lastLoginAt?: string;
  botsCount?: number;
  // Hạn gói trả phí (ISO). null/undefined = không hết hạn. Nâng/gia hạn = hạn cũ + 30 ngày.
  planExpiresAt?: string | null;
}

// === REMINDER / SCHEDULE SYSTEM ===

export type ReminderFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'weekdays' | 'custom';

export type ReminderStatus = 'active' | 'paused' | 'completed' | 'error';

export interface ScheduleItem {
  id: string;
  botId: string;
  // Thời gian
  time: string;              // HH:mm format (e.g. "08:30")
  daysOfWeek?: number[];     // 0=CN, 1=T2... 6=T7 (for weekly/custom)
  dayOfMonth?: number;       // 1-31 (for monthly)
  startDate?: string;        // ISO date - khi nào bắt đầu
  endDate?: string;          // ISO date - khi nào kết thúc (optional)
  // Nội dung
  content: string;           // Nội dung gốc người dùng nhập
  aiEnhanced: boolean;       // Có dùng AI để viết lại mỗi lần gửi không
  aiTone?: 'motivational' | 'strict' | 'friendly' | 'urgent'; // Giọng AI push
  // Đối tượng nhận
  targetType: 'group' | 'individual' | 'all';
  targetChatIds: string[];   // Telegram group_id(s) hoặc chat_id(s)
  targetNames?: string[];    // Tên hiển thị để quản lý
  // Metadata
  frequency: ReminderFrequency;
  status: ReminderStatus;
  label: string;             // Tên/nhãn cho schedule (e.g. "Nhắc họp sáng")
  category?: string;         // Phân loại: 'meeting', 'task', 'report', 'custom'
  createdAt: string;
  lastTriggeredAt?: string;
  lastContent?: string;      // Nội dung lần cuối đã gửi (để AI không lặp lại)
  triggerCount: number;       // Số lần đã nhắc
  maxTriggers?: number;       // Giới hạn số lần nhắc (null = vô hạn)
}

export interface ReminderLog {
  id: string;
  scheduleId: string;
  botId: string;
  triggeredAt: string;
  content: string;            // Nội dung thực tế đã gửi (có thể đã qua AI)
  targetChatIds: string[];
  status: 'sent' | 'failed' | 'skipped';
  errorMessage?: string;
}

export interface ScheduleUploadResult {
  success: boolean;
  totalParsed: number;
  schedules: ScheduleItem[];
  errors?: string[];
}

// === BILLING / USAGE METERING ===

export interface UsageCounter {
  ownerKey: string;
  yearMonth: string;     // "YYYY-MM"
  messageCount: number;
  updatedAt: string;
}

export interface PlanLimit {
  messages: number;
  bots: number;
  channels: number | 'all';
}

// === TRỢ LÝ BÁN HÀNG: LEAD CAPTURE ===

export interface Lead {
  id: string;
  botId: string;
  sessionId?: string;      // userKey kênh (vd "botcake:<psid>") — dùng tra hasContact
  name?: string;
  phone: string;           // đã normalize về dạng 0xxxxxxxxx
  address?: string;
  interest?: string;
  buyingSignal?: string;
  channel?: string;        // botcake | telegram | facebook | web
  status: 'new' | 'contacted' | 'won' | 'lost';
  createdAt: string;
}

