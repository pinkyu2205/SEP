# Handoff BE — Escalation "ticket bị từ chối nhiều lần" đang ghi vào chỗ không ai đọc được

**Ngày:** 2026-07-30
**Mức độ:** Trung bình — không sai dữ liệu tiền/hợp đồng, nhưng tính năng escalation (báo động khi manager-tenant bất đồng kéo dài) **hoàn toàn không hoạt động**, không ai biết để cảnh báo.

## Hiện trạng — không phải "gửi nhầm người", mà là ghi vào nơi không route nào đọc tới

Khi tenant từ chối nghiệm thu lần thứ 2 trở lên, `reviewReject()` gọi `notifyPropertyHost()` ([MaintenanceServiceImpl.java:890-910](C:\sep490\backup\Sub-leasing-managemant-system\src\main\java\com\sep490\slms2026\service\impl\MaintenanceServiceImpl.java#L890-L910)):

```java
UUID hostUserId = req.getProperty().getManagedBy();
hostNotificationRepository.save(HostNotification.builder()
        .userId(hostUserId)
        .type("MAINTENANCE_REOPEN_ESCALATION")
        ...
```

`property.getManagedBy()` **không phải Host/Owner** — trace tại [PropertyOnboardingServiceImpl.java:568-580](C:\sep490\backup\Sub-leasing-managemant-system\src\main\java\com\sep490\slms2026\service\impl\PropertyOnboardingServiceImpl.java#L568-L580), mọi chỗ set field này đều set **cùng lúc, cùng giá trị** với `operationManagerId`:

```java
property.setOperationManagerId(managerId);
property.setManagedBy(managerId);   // luôn đi kèm nhau — managedBy = Manager, không phải Host
```

Hậu quả kép làm notification này **không ai đọc được**, không chỉ "sai người":

1. **Manager không xem được** — toàn bộ `HostController` gắn `@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")` (dòng 23) → Manager gọi `/api/v1/host/notifications` bị chặn 403 ngay từ role check, dù notification lưu đúng dưới UUID của họ.
2. **Host cũng không xem được** — `listNotifications(userId, ...)` filter đúng theo `userId = currentUserId()` của Host đang đăng nhập ([HostPortalServiceImpl.java:38-43](C:\sep490\backup\Sub-leasing-managemant-system\src\main\java\com\sep490\slms2026\service\impl\HostPortalServiceImpl.java#L38-L43)) — mà row lưu dưới UUID của Manager, không trùng UUID bất kỳ tài khoản OWNER nào → 0 kết quả.

## Vì sao khó vá bằng cách "đổi 1 dòng" — Property không có khái niệm chủ sở hữu

Grep toàn bộ `HostPortalServiceImpl`: mọi chỗ liệt kê property cho Host đều dùng `propertyRepository.findAll()` (dòng 170, 422, 732) — **không filter theo owner nào cả**. Trong thiết kế hiện tại, ROLE_OWNER là vai trò giám sát **toàn cục** (mọi Host thấy mọi property), không có property nào gắn với đúng 1 Host cụ thể. `Property` entity chỉ có `createdBy` (kiểu `Long`, không dùng liên quan Host ở đâu), `operationManagerId`, `managedBy` — không có `owner_id`.

Vì vậy đây không đơn thuần là sửa `req.getProperty().getManagedBy()` thành `req.getProperty().getOwnerId()` — cột đó chưa tồn tại và khái niệm "Host của property X" chưa có ở bất kỳ đâu trong hệ thống.

## 2 hướng fix — team BE chọn hướng phù hợp với roadmap, không có hướng nào là "đúng duy nhất"

### Hướng A — Thêm field `owner_id` thật cho Property (đúng bản chất, chi phí lớn hơn)

1. Migration: `properties.owner_id UUID NULL REFERENCES "User"(id)`.
2. Cần quyết định **set field này ở đâu** — hiện KHÔNG có bước nào trong lifecycle property (draft → renovation → active) hỏi "property này của Host nào". Có thể suy ra từ:
   - `created_by` (Long) nếu field này thực chất đang lưu ID của account tạo property và account đó luôn là Owner — cần kiểm tra lại ý nghĩa thật của `created_by` trước khi dùng (đang không rõ ràng, kiểu `Long` trong khi mọi User.id khác đều UUID → nghi ngờ đây là leftover từ thiết kế cũ, KHÔNG nên tin ngay).
   - Hoặc thêm bước chọn Host thủ công lúc property chuyển sang `PENDING_HOST_REVIEW`/`ACTIVE`.
3. Sau khi có `owner_id`: sửa `notifyPropertyHost()` dùng field này thay vì `managedBy`.
4. **Tác động lan rộng:** nếu làm hướng này, nên rà lại toàn bộ `HostPortalServiceImpl` (dashboard, invoice, expense, notification khác — không chỉ riêng maintenance) xem có nên lọc theo `owner_id` luôn không, vì hiện tất cả đang trả về **toàn bộ hệ thống** cho bất kỳ Host nào đăng nhập — nếu đây là hành vi cố ý (single-owner hệ thống, nhiều tài khoản Owner chỉ là nhiều người trong cùng 1 công ty) thì hướng A **không cần thiết**, xem hướng B.

### Hướng B — Broadcast cho toàn bộ ROLE_OWNER (rẻ, khớp thiết kế hiện tại, không đổi DB)

Vì Host Portal vốn đã coi mọi property là chung (`findAll()` khắp nơi), escalation này chỉ cần khớp đúng triết lý đó:

```java
private void notifyPropertyHost(MaintenanceRequest req, String title, String body) {
    String dedupeKey = "maintenance-reopen-escalation:" + req.getId() + ":" + (req.getReopenCount() != null ? req.getReopenCount() : 0);
    List<User> hosts = userRepository.findByRole(Role.ROLE_OWNER); // hoặc query có sẵn tương tự
    for (User host : hosts) {
        if (hostNotificationRepository.existsByUserIdAndDedupeKey(host.getId(), dedupeKey)) continue;
        hostNotificationRepository.save(HostNotification.builder()
                .userId(host.getId())
                .dedupeKey(dedupeKey)
                .type("MAINTENANCE_REOPEN_ESCALATION")
                .title(title)
                .message(body)
                .priority("HIGH")
                .read(false)
                .build());
    }
}
```

Không cần migration, không đổi hành vi phần còn lại của Host Portal. Nhược điểm: nếu sau này hệ thống có nhiều Owner độc lập (mỗi người chỉ quản nhà của mình) thì escalation sẽ làm phiền Owner không liên quan — chấp nhận được ở quy mô hiện tại (đồ án/demo), nhưng nếu roadmap sắp tới build multi-owner thật thì nên đi thẳng hướng A để khỏi phải sửa lại lần 2.

## Quyết định

Để team BE chọn — cả hai hướng đều hợp lệ, khác nhau ở đánh đổi chi phí vs. đúng lâu dài. Nếu chọn hướng A, cần làm rõ thêm ý nghĩa thật của `created_by` trước khi tái sử dụng nó cho `owner_id` (khả năng cao nó không phải User.id, xem mục "chi phí lớn hơn" ở trên).

## Checklist test (áp dụng cho hướng nào cũng vậy)

- [ ] Tenant reject 1 lần, manager giữ kết quả → **không** có notification escalation nào (chỉ từ lần 2 trở lên).
- [ ] Tenant reject lần 2, manager giữ kết quả lần 2 → escalation được tạo.
- [ ] Đăng nhập đúng tài khoản Host (hướng A: đúng owner_id của property; hướng B: bất kỳ ROLE_OWNER nào) → thấy notification trong `/api/v1/host/notifications`.
- [ ] Gọi lại `review-reject` với cùng `reopenCount` (vd retry request) → không tạo trùng notification (dedupeKey đã xử lý, giữ nguyên logic cũ).
