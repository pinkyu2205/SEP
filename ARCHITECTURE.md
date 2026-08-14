# Kiến trúc source — tổ chức theo Role

Toàn bộ source được sắp xếp theo **role người dùng** để nhìn vào là biết code nào phục vụ ai.
5 role: **admin** (quản trị hệ thống) · **host** (chủ nhà) · **manager** (quản lý vận hành) ·
**tenant** (khách thuê) · **guest** (khách vãng lai / public website).

> Quy ước chung: tên file/thư mục **tiếng Anh**, text UI tiếng Việt.
> Import dùng **path alias `@/` → `src/`** (không còn `../../..`). Ví dụ: `@/services/host.service`.

---

## 1) `frontend-web/` — Web quản trị + Public website (React + Vite)

Roles trên web: **admin**, **host**, **guest**. (manager & tenant vận hành trên mobile.)

```
src/pages/
  public/     → GUEST   — landing, danh sách & chi tiết phòng, liên hệ (public website)
  auth/       → chung   — LoginPage (đăng nhập quản trị)
  admin/      → ADMIN   — giám sát toàn hệ thống
    onboarding/          quy trình tiếp nhận nhà (Landing / CreateDraft / OperationConfig + panels)
    buildings/           form toà nhà
    properties/wizard/   wizard khởi tạo nhà
    zones/               quản lý khu vực
    (Overview, UserRoleManagement, HostManagement, *Monitoring, SystemConfiguration, ...)
  host/       → HOST    — chủ nhà vận hành tài sản của mình
    HostDashboard.tsx · PropertyReview.tsx
    properties/ contracts/ tenants/ managers/ maintenance/
    equipments/ finance/ reports/ notifications/
  zones/      → DÙNG CHUNG admin + host — "Khu vực & Quản lý" (ZoneOverview)
```

- **`pages/zones/`** là màn dùng chung: cùng dữ liệu, chỉ khác câu chữ theo vai
  (`<ZoneOverview audience="admin" | "host" />`, route `/admin/zones/assignment` và `/host/zones`).
  Nghiệp vụ: **một quận/huyện chỉ có MỘT quản lý vận hành**, gán cho khu vực là gán cho mọi
  nhà bên trong — không còn gán quản lý cho từng căn.

- **Routing** (`src/App.tsx`): `/` = public, `/login` = auth, `/admin/*` = admin, `/host/*` = host.
  URL không đổi khi refactor — chỉ vị trí file thay đổi.
- **Layout** theo role: `PublicLayout` · `AuthLayout` · `AdminLayout` · `HostLayout`.
- **Services** (`src/services/`) là các module **domain dùng chung** giữa admin & host, đặt tên thống nhất
  `*.service.ts` (vd `property.service.ts`, `host.service.ts`, `admin.service.ts`).
  Service riêng cho public: `public-property.service.ts`, `contact.service.ts`. Client lõi: `api.ts`.

## 2) `mobile-app/` — App di động (React Native / Expo)

Roles trên mobile: **guest**, **manager**, **tenant** (+ auth, shared).

```
src/screens/
  auth/     → đăng nhập / quên MK / đổi MK / tutorial
  guest/    → GUEST    — trang chủ, tìm & xem phòng (không cần đăng nhập)
  manager/  → MANAGER  — vận hành toà nhà: billing, meter, maintenance, contract, room...
  tenant/   → TENANT   — hoá đơn, hợp đồng, thanh toán, báo hỏng, checkout
  shared/   → dùng chung (ContractList, Profile)

src/services/            (đặt theo role, mirror screens)
  core/     hạ tầng: apiClient, realApiClient, publicApiClient, cloudinary, pushToken, notifications
  auth/     authService, realAuthService
  guest/    propertyService, searchService
  manager/  propertyService (adapter) · propertyApi (API thô) · invoiceService · equipmentService · roomService
  tenant/   tenantService, billingService, selfService
  shared/   maintenanceService (+maintenanceMappers), notificationService
```

- **Navigation** theo role: `GuestStackNavigator` · `ManagerTabNavigator` · `TenantTabNavigator` · `RootNavigator`.
- **Hai API client khác nhau, KHÔNG gộp:**
  `core/apiClient` (backend cũ, response bọc `{data}`) vs `core/realApiClient` (backend Spring thật, DTO phẳng).
- Đã bỏ hậu tố `.real` và xoá 2 file legacy chết (`invoiceService`, `maintenanceService` bản cũ).

---

## Ghi chú refactor (2026-07)

Refactor này **chỉ di chuyển / đổi tên file và sửa đường dẫn import** — không đổi logic, UI hay API.
Kiểm chứng: web `npm run build` (tsc + vite) pass; mobile `npx tsc --noEmit` pass.
Alias `@/` cấu hình tại: web `tsconfig.json` + `vite.config.ts`; mobile `tsconfig.json`
(Expo/Metro đọc `baseUrl` + `paths` mặc định).
