import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { realNotificationService, ApiNotification } from '@/services/shared/notificationService';

// ===================== TYPES =====================
type NotifType =
  | 'new_bill' | 'bill_overdue' | 'payment_success' | 'payment_pending_verify'
  | 'contract_expiring' | 'maintenance_new' | 'maintenance_resolved' | 'maintenance_accepted'
  | 'contract_assigned' | 'checkout_request'
  | 'equipment_damaged' | 'tenant_onboarded' | 'system';

type NotifPriority = 'high' | 'normal' | 'low';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotifType;
  isRead: boolean;
  priority: NotifPriority;
  createdAt: string;
  referenceId?: string;
  actionRoute?: string;
  actionLabel?: string;
}

// ===================== CONFIG =====================
const TYPE_CONFIG: Record<NotifType, { icon: string; color: string; bg: string; category: string }> = {
  new_bill: { icon: '🧾', color: Colors.info, bg: Colors.infoLight, category: 'Hóa đơn' },
  bill_overdue: { icon: '🚨', color: Colors.error, bg: Colors.errorLight, category: 'Hóa đơn' },
  payment_success: { icon: '✅', color: Colors.success, bg: Colors.successLight, category: 'Thanh toán' },
  payment_pending_verify: { icon: '💳', color: Colors.warning, bg: Colors.warningLight, category: 'Thanh toán' },
  contract_expiring: { icon: '📋', color: Colors.info, bg: Colors.infoLight, category: 'Hợp đồng' },
  maintenance_new: { icon: '🔧', color: Colors.warning, bg: Colors.warningLight, category: 'Bảo trì' },
  maintenance_resolved: { icon: '✅', color: Colors.success, bg: Colors.successLight, category: 'Bảo trì' },
  maintenance_accepted: { icon: '🔧', color: Colors.info, bg: Colors.infoLight, category: 'Bảo trì' },
  contract_assigned: { icon: '🤝', color: Colors.primary, bg: Colors.primaryBg, category: 'Đón khách' },
  checkout_request: { icon: '🚪', color: Colors.error, bg: Colors.errorLight, category: 'Trả phòng' },
  equipment_damaged: { icon: '📦', color: Colors.error, bg: Colors.errorLight, category: 'Thiết bị' },
  tenant_onboarded: { icon: '🤝', color: Colors.primary, bg: Colors.primaryBg, category: 'Khách thuê' },
  system: { icon: '🔔', color: Colors.textSecondary, bg: Colors.divider, category: 'Hệ thống' },
};
// BE có thể gửi type FE chưa biết — luôn fallback, KHÔNG để cfg undefined làm crash render.
const cfgOf = (type: string) => TYPE_CONFIG[type as NotifType] ?? TYPE_CONFIG.system;

const FILTER_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'bill_overdue', label: 'Hóa đơn' },
  { key: 'maintenance_new', label: 'Bảo trì' },
  { key: 'contract_expiring', label: 'Hợp đồng' },
  { key: 'payment_pending_verify', label: 'Thanh toán' },
];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

// ===================== NOTIFICATION CARD =====================
const NotifCard: React.FC<{
  notif: AppNotification;
  onPress: () => void;
  onMarkRead: () => void;
}> = ({ notif, onPress, onMarkRead }) => {
  const cfg = cfgOf(notif.type);
  return (
    <TouchableOpacity
      style={[styles.card, !notif.isRead && styles.cardUnread]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.cardIconWrap, { backgroundColor: cfg.bg }]}>
        <Text style={styles.cardIcon}>{cfg.icon}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, !notif.isRead && styles.cardTitleUnread]}>
            {notif.title}
          </Text>
          {!notif.isRead && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.cardBody2} numberOfLines={2}>{notif.body}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardTime}>{timeAgo(notif.createdAt)}</Text>
          <View style={[styles.categoryChip, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.categoryText, { color: cfg.color }]}>{cfg.category}</Text>
          </View>
        </View>
        {notif.actionLabel && (
          <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
            <Text style={styles.actionBtnText}>{notif.actionLabel} →</Text>
          </TouchableOpacity>
        )}
      </View>
      {!notif.isRead && (
        <TouchableOpacity style={styles.readBtn} onPress={onMarkRead}>
          <Text style={styles.readBtnText}>✓</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

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
        priority: 'normal', createdAt: n.createdAt, actionRoute: n.screen,
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

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    if (activeFilter === 'unread') return notifications.filter(n => !n.isRead);
    return notifications.filter(n => n.type === activeFilter || n.type.startsWith(activeFilter.split('_')[0]));
  }, [notifications, activeFilter]);

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

  const handleNotifPress = (notif: AppNotification) => {
    markRead(notif.id);
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
    // Gán đón khách / hợp đồng: có "#<id>" thì mở thẳng HĐ trong ResumeContract.
    if (notif.type === 'contract_assigned' || notif.type === 'tenant_onboarded') {
      const m = notif.body?.match(/#(\d+)/) ?? notif.title?.match(/#(\d+)/);
      navigation.navigate('ResumeContract', m ? { contractId: Number(m[1]) } : undefined);
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
        navigation.navigate(notif.actionRoute);
      }
    }
  };

  const highPriorityUnread = notifications.filter(n => !n.isRead && n.priority === 'high');

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>Thông báo</Text>
            {unreadCount > 0 && (
              <Text style={styles.subtitle}>{unreadCount} chưa đọc</Text>
            )}
          </View>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Urgent alerts */}
      {highPriorityUnread.length > 0 && (
        <View style={styles.urgentSection}>
          <Text style={styles.urgentTitle}>🚨 Cần xử lý ngay ({highPriorityUnread.length})</Text>
          {highPriorityUnread.slice(0, 2).map(n => (
            <TouchableOpacity
              key={n.id}
              style={styles.urgentCard}
              onPress={() => handleNotifPress(n)}
            >
              <Text style={styles.urgentCardText} numberOfLines={1}>{n.title}</Text>
              <Text style={styles.urgentCardArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTER_TABS}
          keyExtractor={i => i.key}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => {
            const count = item.key === 'all'
              ? notifications.length
              : item.key === 'unread'
              ? unreadCount
              : notifications.filter(n => n.type === item.key || n.type.startsWith(item.key.split('_')[0])).length;
            return (
              <TouchableOpacity
                style={[styles.filterChip, activeFilter === item.key && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterText, activeFilter === item.key && styles.filterTextActive]}>
                  {item.label} {count > 0 ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Notification list */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <NotifCard
            notif={item}
            onPress={() => handleNotifPress(item)}
            onMarkRead={() => markRead(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>🔔</Text>
            <Text style={styles.emptyTitle}>Không có thông báo</Text>
            <Text style={styles.emptySubtitle}>Bạn đã xem hết tất cả thông báo</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 24, lineHeight: 26, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.error, fontWeight: '600', marginTop: 2 },
  markAllBtn: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.md,
    paddingVertical: 6, borderRadius: BorderRadius.lg,
  },
  markAllText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // Urgent section
  urgentSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  urgentTitle: { fontSize: 13, fontWeight: '700', color: Colors.error, marginBottom: Spacing.sm },
  urgentCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.error + '30',
  },
  urgentCardText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.error },
  urgentCardArrow: { fontSize: 20, color: Colors.error, fontWeight: '600' },

  // Filter
  filterContainer: { height: 46 },
  filterContent: { paddingHorizontal: Spacing.lg, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.md },

  card: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
    alignItems: 'flex-start', gap: Spacing.md,
  },
  cardUnread: { borderWidth: 1.5, borderColor: Colors.primary + '30', backgroundColor: Colors.primaryBg + '60' },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flex: 1, lineHeight: 20 },
  cardTitleUnread: { fontWeight: '800', color: Colors.textPrimary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4, flexShrink: 0 },
  cardBody2: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTime: { fontSize: 11, color: Colors.textMuted },
  categoryChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  categoryText: { fontSize: 10, fontWeight: '700' },
  actionBtn: { marginTop: Spacing.sm },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  readBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  readBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted },
});
