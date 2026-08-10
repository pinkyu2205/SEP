# BE NEED — Các việc BE cần làm sau buổi mentor 07/08/2026

**Ngày:** 08/08/2026
**Người gửi:** team FE
**Người nhận:** team BE
**Bối cảnh:** tổng hợp 17 điểm mentor yêu cầu sửa sau buổi demo 07/08/2026. Doc này chỉ chứa phần **BE phải làm**; phần FE tự làm nằm ở `PLAN-mentor-feedback-2026-08-08.md`.

---

## 0. ⚠️ Đọc trước — bản BE mình đọc là bản nào

Mình đọc code trên bản local `C:\sep490\backup2\Sub-leasing-managemant-system`:

```
branch : feature/ocr-google-vision
commit : fbfda9b (06/08/2026) "Đọc chỉ số công tơ bằng Google Vision thay cho OCR.space"
```

Bản này **KHÔNG có** một số hàm mà các doc FE khác đang nhắc tới:
`generateMonthlyRentInvoices()`, `generateProratedRentForNewContract()`, `remindUpcomingRentOn28th()`
— `BillingCronServiceImpl` ở đây chỉ có `runDailySweep()`.

→ Nhánh này đang **đi sau `dev`**. Nhờ BE xác nhận nhánh chuẩn trước khi làm, và nếu mục nào dưới đây đã có trên `dev` rồi thì báo lại để FE bỏ khỏi danh sách.

---

## 1. 🔴 Tiền onboard (thuê tháng đầu + cọc) KHÔNG sinh hoá đơn — gốc của 4 lỗi mentor nêu

Đây là mục quan trọng nhất. Bốn ý kiến rời rạc của mentor (số 10, 11, 12, 17) thật ra chỉ là **một lỗi duy nhất**.

### Hiện trạng

`TenantOnboardingServiceImpl.createDepositPayment()` (dòng 246–283) tạo 1 link PayOS đúng số tiền:

```java
BigDecimal total = TenantContractPaymentAmounts.resolveInitialPaymentAmount(contract); // rent + deposit
PayosService.PaymentLink link = payosService.createPaymentLink(orderCode, total.longValue(), "Thue+Coc HD " + contract.getId());
```

Khách quét, trả 10tr. PayOS gọi webhook về, `markDepositPaid()` chạy (dòng 377–385):

```java
public void markDepositPaid(Long payosOrderCode) {
    tenantContractRepository.findByPayosOrderCode(payosOrderCode).ifPresent(contract -> {
        contract.setPaymentStatus(PaymentStatus.PAID);
        contract.setPaidAt(LocalDateTime.now());
        tenantContractRepository.save(contract);
    });
}
```

Hết. **Không tạo `TenantInvoice`, không tạo `TenantPayment`, không gửi thông báo cho ai.**
(Đã quét toàn bộ `src/main/java`: `TenantInvoice.builder()` chỉ xuất hiện ở `TenantBillingServiceImpl` và `TenantPendingChargeServiceImpl`, không có ở luồng onboard. `tenantPaymentRepository.save` chỉ có 1 chỗ, cũng không phải onboard.)

### 4 hệ quả — đúng 4 ý mentor nêu

| Ý mentor | Hệ quả thật |
|---|---|
| **10.** Tenant không xem được đã đặt cọc hay chưa | Khách trả 10tr xong không có hoá đơn nào, không có giao dịch nào, không có thông báo nào. Trong app khách **không có gì để nhìn**. |
| **11.** Tổng ở hoá đơn hiện 5tr, thiếu tiền tháng | Khách chỉ thấy `deposit` trên màn hợp đồng (5tr). Khoản 5tr tiền nhà tháng đầu đã trả thì **không nằm ở đâu cả** — nên nhìn vào tưởng hụt 5tr. |
| **12.** Manager không biết tenant đã trả tiền chưa | Sau khi rời màn onboard, không có bản ghi giao dịch nào để tra. Manager chỉ biết nếu đang ngồi trên màn và bấm `check-payment`. |
| **17.** Đã thanh toán nhưng thanh toán cái gì | Không có `invoice_item` nào cho khoản onboard → web admin không thể hiện chi tiết, vì dữ liệu chưa từng tồn tại. |

### Đề nghị

Trong `markDepositPaid()`, sau khi set `PAID`, sinh bản ghi **kế toán thật**:

```java
@Transactional
public void markDepositPaid(Long payosOrderCode) {
    tenantContractRepository.findByPayosOrderCode(payosOrderCode).ifPresent(contract -> {
        if (contract.getPaymentStatus() == PaymentStatus.PAID) return;   // idempotent — PayOS retry webhook

        contract.setPaymentStatus(PaymentStatus.PAID);
        contract.setPaidAt(LocalDateTime.now());
        contract.setDepositPaidAt(LocalDateTime.now());   // xem mục 1.1
        contract.setDepositMethod("PAYOS");
        tenantContractRepository.save(contract);

        // 1) Hoá đơn onboard — 2 dòng, để chỗ nào cũng giải thích được 10tr gồm những gì
        onboardingInvoiceService.createOnboardingInvoice(contract);

        // 2) Giao dịch — để /manager/payments và lịch sử thanh toán của tenant có dữ liệu
        tenantPaymentRepository.save(TenantPayment.builder()
                .tenantContract(contract)
                .amount(TenantContractPaymentAmounts.resolveInitialPaymentAmount(contract))
                .method("PAYOS")
                .payosOrderCode(payosOrderCode)
                .paidAt(LocalDateTime.now())
                .build());

        // 3) Báo cả 2 phía — xem mục 4
        notifyDepositPaid(contract);
    });
}
```

Hoá đơn onboard đề xuất:

```java
TenantInvoice.builder()
    .code("HD-ONBOARD-" + contract.getId())
    .tenantContract(contract)
    .invoiceType(TenantInvoiceType.RENT)          // hoặc thêm enum ONBOARDING nếu muốn tách hẳn
    .billingPeriod("Thu lúc nhận phòng " + contract.getMoveInDate())
    .status(TenantInvoiceStatus.PAID)
    .grandTotal(rent.add(deposit))
    .paidAt(LocalDateTime.now())
    .build();

// items — CHÍNH LÀ phần "chi tiết nội dung thanh toán" mentor đòi ở ý 17
//   • "Tiền nhà tháng đầu"        → rentAmount
//   • "Tiền cọc (N tháng)"        → deposit
```

**Quan trọng:** hoá đơn này phải sinh ở trạng thái `PAID` ngay, và cron nhắc nợ (`runDailySweep`) phải bỏ qua nó — nếu không khách vừa trả xong đã bị nhắc đòi tiền.

### 1.1. `depositPaidAt` chưa được set ở đâu

`markDepositPaid()` chỉ set `paidAt`. Doc `BE-NEED-manager-money-visibility-2026-08-07.md` của bạn FE bên kia đang thiết kế `ManagerDepositDto.depositPaidAt` và FE lọc "cọc đã thu" bằng `depositPaidAt != null` — với code hiện tại field đó **luôn null**, danh sách sẽ luôn rỗng. Nhờ set cùng lúc với `paidAt`.

---

## 2. 🔴 Hai bản ghi hợp đồng nào cũng không kiểm tra được: manager mất dấu khách đang đón dở

**Ý mentor số 13:** thoát app xong vào lại, manager không biết khách lúc nãy là ai, search không ra.

### Tin tốt: BE đã làm được, FE gọi thiếu

`getManagedContracts(status)` (dòng 389–415) có nhánh riêng cho `DRAFT`/`PENDING`:

```java
if ("DRAFT".equalsIgnoreCase(status) || "PENDING".equalsIgnoreCase(status)) {
    ContractStatus contractStatus = ContractStatus.valueOf(status.toUpperCase());
    contracts = tenantContractRepository.findManagedContractsByStatus(managerUserId, contractStatus);
}
```

→ `GET /api/v1/tenant-contracts/managed?status=PENDING` **chạy đúng**, trả về HĐ đang kẹt ở bước thu cọc/OTP.
FE hiện chỉ gọi `''` và `'DRAFT'` nên bỏ sót đúng nhóm này. **FE sẽ tự sửa, BE không cần làm gì cho phần này.**

### Việc BE cần làm

Nhánh mặc định (`status` rỗng) chỉ trả 3 trạng thái duyệt giá:

```java
contracts = tenantContractRepository.findManagedContractsByApprovalStatuses(managerUserId,
    List.of(PENDING_PRICE_APPROVAL, APPROVED_AWAITING_DEPOSIT, PRICE_REJECTED));
```

Đề nghị nhánh mặc định trả **tất cả HĐ chưa hoàn tất** của manager (DRAFT + PENDING + 3 trạng thái duyệt giá), sort `updatedAt DESC`. Như vậy màn "Tiếp tục hợp đồng" chỉ cần 1 lượt gọi thay vì 3, và không bao giờ sót.

---

## 3. 🟡 Mã passcode cho phép nhập chỉ số khi không chụp được ảnh

**Ý mentor số 5.** Hiện tại không chụp được ảnh đồng hồ là tắc hẳn luồng đón khách.

Chính sách: cho nhập tay, nhưng phải có **passcode xin từ admin**, và mọi lần dùng đều bị ghi vết — vì đây chính là lỗ hổng mà toàn bộ cơ chế bắt chụp ảnh đang bịt.

### Đề nghị

```java
// application.properties
manager.override.passcode=${MANAGER_OVERRIDE_PASSCODE:}   // KHÔNG hardcode trong file, đọc từ env
manager.override.ttl-minutes=15
```

```
POST /api/v1/manager/meter-override/verify
Body:  { "passcode": "...", "contractId": 123, "meterKind": "ELEC" }
200 :  { "valid": true, "overrideToken": "<uuid>", "expiresAt": "..." }
403 :  { "valid": false, "message": "Mã không đúng. Liên hệ admin để lấy mã." }
```

Rồi khi submit chỉ số, request kèm `overrideToken`. BE lưu bảng audit:

```java
public class MeterOverrideLog {
    private Long id;
    private UUID managerId;
    private Long contractId;
    private String meterKind;         // ELEC | WATER
    private BigDecimal enteredValue;
    private String reason;            // manager gõ lý do, bắt buộc
    private LocalDateTime createdAt;
}
```

Thêm `GET /api/v1/admin/meter-overrides` để admin soi ai đã dùng mã, bao nhiêu lần.

> Chống brute-force: khoá 5 phút sau 5 lần sai liên tiếp trên cùng tài khoản.
> Nếu kịp thì làm mã dùng-một-lần admin bấm sinh; không kịp thì passcode tĩnh trong env cũng chấp nhận được cho demo, miễn là **có audit log**.

---

## 4. 🟡 Thông báo — BE còn thiếu 3 chỗ

FE đã nối xong toàn bộ đường ống push (xem `SETUP-push-notifications-2026-08-08.md`). BE có sẵn `PushNotificationService` gọi Expo Push API. Còn thiếu:

### 4.1. `DELETE /api/v1/user/me/push-token`

`PushTokenController` hiện **chỉ có** `POST /me/push-token`. FE đã gọi `DELETE` lúc logout (`pushToken.ts` → `unregisterPushToken`) và đang nuốt lỗi 404. Hệ quả: máy đã đăng xuất vẫn nằm trong danh sách nhận thông báo của tài khoản cũ.

```java
@DeleteMapping("/me/push-token")
@Transactional
public ResponseEntity<Map<String, Object>> deletePushToken(Principal principal) {
    User user = userRepository.findByUsername(principal.getName())
            .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy người dùng"));
    user.setPushToken(null);
    userRepository.save(user);
    return ResponseEntity.ok(Map.of("success", true));
}
```

### 4.2. Push khi cọc được ghi nhận (nối vào mục 1)

Hiện `markDepositPaid()` im lặng tuyệt đối. Cần 2 tin:

| Type | Người nhận | Nội dung | Màn mở |
|---|---|---|---|
| `DEPOSIT_PAID_TENANT` | tenant | "✅ Đã nhận thanh toán — Hệ thống đã ghi nhận khoản thu lúc nhận phòng. Xem chi tiết trong Hoá đơn." | `InvoiceList` |
| `DEPOSIT_PAID_MANAGER` | manager của property | "💰 Khách {tên} · Phòng {số} đã thanh toán xong. Tiếp tục bước xác thực OTP để hoàn tất hợp đồng." | `ResumeContract` |

> ⚠️ Tin gửi cho **manager KHÔNG được chứa số tiền** — theo chính sách chốt ở `BE-NEED-manager-money-visibility-2026-08-07.md` (ý mentor số 15). Tin gửi cho **tenant thì phải có số tiền**.

### 4.3. `User.pushToken` chỉ giữ được 1 máy

Field là `String` đơn. Manager đăng nhập trên máy thứ 2 là máy thứ nhất im luôn, mà không ai biết. Nếu còn thời gian, tách bảng `user_push_token (user_id, token, platform, last_seen_at)` rồi gửi cho tất cả token của user. Không kịp thì giữ nguyên, chỉ cần biết giới hạn này khi demo.

---

## 5. 🟡 Web admin: theo dõi tiến độ nhận nhà / giao phòng

**Ý mentor số 16:** trên web không xem được manager đã tới lấy phòng và giao phòng cho tenant chưa.

Dữ liệu đã có trong DB nhưng chưa endpoint nào trả ra gọn. Hai mốc cần:

| Mốc | Nguồn dữ liệu hiện có |
|---|---|
| Manager đã **nhận nhà** từ host | `Property.status`: `PENDING_OPERATION_MANAGER` → `ACTIVE`; `RenovationSession` hoàn tất; `HandoverEquipment` |
| Manager đã **giao phòng** cho tenant | `TenantContract.status = ACTIVE`, `moveInDate`, ảnh hiện trạng phòng, chỉ số điện/nước chốt lúc đón |

### Đề nghị

`GET /api/v1/admin/handover-status?propertyId=` trả DTO nhẹ:

```java
public class AdminHandoverStatusDto {
    private Long propertyId;
    private String propertyName;
    private String propertyStatus;
    private String operationManagerName;
    private LocalDateTime managerAcceptedAt;    // mốc property chuyển sang ACTIVE
    private Integer totalRooms;
    private Integer roomsHandedOver;            // số phòng có HĐ ACTIVE
    private List<RoomHandover> rooms;           // roomNumber, tenantName, contractStatus,
                                                // moveInDate, activatedAt,
                                                // conditionPhotoCount, hasMeterReadings
}
```

Nếu chưa có cột mốc thời gian thì thêm `Property.managerAcceptedAt` và `TenantContract.activatedAt` (set lúc `confirmContract` thành công) — không có 2 cột này thì web chỉ hiện được trạng thái, không hiện được "đã bao lâu rồi".

---

## 6. ⛔ Chi tiết hoá đơn cho web admin — KHÔNG thuộc doc này

**Ý mentor số 17** (trang admin hiển thị đúng hoá đơn + chi tiết hoá đơn đó gồm những gì) do **bạn FE khác trong nhóm** phụ trách, cả phần web lẫn phần yêu cầu BE. Xem doc riêng của bạn ấy: `BE-NEED-admin-billing-fields-2026-08-07.md`.

Ghi lại ở đây **chỉ để BE khỏi làm trùng**: doc đó và doc này cùng đụng tới `ManagerInvoiceResponse`, nên làm theo **một** doc thôi, đừng gộp hai bên.

> Đừng nhầm với **mục 1** của doc này: mục 1 nói về khoản tiền **onboard** (thuê tháng đầu + cọc) — khoản này hiện **chưa có hoá đơn nào tồn tại** nên không nằm trong phạm vi ý 17. Sinh được hoá đơn onboard rồi thì trang admin của bạn kia tự có dữ liệu để hiện.

---

## 7. 🟢 Dữ liệu demo: 50 tenant + 50 hợp đồng trên 25 căn

**Ý mentor số 1:** đón khách — hợp đồng nháp có quá ít lựa chọn.

BE đã có `config/SampleDataSeeder.java`. Nhờ mở rộng seed cho demo:

- 25 property có `operationManagerId` trải đều các manager (đừng dồn 1 người)
- 50 tenant user (`ROLE_TENANT`), SĐT/CCCD hợp lệ format
- 50 `TenantContract` phân bổ trạng thái để demo được mọi nhánh:

| Trạng thái | Số lượng | Dùng để demo |
|---|---|---|
| `DRAFT` | 15 | màn chọn hợp đồng nháp lúc đón khách |
| `PENDING` (chưa thu cọc) | 8 | màn "Tiếp tục hợp đồng" (ý 13) |
| `PENDING_PRICE_APPROVAL` | 5 | luồng host duyệt giá |
| `ACTIVE` | 20 | hoá đơn, điện nước, bảo trì |
| `TERMINATED` | 2 | lịch sử |

Kèm hoá đơn RENT + ELECTRICITY + WATER vài kỳ cho nhóm `ACTIVE`, có cả `PAID` lẫn `PENDING` lẫn `OVERDUE`.

---

## 8. 🟢 `generateContractCode()` — nhắc lại, chưa thấy sửa

Bạn FE bên kia đã báo ở mục 6b doc `BE-NEED-manager-money-visibility-2026-08-07.md`. Trên bản `feature/ocr-google-vision` vẫn còn nguyên `count() + 1`. Nhắc lại vì seed 50 hợp đồng ở mục 7 sẽ **kích hoạt đúng lỗi này**: seed xong rồi đón khách thật là trùng `contract_code` ngay, mà cột đang `unique = true`.

Làm mục 7 thì bắt buộc làm luôn mục 8.

---

## 9. Tóm tắt — thứ tự ưu tiên trước demo

| # | Việc | Mức | Chặn demo? |
|---|---|---|---|
| 1 | Sinh hoá đơn + giao dịch cho tiền onboard | 🔴 | **Có** — chặn ý 10, 11, 12, 17 |
| 4.2 | Push khi cọc được ghi nhận | 🔴 | **Có** — chặn ý 10, 12 |
| 7 + 8 | Seed dữ liệu demo + sửa `generateContractCode` | 🔴 | **Có** — chặn ý 1 |
| 4.1 | `DELETE /me/push-token` | 🟡 | Không |
| 3 | Passcode override + audit | 🟡 | Không (FE có đường tạm, xem PLAN mục 5) |
| 5 | `GET /admin/handover-status` | 🟡 | Không |
| 1.1 | Set `depositPaidAt` | 🟡 | Không, nhưng làm cùng mục 1 là xong |
| 2 | `managed` mặc định trả cả DRAFT/PENDING | 🟢 | Không — FE đã có đường đi vòng |
| 4.3 | Multi-device push token | 🟢 | Không |
