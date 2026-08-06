# BE BUG — Thiết bị tạo bằng import Excel không được cấp mã QR

**Ngày:** 06/08/2026
**Người gửi:** team FE
**Người nhận:** team BE
**Mức độ:** Cần sửa, **không còn gấp** — FE đã tự gỡ bí bằng fallback `EQ-{id}` (xem mục 0), tem QR in và quét được bình thường. Đây giờ là nợ kỹ thuật cần vá đúng bản chất.
**Repo BE tham chiếu:** `C:\sep490\backup2\Sub-leasing-managemant-system`

---

## 0. Cập nhật 06/08 — FE đã tự gỡ bí, BE không cần làm gấp

Sau khi viết doc này, FE phát hiện **BE đã có sẵn đường lùi**: `EquipmentServiceImpl.resolveEquipmentByQrFallback()` khi không tìm thấy trong cột `qr_code` sẽ bóc số sau `"EQ-"` rồi tìm theo `id`. Đã test sống với thiết bị **1387 (có `qr_code = NULL`)**:

```
GET /api/v1/equipments/by-qr/EQ-1387  →  HTTP 200, trả đúng thiết bị id=1387
```

Nên FE đã cho trang admin tự dựng mã `e.qrCode || "EQ-{id}"` khi BE trả null. **Tem QR in và quét được bình thường ngay bây giờ**, không chặn demo.

Vẫn xin BE vá cho đúng bản chất vì 2 lý do:
- Cột `qr_code` đang có ràng buộc `unique` nhưng bỏ trống hàng loạt — dữ liệu không nhất quán.
- Mã QR đang **phụ thuộc ngầm vào `id`**. Nếu sau này BE đổi quy ước mã (thêm prefix theo nhà, mã ngẫu nhiên chống đoán…) thì các tem đã in ra sẽ chết, trong khi cột `qr_code` mới là nơi đáng tin để neo giá trị.

---

## 1. Hiện tượng

Trang admin **Danh mục thiết bị** (`/admin/equipments`) hiển thị đúng danh sách thiết bị, nhưng cột **Mã QR** trống (`—`) ở **tất cả** các dòng, nên nút xem/in QR bị ẩn hoàn toàn. Không in được tem dán lên thiết bị ⇒ khách thuê không có gì để quét khi báo hỏng.

Ví dụ tái hiện được: nhà `MTX#14 THEO_PHONG giường+quạt` (propertyId **69**) có 10 thiết bị cải tạo (Giường ×5, Quạt ×5, phòng 101–105), toàn bộ không có mã QR.

---

## 2. Bằng chứng

Gọi trực tiếp API trên BE local (`admin01`), thiết bị id **1387**:

```bash
GET /api/v1/properties/69/renovation/sessions
GET /api/v1/equipment/1387
GET /api/v1/properties/69/equipments
```

Cả **ba** endpoint đều trả cùng kết quả:

```json
{ "id": 1387, "catalogName": "Giường", "qrCode": null,
  "source": "PURCHASED", "roomNumber": "101", "status": "NEW" }
```

Ba endpoint dùng ba mapper khác nhau mà đều `null` ⇒ **không phải lỗi mapping DTO, giá trị trong DB thực sự rỗng.**

Đối chiếu: thiết bị của property 1 (dữ liệu seed, không qua import) thì **có** mã:

```json
{ "id": 1, "source": "INITIAL_HANDOVER", "qrCode": "EQ-1", "catalogName": "Điều hòa" }
```

---

## 3. Nguyên nhân

Hàm cấp mã `persistWithQrCode()` là **nơi duy nhất** sinh `EQ-{id}`:

`service/impl/EquipmentServiceImpl.java:365-372`
```java
private Equipment persistWithQrCode(Equipment equipment) {
    Equipment saved = equipmentRepository.save(equipment);
    if (saved.getQrCode() == null) {
        saved.setQrCode("EQ-" + saved.getId());
        saved = equipmentRepository.save(saved);
    }
    return saved;
}
```

`grep -rn "persistWithQrCode"` trên toàn bộ source cho thấy nó chỉ được gọi từ **đúng 1 chỗ**: `EquipmentServiceImpl.java:270` — API thêm thiết bị thủ công.

Luồng **import Excel** lưu thẳng qua `equipmentRepository.save()`, builder **không set `qrCode`**:

`service/impl/PropertyOnboardingServiceImpl.java:292-308`
```java
for (int i = 0; i < request.getQuantity(); i++) {
    lastSaved = equipmentRepository.save(Equipment.builder()
            .property(property)
            .room(room)
            .catalog(catalog)
            .renovationSession(renovationSession)
            .source(request.getSource())
            // ... không có .qrCode(...)
            .build());
}
```

⇒ **Mọi thiết bị sinh ra từ import Excel đều có `qr_code = NULL`.**

Các nơi khác cũng lưu Equipment không qua hàm cấp mã, nên nhiều khả năng dính cùng lỗi — BE kiểm tra giúp:

| File:dòng | Ghi chú |
|---|---|
| `PropertyOnboardingServiceImpl.java:292` | Import Excel — **đã xác nhận lỗi** |
| `ContractEquipmentServiceImpl.java:415` | Thiết bị gắn theo hợp đồng — chưa kiểm tra |
| `RoomServiceImpl.java:234` | `saveAll` khi tạo phòng — chưa kiểm tra |
| `EquipmentServiceImpl.java:114 / 123 / 183 / 389` | Các nhánh update — chưa kiểm tra |

---

## 4. Đề nghị sửa

### 4.1 Chặn nguồn — cấp mã cho mọi đường tạo Equipment

Cách gọn và khó sót nhất: cấp mã ở tầng entity thay vì rải rác từng service, ví dụ `@PostPersist` trên `Equipment`, hoặc bắt buộc mọi nơi tạo mới đi qua `persistWithQrCode()`.

Nếu chỉ vá tối thiểu thì sửa `PropertyOnboardingServiceImpl.java:292` cho gọi `persistWithQrCode()` — nhưng khi đó vẫn cần rà 3 file còn lại ở bảng trên.

> Lưu ý: `qr_code` đang có ràng buộc `unique` (`entity/Equipment.java:134`), nên cấp mã theo `id` là an toàn, không sợ trùng.

### 4.2 Backfill dữ liệu đã lỡ tạo

Các thiết bị đã import trước khi vá vẫn `NULL`, cần chạy một lần:

```sql
UPDATE equipment SET qr_code = CONCAT('EQ-', id) WHERE qr_code IS NULL;
```

Xin BE chạy trên **cả DB local lẫn DB VPS** — nếu không thì bản deploy vẫn không in được QR dù code đã vá.

---

## 5. Cách nghiệm thu

```bash
# 1) Thiết bị cũ đã được backfill
GET /api/v1/properties/69/renovation/sessions
# Kỳ vọng: mọi equipments[].qrCode có dạng "EQ-<id>", không còn null

# 2) Quét ngược ra đúng thiết bị
GET /api/v1/equipments/by-qr/EQ-1387
# Kỳ vọng: HTTP 200, trả đúng thiết bị id=1387

# 3) Thiết bị import MỚI cũng phải có mã
#    → import 1 file renovation-excel bất kỳ, kiểm tra qrCode của thiết bị vừa tạo
```

Xong 3 bước này thì FE không phải sửa gì thêm — trang admin đã đọc sẵn `qrCode` từ BE, có mã là nút QR tự bật.

---

## 6. Vấn đề liên quan — thiết bị "Nhà gốc" (cần BE quyết hướng)

Đây là việc **khác** với mục 3, xin đừng gộp làm một.

Thiết bị nhà gốc nhập qua import Excel **không tạo ra `Equipment` row nào cả** — chúng nằm ở bảng riêng và trả về qua `HandoverEquipmentResponse`, DTO này **không có field `qrCode`**:

```java
// dto/response/HandoverEquipmentResponse.java
private Long id; private Long catalogId; private String catalogName;
private String description; private String roomNumber; private HouseArea houseArea;
private EquipmentStatus status; private Integer quantity; private String note;
```

Kiểm chứng với `MTX#11 NORENO full NT` (propertyId **66**): `GET /properties/66/handover-equipments` trả 12 dòng, còn `GET /properties/66/equipments` trả **rỗng** — tức không có thực thể thiết bị thật nào để gắn QR.

Đáng chú ý: các dòng handover này đều `quantity: 1` và có note phân biệt rõ (`"Phòng khách"`, `"Phòng ngủ 1"`, `"Bếp"`) — tức là **đã gần như từng đơn vị riêng**, nên việc materialize thành `Equipment` row có vẻ khả thi, không phải phá cấu trúc.

**Câu hỏi cho BE:**
1. Có kế hoạch materialize thiết bị nhà gốc thành `Equipment` row thật (mỗi cái 1 dòng, 1 mã QR) không?
2. Nếu chưa, thì nghiệp vụ mong đợi khách thuê báo hỏng thiết bị nhà gốc bằng cách nào — chọn tay từ danh sách thay vì quét QR?

FE hiện đang ẩn nút QR cho nhóm nhà gốc và ghi chú lý do ngay trên giao diện, nên không vỡ luồng — nhưng cần biết hướng để tính tiếp.

---

## 7. Tóm tắt

| # | Việc | Ai làm |
|---|---|---|
| 1 | Cấp `qrCode` cho mọi đường tạo Equipment (ưu tiên tầng entity) | BE |
| 2 | Backfill `UPDATE equipment SET qr_code = CONCAT('EQ-', id) WHERE qr_code IS NULL` — **local + VPS** | BE |
| 3 | Rà 3 file còn lại ở bảng mục 3 xem có dính cùng lỗi | BE |
| 4 | Trả lời hướng xử lý thiết bị "Nhà gốc" (mục 6) | BE |
| 5 | Không cần sửa gì — trang admin đã đọc sẵn `qrCode` | FE |
