import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  FilePlus,
  MapPin,
  Menu,
  KeyRound,
  Package,
  PackageCheck,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useWebAuth } from '@/auth/WebAuthContext';
import { maintenanceService } from '@/services/maintenance.service';
import { AppSidebar, type SidebarSection } from './AppSidebar';
import { UserMenu } from './UserMenu';

/**
 * Menu Admin Portal. Badge phải là số THẬT — trước đây đếm từ mock
 * (`PLATFORM_MAINTENANCE_REQUESTS`, `AUDIT_LOGS`) nên hiện "9" trong khi hệ thống
 * thật không có yêu cầu bảo trì nào, đá nhau với Bảng điều hành. Giờ nhận từ API;
 * chưa có API nhật ký bảo mật thì không gắn badge còn hơn gắn số bịa.
 */
const buildSections = (openMaintenance: number): SidebarSection[] => [
  {
    label: 'Tổng quan',
    items: [{ label: 'Bảng điều hành', path: '/admin', icon: BarChart3, end: true }],
  },
  {
    label: 'Quản trị',
    items: [{ label: 'Người dùng & RBAC', path: '/admin/users', icon: Users }],
  },
  {
    label: 'Quy trình tiếp nhận nhà',
    items: [
      { label: 'Khởi tạo nhà', path: '/admin/buildings/draft', icon: FilePlus },
      { label: 'Cấu hình khai thác', path: '/admin/buildings/configuration', icon: Settings2 },
    ],
  },
  {
    label: 'Đón khách',
    items: [{ label: 'Hợp đồng nháp', path: '/admin/onboarding', icon: UserPlus }],
  },
  {
    label: 'Tài chính & Hợp đồng',
    items: [
      { label: 'Thanh toán', path: '/admin/billing', icon: CreditCard },
      { label: 'Hợp đồng', path: '/admin/contracts', icon: FileText },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      // Mục mới từ nhánh dev (trang HandoverMonitoring + route /admin/handover).
      { label: 'Tiến độ bàn giao', path: '/admin/handover', icon: PackageCheck },
      // Admin cấp mã 6 số cho quản lý khi họ không chụp được ảnh đồng hồ (mentor ý 5).
      { label: 'Cấp mã đồng hồ', path: '/admin/meter-override', icon: KeyRound },
      { label: 'Quản lý khu vực', path: '/admin/zones', icon: MapPin },
      { label: 'Khu vực Manager', path: '/admin/zones/managers', icon: UserRound },
      { label: 'Bảo trì & thiết bị', path: '/admin/maintenance', icon: Wrench, badge: openMaintenance || undefined },
      { label: 'Danh mục thiết bị', path: '/admin/equipments', icon: Package },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Cấu hình hệ thống', path: '/admin/settings', icon: Settings },
      { label: 'Nhật ký & bảo mật', path: '/admin/security', icon: Activity },
    ],
  },
];

const initialsOf = (name?: string) =>
  (name || 'Admin').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'SA';

export const AdminLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMaintenance, setOpenMaintenance] = useState(0);
  const { user, logout } = useWebAuth();

  // Badge bảo trì = yêu cầu chờ + đang xử lý (số thật, cùng nguồn với Bảng điều hành).
  useEffect(() => {
    let active = true;
    maintenanceService.getDashboard()
      .then(d => { if (active && d) setOpenMaintenance((d.pending ?? 0) + (d.inProgress ?? 0)); })
      .catch(() => { /* lỗi mạng: không gắn badge còn hơn gắn số sai */ });
    return () => { active = false; };
  }, []);

  const sections = buildSections(openMaintenance);
  const sidebarUser = {
    name: user?.fullName ?? 'Admin',
    subtitle: user?.username ? `@${user.username}` : 'Toàn quyền hệ thống',
    initials: initialsOf(user?.fullName),
  };
  const brand = { title: 'Hoàng Bình Land', subtitle: 'Admin Portal', icon: ShieldCheck };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:flex">
      <aside className="sticky top-0 hidden h-screen flex-shrink-0 select-none lg:block">
        <AppSidebar
          accent="cyan"
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
              accent="cyan"
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
            {/* Chấm đỏ trước đây bật theo AUDIT_LOGS mock nên luôn sáng dù hệ thống
                không có cảnh báo nào. Chưa có API nhật ký bảo mật → để chuông trung tính. */}
            <Link
              to="/admin/security"
              className="relative rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              title="Nhật ký & bảo mật"
            >
              <Bell className="h-4 w-4" />
            </Link>
            <UserMenu
              accent="cyan"
              name={sidebarUser.name}
              subtitle={sidebarUser.subtitle}
              initials={sidebarUser.initials}
              settingsTo="/admin/settings"
              onLogout={logout}
            />
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
