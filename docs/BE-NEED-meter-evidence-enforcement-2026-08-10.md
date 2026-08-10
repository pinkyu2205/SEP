# BE NEED — Bắt buộc bằng chứng chỉ số đồng hồ + trần tạo mã

**Ngày:** 10/08/2026
**Người gửi:** team FE (mobile)
**Người nhận:** team BE
**Liên quan:** commit `b3be95c` (cơ chế OTP passcode), `92c87d8` (tách cọc / tiền nhà)

Hai việc, cùng một chủ đề: **cơ chế chống khai khống chỉ số điện nước hiện chỉ tồn tại trong giao diện app, BE chưa ràng buộc gì.**

---

## 1. 🔴 BE chưa bắt buộc phải có ảnh HOẶC mã

### Hiện trạng

`TenantOnboardingServiceImpl.applyMeterOverridesIfAny` (dòng ~529) chỉ tiêu thụ token khi **có token gửi lên VÀ không có ảnh**:

```java
boolean needElec = electricToken != null
        && (contract.getElectricMeterImageUrl() == null || contract.getElectricMeterImageUrl().isBlank());
boolean needWater = waterToken != null
        && (contract.getWaterMeterImageUrl() == null || contract.getWaterMeterImageUrl().isBlank());
if (!needElec && !needWater) {
    return;      // ← không gửi gì cả cũng rơi vào đây, và hợp đồng vẫn được tạo
}
```

Đã grep toàn file: **không có dòng nào ném lỗi khi thiếu cả ảnh lẫn mã.**

### Hậu quả

Gửi `initialElectricReading` mà không kèm ảnh, không kèm token → BE nhận bình thường. Nghĩa là toàn bộ chuỗi bắt chụp ảnh → xin mã admin → ghi audit **chỉ là quy ước trong app**. Gọi thẳng API bằng Postman, hoặc dùng bản app đã sửa, là bỏ qua sạch.

Điều này cũng làm hỏng giá trị của `meter_override_logs`: bảng đó hiện **chỉ ghi lại những người tử tế đủ để xin phép**. Người bỏ qua bằng chứng hoàn toàn không để lại dấu vết nào. Admin mở nhật ký thấy trống rồi tưởng không ai gõ tay chỉ số — trong khi thực tế không biết được.

Nói ngắn: passcode đang là **một cánh cửa dựng cạnh lỗ thủng trên tường**. Bịt lỗ thủng thì cửa mới có tác dụng.

### Cách sửa

Thêm một bước kiểm **trước khi** gọi `applyMeterOverridesIfAny`, ở CẢ HAI nơi đang gọi nó (onboard ~dòng 250, updateDraftContract ~dòng 884):

```java
/**
 * Ghi chỉ số thì phải có bằng chứng: ảnh mặt đồng hồ, HOẶC mã admin cấp.
 * Xét riêng từng đồng hồ — chụp được điện mà nước nằm trong hộp khoá là chuyện thường.
 */
private void requireMeterEvidence(
        BigDecimal reading, String imageUrl, UUID overrideToken, String label) {
    if (reading == null) {
        return;   // chưa tới bước ghi chỉ số thì không chặn
    }
    boolean hasPhoto = imageUrl != null && !imageUrl.isBlank();
    if (!hasPhoto && overrideToken == null) {
        throw new BusinessException(
                "Thiếu bằng chứng chỉ số " + label + ": cần ảnh mặt đồng hồ, "
                + "hoặc mã do admin cấp kèm lý do.");
    }
}
```

Gọi trước `applyMeterOverridesIfAny`:

```java
requireMeterEvidence(request.getInitialElectricReading(),
        request.getElectricMeterImageUrl(), request.getElectricMeterOverrideToken(), "điện");
requireMeterEvidence(request.getInitialWaterReading(),
        request.getWaterMeterImageUrl(), request.getWaterMeterOverrideToken(), "nước");
```

Ba điểm dễ làm sai, nhờ để ý:

| Điểm | Vì sao |
|---|---|
| Xét **riêng từng đồng hồ** | Chụp được điện, nước trong hộp khoá — phải cho điện đi nhánh ảnh, nước đi nhánh mã |
| Chỉ áp khi **có ghi chỉ số** | Hợp đồng nháp chưa tới bước đồng hồ thì không được chặn |
| Áp cho **cả `updateDraftContract`** | Chặn một cửa mà hở cửa kia thì như không |

Ở `updateDraftContract` nhớ lấy ảnh **sau khi đã merge request vào contract** (dòng ~869-882 gán `imageUrl` mới), chứ không phải giá trị cũ trong DB.

### ⚠️ Thứ tự triển khai — quan trọng

Sau khi siết, **mã trở thành đường duy nhất** khi không có ảnh. Nếu lúc đó server chưa cấp được mã thì manager tắc cứng, không còn lối vòng.

Nên làm theo đúng thứ tự:

1. Xác nhận luồng admin gen mã chạy được trên server (đã có `POST /api/v1/admin/meter-override/passcodes`)
2. Chạy thử trọn một vòng: admin tạo mã → manager nhập → submit chỉ số không ảnh → `GET /api/v1/admin/meter-overrides` có 1 dòng
3. **Rồi mới** bật ràng buộc này

Làm ngược lại là tự khoá mình đúng hôm demo.

---

## 2. 🔴 Không có trần số lần tạo mã

`generatePasscode` không giới hạn gì. Hai hằng số nghe giống nhưng không phải: `MAX_FAILS = 5` là số lần **nhập sai** mã, `MAX_GEN_ATTEMPTS = 20` là số lần **bốc lại khi trùng số ngẫu nhiên**.

Đo thật trên máy FE hôm nay: giữ phím Enter trên form tạo mã sinh ra **101 mã trong ~90 giây**. FE đã thêm chốt (khoá bằng ref + nghỉ 10 giây + trần 5 mã còn hạn chưa dùng), đo lại còn **1 mã cho 40 phím Enter**. Nhưng đó chỉ chặn được admin lỡ tay — ai có token vẫn `curl` thẳng được.

Lý do cần trần không phải sợ BE quá tải (mỗi lần chỉ là một `INSERT`), mà là **mỗi mã còn hạn là một chiếc chìa khoá đang trôi nổi**, mở được cửa bỏ qua ảnh đồng hồ trong suốt thời gian còn hiệu lực.

```java
private static final int MAX_GEN_PER_HOUR = 20;

long recent = passcodeRepository.countByCreatedByAndCreatedAtAfter(adminId, now.minusHours(1));
if (recent >= MAX_GEN_PER_HOUR) {
    throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
            "Đã tạo quá nhiều mã trong 1 giờ. Chờ ít phút rồi thử lại.");
}
```

FE đã bắt sẵn 429 và hiện `message` của BE — không phải sửa gì thêm.

---

## 3. Dọn mã hết hạn — nên có, không gấp

Không có job dọn nào; bảng `meter_override_passcodes` chỉ thêm, không bao giờ bớt. Máy FE mới một buổi thử đã 133 dòng.

Mã **đã dùng** thì nên giữ (đó là dấu vết cho admin soi). Chỉ mã **chưa ai dùng mà đã hết hạn** là rác thuần tuý:

```sql
DELETE FROM meter_override_passcodes
WHERE used_at IS NULL AND expires_at < NOW() - INTERVAL '7 days';
```

Một `@Scheduled` chạy hằng ngày là đủ.

---

## 4. Ghi nhận — mấy chỗ này làm đúng, đừng gỡ

| Chi tiết | Vì sao phải giữ |
|---|---|
| Mã OTP **chết ngay khi verify** (`usedAt`/`usedBy`) | Không cho dùng lại; và biết ai đã dùng |
| `overrideToken` buộc theo `managerId` + `meterKind` + TTL + dùng 1 lần | Mã xin cho điện không dùng được cho nước |
| Bắt buộc `reason`, ghi vào `meter_override_logs` | Người dùng biết phải giải trình thì tự khắc hạn chế xin cho tiện tay |
| Chỉ tiêu thụ token khi **không có ảnh** | Có ảnh mà lỡ gửi kèm token thì không đốt mã oan |
| Sai 5 lần khoá 5 phút | Chặn dò mã 6 số |
| `contractId` nhận `null` | Đúng nghiệp vụ: mã được xin lúc hợp đồng chưa tồn tại |

---

## 5. Tóm tắt

| # | Việc | Công | Trước demo? |
|---|---|---|---|
| 1 | Bắt buộc ảnh HOẶC mã khi ghi chỉ số (2 call site) | 20 phút | 🔴 **nên làm** — nhưng phải test vòng cấp mã trước |
| 2 | Trần 20 mã/giờ/admin → 429 | 10 phút | 🔴 **nên làm** |
| 3 | Job dọn mã hết hạn chưa dùng | 15 phút | ❌ sau demo |

Mục 1 là mục biến toàn bộ cơ chế từ **quy ước trong app** thành **ràng buộc thật**. Chưa có nó thì mọi thứ còn lại chỉ làm khó người dùng ngay tình.
