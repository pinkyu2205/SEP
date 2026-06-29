# Lỗi BE cần sửa — Host Web Portal (role OWNER) — 2026-06-29

Phát hiện khi host (`host@hoangbinhland.vn`) mở Cổng Quản lý Host sau khi manager đón khách qua app.
Hai lỗi đều ở **BE** (FE host đã nối API đúng / đã chỉnh để dùng endpoint host — xem mục FE cuối).

---

## 1. 🔴 `Equipment.recommendReplacement` — null vào kiểu nguyên thủy → 500
**Triệu chứng:** mở `localhost:5173/host/properties/{id}` → toast đỏ:
```
Null value was assigned to a property [class com.sep490.slms2026.entity.Equipment.recommendReplacement]
of primitive type: (setter)
```
→ `GET /api/v1/properties/{id}` (và mọi chỗ load entity `Equipment`) trả **500** → web hiện "Không tìm thấy thông tin căn nhà này".

**Nguyên nhân:** [entity/Equipment.java:82-84](../../../SEPBE/Sub-leasing-managemant-system/src/main/java/com/sep490/slms2026/entity/Equipment.java#L82)
```java
@Column(name = "recommend_replacement")
@Builder.Default
private boolean recommendReplacement = false;   // primitive -> KHÔNG nhận null
```
Cột `recommend_replacement` đang có dòng **NULL** trong DB (data cũ / migration thêm cột không set default & không backfill). Hibernate map null vào `boolean` → ném lỗi khi đọc.

**Cách sửa (BE) — nên làm cả 2:**
- Backfill + default cột:
  ```sql
  UPDATE equipment SET recommend_replacement = false WHERE recommend_replacement IS NULL;
  ALTER TABLE equipment ALTER COLUMN recommend_replacement SET DEFAULT false;
  ALTER TABLE equipment ALTER COLUMN recommend_replacement SET NOT NULL;
  ```
- (Phòng thủ) đổi field sang wrapper để không chết nếu còn null:
  `private Boolean recommendReplacement = false;`

---

## 2. 🔴 Trang "Khách thuê" host bị 403 — endpoint chỉ cho MANAGER/ADMIN
**Triệu chứng:** `localhost:5173/host/tenants` → toast "Không tải được dữ liệu hợp đồng".

**Nguyên nhân:** FE gọi `GET /api/v1/properties/{id}/tenant-contracts`, nhưng endpoint này:
[controller/TenantContractController.java](../../../SEPBE/Sub-leasing-managemant-system/src/main/java/com/sep490/slms2026/controller/TenantContractController.java)
```java
@GetMapping("/tenant-contracts")
@PreAuthorize("hasAnyRole('MANAGER','ADMIN')")   // KHÔNG có OWNER (host)
```
Host đăng nhập role **OWNER** → **403**.

**Cách sửa (BE) — chọn 1, khuyến nghị (b):**
- (a) Thêm `OWNER` vào `@PreAuthorize` của `tenant-contracts` **kèm scope** (host chỉ xem HĐ của BĐS mình sở hữu). Làm vậy thì FE host giữ nguyên bảng đầy đủ (SĐT/CCCD/cọc/ngày vào ở).
- (b) **Enrich endpoint host sẵn có** `GET /api/v1/host/contracts` cho đủ dùng:
  - Thêm query `propertyId` (lọc theo BĐS).
  - Bổ sung field vào `HostContractDto`: `tenantPhone`, `tenantCccd`, `deposit`, `moveInDate`
    (hiện chỉ có: `code, lesseeName, propertyName, roomCode, rentAmount, startDate, endDate, status, equipmentSnapshot`).

**FE đã tạm xử lý:** chuyển trang Khách thuê host từ `tenant-contracts` (403) sang `GET /api/v1/host/contracts`
(`hostService.listContracts`) → trang load được. **Hạn chế hiện tại do thiếu field/lọc:** chưa hiển thị
**SĐT, CCCD, tiền cọc, ngày vào ở** và phải **lọc theo tên BĐS** (vì DTO chưa có `propertyId`). Khi BE làm (b) thì FE hiển thị đầy đủ lại.

---

## 3. ℹ️ (Tham khảo) `HostContractController` có `findAll`/`findByStatus` không scope theo owner
[controller/HostContractController.java](../../../SEPBE/Sub-leasing-managemant-system/src/main/java/com/sep490/slms2026/controller/HostContractController.java)
dùng `contractRepository.findAll(pageable)` — nếu endpoint này còn sống thì 1 host có thể thấy HĐ của host khác.
Endpoint host chính đang dùng là `HostController#listContracts` (`/api/v1/host/contracts`); nên rà soát/đảm bảo
nó **lọc theo host đang đăng nhập**, và bỏ controller trùng nếu là code chết.
