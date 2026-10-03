import React, { useState, useCallback, useMemo } from 'react';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants';
import { AppNotification } from '@/types';
import { realNotificationService, ApiNotification } from '@/services/shared/notificationService';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';
import { navigateFromNotification } from '@/navigation/navigationRef';
import type { IconName } from '@/components/common/Icon';
import {
  NotificationFeed, applyFeedFilter, buildFeedFilters, type FeedItem,
} from '@/components/common/NotificationFeed';

// Map thông báo BE (ApiNotification) → AppNotification dùng trong UI.
const mapApiNotif = (n: ApiNotification): AppNotification => ({
  id: String(n.id),
  title: n.title,
  body: n.body,
  type: n.type as AppNotification['type'],
  isRead: n.isRead,
  priority: 'normal',
  createdAt: n.createdAt,
  actionRoute: n.screen,
  actionParams: n.params,
});

// ─── Mục của từng loại thông báo — cũng là khoá của chip lọc ──────────────────
const TYPE_CATEGORY: Record<string, string> = {
  new_bill: 'Hóa đơn',
  bill_overdue: 'Hóa đơn',
  payment_success: 'Thanh toán',
  payment_failed: 'Thanh toán',
  payment_pending_verify: 'Thanh toán',
  contract_expiring: 'Hợp đồng',
  contract_expired: 'Hợp đồng',
  // Đơn gia hạn (BE 02/09/2026) — chung mục "Hợp đồng".
  extension_requested: 'Hợp đồng',
  extension_approved: 'Hợp đồng',
  extension_closed: 'Hợp đồng',
  maintenance_new: 'Sửa chữa',
  maintenance_accepted: 'Sửa chữa',
  maintenance_resolved: 'Sửa chữa',
  // Tách từ BE 13/08/2026 — vẫn chung mục "Sửa chữa", chỉ khác icon/màu.
  maintenance_confirm: 'Sửa chữa',
  maintenance_cost: 'Sửa chữa',
  maintenance_cancelled: 'Sửa chữa',
  maintenance_rejected: 'Sửa chữa',
  maintenance_overdue: 'Sửa chữa',
  equipment_damaged: 'Thiết bị',
  meter_reading_due: 'Đồng hồ',
  tenant_onboarded: 'Nhận phòng',
  checkout_request: 'Trả phòng',
  system: 'Hệ thống',
};

/**
 * Type BE gửi mà FE chưa biết → xếp vào "Hệ thống" thay vì rơi khỏi mọi mục.
 *
 * Trước đây `TYPE_CATEGORY[n.type]` trả undefined nên thông báo chỉ hiện ở "Tất cả";
 * dòng lại ghi nhãn "Khác" mà không có chip "Khác" nào để bấm. Mỗi lần BE thêm type mới
 * là một lần thông báo mất hút khi lọc.
 */
const categoryOf = (type: string): string => TYPE_CATEGORY[type] ?? 'Hệ thống';

/** Thứ tự chip lọc: tiền trước, rồi sửa chữa, rồi các tin về phòng/hợp đồng. */
const CATEGORY_ORDER = [
  'Hóa đơn', 'Thanh toán', 'Sửa chữa', 'Thiết bị', 'Đồng hồ',
  'Nhận phòng', 'Trả phòng', 'Hợp đồng', 'Hệ thống',
];

// ─── Biểu tượng + màu theo loại ───────────────────────────────────────────────
const TYPE_ACCENT: Record<string, { icon: IconName; color: string; bg: string }> = {
  new_bill:               { icon: 'receipt',         color: '#B45309',        bg: Colors.warningLight },
  bill_overdue:           { icon: 'warning',         color: Colors.error,     bg: Colors.errorLight },
  payment_success:        { icon: 'success',         color: '#047857',        bg: Colors.successLight },
  payment_failed:         { icon: 'error',           color: Colors.error,     bg: Colors.errorLight },
  payment_pending_verify: { icon: 'hourglass',       color: '#B45309',        bg: Colors.warningLight },
  contract_expiring:      { icon: 'calendar-clock',  color: '#B45309',        bg: Colors.warningLight },
  contract_expired:       { icon: 'calendar-x',      color: Colors.error,     bg: Colors.errorLight },
  extension_requested:    { icon: 'contract',        color: '#B45309',        bg: Colors.warningLight },
  extension_approved:     { icon: 'calendar-check',  color: '#047857',        bg: Colors.successLight },
  extension_closed:       { icon: 'document',        color: Colors.textSecondary, bg: Colors.divider },
  maintenance_new:        { icon: 'wrench',          color: Colors.info,      bg: Colors.infoLight },
  maintenance_accepted:   { icon: 'hard-hat',        color: Colors.info,      bg: Colors.infoLight },
  maintenance_resolved:   { icon: 'success',         color: '#047857',        bg: Colors.successLight },
  // "Đã sửa xong — vui lòng xác nhận": khách PHẢI bấm, quá N ngày hệ thống tự đóng.
  // Cố tình dùng màu cảnh báo chứ không phải xanh lá — xanh lá đọc thành "xong rồi,
  // không cần làm gì", đúng cái hiểu nhầm khiến ticket bị tự đóng.
  maintenance_confirm:    { icon: 'clipboard-check', color: '#B45309',        bg: Colors.warningLight },
  maintenance_cost:       { icon: 'cash',            color: Colors.accentDark, bg: '#CFFAFE' },
  maintenance_cancelled:  { icon: 'ban',             color: Colors.textSecondary, bg: Colors.divider },
  maintenance_rejected:   { icon: 'undo',            color: Colors.error,     bg: Colors.errorLight },
  // Quá hạn tự sửa — khách đã trễ deadline. Đỏ như `rejected` nhưng khác biểu tượng:
  // "bị từ chối" (mũi tên quay lại) và "quá hạn" (đồng hồ báo thức) là hai việc khác nhau.
  maintenance_overdue:    { icon: 'alarm',           color: Colors.error,     bg: Colors.errorLight },
  equipment_damaged:      { icon: 'settings',        color: Colors.error,     bg: Colors.errorLight },
  meter_reading_due:      { icon: 'meter',           color: '#B45309',        bg: Colors.warningLight },
  tenant_onboarded:       { icon: 'home',            color: '#047857',        bg: Colors.successLight },
  checkout_request:       { icon: 'door',            color: '#DC2626',        bg: Colors.errorLight },
  system:                 { icon: 'bell',            color: Colors.textSecondary, bg: Colors.divider },
};

// ─── Component ────────────────────────────────────────────────────────────────
export const TenantNotificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Nạp thông báo thật từ BE mỗi khi vào màn.
  const load = useCallback(async () => {
    try {
      const rows = await realNotificationService.list();
      setNotifications(rows.map(mapApiNotif));
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

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const items: FeedItem[] = useMemo(() => notifications.map((n) => {
    const accent = TYPE_ACCENT[n.type] ?? TYPE_ACCENT.system;
    return {
      id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, isRead: n.isRead,
      icon: accent.icon, color: accent.color, bg: accent.bg,
      category: categoryOf(n.type), actionLabel: n.actionLabel,
    };
  }), [notifications]);
  const filters = useMemo(() => buildFeedFilters(items, CATEGORY_ORDER), [items]);
  const visible = useMemo(() => applyFeedFilter(items, filter), [items, filter]);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    realNotificationService.markAllRead().catch(() => { /* offline */ });
  };
  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    const num = Number(id);
    if (Number.isFinite(num)) realNotificationService.markRead(num).catch(() => { /* offline */ });
  };

  const TENANT_TAB_ROUTES = ['Home', 'InvoiceList', 'MaintenanceList', 'TenantContracts', 'Profile'];

  const handleNotifPress = async (notif: AppNotification) => {
    markRead(notif.id);

    /**
     * Thông báo hoá đơn có kèm `invoiceId` → mở THẲNG hoá đơn đó để trả tiền.
     *
     * Phải xét TRƯỚC nhánh `actionRoute`: BE gửi `screen: "InvoiceList"` kèm
     * `params.invoiceId`, nhưng `InvoiceListScreen` không đọc `route.params` — nên id rơi
     * mất và khách bị đổ về danh sách, phải tự dò lại đúng hoá đơn vừa được nhắc. Với tin
     * "tiền phòng tới hạn / quá hạn" thì bấm vào là để trả ngay, bắt tìm thêm một bước là
     * đúng chỗ khiến người ta bỏ ngang.
     *
     * `InvoiceDetail` nhận nguyên object `SharedBill` chứ không nhận id (xem
     * `InvoiceDetailScreen`), nên phải nạp hoá đơn trước rồi mới điều hướng.
     *
     * Tin nhắc TRƯỚC ngày phát hành (`RENT_REMINDER_PRE`) chưa có hoá đơn nên không kèm
     * id — tự rơi xuống danh sách, đúng như mong muốn.
     */
    if (notif.type === 'new_bill' || notif.type === 'bill_overdue') {
      const invoiceId = Number(notif.actionParams?.invoiceId);
      if (Number.isFinite(invoiceId) && invoiceId > 0) {
        try {
          const inv = await realTenantBillingService.getInvoice(invoiceId);
          navigation.navigate('InvoiceDetail', { invoice: toSharedBill(inv) });
          return;
        } catch { /* hoá đơn đã huỷ / không đọc được → rơi về danh sách */ }
      }
      navigation.navigate('TenantTabs', { screen: 'InvoiceList' });
      return;
    }

    // BE trả sẵn màn + tham số (từ 05/08/2026) → mở đúng hồ sơ/hoá đơn.
    if (notif.actionRoute) {
      navigateFromNotification({
        screen: notif.actionRoute, params: notif.actionParams, type: notif.type,
      });
      return;
    }
    // ── Thông báo cũ (chưa có screen) → suy theo loại như trước ──
    if (notif.type === 'checkout_request') {
      navigation.navigate('CheckoutDetail');
      return;
    }
    // Thông báo bảo trì: BE không gửi payload điều hướng, nhưng body luôn có
    // "Yêu cầu #<id> ..." → parse id, nạp chi tiết rồi mở thẳng màn ticket.
    if (notif.type.startsWith('maintenance')) {
      const m = notif.body?.match(/#(\d+)/);
      if (m) {
        try {
          const dto = await realMaintenanceService.getDetail(Number(m[1]));
          navigation.navigate('MaintenanceDetail', { request: dtoToTenantRequest(dto) });
          return;
        } catch { /* ticket không đọc được → rơi xuống danh sách */ }
      }
      navigation.navigate('TenantTabs', { screen: 'MaintenanceList' });
      return;
    }
    if (notif.actionRoute) {
      if (TENANT_TAB_ROUTES.includes(notif.actionRoute)) {
        navigation.navigate('TenantTabs', { screen: notif.actionRoute });
      } else {
        navigation.navigate(notif.actionRoute as never);
      }
    }
  };

  return (
    <NotificationFeed
      items={visible}
      filters={filters}
      activeFilter={filter}
      onFilter={setFilter}
      unreadCount={unreadCount}
      onMarkAllRead={markAllRead}
      onPressItem={(id) => {
        const n = notifications.find(x => x.id === id);
        if (n) void handleNotifPress(n);
      }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={() => navigation.goBack()}
    />
  );
};
