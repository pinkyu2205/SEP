# Luồng bảo trì chưa có socket/push cho role nào — cần BE bổ sung

**Ngày:** 03/09/2026
**Bối cảnh:** Được hỏi "luồng bảo trì đã có socket cho manager/tenant/admin chưa",
rồi "đã có notification ngoài app (push) chưa" — đã đọc lại source BE cho cả hai câu,
không đoán. Kết luận: **cả socket lẫn push đều CHƯA có cho luồng bảo trì**, ở mọi
role. Bằng chứng:

- `RealtimeEventService` (interface) chỉ có 3 method: `publishInvoicePaid`,
  `publishContractConfirmProgress`, `publishContractActivated` — không có method nào
  cho maintenance.
- `MaintenanceServiceImpl.java` **không inject** `RealtimeEventService` — grep toàn
  file ra 0 kết quả gọi nó.
- File này cũng không tạo dòng nào trong bảng `notifications` (grep
  `notificationService`/`createNotification` = 0 kết quả) — nên ngay cả kênh khay
  chuông (polling chung của web) cũng không có gì để báo cho module này.
- **`MaintenanceServiceImpl.java` cũng không gọi `PushNotificationService`** — grep
  0 kết quả. Trong khi `PushNotificationService.java` (Expo push, gọi thật tới
  `exp.host`) đã chạy production cho 4 chỗ khác: `TenantCheckoutServiceImpl`,
  `ExtensionRequestServiceImpl`, `TenantBillingServiceImpl`,
  `CheckoutProcessServiceImpl`/`CheckoutCronServiceImpl`.

Phạm vi doc này: **socket (mục 1-2) áp dụng cả 3 role, kể cả web admin** (web đã có
sẵn client STOMP y hệt mobile — xem đoạn dưới). Riêng **push (mục 3) chỉ áp dụng
mobile (manager, tenant)** — trình duyệt không nhận được Expo push nên không có phần
web admin ở mục đó, admin vẫn dựa vào socket + khay chuông sẵn có.

Trong khi đó billing/hợp đồng đã có sẵn hạ tầng đầy đủ: `WebSocketConfig` mở endpoint
`/ws` (STOMP thuần, không SockJS), auth bằng header `Authorization: Bearer` trong
frame `CONNECT`, đẩy theo user vào `/user/queue/billing`. Cả web
(`frontend-web/src/hooks/useBillingRealtime.ts`) lẫn mobile
(`mobile-app/src/hooks/useBillingRealtime.ts`) đều đã có client STOMP chạy sẵn, chỉ
là chưa nghe queue nào khác ngoài billing.

**Đề xuất: tái dùng đúng hạ tầng đó cho maintenance**, không dựng kết nối/kênh mới từ
đầu — vừa nhanh vừa nhất quán với cách 2 event hợp đồng đã làm (dùng chung
`/user/queue/billing` với lý do nêu rõ trong comment: "thêm hook là thêm một
WebSocket connection thứ hai cho cùng một luồng dữ liệu").

---

## 1. Thêm method vào `RealtimeEventService` + queue mới `/user/queue/maintenance`

```java
void publishMaintenanceEvent(MaintenanceRequest request, String eventType);
```

Push vào `/user/queue/maintenance` (queue riêng, KHÔNG gộp vào `/user/queue/billing`
để hai loại event không lẫn nhau) — nhưng qua **cùng một kết nối STOMP** đã có sẵn.
Phía FE chỉ cần `client.subscribe('/user/queue/maintenance', ...)` thêm trong đúng
`onConnect` đang có của `useBillingRealtime`, không mở `new Client(...)` thứ hai.

Payload đề xuất (giống hệt tinh thần `BillingRealtimeEvent` — đủ để FE tự quyết định
`refetch` hay patch UI, không cần gánh toàn bộ entity):

```json
{
  "event": "MAINTENANCE_UPDATED",
  "requestId": 123,
  "requestCode": "M-123",
  "status": "IN_REPAIR",
  "propertyId": 45,
  "propertyName": "MTX#01 ...",
  "roomId": 7,
  "roomNumber": "P101",
  "tenantUserId": "uuid...",
  "assignedManagerId": "uuid...",
  "adminApproved": null
}
```

## 2. Danh sách điểm cần gọi `publishMaintenanceEvent` — theo từng endpoint đã có

Tất cả các method dưới đây trong `MaintenanceServiceImpl.java` đổi trạng thái/ghi
quyết định nhưng hiện chưa báo cho ai — mỗi chỗ gọi thêm 1 dòng `publish` sau khi
`repository.save()` thành công (như `TenantBillingServiceImpl` đang làm cho invoice):

| Endpoint | Method | Ai cần nhận |
|---|---|---|
| `POST /maintenance` | `createRequest` | Manager phụ trách nhà đó (chưa có `assignedManagerId` thì gửi hết manager đang coi nhà) — để `MaintenanceManagerScreen` "Hàng đợi xử lý" tự cập nhật, không cần vào lại màn |
| `PUT /{id}/approve` | `approve` | Tenant (ticket chuyển `IN_REPAIR`) |
| `PUT /{id}/reject-fault` | `rejectFault` (luồng cũ) | Tenant |
| `PUT /{id}/report-fault` | `reportFault` | **Admin** (đây là chỗ quan trọng nhất — trang `MaintenanceFaultReview.tsx` web hiện chỉ có nút "Làm mới" thủ công, không tự cập nhật khi có báo cáo mới) + Tenant (thấy "⏳ Đang chờ admin duyệt") |
| `PUT /{id}/admin-review` | `adminReviewFault` | Manager (để `TicketDetailScreen` hiện "✅ Admin đã duyệt/❌ Không duyệt" ngay, không cần vào lại) |
| `PUT /{id}/submit-self-repair` | `submitSelfRepairJson`/`Multipart` | Manager (cần verify-repair) |
| `PUT /{id}/verify-repair` | `verifyRepair` | Tenant |
| `PUT /{id}/complete` | `complete` | Tenant |
| `PUT /{id}/cancel` | `cancel` | Bên còn lại (tenant huỷ → báo manager; manager huỷ → báo tenant) |

Nếu BE thấy làm hết 9 điểm một lúc quá nhiều, ưu tiên **2 dòng đầu tiên có giá trị
cao nhất**: `report-fault` (báo admin) và `createRequest` (báo manager) — đúng 2 màn
vừa sửa UI hôm nay (`MaintenanceFaultReview.tsx`, `MaintenanceManagerScreen.tsx`) mà
hiện đang phải tự bấm "Làm mới"/thoát vào lại mới thấy dữ liệu mới.

## 3. Push notification (Expo) — mobile manager/tenant

`PushNotificationService`/`UserPushTokenService` đã có sẵn, chỉ cần
`MaintenanceServiceImpl` gọi tới — không phải xây gì mới. Có 2 cách:

**(a) Gọi thẳng `UserPushTokenService.sendToUser(userId, title, body, data)`** — fan-out
mọi thiết bị của user (đúng bảng `user_push_tokens` nhiều máy/tài khoản), không cần tự
tra token.

**(b) Copy pattern `sendNotification(...)` đang có trong
`ExtensionRequestServiceImpl.java` (dòng 306-334)** — helper này làm MỘT LẦN cả 2 việc:
lưu 1 dòng vào bảng `notifications` (`Notification.builder()...`) **và** gửi Expo push.
**Khuyến nghị dùng cách (b)**, vì lưu thêm dòng `notifications` giải quyết luôn khoảng
trống đã nêu ở phần Bối cảnh (module này chưa từng ghi gì vào bảng đó) — tự động có
luôn: mobile `NotificationCenterScreen.tsx` (manager) và `TenantNotificationScreen.tsx`
(tenant) đều đọc từ `/notifications` (`realNotificationService.list()`), nên thêm 1 chỗ
ghi là 2 màn này có dữ liệu ngay, không cần đụng gì bên FE.

⚠️ Pattern (b) hiện dùng `u.getPushToken()` (field đơn lẻ, cũ) thay vì
`UserPushTokenService.sendToUser()` (nhiều thiết bị) — nếu copy sang cho maintenance,
nên đổi qua gọi `userPushTokenService.sendToUser(...)` luôn để user đăng nhập 2 máy vẫn
nhận đủ, khỏi phải sửa lại lần hai.

**Payload `data` — khớp đúng cái FE đã dựng sẵn, không cần đổi field:**

`mobile-app/src/navigation/navigationRef.ts` đã có logic: `type` chứa chuỗi
`"MAINTENANCE"` thì tự điều hướng đúng tab (`ManagerMaintenance` cho manager,
`MaintenanceList` cho tenant) — comment trong `notifications.ts` còn ghi sẵn ví dụ
`type: 'maintenance_new'`. Để mở thẳng đúng phiếu (không chỉ đúng tab), gửi kèm
`params`:

```json
{
  "type": "MAINTENANCE_FAULT_REPORTED",
  "screen": "MaintenanceTicketDetail",
  "params": { "ticketId": "123" }
}
```

- Manager (`TicketDetailScreen.tsx`) nhận route `{ ticketId }` — dùng đúng `screen`
  trên.
- Tenant (`MaintenanceDetailScreen.tsx`) nhận `{ requestId }` (hoặc `{ request }` nếu
  vào từ danh sách) — `screen: "MaintenanceDetail"`, `params: { requestId }`.

Danh sách `type` đề xuất theo từng điểm ở bảng mục 2 (dùng lại đúng cột "Ai cần nhận"):
`MAINTENANCE_NEW`, `MAINTENANCE_APPROVED`, `MAINTENANCE_FAULT_REPORTED`,
`MAINTENANCE_ADMIN_REVIEWED`, `MAINTENANCE_SELF_REPAIR_SUBMITTED`,
`MAINTENANCE_VERIFIED`, `MAINTENANCE_COMPLETED`, `MAINTENANCE_CANCELLED`. Tiêu đề/nội
dung (`title`/`content`) do BE viết tự nhiên bằng tiếng Việt, không cần theo khuôn nào
— chỉ `type`/`screen`/`params` là phần FE thực sự đọc để điều hướng.

## 4. Lưu ý rủi ro CÓ SẴN, không phải lỗi mới sinh ra (riêng phần socket)

Comment trong cả 2 file `useBillingRealtime.ts` (web + mobile) đang ghi: nginx trên
VPS từng không chuyển tiếp header `Upgrade` nên STOMP **chưa từng kết nối được ở môi
trường deploy thật** — client cứ retry mỗi 5s trong im lặng, toàn bộ realtime billing
hiện tại (nếu đang chạy) nhiều khả năng đang sống nhờ lớp poll dự phòng (20s) chứ
không phải WebSocket thật. Nếu đúng vậy thì thêm event maintenance cũng sẽ dính đúng
tình trạng đó — không phải lỗi riêng của tính năng mới, nhưng nên BE xác nhận lại
cấu hình nginx trước/cùng lúc để cả 2 tính năng (billing + maintenance) cùng hưởng.

---

## Tình trạng phía FE

- **Chưa sửa gì** ở `useBillingRealtime.ts` (cả web + mobile) hay bất kỳ màn bảo trì
  nào — chờ BE xác nhận tên event/queue/payload ở mục 1-2 trước, tránh viết rồi phải
  sửa lại nếu contract đổi giữa chừng (bài học từ các lần trước).
- Khi BE xác nhận xong, việc FE cần làm ở phần socket là nhỏ: thêm 1 dòng `subscribe`
  vào `onConnect` sẵn có của `useBillingRealtime` (hoặc tách hook
  `useMaintenanceRealtime` dùng chung client singleton) rồi gọi `refetch` đúng màn đang
  có sẵn (`load()` của `MaintenanceManagerScreen`, `MaintenanceFaultReview`,
  `TicketDetailScreen`, `MaintenanceHistoryScreen`, `MaintenanceDetailScreen`) — không
  cần đổi UI.
- **Phần push (mục 3) thì FE không cần sửa gì cả** — routing theo `type` chứa
  "MAINTENANCE" và đọc `/notifications` đã có sẵn từ trước, chỉ cần BE gửi đúng
  payload là chạy được ngay.
