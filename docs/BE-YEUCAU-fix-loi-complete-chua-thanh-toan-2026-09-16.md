# Lỗi còn sót lại sau bản fix `01e4130` — 16/09/2026

Đã đọc code thật để đối chiếu với doc `BE-RESOLVED-tasks-2026-09-14.md`. 2/3 việc fix
đúng, 1 việc còn lỗ hổng nghiêm trọng cần sửa ngay, kèm 2 việc phụ chưa làm đúng yêu cầu
gốc (ưu tiên thấp hơn).

## 1. (Nghiêm trọng) `/complete` vẫn đóng được phiếu tenant-fault mà không cần thanh toán

**Đã xác nhận đúng**: `/handover` và `/start-repair` giờ đã chặn đúng khi
`chargeInvoiceId` chưa `PAID` (`else if (flowType==TENANT_FAULT && faultResolutionPath==MANAGER_REPAIR)` ở
cả 2 hàm). Nhưng có 1 đường đi khác né được cả 2 guard này:

**Đường đi cụ thể:**
1. Manager gọi `reject-fault` với `resolutionPath=MANAGER_REPAIR` nhưng **KHÔNG** truyền
   `repairAppointmentAt` và **KHÔNG** truyền `needsOffSiteInspection`.
2. `rejectFault()` set thẳng `req.setStatus(MaintenanceStatus.TENANT_FAULT)` — **bỏ qua
   hẳn `REPAIR_SCHEDULED`**.
3. Phiếu ở status `TENANT_FAULT` giờ:
   - Không gọi được `/handover` (chỉ nhận `REPAIR_SCHEDULED`/`IN_REPAIR`).
   - Không gọi được `/start-repair` (`requireStatus(req, REPAIR_SCHEDULED)` — thất bại).
   - **Chỉ còn `/complete` đóng được** (điều kiện `status==TENANT_FAULT &&
     faultResolutionPath==MANAGER_REPAIR` ở đầu `complete()` cho qua đúng case này).
4. `complete()` **không có bất kỳ check `TenantInvoiceStatus.PAID` nào** — tạo hoá đơn
   (nếu `chargeToTenant=true`) SAU KHI đã set status `CLOSED`, không chờ thanh toán.

→ Tái hiện đúng lỗi gốc đã báo ("đóng phiếu tenant-fault không thu tiền"), chỉ là đi qua
`/complete` thay vì `/handover`.

**Đề xuất:** thêm đúng guard đã dùng ở `/handover`/`/start-repair` vào `complete()`, áp
dụng cho nhánh `managerRepairFault` (status=TENANT_FAULT, faultResolutionPath=MANAGER_REPAIR):
```java
// Trước khi cho complete() chạy tiếp với managerRepairFault=true:
if (managerRepairFault && req.getChargeInvoiceId() != null) {
    TenantInvoice invoice = tenantInvoiceRepository.findById(req.getChargeInvoiceId())
            .orElseThrow(() -> new BusinessException("Không tìm thấy hoá đơn thu phí"));
    if (invoice.getStatus() != TenantInvoiceStatus.PAID) {
        throw new BusinessException("Cần tenant thanh toán hoá đơn trước khi hoàn tất.");
    }
} else if (managerRepairFault && req.getChargeInvoiceId() == null) {
    throw new BusinessException("Cần báo giá và tenant thanh toán hoá đơn trước khi hoàn tất.");
}
```
(Nhánh `normalFlow` — hao mòn tự nhiên — giữ nguyên, không đụng tới, vì case đó không
cần thanh toán trước.)

**Lưu ý thêm:** đây có thể không phải trường hợp duy nhất còn sót — đề xuất BE tự rà lại
xem còn đường nào khác dẫn tới `TENANT_FAULT`/`REPAIR_SCHEDULED` với `MANAGER_REPAIR` mà
bỏ qua cả 3 endpoint có guard (`/charge` bắt buộc gọi trước, `/start-repair`,
`/handover`) hay không, để chặn 1 lần cho hết thay vì vá từng lỗ.

## 2. (Ưu tiên thấp) `/handover` vẫn chấp nhận `IN_REPAIR`

Yêu cầu gốc là chỉ nhận `REPAIR_SCHEDULED`, nhưng code hiện vẫn chấp nhận cả `IN_REPAIR`.
Rủi ro thực tế đã giảm nhiều nhờ guard thanh toán mới (mục đã fix đúng), nhưng vẫn nên
dọn lại cho khớp thiết kế — phiếu Nhánh A (`IN_REPAIR`) nên đóng qua `/complete`, không
qua `/handover`. Không gấp, làm khi tiện.

## 3. (Ưu tiên thấp, tuỳ chọn) Field `chargeInvoiceId` trên `MaintenanceRequestResponse`

Đã xin nhưng chưa thêm — hiện FE vẫn lấy được QR/hoá đơn qua `issuedInvoice` (đã fix
đúng ở mục GET), nên field này không còn chặn đường nữa. Nếu tiện thì thêm, không thì
FE tự dùng `issuedInvoice` (bên trong chắc có id hoá đơn) để đối chiếu với event
`INVOICE_PAID` — không bắt buộc BE phải làm thêm.

## Kiểm chứng khi BE ship mục 1

- `reject-fault` với `resolutionPath=MANAGER_REPAIR`, không truyền
  `repairAppointmentAt`/`needsOffSiteInspection` → phiếu vào `TENANT_FAULT` → gọi
  `/complete` ngay (chưa gọi `/charge`) → phải bị chặn.
- Gọi `/charge` trước → `/complete` khi hoá đơn chưa `PAID` → phải bị chặn.
- Thanh toán xong → gọi lại `/complete` → phải thành công.
- Case hao mòn tự nhiên (`normalFlow`) → `/complete` vẫn chạy bình thường, không bị ảnh
  hưởng bởi guard mới.
