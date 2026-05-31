const DEFAULT_BACKEND_BASE_URL = "https://antiantiai.xyz/balabot";

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-balabot-secret",
    ...extra,
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    }),
  });
}

function getIntegrationSecret(request) {
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const headerSecret = (request.headers.get("x-balabot-secret") || "").trim();
  return headerSecret || bearer;
}

function getBackendBaseUrl(env) {
  return (env.BALABOT_BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, "");
}

function normalize(text = "") {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function cleanText(text = "") {
  return text
    .replace(/\r/g, " ")
    .replace(/[_]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoisyKnowledge(text = "") {
  const compact = text.replace(/\s/g, "");
  if (!compact) return false;
  const unusual = compact.match(/[^\dA-Za-zÀ-ỹĐđ.,:;!?()[\]/"'%+-]/gu) || [];
  return unusual.length >= 4 || unusual.length / compact.length > 0.035;
}

function stripDecorations(text = "") {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDisplayName(fullName = "", username = "") {
  const source = stripDecorations(fullName || username || "");
  const generic = normalize(source);
  if (!source || /^(khach|khach facebook|facebook user|guest|user)$/i.test(generic.trim())) return "";

  const honorifics = new Set(["anh", "chi", "co", "chu", "ban", "em", "mr", "ms", "mrs"]);
  const parts = source
    .replace(/^@/, "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(part => {
      const normalized = normalize(part);
      return part.length > 1 && !part.includes("@") && !/^\d+$/.test(part) && !honorifics.has(normalized);
    });

  return parts.length ? parts[parts.length - 1] : "";
}

function inferCustomer(fullName = "", username = "", messageText = "") {
  const name = getDisplayName(fullName, username);
  const combined = normalize(`${messageText} ${fullName} ${username}`);

  if (/\bchi\s+(muon|can|hoi|dang|thich|la)\b/.test(combined) || /\b(minh|em)\s+la\s+chi\b/.test(combined) || /\bem\s+gai\b/.test(combined)) {
    return { pronoun: "chị", name, label: name ? `chị ${name}` : "chị", confidence: "high" };
  }
  if (/\banh\s+(muon|can|hoi|dang|thich|la)\b/.test(combined) || /\b(minh|em)\s+la\s+anh\b/.test(combined) || /\bem\s+trai\b/.test(combined) || /\bchu\s+(muon|can|hoi|dang|la)\b/.test(combined)) {
    return { pronoun: "anh", name, label: name ? `anh ${name}` : "anh", confidence: "high" };
  }

  const parts = normalize(stripDecorations(`${fullName} ${username}`)).split(/\s+/).filter(Boolean);
  const female = new Set(["thi", "my", "vy", "nhi", "hang", "thu", "mai", "trang", "lan", "huong", "linh", "yen", "phuong", "nga", "ngoc", "hoa", "thao", "hong", "quynh", "trinh", "hien", "loan", "tram", "thuy", "uyen"]);
  const male = new Set(["dinh", "duc", "duy", "hai", "son", "hung", "minh", "tuan", "hoang", "phong", "phuc", "quang", "long", "nam", "viet", "toan", "quoc", "thang", "tung", "cuong", "thanh", "kien", "huy", "dat", "trung", "dung", "quan", "khoa", "bao", "khang"]);

  if (parts.slice(1, -1).includes("thi")) return { pronoun: "chị", name, label: name ? `chị ${name}` : "chị", confidence: "high" };
  if (parts.slice(1, -1).some(part => part === "van" || part === "dinh")) return { pronoun: "anh", name, label: name ? `anh ${name}` : "anh", confidence: "high" };

  let femaleScore = 0;
  let maleScore = 0;
  parts.forEach((part, idx) => {
    const weight = idx === parts.length - 1 ? 3 : 1;
    if (female.has(part)) femaleScore += weight;
    if (male.has(part)) maleScore += weight;
  });

  if (maleScore > femaleScore) return { pronoun: "anh", name, label: name ? `anh ${name}` : "anh", confidence: "medium" };
  if (femaleScore > maleScore) return { pronoun: "chị", name, label: name ? `chị ${name}` : "chị", confidence: "medium" };
  return { pronoun: "neutral", name, label: name || "mình", confidence: "low" };
}

function isSmallTalk(text) {
  const q = normalize(text).replace(/\s+/g, " ").trim();
  return /^(hi|hello|alo|alooo|hey|chao|xin chao|em oi|bot oi)[!.?\s]*$/.test(q)
    || /\b(test|thu bot|bot la ai|em la ai|cam on|thanks|ok|oke|haha|hihi)\b/.test(q)
    || q.length <= 8;
}

function rankChunks(query, chunks = [], faqs = []) {
  const normalizedQuery = normalize(query);
  const words = normalizedQuery
    .split(/[\s,.!?;:()[\]"'/-]+/)
    .filter(word => word.length > 1 && !["minh", "cho", "hoi", "voi", "nha", "vay", "em", "anh", "chi"].includes(word));

  const docs = [
    ...chunks.filter(chunk => chunk.isActive !== false).map(chunk => ({
      id: chunk.id,
      title: chunk.title || "Tri thức",
      content: chunk.content || "",
      type: "chunk",
    })),
    ...faqs.map(faq => ({
      id: faq.id,
      title: faq.question || "FAQ",
      content: faq.answer || "",
      type: "faq",
    })),
  ];

  return docs
    .map(doc => {
      const haystack = normalize(`${doc.title} ${doc.content}`);
      let score = 0;
      for (const word of words) {
        if (haystack.includes(word)) score += doc.type === "faq" ? 0.35 : 0.25;
      }
      if (haystack.includes(normalizedQuery)) score += 2;
      return { doc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function summarizeLocal(bot, query, customer, ranked) {
  const domain = bot.field || bot.description || "nội dung bên em đang hỗ trợ";
  const label = customer.label;
  const customerLead = customer.confidence === "low" ? "mình" : label;
  const customerLeadCap = customer.confidence === "low" ? "Mình" : label.charAt(0).toUpperCase() + label.slice(1);

  if (isSmallTalk(query)) {
    return `Dạ em đây ạ. ${customerLeadCap} muốn em tư vấn lộ trình, nội dung học hay cách ứng dụng AI vào công việc trước ạ?`;
  }

  if (!ranked.length) {
    return `Dạ câu này em chưa đủ cơ sở để khẳng định chính xác ạ.

${customerLeadCap} nói rõ hơn mục tiêu, trình độ hiện tại hoặc vấn đề đang muốn giải quyết nhé. Em sẽ dựa vào đó để tư vấn sát hơn ạ.`;
  }

  const haystack = normalize(ranked.map(({ doc }) => `${doc.title} ${doc.content}`).join(" "));
  const points = [];
  if (/(14 ngay|lo trinh|thoi luong|do dai|module|bai hoc)/.test(haystack)) {
    points.push("lộ trình học được chia theo từng phần để dễ đi từ nền tảng đến thực hành");
  }
  if (/(thuong hieu|ca nhan|dinh vi|khach hang ly tuong|noi dau|mong muon)/.test(haystack)) {
    points.push("xây dựng thương hiệu cá nhân, xác định khách hàng mục tiêu, nỗi đau và mong muốn của họ");
  }
  if (/(hook|cta|content|thong diep|giao tiep|phong cach)/.test(haystack)) {
    points.push("viết thông điệp, hook, CTA và chọn phong cách giao tiếp để nội dung có sức hút hơn");
  }
  if (/(ai|tu dong|tro ly|ung dung|cong viec)/.test(haystack)) {
    points.push("dùng AI như một trợ lý để tối ưu công việc, nhưng vẫn giữ phần tư duy và dấu ấn cá nhân");
  }
  if (!points.length) {
    points.push(`các phần thực hành chính liên quan đến ${domain}`);
    points.push("cách biến kiến thức thành hành động cụ thể thay vì chỉ học lý thuyết");
  }

  const list = points.slice(0, 4).map((point, index) => `${index + 1}. ${point}`).join("\n\n");

  return `Dạ khóa học này tập trung vào việc giúp ${customerLead} biết cách dùng AI và tư duy nội dung để xây dựng hệ thống làm việc rõ ràng hơn ạ.

Những phần chính gồm:

${list}

Nếu nói ngắn gọn, khóa học phù hợp với người muốn học AI theo hướng thực chiến: biết mình cần làm gì, viết gì, bán gì và dùng AI để tiết kiệm thời gian hơn.

${customerLeadCap} muốn em tư vấn theo mục tiêu làm content, bán hàng, xây bot hay tự động hóa công việc trước ạ?`;
}

async function askGemini(env, bot, query, customer, ranked) {
  if (!env.GEMINI_API_KEY || !ranked.length) return null;

  const context = ranked
    .map(({ doc }, idx) => `Nguồn ${idx + 1} - ${doc.title}:\n${cleanText(doc.content)}`)
    .join("\n\n");

  const prompt = `Bạn là trợ lý tư vấn của bot "${bot.name}" trong lĩnh vực "${bot.field}".

Khách Facebook:
- Tên hiển thị an toàn: ${customer.name || "chưa có"}
- Xưng hô nên dùng: ${customer.pronoun === "neutral" ? "mình/bạn, không gọi anh/chị khách" : customer.label}
- Độ tin cậy nhận diện giới tính: ${customer.confidence}

Yêu cầu trả lời:
- Tiếng Việt tự nhiên, thông minh, giống tư vấn viên thật.
- Không gọi "anh/chị khách".
- Nếu chưa chắc giới tính, dùng "mình" hoặc tên riêng.
- Không bê nguyên tài liệu. Hãy xử lý thông tin trước rồi tổng hợp thành ý dễ hiểu.
- Tuyệt đối không nói các cụm như "theo tài liệu", "theo tri thức", "theo nguồn", "dữ liệu huấn luyện", "nội dung liên quan nhất", "nguồn 1", "mục 7".
- Không liệt kê tên chunk, tên mục, mã mục hoặc tiêu đề tài liệu. Chỉ trả lời như một tư vấn viên đã hiểu sản phẩm.
- Không dùng markdown đậm/nghiêng, không emoji.
- Tin nhắn ngắn vừa phải, chia đoạn thoáng.
- Cuối câu hỏi một câu mở để dẫn khách tiếp tục.

Tri thức của bot:
${context}

Câu khách hỏi: ${query}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35 },
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text).join("").trim() || null;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

async function handleBotpressReply(request, env) {
  const configuredSecret = env.BOTPRESS_API_SECRET;
  if (configuredSecret && getIntegrationSecret(request) !== configuredSecret) {
    return json({ error: "Unauthorized integration request" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const botId = (body.botId || "bot-aaa-farm").toString();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const fullName = body.fullName || body.name || "";
  const username = body.username || body.userId || "";

  if (!botId) return json({ error: "Missing botId" }, 400);
  if (!text) return json({ error: "Missing text" }, 400);

  const base = getBackendBaseUrl(env);
  const [bot, chunks, faqs] = await Promise.all([
    getJson(`${base}/api/bots/${encodeURIComponent(botId)}`),
    getJson(`${base}/api/bots/${encodeURIComponent(botId)}/chunks`),
    getJson(`${base}/api/bots/${encodeURIComponent(botId)}/faqs`),
  ]);

  const customer = inferCustomer(fullName, username, text);
  const ranked = rankChunks(text, chunks, faqs);
  const aiReply = await askGemini(env, bot, text, customer, ranked);
  const reply = aiReply || summarizeLocal(bot, text, customer, ranked);

  return json({
    reply,
    text: reply,
    botId,
    channel: "botpress-facebook",
    memorySource: "balabot-customer-bot",
    customer,
    sources: ranked.slice(0, 3).map(({ doc, score }) => ({
      id: doc.id,
      name: doc.title,
      score: Math.min(0.99, score),
    })),
    fallbackTriggered: !ranked.length && !isSmallTalk(text),
  }, 200, {
    "x-balabot-forwarded-to": "worker-rag-customer-memory",
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({});

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "aaa-balabot-api",
        mode: "worker-rag-customer-memory",
        backend: getBackendBaseUrl(env),
      });
    }

    if (url.pathname === "/api/integrations/botpress/reply" && request.method === "POST") {
      return handleBotpressReply(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
};
