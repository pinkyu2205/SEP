# BE HANDOFF — Cấp HTTPS cho backend trên VPS

**Ngày:** 06/08/2026
**Người gửi:** team FE (web + mobile)
**Người nhận:** team BE / DevOps
**Liên quan:** `BE-HANDOFF-deploy-vps-info-request-2026-08-04.md` — mục **C1 Hướng 2** (đã ghi "khuyến nghị làm trước khi nộp"). Đây là hướng dẫn chi tiết để thực hiện mục đó.

**Thời gian ước tính:** 30–45 phút nếu đã có domain.

---

## 1. Vì sao cần làm

VPS hiện chỉ có **IP + HTTP** (`http://103.78.3.170:8080`). FE đã verify backend chạy tốt (06/08: `POST /api/v1/auth/login` → 400 + JSON validation đúng), nhưng HTTP thuần chặn cứng 3 việc:

| Việc | Trạng thái hiện tại | Nguyên nhân |
|---|---|---|
| **Build APK release** (nộp bài / demo trên máy thật) | ❌ Không gọi được API | Android ≥ 9 cấm cleartext HTTP ở bản release → `CLEARTEXT communication not permitted` |
| **PayOS webhook** (mục B2 đang treo) | ❌ Không đăng ký được | PayOS yêu cầu webhook URL phải HTTPS |
| **Web gọi thẳng BE** | ⚠️ Đang phải proxy vòng qua Vercel | Trang HTTPS không được gọi `http://` (mixed content) |

Hiện FE đang chạy được nhờ 2 workaround tạm: web proxy qua `vercel.json` rewrites, mobile chỉ chạy Expo Go / debug build (2 môi trường này cho phép cleartext). Cả hai đều **không dùng được cho bản nộp cuối**.

---

## 2. Kiến trúc sau khi làm

Không sửa code Spring. Chỉ dựng **Nginx làm lớp vỏ HTTPS** đứng trước:

```
Hiện tại:  Client ──HTTP──▶ 103.78.3.170:8080 (Spring)

Sau khi làm:
           Client ──HTTPS──▶ api.<domain>:443 (Nginx) ──HTTP──▶ 127.0.0.1:8080 (Spring)
                              ↑ cert Let's Encrypt        ↑ nội bộ VPS, đóng khỏi internet
```

---

## 3. Các bước thực hiện

### Bước 1 — Domain trỏ về VPS

Cần một tên miền bất kỳ:

| Cách | Chi phí | Ghi chú |
|---|---|---|
| Domain `.id.vn` / `.io.vn` | ~30k–50k/năm | Rẻ, chuyên nghiệp — **khuyên dùng** |
| **DuckDNS** (`sep-api.duckdns.org`) | Miễn phí | Đăng ký 2 phút, đủ cho đồ án |
| `nip.io` (`103-78-3-170.nip.io`) | Miễn phí, không cần đăng ký | Dễ dính rate-limit Let's Encrypt |

Tạo **DNS A record**:
```
api.<domain>   A   103.78.3.170
```

Verify trước khi sang bước sau:
```bash
nslookup api.<domain>     # phải ra 103.78.3.170
```

### Bước 2 — Mở port 80 và 443

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

> Port **80 bắt buộc mở** — Let's Encrypt dùng nó để xác minh quyền sở hữu domain (HTTP-01 challenge). Không mở là certbot fail.

### Bước 3 — Cài Nginx + cấu hình reverse proxy

```bash
sudo apt update && sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/sep-api
```

```nginx
server {
    listen 80;
    server_name api.<domain>;

    # Ảnh chụp từ điện thoại 3-8MB — mặc định Nginx chỉ cho 1MB → lỗi 413 khi tenant gửi ảnh báo hỏng
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # BẮT BUỘC: để Spring biết request gốc là HTTPS (xem bước 5)
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # Upload ảnh / export chậm, tránh 504
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Kích hoạt:
```bash
sudo ln -s /etc/nginx/sites-available/sep-api /etc/nginx/sites-enabled/
sudo nginx -t                    # phải báo "syntax is ok"
sudo systemctl reload nginx
```

Test (phải ra JSON 400 giống khi gọi thẳng IP):
```bash
curl -X POST http://api.<domain>/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{}'
```

### Bước 4 — Cấp SSL bằng Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.<domain>
```

- Nhập email, đồng ý điều khoản.
- Khi hỏi redirect HTTP→HTTPS: **chọn Yes (option 2)**.
- Certbot tự sửa file Nginx ở bước 3, thêm `listen 443 ssl` và đường dẫn cert.

Cert hạn 90 ngày, certbot tự cài timer gia hạn. Kiểm tra:
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

Xong bước này: `https://api.<domain>/api/v1/...` đã chạy.

### Bước 5 — Sửa `application.yaml` (⚠️ hay bị quên)

Sau khi có Nginx, Spring nhìn thấy request đến là `http://localhost:8080`, **không biết bên ngoài là HTTPS**. Hậu quả: mọi URL do BE tự sinh ra (redirect, link Swagger, và quan trọng nhất là **`returnUrl` của PayOS**) sẽ ra `http://` → luồng thanh toán đứt.

Thêm vào config profile prod:

```yaml
server:
  forward-headers-strategy: framework   # đọc X-Forwarded-Proto do Nginx gửi
  address: 127.0.0.1                    # chỉ nghe nội bộ, không phơi 8080 ra internet

spring:
  servlet:
    multipart:
      max-file-size: 25MB               # khớp client_max_body_size của Nginx (mục B3)
      max-request-size: 30MB
```

Restart BE sau khi sửa.

### Bước 6 — Đóng port 8080 khỏi internet

HTTPS chạy ổn rồi thì không còn lý do phơi 8080:

```bash
sudo ufw delete allow 8080/tcp
```

Nginx gọi qua `127.0.0.1` nên không ảnh hưởng. Giữ nguyên nguyên tắc cũ: **KHÔNG mở 5432 (Postgres)** ra internet.

---

## 4. Hai việc đi kèm — làm luôn cho gọn

Có HTTPS thì 2 mục đang treo trong doc 04/08 tự mở khoá:

### 4.1 PayOS (mục B2 — đang treo)

- Cập nhật `returnUrl` / `cancelUrl` → trỏ về **domain Vercel của web**, không để `localhost` hay domain Render cũ.
- Đăng ký **webhook URL** với PayOS: `https://api.<domain>/api/v1/<đường-dẫn-webhook-thật>`
  (trước đây không đăng ký được vì PayOS yêu cầu HTTPS)

### 4.2 CORS (mục B1)

Web Vercel sẽ gọi **thẳng** BE (FE bỏ lớp proxy `vercel.json`), nên whitelist `https://*.vercel.app` phải **giữ nguyên**. Nếu BE đã cấu hình từ 04/08 thì không cần sửa gì.

---

## 5. BE cần trả lại FE đúng 1 thứ

> **URL cuối cùng:** `https://api.<domain>` → `` (BE điền vào đây)

Nhận được là FE sửa 3 chỗ, mất 2 phút:
- `mobile-app/.env` — `EXPO_PUBLIC_REAL_API_BASE_URL`
- `mobile-app/eas.json` — cả 3 profile `development` / `preview` / `production`
- `frontend-web/vercel.json` — bỏ rewrite proxy, gọi thẳng

Sau đó APK release build ra là chạy được, không cần vá `usesCleartextTraffic`.

---

## 6. Checklist

```
[ ] 1. Đăng ký domain (hoặc DuckDNS free), tạo A record api.<domain> → 103.78.3.170
[ ] 2. ufw allow 80/tcp và 443/tcp
[ ] 3. apt install nginx, tạo /etc/nginx/sites-available/sep-api
       (proxy_pass 127.0.0.1:8080 + X-Forwarded-Proto + client_max_body_size 25M)
[ ] 4. certbot --nginx -d api.<domain>, chọn redirect HTTP→HTTPS
[ ] 5. application.yaml: server.forward-headers-strategy=framework
       + address 127.0.0.1 + multipart max-file-size 25MB → restart BE
[ ] 6. ufw delete allow 8080/tcp
[ ] 7. PayOS: cập nhật returnUrl/cancelUrl + đăng ký webhook HTTPS
[ ] 8. Báo FE URL cuối: https://api.<domain>
```

---

## 7. Nếu không kịp làm — phương án tạm

FE có thể vá bằng `expo-build-properties` bật `usesCleartextTraffic: true` để APK release gọi được HTTP. **Nhược điểm:** JWT và toàn bộ traffic đi plaintext, Google Play cảnh báo, và **PayOS webhook vẫn không dùng được**. Chỉ nên dùng cho demo nội bộ, không dùng cho bản nộp.
