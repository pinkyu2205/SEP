# PLAN — Hướng đi cho 17 điểm mentor góp ý (07/08/2026)

**Ngày:** 08/08/2026
**Nguồn:** buổi demo với mentor 07/08/2026
**Doc liên quan:**
- `BE-NEED-mentor-demo-2026-08-08.md` — phần BE phải làm
- `SETUP-push-notifications-2026-08-08.md` — bật thông báo đẩy

---

## Phần A — 17 ý gộp lại chỉ còn 6 nhóm việc

Mentor liệt kê rời rạc, nhưng đọc code thì nhiều ý cùng chung một gốc. Gộp lại để không sửa 4 lần cùng một chỗ:

| Nhóm | Ý mentor | Gốc vấn đề |
|---|---|---|
| **N1. Tiền onboard không để lại dấu vết** | 10, 11, 12, 14, 17 | `markDepositPaid()` chỉ set cờ `PAID`, không sinh hoá đơn / giao dịch / thông báo |
| **N2. Đọc chỉ số đồng hồ chưa chắc ăn** | 2, 3, 6, 7, 8 | Chuỗi số OCR đọc được đang dùng nguyên, không tách phần thập phân; luật lọc ảnh quá chặt |
| **N3. Đường thoát khi máy móc hỏng** | 2, 5 | Không chụp được / không gọi được Vision là tắc hẳn luồng đón khách |
| **N4. Mất dấu việc đang làm dở** | 13 | FE không gọi `?status=PENDING` nên khách đang đón dở biến mất khỏi danh sách |
| **N5. Dọn UI thừa** | 9 | Dòng "Hình thức thu cọc" chỉ có 1 lựa chọn duy nhất |
| **N6. Web admin thiếu góc nhìn vận hành** | 16 | Không có endpoint nào trả tiến độ nhận nhà / giao phòng |
| **N7. Dữ liệu demo quá mỏng** | 1 | Seeder chưa sinh đủ |
| **(đã có người làm)** | 15 | Ẩn số tiền khỏi mắt manager |

---

## Phần B — Ranh giới với bạn FE bên kia

Đọc 4 doc bạn ấy gửi kèm, đây là những file **mình không đụng vào**:

### Bạn ấy đang giữ

| Vùng | File |
|---|---|
| Ẩn tiền khỏi manager (ý 15) | `constants/managerVisibility.ts`, `BillingManagementScreen`, `BuildingBillingScreen`, `RentInvoiceScreen`, `BillingHistoryScreen`, `TenantInvoicesScreen`, `BuildingContractScreen`, `TenantListScreen` |
| Chu kỳ nhắc tiền phòng | `constants/rentCycle.ts`, `hooks/useFirstCycleReminder.ts`, tenant `InvoiceListScreen` + `InvoiceDetailScreen` |
| Danh sách tiền cọc của manager | `services/manager/depositService.ts`, `services/manager/propertyService.ts` |
| Trang thanh toán web admin | `frontend-web/src/pages/admin/BillingPaymentMonitoring.tsx`, `services/admin.service.ts` |

### Mình giữ

| Vùng | File |
|---|---|
| Luồng đón khách | `screens/manager/OnboardingScreenV2.tsx`, `ResumeContractScreen.tsx` |
| Đọc/kiểm ảnh đồng hồ | `utils/meterPhoto.ts`, `services/shared/visionService.ts`, `CheckoutInspectionScreen.tsx` |
| Tenant xem tiền đã trả | `screens/tenant/TenantContractScreen.tsx`, `TenantHomeScreen.tsx`, `PaymentHistoryScreen.tsx` |
| Thông báo đẩy | `services/core/notifications.ts`, `pushToken.ts`, `constants/api.ts` |
| Tiến độ bàn giao trên web | trang admin **mới**, không sửa `BillingPaymentMonitoring.tsx` |

### ⚠️ Ba chỗ giẫm chân — cần thống nhất trước khi code

**1. Ý 17 (trang admin hiển thị đúng hoá đơn + chi tiết hoá đơn gồm những gì)** → **của bạn ấy hoàn toàn**, cả phần web lẫn phần yêu cầu BE. Mình không mở `BillingPaymentMonitoring.tsx` và **cũng không gửi yêu cầu BE nào cho ý này** — nếu không BE sẽ nhận hai doc cùng đòi sửa `ManagerInvoiceResponse` từ hai người.

Có một thứ mình phát hiện lúc đọc code, **bàn giao lại để bạn ấy tự đưa vào doc của bạn ấy** (`BE-NEED-admin-billing-fields-2026-08-07.md`) nếu thấy dùng được:

> BE **đã có sẵn** `TenantInvoiceItemResponse` — `TenantBillingServiceImpl` dòng ~458 đã build `items` theo `TenantInvoiceType`, nhưng chỉ trả ở API phía tenant. `ManagerInvoiceResponse` (mà web admin đang dùng) không map field này. Tức phần "chi tiết hoá đơn gồm những gì" **không phải làm từ đầu**, chỉ cần expose sang API manager — nên xin endpoint chi tiết riêng (`GET /manager/invoices/{id}`) thay vì nhồi `items` vào list, vì list toàn hệ thống kèm items thì payload phình rất nhanh.

**2. Ý 12 (manager biết tenant đã trả chưa)** bị cắt đôi:
- Hoá đơn hàng tháng → bạn ấy (đã làm: "2/4 hoá đơn đã thanh toán")
- Tiền onboard lúc đón khách → **mình** (nhóm N1 — hiện chưa có bản ghi nào, bạn ấy không có gì để hiển thị)

**3. Thông báo:** bạn ấy đặc tả **nội dung** các tin `RENT_*` (nhắc tiền phòng). Mình làm **đường ống** (token, kênh, điều hướng) + các tin về cọc/hợp đồng. Không đè lên nhau.

---

## Phần C — Chi tiết từng nhóm

### N1. 🔴 Tiền onboard không để lại dấu vết — ý 10, 11, 12, 14, 17

**Đây là việc quan trọng nhất. 5 ý mentor, 1 nguyên nhân.**

Đã đọc code BE (`TenantOnboardingServiceImpl` dòng 246–283 và 377–385):

- `createDepositPayment()` tạo link PayOS **đúng số tiền** — `resolveInitialPaymentAmount()` = `rentAmount + deposit`. Chỗ này **không sai**.
- Nhưng `markDepositPaid()` khi webhook về chỉ làm 3 dòng: set `PAID`, set `paidAt`, save. **Không sinh `TenantInvoice`, không sinh `TenantPayment`, không gửi thông báo.**

Nên sau khi khách trả 10tr: không có hoá đơn nào, không có giao dịch nào, không có thông báo nào. Khách nhìn màn hợp đồng chỉ thấy mỗi `deposit` = 5tr → **đúng như mentor nói "hiện tổng 5tr, chưa có tiền tháng"**. 5tr tiền nhà đã trả thì không nằm ở đâu cả.

#### Về ý 14 — "fix cứng số tiền, không cho sửa"

Tin tốt: **PayOS đã fix cứng sẵn rồi.** `createPaymentLink(orderCode, amount, ...)` sinh mã VietQR có nhúng số tiền; app ngân hàng đọc mã sẽ khoá ô số tiền, người quét không sửa được. Không cần làm gì thêm.

Phần "bên dưới hiện số tiền sau khi quét" thì FE đã có — `OnboardingScreenV2` dòng ~2168 hiện `initialPaymentAmount` kèm bảng tách "tiền nhà tháng đầu / tiền cọc". Con số 5tr mentor nhìn thấy là ở **màn hoá đơn của tenant sau khi onboard xong**, không phải màn QR.

→ Nên ý 14 **không phải bug riêng**, nó là biểu hiện của N1.

#### Việc phải làm

| Ai | Việc |
|---|---|
| **BE** | Sinh `TenantInvoice` (`PAID`, 2 dòng item: tiền nhà tháng đầu + tiền cọc) và `TenantPayment` trong `markDepositPaid()`. Set `depositPaidAt`. Bắn 2 push. → `BE-NEED` mục 1 + 4.2 |
| **FE (mình)** | Tenant: thêm thẻ "Đã thanh toán khi nhận phòng" ở `TenantHomeScreen` + `TenantContractScreen`, tách rõ 2 cấu phần. Manager: `ResumeContractScreen` hiện badge "✅ Đã thu" trên từng HĐ. |
| **FE (bạn kia)** | Web admin render `items[]` khi BE có endpoint chi tiết |

**Chặn demo: CÓ.** Không có phần BE thì FE không có gì để hiển thị.

---

### N2. 🟡 Đọc chỉ số đồng hồ — ý 3, 7, 8, 6, 2

#### Ý 3 + 7 — chữ số đuôi và làm tròn

**Phát hiện: hiện tại KHÔNG có chỗ nào tách phần thập phân.**

`utils/meterPhoto.ts` → `pickReading()` trả về nguyên chuỗi chữ số, rồi `OnboardingScreenV2.tsx:939` nhét thẳng vào ô nhập:

```ts
setMeters((prev) => ({ ...prev, [kind]: check.reading as string }))
```

Comment trong `scoreCandidate()` còn ghi rõ *"4–6 chữ số (5 số đen + 1 số đỏ phần thập phân)"* — tức là code **biết** có chữ số đỏ nhưng không tách. Nên công tơ đọc `030815` (= 3081,5 kWh) đang được ghi nhận là **3081,5 → nhập thành 30815**, sai gấp 10 lần.

Đây là lỗi tính tiền thật, nghiêm trọng hơn ý mentor nêu.

**Về ý 7 — "có loại đồng hồ số đuôi màu khác đỏ không?"**

Khảo thị trường VN, câu trả lời là **có, và nhiều hơn tưởng**:

| Loại | Chữ số thập phân | Ghi chú |
|---|---|---|
| Công tơ cơ 1 pha (EMIC, Vinasino, Gelex) | 1 số, **khung đỏ** | Phổ biến nhất — 5 đen + 1 đỏ |
| Công tơ cơ 3 pha gián tiếp (qua CT) | **không có số đỏ** | Đọc nguyên phần nguyên rồi ×  hệ số CT |
| Công tơ điện tử (LCD) | dấu **chấm thập phân in sẵn**, không phân màu | Ví dụ `12345.6` |
| Đồng hồ nước dạng số (Asahi, Unik, Komax) | 3 số, khung đỏ hoặc **kim quay đỏ** rời | ×0,1 / ×0,01 / ×0,001 m³ |
| Đồng hồ nước loại cũ | phần lẻ **chỉ có kim quay**, không có ô số | Không đọc bằng OCR được |
| Một số model nhập khẩu | khung **đen viền trắng** hoặc **cam** | Hiếm nhưng có |

**→ Kết luận quan trọng: không được dựa vào màu.**
Pipeline hiện tại là Google Vision `TEXT_DETECTION` — nó trả về **chữ, không trả về màu**. Dù đồng hồ có số đỏ thì BE cũng không biết số nào đỏ. Xây luật theo màu là xây trên nền không có dữ liệu.

**Hướng đi thay thế — khai báo số chữ số thay vì đoán màu:**

1. Thêm cấu hình cho từng đồng hồ (lưu ở phòng/căn, đặt 1 lần lúc onboard property): `integerDigits` / `decimalDigits`.
   Mặc định: điện `5 + 1`, nước `5 + 3`.
2. Sau khi OCR ra chuỗi số, FE hiện **ô số tách sẵn** — phần nguyên nền trắng, phần lẻ nền đỏ nhạt — kèm nút vuốt để manager dời vạch ngăn nếu đồng hồ khác chuẩn. Nhìn là biết máy hiểu đúng chưa, không cần tin mù.
3. Đồng hồ điện tử có dấu `.` trong chuỗi OCR thì lấy thẳng dấu đó, bỏ qua cấu hình.

**Về luật làm tròn "lớn hơn 5 mới làm tròn":**

Làm tròn ngay lúc ghi chỉ số thì **sai số KHÔNG dồn qua các kỳ** — kỳ sau lấy đúng con số đã làm tròn của kỳ trước làm mốc nên hai sai số triệt tiêu nhau:

```
Kỳ 1: 03081,9 → ghi 3082   (dôi +0,1)
Kỳ 2: 03090,1 → ghi 3090   (hụt −0,1)
Kỳ 3: 03098,4 → ghi 3098   (hụt −0,4)

Tiêu thụ:  kỳ 2 = 8  (thật 8,2)
           kỳ 3 = 8  (thật 8,3)
Cộng dồn từ đầu = 3098 − 3082 = 16  (thật 16,5)   ← vẫn chỉ lệch 0,5
```

Tổng qua N kỳ luôn = `số đọc cuối − số đọc đầu`, nên sai số cả đời hợp đồng vẫn bị chặn ở **±1 đơn vị**, không phụ thuộc chạy bao nhiêu năm. Mỗi kỳ lẻ ra tối đa ±1 đơn vị.

**Nhưng điện và nước lệch nhau rất xa về tỷ lệ:**

| | Điện | Nước |
|---|---|---|
| Tiêu thụ 1 phòng/tháng | 150–400 kWh | 8–15 m³ |
| Sai số tối đa | 1 kWh | 1 m³ |
| **Tỷ lệ** | **~0,3%** | **~7–12%** |
| Quy ra tiền | ~3.000đ | ~15.000đ |

→ **Đề xuất: điện làm tròn nguyên kWh** (đúng luật mentor chốt), **nước giữ 1 số lẻ** rồi chỉ làm tròn ở số tiêu thụ lúc phát hành hoá đơn. Đồng hồ nước có tới 3 chữ số đỏ (×0,1 / ×0,01 / ×0,001 m³) nên cắt sạch là mất nhiều thông tin hơn điện, mà 1 m³ trên hoá đơn 12 m³ là con số khách soi ra được. Cột đang là `BigDecimal` nên giữ số lẻ không tốn thêm gì.

**⚠️ Chi tiết spec phải nói rõ với BE:** mentor nói "**lớn hơn 5** mới làm tròn" — tức chữ số đỏ **bằng 5 thì làm tròn XUỐNG**. Đây không phải `Math.round()` thông thường (vốn 5 lên 1):

```java
// ĐÚNG theo mentor
long reading = blackDigits + (redDigit > 5 ? 1 : 0);
// SAI: Math.round(blackDigits + redDigit / 10.0)  → redDigit = 5 sẽ lên 1
```

#### Ý 8 — chụp mặt đồng hồ nước vẫn bị từ chối

**Đã kiểm: đúng là lỗi, và có 2 nguyên nhân.**

**Nguyên nhân 1 — so khớp chuỗi con, không có ranh giới từ.** `meterPhoto.ts` khai:

```ts
const ELEC_HINTS = [ 'kwh', ..., 'wh', 'kw', ..., ' v ', ' a)', '(a)', ... ];
```

Rồi kiểm bằng `text.includes(k)`. Chuỗi `'wh'` là **chuỗi con của rất nhiều từ tiếng Anh** in trên đồng hồ nước. Dính một cái là:

```ts
if (hasOther && !hasOwn) → "Ảnh này trông là đồng hồ điện, không phải đồng hồ nước"
```

→ chụp đúng đồng hồ nước vẫn bị đuổi. `' v '` và `'kw'` cũng rủi ro tương tự.

**Nguyên nhân 2 — mặt số nước sạch quá thì rơi vào nhánh từ chối cuối.** Nhiều đồng hồ nước dân dụng chỉ có dãy số + ký hiệu `m³` nhỏ xíu. Vision hay đọc `m³` thành `m3`, `rn3`, hoặc bỏ hẳn. Khi đó `hasOwn = false`, `hasDevice = false` → rơi vào luật 5:

> *"Ảnh chỉ có con số, không thấy dấu hiệu của mặt đồng hồ nước..."*

**Hướng sửa:**
1. So khớp theo **ranh giới từ** (`\bwh\b`) thay vì `includes`, và bỏ hẳn các gợi ý quá ngắn/mơ hồ (`'wh'`, `'kw'`, `' v '`, `'lit'`).
2. Luật 2 (chụp nhầm loại) phải đòi **≥ 2 gợi ý** của loại kia mới dám từ chối — 1 gợi ý là quá mong manh.
3. Bổ sung `WATER_HINTS`: `'rn3'`, `'m^3'`, `'x0.001'`, `'q3'`, `'r160'`, `'r80'`, `'iso 4064'`, `'nuoc sach'`, `'cap nuoc'`, `'sawaco'`, `'hawacom'`, `'viwasupco'`.
4. Luật 5 nới thành: nếu OCR ra được **một dãy 4–8 chữ số liền mạch** thì cho qua với `confidence: 'low'` (bắt manager xác nhận) thay vì từ chối thẳng. Số ghi tay trên giấy hiếm khi ra dãy liền 5–8 số đều nhau, nên rào chống gian lận vẫn còn.

#### Ý 6 — thêm đọc đồng hồ điện tử

Đồng hồ điện tử khác đồng hồ cơ ở 3 điểm, phải xử cả 3:

1. **Màn LCD 7 đoạn** — Vision `TEXT_DETECTION` đọc kém. Đổi sang `DOCUMENT_TEXT_DETECTION` cho ảnh đồng hồ (BE, `OcrServiceImpl.readTextWithVision` dòng 237, sửa 1 chữ).
2. **Màn hình xoay vòng** — LCD tự đổi qua lại giữa tổng kWh / điện áp / dòng / T1 / T2. Chụp trúng lúc đang hiện điện áp là ra số vô nghĩa. → Phải đòi trên ảnh có chữ `kWh` hoặc `Total`/`T1`, không thấy thì bảo manager *"chờ màn hình chuyển sang trang kWh rồi chụp lại"*.
3. **Có dấu chấm thập phân in sẵn** — hiện `digitsOnly()` xoá sạch dấu chấm, `12345.6` thành `123456`. Phải giữ dấu chấm cho nhánh điện tử.

Bổ sung `ELEC_HINTS` cho điện tử: `'total'`, `'t1'`, `'t2'`, `'rate'`, `'imp'`, `'exp'`, `'active'`, `'lcd'`, `'ddsy'`, `'dtsd'`.

---

### N3. 🟡 Đường thoát khi máy móc hỏng — ý 2, 5

#### Ý 2 — "Vision phải chạy được offline phòng lúc demo mất mạng"

Nói thẳng: **chạy Vision offline không cứu được buổi demo mất mạng.** Vì nếu mất mạng thì:

- `uploadImageToCloudinary()` chết → chưa có URL để mà gửi đi đâu
- `realApiClient` chết → không đăng nhập, không tải hợp đồng, không lưu gì
- App coi như không dùng được, chứ không riêng gì Vision

→ Rủi ro thật cần phòng là hẹp hơn: **mạng vẫn có nhưng Google Vision lỗi / hết quota / bị chặn**. (BE giới hạn 20 ảnh/giờ/tài khoản — demo thử vài lần là chạm trần rất dễ.)

Đề xuất **2 lớp**, làm lớp 1 trước:

**Lớp 1 — đường lùi cục bộ (làm ngay, không cần build lại app).**
Vision lỗi thì không chặn: giữ ảnh, mở ô nhập tay, gắn cờ "chưa kiểm chứng máy", bắt tick xác nhận + (nếu BE kịp) nhập passcode ở ý 5. Ảnh vẫn được lưu làm bằng chứng đối soát sau. Hiện `validateRoomPhoto` **đã fail-open** như vậy, nhưng OCR đồng hồ thì đang **fail-closed** — sửa cho đồng nhất.

**Lớp 2 — OCR chạy thẳng trên máy (nếu còn thời gian, phải build lại).**

```bash
npx expo install @react-native-ml-kit/text-recognition @react-native-ml-kit/image-labeling
npx expo prebuild && eas build -p android --profile preview
```

ML Kit của Google chạy **hoàn toàn offline**, model nhúng sẵn trong APK, không gọi mạng, không quota, không tốn tiền. Đọc trước bằng ML Kit, chỉ khi kết quả yếu mới gọi lên server.

Lưu ý trước khi quyết:
- Không chạy trên Expo Go và không chạy trên web — phải là dev/prod build (dự án đã có `expo-dev-client` nên OK).
- APK nặng thêm ~5–10 MB.
- **Phải build lại app** → nếu sát ngày demo thì hoãn lớp 2 sang sau, chỉ làm lớp 1.

#### Ý 5 — passcode xin admin khi không chụp được ảnh

Đúng hướng: cho nhập tay nhưng phải có rào, vì đây chính là lỗ hổng mà cả cơ chế bắt chụp ảnh đang bịt (comment đầu `meterPhoto.ts` ghi rõ: không có rào thì *"người chụp có thể ghi số ra giấy rồi chụp tờ giấy"*).

- **BE:** `POST /api/v1/manager/meter-override/verify` + bảng audit `MeterOverrideLog` + `GET /api/v1/admin/meter-overrides` → `BE-NEED` mục 3.
- **FE (mình):** khi camera hỏng / OCR chết → nút *"Không chụp được — xin mã từ quản trị"* → modal nhập passcode + **lý do bắt buộc** → mở ô nhập số, gắn nhãn đỏ "Nhập tay có mã" lên bản ghi.

Đường tạm nếu BE chưa kịp: dùng lại `manualEdited` / `manualConfirmed` đã có sẵn trong `OnboardingScreenV2` (dòng 261, 720) — bắt tick xác nhận + ghi lý do vào note. Không an toàn bằng nhưng demo được.

---

### N4. 🟢 Mất dấu khách đang đón dở — ý 13

**Đã tìm ra, và sửa rất nhẹ.**

`ResumeContractScreen.tsx:113-114` chỉ gọi 2 nhánh:

```ts
realTenantService.listManagedContracts(),        // → 3 trạng thái duyệt giá
realTenantService.listManagedContracts('DRAFT'), // → hợp đồng nháp
```

Nhưng khách đã bấm tạo mã thanh toán mà chưa xong OTP thì HĐ ở trạng thái **`PENDING`** — không thuộc nhóm nào ở trên → biến mất khỏi màn hình.

BE **đã hỗ trợ sẵn** (`getManagedContracts` dòng 393 có nhánh `DRAFT`/`PENDING`), FE chỉ chưa gọi:

```ts
realTenantService.listManagedContracts('PENDING')
```

Kèm 2 việc nhỏ:
- Ô tìm kiếm hiện chỉ lọc `tenantFullName` (dòng 66). Thêm SĐT, số phòng, `contractCode` — mentor nói *"search không ra tên gì"* chính là chỗ này.
- Nhóm danh sách theo trạng thái, nhóm "Chờ thanh toán / chờ OTP" đưa lên đầu kèm badge thời gian ("bỏ dở 2 giờ trước").

**Chặn demo: không.** Sửa hoàn toàn phía FE, ~1 giờ.

---

### N5. 🟢 Xoá dòng hình thức thu cọc — ý 9

`OnboardingScreenV2.tsx` dòng 2121–2131: nhãn *"Hình thức thu cọc"* + 1 chip *"💳 Chuyển khoản (PayOS)"* — chip này **không bấm được, không có lựa chọn nào khác** (`View`, không phải `TouchableOpacity`). Đúng là UI thừa.

Xoá cả nhãn lẫn khối chip, giữ lại dòng hint và nút "Tiếp tục". ~10 phút.

---

### N6. 🟡 Web admin: tiến độ nhận nhà / giao phòng — ý 16

Đã kiểm `frontend-web/src/pages/admin/`: chữ "bàn giao" chỉ xuất hiện ở **thiết bị bàn giao** (`HandoverEquipmentSection`), tức danh sách đồ đạc từ file import. **Không có chỗ nào theo dõi tiến độ vận hành.**

Dữ liệu thì có sẵn trong DB, chỉ thiếu endpoint gom lại:

| Mốc | Suy từ |
|---|---|
| Manager đã nhận nhà từ host | `PropertyStatus`: `PENDING_OPERATION_MANAGER` → `ACTIVE` |
| Manager đã giao phòng cho tenant | `TenantContract.status = ACTIVE` + `moveInDate` + ảnh hiện trạng + chỉ số điện/nước chốt lúc đón |

- **BE:** `GET /api/v1/admin/handover-status` → `BE-NEED` mục 5.
- **FE (mình):** trang admin **mới** (không đụng `BillingPaymentMonitoring.tsx`), dạng bảng theo toà nhà: cột trạng thái nhà · quản lý phụ trách · X/Y phòng đã giao · phòng nào thiếu ảnh/chỉ số.

---

### N7. 🟢 Dữ liệu demo — ý 1

BE có `config/SampleDataSeeder.java`, chỉ cần mở rộng: 25 căn / 50 tenant / 50 HĐ, chia trạng thái để demo được mọi nhánh → `BE-NEED` mục 7.

⚠️ **Kèm điều kiện bắt buộc:** phải sửa `generateContractCode()` cùng lúc. Hàm này sinh mã bằng `count() + 1` mà cột `contract_code` là `unique` — seed 50 bản ghi xong rồi đón khách thật là **trùng mã ngay lập tức**, luồng onboard chết. (Bạn FE bên kia đã báo lỗi này ở mục 6b doc của bạn ấy; trên nhánh BE mình đọc thì vẫn còn nguyên.) → `BE-NEED` mục 8.

---

## Phần D — Thông báo đẩy

**Đã tìm ra lý do chưa có thông báo nào và đã sửa.**

Toàn bộ đường ống đã được nối từ trước (xin quyền, lấy token, gửi lên BE, tạo kênh Android, điều hướng khi bấm, BE gọi Expo Push API). Hỏng ở đúng một dòng cấu hình: `.env` để trống `EXPO_PUBLIC_EAS_PROJECT_ID`, mà `constants/api.ts` chỉ đọc mỗi biến đó → `getExpoToken()` thoát sớm → **không máy nào từng đăng ký token** → BE gửi cho ai cũng rơi vào `token == null → return`.

Trong khi `app.json` đã có sẵn id từ lúc `eas init`. Đã sửa `constants/api.ts` đọc `app.json` làm nguồn mặc định (env vẫn ghi đè được) — sửa ở đây thay vì điền `.env` vì cả 3 profile trong `eas.json` cũng không khai biến đó, điền `.env` thì build EAS vẫn hỏng.

**Còn 2 việc phải làm tay, không ai làm hộ được:**
1. Nạp khoá FCM V1 lên EAS (cần Firebase Console + `eas credentials`) — chưa có thì Expo trả `InvalidCredentials`, im lặng không báo gì.
2. Build lại app — bản APK hiện có được build từ code có `EAS_PROJECT_ID` rỗng nên không dùng lại được. Push cũng không chạy trên Expo Go.

Các bước chi tiết + cách kiểm tra từng mắt xích: **`SETUP-push-notifications-2026-08-08.md`**.

---

## Phần E — Thứ tự làm

### Đợt 1 — chặn demo, làm trước

| # | Việc | Ai | Ước lượng |
|---|---|---|---|
| 1 | Sinh hoá đơn + giao dịch cho tiền onboard (N1) | **BE** | 3–4h |
| 2 | Seed dữ liệu demo + sửa `generateContractCode` (N7) | **BE** | 2–3h |
| 3 | Nạp khoá FCM + build lại app | **bạn (thủ công)** | 1h |
| 4 | `ResumeContractScreen` gọi `?status=PENDING` + mở rộng ô tìm kiếm (N4) | FE mình | 1h |
| 5 | Xoá dòng hình thức thu cọc (N5) | FE mình | 10' |
| 6 | Tách phần thập phân chỉ số đồng hồ (N2 — ý 3, 7) | FE mình | 3h |
| 7 | Nới luật lọc ảnh đồng hồ nước (N2 — ý 8) | FE mình | 1–2h |

> Mục 6 nên ưu tiên cao hơn cảm giác ban đầu: hiện chỉ số đang bị ghi **sai gấp 10 lần**. Demo mà mentor bấm vào hoá đơn điện là lộ ngay.

### Đợt 2 — sau khi đợt 1 xong

| # | Việc | Ai |
|---|---|---|
| 8 | Push khi cọc được ghi nhận + `DELETE /me/push-token` | **BE** |
| 9 | Tenant xem được đã trả gì (N1 phần FE) | FE mình |
| 10 | Đọc đồng hồ điện tử: `DOCUMENT_TEXT_DETECTION` + giữ dấu chấm + gợi ý mới (N2 — ý 6) | BE 1 dòng + FE mình |
| 11 | Đường lùi khi Vision lỗi — lớp 1 (N3 — ý 2) | FE mình |
| 12 | Passcode override + audit (N3 — ý 5) | **BE** + FE mình |

### Đợt 3 — nếu còn thời gian

| # | Việc | Ai |
|---|---|---|
| 13 | ML Kit chạy offline trên máy — lớp 2 (N3 — ý 2) | FE mình, **phải build lại** |
| 14 | `GET /admin/handover-status` + trang web mới (N6 — ý 16) | **BE** + FE mình |

> Ý 17 **không có trong bảng nào** ở Phần E — toàn bộ (web + yêu cầu BE) thuộc bạn FE bên kia, xem Phần B mục 1.

---

## Phần F — Việc cần bạn quyết / tự làm

> Cập nhật 08/08/2026 sau khi BE đẩy 3 commit và FE code xong đợt 1.

### F1. ⛔ CÒN PHẢI QUYẾT — làm tròn số tiêu thụ ở kỳ hoá đơn

Phần FE đã xong và **không phụ thuộc quyết định này**: app gửi lên BE **giá trị thật còn nguyên phần lẻ** (`3081.5`), không làm tròn. Cột BE là `BigDecimal` nên giữ được.

Câu còn lại là **lúc phát hành hoá đơn thì làm tròn ở đâu** — việc của BE:

| Phương án | Cách tính | Sai số |
|---|---|---|
| **(a)** Làm tròn từng CHỈ SỐ rồi trừ | `round(3090.1) − round(3081.9)` = `3090 − 3082` = 8 | ±1 đơn vị mỗi kỳ. Điện ~0,3%, **nước ~7–12%** |
| **(b)** Trừ trước rồi làm tròn SỐ TIÊU THỤ ⭐ | `round(3090.1 − 3081.9)` = `round(8.2)` = 8 | ±0,5 đơn vị mỗi kỳ, và tổng cả đời HĐ vẫn khớp |

Mentor nói "chữ số đỏ lớn hơn 5 mới làm tròn" là mô tả cách đọc **chỉ số**, nên (a) đúng nguyên văn. Nhưng (b) cho ra cùng con số trong đa số trường hợp mà nước không bị lệch — **mình đề xuất (b)**, và với nước thì đằng nào cũng nên giữ số lẻ.

> Luật `>5` mình đã code đúng ý mentor (chữ số đỏ **bằng 5 thì xuống**, khác `Math.round`), test đủ 10 chữ số. Đổi sang (b) chỉ đổi chỗ áp dụng, không đổi luật.

### F2. ⛔ CÒN PHẢI QUYẾT — ML Kit offline (ý 2 lớp 2)

Có build lại app để chạy OCR trên máy không? **Phải `expo prebuild` + build native**, APK nặng thêm ~5–10 MB.

Lớp 1 (đường lùi khi Vision chết + passcode) **đã xong rồi**, nên demo không còn phụ thuộc lớp 2. Sát ngày demo thì mình khuyên hoãn.

### F3. ⛔ CÒN PHẢI QUYẾT — có làm trang tiến độ bàn giao (ý 16) trước demo không?

BE **đã có sẵn** `GET /api/v1/admin/handover-status` (cả bảng tóm tắt lẫn `?propertyId=` drill-down). Chỉ còn phần web của mình — một trang admin mới, không đụng file bạn FE kia. Ước lượng ~3–4h. Nói một tiếng là mình làm.

### F4. ✅ ĐÃ CHỐT — passcode

BE đã chọn giúp: **mã tĩnh trong env** `MANAGER_OVERRIDE_PASSCODE`, đổi ra token dùng-một-lần TTL 15 phút, khoá 5 phút sau 5 lần sai, có bảng audit. FE đã nối xong.

**→ Việc của bạn:** set biến env đó trên server và nhớ mã để demo. Chưa set thì BE trả lỗi "Chưa cấu hình MANAGER_OVERRIDE_PASSCODE".

### F5. ✅ ĐÃ CHỐT — ý 17

BE đã làm `GET /api/v1/manager/invoices/{id}` kèm `items[]` dù mình đã rút yêu cầu. Không còn gì phải quyết.

**→ Việc của bạn:** báo bạn FE kia là endpoint đã sẵn sàng để bạn ấy render.

---

## Phần G — Việc tay bạn phải làm (không ai làm hộ được)

| # | Việc | Chặn gì |
|---|---|---|
| G1 | Nạp khoá FCM V1 lên EAS + `google-services.json` (package `com.pinkyusteam.sep`) | **Toàn bộ push**. Chưa có thì Expo trả `InvalidCredentials`, im lặng không báo |
| G2 | `eas build -p android --profile preview` rồi cài lại máy demo | Push + mọi thay đổi FE đợt này |
| G3 | Set `MANAGER_OVERRIDE_PASSCODE` trên server | Ý 5 (nhập tay khi không chụp được ảnh) |
| G4 | Báo BE 2 lỗi ở Phần H | Ý 13 và ý 15 |

Chi tiết G1–G2: `SETUP-push-notifications-2026-08-08.md`.

---

## Phần H — Hai chỗ cần báo lại BE

**H1. Doc BE ghi sai đường dẫn.** `BE-READY-for-FE-mentor-feedback-2026-08-08.md` §5 viết `GET /api/v1/manager/contracts?status=PENDING` — **route này không tồn tại** (đã grep cả `src/main/java`). Route thật là `GET /api/v1/tenant-contracts/managed?status=PENDING`. FE mình đã dùng đúng route thật, nhưng ai đọc doc mà làm theo sẽ ăn 404.

**H2. Ý 15 phía BE chưa làm — và có vẻ hiểu nhầm.** `ManagerBillingServiceImpl.toManagerInvoice()` vẫn `.amount(invoice.getGrandTotal())` vô điều kiện, không có nhánh nào null theo role. Doc BE §11 xếp ý 15 vào "out of scope — FE constants", nhưng bạn FE kia xin BE null field vì **manager mở DevTools / bắt gói là đọc được số tiền** — ẩn ở FE không giải quyết được. Xem `BE-NEED-manager-money-visibility-2026-08-07.md` mục 3.

Đây là việc của bạn FE kia, nhưng nên báo sớm kẻo cả hai bên tưởng đã xong.
