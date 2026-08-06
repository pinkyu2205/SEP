# FE HANDOFF — Đổi cấu hình web + mobile sang backend trên VPS

**Ngày:** 04/08/2026
**Gửi:** bạn FE còn lại (phụ trách web trên Vercel)
**Bối cảnh:** BE chuyển từ Render sang VPS riêng. Web đang deploy Vercel, mobile chạy Expo Go trên máy thật. VPS **chỉ có IP, chưa có domain**.

Doc này gồm 2 phần: (1) **mình cần bạn cung cấp gì**, (2) **các thay đổi cụ thể phải làm**, có ghi rõ file và dòng.

---

> ## 📌 TÓM TẮT — BE đã deploy xong, mình đã sửa code sẵn
>
> **BE live:** `http://103.78.3.170:8080` · prefix `/api/v1` · Swagger `http://103.78.3.170:8080/swagger-ui/index.html`
> Login `admin01 / 123456` — mình đã test từ máy ngoài, **HTTP 200, có data thật**. CORS `*.vercel.app` BE đã whitelist và test OK.
>
> **Mình đã commit sẵn trong repo:**
> - `frontend-web/vercel.json` — thêm rewrite proxy `/api` (xem 2.1)
> - `mobile-app/.env` + `mobile-app/eas.json` — đổi từ Render sang IP VPS
>
> **Việc của bạn — 3 thứ:**
> 1. Vào Vercel → Settings → Environment Variables: **XOÁ `VITE_API_URL` nếu đang có** (xem 2.2, đây là điểm dễ hỏng nhất)
> 2. **Redeploy** web sau khi pull code mới
> 3. Cho mình biết **domain Vercel** + **Vercel đã có 2 key Goong chưa** (Phần 1)

---

## PHẦN 1 — Mình cần bạn cung cấp

| # | Thông tin | Bạn điền |
|---|---|---|
| 1 | Domain Vercel của web (VD `sep-slms.vercel.app`) — cả prod và preview nếu có | `` |
| 2 | Trên Vercel Project → Settings → Environment Variables đang có những biến nào? Chụp màn hình hoặc liệt kê **tên biến** (không cần dán giá trị bí mật vào doc) | `` |
| 3 | Có `VITE_GOONG_API_KEY` và `VITE_GOONG_MAPTILES_KEY` trên Vercel chưa? | `` |
| 4 | Cloudinary đang dùng cloud `dtcdo6jtd` + preset `ml_default` — giữ nguyên cho prod hay tách tài khoản riêng? | `` |
| 5 | Ai có quyền deploy/đổi env trên Vercel? | `` |

**Vì sao cần mục 2–3:** repo local chỉ có `frontend-web/.env` với 2 biến Cloudinary. Nhưng code còn đọc `VITE_API_URL`, `VITE_GOONG_API_KEY`, `VITE_GOONG_MAPTILES_KEY` (xem [vite-env.d.ts](../frontend-web/src/vite-env.d.ts)). Nếu Vercel chưa set Goong key thì bản đồ và autocomplete địa chỉ đang **tắt âm thầm** trên prod (component tự fallback về input thường, không báo lỗi). Mình cần biết thực tế trên Vercel để khỏi sửa nhầm.

---

## PHẦN 2 — Các thay đổi cần làm

### ⚠️ Vấn đề chặn cứng phải hiểu trước

Web Vercel chạy **HTTPS**. BE trên VPS chỉ có **HTTP + IP**. Trình duyệt **chặn cứng** request từ trang HTTPS sang `http://` (mixed content).

**Hệ quả: KHÔNG được set `VITE_API_URL=http://<IP>:8080` trên Vercel.** Làm vậy web sẽ chết toàn bộ API, và lỗi hiện ra trong Console trông rất giống lỗi CORS nên rất dễ debug nhầm hướng — thực tế request chưa từng rời khỏi trình duyệt.

Cách xử lý: **để Vercel proxy hộ**. Vercel gọi BE từ phía server (server-to-server, không qua trình duyệt) nên không dính mixed content, và vì trình duyệt chỉ thấy same-origin nên **cũng không cần BE cấu hình CORS**.

---

### 2.1. Web — sửa `vercel.json`

File hiện tại ([frontend-web/vercel.json](../frontend-web/vercel.json)):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**✅ Mình đã sửa sẵn, bạn chỉ cần pull:**

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://103.78.3.170:8080/api/:path*"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Cực kỳ quan trọng — thứ tự:** rule `/api/:path*` phải nằm **TRƯỚC** rule catch-all `/(.*)`. Vercel xét rewrites theo thứ tự từ trên xuống, rule đầu khớp là dừng. Nếu để catch-all lên trước thì mọi request `/api/...` sẽ trả về `index.html`, và triệu chứng là **API trả về HTML thay vì JSON** → axios báo lỗi parse rất khó hiểu.

### 2.2. Web — biến môi trường trên Vercel

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `VITE_API_URL` | **KHÔNG set / xoá đi** | Để trống thì `baseURL` = `''` (xem [api.ts:7](../frontend-web/src/services/api.ts#L7)) → gọi same-origin `/api/...` → rơi vào rewrite ở 2.1. Đây chính là hành vi ta muốn. |
| `VITE_CLOUDINARY_CLOUD_NAME` | `dtcdo6jtd` | giữ nguyên |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | `ml_default` | giữ nguyên |
| `VITE_GOONG_API_KEY` | *(cần cấp)* | thiếu → autocomplete địa chỉ tắt |
| `VITE_GOONG_MAPTILES_KEY` | *(cần cấp)* | thiếu → bản đồ không hiển thị |

Lưu ý: biến `VITE_*` bị **nhúng thẳng vào bundle JS lúc build**, ai cũng xem được trong DevTools. Vì vậy Goong key phải khoá theo domain trong dashboard Goong, và tuyệt đối không đặt secret thật (JWT secret, PayOS checksum key) vào biến `VITE_*`.

Sau khi đổi env trên Vercel phải **redeploy** — env chỉ được nhúng lúc build, không áp dụng cho bản đã build sẵn.

### 2.3. Web — hạ timeout (tuỳ chọn)

[api.ts:9](../frontend-web/src/services/api.ts#L9) đang để `timeout: 90000` vì Render free tier ngủ sau 15 phút. VPS không ngủ nên có thể hạ về `30000` để lỗi mạng hiện ra sớm thay vì user ngồi chờ 90 giây.

### 2.4. Mobile — mình sẽ sửa, ghi ở đây để bạn nắm

`mobile-app/.env` dòng 13 và `mobile-app/eas.json` (3 chỗ) đang trỏ về Render cũ:

```
EXPO_PUBLIC_REAL_API_BASE_URL=https://sub-leasing-managemant-system.onrender.com
```

**✅ Mình đã sửa xong cả 2 file:**
```
EXPO_PUBLIC_REAL_API_BASE_URL=http://103.78.3.170:8080
```
Ai pull code về nhớ chạy `npx expo start -c` (cờ `-c` xoá cache) — không có `-c` thì Metro vẫn dùng giá trị `.env` cũ đã cache.

Mobile **không dính mixed content** vì không chạy trong trình duyệt, nên gọi thẳng HTTP + IP được. Expo Go trên Android vẫn cho phép cleartext HTTP.

> **Nhưng:** nếu sau này nhóm build **APK thật qua EAS**, Android sẽ **chặn cleartext HTTP** → app trắng, gọi API fail hết. Lúc đó bắt buộc phải có domain + HTTPS (hoặc thêm `usesCleartextTraffic` vào `app.json`, cách này chỉ nên dùng tạm để demo). Nếu kế hoạch nộp bài có APK thì nên tính chuyện mua domain sớm.

---

## PHẦN 3 — Checklist kiểm tra sau khi deploy

Làm lần lượt, dừng lại ở bước đầu tiên fail:

1. ~~**BE sống chưa**~~ — ✅ **mình đã test rồi, PASS**:
   `curl -i http://103.78.3.170:8080/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin01","password":"123456"}'`
   → HTTP 200, trả token JWT, `GET /api/v1/properties` cũng ra data thật.

2. **Rewrite của Vercel chạy chưa** — sau khi deploy (bước này bạn làm, mình chưa có domain):
   `curl -i https://<domain-vercel>/api/v1/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin01","password":"123456"}'`
   → phải ra **JSON giống hệt bước 1**. Nếu trả về HTML (`<!doctype html>`) nghĩa là thứ tự rewrite sai — xem lại 2.1.

3. **Login trên web thật** (`admin01 / 123456`) — mở web Vercel, mở tab Network, đăng nhập. Request phải đi tới `https://<domain-vercel>/api/v1/auth/login` (same-origin), **không** phải `http://103.78.3.170...`. Nếu thấy request đi thẳng ra IP, hoặc Console báo *"Mixed Content: was loaded over HTTPS, but requested an insecure resource"* → `VITE_API_URL` vẫn còn set trên Vercel, xoá rồi redeploy.

4. **Upload ảnh** — thử tạo yêu cầu bảo trì có ảnh chụp từ điện thoại (3–8 MB). Lỗi **413** nghĩa là Nginx/Spring bên BE giới hạn 1 MB, báo team BE (đã ghi trong doc gửi BE, mục B3).

5. **Mobile Expo Go** — đăng nhập bằng tài khoản tenant, xem dashboard và danh sách hoá đơn có data không.

6. **PayOS** — bấm thanh toán 1 hoá đơn, xem có nhảy đúng sang trang PayOS và quay về đúng web Vercel không. Nếu quay về `localhost` → `returnUrl` bên BE chưa đổi.

---

## PHẦN 4 — Rủi ro cần biết trước

| Rủi ro | Ảnh hưởng | Xử lý |
|---|---|---|
| Web HTTPS ↔ BE HTTP | Chết toàn bộ API nếu set `VITE_API_URL` trỏ IP | ✅ Đã dùng rewrite ở 2.1 — chỉ cần đảm bảo `VITE_API_URL` trống |
| Không có domain | Không build được APK dùng thật; PayOS webhook có thể không đăng ký được | Mua domain + Let's Encrypt (miễn phí SSL) |
| IP VPS `103.78.3.170` đổi | Phải sửa `vercel.json` + `.env` mobile + redeploy cả hai | Chốt IP tĩnh với nhà cung cấp VPS |
| Goong key thiếu trên Vercel | Bản đồ + gợi ý địa chỉ tắt âm thầm, không báo lỗi | Xem mục 1.3 |
| QR thiết bị nhúng domain cũ | Quét QR ra 404 | Đã hỏi BE ở doc bàn giao BE, mục B4 |

---

**File liên quan:** `docs/BE-HANDOFF-deploy-vps-info-request-2026-08-04.md` (danh sách thông tin đã gửi team BE).

Bạn điền giúp mình Phần 1 (5 mục) rồi gửi lại, mình sẽ sửa config và chạy checklist Phần 3.
