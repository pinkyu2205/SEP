# BE BUG — Import Excel onboarding chặn bởi `properties_status_check`

> Ghi chú cho team BE. FE chỉ đọc repo SEPBE, không sửa BE.
> Ngày phát hiện: 2026-06-17 · Người báo: FE (Tien)

## 1. Triệu chứng

Màn **Import Excel hàng loạt** (`/admin/buildings/import`):

- Bước **Kiểm tra file** (`dryRun=true`) → OK (1 căn nhà, 2 dòng cải tạo, 3 dòng thiết bị).
- Bước **Import dữ liệu** (`dryRun=false`) → HTTP 400, BE trả message:

```
could not execute statement
[ERROR: new row for relation "properties" violates check constraint "properties_status_check"
 Detail: Failing row contains (17, Số 18, Biệt thự ...)]
SQL [update properties set address=?,area_size=?,...,status=?,... where id=?];
constraint [properties_status_check]
```

FE hiển thị đúng message này trong banner lỗi — **không phải lỗi FE**.

## 2. Nguyên nhân

Luồng import set trạng thái property cuối cùng = **`RENOVATION_COMPLETED`** (đúng theo `docs/excel-import-frontend.md` §6). Nhưng CHECK constraint `properties_status_check` **trên database hiện tại** chưa có giá trị này → Postgres chặn câu `UPDATE`.

Bằng chứng (đều đã đúng ở phía code, chỉ DB chưa cập nhật):

- `enums/PropertyStatus.java` → đã có `RENOVATION_COMPLETED`.
- `src/main/resources/db/manual-migration-v2.sql` (dòng 21–34) → đã `DROP` và `ADD` lại constraint bao gồm `RENOVATION_COMPLETED`.

→ File `manual-migration-v2.sql` là **migration THỦ CÔNG** và **chưa được chạy** trên DB đang dùng. DB vẫn giữ constraint cũ.

## 3. Cách sửa (chạy 1 lần trên DB)

Chạy đúng đoạn trong `manual-migration-v2.sql`:

```sql
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check
    CHECK (status IN (
        'DRAFT',
        'PENDING',
        'UNDER_RENOVATION',
        'PENDING_EQUIPMENT_INSTALLATION',
        'RENOVATION_COMPLETED',
        'PENDING_HOST_REVIEW',
        'PENDING_OPERATION_MANAGER',
        'ACTIVE',
        'DISABLED',
        'MAINTENANCE',
        'INACTIVE'
    ));
```

Sau khi chạy, import lại file Excel → thành công.

## 4. Khuyến nghị

- Đưa nội dung `manual-migration-v2.sql` vào pipeline migration tự động (Flyway/Liquibase) để mọi môi trường (dev/staging/prod) không bị sót.
- Kiểm tra DB còn dữ liệu property nào `status` ngoài danh sách trên trước khi `ADD` constraint (nếu có sẽ ALTER lỗi).
- Lưu ý: căn import dở dang (property đã tạo nhưng UPDATE status fail) có thể đã tồn tại ở DB với status trước đó — kiểm tra rollback transaction của luồng import (`PropertyOnboardingServiceImpl` / import service) đảm bảo toàn bộ thao tác trong 1 transaction, tránh để lại property "mồ côi".

---

# BE BUG #2 — Xóa property không xóa được vì còn ràng buộc khóa ngoại

> Phát hiện khi cố xóa property mồ côi (#19) do BUG #1 để lại.

## 1. Triệu chứng

Bấm **Xóa** một tòa nhà chưa ACTIVE → HTTP 400:

```
ERROR: update or delete on table "properties" violates foreign key constraint
"fk35r032kwh410ggyqcbqrnhcut" on table "rooms"
Detail: Key (id)=(19) is still referenced from table "rooms".
[delete from properties where id=?]
```

## 2. Nguyên nhân

`PropertyServiceImpl.deleteProperty()` (dòng ~129) chỉ gọi `propertyRepository.delete(property)` →
hard `DELETE FROM properties` **không xóa bản ghi con và không có cascade**. Postgres chặn vì còn
các bảng tham chiếu `property_id` / `room_id`.

Bản đồ phụ thuộc (tất cả tham chiếu tới property qua `property_id`, hoặc tới room qua `room_id`):

| Bảng | FK | Ghi chú |
|------|-----|---------|
| `rooms` | property_id | |
| `equipments` | property_id, room_id, manifest_id | |
| `equipment_manifests` | property_id | sau `equipments` |
| `inbound_contracts` | property_id | |
| `depreciation_results` | inbound_contract_id, room_id | xóa sớm nhất |
| `monthly_readings` | property_id, room_id | |
| `renovation_lines` | property_id, session_id | trước `renovation_sessions` |
| `renovation_sessions` | property_id | |
| `property_images` | property_id | @ElementCollection |

## 3. Cách sửa BE (chọn 1)

- **Khuyên dùng — soft delete:** đặt `is_deleted=true` (rooms đã có cột `is_deleted` từ migration v2). Không xóa cứng.
- Hoặc trong `deleteProperty()` xóa con theo đúng thứ tự phụ thuộc trước khi xóa property (1 transaction).
- Hoặc thêm `ON DELETE CASCADE` cho các FK (rủi ro mất dữ liệu — cân nhắc).

### CẬP NHẬT 2026-06-17 — BE đã thêm cascade nhưng SAI THỨ TỰ

BE đã sửa `deleteProperty` để xóa con, nhưng xóa **`renovation_sessions` TRƯỚC `renovation_lines`** → vẫn lỗi:

```
delete from renovation_sessions ... violates FK "fkqos7ok6xwn4pfcbi2u508k77c" on table "renovation_lines"
Detail: Key (id)=(15) is still referenced from table "renovation_lines".
```

Vì `renovation_lines.session_id` → `renovation_sessions(id)`. **Phải xóa `renovation_lines` TRƯỚC, rồi mới `renovation_sessions`.**

Thứ tự xóa con đúng (con → cha): `depreciation_results` → `equipments` → `monthly_readings`
→ `inbound_contracts` → **`renovation_lines` → `renovation_sessions`** → `equipment_manifests`
→ `property_images` → `rooms` → `properties`.

### CẬP NHẬT thêm — lỗi optimistic lock khi xóa

Có lúc xóa lại báo:

```
Row was already updated or deleted by another transaction
for entity [com.sep490.slms2026.entity.InboundContract with id '12']
```

Đây là `StaleObjectStateException` của Hibernate: `deleteProperty` đang **nạp từng entity con rồi `delete()`** (kiểm tra version/@Version), nên khi row bị đụng ngoài luồng (import dở, xóa 1 phần trước đó) thì lệch phiên bản → 400.

**Khuyến nghị BE (gốc rễ):** thay vì load entity rồi xóa từng cái, dùng **bulk delete native/JPQL** theo đúng thứ tự con→cha (`@Modifying @Query("delete from ...")`), hoặc **soft delete**. Bulk delete bỏ qua kiểm tra version nên không dính lỗi này, và nhanh hơn.

### Dọn mồ côi nhanh (tái sử dụng)

`docs`/Temp có sẵn `cleanup_property.sql` (xóa thẳng theo property_id, bỏ qua Hibernate):

```
psql -h localhost -U postgres -d slms2026_db -v pid=<ID> -f cleanup_property.sql
```

### ĐÃ KHẮC PHỤC (2026-06-17) — BE chuyển sang bulk delete

BE đã sửa dứt điểm: `deleteProperty` giờ chỉ **bulk delete** (JPQL + native, đúng thứ tự con→cha,
1 transaction), `DELETE /properties/{id}` trả **204**. Hết cả 3 lỗi trên.
Hợp đồng API chính thức: `SEPBE/docs/fe-property-delete-api.md`.

**FE đã đồng bộ:** `deleteProperty` (204), `purgeProperty` (`/purge`),
`importService.deleteImportedContract(contractCode)` (rollback import), và xử lý 204/404/422/403
bằng toast. Nếu vẫn gặp lỗi optimistic-lock → BE chưa deploy/restart bản mới.

---

# BE BUG #4 (2026-06-17) — ClassCastException khi xóa: `Object[] → String`

## Triệu chứng
Xóa property (#22) → 400:
```
class [Ljava.lang.Object; cannot be cast to class java.lang.String
DELETE /api/v1/properties/22
```

## Vị trí & nguyên nhân
`service/impl/PropertyDeletionServiceImpl.java:32-36`:

```java
Object[] nameAndStatus = propertyRepository.findNameAndStatusById(propertyId).orElseThrow(...);
String propertyName     = (String) nameAndStatus[0];          // ← ClassCastException
PropertyStatus status   = (PropertyStatus) nameAndStatus[1];
```

Lỗi Spring Data JPA kinh điển: query nhiều cột (`SELECT p.propertyName, p.status`) với kiểu trả
`Optional<Object[]>` bị **bọc lồng một tầng** → `nameAndStatus` thực ra là `Object[]{ Object[]{name, status} }`,
nên `nameAndStatus[0]` là `Object[]` chứ không phải `String`.

## Cách sửa BE (khuyên dùng — projection interface)
```java
public interface PropertyNameStatusView {
    String getPropertyName();
    PropertyStatus getStatus();
}

@Query("select p.propertyName as propertyName, p.status as status from Property p where p.id = :id")
Optional<PropertyNameStatusView> findNameAndStatusById(@Param("id") Long id);
```
```java
var view = propertyRepository.findNameAndStatusById(propertyId).orElseThrow(...);
String propertyName   = view.getPropertyName();
PropertyStatus status = view.getStatus();
```

Hoặc đơn giản nhất: load thẳng entity `propertyRepository.findById(propertyId)` rồi đọc
`getPropertyName()` / `getStatus()`.

> FE không xử lý được lỗi này — thuần BE. Trong lúc chờ, dùng `cleanup_property.sql -v pid=<ID>`.

---

# BE YÊU CẦU MỚI — Endpoint kích hoạt lại tòa nhà từ DISABLED

## Bối cảnh (FE đã làm)
Màn Khởi tạo tòa nhà nay theo luồng 2 bước:
- Tòa nhà thường → nút **Vô hiệu hóa** (`POST /properties/{id}/disable`, đã có).
- Tòa nhà **DISABLED** → 2 nút: **Kích hoạt lại** + **Xóa vĩnh viễn** (`DELETE /properties/{id}`).

## Thiếu endpoint
BE hiện **chỉ có `/disable`**, KHÔNG có endpoint bật lại. Cần BE bổ sung:

```
POST /api/v1/properties/{id}/enable
```

- Điều kiện: property đang `DISABLED`.
- Hành vi: đưa status về trạng thái hợp lệ trước đó (gợi ý `DRAFT` hoặc `PENDING_HOST_REVIEW`).
- Response: `PropertyResponse` (giống `/disable`).

FE đã wire sẵn `propertyService.enableProperty(id)` → gọi endpoint trên; khi BE chưa có sẽ báo
404/405 và hiển thị toast "BE chưa hỗ trợ kích hoạt lại". Có endpoint là chạy ngay, không cần sửa FE.

## 4. Dọn ngay property mồ côi #19 (chạy 1 lần trên DB)

```sql
BEGIN;
-- 1) Khấu hao (ref inbound_contract_id + room_id) — xóa sớm nhất
DELETE FROM depreciation_results
 WHERE room_id IN (SELECT id FROM rooms WHERE property_id = 19)
    OR inbound_contract_id IN (SELECT id FROM inbound_contracts WHERE property_id = 19);
-- 2) Thiết bị (property_id, room_id, manifest_id)
DELETE FROM equipments WHERE property_id = 19;
-- 3) Chỉ số điện/nước
DELETE FROM monthly_readings WHERE property_id = 19;
-- 4) Hợp đồng đầu vào (sau khấu hao)
DELETE FROM inbound_contracts WHERE property_id = 19;
-- 5) Cải tạo: dòng trước, đợt sau
DELETE FROM renovation_lines WHERE property_id = 19;
DELETE FROM renovation_sessions WHERE property_id = 19;
-- 6) Manifest thiết bị (sau equipments)
DELETE FROM equipment_manifests WHERE property_id = 19;
-- 7) Ảnh
DELETE FROM property_images WHERE property_id = 19;
-- 8) Phòng (sau khấu hao/thiết bị/chỉ số)
DELETE FROM rooms WHERE property_id = 19;
-- 9) Cuối cùng: căn nhà
DELETE FROM properties WHERE id = 19;
COMMIT;
```

> Đổi `19` thành id thực tế nếu khác. Chạy bằng pgAdmin / DBeaver / `psql`.
> Nếu chạy từng dòng mà dòng nào báo "relation does not exist" thì bỏ qua dòng đó (bảng có thể chưa có dữ liệu).
