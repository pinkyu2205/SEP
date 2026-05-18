import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { AppNotification, NotificationType } from '../../types';
import { formatRelativeTime, getNotificationTypeEmoji } from '../../utils';

const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: '1', title: 'Hóa đơn tháng 3/2026 đã quá hạn', body: 'Hóa đơn tháng 3/2026 của bạn đã quá hạn thanh toán. Vui lòng thanh toán ngay để tránh phát sinh phí trễ.',
    type: 'bill_overdue', isRead: false, priority: 'high',
    referenceId: '3', referenceType: 'invoice',
    actionLabel: 'Thanh toán ngay', actionRoute: 'InvoiceList',
    createdAt: '2026-05-01T10:00:00Z',
  },
  {
    id: '2', title: 'Hóa đơn tháng 5/2026 đã được tạo', body: 'Hóa đơn tháng 5/2026 của phòng 201 đã được tạo với tổng số tiền 3.855.000đ. Hạn thanh toán 15/05/2026.',
    type: 'new_bill', isRead: false, priority: 'normal',
    referenceId: '1', referenceType: 'invoice',
    actionLabel: 'Xem hóa đơn', actionRoute: 'InvoiceList',
    createdAt: '2026-04-29T09:00:00Z',
  },
  {
    id: '3', title: 'Yêu cầu sửa chữa đã được tiếp nhận', body: 'Yêu cầu sửa ổ cắm điện (TK-T-002) đã được quản lý tiếp nhận và phân công thợ. Dự kiến hoàn thành trước 30/04/2026.',
    type: 'maintenance_accepted', isRead: true, priority: 'normal',
    referenceId: '2', referenceType: 'maintenance',
    actionLabel: 'Xem tiến độ', actionRoute: 'MaintenanceList',
    createdAt: '2026-04-27T14:00:00Z',
  },
  {
    id: '4', title: 'Sửa chữa tủ quần áo hoàn tất', body: 'Yêu cầu sửa tủ quần áo (TK-T-003) đã được hoàn tất. Bản lề mới đã được thay. Chi phí: 150.000đ.',
    type: 'maintenance_resolved', isRead: true, priority: 'normal',
    referenceId: '3', referenceType: 'maintenance',
    createdAt: '2026-04-22T16:00:00Z',
  },
  {
    id: '5', title: 'Thanh toán tháng 4 được xác nhận', body: 'Thanh toán hóa đơn tháng 4/2026 đã được quản lý xác nhận. Cảm ơn bạn!',
    type: 'payment_success', isRead: true, priority: 'normal',
    referenceId: '2', referenceType: 'invoice',
    createdAt: '2026-04-10T11:00:00Z',
  },
  {
    id: '6', title: 'Hợp đồng còn 230 ngày nữa hết hạn', body: 'Hợp đồng thuê phòng 201 của bạn sẽ hết hạn vào ngày 31/12/2026. Bạn có thể yêu cầu gia hạn sớm.',
    type: 'contract_expiring', isRead: true, priority: 'low',
    referenceId: '1', referenceType: 'contract',
    actionLabel: 'Xem hợp đồng', actionRoute: 'TenantContracts',
    createdAt: '2026-05-15T08:00:00Z',
  },
];

const TYPE_CATEGORY: Record<string, string> = {
  new_bill: 'Hóa đơn',
  bill_overdue: 'Hóa đơn',
  payment_success: 'Thanh toán',
  payment_failed: 'Thanh toán',
  payment_pending_verify: 'Thanh toán',
  contract_expiring: 'Hợp đồng',
  contract_expired: 'Hợp đồng',
  maintenance_new: 'Sửa chữa',
  maintenance_accepted: 'Sửa chữa',
  maintenance_resolved: 'Sửa chữa',
  equipment_damaged: 'Thiết bị',
  meter_reading_due: 'Đồng hồ',
  tenant_onboarded: 'Nhận phòng',
  system: 'Hệ thống',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: Colors.error,
  normal: Colors.info,
  low: Colors.textMuted,
};

const FILTER_TYPES: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Hóa đơn', label: 'Hóa đơn' },
  { key: 'Sửa chữa', label: 'Sửa chữa' },
  { key: 'Hợp đồng', label: 'Hợp đồng' },
  { key: 'Thanh toán', label: 'Thanh toán' },
];

export const TenantNotificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState<string>('all');

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter(n => TYPE_CATEGORY[n.type] === filter);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const TENANT_TAB_ROUTES = ['Home', 'InvoiceList', 'MaintenanceList', 'TenantContracts', 'Profile'];

  const handleNotifPress = (notif: AppNotification) => {
    markRead(notif.id);
    if (notif.actionRoute) {
      if (TENANT_TAB_ROUTES.includes(notif.actionRoute)) {
        navigation.navigate('TenantTabs', { screen: notif.actionRoute });
      } else {
        navigation.navigate(notif.actionRoute as never);
      }
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const emoji = getNotificationTypeEmoji(item.type);
    const priorityColor = PRIORITY_COLOR[item.priority];
    const category = TYPE_CATEGORY[item.type] || 'Khác';

    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.isRead && styles.notifCardUnread]}
        onPress={() => handleNotifPress(item)}
        activeOpacity={0.7}
      >
        {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: priorityColor }]} />}

        <View style={styles.notifTop}>
          <View style={[styles.notifIconWrap, { backgroundColor: priorityColor + '15' }]}>
            <Text style={{ fontSize: 20 }}>{emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.notifMeta}>
              <View style={[styles.categoryChip, { backgroundColor: priorityColor + '15' }]}>
                <Text style={[styles.categoryChipText, { color: priorityColor }]}>{category}</Text>
              </View>
              <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
            </View>
            <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]}>
              {item.title}
            </Text>
          </View>
        </View>

        <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>

        {item.actionLabel && (
          <View style={styles.notifAction}>
            <Text style={styles.notifActionText}>{item.actionLabel} →</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Thông báo</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {/* Bộ lọc theo loại */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTER_TYPES.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tổng chưa đọc */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>🔔 Bạn có {unreadCount} thông báo chưa đọc</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={n => n.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>Không có thông báo</Text>
            <Text style={styles.emptyDesc}>Bạn chưa có thông báo nào thuộc mục này.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm, width: 80 },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerBadge: { backgroundColor: Colors.error, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  headerBadgeText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  markAllBtn: { padding: Spacing.sm },
  markAllText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  filterRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  unreadBanner: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.sm,
  },
  unreadBannerText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

  notifCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    ...Shadow.sm, position: 'relative',
  },
  notifCardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  unreadDot: { position: 'absolute', top: Spacing.md, right: Spacing.md, width: 8, height: 8, borderRadius: 4 },

  notifTop: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  notifIconWrap: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  categoryChip: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  categoryChipText: { fontSize: 10, fontWeight: '700' },
  timeText: { fontSize: 11, color: Colors.textMuted },
  notifTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, lineHeight: 20 },
  notifTitleUnread: { fontWeight: '700' },

  notifBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginLeft: 44 + Spacing.md },

  notifAction: { marginTop: Spacing.sm, marginLeft: 44 + Spacing.md },
  notifActionText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
