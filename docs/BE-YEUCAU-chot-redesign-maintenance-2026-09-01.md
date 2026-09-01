# Redesign Maintenance — 6 câu hỏi cần chốt trước khi FE bắt tay code

**Ngày:** 01/09/2026
**Bối cảnh:** Đã đọc bản spec gộp ý kiến mentor + nhóm (2 luồng A/hao mòn — B/lỗi
tenant). Đồng ý với hướng thiết kế tổng thể. Trước khi FE code theo, cần chốt 6 câu hỏi
mà chính spec cũng tự liệt là chưa quyết (mục Phụ lục A).

---

## 6 câu hỏi + đề xuất từ phía FE

| # | Câu hỏi | Đề xuất FE | Vì sao |
|---|---|---|---|
| 1 | Hoá đơn Luồng A (hao mòn) có hiện số tiền cho tenant xem không, hay chỉ ảnh? | Hiện số tiền dạng **thông tin tham khảo**, không phải "cần trả" | Minh bạch — tenant thấy hoá đơn có ảnh mà không thấy số tiền dễ thắc mắc |
| 2 | Deadline tự sửa (Luồng B, nhánh tenant tự sửa) mặc định bao nhiêu ngày? | Để **manager tự nhập mỗi lần**, gợi ý 14 ngày làm giá trị mặc định gợi ý sẵn trên form | Mỗi loại hư khác nhau, hardcode cứng thì đổi lại phải sửa code |
| 3 | Ai verify tenant đã tự sửa xong — chỉ manager xác nhận bằng mắt, hay cần ảnh? | Bắt tenant **upload ảnh bằng chứng** qua app trước, manager duyệt từ xa | Tái dùng được API upload ảnh multipart đã có sẵn, quản lý không phải đến tận nơi mới xác nhận được |
| 4 | Ticket cũ đang `REJECTED` khi migrate thì chuyển sang status nào? | Không phải quyết định của FE — nhưng xin BE xác nhận rõ để FE viết fallback đúng | FE cần biết trước để mapper không hiển thị sai/crash với ticket cũ |
| 5 | `PLUMBING`/`ELECTRICAL` (vòi nước rò, ổ cắm hỏng) có tính là "nội thất" thuộc Maintenance không? | **Đề xuất giữ trong phạm vi Maintenance** | Đây là thiết bị có sẵn trong phòng đang hư, đúng tinh thần "nội thất đang hư" — loại ra thì tenant không biết báo ở đâu |
| 6 | `estimatedDamageAmount` (Luồng B) — ai chốt số tiền trừ cọc, lúc reject-fault hay lúc checkout? | Manager nhập **ước tính** ngay lúc `reject-fault` (tenant biết ngay), số cuối có thể điều chỉnh lúc checkout | Khớp với `CheckoutSettlement` đã có sẵn, chỉ cần ghi rõ trên UI đây là số ước tính |

**Ưu tiên chốt trước 2 câu #1 và #5** — hai câu này ảnh hưởng trực tiếp tới UI màn tạo
yêu cầu và màn hiển thị hoá đơn phía FE, cần biết sớm nhất để không phải sửa lại giữa
chừng. 4 câu còn lại có thể chốt song song trong lúc FE code Phase 1 (Luồng A).

---

## Tình trạng phía FE

- Đã dọn xong 1 khoản nợ kỹ thuật độc lập (không phụ thuộc BE): đồng bộ lại
  `TenantMaintenanceScreen.tsx` (màn quản lý xem bảo trì theo từng khách) về đúng bộ
  status/category dùng chung toàn app — trước đó màn này tự định nghĩa bộ status riêng,
  lệch khỏi thực tế.
- Chưa code gì thêm cho luồng mới — đang chờ BE ship code thật (hiện tại mới có
  spec Markdown, chưa có dòng code nào trong repo BE).
