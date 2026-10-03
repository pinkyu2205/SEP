# Thiết bị "cần thay mới" → kết thúc phiếu ngay tại bước chẩn đoán — 03/10/2026

Đã đọc code thật `MaintenanceServiceImpl` (BE `7e7af84`) trước khi viết.

## 1. Quy tắc nghiệp vụ (đã chốt 03/10/2026)

Khi manager chẩn đoán **thiết bị hỏng hoàn toàn — cần thay mới** (`equipmentNeedsReplacement = true`),
**bất kể nguyên nhân** (hao mòn hay lỗi do khách):

1. **Không sửa, không lịch sửa/giao máy, không ảnh sau sửa chữa.** Thiết bị đã hỏng thì chỉ cần báo admin
   nhập thiết bị mới về rồi import vào hệ thống (luồng cải tạo bổ sung đã có).
2. **Khách phải trả** (lỗi do khách + `tenantAgreesToPay = true`): lập hoá đơn `MAINTENANCE` **ngay lúc chẩn
   đoán** với số tiền đã tự tính (khấu hao còn lại / `penaltyFee`), hạn `MAINTENANCE_CHARGE_DUE_DAYS` (= 5),
   phiếu sang `WAITING_PAYMENT`, khách trả xong phiếu tự `CLOSED` (cơ chế `closeWaitingPaymentAfterInvoicePaid`
   đã có). Quá hạn → cron billing đề nghị chấm dứt HĐ như mọi hoá đơn `MAINTENANCE`.
3. **Công ty chịu** (hao mòn, hoặc khách từ chối trả): phiếu `CLOSED` ngay. Khách từ chối trả vẫn bị cờ đỏ
   (xem `BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md`).
4. **Thiết bị cũ giữ trạng thái `BROKEN`** (chờ thay) — **không** ghi đè thành `NEW` như hiện tại. Admin nhập
   thiết bị mới thành **bản ghi mới**; bản cũ chuyển `DISPOSED` / hết hiệu lực.

Ca **sửa được** (không thay mới) giữ nguyên như hiện tại: hoá đơn thu khách lập lúc `complete()`/`handover()`.

## 2. Hiện trạng (đọc trong code)

- `diagnose()` + `applyDiagnoseAmountFields(needsReplacement=true)`: đã set `estimatedDamageAmount`, đánh dấu
  thiết bị `BROKEN` + `recommendReplacement`, báo admin `EQUIPMENT_NEEDS_REPLACEMENT` — **phần này giữ nguyên**.
- Nhưng sau đó vẫn chuyển phiếu sang `IN_REPAIR` / `TENANT_FAULT` / `REPAIR_SCHEDULED` như ca sửa được, và nhánh
  `fromInspection` còn **bắt buộc `repairAppointmentAt`**.
- Muốn đóng phiếu phải `complete()`: bắt buộc **ảnh AFTER** + **ảnh hoá đơn** (`chargeInvoiceId == null`) — vô lý
  với thiết bị đã bỏ. `handover()` cũng bắt buộc ảnh AFTER.
- `complete()`/`handover()` gọi `applyEquipmentReplacementOnComplete` → **đặt lại chính bản ghi thiết bị cũ thành
  `NEW`**, `installationDate = hôm nay` (coi như đã thay) — trái quy tắc 4.

## 3. Yêu cầu BE

### 3.1 `diagnose()` — nhánh `needsReplacement = true` kết thúc luôn
Sau `applyDiagnoseAmountFields(...)` (giữ nguyên), nếu `needsReplacement`:
- Bỏ yêu cầu `repairAppointmentAt` (kể cả `fromInspection`), không `validateAndAssertSlotAvailable`, không
  `markRoomMaintenance`, không vào `IN_REPAIR`/`TENANT_FAULT`/`REPAIR_SCHEDULED`.
- Set `flowType`/`damageCause`/`faultReason`/`companyAbsorbedFault`… như hiện tại.
- `chargeToTenant = cause == TENANT_MISUSE && tenantAgreesToPay`:
  - **true** → `issueMaintenanceCharge(req, req.getEstimatedDamageAmount())`, set `chargeInvoiceId`,
    `status = WAITING_PAYMENT`, `doneAt = now`; notify tenant (`MAINTENANCE_WAITING_PAYMENT`, có số tiền + hạn);
    trả `issuedInvoice` trong response như `complete()`.
  - **false** → `status = CLOSED`, `doneAt = resolvedAt = now`; notify tenant như `notifyAfterWorkDone`.
- `restoreRoomStatus(req)` + `recordEquipmentMaintenanceHistory(req)` (ghi lịch sử "báo thay mới", chi phí
  = số đã tính). **Không** gọi `applyEquipmentReplacementOnComplete`.
- `restoreEquipmentAfterMaintenance` đã tự bỏ qua khi `equipmentReplacementFlagged` và status
  `CLOSED`/`WAITING_PAYMENT` → thiết bị giữ `BROKEN`. Giữ nguyên.
- Timeline: "Chẩn đoán: cần thay mới — không sửa, báo admin nhập thiết bị mới" (+ "đã lập hoá đơn, hạn 5 ngày").

### 3.2 Thiết bị cũ → thiết bị mới
- Bỏ việc `applyEquipmentReplacementOnComplete` ghi đè bản ghi cũ thành `NEW` (ít nhất là cho phiếu mới; phiếu cũ
  đang dở có thể giữ để không gãy luồng).
- Khi admin import thiết bị thay thế (cải tạo bổ sung) cho đúng vị trí/phòng đó: bản ghi `BROKEN` cũ chuyển
  `DISPOSED` (hoặc `currentEffective = false`), bản mới gắn phòng. Nếu import hiện chưa làm việc này thì cần thêm,
  hoặc cho admin nút "Thanh lý" (`PATCH /equipment/{id}/status` → `DISPOSED`, hiện cho cả ADMIN).
- Phòng/thiết bị đang `BROKEN` không được tạo phiếu bảo trì mới (đã có chặn trùng theo phiếu mở, nhưng phiếu đã
  `CLOSED` thì tenant lại báo được) — đề xuất chặn tạo phiếu với thiết bị `BROKEN`/`DISPOSED`, báo "thiết bị đang
  chờ thay".

### 3.3 `complete()` với `equipmentNeedsReplacement = true` (manager phát hiện lúc đang sửa)
Hiện FE vẫn cho tick "cần thay mới" ở bước báo sửa xong. Đề xuất áp cùng quy tắc 3.1: không bắt ảnh AFTER/ảnh hoá
đơn khi `equipmentNeedsReplacement = true`, lập hoá đơn bằng số tự tính nếu khách trả, không ghi đè thiết bị.

## 4. Câu hỏi cho BE
1. Import thiết bị thay thế hiện có tự chuyển bản cũ sang `DISPOSED`/hết hiệu lực không, hay cần thêm?
2. Phiếu đang ở `IN_REPAIR`/`TENANT_FAULT` mà đã `equipmentReplacementFlagged = true` (tạo trước khi deploy): có
   cho manager đóng không cần ảnh không, hay để chạy hết luồng cũ?
3. Thiết bị chưa có giá/bảo hành và chưa có `penaltyFee` → `applyDiagnoseAmountFields` ném lỗi, manager không
   chẩn đoán "thay mới" được. Giữ chặn như vậy hay cho admin bổ sung `penaltyFee` rồi làm lại?

## 5. Kiểm chứng
- Chẩn đoán thay mới + lỗi khách + đồng ý trả → response `status = WAITING_PAYMENT`, có `issuedInvoice`
  (số = `estimatedDamageAmount`, hạn hôm nay + 5); thiết bị `BROKEN`; admin nhận thông báo; trả tiền → `CLOSED`.
- Chẩn đoán thay mới + hao mòn (hoặc khách từ chối) → `CLOSED` ngay, không hoá đơn, thiết bị `BROKEN`.
- Chẩn đoán thay mới từ phiếu "mang đi kiểm tra" (`fromInspection`) không gửi `repairAppointmentAt` → không lỗi.
- Không còn bản ghi thiết bị nào bị ghi đè `NEW` sau khi phiếu thay mới kết thúc.

## 6. Phía FE đã làm (mobile, `TicketDetailScreen`)
- Tick "cần thay mới" → ẩn hẳn phần lịch sửa / lịch giao máy, hiện khung "Không sửa — báo admin thay thiết bị"
  nói rõ sẽ lập QR (nếu khách trả) hoặc đóng phiếu; không gửi `repairAppointmentAt`.
- Thông báo sau chẩn đoán theo kết quả mới. Màn sau chẩn đoán tự hiện đúng theo `status` BE trả
  (`WAITING_PAYMENT` có thẻ QR sẵn, `CLOSED` là hoàn tất).
- Chừng nào BE chưa ship 3.1, phiếu vẫn sang `IN_REPAIR`/`TENANT_FAULT` và màn báo sửa xong cũ vẫn hiện (không gãy).
