# Bảo trì: sửa lỗi "đã trả tiền mà phiếu vẫn Chờ thanh toán" + đóng phiếu ngay, khách trả sau — 03/10/2026

Đã đọc code thật ở `origin/dev` **`a647792`** ("chinh sua qui trinh bao tri v2"). Cảm ơn BE đã ship phần
"thay mới kết thúc tại chẩn đoán" + chặn tạo phiếu cho thiết bị `BROKEN` — FE đã khớp.

Tài liệu này có 4 mục, xếp theo mức gấp. **Mục 1 là bug đang xảy ra thật khi test** (phiếu M-60).

---

## 1. (Bug, gấp) Khách đã trả QR nhưng phiếu vẫn `WAITING_PAYMENT`

### Hiện tượng
Tenant quét QR trả hoá đơn bảo trì → hoá đơn `HD-MAINT…` đã `PAID`, nhưng phiếu vẫn "Chờ thanh toán" ở cả app
manager lẫn tenant, không tự sang `CLOSED`.

### Nguyên nhân (đọc trong code)
- Thanh toán xong → `saveAndPublishPaidInvoice` bắn `InvoicePaidEvent` →
  `InvoicePaidEventListener` (`@TransactionalEventListener(phase = AFTER_COMMIT)`) →
  `TenantBillingServiceImpl.handleInvoicePaidAfterCommit` → `maintenanceService.closeWaitingPaymentAfterInvoicePaid(id)`.
- `closeWaitingPaymentAfterInvoicePaid` đánh `@Transactional` **mặc định (`REQUIRED`)**. Ở pha `AFTER_COMMIT`, tài
  nguyên giao dịch cũ vẫn còn gắn vào thread nên lời gọi `REQUIRED` **tham gia vào giao dịch đã commit xong** —
  `repository.save(req)` không bao giờ được commit, phiếu giữ nguyên `WAITING_PAYMENT`, timeline không có dòng
  "Tenant đã thanh toán…", realtime `EVT_MAINTENANCE_COMPLETED` cũng không đến FE. Mọi exception bị
  `try/catch` nuốt (chỉ `log.error`) nên không ai thấy lỗi.
- Bằng chứng cùng file: `sendPaymentNotificationsAfterCommit` ngay bên dưới đã phải đánh
  `@Transactional(propagation = Propagation.REQUIRES_NEW)` vì đúng lý do này; riêng hàm đóng phiếu bị thiếu.

### Cách kiểm chứng trên DB
```sql
select r.id, r.status, i.code, i.status
from maintenance_requests r join tenant_invoices i on i.id = r.charge_invoice_id
where i.status = 'PAID' and r.status = 'WAITING_PAYMENT';
```
Có dòng nào = đúng bug này.

### Cách sửa
```java
@Override
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void closeWaitingPaymentAfterInvoicePaid(Long invoiceId) { ... }
```
Kèm 1 câu `update` dọn các phiếu đã kẹt (theo câu `select` ở trên → `CLOSED`, `resolved_at = now()`).

> Nếu làm mục 2, phiếu mới không còn `WAITING_PAYMENT` nữa — nhưng **vẫn phải sửa mục 1** cho phiếu cũ đang dở,
> và rà các listener `AFTER_COMMIT` khác có gọi service `REQUIRED` để ghi dữ liệu (cùng kiểu lỗi).

---

## 2. (Nghiệp vụ mới) Lỗi do khách: **đóng phiếu ngay, khách trả sau**

### Quy tắc đã chốt (03/10/2026)
Ngoài thực tế: dù hỏng do ai, **công ty (manager) chi trả trước** để sửa/thay. Hỏng do khách thì khách có trách
nhiệm **hoàn lại** khoản đó cho hệ thống qua QR như mọi hoá đơn. Vì vậy phiếu bảo trì là **việc sửa chữa** — sửa
xong (hoặc chẩn đoán thay mới xong) là **phiếu kết thúc**; khoản phải thu sống ở **hoá đơn**, không giữ phiếu mở.

- Hao mòn: chỉ ghi nhận chi phí vào hệ thống (lãi lỗ, khấu hao) — không hoá đơn. *(không đổi)*
- Lỗi do khách + đồng ý trả: lập hoá đơn `MAINTENANCE` (QR, hạn `MAINTENANCE_CHARGE_DUE_DAYS` = 5) **và phiếu
  `CLOSED` ngay**.
- Khách không trả: cron billing hiện tại (quá hạn → `OVERDUE` + `terminationProposed`) **giữ nguyên**, vì nó dựa
  trên hoá đơn chứ không dựa trên phiếu.

### Yêu cầu
1. `resolveStatusAfterWorkDone(req, chargeToTenant)` → **luôn trả `CLOSED`** (đặt `resolvedAt`, `doneAt`).
   Áp cho cả `complete()`, `handover()` và `finishWithoutRepairForReplacement()` (nhánh thay mới, hiện đang ra
   `WAITING_PAYMENT` khi khách trả).
2. Thông báo cho tenant khi đóng phiếu có thu tiền: gộp 1 tin "Sửa chữa xong — vui lòng thanh toán X đ trước
   ngày D" (thay cho `MAINTENANCE_WAITING_PAYMENT` + `MAINTENANCE_COMPLETED` tách rời).
3. `WAITING_PAYMENT` **giữ trong enum** cho phiếu cũ; `closeWaitingPaymentAfterInvoicePaid` giữ (đã sửa mục 1).
   Có thể migrate luôn các phiếu `WAITING_PAYMENT` hiện có sang `CLOSED` — hoá đơn vẫn còn, không mất khoản thu.
4. Trạng thái tiền trên phiếu `CLOSED` tính **lúc đọc** — **đã có sẵn**, chỉ xác nhận giữ nguyên:
   - `resolveBillingHint`: `CLOSED` + có hoá đơn chưa PAID → `TENANT_CHARGE_PENDING`;
   - `attachIssuedInvoiceIfPending`: luôn gắn `issuedInvoice` (có `payosQrCode`, `dueDate`) khi hoá đơn chưa PAID.
   Cách này **không cần ghi gì khi khách trả tiền** → không còn phụ thuộc listener after-commit.
5. Đề xuất thêm 1 field cho FE hiển thị gọn: `tenantChargeStatus = NONE | UNPAID | OVERDUE | PAID` (+ `paidAt`)
   trong `MaintenanceRequestResponse` — hiện FE chỉ suy được "chưa trả" (có `issuedInvoice`) chứ không phân biệt
   được "đã trả" với "không có khoản thu" và không biết `OVERDUE`.

### Hệ quả có lợi
- Kiểm tra trùng phiếu (`findFirstByEquipmentIdAndStatusNotIn(CLOSED, CANCELLED, OUTSTANDING_DAMAGE)`) tự cho
  phép báo hỏng lại thiết bị đã sửa xong dù khách chưa trả lần trước — hiện `WAITING_PAYMENT` đang chặn.

---

## 3. Huỷ phiếu thì huỷ luôn hoá đơn chưa thanh toán

`cancel()` hiện không đụng tới hoá đơn: phiếu đã có `chargeInvoiceId` (chưa PAID) mà bị huỷ thì hoá đơn vẫn
`PENDING`, quá 5 ngày vẫn thành `OVERDUE` → khách bị đề nghị chấm dứt HĐ vì một phiếu đã huỷ.

Yêu cầu: trong `cancel()`, nếu có hoá đơn `MAINTENANCE` chưa `PAID` của phiếu → `CANCELLED` (+ `TenantPendingCharge`
liên quan → huỷ), timeline ghi "Huỷ phiếu — huỷ hoá đơn HD-…". Hoá đơn đã `PAID` thì **chặn huỷ phiếu** (hoặc yêu
cầu hoàn tiền thủ công) — BE chọn và báo FE.

---

## 4. Nợ bảo trì chưa trả hiện ở quyết toán trả phòng

`CheckoutProcessServiceImpl` / quyết toán hiện không đọc hoá đơn `MAINTENANCE` (đã grep, không có tham chiếu). Khách
trả phòng mà còn nợ phí sửa chữa thì không ai thấy để trừ cọc.

Yêu cầu: khi lập quyết toán, liệt kê các hoá đơn `MAINTENANCE` chưa `PAID`/`CANCELLED` của hợp đồng (mã, số tiền,
phiếu bảo trì) như một khoản trừ cọc; trừ xong thì đánh dấu hoá đơn đã thu qua cọc. Cùng cơ chế với khoản "trừ cọc"
của cờ đỏ khách từ chối trả (`BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md`).

---

## 5. Câu hỏi cho BE
1. Mục 2: migrate các phiếu `WAITING_PAYMENT` hiện có sang `CLOSED` luôn, hay để tự đóng khi khách trả (sau khi sửa mục 1)?
2. Mục 3: phiếu có hoá đơn đã `PAID` thì chặn huỷ, hay cho huỷ + hoàn tiền tay?
3. Mục 2.5: thêm được `tenantChargeStatus` (+ `paidAt`) không?
4. Mục 4: trừ cọc nợ bảo trì tự động khi quyết toán, hay để admin/manager tick chọn từng khoản?

## 6. Kiểm chứng khi BE ship
- Phiếu đang `WAITING_PAYMENT` cũ: khách trả QR → phiếu `CLOSED`, timeline có "Tenant đã thanh toán…", FE nhận realtime.
- Phiếu mới lỗi do khách: báo sửa xong → `CLOSED` ngay, `billingHint = TENANT_CHARGE_PENDING`, có `issuedInvoice`
  (QR, hạn +5 ngày); khách trả → GET lại thấy hết `issuedInvoice`, `tenantChargeStatus = PAID`.
- Chẩn đoán thay mới + khách trả → `CLOSED` ngay (không còn `WAITING_PAYMENT`), có `issuedInvoice`.
- Thiết bị vừa sửa xong (khách chưa trả) → tenant tạo phiếu mới được.
- Huỷ phiếu có hoá đơn chưa trả → hoá đơn `CANCELLED`, không bị cron quá hạn.
- Khách còn nợ phí sửa chữa → hiện trong quyết toán trả phòng.

## 7. Phía FE (đang làm, không phụ thuộc BE)
- Chẩn đoán "Lỗi do khách": dùng sẵn ảnh hiện trạng khách đã gửi làm bằng chứng (bật mặc định, vẫn chụp thêm
  được); ảnh bằng chứng tuỳ chọn.
- Chặn báo hỏng sớm: thiết bị đang có phiếu mở / đang chờ thay mới → không mở form, dẫn tới phiếu đang mở; bắt
  riêng lỗi `DUPLICATE_EQUIPMENT_TICKET` và `EQUIPMENT_AWAITING_REPLACEMENT`.
- Sau khi BE làm mục 2: phiếu `CLOSED` hiện nhãn "Khách còn nợ X đ / Đã trả" + QR (tenant và manager), bỏ thẻ
  "Chờ thanh toán" cho phiếu mới.
