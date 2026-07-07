# Bộ nghiệm thu hành vi trợ lý bán hàng — 20 kịch bản

Chạy tay qua Playground (bot test có tài liệu chứa: tên sản phẩm + giá + chính sách ship).
Mỗi kịch bản chấm ĐẠT/TRƯỢT theo cột "Hành vi kỳ vọng". KHÔNG chấm câu chữ, chấm HÀNH VI.

Cấu hình khi test: mục tiêu ghi ở cột Goal. "—" = goal nào cũng vậy.

| # | Goal | Khách nhắn (theo thứ tự) | Hành vi kỳ vọng |
|---|------|--------------------------|------------------|
| 1 | lead | "sản phẩm X giá bao nhiêu" (tin đầu) | Nói giá ngay câu đầu. KHÔNG xin SĐT (tin đầu). |
| 2 | lead | (tiếp #1) "còn màu đỏ không" | Trả lời; nếu có mời SĐT thì kèm lý do tự nhiên, không sống sượng. |
| 3 | lead | "ib gia" (tin đầu) | Hiểu là hỏi giá (không hỏi lại "ý bạn là gì"). |
| 4 | lead | (sau 2-3 lượt hỏi sâu) "mua thế nào nhỉ" | Buying signal ấm/nóng → mời để lại SĐT kèm lý do. |
| 5 | lead | (tiếp #4) "0912345678 nhé" | Cảm ơn + xác nhận đã ghi nhận + nói bước tiếp theo. KHÔNG hỏi xin lại số. |
| 6 | lead | (tiếp #5) hỏi thêm 2 câu bất kỳ | Cả 2 câu đều KHÔNG xin lại SĐT. |
| 7 | lead | (hội thoại mới) "cho mình hỏi", bot đáp, "thôi không cần số đâu, tư vấn thôi" | Tôn trọng, không nài xin số ở các lượt sau. |
| 8 | lead | "hàng về chưa v" (tài liệu không có thông tin tồn kho) | Nói chưa có thông tin + mời để lại liên hệ (đúng trường hợp được phép). |
| 9 | order | "lấy cho mình 2 cái X" | Xác nhận món + số lượng, hỏi tên/SĐT/địa chỉ — TỪNG BƯỚC, không dồn 1 lượt. |
| 10 | order | (tiếp #9) "Nam, 0987654321, 12 Lê Lợi HN" | Tóm tắt đơn (món, số lượng, người nhận, địa chỉ) để xác nhận. |
| 11 | order | "đắt thế, bớt không" | Xử lý mềm mỏng theo tài liệu (nếu có chính sách), không hứa bừa giảm giá. |
| 12 | consult | "sản phẩm X giá bao nhiêu" | Trả lời giá. KHÔNG CTA, KHÔNG xin SĐT. |
| 13 | consult | "nên chọn X hay Y" | So sánh trung lập theo tài liệu, không thúc mua. |
| 14 | — | "bên mày làm ăn như * , giao chậm" | Câu đầu xoa dịu/nhận lỗi; không chào bán trong lượt này. |
| 15 | — | "hello" (tin đầu) | Chào thân thiện ngắn; không xin SĐT, không dài dòng. |
| 16 | — | "thời tiết nay đẹp nhỉ" | Đáp xã giao ngắn, kéo nhẹ về chủ đề shop, không ép. |
| 17 | — | "cái đó bảo hành sao" (sau khi nói về X) | Hiểu "cái đó" = X (không hỏi lại từ đầu). |
| 18 | — | hỏi 1 điều HOÀN TOÀN không có trong tài liệu | Nói chưa có thông tin — KHÔNG bịa. |
| 19 | — | 3 câu liên tiếp bất kỳ | 3 câu mở đầu KHÔNG giống hệt nhau (không lặp mẫu "Dạ anh X ơi..."). |
| 20 | lead | khách nhắn số RÁC "012345" | KHÔNG lưu lead (kiểm tra tab Khách tiềm năng không có bản ghi). |

## Checklist hệ thống sau khi test hội thoại

- [ ] Kịch bản #5: lead xuất hiện trong tab "Khách tiềm năng" đúng tên/SĐT/kênh.
- [ ] Nếu đã cấu hình Chat ID: Telegram chủ shop nhận được "🔥 LEAD MỚI".
- [ ] Đổi trạng thái lead trên dashboard → F5 vẫn giữ (đã chạy bot-leads.sql).
- [ ] Kênh Botcake thật (bot-85wdtpqyv): nhắn "giá bao nhiêu" từ nick khác → bot trả lời như cũ, không chậm bất thường (+~1s chấp nhận).
- [ ] Railway logs không có error mới lặp lại (warn fail-open [Understand] thi thoảng = chấp nhận).
