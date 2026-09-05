# Lịch hẹn bảo trì (đặt lịch xem/sửa, chống trùng lịch, tự huỷ) — cần BE bổ sung

**Ngày:** 05/09/2026
**Bối cảnh:** Redesign lại luồng bảo trì để tenant hẹn ngày giờ cho manager tới xem
thiết bị hỏng, manager xác nhận có mặt/bắt đầu sửa bằng quét QR (chặn ở phía app, xem
mục 5 — **không cần BE validate lại việc quét**), và sau khi xác định thiết bị hỏng
thật thì manager chọn sửa ngay hoặc đặt lịch hẹn sửa sau (có xem lịch tránh trùng).

Đã đọc lại toàn bộ `MaintenanceRequest`/`MaintenanceStatus`/`MaintenanceController`/
`MaintenanceServiceImpl` và grep rộng cả repo cho các từ khoá "appointment/booking/
calendar/slot/conflict/overlap" — **kết luận chắc chắn: không có field ngày-giờ hẹn
nào, và không có logic chống trùng lịch ở bất kỳ đâu trong toàn bộ codebase** (không
riêng module bảo trì — kiểm cả onboarding, hợp đồng, xem nhà). Có vài DTO chết
(`MaintenanceScheduleRequest{scheduledSlots: List<String>}`, `MaintenanceConfirmScheduleRequest{slot: String}`,
`MaintenanceAcknowledgeRequest`) — dấu vết một lần thử làm lịch hẹn trước đây nhưng
chưa từng nối vào controller/service nào, dùng `String` cho "slot" chứ không phải
datetime thật. Ngược lại, phần chi phí sửa chữa (hao mòn công ty trả / khách làm hư
khách trả) và QR thanh toán PayOS cho hoá đơn bảo trì thì **đã chạy đầy đủ** — không
xin gì thêm ở phần đó trong doc này.

---

## 1. Model dữ liệu mới

### 1.1. Cột mới trên `MaintenanceRequest`

Đề xuất thêm thẳng vào entity hiện có (không tách bảng riêng — chỉ đúng 2 mốc hẹn/
phiếu, không phải danh sách mở; lịch sử đổi giờ ghi lại bằng `MaintenanceTimeline`
sẵn có, tạo 1 timeline entry cùng-status kèm ghi chú, y như các thao tác khác đang
làm):

| Field | Kiểu | Set lúc nào |
|---|---|---|
| `visitAppointmentAt` | `LocalDateTime` | tạo phiếu, hoặc đổi lịch hẹn xem |
| `visitArrivalConfirmedAt` | `LocalDateTime` | manager quét QR xác nhận có mặt |
| `repairAppointmentAt` | `LocalDateTime` | lúc duyệt/báo lỗi, nếu manager chọn "đặt lịch sau" |
| `repairStartedAt` | `LocalDateTime` | manager quét QR bắt đầu sửa |

### 1.2. Status mới: `REPAIR_SCHEDULED`

Thêm vào enum `MaintenanceStatus` (7 giá trị hiện có: `OPEN, IN_REPAIR, TENANT_FAULT,
PENDING_TENANT_REPAIR, OUTSTANDING_DAMAGE, CLOSED, CANCELLED`) — dùng chung cho CẢ 2
luồng (hao mòn / lỗi khách) làm "phòng chờ" giữa lúc manager đánh giá xong và lúc thật
sự sửa, chỉ khi chọn "đặt lịch sau" thay vì "sửa ngay":

```
OPEN (đã có visitAppointmentAt)
  --tự huỷ (quá 2h kể từ visitAppointmentAt, chưa xác nhận có mặt)--> CANCELLED
  --quét QR xác nhận có mặt (app-side, xem mục 5)--> OPEN (không đổi status, chỉ ghi mốc thời gian)
    --duyệt (/approve), "sửa ngay" (không kèm repairAppointmentAt)-------> IN_REPAIR --> CLOSED
    --duyệt (/approve), "đặt lịch sau" (kèm repairAppointmentAt)--------> REPAIR_SCHEDULED
        --quét QR bắt đầu sửa (/start-repair)---------------------------> IN_REPAIR --> CLOSED
    --báo lỗi khách (/reject-fault, resolutionPath=MANAGER_REPAIR),
      "sửa ngay"------------------------------------------------------> TENANT_FAULT --> CLOSED
    --báo lỗi khách, "đặt lịch sau" (kèm repairAppointmentAt)-----------> REPAIR_SCHEDULED
        --quét QR bắt đầu sửa--------------------------------------------> TENANT_FAULT --> CLOSED
    --xác định KHÔNG hỏng thật (/cancel, không đổi)---------------------> CANCELLED
OPEN --/cancel (tenant hoặc manager, không đổi)--> CANCELLED
REPAIR_SCHEDULED --/cancel (không đổi)--> CANCELLED
```

`start-repair` chuyển tới `IN_REPAIR` hay `TENANT_FAULT` tuỳ `flowType` đã lưu sẵn
(`NORMAL_WEAR`/`TENANT_FAULT`) — khớp đúng cách `complete()` hiện tại đang phân biệt 2
luồng này. `complete()` **không đổi gì** — vẫn chỉ nhận từ `IN_REPAIR` hoặc
`TENANT_FAULT`(+`MANAGER_REPAIR`) như hiện tại.

---

## 2. Endpoint mới / mở rộng

| Endpoint | Trạng thái | Nội dung |
|---|---|---|
| `POST /maintenance` | mở rộng | thêm `visitAppointmentAt` (bắt buộc từ giờ trở đi) — validate giờ hành chính + tương lai + không trùng lịch (mục 3) |
| `PUT /{id}/reschedule-visit` | **mới** | body `{visitAppointmentAt}` — chỉ khi `OPEN`, chưa xác nhận có mặt, còn trước ngày hẹn |
| `PUT /{id}/confirm-arrival` | **mới** | manager, không cần body — chỉ ghi `visitArrivalConfirmedAt`, **không đổi status** |
| `PUT /{id}/approve` | mở rộng | thêm `repairAppointmentAt` (tuỳ chọn); thêm điều kiện phải có `visitArrivalConfirmedAt` trước khi duyệt (bỏ qua điều kiện này với phiếu cũ `visitAppointmentAt == null`, xem mục 6) |
| `PUT /{id}/reject-fault` | mở rộng | thêm `repairAppointmentAt` (tuỳ chọn, chỉ có ý nghĩa khi `resolutionPath=MANAGER_REPAIR`); cùng điều kiện `visitArrivalConfirmedAt` |
| `PUT /{id}/reschedule-repair` | **mới** | body `{repairAppointmentAt}` — chỉ khi `REPAIR_SCHEDULED`, còn trước ngày hẹn, **manager-only** (tenant không tự đổi lịch sửa, chỉ trao đổi qua manager) |
| `PUT /{id}/start-repair` | **mới** | không cần body — chỉ khi `REPAIR_SCHEDULED`; chuyển `IN_REPAIR`/`TENANT_FAULT` tuỳ `flowType`, ghi `repairStartedAt` |
| `GET /maintenance/manager-availability` | **mới** | query `propertyId` (hoặc `managerId`, mặc định user hiện tại) + `from`/`to` — trả các khung giờ đã bận (`VISIT`/`REPAIR`) để FE biết chỗ nào trống |
| `PUT /{id}/cancel` | **không đổi** | dùng lại y nguyên cho huỷ-trước-ngày, huỷ-trong-ngày, và huỷ-vì-không-hỏng-thật |

### Response đề xuất cho `GET /manager-availability`

```json
[
  { "requestId": 123, "requestCode": "M-123", "type": "VISIT",  "start": "2026-09-10T09:00:00", "end": "2026-09-10T09:30:00", "propertyName": "...", "roomNumber": "P101" },
  { "requestId": 124, "requestCode": "M-124", "type": "REPAIR", "start": "2026-09-11T14:00:00", "end": "2026-09-11T15:00:00", "propertyName": "...", "roomNumber": "P203" }
]
```

Khi gọi bằng `propertyId`, BE tự suy ra manager qua `property.operationManagerId` —
tenant không cần biết UUID manager. Chỉ trả các phiếu đang active (loại `CLOSED`/
`CANCELLED`). `end = start + độ dài slot cố định` (server tự tính, không để FE gửi).

---

## 3. Validate phía BE (áp dụng dù gate quét QR chỉ chặn phía app — xem mục 5)

- **Giờ hành chính 7h-18h** — kiểm tra cả giờ **kết thúc** slot, không chỉ giờ bắt
  đầu (tránh phiếu sửa 60 phút đặt lúc 17h30 tràn qua 18h).
- **Không trùng lịch**: slot mới `[start, start+độ_dài)` không được đè lên bất kỳ slot
  visit/repair nào khác đang active của cùng 1 manager.
- **Đổi lịch hẹn** (visit hoặc repair) chỉ được khi **còn trước ngày hẹn** — so
  `LocalDate.now()` (giờ VN) với ngày của `appointmentAt`. Đúng ngày hẹn rồi thì chỉ
  còn huỷ được (dùng `/cancel` sẵn có), không đổi giờ được nữa.
- **Độ dài slot mặc định — đề xuất 30 phút cho visit, 60 phút cho repair** (số đề
  xuất để chốt được logic chống trùng, mong BE xác nhận lại hoặc điều chỉnh).
- **Nhà chưa gán `operationManagerId`** (đã xác nhận có xảy ra thật, xem code
  `notifyPropertyManager` đang tự fan-out khi null) → chặn tạo phiếu có hẹn với lỗi rõ
  ràng, không tự ý chọn đại 1 manager để tính lịch.

---

## 4. Cron tự huỷ sau 2 tiếng

Theo đúng mẫu cron tự huỷ tự-sửa-quá-hạn đã có sẵn trong `MaintenanceServiceImpl`
(chạy hằng ngày) — cron mới cần chạy dày hơn vì ngưỡng chỉ 2 tiếng:

```java
@Scheduled(cron = "0 */10 * * * *", zone = "Asia/Ho_Chi_Minh")
@Transactional
public void autoCancelNoShowVisitsTask() { ... }
```

Điều kiện: `status = OPEN`, `visitAppointmentAt` đã qua **hơn 2 tiếng**, và
`visitArrivalConfirmedAt` vẫn `null` → chuyển `CANCELLED`, ghi timeline "Tự động huỷ —
quá 2 giờ chưa xác nhận có mặt", báo cả tenant lẫn manager (khay chuông + push, đúng
pattern `saveAndPush` đã có).

**Đề xuất KHÔNG làm tương tự cho lịch sửa (`REPAIR_SCHEDULED`)** — không nằm trong yêu
cầu ban đầu, để version sau nếu thực sự cần, tránh phình thêm cron.

---

## 5. Gate quét QR — chỉ chặn phía app, KHÔNG cần BE validate lại

Cả 2 chỗ (manager quét QR xác nhận có mặt trước khi vào màn đánh giá; quét QR lần nữa
trước khi vào "Đang sửa chữa") đều là app tự so khớp `equipmentId` quét được với
`equipmentId` của phiếu, và chỉ cho điều hướng tiếp khi khớp — **không cần BE thêm
tham số hay validate gì cho việc quét**. `confirm-arrival`/`start-repair` ở mục 2 vẫn
gọi bình thường như mọi endpoint khác, BE không cần biết app đã quét QR hay chưa.

Lưu ý: phiếu **không gắn thiết bị** (được phép hiện nay — `equipmentId` optional khi
tenant chọn danh mục kết cấu/điện/nước) thì app sẽ tự chuyển sang nút xác nhận thường,
không bắt quét — hai endpoint `confirm-arrival`/`start-repair` cần hoạt động bình
thường cho cả trường hợp này, không giả định luôn có `equipmentId`.

---

## 6. Realtime — 1 event mới, dùng lại hạ tầng đã có

Thêm 1 constant vào `RealtimeEventService` (đã có sẵn `EVT_MAINTENANCE_*`, xem doc
`BE-YEUCAU-realtime-socket-luong-bao-tri-2026-09-03.md`):

```java
String EVT_MAINTENANCE_SCHEDULE_CHANGED = "MAINTENANCE_SCHEDULE_CHANGED";
```

Bắn cùng `/user/queue/maintenance` (không mở kênh mới) ở mọi chỗ đổi lịch hẹn: tạo
phiếu có hẹn, đổi lịch, xác nhận có mặt, đặt lịch sửa, bắt đầu sửa, cron tự huỷ — gửi
cho cả tenant của phiếu lẫn manager phụ trách nhà đó. Thêm 2 field tuỳ chọn vào payload
`MaintenanceRealtimeEvent`: `visitAppointmentAt?`, `repairAppointmentAt?`.

**Không cần dựng kênh "chống trùng lịch trực tiếp"**: tenant đang CHỌN GIỜ để TẠO
phiếu mới thì chưa có `requestId` để route theo (chưa thuộc phiếu nào) — màn chọn giờ
chỉ cần gọi `GET /manager-availability` lúc mở + tự làm mới mỗi ~20-30 giây (interval
thường). Chống trùng THẬT SỰ nằm ở validate lúc submit (mục 3) — đụng lịch thì trả lỗi
409, tenant chọn giờ khác, như mọi luồng đặt chỗ thông thường. Nơi event mới thật sự
có giá trị: màn calendar của manager (xem lịch sửa đã đặt) tự cập nhật khi có phiếu
khác vừa đặt/đổi/huỷ lịch trong lúc đang mở xem.

---

## 7. Di trú (migration) — phiếu cũ đang chạy dở

Phiếu tạo trước khi field mới được deploy sẽ có `visitAppointmentAt = null`. Điều kiện
mới "`/approve`/`/reject-fault` phải có `visitArrivalConfirmedAt` trước" **phải tự
động bỏ qua** cho các phiếu này (kiểm `visitAppointmentAt == null` thì coi như đã qua
bước xác nhận), không thì mọi phiếu đang mở lúc chuyển đổi sẽ bị kẹt không duyệt được.

---

## Câu hỏi cần BE xác nhận lại (đề xuất ở trên, không tự quyết định thay)

1. Độ dài slot mặc định 30 phút (visit) / 60 phút (repair) — đúng số hay cần đổi?
2. Lịch sửa (`REPAIR_SCHEDULED`) có cần tự huỷ nếu quá hạn không tới không, hay để
   manager tự xử lý thủ công (đề xuất: không làm ở đợt này)?
3. Tenant có được tự đổi/huỷ lịch **sửa** (khác lịch hẹn xem ban đầu) không, hay chỉ
   manager mới đổi được (đề xuất: chỉ manager, tenant liên hệ qua manager)?
4. `GET /{id}` (gọi lại khi tenant mở app từ push, không phải ngay sau `complete()`) có
   luôn trả `issuedInvoice` mỗi khi `billingHint = TENANT_CHARGE_PENDING` và hoá đơn
   chưa thanh toán không? (Câu này không liên quan lịch hẹn — hỏi luôn vì đang cần xác
   nhận để ship chắc chắn thẻ thanh toán mới ở phía FE, tránh trường hợp field chỉ có
   nhất thời ngay sau lúc complete() rồi biến mất ở các lần gọi sau.)

---

## Tình trạng phía FE

- **Chưa sửa gì** cho phần đặt lịch/calendar/quét QR — chờ BE xác nhận contract ở trên
  trước, tránh viết rồi phải sửa lại (bài học từ nhiều lần trước trong dự án này).
- **Đã làm ngay, không chờ BE** (không phụ thuộc gì ở doc này): mặc định mức ưu tiên
  lúc duyệt là "Thấp", và thêm thẻ "Cần thanh toán" hiện hoá đơn + QR PayOS cho tenant
  khi họ thực sự bị tính phí sửa chữa (dữ liệu này BE đã có sẵn từ trước).
- Khi BE xác nhận xong contract ở trên, FE sẽ triển khai theo đúng thứ tự: types/
  service layer → màn chọn giờ hẹn của tenant → đổi lịch/huỷ → màn quét QR xác nhận có
  mặt của manager → quyết định sửa ngay/đặt lịch sau + calendar → quét QR lần 2 trước
  "Đang sửa chữa".
