# BE NEED — Phần còn lại, cập nhật sau commit `f465f7b`

**Ngày:** 10/08/2026 (bản rút gọn, thay cho `BE-NEED-vision-labels-align-2026-08-10.md`)
**Người gửi:** team FE (mobile)

Hai việc Vision đã xong ở `f465f7b` — cảm ơn:

- ✅ `labels.txt`: `light` → `light fixture` (FE đã test lại, ảnh đèn hết bị chặn oan)
- ✅ `rate-limit-per-hour: ${VISION_RATE_LIMIT_PER_HOUR:20}`

Dưới đây là **toàn bộ phần còn lại**. Mục 1, 1b, 1c, 2 là chặn demo — riêng **1c là lỗi code**, ba mục kia chỉ là biến môi trường và xác nhận cấu hình.

---

## 1. 🔴 Xác nhận env trên server — không phải sửa code

`application.yaml` để mặc định rỗng là **đúng** (`${MANAGER_OVERRIDE_PASSCODE:}` ở dòng 149), đừng hardcode vào file rồi commit — mã này bỏ qua chốt chống khai khống chỉ số điện nước, lộ ra repo là mất tác dụng.

Máy local của FE đã có giá trị và chạy được. Việc cần làm là **xác nhận server deploy cũng đã set**:

| Biến | Vì sao |
|---|---|
| `MANAGER_OVERRIDE_PASSCODE` | Thiếu là **luồng đón khách tắc cứng** khi manager không chụp được ảnh đồng hồ (hộp khoá, mờ, mất điện) — đúng kịch bản mentor bắt xử lý ở ý 5 |
| `OCR_SPACE_API_KEY` | Để trống sẽ rơi về key demo dùng chung `helloworld`, giới hạn rất thấp, đông người gọi là hỏng giữa buổi |

## 1b. 🔴 `APP_PUBLIC_BASE_URL` — dễ quên nhất

Biến này chưa thấy trong env, đang rơi về mặc định `http://localhost:8080`. Nó dựng URL công khai cho **ảnh bất động sản** và **file hợp đồng PDF** (`PropertyImageUploadProperties`, `ContractDocumentUploadProperties`).

Deploy mà quên set, BE sẽ trả cho FE link kiểu `http://localhost:8080/uploads/properties/...` → **điện thoại và web hỏng ảnh, tải hợp đồng lỗi**. Kiểu lỗi này rất dễ bị tưởng nhầm là bug FE.

```
APP_PUBLIC_BASE_URL=https://<domain-that-cua-BE>
```

## 1c. 🔴 `contractId` của meter-override — tính năng đang chết ở đúng chỗ nó sinh ra để phục vụ

**Đây là lỗi phải sửa code, không phải cấu hình.** Đã test trực tiếp vào BE local hôm nay.

### Hiện trạng

BE hoạt động đúng khi có hợp đồng:

```
POST /api/v1/manager/meter-override/verify
{"passcode":"<đúng>","contractId":22,"meterKind":"ELEC"}
→ 200 {"valid":true,"overrideToken":"17f48c11-…","expiresAt":"…"}

{"passcode":"<sai>", "contractId":22,"meterKind":"ELEC"}
→ 403 "Mã không đúng. Liên hệ admin để lấy mã."
```

Nhưng đúng request mà app gửi thì:

```
{"passcode":"<đúng>","contractId":null,"meterKind":"ELEC"}
→ 400 {"fieldErrors":{"contractId":"must not be null"}}
```

### Vì sao app gửi null

Kịch bản mentor (ý 5) là: **manager đang đón khách mới, tới bước nhập chỉ số thì không chụp được ảnh đồng hồ → xin mã admin để nhập tay.**

Ở đúng thời điểm đó **hợp đồng chưa tồn tại**. Trong `OnboardingScreenV2`, hợp đồng chỉ được tạo ở bước cuối (`onboardRoomTenant` / `onboardWholeHouseTenant`), tức là *sau* bước chỉ số và ngay trước bước thu cọc. Nên FE không có `contractId` nào để gửi.

Nói gọn: endpoint đang viết theo giả định *"đã có hợp đồng rồi mới xin mã"*, còn nghiệp vụ thực tế là *"xin mã giữa lúc đang tạo hợp đồng"*. Hai bên lệch nhau đúng một trường, và hệ quả là tính năng chống-tắc-luồng này **chưa từng dùng được ở luồng đón khách mới** — cũng là luồng duy nhất mentor yêu cầu.

Bảng `meter_override_logs` hiện rỗng vì chưa lần nào tiêu thụ được token.

### Sửa — 3 chỗ, cùng một ý

Bỏ ràng buộc hợp đồng khi chưa có, giữ nguyên mọi ràng buộc còn lại:

```diff
  // MeterOverrideVerifyRequest.java
- @NotNull
  private Long contractId;   // null khi HĐ chưa được tạo (đang giữa luồng đón khách)
```

```diff
  // MeterOverrideServiceImpl.verifyPasscode
- tenantContractRepository.findById(request.getContractId())
-         .orElseThrow(() -> new BusinessException("Không tìm thấy hợp đồng ID: " + request.getContractId()));
+ if (request.getContractId() != null) {
+     tenantContractRepository.findById(request.getContractId())
+             .orElseThrow(() -> new BusinessException("Không tìm thấy hợp đồng ID: " + request.getContractId()));
+ }
```

```diff
  // MeterOverrideServiceImpl.consumeOverrideIfPresent
- if (!token.getContractId().equals(contractId)) {
+ // Token xin trước khi HĐ tồn tại thì không có gì để so — các ràng buộc còn lại vẫn đủ.
+ if (token.getContractId() != null && !token.getContractId().equals(contractId)) {
      throw new BusinessException("Mã override không khớp hợp đồng");
  }
```

Chỗ thứ ba là bắt buộc: thiếu nó thì token có `contractId = null` sẽ ném NPE lúc tiêu thụ, tức là sửa nửa vời còn hỏng nặng hơn hiện tại.

### Nới như vậy có mất an toàn không

Không đáng kể. Token vẫn buộc vào:

| Ràng buộc | Còn nguyên? |
|---|---|
| `managerId` — token của ai người đó dùng | ✅ |
| `meterKind` — mã xin cho điện không dùng cho nước | ✅ |
| TTL 15 phút | ✅ |
| Dùng một lần (`usedAt`) | ✅ |
| Bắt buộc có `reason`, ghi vào `meter_override_logs` | ✅ |
| Chỉ tiêu thụ khi **không có ảnh** đồng hồ tương ứng | ✅ |
| Sai 5 lần khoá 5 phút | ✅ |

Thứ duy nhất mất là "token này chỉ dùng cho đúng hợp đồng số N" — mà ràng buộc đó **về nguyên tắc không thể có** ở thời điểm hợp đồng chưa sinh ra.

### Kiểm lại sau khi sửa

1. Đón khách mới → bước chỉ số → không chụp ảnh → xin mã → nhập tay → đi tiếp được.
2. `GET /api/v1/admin/meter-overrides` phải xuất hiện 1 dòng: ai, hợp đồng nào, loại đồng hồ, số đã nhập, lý do.
3. Dùng lại đúng token đó lần hai → phải báo "Mã override đã được sử dụng".
4. Có ảnh đồng hồ mà vẫn gửi kèm token → token **không** bị tiêu thụ, không sinh log.

## 2. 🔴 Xác nhận webhook PayOS trỏ domain thật

Chưa ai xác nhận đã trỏ về domain production. Chưa đúng thì thanh toán cọc không về được trạng thái đã thanh toán, và luồng hoá đơn → push thông báo đứt ở giữa.

Nhờ trả lời rõ: **đã trỏ chưa, và đã chạy thử một giao dịch thật chưa.** Hiện chưa bên nào test end-to-end khúc này.

Kèm hai câu hỏi cấu hình PayOS, trả lời nhanh được:

- **`PAYOS_AMOUNT_DIVISOR` đang để mặc định `1000`** → hoá đơn 5.000.000đ chỉ thật sự charge 5.000đ. Hợp lý khi test, nhưng cần biết là đang bật, kẻo mentor soi *"sao số tiền PayOS không khớp hoá đơn"*. Muốn khớp thật thì set `=1`.
- **`PAYOS_RETURN_URL` / `CANCEL_URL` đang trỏ web Vercel**, trong khi mặc định trong code là deep link `slms://payment-success`. Nếu khách đặt cọc **trên mobile**, trả xong sẽ nhảy sang trang web chứ không tự quay lại app. Demo luồng cọc trên web thì giữ nguyên là đúng — nhờ xác nhận demo chạy trên nền nào.

## 3. Twilio đang tắt — OTP chỉ ghi ra log

`TWILIO_*` chưa cấu hình nên `OtpServiceImpl` rơi vào nhánh DEV, **ghi thẳng mã OTP ra log server** thay vì gửi SMS. Luồng không chết, nhưng ai demo bước OTP sẽ phải mở log đọc mã.

Nhờ chốt: bật Twilio trước demo, hay thống nhất né bước OTP bằng tài khoản đã xác thực sẵn.

## 4. File `.onnx` — sau demo cũng được

`src/main/resources/models/` hiện **chỉ có `labels.txt`**, chưa có `equipment-mobilenetv3.onnx`.

Không phải lỗi, đúng kế hoạch (model plug sau). Nhưng kéo theo hai hệ quả cần nói đúng:

- `provider=auto` **hiện chạy y hệt `provider=google`** → đừng báo mentor là đã chạy được offline, mới xong phần kiến trúc.
- Mọi lập luận "hết quota thì có local đỡ" chỉ đúng **sau khi** có file này. Trước đó, chạm trần là lỗi thẳng vào mặt người demo — nên mục 3 ở trên vẫn cần.

Khi có model, nhớ kiểm lại `min-score: 0.35` trên ảnh thật; ngưỡng này chọn trước khi train nên gần như chắc phải chỉnh.

## 5. Ý 15 (ẩn tiền khỏi manager) — chưa có, và điều kiện đã đổi

`ManagerBillingServiceImpl` dòng 185 và 211 vẫn trả vô điều kiện:

```java
.amount(invoice.getGrandTotal())   // không xét role
```

Commit `2506173` đã **nới quyền**: ba endpoint `/manager/invoices`, `/manager/invoices/{id}`, `/manager/payments` đổi từ `hasAnyRole('MANAGER','ADMIN')` sang `+'OWNER'`.

→ Điều kiện ẩn tiền giờ phải là **"MANAGER và không phải ADMIN và không phải OWNER"**, không còn là "không phải ADMIN" như mô tả cũ trong `BE-NEED-manager-money-visibility-2026-08-07.md`. Nhờ chuyển tới người đang làm phần này.

---

## Tóm tắt

| # | Việc | Công | Trước demo? |
|---|---|---|---|
| 1 | Xác nhận server có `MANAGER_OVERRIDE_PASSCODE` + `OCR_SPACE_API_KEY` | 5 phút | 🔴 **bắt buộc** |
| 1b | Set `APP_PUBLIC_BASE_URL` = domain thật | 2 phút | 🔴 **bắt buộc** |
| 1c | Cho `contractId` nhận null ở meter-override (3 chỗ, có diff sẵn) | 10 phút | 🔴 **bắt buộc** — không sửa thì ý 5 của mentor coi như chưa làm |
| 2 | Xác nhận webhook PayOS + test 1 giao dịch thật; chốt `AMOUNT_DIVISOR` và return URL | — | 🔴 **bắt buộc** |
| 3 | Chốt phương án OTP (bật Twilio hay né) | — | ✅ nên chốt |
| 4 | File `.onnx` + chỉnh `min-score` | sau khi có dataset | ❌ sau demo |
| 5 | Ý 15 — nhớ loại cả `OWNER` | — | theo lịch người phụ trách |

Mục 1 và 1b cộng lại **dưới 10 phút** và không đụng dòng code nào — chỉ là biến môi trường trên server.
