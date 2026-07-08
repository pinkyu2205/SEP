# [FE→BE] 2 điểm nhỏ còn lại sau khi verify các fix bảo trì 08/07

> FE đã verify live TOÀN BỘ 4 fix trong `BE-Resolved-API-BUG-BaoTri-Reopen.md` — **tất cả PASS** (reopen hết NPE, notif manager có `#id`, không còn notif tự thao tác, không còn 2 notif SCHEDULED trùng, dashboard đã scope theo manager — manager02 thấy 0/0 trong khi admin thấy tổng hệ thống). Cảm ơn team BE 🙏
>
> Trong lúc test phát hiện thêm 2 điểm nhỏ, **không chặn luồng**, làm khi tiện:

## 1. `GET /api/v1/notifications` trả trang KHÔNG sort (cũ nhất trước)

**Hiện trạng:** `AppNotificationController.listNotifications` tạo `PageRequest.of(page, size)` không kèm `Sort`, và param `sort` client gửi lên bị bỏ qua. Kết quả trả về theo id ASC — **cũ nhất trước**.

**Hệ quả:** FE lấy `page=0&size=50`. Khi user tích lũy quá 50 notification (tenant test hiện đã 33), page 0 chỉ chứa 50 cái CŨ nhất → **notification mới không bao giờ hiện trên app**. FE đã tự đảo thứ tự client-side nhưng chỉ cứu được trong phạm vi 50 row đầu.

**Fix đề xuất (1 dòng):**

```java
PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))
```

## 2. `MaintenanceRequestResponse` chưa trả `reopenCount`

**Hiện trạng:** entity đã có `reopenCount` (default 0, tăng khi tenant reject nghiệm thu) nhưng response DTO không expose — FE nhận `undefined`.

**Nhu cầu:** FE muốn hiển thị badge kiểu "Đã mở lại N lần" trên ticket REOPENED cho manager. Đề xuất thêm field `reopenCount` vào `MaintenanceRequestResponse` (+ map trong `convertToResponse`).

---

**Bối cảnh test (08/07 tối):** ticket #9 phòng P01 chạy full vòng: tạo → acknowledge → schedule 2 slot → tenant chọn slot → IN_PROGRESS → upload ảnh AFTER → resolve 150k (DONE) → tenant reject (**REOPENED, 200 OK**) → acknowledge lại → IN_PROGRESS → resolve → tenant accept (**CONFIRMED**). Notification tenant cho #9 đúng 4 cái: ACKNOWLEDGED, SCHEDULED (1 lần duy nhất), IN_PROGRESS, DONE — không có notif tự thao tác.
