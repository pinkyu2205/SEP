# Handoff BE — Lỗ kiểm soát truy cập module bảo trì + nhất quán category nhánh "sự cố khác"

**Ngày:** 2026-07-30
**Bối cảnh:** audit nhánh báo hỏng "sự cố khác" (không gắn thiết bị) sau khi vá 5 chỗ cụt luồng. Máy trạng thái không còn dead-end, nhưng phát hiện các endpoint chỉ check **role** mà không check **quyền trên đúng ticket đó** — cùng pattern với lỗ `equipmentId` đã handoff riêng (`BE-BUG-maintenance-create-equipment-ownership-2026-07-30.md`). Tất cả khai thác đều cần gọi API trực tiếp (Postman) với JWT hợp lệ — UI app không lộ đường vào, nhưng đây là lỗ bảo mật thật ở tầng API.

Hiện trạng check quyền theo từng endpoint (`MaintenanceServiceImpl`):

| Endpoint | Role check | Ownership check | Đánh giá |
|---|---|---|---|
| `PUT /{id}/confirm` | TENANT | ✅ `requireTenantOwner` | OK |
| `PUT /{id}/reject` | TENANT | ✅ `requireTenantOwner` | OK |
| `PUT /{id}/resolve-cost` | MANAGER/ADMIN | ✅ `requireManagerAccess` (mới 30/07) | OK |
| `GET /{id}` | cả 3 role | ❌ không có | **Bug #1** |
| `POST /{id}/photos` | cả 3 role | ❌ không có | **Bug #2** |
| `PUT /{id}/approve` | MANAGER/ADMIN | ❌ không có | **Bug #3** |
| `PUT /{id}/complete` | MANAGER/ADMIN | ❌ không có | **Bug #3** |
| `PUT /{id}/review-reject` | MANAGER/ADMIN | ❌ không có | **Bug #3** |
| `PUT /{id}/cancel` | MANAGER/ADMIN | ❌ không có | **Bug #3** |

## Bug #1 — Tenant bất kỳ đọc được chi tiết ticket của người khác (lộ dữ liệu cá nhân)

`getRequestById()` (`MaintenanceServiceImpl.java:232-234`) chỉ `findActive(id)` rồi trả luôn — không so user hiện tại với chủ ticket. Trong khi list (`getRequests`) filter đúng theo role, thì detail bypass được bằng cách đoán ID tuần tự (ID là bigint tăng dần). Response chứa **tên + SĐT tenant khác, ảnh phòng của họ, chi phí bồi thường, lý do khiếu nại** — lộ dữ liệu cá nhân thật.

**Fix:** trong `getRequestById`, lấy user hiện tại: `ROLE_TENANT` → `requireTenantOwner(req)`; `ROLE_MANAGER` → `requireManagerAccess(req)`; ADMIN pass. (2 helper đều có sẵn.)

## Bug #2 — Ai cũng upload được ảnh vào ticket bất kỳ

`uploadPhotos()` (`MaintenanceServiceImpl.java:542-545`) không check gì ngoài role ở controller — tenant phòng khác / manager nhà khác đều append được ảnh BEFORE/AFTER/REJECT vào ticket không liên quan, làm bẩn bằng chứng (ảnh là căn cứ đối chiếu khi tranh chấp bồi thường).

**Fix:** giống #1 — TENANT → `requireTenantOwner` **và chỉ cho type=BEFORE/REJECT**; MANAGER → `requireManagerAccess` (mọi type). (Tenant không có lý do gì upload ảnh AFTER — đó là ảnh nghiệm thu của phía sửa chữa.)

## Bug #3 — Manager nhà khác thao tác được ticket không thuộc quyền quản lý

`approve` / `complete` / `reviewReject` / `cancel` chỉ check role MANAGER — bất kỳ manager nào trong hệ thống cũng duyệt/báo xong/hủy được ticket của property người khác (kể cả **gán số tiền bồi thường** qua `complete` với `costPaidBy=TENANT`). `requireManagerAccess` đã viết sẵn cho `resolve-cost` — chỉ cần gọi thêm ở 4 method này, ngay sau `findActive(id)`.

## Bug #4 — Approve cho phép đổi category thành APPLIANCE/FURNITURE trên ticket không gắn thiết bị

Lúc **tạo**, BE chặn đúng: không có `equipmentId` thì cấm APPLIANCE/FURNITURE (`resolveCreateCategory`). Nhưng lúc **duyệt**, `approve()` chỉ gọi `parseCategoryRequired(categoryFromBody)` — manager gửi `category=APPLIANCE` cho ticket "sự cố khác" vẫn được nhận → sinh ticket APPLIANCE không có thiết bị, phá invariant mà create đã giữ. Hệ quả: báo cáo chi phí theo category sai lệch; các logic dựa trên "APPLIANCE ⇒ có equipmentId" (gợi ý giá bồi thường theo khấu hao, lịch sử thiết bị, đếm số lần sửa để gợi ý thay mới) âm thầm không chạy.

**Fix:** trong `approve()`, sau khi parse category:
```java
if (req.getEquipmentId() == null
        && (MaintenanceCategory.APPLIANCE.name().equals(category)
            || MaintenanceCategory.FURNITURE.name().equals(category))) {
    throw new BusinessException(
        "Ticket không gắn thiết bị — không thể phân loại Trang thiết bị/Nội thất. "
            + "Chọn: STRUCTURAL, ELECTRICAL, PLUMBING, OTHER");
}
```
FE sẽ đồng thời ẩn 2 lựa chọn đó khỏi dropdown duyệt khi ticket không có `equipmentId` (FE tự làm, không chờ BE).

## Gap #5 (đề xuất, không phải bug) — Tenant không tự hủy được ticket của chính mình

`cancel` chỉ cho MANAGER/ADMIN. Tenant tạo nhầm (báo trùng, sự cố tự hết) không có cách nào rút lại — ticket treo PENDING đến khi manager để ý. Đề xuất: cho TENANT gọi `cancel` **chỉ khi** là chủ ticket **và** ticket còn PENDING (chưa ai xử lý); note timeline "Khách thuê tự hủy yêu cầu". Sau khi đã APPROVED thì vẫn phải qua manager như hiện tại.

## Checklist test

- [ ] Tenant A `GET /maintenance/{id}` ticket của tenant B → 4xx (không lộ SĐT/ảnh).
- [ ] Tenant A `POST /{id}/photos` vào ticket tenant B → 4xx. Tenant chủ ticket upload type=AFTER → 4xx.
- [ ] manager02 (không quản property) approve/complete/cancel ticket của property manager01 → 4xx; manager01 thao tác bình thường → OK.
- [ ] Approve ticket "sự cố khác" với category=APPLIANCE → 422; với STRUCTURAL → OK như cũ.
- [ ] (Nếu làm #5) tenant tự hủy ticket PENDING của mình → OK; ticket đã APPROVED → 4xx; hủy ticket người khác → 4xx.

## Phạm vi ảnh hưởng

Toàn bộ là **siết thêm điều kiện** trên các request vốn không hợp lệ — luồng app thật (đúng chủ ticket, đúng manager) không đổi hành vi. Riêng #5 là tính năng mới nhỏ, làm sau cùng được.
