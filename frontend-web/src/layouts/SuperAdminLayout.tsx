import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  FilePlus,
  LogOut,
  MapPin,
  Menu,
  Package,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useWebAuth } from '../auth/WebAuthContext';
import { AUDIT_LOGS, PLATFORM_HOSTS, PLATFORM_MAINTENANCE_REQUESTS } from '../utils/superAdminMockData';

type SidebarSection = { type: 'section'; label: string };
type SidebarLink = { type?: 'link'; path: string; label: string; icon: React.ElementType; end?: boolean; badge?: number };
type SidebarItem = SidebarSection | SidebarLink;

const navItems: SidebarItem[] = [
  // ── TỔNG QUAN ────────────────────────────────────────────────────
  { type: 'section', label: 'Tổng quan' },
  { path: '/admin', label: 'Bảng điều hành', icon: BarChart3, end: true },

  // ── QUẢN TRỊ ─────────────────────────────────────────────────────
  { type: 'section', label: 'Quản trị' },
  { path: '/admin/users', label: 'Người dùng & RBAC', icon: Users },
  { path: '/admin/hosts', label: 'Host/Admin System', icon: ShieldCheck, badge: PLATFORM_HOSTS.filter(h => h.status === 'pending_approval').length },

  // ── QUY TRÌNH TIẾP NHẬN NHÀ ──────────────────────────────────────
  { type: 'section', label: 'Quy trình tiếp nhận nhà' },
  { path: '/admin/buildings/draft', label: 'Khởi tạo nhà', icon: FilePlus },
  { path: '/admin/buildings/configuration', label: 'Cấu hình khai thác', icon: Settings2 },

  // ── TÀI CHÍNH & HỢP ĐỒNG ─────────────────────────────────────────
  { type: 'section', label: 'Tài chính & Hợp đồng' },
  { path: '/admin/billing', label: 'Thanh toán', icon: CreditCard },
  { path: '/admin/contracts', label: 'Hợp đồng', icon: FileText },

  // ── VẬN HÀNH ─────────────────────────────────────────────────────
  { type: 'section', label: 'Vận hành' },
  { path: '/admin/zones', label: 'Quản lý khu vực', icon: MapPin },
  { path: '/admin/maintenance', label: 'Bảo trì & thiết bị', icon: Wrench, badge: PLATFORM_MAINTENANCE_REQUESTS.filter(i => i.status !== 'resolved').length },
  { path: '/admin/equipments', label: 'Danh mục thiết bị', icon: Package },

  // ── HỆ THỐNG ─────────────────────────────────────────────────────
  { type: 'section', label: 'Hệ thống' },
  { path: '/admin/settings', label: 'Cấu hình hệ thống', icon: Settings },
  { path: '/admin/security', label: 'Nhật ký & bảo mật', icon: Activity, badge: AUDIT_LOGS.filter(l => l.severity === 'critical').length },
];

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
  <>
    <div className="flex h-16 items-center border-b border-slate-800/80 px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 shadow-lg shadow-cyan-950/30">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold leading-tight text-white">Hoàng Bình Land</p>
          <p className="text-[10px] font-semibold leading-tight text-cyan-200/80">Admin Portal</p>
        </div>
      </div>
    </div>

    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {navItems.map((item, idx) => {
        if (item.type === 'section') {
          return (
            <p key={idx} className="mt-5 mb-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 first:mt-0">
              {item.label}
            </p>
          );
        }
        const link = item as SidebarLink;
        return (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.end}
            onClick={onNavigate}
            className={({ isActive }) => clsx(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-950/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            {({ isActive }) => (
              <>
                <link.icon className={clsx(
                  'h-4 w-4',
                  isActive ? 'text-white' : 'text-slate-500 group-hover:text-cyan-300'
                )} />
                <span className="flex-1 truncate">{link.label}</span>
                {!!link.badge && (
                  <span className={clsx(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                    isActive ? 'bg-white text-cyan-700' : 'bg-cyan-500 text-white'
                  )}>
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  </>
);

export const AdminLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useWebAuth();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-72 flex-col bg-slate-950 text-slate-300 lg:flex">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-80 max-w-[86vw] flex-col bg-slate-950 text-slate-300 shadow-2xl">
            <div className="absolute right-3 top-3">
              <button
                aria-label="Đóng menu"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
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

          <div className="flex items-center gap-3">
            <button
              className={clsx(
                'relative rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                AUDIT_LOGS.some(log => log.severity === 'critical') && 'text-rose-600'
              )}
              title="Cảnh báo bảo mật"
            >
              <Bell className="h-4 w-4" />
              {AUDIT_LOGS.some(log => log.severity === 'critical') && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">
                SA
              </div>
              <div>
                <p className="text-xs font-bold leading-tight text-slate-900">{user?.fullName ?? 'Admin'}</p>
                <p className="text-[10px] leading-tight text-slate-500">Toàn quyền hệ thống</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
