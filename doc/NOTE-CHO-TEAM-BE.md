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

## 3. ~~Thiếu API XOÁ thiết bị đã gán~~ ✅ XONG (15/06/2026)

`DELETE /api/v1/properties/{propertyId}/equipments/{equipmentId}` — đã có trong BE và đang chạy live.

BE chặn xoá khi tòa không ở `DRAFT`/`UNDER_RENOVATION` (xem `EquipmentServiceImpl.unassignEquipment`).

**FE đã cập nhật (15/06/2026):**
- Nút ✕ xoá hoạt động bình thường.
- Thêm nút Pencil **sửa số lượng / nguồn** cho từng thiết bị trong phòng (FE tự xử lý bằng delete + re-assign vì BE chưa có `PUT /equipments/{id}`).
- Hiển thị `x{quantity}` và trạng thái (Mới/Tốt) ngay trên mỗi row.

**Còn thiếu (nếu muốn sửa mà không tạo record mới):**
```
PUT /api/v1/properties/{propertyId}/equipments/{equipmentId}
Body: { quantity, source }
```
Khi BE có endpoint này, FE có thể gọi trực tiếp thay vì delete + re-assign.

---

## 4. Bảng `equipment_manifests` thiếu cột `source` — lỗi 400 toàn bộ trang Host Review

**Phát hiện:** 15/06/2026 — sau khi merge branch Long vào Tien.

**Endpoint bị lỗi:** `GET /api/v1/properties/{id}/onboarding-summary` → 400 Bad Request.

**Lỗi SQL:**
```
JDBC exception executing SQL [ERROR: column em1_0.source does not exist Position: 79]
[select em1_0.id,em1_0.catalog_id,em1_0.price,em1_0.prop...
 from equipment_manifests em1_0 where em1_0.property_id=?]
```

**Nguyên nhân:** Branch Long thêm field `source` vào entity `EquipmentManifest` (JPA) nhưng **chưa tạo DB migration** để thêm cột tương ứng vào bảng `equipment_manifests`. Hibernate cố select cột `source` không tồn tại → query fail.

**Sửa:** Thêm migration SQL (Flyway hoặc Liquibase) tạo cột `source`:

```sql
ALTER TABLE equipment_manifests
    ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'INITIAL_HANDOVER';
```

(Giá trị mặc định `INITIAL_HANDOVER` khớp với enum `EquipmentSource` hiện có.)

**Tác động:** Bất kỳ query nào đụng vào bảng `equipment_manifests` đều fail. Các màn hình bị ảnh hưởng:
- `/host/review/{id}` (qua endpoint `onboarding-summary`)
- `/admin/buildings/draft` (qua endpoint `equipment-manifest`)
- Bất kỳ chỗ nào load thiết bị manifest của property

FE không thể can thiệp — phải chờ BE chạy migration.

---

---

## 5. Cần endpoint "Bắt đầu cải tạo lại" cho nhà đang kinh doanh (ACTIVE → UNDER_RENOVATION)

**Phát hiện:** 15/06/2026 — FE đã làm sẵn UI cho phép admin cải tạo lại nhà đang ACTIVE.

**Endpoint FE đang gọi:**
```
POST /api/v1/properties/{id}/renovation/start
```

**Logic cần BE xử lý:**
1. Kiểm tra property tồn tại và đang ở trạng thái `ACTIVE`
2. Đổi status → `UNDER_RENOVATION`
3. Reset `renovationCompleted = false`
4. Trả về `PropertyResponse` mới

**Lưu ý quan trọng:** FE đã tự kiểm tra phòng trống ở client-side (check room status = RENTED). BE nên kiểm tra lại server-side để đảm bảo an toàn — nếu còn phòng RENTED thì ném lỗi `BusinessException`.

**Code đề xuất:**

```java
// PropertyOnboardingServiceImpl hoặc service tương ứng
@Transactional
public PropertyResponse startRenovation(Long propertyId) {
    Property property = propertyRepository.findById(propertyId)
        .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tòa nhà ID: " + propertyId));

    if (property.getStatus() != PropertyStatus.ACTIVE) {
        throw new BusinessException("Chỉ có thể cải tạo lại khi tòa nhà đang ACTIVE");
    }

    // Kiểm tra phòng còn khách (chỉ áp dụng nhà chia phòng)
    if (Boolean.FALSE.equals(property.getWholeHouse())) {
        long rentedCount = roomRepository.countByPropertyIdAndStatus(propertyId, RoomStatus.RENTED);
        if (rentedCount > 0) {
            throw new BusinessException("Còn " + rentedCount + " phòng đang có khách thuê — không thể cải tạo");
        }
    }

    property.setStatus(PropertyStatus.UNDER_RENOVATION);
    property.setRenovationCompleted(false);
    return toResponse(propertyRepository.save(property));
}
```

```java
// Controller
@PostMapping("/{id}/renovation/start")
public ResponseEntity<PropertyResponse> startRenovation(@PathVariable Long id) {
    return ResponseEntity.ok(propertyService.startRenovation(id));
}
```

---

---

## 6. `GET /properties` thiếu field `operationManagerName` trong response list

**Phát hiện:** 15/06/2026.

**Hiện trạng:** Endpoint `GET /api/v1/properties` trả về `operationManagerId` nhưng **không trả về `operationManagerName`**. FE hiển thị "Chưa có quản lý" dù thực tế đã gán.

**Đề xuất:** Trong `PropertyResponse` (DTO dùng cho list), thêm field `operationManagerName` bằng cách join với bảng user khi map DTO:

```java
// Trong method toResponse() hoặc mapper:
if (property.getOperationManagerId() != null) {
    userRepository.findById(property.getOperationManagerId())
        .ifPresent(u -> dto.setOperationManagerName(u.getFullName() != null ? u.getFullName() : u.getUsername()));
}
```

FE đã có fallback tạm ("Đã gán quản lý") nhưng tên thật vẫn cần BE trả về.

---

---

## 7. `PATCH /operation-manager` phải cho phép cả khi nhà đang ACTIVE

**Phát hiện:** 15/06/2026.

**Hiện trạng:** `PATCH /api/v1/properties/{id}/operation-manager` trả về 422:
```
Chỉ có thể gán Operation Manager khi nhà ở trạng thái PENDING_OPERATION_MANAGER
```

**Yêu cầu nghiệp vụ:** Host cần đổi manager sau khi nhà đã ACTIVE (ví dụ manager cũ nghỉ việc). BE cần cho phép cả 2 trạng thái.

**Đề xuất:** Sửa validation trong service:
```java
// Trước:
if (property.getStatus() != PropertyStatus.PENDING_OPERATION_MANAGER) {
    throw new BusinessException("Chỉ có thể gán Operation Manager khi nhà ở trạng thái PENDING_OPERATION_MANAGER");
}

// Sau:
if (property.getStatus() != PropertyStatus.PENDING_OPERATION_MANAGER
        && property.getStatus() != PropertyStatus.ACTIVE) {
    throw new BusinessException("Chỉ có thể gán/đổi Operation Manager khi nhà đang PENDING_OPERATION_MANAGER hoặc ACTIVE");
}
```

---

## 8. `POST /host-confirm` nên không bắt buộc `operationManagerId`

**Phát hiện:** 15/06/2026.

**Hiện trạng:** BE bắt buộc `operationManagerId` trong payload `host-confirm`. FE cũ workaround bằng cách tự chọn manager đầu tiên trong list → auto-gán manager mà host không hay biết.

**Yêu cầu nghiệp vụ:** Host xác nhận giá và manager assignment là 2 bước độc lập. Host confirm giá xong → nhà vào `PENDING_OPERATION_MANAGER` → host tự chọn manager sau.

**Đề xuất:** Trong `HostConfirmServiceImpl.confirmProperty`, nếu `operationManagerId` null/empty thì không gán manager, để property ở `PENDING_OPERATION_MANAGER`.

---

---

## 9. Cần endpoint "Hoàn thành cải tạo" (UNDER_RENOVATION → ACTIVE)

**Phát hiện:** 15/06/2026 — FE đã làm UI cho phép admin xác nhận cải tạo xong trong luồng cải tạo lại.

**Endpoint FE đang gọi:**
```
POST /api/v1/properties/{id}/renovation/complete
```

**Logic cần BE xử lý:**
1. Kiểm tra property tồn tại và đang ở trạng thái `UNDER_RENOVATION`
2. Đặt `renovationCompleted = true`
3. Đổi status → `ACTIVE` (nhà cải tạo lại sẽ quay lại kinh doanh ngay, không cần phê duyệt lại từ Host)
4. Trả về `PropertyResponse` mới

**Code đề xuất:**

```java
// PropertyOnboardingServiceImpl hoặc service tương ứng
@Transactional
public PropertyResponse completeRenovation(Long propertyId) {
    Property property = propertyRepository.findById(propertyId)
        .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tòa nhà ID: " + propertyId));

    if (property.getStatus() != PropertyStatus.UNDER_RENOVATION) {
        throw new BusinessException("Chỉ có thể xác nhận hoàn thành khi tòa nhà đang UNDER_RENOVATION");
    }

    property.setRenovationCompleted(true);
    property.setStatus(PropertyStatus.ACTIVE);
    return toResponse(propertyRepository.save(property));
}
```

```java
// Controller
@PostMapping("/{id}/renovation/complete")
public ResponseEntity<PropertyResponse> completeRenovation(@PathVariable Long id) {
    return ResponseEntity.ok(propertyService.completeRenovation(id));
}
```

---

---

## 10. Lịch sử cải tạo phải nhóm theo từng đợt (Renovation Sessions)

**Phát hiện:** 15/06/2026.

**Yêu cầu nghiệp vụ:** Admin muốn xem lịch sử cải tạo của tòa nhà theo từng đợt riêng biệt (Cải tạo lần 1, Cải tạo lần 2…) với ngày thực hiện. Hiện tại `renovation_lines` là bảng phẳng không có concept "đợt cải tạo".

**Endpoint FE đang gọi (chờ BE):**
```
GET /api/v1/properties/{id}/renovation/sessions
```

**Response mong đợi:**
```json
[
  {
    "sessionNumber": 1,
    "startDate": "2026-01-10",
    "endDate": "2026-02-15",
    "totalCost": 11500000,
    "lines": [
      { "id": 1, "categoryName": "Điện nước", "cost": 4500000, "note": null },
      { "id": 2, "categoryName": "Sơn sửa",   "cost": 5000000, "note": null },
      { "id": 3, "categoryName": "Sàn nhà",   "cost": 2000000, "note": null }
    ]
  },
  {
    "sessionNumber": 2,
    "startDate": "2026-06-01",
    "endDate": null,
    "totalCost": 3000000,
    "lines": [
      { "id": 7, "categoryName": "Sơn sửa", "cost": 3000000, "note": "Đợt 2" }
    ]
  }
]
```

**Cách implement BE:**

1. Tạo bảng `renovation_sessions`:
```sql
CREATE TABLE renovation_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    property_id BIGINT NOT NULL REFERENCES properties(id),
    session_number INT NOT NULL,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

2. Thêm cột `session_id` vào `renovation_lines`:
```sql
ALTER TABLE renovation_lines ADD COLUMN session_id BIGINT REFERENCES renovation_sessions(id);
```

3. Khi `POST /renovation/start` được gọi → tạo 1 `RenovationSession` mới với `sessionNumber = max(sessionNumber) + 1`.

4. Khi thêm renovation line (trong đợt UNDER_RENOVATION) → gán `sessionId` = session đang active của property đó.

5. Endpoint `GET /renovation/sessions` → trả list sessions kèm lines của từng session.

**Lưu ý migration:** Các `renovation_lines` hiện tại (chưa có `session_id`) → gán vào session 1 mặc định.

**FE đã chuẩn bị:** UI accordion nhóm theo session, sẽ render ngay khi endpoint trả đúng format trên.

---

## 11. Thiếu API sửa tên & xoá phòng (rename/delete room)

**Phát hiện:** 15/06/2026 — khi cải tạo lại tòa nhà "Messi".

**Bối cảnh:** Admin cải tạo lại, đổi cấu trúc từ 4 phòng → 9 phòng (2 tầng → 3 tầng). Bên admin `totalRooms` đã = 9, nhưng bên màn **Host** chỉ thấy 4 phòng gốc.

**Nguyên nhân:** `PUT /properties/{id}/structure` chỉ cập nhật con số `totalFloor`/`totalRooms`, **không tạo bản ghi phòng thật**. Host hiển thị theo `GET /properties/{id}/rooms` (phòng thật) nên chỉ thấy 4.

**FE đã xử lý phần "thêm phòng":** Trong luồng cải tạo lại (nhà chia phòng), FE đã thêm bước **"Chia phòng"** để admin tạo các phòng mới bằng `POST /properties/{id}/rooms` cho đủ `totalRooms`. ⇒ Sau khi admin tạo đủ phòng, Host sẽ thấy đúng.

**✅ ĐÃ XONG (cập nhật 15/06/2026):** BE đã bổ sung đủ 2 endpoint, đã xác nhận **đang chạy live** trên server (kiểm qua `/v3/api-docs`):

```
PUT    /api/v1/properties/{id}/rooms/{roomId}     // sửa: roomNumber, area, maxOccupants...
DELETE /api/v1/properties/{id}/rooms/{roomId}     // xoá phòng (khi giảm số phòng sau cải tạo)
```

BE chặn xoá/sửa với các điều kiện (`RoomServiceImpl.deleteRoom`): tòa phải `DRAFT`/`UNDER_RENOVATION`; phòng không `RENTED`; phòng không còn thiết bị gán; phòng chưa có lịch sử chỉ số điện/nước. Khi vi phạm → trả **422** kèm lý do.

> ⚠️ **Lỗi tưởng "BE chưa có endpoint" thực ra là bug FE đọc nhầm field:** `GlobalExceptionHandler` trả lý do ở field **`error`** (không phải `message`). FE trước đây chỉ đọc `err.response.data.message` nên luôn rơi vào câu fallback "BE chưa có endpoint này". **Đã sửa FE** (đọc `data.error ?? data.message`) trong `StepOnboardingOptions.tsx` cho cả xoá/sửa phòng và xoá thiết bị gán. Lưu ý chung: mọi chỗ FE hiển thị lỗi từ BE phải ưu tiên field `error`.

---

## 11. `AssignEquipmentRequest` thiếu field `price` — không lưu được giá thiết bị mới mua

**Phát hiện:** 15/06/2026 — trang Danh mục thiết bị cần nhập giá khi thêm thiết bị mua mới (PURCHASED).

**Hiện trạng:** `AssignEquipmentRequest.java` có: `catalogId, quantity, status, source, roomId, houseArea` — **không có `price`**.
Nhưng entity `Equipment.java` có field `price (BigDecimal)`. FE form đã có input giá nhưng **chưa gửi lên BE** được.

**Sửa:**
```java
// AssignEquipmentRequest.java — thêm:
private java.math.BigDecimal price;

// EquipmentServiceImpl — khi set entity:
equipment.setPrice(request.getPrice() != null ? request.getPrice() : BigDecimal.ZERO);
```

---

## 12. Thiếu CRUD endpoint cho Danh mục thiết bị (`/api/v1/equipment-catalog`)

**Phát hiện:** 15/06/2026 — FE tạo trang quản lý Danh mục thiết bị (`/admin/equipments`).

**Hiện trạng:** `PropertyOnboardingController` chỉ có 1 endpoint đọc:
```
GET /api/v1/equipment-catalog     → List<EquipmentCatalogResponse>
```

**Cần thêm (FE đã gọi sẵn, BE chưa implement):**
```
POST   /api/v1/equipment-catalog           Body: { name, description? }  → EquipmentCatalogResponse
PUT    /api/v1/equipment-catalog/{id}      Body: { name, description? }  → EquipmentCatalogResponse
DELETE /api/v1/equipment-catalog/{id}                                    → 204 No Content
```

**Ràng buộc cần kiểm tra ở BE:**
- `name` unique (đã có `unique = true` trên entity) → trả 409 khi trùng tên
- DELETE: chặn xoá nếu catalog đang được tham chiếu bởi `equipment_manifests` hoặc `equipments` → trả 422 kèm lý do
- `active` field trên entity: khi DELETE có thể soft-delete (`active = false`) thay vì hard delete để tránh vi phạm FK

**DTO đề xuất (giống `EquipmentCatalogResponse` hiện tại):**
```java
// Request
@NotBlank String name;
String description;

// Response (giữ nguyên EquipmentCatalogResponse, thêm active nếu cần)
private Long id;
private String name;
private String description;
```

---

## 12. `EquipmentResponse` thiếu field trong FE type (đã sửa FE)

**Phát hiện:** 15/06/2026 — xem BE entity `Equipment.java` và `EquipmentResponse.java`.

**BE `EquipmentResponse` có:** `id, propertyId, roomId, catalogId, catalogName, houseArea, source, status, price, note`

**FE `EquipmentAssignmentResponse` trước đây thiếu:** `source`, `price`, `note` → FE không hiển thị được nguồn gốc (gốc/mới mua) và giá thiết bị.

**Đã sửa FE (15/06/2026):** cập nhật `EquipmentAssignmentResponse` trong `api.types.ts` — thêm đầy đủ `source: EquipmentSource`, `price?: number`, `note?: string`. Không cần BE thay đổi gì.

---

## 14. Bảng `rooms` thiếu cột `is_deleted` — lỗi 400 toàn bộ `GET /properties/{id}/rooms`

**Phát hiện:** 15/06/2026 — màn Cấu hình khai thác (Vila vippro, propertyId=14).

**Lỗi:**
```
JDBC exception executing SQL [ERROR: column r1_0.is_deleted does not exist Position: 26]
[select r1_0.id,r1_0.area,r1_0.is_deleted,r1_0.deposit...
 from rooms r1_0 join properties p1_0...]
```

**Nguyên nhân:** Entity `Room.java` có field `isDeleted` (soft-delete) nhưng **chưa có DB migration** để thêm cột vào bảng `rooms`. Mọi query vào `rooms` đều fail — bao gồm `GET /properties/{id}/rooms` trả 400.

**Sửa:** Thêm migration:
```sql
ALTER TABLE rooms
    ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
```

**Tác động:** Toàn bộ luồng Cấu hình khai thác (chia phòng, gán thiết bị) bị ảnh hưởng với nhà **chia phòng** (`wholeHouse = false`).

**FE đã workaround (15/06/2026):** Bổ sung `.catch(() => [])` cho từng call trong `Promise.all` của `StepOnboardingOptions.tsx` để trang vẫn render được, không crash trắng — nhưng danh sách phòng sẽ trống cho đến khi BE chạy migration.

---

## Tóm tắt trạng thái FE hiện tại

| Tính năng FE | Trạng thái | Phụ thuộc BE |
|---|---|---|
| Cập nhật cấu trúc tầng/phòng (gửi `totalFloor`/`totalRooms`) | ✅ Chạy được ngay | Không — BE đã có sẵn |
| Gán thiết bị GOOD/NEW đúng status manifest | ✅ Chạy được ngay | Không — BE đã có sẵn |
| Nhà nguyên căn: bỏ yêu cầu gán thiết bị ở FE | ✅ Chạy được ngay | Không |
| Nút "Cập nhật Hợp đồng" (lưu lần 2) | ⏳ Chờ BE | **Mục 1** |
| Submit-to-host nhà nguyên căn | ⏳ Chờ BE | **Mục 2** |
| Nút ✕ xoá + Pencil sửa thiết bị đã gán | ✅ Chạy được | **Mục 3** — BE đã có DELETE |
| Cải tạo lại (ACTIVE → UNDER_RENOVATION) | ⏳ Chờ BE | **Mục 5** |
| Xác nhận cải tạo hoàn tất (UNDER_RENOVATION → ACTIVE) | ⏳ Chờ BE | **Mục 9** |
| Lịch sử cải tạo nhóm theo đợt | ⏳ Chờ BE | **Mục 10** |
| Giá thiết bị mới mua (field `price`) | ⏳ Chờ BE | **Mục 11** — thêm `price` vào `AssignEquipmentRequest` |
| Trang quản lý Danh mục thiết bị (CRUD) | ⏳ Chờ BE | **Mục 12** — GET đã có, cần POST/PUT/DELETE |
| Hiển thị nguồn gốc + giá thiết bị đã gán | ✅ FE đã sửa type | **Mục 13** — không cần BE thay đổi |
| `GET /properties/{id}/rooms` trả 400 (nhà chia phòng) | ⏳ Chờ BE migration | **Mục 14** — thiếu cột `is_deleted` trong bảng `rooms` |
