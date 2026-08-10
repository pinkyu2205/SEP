# BE NEED — Chống phụ thuộc Google Vision khi đọc chỉ số đồng hồ

**Ngày:** 09/08/2026
**Người gửi:** team FE (mobile)
**Người nhận:** team BE
**Bối cảnh:** mentor 07/08/2026 yêu cầu *"gg vision cloud phải chạy được offline phòng trường hợp lúc demo lại không kết nối được"*. Doc này trả lời phần **BE làm được gì**.
**Liên quan:** `PLAN-mlkit-offline-ocr-2026-08-09.md` (phần chạy trên máy)

---

## 0. Chốt trước cho khỏi hiểu nhầm: BE KHÔNG cho ra "offline"

ML Kit là SDK Android/iOS, **không có bản chạy trên server** — bản server-side của Google chính là Cloud Vision mà BE đang dùng.

Và kể cả BE tự OCR bằng engine riêng thì cũng **không giải quyết được "mất mạng"**:

| OCR chạy ở đâu | App còn cần mạng? | Thoát phụ thuộc Google? |
|---|---|---|
| Google Vision Cloud (hiện tại) | Có | ❌ |
| **BE tự OCR** | **Vẫn có** — app phải gọi được tới BE, phải upload ảnh | ✅ |
| ML Kit trên máy | Không (riêng bước đọc số) | ✅ |

→ Việc BE làm được là **bỏ phụ thuộc vào Google** (quota, chi phí, sự cố phía Google), **không phải** làm app chạy offline.

Rủi ro thật cần bịt, theo thứ tự dễ xảy ra:

1. Chạm trần rate limit lúc demo
2. Đường dự phòng OCR.space không hoạt động
3. Vision lỗi / hết quota / bị chặn

Mục 1 và 2 sửa được **hôm nay, gần như miễn phí**. Mục 3 mới cần engine mới.

---

## 1. 🔴 Đường dự phòng OCR.space đang dùng key demo công cộng

`application.yaml` dòng 68–71:

```yaml
ocr:
  space:
    base-url: https://api.ocr.space/parse/image
    api-key: ${OCR_SPACE_API_KEY:helloworld}
```

`helloworld` là **key demo dùng chung toàn thế giới** của OCR.space — giới hạn rất gắt và thường xuyên bị chặn. Nghĩa là: khi Vision lỗi, `readMeterWithOcrSpace()` được gọi và **gần như chắc chắn cũng lỗi nốt**. Đường dự phòng hiện tại chỉ tồn tại trên giấy.

**Đề nghị:** đăng ký key free riêng tại https://ocr.space/ocrapi (25.000 request/tháng, miễn phí) rồi set:

```bash
OCR_SPACE_API_KEY=<key riêng của nhóm>
```

Mất 5 phút, không phải sửa code.

---

## 2. 🔴 Trần 20 ảnh/giờ/tài khoản quá thấp cho demo

`VisionServiceImpl`:

```java
@Value("${vision.rate-limit-per-hour:20}")
private int rateLimitPerHour;
```

Lúc demo, manager hay chụp đi chụp lại (ảnh mờ, chụp nhầm ô, thử nhiều phòng). 20 ảnh/giờ là chạm trần rất nhanh, và khi chạm thì BE ném lỗi → FE phải chuyển sang nhập tay giữa lúc đang trình bày.

**Đề nghị:** nâng cho môi trường demo:

```bash
VISION_RATE_LIMIT_PER_HOUR=100
```

(Nếu `application.yaml` chưa map biến env cho khoá này thì bổ sung `rate-limit-per-hour: ${VISION_RATE_LIMIT_PER_HOUR:20}`.)

---

## 3. 🟡 Cache kết quả OCR theo ảnh — tiết kiệm quota, không đổi hành vi

Hiện mỗi lần gọi `POST /api/v1/ocr/meter` đều bắn thẳng lên Google, **kể cả khi cùng một tấm ảnh**. Lúc demo/kiểm thử hay gọi lại đúng URL Cloudinary cũ (mở lại màn, retry, đối chiếu).

**Đề nghị:** cache theo `imageUrl` (hoặc hash của URL), TTL 24h:

```java
// key = imageUrl, value = OcrMeterResponse
// Ảnh trên Cloudinary là bất biến theo URL nên cache không bao giờ trả kết quả cũ sai.
@Cacheable(value = "ocrMeter", key = "#imageUrl")
public OcrMeterResponse readMeter(String imageUrl) { ... }
```

Dùng `ConcurrentMapCacheManager` là đủ, không cần Redis. Lợi ích: retry không tốn quota, phản hồi tức thì cho ảnh đã đọc.

---

## 4. 🟢 Nếu muốn BỎ HẲN Google — chọn engine nào

Chỉ làm khi mục 1–3 vẫn chưa đủ. Đây là việc lớn, **không nên làm trước demo**.

### Đừng chọn Tesseract

Chính comment trong `OcrServiceImpl` của BE đã ghi lại kết quả thực nghiệm:

> *"OCR.space KHÔNG đọc được mặt công tơ cơ (chữ số nằm trong từng ô có khe, nền đen, hàng lẻ màu đỏ) — đã thử crop đúng ô số, phóng to, đảo màu, tăng tương phản và cả OCREngine 1 lẫn 2, tất cả đều ra rác kiểu `1013 p 18`. Cùng ảnh đó Vision đọc ra thẳng `030815 kWh`."*

Tesseract cùng thế hệ kỹ thuật với engine của OCR.space, và vốn nổi tiếng dở với mặt số cơ khí lẫn font 7 đoạn. Gần như chắc chắn ra kết quả tương đương hoặc tệ hơn — tốn công mà không dùng được.

### Ứng viên thật: PaddleOCR (sidecar Python)

| | Chi tiết |
|---|---|
| Chất lượng mặt đồng hồ | Gần Vision, hơn hẳn Tesseract/OCR.space |
| Triển khai | Service Python riêng (FastAPI), Spring gọi qua HTTP nội bộ |
| Tài nguyên | ~1–2 GB RAM, model ~10–20 MB. **Cần xác nhận VPS kham nổi** |
| Chi phí | 0 (self-host) |
| Công | ~2–3 ngày gồm dựng service, nối vào chuỗi fallback, và **đo lại chất lượng trên ảnh đồng hồ thật** |

Nối vào cuối chuỗi hiện có, giữ nguyên thứ tự ưu tiên:

```
Vision (tốt nhất) → PaddleOCR (self-host) → OCR.space (chót) → ném lỗi, FE cho nhập tay
```

**Câu hỏi cần BE/DevOps trả lời trước khi quyết:** VPS hiện tại còn bao nhiêu RAM trống? Nếu dưới 2 GB thì phương án này không khả thi, phải nâng cấp máy trước.

---

## 5. FE không phải sửa gì

Hợp đồng API giữ nguyên trong mọi phương án trên:

```
POST /api/v1/ocr/meter   { imageUrl }  →  { reading, numbers, rawText }
```

FE dùng chung một shape cho cả đường server lẫn (sau này) đường chạy trên máy — toàn bộ logic tách phần thập phân, chấm điểm chọn số, kiểm ảnh đều nằm ở `mobile-app/src/utils/meterPhoto.ts` và **không phụ thuộc engine nào đọc**.

⚠️ Vì vậy: **đổi shape response là hỏng cả hai đường.** Nếu buộc phải đổi, báo FE trước.

---

## 6. Tóm tắt đề nghị

| # | Việc | Công | Trước demo? |
|---|---|---|---|
| 1 | Set `OCR_SPACE_API_KEY` thật | 5 phút | ✅ **Nên làm** |
| 2 | Nâng `VISION_RATE_LIMIT_PER_HOUR=100` | 5 phút | ✅ **Nên làm** |
| 3 | Cache OCR theo `imageUrl`, TTL 24h | ~1h | Nếu rảnh |
| 4 | PaddleOCR sidecar | 2–3 ngày | ❌ Sau demo |
| — | Tesseract | — | ❌ Đừng làm |

Mục 1 + 2 tốn 10 phút và bịt được đúng hai rủi ro dễ xảy ra nhất trong buổi demo.
