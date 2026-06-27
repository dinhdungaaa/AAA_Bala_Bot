import type { BotConfig, Message, ChatSession } from "../src/types.js";

// Event nhóm đã CHUẨN HOÁ (client.ts dịch event zca-js thô sang kiểu này).
export interface ZaloIncomingEvent {
  groupId: string;          // threadId của nhóm
  messageId: string;        // id tin nhắn (để dedupe)
  senderId: string;         // uid người gửi
  senderName: string;       // tên hiển thị người gửi
  text: string;             // nội dung text (rỗng nếu không phải text)
  mentionedUids: string[];  // danh sách uid được @mention trong tin
  quotedMessageId?: string; // nếu tin này là reply, id tin được trích
}

export type ZaloSendFn = (groupId: string, text: string) => Promise<string | null>;
// trả về messageId của tin bot vừa gửi (để theo dõi reply-to-bot), hoặc null nếu lỗi.

export interface ZaloDeps {
  botUid: () => string | null;                 // uid của chính tài khoản bot (để nhận biết @mention)
  send: ZaloSendFn;
  sendTyping: (groupId: string) => Promise<void>;  // hiệu ứng "đang soạn tin" trước khi trả lời
  generateRAGAnswer: (
    bot: BotConfig, query: string,
    userInfo?: { fullName?: string; username?: string; id?: string },
    replyOptions?: { shouldGreet?: boolean; recentMessages?: Message[] }
  ) => Promise<{ text: string; sources: any[]; fallbackTriggered: boolean }>;
  postProcessBotReply: (text: string, options?: { shouldGreet?: boolean; recentMessages?: Message[] }) => string;
  getBots: () => Promise<BotConfig[]>;
  getBinding: (groupId: string) => Promise<GroupBinding | null>;
  chatSessions: ChatSession[];
  saveConversation: (convo: ChatSession) => Promise<boolean>;
  analytics: { totalMessages: number; totalUsers: number };
  rememberSentMessage: (messageId: string) => void;  // ghi nhớ msgId bot gửi (reply-to-bot)
  isBotMessageId: (messageId: string) => boolean;
  ratePerMin: number;
}

export interface GroupBinding {
  group_id: string;
  group_name?: string;
  bot_id: string;
  owner_email: string;
  enabled: boolean;
}

export interface ZaloSessionRecord {
  id: string;
  account_label: string;
  owner_email: string;
  credentials: any | null;
  status: "active" | "needs_login" | "error";
  last_error?: string | null;
  updated_at?: string;
}

export interface ZaloRuntimeStatus {
  enabled: boolean;
  loginState: "active" | "needs_login" | "error" | "logging_in";
  accountLabel: string;
  accountName: string | null;
  listenerConnected: boolean;
  lastError: string | null;
}

export interface ZaloSession {
  id: string;
  accountLabel: string;
  ownerEmail: string;
  status: "active" | "needs_login" | "error";
  lastError?: string | null;
}

export interface ZaloInjectedDeps {
  generateRAGAnswer: ZaloDeps["generateRAGAnswer"];
  postProcessBotReply: ZaloDeps["postProcessBotReply"];
  getBots: ZaloDeps["getBots"];
  chatSessions: ZaloDeps["chatSessions"];
  saveConversation: ZaloDeps["saveConversation"];
  analytics: ZaloDeps["analytics"];
  checkUsage: ZaloDeps["checkUsage"];
  recordUsage: ZaloDeps["recordUsage"];
  blockMessage: string;
}
