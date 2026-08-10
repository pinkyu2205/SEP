# SETUP — Bật thông báo đẩy (push notification) cho mobile app

**Ngày:** 08/08/2026
**Trạng thái:** code FE đã xong; còn 2 việc cấu hình phải làm bằng tay (mục 3 và 4).

---

## 1. Kết luận sau khi kiểm tra

Đường ống push **đã được nối đầy đủ từ trước**, không thiếu code:

| Mắt xích | File | Trạng thái |
|---|---|---|
| Xin quyền + lấy Expo push token | `src/services/core/pushToken.ts` → `getExpoToken()` | ✅ |
| Gửi token lên BE sau đăng nhập | `src/hooks/useAuth.tsx:110, 236` → `registerPushToken()` | ✅ |
| Gỡ token lúc đăng xuất | `useAuth.tsx:76, 294` → `unregisterPushToken()` | ⚠️ BE chưa có endpoint DELETE |
| Kênh thông báo Android | `notifications.ts` → `setupAndroidChannel()` | ✅ |
| Hiện banner khi app đang mở | `notifications.ts` → `setNotificationHandler` | ✅ |
| Bấm thông báo → mở đúng màn | `RootNavigator.tsx:82-83` → `navigateFromNotification` | ✅ |
| App tắt hẳn, mở bằng thông báo | `RootNavigator.tsx:83` → `handleInitialNotification` | ✅ |
| BE gửi push qua Expo | `PushNotificationService.java` → `https://exp.host/--/api/v2/push/send` | ✅ |

**Vậy tại sao chưa có thông báo nào về máy?** Vì một dòng cấu hình.

---

## 2. Lỗi thật: `EAS_PROJECT_ID` luôn rỗng → không máy nào từng đăng ký token

`mobile-app/.env` dòng 22:

```properties
EXPO_PUBLIC_EAS_PROJECT_ID=
```

Để trống. Mà `src/constants/api.ts` trước đây chỉ đọc đúng biến này:

```ts
EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
```

`getExpoToken()` gặp giá trị rỗng là thoát ngay (`pushToken.ts:31-35`), in warning rồi `return null` → `registerPushToken()` không gọi API → BE **không có token của bất kỳ ai** → mọi lệnh gửi push đều rơi vào `if (token == null || token.isBlank()) return;`.

Trong khi đó `app.json` đã có sẵn id từ lúc chạy `eas init`:

```json
"extra": { "eas": { "projectId": "accd0c29-d1f8-4dd5-90b6-ee372d65932a" } }
```

### ✅ Đã sửa

`src/constants/api.ts` giờ đọc `app.json` làm nguồn mặc định, env chỉ để ghi đè:

```ts
EAS_PROJECT_ID:
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  (Constants.expoConfig?.extra as any)?.eas?.projectId ||
  (Constants as any).easConfig?.projectId ||
  '',
```

Sửa kiểu này thay vì điền vào `.env` vì `eas.json` (cả 3 profile `development`/`preview`/`production`) cũng **không** khai biến đó — điền `.env` thì chỉ chạy trên máy dev, build EAS vẫn hỏng.

---

## 3. ⚠️ VIỆC PHẢI LÀM TAY #1 — nạp khoá FCM lên EAS

Đây là mắt xích cuối cùng và **không ai làm hộ được**, phải có tài khoản Firebase + Expo của nhóm.

Android nhận push qua FCM. Expo cần khoá dịch vụ FCM V1 của project để đẩy tin xuống máy. Chưa nạp thì `getExpoPushTokenAsync()` có thể vẫn trả token, nhưng Expo trả lỗi `InvalidCredentials` lúc gửi — im lặng, không báo gì trên app.

Repo hiện **không có** `google-services.json` (đã kiểm `mobile-app/` và `mobile-app/android/app/`).

### Các bước

1. Vào [Firebase Console](https://console.firebase.google.com) → tạo project (hoặc dùng project sẵn có của nhóm).
2. Add app → Android → package name **`com.pinkyusteam.sep`** (phải khớp `app.json` → `android.package`, sai một ký tự là không nhận được tin nào).
3. Tải `google-services.json` → đặt vào `mobile-app/google-services.json`.
4. Khai vào `app.json`:
   ```json
   "android": {
     "package": "com.pinkyusteam.sep",
     "googleServicesFile": "./google-services.json",
     ...
   }
   ```
5. Firebase Console → ⚙️ Project settings → **Service accounts** → *Generate new private key* → tải file JSON.
6. Nạp lên EAS:
   ```bash
   cd mobile-app
   eas credentials
   # → Android → production (và preview) → Google Service Account → FCM V1 → upload file JSON vừa tải
   ```

> 🔒 File `google-services.json` và khoá service account **không được commit**. `.gitignore` hiện chưa chặn — thêm 2 dòng:
> ```
> google-services.json
> *-firebase-adminsdk-*.json
> ```

---

## 4. ⚠️ VIỆC PHẢI LÀM TAY #2 — build lại app

Push **không chạy trên Expo Go** (SDK 53 đã gỡ remote notification — chính vì vậy `notifications.ts` mới phải lazy-require để tránh spam log). Cũng không chạy trên emulator, phải máy thật.

Dự án đã có `expo-dev-client` nên chỉ cần build lại:

```bash
cd mobile-app
eas build -p android --profile preview      # ra file .apk cài thẳng vào máy demo
```

Bản build hiện có trên máy **không dùng lại được** — nó được build từ code có `EAS_PROJECT_ID` rỗng.

### Khuyến nghị thêm vào `app.json` (cần build lại, nên gộp luôn lượt này)

```json
"plugins": [
  "expo-font",
  ["expo-notifications", {
    "icon": "./assets/icon.png",
    "color": "#4F46E5"
  }]
]
```

Không bắt buộc — thiếu thì Android hiện icon trắng mặc định thay vì logo app.

---

## 5. Cách kiểm tra sau khi build xong

**Bước 1 — máy có lấy được token không.** Đăng nhập trên app rồi xem log Metro. Không còn dòng `[push] Thiếu EXPO_PUBLIC_EAS_PROJECT_ID` là đã qua.

**Bước 2 — BE có nhận token không.** Kiểm DB:

```sql
SELECT username, push_token FROM users WHERE push_token IS NOT NULL;
```

Phải thấy chuỗi dạng `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`.

**Bước 3 — bắn thử không cần BE.** Lấy token ở bước 2 rồi:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[...]","title":"Test","body":"Xin chào","data":{"screen":"InvoiceList"}}'
```

Máy phải rung ngay. Bấm vào tin phải nhảy đúng màn Hoá đơn (kiểm luôn `navigateFromNotification`).

Nếu response trả `"status":"error"`:

| `details.error` | Nghĩa | Xử lý |
|---|---|---|
| `DeviceNotRegistered` | Token cũ / app đã gỡ | Đăng nhập lại để lấy token mới |
| `InvalidCredentials` | Chưa nạp khoá FCM | Làm lại mục 3 |
| `MessageTooBig` | Payload > 4KB | Cắt bớt `data` |

**Bước 4 — thử từ BE.** Tạo 1 yêu cầu bảo trì (`MaintenanceServiceImpl` đã có sẵn lệnh gửi push) và xem tin có về không.

---

## 6. Còn thiếu ở phía BE

Xem `BE-NEED-mentor-demo-2026-08-08.md` mục 4:

- **4.1** `DELETE /api/v1/user/me/push-token` — FE đã gọi, BE chưa có → logout không gỡ được token.
- **4.2** Push khi cọc được ghi nhận — `markDepositPaid()` đang im lặng hoàn toàn. Đây là ý mentor số 10 và 12.
- **4.3** `User.pushToken` là `String` đơn → 1 tài khoản chỉ nhận được trên 1 máy.

---

## 7. Danh sách thông báo dự kiến

Lưu ý: các type `RENT_*` (nhắc tiền phòng kỳ đầu và tháng thường) **do bạn FE bên kia đặc tả** ở
`BE-HANDOFF-first-cycle-reminder-2026-08-07.md` và `BE-HANDOFF-rent-reminder-schedule-2026-08-07.md`.
Bảng dưới chỉ liệt kê phần **chưa ai nhận**:

| Type | Người nhận | Khi nào | Màn mở |
|---|---|---|---|
| `DEPOSIT_PAID_TENANT` | tenant | PayOS xác nhận tiền onboard | `InvoiceList` |
| `DEPOSIT_PAID_MANAGER` | manager | PayOS xác nhận tiền onboard | `ResumeContract` |
| `CONTRACT_ACTIVATED` | tenant | OTP xong, HĐ chuyển ACTIVE | `ContractDetail` |
| `PRICE_APPROVAL_RESULT` | manager | host duyệt/từ chối giá | `ResumeContract` |

> Nhắc lại chính sách ẩn tiền (ý mentor số 15): tin gửi **manager** không được chứa số tiền; tin gửi **tenant** thì phải có.
