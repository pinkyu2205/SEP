# BE cần bổ sung cho Tenant Portal (Mobile, role TENANT) — 2026-06-29

FE (mobile) đã làm sẵn — **gọi sẵn các endpoint dưới đây**; khi BE implement đúng path/DTO là chạy ngay,
không phải sửa FE. Mục ✅ = endpoint BE ĐÃ có, FE đã nối. Mục 🔴/🟡 = BE CHƯA có.

Tất cả endpoint tenant lấy user từ **JWT** (role TENANT) — KHÔNG nhận id từ client.

---

## ✅ Đã có (FE đã nối)
- `GET /api/v1/tenant/me/dashboard` — Trang chủ tenant.
- `GET /api/v1/tenant/me/contracts`, `GET /api/v1/tenant-contracts/{id}` — Hợp đồng.
- `GET /api/v1/auth/me`, `PUT /api/v1/users/me`, `POST /api/v1/auth/change-password` — Hồ sơ.
- `GET /api/v1/notifications` (+ `/{id}/read`, `/read-all`) — Thông báo.

---

## 🔴 1. Hoá đơn của tenant (Home + tab Hoá đơn) — QUAN TRỌNG
Hiện BE chỉ có invoice cho **Manager/Host** (`/manager/utility-invoices`, `/host/invoices`),
**KHÔNG có cho tenant**. FE đã gọi sẵn:

```
GET  /api/v1/tenant/me/invoices?status=&type=        -> TenantInvoice[]   (hoặc Spring Page)
GET  /api/v1/tenant/me/invoices/{id}                  -> TenantInvoice
POST /api/v1/tenant/me/invoices/{id}/payment          -> TenantInvoice    (tạo link/QR PayOS cho hoá đơn)
POST /api/v1/tenant/me/invoices/{id}/payment/check    -> TenantInvoice    (đồng bộ trạng thái thanh toán)
GET  /api/v1/tenant/me/payments                       -> TenantPayment[]  (lịch sử thanh toán)
```

`status` ∈ PENDING|PAID|OVERDUE|PARTIAL|CANCELLED · `type` ∈ RENT|ELECTRICITY|WATER|SERVICE|OTHER

**TenantInvoice** (FE: `tenantBillingService.real.ts`):
```jsonc
{
  "id": 1, "code": "HD-...", "type": "ELECTRICITY",
  "propertyName": "Nhà trọ Bình Thạnh", "roomNumber": "105",
  "month": 5, "year": 2026, "billingPeriod": "01/05 – 31/05/2026",
  "items": [{ "label": "Điện (135 kWh)", "amount": 472500 }],
  "totalAmount": 472500, "lateFee": 0, "grandTotal": 472500,
  "status": "PENDING", "dueDate": "2026-05-20", "createdAt": "2026-05-05",
  "paidAt": null, "paymentMethod": null, "transactionId": null,
  "kwhUsed": 135, "electricityRate": 3500, "m3Used": null, "waterRate": null,
  "payosCheckoutUrl": null, "payosQrCode": null, "payosOrderCode": null
}
```
**TenantPayment**:
```jsonc
{ "id": 1, "invoiceId": 1, "invoiceCode": "HD-...", "invoiceType": "RENT",
  "amount": 3150000, "method": "QR", "paidAt": "2026-04-10T11:00:00Z",
  "transactionId": "VQR-...", "propertyName": "...", "roomNumber": "105" }
```
> FE đã **bỏ mock `billsStore`** ở các màn tenant: Home, InvoiceList, InvoiceDetail, InvoiceHistory, PaymentHistory.
> Nút "Tôi đã chuyển khoản" gọi `.../payment/check`. Nếu muốn PayOS chủ động thì dùng `.../payment`.

---

## 🟡 2. Trả phòng (Checkout) — màn RequestCheckout / CheckoutDetail
Chưa có endpoint cho tenant yêu cầu trả phòng. Đề xuất:
```
POST /api/v1/tenant/me/checkout-requests   body: { contractId, expectedMoveOutDate, reason, note? }
GET  /api/v1/tenant/me/checkout-requests   -> danh sách yêu cầu trả phòng của tenant + trạng thái
GET  /api/v1/tenant/me/checkout-requests/{id}
```
> FE 2 màn này hiện còn dùng store local — chờ BE để nối.

## 🟡 3. Thiết bị phòng của tenant + quét QR — RoomEquipment / EquipmentDetail / Scan
`GET /api/v1/properties/{propertyId}/equipments` đang là MANAGER/ADMIN. Tenant cần xem thiết bị **phòng mình**:
```
GET /api/v1/tenant/me/equipments                 -> thiết bị trong phòng/nhà tenant đang thuê
GET /api/v1/equipments/by-qr/{qrCode}            -> chi tiết 1 thiết bị từ mã QR (cho màn Scan)
```

## 🟡 4. Biên bản bàn giao của tenant — màn TenantOnboarding
```
GET  /api/v1/tenant/me/handover                  -> biên bản bàn giao phòng (thiết bị, chỉ số đầu, ảnh)
POST /api/v1/tenant/me/handover/acknowledge      -> tenant xác nhận đã nhận bàn giao
```

## ⚪ 5. (Tùy chọn) Thống kê cho Hồ sơ (ProfileScreen — phần Manager)
`ProfileScreen` (shared) còn `MOCK_MANAGER_STATS` (số BĐS / khách thuê / HĐ) cho role Manager.
Có thể tái dùng `GET /api/v1/tenant/me/dashboard` cho tenant; Manager thì cần 1 summary riêng nếu muốn bỏ mock.

---

### Trạng thái FE (để BE đối chiếu)
| Màn tenant | Trạng thái |
|------------|-----------|
| Home, Invoice List/Detail/History, PaymentHistory | ✅ đã bỏ mock, gọi sẵn endpoint mục 1 |
| Notifications | ✅ real (`/notifications`) |
| Contracts, ContractDetail | ✅ real (đã có sẵn) |
| Profile (tenant) | ✅ real; còn `MOCK_MANAGER_STATS` (manager) |
| RequestCheckout / CheckoutDetail | ⏳ chờ BE mục 2 |
| RoomEquipment / EquipmentDetail / Scan | ⏳ chờ BE mục 3 |
| TenantOnboarding | ⏳ chờ BE mục 4 |
| Maintenance* | ❌ KHÔNG đụng — FE khác trong nhóm đang làm |
