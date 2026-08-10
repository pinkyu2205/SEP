# BE PLAN — Tách `VisionProvider` (Strategy) + model nhận diện chạy trong JVM

**Ngày:** 09/08/2026
**Người gửi:** team FE
**Người nhận:** team BE
**Mục tiêu:** trả lời trực diện ý mentor số 2 — *"rớt kết nối Google Vision thì hệ thống vẫn nhận diện được"* — và có phần "nhóm tự train model" để chấm điểm SEP.
**Liên quan:** `BE-NEED-ocr-resilience-2026-08-09.md` (phần OCR đồng hồ), `PLAN-mlkit-offline-ocr-2026-08-09.md` (phần chạy trên máy)

---

## 0. ⚠️ PHẠM VI — đọc kỹ mục này trước

Hệ thống đang gọi Google **ở HAI đường khác nhau**, và kế hoạch này chỉ thay được MỘT:

| Endpoint | Việc | Loại bài toán | Model local thay được? |
|---|---|---|---|
| `POST /api/v1/vision/labels` — ảnh **THIẾT BỊ** | Nhận diện vật thể (máy lạnh, tủ lạnh...) | Image **classification** | ✅ **Có — đây là phạm vi** |
| `POST /api/v1/vision/labels` — ảnh **HIỆN TRẠNG PHÒNG** | Kiểm ảnh có phải cảnh trong nhà không | Image classification | ⛔ **ĐÃ CHỐT BỎ** (09/08/2026) |
| `POST /api/v1/ocr/meter` | Đọc CHỈ SỐ trên mặt đồng hồ điện/nước | **OCR** (text detection + recognition) | ❌ Không |

### Vì sao bỏ phần hiện trạng phòng (chốt 09/08/2026)

- Nó chỉ chiếm **1 lớp** trong dataset — 65 nhãn tiếng Anh của `ROOM_LABELS` chỉ để trả lời một câu nhị phân "có phải ảnh trong nhà không". Bỏ đi tiết kiệm rất ít công (xem mục 4), nhưng **thu hẹp phạm vi để làm xong sớm hơn**.
- **Không làm xấu đi hiện trạng.** `validateRoomPhoto` của FE vốn đã **fail-open** khi Vision lỗi — hôm nay Google chết thì ảnh phòng đã được cho qua không kiểm rồi. Bỏ khỏi model local nghĩa là giữ nguyên hành vi đó, không phải mất mát mới.
- Google vẫn quét ảnh phòng như thường khi còn sống. Chỉ khi rơi xuống provider local mới không kiểm.
- Phần giá trị cao nhất — nhận diện **thiết bị** và chặn ảnh gian lận — vẫn giữ nguyên. Đây là chỗ dùng để quyết toán bồi thường lúc trả phòng.

> ⚠️ Vẫn **giữ 1 lớp "nội thất / trong nhà"** làm lớp bối cảnh. Không phải để kiểm ảnh phòng, mà vì `validateEquipmentPhoto` có **luật 4 (luật ngược)** dựa vào `INDOOR_ISH_LABELS` (`wall`, `ceiling`, `floor`, `room`...). Thiếu lớp này thì ảnh chụp cận vết nứt tường / góc sàn hỏng sẽ bị đuổi oan là *"không thấy thiết bị nào"*.

**MobileNetV3 là model phân loại ảnh — nó không đọc được chữ số.** Muốn đọc chỉ số đồng hồ offline thì cần một model hoàn toàn khác (PP-OCR / CRNN + detector), là bài toán nặng hơn hẳn và không dùng chung dataset.

→ **Quét đồng hồ điện/nước vẫn phụ thuộc Google 100%.** Phần đó xử lý riêng ở `BE-NEED-ocr-resilience-2026-08-09.md` (trước mắt: set key OCR.space thật + nâng rate limit, 10 phút).

Nói với mentor cho đúng: *"nhận diện thiết bị đã có model chạy nội bộ, mất Google vẫn chạy. Đọc chỉ số đồng hồ và kiểm ảnh hiện trạng phòng vẫn dùng dịch vụ ngoài, có đường lùi nhập tay có kiểm soát."*

---

## 1. Bước 1 — Tái cấu trúc thành Strategy (bắt buộc, làm trước)

Đây là phần **đáng làm nhất**: không cần AI, làm được ngay, và chính nó là câu trả lời kiến trúc cho mentor.

### 1.1. ⚠️ Vấn đề interface mà đề xuất ban đầu bỏ sót

Code hiện tại **không hề tải ảnh về**:

```java
// VisionServiceImpl.detectLabels(String imageUrl)
String body = buildRequestBody(imageUrl);   // gửi imageUri cho Google
// → Google TỰ đi tải ảnh từ Cloudinary
```

Model chạy trong JVM thì **phải có bytes**. Nếu đổi interface thành `detect(byte[])` như đề xuất ban đầu, BE sẽ phải tải ảnh về **kể cả khi dùng Google** — tức mỗi lần nhận diện tốn thêm một lượt tải ảnh vô ích, chậm hơn và tốn băng thông hơn hiện tại.

**Cách tránh:** truyền một nguồn ảnh LƯỜI, chỉ tải khi provider thật sự cần bytes.

```java
public interface VisionProvider {
    String name();                                  // "google" | "local"
    boolean isAvailable();                          // đã cấu hình key / đã nạp model chưa
    List<VisionLabelItem> detect(ImageSource src);
}

/**
 * Nguồn ảnh. `url` luôn có; `bytes()` chỉ tải khi provider cần (model local),
 * và cache lại trong 1 lần gọi để nhánh fallback không tải hai lần.
 */
public final class ImageSource {
    private final String url;
    private byte[] cached;

    public String url() { return url; }

    public byte[] bytes() {
        if (cached == null) cached = downloadOnce(url);   // HTTP GET Cloudinary
        return cached;
    }
}
```

- `GoogleVisionProvider` → dùng `src.url()`, giữ nguyên hành vi hiện tại, **không tải gì**
- `LocalVisionProvider` → gọi `src.bytes()`, tự tải khi tới lượt

### 1.2. Phân chia trách nhiệm

`VisionServiceImpl` **giữ nguyên** phần đang chạy tốt, chỉ thêm việc chọn provider:

| Ở lại `VisionServiceImpl` | Chuyển xuống provider |
|---|---|
| `validateImageUrl()` — chỉ nhận https Cloudinary của hệ thống | Gọi model / gọi API |
| `enforceRateLimit()` — 20 lượt/giờ/tài khoản | Map kết quả → `VisionLabelItem` |
| Chọn provider theo config + fallback | |
| Ném `BusinessException` tiếng Việt | |

> ⚠️ **Rate limit chỉ nên áp cho provider `google`.** Model local không tốn quota, không tốn tiền — chặn 20 lượt/giờ ở đó là tự trói. Đề nghị: đếm quota **sau khi** đã chọn được provider, và bỏ qua nếu là local.

### 1.3. Config + luồng fallback

```yaml
vision:
  provider: ${VISION_PROVIDER:auto}      # google | local | auto
  local:
    model-path: classpath:models/equipment-mobilenetv3.onnx
    labels-path: classpath:models/labels.txt
    min-score: 0.35
```

```java
public VisionLabelsResponse detectLabels(String imageUrl) {
    validateImageUrl(imageUrl);
    ImageSource src = ImageSource.of(imageUrl);

    for (VisionProvider p : providersInOrder()) {   // auto: [google, local]
        if (!p.isAvailable()) continue;
        if ("google".equals(p.name())) enforceRateLimit();   // chỉ Google mới tính quota
        try {
            return VisionLabelsResponse.builder().labels(p.detect(src)).build();
        } catch (Exception e) {
            log.warn("Vision provider {} lỗi, thử provider tiếp theo", p.name(), e);
            // KHÔNG ném ra ngoài — để rơi xuống provider sau
        }
    }
    throw new BusinessException("Không nhận diện được ảnh. Vui lòng thử ảnh khác.");
}
```

`auto` = Google trước (chất lượng tốt hơn), lỗi/timeout/hết quota thì tự rơi xuống local. **Đây chính là thứ mentor sẽ chấm.**

> Nên hạ timeout Google từ 30s xuống ~8s ở chế độ `auto` — chờ 30s rồi mới fallback thì trên UI vẫn là "treo", người dùng không thấy khác gì lỗi.

### 1.4. Làm được ngay, chưa cần model

Bước 1 có giá trị **kể cả khi chưa có model nào**: dựng `LocalVisionProvider` trả rỗng + `isAvailable() = false`, kiến trúc đã đúng, thêm model sau là cắm vào. Ước lượng **~4–6h**.

---

## 2. Bước 2 — Chọn engine chạy local

### Nhánh 1 (khuyên dùng) — Fine-tune MobileNetV3 → ONNX → nhúng JVM

| | |
|---|---|
| Base model | MobileNetV3-Small, pretrained ImageNet |
| Cách train | Transfer learning (đóng băng backbone, thay lớp cuối), Google Colab free, ~20–40 phút |
| Xuất | ONNX, ~5–10 MB (quantize INT8 còn ~3 MB) |
| Chạy trong JVM | `com.microsoft.onnxruntime:onnxruntime` hoặc DJL |
| Đóng gói | `src/main/resources/models/` → nằm trong JAR, không tải gì lúc chạy |

Đây là hướng **duy nhất** cho phép nói *"nhóm em tự train model"* — điểm cộng thật cho đồ án. Và với miền hẹp (ảnh phòng trọ VN thật), một model 23 lớp fine-tune tử tế **có cơ sở để chính xác hơn** Google Vision generic ở đúng miền đó.

### Nhánh 2 — CLIP zero-shot

Không cần dataset, đưa thẳng danh sách nhãn tiếng Anh vào. Đổi lại: model **90–180 MB**, và **~300–800 ms/ảnh trên 2 core** của VPS (xem 3.2) — chậm thấy rõ. Cũng không có gì để khoe là tự làm.

→ RAM 4 GB thì đủ chỗ, nhưng CPU mới là nút thắt. Chỉ dùng nếu hết thời gian gom dataset.

### Nhánh 3 — ImageNet-1k pretrained nguyên bản

Rẻ nhất nhưng có lỗ hổng thật: **ImageNet-1k không có lớp "air conditioner"** — mà điều hoà lại là lớp đầu tiên trong `CLASSES` của FE. Cũng thiếu toàn bộ lớp chặn (`poster`, `screenshot`, `meme`...). Chỉ nên coi là bước đệm để dựng xong đường ống ONNX rồi fine-tune lên thành Nhánh 1.

---

## 3. ✅ Bước 3 — Môi trường deploy: ĐÃ CHỐT, RAM đủ thoải mái

**Chốt 09/08/2026: demo chạy trên VPS `slms-api.duckdns.org`, KHÔNG dùng Render.**

| Thông số VPS | |
|---|---|
| CPU | 2 core Intel Xeon Gold |
| RAM | **4 GB** |
| Disk | 35 GB SSD NVMe U2 |
| Mạng | 100 Mbps, băng thông không giới hạn |

### 3.1. Ngân sách RAM — dư sức chạy

**Xác nhận 09/08/2026: VPS chạy CẢ PostgreSQL LẪN Spring Boot trên cùng một máy.**

| Thành phần | RAM ước tính |
|---|---|
| OS (Ubuntu minimal) | ~300 MB |
| nginx | ~30 MB |
| **PostgreSQL** (cùng máy — đã xác nhận) | ~400–600 MB |
| Spring Boot + JPA | ~600–700 MB |
| **ONNX Runtime + MobileNetV3-Small** | **~100–150 MB** |
| **Tổng** | **~1,5–1,8 GB / 4 GB** |

→ Còn dư **~2,2 GB**. Vẫn thoải mái kể cả khi gánh cả DB. Không còn rủi ro OOM như lo ngại ban đầu (bản trước của doc này viết theo giả định Render free 512 MB — **giả định đó đã sai, bỏ qua**).

Hệ quả:
- **Không bắt buộc** quantize INT8 vì RAM nữa (vẫn nên làm, xem 3.2 — lý do là tốc độ CPU).
- **Không cần** sidecar Python. Nhúng thẳng ONNX vào JVM đơn giản hơn hẳn, bớt một service phải quản.
- Nhánh 2 (CLIP, model 90–180 MB) giờ **vừa RAM**, nhưng vẫn không khuyên dùng — xem 3.2 và mục 2.

> ⚠️ Phần RAM "dư" **không hề lãng phí**: Linux đang dùng nó làm page cache cho PostgreSQL. Lấy 150 MB cho ONNX là chấp nhận được ở quy mô DB hiện tại (ảnh nằm trên Cloudinary, DB chỉ có bản ghi), nhưng đừng nghĩ 2,2 GB đó là "chỗ trống muốn dùng sao thì dùng".

### 3.2. 🔴 Ràng buộc thật không phải RAM, mà là CPU

Chỉ có **2 core**, và giờ có **BA** thứ tranh nhau: PostgreSQL, Spring Boot, và inference.

ONNX Runtime **mặc định lấy hết số core** để chạy inference. Không giới hạn thì mỗi lượt nhận diện sẽ giành sạch CPU của Tomcat → các request khác đứng hình đúng lúc đó.

```java
var opts = new OrtSession.SessionOptions();
opts.setIntraOpNumThreads(1);      // BẮT BUỘC: chừa core còn lại cho web
opts.setInterOpNumThreads(1);
```

Tốc độ ước tính trên 2 core:

| Model | Thời gian / ảnh |
|---|---|
| MobileNetV3-Small INT8 | ~30–80 ms ✅ |
| MobileNetV3-Small FP32 | ~80–150 ms ✅ |
| CLIP ViT-B/32 | ~300–800 ms ⚠️ chậm thấy rõ |

→ Đây mới là lý do thật để chọn MobileNetV3-Small + quantize INT8, và để **không** chọn CLIP.

### 3.3. Bốn việc cấu hình đi kèm

**a) Set `-Xmx` — hiện đang KHÔNG set.** `Dockerfile`:

```dockerfile
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT} -jar app.jar"]
```

JVM tự lấy ~25% RAM máy làm heap. Trên 4 GB thì heap ~1 GB — tình cờ hợp lý, nhưng **đừng để tình cờ**. Khai rõ:

```dockerfile
ENTRYPOINT ["sh", "-c", "java -Xmx1g -XX:MaxMetaspaceSize=256m -Dserver.port=${PORT} -jar app.jar"]
```

> Lưu ý: ONNX Runtime cấp phát **native memory, NẰM NGOÀI heap**. Đặt `-Xmx` quá cao trên máy 4 GB là ép native không còn chỗ. `-Xmx1g` là mức an toàn.

**b) Nạp model MỘT LẦN, dạng singleton bean.** Nạp lại mỗi request là cách nhanh nhất để thổi bay RAM và làm chậm mọi thứ.

```java
@Bean(destroyMethod = "close")
OrtSession visionSession(OrtEnvironment env) { ... }   // 1 lần lúc khởi động
```

**c) Warm-up lúc khởi động.** Lượt inference đầu tiên luôn chậm (khởi tạo lười). Chạy sẵn 1 ảnh giả lúc boot, nếu không thì đúng lần fallback đầu tiên sau khi deploy sẽ mất vài giây — trông y như lỗi.

**d) Bật swap 2 GB làm lưới an toàn.** Rẻ, chống OOM-killer lúc nạp model hoặc lúc PostgreSQL cao điểm.

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.4. 🔴 Vì DB nằm CÙNG máy — ba việc phải làm

**a) ĐỪNG `docker build` trên VPS.**

`Dockerfile` là multi-stage, có `RUN mvn -q -DskipTests package`. Chạy build ngay trên VPS nghĩa là Maven tải toàn bộ dependency (~0,5–1 GB) và biên dịch bằng chính 2 core đang phục vụ PostgreSQL. Hậu quả: site đứng hình suốt lúc deploy, và trên 35 GB disk thì layer trung gian tích lại rất nhanh.

→ Build ở máy dev hoặc CI, đẩy image lên registry, VPS chỉ `docker pull` + `up -d`. Nếu buộc phải build tại chỗ thì dọn định kỳ:
```bash
docker system prune -af --volumes    # cẩn thận: --volumes xoá cả volume không dùng
```

**b) Bảo vệ PostgreSQL khỏi OOM-killer.**

Khi RAM căng, OOM-killer thường giết **tiến trình to nhất** — mà đó là Spring Boot hoặc PostgreSQL. Giết PostgreSQL giữa transaction tệ hơn nhiều so với giết app (app restart là xong, DB hỏng là mất dữ liệu).

```bash
# Cho postgres điểm ưu tiên sống cao hơn
sudo systemctl edit postgresql
# [Service]
# OOMScoreAdjust=-900
```

Cộng với swap 2 GB ở mục 3.3d — hai thứ này đi cùng nhau.

**c) Siết số kết nối cho vừa máy nhỏ.**

Mặc định PostgreSQL `max_connections = 100`, mỗi kết nối là một process ~5–10 MB → 100 kết nối là ~500 MB–1 GB chỉ để ngồi không. Máy 4 GB chạy chung với app thì không cần nhiều thế.

```conf
# postgresql.conf
max_connections = 50
shared_buffers = 512MB
effective_cache_size = 1GB
```

```yaml
# application.yaml — HikariCP mặc định 10, giữ nguyên là hợp lý
spring.datasource.hikari.maximum-pool-size: 10
```

> Ba việc này **không phải do thêm model** mà ra — chúng đã đúng từ trước. Nhưng thêm ONNX vào là bớt biên an toàn, nên giờ mới đáng làm.

### 3.5. Vẫn phải đo thật

Sau khi nối model, chạy vài chục lượt nhận diện rồi kiểm:

```bash
free -m                                   # RAM còn trống thật
curl localhost:8080/actuator/metrics/jvm.memory.used
```

Con số ở 3.1 là ước tính, không phải đo. Đo xong mới yên tâm demo.

---

## 4. Dataset — phần tốn công nhất, đừng đánh giá thấp

### Số lớp CHỐT (đã bỏ hiện trạng phòng — 09/08/2026)

| Nhóm | Nguồn | Số lớp |
|---|---|---|
| Thiết bị | `utils/equipmentPhoto.ts` → `CLASSES` | **14** — ac, fridge, washer, heater, tv, fan, stove, bed, wardrobe, table, curtain, sanitary, light, door |
| Bối cảnh trong nhà | `equipmentPhoto.ts` → `INDOOR_ISH_LABELS` | **1** — giữ lại cho luật 4, xem cảnh báo ở mục 0 |
| Lớp CHẶN | `equipmentPhoto.ts` → `NON_EQUIPMENT_LABELS` | **6** — bàn tay, người/selfie, đồ ăn, cây cối/thiên nhiên, động vật, giấy tờ/ảnh chụp màn hình |
| | **TỔNG** | **21 lớp** |

**Đã bỏ khỏi danh sách** (so với bản 23 lớp ban đầu): lớp "phòng ốc" và 4 lớp chặn chỉ dùng cho ảnh phòng — hoạt hình/hình vẽ, poster/quảng cáo, mặt đồng hồ đo, xe cộ.
**Đã thêm vào**: 2 lớp chặn mà nhánh thiết bị cần riêng — cây cối/thiên nhiên, động vật (có trong `NON_EQUIPMENT_LABELS`, không có ở nhánh phòng).

> Đừng bỏ nhóm lớp CHẶN. Nó chính là thứ giữ giá trị chống gian lận — không có nó thì model chỉ biết "đây là cái tủ lạnh" chứ không biết "đây là **ảnh chụp màn hình** cái tủ lạnh". Đây là căn cứ quyết toán bồi thường lúc trả phòng.

### Khối lượng

**21 lớp × 100 ảnh = ~2.100 ảnh.** Nhóm 4 người → ~525 ảnh/người. Cộng thời gian gán nhãn và loại ảnh hỏng, tính **2–3 buổi** cho an toàn.

### 🟡 Hai đòn bẩy còn để ngỏ (chưa chốt)

Bỏ hiện trạng phòng chỉ tiết kiệm ~9% (2.300 → 2.100) vì chi phí nằm ở 14 lớp thiết bị. Nếu muốn giảm mạnh hơn, còn hai lựa chọn:

| Phương án | Số lớp | Ảnh | Tiết kiệm so với 2.300 |
|---|---|---|---|
| **Đã chốt** — bỏ hiện trạng phòng | 21 | 2.100 | 9% |
| + gộp 5 lớp nội thất `liveOnly` (giường, tủ, bàn ghế, rèm, cửa → "nội thất") | 17 | 1.700 | 26% |
| + giảm 100 → 60 ảnh/lớp | 17 | **~1.020** | **56%** |

**Gộp nội thất gần như không mất gì:** 5 lớp đó đều `liveOnly` (FE vốn đã bắt chụp trực tiếp tại phòng), và trong `CLASSES` chúng **đã dùng chung nhãn `'furniture'`**. Cái mất duy nhất là không còn phân biệt được *"ảnh này nhìn ra tủ, không phải giường"* — với đồ bắt buộc chụp tại chỗ thì giá trị đó thấp.

**60 ảnh/lớp là đủ** cho transfer learning MobileNetV3 với backbone đóng băng + augmentation, miễn các lớp khác nhau rõ về thị giác. 100/lớp là con số an toàn, không phải bắt buộc.

→ Nếu chọn cả hai: **~1.020 ảnh, ~255 ảnh/người, một buổi là xong.**

### Lưu ý chất lượng (không chỉ số lượng)

- Đủ đa dạng: nhiều phòng khác nhau, sáng/tối, chụp gần/xa, nghiêng
- Ảnh lớp chặn phải **chụp thật** (ảnh chụp màn hình thật, giấy tờ thật), không tải mạng — model sẽ học nhầm đặc trưng của ảnh stock
- Tách tập validation **theo phòng**, không trộn ngẫu nhiên: cùng một phòng chia cả train lẫn val sẽ cho điểm ảo rất cao

---

## 5. Ước lượng công

| Bước | Việc | Công |
|---|---|---|
| 1 | Strategy + `ImageSource` + fallback + config | 4–6h |
| 3 | Chốt môi trường deploy, đo RAM nền | 1–2h |
| 4 | Gom + gán nhãn ~2.300 ảnh | **2–3 buổi (cả nhóm)** |
| 2 | Train Colab + xuất ONNX + quantize | 3–4h (gồm thử vài lượt) |
| 2 | Nối ONNX Runtime vào `LocalVisionProvider` | 4–6h |
| — | Đo lại chất lượng, chỉnh ngưỡng `min-score` | 3–4h |
| | **Tổng** | **~1 tuần** nếu chạy song song |

**Bước 1 độc lập hoàn toàn** — làm ngay được, không chờ dataset, và đã đủ để trình bày kiến trúc.

---

## 6. FE không phải sửa gì

Hợp đồng API giữ nguyên tuyệt đối:

```
POST /api/v1/vision/labels   { imageUrl }  →  { labels: [{ name, score }] }
```

Toàn bộ logic đối chiếu nhãn nằm ở FE (`utils/equipmentPhoto.ts`, `utils/roomPhoto.ts`) và **không quan tâm ai sinh ra nhãn**. `validateRoomPhoto` giữ nguyên, không sửa gì — nó vốn đã fail-open nên khi rơi xuống provider local (không có lớp phòng) thì tự cho ảnh qua, đúng hành vi hôm nay.

⚠️ **Hai ràng buộc BẮT BUỘC giữ khi làm model local:**

1. **Nhãn phải là tiếng Anh, viết thường**, trùng đúng chuỗi FE đang dò. Trả `'may_lanh'` hay `'AC'` là FE không khớp được gì cả.
   Lấy danh sách chuẩn từ **`equipmentPhoto.ts`**:
   - 14 lớp thiết bị → `CLASSES[].labels` (vd `'air conditioner'`, `'refrigerator'`, `'washing machine'`)
   - 6 lớp chặn → `NON_EQUIPMENT_LABELS` (vd `'hand'`, `'person'`, `'food'`, `'screenshot'`)
   - 1 lớp bối cảnh → `INDOOR_ISH_LABELS` (vd `'wall'`, `'room'`, `'furniture'`)

   > Đã bỏ hiện trạng phòng khỏi phạm vi nên **không** cần các nhãn riêng của `roomPhoto.ts` → `BLOCKED_LABELS` (`'poster'`, `'cartoon'`, `'gauge'`, `'vehicle'`...).

2. **`score` thang 0..1**, cùng thang với Google — FE đang so ngưỡng trực tiếp (`MATCH_MIN_SCORE`, `MISMATCH_MIN_SCORE` ở `equipmentPhoto.ts`). Model local trả thang khác là mọi ngưỡng thành vô nghĩa.

Làm đúng 2 điều này thì đổi provider **FE không cần deploy lại**.

---

## 7. Tóm tắt đề nghị

| # | Việc | Ưu tiên |
|---|---|---|
| 1 | **Bước 1 — Strategy + fallback `auto`** | 🔴 Làm ngay, độc lập, ~1 ngày |
| 2 | Chốt môi trường deploy + RAM (mục 3) | 🔴 Trước khi train |
| 3 | Gom dataset 23 lớp | 🟡 Song song |
| 4 | Fine-tune MobileNetV3-Small INT8 → ONNX | 🟡 Sau khi có dataset |
| 5 | Hạ timeout Google xuống ~8s ở chế độ `auto` | 🟢 Kèm bước 1 |
| 6 | Bỏ rate limit cho provider local | 🟢 Kèm bước 1 |
| — | OCR đồng hồ chạy local | ❌ Ngoài phạm vi, xem mục 0 |
