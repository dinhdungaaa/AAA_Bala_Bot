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
}

export interface FAQItem {
  id: string;
  botId: string;
  question: string;
  answer: string;
  category: string;
  useCount: number;
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
  tier: 'free' | 'pro' | 'enterprise';
  messageLimit: number;
  joinedDate: string;
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

