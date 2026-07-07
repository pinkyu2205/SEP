import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, UserCog, Users, FileText,
  Wrench, DollarSign, BarChart3, Bell, Settings,
  ChevronRight, QrCode, Receipt, Coins, PiggyBank,
} from 'lucide-react';
import clsx from 'clsx';
import { useUnreadNotifications } from '../contexts/UnreadNotificationsContext';
import { useWebAuth } from '../auth/WebAuthContext';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: number;
  badgeColor?: string;
  /** Chỉ hiện cho role host (ROLE_OWNER). */
  hostOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Tổng quan',
    items: [
      { name: 'Bảng điều hành', path: '/host', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { name: 'Bất động sản',       path: '/host/properties',          icon: Building2 },
      { name: 'Quản lý vận hành',   path: '/host/operations-managers', icon: UserCog },
      { name: 'Khách thuê',         path: '/host/tenants',             icon: Users },
    ],
  },
  {
    label: 'Hợp đồng',
    items: [
      {
        name: 'Quản lý hợp đồng',
        path: '/host/contracts',
        icon: FileText,
      },
    ],
  },
  {
    label: 'Giám sát & Tài sản',
    items: [
      { name: 'Giám sát bảo trì', path: '/host/maintenance', icon: Wrench },
      { name: 'Thiết bị & Mã QR', path: '/host/equipments', icon: QrCode },
    ],
  },
  {
    label: 'Tài chính & Báo cáo',
    items: [
      { name: 'Quản lý tài chính',  path: '/host/financial', icon: DollarSign },
      { name: 'Ghi nhận chi phí',   path: '/host/expenses',  icon: Receipt },
      { name: 'Công nợ phải thu',   path: '/host/receivables', icon: Coins,     hostOnly: true },
      { name: 'Sổ cọc',             path: '/host/deposits',    icon: PiggyBank, hostOnly: true },
      { name: 'Báo cáo & Phân tích', path: '/host/reports',  icon: BarChart3 },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        name: 'Thông báo',
        path: '/host/notifications',
        icon: Bell,
        // badge gán động từ context unread thật (xem render bên dưới).
        badgeColor: 'bg-rose-500',
      },
      { name: 'Cài đặt', path: '/host/settings', icon: Settings },
    ],
  },
];

export const Sidebar = () => {
  const { count: unread } = useUnreadNotifications();
  const { user } = useWebAuth();
  const isHost = user?.role === 'host';
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 select-none">
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/80 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-900/30">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white leading-tight tracking-tight">Hoàng Bình Land</p>
            <p className="text-[10px] text-slate-400 leading-tight font-medium">Cổng Quản lý Host</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? 'mt-1' : ''}>
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{section.label}</p>
            </div>
            <div className="px-2 space-y-0.5">
              {section.items.filter(item => !item.hostOnly || isHost).map(item => {
                // Badge thông báo lấy từ unread thật; các mục khác giữ badge tĩnh.
                const badge = item.path === '/host/notifications'
                  ? (unread > 0 ? unread : undefined)
                  : item.badge;
                return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => clsx(
                    'group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-sm relative',
                    isActive
                      ? 'bg-primary-600 text-white font-semibold shadow-lg shadow-primary-900/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={clsx('w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} />
                      <span className="flex-1 truncate">{item.name}</span>
                      {badge !== undefined && (
                        <span className={`${item.badgeColor || 'bg-slate-600'} text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0`}>
                          {badge}
                        </span>
                      )}
                      {!badge && !isActive && (
                        <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-4 border-t border-slate-800" />

      {/* User Card */}
      <div className="p-4 flex-shrink-0">
        <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-700/50">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md">
            HB
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate leading-tight">Hoàng Bình Land</p>
            <p className="text-[10px] text-slate-400 truncate leading-tight">host@hoangbinhland.vn</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 shadow-lg shadow-emerald-900/50" title="Đang hoạt động" />
        </div>
      </div>
    </aside>
  );
};
