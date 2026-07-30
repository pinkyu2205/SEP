# Kế hoạch: Luồng bồi thường khi khách thuê làm hư trong ticket bảo trì

**Ngày:** 2026-07-28
**Phạm vi:** FE (mobile-app) + BE (Spring Boot). Tài liệu này để cả team hiểu rõ luồng trước khi bắt tay code — không phải code đã chạy.

---

## 1. Mục tiêu

Sau khi manager sửa xong 1 ticket bảo trì, cần thêm bước: xác định **ai trả chi phí sửa chữa** (chủ nhà hay khách thuê), nếu là khách thuê thì **tính số tiền hợp lý** (khấu hao còn lại nếu còn bảo hành, mức phạt cố định nếu hết bảo hành, hoặc nhập tay nếu không có thiết bị cụ thể), gửi cho khách xem và **phải được khách đồng ý** trước khi thu tiền. Nếu khách đồng ý → hệ thống tự tạo hoá đơn + mã QR để khách chuyển khoản ngay. Nếu khách không đồng ý → không tự động thu, chuyển cho manager xử lý tay (không có cơ chế nào được phép tự động charge khi khách chưa xác nhận — rủi ro khiếu nại/pháp lý).

---

## 2. Hiện trạng (đã audit code thật, không phải đoán)

### Đã có sẵn, dùng được ngay
- `MaintenanceRequest` entity **đã có sẵn** các cột: `costPaidBy` (enum `HOST`/`TENANT`), `cause` (enum `WEAR`/`MISUSE`), `repairCost` (BigDecimal), `equipmentId` — chỉ là **chưa endpoint nào set được các field này**.
- `Equipment` entity đã có `price`, `warrantyStartDate`, `warrantyEndDate`, `warrantyMonths`, `penaltyFee` (mức phạt cố định hết bảo hành, set qua Excel import lúc onboarding nhà) — đủ dữ liệu để tính khấu hao/phạt.
- `TenantPendingCharge` (khoản chờ thu) + `TenantPendingChargeServiceImpl.issueInvoiceFromCharges()` đã tạo hoá đơn thật (`TenantInvoice`, type `MAINTENANCE`) — hoá đơn loại này đã có sẵn QR thanh toán PayOS (như các loại hoá đơn khác trong app).

### Dead code / chưa nối dây (đã verify bằng grep toàn repo)
- `MaintenanceResolveRequest.java` (có đủ field `repairCost`/`costPaidBy`/`cause`/`equipmentId`) — **không controller nào dùng**.
- Endpoint `/complete` thật đang chạy (`MaintenanceCompleteRequest`) chỉ có `resolutionNote` + `afterImages` — không có chỗ set chi phí.
- `TenantPendingChargeServiceImpl` chỉ **đọc** charge có sẵn để gộp hoá đơn — **không có đoạn code nào tự tạo mới** `TenantPendingCharge`. Toàn bộ pipeline "khách làm hư → tự sinh khoản thu" hiện là số 0.
- Bug nhỏ: `GET /api/v1/equipment/{id}` thiếu map `penaltyFee` trong response (đã ghi riêng ở `BE-HANDOFF-equipment-damage-compensation-2026-07-28.md`).

---

## 3. Luồng đề xuất (end-to-end)

```
PENDING → APPROVED → (manager sửa, chụp ảnh before/after) → "Báo sửa xong"
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    ▼
   Manager điền: resolutionNote + ảnh AFTER (như cũ)
                  + [MỚI] "Ai chịu chi phí?" → Chủ nhà | Khách thuê
                      nếu Khách thuê:
                        - chọn nguyên nhân: Hao mòn tự nhiên (WEAR) | Khách làm hư (MISUSE)
                        - số tiền: có equipmentId → auto-gợi ý (công thức §5), không có → nhập tay
                        - manager có thể sửa số tiền gợi ý trước khi gửi
                    ▼
              status → WAITING_TENANT_CONFIRM  (KHÔNG đổi tên/luồng status hiện tại)
                    ▼
   Khách thuê mở ticket, thấy:
     (a) Khối "Xác nhận đã sửa xong đúng yêu cầu?" — y hệt hiện tại (Đồng ý / Từ chối kết quả)
     (b) [MỚI, chỉ hiện nếu costPaidBy=TENANT] Khối riêng "Yêu cầu bồi thường: X đồng — Lý do: ..."
          → Đồng ý thanh toán | Khiếu nại (kèm lý do)
                    │
      ┌─────────────┴──────────────┐
      ▼ (a) Từ chối kết quả sửa     ▼ (a) Đồng ý kết quả sửa
   status → REJECTED               (b) không áp dụng nếu costPaidBy≠TENANT → status → CLOSED (như cũ)
   (luồng review-reject cũ,        (b) costPaidBy=TENANT:
    KHÔNG đổi)                        - Đồng ý trả  → status → CLOSED
                                        + BE tự tạo TenantPendingCharge
                                        + tự issue invoice (MAINTENANCE) kèm QR PayOS
                                        + FE điều hướng thẳng tới màn hoá đơn/QR
                                      - Khiếu nại  → status → CLOSED (ticket sửa chữa vẫn đóng bình
                                        thường — sửa xong rồi) NHƯNG cờ costAgreementStatus=DISPUTED,
                                        không tự tạo charge. Manager tự xử lý tay (thương lượng/giảm/
                                        miễn) qua màn quản lý hiện có, không có auto-escalate ở v1.
```

**Nguyên tắc cứng:** không có nhánh nào tự động thu tiền khi khách chưa bấm "Đồng ý". Không auto-timeout ép đồng ý (khác với việc tự đóng ticket sau 3 ngày nếu khách không phản hồi CHẤT LƯỢNG sửa — cái đó giữ nguyên, không liên quan tới tiền).

---

## 4. Kịch bản chi tiết (test case cho team)

| # | Tình huống | Kết quả mong đợi |
|---|---|---|
| 1 | Chủ nhà tự chịu chi phí (costPaidBy=HOST hoặc không chọn) | Luồng y hệt hiện tại, không hỏi gì thêm khách thuê, không tạo charge. |
| 2 | Khách làm hư thiết bị **còn bảo hành**, có `equipmentId` | Auto-gợi ý = `price × (ngày bảo hành còn lại / tổng ngày bảo hành)`. Manager có thể sửa tay trước khi gửi. |
| 3 | Khách làm hư thiết bị **đã hết bảo hành** | Auto-gợi ý = `penaltyFee` (mức phạt cố định đã cấu hình). |
| 4 | Khách làm hư nhưng ticket **không gắn thiết bị** (sự cố kết cấu/nội thất khác) | Không auto-gợi ý gì — manager nhập tay số tiền theo báo giá thực tế. |
| 5 | Khách đồng ý cả 2 (chất lượng sửa + tiền bồi thường) | Ticket CLOSED, tự tạo hoá đơn MAINTENANCE + QR PayOS, khách chuyển khoản trực tiếp từ đó. |
| 6 | Khách đồng ý chất lượng sửa nhưng **khiếu nại số tiền** | Ticket vẫn CLOSED (việc sửa đã xong, không giữ ticket vì tranh chấp tiền). Không tạo charge. Đánh dấu để manager thấy và tự xử lý (giảm tiền/miễn/thương lượng ngoài luồng, tạo charge thủ công sau nếu thoả thuận được). |
| 7 | Khách **từ chối kết quả sửa** (không liên quan tới tiền) | Y hệt luồng REJECTED/review-reject hiện tại — bước hỏi tiền chưa xảy ra, sẽ hỏi lại khi khách confirm() ở vòng sau. |
| 8 | Manager gửi sai số tiền/nhầm bên chịu phí, khách **chưa** phản hồi | Cho phép manager sửa lại `repairCost`/`costPaidBy` khi ticket còn ở `WAITING_TENANT_CONFIRM` (gọi lại complete hoặc 1 API sửa nhẹ) — miễn là khách chưa bấm nút nào. |
| 9 | Manager gửi sai, khách **đã** đồng ý trả tiền, hoá đơn đã tạo | Ngoài phạm vi v1 — xử lý như hoá đơn sai thông thường (huỷ/điều chỉnh hoá đơn thủ công), không thiết kế API riêng ở bản này. |
| 10 | Thiết bị đã bị gỡ (`operationalStatus=DISABLED`) trước khi tính | Vẫn dùng dữ liệu `price`/`warranty` tại thời điểm complete() — số tiền được **chốt cứng** vào `repairCost` ngay lúc gửi, không tính lại sau này dù thiết bị/giá có đổi. |
| 11 | Khách thuê nguyên căn (không có `roomId`) làm hư thiết bị chung | Không ảnh hưởng — logic tính theo `equipmentId`, độc lập với có/không có `roomId`. |

---

## 5. Công thức tính số tiền gợi ý (chạy ở FE, dùng dữ liệu Equipment đã có)

```
today = hôm nay
if today > warrantyEndDate:                 // hết bảo hành
    suggested = penaltyFee ?? 0
else:                                        // còn bảo hành → khấu hao còn lại
    totalDays = warrantyEndDate - warrantyStartDate
    usedDays  = today - warrantyStartDate
    suggested = price * max(0, (totalDays - usedDays) / totalDays)
```
Ví dụ: máy lạnh 8.000.000đ, khấu hao 24 tháng, dùng 12 tháng mới hư → 8.000.000 × 12/24 = **4.000.000đ**.

Không có `equipmentId` → không gợi ý, để trống cho manager nhập tay.

---

## 6. Thay đổi dữ liệu/API cần làm (BE)

1. **Fix bug:** `EquipmentServiceImpl` map thiếu `penaltyFee` ở `GET /api/v1/equipment/{id}` (chi tiết trong `BE-HANDOFF-equipment-damage-compensation-2026-07-28.md`).
2. **`MaintenanceCompleteRequest`**: thêm `repairCost` (BigDecimal), `costPaidBy` (enum), `cause` (enum) — map thẳng vào field đã có sẵn trên entity `MaintenanceRequest`.
3. **`MaintenanceRequest` entity**: thêm 1 field mới `costAgreementStatus` (enum mới, gợi ý: `NOT_APPLICABLE` (mặc định, khi costPaidBy=HOST) / `PENDING` (đã complete với costPaidBy=TENANT, chờ khách trả lời) / `AGREED` / `DISPUTED`). Không đổi enum `MaintenanceStatus` chính — giữ nguyên flow status hiện tại để không phá vỡ code cũ.
4. **`MaintenanceConfirmRequest`**: thêm field optional `agreeToCharge` (Boolean) — bắt buộc gửi kèm khi `costAgreementStatus == PENDING`.
5. **`MaintenanceServiceImpl.confirm()`**: sau khi set ticket CLOSED như cũ, nếu `costAgreementStatus == PENDING`:
   - `agreeToCharge = true` → set `AGREED`, tạo mới 1 `TenantPendingCharge` (amount=repairCost, category="MAINTENANCE", note tham chiếu ticket), rồi gọi luôn logic tương đương `issueInvoiceFromCharges` cho riêng charge này → trả về kèm thông tin hoá đơn/QR trong response để FE điều hướng thẳng.
   - `agreeToCharge = false` → set `DISPUTED`, không tạo gì cả.
6. **`TenantPendingCharge` entity**: thêm `maintenanceRequestId` (Long, nullable) để tham chiếu ticket rõ ràng, thay vì chỉ dựa vào parse chuỗi `#id` trong `note` như cách cũ (fragile).

---

## 7. Thay đổi FE (mobile-app) — chi tiết theo từng file

Đã kiểm tra code thật: type `MaintenanceRequestDto`/`MaintenanceTicket` (`types/index.ts:165,177,260-262`) và `maintenanceMappers.ts:84,97,124-125` **đã có sẵn** `repairCost`/`costPaidBy`/`cause` — chỉ là chưa có UI nào render/gửi các field này (grep `TicketDetailScreen.tsx` ra 0 kết quả). Nghĩa là phần "đường ống" dữ liệu đã có sẵn 1 phần, chỉ cần nối UI + sửa 2 chỗ gọi API đang hardcode.

### 7.1 Manager — `screens/manager/TicketDetailScreen.tsx`
1. Thêm state mới: `costPaidBy` ('host'|'tenant'), `cause` ('wear'|'misuse'), `repairCostInput` (string), `equipmentPricing` (kết quả `realEquipmentService.getById(equipmentId)` khi ticket có `equipmentId`).
2. Khi manager chọn "Khách thuê chịu" và ticket có `equipmentId` → gọi `realEquipmentService.getById()` lấy `price/warrantyStartDate/warrantyEndDate/penaltyFee`, tính số gợi ý theo công thức §5, `setRepairCostInput(...)` (manager vẫn sửa tay được).
3. Thêm khối UI mới "💰 Chi phí & bên chịu trách nhiệm" — đặt cạnh khối ghi chú/ảnh AFTER hiện có, trước nút "Báo sửa xong".
4. Sửa lại lời gọi `realMaintenanceService.complete(idNum, {...})` (hiện tại chỉ gửi `resolutionNote`) — thêm `repairCost`, `costPaidBy`, `cause` khi `costPaidBy === 'tenant'`.
5. `maintenanceService.ts` — mở rộng `complete()`/`CompleteMaintenanceRequestDto` (hiện chỉ có `resolutionNote`, `afterImages`) thêm 3 field trên.

### 7.2 Tenant — `screens/tenant/MaintenanceDetailScreen.tsx`
1. Khối xác nhận chất lượng hiện có (dòng ~280-320, `waiting_confirm` + `rejectMode`) **giữ nguyên, không đụng**.
2. Thêm khối UI **tách riêng bên dưới**, chỉ hiện khi `request.costPaidBy === 'tenant' && request.repairCost` và cờ mới `costAgreementStatus === 'pending'` (BE trả thêm field này) — hiển thị số tiền + nguyên nhân, 2 nút "Đồng ý thanh toán" / "Khiếu nại" (bấm Khiếu nại mở ô nhập lý do, theo đúng pattern `rejectMode`/`rejectReason` đã có ở khối chất lượng).
3. Sửa `realMaintenanceService.confirm(idNum)` (hiện tại hardcode gửi `{ accept: true }`, `maintenanceService.ts:81-86`) — đổi thành nhận thêm body `{ agreeToCharge?: boolean; disputeReason?: string }` và truyền xuống.
4. Khi bấm "Đồng ý thanh toán": gọi `confirm(idNum, { agreeToCharge: true })`. Nếu BE trả kèm thông tin hoá đơn vừa tạo trong response → map qua `toSharedBill` và điều hướng thẳng `InvoiceDetailScreen` (nhận param `invoice: SharedBill`, xem `InvoiceDetailScreen.tsx:70`). Nếu BE **không** trả kèm (đơn giản hơn, đủ cho v1) → chỉ hiện alert "Đã tạo hoá đơn, xem ở tab Hoá đơn" rồi điều hướng về `InvoiceList` — khuyến nghị làm cách này trước, nâng cấp deep-link sau nếu cần mượt hơn.
5. Khi bấm "Khiếu nại": gọi `confirm(idNum, { agreeToCharge: false, disputeReason })` (ticket vẫn đóng bình thường theo §3, chỉ không tạo charge).

### 7.3 Types (`types/index.ts`)
- `CompleteMaintenanceRequestDto`: thêm `repairCost?`, `costPaidBy?`, `cause?`.
- Thêm `agreeToCharge?`, `disputeReason?` vào type body của `confirm()`.
- `MaintenanceRequestDto`/`MaintenanceTicket`: thêm `costAgreementStatus?: 'not_applicable' | 'pending' | 'agreed' | 'disputed'` (map từ enum mới bên BE).

### 7.4 Không cần đổi
- `equipmentService.ts` — `getById()` đã đủ dùng, không cần thêm hàm mới.
- Luồng reject/review-reject chất lượng sửa — không liên quan, giữ nguyên 100%.

---

## 8. Ngoài phạm vi v1 (cố tình không làm, tránh over-engineering)

- Không tự động ép thu tiền nếu khách im lặng không phản hồi bước đồng ý chi phí (khác việc tự đóng ticket sau 3 ngày cho phần chất lượng — cái đó không đụng vào).
- Không xây danh mục "hạng mục nhà" (tường/sàn/cửa...) có giá + khấu hao riêng như Equipment — sự cố không gắn thiết bị vẫn nhập tay (đã quyết định).
- Không xử lý ca "khách đã đồng ý, hoá đơn đã tạo, sau đó phát hiện sai" — coi như hoá đơn sai thông thường, xử lý thủ công.
- Không làm màn "danh sách khiếu nại chi phí" riêng cho manager ở v1 — manager tự theo dõi qua ticket có cờ DISPUTED, có thể bổ sung màn riêng ở phase sau nếu số lượng nhiều.
