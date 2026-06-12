# NOTE CHO TEAM BE — Các API còn thiếu / lỗi phát hiện từ phía FE

> Người viết: FE team (trang Onboarding tòa nhà — wizard Super Admin & Cấu hình khai thác).
> Ngày: 12/06/2026.
> Bối cảnh: trong lúc làm FE, bọn mình phát hiện 3 vấn đề nằm ở phía BE. FE đã code sẵn phần gọi API theo mô tả dưới đây, BE làm xong là chạy được luôn, không cần FE đổi gì thêm (trừ mục 1 nếu chọn phương án B).

---

## 1. Không cập nhật được Hợp đồng inbound (lưu lần 2 bị chặn)

**File:** `service/impl/InboundContractServiceImpl.java` → method `signContract`

**Hiện trạng:** `POST /api/v1/properties/{propertyId}/inbound-contract` lần 2 luôn bị ném lỗi:

```java
if (inboundContractRepository.existsByPropertyId(propertyId)) {
    throw new BusinessException("Tòa nhà này đã có hợp đồng inbound");
}
```

**Vấn đề:** FE có nút **"Cập nhật Hợp đồng"** (sửa mã HĐ, tên chủ nhà, tiền thuê, ngày, file scan khi nhà còn DRAFT) nhưng BE không có cách nào update — POST bị chặn, không có PUT.

**Đề xuất (phương án A — FE đang gọi theo cách này, không cần đổi FE):** biến `signContract` thành upsert — nếu đã có hợp đồng thì cập nhật field thay vì ném lỗi:

```java
// bỏ block existsByPropertyId ném lỗi, thay bằng:
InboundContract contract = inboundContractRepository.findByPropertyId(propertyId)
        .orElseGet(() -> InboundContract.builder()
                .property(property)
                .status(ContractStatus.ACTIVE)
                .build());

contract.setContractCode(request.getContractCode());
contract.setOwnerName(request.getOwnerName());
contract.setTotalRentAmount(request.getTotalRentAmount());
contract.setStartDate(request.getStartDate());
contract.setEndDate(request.getEndDate());
contract.setContractScanUrl(request.getContractScanUrl());

InboundContract saved = inboundContractRepository.save(contract);
return toResponse(saved);
```

Giữ nguyên 2 validation hiện có (property phải DRAFT, endDate sau startDate).

**Phương án B (nếu muốn chuẩn REST):** thêm `PUT /api/v1/properties/{propertyId}/inbound-contract` riêng cho update → báo lại FE để đổi service gọi PUT khi đã có hợp đồng.

---

## 2. Nhà NGUYÊN CĂN không bao giờ submit-to-host được (mâu thuẫn logic)

**File:** `service/impl/PropertyOnboardingServiceImpl.java` → method `validateReadyForSubmit`

**Hiện trạng — 2 chỗ mâu thuẫn nhau:**

- `RoomServiceImpl.addRoom` **cấm** tạo phòng cho nhà nguyên căn:
  ```java
  if (Boolean.TRUE.equals(property.getWholeHouse())) {
      throw new BusinessException("Nhà nguyên căn không thêm phòng riêng lẻ — giá được quản lý ở cấp tòa nhà");
  }
  ```
- Nhưng `validateReadyForSubmit` lại **bắt buộc đủ phòng với MỌI loại nhà**:
  ```java
  long roomCount = roomRepository.countByPropertyId(propertyId);
  if (roomCount != property.getTotalRooms()) {
      throw new BusinessException(String.format(
              "Phải tạo đủ %d phòng chi tiết (hiện có %d)", property.getTotalRooms(), roomCount));
  }
  ```

→ Nhà nguyên căn: không được tạo phòng (roomCount = 0) nhưng submit đòi đủ `totalRooms` phòng → **kẹt vĩnh viễn, không gửi host được**.

**Đề xuất:** chuyển check số phòng vào trong nhánh `if (Boolean.FALSE.equals(property.getWholeHouse()))` (cùng chỗ với check gán đủ thiết bị — block ngay phía trên). Đã xác nhận tính giá nguyên căn (`DepreciationServiceImpl.calculateWholeHouse`) không cần phòng nên sửa vậy là an toàn.

**Lưu ý thêm:** file `docs/test-scenarios/case-1-whole-house-e2e.json` (step 5) vẫn mô tả nguyên căn tạo 4 phòng — doc này đã lỗi thời so với code `addRoom` hiện tại, team nên thống nhất lại 1 hướng và cập nhật doc.

---

## 3. Thiếu API XOÁ thiết bị đã gán (gán nhầm không gỡ ra được)

**Hiện trạng:** chỉ có `POST /equipments/assign` và `GET /equipments` — gán nhầm thiết bị vào phòng là không có cách nào xoá.

**FE đã làm sẵn nút ✕ gọi endpoint sau (BE chỉ cần implement đúng URL này):**

```
DELETE /api/v1/properties/{propertyId}/equipments/{equipmentId}
```

(`equipmentId` = `id` trong response của `GET /properties/{propertyId}/equipments` — mỗi bản ghi Equipment là 1 đơn vị thiết bị.)

**Code đề xuất:**

`repository/EquipmentRepository.java` — thêm:
```java
Optional<Equipment> findByIdAndPropertyId(Long id, Long propertyId);
```

`service/EquipmentService.java` — thêm:
```java
void unassignEquipment(Long propertyId, Long equipmentId);
```

`service/impl/EquipmentServiceImpl.java` — thêm:
```java
@Override
@Transactional
public void unassignEquipment(Long propertyId, Long equipmentId) {
    Property property = propertyRepository.findById(propertyId)
            .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tòa nhà với ID: " + propertyId));
    if (property.getStatus() != PropertyStatus.DRAFT) {
        throw new BusinessException("Chỉ có thể xoá thiết bị đã gán khi tòa nhà đang ở trạng thái DRAFT");
    }
    Equipment equipment = equipmentRepository.findByIdAndPropertyId(equipmentId, propertyId)
            .orElseThrow(() -> new ResourceNotFoundException(
                    "Không tìm thấy thiết bị ID=" + equipmentId + " trong tòa nhà ID=" + propertyId));
    equipmentRepository.delete(equipment);
}
```
(cần import thêm: `Property`, `PropertyStatus`, `BusinessException`)

`controller/EquipmentController.java` — thêm:
```java
@DeleteMapping("/{equipmentId}")
public ResponseEntity<Void> unassignEquipment(@PathVariable Long propertyId,
                                              @PathVariable Long equipmentId) {
    equipmentService.unassignEquipment(propertyId, equipmentId);
    return ResponseEntity.noContent().build();
}
```

---

## Tóm tắt trạng thái FE hiện tại

| Tính năng FE | Trạng thái | Phụ thuộc BE |
|---|---|---|
| Cập nhật cấu trúc tầng/phòng (gửi `totalFloor`/`totalRooms`) | ✅ Chạy được ngay | Không — BE đã có sẵn |
| Gán thiết bị GOOD/NEW đúng status manifest | ✅ Chạy được ngay | Không — BE đã có sẵn |
| Nhà nguyên căn: bỏ yêu cầu gán thiết bị ở FE | ✅ Chạy được ngay | Không |
| Nút "Cập nhật Hợp đồng" (lưu lần 2) | ⏳ Chờ BE | **Mục 1** |
| Submit-to-host nhà nguyên căn | ⏳ Chờ BE | **Mục 2** |
| Nút ✕ xoá thiết bị đã gán trong phòng | ⏳ Chờ BE (hiện bấm sẽ lỗi 404) | **Mục 3** |
