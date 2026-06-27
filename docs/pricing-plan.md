# BalaBot — Kế hoạch định giá & dự báo chi phí

> Tỷ giá dùng trong tài liệu: **1 USD ≈ 25.400 VND** (2026). Số liệu token là ước lượng, cần hiệu chỉnh lại bằng log thật sau khi chạy.

---

## 1. Cấu trúc chi phí của bạn

| Loại | Khoản | Ai chịu | Ghi chú |
|---|---|---|---|
| **Biến đổi** (theo lượng dùng) | Gemini AI (trả lời + embedding) | **BẠN** (1 key chung) | Cost chính, tăng theo số tin nhắn |
| Cố định | Railway (backend) | Bạn | ~$5–30/tháng tùy tải |
| Cố định | Supabase | Bạn | Free tier → Pro $25/tháng khi scale |
| Cố định | Cloudflare Pages + Worker | Bạn | Miễn phí (gói free dư dùng) |
| Cố định | Tên miền | Bạn | ~$10–15/năm |

**Điểm mấu chốt:** chi phí AI tỉ lệ thuận số tin nhắn bot trả lời → **giá bán phải neo theo "số tin nhắn/tháng"**.

---

## 2. Chi phí mỗi tin nhắn (tính chi tiết)

Mỗi tin khách được bot trả lời tốn:
1. **1 lần embedding** câu hỏi (~80 token) → ~$0,00001 (không đáng kể).
2. **1 lần generation** (Gemini 2.5 Flash):
   - Input: prompt hệ thống + 5 đoạn tri thức (TOP_K=5) + lịch sử 6 lượt + câu hỏi ≈ **3.500–4.000 token**.
   - Output: câu trả lời ≈ **250–350 token** (nếu TẮT "thinking"); **800–1.000 token** (nếu để thinking mặc định).

| Kịch bản | Input | Output | Cost/tin | ≈ VND/tin |
|---|---|---|---|---|
| **Tối ưu** (tắt thinking) | 3.500 × $0,30/1M | 300 × $2,50/1M | **~$0,0018** | **~46 VND** |
| **Bảo thủ** (thinking mặc định) | 4.000 × $0,30/1M | 900 × $2,50/1M | **~$0,0035** | **~89 VND** |

➡️ **Lập kế hoạch ở mức ~50–90 VND/tin trả lời.** Embedding lúc train tri thức là chi phí 1 lần, không đáng kể (100 đoạn ≈ $0,006).

### Tối ưu quan trọng
- **Tắt "thinking"** của Gemini 2.5 Flash (`thinkingConfig: { thinkingBudget: 0 }`) — RAG đã có ngữ cảnh nên không cần suy luận dài. Cắt ~50% cost output. *(Hiện code chưa set — nên thêm.)*
- **Cho khách FREE tự dùng Gemini key của họ (BYO key):** Gemini có gói **miễn phí có giới hạn** → khách free dùng quota free của họ → **AI cost của bạn ≈ 0** cho nhóm free.

---

## 3. Bảng gói đề xuất (VND)

| | **Free** | **Starter** | **Pro** | **Business** | **Enterprise** |
|---|---|---|---|---|---|
| Giá/tháng | 0đ | **249k** | **649k** | **1.490k** | Liên hệ |
| Số bot | 1 | 3 | 10 | Không giới hạn | Custom |
| **Tin AI/tháng** (cap) | 150 *hoặc BYO key* | 3.000 | 10.000 | 30.000 | Custom |
| Kênh | 1 (Telegram) | Tất cả (TG/FB/Zalo) | Tất cả | Tất cả | Tất cả + riêng |
| Tri thức | 1 nguồn / ~30 đoạn | 10 nguồn | Không giới hạn hợp lý | Không giới hạn | Custom |
| Đặt lịch nhắc | – | ✔ | ✔ | ✔ | ✔ |
| Gỡ thương hiệu "BalaBot" | – | – | ✔ | ✔ | ✔ |
| Hỗ trợ | Cộng đồng | Email | Ưu tiên | Ưu tiên + SLA | Quản lý riêng |
| Vượt hạn mức (overage) | Khóa/nhắc nâng cấp | +79k / 1.000 tin | +59k / 1.000 tin | +39k / 1.000 tin | Custom |

> Giá theo năm: giảm ~2 tháng (trả năm = ×10).

---

## 4. Logic định giá (vì sao hợp lý)

**3 trụ:**
1. **Cost-plus (sàn):** giá phải > chi phí AI ở mức dùng *trung bình thực tế*, không phải mức cap. Đa số SMB dùng **500–1.000 tin/tháng**, xa cap → biên lợi nhuận tốt; cap chỉ chặn khách "cá biệt".
2. **Value-based (trần):** bot thay 1 phần nhân sự CSKH. 1 nhân viên ~5–8 triệu/tháng → trả 250k–1.5M/tháng cho bot 24/7 là rất rẻ với khách → có dư địa giá.
3. **Neo đối thủ:** ManyChat ~$15+/tháng/khách; nền tảng bot Việt ~200k–500k/tháng. Starter 249k nằm đúng vùng cạnh tranh.

**Quy tắc biên:**
- Mục tiêu biên gộp **≥ 70%** ở mức dùng trung bình.
- Cap đặt sao cho *nếu khách dùng hết cap* thì biên vẫn ≥ 35% (chống lỗ với khách nặng) — phần còn lại đẩy sang **overage**.
- Ví dụ Starter 249k: dùng trung bình 800 tin → AI cost ~40k–72k (16–29%). Dùng hết cap 3.000 tin → cost ~150k–270k → vẫn hòa/lời nhẹ, và overage gánh phần vượt.

---

## 5. Dự báo chi phí vận hành (3 kịch bản)

> Giả định: dùng trung bình ~800 tin/khách/tháng, chi phí ~50 VND/tin (đã tối ưu). Hosting amortized.

### Kịch bản A — 10 khách trả phí (mới khởi động)
- Doanh thu (avg Starter 249k): **~2,5 triệu/tháng**
- AI: 10 × 800 × 50 = **400k**
- Hosting: Railway ~$10 + Supabase free + Cloudflare free ≈ **~260k**
- **Chi phí ~660k → Lợi nhuận ~1,84 triệu (biên ~74%)**

### Kịch bản B — 50 khách (mix gói, avg ~350k)
- Doanh thu: **~17,5 triệu/tháng**
- AI: ~3 triệu (tính cả khách nặng)
- Hosting: Supabase Pro $25 + Railway ~$30 ≈ **~1,4 triệu**
- **Chi phí ~4,4 triệu → Lợi nhuận ~13 triệu (biên ~74%)**

### Kịch bản C — 200 khách (avg ~350k)
- Doanh thu: **~70 triệu/tháng**
- AI: ~10 triệu
- Hosting: Supabase Team + Railway lớn hơn ≈ **~2,5 triệu**
- **Chi phí ~12,5 triệu → Lợi nhuận ~57 triệu (biên ~81%)**

➡️ Mô hình lành mạnh vì **AI cost nhỏ so với giá bán**, MIỄN LÀ: (1) có **cap + overage**, (2) tắt thinking, (3) khách free **BYO key**.

---

## 6. Rủi ro & khuyến nghị triển khai

**Rủi ro lớn nhất:** khách nặng trên gói phẳng ăn mòn biên → **bắt buộc có hạn mức + overage + cảnh báo khi sắp hết hạn mức**.

**Cần làm để chạy thu phí (theo thứ tự):**
1. **Đo dùng (usage metering):** đếm tin AI/tháng theo từng khách (đã có `analytics.totalMessages`, cần tách theo customer + reset hàng tháng).
2. **Enforce hạn mức:** chặn/nhắc nâng cấp khi vượt cap.
3. **Tắt thinking** Gemini 2.5 Flash để giảm cost.
4. **Tùy chọn BYO Gemini key** cho gói Free (đã có hạ tầng config theo email/bot — chỉ cần dùng key đó trong `getAIClient`).
5. **Cổng thanh toán:** VNPay / MoMo / chuyển khoản (VN) hoặc Stripe (quốc tế).
6. **Trang Billing + nâng/hạ gói** trong app.

**Đòn bẩy biên lợi nhuận:**
- Cache câu hỏi lặp (FAQ) → bớt gọi AI.
- Rate-limit để chặn lạm dụng.
- Gói cao có thể cho BYO key để bạn khỏi gánh AI cost ở khách dùng cực nặng.
