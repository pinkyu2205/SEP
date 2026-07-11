# [FE→BE] Lỗ hổng validate status khi tạo hợp đồng nháp (đón khách)

> Phát hiện 09/07/2026 khi làm tính năng "gợi ý nhà theo địa chỉ file HĐ" ở trang Tạo hợp đồng nháp (web admin). Đọc `TenantOnboardingServiceImpl.onboard...()` để hiểu rào chắn hiện có, phát hiện rào chắn **hẹp hơn** những gì FE (và cả `RoomStatus`/`PropertyStatus` enum) ngụ ý.

## Hiện trạng

Trong `TenantOnboardingServiceImpl` (dòng ~104, lặp lại ở `createDepositPayment` dòng ~219), rào chắn phòng chỉ có:

```java
if (room.getStatus() == RoomStatus.RENTED) {
    throw new BusinessException("Phòng này đang được cho thuê");
}
```

**Vấn đề:** `RoomStatus` có 5 giá trị (`DRAFT, AVAILABLE, RENTED, MAINTENANCE, DISABLED`) nhưng code chỉ chặn đúng 1 giá trị (`RENTED`). Phòng đang `MAINTENANCE` (đang sửa chữa — có thể đang có thợ vào ra) hoặc `DISABLED` (ngưng khai thác) **vẫn tạo được hợp đồng bình thường** nếu request đi thẳng với `roomId` đó.

Với nhánh **thuê nguyên căn** (`roomId == null`) thì còn hở hơn: **không có bất kỳ check `property.getStatus()` nào** — nhà đang `MAINTENANCE`, `UNDER_RENOVATION`, hay thậm chí `DISABLED` vẫn nhận được hợp đồng tenant mới, miễn chưa có HĐ nguyên căn ACTIVE khác.

## Vì sao chưa từng lộ ra

FE (web admin `DraftContractFormModal.tsx`) đang lọc dropdown chỉ hiện property `ACTIVE` + room `AVAILABLE` — nên luồng thao tác tay bình thường không bao giờ chạm được request "xấu". Đây là lá chắn UX phía client, **không phải chặn cứng**. Hai kịch bản vẫn lọt qua được:
1. Race condition: admin mở form lúc phòng còn AVAILABLE, đúng lúc đó manager tạo ticket bảo trì chuyển phòng sang MAINTENANCE, admin bấm submit với `roomId` cũ trong state → BE vẫn cho qua.
2. Gọi thẳng API (Postman, script, hoặc app mobile onboarding nếu có luồng riêng) mà không qua dropdown đã lọc của web.

## Đề xuất fix (đảo chiều điều kiện — an toàn hơn)

Thay vì liệt kê "chặn giá trị nào", nên khẳng định "chỉ nhận đúng 1 giá trị hợp lệ":

```java
// Phòng
if (room.getStatus() != RoomStatus.AVAILABLE) {
    throw new BusinessException("Phòng không sẵn sàng cho thuê (trạng thái: " + room.getStatus() + ")");
}

// Nguyên căn — thêm mới, hiện chưa có check nào
if (roomId == null && property.getStatus() != PropertyStatus.ACTIVE) {
    throw new BusinessException("Nhà không sẵn sàng cho thuê (trạng thái: " + property.getStatus() + ")");
}
```

Cách này tự động ăn theo mọi giá trị enum thêm sau này (không cần sửa lại nếu ai đó thêm status mới), thay vì phải nhớ liệt kê từng cái.

## Bối cảnh FE đã làm (để BE biết không phải sửa gì bên FE)

Trang `DraftContractFormModal.tsx` đã:
- Lọc dropdown property/room theo đúng logic trên (ACTIVE/AVAILABLE).
- Khi hết phòng trống, hiện rõ lý do thay vì chung chung: "Nhà này không còn phòng trống (3 đang có khách, 2 đang bảo trì)".
- Gợi ý tự động chọn nhà theo địa chỉ bóc từ file HĐ (token-matching, chỉ khớp trong danh sách nhà ACTIVE) — nếu địa chỉ khớp đúng 1 nhà đang KHÔNG active thì báo rõ "khớp nhà X nhưng đang bảo trì/..." thay vì im lặng.

→ Sau khi BE thêm rào chắn cứng, nếu 1 trong 2 race-condition ở trên xảy ra, request sẽ bị BE chặn với message rõ ràng — FE catch lỗi qua interceptor sẵn có (đã hiện toast lỗi từ BE), không cần đổi gì thêm.
