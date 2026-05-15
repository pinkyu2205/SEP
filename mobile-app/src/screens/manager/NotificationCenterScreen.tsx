import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// ===================== TYPES =====================
type NotifType =
  | 'new_bill' | 'bill_overdue' | 'payment_success' | 'payment_pending_verify'
  | 'contract_expiring' | 'maintenance_new' | 'maintenance_resolved'
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

// ===================== MOCK DATA =====================
const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1', type: 'bill_overdue', priority: 'high', isRead: false,
    title: '🚨 Hóa đơn quá hạn!',
    body: 'Phòng P201 (Phạm Văn C) chưa thanh toán hóa đơn tháng 5 — quá hạn 1 ngày. Tổng nợ: 4,805,075đ',
    createdAt: '2026-05-16 08:00', actionRoute: 'ManagerBilling', actionLabel: 'Xem hóa đơn',
  },
  {
    id: 'n2', type: 'bill_overdue', priority: 'high', isRead: false,
    title: '🚨 Hóa đơn quá hạn tháng trước',
    body: 'Phòng P201 (Phạm Văn C) vẫn còn nợ hóa đơn tháng 4 — quá hạn 31 ngày. Tổng nợ: 4,615,700đ',
    createdAt: '2026-05-16 07:55', actionRoute: 'ManagerBilling', actionLabel: 'Xử lý ngay',
  },
  {
    id: 'n3', type: 'maintenance_new', priority: 'high', isRead: false,
    title: '⚡ Yêu cầu sửa chữa khẩn cấp',
    body: 'Phạm Văn C (P201) báo cáo: "Ổ cắm điện bị cháy" — Mức độ: Khẩn cấp. Ticket: TK-2026-003',
    createdAt: '2026-05-14 07:05', actionRoute: 'ManagerMaintenance', actionLabel: 'Xem ticket',
  },
  {
    id: 'n4', type: 'payment_pending_verify', priority: 'high', isRead: false,
    title: '💳 Thanh toán cần xác nhận',
    body: 'Trần Văn A (P101) vừa gửi ảnh chuyển khoản cho HD-T5-101 — 4,352,500đ. Cần xác nhận.',
    createdAt: '2026-05-14 09:16', actionRoute: 'ManagerBilling', actionLabel: 'Xác nhận',
  },
  {
    id: 'n5', type: 'contract_expiring', priority: 'normal', isRead: false,
    title: '📋 Hợp đồng sắp hết hạn',
    body: 'Hợp đồng của Lê Thị B (P102) sẽ hết hạn vào 15/05/2026 — còn 0 ngày. Cần gia hạn hoặc thanh lý.',
    createdAt: '2026-05-13 09:00', actionRoute: 'ManagerContracts', actionLabel: 'Gia hạn HĐ',
  },
  {
    id: 'n6', type: 'contract_expiring', priority: 'normal', isRead: true,
    title: '📋 Hợp đồng sắp hết hạn (30 ngày)',
    body: 'Hợp đồng của Lê Thị B (P102) sẽ hết hạn sau 30 ngày. Nên liên hệ trước để tránh gián đoạn.',
    createdAt: '2026-04-15 09:00', actionRoute: 'ManagerContracts', actionLabel: 'Xem HĐ',
  },
  {
    id: 'n7', type: 'payment_success', priority: 'low', isRead: true,
    title: '✅ Thanh toán thành công',
    body: 'Lê Thị B (P102) đã thanh toán HD-T5-102 — 3,860,000đ qua QR VietQR lúc 14:30.',
    createdAt: '2026-05-10 14:31', actionRoute: 'ManagerBilling',
  },
  {
    id: 'n8', type: 'maintenance_new', priority: 'normal', isRead: true,
    title: '🚰 Yêu cầu sửa chữa mới',
    body: 'Phạm Văn C (P201) báo cáo: "Vòi nước bị rỉ" — Mức độ: Trung bình. Ticket: TK-2026-002',
    createdAt: '2026-05-13 16:02', actionRoute: 'ManagerMaintenance',
  },
  {
    id: 'n9', type: 'maintenance_resolved', priority: 'low', isRead: true,
    title: '✅ Bảo trì hoàn tất',
    body: 'Ticket TK-2026-004 (Cửa phòng tắm P101 CMT8) đã được giải quyết. Chi phí: 250,000đ.',
    createdAt: '2026-05-08 11:01', actionRoute: 'ManagerMaintenance',
  },
  {
    id: 'n10', type: 'tenant_onboarded', priority: 'low', isRead: true,
    title: '🤝 Khách mới nhận phòng',
    body: 'Hoàng Thị E đã hoàn tất onboarding cho phòng P302 (Nhà Nguyễn Trãi). Hợp đồng đang chờ ký.',
    createdAt: '2026-05-15 16:30', actionRoute: 'TenantList',
  },
  {
    id: 'n11', type: 'system', priority: 'low', isRead: true,
    title: '📊 Báo cáo tháng 4/2026',
    body: 'Báo cáo doanh thu tháng 4 đã sẵn sàng. Doanh thu: 59,500,000đ. Tỉ lệ thu: 92%.',
    createdAt: '2026-05-01 08:00',
  },
];

// ===================== CONFIG =====================
const TYPE_CONFIG: Record<NotifType, { icon: string; color: string; bg: string; category: string }> = {
  new_bill: { icon: '🧾', color: Colors.info, bg: Colors.infoLight, category: 'Hóa đơn' },
  bill_overdue: { icon: '🚨', color: Colors.error, bg: Colors.errorLight, category: 'Hóa đơn' },
  payment_success: { icon: '✅', color: Colors.success, bg: Colors.successLight, category: 'Thanh toán' },
  payment_pending_verify: { icon: '💳', color: Colors.warning, bg: Colors.warningLight, category: 'Thanh toán' },
  contract_expiring: { icon: '📋', color: Colors.info, bg: Colors.infoLight, category: 'Hợp đồng' },
  maintenance_new: { icon: '🔧', color: Colors.warning, bg: Colors.warningLight, category: 'Bảo trì' },
  maintenance_resolved: { icon: '✅', color: Colors.success, bg: Colors.successLight, category: 'Bảo trì' },
  equipment_damaged: { icon: '📦', color: Colors.error, bg: Colors.errorLight, category: 'Thiết bị' },
  tenant_onboarded: { icon: '🤝', color: Colors.primary, bg: Colors.primaryBg, category: 'Khách thuê' },
  system: { icon: '🔔', color: Colors.textSecondary, bg: Colors.divider, category: 'Hệ thống' },
};

const FILTER_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'bill_overdue', label: 'Hóa đơn' },
  { key: 'maintenance_new', label: 'Bảo trì' },
  { key: 'contract_expiring', label: 'Hợp đồng' },
  { key: 'payment_pending_verify', label: 'Thanh toán' },
];

function timeAgo(dateStr: string): string {
  const now = new Date('2026-05-16T10:00:00');
  const date = new Date(dateStr.replace(' ', 'T'));
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
  const cfg = TYPE_CONFIG[notif.type];
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
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [activeFilter, setActiveFilter] = useState('all');

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    if (activeFilter === 'unread') return notifications.filter(n => !n.isRead);
    return notifications.filter(n => n.type === activeFilter || n.type.startsWith(activeFilter.split('_')[0]));
  }, [notifications, activeFilter]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotifPress = (notif: AppNotification) => {
    markRead(notif.id);
    if (notif.actionRoute) {
      navigation.navigate(notif.actionRoute);
    }
  };

  const highPriorityUnread = notifications.filter(n => !n.isRead && n.priority === 'high');

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Thông báo</Text>
          {unreadCount > 0 && (
            <Text style={styles.subtitle}>{unreadCount} chưa đọc</Text>
          )}
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
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
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
