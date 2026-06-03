import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CreditCard,
  FileText,
  LogOut,
  MapPin,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useWebAuth } from '../auth/WebAuthContext';
import { AUDIT_LOGS, PLATFORM_HOSTS, PLATFORM_MAINTENANCE_REQUESTS } from '../utils/superAdminMockData';

const navItems = [
  { path: '/super-admin', label: 'Tổng quan', icon: BarChart3, end: true },
  { path: '/super-admin/users', label: 'Người dùng & RBAC', icon: Users },
  { path: '/super-admin/hosts', label: 'Host/Admin System', icon: ShieldCheck, badge: PLATFORM_HOSTS.filter(h => h.status === 'pending_approval').length },
  { path: '/super-admin/buildings', label: 'Buildings & Rooms', icon: Building2 },
  { path: '/super-admin/billing', label: 'Billing & Payments', icon: CreditCard },
  { path: '/super-admin/zones', label: 'Quản lý Khu vực', icon: MapPin },
  { path: '/super-admin/contracts', label: 'Contracts', icon: FileText },
  { path: '/super-admin/maintenance', label: 'Maintenance & Equipment', icon: Wrench, badge: PLATFORM_MAINTENANCE_REQUESTS.filter(m => m.status !== 'resolved').length },
  { path: '/super-admin/settings', label: 'System Configuration', icon: Settings },
  { path: '/super-admin/security', label: 'Audit & Security', icon: Activity, badge: AUDIT_LOGS.filter(log => log.severity === 'critical').length },
];

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
  <>
    <div className="h-16 flex items-center px-5 border-b border-slate-800/80">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-950/30">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-white leading-tight">UrbanNest</p>
          <p className="text-[10px] text-cyan-200/80 leading-tight font-semibold">Super Admin Web Console</p>
        </div>
      </div>
    </div>

    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
      {navItems.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => clsx(
            'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors',
            isActive
              ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-950/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          {({ isActive }) => (
            <>
              <item.icon className={clsx('w-4 h-4', isActive ? 'text-white' : 'text-slate-500 group-hover:text-cyan-300')} />
              <span className="flex-1 truncate">{item.label}</span>
              {!!item.badge && (
                <span className={clsx(
                  'min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
                  isActive ? 'bg-white text-cyan-700' : 'bg-cyan-500 text-white'
                )}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  </>
);

export const SuperAdminLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useWebAuth();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 lg:flex">
      <aside className="hidden lg:flex w-72 h-screen sticky top-0 bg-slate-950 text-slate-300 flex-col">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-80 max-w-[86vw] h-full bg-slate-950 text-slate-300 flex flex-col shadow-2xl">
            <div className="absolute right-3 top-3">
              <button
                aria-label="Đóng menu"
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              aria-label="Mở menu"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-600">Web platform only</p>
              <h1 className="text-base md:text-lg font-extrabold text-slate-950 truncate">Super Admin Dashboard</h1>
            </div>
          </div>

          <div className="hidden md:block flex-1 max-w-xl mx-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100"
                placeholder="Tìm user, Host, building, invoice, contract..."
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className={clsx(
                'relative p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                AUDIT_LOGS.some(log => log.severity === 'critical') && 'text-rose-600'
              )}
              title="Cảnh báo bảo mật"
            >
              <Bell className="w-4 h-4" />
              {AUDIT_LOGS.some(log => log.severity === 'critical') && (
                <span className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
              <div className="w-9 h-9 rounded-xl bg-slate-950 text-white flex items-center justify-center text-xs font-black">
                SA
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 leading-tight">{user?.fullName ?? 'Super Admin'}</p>
                <p className="text-[10px] text-slate-500 leading-tight">Toàn quyền hệ thống</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
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
