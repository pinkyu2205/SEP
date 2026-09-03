import {
  LayoutDashboard, Building2, UserCog, Users, FileText, CalendarPlus,
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

/**
 * ─── Vì sao gom lại như dưới đây (30/08/2026) ────────────────────────────────
 * Bản cũ: 15 mục / 5 nhóm, dài quá màn 1080p nên phải cuộn mới thấy hết — nav mà
 * không nhìn trọn một lúc thì luôn có cảm giác rối. Ba nguồn nhiễu đã sửa:
 *
 *  1. HAI NHÓM CHỈ CÓ MỘT MỤC — "Tổng quan" (Bảng điều hành) và "Hợp đồng" (Quản lý
 *     hợp đồng). Tiêu đề nhóm tồn tại để PHÂN LOẠI; đặt trên đúng một dòng thì nó chỉ
 *     tốn chỗ. Nay Bảng điều hành đứng riêng KHÔNG tiêu đề, hợp đồng nhập vào Vận hành.
 *
 *  2. CHỮ "QUẢN LÝ" LẶP 4 LẦN trong một cổng đã tên là "Cổng Quản lý Host" — không
 *     phân biệt được gì. Nặng nhất là "Khu vực & Quản lý" nằm ngay trên "Quản lý vận
 *     hành": hai NGHĨA khác nhau của cùng một từ, đọc liền nhau. Nay khu vực đổi thành
 *     "Phân công khu vực" (nói đúng việc trang đó làm: gán quản lý cho quận/huyện).
 *
 *  3. XẾP SAI NHÓM — "Lương quản lý" là tiền nhưng nằm ở Vận hành; "Cấu hình duyệt
 *     giá" là một dạng cài đặt nhưng cũng ở Vận hành trong khi "Cài đặt" ở Hệ thống.
 *     Nay tách nhóm NHÂN SỰ (con người + lương + phân công) khỏi VẬN HÀNH (tài sản +
 *     khách + hợp đồng), và cấu hình giá về Hệ thống.
 *
 * Nhãn cũng rút gọn: trong nhóm "Tài chính" thì "Quản lý tài chính" chỉ cần là "Tổng
 * quan", "Công nợ phải thu" là "Công nợ". Chữ bị cắt đuôi trong sidebar hẹp còn khó
 * đọc hơn là chữ ngắn.
 */
const SECTIONS: SidebarSection[] = [
  {
    // Không tiêu đề — xem điểm 1 ở trên.
    items: [{ label: 'Bảng điều hành', path: '/host', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Vận hành',
    items: [
      { label: 'Bất động sản', path: '/host/properties', icon: Building2 },
      { label: 'Khách thuê', path: '/host/tenants', icon: Users },
      { label: 'Hợp đồng', path: '/host/contracts', icon: FileText },
      // Đơn gia hạn: host CHỈ XEM — quản trị viên duyệt. Đặt cạnh "Hợp đồng" vì cùng một
      // hồ sơ, và host cần thấy để còn chủ động gia hạn hợp đồng với chủ nhà.
      { label: 'Đơn gia hạn', path: '/host/extension-requests', icon: CalendarPlus },
    ],
  },
  {
    label: 'Nhân sự',
    items: [
      { label: 'Quản lý vận hành', path: '/host/operations-managers', icon: UserCog },
      { label: 'Phân công khu vực', path: '/host/zones', icon: MapPin },
      { label: 'Lương quản lý', path: '/host/manager-salaries', icon: Banknote },
    ],
  },
  // ẨN NHÓM "GIÁM SÁT" (18/08/2026) — nhóm này chỉ còn mỗi "Giám sát bảo trì", mà
  // trang đó gọi API bảo trì thì BE trả "Access Denied — kiểm tra lại Role hoặc Vùng
  // quản lý địa lý": endpoint chưa mở cho ROLE_OWNER. Kết quả là host bấm vào chỉ thấy
  // 4 toast lỗi đỏ và bảng rỗng. Giữ một mục luôn hỏng trong menu còn tệ hơn là không
  // có nó. Route `/host/maintenance` vẫn còn — mở lại menu là dùng được ngay khi BE
  // cho host vào. (Trước đó nhóm này còn "Thiết bị & Mã QR", đã xoá cùng module
  // pages/host/equipments.)
  {
    label: 'Tài chính',
    items: [
      { label: 'Tổng quan', path: '/host/financial', icon: DollarSign },
      { label: 'Hoá đơn', path: '/host/billing', icon: CreditCard },
      { label: 'Công nợ', path: '/host/receivables', icon: Coins },
      { label: 'Sổ cọc', path: '/host/deposits', icon: PiggyBank },
      { label: 'Báo cáo', path: '/host/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Cấu hình giá', path: '/host/pricing-config', icon: SlidersHorizontal },
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
