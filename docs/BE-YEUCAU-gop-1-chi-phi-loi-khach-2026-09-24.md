# Gộp "Lỗi do khách" về đúng 1 lần nhập chi phí — 24/09/2026

> **ĐÃ XONG (24/09/2026):** BE ship ở commit `0653314` ("fix bug2 24-9") — đủ 4 mục đề xuất
> (bỏ lập hoá đơn sớm ở `diagnose()`, bỏ `requireInvoiceIssuedBeforeRepair()`, `handover()`
> nhận field hoá đơn + tự lập hoá đơn, giữ `/charge` làm đường phòng hờ). FE mobile đã khớp
> (TicketDetailScreen: bỏ ô chi phí ở Chẩn đoán, form hoá đơn ở bước bàn giao, bỏ khối
> "Lập hoá đơn thiệt hại" gọi `/charge`, copy hạn 5 ngày). Phần dưới giữ nguyên làm lịch sử.

Đã đọc code thật `MaintenanceServiceImpl.java` (nhánh hiện tại trên `dev`/`main`, sau
commit BE `51ef899`) để đối chiếu trước khi viết yêu cầu này — không đoán.

## Bối cảnh

Hôm 22/09 đã bỏ ô "Chi phí sửa chữa" ở bước Chẩn đoán cho nhánh **Hao mòn tự nhiên** —
chi phí giờ chỉ nhập 1 lần duy nhất lúc hoàn tất sửa chữa (`complete()`, kiểu bao công).
Nhánh **Lỗi do khách** lúc đó CHƯA đổi được, vì BE dùng đúng số nhập ở bước chẩn đoán để
**lập hoá đơn NGAY LÚC ĐÓ** (trước khi sửa) — bỏ ô nhập là hoá đơn không còn số nào để
lập.

Giờ muốn đổi tiếp: **nhánh Lỗi do khách cũng chỉ còn 1 lần nhập chi phí, lúc sửa chữa
hoàn tất — khách trả SAU khi đã sửa xong**, y hệt nhánh Hao mòn tự nhiên. Nếu khách
không trả thì để cơ chế quá hạn hoá đơn xử lý (đúng cơ chế Tiến vừa làm hôm 24/09: hạn 5
ngày, không phí trễ hạn, quá hạn ngày đầu là quản lý được quyền đề nghị chấm dứt hợp
đồng) — cơ chế đó **đã tự động áp dụng cho mọi hoá đơn loại `MAINTENANCE`, không cần sửa
gì thêm ở phần đó**. Việc cần làm chỉ là dời THỜI ĐIỂM tạo hoá đơn từ lúc chẩn đoán sang
lúc hoàn tất/bàn giao.

## Hiện trạng cụ thể (đọc từ code)

**`diagnose()`** — nhánh `TENANT_MISUSE` + `tenantAgreesToPay=true`:
```java
// Khách đồng ý trả — lập hoá đơn 1 lần, hạn 3 ngày, rồi sửa (không chờ thanh toán)
...
repository.save(req);
issueTenantRepairInvoiceIfNeeded(req);   // <-- LẬP HOÁ ĐƠN NGAY, trước khi sửa
```
`issueTenantRepairInvoiceIfNeeded()` gọi thẳng `issueMaintenanceCharge()` bằng số
`quotedRepairAmount` FE gửi lên — **bắt buộc** phải có số hợp lệ (`> 0`) ngay từ bước
chẩn đoán (`applyDiagnoseAmountFields`), nếu không sẽ ném lỗi
`"quotedRepairAmount là bắt buộc và không được âm"`.

**Gate chặn sửa/bàn giao khi CHƯA có hoá đơn** — `requireInvoiceIssuedBeforeRepair()`,
gọi ở cả 3 nơi: `start-repair()`, `handover()`, `complete()`:
```java
if (req.getChargeInvoiceId() == null) {
    throw new BusinessException(
        "Cần lập hoá đơn chi phí sửa chữa trước khi bắt đầu sửa. Tenant thanh toán trong "
        + TenantPendingChargeService.MAINTENANCE_CHARGE_DUE_DAYS + " ngày.");
}
```
Đây chính là lý do KHÔNG THỂ chỉ bỏ ô nhập phía FE mà không đổi BE: bỏ ô nhập →
`chargeInvoiceId` mãi mãi null → 3 endpoint trên chặn cứng ngay bước đầu tiên.

**`complete()`** — CÓ SẴN cơ chế lập hoá đơn SAU khi sửa xong (đang dùng cho Hao mòn tự
nhiên khi manager tick "thu phí tenant — Luồng A", và cả nhánh thay thiết bị):
```java
if (req.getChargeInvoiceId() == null) {
    if (isBlank(req.getInvoiceImageUrls())) throw ...;
    applyInvoiceOnComplete(req, request, needsReplacement);   // vendor, invoiceDate, invoiceAmount, repairDescription
}
...
if (chargeToTenant && req.getChargeInvoiceId() == null) {
    BigDecimal chargeAmount = resolveMaintenanceChargeAmount(req, needsReplacement);
    issuedInvoice = issueMaintenanceCharge(req, chargeAmount);
    req.setChargeInvoiceId(issuedInvoice.getId());
}
```
→ **Cơ chế "1 lần chi phí lúc hoàn tất" đã có sẵn, đúng những gì cần** — chỉ cần
`diagnose()` không lập hoá đơn sớm nữa là `complete()` tự làm đúng việc còn lại, KHÔNG
CẦN SỬA GÌ THÊM Ở `complete()`.

**`handover()`** — đây mới là chỗ thiếu thật sự. Handover dùng cho nhánh "mang thiết bị
đi kiểm tra/sửa ngoài" (`sendForInspection()` → `diagnose(fromInspection=true)` →
`REPAIR_SCHEDULED`, không qua `IN_REPAIR`/`TENANT_FAULT`, không qua `complete()`).
`MaintenanceHandoverRequest` hiện chỉ có đúng 1 field:
```java
public class MaintenanceHandoverRequest {
    private List<String> handoverImages;
}
```
Không có `invoiceVendor`/`invoiceAmount`/... gì cả — `handover()` KHÔNG BAO GIỜ tự lập
hoá đơn. Nó hoạt động đúng CHỈ VÌ hiện tại `diagnose()` đã lập hoá đơn từ trước
(`chargeInvoiceId` có sẵn khi tới `handover()`). Bỏ lập hoá đơn sớm ở `diagnose()` mà
không sửa `handover()` → tenant đồng ý trả, sửa/kiểm tra ngoài xong, quét QR bàn giao →
phiếu đóng luôn, **không hoá đơn nào được tạo, khách không phải trả gì** (đúng loại lỗi
đã từng bị phát hiện và yêu cầu vá ở `docs/BE-YEUCAU-fix-loi-handover-bypass-2026-09-16.md`
— khác nguyên nhân kỹ thuật nhưng CÙNG hậu quả).

## Đề xuất cụ thể cho BE

### 1. `diagnose()` — bỏ lập hoá đơn sớm

- Xoá lời gọi `issueTenantRepairInvoiceIfNeeded(req)` khỏi nhánh `TENANT_MISUSE` +
  `tenantAgreesToPay=true` (cả 2 nhánh con: `REPAIR_SCHEDULED` lẫn `TENANT_FAULT` trực
  tiếp).
- `applyDiagnoseAmountFields()`: bỏ yêu cầu bắt buộc `quotedRepairAmount` cho nhánh
  `TENANT_MISUSE` không thay thiết bị (giữ nguyên yêu cầu này cho nhánh thay thiết bị,
  vẫn tự tính từ khấu hao/`penaltyFee` như cũ, không đổi). Đề xuất: field
  `quotedRepairAmount` với `TENANT_MISUSE` không thay thiết bị thì **bỏ qua hoàn toàn**
  (không set `estimatedDamageAmount`/`invoiceAmount` ở bước này nữa) — số thật sẽ đến từ
  `invoiceAmount` nhập ở `complete()`/`handover()` sau.
- Đổi nội dung thông báo cho tenant (hiện đang nói "Chi phí: Xđ. Thanh toán trong 5 ngày
  kể từ lúc lập hoá đơn.") — vì lúc này CHƯA CÓ SỐ TIỀN NÀO — đổi thành đại loại "Quản lý
  sẽ tiến hành sửa chữa. Hoá đơn chi phí sẽ được gửi sau khi hoàn tất."

### 2. Bỏ hẳn `requireInvoiceIssuedBeforeRepair()`

Xoá gate này khỏi cả 3 nơi gọi (`start-repair()`, `handover()`, `complete()`) — không
còn khái niệm "phải có hoá đơn trước khi sửa" nữa, y hệt cách nhánh Hao mòn tự nhiên vốn
dĩ chưa từng có gate này.

### 3. `handover()` — thêm đúng cơ chế lập hoá đơn mà `complete()` đã có

Thêm vào `MaintenanceHandoverRequest` các field giống hệt `MaintenanceCompleteRequest`:
`invoiceVendor`, `invoiceNumber`, `invoiceDate`, `invoiceAmount`, `invoiceImages`,
`repairDescription` (không cần `chargeToTenant`/`equipmentNeedsReplacement`/
`estimatedDamageAmount` vì nhánh vào được `handover()` luôn đã có `faultResolutionPath`
sẵn từ `diagnose()`, không có nhánh "Luồng A tự chọn thu phí" như `complete()`).

Trong `handover()`, sau khi validate ảnh AFTER (giữ nguyên), thêm đúng đoạn logic
`complete()` đang có:
```java
if (req.getChargeInvoiceId() == null) {
    if (isBlank(req.getInvoiceImageUrls())) throw ...;   // hoặc dùng invoiceImages truyền vào
    applyInvoiceOnComplete(req, request, false);          // tái dùng, không viết lại
}
boolean chargeToTenant = !req.isCompanyAbsorbedFault()
        && req.getFlowType() == MaintenanceFlowType.TENANT_FAULT
        && req.getFaultResolutionPath() == FaultResolutionPath.MANAGER_REPAIR;
if (chargeToTenant && req.getChargeInvoiceId() == null) {
    BigDecimal chargeAmount = resolveMaintenanceChargeAmount(req, req.isEquipmentReplacementFlagged());
    TenantInvoiceResponse issuedInvoice = issueMaintenanceCharge(req, chargeAmount);
    req.setChargeInvoiceId(issuedInvoice.getId());
}
```
(Nếu tiện thì tách chung 1 hàm `private TenantInvoiceResponse issueChargeIfNeeded(...)`
dùng cho cả `complete()` lẫn `handover()`, đỡ trùng code — tuỳ BE quyết định, không bắt
buộc.)

Trường hợp `companyAbsorbedFault=true` (khách từ chối trả) giữ nguyên hành vi cũ: không
lập hoá đơn gì, đi thẳng `resolveStatusAfterWorkDone()` → `CLOSED`.

### 4. `PUT /{id}/charge` (`chargeBeforeRepair()`) — có còn cần giữ không?

Sau khi 3 mục trên xong, endpoint này **không còn ai gọi được nữa theo đúng luồng**
(FE hiện có 1 khối UI dự phòng gọi nó ở màn "mang đi kiểm tra", nhưng dưới thiết kế mới
khối đó sẽ được thay bằng form nhập hoá đơn ở `handover()` — xem phần FE bên dưới).
Hỏi thẳng BE: **giữ lại `/charge` như một cách "lập hoá đơn tay" phòng hờ, hay xoá luôn
cho gọn?** Không bắt buộc phải trả lời ngay, không chặn phần còn lại.

### Không cần đổi gì thêm

- Cơ chế hạn thanh toán 5 ngày / không phí trễ hạn / tự đề nghị chấm dứt HĐ khi quá hạn
  ngày đầu (`BillingCronServiceImpl`, commit `51ef899`) — áp dụng sẵn cho MỌI hoá đơn
  loại `MAINTENANCE` bất kể lập lúc nào, không phân biệt lập sớm hay lập muộn. Đây chính
  là câu trả lời cho "khách không trả thì sao" — không cần thêm cron/luật riêng nào nữa.
- `complete()` — đã đúng thiết kế cần, không sửa.
- `WAITING_PAYMENT` / `closeWaitingPaymentAfterInvoicePaid()` — không đổi.

## Việc FE sẽ làm SAU KHI BE xác nhận/ship (chưa làm — đợi trả lời trước)

1. `TicketDetailScreen.tsx` — bỏ nốt ô "Chi phí sửa chữa" trong nhánh `TENANT_MISUSE`
   của form Chẩn đoán (hiện đang ở dòng ~1209-1234, xem comment 22/09 trong file) —
   `diagnose()` sẽ không còn gửi `quotedRepairAmount` cho bất kỳ nguyên nhân nào nữa
   (trừ khi thay thiết bị, vẫn tự tính như cũ).
2. Đổi thông báo sau khi xác nhận chẩn đoán cho case `TENANT_MISUSE` + đồng ý trả (hiện
   đang hiện "Đã lập hoá đơn cho khách (hạn ... ngày) — bạn có thể sửa ngay.") thành
   thông báo kiểu "Đang tiến hành sửa chữa — hoá đơn sẽ lập sau khi hoàn tất."
3. Màn `repair_scheduled` + `faultResolutionPath === 'manager_repair'` (dòng ~1494 trở
   đi) — bỏ khối "🧾 Lập hoá đơn thiệt hại" gọi `chargeBeforeRepair()`/`submitCharge()`
   (dòng ~1524-1552, đang là code dự phòng gần như chết vì `diagnose()` luôn lập hoá đơn
   sớm nên nhánh `!ticket.chargeInvoiceId` hiếm khi vào tới). Thay bằng form nhập hoá đơn
   (nhà cung cấp, ngày, số tiền, ảnh hoá đơn, mô tả sửa chữa — copy nguyên form đang dùng
   ở bước `complete()`) gắn vào `handover()`. Có 1 khối tương tự thứ 2 ở dòng ~2167-2186
   cần kiểm tra lại xem có phải cùng 1 chỗ hay là màn khác trước khi sửa.
4. `readyToHandover` (hiện `= (hasIssuedCharge || companyAbsorbedFault) && !!repairAppointmentAt`)
   — bỏ điều kiện `hasIssuedCharge` (không còn ý nghĩa gì vì hoá đơn giờ lập NGAY LÚC gọi
   `handover()`, không phải điều kiện tiên quyết).
5. `MaintenanceDetailScreen.tsx` (tenant) — rà lại các đoạn copy giả định hoá đơn đã có
   ngay sau khi manager xác nhận lỗi do khách, đổi cho khớp thời điểm mới (hoá đơn chỉ
   xuất hiện sau khi manager bàn giao/hoàn tất).
6. Dọn comment/tài liệu cũ còn trỏ tới thiết kế "lập hoá đơn trước khi sửa" (vd.
   `docs/BE-YEUCAU-thanh-toan-truoc-khi-sua-2026-09-15.md`, comment trong
   `maintenanceService.ts` dòng ~208-266) — đánh dấu outdated, không xoá hẳn (giữ làm
   lịch sử quyết định).

## Câu hỏi cần BE xác nhận trước khi FE bắt tay code

- Đồng ý bỏ hẳn `requireInvoiceIssuedBeforeRepair()` ở cả 3 endpoint, không giữ lại dạng
  nào khác (vd. chỉ nới cho `handover()` còn giữ ở 2 chỗ kia)?
- `handover()` có `invoiceImages` riêng hay dùng chung `handoverImages` luôn (ảnh AFTER
  và ảnh hoá đơn gộp làm 1)? Đề xuất tách riêng như `complete()` đang làm, cho nhất quán.
- Giữ hay xoá `PUT /{id}/charge`?
- Phiếu cũ đang ở giữa luồng lúc BE deploy (đã qua `diagnose()` cũ, `chargeInvoiceId` đã
  có sẵn) — xử lý sao? Đề xuất: không cần xử lý gì đặc biệt, các phiếu đó vẫn hoàn tất
  bình thường qua nhánh `chargeInvoiceId != null` sẵn có trong `complete()`/`handover()`
  mới (chỉ bỏ invoice mới thì mới đi nhánh lập hoá đơn).

## Kiểm chứng khi BE ship

- `diagnose()` với `damageCause=TENANT_MISUSE`, `tenantAgreesToPay=true`, KHÔNG gửi
  `quotedRepairAmount` → không lỗi, không có hoá đơn nào được tạo, `chargeInvoiceId` vẫn
  null.
- Từ đó gọi `start-repair()` (nếu có hẹn sửa sau) hoặc thao tác tiếp luôn (nếu sửa ngay)
  → KHÔNG bị chặn bởi "cần lập hoá đơn trước khi sửa".
- `complete()` — vẫn y như cũ, không đổi hành vi (đã đúng từ trước).
- `handover()` với đủ `invoiceVendor`/`invoiceAmount`/... → tạo đúng 1 hoá đơn
  `MAINTENANCE`, `chargeInvoiceId` được set, status → `WAITING_PAYMENT` (nếu chưa
  `PAID`) hoặc `CLOSED` (nếu công ty trả hộ).
- Không trả `invoiceAmount`/thiếu field bắt buộc ở `handover()` khi `chargeToTenant=true`
  → bị chặn với lỗi rõ ràng, giống hệt `complete()` đang làm.
- Hoá đơn vừa tạo qua `handover()` quá hạn 5 ngày không trả → cron
  (`BillingCronServiceImpl`) tự chuyển `OVERDUE` + gắn cờ `terminationProposed=true` trên
  hợp đồng — không cần code thêm gì, chỉ cần xác nhận nó chạy đúng cho hoá đơn tạo theo
  đường mới này.
