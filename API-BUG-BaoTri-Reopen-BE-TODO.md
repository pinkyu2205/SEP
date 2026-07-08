# BUG BE: Tenant từ chối nghiệm thu (reopen) bị 500-wrapped-400 — NPE reopenCount

> Phát hiện 08/07/2026 khi FE nối luồng nghiệm thu thật trên mobile. Test live: 12/13 bước rich flow PASS, riêng bước reject fail.

## 1. Bug chặn luồng: `PUT /api/v1/maintenance/{id}/confirm` với `accept=false`

**Tái hiện:** ticket bất kỳ ở trạng thái `DONE` → tenant gọi:

```http
PUT /api/v1/maintenance/{id}/confirm
{ "accept": false }
```

**Kết quả thật:**

```json
{"error":"Bad Request","message":"Cannot invoke \"java.lang.Integer.intValue()\" because the return value of \"com.sep490.slms2026.entity.MaintenanceRequest.getReopenCount()\" is null","status":400}
```

**Nguyên nhân:** `MaintenanceServiceImpl.confirm()` nhánh else:

```java
req.setReopenCount(req.getReopenCount() + 1);   // reopenCount (Integer) đang NULL trong DB → NPE
```

Cột `reopen_count` không có default, các row hiện hữu đều null.

**Fix đề xuất (chọn 1 hoặc cả 2):**
1. Null-safe: `req.setReopenCount(req.getReopenCount() == null ? 1 : req.getReopenCount() + 1);`
2. Default trong entity: `private Integer reopenCount = 0;` (+ migration `UPDATE maintenance_requests SET reopen_count = 0 WHERE reopen_count IS NULL`).

**Ảnh hưởng:** khách bấm "Chưa đạt — mở lại yêu cầu" trên app là lỗi ngay → không thể REOPENED. Nhánh `accept=true` (CONFIRMED) chạy bình thường.

## 2. Gợi ý nhỏ kèm theo (không chặn luồng, làm khi tiện)

1. **Notification thiếu id để deep-link (manager):** notification cho manager khi có ticket mới có content `"Khách thuê X vừa tạo yêu cầu bảo trì phòng P01"` — **không có `#<id>`**. FE đang deep-link bằng cách parse `#<id>` từ content (tenant OK vì content là `"Yêu cầu #5 ..."`). Đề xuất: thêm `#<id>` vào content của manager, hoặc tốt hơn là thêm field `refId`/`data` vào bảng `notifications` + `NotificationResponse`.
2. **Tenant nhận notif cho chính hành động của mình:** tự tạo ticket → nhận notif "đổi trạng thái thành PENDING"; tự nghiệm thu → nhận notif CONFIRMED. Đề xuất: trong `addTimeline`, bỏ qua notification nếu người thao tác chính là tenant của ticket.
3. **2 notif SCHEDULED trùng:** `schedule` + `confirm-schedule` đều ghi timeline SCHEDULED → tenant nhận 2 notif giống nhau. Đề xuất: notif của confirm-schedule nên có nội dung riêng ("Bạn đã chọn lịch...") hoặc bỏ.
4. **Dashboard chưa scope theo manager:** `GET /maintenance/dashboard` đếm toàn hệ thống (`countAll()`...) — manager nào cũng thấy số liệu chung. Đề xuất: filter theo `property.managedBy = currentUser` khi role là MANAGER (giống spec đã có trong `getRequests`).

## 3. FE đã làm xong phía mình (để BE nắm context)

Mobile giờ chạy **đủ rich flow trên API thật**: acknowledge → schedule (multi-slot) → tenant confirm-schedule → IN_PROGRESS → ON_HOLD/resume → resolve (photo-gate + ngưỡng 2tr → PENDING_APPROVAL) → tenant confirm/reject. FE parse `scheduledDate` (chuỗi slot phân tách phẩy) + timeline `"Khách chọn lịch"` để suy ra slot đã chốt — nếu BE sau này trả thẳng `scheduledSlots[]`/`confirmedSlot` trong response thì báo FE bỏ logic suy diễn.
