# SETUP — Checklist cấu hình trước demo (FCM push + passcode override)

**Ngày:** 09/08/2026
**Người gửi:** team FE
**Người nhận:** team BE + người quản trị hạ tầng
**Liên quan:** `SETUP-push-notifications-2026-08-08.md`, `BE-NEED-mentor-demo-2026-08-08.md`

> Code hai bên **đã xong**. Doc này chỉ liệt kê phần **cấu hình runtime** còn thiếu.
> Thiếu bất kỳ mục nào ở đây thì tính năng im lặng không chạy, **không báo lỗi gì trên UI**
> — nên rất dễ tưởng là bug code.

---

## Phần 1 — Việc của FE / người giữ tài khoản Expo

Không cần BE. Ghi lại ở đây để cả nhóm biết trạng thái.

### 1.1. Nạp khoá FCM V1 lên EAS

Android nhận push qua FCM. Expo cần khoá dịch vụ của project Firebase mới đẩy được tin xuống máy.

1. [Firebase Console](https://console.firebase.google.com) → tạo project (hoặc dùng project sẵn có).
2. Add app → Android → package name **`com.pinkyusteam.sep`**
   (phải khớp `mobile-app/app.json` → `android.package`; sai một ký tự là không máy nào nhận tin).
3. Tải `google-services.json` → đặt vào `mobile-app/google-services.json`.
4. Khai vào `app.json`:
   ```json
   "android": {
     "package": "com.pinkyusteam.sep",
     "googleServicesFile": "./google-services.json"
   }
   ```
5. Firebase Console → ⚙️ Project settings → **Service accounts** → *Generate new private key*.
6. ```bash
   cd mobile-app
   eas credentials      # Android → preview + production → Google Service Account → FCM V1 → upload
   ```

> 🔒 **Không commit** `google-services.json` và khoá service account. Thêm vào `.gitignore`:
> ```
> google-services.json
> *-firebase-adminsdk-*.json
> ```

### 1.2. Build lại app

```bash
cd mobile-app
eas build -p android --profile preview
```

Bản APK hiện có **không dùng lại được** — nó build từ code có `EXPO_PUBLIC_EAS_PROJECT_ID` rỗng nên máy chưa bao giờ đăng ký được push token. Push cũng **không chạy trên Expo Go** (SDK 53 đã gỡ remote notification).

---

## Phần 2 — 🔴 VIỆC CỦA BE / DEVOPS: 2 biến môi trường

### 2.1. `MANAGER_OVERRIDE_PASSCODE` — **BẮT BUỘC, hiện chưa set**

`application.yaml` (dòng 130–133) đọc:

```yaml
manager:
  override:
    passcode: ${MANAGER_OVERRIDE_PASSCODE:}        # ⬅ mặc định RỖNG
    ttl-minutes: ${MANAGER_OVERRIDE_TTL_MINUTES:15}
```

Chưa set thì `POST /api/v1/manager/meter-override/verify` trả lỗi *"Chưa cấu hình MANAGER_OVERRIDE_PASSCODE"*, và **luồng đón khách tắc hoàn toàn khi manager không chụp được ảnh đồng hồ** — đúng kịch bản mentor yêu cầu phải xử lý (ý 5).

**Cách set trên server:**

```bash
# systemd
Environment="MANAGER_OVERRIDE_PASSCODE=<mã bí mật>"

# docker-compose
environment:
  MANAGER_OVERRIDE_PASSCODE: "<mã bí mật>"

# docker run
-e MANAGER_OVERRIDE_PASSCODE='<mã bí mật>'
```

Yêu cầu:
- **Không hardcode vào `application.yaml` rồi commit** — mã này mở đường ghi chỉ số không cần ảnh, lộ ra là vô hiệu hoá toàn bộ cơ chế chống bịa số.
- Đặt ≥ 8 ký tự, không dùng `123456` / `admin`.
- Chỉ admin giữ. Manager phải gọi xin từng lần.
- Sau demo nên đổi mã.

> BE đã có sẵn: token dùng-một-lần TTL 15 phút, khoá 5 phút sau 5 lần sai (`MAX_FAILS = 5`, `LOCK_MINUTES = 5` trong `MeterOverrideServiceImpl`), và bảng audit đọc qua `GET /api/v1/admin/meter-overrides`. Chỉ thiếu đúng biến env này.

### 2.2. `MANAGER_OVERRIDE_TTL_MINUTES` — tuỳ chọn

Mặc định 15 phút, không set cũng chạy. Demo mà thao tác chậm thì nâng lên 30.

---

## Phần 3 — Kiểm tra sau khi cấu hình xong

### 3.1. Passcode

```bash
curl -X POST https://slms-api.duckdns.org/api/v1/manager/meter-override/verify \
  -H "Authorization: Bearer <JWT của manager>" \
  -H "Content-Type: application/json" \
  -d '{"passcode":"<mã>","contractId":null,"meterKind":"ELEC"}'
```

| Kết quả | Nghĩa |
|---|---|
| `{"valid":true,"overrideToken":"...","expiresAt":"..."}` | ✅ xong |
| 403 `"Mã không đúng..."` | Sai mã |
| 429 | Đang bị khoá 5 phút (đã sai 5 lần) |
| 500 / *"Chưa cấu hình..."* | **Biến env chưa được nạp** — kiểm lại mục 2.1 |

Rồi kiểm audit: `GET /api/v1/admin/meter-overrides` phải thấy bản ghi kèm `managerId`, `reason`, `enteredValue`.

### 3.2. Push

```sql
-- sau khi đăng nhập trên máy demo
SELECT user_id, token, updated_at FROM user_push_tokens;
```

Phải thấy chuỗi `ExponentPushToken[...]`. Rồi bắn thử:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[...]","title":"Test","body":"Xin chào","data":{"type":"DEPOSIT_PAID_TENANT","screen":"InvoiceList"}}'
```

| `details.error` | Xử lý |
|---|---|
| `DeviceNotRegistered` | Token cũ — đăng nhập lại trên app |
| `InvalidCredentials` | **Chưa nạp khoá FCM** — làm lại mục 1.1 |
| `MessageTooBig` | Payload > 4KB, cắt bớt `data` |

### 3.3. Webhook PayOS

Đây là mắt xích **chưa ai chạy thử end-to-end**. Cần BE xác nhận:

- Webhook PayOS đã trỏ đúng về `POST /api/v1/payos/webhook` trên domain thật chưa?
- Chạy thử 1 lượt đón khách → khách trả tiền → kiểm:
  ```sql
  SELECT contract_code, payment_status, deposit_paid_at, deposit_method
  FROM tenant_contract WHERE id = <id>;

  SELECT code, status, grand_total, billing_period, note
  FROM tenant_invoice WHERE code = 'HD-ONBOARD-<id>';

  SELECT * FROM tenant_payment WHERE tenant_contract_id = <id>;

  SELECT type, title FROM notifications WHERE user_id IN (<tenant>, <manager>);
  ```
- Nếu local không nhận được webhook (không có domain public) thì BE cho FE biết cách gọi tay `completeDepositPayment` để test.

---

## Phần 4 — 🔴 Hai lỗi BE cần sửa (phát hiện 09/08/2026)

### 4.1. Doc BE ghi SAI đường dẫn — FE làm theo sẽ 404

`docs/BE-READY-for-FE-mentor-feedback-2026-08-08.md` mục §5 viết:

```http
GET /api/v1/manager/contracts?status=PENDING      ← KHÔNG TỒN TẠI
```

Đã quét toàn bộ `src/main/java`: **không có controller nào map `/manager/contracts`**. Route thật là:

```http
GET /api/v1/tenant-contracts/managed?status=PENDING
```

FE đã dùng đúng route thật nên không ảnh hưởng, nhưng nhờ sửa lại doc kẻo người sau làm theo.

### 4.2. Ý 15 (ẩn tiền khỏi manager) — CHƯA làm, và đang bị xếp nhầm phạm vi

Doc BE §11 ghi *"Ý 15 ẩn tiền manager (UI copy) | FE constants"*. Nhưng yêu cầu gốc ở
`BE-NEED-manager-money-visibility-2026-08-07.md` mục 3 là **BE phải null field**, vì:

> Ẩn ở FE chỉ là ẩn trên màn hình. Manager mở DevTools hoặc bắt gói là đọc được nguyên số tiền trong response JSON.

Code hiện tại — `ManagerBillingServiceImpl.toManagerInvoice()` dòng ~170:

```java
.amount(invoice.getGrandTotal())    // ⬅ trả vô điều kiện, không xét role
```

**Đề nghị:**

```java
boolean hideMoney = isManagerOnly(currentUser);   // MANAGER và KHÔNG phải ADMIN/OWNER
...
.amount(hideMoney && invoice.getInvoiceType() == TenantInvoiceType.RENT
        ? null : invoice.getGrandTotal())
```

⚠️ Chỉ null với `invoiceType = RENT`. Hoá đơn **điện/nước phải giữ nguyên số**, không thì màn ghi chỉ số của manager hỏng.

Áp cùng luật cho `GET /api/v1/manager/invoices/{id}` (endpoint mới) và `GET /api/v1/manager/payments`.

> Mục này thuộc phần việc của thành viên FE phụ trách trang thanh toán — ghi ở đây để BE không tưởng đã xong.

---

## Phần 5 — Checklist gọn

**FE / Expo**
- [ ] 1.1 Firebase project + `google-services.json` + nạp FCM V1 lên EAS
- [ ] 1.1 Thêm 2 dòng vào `.gitignore`
- [ ] 1.2 `eas build -p android --profile preview` + cài lại máy demo

**BE / DevOps**
- [ ] 2.1 Set `MANAGER_OVERRIDE_PASSCODE` trên server (**bắt buộc**)
- [ ] 2.2 (tuỳ chọn) `MANAGER_OVERRIDE_TTL_MINUTES`
- [ ] 3.3 Xác nhận webhook PayOS trỏ đúng domain thật
- [ ] 4.1 Sửa đường dẫn sai trong doc BE
- [ ] 4.2 Ẩn `amount` theo role ở `toManagerInvoice()`

**Chạy thử chung (sau khi xong 2 phần trên)**
- [ ] 3.1 Passcode trả `valid: true` + hiện trong audit
- [ ] 3.2 Push về được máy thật, bấm vào mở đúng màn
- [ ] 3.3 Một vòng đón khách đầy đủ: tạo HĐ → QR → trả tiền → hoá đơn `HD-ONBOARD-*` → push cả 2 phía → OTP → HĐ ACTIVE
