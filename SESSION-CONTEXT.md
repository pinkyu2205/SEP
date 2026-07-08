# SESSION CONTEXT — Đọc file này đầu mỗi session mới

> Cập nhật lần cuối: **08/07/2026** (BE đã fix 2 gap dashboard + notification bảo trì, mình verify live PASS; FE sửa notificationService.real + bỏ mock fallback màn tạo bảo trì).
> Cách dùng: mở session mới → đưa file này cho Claude (hoặc bảo "đọc SESSION-CONTEXT.md") → vào việc ngay, không cần kể lại lịch sử.

---

## 1. Cấu trúc project

| Repo | Đường dẫn | Nội dung |
|---|---|---|
| **SEP** (repo chính, git branch `Long`) | `c:\Chuyên ngành\Đồ án kì SU\SEP` | `frontend-web/` (React+Vite, admin/host portal) + `mobile-app/` (Expo RN, manager+tenant) |
| **BE Spring** (repo riêng, branch `main`) | `C:\sep490\backup\Sub-leasing-managemant-system` | Java Spring Boot 4 + Postgres. **KHÔNG tự sửa code BE** — chỉ đọc/test; cần gì thì viết file MD bàn giao (convention của nhóm) |

Đề tài: SLMS — hệ thống quản lý thuê nhà nguyên căn → cải tạo → cho thuê lại từng phòng (xem đề cương trong `Doc/`). 3 client: mobile tenant, mobile manager (Operations), web admin.

## 2. Chạy môi trường

```bash
# BE (port 8080) — .env đã có sẵn trong repo BE (DB local, JWT...)
cd /c/sep490/backup/Sub-leasing-managemant-system && set -a && source .env && set +a && ./mvnw.cmd spring-boot:run

# Web:    cd frontend-web && npm run dev
# Mobile: cd mobile-app  && npx expo start   (đổi .env phải thêm -c)
# Postgres client: "/c/Program Files/PostgreSQL/18/bin/psql.exe" (không có trong PATH)
# Lấy connection: parse DB_URL trong .env của BE (jdbc:postgresql://host:port/dbname)
```

Kiểm tra type FE: `npx tsc --noEmit` trong từng thư mục; web build: `npm run build`.

## 3. Tài khoản test (DB đã seed bằng `SampleDataSeeder`, mật khẩu chung `123456`)

| Vai | Tài khoản |
|---|---|
| Manager chính để test | **`manager01` / `123456`** (quản property 81 "Nhà chia phòng Lê Lợi 01" — phòng 271+ trống) |
| Admin | `admin01` / `123456` |
| Tenant seed | `tenant01`..`tenant22` / `123456` |
| Tenant tạo qua luồng onboarding thật | **`0977111333` / `newpass123`** (có HĐ ACTIVE #45, phòng 270, property 81) |
| Khách mới do luồng tạo | username = SĐT thuần, mật khẩu mặc định **`tenant123`**, bắt đổi MK lần đầu |

⚠️ Tài khoản `long2` CŨ **không còn tồn tại** (DB bị wipe + reseed 02/07). OTP đang **stub dev**: mọi mã 6 chữ số đều pass.

## 4. Trạng thái các luồng chính (đã verify live tối 02/07/2026)

| Luồng | Trạng thái |
|---|---|
| **Đón khách v2** (draft → gán manager → cọc PayOS → OTP → ACTIVE + tạo tài khoản → đổi MK lần đầu) | ✅ **HOÀN CHỈNH end-to-end** — BE fix hết 5 bug (commit `c82119d`, PR #18), mình đã verify từng cái |
| **Import HĐ từ file** (`Template_contract` DOCX/PDF đã điền → auto bóc 7 field → tạo draft) | ✅ Chạy đúng cả DOCX lẫn PDF (parser `frontend-web/src/utils/pdfExtract.ts`). File scan/ảnh cần OCR — chưa làm |
| **Bảo trì thiết bị** (tenant tạo → manager tiếp nhận/hẹn lịch/sửa → nghiệm thu; photo-gate; timeline; room status; phân quyền) | ✅ Chạy end-to-end — 6 API mới + response đủ contract. **2 gap cũ đã fix & verify PASS 08/07** (dashboard tính cả CONFIRMED; in-app notification cho tenant + manager) |
| **Phí bảo trì costPaidBy=TENANT** | ✅ BE làm đúng thiết kế đã chốt: ghi `tenant_pending_charges` (PENDING) → kỳ billing kế phát hành invoice type MAINTENANCE riêng; **không mutate invoice đã phát hành** |
| Duyệt giá (Case 2), billing điện nước, host portal | Có sẵn từ trước, không đụng trong đợt này |

## 5. Việc còn tồn

**~~Gửi BE (2 gap nhỏ)~~ → BE ĐÃ FIX, verify live PASS 08/07/2026:**
1. ✅ Dashboard bảo trì: `resolved`/`totalRepairCost` giờ đếm `IN ('DONE','CONFIRMED')` — test: ticket CONFIRMED vẫn giữ resolved=1, cost=500000.
2. ✅ Notification bảo trì: đổi status → ghi bảng `notifications` cho tenant (+push nếu có token); tạo ticket mới → in-app notification + push cho manager của property (`GET/PUT /api/v1/notifications`, `/unread-count`, `/{id}/read`, `/read-all` — đều PASS, phân quyền đúng: user khác mark-read trả 404).
   - Ghi chú nhỏ (không chặn): tenant cũng nhận notif cho hành động của chính mình (tạo → notif PENDING, tự confirm → notif CONFIRMED); schedule + confirm-schedule tạo 2 notif SCHEDULED trùng; dashboard là số liệu TOÀN HỆ THỐNG chưa scope theo manager (có từ trước).

**FE còn nợ (làm khi rảnh):**
1. ✅ **ĐÃ LÀM 08/07**: `MaintenanceCreateScreen.tsx` bỏ fallback mock; giờ luôn gọi real API (roomId lấy từ QR thiết bị, không có thì từ `getDashboard().room.id`), lỗi thì Alert lỗi thật.
2. ✅ **ĐÃ LÀM 08/07**: `notificationService.real.ts` sửa 3 mismatch với BE: parse `Page.content` (trước đọc như mảng → vỡ), map `content`→`body` + `read`→`isRead`, PATCH→PUT cho mark-read/read-all; chuẩn hóa type `MAINTENANCE` → `maintenance_new/accepted/resolved` cho filter/icon UI.
3. Soát UI mobile với status BE đầy đủ (ACKNOWLEDGED/SCHEDULED/ON_HOLD/PENDING_APPROVAL/DONE/CONFIRMED/REOPENED — mobile type hẹp hơn, đã có `normalizeReqStatus` map nhưng chưa soát kỹ từng màn).
4. Web `NotificationType` chưa có `customer_assigned` (managers dùng mobile nên chưa gấp).
5. Cân nhắc xóa các mock/store cũ của maintenance khi mọi màn đã chạy real.

**Chưa test:** push notification thật xuống device (cần thiết bị thật + EAS project id); OTP Twilio thật (đang stub); PayOS webhook thật (mới test tạo QR + mark PAID tay).

## 6. File tham chiếu trong repo SEP (root)

| File | Nội dung |
|---|---|
| `BE-CONTEXT-LuongDonKhachV2-FullFlow.md` | **Nguồn chuẩn luồng đón khách**: sequence 9 bước, JSON thật, bảng endpoint, kịch bản test chốt §6. (File handoff gốc `BE-tenant-onboarding-v2-handoff.md` đã thất lạc — dùng file này) |
| `API-GAPS-BaoTri-DonKhachV2-BE-TODO.md` | Danh sách gap bảo trì + import đã gửi BE (**BE đã fix gần hết** — xem mục 4-5 ở trên để biết cái gì còn) |
| `API-BUG-DonKhachV2-ManagedContracts-BE-TODO.md` | Bug managed-list + RENTED (**ĐÃ FIX**, giữ để tham chiếu) |
| `SESSION-CONTEXT.md` | File này |

Spec bảo trì gốc: `doc/Maintenance_Improved_Flow_BE_Spec.md` trong **git history** repo SEP (commit `5550f43`, đã xóa khỏi main).

## 7. Lưu ý kỹ thuật hay vấp (đỡ mất thời gian dò lại)

- **Login response**: key JSON là **`firstLogin`** (không phải `isFirstLogin` — Jackson bỏ tiền tố "is"). Mobile đã sửa đọc đúng.
- **`OnboardTenantRequest`**: 3 field boolean primitive (`draft`, `requireDepositPayment`, `requireHostPriceApproval`) — **thiếu field nào là Jackson 400**. Web đã có helper `withBooleanDefaults` trong `tenant.service.ts`.
- **change-password** cần đủ 3 field: `oldPassword`, `newPassword`, `confirmPassword`.
- **assign-manager** body dùng `assignedManagerId` (không phải `managerId`).
- **curl + tiếng Việt trên Git Bash bị hỏng UTF-8** → viết body JSON ra file (Write tool) rồi `--data-binary @file`. psql cũng dính lỗi encoding với tiếng Việt inline → dùng ASCII cho data test.
- **Node script trong scratchpad**: `cd` vào scratchpad rồi chạy `node script.js` với đường dẫn tương đối (path tuyệt đối kiểu `/c/...` bị Node trên Windows hiểu sai).
- Bảng Postgres: user là `"User"` (quoted, hoa), tenant profile là `tenant` (PK = `user_id`), HĐ là `tenant_contracts`, người ở cùng `household_members`, phí chờ `tenant_pending_charges`, timeline bảo trì `maintenance_timelines`.
- Ảnh bảo trì lúc tạo (`images[]`) được BE ghi vào `beforeImageUrls` → được tính là ảnh "before" cho photo-gate.
- Mobile gọi managed list **không kèm `status`** — nhánh else của `getManagedContracts` là nhánh quan trọng nhất.
- BE dev chạy `ddl-auto: update` + `DatabaseSchemaMigration` (ApplicationRunner @Order(0)) — schema drift là nguồn bug kinh điển của repo này; nghi ngờ gì cứ so entity với `information_schema.columns`.

## 8. Bước tiếp theo gợi ý (chọn theo nhu cầu)

1. Test tay trên UI thật (web + Expo) toàn bộ luồng đón khách theo kịch bản §6 của `BE-CONTEXT-LuongDonKhachV2-FullFlow.md` — đến giờ mới verify qua API.
2. Làm 2 việc FE nợ ở mục 5 (bỏ fallback mock + soát status UI bảo trì).
3. Nhắc BE 2 gap nhỏ (dashboard + notification manager) rồi verify lại nhanh.
4. Tiếp tục Report 4 (SDD) — có sẵn `Report4-Software-Design-Document.md` + `TIEN-DO-Report4-SDD.md` + `diagrams/` trong repo (đợt trước đang làm dở).
