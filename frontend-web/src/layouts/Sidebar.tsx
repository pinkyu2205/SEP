import {
  LayoutDashboard, Building2, UserCog, Users, FileText, CalendarPlus,
  DollarSign, BarChart3, Bell, Settings,
  Coins, PiggyBank, CreditCard, MapPin, SlidersHorizontal, Banknote,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';
import { useWebAuth } from '@/auth/WebAuthContext';
import { extensionRequestService } from '@/services/extensionRequest.service';
import { hostService } from '@/services/host.service';
import { currentMonth } from '@/utils/period';
import { AppSidebar, type SidebarNavItem, type SidebarSection } from './AppSidebar';

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

/**
 * Số việc cần host để mắt tới, đếm từ đúng API của trang tương ứng — số trên menu phải
 * bằng số dòng host thấy khi bấm vào.
 */
interface HostBadgeCounts {
  /** Đơn gia hạn PENDING (host chỉ xem, nhưng cần biết để gia hạn HĐ gốc kịp). */
  extensionPending: number;
  /** Hoá đơn kỳ này CHƯA THU (UNPAID + OVERDUE) — cùng nguồn trang Công nợ. */
  debtOpen: number;
  /** Trong số đó, bao nhiêu đã QUÁ HẠN → badge đỏ nhấp nháy. */
  debtOverdue: number;
}

/** Hỏi lại mỗi phút — khách trả tiền / quá hạn / gửi đơn lúc nào cũng được. */
const BADGE_POLL_MS = 60_000;

const initialsOf = (name?: string) =>
  (name || 'HB').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'HB';

export const Sidebar = () => {
  const { count: unread } = useUnreadNotifications();
  const { user, logout } = useWebAuth();
  const isHost = user?.role === 'host';
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<HostBadgeCounts>({ extensionPending: 0, debtOpen: 0, debtOverdue: 0 });

  /**
   * Mỗi nguồn độc lập (`allSettled`): một API lỗi thì giữ số cũ của mục đó, không gắn
   * số sai. Công nợ chỉ đếm khi là host thật — admin xem cổng host không thấy mục này.
   */
  const refreshCounts = useCallback(async () => {
    // TUẦN TỰ, không song song: `currentMonth()` đọc giờ SERVER, mà giờ đó chỉ đồng bộ
    // sau response đầu tiên. Gọi song song lúc vừa mở trang thì kỳ tính theo giờ máy
    // (VD 2026-09 trong khi server đã sang 2026-10) → đếm nhầm kỳ, badge lệch trang.
    const [ext] = await Promise.allSettled([extensionRequestService.list('PENDING')]);
    const [inv] = await Promise.allSettled([
      isHost ? hostService.getInvoices({ month: currentMonth(), size: 500 }) : Promise.reject(new Error('skip')),
    ]);
    setCounts(prev => {
      const next = { ...prev };
      if (ext.status === 'fulfilled') {
        next.extensionPending = ext.value.filter(r => r.status === 'PENDING').length;
      }
      if (inv.status === 'fulfilled') {
        const open = (inv.value?.content ?? []).filter(i => i.status !== 'PAID');
        next.debtOpen = open.length;
        next.debtOverdue = open.filter(i => i.status === 'OVERDUE').length;
      }
      return next;
    });
  }, [isHost]);

  useEffect(() => { void refreshCounts(); }, [pathname, refreshCounts]);
  useEffect(() => {
    const t = setInterval(() => { void refreshCounts(); }, BADGE_POLL_MS);
    return () => clearInterval(t);
  }, [refreshCounts]);

  const withBadge = (item: SidebarNavItem): SidebarNavItem => {
    switch (item.path) {
      // Badge thông báo lấy từ số chưa đọc THẬT của tài khoản đang đăng nhập.
      case '/host/notifications':
        return { ...item, badge: unread || undefined, badgeAlert: true };
      case '/host/extension-requests':
        return {
          ...item,
          badge: counts.extensionPending || undefined,
          badgeAlert: true,
          badgeTitle: `${counts.extensionPending} đơn gia hạn đang chờ duyệt`,
        };
      // Công nợ: có quá hạn → ĐỎ nhấp nháy, đếm số quá hạn (việc phải xử ngay);
      // chỉ còn nợ chưa tới hạn → vàng, đếm số hoá đơn chưa thu.
      case '/host/receivables':
        return counts.debtOverdue > 0
          ? {
              ...item,
              badge: counts.debtOverdue,
              badgeDanger: true,
              badgeTitle: `${counts.debtOverdue} hoá đơn quá hạn · ${counts.debtOpen} hoá đơn chưa thu`,
            }
          : {
              ...item,
              badge: counts.debtOpen || undefined,
              badgeAlert: true,
              badgeTitle: `${counts.debtOpen} hoá đơn chưa thu`,
            };
      default:
        return item;
    }
  };

  const sections: SidebarSection[] = SECTIONS.map(s => ({
    ...s,
    items: s.items
      .filter(item => isHost || !HOST_ONLY.has(item.path))
      .map(withBadge),
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
