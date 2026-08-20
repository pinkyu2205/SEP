import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home, Search } from 'lucide-react';
import { useWebAuth } from '@/auth/WebAuthContext';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from './UserMenu';

const initialsOf = (name?: string) =>
  (name || 'HB').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'HB';

const ROUTE_LABELS: Record<string, string> = {
  '/host': 'Bảng điều hành',
  '/host/properties': 'Bất động sản',
  '/host/zones': 'Khu vực & Quản lý',
  '/host/operations-managers': 'Quản lý vận hành',
  '/host/managers': 'Quản lý vận hành',
  '/host/tenants': 'Khách thuê',
  '/host/contracts': 'Quản lý hợp đồng',
  '/host/maintenance': 'Giám sát bảo trì',
  '/host/financial': 'Quản lý tài chính',
  '/host/billing': 'Hoá đơn & Thanh toán',
  '/host/receivables': 'Công nợ phải thu',
  '/host/deposits': 'Sổ cọc',
  '/host/reports': 'Báo cáo & Phân tích',
  '/host/notifications': 'Thông báo',
  '/host/settings': 'Cài đặt',
};

const formatVNDate = (date: Date) => {
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const Header = () => {
  const location = useLocation();
  const { user, logout } = useWebAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isPropertyDetail = location.pathname.startsWith('/host/properties/') && location.pathname !== '/host/properties';
  const pathLabel = isPropertyDetail
    ? 'Chi tiết bất động sản'
    : (ROUTE_LABELS[location.pathname] ?? 'Trang tổng quan');

  const isRoot = location.pathname === '/host';

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 flex-shrink-0">
      <div className="flex items-center gap-2 text-sm min-w-0">
        {!isRoot ? (
          <>
            <Link to="/host" className="flex items-center gap-1 text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0">
              <Home className="w-3.5 h-3.5" />
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
            {isPropertyDetail && (
              <>
                <Link to="/host/properties" className="text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0 text-xs">
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

      <div className="flex-1 max-w-md mx-6 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm bất động sản, quản lý, khách thuê..."
            className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          />
        </div>
      </div>

      <div className="ml-2 flex flex-shrink-0 items-center gap-2.5">
        {/*
          Đồng hồ + chuông gộp thành MỘT cụm trong khung bo.
          Trước đây giờ để 11px / ngày 10px — nhỏ hơn cả chữ phụ trên trang, mà lại bị
          một vạch ngăn tách khỏi chuông nên đọc ra ba mảnh rời rạc.

          `tabular-nums` bắt buộc: đồng hồ chạy từng giây, chữ số không cùng bề rộng thì
          cả khối co giãn liên tục, kéo theo chuông nhích qua nhích lại.
        */}
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 py-1 pl-3 pr-1.5">
          <div className="hidden flex-col items-end leading-none lg:flex">
            <span className="text-lg font-black tabular-nums tracking-tight text-slate-800">
              {currentTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="mt-1 text-[10px] font-medium capitalize leading-none text-slate-400">
              {formatVNDate(currentTime)}
            </span>
          </div>

          <div className="hidden h-8 w-px bg-slate-200 lg:block" />

          {/* Chuông cũ chỉ là link kèm badge đếm MỘT LẦN lúc mở trang — mở app cả buổi
              số vẫn đứng yên. Giờ dùng chung khay realtime với cổng Admin. */}
          <NotificationBell seeAllTo="/host/notifications" accent="green" />
        </div>

        {/* Nút đăng xuất trần trước đây nằm ở đây đã gộp vào menu tài khoản —
            AppSidebar cũng có sẵn một nút đăng xuất, để hai nút trần cạnh nhau
            vừa thừa vừa dễ bấm nhầm. */}
        <UserMenu
          name={user?.fullName ?? 'Hoàng Bình Land'}
          subtitle={user?.username ? `@${user.username}` : 'Cổng quản lý Host'}
          initials={initialsOf(user?.fullName)}
          settingsTo="/host/settings"
          onLogout={logout}
        />
      </div>
    </header>
  );
};
