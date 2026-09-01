# Dual-OTP xác nhận hợp đồng — đối chiếu BE ↔ FE và việc còn lại

**Cập nhật 27/08/2026** sau khi BE giao commit `bd2503b add dual otp`.
FE (`mobile-app`) đã tích hợp xong theo đúng code BE thật, không theo doc.

**Cập nhật 31/08/2026** — đã đọc lại code BE tới `2866ed1`. Bug đua confirm đã được sửa
ở `3299622` (xem mục 2). Đường dẫn và DTO không đổi, FE không phải sửa gì thêm.

---

## 0. TÓM TẮT — 3 việc BE còn phải làm

| # | Việc | Ở đâu | Mức |
|---|---|---|---|
| 1 | Set `GEMINI_API_KEY` bằng **env var** trên server deploy (`.env` không vào Docker image). Kèm theo: tải ảnh **song song** thay vì tuần tự | `.dockerignore:6`, `application.yaml:101`, `GeminiRoomDescribeProvider.java:134-150` | **Chặn** — nút "Tạo lại mô tả hiện trạng phòng" đang lỗi trên bản deploy |
| 2 | Quyết cách xử lý dữ liệu chỉ số đồng hồ **cũ còn phần lẻ** (migrate làm tròn, hay chấp nhận lệch một kỳ) — vì `validateInvoiceAmounts` so khớp tuyệt đối | `UtilityInvoiceServiceImpl:715-720` | **Chặn kỳ hoá đơn đầu tiên** sau khi FE đổi sang số nguyên |
| 3 | Thêm cột `confirm_requested_at` trên `tenant_contracts` (mốc "khách đã bấm gửi OTP") | `DatabaseSchemaMigration` + `TenantContractResponse` | Nên có — không chặn, FE đã né được |

Chi tiết từng việc: mục **4.1** (việc 1), **4.2** (việc 2), **3.1** (việc 3).

Ngoài ra còn một việc **nghiệp vụ chưa ai quyết** ở mục 5: khách thanh toán xong rồi bỏ
dở, không bao giờ xác nhận → HĐ kẹt `PENDING`, phòng bị giữ vô thời hạn.

---

## 1. BE đã làm — FE đã khớp

| Hạng mục | Trạng thái |
|---|---|
| `OtpPurpose.CONTRACT_CONFIRM_TENANT` / `_MANAGER` | ✅ |
| Cập nhật `otp_verifications_purpose_check` trong `DatabaseSchemaMigration` | ✅ (đúng chỗ đã từng gây 500 hôm 27/07) |
| Cột `tenant_otp_verified_at`, `manager_otp_verified_at` | ✅ |
| Tạo tài khoản khách ngay trong `completeDepositPayment` | ✅ |
| Nới `hasEligibleContract` — cho kích hoạt khi `PENDING && PAID` | ✅ |
| Kiểm cửa sổ nhận sớm ở **bước gửi OTP** thay vì lúc verify | ✅ |
| `activateContract` chỉ chạy khi đủ 2 mốc, idempotent | ✅ |
| Chỉ sinh lại mã cho bên **chưa** verify | ✅ |
| Realtime `CONTRACT_CONFIRM_PROGRESS` / `CONTRACT_ACTIVATED` trên `/user/queue/billing` | ✅ |
| Log DEV có nhãn `[TENANT]` / `[MANAGER]` | ✅ |

**BE làm khác thiết kế ban đầu** (FE đã sửa theo BE, không cần BE đổi):

| Việc | Thiết kế ban đầu | BE làm thật |
|---|---|---|
| Khách gửi OTP | `request-confirm-otp` | `POST /api/v1/tenant/me/contracts/{id}/send-confirm-otp` |
| Quản lý xin lại mã | `resend-manager-otp` | dùng lại `POST /api/v1/tenant-contracts/{id}/send-otp` (đã đổi ruột) |
| Đọc tiến độ | `GET .../confirm-state` + field `waitingFor` | **không có** — đọc `GET /tenant-contracts/{id}` rồi tự suy từ 2 mốc |
| Tìm HĐ chờ xác nhận | tự lọc ở FE | `GET /api/v1/tenant/me/contracts/pending-confirm` (200 / 204) — **tốt hơn** |

FE gom toàn bộ đường dẫn vào `PATHS` trong
`mobile-app/src/services/shared/contractConfirmService.ts`, và suy `waitingFor` bằng
`toConfirmState()` dùng chung cho cả hai app.

---

## 2. ✅ Bug đua confirm — BE ĐÃ SỬA (commit `3299622`, 27/08 22:45)

Đúng hai cách đã đề nghị, làm cả hai:

1. `TenantContractRepository.findByIdForUpdate` — `@Lock(PESSIMISTIC_WRITE)` + `@Query`.
   Bốn lối vào (`confirmContract`, `confirmContractByTenant`, `sendContractConfirmOtp`,
   `sendDualContractConfirmOtps`) đều chuyển sang `requirePaidPendingContractForUpdate`.
2. `tryActivateAfterDualOtp(Long contractId)` — nhận **id** chứ không nhận entity, đọc lại
   từ DB sau `saveAndFlush`. Không còn tin bản trong bộ nhớ.

Và có luôn **đường cứu** đã xin: `healStuckDualOtpIfNeeded` — hai lối gửi OTP thấy "đủ 2
mốc mà vẫn PENDING" thì gọi thẳng `activateContract` và trả về, thay vì ném lỗi. HĐ nào
đã kẹt từ trước sẽ tự lành ở lần bấm gửi tiếp theo.

→ **Mục test #9 (hai lệnh confirm song song) giờ đáng chạy lại để nghiệm thu.**

Các đường dẫn và DTO **không đổi** so với `bd2503b` — FE không phải sửa gì.

---

## 3. Hai điểm BE nên biết (không chặn, FE đã né được)

### 3.1 Không có mốc "khách đã bấm gửi OTP"

BE chỉ lưu hai mốc *đã verify*, không lưu `confirm_requested_at`. Hệ quả: từ dữ liệu BE
**không phân biệt được** "khách chưa bấm gửi" với "đã gửi rồi, chưa ai nhập".

FE đã né bằng cách không nói chắc điều đó trong UI quản lý (chỉ nói "chờ khách xác
nhận" / "khách đã xác nhận"). Nếu sau này thêm cột `confirm_requested_at` thì panel
quản lý hiện được đúng câu "khách chưa gửi, đang chờ khách bấm" — rõ hơn hẳn cho người
đứng đón khách.

### 3.2 Quản lý có thể ký TRƯỚC khi khách mở app

`sendContractConfirmOtp` (quản lý xin mã) không kiểm khách đã bấm gửi hay chưa, nên quản
lý tự sinh và tự nhập mã của mình bất cứ lúc nào sau khi PAID.

**Không phá tính pháp lý** — hợp đồng vẫn không thể ACTIVE nếu thiếu chữ ký OTP của
khách, đó mới là điều quan trọng. Chỉ là thứ tự không được ép. Ghi ra đây để sau này
đừng ai tưởng đã ép được thứ tự.

---

## 4. Ngoài luồng OTP — hai việc còn nguyên

### 4.1 `GEMINI_API_KEY` trên server deploy

`.dockerignore` dòng 6 loại `.env`, `Dockerfile` chỉ copy `pom.xml` + `src` → bản deploy
**không có `.env`**. Chưa set bằng env var thì `POST /vision/describe-room` luôn trả
`VISION_DESCRIBE_UNAVAILABLE`.

Ngoài ra `GeminiRoomDescribeProvider.java:134-150` tải ảnh **tuần tự** (trần 20s/ảnh) —
nên tải song song. Đây là nút thắt khiến request mô tả nhiều ảnh bị timeout.

### 4.2 Chỉ số đồng hồ giờ là SỐ NGUYÊN

Từ 27/08/2026 app chỉ ghi phần ĐEN của mặt đồng hồ; phần ĐỎ chỉ dùng để làm tròn (≥ nửa
đơn vị thì +1). Không cần đổi schema, nhưng:

- **Dữ liệu cũ trong `tenant_contracts.initial_*_reading` và `utility_invoices.*_reading`
  đang có phần lẻ.** Kỳ hoá đơn đầu tiên sau khi đổi lấy `prevReading` có lẻ trừ
  `newReading` nguyên → lệch tới ±1 đơn vị. Cần quyết: migrate làm tròn dữ liệu cũ, hay
  chấp nhận lệch một kỳ.
- `UtilityInvoiceServiceImpl.validateInvoiceAmounts:715-720` so khớp **tuyệt đối**
  `newReading − prevReading == consumption` (`compareTo != 0` → `CONSUMPTION_MISMATCH`).
  Với dữ liệu cũ còn lẻ mà FE gửi `consumption` đã làm tròn thì sẽ nổ.

---

## 5. Việc nghiệp vụ chưa ai xử lý

**Khách thanh toán xong rồi bỏ dở, không bao giờ xác nhận.** Tiền đã thu, phòng bị giữ
vô thời hạn, hợp đồng kẹt `PENDING`. Quy trình cũ không có tình huống này vì quản lý làm
hết tại chỗ. Cần một lối thoát — cron nhắc quản lý sau 24h? cho ADMIN kích hoạt thủ công
kèm lý do? cho huỷ + hoàn tiền? Chưa có gì trong code hiện tại.

---

## 6. Test cần chạy khi ghép FE + BE

| # | Việc | Kỳ vọng |
|---|---|---|
| 1 | `markDepositPaid` một HĐ nháp | Tài khoản khách được tạo, `contract.tenant` gán |
| 2 | Gọi `markDepositPaid` 3 lần | Chỉ một User, không lỗi |
| 3 | `tenant-activate/check` | `NEEDS_ACTIVATION` (không phải `NOT_ELIGIBLE`) |
| 4 | `send-confirm-otp` | **2 bản ghi `otp_verifications`, 2 mã KHÁC NHAU, 2 purpose khác nhau** |
| 5 | Khách nhập mã đúng | 200, HĐ **vẫn PENDING**, `tenantOtpVerifiedAt` có giá trị |
| 6 | Khách gọi `confirm-otp` lần 2 | Idempotent, không lỗi |
| 7 | Quản lý nhập mã đúng | ACTIVE, phòng RENTED, **đúng MỘT** hoá đơn prorated |
| 8 | Đảo thứ tự | Kết quả y hệt |
| 9 | **Hai lệnh confirm song song** | BE đã sửa (`3299622`) — chạy lại để nghiệm thu |
| 10 | Khách nhập sai 6 lần | "Sai quá số lần cho phép" |

Test 4 quan trọng nhất: nếu hai mã trùng nhau thì bug **trông y như đang chạy đúng** khi
cả hai mã cùng về một máy demo.
