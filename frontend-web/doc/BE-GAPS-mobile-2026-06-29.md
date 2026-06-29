# Yêu cầu bổ sung BE cho Mobile (Manager App) — 2026-06-29

> Tổng hợp các API/field BE còn thiếu, phát hiện khi nối Mobile vào backend thật.
> FE đã làm xong phần của mình và **xử lý tạm** (suy luận / ẩn UI / map gần đúng / lưu local).
> Mỗi mục có: **Vấn đề → Đề xuất API → FE đang tạm xử lý**. Ưu tiên: 🔴 cao · 🟡 trung bình · ⚪ nice-to-have.

**Màn liên quan**
- `RoomManageScreen.tsx` (Quản lý phòng) — mục 1–4
- `UtilityBillingScreen.tsx` (Ghi chỉ số & Hóa đơn) — mục 3, 5–8

---

## Tóm tắt nhanh

| # | Khu vực | Thiếu gì | Ưu tiên |
|---|---------|----------|---------|
| 1 | Phòng | RoomStatus không có `DISABLED` (ngưng khai thác) | 🟡 |
| 2 | Phòng | RoomResponse không có `floor` (tầng) | 🟡 |
| 3 | Phòng / Hóa đơn | Manager không lấy được đơn giá điện/nước | 🟡 |
| 4 | Phòng | RoomResponse không kèm khách thuê hiện tại | ⚪ |
| 5 | Hóa đơn | Không có API tạo & gửi hóa đơn điện/nước | 🔴 |
| 6 | Hóa đơn | Không có API ghi/đọc chỉ số đồng hồ (kể cả chỉ số kỳ trước) | 🔴 |
| 7 | Hóa đơn | Không có API lịch sử hóa đơn tiện ích | 🟡 |
| 8 | Hóa đơn | Không có OCR hóa đơn EVN tổng | ⚪ |

---

## Endpoint FE ĐANG dùng (đã có — để BE đối chiếu)
- `GET  /api/v1/properties` (phân trang) · `GET /api/v1/properties/{id}/rooms`
- `PATCH /api/v1/properties/{id}/rooms/{roomId}/status`
- `GET  /api/v1/properties/{id}/tenant-contracts`
- `POST /api/v1/ocr/meter` (OCR 1 chỉ số đồng hồ)

---

## 1. 🟡 RoomStatus thiếu `DISABLED` (ngưng khai thác)
**Vấn đề:** `RoomStatus = DRAFT | AVAILABLE | RENTED | MAINTENANCE`. UI có trạng thái "Ngưng khai thác"
(manager tắt phòng, không nhận khách / không tạo hóa đơn) nhưng không có enum tương ứng.
**Đề xuất:** thêm `DISABLED` vào `RoomStatus`; cho `PATCH /api/v1/properties/{id}/rooms/{roomId}/status`
nhận `DISABLED` (transition hợp lệ: AVAILABLE/MAINTENANCE ↔ DISABLED).
**FE tạm xử lý:** map `disabled → DRAFT` (sai ngữ nghĩa — DRAFT là phòng chưa kích hoạt).

## 2. 🟡 RoomResponse thiếu `floor` (tầng)
**Vấn đề:** `GET /api/v1/properties/{id}/rooms` không trả tầng của phòng.
**Đề xuất:** thêm `floor: number` vào `RoomResponse` (lưu khi tạo/sửa phòng).
**FE tạm xử lý:** suy tầng từ `roomNumber` (P101 → tầng 1) — sai với cách đánh số khác.

## 3. 🟡 Manager không lấy được đơn giá điện/nước
**Vấn đề:** `RoomResponse` và `PropertyResponse` (auth `GET /api/v1/properties/{id}`) đều **không có**
`electricityUnitPrice` / `waterUnitPrice`. Hai field này chỉ có ở `GuestPropertyResponse`
(`GET /api/v1/public/properties/{id}`, và chỉ với property ACTIVE).
**Đề xuất:** thêm `electricityUnitPrice` / `waterUnitPrice` vào `PropertyResponse` (auth) hoặc `RoomResponse`.
**FE tạm xử lý:** Quản lý phòng ẩn chip điện/nước; Ghi chỉ số để manager tự nhập đơn giá nước, đơn giá điện suy từ tổng EVN.

## 4. ⚪ RoomResponse không kèm khách thuê hiện tại
**Vấn đề:** muốn hiện tên/SĐT khách trong từng phòng phải gọi thêm `GET .../tenant-contracts` rồi tự ghép.
**Đề xuất:** `RoomResponse` kèm `currentTenant { fullName, phone }` (hoặc `currentContractId`) cho phòng RENTED.
**FE tạm xử lý:** ghép từ `/tenant-contracts` (lọc HĐ `ACTIVE`) theo `roomId`/`roomNumber` — tốn thêm 1 call/nhà.

---

## 5. 🔴 Tạo & gửi hóa đơn điện/nước
**Vấn đề:** không có API tạo/gửi hóa đơn tiện ích cho từng phòng (nhà nhiều phòng) hoặc cả căn (nguyên căn).
Hiện chỉ có `GET /api/v1/host/invoices` (đọc, scope host).
**Đề xuất:**
```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/utility-invoices
body: {
  type: "ELECTRICITY" | "WATER",
  billingPeriod: string,        // "01/05 – 31/05/2026"
  prevReading: number,
  newReading: number,
  consumption: number,
  unitPrice: number,
  amount: number,
  meterImageUrl?: string
}
→ InvoiceResponse
```
Nhà nguyên căn: bản không có `roomId` (`POST /api/v1/properties/{propertyId}/utility-invoices`).
**FE tạm xử lý:** lưu local `billsStore` — KHÔNG đẩy BE, khách thuê chưa nhận được.

## 6. 🔴 Ghi & đọc chỉ số đồng hồ (meter readings)
**Vấn đề:** cần **chỉ số kỳ trước** để tính tiêu thụ và nơi **lưu chỉ số mới** — BE chưa có.
**Đề xuất:**
```
GET  /api/v1/properties/{id}/rooms/{roomId}/meter-readings/latest?type=ELECTRICITY|WATER
     → { reading: number, period: string, recordedAt: string }
POST /api/v1/properties/{id}/rooms/{roomId}/meter-readings
     body: { type, period, reading, imageUrl? }
```
**FE tạm xử lý:** để `prevReading = 0` (tính tiêu thụ sai cho các kỳ sau kỳ đầu).

## 7. 🟡 Lịch sử hóa đơn tiện ích
**Vấn đề:** tab "Lịch sử" cần danh sách các lần đã gửi hóa đơn (theo nhà, kỳ, tổng tiền, số phòng) — chưa có.
**Đề xuất:** `GET /api/v1/manager/utility-invoices?propertyId=&period=&type=` → danh sách + tổng hợp.
**FE tạm xử lý:** tab Lịch sử để rỗng, chỉ tích trong phiên (mất khi tải lại).

## 8. ⚪ OCR hóa đơn EVN tổng
**Vấn đề:** cần quét hóa đơn EVN → tự nhận **tổng kWh, tổng tiền, kỳ thanh toán**.
`POST /api/v1/ocr/meter` chỉ OCR 1 chỉ số đồng hồ, không parse hóa đơn EVN.
**Đề xuất:** `POST /api/v1/ocr/evn-bill` (ảnh → `{ totalKwh, totalAmount, billingPeriod }`).
**FE tạm xử lý:** chụp/tải ảnh hóa đơn thật → gọi `/ocr/meter` rồi **best-effort** regex `rawText`
(tổng kWh / tổng tiền / kỳ) để tự điền, manager **xác nhận & sửa tay**. Độ chính xác chưa đảm bảo
vì endpoint vốn cho đồng hồ — cần endpoint EVN riêng để ổn định.

---

## Lỗi BE gặp khi chạy local (Onboarding — 2026-06-29)

### A. 🔴 PayOS chưa cấu hình → không thanh toán cọc được
- `POST /api/v1/tenant-contracts/{id}/deposit-payment` → **422**
  `{"error":"Chưa cấu hình PayOS (PAYOS_CLIENT_ID / ...)"}`.
- Hợp đồng tạo OK (201) nhưng tạo link cọc PayOS thất bại vì BE local thiếu key.
- **Cần BE:** set env `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` cho môi trường dev/test.
  (FE tạm: dùng hình thức **Tiền mặt** để bỏ qua PayOS khi test local.)

### B. 🟡 `GET /api/v1/notifications/unread-count` → 500
- Badge đếm thông báo chưa đọc trả **500 Internal Server Error** (lỗi server, không phải FE).
  Chạy nền, không chặn nghiệp vụ nhưng spam lỗi console. **Cần BE** kiểm tra endpoint này.

### C. ℹ️ "Phòng đã có hợp đồng chồng lấn" (đúng nghiệp vụ, đã xử lý FE)
- `POST /properties/{id}/rooms/{roomId}/tenant-contract` → **422**
  `{"error":"Phòng này đã có hợp đồng chồng lấn trong khoảng thời gian này"}`.
- Nguyên nhân là **bug FE cũ**: tạo HĐ 201 nhưng bước thanh toán PayOS lỗi → không lưu `contract`
  → bấm lại tạo HĐ trùng (sinh HĐ PENDING mồ côi). **FE đã sửa** (`createContractAndPayment`:
  lưu contract ngay sau 201, lần sau chỉ thử lại thanh toán, không tạo HĐ mới).
- **Còn tồn đọng:** các HĐ PENDING mồ côi đã lỡ tạo (vd phòng 101) cần BE/DB **dọn dẹp**,
  hoặc BE nên có API **huỷ/xoá HĐ PENDING** để FE tự xử lý.
