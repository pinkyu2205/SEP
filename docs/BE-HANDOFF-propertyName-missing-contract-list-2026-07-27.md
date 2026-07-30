# Handoff BE — thiếu `propertyName` trong list "Hợp đồng chờ xử lý"

**Ngày:** 2026-07-27

## Hiện tượng

Màn mobile-app "Hợp đồng chờ xử lý" (manager) cần hiển thị tên bất động sản mà khách đang thuê trên mỗi card. Field `propertyName` **đã có sẵn** trong `TenantContractResponse` DTO, nhưng khi gọi:

```
GET /api/v1/tenant-contracts?status=...
```

field này luôn trả về `null`.

## Nguyên nhân

`TenantOnboardingServiceImpl.java`, phương thức `toResponse(TenantContract c, ...)` — hàm map entity → DTO dùng chung cho `getContractsByStatus()` (API phía trên) — không set `propertyName` khi build response:

```java
return TenantContractResponse.builder()
        .id(c.getId())
        .propertyId(c.getProperty().getId())
        .roomId(room != null ? room.getId() : null)
        .roomNumber(room != null ? room.getRoomNumber() : null)
        // ... không có .propertyName(...)
```

Trong khi các service khác (`HostPortalServiceImpl`, `TenantHandoverServiceImpl`, `TenantPendingChargeServiceImpl`...) đều set field này bình thường bằng `.propertyName(contract.getProperty().getPropertyName())`.

## Cách fix đề xuất

Thêm 1 dòng vào đúng builder chain trong `toResponse(...)` (file trên, gần `propertyId`):

```java
.propertyId(c.getProperty().getId())
.propertyName(c.getProperty().getPropertyName())   // ← thêm dòng này
.roomId(room != null ? room.getId() : null)
```

`c.getProperty()` không null trong ngữ cảnh này (mọi contract đều gắn property), nên không cần null-check thêm.

## Phạm vi ảnh hưởng

Chỉ ảnh hưởng các API dùng chung hàm `toResponse(TenantContract, String, Boolean, Boolean)` — cụ thể là `getContractsByStatus()` (list cho manager) và `confirm()` (trả về sau khi xác nhận HĐ). Các endpoint khác (handover, checkout, pending-charge...) đã tự set field này ở service riêng, không cần đụng tới.
