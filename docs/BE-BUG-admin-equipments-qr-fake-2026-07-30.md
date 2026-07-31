# BE Bug — Mã QR ở trang `/admin/equipments` không quét được, 1 nửa cần thay đổi data model

**Ngày:** 2026-07-30
**Mức độ:** Cao cho phần "cải tạo" (fix rẻ) — Trung bình/cần quyết định cho phần "nhà gốc" (thiếu identity từng đơn vị thiết bị, không phải chỉ thiếu 1 field).

## Hiện tượng

Trang Admin **Danh mục thiết bị** (`/admin/equipments`, FE: `frontend-web/src/pages/admin/EquipmentCatalogPage.tsx`) in/tải được mã QR cho từng thiết bị, nhìn giống QR hợp lệ — nhưng **quét bằng app tenant/manager thật luôn báo "Không tìm thấy thiết bị"**, với mọi mã, mọi thiết bị.

## Nguyên nhân — QR bị tự sinh ở FE, không lấy từ BE

`EquipmentCatalogPage.tsx` tự tạo chuỗi QR ở client, không gọi BE:

```js
// Nhà gốc (dòng ~104)
qrData: `HOANGBINHLAND-EQ-P${propertyId}-NHAGOC-${locCode}-${slug(h.catalogName)}-H${h.id}U${i}`
// Cải tạo (dòng ~124)
qrData: `HOANGBINHLAND-EQ-P${propertyId}-CAITAO-${slug(version)}-${locCode}-${slug(e.catalogName)}-E${e.id}`
```

Trong khi BE thực sự lưu/nhận diện QR theo format khác hẳn — `EquipmentServiceImpl.java:368`:
```java
saved.setQrCode("EQ-" + saved.getId());
```
Lúc quét (`EquipmentServiceImpl.getEquipmentByQrCode`), BE chỉ khớp đúng giá trị cột `equipments.qr_code`, hoặc fallback nếu chuỗi **bắt đầu bằng đúng** `"EQ-"` rồi parse số phía sau làm `Equipment.id`. Chuỗi trang admin sinh ra trượt cả 2 điều kiện — không bao giờ khớp.

**Đối chứng đúng cách làm:** trang `/host/equipments` (`EquipmentQrManager.tsx`) dùng đúng field BE trả:
```js
const equipCode = (e) => e.qrCode || `EQ-${e.id}`;
```
qua endpoint `GET /api/v1/properties/{propertyId}/equipments` (FE gọi qua `equipmentService.getPropertyEquipment`, DTO `MaintenanceEquipmentResponse` — **đã có field `qrCode` thật**).

## Vì sao trang admin không dùng luôn endpoint đúng — 2 nguồn dữ liệu khác nhau, 1 nguồn thiếu identity từng đơn vị

Trang admin lấy dữ liệu từ 2 endpoint riêng (mục đích ban đầu là xem "đã import gì", không phải "thiết bị vận hành"):
- `GET /properties/{id}/handover-equipments` → `HandoverEquipmentResponse[]` (nhà gốc)
- `GET /properties/{id}/renovation/sessions` → `RenovationSession[].equipments[]` = `SessionEquipmentResponse[]` (cải tạo)

Kiểm tra kỹ thì 2 nguồn này **khác nhau về bản chất**:

### Cải tạo (`SessionEquipmentResponse`) — fix rẻ

`Equipment` entity có field `renovationSession` (FK) — nghĩa là mỗi dòng cải tạo **là 1 `Equipment` row thật**, đã có `qrCode` thật trong DB (`"EQ-" + id`), chỉ là DTO `SessionEquipmentResponse` (BE) hiện **không map field `qrCode` vào response**. Fix: thêm 1 dòng `.qrCode(equipment.getQrCode())` vào chỗ build `SessionEquipmentResponse`, giống hệt `MaintenanceEquipmentResponse` đã làm.

### Nhà gốc (`HandoverEquipmentResponse`) — không phải thiếu field, mà thiếu identity từng đơn vị

Entity `HandoverEquipment` ghi rõ trong comment: **"chỉ hiển thị, không gán vận hành / khấu hao"** — không có FK tới `Equipment`, không có cột `qr_code`, và có field **`quantity`** (số lượng gộp — vd 1 dòng "Quạt trần, quantity=5" đại diện cho CẢ 5 cái, không phải 5 row riêng). Trang admin hiện đang tự "tách" số lượng thành từng unit ảo (`H{id}U1`, `H{id}U2`...) để in QR riêng — nhưng những "unit" này **không tồn tại như 1 bản ghi riêng trong DB**, nên không có cách nào sinh QR thật cho từng cái theo data model hiện tại.

## 2 hướng xử lý phần "nhà gốc" — BE quyết

### Hướng A — Không cần QR riêng cho từng đơn vị nhà gốc (rẻ nhất)

Chấp nhận: thiết bị "nhà gốc" chỉ hiển thị để biết đã bàn giao gì (đúng như comment entity), không có QR quét được ở mức từng cái. FE bỏ hẳn nút QR cho nhóm "Nhà gốc" trên trang admin, chỉ giữ QR cho nhóm "Cải tạo" (sau khi BE thêm field ở trên). Nếu sau này cần báo hỏng 1 cái quạt trần cụ thể trong 5 cái đó, tenant dùng nhánh "Chọn thiết bị từ danh sách" hoặc "Sự cố khác" thay vì quét QR.

### Hướng B — Materialize từng đơn vị thành `Equipment` row thật (đúng lâu dài, tốn công hơn)

Khi property chuyển sang vận hành (ACTIVE), với mỗi `HandoverEquipment` có `quantity=N`, BE tạo **N dòng `Equipment` thật** (source=`INITIAL_HANDOVER`, mỗi dòng auto `qrCode="EQ-"+id`) thay vì giữ nguyên 1 dòng gộp — giống hệt cách "cải tạo" đã làm với `Equipment`. Cần kiểm tra lại toàn bộ nơi đang đọc `HandoverEquipment` (nếu có) trước khi đổi, vì đây là thay đổi data model, ảnh hưởng rộng hơn 1 field.

## Đề xuất tối thiểu ngay bây giờ (không chờ quyết định A/B)

Bất kể chọn hướng nào cho "nhà gốc", nên làm ngay:
1. BE thêm `qrCode` vào `SessionEquipmentResponse` (rẻ, không rủi ro).
2. FE (mình tự làm, không cần chờ BE): trang `/admin/equipments` dùng `qrCode` thật từ BE cho nhóm "Cải tạo", **tạm ẩn nút QR** ở nhóm "Nhà gốc" cho tới khi BE chọn hướng A/B — tránh tiếp tục in ra QR không dùng được.

## Checklist test

- [ ] `GET /properties/{id}/renovation/sessions` → mỗi phần tử trong `equipments[]` có field `qrCode` dạng `EQ-<id>`.
- [ ] Quét QR đó bằng app tenant thật (`GET /equipments/by-qr/{qrCode}`) → trả đúng thiết bị, không 404.
- [ ] Trang `/admin/equipments`, nhóm "Cải tạo": QR hiện/tải xuống khớp đúng `qrCode` thật (không còn tiền tố `HOANGBINHLAND-...`).
- [ ] Nhóm "Nhà gốc": xác nhận đã ẩn nút QR (hoặc đã có unit thật nếu chọn hướng B).
