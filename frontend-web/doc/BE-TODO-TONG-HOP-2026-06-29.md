# BE TODO — Tổng hợp toàn bộ (Mobile + Host Web) — 2026-06-29

> Doc **tự chứa**, gom tất cả endpoint/field BE cần bổ sung hoặc sửa, phát hiện khi FE nối API.
> FE đã **làm sẵn (gọi sẵn endpoint kỳ vọng)** — BE làm đúng path/DTO là chạy ngay, không sửa FE.
> Ưu tiên: 🔴 cao · 🟡 trung bình · ⚪ nice-to-have.

Mục lục:
- A. Manager — Hoá đơn & Thanh toán (mới nhất)
- B. Tenant Portal (app khách thuê)
- C. Quản lý phòng (RoomManage)
- D. Host Web Portal
- E. Cấu hình / lỗi server khi chạy local
- F. Dọn dẹp (FE tự làm, BE biết để khỏi nhầm)

---

## A. MANAGER — HOÁ ĐƠN & THANH TOÁN

### A1. Hoá đơn TIỀN NHÀ (rent)
Tiền nhà là hoá đơn **RIÊNG** (type `RENT`), KHÔNG gộp điện/nước. Hàng tháng, hạn = ngày bắt đầu HĐ.

**✅ ĐÃ CÓ** (`RentInvoiceController`) — FE đã nối, tạo được & tenant nhận được:
```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/rent-invoices   (nhà nhiều phòng)
POST /api/v1/properties/{propertyId}/rent-invoices                  (nhà nguyên căn)
body: { contractId, billingMonth: "2026-06", amount, dueDate: "2026-06-29", note? }
```

**🔴 CÒN THIẾU — `GET` để manager đọc lại HĐ tiền nhà đã tạo** (RentInvoiceController hiện chỉ có POST):
```
GET /api/v1/properties/{propertyId}/rent-invoices?month=2026-06
→ [ { id, contractId, roomNumber?, billingMonth, amount, status } ]
```
**Vì sao cần:** manager bấm gửi xong, **back/quay lại thì mất trạng thái "Đã gửi"** (tenant vẫn giữ được vì
có `GET /tenant/me/invoices`, còn manager KHÔNG có đường đọc lại). FE đã gọi sẵn GET này; thêm vào là badge tự nhớ.
Đây cũng là nguồn để màn Manager hub (A3) hiện số tiền nhà.
- **Idempotent** POST theo `(contractId, billingMonth)` → tránh tạo trùng. Role: MANAGER/ADMIN.

### A2. ✅ Hoá đơn ĐIỆN / NƯỚC — đã có (FE đã nối thật)
```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/utility-invoices
POST /api/v1/properties/{propertyId}/utility-invoices
body: { type: ELECTRICITY|WATER, billingPeriod, prevReading, newReading, consumption, unitPrice, amount, meterImageUrl? }
```
Mỗi loại 1 hoá đơn riêng. FE: màn "Ghi chỉ số & Hóa đơn" (Điện / Nước).

### A3. 🔴 Hub "Hóa đơn & Thanh toán" — tổng hợp + xác nhận thanh toán (chưa có)
Màn tổng hợp xuyên TẤT CẢ bất động sản manager phụ trách + duyệt thanh toán của tenant.
```
GET  /api/v1/manager/invoices?period=&status=&type=
→ ManagerInvoice[] { id, code, type(RENT|ELECTRICITY|WATER|SERVICE|OTHER),
    propertyId, propertyName, roomNumber?, tenantName?, month, year,
    amount, status(PENDING|PAID|OVERDUE|PARTIAL|CANCELLED), dueDate, createdAt }

GET  /api/v1/manager/payments?status=
→ ManagerPayment[] { id, invoiceCode, tenantName, roomNumber?, propertyName,
    amount, method(QR|BANK_TRANSFER|CASH|EWALLET|OTHER),
    status(PENDING_VERIFY|VERIFIED|REJECTED), transferContent?, createdAt, verifiedAt? }

POST /api/v1/manager/payments/{id}/verify          // xác nhận đã nhận tiền → invoice PAID
POST /api/v1/manager/payments/{id}/reject  { reason }
```
Dùng cho: thẻ thống kê (đã thu/chưa thu/quá hạn), mục "Chờ xác nhận", "Lịch sử giao dịch", nhóm "Theo BĐS".

---

## B. TENANT PORTAL (app khách thuê)

### B1. Hoá đơn của tenant (Home + tab Hoá đơn + Lịch sử TT)
**✅ ĐÃ CÓ** (`TenantMeController`) — FE đã nối, tenant đã xem & hoá đơn tiền nhà/điện/nước hiện đúng:
```
GET  /api/v1/tenant/me/invoices?status=&type=     → TenantInvoice[]
GET  /api/v1/tenant/me/invoices/{id}              → TenantInvoice
POST /api/v1/tenant/me/invoices/{id}/payment      → tạo link/QR PayOS cho hoá đơn
POST /api/v1/tenant/me/invoices/{id}/payment/check→ đồng bộ trạng thái thanh toán
```
**🟡 CÒN THIẾU:** `GET /api/v1/tenant/me/payments → TenantPayment[]` (màn "Lịch sử thanh toán" của tenant).
**TenantInvoice**: `{ id, code, type(RENT|ELECTRICITY|WATER|SERVICE|OTHER), propertyName, roomNumber?,
month, year, billingPeriod?, items?[{label,amount}], totalAmount, lateFee?, grandTotal,
status(PENDING|PAID|OVERDUE|PARTIAL|CANCELLED), dueDate, createdAt, paidAt?, paymentMethod?,
transactionId?, kwhUsed?, electricityRate?, m3Used?, waterRate?, payosCheckoutUrl?, payosQrCode?, payosOrderCode? }`
**TenantPayment**: `{ id, invoiceId, invoiceCode, invoiceType, amount, method, paidAt, transactionId?, propertyName?, roomNumber? }`
> Đây là phía tenant của A1/A2/A3 — tenant phải đọc được hoá đơn manager gửi.

### B2. 🟡 Trả phòng (Checkout)
```
POST /api/v1/tenant/me/checkout-requests   body { contractId, expectedMoveOutDate, reason, note? }
GET  /api/v1/tenant/me/checkout-requests   GET .../{id}
```

### B3. 🟡 Thiết bị phòng + quét QR
```
GET /api/v1/tenant/me/equipments        // thiết bị trong phòng/nhà tenant
GET /api/v1/equipments/by-qr/{qrCode}   // chi tiết 1 thiết bị từ QR (màn Scan)
```

### B4. 🟡 Biên bản bàn giao
```
GET  /api/v1/tenant/me/handover
POST /api/v1/tenant/me/handover/acknowledge
```

### B5. ✅ Đã có, FE đã nối: dashboard, contracts, profile, notifications
`/api/v1/tenant/me/dashboard` · `/api/v1/tenant/me/contracts` · `/api/v1/tenant-contracts/{id}`
· `/api/v1/auth/me` · `/api/v1/users/me` · `/api/v1/auth/change-password` · `/api/v1/notifications`

---

## C. QUẢN LÝ PHÒNG (RoomManageScreen)

- 🟡 **RoomStatus thiếu `DISABLED`** ("Ngưng khai thác"). FE tạm map `disabled → DRAFT` (sai ngữ nghĩa).
  → Thêm enum `DISABLED` + cho `PATCH /properties/{id}/rooms/{roomId}/status` nhận.
- 🟡 **RoomResponse thiếu `floor`** (FE đang suy từ `roomNumber`). → Thêm field `floor`.
- 🟡 **Đơn giá điện/nước cho manager**: `RoomResponse` và `PropertyResponse`(auth) đều không có
  `electricityUnitPrice`/`waterUnitPrice` (chỉ có ở `GuestPropertyResponse`). → Thêm vào auth response.
- ⚪ **RoomResponse kèm khách thuê hiện tại** `currentTenant { fullName, phone }` cho phòng RENTED
  (đỡ phải gọi thêm `/tenant-contracts`).

---

## D. HOST WEB PORTAL (role OWNER)

- 🔴 **`Equipment.recommendReplacement` null → 500**: cột `recommend_replacement` có dòng NULL mà entity
  khai `boolean` (primitive) → `GET /properties/{id}` (và mọi nơi load Equipment) trả 500 → web "Không tìm thấy căn nhà".
  Fix:
  ```sql
  UPDATE equipment SET recommend_replacement = false WHERE recommend_replacement IS NULL;
  ALTER TABLE equipment ALTER COLUMN recommend_replacement SET DEFAULT false;
  ALTER TABLE equipment ALTER COLUMN recommend_replacement SET NOT NULL;
  ```
  (hoặc đổi field sang `Boolean`).
- 🔴 **Trang Khách thuê host bị 403**: `GET /properties/{id}/tenant-contracts` chỉ cho `MANAGER/ADMIN`,
  host = role `OWNER` → 403. Chọn 1:
  - (a) thêm `OWNER` (có scope: chỉ HĐ của BĐS host sở hữu), HOẶC
  - (b) enrich `GET /api/v1/host/contracts`: thêm `propertyId` + field `tenantPhone, tenantCccd, deposit, moveInDate`.
  (FE host tạm dùng `/host/contracts` nên đang thiếu các cột này.)

---

## E. CẤU HÌNH / LỖI SERVER (local)

- 🟡 `GET /api/v1/notifications/unread-count` → **500** (badge thông báo). Cần kiểm tra endpoint.
- ℹ️ **PayOS**: key đọc từ ENV (`PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY`) lúc khởi động (dotenv) → mỗi máy
  phải set env và **restart BE**; sửa `.env` lúc đang chạy không có tác dụng. (Không phải lỗi code.)
- ℹ️ Hợp đồng: khi tạo HĐ 201 mà bước sau lỗi, có thể sinh **HĐ PENDING mồ côi** (vd phòng đã thuê báo
  "chồng lấn"). Nên có API **huỷ/xoá HĐ PENDING** + dọn HĐ mồ côi đã lỡ tạo.

---

## F. OCR & DỌN DẸP

- ⚪ **OCR hoá đơn EVN tổng**: `POST /api/v1/ocr/evn-bill` (ảnh → `{ totalKwh, totalAmount, billingPeriod }`).
  Hiện FE best-effort qua `/ocr/meter` (vốn cho đồng hồ) + manager xác nhận tay.
- (FE tự làm) Đã bỏ khỏi luồng 2 màn cũ tạo **hoá đơn gộp** (rent+điện+nước): `MeterReadingScreen`,
  `BuildingUtilityScreen` → nên xoá hẳn (code chết).
