# BE cần bổ sung: Hoá đơn TIỀN NHÀ (rent) cho Manager — 2026-06-29

Manager gửi hoá đơn cho tenant gồm **3 loại RIÊNG BIỆT** (KHÔNG gộp chung):
1. **Điện** (từ hoá đơn EVN) — ✅ BE đã có, FE đã nối.
2. **Nước** (từ hoá đơn nhà nước / nhập tay) — ✅ BE đã có, FE đã nối.
3. **Tiền nhà/phòng** (hàng tháng, theo hợp đồng) — 🔴 **BE CHƯA có**, FE gọi sẵn.

> Yêu cầu nghiệp vụ (user): mỗi loại là **1 hoá đơn riêng có tổng riêng**, không bao giờ gộp.
> Tiền nhà trả vào **ngày bắt đầu hợp đồng** và **lặp hàng tháng**.

---

## ✅ Điện / Nước (đã có — FE đã nối thật)
```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/utility-invoices   (nhà nhiều phòng)
POST /api/v1/properties/{propertyId}/utility-invoices                   (nhà nguyên căn)
body (CreateUtilityInvoiceRequest): { type: ELECTRICITY|WATER, billingPeriod, prevReading,
       newReading, consumption, unitPrice, amount, meterImageUrl? }
```
FE (`UtilityBillingScreen` → tab Điện/Nước) đã chuyển từ store local sang gọi 2 endpoint này
(mỗi phòng/căn 1 hoá đơn ĐIỆN riêng, 1 hoá đơn NƯỚC riêng).

---

## 🔴 Tiền nhà (rent) — CẦN BE LÀM
FE đã gọi sẵn (`managerInvoiceService.real.ts`, màn `RentInvoiceScreen`):
```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/rent-invoices   (nhà nhiều phòng)
POST /api/v1/properties/{propertyId}/rent-invoices                  (nhà nguyên căn)
body (CreateRentInvoiceBody):
{
  "contractId": 123,
  "billingMonth": "2026-06",     // kỳ thu (tháng)
  "amount": 7237000,             // tiền nhà tháng này (lấy từ hợp đồng)
  "dueDate": "2026-06-29",       // hạn nộp = theo ngày bắt đầu HĐ
  "note": null
}
→ trả về invoice (type RENT) giống TenantInvoice để tenant xem ở /api/v1/tenant/me/invoices
```
**Đọc HĐ tiền nhà đã tạo trong kỳ (để FE biết phòng nào "đã gửi"):**
```
GET /api/v1/properties/{propertyId}/rent-invoices?month=2026-06
→ [ { id, contractId, roomNumber?, billingMonth, amount, status }, ... ]
```
FE (`RentInvoiceScreen`) gọi cái này khi mở/đổi kỳ để đánh dấu "✓ Đã gửi" **lấy từ DB** (không phải
state tạm) → trạng thái giữ đúng sau khi back/quay lại. Thiếu endpoint này thì badge "đã gửi" sẽ không
nhớ được qua các lần mở màn.

**Lưu ý cho BE:**
- `type = RENT` (tách khỏi `UtilityType` ELECTRICITY/WATER — nên là enum InvoiceType chung hoặc field riêng).
- **Idempotent** theo `(contractId, billingMonth)` để tránh tạo trùng khi bấm lại / chạy hàng tháng.
- Nên có job/endpoint **tự sinh hoá đơn tiền nhà hàng tháng** theo ngày bắt đầu HĐ (tùy chọn — hiện manager bấm gửi thủ công theo kỳ).
- Tenant đọc tiền nhà cùng chỗ với điện/nước: `GET /api/v1/tenant/me/invoices?type=RENT`
  (xem doc/BE-TODO-tenant-portal-2026-06-29.md).

---

## 🔴 Màn "Hóa đơn & Thanh toán" của Manager (BillingManagementScreen) — cần API tổng hợp
Màn hub này tổng hợp hoá đơn + xác nhận thanh toán xuyên TẤT CẢ bất động sản manager phụ trách.
Hiện BE chỉ có `GET /api/v1/manager/utility-invoices?propertyId=` (theo TỪNG property, chỉ điện/nước).
FE đã gọi sẵn các endpoint tổng hợp sau (`managerInvoiceService.real.ts`):
```
GET  /api/v1/manager/invoices?period=&status=&type=
     -> ManagerInvoice[]  { id, code, type(RENT|ELECTRICITY|WATER|SERVICE|OTHER),
        propertyId, propertyName, roomNumber?, tenantName?, month, year,
        amount, status(PENDING|PAID|OVERDUE|PARTIAL|CANCELLED), dueDate, createdAt }

GET  /api/v1/manager/payments?status=
     -> ManagerPayment[]  { id, invoiceCode, tenantName, roomNumber?, propertyName,
        amount, method(QR|BANK_TRANSFER|CASH|EWALLET|OTHER),
        status(PENDING_VERIFY|VERIFIED|REJECTED), transferContent?, createdAt, verifiedAt? }

POST /api/v1/manager/payments/{id}/verify     -> xác nhận đã nhận tiền (chuyển HĐ sang PAID)
POST /api/v1/manager/payments/{id}/reject     body { reason } -> từ chối giao dịch
```
Dùng cho: thẻ thống kê (đã thu / chưa thu / quá hạn), mục **Chờ xác nhận** (duyệt CK/ví của tenant),
mục **Lịch sử giao dịch** (đã xác nhận), và nhóm **Theo bất động sản**.
> FE đã bỏ toàn bộ mock (`billsStore`, `MOCK_PAYMENTS`, `getPropertyById`) ở màn này; chạy thật khi BE có endpoint.

## 🧹 Dọn dẹp: 2 màn CŨ tạo HOÁ ĐƠN GỘP (đã bỏ khỏi luồng)
Trước đây `MeterReadingScreen.tsx` và `BuildingUtilityScreen.tsx` (manager) khi ghi chỉ số xong
**tự tạo 1 hoá đơn GỘP** (tiền nhà + điện + nước + dịch vụ trong 1 bill `invoiceType: 'rent'`,
ghi vào store local `billsStore`). Logic này **sai mô hình 3 hoá đơn riêng** và đã được FE
**bỏ khỏi luồng**: các lối vào (`BuildingDetail` "Chốt số", `NotificationCenter`) đã trỏ về
`UtilityBilling`. → Đề nghị **xoá 2 màn này** (code chết) trong đợt dọn dẹp; tránh ai đó dùng lại.
