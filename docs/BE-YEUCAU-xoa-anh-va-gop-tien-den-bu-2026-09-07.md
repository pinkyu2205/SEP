# 2 yêu cầu BE cho luồng bảo trì (complete/photos) — 07/09/2026

**Trạng thái mục 1, 2: ✅ BE đã ship (commit `ae331c2`, cùng ngày) — FE đã nối dây
xong.** Giữ lại doc để đối chiếu contract thật khi cần.

**Mục 3 (thêm 07/09/2026, phát hiện khi test): ✅ BE đã ship (commit `afd2f17`, cùng
ngày, khớp đúng đề xuất) — FE đã nới lỏng validate.**

## 1. Thiếu endpoint xoá 1 ảnh đã upload (maintenance photos)

**Bối cảnh:** Manager thêm ảnh AFTER/INVOICE/FAULT_EVIDENCE qua
`POST /{id}/photos?type=` — ảnh được lưu (append vào cột CSV `after_image_urls`/
`invoice_image_urls`/...) **ngay khi chọn ảnh**, không phải lúc bấm "Báo sửa xong".
Muốn đổi 1 ảnh vừa thêm nhầm (vd chụp mờ, chụp sai thiết bị) thì hiện KHÔNG có cách nào
gỡ nó ra — chỉ có thể thêm ảnh mới bên cạnh, ảnh sai vẫn còn nguyên trong danh sách gửi
kèm hoá đơn/hồ sơ.

Đã grep toàn bộ `@DeleteMapping` trong `controller/` — không có endpoint nào xoá ảnh
bảo trì theo id/url. `MaintenanceController` chỉ có `POST /{id}/photos`, không có DELETE.

**Đề xuất:**

```java
@DeleteMapping("/{id}/photos")
@PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'TENANT')")
public MaintenanceRequestResponse deletePhoto(
        @PathVariable Long id,
        @RequestParam String type,   // BEFORE | AFTER | FAULT_EVIDENCE | INVOICE | SELF_REPAIR
        @RequestParam String url) {  // URL đúng như trả về trong danh sách ảnh
    return maintenanceService.deletePhoto(id, type, url);
}
```

- Chỉ cho xoá khi phiếu CHƯA đóng (`status != CLOSED/CANCELLED`) — khớp logic hiện tại
  chỉ cho thêm ảnh lúc phiếu còn mở.
- Xoá khỏi cột CSV tương ứng + xoá dòng `MaintenancePhotoHistory` cùng URL (nếu có ghi
  lịch sử) — không cần xoá file vật lý trên storage nếu chưa tiện, chỉ cần gỡ khỏi danh
  sách hiển thị/gửi kèm.
- Ai được xoá: người tạo ảnh đó (tenant xoá ảnh BEFORE của mình, manager xoá ảnh
  AFTER/INVOICE/FAULT_EVIDENCE của mình) — hoặc đơn giản hoá bằng đúng quyền như POST
  hiện tại nếu tách theo người tạo phức tạp.

**Việc FE đang làm trong lúc chờ:** vẫn giữ nút xoá hiện có cho ảnh LOCAL (chưa/đang
upload xong) — chỉ ảnh ĐÃ lên server mới thiếu nút xoá, đúng phần cần endpoint này.

## 2. `resolveMaintenanceChargeAmount` chưa cộng `invoiceAmount` khi thiết bị thay mới

**Bối cảnh:** Khi `complete()` với `equipmentNeedsReplacement=true` +
`chargeToTenant=true`, `resolveMaintenanceChargeAmount()`
(`MaintenanceServiceImpl.java` dòng 1236-1248) CHỈ lấy `estimatedDamageAmount` làm số
tiền thu khách — bỏ qua `invoiceAmount` dù ảnh + số tiền hoá đơn vẫn là field bắt buộc
ở mọi lượt `complete()`. Nếu ngoài tiền đền bù thiết bị, manager còn phát sinh thêm chi
phí ghi trên hoá đơn (vd công tháo lắp, vật tư đi kèm), khách hiện chỉ bị thu ĐÚNG 1
trong 2 khoản, không phải tổng.

**Đề xuất:** khi `needsReplacement && chargeToTenant`, cộng cả 2 khoản:

```java
private BigDecimal resolveMaintenanceChargeAmount(MaintenanceRequest req, boolean needsReplacement) {
    if (needsReplacement) {
        if (req.getEstimatedDamageAmount() == null
                || req.getEstimatedDamageAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("estimatedDamageAmount phải lớn hơn 0 khi thay thiết bị và thu phí tenant");
        }
        BigDecimal total = req.getEstimatedDamageAmount();
        if (req.getInvoiceAmount() != null && req.getInvoiceAmount().compareTo(BigDecimal.ZERO) > 0) {
            total = total.add(req.getInvoiceAmount());
        }
        return total;
    }
    ...
}
```

**Vì sao chưa tự gộp bên FE:** field `estimatedDamageAmount` hiện là nguồn DUY NHẤT BE
đọc để tính tiền thu khách khi thay mới — FE có thể tự cộng rồi gửi đè lên
`estimatedDamageAmount`, nhưng như vậy field này trên DB sẽ mang nghĩa "tổng cộng" thay
vì đúng nghĩa "tiền đền bù thiết bị", có thể làm lệch báo cáo/thống kê nào đó đang đọc
field này với nghĩa gốc. Xin BE sửa ở nguồn cho đúng ngữ nghĩa, FE **chưa** tự gộp.

## Kiểm chứng mục 1, 2 (đã ship)

1. Xoá ảnh: thêm nhầm 1 ảnh AFTER, gọi `DELETE /{id}/photos?type=AFTER&url=...` → ảnh
   biến mất khỏi `GET /{id}`, thêm lại ảnh đúng vẫn hoạt động bình thường.
2. Gộp tiền: `complete()` với `equipmentNeedsReplacement=true`, `chargeToTenant=true`,
   `estimatedDamageAmount=500000`, `invoiceAmount=200000` → hoá đơn phát cho tenant phải
   là 700.000đ, không phải 500.000đ.

---

## 3. (Chưa ship) `invoiceAmount` bị bắt buộc > 0 kể cả khi chỉ muốn thu đúng tiền đền bù

**Bối cảnh:** Test thực tế phát hiện — trường hợp khách làm hư thiết bị, thay mới,
manager CHỈ muốn thu đúng tiền đền bù (không phát sinh thêm chi phí hoá đơn nào khác)
thì KHÔNG làm được, vì `applyInvoiceOnComplete()`
(`MaintenanceServiceImpl.java` dòng 1213-1231) bắt buộc:

```java
if (request.getInvoiceAmount() == null || request.getInvoiceAmount().compareTo(BigDecimal.ZERO) <= 0) {
    throw new BusinessException("invoiceAmount phải lớn hơn 0");
}
```

Điều kiện này chạy **vô điều kiện** cho MỌI lượt `complete()`, trước cả khi biết có
`equipmentNeedsReplacement` hay không — nên dù `resolveMaintenanceChargeAmount()` (mục 2
ở trên) đã đúng ý "chỉ cộng invoiceAmount nếu > 0", request không bao giờ tới được bước
đó với `invoiceAmount = 0`, vì bị chặn ngay từ `applyInvoiceOnComplete()`.

**Đề xuất:** chỉ bắt buộc `invoiceAmount > 0` khi KHÔNG thay thiết bị (vì lúc đó
`invoiceAmount` là nguồn DUY NHẤT để tính tiền thu khách — xem nhánh `else` của
`resolveMaintenanceChargeAmount`). Khi `equipmentNeedsReplacement=true`, cho phép
`invoiceAmount` là `null`/`0` (đã có `estimatedDamageAmount > 0` đứng vững một mình):

```java
private void applyInvoiceOnComplete(MaintenanceRequest req, MaintenanceCompleteRequest request, boolean needsReplacement) {
    if (isBlank(request.getInvoiceVendor())) {
        throw new BusinessException("invoiceVendor là bắt buộc");
    }
    if (request.getInvoiceDate() == null) {
        throw new BusinessException("invoiceDate là bắt buộc");
    }
    boolean hasAmount = request.getInvoiceAmount() != null && request.getInvoiceAmount().compareTo(BigDecimal.ZERO) > 0;
    if (!needsReplacement && !hasAmount) {
        throw new BusinessException("invoiceAmount phải lớn hơn 0");
    }
    if (isBlank(request.getRepairDescription())) {
        throw new BusinessException("repairDescription là bắt buộc");
    }
    req.setInvoiceVendor(request.getInvoiceVendor().trim());
    req.setInvoiceNumber(trimToNull(request.getInvoiceNumber()));
    req.setInvoiceDate(request.getInvoiceDate());
    req.setInvoiceAmount(request.getInvoiceAmount()); // có thể null/0 khi thay mới, không sao
    req.setRepairDescription(request.getRepairDescription().trim());
}
```

(Lưu ý: `needsReplacement` đã có sẵn ở `complete()` dòng 667, chỉ cần truyền thêm vào
lời gọi `applyInvoiceOnComplete(req, request)` ở dòng 663 → `applyInvoiceOnComplete(req, request, needsReplacement)`.)

**Ảnh hoá đơn (photo) vẫn giữ nguyên bắt buộc** — không xin đổi phần này, chỉ xin nới
lỏng riêng con SỐ TIỀN.

**FE đã sẵn sàng đổi ngay khi BE ship:** hiện `TicketDetailScreen.tsx` vẫn bắt buộc
nhập số tiền hoá đơn > 0 trong MỌI trường hợp (khớp đúng luật BE hiện tại, không bug) —
sẽ nới validate này thành "chỉ bắt buộc khi KHÔNG thay thiết bị" ngay khi BE xác nhận đã
ship, để không gửi lên một request chắc chắn bị BE từ chối.

## Kiểm chứng mục 3 (khi BE ship)

- Thay mới thiết bị, thu phí khách, để trống số tiền hoá đơn (hoặc gửi 0), vẫn có ảnh
  hoá đơn đính kèm → `complete()` phải THÀNH CÔNG, hoá đơn phát cho khách = đúng
  `estimatedDamageAmount`, không cộng thêm gì.
- Luồng A (`in_repair`, không thay thiết bị) để trống số tiền hoá đơn → vẫn phải bị
  chặn với lỗi `invoiceAmount phải lớn hơn 0` như cũ (không được nới lỏng nhầm sang
  nhánh này).
