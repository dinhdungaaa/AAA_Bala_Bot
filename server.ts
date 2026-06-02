import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { BotConfig, KnowledgeSource, KnowledgeChunk, Message, ChatSession, FAQItem, AnalyticsSummary, WorkspaceUser, SaasCustomer, ScheduleItem, ReminderLog, ScheduleUploadResult } from "./src/types.js";
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
  dbGetUserConfig
} from "./supabaseService.js";


// Helper for type compatibility (since we'll import types in types.ts but write server)
const app = express();
const PORT = 3000;
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

let saasCustomers: SaasCustomer[] = [];

let bots: BotConfig[] = [
  {
    id: "bot-aaa-farm",
    name: "AAA Farm - Rau Quả Sạch Organic",
    description: "Bot Telegram tư vấn bán nông sản sạch và giải đáp chính sách ship hàng của hộ nông nghiệp công nghệ cao AAA Farm.",
    field: "Bán lẻ nông sản & Thực phẩm sạch",
    language: "vi",
    tone: "friendly",
    allowPricing: true,
    allowProductConsulting: true,
    escalationTrigger: "fallback_limit",
    telegramToken: "7123456789:AAF_ExampleToken_BalaBotAAA",
    telegramStatus: "connected",
    telegramBotUsername: "AAAFarm_BalaBot",
    telegramWebhookActive: true,
    welcomeMessage: "Dạ! Nông sản sạch AAA Farm xin chào anh/chị. Em là BalaBot tự động chăm sóc 24/7. Anh/chị đang cần tìm mua rau quả sạch, kiểm tra bảng giá hay chính sách giao hàng ạ? 🥦🍅",
    fallbackMessage: "Dạ, câu này hơi chuyên sâu chưa nằm trong kiến thức được train của em ạ. Em đã lưu lại nghi vấn và tạo tag chuyển cho nhân viên liên hệ lại anh/chị ngay nhé. Hotline backup: 098.765.4321.",
    fallbackEmail: "support@aaafarm.vn",
    fallbackPhone: "0987654321",
    fallbackZalo: "https://zalo.me/aaafarm",
    fallbackWebsite: "https://aaafarm.vn",
    limitToKnowledge: true,
    restrictedTopics: "Chính trị, tôn giáo, so sánh tiêu cực đối thủ, lôi kéo khách hàng sang kênh tư nhân bên ngoài khác.",
    workingHours: "08:00 - 21:00",
    status: "active",
    createdAt: "2026-05-10T08:00:00Z"
  },
  {
    id: "bot-sample-2",
    name: "AAA Tech - Tư vấn Khoá Học Coding",
    description: "Bot hỗ trợ kỹ thuật và tuyển sinh tuyển đào tạo nghề lập trình Full-stack React & Node.js.",
    field: "Giáo dục & Công nghệ",
    language: "vi",
    tone: "professional",
    allowPricing: true,
    allowProductConsulting: true,
    escalationTrigger: "explicit",
    telegramToken: "",
    telegramStatus: "not_connected",
    telegramWebhookActive: false,
    welcomeMessage: "Chào mừng quý khách đến với Học viện Công nghệ AAA. Tôi là trợ lý ảo hỗ trợ tư vấn lộ trình học lập trình 2026. Anh/chị cần tư vấn khóa ngắn hạn hay dài hạn?",
    fallbackMessage: "Xin phép anh/chị, hệ thống sẽ kết nối với giảng viên đào tạo để phân tích trực tiếp. Vui lòng nhắn thêm SĐT để bộ phận tuyển sinh liên hệ qua Zalo ạ.",
    fallbackEmail: "contact@aaatech.vn",
    fallbackPhone: "0912123456",
    fallbackZalo: "https://zalo.me/aaatech",
    fallbackWebsite: "https://aaatech.edu.vn",
    limitToKnowledge: true,
    restrictedTopics: "Chế nhạo học viên, hứa hẹn bao đỗ 100% sai sự thật, công kích kỹ thuật của ngôn ngữ lập trình khác.",
    workingHours: "09:00 - 18:00",
    status: "needs_token",
    createdAt: "2026-05-20T03:30:00Z"
  }
];

let knowledgeSources: KnowledgeSource[] = [
  {
    id: "src-1",
    botId: "bot-aaa-farm",
    name: "Bang_Gia_Nong_San_AAA_Farm_2026.pdf",
    type: "file",
    contentSummary: "Chứa bảng giá bán buôn & bán lẻ của hơn 30 mặt hàng rau củ quả hữu cơ đỗ, cải, dưa leo và một số nước ép lạnh đóng hộp.",
    fullText: `DANH SÁCH BẢNG GIÁ CHI TIẾT SẢN PHẨM SẠCH AAA FARM (Áp dụng từ 2026)
1. CÀ CHUA ORGANIC: Giá 45.000 VNĐ / kg. Sạch chuẩn VietGAP, quả to, mọng nước, nhiều bột.
2. THƠM MẬT ĐÀ LẠT: Giá 60.000 VNĐ / quả. Ngọt sắc tự nhiên, thơm lừng, nặng từ 1.2kg - 1.5kg/quả.
3. XÀ LÁCH THỦY CANH: Giá 35.000 VNĐ / túi 300g. Loại xà lách mỡ và lô lô xanh giòn ngọt vô cùng thích hợp làm salad.
4. RAU MUỐNG HỮU CƠ: Giá 20.000 VNĐ / bó 500g.
5. SÚP LƠ XANH (BÔNG CẢI): Giá 55.000 VNĐ / kg.
6. THỊT BA CHỈ HEO QUÊ SẠCH: Giá 180.000 VNĐ / kg. Heo nuôi hoàn toàn bằng cám gạo ngô bã đậu, thịt thơm, không ra nước khi rang.
7. TRỨNG GÀ ĐỒI TỰ NHIÊN: Giá 48.000 VNĐ / vỉ 10 quả. Gà thả đồi ăn ngô thóc, lòng đỏ vàng ươm, béo ngậy.`,
    category: "pricing",
    status: "completed",
    fileSize: "245 KB",
    createdAt: "2026-05-11T09:00:00Z"
  },
  {
    id: "src-2",
    botId: "bot-aaa-farm",
    name: "Chinh_Sach_Giao_Hang_Doi_Tra.docx",
    type: "file",
    contentSummary: "Quy định phạm vi giao hàng hỏa tốc trong nội thành Hồ Chí Minh/Hà Nội, freeship từ 300k, đổi trả rau dập hỏng trong ngày kèm hình ảnh video.",
    fullText: `CHÍNH SÁCH VẬN CHUYỂN, GIAO NHẬN VÀ ĐỔI TRẢ HÀNG HÓA - AAA FARM
1. PHẠM VI GIAO HÀNG TRỰC TIẾP TRONG NGÀY:
- Áp dụng trong toàn bộ các quận/huyện TP. Hồ Chí Minh và TP. Hà Nội. Giao hỏa tốc bằng Shipper Grab/Ahamove.
2. PHÍ SHIP:
- Đồng giá 25.000 VNĐ cho các đơn hàng dưới 300.000 VNĐ.
- BIỂU PHÍ ĐẶC BIỆT: MIỄN PHÍ VẬN CHUYỂN (FREESHIP) hoàn toàn cho mọi đơn hàng có giá trị từ 300.000 VNĐ trở lên trong nội thành bán kính dưới 12km.
3. CHÍNH SÁCH ĐỔI TRẢ / HOÀN TIỀN:
- Do đặc thù là rau quả tươi sống hái tại vườn trong sáng sớm, hàng có thể bị va vấp dập nát nhẹ trong quá trình vận chuyển.
- AAA Farm cam kết: ĐỀN QUẢ MỚI hoặc HOÀN TIỀN 100% đối với phần rau quả bị hỏng dập nát trong vòng 24 giờ kể từ lúc nhận hàng.
- Yêu cầu: Khách hàng vui lòng chụp ảnh hoặc gửi 1 video ngắn khui hộp rau quả gửi qua Zalo/Telegram Admin để được xử lý ngay lập tức mà không mất thêm bất kỳ đồng phí nào.`,
    category: "policy",
    status: "completed",
    fileSize: "112 KB",
    createdAt: "2026-05-11T09:15:00Z"
  },
  {
    id: "src-3",
    botId: "bot-aaa-farm",
    name: "Website_Huong_Dan_Trong_Rau.url",
    type: "url",
    contentSummary: "https://aaafarm.vn/huong-dan-bao-quan - Hướng dẫn bảo quản rau quả giữ độ tươi lâu bằng bọc màng thực phẩm sau thu hoạch.",
    fullText: `HƯỚNG DẪN BẢO QUẢN RAU QUẢ CỦA AAA FARM
- Đối với rau lá xanh (Rau muống, xà lách, cải): Không nên rửa trước khi cho vào tủ lạnh để tránh bị úng nước. Hãy bọc rau bằng túi giấy hoặc màng bọc thực phẩm đục lỗ nhỏ, bảo quản ngăn mát nhiệt độ từ 4-8 độ C. Có thể tươi ngon suốt 5-7 ngày.
- Đối với cà chua mọng: Không nên cho cà chua chưa chín hẳn vào tủ lạnh vì nhiệt độ thấp làm hỏng kết cấu bột và giảm hương vị tự nhiên của quả. Khuyên dùng: Để cà chua ở nhiệt độ phòng nơi thoáng mát, phần cuống hướng lên trên.
- Quả thơm mật: Tránh đè ép vật nặng. Nếu đã bổ, bọc kín đĩa bằng màng PE bảo quản mát dùng trong 48h tốt nhất.`,
    category: "hdsd",
    status: "completed",
    urlCount: 1,
    createdAt: "2026-05-12T14:40:00Z"
  }
];

let knowledgeChunks: KnowledgeChunk[] = [
  { id: "chk-1", botId: "bot-aaa-farm", sourceId: "src-1", title: "Cà chua organic", content: "Cà chua organic AAA Farm có giá 45.000 VNĐ / kg. Sạch chuẩn VietGAP, quả to, chín tự nhiên mọng nước, thịt bột dồi dào dinh dưỡng tuyệt đối cho gia đình.", category: "pricing", tags: ["cà chua", "organic", "vietgap", "bảng giá"], isActive: true },
  { id: "chk-2", botId: "bot-aaa-farm", sourceId: "src-1", title: "Thơm mật Đà Lạt", content: "Thơm mật Đà Lạt AAA Farm giá 60.000 VNĐ / quả. Ngọt sắc tự nhiên, thơm lừng đậm đà, thu hoạch trực tiếp tại trang trại với cân nặng từ 1.2kg - 1.5kg/quả.", category: "pricing", tags: ["thơm mật", "dứa thơm", "bảng giá"], isActive: true },
  { id: "chk-3", botId: "bot-aaa-farm", sourceId: "src-1", title: "Xà lách thủy canh", content: "Xà lách thủy canh giòn sạch giá 35.000 VNĐ / túi 300g gồm xà lách mỡ và lô lô xanh. Trồng trong nhà màng công nghệ cao, rửa sạch ăn ngay an toàn ăn salad.", category: "pricing", tags: ["xà lách", "salad", "bảng giá"], isActive: true },
  { id: "chk-4", botId: "bot-aaa-farm", sourceId: "src-1", title: "Thịt ba chỉ heo sạch", content: "Thịt ba chỉ heo quê sạch có giá 180.000 VNĐ / kg. Heo nuôi hoàn toàn bằng ngũ cốc cám gạo ngô bã đậu, thịt săn chắc thơm ngậy, không bị ra nước hôi khi chế biến.", category: "product", tags: ["thịt heo", "bảng giá", "fresh"], isActive: true },
  { id: "chk-5", botId: "bot-aaa-farm", sourceId: "src-1", title: "Trứng gà đồi tự nhiên", content: "Trứng gà đồi béo ngậy có giá 48.000 VNĐ / vỉ 10 quả. Gà thả đồi tự do ăn ngô thực phẩm sạch bổ dưỡng, lòng đỏ vàng đậm đặc biệt.", category: "pricing", tags: ["trứng gà", "fresh", "bảng giá"], isActive: true },
  { id: "chk-6", botId: "bot-aaa-farm", sourceId: "src-2", title: "Giao hàng nội thành", content: "Giao hàng trực tiếp hỏa tốc trong ngày trong nội thành TP. Hồ Chí Minh và Hà Nội bằng Grab/Ahamove để rau quả luôn tươi mát.", category: "shipping", tags: ["vận chuyển", "grab", "hỏa tốc"], isActive: true },
  { id: "chk-7", botId: "bot-aaa-farm", sourceId: "src-2", title: "Phí ship & Ưu đãi Freeship", content: "Phí ship đồng giá nội thành 25.000 VNĐ cho đơn dưới 300.000 VNĐ. Đặc biệt MIỄN PHÍ VẬN CHUYỂN (FREESHIP) 100% cho mọi đơn từ 300.000 VNĐ trở lên trong nội thành.", category: "shipping", tags: ["freeship", "ưu đãi", "phí ship"], isActive: true },
  { id: "chk-8", botId: "bot-aaa-farm", sourceId: "src-2", title: "Đổi trả miễn phí rau hỏng", content: "AAA Farm hoàn tiền hoặc giao bù sản phẩm mới miễn phí 100% cho các quả/rau bị hỏng dập nát trong vòng 24h từ lúc giao. Chỉ cần gửi hình ảnh/video khui hộp.", category: "policy", tags: ["đổi trả", "hoàn tiền", "chính sách"], isActive: true },
  { id: "chk-9", botId: "bot-aaa-farm", sourceId: "src-3", title: "Bảo quản rau lá xanh", content: "Rau lá xanh (rau muống, cải, xà lách) không rửa nước trước khi cho tủ lạnh. Bọc màng đục lỗ bảo quản ngăn mát 4-8 độ C giúp tươi ngon tới 5-7 ngày.", category: "hdsd", tags: ["hướng dẫn", "bảo quản", "rau xanh"], isActive: true },
  { id: "chk-10", botId: "bot-aaa-farm", sourceId: "src-3", title: "Bảo quản cà chua mọng", content: "Cà chua không nên để tủ lạnh sớm vì bị mất bột dẻo ngọt. Hãy xếp cà chua cuống lên trên tại nhiệt độ phòng tủ bếp khô thoáng.", category: "hdsd", tags: ["cà chua", "bảo quản", "mẹo"], isActive: true }
];

let chatSessions: ChatSession[] = [
  {
    id: "sess-1",
    botId: "bot-aaa-farm",
    telegramUserId: "612459021",
    telegramUsername: "quoc_anh_9x",
    telegramFullName: "Quốc Anh Bùi",
    lastMessageText: "Bên mình ship quận 7 bao nhiêu á, nếu lấy 2kg cà chua có freeship không b?",
    lastMessageTime: "2026-05-25T10:05:00Z",
    status: "bot_answered",
    internalNotes: "KH hỏi ship quận 7 và mua cà chua organic.",
    messages: [
      { id: "m1", sender: "user", username: "quoc_anh_9x", text: "Xin chào AAA Farm, hôm nay có cà chua tươi không ạ?", timestamp: "2026-05-25T10:01:00Z" },
      { id: "m2", sender: "bot", username: "AAAFarm_BalaBot", text: "Dạ có ạ! Cà chua organic AAA Farm hôm nay vườn mới hái chuyển lên còn nguyên cuống tươi rói nha anh/chị. Quả cực kì đỏ mọng, nhiều bột ngọt bùi, có giá là 45.000 VNĐ / kg chuẩn VietGAP ạ. Anh muốn lấy mấy kg để em lên đơn?", timestamp: "2026-05-25T10:01:30Z", sourcesUsed: [{ id: "chk-1", name: "Cà chua organic", score: 0.95 }] },
      { id: "m3", sender: "user", username: "quoc_anh_9x", text: "Bên mình ship quận 7 bao nhiêu á, nếu lấy 2kg cà chua có freeship không b?", timestamp: "2026-05-25T10:05:00Z" },
      { id: "m4", sender: "bot", username: "AAAFarm_BalaBot", text: "Dạ phí ship hỏa tốc nội thành TP. Hồ Chí Minh quận 7 là 25.000 VNĐ anh nhé. Do tổng đơn hàng của mình (2kg cà chua = 90.000 VNĐ) nhỏ hơn 300.000 VNĐ nên chưa đủ điều kiện Freeship ạ. Anh/chị có thể lấy thêm trứng gà ta thả đồi (48k/vỉ 10 quả) hoặc thịt ba chỉ lợn thơm sạch (180k/kg) để đơn đạt 300.000 VNĐ là em hoàn toàn miễn phí vận chuyển hỏa tốc tận nhà luôn nha!", timestamp: "2026-05-25T10:05:40Z", sourcesUsed: [{ id: "chk-1", name: "Cà chua organic", score: 0.92 }, { id: "chk-7", name: "Phí ship & Ưu đãi Freeship", score: 0.98 }] }
    ]
  },
  {
    id: "sess-2",
    botId: "bot-aaa-farm",
    telegramUserId: "710294812",
    telegramUsername: "ngoc_huyen_vy",
    telegramFullName: "Ngọc Huyền Vy",
    lastMessageText: "Có cách nào gửi khiếu nại không em, rau muống nhận bị dập nát hết rồi?",
    lastMessageTime: "2026-05-25T09:12:00Z",
    status: "escalated",
    internalNotes: "Vấn đề rau muống dập nát cần nhân viên đền / phát voucher.",
    messages: [
      { id: "m2-1", sender: "user", username: "ngoc_huyen_vy", text: "Alo shop ơi, mở hộp rau muống ra thấy dập đen nát hết rồi không xào được.", timestamp: "2026-05-25T09:10:00Z" },
      { id: "m2-2", sender: "bot", username: "AAAFarm_BalaBot", text: "Dạ em rất xin lỗi với sự cố đáng tiếc này ạ! Rau muống gập/va đè khi anh Grab chạy nhanh có thể bị dập. Theo chính sách cam kết, bên em hỗ trợ hoàn tiền hoặc bù rau mới 100% trong vòng 24h miễn phí. Chị chụp ảnh mâm rau hoặc gửi video ngắn, em báo các anh chị nhân viên hỗ trợ đổi trả hoặc hoàn tiền ngay cho chị ạ!", timestamp: "2026-05-25T09:11:00Z", sourcesUsed: [{ id: "chk-8", name: "Đổi trả miễn phí rau hỏng", score: 0.99 }] },
      { id: "m2-3", sender: "user", username: "ngoc_huyen_vy", text: "Có cách nào gửi khiếu nại không em, rau muống nhận bị dập nát hết rồi? Đang cần gấp cho bữa trưa.", timestamp: "2026-05-25T09:12:00Z" }
    ]
  },
  {
    id: "sess-3",
    botId: "bot-aaa-farm",
    telegramUserId: "542910243",
    telegramUsername: "hoang_lam_digital",
    telegramFullName: "Lâm Hoàng",
    lastMessageText: "Mình mua súp lơ xanh ship về ngoại thành Hải Phòng giao thế nào b ơi?",
    lastMessageTime: "2026-05-24T18:30:00Z",
    status: "needs_review",
    internalNotes: "Hỏi ship hải phòng xem có bảo đảm rau súp lơ tươi bằng xe đông lạnh không.",
    messages: [
      { id: "m3-1", sender: "user", username: "hoang_lam_digital", text: "Mình mua súp lơ xanh ship về ngoại thành Hải Phòng giao thế nào b ơi? Ở đây xa dã man.", timestamp: "2026-05-24T18:30:00Z" },
      { id: "m3-2", sender: "bot", username: "AAAFarm_BalaBot", text: "Dạ hiện tại súp lơ xanh tươi sạch của AAA Farm chủ yếu giao hỏa tốc trực tiếp tại nội thành TP.HCM và Hà Nội trong ngày để đảm bảo rau mát tươi ăn dòn ngọt nhất ạ. Với ship ngoại tỉnh Hải Phòng, bên em có gửi xe đông lạnh cho các đơn sỉ lớn hoặc chuyển phát nhanh được cho các dòng đồ khô sấy dẻo, nước đóng chai. Anh có muốn em chuyển thắc mắc này cho nhân viên để liên hệ gửi chành xe thích hợp không ạ?", timestamp: "2026-05-24T18:31:00Z", sourcesUsed: [{ id: "chk-6", name: "Giao hàng nội thành", score: 0.85 }] }
    ]
  }
];

let faqList: FAQItem[] = [
  { id: "faq-1", botId: "bot-aaa-farm", question: "Rau có chuẩn hữu cơ/VietGAP thật không?", answer: "Dạ mọi sản phẩm rau củ tại AAA Farm đều trồng theo hướng hữu cơ quy mô lớn tại nông trại công nghệ cao và liên kết chuẩn VietGAP, được giám sát nhật ký cây trồng chặt chẽ không dư lượng hóa chất trừ sâu độc hại, đạt an toàn vệ sinh thực phẩm nên anh chị tuyệt đối yên tâm nha.", category: "product", useCount: 38 },
  { id: "faq-2", botId: "bot-aaa-farm", question: "Có ship tỉnh ngoài TP.HCM/Hà Nội không?", answer: "Dạ nông tươi dễ héo dập nên bên em ưu tiên giao hỏa tốc bằng Shipper nội thành trong ngày để đảm bảo chất lượng ngon nhất. Với tỉnh lẻ lân cận, bên em chỉ áp dụng sỉ số lượng lớn gửi xe đông lạnh chuyên chở hoa quả hoặc bán trái cây đóng hộp khô thôi ạ.", category: "shipping", useCount: 19 },
  { id: "faq-3", botId: "bot-aaa-farm", question: "Tôi muốn mua số lượng sỉ có chiết khấu không?", answer: "Dạ có ạ! Từ đơn trên 50kg hoặc mở đại lý nhượng quyền phân phối nông sản, AAA Farm có chiết khấu cực kỳ tốt từ 15-30% theo từng loại hàng cùng hỗ trợ vận chuyển xe tải. Quý khách vui lòng liên lạc SĐT sỉ Hotline: 098.765.4321.", category: "pricing", useCount: 22 }
];

let analytics: AnalyticsSummary = {
  totalUsers: 142,
  totalMessages: 618,
  dialogsCount: 88,
  successRate: 91.2,
  escalationRate: 8.8,
  messageTrend: [
    { date: "05/19", userMessages: 28, botMessages: 27 },
    { date: "05/20", userMessages: 35, botMessages: 33 },
    { date: "05/21", userMessages: 42, botMessages: 39 },
    { date: "05/22", userMessages: 38, botMessages: 36 },
    { date: "05/23", userMessages: 51, botMessages: 49 },
    { date: "05/24", userMessages: 65, botMessages: 60 },
    { date: "05/25", userMessages: 48, botMessages: 45 }
  ],
  popularQuestions: [
    { question: "Cà chua organic giá bao nhiêu?", count: 42, category: "pricing" },
    { question: "Freeship đơn hàng bao nhiêu?", count: 35, category: "shipping" },
    { question: "Thịt ba chỉ heo sạch giá bao nhiêu vậy?", count: 28, category: "product" },
    { question: "Giao hàng quận 2 mất bao lâu?", count: 21, category: "shipping" },
    { question: "Xà lách thủy canh ăn sống được luôn không?", count: 18, category: "hdsd" }
  ],
  unansweredQuestions: [
    { question: "Bên mình có bán rau rừng mầm súp lơ baby nhập khẩu đắt tiền không em?", count: 4, timestamp: "2026-05-25T08:14:00Z" },
    { question: "Có dâu tây Bạch Tuyết chín rộ hôm nay không?", count: 3, timestamp: "2026-05-25T09:00:20Z" },
    { question: "Shop có bán hạt giống rau xà lách tự trồng ở ban công không?", count: 3, timestamp: "2026-05-24T15:22:00Z" }
  ],
  feedbackStats: { helpful: 84, total: 92 },
  knowledgeGaps: [
    { topic: "Dâu tây Đà Lạt / Bạch Tuyết", missingCount: 7, suggestion: "Khách hỏi dâu tây bạch tuyết chín mùa. Hãy cập nhật bảng giá hoặc phản hồi trạng thái hết hàng của dâu tây." },
    { topic: "Hạt giống mầm tự gieo", missingCount: 5, suggestion: "Có nhiều khách hỏi mua hạt giống và phân bón vi lượng tự trồng. Nên thêm FAQ giải thích nông trại không bán hạt giống thương mại." },
    { topic: "Giao hàng ngoại tỉnh hỏa tốc bưu điện", missingCount: 4, suggestion: "Nhiều lượt thắc mắc ở Hải Phòng/Đà Nẵng. Hãy làm rõ thông tin giới hạn vận chuyển hoa quả tươi ngoại tỉnh." }
  ]
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
  const client = getSupabaseClient();
  let dbCustomers: SaasCustomer[] = [];

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
          joinedDate: p.created_at ? new Date(p.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')
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
            tier: (u.email === 'ox102.crypto@gmail.com' ? 'enterprise' : 'free') as "free" | "pro" | "enterprise",
            messageLimit: u.email === 'ox102.crypto@gmail.com' ? 250000 : 1000,
            joinedDate: u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')
          }));
        }
      }
    } catch (err) {
      console.warn("Dynamic user discovery through Supabase skipped or failed:", err);
    }
  }

  // Merge database players with dynamic workspace session registers
  const finalCustomers = [...saasCustomers];
  
  dbCustomers.forEach(dbCust => {
    if (dbCust.email && !finalCustomers.some(c => c.email.toLowerCase() === dbCust.email.toLowerCase())) {
      finalCustomers.push(dbCust);
    }
  });

  // Also include workspace-created users if distinct
  workspaceUsers.forEach(u => {
    if (u.email && !finalCustomers.some(c => c.email.toLowerCase() === u.email.toLowerCase())) {
      finalCustomers.push({
        id: u.id,
        name: u.fullName || u.email.split('@')[0],
        email: u.email,
        phone: u.email === 'ox102.crypto@gmail.com' ? '090.888.9999' : 'Sử dụng Zalo',
        tier: u.role === 'owner' ? 'enterprise' : 'free',
        messageLimit: u.role === 'owner' ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN')
      });
    }
  });

  // Always ensure our master user exists
  const hasAdmin = finalCustomers.some(c => c.email.toLowerCase() === 'ox102.crypto@gmail.com');
  if (!hasAdmin) {
    finalCustomers.unshift({
      id: "u-1",
      name: "Founder Doanh Nghiệp AAA",
      email: "ox102.crypto@gmail.com",
      phone: "090.888.9999",
      tier: "enterprise",
      messageLimit: 250000,
      joinedDate: new Date().toLocaleDateString('vi-VN')
    });
  }

  res.json(finalCustomers);
});

app.post("/api/admin/customers", (req, res) => {
  const { name, email, phone, tier, messageLimit, joinedDate } = req.body;
  const newCust: SaasCustomer = {
    id: "cust-" + (saasCustomers.length + 1),
    name: name || "Khách hàng mới",
    email: email || "",
    phone: phone || "Không có",
    tier: tier || "free",
    messageLimit: Number(messageLimit) || 1000,
    joinedDate: joinedDate || new Date().toLocaleDateString('vi-VN')
  };
  saasCustomers.push(newCust);
  res.status(201).json(newCust);
});

app.put("/api/admin/customers/:id", (req, res) => {
  const { id } = req.params;
  const { tier, messageLimit, phone, name } = req.body;
  const customer = saasCustomers.find(c => c.id === id);
  if (!customer) {
    return res.status(404).json({ error: "Không tìm thấy khách hàng này!" });
  }
  if (tier !== undefined) customer.tier = tier;
  if (messageLimit !== undefined) customer.messageLimit = Number(messageLimit);
  if (phone !== undefined) customer.phone = phone;
  if (name !== undefined) customer.name = name;
  res.json(customer);
});

app.delete("/api/admin/customers/:id", (req, res) => {
  const { id } = req.params;
  saasCustomers = saasCustomers.filter(c => c.id !== id);
  res.json({ success: true, message: `Đã xóa khách hàng ${id} thành công!` });
});

// ================= SUPABASE ENDPOINTS =================
app.get("/api/supabase/config", async (req, res) => {
  const config = getSupabaseConfig();
  const status = await testConnection();
  res.json({ config, status });
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
  const result = await dbSignUpUser(email, password, redirectTo);
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
      saasCustomers.push({
        id: userId,
        name: email.split('@')[0],
        email: email,
        phone: 'Chưa cập nhật',
        tier: isOwner ? 'enterprise' : 'free',
        messageLimit: isOwner ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN')
      });
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
  const result = await dbSignInUser(email, password);
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
      saasCustomers.push({
        id: userId,
        name: email.split('@')[0],
        email: email,
        phone: 'Chưa cập nhật',
        tier: isOwner ? 'enterprise' : 'free',
        messageLimit: isOwner ? 250000 : 1000,
        joinedDate: new Date().toLocaleDateString('vi-VN')
      });
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
      model: "gemini-3.5-flash",
      contents: prompt,
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
      }
    }
  }

  res.status(201).json(newMsg);
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
  const tgUrl = `https://api.telegram.org/bot${bot.telegramToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  console.log(`[Telegram Register Manual] URL: ${webhookUrl}`);

  try {
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
  // If fallback to main demo bot and 0 messages, keep original beautiful demo indicators
  const isDemoFarm = botId === "bot-aaa-farm";
  
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
        botUsername: "AAAFarm_BalaBot",
        botName: "AAA Farm Support"
      });
    }
    res.json({ valid: false, error: "Token không hợp lệ theo phản hồi từ Telegram API Server." });
  } catch (err: any) {
    res.json({ valid: true, simulated: true, botUsername: "BalaBot_Mock", botName: "BalaBot Mock Active" });
  }
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
    if (!update || !update.message) {
      return;
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

    const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");

    // Save actual user message
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

    let responseText = "";
    let sourcesUsed: any[] = [];
    let fallbackTriggered = false;

    if (command === "start") {
      const detected = getGenderAndName(tFullName);
      const pr = detected.pronoun;
      const nm = detected.name;
      let customWelcome = bot.welcomeMessage || "Dạ, em kính chào anh chị ạ. Em có thể hỗ trợ gì cho mình hôm nay ạ?";
      // Replace variations of "anh/chị" naturally
      customWelcome = customWelcome.replace(/anh\/chị/g, `${pr} ${nm}`);
      customWelcome = customWelcome.replace(/anh chị/g, `${pr} ${nm}`);
      customWelcome = customWelcome.replace(/Anh\/Chị/g, `${pr === "chị" ? "Chị" : pr === "anh" ? "Anh" : "Anh/Chị"} ${nm}`);
      responseText = postProcessBotReply(customWelcome, { shouldGreet: true });
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
    // Replace variations of "anh/chị" naturally
    customWelcome = customWelcome.replace(/anh\/chị/g, `${pr} ${nm}`);
    customWelcome = customWelcome.replace(/anh chị/g, `${pr} ${nm}`);
    customWelcome = customWelcome.replace(/Anh\/Chị/g, `${pr === "chị" ? "Chị" : pr === "anh" ? "Anh" : "Anh/Chị"} ${nm}`);
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

function getFacebookVerifyToken() {
  return process.env.FACEBOOK_VERIFY_TOKEN || "balabot-dev-verify-token";
}

function getFacebookGraphApiVersion() {
  return process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0";
}

async function sendFacebookTextMessage(recipientId: string, text: string) {
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    console.warn("[Facebook Webhook] FACEBOOK_PAGE_ACCESS_TOKEN is not configured. Reply was generated but not sent.");
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
  const fullName = "Khách hàng Facebook";

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

  const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");
  const userMsg: Message = {
    id: "m-fb-" + Math.random().toString(36).substr(2, 9),
    sender: "user",
    username,
    fullName,
    text,
    timestamp: new Date().toISOString()
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
    customWelcome = customWelcome.replace(/anh\/chị/g, `${pr} ${nm}`);
    customWelcome = customWelcome.replace(/anh chị/g, `${pr} ${nm}`);
    customWelcome = customWelcome.replace(/Anh\/Chị/g, `${pr === "chị" ? "Chị" : pr === "anh" ? "Anh" : "Anh/Chị"} ${nm}`);
    aiAnswer = {
      text: postProcessBotReply(customWelcome, { shouldGreet: true }),
      sources: [],
      fallbackTriggered: false
    };
  } else {
    aiAnswer = await generateRAGAnswer(
      bot,
      text,
      { fullName, username, id: userKey },
      { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
    );
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
    await sendFacebookTextMessage(senderId, aiAnswer.text);
  }

  try {
    await dbSaveConversation(session);
  } catch (saveErr) {
    console.warn("[Facebook Webhook] Skip Supabase upload, running locally:", saveErr);
  }

  return { session, reply: botMsg };
}

app.get("/api/bots/:botId/facebook-webhook", (req, res) => {
  const webhookUrl = `${getPublicBaseUrl(req)}/api/facebook-webhook/${req.params.botId}`;
  res.json({
    configured: !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    webhookUrl,
    verifyTokenHint: process.env.FACEBOOK_VERIFY_TOKEN ? "FACEBOOK_VERIFY_TOKEN is configured" : "Using dev default: balabot-dev-verify-token",
    graphApiVersion: getFacebookGraphApiVersion()
  });
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


// Helper to detect Vietnamese gender and extract first name
function getGenderAndName(fullName: string, _username?: string, _messageText?: string): { pronoun: string; name: string } {
  if (!fullName) return { pronoun: "Anh/Chị", name: "Khách Hàng" };
  const parts = fullName.trim().split(/\s+/);
  const cleanParts = parts.filter(p => p.length > 0);
  if (cleanParts.length === 0) {
    return { pronoun: "Anh/Chị", name: "Khách Hàng" };
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

  return { pronoun: "Anh/Chị", name };
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

function getChunkMetadata(chunk: KnowledgeChunk): ChunkMetadata {
  const tags = chunk.tags || [];
  const dayTag = getTagValue(tags, "day");
  const priorityTag = getTagValue(tags, "priority");
  const inferred = inferChunkMetadata(chunk.content, chunk.title);
  return {
    ...inferred,
    topic: getTagValue(tags, "topic") || inferred.topic,
    dayNumber: dayTag ? Number(dayTag) : inferred.dayNumber,
    coursePhase: (getTagValue(tags, "phase") as ChunkMetadata["coursePhase"]) || inferred.coursePhase,
    priority: priorityTag ? Number(priorityTag) : inferred.priority
  };
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

function extractDurationAnswer(text: string): string | null {
  const source = cleanKnowledgeText(text);
  const patterns = [
    /kh[oó]a\s*h[oọ]c\s*(?:kéo dài|trong|dài)?\s*(\d{1,3})\s*(ngày|day|days|tuần|tháng)/i,
    /(\d{1,3})\s*(ngày|day|days|tuần|tháng)\s*(?:xây dựng|học|thực chiến|đào tạo|challenge|course)?/i,
    /thời\s*lượng[^.\n:]*[:\-]?\s*(\d{1,3})\s*(ngày|day|days|tuần|tháng)/i,
    /độ\s*dài[^.\n:]*[:\-]?\s*(\d{1,3})\s*(ngày|day|days|tuần|tháng)/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return `${match[1]} ${match[2].toLowerCase().replace("days", "ngày").replace("day", "ngày")}`;
    }
  }
  return null;
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

function buildGenericGroundedAnswer(
  bot: BotConfig,
  query: string,
  sourceText: string,
  lead: string,
  queryProfile: QueryProfile
): string {
  const offeringLabel = getOfferingLabel(bot);
  const brandName = bot.name || "bên em";
  const points = pickGroundedBusinessPoints(sourceText, queryProfile.topic, 3);
  const naturalPoints = points.map(makeNaturalSentence).filter(Boolean);

  const leadCap = lead.charAt(0).toUpperCase() + lead.slice(1);
  let opening = `Dạ ${lead} ơi, em tóm tắt phần này cho mình dễ hiểu nhé.`;
  let nextStep = `${leadCap} muốn em nói kỹ hơn phần nào trước ạ?`;

  if (queryProfile.topic === "identity") {
    const subject = extractIdentitySubject(queryProfile.raw);
    const firstPoint = naturalPoints[0] || sourceText.split(/[.\n]+/).map(makeNaturalSentence).find(Boolean);
    if (firstPoint) {
      const identityText = firstPoint.includes(" - ")
        ? firstPoint.replace(/\s+-\s+/, " được gắn với ")
        : firstPoint;
      return `Dạ ${lead} ơi, trong dữ liệu hiện tại, ${identityText}.

Em chưa thấy thêm phần giới thiệu chi tiết hơn về vai trò, tiểu sử hoặc câu chuyện của ${subject}. Nếu mình muốn, em có thể giúp tóm tắt tiếp những gì tài liệu đang nhắc về ${subject} ạ.`;
    }
    return `Dạ ${lead} ơi, hiện tại em chưa có đủ thông tin rõ ràng để giới thiệu chính xác ${subject}.

Mình có thể nạp thêm phần tiểu sử, vai trò hoặc mô tả ngắn về ${subject}, sau đó em sẽ trả lời tự nhiên và đầy đủ hơn ạ.`;
  }

  if (queryProfile.topic === "pricing") {
    opening = `Dạ ${lead} ơi, em gửi mình phần giá/chi phí đang có trong dữ liệu của ${brandName} nhé.`;
    nextStep = `${leadCap} cho em biết nhu cầu hoặc gói mình đang quan tâm để em đối chiếu đúng phần giá hơn ạ?`;
  } else if (queryProfile.topic === "shipping") {
    opening = `Dạ ${lead} ơi, phần giao hàng/vận chuyển hiện đang được hiểu như sau ạ.`;
    nextStep = `${leadCap} cho em biết khu vực nhận hàng để em kiểm tra hướng phù hợp hơn nhé?`;
  } else if (queryProfile.topic === "policy") {
    opening = `Dạ ${lead} ơi, chính sách hiện tại có các điểm chính sau ạ.`;
    nextStep = `${leadCap} đang cần kiểm tra chính sách cho trường hợp cụ thể nào để em hỗ trợ sát hơn ạ?`;
  } else if (queryProfile.topic === "howto") {
    opening = `Dạ ${lead} ơi, cách thực hiện có thể đi theo các ý chính này ạ.`;
    nextStep = `${leadCap} đang vướng ở bước nào để em hướng dẫn tiếp cho đúng nhé?`;
  } else if (queryProfile.topic === "comparison") {
    opening = `Dạ ${lead} ơi, nếu so sánh để chọn phương án phù hợp thì mình có thể nhìn theo các điểm này ạ.`;
    nextStep = `${leadCap} ưu tiên giá, tính năng hay mức phù hợp với nhu cầu để em gợi ý sát hơn ạ?`;
  } else if (queryProfile.intent === "complaint") {
    opening = `Dạ ${lead} ơi, em hiểu vấn đề này cần xử lý rõ ràng. Trước mắt mình có thể kiểm tra theo các điểm sau ạ.`;
    nextStep = `${leadCap} gửi thêm giúp em tình huống cụ thể hoặc mã đơn/thông tin liên quan để em hỗ trợ tiếp nhé?`;
  } else if (queryProfile.intent === "sales" || queryProfile.topic === "offering") {
    opening = `Dạ ${lead} ơi, ${offeringLabel} của ${brandName} có thể hiểu đơn giản như sau ạ.`;
    nextStep = `${leadCap} đang cần ${offeringLabel} cho nhu cầu nào để em tư vấn đúng lựa chọn hơn ạ?`;
  }

  const bodyBlock = naturalPoints.length === 0
    ? `${brandName} hiện có thông tin liên quan đến ${offeringLabel}, nhưng em cần thêm dữ liệu cụ thể hơn để tư vấn thật chính xác. ${leadCap} có thể nói rõ nhu cầu hoặc trường hợp đang gặp để em kiểm tra tiếp cho đúng ạ.`
    : naturalPoints.length === 1
      ? naturalPoints[0]
      : naturalPoints.slice(0, 3).map((point, index) => `${index + 1}. ${point}`).join("\n\n");

  return `${opening}

${bodyBlock}

${nextStep}`;
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
  cleaned = cleaned
    .replace(/\bhọc\s+suông\b/gi, "học lý thuyết suông")
    .replace(/\bkế\s+hoạch\b/gi, "kế hoạch");

  return cleaned;
}

function postProcessBotReply(text: string, _options?: { shouldGreet?: boolean; recentMessages?: Message[] }): string {
  return cleanBotReplyText(text);
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
  if (/^(hi|hello|helo|alo|chao|xin chao|hey|yo|em oi|bot oi|shop oi|ad oi)(\s|$)/i.test(compact)) return "greeting";
  if (/(cam on|thanks|thank you|tks|thank|ok cam on|tot qua|hay qua)/i.test(compact)) return "thanks";
  if (/(ke chuyen cuoi|noi cau vui|ke truyen vui|joke|vui len|hat cho|doc tho)/i.test(compact)) return "joke";
  if (compact.length <= 18 && /(haha|hihi|hehe|test|thu xem|ok|oke|uh|ua|wow)/i.test(compact)) return "casual";
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
  const lead = pronoun === "Anh/Chị" ? "mình" : `${pronoun} ${targetName}`;
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

const SEARCH_STOPWORDS = new Set([
  "a", "ạ", "oi", "ơi", "em", "anh", "chi", "chị", "minh", "mình", "ban", "bạn",
  "la", "là", "co", "có", "khong", "không", "duoc", "được", "vay", "vậy",
  "cho", "toi", "tôi", "toi", "cua", "của", "ben", "bên", "nay", "này",
  "do", "đó", "thi", "thì", "ve", "về", "gi", "gì", "nao", "nào", "bao",
  "nhieu", "nhiêu", "may", "mấy"
]);

type QueryProfile = {
  raw: string;
  normalized: string;
  tokens: string[];
  bigrams: string[];
  intent: string;
  emotion: string;
  topic: string;
  expectedPhase: "main" | "followup" | "bonus" | "unknown";
  durationQuestion: boolean;
  priceQuestion: boolean;
  requestedCourseDay: number | null;
  subqueries: string[];
};

function tokenizeSearchText(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
}

function getBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

function buildQueryProfile(query: string): QueryProfile {
  const normalized = normalizeSearchText(query);
  const tokens = tokenizeSearchText(query);
  const requestedCourseDay = extractRequestedCourseDay(query);
  const durationQuestion = isDurationQuestion(query);
  let topic = "general";
  if (durationQuestion) topic = "duration";
  else if (requestedCourseDay || /(lo trinh|lich hoc|lich hen|lich trinh|ngay hoc|hoc gi|noi dung ngay|tung ngay|schedule|timeline)/i.test(normalized)) topic = "timeline";
  else if (/(gia|hoc phi|chi phi|bao nhieu tien|bao gia|bang gia|price|cost|khuyen mai|uu dai|combo|goi)/i.test(normalized)) topic = "pricing";
  else if (/(ship|giao hang|van chuyen|noi thanh|ngoai tinh|delivery|shipping|thoi gian giao|phi ship)/i.test(normalized)) topic = "shipping";
  else if (/(bao hanh|doi tra|hoan tien|chinh sach|cam ket|policy|warranty|refund|return)/i.test(normalized)) topic = "policy";
  else if (/(huong dan|cach dung|su dung|bao quan|lap dat|kich hoat|ket noi|setup|how to)/i.test(normalized)) topic = "howto";
  else if (/(con hang|het hang|ton kho|available|availability|stock)/i.test(normalized)) topic = "availability";
  else if (/(la ai|ai vay|ai day|who is|nguoi nao|nhan vat|founder|ceo|tac gia|mentor)/i.test(normalized)) topic = "identity";
  else if (/(phu hop|ai nen|danh cho ai|doi tuong|avatar|khach hang nao|nen chon)/i.test(normalized)) topic = "audience";
  else if (/(ket qua|dau ra|nhan duoc|ung dung|thuc chien|loi ich|co gi|noi dung|benefit|result)/i.test(normalized)) topic = "outcome";
  else if (/(so sanh|khac gi|khac nhau|nen chon|compare|option)/i.test(normalized)) topic = "comparison";
  else if (/(san pham|dich vu|tinh nang|goi nao|product|service|feature)/i.test(normalized)) topic = "offering";

  let expectedPhase: QueryProfile["expectedPhase"] = "unknown";
  if (/(sau khoa|tiep theo|30 ngay|ngay\s*15\s*[-–]\s*44|brand playbook)/i.test(normalized)) {
    expectedPhase = "followup";
  } else if (durationQuestion || /(khoa hoc|hoc bao lau|hoc may ngay|ngay\s*1|14 ngay|15 ngay)/i.test(normalized)) {
    expectedPhase = "main";
  }

  const subqueries = normalizeChunkTags([
    query,
    `${query} ${topic}`,
    requestedCourseDay ? `ngày ${requestedCourseDay} lộ trình học nội dung bài học` : "",
    durationQuestion ? "thời lượng thời gian xử lý kéo dài bao lâu" : "",
    topic === "pricing" ? "giá chi phí báo giá bảng giá ưu đãi thanh toán" : "",
    topic === "shipping" ? "giao hàng vận chuyển phí ship thời gian giao" : "",
    topic === "policy" ? "chính sách bảo hành đổi trả hoàn tiền cam kết" : "",
    topic === "howto" ? "hướng dẫn sử dụng cách dùng cài đặt bảo quản" : "",
    topic === "identity" ? "là ai vai trò tiểu sử founder mentor chuyên gia người sáng lập" : "",
    topic === "offering" ? "sản phẩm dịch vụ tính năng gói nội dung chính" : ""
  ]);

  return {
    raw: query,
    normalized,
    tokens,
    bigrams: getBigrams(tokens),
    intent: inferSupportIntent(query),
    emotion: inferCustomerEmotion(query),
    topic,
    expectedPhase,
    durationQuestion,
    priceQuestion: /(gia|phi|bao nhieu tien|chi phi|cost|price)/i.test(normalized),
    requestedCourseDay,
    subqueries
  };
}

function scoreTextRetrieval(profile: QueryProfile, title: string, content: string, metadata = ""): number {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedContent = normalizeSearchText(content);
  const normalizedMeta = normalizeSearchText(metadata);
  const combined = `${normalizedTitle} ${normalizedContent} ${normalizedMeta}`;
  const pseudoChunk: KnowledgeChunk = {
    id: "",
    botId: "",
    sourceId: "",
    title,
    content,
    category: "faq",
    tags: metadata.split(/\s+/).filter(Boolean),
    isActive: true
  };
  const chunkMeta = getChunkMetadata(pseudoChunk);
  let score = 0;

  if (profile.normalized.length > 4) {
    if (normalizedTitle.includes(profile.normalized)) score += 5;
    if (normalizedContent.includes(profile.normalized)) score += 3;
  }

  for (const token of profile.tokens) {
    const tokenWeight = token.length >= 6 ? 1.2 : 1;
    if (normalizedTitle.split(/\s+/).includes(token)) score += 1.4 * tokenWeight;
    if (normalizedContent.includes(token)) score += 0.45 * tokenWeight;
    if (normalizedMeta.includes(token)) score += 0.8 * tokenWeight;
  }

  for (const bigram of profile.bigrams) {
    if (normalizedTitle.includes(bigram)) score += 2;
    if (normalizedContent.includes(bigram)) score += 1.2;
  }

  if (chunkMeta.topic === profile.topic) score += 4;
  if (profile.expectedPhase !== "unknown" && chunkMeta.coursePhase === profile.expectedPhase) score += 3;
  if (profile.expectedPhase !== "unknown" && chunkMeta.coursePhase !== "unknown" && chunkMeta.coursePhase !== profile.expectedPhase) score -= 2.5;

  if (profile.durationQuestion) {
    const originalCombined = `${title} ${content} ${metadata}`;
    if (extractDurationAnswer(originalCombined)) score += 8;
    if (/(thời\s*lượng|độ\s*dài|kéo\s*dài|bao\s*lâu|duration|how long)/i.test(originalCombined)) score += 3;
    if (chunkMeta.topic !== "duration" && chunkMeta.coursePhase === "followup") score -= 3;
  }

  if (profile.requestedCourseDay) {
    const originalCombined = `${title} ${content} ${metadata}`;
    if (extractDayScheduleAnswer(originalCombined, profile.requestedCourseDay)) score += 8;
    if (new RegExp(`ngày\\s*${profile.requestedCourseDay}\\b|day\\s*${profile.requestedCourseDay}\\b`, "i").test(originalCombined)) score += 4;
    if (chunkMeta.dayNumber === profile.requestedCourseDay) score += 6;
    if (chunkMeta.dayNumber && chunkMeta.dayNumber !== profile.requestedCourseDay) score -= 1.5;
  }

  if (profile.priceQuestion && /(\d+[\.,]?\d*)\s*(k|000|vnđ|vnd|đ|usd|\$)|giá|học phí|chi phí/i.test(content)) {
    score += 4;
  }

  if (profile.intent === "policy" && /(policy|chính sách|đổi trả|bảo hành|vận chuyển|shipping|warranty)/i.test(`${title} ${content} ${metadata}`)) {
    score += 3;
  }

  if (profile.intent === "complaint" && /(lỗi|hỏng|đổi trả|hoàn tiền|bảo hành|khiếu nại|support|hỗ trợ)/i.test(`${title} ${content}`)) {
    score += 3;
  }

  if (Number.isFinite(chunkMeta.priority)) score += Math.min(2, (chunkMeta.priority || 0) / 10);
  return Math.max(0, score);
}

function buildNaturalFallbackAnswer(
  bot: BotConfig,
  query: string,
  activeChunks: Array<{ chunk: KnowledgeChunk; score: number }>,
  pronoun: string,
  targetName: string,
  queryProfile = buildQueryProfile(query)
): string {
  const brandName = bot.name || bot.telegramBotUsername || "bên em";
  const lead = pronoun === "Anh/Chị" ? "mình" : `${pronoun} ${targetName}`;
  const queryWords = query.toLowerCase().split(/[\s,.;:!?()"'`]+/).filter(word => word.length >= 3);
  const durationQuestion = isDurationQuestion(query);

  const sourceText = activeChunks
    .map(item => cleanKnowledgeText(item.chunk.content))
    .filter(Boolean)
    .join(". ");
  const educationContext = isEducationContext(bot, query, sourceText);

  const requestedDay = extractRequestedCourseDay(query);
  if (educationContext && requestedDay) {
    const dayAnswer = extractDayScheduleAnswer(sourceText, requestedDay);
    if (dayAnswer) {
      return `Dạ ${lead} ơi, ngày ${requestedDay} tập trung vào phần: ${dayAnswer}.

Hiểu đơn giản, đây là phần giúp mình chuyển từ học sang triển khai thực tế, để có kế hoạch rõ hơn cho các bước tiếp theo.

${lead.charAt(0).toUpperCase() + lead.slice(1)} muốn em nói tiếp ngày ${requestedDay + 1} hoặc tóm tắt cả lộ trình theo từng ngày không ạ?`;
    }
  }

  const durationSummary = extractCourseDurationSummary(sourceText);
  const asksDurationConflict = durationQuestion && /(30|ba muoi|muoi lam|15|chac|khong em|thay)/i.test(normalizeSearchText(query));
  if (educationContext && asksDurationConflict && (durationSummary.mainDuration || durationSummary.followUpPlan)) {
    const mainDuration = durationSummary.mainDuration || extractDurationAnswer(sourceText) || "thời lượng chính trong tài liệu";
    const followUp = durationSummary.followUpPlan || "kế hoạch triển khai tiếp theo";
    return `Dạ đúng rồi ${lead} ơi, mình đang thấy hai mốc khác nhau nên dễ bị nhầm ạ.

Phần khóa học chính là ${mainDuration}.

Còn ${followUp} là phần kế hoạch/triển khai sau giai đoạn học chính, không phải thời lượng học chính.

Nếu ${lead} hỏi “học bao lâu” thì câu trả lời nên hiểu là ${mainDuration}. Còn nếu hỏi “sau khóa học làm tiếp gì” thì mới nói tới phần ${followUp}.`;
  }

  const sentences = sourceText
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 18);

  if (durationQuestion) {
    const duration = extractDurationAnswer(sourceText);
    if (duration) {
      if (!educationContext) {
        return `Dạ ${lead} ơi, thời gian hiện có trong dữ liệu là ${duration} ạ.

Em hiểu đây là mốc thời gian liên quan đến phần mình đang hỏi. Nếu ${lead} cho em biết thêm trường hợp cụ thể, em sẽ đối chiếu kỹ hơn để tránh nhầm với các mốc khác trong tài liệu nhé.`;
      }
      return `Dạ ${lead} ơi, khóa học này kéo dài ${duration} ạ.

Trong thời gian đó, nội dung học đi theo hướng thực chiến để mình từng bước nắm cách tạo nội dung, xây hệ thống bán hàng và ứng dụng AI vào công việc.

${lead.charAt(0).toUpperCase() + lead.slice(1)} muốn em nói thêm lộ trình học trong ${duration} này gồm những phần nào không ạ?`;
    }
  }

  const selected = sentences
    .map(sentence => {
      const lower = sentence.toLowerCase();
      const score = queryWords.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0);
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)
    .filter(item => item.score > 0)
    .slice(0, 4)
    .map(item => item.sentence);

  const basePoints = selected.length > 0 ? selected : sentences.slice(0, 4);
  const isCourseQuestion = /kh[oó]a|course|h[oọ]c|train|đ[aà]o t[aạ]o/i.test(query);
  const isPriceQuestion = /gi[aá]|bao nhi[eê]u|ph[ií]|cost|price/i.test(query);
  const intent = inferSupportIntent(query);
  const emotion = inferCustomerEmotion(query);
  const shouldUseCourseComposer = educationContext && (isCourseQuestion || durationQuestion || !!requestedDay);

  if (!shouldUseCourseComposer) {
    return buildGenericGroundedAnswer(bot, query, sourceText, lead, queryProfile);
  }

  if (isCourseQuestion && educationContext && !durationQuestion && !requestedDay) {
    const duration = extractDurationAnswer(sourceText);
    const naturalPoints = pickNaturalCoursePoints(sourceText, 3);
    const pointBlock = naturalPoints.length
      ? naturalPoints.map((point, index) => `${index + 1}. ${point}`).join("\n\n")
      : [
        "1. Khóa học đi theo hướng thực chiến, giúp mình biết cách tạo nội dung, xây hệ thống bán hàng và ứng dụng AI vào công việc.",
        "2. Nội dung được triển khai theo từng bước để mình dễ nắm hướng đi và áp dụng vào mục tiêu thực tế.",
        "3. Phần học phù hợp với người muốn làm việc rõ quy trình hơn, không chỉ nghe lý thuyết."
      ].join("\n\n");

    const durationLine = duration ? `\n\nThời lượng khóa học chính là ${duration}.` : "";
    const nextQuestion = intent === "sales"
      ? `${lead.charAt(0).toUpperCase() + lead.slice(1)} đang muốn học để làm content, bán hàng hay tự động hóa công việc để em tư vấn đúng hướng hơn ạ?`
      : `${lead.charAt(0).toUpperCase() + lead.slice(1)} muốn em tóm tắt lộ trình theo từng ngày hay nói kỹ phần kết quả sau khi học trước ạ?`;

    return `Dạ ${lead} ơi, khóa học của ${brandName} tập trung vào hướng thực chiến, giúp mình ứng dụng AI vào công việc thay vì chỉ học lý thuyết suông.${durationLine}

Nội dung nổi bật là:

${pointBlock}

${nextQuestion}`;
  }

  let opening = `Dạ ${lead} ơi, thông tin hiện tại là phần này tập trung vào các điểm chính sau ạ.`;
  if (intent === "complaint" || emotion === "frustrated" || emotion === "angry") {
    opening = `Dạ ${lead} ơi, em hiểu vấn đề này có thể làm mình khó chịu. Trường hợp này mình có thể xử lý theo các ý chính sau ạ.`;
  } else if (isCourseQuestion && educationContext) {
    opening = `Dạ ${lead} ơi, khóa học của ${brandName} thiên về hướng thực chiến: giúp mình biết cách tạo nội dung, xây hệ thống bán hàng và ứng dụng AI vào công việc hằng ngày, chứ không chỉ học lý thuyết suông.`;
  } else if (isPriceQuestion) {
    opening = `Dạ ${lead} ơi, phần giá hoặc chi phí sẽ phụ thuộc vào chương trình/gói đang áp dụng. Em gửi mình các điểm quan trọng trước nha.`;
  }

  const pointBlock = basePoints
    .map(humanizeKnowledgePoint)
    .filter(point => !isInstructionLikeSentence(point))
    .slice(0, 3)
    .filter(Boolean)
    .map((point, index) => `${index + 1}. ${point}`)
    .join("\n\n");
  const bodyBlock = pointBlock || "1. Khóa học tập trung vào tư duy triển khai thực tế, giúp mình biến kiến thức thành nội dung, quy trình hoặc hệ thống có thể áp dụng ngay.\n\n2. Phần học đi theo hướng cầm tay chỉ việc, phù hợp với người muốn dùng AI để làm việc nhanh hơn và rõ hướng hơn.";

  const nextStep = intent === "sales"
    ? `${lead.charAt(0).toUpperCase() + lead.slice(1)} cho em biết mục tiêu chính của mình là học để làm content, bán hàng, xây bot hay tự động hóa công việc để em gợi ý hướng phù hợp nhất ạ?`
    : intent === "complaint"
      ? `${lead.charAt(0).toUpperCase() + lead.slice(1)} gửi thêm giúp em tình huống cụ thể mình đang gặp để em hỗ trợ kiểm tra tiếp cho đúng nhé?`
      : `${lead.charAt(0).toUpperCase() + lead.slice(1)} muốn em tư vấn sâu hơn theo hướng nào trước ạ?`;

  return `${opening}

Các phần chính gồm:

${bodyBlock}

Nếu nói ngắn gọn, phần này phù hợp để ${lead} nắm được hướng đi, biết nên bắt đầu từ đâu và có thể áp dụng vào mục tiêu thực tế của mình.

${nextStep}`;
}

// Core RAG matching & AI generation call
async function generateRAGAnswer(
  bot: BotConfig, 
  query: string,
  userInfo?: { fullName?: string; username?: string; id?: string },
  replyOptions?: { shouldGreet?: boolean; recentMessages?: Message[] }
): Promise<{ text: string; sources: any[]; fallbackTriggered: boolean }> {
  // Determine gender/pronoun and first name for xưng hô
  let pronoun = "Anh/Chị";
  let targetName = "Khách Hàng";
  
  if (userInfo) {
    const defaultName = userInfo.fullName || userInfo.username || "Khách Hàng";
    const detected = getGenderAndName(defaultName);
    pronoun = detected.pronoun;
    targetName = detected.name;
  }

  const chitChatKind = detectOffTopicChitChat(query);
  if (chitChatKind) {
    const isFirstInteraction = replyOptions?.shouldGreet !== false &&
      !(replyOptions?.recentMessages || []).some(msg => msg.sender === "bot");
    return {
      text: postProcessBotReply(buildOffTopicChitChatReply(bot, query, pronoun, targetName, chitChatKind, isFirstInteraction), replyOptions),
      sources: [],
      fallbackTriggered: false
    };
  }

  // 1. Get knowledge chunks for this bot
  const botChunks = await dbGetChunks(bot.id, knowledgeChunks.filter(c => c.botId === bot.id && c.isActive));
  const botFAQs = await dbGetFAQs(bot.id, faqList.filter(f => f.botId === bot.id));
  const queryProfile = buildQueryProfile(query);
  const detectedIntent = queryProfile.intent;
  const detectedEmotion = queryProfile.emotion;
  const durationQuestion = queryProfile.durationQuestion;
  
  // 2. Multi-signal retrieval: normalized tokens, phrases, intent boosts, and metadata.
  const retrievalProfiles = queryProfile.subqueries.map(buildQueryProfile);
  const matchedChunks = botChunks.map(chunk => {
    const metadata = `${chunk.category || ""} ${(chunk.tags || []).join(" ")}`;
    const score = Math.max(...retrievalProfiles.map(profile => scoreTextRetrieval(profile, chunk.title, chunk.content, metadata)));
    return { chunk, score };
  })
  .filter(item => item.score >= 0.8)
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

  // Determine maximum match quality
  const maxScore = matchedChunks.length > 0 ? matchedChunks[0].score : 0;
  // Consider match trustworthy only if retrieval has meaningful semantic/token evidence.
  const isGoodMatch = matchedChunks.length > 0 && maxScore >= (durationQuestion ? 2.5 : 1.2);
  const activeChunks = isGoodMatch ? matchedChunks : [];
  const matchedFAQs = botFAQs.map(faq => {
    const score = Math.max(...retrievalProfiles.map(profile => scoreTextRetrieval(profile, faq.question, faq.answer, faq.category || "faq")));
    return { faq, score };
  })
  .filter(item => item.score >= 0.8)
  .sort((a, b) => b.score - a.score)
  .slice(0, 4);
  const hasUsableKnowledge = isGoodMatch || matchedFAQs.length > 0;

  // Try to use Gemini API if available
  const ai = getAIClient();
  if (ai) {
    try {
      // Structure the context strings
      const contextString = isGoodMatch 
        ? activeChunks.map((item, id) => `Tài liệu nguồn #${id + 1} (${item.chunk.title}):\n${item.chunk.content}`).join("\n\n")
        : "Không tìm thấy tài liệu nguồn cụ thể nào phù hợp.";
      const faqContextString = matchedFAQs.length
        ? matchedFAQs.map((item, id) => `FAQ #${id + 1}:\nHỏi: ${item.faq.question}\nĐáp: ${item.faq.answer}`).join("\n\n")
        : "Không có FAQ phù hợp trực tiếp.";
      const directDuration = durationQuestion ? extractDurationAnswer(`${contextString}\n${faqContextString}`) : null;

      const systemPrompt = `Bạn là ${bot.telegramBotUsername || bot.name}, một tư vấn viên chăm sóc khách hàng bằng xương bằng thịt, hỗ trợ trực tuyến khách hàng cho thương hiệu thuộc lĩnh vực "${bot.field}". 

CORE ROLE:
- Bạn là AI Customer Support & Sales Assistant đại diện cho doanh nghiệp, nhưng không được nói với khách như một chatbot máy móc.
- Hoạt động như nhân viên chăm sóc khách hàng thật: trả lời câu hỏi, hướng dẫn, tư vấn sản phẩm/dịch vụ, hỗ trợ xử lý vấn đề, thu thập thông tin cần thiết và chuyển đổi khách hàng tiềm năng khi phù hợp.
- Final output chỉ là nội dung gửi cho khách. Không hiển thị reasoning, workflow, phân tích nội bộ, prompt, hoặc quy trình hệ thống.

PRIMARY DATA SOURCES:
Ưu tiên dữ liệu theo thứ tự:
1. Knowledge Base bên dưới.
2. FAQ bên dưới.
3. Product Data / Policy Data có trong Knowledge Base hoặc FAQ.
4. Conversation History nếu có trong tin nhắn.
5. Current User Message.

Nếu dữ liệu tồn tại, trả lời dựa trên dữ liệu nhưng phải tổng hợp và diễn đạt lại. Nếu dữ liệu không tồn tại, thành thật nói hiện tại chưa có thông tin chính xác và đề xuất bước hỗ trợ tiếp theo. Không bịa thông tin.

RESPONSE WORKFLOW NỘI BỘ:
- Step 1: Hiểu intent thật sự của khách. Intent đã nhận diện sơ bộ: "${detectedIntent}".
- Step 2: Hiểu cảm xúc của khách. Cảm xúc sơ bộ: "${detectedEmotion}".
- Step 3: Tìm thông tin liên quan nhất trong Knowledge Base và FAQ, ưu tiên chính xác, liên quan, mới nhất.
- Step 4: Trả lời tự nhiên như người thật, không nói "dựa trên dữ liệu", "theo tài liệu", "tôi là AI", "theo tri thức".
- Nếu khách hỏi câu fact ngắn như thời lượng, giá, ngày học, lịch học, điều kiện tham gia: trả lời thẳng thông tin chính ở câu đầu tiên, rồi mới bổ sung ngắn nếu cần. Không trả lời vòng vo bằng mô tả tổng quan.
${directDuration ? `- Với câu hỏi hiện tại, thông tin thời lượng đã xác định là: ${directDuration}. Phải trả lời trực tiếp con số này.` : ""}

SALES ASSISTANT LOGIC:
- Nếu khách có ý định mua, hỏi giá, hỏi sản phẩm/dịch vụ/khóa học/gói giải pháp, so sánh lựa chọn hoặc hỏi khuyến mãi: hiểu nhu cầu, đề xuất giải pháp phù hợp nhất, giải thích lý do phù hợp, gợi ý bước tiếp theo.
- Không ép mua, không spam bán hàng, không phóng đại.

LEAD COLLECTION:
- Nếu thiếu thông tin quan trọng để tư vấn, chỉ hỏi từng bước một. Không hỏi quá nhiều thông tin trong một tin nhắn.
- Ưu tiên hỏi nhu cầu hoặc mục tiêu trước; chỉ hỏi tên/số điện thoại/email khi cần chuyển tư vấn hoặc chốt bước tiếp theo.

COMPLAINT HANDLING:
- Nếu khách khó chịu, báo lỗi hoặc khiếu nại: thể hiện thấu hiểu, tập trung xử lý, không tranh luận, không đổ lỗi.
- Có thể dùng câu như "Mình hiểu vấn đề bạn đang gặp" hoặc "Để mình hỗ trợ kiểm tra ngay" nhưng không lặp máy móc.

UNKNOWN ANSWERS:
- Nếu không tìm thấy thông tin: không bịa, không suy đoán. Trả lời ngắn gọn rằng hiện tại mình chưa có thông tin chính xác về nội dung này và hỏi thêm thông tin cần thiết để kiểm tra kỹ hơn.

PHONG CÁCH HỘI THOẠI & XƯNG HÔ (VÔ CÙNG QUAN TRỌNG):
- Tone giọng chủ đạo: ${bot.tone} (Dựa vào tone này để điều chỉnh cách nói thích hợp).
- Thể hiện sự nhiệt tình, ấm áp, chu đáo tuyệt đối. 
- BẮT BUỘC xưng hô "Em" (hoặc từ phù hợp với thương hiệu) và gọi người dùng bằng đại từ xưng hô tương ứng giới tính đã được xác định của họ là "${pronoun}" kèm theo tên của họ là "${targetName}" (Ví dụ gọi: "${pronoun} ${targetName}"). Không sử dụng chung chung "Quý khách" hay "anh/chị" bừa bãi khi đã biết pronoun chính xác của họ là "${pronoun}" và tên của họ là "${targetName}".
- Luôn sử dụng từ ngữ nói tự nhiên, trôi chảy, có từ kính ngữ cảm thán nhẹ nhàng ở đầu và cuối câu (Ví dụ: "Dạ em chào ${pronoun} ${targetName} ạ", "Dạ vâng ạ", "nhe ${pronoun} ${targetName}", "nhé ạ", "nha ${pronoun} ${targetName}", "ạ", v.v.).
- Tránh tuyệt đối lối hành văn rập khuôn, copy nguyên văn tài liệu nguồn, hoặc phản hồi cộc lốc như một công cụ tra cứu. Hãy diễn đạt lại thông tin một cách mượt mà, logic và sinh động như một chuyên viên giàu kinh nghiệm.
- Trước khi trả lời, hãy tự phân tích tài liệu trong đầu: khách đang hỏi gì, tài liệu có những ý nào liên quan, ý nào quan trọng nhất, rồi mới tổng hợp thành câu trả lời mới bằng lời của bạn.
- Tuyệt đối không trích xuất nguyên văn, không đưa tiêu đề chunk, mã mục, tên mục, cụm "Mục 27", "Tài liệu nguồn", "theo tri thức", "danh mục huấn luyện", hoặc bất kỳ dòng nào giống copy từ tài liệu. Khách chỉ cần nghe lời tư vấn đã được hiểu và diễn giải lại.
- Nếu tài liệu là ghi chú sản phẩm/dịch vụ/khóa học dạng gạch đầu dòng, hãy chuyển thành lời tư vấn tự nhiên: nội dung đó giúp được gì, phù hợp với ai, điểm quan trọng là gì, khách nên làm bước tiếp theo nào.
- Ở cuối câu trả lời, luôn hỏi thêm một câu mở để giữ tương tác ấm áp (Ví dụ: "Dạ không biết thông tin trên đã giúp ích được cho ${pronoun} ${targetName} chưa ạ?" hoặc "${pronoun} ${targetName} cần em hỗ trợ giải đáp thêm thông tin gì nữa không cứ bảo em nha!").

ĐỊNH DẠNG VĂN BẢN & BIỂU TƯỢNG (BẮT BUỘC):
- TUYỆT ĐỐI KHÔNG dùng bất kỳ dấu hoa thị nào (* hoặc **) hoặc bất kỳ ký tự định dạng markdown nào để bôi đậm, in nghiêng hoặc đánh dấu trong văn bản trả lời. Hãy viết chữ ở dạng thuần văn bản, tự nhiên, không chứa các ký tự * hoặc **.
- HẠN CHẾ TỐI ĐA việc sử dụng emoji (biểu tượng cảm xúc). Không dùng quá 1 emoji trong toàn bộ câu trả lời, hoặc tốt nhất là không dùng emoji nào để đảm bảo tính chuyên nghiệp và sạch sẽ cho văn bản.
- BẮT BUỘC PHẢI CHỦ ĐỘNG XUỐNG DÒNG VÀ TẠO DÒNG TRỐNG (ngắt đoạn bằng việc xuống dòng 2 lần, tức là chèn \n\n) để tạo khoảng thờ rộng rãi, thông thoáng cho tin nhắn. Mỗi đoạn văn chỉ viết siêu ngắn, gồm khoảng 1 đến 2 câu ngắn.
- Khi liệt kê các ý (dùng gạch đầu dòng - hoặc số thứ tự 1, 2, 3), BẮT BUỘC phải xuống dòng thực tế cho mỗi ý, tuyệt đối không viết dính liền tiếp nối nhau. Giữa các gạch đầu dòng liệt kê, hãy phân cách bằng một dòng trống hẳn hoi để nhìn giao diện tin nhắn thông thoáng, gọn gàng, không bị rối mắt.

Ví dụ cấu trúc tin nhắn đạt chuẩn:
Dạ em chào ${pronoun} ${targetName} ạ! Rất vui được đồng hành cùng ${pronoun} ${targetName} ngày hôm nay nha.

Hiện tại bên em đang có phần thông tin phù hợp với nhu cầu của ${pronoun} ${targetName}:

- Giúp ${pronoun} ${targetName} nắm nhanh điểm chính và hiểu phần nào phù hợp với nhu cầu hiện tại.

- Nếu cần triển khai tiếp, em có thể hỏi thêm một thông tin quan trọng rồi tư vấn bước tiếp theo cho sát hơn.

Dạ không biết thông tin trên đã rõ ràng chưa hay ${pronoun} ${targetName} cần em hỗ trợ giải đáp thêm phần nào khác nữa không ạ?

Ngôn ngữ trả lời bắt buộc: ${bot.language === 'vi' ? 'Tiếng Việt' : 'English'}.

Nguyên tắc bắt buộc:
1. Bạn CHỈ được phép tư vấn dựa trên thông tin thực tế từ "TÀI LIỆU NGUỒN" dưới đây. 
2. Nếu câu hỏi không có thông tin rõ ràng hoặc không được đề cập trong TÀI LIỆU NGUỒN, hoặc tài liệu nguồn không chứa câu trả lời trực tiếp cho câu hỏi, bạn TUYỆT ĐỐI không được tự suy diễn, bịa ra thông tin, hay bám víu trích xuất mù quáng thông tin tài liệu không liên quan. 
Thay vào đó, bạn phải đưa ra phản hồi không biết thông minh: xin lỗi lịch sự, nêu rõ thông tin này tạm thời chưa được cập nhật đầy đủ trong tài liệu tri thức đào tạo của em, tuy nhiên em đã tự động lưu lại và ghi nhận câu hỏi này để báo cáo ban quản trị tiến hành cập nhật thêm vào tri thức hệ thống cho em sớm nhất. Sau đó khuyên họ liên hệ hotline/Zalo của bên em để được tư vấn kĩ hơn.
3. Bán hàng & Báo giá: ${bot.allowPricing ? 'CHO PHÉP cung cấp đơn giá, chính sách khuyến mãi khuyến nghị có ghi trong tài liệu.' : 'Tuyệt đối KHÔNG ĐƯỢC báo giá lẻ, khéo léo nói rằng giá sản phẩm có thể thay đổi tùy chương trình và hướng dẫn khách liên hệ hotline/Zalo để được báo giá chính xác nhất.'}
4. Tư vấn kỹ thuật sản phẩm: ${bot.allowProductConsulting ? 'CHO PHÉP giải thích chi tiết, cặn kẽ về sản phẩm của thương hiệu.' : 'Chỉ giới thiệu tổng quan, không đi quá sâu vào các thông số kỹ thuật phức tạp.'}
5. Các chủ đề bị cấm trả lời tuyệt đối: "${bot.restrictedTopics}". Nếu khách vi phạm hoặc hỏi lạc đề này, hãy khéo léo hướng họ về sản phẩm và dịch vụ cốt lõi của thương hiệu một cách tế nhị.

TÀI LIỆU NGUỒN CHI TIẾT:
${contextString}

FAQ LIÊN QUAN:
${faqContextString}

Thông tin liên hệ thêm khi cần thiết:
- SĐT: ${bot.fallbackPhone}
- Web: ${bot.fallbackWebsite}
- Zalo: ${bot.fallbackZalo}

Hãy trình bày bố cục thông tin đẹp mắt, rõ ràng, dễ đọc, ngắt dòng khoa học, chuẩn phong cách nhắn tin trên Telegram.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3, // Low temperature for high precision referencing
        }
      });

      const responseText = response.text || "";
      const isFallback = !hasUsableKnowledge || 
                         responseText.includes(bot.fallbackMessage.substring(0, 15)) || 
                         responseText.toLowerCase().includes("em chưa có thông tin") || 
                         responseText.toLowerCase().includes("chưa có sẵn trong dữ liệu") ||
                         responseText.toLowerCase().includes("không tìm thấy tài liệu") ||
                         responseText.toLowerCase().includes("ghi nhận");

      if (isFallback) {
        // Report unanswered question to update knowledge base
        const cleanQuery = query.trim();
        if (cleanQuery && cleanQuery.length > 2) {
          const existingQuestion = analytics.unansweredQuestions.find(q => q.question.toLowerCase() === cleanQuery.toLowerCase());
          if (existingQuestion) {
            existingQuestion.count += 1;
            existingQuestion.timestamp = new Date().toISOString();
          } else {
            analytics.unansweredQuestions.unshift({
              question: cleanQuery,
              count: 1,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      return {
        text: postProcessBotReply(responseText, replyOptions),
        sources: [
          ...(isGoodMatch ? activeChunks.map(m => ({ id: m.chunk.id, name: m.chunk.title, score: Math.min(0.99, 0.4 + m.score) })) : []),
          ...matchedFAQs.map(m => ({ id: m.faq.id, name: `FAQ: ${m.faq.question}`, score: Math.min(0.99, 0.4 + m.score) }))
        ],
        fallbackTriggered: isFallback
      };
    } catch (err: any) {
      console.error("Gemini API Error in RAG:", err);
      // Fallback in case of call limits or network issue
    }
  }

  // --- LOCAL FALLBACK SIMULATOR (In case AI is offline / credential not configured) ---
  console.log("Using Local Simulation Engine for Query: ", query);
  
  if (!isGoodMatch && matchedFAQs.length > 0) {
    const lead = pronoun === "Anh/Chị" ? "mình" : `${pronoun} ${targetName}`;
    const topFaq = matchedFAQs[0].faq;
    return {
      text: postProcessBotReply(`Dạ ${lead} ơi, thông tin hiện tại là ${cleanKnowledgeText(topFaq.answer)}

${lead.charAt(0).toUpperCase() + lead.slice(1)} cần em giải thích kỹ hơn phần nào không ạ?`, replyOptions),
      sources: matchedFAQs.map(m => ({ id: m.faq.id, name: `FAQ: ${m.faq.question}`, score: Math.min(0.98, 0.5 + m.score) })),
      fallbackTriggered: false
    };
  }

  if (!isGoodMatch) {
    // Report unanswered question to update knowledge base
    const cleanQuery = query.trim();
    if (cleanQuery && cleanQuery.length > 2) {
      const existingQuestion = analytics.unansweredQuestions.find(q => q.question.toLowerCase() === cleanQuery.toLowerCase());
      if (existingQuestion) {
        existingQuestion.count += 1;
        existingQuestion.timestamp = new Date().toISOString();
      } else {
        analytics.unansweredQuestions.unshift({
          question: cleanQuery,
          count: 1,
          timestamp: new Date().toISOString()
        });
      }
    }

    let smartFallbackText = "";
    if (bot.tone === "friendly") {
      smartFallbackText = `Dạ em chào ${pronoun} ${targetName} ạ! Hiện tại thông tin chi tiết về câu hỏi "${query}" chưa có sẵn hoàn chỉnh trong dữ liệu tri thức của em rồi nha. Em đã ghi nhận câu hỏi này để gửi cho ban quản trị tiến hành cập nhật thêm vào tri thức hệ thống cho em sớm nhất ạ.

${pronoun === "chị" ? "Chị" : pronoun === "anh" ? "Anh" : "Anh/Chị"} cứ yên tâm nhé! Lúc này, nếu cần phản hồi hỗ trợ khẩn cấp ngay, ${pronoun} ${targetName} liên lạc trực tiếp hotline SĐT ${bot.fallbackPhone} hoặc qua Zalo ${bot.fallbackZalo} giúp em nha! ❤️`;
    } else {
      smartFallbackText = `Kính gửi ${pronoun} ${targetName}, hiện tại thông tin về câu hỏi "${query}" chưa có sẵn đầy đủ trong danh mục đào tạo của hệ thống. Chúng tôi đã ghi nhận nội dung câu hỏi để báo cáo ban quản trị tiến hành cập nhật thêm thông tin vào tri thức hệ thống sớm nhất.

Để nhận thông tin hỗ trợ chính xác lập tiếp, kính mời ${pronoun} ${targetName} liên hệ trực tiếp qua Hotline ${bot.fallbackPhone} hoặc kết nối tài khoản Zalo ${bot.fallbackZalo} để chuyên viên chăm sóc ngay ạ.`;
    }

    return {
      text: postProcessBotReply(smartFallbackText, replyOptions),
      sources: [],
      fallbackTriggered: true
    };
  }

  // Auto-compose response string locally based on matched chunk data
  const replyText = buildNaturalFallbackAnswer(bot, query, activeChunks, pronoun, targetName, queryProfile);

  return {
    text: postProcessBotReply(replyText, replyOptions),
    sources: activeChunks.map(m => ({ id: m.chunk.id, name: m.chunk.title, score: Math.min(0.98, 0.5 + m.score) })),
    fallbackTriggered: false
  };
}

// REST Endpoint for Playground test chat
app.post("/api/bots/:botId/playgroundChat", async (req, res) => {
  const { text, recentMessages = [] } = req.body;
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
      { shouldGreet: !hasPriorBotReply, recentMessages: safeRecentMessages }
    );
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bots/:botId/rag-eval", async (req, res) => {
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
    botId = "bot-aaa-farm",
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

    const aiAnswer = await generateRAGAnswer(
      bot,
      text,
      { fullName: channelFullName, username: channelUsername, id: channelUserId },
      { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
    );

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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { temperature: 0.8 }
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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: { temperature: 0.2 }
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
  });
}

startServer();
