import React, { useState, useMemo, useCallback } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants';
import { realNotificationService, ApiNotification } from '@/services/shared/notificationService';
import { navigateFromNotification } from '@/navigation/navigationRef';
import type { IconName } from '@/components/common/Icon';
import {
  NotificationFeed, applyFeedFilter, buildFeedFilters, type FeedItem,
} from '@/components/common/NotificationFeed';

// ===================== TYPES =====================
type NotifType =
  | 'new_bill' | 'bill_overdue' | 'payment_success' | 'payment_pending_verify'
  | 'contract_expiring' | 'contract_expired'
  | 'extension_requested' | 'extension_approved' | 'extension_closed'
  | 'maintenance_new' | 'maintenance_resolved' | 'maintenance_accepted'
  | 'maintenance_confirm' | 'maintenance_cost' | 'maintenance_cancelled' | 'maintenance_rejected'
  | 'maintenance_overdue'
  | 'contract_assigned' | 'checkout_request'
  | 'equipment_damaged' | 'tenant_onboarded' | 'meter_reading_due' | 'system';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotifType;
  isRead: boolean;
  createdAt: string;
  actionRoute?: string;
  /** Tham số route BE gửi kèm (vd { checkoutId: 12 }). */
  actionParams?: Record<string, any>;
}

// ===================== CONFIG =====================
const TYPE_CONFIG: Record<NotifType, { icon: IconName; color: string; bg: string; category: string }> = {
  new_bill: { icon: 'receipt', color: Colors.info, bg: Colors.infoLight, category: 'Hóa đơn' },
  bill_overdue: { icon: 'alert', color: Colors.error, bg: Colors.errorLight, category: 'Hóa đơn' },
  payment_success: { icon: 'success', color: Colors.success, bg: Colors.successLight, category: 'Thanh toán' },
  payment_pending_verify: { icon: 'card', color: Colors.warning, bg: Colors.warningLight, category: 'Thanh toán' },
  contract_expiring: { icon: 'calendar-clock', color: Colors.info, bg: Colors.infoLight, category: 'Hợp đồng' },
  // D-0: hôm nay hết hạn, hệ thống vừa mở phiếu trả phòng — quản lý phải đi nhận phòng.
  // Không dùng chung màu xanh của `contract_expiring` (mốc nhắc trước, chưa phải làm gì).
  contract_expired: { icon: 'calendar-x', color: Colors.error, bg: Colors.errorLight, category: 'Hợp đồng' },
  // Đơn gia hạn (BE 02/09/2026). Cùng mục 'Hợp đồng' để chip lọc gom chung, nhưng tách
  // icon/màu: "đơn mới về" là việc phải xem, "đã duyệt" là tin đã xong.
  extension_requested: { icon: 'contract', color: Colors.warning, bg: Colors.warningLight, category: 'Hợp đồng' },
  extension_approved:  { icon: 'calendar-check', color: Colors.success, bg: Colors.successLight, category: 'Hợp đồng' },
  extension_closed:    { icon: 'document', color: Colors.textMuted, bg: Colors.divider, category: 'Hợp đồng' },
  maintenance_new: { icon: 'wrench', color: Colors.warning, bg: Colors.warningLight, category: 'Bảo trì' },
  maintenance_resolved: { icon: 'success', color: Colors.success, bg: Colors.successLight, category: 'Bảo trì' },
  maintenance_accepted: { icon: 'hard-hat', color: Colors.info, bg: Colors.infoLight, category: 'Bảo trì' },
  // Bốn nhánh bảo trì tách từ BE 13/08/2026 — chung mục 'Bảo trì'.
  maintenance_confirm: { icon: 'clipboard-check', color: Colors.warning, bg: Colors.warningLight, category: 'Bảo trì' },
  maintenance_cost: { icon: 'cash', color: Colors.accentDark, bg: '#CFFAFE', category: 'Bảo trì' },
  maintenance_cancelled: { icon: 'ban', color: Colors.textSecondary, bg: Colors.divider, category: 'Bảo trì' },
  maintenance_rejected: { icon: 'undo', color: Colors.error, bg: Colors.errorLight, category: 'Bảo trì' },
  // Khách quá hạn tự sửa — quản lý phải đi nhắc. Khác biểu tượng với "bị từ chối".
  maintenance_overdue: { icon: 'alarm', color: Colors.error, bg: Colors.errorLight, category: 'Bảo trì' },
  contract_assigned: { icon: 'handshake', color: Colors.primary, bg: Colors.primaryBg, category: 'Đón khách' },
  checkout_request: { icon: 'door', color: Colors.error, bg: Colors.errorLight, category: 'Tiễn khách' },
  equipment_damaged: { icon: 'package', color: Colors.error, bg: Colors.errorLight, category: 'Thiết bị' },
  tenant_onboarded: { icon: 'key', color: Colors.primary, bg: Colors.primaryBg, category: 'Đón khách' },
  // Hoá đơn tổng đã về mà còn phòng chưa chốt số → chụp xong khách mới nhận hoá đơn.
  meter_reading_due: { icon: 'camera', color: Colors.warning, bg: Colors.warningLight, category: 'Ghi điện nước' },
  system: { icon: 'bell', color: Colors.textSecondary, bg: Colors.divider, category: 'Hệ thống' },
};
// BE có thể gửi type FE chưa biết — luôn fallback, KHÔNG để cfg undefined làm crash render.
const cfgOf = (type: string) => TYPE_CONFIG[type as NotifType] ?? TYPE_CONFIG.system;

/** Thứ tự chip lọc: việc phải làm (tiền, đồng hồ, bảo trì) trước, tin tham khảo sau. */
const CATEGORY_ORDER = [
  'Hóa đơn', 'Thanh toán', 'Ghi điện nước', 'Bảo trì', 'Thiết bị',
  'Đón khách', 'Tiễn khách', 'Hợp đồng', 'Hệ thống',
];

// ===================== MAIN =====================
export const NotificationCenterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Nạp thông báo thật từ BE mỗi khi vào màn.
  const load = useCallback(async () => {
    try {
      const rows = await realNotificationService.list();
      setNotifications(rows.map((n: ApiNotification): AppNotification => ({
        id: String(n.id), title: n.title, body: n.body,
        type: n.type as AppNotification['type'], isRead: n.isRead,
        createdAt: n.createdAt,
        actionRoute: n.screen, actionParams: n.params,
      })));
    } catch {
      setNotifications([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const items: FeedItem[] = useMemo(() => notifications.map((n) => {
    const cfg = cfgOf(n.type);
    return {
      id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, isRead: n.isRead,
      icon: cfg.icon, color: cfg.color, bg: cfg.bg, category: cfg.category,
    };
  }), [notifications]);
  const filters = useMemo(() => buildFeedFilters(items, CATEGORY_ORDER), [items]);
  const visible = useMemo(() => applyFeedFilter(items, activeFilter), [items, activeFilter]);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    const num = Number(id);
    if (Number.isFinite(num)) realNotificationService.markRead(num).catch(() => { /* offline */ });
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    realNotificationService.markAllRead().catch(() => { /* offline */ });
  };

  const TAB_ROUTES = ['ManagerBilling', 'ManagerMaintenance', 'UtilityBilling', 'ManagerHome'];

  /**
   * Bấm một dòng là đánh dấu đã đọc rồi mở đúng nơi cần làm. Thông báo không có nơi để
   * mở (vd tin hệ thống) thì bấm vào chỉ đánh dấu đã đọc — thay cho nút tích riêng ở mỗi
   * thẻ trước đây.
   */
  const handleNotifPress = (notif: AppNotification) => {
    markRead(notif.id);
    // BE trả sẵn màn + tham số (từ 05/08/2026) → mở đúng hồ sơ/hoá đơn, khỏi đoán.
    // navigateFromNotification tự lồng vào tab đúng và sửa route lệch vai.
    if (notif.actionRoute) {
      navigateFromNotification({
        screen: notif.actionRoute, params: notif.actionParams, type: notif.type,
      });
      return;
    }
    // ── Thông báo cũ (chưa có screen) → suy theo loại như trước ──
    // Thông báo bảo trì: nếu body có "#<id>" thì mở thẳng ticket, không thì về tab bảo trì.
    if (notif.type.startsWith('maintenance')) {
      const m = notif.body?.match(/#(\d+)/);
      if (m) {
        navigation.navigate('MaintenanceTicketDetail', { ticketId: m[1] });
      } else {
        navigation.navigate('ManagerTabs', { screen: 'ManagerMaintenance' });
      }
      return;
    }
    // Thông báo hóa đơn (cron nhắc nợ) → tab billing của manager.
    if (notif.type === 'new_bill' || notif.type === 'bill_overdue') {
      navigation.navigate('ManagerTabs', { screen: 'ManagerBilling' });
      return;
    }
    // Gán đón khách / hợp đồng / nhắc lịch đón → mở thẳng HĐ trong ResumeContract.
    // Ưu tiên `params.contractId` BE gửi kèm (từ 05/08/2026); regex "#<id>" trong
    // tiêu đề chỉ còn là đường lui cho thông báo cũ, và nó vốn không đáng tin —
    // câu chữ đổi một chữ là hết khớp.
    if (notif.type === 'contract_assigned' || notif.type === 'tenant_onboarded') {
      const fromParams = Number(notif.actionParams?.contractId);
      const m = notif.body?.match(/#(\d+)/) ?? notif.title?.match(/#(\d+)/);
      const contractId = Number.isFinite(fromParams) && fromParams > 0
        ? fromParams
        : m ? Number(m[1]) : undefined;
      navigation.navigate('ResumeContract', contractId ? { contractId } : undefined);
      return;
    }
    // Yêu cầu trả phòng → màn duyệt checkout-request.
    if (notif.type === 'checkout_request') {
      navigation.navigate('CheckoutRequests');
      return;
    }
    if (notif.actionRoute) {
      if (TAB_ROUTES.includes(notif.actionRoute)) {
        navigation.navigate('ManagerTabs', { screen: notif.actionRoute });
      } else {
        // TRUYỀN KÈM `params`. BE gửi `screen` + `params` từ 05/08/2026 nhưng nhánh này
        // gọi navigate() không tham số, nên mọi thông báo đi đường fallback đều mở màn
        // ở trạng thái trống — bấm vào thông báo về một hợp đồng/hoá đơn cụ thể mà tới
        // nơi lại phải tự tìm lại.
        navigation.navigate(notif.actionRoute, notif.actionParams ?? undefined);
      }
    }
  };

  return (
    <NotificationFeed
      items={visible}
      filters={filters}
      activeFilter={activeFilter}
      onFilter={setActiveFilter}
      unreadCount={unreadCount}
      onMarkAllRead={markAllRead}
      onPressItem={(id) => {
        const n = notifications.find(x => x.id === id);
        if (n) handleNotifPress(n);
      }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    />
  );
};
