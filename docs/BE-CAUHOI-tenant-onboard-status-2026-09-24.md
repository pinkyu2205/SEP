# Câu hỏi cho BE — Pipeline đón khách `AWAITING_*` (24/09/2026)

Đã đọc code thật ở commit BE `09b35cd` + `4fa44c6` (ngoc son, 24/09) và đối chiếu với
`FE-handoff-tenant-onboard-status-2026-09-24.md`. Pipeline mới rõ ràng, FE sẽ sửa theo.
Dưới đây là các điểm **cần BE trả lời trước khi FE code**, sắp theo mức ưu tiên. Mỗi điểm
có trích code để BE khỏi phải tìm lại.

---

## 1. (Cao) Cron hủy no-show có hủy nhầm cả hợp đồng khách đã trả tiền không?

`autoCancelNoShowContracts()` giờ lọc `ContractStatus.onboardInProgress()` = `DRAFT |
AWAITING_ONBOARD | AWAITING_PAYMENT | AWAITING_CONFIRM`, và hủy khi
`(expectedReceptionDate ?? moveInDate) + 3 ngày ≤ hôm nay`:

```java
long daysLate = ChronoUnit.DAYS.between(receptionDate, today);
if (daysLate < noShowGraceDays) continue;
...
releaseContractOccupancy(contract);
contract.setStatus(ContractStatus.TERMINATED);
if (contract.getPaymentStatus() == PaymentStatus.PENDING) {
    contract.setPaymentStatus(PaymentStatus.CANCELLED);   // PAID thì giữ nguyên PAID
}
```

`AWAITING_CONFIRM` là trạng thái **đã PAID** (cọc + kỳ đầu đã vào tiền, tài khoản tenant đã
được tạo). Khách đã trả nhưng chưa nhập OTP kịp trong 3 ngày kể từ **ngày đón** (không
phải kể từ ngày trả tiền) sẽ bị `TERMINATED`, phòng bị nhả, tài khoản bị
`disableTenantAccountIfNoActiveContracts`, còn `paymentStatus` vẫn `PAID`.

Câu hỏi:
- a) Có chủ ý hủy cả hợp đồng đã PAID không? Nếu có, **tiền đã thu xử lý thế nào**
  (hoàn cọc tự động / manager xử lý tay / giữ làm phí phạt)? Hiện code không thấy bước
  hoàn tiền nào đi kèm.
- b) Nếu không chủ ý: đề xuất loại `AWAITING_CONFIRM` khỏi cron này (hoặc tính mốc từ
  `depositPaidAt` thay vì ngày đón), và chỉ hủy tự động các bước chưa thu tiền
  (`DRAFT | AWAITING_ONBOARD | AWAITING_PAYMENT`).
- c) Ngưỡng đổi từ **10 → 3 ngày** và mốc đổi từ `moveInDate` → `expectedReceptionDate ??
  moveInDate` là chủ ý đúng không? (Đổi ngưỡng thẳng tay như vậy sẽ hủy hàng loạt các hồ
  sơ đang trễ 4–10 ngày ngay lần cron đầu sau deploy — có cần chạy dọn/báo trước cho
  manager không?)

## 2. (Cao) Đón khách sớm hơn ngày đón dự kiến — còn được không?

Hiện có 2 gate cùng chặn khách vào sớm:
- `completeOnboardCapture()`: HĐ đang `DRAFT` mà `expectedReceptionDate ?? moveInDate` còn
  ở tương lai → `"Chưa tới ngày đón khách — không thể hoàn tất chụp (completeCapture)"`.
- `createDepositPayment()`: chỉ chạy khi status = `AWAITING_PAYMENT` (bản cũ cho thu cọc
  thẳng từ `DRAFT`).

Nghĩa là muốn thu cọc thì phải đợi cron 00:10 của **ngày đón** promote sang
`AWAITING_ONBOARD`. Trong khi `application.yaml` vẫn có
`contract.max-early-move-in-days: 3` ("cho phép khách nhận nhà sớm tối đa N ngày").

Câu hỏi:
- a) Khách tới sớm 1–3 ngày (được phép theo config trên) thì manager làm sao? Hiện là bế
  tắc: không chụp xong được, không tạo được QR.
- b) Nếu muốn cho sớm: cho `completeCapture` từ `DRAFT` khi `due - maxEarlyMoveInDays ≤
  hôm nay`, hoặc thêm API "đón sớm" (promote thủ công `DRAFT → AWAITING_ONBOARD`)?
- c) Nếu chủ ý chặn sớm: xác nhận để FE hiện đúng thông báo và ẩn nút, bỏ hẳn logic "đón
  sớm" phía app.

## 3. (Cao) Đón trễ 1–2 ngày có thể kẹt ở `AWAITING_PAYMENT` mà không tạo được QR

`createDepositPayment()` vẫn giữ kiểm tra cũ:

```java
if (contract.getMoveInDate() == null || contract.getMoveInDate().isBefore(LocalDate.now())) {
    throw new BusinessException("Ngày vào ở không hợp lệ để thu cọc");
}
```

Kịch bản: `moveInDate = 24/09`, manager chụp xong hiện trạng ngày 26/09 →
`AWAITING_PAYMENT` (hợp lệ) → bấm tạo QR → bị chặn "Ngày vào ở không hợp lệ" → tới
27/09 (trễ đủ 3 ngày) cron hủy luôn. Trong 3 ngày grace đó khách hoàn toàn không thể trả
tiền dù pipeline cho phép trễ tới 3 ngày.

Câu hỏi: có bỏ/nới kiểm tra `moveInDate` trong `createDepositPayment()` (ví dụ chỉ chặn
khi `moveInDate` quá `noShowGraceDays`), hay yêu cầu manager **đổi `moveInDate`** trước?
Nếu là cách thứ hai thì API nào để đổi (`PUT /tenant-contracts/{id}` chỉ nhận status
`DRAFT | AWAITING_ONBOARD`, còn `AWAITING_PAYMENT` bị chặn "Chỉ cập nhật hiện trạng khi
HĐ ở DRAFT hoặc AWAITING_ONBOARD")?

## 4. (Trung bình) `completeCapture` — điều kiện "override" có quá lỏng không?

```java
boolean hasElectric = contract.getInitialElectricReading() != null
        && (hasText(contract.getElectricMeterImageUrl()) || hasMeterOverrideRecord(contract, true));
...
private boolean hasMeterOverrideRecord(TenantContract contract, boolean electric) {
    if (electric) {
        return contract.getInitialElectricReading() != null && !hasText(contract.getElectricMeterImageUrl());
    }
    ...
}
```

`hasMeterOverrideRecord` trả `true` **bất cứ khi nào có chỉ số mà không có ảnh** — không
kiểm tra thật sự có bản ghi/token override (mã quản trị admin cấp) nào. Kết quả:
`hasElectric` ≡ "có chỉ số điện" (có ảnh hay không đều qua). Nếu việc bắt buộc "ảnh hoặc
mã override" đã được kiểm ở `updateDraftContract` (`requireMeterEvidence`, 10/08/2026) thì
không sao, nhưng `completeCapture` có thể được gọi kèm/độc lập nên cần chắc.

Câu hỏi: có chủ ý dựa hoàn toàn vào bước validate lúc lưu không? Nếu không, đề xuất kiểm
tra `MeterOverridePasscode`/token đã tiêu thụ cho hợp đồng đó thay vì suy từ "không có
ảnh".

## 5. (Trung bình) Response có đủ để FE dựng UI 4 bước chưa?

FE cần dựng badge + CTA từng bước cho manager (mobile) và admin (web). Xác nhận giúp:
- a) `statusLabel` có ở **mọi** DTO trả hợp đồng tenant không, hay chỉ
  `TenantContractResponse` của `toResponse()`? Đặc biệt các DTO: `/host/contracts`,
  `/tenant/me/contracts` (`MyContractListItem`), `/managed`, và danh sách hợp đồng theo
  tòa (`/properties/{id}/tenant-contracts`).
- b) Response có trả `depositPaidAt`/`paymentStatus`/`tenantOtpVerifiedAt`/
  `managerOtpVerifiedAt` ở đủ các endpoint trên không (FE dùng để tách
  "chờ OTP khách" / "chờ OTP quản lý" trong `AWAITING_CONFIRM`)?
- c) `GET /tenant-contracts?status=RECEPTION` cho Owner/Host: handoff ghi "Admin/Owner thấy
  toàn hệ thống", nhưng ở FE hiện Host phải đi qua `/host/contracts` (Owner bị 403 với
  `/tenant-contracts/{id}`). Alias `RECEPTION` có mở cho Host ở `/host/contracts` không?

## 6. (Thấp) Xác nhận nhỏ để FE khỏi đoán

- a) `completeDepositPayment()` (chuyển `AWAITING_PAYMENT → AWAITING_CONFIRM`) hiện chỉ
  được gọi từ PayOS webhook (`markDepositPaid`) và `syncPaymentStatus`. Đúng là **không
  còn** đường thu tiền mặt/chuyển khoản tay nào phải đi qua bước này nữa?
- b) Tạo HĐ không qua draft (`request.isDraft()=false` + `requireDepositPayment`) sinh
  thẳng `AWAITING_PAYMENT` mà **bỏ qua `AWAITING_ONBOARD`/`completeCapture`** — có kiểm
  hiện trạng + chỉ số ngay trong `createTenantContract` không, hay app vẫn phải gọi
  `completeCapture`?
- c) Sau migrate lúc boot, HĐ `PENDING` cũ + PAID → `AWAITING_CONFIRM` sẽ **ngay lập tức**
  rơi vào cron no-show (câu 1) nếu `expectedReceptionDate` đã cũ hơn 3 ngày. Có cần
  đóng băng các HĐ migrate đó (đặt lại mốc / bỏ qua lần cron đầu)?

---

## Việc FE sẽ làm sau khi BE trả lời (để BE biết tác động)

- Mobile: gửi `completeCapture:true` sau khi lưu đủ chỉ số/ảnh; `ResumeContractScreen`,
  danh sách "Việc của tôi"/trang chủ manager và `TenantListScreen` chuyển sang lọc
  `RECEPTION`/3 status mới (hiện lọc `DRAFT`/`PENDING` nên sẽ mất dữ liệu ngay khi cron
  promote); `mapBeContractStatus` thêm nhánh cho `AWAITING_*`.
- Web: trang Hồ sơ đón khách đổi `listDrafts` (`status=DRAFT`) sang `status=RECEPTION`; thêm
  nhãn/màu cho 3 status mới ở `contractLabels`, `TenantContractTimeline`,
  `ContractMonitoring`, `HandoverMonitoring`, `PropertyDetail`.
- Câu 1–3 quyết định FE hiện thông báo/ẩn nút thế nào ở màn đón khách, nên cần trả lời
  trước khi FE code phần đó.
