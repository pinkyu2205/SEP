import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { AppNotification } from '@/types';
import { formatRelativeTime } from '@/utils';
import { realNotificationService, ApiNotification } from '@/services/shared/notificationService';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';

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
});


// ─── Category / filter mappings (business logic unchanged) ────────────────────
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

const FILTER_TYPES: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Hóa đơn', label: 'Hóa đơn' },
  { key: 'Thanh toán', label: 'Thanh toán' },
  { key: 'Sửa chữa', label: 'Sửa chữa' },
  { key: 'Hợp đồng', label: 'Hợp đồng' },
  { key: 'Hệ thống', label: 'Hệ thống' },
];

// ─── Visual config per notification type ──────────────────────────────────────
const TYPE_ACCENT: Record<string, { emoji: string; color: string; bg: string }> = {
  new_bill:               { emoji: '📋', color: Colors.warning,   bg: Colors.warningLight },
  bill_overdue:           { emoji: '⚠️', color: Colors.error,     bg: Colors.errorLight },
  payment_success:        { emoji: '✅', color: Colors.success,   bg: Colors.successLight },
  payment_failed:         { emoji: '❌', color: Colors.error,     bg: Colors.errorLight },
  payment_pending_verify: { emoji: '⏳', color: Colors.warning,   bg: Colors.warningLight },
  contract_expiring:      { emoji: '📄', color: '#D97706',        bg: Colors.warningLight },
  contract_expired:       { emoji: '📄', color: Colors.error,     bg: Colors.errorLight },
  maintenance_new:        { emoji: '🔧', color: Colors.info,      bg: Colors.infoLight },
  maintenance_accepted:   { emoji: '👷', color: Colors.info,      bg: Colors.infoLight },
  maintenance_resolved:   { emoji: '✅', color: Colors.success,   bg: Colors.successLight },
  equipment_damaged:      { emoji: '⚙️', color: Colors.error,     bg: Colors.errorLight },
  meter_reading_due:      { emoji: '📊', color: Colors.warning,   bg: Colors.warningLight },
  tenant_onboarded:       { emoji: '🏠', color: Colors.success,   bg: Colors.successLight },
  system:                 { emoji: '🔔', color: Colors.textMuted, bg: '#F1F5F9' },
};

// ─── Time grouping helper ─────────────────────────────────────────────────────
type Section = { title: string; data: AppNotification[] };

const groupByTime = (items: AppNotification[]): Section[] => {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayMs    = startOfDay(now);
  const yesterMs   = todayMs - 86400000;
  const weekMs     = todayMs - 7 * 86400000;

  const groups: Section[] = [
    { title: 'Hôm nay',  data: [] },
    { title: 'Hôm qua',  data: [] },
    { title: 'Tuần này', data: [] },
    { title: 'Cũ hơn',   data: [] },
  ];

  for (const n of items) {
    const t = startOfDay(new Date(n.createdAt));
    if (t >= todayMs)    groups[0].data.push(n);
    else if (t >= yesterMs) groups[1].data.push(n);
    else if (t >= weekMs)   groups[2].data.push(n);
    else                    groups[3].data.push(n);
  }

  return groups.filter(g => g.data.length > 0);
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

  // ── Business logic ────────────────────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter(n => TYPE_CATEGORY[n.type] === filter);

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
  // ─────────────────────────────────────────────────────────────────────────

  const sections = groupByTime(filtered);

  // ── Card renderer ─────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: AppNotification }) => {
    const accent  = TYPE_ACCENT[item.type] ?? TYPE_ACCENT.system;
    const category = TYPE_CATEGORY[item.type] ?? 'Khác';

    return (
      <TouchableOpacity
        style={[styles.card, !item.isRead && styles.cardUnread]}
        onPress={() => handleNotifPress(item)}
        activeOpacity={0.72}
      >
        {/* Unread left rail */}
        {!item.isRead && <View style={[styles.unreadRail, { backgroundColor: accent.color }]} />}

        <View style={styles.cardInner}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: accent.bg }]}>
            <Text style={styles.iconEmoji}>{accent.emoji}</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Meta row: category chip + timestamp + unread dot */}
            <View style={styles.metaRow}>
              <View style={[styles.categoryPill, { backgroundColor: accent.bg }]}>
                <Text style={[styles.categoryPillText, { color: accent.color }]}>{category}</Text>
              </View>
              <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
              {!item.isRead && (
                <View style={[styles.unreadDot, { backgroundColor: accent.color }]} />
              )}
            </View>

            {/* Title */}
            <Text
              style={[styles.title, !item.isRead && styles.titleUnread]}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            {/* Body preview */}
            <Text style={styles.body} numberOfLines={2}>{item.body}</Text>

            {/* CTA */}
            {item.actionLabel && (
              <Text style={[styles.cta, { color: accent.color }]}>{item.actionLabel} →</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Section header ────────────────────────────────────────────────────────
  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{section.title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  const ListEmpty = () => (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Text style={styles.emptyIcon}>🔕</Text>
      </View>
      <Text style={styles.emptyTitle}>Bạn chưa có thông báo nào</Text>
      <Text style={styles.emptyDesc}>
        {filter === 'all'
          ? 'Mọi thông báo về hóa đơn, bảo trì và hợp đồng sẽ xuất hiện ở đây.'
          : `Không có thông báo nào trong mục "${filter}".`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Thông báo</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.markAllText}>Đọc tất cả</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.markAllBtn} />
        )}
      </View>

      {/* ── Filter chips ──────────────────────────────────────────────────── */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
          bounces={false}
        >
          {FILTER_TYPES.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Unread summary pill ───────────────────────────────────────────── */}
      {unreadCount > 0 && filter === 'all' && (
        <View style={styles.unreadPill}>
          <View style={styles.unreadPillDot} />
          <Text style={styles.unreadPillText}>{unreadCount} thông báo chưa đọc</Text>
        </View>
      )}

      {/* ── Notification list ─────────────────────────────────────────────── */}
      <SectionList
        sections={sections}
        keyExtractor={n => n.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={[styles.list, sections.length === 0 && { flex: 1 }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={<ListEmpty />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: { width: 44, height: 36, justifyContent: 'center' },
  backBtnText: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },
  markAllBtn: { width: 80, alignItems: 'flex-end', justifyContent: 'center' },
  markAllText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // Filter chips
  filterWrapper: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  filterScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  chipActive: {
    backgroundColor: Colors.primaryBg,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
  },

  // Unread summary
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: 2,
  },
  unreadPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  unreadPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.base,
    paddingBottom: 6,
    paddingHorizontal: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },

  // List
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 48 },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardUnread: {
    backgroundColor: '#F5F5FF',
  },
  unreadRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
  },
  cardInner: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingLeft: 16,
  },

  // Icon
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  iconEmoji: { fontSize: 18 },

  // Content
  content: { flex: 1, gap: 3 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  categoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  timeText: {
    fontSize: 11,
    color: Colors.textMuted,
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  title: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  titleUnread: {
    fontWeight: '700',
  },

  body: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  cta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
