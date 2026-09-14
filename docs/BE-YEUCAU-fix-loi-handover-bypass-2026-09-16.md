# Nghiêm trọng: `/handover` hiện không kiểm tra thanh toán gì cả — 16/09/2026

Đã đọc code thật để đối chiếu với `BE-RESOLVED-fix-loi-complete-chua-thanh-toan-2026-09-16.md`.
2/3 mục đúng thật, nhưng mục `/handover` có vấn đề nghiêm trọng hơn cả lỗi ban đầu.

## Phát hiện: đoạn check thanh toán trong `/handover` đã bị comment out từ trước

Không phải do lần fix này thiếu — mà là 1 commit khác (`c2848dd`, message
"...bypass maintenance payment") đã **chủ động comment out** 2 khối kiểm tra
`TenantInvoiceStatus.PAID` bên trong `handover()`, để lại ghi chú:
```java
// TODO: temporarily bypass payment check
// if (invoice.getStatus() != TenantInvoiceStatus.PAID) {
//     throw new BusinessException("Cần tenant thanh toán hoá đơn trước khi bàn giao.");
// }
```
Commit "fix" lần này (`391f6ae`) tuy sửa đúng dòng NGAY PHÍA TRÊN đoạn này (bỏ
`IN_REPAIR` khỏi điều kiện status) nhưng **không hề khôi phục lại 2 khối check đã bị
comment** — nên bản fix "3/3 đã xong" gửi FE thực chất là 2.5/3, phần quan trọng nhất
của `/handover` vẫn hổng.

**Hậu quả cụ thể (đang sống thật trên `dev` hiện tại):** manager chỉ cần đi đúng luồng
bình thường — `reject-fault` với `resolutionPath=MANAGER_REPAIR` + có
`repairAppointmentAt` (hợp lệ, không cần lách gì) → **bỏ qua `/start-repair`** → gọi
thẳng `/handover` → đóng phiếu ngay lập tức. `/handover` không hề gọi
`issueMaintenanceCharge` ở đâu cả, nên phiếu đóng xong mà **không hề có hoá đơn nào được
tạo, tenant không phải trả gì**. Đây là đường lạm dụng dễ hơn cả lỗi ban đầu vì không
cần né tránh gì đặc biệt, chỉ cần bỏ qua 1 bước không bắt buộc trong quy trình bình
thường.

## Đề xuất

Khôi phục lại đúng 2 khối check đã bị comment trong `handover()`:
```java
if (req.getChargeInvoiceId() != null) {
    TenantInvoice invoice = tenantInvoiceRepository.findById(req.getChargeInvoiceId())
            .orElseThrow(() -> new BusinessException("Không tìm thấy hoá đơn thu phí"));
    if (invoice.getStatus() != TenantInvoiceStatus.PAID) {
        throw new BusinessException("Cần tenant thanh toán hoá đơn trước khi bàn giao.");
    }
} else if (req.getFlowType() == MaintenanceFlowType.TENANT_FAULT
        && req.getFaultResolutionPath() == FaultResolutionPath.MANAGER_REPAIR) {
    throw new BusinessException("Cần báo giá và tenant thanh toán hoá đơn trước khi bàn giao.");
}
```

**Đồng thời dọn luôn đoạn tương tự trong `approve()`** (cũng bị comment bởi cùng commit
`c2848dd`, ghi chú y hệt "temporarily bypass payment check") — hiện có vẻ chưa khai thác
được vì lúc `approve()` chạy thì `chargeInvoiceId` thường vẫn null, nhưng để code "tạm"
kiểu này nằm lại trong production rất rủi ro nếu luồng đổi khác đi sau này.

## Câu hỏi cần BE trả lời thẳng (quan trọng)

**Vì sao đoạn check này bị comment out (commit `c2848dd`)?** Cần biết rõ:
- Có phải chỉ là tắt tạm để test/debug dữ liệu cục bộ rồi lỡ tay commit/push, hay
- Có lý do nghiệp vụ thật nào đó cần tạm thời cho phép bàn giao không cần thanh toán
  (ví dụ đang thiếu dữ liệu invoice test, hoặc 1 case đặc biệt nào đó)?

Nếu là lý do nghiệp vụ thật thì FE cần biết để thiết kế đúng, không chỉ đơn giản là "cứ
uncomment lại là xong". Nếu chỉ là sơ suất thì xin khôi phục lại ngay và rà soát xem còn
đoạn "temporarily bypass" nào khác đang nằm im trong code không (gợi ý: grep từ khoá
"temporarily bypass" hoặc "TODO" trong toàn bộ `MaintenanceServiceImpl.java` trước khi
báo đã xong, tránh phải quay lại vòng thứ 5 cho cùng 1 nhóm lỗi này).

## Kiểm chứng khi BE ship

- `reject-fault` (MANAGER_REPAIR, có `repairAppointmentAt`) → bỏ qua `/start-repair` →
  gọi thẳng `/handover` khi CHƯA gọi `/charge` → phải bị chặn.
- Gọi `/charge` trước, hoá đơn chưa `PAID` → gọi `/handover` → phải bị chặn.
- Thanh toán xong → gọi lại `/handover` → thành công.
- `grep -rn "temporarily bypass" src/` (hoặc tương đương) trong toàn bộ repo trả về rỗng
  trước khi báo hoàn tất.
