# BE Bug — `POST /maintenance` không re-check `equipmentId` thuộc đúng room/property khi tạo ticket

**Ngày:** 2026-07-30
**Mức độ:** Thấp-trung bình (không lộ dữ liệu nhạy cảm, không đổi quyền sở hữu tiền/tài sản — chỉ ghi nhầm lịch sử bảo trì của thiết bị khác). Cần biết trước ID mới khai thác được, không tự phát hiện được qua UI bình thường.

## Hiện trạng

Có 2 nơi tenant lấy `equipmentId` để báo hỏng, cả 2 đều **đã chặn đúng**:
- `GET /api/v1/equipments/by-qr/{qrCode}` (quét QR) → `EquipmentServiceImpl.getEquipmentByQrCode()` gọi `assertTenantCanAccessEquipment(tenantUserId, equipment)` ([EquipmentServiceImpl.java:305-315](C:\sep490\backup\Sub-leasing-managemant-system\src\main\java\com\sep490\slms2026\service\impl\EquipmentServiceImpl.java#L305-L315)) — ném lỗi nếu thiết bị không thuộc property/room tenant đang có HĐ ACTIVE.
- `GET /api/v1/tenant/me/equipments` (chọn từ danh sách) → BE tự suy phòng từ HĐ của tenant đăng nhập, không nhận `roomId` từ client.

Nhưng **endpoint thực sự lưu ticket lại không re-check** — `MaintenanceServiceImpl.createRequest()` ([MaintenanceServiceImpl.java:143-192](C:\sep490\backup\Sub-leasing-managemant-system\src\main\java\com\sep490\slms2026\service\impl\MaintenanceServiceImpl.java#L143-L192)):

```java
Long equipmentId = request.getEquipmentId();
String category = resolveCreateCategory(equipmentId, request.getCategory());
...
MaintenanceRequest req = MaintenanceRequest.builder()
        .tenant(tenant)
        .property(property)
        .room(room)
        .tenantContract(tenantContract)
        ...
        .equipmentId(equipmentId)   // <-- lấy thẳng từ client, KHÔNG kiểm tra thuộc room/property nào
        .build();
```

Chỉ `assertTenantOwnsActiveUnit`/`assertTenantOwnsActiveWholeHouse` check `roomId`/`propertyId` gửi lên có thuộc HĐ ACTIVE của tenant — hoàn toàn không đụng tới việc `equipmentId` có khớp với `room`/`property` đó hay không.

**Kịch bản khai thác:** gọi thẳng API (Postman, không qua app) với JWT tenant hợp lệ, `roomId` đúng phòng của mình (pass qua `assertTenantOwnsActiveUnit`), nhưng `equipmentId` là ID thiết bị của **phòng/nhà khác** (đoán số hoặc biết trước) → ticket vẫn tạo thành công, `equipmentId` lưu sai. Hệ quả: `GET /equipment/{id}/maintenance-history` của thiết bị đó (dùng bởi manager quản lý nhà khác) hiện thêm 1 ticket rác không liên quan tới đúng manager/tenant nhà đó.

## Fix đề xuất

Thêm 1 check ngay sau khi resolve `equipmentId`, trước khi build `MaintenanceRequest` (dùng lại đúng logic của `assertTenantCanAccessEquipment` bên `EquipmentServiceImpl`, viết local trong `MaintenanceServiceImpl` vì đã có sẵn `equipmentRepository`):

```java
Long equipmentId = request.getEquipmentId();
if (equipmentId != null) {
    Equipment equipment = equipmentRepository.findById(equipmentId)
            .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy thiết bị"));
    boolean matches = equipment.getProperty() != null
            && equipment.getProperty().getId().equals(property.getId())
            && (equipment.getRoom() == null || room == null || equipment.getRoom().getId().equals(room.getId()));
    if (!matches) {
        throw new BusinessException("Thiết bị không thuộc phòng/nhà bạn đang báo sự cố");
    }
}
String category = resolveCreateCategory(equipmentId, request.getCategory());
```

Ghi chú: `equipment.getRoom() == null` là case thiết bị thuộc khu vực chung (shared) của property nguyên căn — vẫn hợp lệ miễn `property` khớp; `room == null` là case tenant báo cho nguyên căn (không truyền `roomId`).

## Phạm vi ảnh hưởng

Chỉ thêm 1 đoạn validate trong `createRequest()` — không đổi hành vi các case hợp lệ hiện có (mọi ticket tạo qua app thật đều đã đi qua `by-qr`/`me/equipments` nên `equipmentId` luôn đúng sẵn, check mới này chỉ chặn request cố tình gửi sai qua ngoài app).

## Checklist test

- [ ] Tạo ticket với `roomId` đúng của mình + `equipmentId` thuộc phòng khác → 400/422 "Thiết bị không thuộc phòng/nhà bạn đang báo sự cố".
- [ ] Tạo ticket bình thường qua app (equipmentId lấy từ QR/danh sách của đúng phòng) → vẫn 200 như cũ, không regressions.
- [ ] Case nguyên căn (không truyền roomId, property đúng của mình) + equipmentId thuộc khu vực chung của đúng property → vẫn cho tạo (không bị chặn nhầm).
