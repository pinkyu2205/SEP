# Kịch bản demo full luồng Bảo trì & Sửa chữa

**Ngày viết:** 2026-07-30 · **Dùng cho:** demo trực tiếp trên app (mobile/web) sau khi BE ship xong `BE-HANDOFF-maintenance-flow-deadends-2026-07-30.md` + FE hoàn thiện UI resolve-cost/note bắt buộc.

## Tài khoản & data dùng trong demo

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Tenant | `0352393203` / `123456` | Nguyễn Hoàng Ngọc Sơn — HĐ #23 ACTIVE, phòng 101 (room 257), property "MTX#13 THEO_PHONG full NT" (property 68) |
| Manager | `manager01` / `123456` | Quản lý vận hành 01 — quản property 68 |

Phòng 101 (room 257) đã có sẵn 4 thiết bị dùng để demo "báo hỏng qua chọn thiết bị": **Điều hòa**, **Quạt**, **Nóng lạnh**, **Giường**. Mỗi lần tạo ticket demo nên chọn thiết bị KHÁC nhau (dễ phân biệt khi nhìn danh sách, tránh nhầm ticket cũ/mới).

Ảnh minh chứng: chụp bất kỳ ảnh nào trên máy/điện thoại khi app yêu cầu "ảnh hiện trạng" / "ảnh sau sửa chữa" / "ảnh khiếu nại" — không có ràng buộc nội dung ảnh.

---

## Cảnh 1 — Báo hỏng qua chọn thiết bị → duyệt → sửa xong (chủ nhà chịu phí) → khách xác nhận

**Minh hoạ:** luồng cơ bản nhất, không phát sinh chi phí bồi thường.

1. Đăng nhập **tenant** (0352393203). Vào **Sửa chữa** → **Đi đến Thiết bị phòng** → chọn **Quạt** → **Báo hỏng thiết bị này**.
2. Nhập tiêu đề (vd "Quạt kêu to, không mát"), chụp/chọn ≥1 ảnh hiện trạng → Gửi. → Ticket mới, trạng thái **Chờ duyệt**.
3. Đăng nhập **manager** (manager01). Vào **Bảo trì** → mở ticket vừa tạo. Phần "Phân loại sự cố" đã tự gợi ý sẵn **🖥️ Trang thiết bị** (vì ticket có gắn thiết bị) — bấm **✅ Duyệt yêu cầu** luôn không cần đổi gì.
4. Ticket chuyển **Đang sửa chữa**. Bấm **🛠 Báo sửa xong** → thêm ảnh AFTER → để mặc định **Chủ nhà chịu phí** (không tick "Khách chịu phí") → gửi.
5. Đăng nhập lại **tenant** → mở ticket → thấy nút **✅ Đã OK — xác nhận hoàn tất** (không có bước hỏi tiền vì host chịu) → bấm.
6. Kết quả: ticket **Hoàn tất**, không phát sinh hoá đơn nào.

---

## Cảnh 2 — Khách làm hư thiết bị, đồng ý bồi thường → hoá đơn tự động

**Minh hoạ:** luồng bồi thường "êm đẹp" — khách đồng ý ngay.

1. **Tenant**: quét QR hoặc chọn thiết bị **Nóng lạnh** → báo hỏng (vd "Làm rơi vỡ vòi nóng lạnh") → gửi.
2. **Manager**: duyệt (category tự gợi ý Trang thiết bị) → **Báo sửa xong** → lần này **bật "Khách chịu phí"**, chọn nguyên nhân **Sử dụng sai cách (misuse)**, nhập số tiền bồi thường (vd 500.000đ) → gửi.
3. **Tenant**: mở lại ticket → màn hình hỏi tiền hiện nút **✅ Đồng ý thanh toán** và **↩ Khiếu nại số tiền** → bấm **Đồng ý thanh toán**.
4. Kết quả: ticket **Hoàn tất**, hệ thống **tự phát 1 hoá đơn bồi thường** — tenant vào tab **Hóa đơn** thấy hoá đơn mới, thanh toán được qua QR như hoá đơn thường.

---

## Cảnh 3 — Khách khiếu nại số tiền → manager điều chỉnh lại và chốt thu (case từng bị "cụt luồng")

**Minh hoạ:** đây là trường hợp trước 30/07 sẽ **kẹt vĩnh viễn** — giờ đã có lối ra.

1. **Tenant**: chọn thiết bị **Điều hòa** → báo hỏng → gửi.
2. **Manager**: duyệt → Báo sửa xong, bật "Khách chịu phí", nhập số tiền **cao** (vd 900.000đ) để tạo tình huống khách phản đối.
3. **Tenant**: mở ticket → bấm **↩ Khiếu nại số tiền** → nhập lý do (vd "Giá cao quá, tôi không đồng ý") → **Gửi khiếu nại**.
4. Kết quả tức thời: ticket vẫn chuyển **Hoàn tất** (đóng bình thường) nhưng khoản tiền **chưa được xử lý** — đây chính là chỗ trước kia không ai chạm vào được nữa.
5. **Manager**: vào màn **Bảo trì**, ngay đầu trang thấy section **💰 Bồi thường chờ xử lý** — ticket vừa rồi nằm trong đó với badge đỏ **"Khiếu nại"**. Bấm vào.
6. Trong chi tiết ticket, dù đã **Hoàn tất**, vẫn thấy card **⚠️ Khoản bồi thường chưa xử lý** hiện lý do khiếu nại của khách. Sau khi gọi điện thoả thuận lại, manager **sửa số tiền xuống** (vd 500.000đ), ghi chú "Đã thoả thuận lại qua điện thoại" → bấm **🧾 Chốt thu & phát hóa đơn**.
7. Kết quả: hoá đơn 500.000đ được phát ra ngay, card khoản treo biến mất khỏi cả 2 nơi (chi tiết ticket + section đầu trang).

---

## Cảnh 4 — Khách khiếu nại, manager quyết định miễn thu (thiện chí giữ khách)

1. Lặp lại bước 1-4 của Cảnh 3 với thiết bị **Giường** (để không trùng ticket).
2. **Manager** mở ticket từ section "Bồi thường chờ xử lý" → thay vì Chốt thu, ghi chú lý do (vd "Thiết bị đã cũ, thiện chí miễn cho khách") → bấm **Miễn thu** → xác nhận trong hộp thoại cảnh báo.
3. Kết quả: card đổi thành thông báo "Khoản bồi thường đã được miễn thu — {lý do}", không có hoá đơn nào phát ra, khoản biến mất khỏi danh sách treo.

---

## Cảnh 5 — Khách từ chối kết quả sửa (không liên quan tiền) → vòng reopen có escalation

**Minh hoạ:** vòng lặp REJECTED, note bắt buộc, và cơ chế báo động khi lặp nhiều lần.

1. **Tenant**: báo hỏng "sự cố khác" — bấm chat bubble **Sự cố khác (sàn, tường, cửa…)** thay vì chọn thiết bị, chọn danh mục **Ống nước / Điện** bất kỳ → gửi.
2. **Manager**: duyệt → Báo sửa xong (không cần bật khách chịu phí) → gửi.
3. **Tenant**: mở ticket → bấm **↩ Chưa ổn — gửi phản hồi** → nhập lý do + ảnh minh chứng → **Gửi phản hồi chưa đạt**. Ticket chuyển **Khách từ chối**.
4. **Manager**: mở ticket, thấy 2 lựa chọn: **🔧 Chấp nhận — sửa lại** hoặc **Giữ kết quả**. Bấm **Giữ kết quả** — ô nhập **"Lý do giữ nguyên kết quả (bắt buộc)"** hiện ra (không cho gửi nếu bỏ trống). Nhập lý do (vd "Thợ đã kiểm tra lại, hoạt động bình thường") → **Xác nhận giữ kết quả**.
5. Ticket quay lại **Chờ nghiệm thu**. **Lặp lại bước 3-4 một lần nữa** (tenant từ chối lần 2, manager giữ kết quả lần 2 với lý do khác).
6. Ở lần reopen thứ 2 này, hệ thống tự gửi 1 thông báo escalation nội bộ (hiện tại tới hộp thông báo phía manager — điểm này BE ghi nhận sẽ chuyển đúng sang Host khi model dữ liệu bổ sung field chủ sở hữu).
7. **Tenant**: lần này bấm **✅ Đã OK — xác nhận hoàn tất** để kết thúc thay vì từ chối tiếp → ticket **Hoàn tất**.

---

## Cảnh 6 — 2 sự cố cùng phòng cùng lúc (fix "phòng bị đẩy sai trạng thái")

**Minh hoạ:** trước 30/07, đóng 1 ticket sẽ vô tình xoá cờ "đang bảo trì" của ticket còn lại.

1. **Tenant**: tạo **2 ticket cùng lúc** cho cùng phòng 101 — 1 cái báo hỏng thiết bị **Điều hòa**, 1 cái báo "sự cố khác" (vd nước rỉ trần nhà).
2. **Manager**: duyệt cả 2 ticket → phòng 101 hiện trạng thái **MAINTENANCE** (kiểm tra ở màn quản lý phòng/tòa nhà).
3. Hoàn tất + xác nhận **CHỈ 1 trong 2** ticket (đóng ticket điều hòa trước).
4. Kiểm tra lại phòng 101: **vẫn còn MAINTENANCE** (vì ticket nước rỉ trần vẫn đang mở) — đây là điểm khác biệt so với trước khi fix.
5. Đóng nốt ticket còn lại → phòng 101 mới trở lại **RENTED**.

---

## Cảnh 7 — Manager huỷ yêu cầu giữa chừng

1. **Tenant**: tạo 1 ticket bất kỳ.
2. **Manager**: mở ticket, cuộn xuống cuối, bấm **Hủy yêu cầu này** → xác nhận. Có thể huỷ ở bất kỳ bước nào (Chờ duyệt / Đang sửa / Chờ nghiệm thu / Khách từ chối), chỉ không huỷ được khi đã **Hoàn tất**.
3. Nếu ticket lúc huỷ đang có khoản bồi thường PENDING (vd huỷ ngay sau khi báo sửa xong với khách chịu phí, trước khi khách kịp phản hồi), khoản đó **vẫn xuất hiện trong section "Bồi thường chờ xử lý"** dù ticket đã CANCELLED — minh hoạ đúng case đã fix (ticket M-1 gốc phát hiện lỗi này).

---

## (Không demo trực tiếp được) Auto-confirm sau 3 ngày

Giải thích bằng lời cho người xem: nếu tenant không phản hồi ticket đang "Chờ nghiệm thu" sau 3 ngày, cron chạy 8h30 sáng mỗi ngày sẽ **tự động đóng ticket**. Nếu ticket đó có khoản bồi thường đang chờ, hệ thống **không tự ép khách đồng ý** — khoản đó rơi thẳng vào section "Bồi thường chờ xử lý" giống hệt Cảnh 3/4, manager xử lý sau. Không demo sống được vì phụ thuộc thời gian thực, chỉ nên nêu miệng.

---

## Bảng tổng kết — kịch bản nào minh hoạ case nào

| Cảnh | Minh hoạ case |
|---|---|
| 1 | Luồng chuẩn, không phí, category tự gợi ý |
| 2 | Bồi thường — khách đồng ý ngay → hoá đơn tự động |
| 3 | Bồi thường — khiếu nại → manager điều chỉnh + chốt thu (fix dead-end #1) |
| 4 | Bồi thường — khiếu nại → miễn thu |
| 5 | Vòng reject/reopen + note bắt buộc + escalation (fix #5) |
| 6 | 2 ticket cùng phòng — room status đúng (fix #4) |
| 7 | Huỷ giữa chừng + khoản treo vẫn truy cập được (fix #1/#2) |
| — | HĐ thanh lý giữa chừng vẫn phát được hoá đơn (fix #3) — khó dàn dựng trực tiếp trước mặt người xem vì cần thao tác DB, có thể nêu miệng + cho xem kết quả test đã chạy trước (ticket #5 hôm nay) |

## Dọn dẹp sau demo

Toàn bộ ticket demo đều mang tiêu đề tự đặt lúc demo (không có tiền tố cố định) — nếu muốn dọn sạch sau buổi demo, xoá theo tenant `0352393203` hoặc theo khoảng thời gian tạo trong ngày demo, tránh xoá nhầm ticket thật của người dùng khác.
