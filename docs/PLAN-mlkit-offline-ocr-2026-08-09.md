# PLAN — Đọc đồng hồ OFFLINE bằng ML Kit (ý mentor số 2, lớp 2)

**Ngày:** 09/08/2026
**Trạng thái:** chưa làm — **chờ quyết định có build native trước demo không**
**Lớp 1 (đường lùi khi Vision chết) đã xong**, nên demo KHÔNG phụ thuộc doc này.

---

## 1. Làm rõ lại yêu cầu

Mentor nói: *"gg vision cloud phải chạy được offline phòng trường hợp lúc demo lại không kết nối được"*.

Nói thẳng: **mất mạng thì app chết toàn tập, không riêng gì Vision.**

| Bước | Cần mạng? |
|---|---|
| Đăng nhập (`/auth/login`) | ✅ có |
| Tải danh sách nhà / phòng / hợp đồng | ✅ có |
| `uploadImageToCloudinary()` | ✅ có |
| `POST /api/v1/ocr/meter` (Vision) | ✅ có |
| Lưu hợp đồng, tạo QR PayOS | ✅ có |

Ảnh phải nằm trên Cloudinary thì Vision mới đọc được — mất mạng là **chưa có URL để mà gửi đi đâu**. Nên chạy OCR offline không cứu được kịch bản mất mạng.

**Rủi ro THẬT cần phòng** hẹp hơn nhiều — mạng vẫn có nhưng:

- Google Vision hết quota / bị chặn / lỗi 5xx
- **BE giới hạn 20 ảnh/giờ/tài khoản** (`VisionServiceImpl`) — demo thử vài lượt là chạm trần rất dễ
- Wifi hội trường chập chờn, request timeout 30s

### Lớp 1 — ĐÃ XONG, giải quyết đúng rủi ro này

| Cơ chế | Trạng thái |
|---|---|
| Vision lỗi → vẫn giữ ảnh, mở ô nhập tay, gắn cờ "chưa kiểm chứng" | ✅ |
| `validateRoomPhoto` fail-open khi Vision chết | ✅ |
| Không chụp được ảnh → xin passcode admin, nhập tay có audit (ý 5) | ✅ |
| Nhập tay bắt tick cam kết chịu trách nhiệm | ✅ |

→ Demo hiện đã **không thể bị chặn** vì Vision, bất kể lý do gì.

Lớp 2 dưới đây là để **chạy nhanh hơn, không tốn quota, không tốn tiền** — không phải để cứu demo.

---

## 2. Lớp 2 — ML Kit chạy thẳng trên máy

Google ML Kit nhúng model **vào trong APK**, chạy bằng CPU/NPU của điện thoại. Không gọi mạng, không quota, không tính phí.

### 2.1. Cần cài gì

```bash
cd mobile-app
npx expo install @react-native-ml-kit/text-recognition
# tuỳ chọn — thay cho /vision/labels (kiểm ảnh phòng, ảnh thiết bị):
npx expo install @react-native-ml-kit/image-labeling
```

### 2.2. Cần build lại native — đây là điểm mấu chốt

Hai thư viện trên là **native module**, không chạy trong Expo Go và không chạy trên web.

```bash
npx expo prebuild            # ghi lại thư mục android/ (dự án đã có sẵn)
eas build -p android --profile preview
```

| Ảnh hưởng | Chi tiết |
|---|---|
| Kích thước APK | +5–10 MB (model text recognition nhúng sẵn) |
| Thời gian build | ~15–25 phút trên EAS |
| Web | **Không chạy** — phải giữ nguyên đường gọi server làm fallback |
| Expo Go | Không chạy |
| Rủi ro | `expo prebuild` ghi đè `android/` — nếu ai đó từng sửa tay file native trong đó thì mất |

### 2.3. Cần sửa code gì

Thêm **một** file service, rồi đổi **một** dòng ở mỗi màn — không đụng vào `utils/meterPhoto.ts`, vì toàn bộ logic tách số / chấm điểm / kiểm ảnh đã tách sẵn khỏi nguồn OCR.

```ts
// src/services/shared/localOcrService.ts (mới)
import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { MeterOcrLike } from '@/utils';

/**
 * Đọc chữ trong ảnh NGAY TRÊN MÁY. Trả về đúng shape `MeterOcrLike` mà
 * `validateMeterPhoto` đang nhận, nên phần dưới không phải sửa gì.
 * `uri` là file cục bộ (chưa upload) — khác hẳn đường server vốn đòi URL Cloudinary.
 */
export async function readMeterLocally(uri: string): Promise<MeterOcrLike | null> {
  try {
    const result = await TextRecognition.recognize(uri);
    const rawText = result.text ?? '';
    if (!rawText.trim()) return null;
    return {
      rawText,
      numbers: (rawText.match(/\d[\d.,]*/g) ?? []).filter(n => n.replace(/\D/g, '').length >= 2),
      reading: '',   // để pickReading trong meterPhoto.ts tự chọn
    };
  } catch {
    return null;    // fail-open, rơi về đường server
  }
}
```

Rồi ở `processMeterImage` của `OnboardingScreenV2` (và 2 màn kia):

```ts
// Đọc CỤC BỘ trước — không tốn quota, không chờ mạng, chạy trên ảnh chưa upload.
let ocr = await readMeterLocally(uri);
const local = validateMeterPhoto(kind, ocr);

// Chỉ nhờ tới server khi máy đọc không ra kết quả tin được.
if (!local.ok || !local.reading) {
  const url = await uploadImageToCloudinary(uri);
  ocr = await realTenantService.ocrMeter(url);
}
```

> Vẫn phải upload ảnh lên Cloudinary trong **mọi** trường hợp — ảnh là bằng chứng đối soát, không được chỉ nằm trên máy. Chỉ khác là upload chạy song song/sau, không chặn việc đọc số.

### 2.4. Cái ML Kit làm TỆ hơn Vision

Đây là lý do không nên bỏ hẳn đường server:

| | ML Kit trên máy | Google Vision Cloud |
|---|---|---|
| Chữ số cơ khí rõ nét | Tốt | Tốt |
| **Màn LCD 7 đoạn** (công tơ điện tử) | **Kém** — model không được huấn luyện cho font 7 đoạn | Khá hơn, nhất là với `DOCUMENT_TEXT_DETECTION` (BE đã đổi) |
| Ảnh mờ / nghiêng / loá | Kém hơn rõ rệt | Tốt hơn |
| Chữ số trong ô có khe (công tơ EMIC) | Trung bình | Tốt |
| Tốc độ | ~200–500 ms | 2–5 s (kèm upload) |
| Chi phí / quota | 0 | Tính tiền + trần 20 ảnh/giờ/tài khoản |

→ Chiến lược đúng là **máy đọc trước, server đọc lại khi máy không chắc** — như đoạn code ở 2.3, chứ không thay thế hoàn toàn.

---

## 3. Ước lượng công

| Việc | Thời gian |
|---|---|
| Cài package + `expo prebuild` | 30' |
| Viết `localOcrService.ts` | 1h |
| Nối vào 3 màn (onboard / resume / checkout) | 1h |
| Build EAS + cài máy thật | 30' (chờ) |
| **Thử thật trên đồng hồ thật** — không bỏ qua được, phải soi ML Kit đọc ra gì | 2–3h |
| **Tổng** | **~5–6h + 1 lượt build** |

Phần tốn nhất là mục thử thật: phải chụp đủ công tơ cơ, công tơ điện tử, đồng hồ nước rồi so kết quả hai đường. Không làm bước này thì không biết ngưỡng "máy đọc không chắc" đặt ở đâu.

---

## 4. Khuyến nghị

**Hoãn tới sau demo**, vì:

1. Lớp 1 đã bịt kín rủi ro thật — demo không thể bị Vision chặn nữa.
2. Bắt buộc build native. Sát ngày demo mà `expo prebuild` + build EAS hỏng thì mất luôn bản chạy được đang có.
3. Phần thử thật 2–3h là không nén được, mà nén thì chất lượng đọc số tệ hơn hiện tại — đúng chỗ đang tính ra tiền.

**Nếu vẫn muốn làm trước demo** thì bắt buộc:
- Build **một bản riêng**, giữ nguyên APK hiện tại làm bản dự phòng
- Thử ít nhất 10 ảnh đồng hồ thật trước khi thay bản demo
- Giữ nguyên đường server làm fallback (đừng gỡ)

---

## 5. Việc cần BE (nếu làm lớp 2)

Gần như không có. Hai điểm nhỏ:

1. **Nới trần 20 ảnh/giờ/tài khoản** cho tài khoản demo — lớp 2 làm giảm số lần gọi nhưng ảnh khó vẫn phải nhờ server, mà lúc demo hay chụp đi chụp lại.
2. Xác nhận `POST /api/v1/ocr/meter` vẫn giữ nguyên hợp đồng (`{ imageUrl }` → `{ reading, numbers, rawText }`). FE dùng chung một shape cho cả hai đường, đổi là hỏng cả hai.
