import {
  LayoutDashboard, Building2, UserCog, Users, FileText,
  DollarSign, BarChart3, Bell, Settings,
  Coins, PiggyBank, CreditCard, MapPin, SlidersHorizontal, Banknote,
} from 'lucide-react';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';
import { useWebAuth } from '@/auth/WebAuthContext';
import { AppSidebar, type SidebarSection } from './AppSidebar';

/**
 * Sidebar Cổng Host — chỉ khai báo menu, phần hiển thị dùng chung AppSidebar
 * (xem layouts/AppSidebar.tsx) để đồng bộ với Admin Portal.
 */

/** Mục chỉ dành cho ROLE_OWNER; admin xem cổng host thì ẩn đi. */
const HOST_ONLY = new Set(['/host/billing', '/host/receivables', '/host/deposits']);

const SECTIONS: SidebarSection[] = [
  {
    label: 'Tổng quan',
    items: [{ label: 'Bảng điều hành', path: '/host', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Vận hành',
    items: [
      { label: 'Bất động sản', path: '/host/properties', icon: Building2 },
      { label: 'Cấu hình duyệt giá', path: '/host/pricing-config', icon: SlidersHorizontal },
      { label: 'Khu vực & Quản lý', path: '/host/zones', icon: MapPin },
      { label: 'Quản lý vận hành', path: '/host/operations-managers', icon: UserCog },
      { label: 'Lương quản lý', path: '/host/manager-salaries', icon: Banknote },
      { label: 'Khách thuê', path: '/host/tenants', icon: Users },
    ],
  },
  {
    label: 'Hợp đồng',
    items: [{ label: 'Quản lý hợp đồng', path: '/host/contracts', icon: FileText }],
  },
  // ẨN NHÓM "GIÁM SÁT" (18/08/2026) — nhóm này chỉ còn mỗi "Giám sát bảo trì", mà
  // trang đó gọi API bảo trì thì BE trả "Access Denied — kiểm tra lại Role hoặc Vùng
  // quản lý địa lý": endpoint chưa mở cho ROLE_OWNER. Kết quả là host bấm vào chỉ thấy
  // 4 toast lỗi đỏ và bảng rỗng. Giữ một mục luôn hỏng trong menu còn tệ hơn là không
  // có nó. Route `/host/maintenance` vẫn còn — mở lại menu là dùng được ngay khi BE
  // cho host vào (cùng nhóm với vụ host-403 ở BE-NEED-endpoint-hoa-don-...).
  // (Trước đó nhóm này còn "Thiết bị & Mã QR", đã xoá cùng module pages/host/equipments.)
  {
    label: 'Tài chính & Báo cáo',
    items: [
      { label: 'Quản lý tài chính', path: '/host/financial', icon: DollarSign },
      { label: 'Hoá đơn & Thanh toán', path: '/host/billing', icon: CreditCard },
      { label: 'Công nợ phải thu', path: '/host/receivables', icon: Coins },
      { label: 'Sổ cọc', path: '/host/deposits', icon: PiggyBank },
      { label: 'Báo cáo & Phân tích', path: '/host/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Thông báo', path: '/host/notifications', icon: Bell },
      { label: 'Cài đặt', path: '/host/settings', icon: Settings },
    ],
  },
];

const initialsOf = (name?: string) =>
  (name || 'HB').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'HB';

export const Sidebar = () => {
  const { count: unread } = useUnreadNotifications();
  const { user, logout } = useWebAuth();
  const isHost = user?.role === 'host';

  const sections: SidebarSection[] = SECTIONS.map(s => ({
    ...s,
    items: s.items
      .filter(item => isHost || !HOST_ONLY.has(item.path))
      // Badge thông báo lấy từ số chưa đọc THẬT của tài khoản đang đăng nhập.
      .map(item => (item.path === '/host/notifications'
        ? { ...item, badge: unread || undefined, badgeAlert: true }
        : item)),
  })).filter(s => s.items.length > 0);

  return (
    <aside className="sticky top-0 h-screen flex-shrink-0 select-none">
      <AppSidebar
        accent="green"
        storageKey="hbl_sidebar_host"
        brand={{ title: 'Hoàng Bình Land', subtitle: 'Cổng Quản lý Host' }}
        sections={sections}
        user={{
          name: user?.fullName || 'Host',
          subtitle: user?.username ? `@${user.username}` : undefined,
          initials: initialsOf(user?.fullName),
        }}
        onLogout={logout}
      />
    </aside>
  );
};
