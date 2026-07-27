import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ROUTES } from '@/utils/routes';

/**
 * Khung cho các trang xác thực (đăng nhập).
 * Trang con (WebLogin) tự render full-screen; layout chỉ thêm liên kết quay về trang chủ.
 */
export const AuthLayout = () => {
  return (
    <div className="relative">
      <Link
        to={ROUTES.HOME}
        className="group absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 lg:left-10 lg:top-10 rounded-lg bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 backdrop-blur transition-colors hover:bg-white hover:text-slate-900 lg:bg-white/10 lg:text-white lg:ring-white/25 lg:hover:bg-white/20 lg:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Về trang chủ
      </Link>
      <Outlet />
    </div>
  );
};
