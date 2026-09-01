# Luồng "báo lỗi do khách" — đổi thành báo cáo gửi admin duyệt, cần BE hỗ trợ

**Ngày:** 01/09/2026
**Bối cảnh:** Đang test luồng B (lỗi do khách) trên `TicketDetailScreen.tsx` (manager
mobile) theo redesign vừa chốt (`28b177b`). Muốn đổi lại bước này: manager không tự
chọn "Hướng xử lý" (Manager sửa hộ / Khách tự sửa) nữa — chỉ nhập mô tả + ảnh bằng
chứng lỗi rồi gửi thẳng cho **admin duyệt trên web** (trang mới). Sau khi admin bấm
duyệt hoặc không duyệt, **đó là bước cuối cùng app theo dõi** — việc sửa chữa/thu tiền
xử lý ngoài hệ thống (không còn tự tạo hoá đơn, không còn verify-repair cho nhánh này).

Đã đọc kỹ code BE hiện tại (`MaintenanceServiceImpl.java`, `MaintenanceRequest` entity)
— việc này **không làm được thuần FE**, cần BE hỗ trợ 2 điểm dưới đây.

---

## 1. `rejectFault` hiện bắt buộc `resolutionPath` — cần bỏ yêu cầu rẽ nhánh ngay

`MaintenanceServiceImpl.rejectFault()` dòng 284-286: nếu `resolutionPath` null thì
throw `BusinessException`; có giá trị thì lập tức chuyển `TENANT_FAULT` hoặc
`PENDING_TENANT_REPAIR` và bắt đầu chạy máy verify-repair/tự tạo hoá đơn. Luồng mới
không cần rẽ nhánh này nữa — báo lỗi xong là dừng, chờ admin.

**Đề xuất (BE chọn 1 trong 2 cách, cách nào cũng được phía FE):**
- **(a)** Sửa `rejectFault` cho `resolutionPath` thành optional — không có thì chỉ ghi
  `faultReason` + `faultEvidenceImages`, **không đổi trạng thái tiếp** (giữ nguyên
  status hiện tại hoặc set một status trung lập mới nếu BE thấy cần, miễn không tự
  chạy tiếp máy sửa/hoá đơn).
- **(b)** Thêm endpoint mới riêng, đơn giản hơn, ví dụ
  `PUT /maintenance/{id}/report-fault { faultReason, faultEvidenceImages }` — giữ
  nguyên `rejectFault` cũ cho trường hợp khác nếu BE vẫn cần dùng ở đâu đó.

## 2. Cần endpoint để admin ghi quyết định duyệt/không duyệt

Hiện không có field nào trên `MaintenanceRequest` hay endpoint nào để lưu quyết định
của admin (đã grep — không tồn tại).

**Đề xuất:**
- Thêm endpoint `PUT /maintenance/{id}/admin-review` (role `ADMIN`), body
  `{ approved: boolean, note?: string }`.
- Thêm field lưu lại: `adminReviewedAt`, `adminReviewedBy`, `adminApproved`,
  `adminReviewNote` (tên tuỳ BE) — chỉ cần ghi nhận, không cần đẩy trạng thái
  `MaintenanceStatus` đi đâu tiếp.
- Expose các field này trong `MaintenanceRequestResponse` để FE (web + mobile) hiển
  thị lại được sau này.

## 3. Phần tra cứu lại sau — đã có sẵn, không cần thêm gì

Yêu cầu "lưu phiếu lại để sau này cần thì tra ra xem" đã tự động thoả mãn: dữ liệu nằm
vĩnh viễn trên đúng dòng `maintenance_requests`, đã truy vấn được ngay hôm nay qua
`GET /api/v1/maintenance?status=TENANT_FAULT` (role `ADMIN` đã được phép ở
`MaintenanceController.getRequests`). Không cần bảng mới, không cần endpoint list mới.

---

## Tình trạng phía FE

- **Chưa sửa** form "Báo lỗi do khách" trên mobile (`TicketDetailScreen.tsx`) — vẫn còn
  UI chọn "Hướng xử lý" như cũ, để không phá luồng hiện đang chạy được.
- **Chưa tạo** trang admin duyệt trên web — sẽ dựng ngay sau khi BE xác nhận hình dạng
  API ở mục 1-2 (tránh phải viết lại nếu contract đổi giữa chừng, giống bài học từ lần
  Luồng B trước).
