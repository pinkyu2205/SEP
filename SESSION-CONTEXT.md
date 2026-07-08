# SESSION CONTEXT — Đọc file này đầu mỗi session mới

> Cập nhật lần cuối: **08/07/2026 (tối)** — BE đã fix CẢ 4 điểm trong `API-BUG-BaoTri-Reopen-BE-TODO.md` (reopen NPE + 3 gợi ý notif/dashboard), mình verify live **PASS toàn bộ** (ticket #9 chạy full vòng kể cả REOPENED → xử lý lại → CONFIRMED). Deep-link manager tự chạy không cần sửa FE. Phát hiện 2 điểm nhỏ mới → `API-NOTIF-Sort-BE-TODO.md`; FE đã vá sort notif client-side.
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
| **Bảo trì thiết bị** (tenant tạo → manager tiếp nhận/hẹn lịch/sửa → nghiệm thu; photo-gate; timeline; room status; phân quyền) | ✅ **HOÀN CHỈNH end-to-end kể cả reopen** — verify live 08/07 tối: full vòng 13/13 bước PASS (create → ack → schedule → confirm-schedule → IN_PROGRESS → resolve → reject REOPENED → xử lý lại → CONFIRMED); notif đúng, deep-link manager có `#id`, dashboard scope theo manager |
| **Phí bảo trì costPaidBy=TENANT** | ✅ BE làm đúng thiết kế đã chốt: ghi `tenant_pending_charges` (PENDING) → kỳ billing kế phát hành invoice type MAINTENANCE riêng; **không mutate invoice đã phát hành** |
| Duyệt giá (Case 2), billing điện nước, host portal | Có sẵn từ trước, không đụng trong đợt này |

## 5. Việc còn tồn

**~~Gửi BE (2 gap nhỏ)~~ → BE ĐÃ FIX, verify live PASS 08/07/2026:**
1. ✅ Dashboard bảo trì: `resolved`/`totalRepairCost` giờ đếm `IN ('DONE','CONFIRMED')` — test: ticket CONFIRMED vẫn giữ resolved=1, cost=500000.
2. ✅ Notification bảo trì: đổi status → ghi bảng `notifications` cho tenant (+push nếu có token); tạo ticket mới → in-app notification + push cho manager của property (`GET/PUT /api/v1/notifications`, `/unread-count`, `/{id}/read`, `/read-all` — đều PASS, phân quyền đúng: user khác mark-read trả 404).
   - Ghi chú nhỏ (không chặn): tenant cũng nhận notif cho hành động của chính mình (tạo → notif PENDING, tự confirm → notif CONFIRMED); schedule + confirm-schedule tạo 2 notif SCHEDULED trùng; dashboard là số liệu TOÀN HỆ THỐNG chưa scope theo manager (có từ trước).

**FE còn nợ (làm khi rảnh):**
1. ✅ **ĐÃ LÀM 08/07**: `MaintenanceCreateScreen.tsx` bỏ fallback mock; giờ luôn gọi real API (roomId lấy từ QR thiết bị, không có thì từ `getDashboard().room.id`), lỗi thì Alert lỗi thật.
2. ✅ **ĐÃ LÀM 08/07**: `notificationService` (sau refactor: `services/shared/notificationService.ts`) sửa 3 mismatch với BE: parse `Page.content`, map `content`→`body` + `read`→`isRead`, PATCH→PUT; chuẩn hóa type `MAINTENANCE` → `maintenance_new/accepted/resolved`.
3. ✅ **ĐÃ LÀM 08/07 (chiều)** — nối đủ rich flow bảo trì vào API thật:
   - Mapper (`services/shared/maintenanceMappers.ts`): map 1-1 đủ 10 status BE (`BE_STATUS_MAP`, bỏ bóp về 4 loại); suy `scheduledSlots`/`confirmedSlot` từ `scheduledDate` + timeline `"Khách chọn lịch"`. Thêm status `reopened` vào 3 union + META (label "Mở lại" đỏ).
   - Tenant `MaintenanceDetailScreen`: nạp detail thật, nút chọn lịch hẹn + nghiệm thu/từ chối gọi `confirm-schedule`/`confirm` thật (trước bị gate `isMock` → real không bao giờ có nút).
   - Manager `TicketDetailScreen`: `richMode = true` cho cả real — tiếp nhận/đề xuất lịch/bắt đầu/tạm dừng/tiếp tục đều gọi API thật (`acknowledge`/`schedule`/`status`); resolve báo đúng DONE vs PENDING_APPROVAL; nút duyệt demo chỉ còn cho mock; ticket REOPENED có nút "Tiếp nhận xử lý lại".
   - Deep-link: bấm notification bảo trì → parse `#id` từ body → mở thẳng detail (tenant + manager; manager notif chưa có #id → fallback tab bảo trì).
   - `MaintenanceManagerScreen`/`MaintenanceListScreen`: sửa nhóm đếm stats theo bộ status đầy đủ.
   - Test live 12/13 bước PASS (xem `API-BUG-BaoTri-Reopen-BE-TODO.md` — bước reject fail do bug BE).
4. Web `NotificationType` chưa có `customer_assigned` (managers dùng mobile nên chưa gấp).
5. Cân nhắc xóa các mock/store cũ của maintenance khi mọi màn đã chạy real. Lưu ý: `BuildingMaintenanceScreen` (bảo trì theo tòa) + `TenantMaintenanceScreen` vẫn thuần mock — vào ticket thật phải đi từ `MaintenanceManagerScreen` (queue chính, đã real).

**~~Gửi BE (08/07 chiều)~~ → BE ĐÃ FIX CẢ 4, verify live PASS 08/07 tối** (test script chạy ticket #9 full vòng):
1. ✅ Reopen (confirm accept=false) → 200, status REOPENED, không còn NPE; vòng REOPENED → acknowledge lại → resolve → accept → CONFIRMED chạy trơn.
2. ✅ Notif manager có `(#id)` cuối content → deep-link FE ([NotificationCenterScreen.tsx:163](mobile-app/src/screens/manager/NotificationCenterScreen.tsx#L163) parse `#(\d+)`) tự chạy, KHÔNG cần sửa FE.
3. ✅ Hết notif tự thao tác + hết 2 notif SCHEDULED trùng — tenant nhận đúng 4 notif cho #9: ACKNOWLEDGED, SCHEDULED (1 lần), IN_PROGRESS, DONE.
4. ✅ Dashboard scope theo manager: manager02 thấy 0/0₫, admin vẫn thấy tổng hệ thống.

**Gửi BE (mới, 08/07 tối):** `API-NOTIF-Sort-BE-TODO.md` — 2 điểm nhỏ không chặn luồng: (1) `GET /notifications` trả Page KHÔNG sort (cũ nhất trước) + bỏ qua param `sort` → user >50 notif sẽ không thấy notif mới (FE đã vá sort client-side trong `notificationService.list()`, nhưng chỉ cứu trong 50 row đầu); (2) `MaintenanceRequestResponse` chưa expose `reopenCount` (entity có, DTO không) — cần cho badge "Đã mở lại N lần".

**Chưa test:** push notification thật xuống device (cần thiết bị thật + EAS project id); OTP Twilio thật (đang stub); PayOS webhook thật (mới test tạo QR + mark PAID tay).

## 6. File tham chiếu trong repo SEP (root)

| File | Nội dung |
|---|---|
| `API-NOTIF-Sort-BE-TODO.md` | **Handoff BE mới nhất (08/07 tối)**: GET /notifications không sort (user >50 notif mất notif mới) + response bảo trì thiếu `reopenCount` |
| `API-BUG-BaoTri-Reopen-BE-TODO.md` | Handoff cũ (08/07 chiều) — **BE đã fix hết, verify PASS**, giữ làm tài liệu tham chiếu |
| `ARCHITECTURE.md` | Bản đồ cấu trúc theo role (web + mobile) sau refactor của Tiên — đọc trước khi tìm file |
| `Report4-Software-Design-Document.md` + `diagrams/` | Report 4 SDD đang làm dở + bộ PlantUML |
| `SESSION-CONTEXT.md` | File này |

⚠️ **Các file MD đã MẤT (bị xóa trước khi commit 08/07, chưa từng vào git):** `BE-CONTEXT-LuongDonKhachV2-FullFlow.md` (nguồn chuẩn luồng đón khách — mất lần 2!), `API-GAPS-BaoTri-DonKhachV2-BE-TODO.md`, `API-BUG-DonKhachV2-ManagedContracts-BE-TODO.md` (nội dung đã fix hết, không tiếc), `TIEN-DO-Report4-SDD.md`. Nội dung chính của các file này đã được tóm vào mục 4–5 và memory của Claude; cần chi tiết luồng đón khách thì đọc code + `git show c8d1232`.

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

1. Test tay trên UI thật (Expo + web) luồng bảo trì rich (API đã verify PASS hết, kể cả reopen): tenant tạo → manager tiếp nhận/hẹn lịch → tenant chọn lịch → sửa → nghiệm thu/reject. Và luồng đón khách end-to-end trên UI.
2. Nối real API cho 2 màn bảo trì còn mock: `BuildingMaintenanceScreen` (theo tòa — `listForManager({propertyId})` có sẵn) + cân nhắc `TenantMaintenanceScreen`.
3. Tiếp tục Report 4 (SDD) — `Report4-Software-Design-Document.md` + `diagrams/` (file tiến độ `TIEN-DO-Report4-SDD.md` đã mất, xem trực tiếp nội dung report để biết đang dở phần nào).
4. Nhắc BE làm 2 điểm nhỏ trong `API-NOTIF-Sort-BE-TODO.md` (sort notif DESC + expose `reopenCount`).

## 9. Ghi chú merge 08/07 (cấu trúc mới sau refactor của Tiên)

- Đã merge `origin/main` (refactor theo role, commit `166445d`) vào `Long` và push — chỉ 1 conflict thật (import của `MaintenanceCreateScreen`), resolve xong, tsc sạch cả 2 app.
- **Đường dẫn mobile đổi hết**: services gom theo role — `services/core/` (apiClient, cloudinary, pushToken...), `services/auth/`, `services/shared/` (maintenanceService, maintenanceMappers, notificationService — **bỏ hậu tố `.real`**), `services/tenant/` (selfService, billingService), `services/manager/`. Import dùng alias `@/`. Web: `pages/super-admin/` → `pages/admin/`, gom theo `pages/host/`, v.v. Xem `ARCHITECTURE.md`.
