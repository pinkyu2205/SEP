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
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Về trang chủ
      </Link>
      <Outlet />
    </div>
  );
};
