# BE NEED — Chỉnh nhãn `labels.txt` + bind env, sau khi review commit Vision

**Ngày:** 10/08/2026
**Người gửi:** team FE (mobile)
**Người nhận:** team BE
**Phạm vi review:** `6e70675..HEAD` trên nhánh `dev` (gồm cả 2 commit mà changelog `6e70675→ac8b177` chưa nhắc: `2506173`, `50b8920`)
**Liên quan:** `BE-PLAN-vision-provider-local-2026-08-09.md`, `BE-NEED-ocr-resilience-2026-08-09.md`, `SETUP-deploy-checklist-2026-08-09.md`

---

## 0. Trước hết — phần này làm đúng, đừng sửa

Đọc code chứ không đọc changelog, và kiến trúc Vision mới bám rất sát bản kế hoạch. Ghi lại để lần refactor sau không ai lỡ tay gỡ:

| Chi tiết | Vì sao phải giữ |
|---|---|
| `ImageSource` **lazy** — Google dùng `url()`, chỉ local mới gọi `bytes()` | Nếu quay lại `detect(byte[])` thì **đường Google cũng phải tải ảnh về VPS**, tự dưng gánh băng thông và RAM cho việc Google vốn tự làm |
| `setIntraOpNumThreads(1)` + `setInterOpNumThreads(1)` | VPS chỉ **2 core** và đang chạy **cả PostgreSQL lẫn Spring Boot**. Thả tự do là ONNX ăn hết core, kéo chậm cả web lẫn DB |
| Rate limit **chỉ đếm khi gọi Google** (`VisionServiceImpl:85`) | Local không tốn quota, đếm là tự trói |
| `allowed-image-hosts: res.cloudinary.com` | Không có nó thì `/vision/labels` thành proxy tải ảnh bất kỳ từ Internet |
| Warm-up lúc boot | Lượt ONNX đầu luôn chậm — không warm-up thì lần fallback đầu tiên trông như treo |

Contract `POST /api/v1/vision/labels` giữ nguyên → FE không phải sửa gì để chạy được. Cảm ơn.

---

## 1. 🔴 Đổi 1 dòng trong `labels.txt`: `light` → `light fixture`

**File:** `src/main/resources/models/labels.txt`, dòng 18 (nhãn thứ 13 trong nhóm thiết bị).

### Vì sao

FE đối chiếu nhãn theo chiều **`nhãnBE.includes(từKhoáFE)`** — tên nhãn BE trả về phải *chứa* từ khoá của FE:

```ts
// mobile-app/src/utils/equipmentPhoto.ts:167
labels.find(l => l.score >= minScore && keywords.some(k => norm(l.name).includes(k)))
```

Từ khoá của nhóm đèn bên FE đều **dài hơn** chữ `light`:

```ts
labels: ['light fixture', 'lighting', 'lamp', 'ceiling', 'light bulb',
         'electrical supply', 'light switch']
```

`"light".includes("light fixture")` → `false`. `"light".includes("lighting")` → `false`. Không từ nào khớp.

Hậu quả khi model lên: manager chụp **đúng cái đèn**, model trả `light 0.9` →

- luật 1 (khớp đúng loại) trượt
- luật 2, 3 không bắt
- luật 4 kết luận *"ảnh không thấy đồ đạc nào"* → **chặn một tấm ảnh hoàn toàn đúng**

`roomPhoto.ts` cũng vậy: `ROOM_LABELS` có `'light fixture'` và `'lighting'`, không có `'light'`.

### Cách sửa

```diff
- light
+ light fixture
```

Model **chưa train** nên đổi tên nhãn lúc này không tốn gì — chỉ cần lúc export ONNX giữ đúng thứ tự index 0..20 như file hiện tại. Sau khi đổi, `"light fixture"` khớp cả `equipmentPhoto` (từ khoá `light fixture`) lẫn `roomPhoto`, và còn khớp thêm `fixture` trong danh sách bối cảnh.

> FE đã tự vá tạm phía mình (thêm `light` vào danh sách bối cảnh) nên nếu BE không đổi thì ảnh đèn **không bị chặn oan nữa**, nhưng sẽ ra `unreadable` (không xác nhận được) thay vì `match`. Đổi tên nhãn mới là cách đúng.

### Nhãn còn lại: đã đối chiếu đủ 21 dòng

| Nhãn BE | Khớp FE? |
|---|---|
| air conditioner, refrigerator, washing machine, water heater, television | ✅ |
| electric fan (khớp qua từ khoá `fan`), stove, bed, wardrobe, table, curtain | ✅ |
| toilet (nhóm thiết bị vệ sinh), door | ✅ |
| **light** | ❌ **xem trên** |
| furniture | ✅ (FE đã xử lý riêng, xem mục 4) |
| hand, person, food, plant, animal, screenshot | ✅ đều nằm trong danh sách chặn |

---

## 2. 🔴 `rate-limit-per-hour` vẫn chưa bind env

`application.yaml:92`:

```yaml
  # Chỉ đếm khi gọi Google (local không tốn quota)
  rate-limit-per-hour: 20
```

Đây là mục 2 của `BE-NEED-ocr-resilience-2026-08-09.md` — vẫn hardcode, **không có biến môi trường** nên không nâng được lúc demo mà không sửa code + build lại.

```diff
- rate-limit-per-hour: 20
+ rate-limit-per-hour: ${VISION_RATE_LIMIT_PER_HOUR:20}
```

Rồi set `VISION_RATE_LIMIT_PER_HOUR=100` cho môi trường demo.

Có người sẽ nói *"giờ có fallback local rồi, chạm trần thì rơi xuống local thôi"*. Không đúng ở thời điểm này — xem mục 3: local đang tắt, nên chạm trần vẫn ra lỗi thẳng vào mặt người demo.

---

## 3. ⚠️ Chưa có file model — `provider=auto` hiện chạy y hệt `provider=google`

```
src/main/resources/models/
├── labels.txt        ← có
└── (thiếu equipment-mobilenetv3.onnx)
```

`LocalVisionProvider.init()` không thấy model → log info → `isAvailable() = false` → `VisionServiceImpl` bỏ qua provider này.

Đây **đúng như kế hoạch** (model plug sau, dataset ~2.100 ảnh chưa gom xong), không phải lỗi. Ghi ra đây vì hai lý do:

1. Đừng báo với mentor là "đã chạy được offline" — hiện chưa. Mới xong phần kiến trúc.
2. Mọi lập luận kiểu "hết quota thì đã có local đỡ" chỉ đúng **sau khi** có file `.onnx`.

Khi có model, nhớ kiểm lại `min-score: 0.35` trên ảnh thật. Ngưỡng này chọn trước khi train nên gần như chắc phải chỉnh.

---

## 4. FE đã tự sửa 2 lỗi phía mình — BE không phải làm gì

Ghi lại để BE biết ranh giới, khỏi sửa trùng.

### 4.1. Nhãn chung không được dùng để kết tội

`furniture` nằm trong danh sách nhãn của **cả 3 nhóm** giường / tủ / bàn ghế bên FE. Luật "ảnh này là thứ KHÁC" lấy nhóm khớp **đầu tiên**, nên khai *máy lạnh* mà nhận `furniture 0.7` sẽ ra thông báo *"Ảnh này nhìn ra giường / nệm"* — vu oan.

Đã thêm một danh sách nhãn-quá-chung (`furniture`, `fixture`, `wood`, `textile`, `ceiling`, `window`, `lighting`, `electrical supply`, `screen`, `bathroom`, `plumbing`, `kitchen appliance`) bị loại khỏi **riêng luật kết tội**, vẫn giữ nguyên cho luật nhận đúng loại và luật kiểm bối cảnh.

Đáng chú ý: lỗi này **không phải do model local** — Google Vision trả `Furniture` / `Lighting` rất thường xuyên, nên nhiều khả năng nó đã âm thầm chặn oan từ trước tới nay.

### 4.2. `air conditioner` cho ảnh phòng

`ROOM_LABELS` trước chỉ có `air conditioning`, đã thêm `air conditioner` cho khớp nhãn BE.

Đã chạy 20 ca kiểm thử cho hai file này, gồm cả các ca "vẫn phải chặn" (chụp nhầm tủ lạnh, ảnh bàn tay, poster, ảnh chụp màn hình, ảnh đồ ăn) — không ca nào bị nới lỏng.

---

## 5. Ba việc cũ vẫn treo nguyên

Không phải mới, nhưng đã hai lượt pull chưa nhúc nhích:

| # | Việc | Trạng thái hôm nay | Nguồn |
|---|---|---|---|
| 1 | `MANAGER_OVERRIDE_PASSCODE` | `application.yaml:149` vẫn `${MANAGER_OVERRIDE_PASSCODE:}` rỗng | `SETUP-deploy-checklist` §2.1 |
| 2 | `OCR_SPACE_API_KEY` | vẫn default `helloworld` (chỉ thêm comment) | `BE-NEED-ocr-resilience` §1 |
| 3 | Webhook PayOS trỏ domain thật | chưa ai xác nhận | `SETUP-deploy-checklist` §3.3 |

Mục 1 nặng nhất: **chưa set thì luồng đón khách tắc cứng** khi manager không chụp được ảnh đồng hồ — đúng kịch bản mentor yêu cầu phải xử lý (ý 5). Code hai bên đã xong hết, chỉ thiếu một biến môi trường.

---

## 6. Hai ghi chú không phải việc phải làm

### 6.1. Commit `6f374c9` là vá lỗi chặn boot, không phải dọn dẹp

Changelog mô tả là *"gỡ endpoint push token legacy"*. Thực tế trước commit đó `PushTokenController` có **hai `@DeleteMapping("/me/push-token")` trùng hệt nhau** (dòng 43 và 55). Spring ném *Ambiguous mapping* lúc khởi động → app không boot được.

Nói ra vì nó giải thích một khoảng thời gian BE không lên được, và vì endpoint sống sót (`@RequestBody(required = false)`) đúng là cái FE đang gọi — nên tính năng gỡ push token khi logout giờ chạy đúng.

### 6.2. `remove-duplicate-payment.sql`

`src/main/resources/db/remove-duplicate-payment.sql` là patch dữ liệu một lần, hardcode `id = 3`. Đã kiểm: **không có Flyway/Liquibase** trong `pom.xml` nên nó không tự chạy — vô hại. Chỉ lưu ý đừng ai lỡ chạy nhầm trên DB demo, vì `id = 3` ở đó là bản ghi khác.

---

## 7. Việc của bạn FE phụ trách thanh toán — không phải BE tự làm

Ý 15 (ẩn tiền khỏi manager) **vẫn chưa có**: `ManagerBillingServiceImpl` dòng 185 và 211 vẫn

```java
.amount(invoice.getGrandTotal())   // trả vô điều kiện, không xét role
```

Và commit `2506173` vừa **nới quyền**: cả 3 endpoint `/manager/invoices`, `/manager/invoices/{id}`, `/manager/payments` đổi từ `hasAnyRole('MANAGER','ADMIN')` sang `+'OWNER'`, kèm hàm mới `isAdminOrOwner()`.

→ Khi làm ý 15, điều kiện ẩn tiền phải là **"MANAGER và không phải ADMIN và không phải OWNER"**, chứ không còn là "không phải ADMIN" như mô tả trong `BE-NEED-manager-money-visibility-2026-08-07.md`. Nhờ chuyển ý này tới người đang làm phần đó.

---

## 8. Tóm tắt

| # | Việc | Công | Trước demo? |
|---|---|---|---|
| 1 | `labels.txt`: `light` → `light fixture` | 1 phút | ✅ nên làm luôn |
| 2 | Bind `${VISION_RATE_LIMIT_PER_HOUR:20}` | 2 phút | ✅ nên làm luôn |
| 3 | Set `MANAGER_OVERRIDE_PASSCODE` trên server | 5 phút | 🔴 **bắt buộc** |
| 4 | Set `OCR_SPACE_API_KEY` thật | 5 phút | ✅ nên làm |
| 5 | Xác nhận webhook PayOS trỏ domain thật | — | 🔴 **bắt buộc** |
| 6 | File `.onnx` + chỉnh `min-score` | sau khi có dataset | ❌ sau demo |

Bốn mục đầu cộng lại **dưới 15 phút** và không mục nào đụng vào logic.
