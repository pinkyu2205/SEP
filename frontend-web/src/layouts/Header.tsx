import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, Search, ChevronRight, Home } from 'lucide-react';
import { MOCK_NOTIFICATIONS } from '../utils/mockData';

const ROUTE_LABELS: Record<string, string> = {
  '/':                    'Bảng điều hành',
  '/properties':          'Bất động sản',
  '/operations-managers': 'Quản lý vận hành',
  '/managers':            'Quản lý vận hành',
  '/tenants':             'Khách thuê',
  '/contracts':           'Phê duyệt hợp đồng',
  '/maintenance':         'Giám sát bảo trì',
  '/financial':           'Quản lý tài chính',
  '/equipments':          'Danh mục tài sản',
  '/reports':             'Báo cáo & Phân tích',
  '/notifications':       'Thông báo',
  '/settings':            'Cài đặt',
};

const formatVNDate = (date: Date) => {
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

export const Header = () => {
  const location = useLocation();
  const unreadCount = MOCK_NOTIFICATIONS.filter(n => !n.isRead).length;
  const [currentTime, setCurrentTime] = useState(new Date('2026-05-15T08:00:00'));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(prev => new Date(prev.getTime() + 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const isPropertyDetail = location.pathname.startsWith('/properties/') && location.pathname !== '/properties';
  const pathLabel = isPropertyDetail
    ? 'Chi tiết bất động sản'
    : (ROUTE_LABELS[location.pathname] ?? 'Trang tổng quan');

  const isRoot = location.pathname === '/';

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 flex-shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        {!isRoot ? (
          <>
            <Link to="/" className="flex items-center gap-1 text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0">
              <Home className="w-3.5 h-3.5" />
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            {isPropertyDetail && (
              <>
                <Link to="/properties" className="text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0 text-xs">
                  Bất động sản
                </Link>
                <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
              </>
            )}
            <span className="font-semibold text-slate-800 text-sm truncate">{pathLabel}</span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800 text-sm">Bảng điều hành</span>
          </div>
        )}
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md mx-6 hidden md:block">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm kiếm bất động sản, quản lý, khách thuê..."
            className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 ml-2 flex-shrink-0">
        {/* Date/time */}
        <div className="hidden lg:flex flex-col items-end">
          <span className="text-[11px] font-semibold text-slate-700 leading-tight">
            {currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-[10px] text-slate-400 leading-tight capitalize">
            {formatVNDate(currentTime)}
          </span>
        </div>

        <div className="h-5 w-px bg-slate-200 hidden lg:block" />

        {/* Notification bell */}
        <Link
          to="/notifications"
          className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
          title="Thông báo"
        >
          <Bell className="h-4.5 w-4.5" style={{ width: '1.1rem', height: '1.1rem' }} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-rose-500 text-white ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="h-5 w-px bg-slate-200" />

        {/* User profile */}
        <div className="flex items-center gap-2.5 cursor-pointer group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            UN
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-bold text-slate-800 leading-tight group-hover:text-primary-600 transition-colors">UrbanNest Host</p>
            <p className="text-[10px] text-slate-400 leading-tight">Cổng quản lý Host</p>
          </div>
        </div>
      </div>
    </header>
  );
};
