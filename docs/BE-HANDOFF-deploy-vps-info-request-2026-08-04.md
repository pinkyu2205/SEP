# BE HANDOFF — Thông tin FE cần sau khi deploy BE lên VPS

**Ngày:** 04/08/2026
**Người gửi:** team FE (web + mobile)
**Người nhận:** team BE
**Mục đích:** FE cần các thông tin dưới đây để trỏ web (Vercel) và mobile (Expo Go) sang backend đã deploy trên VPS. Phần **A là bắt buộc** — thiếu là FE không chạy được. Phần B là các luồng cụ thể. Phần C là việc BE cần chỉnh trên VPS.

Bối cảnh FE hiện tại:
- **Web**: deploy trên **Vercel** (HTTPS), build Vite + React.
- **Mobile**: chạy bằng **Expo Go** trên máy thật (chưa build APK).
- VPS hiện **chỉ có IP, chưa có domain**.

---

> **CẬP NHẬT 04/08/2026 — BE đã trả lời phần A. FE đã test và xác nhận VPS sống.**
> Các mục còn treo: **B2 (PayOS), B3 (giới hạn upload), B4 (QR), B5 (timezone/cron), A8 (tài khoản host/manager/tenant)**.

## A. Bắt buộc — ✅ ĐÃ CÓ ĐỦ

| # | Thông tin | BE trả lời |
|---|---|---|
| A1 | IP public của VPS | `103.78.3.170` |
| A2 | Port BE lắng nghe ra ngoài | `8080` |
| A3 | URL gốc để gọi API | `http://103.78.3.170:8080` |
| A4 | Prefix path | ✅ Giữ `/api/v1/...` |
| A5 | Domain/HTTPS | ❌ Chưa có — chỉ IP + HTTP |
| A6 | Health check | Swagger `http://103.78.3.170:8080/swagger-ui/index.html` hoặc `POST /api/v1/auth/login` |
| A7 | DB đã seed | ✅ Đã có data |
| A8 | Tài khoản | `admin01 / 123456` — ⚠️ **còn cần username của host / manager / tenant** |

**FE đã tự verify từ máy ngoài (04/08):**
- `POST /api/v1/auth/login` với `admin01/123456` → **HTTP 200**, trả token JWT hợp lệ (role `ROLE_ADMIN`)
- Swagger UI → **HTTP 200**
- `GET /api/v1/properties` kèm token → **HTTP 200**, có data thật (property id 23, địa chỉ Gò Vấp...)
- CORS: gửi header `Origin: https://sep-test.vercel.app` → BE trả `Access-Control-Allow-Origin` đúng origin đó + `Allow-Credentials: true` → whitelist `*.vercel.app` **hoạt động đúng**
- `imageUrls` BE trả về là **URL tuyệt đối** (`https://images.unsplash.com/...`) → FE không phải ghép base URL. Cần BE xác nhận ảnh **do người dùng upload** cũng trả tuyệt đối (Cloudinary) chứ không phải path tương đối.

**⚠️ Còn thiếu ở A8:** mới có `admin01`. FE cần thêm username của **host, manager, tenant** trên DB VPS (nếu cùng pass `123456` thì chỉ cần cho biết username) — thiếu thì không demo được các luồng theo vai trò.

### Giải thích vì sao cần

**A3 + A4 — URL và prefix.**
FE ghép URL theo dạng `<BASE>/api/v1/<endpoint>`. Nếu Nginx trên VPS có strip mất `/api` thì **toàn bộ request của cả web lẫn mobile sẽ 404**. Cho FE biết chính xác: gọi `curl http://<IP>:<PORT>/api/v1/auth/login` có ra không, hay phải bỏ `/api`.

**A5 — HTTP hay HTTPS.** Đây là điểm quan trọng nhất, xem mục C1.

**A7 + A8 — data và tài khoản.**
DB trên VPS là DB trống mới tạo hay đã import data demo? Nếu trống thì FE không có gì để demo và không đăng nhập được. FE cần đúng bộ tài khoản 4 vai trò (admin, host, manager, tenant) để test đủ luồng. Nếu BE có script seed, cho FE biết đã chạy chưa.

---

## B. Thông tin theo từng luồng

### B1. CORS — cho phép origin của web Vercel

Web chạy trên domain Vercel, gọi API cross-origin. BE cần whitelist:

```
Origin cho phép:   https://<domain-vercel-cua-nhom>.vercel.app
Method:            GET, POST, PUT, PATCH, DELETE, OPTIONS
Header cho phép:   Authorization, Content-Type
```

> Lưu ý: KHÔNG dùng `allowedOrigins("*")` chung với `allowCredentials(true)` — Spring sẽ ném lỗi lúc khởi động. Nếu muốn mở rộng, dùng `allowedOriginPatterns`.

**✅ ĐÃ XONG.** BE đã whitelist `https://*.vercel.app`, FE test xác nhận header trả về đúng.
Lưu ý: nếu sau này nhóm dùng domain riêng cho web (không phải `.vercel.app`) thì phải thêm vào whitelist rồi redeploy BE.

*(FE cũng có phương án proxy qua Vercel để né CORS hoàn toàn — xem C1 — nhưng vẫn cần biết BE đang set gì để debug.)*

### B2. PayOS

| Câu hỏi | BE trả lời |
|---|---|
| Trên VPS đang dùng key **sandbox** hay **production**? | `` |
| `returnUrl` / `cancelUrl` đang cấu hình trỏ về đâu? | `` |
| Webhook URL đã đăng ký với PayOS chưa, trỏ về đâu? | `` |

`returnUrl`/`cancelUrl` **phải trỏ về domain Vercel của web** thì FE mới bắt được kết quả thanh toán khi user quay lại. Nếu đang trỏ `localhost` hoặc domain Render cũ thì luồng thanh toán sẽ đứt.

Webhook: PayOS gọi ngược từ internet vào VPS, nên endpoint webhook phải public (không chặn firewall) và **PayOS thường yêu cầu HTTPS** — nếu VPS chỉ có HTTP thì có thể không đăng ký được webhook, cần xác nhận sớm.

### B3. Ảnh và file upload

| Câu hỏi | BE trả lời |
|---|---|
| BE trả URL ảnh **tuyệt đối** (Cloudinary `https://res.cloudinary.com/...`) hay **tương đối** (`/uploads/abc.jpg`)? | `` |
| Nếu tương đối: file lưu trên đĩa VPS hay DB? Serve qua path nào? | `` |
| Giới hạn dung lượng upload (`client_max_body_size` của Nginx / `spring.servlet.multipart.max-file-size`)? | `` |

Nếu là URL tương đối thì mobile phải tự ghép base URL — FE cần biết chính xác để không hiện ảnh vỡ. Về giới hạn: ảnh chụp từ điện thoại thường 3–8 MB, mặc định Nginx chỉ **1 MB** và Spring **1 MB** → sẽ lỗi 413 khi tenant gửi ảnh báo hỏng. Đề nghị set tối thiểu **25 MB** cả hai chỗ.

### B4. QR thiết bị

Nội dung QR do BE sinh ra có **nhúng URL/domain** bên trong không?

→ BE trả lời: ``

Nếu QR cũ nhúng `localhost` hoặc domain Render cũ thì quét trên bản deploy mới sẽ 404. Việc này liên quan trực tiếp tới bug QR trang admin đang treo (xem `BE-BUG-admin-equipments-qr-fake-2026-07-30.md`).

### B5. Timezone và cron

| Câu hỏi | BE trả lời |
|---|---|
| Timezone của VPS và của Postgres đã set `Asia/Ho_Chi_Minh` chưa? | `` |
| Các job cron (nhắc nợ, sinh hoá đơn) có đang bật trên VPS không? | `` |

VPS mặc định thường là UTC → lệch 7 tiếng, ngày hết hạn hợp đồng và hạn hoá đơn sẽ hiển thị sai trên FE.

---

## C. Việc BE cần làm trên VPS

### C1. ⚠️ Vấn đề chặn cứng: web HTTPS không gọi được BE HTTP

Web trên Vercel chạy **HTTPS**. Trình duyệt **chặn cứng** mọi request từ trang HTTPS sang `http://` (mixed content). Đây **không phải lỗi CORS** và không sửa được bằng cấu hình CORS — request bị chặn ngay tại trình duyệt, không bao giờ tới BE.

Có 2 hướng, nhóm chọn 1:

**Hướng 1 — FE proxy qua Vercel (không cần BE làm gì thêm).**
FE thêm rewrite trong `vercel.json` để Vercel gọi BE từ **phía server**, không phải từ trình duyệt → né được cả mixed content lẫn CORS.
- BE chỉ cần đảm bảo: **IP + port mở public**, ai gọi cũng được (không whitelist IP), vì request sẽ đến từ server của Vercel với IP thay đổi liên tục.
- **BE xác nhận giúp:** firewall/security group của VPS có đang chặn IP lạ không? → ``

**Hướng 2 — Mua domain + cấp SSL cho BE (khuyến nghị nếu còn thời gian).**
Trỏ `api.<domain>` về VPS, cài Nginx + certbot (Let's Encrypt, miễn phí). Sau đó mọi thứ chạy thẳng, và cũng là điều kiện bắt buộc nếu sau này build APK thật hoặc muốn PayOS webhook ổn định.

→ **ĐÃ CHỐT: Hướng 1 — FE proxy qua Vercel** (theo đề xuất của BE). FE đã cấu hình xong `vercel.json`.
BE **không cần làm gì thêm**, chỉ cần đảm bảo không whitelist IP ở firewall (request sẽ đến từ dải IP của Vercel, thay đổi liên tục).

> Vẫn khuyến nghị làm Hướng 2 (domain + SSL) trước khi nộp nếu bài cần **APK build thật** hoặc cần **PayOS webhook** — hai thứ này HTTP + IP không đáp ứng được.
>
> **📌 CẬP NHẬT 06/08/2026:** hướng dẫn chi tiết từng bước cho Hướng 2 đã được soạn riêng — xem **`BE-HANDOFF-https-setup-2026-08-06.md`** (Nginx + certbot + `forward-headers-strategy`, ~30–45 phút). Làm xong sẽ mở khoá luôn mục **B2 (PayOS webhook)** đang treo.

### C2. Firewall / port

Xác nhận đã mở port BE ra internet:
```bash
sudo ufw status          # kiểm tra
sudo ufw allow 8080/tcp  # nếu chưa mở
```
Đồng thời **KHÔNG mở port 5432 (Postgres) ra internet** — chỉ để localhost hoặc mạng nội bộ Docker. Postgres public + mật khẩu yếu là bị dò trong vòng vài giờ.

Test giúp FE từ máy ngoài:
```bash
curl -i http://<IP>:<PORT>/api/v1/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin01","password":"123456"}'
```
→ Dán kết quả vào đây: ``

### C3. Secret không hard-code

VPS là internet public. Kiểm tra `application.yaml` không commit DB password / PayOS key / JWT secret — đưa hết ra biến môi trường. Nếu key đã từng bị commit lên Git thì nên đổi key mới.

### C4. Tắt devtools ở prod

`spring-boot-devtools` đang có trong `pom.xml`. Đảm bảo không active ở profile prod (nó bật restart tự động và tốn RAM).

---

## D. Tóm tắt: FE chờ 4 thứ để chạy được ngay

1. **URL API đầy đủ** (A3) + xác nhận prefix `/api/v1` (A4)
2. **Chốt hướng C1** (proxy qua Vercel hay mua domain + SSL)
3. **Tài khoản đăng nhập trên DB VPS** (A8) + xác nhận DB đã có data (A7)
4. **CORS đã whitelist domain Vercel** (B1) — nếu chọn Hướng 2

Có 4 mục này là FE sửa config và test đầu-cuối được trong ngày. Các mục B2–B5 có thể trả lời sau nhưng cần trước buổi demo.
