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
  detectedGender?: 'male' | 'female' | null;
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

