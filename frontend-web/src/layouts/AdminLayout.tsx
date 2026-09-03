import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {

  BarChart3,
  CreditCard, ShieldAlert,
  FileText, CalendarPlus,
  FilePlus,
  Gavel,
  MapPin,
  Menu,
  KeyRound,
  Package,
  PackageCheck,
  Search,
  Settings2,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
  Droplets,
  ReceiptText,
} from 'lucide-react';
import { useWebAuth } from '@/auth/WebAuthContext';
import { NotificationBell } from '@/components/NotificationBell';
import { maintenanceService } from '@/services/maintenance.service';
import { UnreadNotificationsProvider } from '@/contexts/UnreadNotificationsContext';
import { AppSidebar, type SidebarSection } from './AppSidebar';
import { UserMenu } from './UserMenu';

/*
 * Provider vẫn bọc quanh layout dù chuông không còn dùng tới: trang
 * /admin/notifications (render trong <Outlet/>) gọi `useUnreadNotifications().refresh`
 * để badge nhảy ngay sau khi đánh dấu đã đọc. Gỡ provider thì hook rơi về context
 * mặc định — refresh thành no-op, không lỗi gì cả nên rất khó phát hiện.
 */

/**
 * Menu Admin Portal. Badge phải là số THẬT — trước đây đếm từ mock
 * (`PLATFORM_MAINTENANCE_REQUESTS`, `AUDIT_LOGS`) nên hiện "9" trong khi hệ thống
 * thật không có yêu cầu bảo trì nào, đá nhau với Bảng điều hành. Giờ nhận từ API;
 * chưa có API nhật ký bảo mật thì không gắn badge còn hơn gắn số bịa.
 */
/**
 * ─── Vì sao gom lại như dưới đây (30/08/2026) ────────────────────────────────
 * Gom cùng nguyên tắc với sidebar Host (`layouts/Sidebar.tsx`) — hai cổng dùng chung
 * `AppSidebar` thì cũng nên gom menu cùng một kiểu, để người làm cả hai vai không phải
 * học hai bản đồ.
 *
 * Bản cũ: 18 mục / 7 nhóm, trong đó BỐN nhóm chỉ có một mục (Tổng quan, Quản trị,
 * Đón khách, Hệ thống). Tiêu đề nhóm tồn tại để PHÂN LOẠI — đặt trên đúng một dòng thì
 * nó chỉ chia nhỏ menu ra cho vụn. Nay: 5 nhóm, không nhóm nào dưới hai mục, Bảng điều
 * hành đứng riêng không cần tiêu đề.
 *
 * Hai cặp nhãn đụng nhau đã tách:
 *   • "Danh mục khu vực" ↔ "Khu vực & Quản lý"  (đứng sát nhau, cùng chữ "khu vực")
 *   • "Bảo trì & thiết bị" ↔ "Danh mục thiết bị" (đứng sát nhau, cùng chữ "thiết bị")
 * Nguyên tắc tách: **mọi "Danh mục *" là DỮ LIỆU NỀN, thuộc Hệ thống** — chúng được
 * khai báo một lần rồi gần như không đụng tới, khác hẳn việc vận hành hằng ngày. Còn
 * "Khu vực & Quản lý" đổi thành "Phân công khu vực" cho đúng việc trang đó làm (gán
 * quản lý cho quận/huyện) — trùng tên với bên Host, vì đúng là cùng một màn.
 *
 * "Khiếu nại" tách hẳn khỏi Tài chính: phân xử tranh chấp là việc XÉT XỬ (chỉ admin
 * làm được, và làm khi có người tố), khác hẳn việc phát hành hoá đơn / theo dõi thu
 * tiền. Trộn chung trong một nhóm 6 mục thì cả hai loại việc đều chìm. "Báo lỗi do
 * khách" (01/09/2026) đứng cùng nhóm vì cùng bản chất: admin phân xử lời manager tố
 * khách gây hư hỏng, không phải việc vận hành hằng ngày.
 */
const buildSections = (openMaintenance: number, pendingFaultReview: number): SidebarSection[] => [
  {
    // Không tiêu đề — một mục thì tiêu đề không phân loại thêm được gì.
    items: [{ label: 'Bảng điều hành', path: '/admin', icon: BarChart3, end: true }],
  },
  {
    label: 'Tiếp nhận',
    items: [
      { label: 'Khởi tạo nhà', path: '/admin/buildings/draft', icon: FilePlus },
      { label: 'Cấu hình khai thác', path: '/admin/buildings/configuration', icon: Settings2 },
      // Nhập chung nhóm: tiếp nhận NHÀ rồi tiếp nhận KHÁCH là hai chặng liền nhau của
      // cùng một quy trình. Trước đây đứng riêng thành nhóm "Đón khách" một mục.
      { label: 'Hồ sơ đón khách', path: '/admin/onboarding', icon: UserPlus },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      // Trang HandoverMonitoring (route /admin/handover — giữ nguyên URL).
      // Đổi tên 24/08/2026: trang này giờ trả lời cả "nhà nào còn phòng trống", không
      // còn chỉ nói về tiến độ bàn giao nữa. Đây là màn "1 dòng = 1 nhà" duy nhất —
      // trang Hồ sơ đón khách là "1 dòng = 1 hợp đồng", không gộp được vào nhau.
      { label: 'Tình trạng nhà & phòng', path: '/admin/handover', icon: PackageCheck },
      { label: 'Bảo trì & thiết bị', path: '/admin/maintenance', icon: Wrench, badge: openMaintenance || undefined },
      // Admin cấp mã 6 số cho quản lý khi họ không chụp được ảnh đồng hồ (mentor ý 5).
      { label: 'Cấp mã đồng hồ', path: '/admin/meter-override', icon: KeyRound },
      { label: 'Phân công khu vực', path: '/admin/zones/assignment', icon: UserCog },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { label: 'Thanh toán', path: '/admin/billing', icon: CreditCard },
      { label: 'Hợp đồng', path: '/admin/contracts', icon: FileText },
      // Đơn xin gia hạn: khách đề nghị, ADMIN duyệt — quản lý chỉ góp ý. Xem
      // services/extensionRequest.service.ts để biết vì sao không để quản lý duyệt.
      { label: 'Đơn gia hạn', path: '/admin/extension-requests', icon: CalendarPlus },
      // Từ 13/08/2026 admin là người tải hoá đơn EVN lên, không còn là manager —
      // xem services/evnBill.service.ts để biết vì sao đổi.
      { label: 'Hoá đơn điện EVN', path: '/admin/evn-bills', icon: Zap },
      // Nước đi cùng mô hình với điện từ 14/08/2026 — trước đó manager tự khai đơn giá
      // nước trong app, không ai đối chiếu được với hoá đơn giấy.
      { label: 'Hoá đơn nước', path: '/admin/water-bills', icon: Droplets },
    ],
  },
  {
    // Nhãn từng mục bỏ chữ "Khiếu nại" vì tiêu đề nhóm đã nói rồi.
    label: 'Khiếu nại',
    items: [
      // Chỉ admin phân xử được, nên nằm ở cổng này chứ không phải cổng host.
      { label: 'Hoàn cọc', path: '/admin/refund-disputes', icon: ShieldAlert },
      // Manager báo lỗi do khách (report-fault, 01/09/2026) — admin phân xử đúng/sai,
      // cùng bản chất xét xử như 2 mục trên, không phải việc vận hành hằng ngày.
      { label: 'Báo lỗi do khách', path: '/admin/maintenance/fault-review', icon: Gavel, badge: pendingFaultReview || undefined },
      // Khiếu nại hoá đơn điện/nước (24/08/2026) — cùng lý do: là lời tố nhắm vào chính
      // người phát hành hoá đơn (admin) hoặc người đọc đồng hồ (quản lý), nên không để
      // hai vai đó tự phân xử. Admin cũng là vai duy nhất huỷ được hoá đơn đã phát hành.
      { label: 'Hoá đơn điện nước', path: '/admin/utility-disputes', icon: ReceiptText },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      // "RBAC" là từ lóng kỹ thuật trong một giao diện tiếng Việt — gọi đúng tên việc.
      { label: 'Người dùng & phân quyền', path: '/admin/users', icon: Users },
      /*
        `end` BẮT BUỘC ở đây: `/admin/zones` là tiền tố của `/admin/zones/assignment`,
        mà `NavLink` mặc định khớp theo tiền tố. Thiếu nó thì đứng ở trang Phân công
        khu vực sẽ thấy CẢ HAI mục cùng sáng — trước đây hai mục nằm sát nhau nên còn
        đỡ, nay chúng ở hai nhóm cách xa nhau thì nhìn như menu bị lỗi.
      */
      { label: 'Danh mục khu vực', path: '/admin/zones', icon: MapPin, end: true },
      { label: 'Danh mục thiết bị', path: '/admin/equipments', icon: Package },
      // ẨN — màn "Nhật ký & bảo mật" chạy 100% trên AUDIT_LOGS (dữ liệu giả trong
      // utils/adminMockData.ts): BE chưa có audit log nên không có gì thật để hiện.
      // Để lại một mục menu hứa hẹn giám sát bảo mật mà mở ra toàn dữ liệu bịa thì
      // nguy hiểm hơn là không có. Bỏ comment dòng này khi BE làm xong audit log —
      // xem doc/BE-NEED-audit-log-va-thiet-bi-2026-08-15.md
      // { label: 'Nhật ký & bảo mật', path: '/admin/security', icon: Activity },
    ],
  },
];

const initialsOf = (name?: string) =>
  (name || 'Admin').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'SA';

export const AdminLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMaintenance, setOpenMaintenance] = useState(0);
  const [pendingFaultReview, setPendingFaultReview] = useState(0);
  const { user, logout } = useWebAuth();

  // Badge bảo trì = yêu cầu chờ + đang xử lý (số thật, cùng nguồn với Bảng điều hành).
  useEffect(() => {
    let active = true;
    maintenanceService.getDashboard()
      .then(d => { if (active && d) setOpenMaintenance((d.pending ?? 0) + (d.inProgress ?? 0)); })
      .catch(() => { /* lỗi mạng: không gắn badge còn hơn gắn số sai */ });
    return () => { active = false; };
  }, []);

  // Badge "Báo lỗi do khách" = phiếu report-fault (faultResolutionPath null) chưa admin-review.
  useEffect(() => {
    let active = true;
    maintenanceService.getRequests({ status: 'TENANT_FAULT' }, 0, 200)
      .then(page => {
        if (!active) return;
        const n = (page.content ?? []).filter(r => !r.faultResolutionPath && !r.adminReviewedAt).length;
        setPendingFaultReview(n);
      })
      .catch(() => { /* lỗi mạng: không gắn badge còn hơn gắn số sai */ });
    return () => { active = false; };
  }, []);

  const sections = buildSections(openMaintenance, pendingFaultReview);
  const sidebarUser = {
    name: user?.fullName ?? 'Admin',
    subtitle: user?.username ? `@${user.username}` : 'Toàn quyền hệ thống',
    initials: initialsOf(user?.fullName),
  };
  const brand = { title: 'Hoàng Bình Land', subtitle: 'Admin Portal', icon: ShieldCheck };

  return (
    <UnreadNotificationsProvider>
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:flex">
      <aside className="sticky top-0 hidden h-screen flex-shrink-0 select-none lg:block">
        <AppSidebar
          accent="red"
          storageKey="hbl_sidebar_admin"
          brand={brand}
          sections={sections}
          user={sidebarUser}
          onLogout={logout}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full max-w-[86vw] shadow-2xl">
            <button
              aria-label="Đóng menu"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {/* Drawer mobile: luôn mở rộng, không cho thu gọn. */}
            <AppSidebar
              accent="red"
              brand={brand}
              sections={sections}
              user={sidebarUser}
              onLogout={logout}
              onNavigate={() => setMobileOpen(false)}
              collapsible={false}
            />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Mở menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">Chỉ dành cho web</p>
              <h1 className="truncate text-base font-extrabold text-slate-950 md:text-lg">Bảng điều khiển Admin</h1>
            </div>
          </div>

          <div className="mx-6 hidden max-w-xl flex-1 md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                placeholder="Tìm người dùng, Host, nhà thuê, hóa đơn, hợp đồng..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Trước 13/08/2026 chuông này chỉ là icon trỏ sang trang nhật ký bảo mật,
                không đọc dữ liệu gì (chấm đỏ cũ bật theo mock AUDIT_LOGS nên luôn sáng).
                Giờ nó là khay thông báo thật, số tự cập nhật — xem NotificationBell.

                "Xem tất cả" trỏ /admin/notifications chứ không phải /admin/security:
                khay này chỉ liệt kê bảng `notifications`, còn trang kia gộp thêm
                `host_notifications` (nhắc việc: căn chờ duyệt giá, HĐ chờ duyệt…),
                nên nó mới là chỗ xem đủ. Nhật ký bảo mật là việc khác. */}
            <NotificationBell seeAllTo="/admin/notifications" accent="red" />
            <UserMenu
              accent="red"
              name={sidebarUser.name}
              subtitle={sidebarUser.subtitle}
              initials={sidebarUser.initials}
              onLogout={logout}
            />
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </UnreadNotificationsProvider>
  );
};
