import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ===================== MOCK DATA =====================
const MOCK_STATS = {
  totalRooms: 20,
  occupied: 16,
  available: 3,
  maintenance: 1,
  pendingPayments: 5,
  overduePayments: 2,
  totalDebt: 12500000,
  debtRatio: 8.2,
  openMaintenanceTickets: 4,
  urgentMaintenanceTickets: 1,
  maintenanceCostThisMonth: 1800000,
  contractsExpiringSoon: 2,
  contractsExpired: 0,
  revenueThisMonth: 64000000,
  revenueLastMonth: 59500000,
  revenueTrend: 7.6,
  profitThisMonth: 48200000,
  expenseThisMonth: 15800000,
  unreadNotifications: 6,
};

const MONTHLY_REVENUE = [
  { label: 'T1', revenue: 52000000, expense: 12000000 },
  { label: 'T2', revenue: 55000000, expense: 13500000 },
  { label: 'T3', revenue: 58000000, expense: 14000000 },
  { label: 'T4', revenue: 59500000, expense: 14800000 },
  { label: 'T5', revenue: 64000000, expense: 15800000 },
];

const MOCK_ALERTS = [
  { id: '1', type: 'overdue', icon: '⚠️', text: '2 hóa đơn quá hạn thanh toán', route: 'ManagerBilling', color: '#EF4444' },
  { id: '2', type: 'maintenance', icon: '🔧', text: '1 ticket bảo trì khẩn cấp', route: 'ManagerMaintenance', color: '#F59E0B' },
  { id: '3', type: 'contract', icon: '📋', text: '2 hợp đồng sắp hết hạn', route: 'ManagerContracts', color: '#3B82F6' },
];

// ===================== MINI BAR CHART =====================
const MiniBarChart: React.FC<{ data: typeof MONTHLY_REVENUE }> = ({ data }) => {
  const maxRevenue = Math.max(...data.map(d => d.revenue));
  const barWidth = (SCREEN_WIDTH - Spacing.lg * 2 - 32) / data.length - 8;

  return (
    <View style={chartStyles.container}>
      {data.map((item, i) => {
        const revenueHeight = (item.revenue / maxRevenue) * 70;
        const expenseHeight = (item.expense / maxRevenue) * 70;
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={chartStyles.barGroup}>
            <View style={chartStyles.barsRow}>
              <View style={[chartStyles.bar, chartStyles.revenueBar, { height: revenueHeight, width: barWidth * 0.45 }, isLast && chartStyles.barHighlight]} />
              <View style={[chartStyles.bar, chartStyles.expenseBar, { height: expenseHeight, width: barWidth * 0.45 }]} />
            </View>
            <Text style={[chartStyles.label, isLast && chartStyles.labelHighlight]}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
};

const chartStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 90, paddingTop: 8 },
  barGroup: { alignItems: 'center', flex: 1 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { borderRadius: 3 },
  revenueBar: { backgroundColor: Colors.primary },
  expenseBar: { backgroundColor: Colors.errorLight },
  barHighlight: { backgroundColor: Colors.accent },
  label: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontWeight: '600' },
  labelHighlight: { color: Colors.primary, fontWeight: '800' },
});

// ===================== QUICK ACTION =====================
interface QuickAction {
  emoji: string;
  label: string;
  route: string;
  badge?: number;
  color?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { emoji: '🤝', label: 'Đón khách', route: 'Onboarding', color: Colors.primary },
  { emoji: '🧾', label: 'Hóa đơn', route: 'ManagerBilling', badge: 5, color: Colors.warning },
  { emoji: '🔧', label: 'Sửa chữa', route: 'ManagerMaintenance', badge: 4, color: Colors.error },
  { emoji: '🏠', label: 'Phòng', route: 'RoomManage', color: Colors.success },
  { emoji: '⚡', label: 'Chốt số', route: 'MeterReading', color: Colors.accent },
  { emoji: '📋', label: 'Hợp đồng', route: 'ManagerContracts', badge: 2, color: Colors.info },
  { emoji: '📦', label: 'Thiết bị', route: 'Equipment', color: Colors.textSecondary },
  { emoji: '👥', label: 'Khách thuê', route: 'TenantList', color: Colors.primaryDark },
];

// ===================== MAIN =====================
export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const stats = MOCK_STATS;
  const occupancyRate = Math.round((stats.occupied / stats.totalRooms) * 100);
  const [showAllActions, setShowAllActions] = useState(false);

  const visibleActions = showAllActions ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 4);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName || 'Quản lý'}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('NotificationCenter')}
          >
            <Text style={{ fontSize: 22 }}>🔔</Text>
            {stats.unreadNotifications > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {stats.unreadNotifications > 9 ? '9+' : stats.unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Occupancy Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerLabel}>TỈ LỆ LẤP ĐẦY</Text>
            <Text style={styles.bannerValue}>{occupancyRate}%</Text>
            <Text style={styles.bannerSub}>{stats.occupied}/{stats.totalRooms} phòng đang thuê</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${occupancyRate}%` }]} />
            </View>
          </View>
          <View style={styles.bannerRight}>
            <View style={styles.bannerStatRow}>
              <View style={[styles.bannerDot, { backgroundColor: Colors.successLight }]} />
              <Text style={styles.bannerStatText}>{stats.available} trống</Text>
            </View>
            <View style={styles.bannerStatRow}>
              <View style={[styles.bannerDot, { backgroundColor: Colors.accentLight }]} />
              <Text style={styles.bannerStatText}>{stats.occupied} đang thuê</Text>
            </View>
            <View style={styles.bannerStatRow}>
              <View style={[styles.bannerDot, { backgroundColor: Colors.warningLight }]} />
              <Text style={styles.bannerStatText}>{stats.maintenance} bảo trì</Text>
            </View>
          </View>
        </View>

        {/* Alerts */}
        {MOCK_ALERTS.length > 0 && (
          <View style={styles.alertsSection}>
            {MOCK_ALERTS.map(alert => (
              <TouchableOpacity
                key={alert.id}
                style={[styles.alertCard, { borderLeftColor: alert.color }]}
                onPress={() => navigation.navigate(alert.route)}
              >
                <Text style={styles.alertIcon}>{alert.icon}</Text>
                <Text style={styles.alertText}>{alert.text}</Text>
                <Text style={[styles.alertArrow, { color: alert.color }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Revenue + Profit Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statsCard, { borderLeftColor: Colors.success }]}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.statsIcon}>💰</Text>
            <Text style={styles.statsValue}>
              {(stats.revenueThisMonth / 1_000_000).toFixed(1)}tr
            </Text>
            <Text style={styles.statsLabel}>Doanh thu T5</Text>
            <View style={styles.trendBadge}>
              <Text style={styles.trendText}>▲ {stats.revenueTrend}%</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statsCard, { borderLeftColor: Colors.primary }]}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.statsIcon}>📈</Text>
            <Text style={styles.statsValue}>
              {(stats.profitThisMonth / 1_000_000).toFixed(1)}tr
            </Text>
            <Text style={styles.statsLabel}>Lợi nhuận</Text>
            <View style={[styles.trendBadge, { backgroundColor: Colors.primaryBg }]}>
              <Text style={[styles.trendText, { color: Colors.primary }]}>Net</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statsCard, { borderLeftColor: Colors.error }]}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.statsIcon}>⚠️</Text>
            <Text style={[styles.statsValue, { color: Colors.error }]}>
              {(stats.totalDebt / 1_000_000).toFixed(1)}tr
            </Text>
            <Text style={styles.statsLabel}>Dư nợ</Text>
            <View style={[styles.trendBadge, { backgroundColor: Colors.errorLight }]}>
              <Text style={[styles.trendText, { color: Colors.error }]}>{stats.debtRatio}%</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statsCard, { borderLeftColor: Colors.warning }]}
            onPress={() => navigation.navigate('ManagerMaintenance')}
          >
            <Text style={styles.statsIcon}>🔧</Text>
            <Text style={[styles.statsValue, stats.urgentMaintenanceTickets > 0 && { color: Colors.warning }]}>
              {stats.openMaintenanceTickets}
            </Text>
            <Text style={styles.statsLabel}>Đang sửa</Text>
            {stats.urgentMaintenanceTickets > 0 && (
              <View style={[styles.trendBadge, { backgroundColor: Colors.warningLight }]}>
                <Text style={[styles.trendText, { color: Colors.warning }]}>
                  {stats.urgentMaintenanceTickets} khẩn
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Revenue Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Doanh thu 5 tháng</Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                <Text style={styles.legendText}>Thu</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.errorLight }]} />
                <Text style={styles.legendText}>Chi</Text>
              </View>
            </View>
          </View>
          <MiniBarChart data={MONTHLY_REVENUE} />
          <View style={styles.chartFooter}>
            <Text style={styles.chartFooterText}>
              Thu T5: <Text style={styles.chartFooterValue}>
                {stats.revenueThisMonth.toLocaleString('vi-VN')}đ
              </Text>
            </Text>
            <Text style={styles.chartFooterText}>
              Chi: <Text style={[styles.chartFooterValue, { color: Colors.error }]}>
                {stats.expenseThisMonth.toLocaleString('vi-VN')}đ
              </Text>
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
          <TouchableOpacity onPress={() => setShowAllActions(v => !v)}>
            <Text style={styles.seeAll}>{showAllActions ? 'Thu gọn' : 'Xem thêm'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsGrid}>
          {visibleActions.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={styles.actionBtn}
              onPress={() => navigation.navigate(a.route)}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: a.color + '18' }]}>
                <Text style={styles.actionEmoji}>{a.emoji}</Text>
                {a.badge && a.badge > 0 ? (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{a.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Payment Summary */}
        <View style={styles.paymentSummaryCard}>
          <View style={styles.paymentSummaryHeader}>
            <Text style={styles.sectionTitle}>Thanh toán tháng này</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ManagerBilling')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.paymentRow}>
            <View style={styles.paymentItem}>
              <Text style={styles.paymentNum}>{stats.occupied - stats.pendingPayments - stats.overduePayments}</Text>
              <Text style={styles.paymentLabel}>Đã thanh toán</Text>
              <View style={[styles.paymentDot, { backgroundColor: Colors.success }]} />
            </View>
            <View style={styles.paymentDivider} />
            <View style={styles.paymentItem}>
              <Text style={[styles.paymentNum, { color: Colors.warning }]}>{stats.pendingPayments}</Text>
              <Text style={styles.paymentLabel}>Chưa thanh toán</Text>
              <View style={[styles.paymentDot, { backgroundColor: Colors.warning }]} />
            </View>
            <View style={styles.paymentDivider} />
            <View style={styles.paymentItem}>
              <Text style={[styles.paymentNum, { color: Colors.error }]}>{stats.overduePayments}</Text>
              <Text style={styles.paymentLabel}>Quá hạn</Text>
              <View style={[styles.paymentDot, { backgroundColor: Colors.error }]} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.collectBtn}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.collectBtnText}>📊 Quản lý hóa đơn & thu tiền</Text>
          </TouchableOpacity>
        </View>

        {/* Maintenance Summary */}
        <View style={styles.maintenanceSummaryCard}>
          <View style={styles.paymentSummaryHeader}>
            <Text style={styles.sectionTitle}>Bảo trì & Sửa chữa</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ManagerMaintenance')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.maintenanceStats}>
            <View style={styles.maintenanceStatItem}>
              <Text style={[styles.maintenanceStatNum, { color: Colors.error }]}>1</Text>
              <Text style={styles.maintenanceStatLabel}>Khẩn cấp</Text>
            </View>
            <View style={styles.maintenanceStatItem}>
              <Text style={[styles.maintenanceStatNum, { color: Colors.warning }]}>2</Text>
              <Text style={styles.maintenanceStatLabel}>Đang xử lý</Text>
            </View>
            <View style={styles.maintenanceStatItem}>
              <Text style={[styles.maintenanceStatNum, { color: Colors.textSecondary }]}>1</Text>
              <Text style={styles.maintenanceStatLabel}>Chờ tiếp nhận</Text>
            </View>
            <View style={styles.maintenanceStatItem}>
              <Text style={[styles.maintenanceStatNum, { color: Colors.success }]}>8</Text>
              <Text style={styles.maintenanceStatLabel}>Hoàn tất T5</Text>
            </View>
          </View>
          <View style={styles.maintenanceCostRow}>
            <Text style={styles.maintenanceCostLabel}>Chi phí sửa chữa T5:</Text>
            <Text style={styles.maintenanceCostValue}>
              {stats.maintenanceCostThisMonth.toLocaleString('vi-VN')}đ
            </Text>
          </View>
        </View>

        {/* Contract Expiry */}
        {stats.contractsExpiringSoon > 0 && (
          <TouchableOpacity
            style={styles.contractAlertCard}
            onPress={() => navigation.navigate('ManagerContracts')}
          >
            <Text style={styles.contractAlertIcon}>📋</Text>
            <View style={styles.contractAlertBody}>
              <Text style={styles.contractAlertTitle}>
                {stats.contractsExpiringSoon} hợp đồng sắp hết hạn
              </Text>
              <Text style={styles.contractAlertSub}>Trong 30 ngày tới — nhấn để xem và gia hạn</Text>
            </View>
            <Text style={styles.contractAlertArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  greeting: { fontSize: 13, color: Colors.textSecondary },
  userName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  notifBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  notifBadge: {
    position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18,
    borderRadius: 9, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  notifBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  // Banner
  banner: {
    flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  bannerLeft: { flex: 1.5 },
  bannerLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  bannerValue: { fontSize: 44, fontWeight: '800', color: Colors.white, marginTop: 2 },
  bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2, marginBottom: Spacing.sm },
  progressBg: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3, marginTop: Spacing.xs,
  },
  progressFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  bannerRight: { flex: 1, justifyContent: 'center', paddingLeft: Spacing.md },
  bannerStatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerStatText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  // Alerts
  alertsSection: { marginBottom: Spacing.md, gap: Spacing.sm },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, padding: Spacing.md, borderLeftWidth: 4, ...Shadow.sm, gap: Spacing.sm,
  },
  alertIcon: { fontSize: 18 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  alertArrow: { fontSize: 22, fontWeight: '600' },

  // Stats row
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  statsCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderLeftWidth: 3, ...Shadow.sm,
  },
  statsIcon: { fontSize: 20, marginBottom: 4 },
  statsValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statsLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  trendBadge: {
    marginTop: 6, alignSelf: 'flex-start', backgroundColor: Colors.successLight,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  trendText: { fontSize: 10, fontWeight: '700', color: Colors.success },

  // Chart
  chartCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  legendRow: { flexDirection: 'row', gap: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  chartFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderColor: Colors.divider,
  },
  chartFooterText: { fontSize: 12, color: Colors.textSecondary },
  chartFooterValue: { fontWeight: '700', color: Colors.success },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  seeAll: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // Quick Actions
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md,
  },
  actionBtn: {
    width: '22%', alignItems: 'center', backgroundColor: Colors.white,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm,
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs,
  },
  actionEmoji: { fontSize: 22 },
  actionBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
    borderRadius: 8, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  actionBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },
  actionLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

  // Payment summary
  paymentSummaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
  },
  paymentSummaryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  paymentRow: { flexDirection: 'row', marginBottom: Spacing.md },
  paymentItem: { flex: 1, alignItems: 'center' },
  paymentNum: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  paymentLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  paymentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  paymentDivider: { width: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.sm },
  collectBtn: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  collectBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Maintenance summary
  maintenanceSummaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
  },
  maintenanceStats: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  maintenanceStatItem: { alignItems: 'center', flex: 1 },
  maintenanceStatNum: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  maintenanceStatLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  maintenanceCostRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderColor: Colors.divider, paddingTop: Spacing.sm,
  },
  maintenanceCostLabel: { fontSize: 13, color: Colors.textSecondary },
  maintenanceCostValue: { fontSize: 14, fontWeight: '700', color: Colors.error },

  // Contract alert
  contractAlertCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.infoLight,
    borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md,
    gap: Spacing.md, borderWidth: 1, borderColor: Colors.info + '40',
  },
  contractAlertIcon: { fontSize: 28 },
  contractAlertBody: { flex: 1 },
  contractAlertTitle: { fontSize: 14, fontWeight: '700', color: Colors.info },
  contractAlertSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  contractAlertArrow: { fontSize: 24, color: Colors.info, fontWeight: '600' },
});
