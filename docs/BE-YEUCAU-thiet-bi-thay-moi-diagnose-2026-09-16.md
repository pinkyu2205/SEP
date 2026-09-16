# Xin bổ sung "thiết bị hỏng hoàn toàn — cần thay mới" vào `diagnose()` — 16/09/2026

## ⚠️ Cập nhật 16/09/2026 (sau commit `49201d9 "sua loi thiet bi thay moi"`)

Đã pull + đọc code, xác nhận: phần chính (field `equipmentNeedsReplacement`/
`estimatedDamageAmount` trên `diagnose()`, cờ `equipmentReplacementFlagged`, migration
cột DB) **làm đúng, đã build thành công**. Cảm ơn team đã làm nhanh.

**Còn thiếu đúng 1 việc — xem mục "Gap thứ 2" ở cuối file này**: `handover()` (đóng
phiếu ở nhánh "mang đi kiểm tra thêm") vẫn CHƯA gọi `applyEquipmentReplacementOnComplete()`
— grep lại thấy hàm này chỉ còn được gọi ở đúng 1 chỗ, trong `complete()` (dòng ~814).
Nghĩa là phiếu nào cần thay thiết bị mà kết thúc bằng bàn giao (không qua `complete()`)
thì thiết bị sẽ không bao giờ được cập nhật lại. Nhờ team làm nốt phần này rồi báo lại,
FE sẽ nối luôn UI checkbox "cần thay mới" vào màn Chẩn đoán sau khi có đủ cả 2.

## Bối cảnh

Trước redesign hôm nay (`send-for-inspection`/`diagnose`), khối "thiết bị hỏng hoàn toàn
— cần thay mới" (tự tính khấu hao còn lại nếu còn bảo hành, hoặc `penaltyFee` nếu hết
bảo hành) chỉ tồn tại ở form `reject-fault(MANAGER_REPAIR)` cũ. Form đó đã bị thay bằng
`diagnose()`, nhưng `diagnose()` hiện KHÔNG có khái niệm "cần thay mới" — chỉ có 1
field tiền duy nhất (`quotedRepairAmount`, luôn đổ thẳng vào `estimatedDamageAmount`).

**Cần khôi phục lại khối này, áp dụng cho ĐỦ CẢ 4 trường hợp**: (Sửa được ngay | Mang đi
kiểm tra thêm) × (Hao mòn tự nhiên | Lỗi do khách) — không chỉ riêng nhánh lỗi khách như
trước. Logic tính tiền giữ y nguyên như cũ (khấu hao còn lại / `penaltyFee`, FE tính rồi
gửi số lên, BE không tự tính lại — đúng quy ước đang dùng ở `charge()`/`complete()`).

## Bug đã phát hiện khi rà lại — quan trọng, cần biết trước khi sửa

Vì `diagnose()` hiện **luôn** set `estimatedDamageAmount = quotedRepairAmount` (mọi
trường hợp, kể cả sửa thường không thay gì), phía FE không còn cách nào phân biệt
"phiếu này thật sự thay thiết bị" với "phiếu này chỉ là 1 lần sửa có báo giá" — trước
đây FE suy luận qua `estimatedDamageAmount > 0` (`hasReplacementAmount`), giờ suy luận
đó luôn đúng cho MỌI phiếu đã qua `diagnose()`.

Hậu quả: nếu FE cứ gửi `equipmentNeedsReplacement=true` cho `complete()` dựa theo suy
luận cũ, **BE sẽ tự động đánh dấu lại thiết bị là NEW + reset `maintenanceCount`
(`applyEquipmentReplacementOnComplete`) cho MỌI phiếu lỗi khách đã qua `diagnose()` +
`charge()`, kể cả những phiếu chỉ sửa bình thường không hề thay gì** — sai dữ liệu thiết
bị thật.

**Đã vá tạm phía FE ngay khi phát hiện** (không đợi BE): `handleComplete()` hiện KHÔNG
còn tự gửi `equipmentNeedsReplacement=true` cho các phiếu đã `charge()` qua `diagnose()`
nữa — nghĩa là tạm thời tính năng "đánh dấu thay mới thiết bị" cho nhánh lỗi khách bị
**tắt hẳn** cho tới khi có field mới dưới đây. Không ảnh hưởng số tiền thu (khoản charge
vẫn đúng), chỉ tắt tạm phần cập nhật lại Equipment.

## Đề xuất field mới trên `MaintenanceDiagnoseRequest`

```java
private Boolean equipmentNeedsReplacement;  // mặc định false/null
private BigDecimal estimatedDamageAmount;   // BẮT BUỘC khi equipmentNeedsReplacement=true
                                             // — FE tự tính (khấu hao còn lại / penaltyFee),
                                             // gửi số lên, BE KHÔNG tự tính lại (giữ đúng
                                             // quy ước estimatedDamageAmount hiện có ở
                                             // reject-fault()/charge()/complete()).
```

`quotedRepairAmount` đổi vai trò khi `equipmentNeedsReplacement=true`: từ "giá sửa bắt
buộc" thành **"chi phí phát sinh thêm, tuỳ chọn"** (vd chi phí lắp đặt thiết bị mới) —
y hệt cách `invoiceAmount` đang là phần cộng thêm tuỳ chọn bên cạnh
`estimatedDamageAmount` ở `resolveMaintenanceChargeAmount()` hiện tại.

## Logic `diagnose()` cần đổi

```
if (equipmentNeedsReplacement == true):
    validate estimatedDamageAmount != null && > 0   // bắt buộc
    req.estimatedDamageAmount = estimatedDamageAmount   // giá trị thay thế thật
    req.invoiceAmount = quotedRepairAmount (nếu có, tuỳ chọn)   // chi phí phát sinh thêm
else:
    // GIỮ NGUYÊN hành vi hiện tại — không đổi gì cho trường hợp phổ biến (không thay thiết bị)
    validate quotedRepairAmount != null && >= 0
    req.estimatedDamageAmount = quotedRepairAmount
```

Áp dụng **độc lập với `damageCause`** — cả `WEAR` lẫn `TENANT_MISUSE`, cả gọi từ `OPEN`
lẫn từ `REPAIR_SCHEDULED` (sau khi mang đi kiểm tra) đều nhận field này như nhau. Khi
`damageCause=WEAR` + `equipmentNeedsReplacement=true`: công ty tự chịu chi phí thay thế
(không lập hoá đơn thu khách gì cả — giống hệt cách Luồng A hiện complete() đang xử lý
"công ty trả" cho thiết bị thay mới, chỉ lưu số liệu tham khảo).

## Field mới cần trả về (để FE biết lại đúng cờ ở bước charge()/complete() sau này)

Vì quyết định "cần thay mới" chốt ở `diagnose()` nhưng tác dụng thật (đánh dấu lại
Equipment) chỉ xảy ra ở `complete()` — cần một field bền để FE đọc lại đúng, không suy
luận qua `estimatedDamageAmount` nữa:

```java
// MaintenanceRequestResponse + entity MaintenanceRequest
private Boolean equipmentReplacementFlagged;
```

Set `true` tại đúng lúc `diagnose()` xử lý nhánh `equipmentNeedsReplacement=true`. FE sẽ
đọc field này ở `complete()`/`charge()` sau đó thay vì suy luận từ `estimatedDamageAmount
> 0` như trước — tránh lặp lại đúng bug ở trên.

## Kiểm tra chéo với `chargeBeforeRepair()`/`complete()` hiện có

Không cần đổi gì ở 2 endpoint này — `resolveMaintenanceChargeAmount()` đã đúng công thức
cần (estimatedDamageAmount + invoiceAmount tuỳ chọn khi replacement). FE chỉ cần đọc
đúng `equipmentReplacementFlagged` (thay vì `estimatedDamageAmount > 0`) để quyết định
gửi `equipmentNeedsReplacement=true` cho `charge()`/`complete()` ở các bước sau.

## Gap thứ 2 phát hiện thêm — `handover()` không hề đụng tới Equipment

Đọc lại `handover()` (đóng phiếu thẳng cho nhánh "mang đi kiểm tra thêm", không qua
`complete()`): hàm này chỉ đổi status → `CLOSED`, hoàn toàn KHÔNG gọi
`applyEquipmentReplacementOnComplete()` hay đụng gì tới bảng `Equipment`. Nghĩa là nếu
1 phiếu đi theo nhánh `send-for-inspection` → `diagnose(equipmentNeedsReplacement=true)`
→ (có thể `charge()` nếu khách trả) → `handover()`, thì việc đánh dấu lại thiết bị (status
NEW, reset `maintenanceCount`, cập nhật `installationDate`) **sẽ không bao giờ xảy ra**
cho nhánh này — chỉ nhánh đi qua `complete()` (sửa tại chỗ) mới có tác dụng.

**Đề xuất**: `handover()` cần thêm đúng logic gọi `applyEquipmentReplacementOnComplete()`
(hoặc hàm tương đương) khi `req.isEquipmentReplacementFlagged() == true`, y hệt điều
kiện `complete()` đang làm — không cần FE gửi gì thêm trong `MaintenanceHandoverRequest`,
BE tự đọc cờ đã lưu từ lúc `diagnose()`.
