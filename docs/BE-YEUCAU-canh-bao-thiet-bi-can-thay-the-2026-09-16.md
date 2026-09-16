# Xin đánh dấu + báo admin khi thiết bị được xác định cần thay mới — 16/09/2026

## Bối cảnh

Sau khi có checkbox "Thiết bị hỏng hoàn toàn — cần thay mới" ở màn Chẩn đoán (FE đã
nối, xem `BE-YEUCAU-thiet-bi-thay-moi-diagnose-2026-09-16.md`), muốn thêm bước: **ngay
lúc manager xác định thiết bị cần thay** (không đợi tới lúc thanh toán/hoàn tất), hệ
thống tự đánh dấu thiết bị + báo cho admin biết, để admin chủ động chuẩn bị mua thiết bị
mới và mở đợt "cải tạo bổ sung" ở trang **Cấu hình khai thác** (`/admin/buildings/
configuration`) khi có hàng về — đúng quy trình renovation-supplement-excel đã có sẵn.

Đã rà code, thấy 2 mảnh hạ tầng cần dùng **đã tồn tại sẵn, chỉ chưa được gọi tới lúc
này**:
- `EquipmentStatus.BROKEN` — đã có trong enum, đã hiển thị sẵn ("Hỏng") ở bảng thiết bị
  `OperationalEquipmentPanel.tsx` (FE web) — chỉ chưa có chỗ nào từng SET giá trị này.
- `Equipment.recommendReplacement` (boolean) — đã có trên entity nhưng chỉ bị RESET về
  `false` ở `applyEquipmentReplacementOnComplete()`, chưa từng được set `true` ở đâu.
- `notifyAdmins()` — hàm đã có sẵn trong `MaintenanceServiceImpl.java` (fan-out tới mọi
  `ROLE_ADMIN` đang active), đang dùng cho luồng report-fault/admin-review — dùng lại y
  nguyên, không cần viết notification service mới.

## Đề xuất thay đổi

Trong `applyDiagnoseAmountFields()` — đúng nhánh `needsReplacement == true` (đây là
điểm chèn DUY NHẤT, tự động che phủ cả 4 trường hợp: sửa ngay/mang đi × hao mòn/lỗi
khách, vì cả 4 đều đi qua đúng hàm này):

```java
if (needsReplacement) {
    ... // logic hiện có: validate + set estimatedDamageAmount/invoiceAmount/equipmentReplacementFlagged

    // MỚI — đánh dấu thiết bị + báo admin ngay lúc xác định, không đợi thanh toán xong
    if (req.getEquipmentId() != null) {
        equipmentRepository.findById(req.getEquipmentId()).ifPresent(eq -> {
            eq.setStatus(EquipmentStatus.BROKEN);
            eq.setRecommendReplacement(true);
            equipmentRepository.save(eq);
        });
    }
    notifyAdmins(req,
        "⚠️ Thiết bị cần thay mới",
        (req.getEquipmentName() != null ? req.getEquipmentName() : "Thiết bị") + " — "
            + req.getRoomName() + ", " + req.getPropertyName()
            + " đã được xác định cần thay mới (phiếu bảo trì #" + req.getId() + "). "
            + "Chuẩn bị mở đợt cải tạo bổ sung khi có thiết bị mới.",
        "EQUIPMENT_NEEDS_REPLACEMENT");
}
```

(Tên biến/getter ví dụ — nhờ BE khớp lại đúng tên thật trong `MaintenanceRequest`/
`Equipment`, ví dụ `req.getEquipmentName()` có thể cần lấy qua `equipment.getCatalogName()`
thay vì field trên `req`.)

## Khi nào tín hiệu "cần thay thế" tự biến mất

Không cần thêm gì — `applyEquipmentReplacementOnComplete()` (đã chạy sẵn ở `complete()`
và `handover()` khi `equipmentReplacementFlagged=true`) đã tự set lại
`status = NEW` khi thiết bị thực sự được thay xong. `recommendReplacement` nên reset về
`false` ở cùng chỗ đó luôn (hiện đã có dòng `equipment.setRecommendReplacement(false)`
— giữ nguyên).

## Câu hỏi cần BE/bạn xác nhận

**Ticket bị huỷ sau khi đã đánh dấu cần thay mới thì sao?** Đề xuất: **giữ nguyên**
`status=BROKEN` trên thiết bị (không tự trả về trạng thái cũ) — thiết bị thật sự có vấn
đề thì dù ticket này bị huỷ cũng không nên "biến mất" khỏi tầm nhìn admin; admin tự
quyết định xử lý tiếp qua 1 ticket khác hoặc trực tiếp ở trang thiết bị. Nếu BE/bạn muốn
khác thì nêu rõ để chỉnh lại.

## FE (đã làm sẵn, không phụ thuộc BE)

`OperationalEquipmentPanel.tsx` (trang Cấu hình khai thác) đã:
- Tô đỏ badge "Hỏng" thay vì chữ thường.
- Thêm dropdown lọc theo tình trạng, ưu tiên hiện "🔧 Cần thay thế (N)" lên đầu khi có.
- Hiện số đếm "🔧 N cần thay thế" ngay ở dòng tóm tắt kể cả khi khối đang thu gọn.

Chỉ cần BE set đúng `status=BROKEN` là bảng tự hiện đúng, không cần đổi gì thêm phía FE.
