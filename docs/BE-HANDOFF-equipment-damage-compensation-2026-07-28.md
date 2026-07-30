# Handoff BE — Bồi thường thiết bị hư do khách thuê (còn bảo hành = khấu hao, hết bảo hành = phạt cố định)

**Ngày:** 2026-07-28
**Bối cảnh:** khi khách thuê làm hư trang thiết bị (VD: máy lạnh), cần tính số tiền khách phải bồi thường:
- **Còn bảo hành:** trả theo khấu hao còn lại. VD máy lạnh 8.000.000đ, khấu hao trong 24 tháng, khách dùng 12 tháng mới hư → bồi thường phần khấu hao còn lại = 8.000.000 × (24-12)/24 = **4.000.000đ**.
- **Hết bảo hành:** trả theo mức phạt cố định đã cấu hình sẵn cho thiết bị (field `penaltyFee`).

## 1. Đã có sẵn — không cần thêm gì

`Equipment` entity đã có đủ dữ liệu cần cho công thức trên:
- `price` (giá gốc)
- `warrantyStartDate`, `warrantyEndDate`, `warrantyMonths`
- `penaltyFee` (mức phạt cố định khi hết bảo hành — set qua cột "Giá phạt hết bảo hành (VNĐ)" lúc import Excel onboarding, `ExcelRenovationImportWorkbookReader.java:168`)

`EquipmentResponse` DTO cũng đã có đủ 5 field trên, và FE (`EquipmentDto` trong `types/index.ts`) cũng đã map sẵn — nghĩa là **phần TÍNH số tiền gợi ý bồi thường FE có thể tự làm hoàn toàn**, không cần BE tính hộ, miễn là API trả đúng dữ liệu (xem bug bên dưới).

## 2. Bug cần sửa — `penaltyFee` bị thiếu map ở endpoint chi tiết thiết bị

`EquipmentServiceImpl.java`, hàm build `EquipmentResponse` cho `GET /api/v1/equipment/{id}` (dùng bởi `GlobalEquipmentController.getEquipmentById`) — map đủ `price`, `warrantyMonths`, `warrantyStartDate`, `warrantyEndDate` (dòng ~204-215) nhưng **thiếu `.penaltyFee(equipment.getPenaltyFee())`**. Kết quả: mọi lần FE gọi endpoint này, `penaltyFee` luôn trả về `null` dù DB có giá trị thật (set lúc import Excel onboarding, xem `PropertyOnboardingServiceImpl.java:307` set, và đã dùng đúng ở nơi khác — `PropertyOnboardingServiceImpl.java:1139`).

**Fix:** thêm 1 dòng vào builder chain đó:
```java
.penaltyFee(equipment.getPenaltyFee())
```

## 3. Gap lớn hơn — luồng "khách làm hư → khoản chờ thu" đã thiết kế DTO nhưng chưa nối dây ở đâu cả

Grep toàn bộ codebase thấy:

- `MaintenanceResolveRequest.java` (đã có sẵn field đúng ý: `repairCost`, `costPaidBy` (enum `CostPaidBy` HOST/TENANT), `cause` (enum `DamageCause`), `equipmentId`) — **không controller nào dùng DTO này cả** (dead code).
- Endpoint `/complete` thật sự đang dùng (`MaintenanceController.complete` → `MaintenanceCompleteRequest`) chỉ có `resolutionNote` + `afterImages` — **không có chỗ nhập repairCost/costPaidBy**.
- `TenantPendingChargeServiceImpl.java` chỉ có `list` (đọc) và `issueInvoiceFromCharges` (gộp charge có sẵn thành hoá đơn) — **không có đoạn code nào tự tạo mới `TenantPendingCharge`** ở bất kỳ đâu trong flow bảo trì. Nói cách khác: dù manager có nhập repairCost/costPaidBy=TENANT đi nữa (hiện chưa có chỗ nhập), cũng không có gì biến nó thành khoản chờ thu thật.

→ Toàn bộ pipeline "khách làm hư thiết bị → tự tính tiền → tạo khoản chờ thu → phát hoá đơn" hiện là **các mảnh rời rạc chưa lắp lại với nhau**, không phải chỉ thiếu công thức khấu hao.

## 4. Đề xuất

**BE:**
1. Sửa bug #2 (thêm `.penaltyFee(...)`).
2. Gộp `repairCost`, `costPaidBy`, `cause`, `equipmentId` (lấy từ `MaintenanceResolveRequest` có sẵn) vào `MaintenanceCompleteRequest` — để manager gửi kèm lúc "Báo sửa xong" (`PUT /{id}/complete`), thay vì tạo endpoint riêng.
3. Trong `MaintenanceServiceImpl.complete(...)`: sau khi lưu `repairCost`/`costPaidBy` vào `MaintenanceRequest`, nếu `costPaidBy == TENANT` và `repairCost != null` && `> 0` → tạo mới 1 `TenantPendingCharge` (contract lấy theo phòng/khách của ticket, category `"MAINTENANCE"`, `note` dạng `"Chi phí bảo trì ticket #<id>: <title>"` để khớp cách FE đang parse `#id` từ note, xem `pendingChargeService.ts` comment dòng 15).

**FE (mình sẽ làm khi BE gửi field mới, không cần chờ BE cho phần tính toán):**
- Ở màn "Báo sửa xong" (`TicketDetailScreen.tsx`), thêm chọn "Ai trả chi phí sửa chữa" (Chủ nhà / Khách thuê).
- Khi chọn Khách thuê + ticket có `equipmentId`: gọi `GET /api/v1/equipment/{id}` lấy `price/warrantyStartDate/warrantyEndDate/penaltyFee`, tự tính số tiền gợi ý theo công thức:
  ```
  today = hôm nay
  if today > warrantyEndDate:        // hết bảo hành
      suggested = penaltyFee ?? 0
  else:                               // còn bảo hành — khấu hao còn lại
      totalDays = warrantyEndDate - warrantyStartDate
      usedDays  = today - warrantyStartDate
      suggested = price * max(0, (totalDays - usedDays) / totalDays)
  ```
  Điền sẵn vào ô nhập, manager xem/sửa tay trước khi gửi — không tự động chốt số tiền.

## Phạm vi ảnh hưởng

Chỉ ảnh hưởng luồng "Báo sửa xong" (`/complete`) và trang thiết bị chi tiết (`/equipment/{id}`). Không ảnh hưởng các luồng bảo trì khác (approve/reject/review-reject/cancel) hay khoản chờ thu đã tồn tại sẵn (list/issue-invoice vẫn hoạt động bình thường với dữ liệu cũ).
