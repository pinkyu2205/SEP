# Kịch bản demo full luồng — Báo hỏng "Sự cố khác" (không gắn thiết bị)

**Ngày viết:** 2026-07-30 · Riêng cho nhánh **"Sự cố khác (sàn, tường, cửa…)"** — khác nhánh quét QR/chọn thiết bị ở chỗ: bắt buộc chọn danh mục lúc tạo, và **không có gợi ý số tiền bồi thường theo khấu hao** (vì không có `equipmentId` để tra giá/bảo hành — manager phải tự thoả thuận và nhập tay). Bao gồm luôn các case access-control vừa vá xong (30/07 tối).

## Tài khoản dùng

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Tenant chính | `0352393203` / `123456` | Nguyễn Hoàng Ngọc Sơn — phòng 101 (room 257), property 68 |
| Manager đúng quyền | `manager01` / `123456` | Quản property 68 |
| Tenant khác (để test access-control) | `tenant02` / `123456` | Không liên quan property 68 |
| Manager khác (để test access-control) | `manager02` / `123456` | Không quản property 68 |
| Host (nhận escalation) | `owner01` / `123456` | Bất kỳ owner01-06 đều nhận được — hệ thống broadcast cho toàn bộ Host |

Ảnh minh chứng: chụp/chọn ảnh bất kỳ khi app yêu cầu.

---

## Cảnh 1 — Tạo sự cố khác, danh mục bắt buộc ngay lúc tạo

1. Đăng nhập **tenant** Sơn. Vào **Sửa chữa** → bấm nút tròn (+) góc dưới phải mở menu → **📝 Sự cố khác (sàn, tường, cửa…)**.
2. Màn tạo yêu cầu hiện 4 lựa chọn danh mục bắt buộc: **🧱 Kết cấu**, **⚡ Điện cố định**, **🚰 Nước / WC**, **🔘 Khác** — chọn **🚰 Nước / WC** (vd sự cố "bồn cầu tắc").
3. Không chọn danh mục thì nút gửi bị khoá — minh hoạ ngay: thử bấm Gửi khi chưa chọn → báo lỗi "Vui lòng chọn danh mục hư hỏng."
4. Chọn danh mục → nhập tiêu đề (placeholder tự gợi ý theo danh mục, vd "Vòi rò / bồn cầu tắc...") → chụp ≥1 ảnh hiện trạng → Gửi. Ticket mới ở **Chờ duyệt**.

---

## Cảnh 2 — Manager duyệt: dropdown KHÔNG còn "Trang thiết bị/Nội thất" (fix #4)

1. Đăng nhập **manager01**, mở ticket vừa tạo.
2. Phần "Phân loại sự cố" hiện sẵn danh mục Sơn đã chọn (Nước/WC) kèm dòng "Khách thuê đã chọn khi tạo yêu cầu — bạn vẫn có thể đổi." Mở dropdown ra: **chỉ còn 4 lựa chọn** Kết cấu/Điện/Nước-WC/Khác — **không còn "Trang thiết bị" / "Nội thất"** nữa (trước đây vẫn chọn được, gây lệch báo cáo — nay BE+FE đã chặn cả 2 phía).
3. Bấm **✅ Duyệt yêu cầu**.

---

## Cảnh 3 — Sửa xong, chủ nhà chịu phí → đóng bình thường

1. **Manager**: **🛠 Báo sửa xong** → thêm ảnh AFTER → để mặc định "Chủ nhà chịu phí" → gửi.
2. **Tenant**: mở ticket → **✅ Đã OK — xác nhận hoàn tất**.
3. Kết quả: **Hoàn tất**, không hoá đơn.

---

## Cảnh 4 — Khách chịu phí, khiếu nại → manager tự nhập số tiền chốt lại (khác nhánh thiết bị)

1. **Tenant**: tạo thêm 1 "sự cố khác" mới (vd danh mục **⚡ Điện cố định**, "Ổ cắm cháy do khách tự đấu điện").
2. **Manager**: duyệt → Báo sửa xong → bật "Khách chịu phí", chọn nguyên nhân **Sử dụng sai cách** → **tự nhập tay** số tiền (vd 300.000đ) — lưu ý màn này **không có** ô "gợi ý theo khấu hao còn lại" như bên thiết bị, vì ticket không có `equipmentId` để tra giá gốc/ngày bảo hành.
3. **Tenant**: bấm **↩ Khiếu nại số tiền** → nêu lý do.
4. **Manager**: vào section **💰 Bồi thường chờ xử lý** đầu màn Bảo trì → mở ticket → card "⚠️ Khoản bồi thường chưa xử lý" → sửa số tiền (vd 200.000đ), ghi chú lý do thoả thuận lại → **🧾 Chốt thu & phát hóa đơn**.
5. Kết quả: hoá đơn phát ra, khoản treo biến mất.

---

## Cảnh 5 — Vòng từ chối 2 lần → escalation tới Host (đã sửa gửi đúng người)

1. **Tenant**: tạo 1 "sự cố khác" khác (danh mục **🧱 Kết cấu**).
2. **Manager**: duyệt → Báo sửa xong.
3. **Tenant**: **↩ Chưa ổn — gửi phản hồi** (từ chối lần 1, kèm lý do + ảnh).
4. **Manager**: **Giữ kết quả** → bắt buộc nhập lý do (vd "Thợ đã kiểm tra lại") → xác nhận. Ticket quay lại Chờ nghiệm thu.
5. **Lặp lại bước 3-4 một lần nữa** (từ chối lần 2, giữ kết quả lần 2 với lý do khác) — đây là lần kích hoạt escalation (`reopenCount >= 2`).
6. **Đăng nhập `owner01`** (hoặc bất kỳ owner02-06) → vào mục Thông báo của Host Portal → thấy thông báo mới **"Ticket bảo trì bị từ chối nhiều lần"** ưu tiên **HIGH**, nội dung nêu đúng ticket vừa test — minh chứng escalation giờ tới đúng Host thay vì rơi vào chỗ không ai đọc được như trước.
7. **Tenant**: bấm **✅ Đã OK — xác nhận hoàn tất** để đóng ticket, kết thúc kịch bản.

---

## Cảnh 6 — Tenant tự hủy ticket tạo nhầm (tính năng mới — Gap #5)

1. **Tenant**: tạo 1 "sự cố khác" bất kỳ, KHÔNG cần chờ manager xử lý.
2. Ngay khi ticket còn **Chờ duyệt**, tenant tự vào chi tiết ticket → bấm **Hủy yêu cầu này** → xác nhận.
3. Kết quả: ticket chuyển thẳng **CANCELLED**, timeline ghi "Khách thuê tự hủy yêu cầu" — không cần đợi manager.
4. **Đối chứng:** tạo 1 ticket khác, để **manager duyệt lên APPROVED trước**, rồi tenant thử bấm Hủy → bị chặn với lý do "Chỉ hủy được yêu cầu đang chờ duyệt (PENDING)" — đúng thiết kế: sau khi manager đã bắt tay xử lý thì phải qua manager mới hủy được.

---

## Cảnh 7 — Access control: không ai đụng được ticket không phải của mình

**Chuẩn bị:** dùng lại 1 ticket bất kỳ của Sơn ở các cảnh trên (đã CLOSED hay đang mở đều test được cho case xem/upload).

1. Đăng nhập **tenant02** → thử mở trực tiếp chi tiết ticket của Sơn (nếu app có cách nhập ID thủ công/deep link) hoặc mô tả bằng lời: gọi thẳng API `GET /maintenance/{id}` với ticket của Sơn → bị từ chối "Bạn không có quyền thao tác trên yêu cầu này" — tenant02 không tài nào đọc được tên/SĐT/ảnh/chi phí của Sơn.
2. **tenant02** thử upload ảnh vào ticket đó → cũng bị chặn tương tự.
3. Đăng nhập **manager02** → thử duyệt/báo sửa xong/hủy 1 ticket đang PENDING của Sơn (property 68) → bị chặn "Bạn không có quyền thao tác trên yêu cầu này" dù đúng role MANAGER — vì không quản lý property đó.
4. Đăng nhập lại **manager01** → thao tác y hệt bước 3 → thành công bình thường.
5. (Phụ, không bắt buộc demo trên UI) **Sơn tự upload ảnh AFTER vào ticket của mình** → bị chặn "Khách thuê chỉ được upload ảnh BEFORE hoặc REJECT" — ảnh AFTER là bằng chứng nghiệm thu, chỉ manager mới được thêm.

Case này khó dựng đẹp trên UI (app không có ô nhập ticket ID của người khác để "thử xâm nhập" — đúng ý, vì đó chính là thứ đang được bảo vệ), nên phần này nên trình bày bằng lời + cho xem kết quả gọi API trực tiếp (Postman/curl) như một minh chứng "đã kiểm thử bảo mật" thay vì thao tác qua giao diện.

---

## Bảng tổng kết case ↔ cảnh

| Cảnh | Minh hoạ |
|---|---|
| 1 | Category bắt buộc lúc tạo (không có equipmentId) |
| 2 | Fix #4 — duyệt không cho chọn Trang thiết bị/Nội thất khi không có thiết bị |
| 3 | Luồng chuẩn không phí |
| 4 | Bồi thường không thiết bị — manager tự nhập tay (không gợi ý khấu hao) + khiếu nại → chốt lại |
| 5 | Vòng reject + escalation tới đúng Host (fix broadcast ROLE_OWNER) |
| 6 | Tenant tự hủy ticket PENDING (Gap #5) |
| 7 | Access control chéo tài khoản — GET/upload/approve/cancel đều bị chặn đúng người (Bug #1-#3) |

## Dọn dẹp sau demo

Ticket tạo trong demo đều gắn tenant Sơn (`0352393203`) hoặc tenant02 — có thể xoá theo 2 tài khoản này + khoảng thời gian demo, tránh đụng dữ liệu tenant khác.
