import React from 'react';
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
const MANAGED_PROPERTIES = [
  {
    id: 'prop-1',
    name: 'Nhà Nguyễn Trãi',
    address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
    totalFloors: 3,
    totalRooms: 8,
    occupied: 5,
    available: 2,
    maintenance: 1,
    monthlyLeaseCost: 25000000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceCharge: 100000,
    hostName: 'Nguyễn Văn Host',
  },
  {
    id: 'prop-3',
    name: 'Nhà Cách Mạng Tháng 8',
    address: '789 CMT8, Quận 10, TP.HCM',
    totalFloors: 2,
    totalRooms: 4,
    occupied: 3,
    available: 1,
    maintenance: 0,
    monthlyLeaseCost: 18000000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceCharge: 80000,
    hostName: 'Trần Văn Host',
  },
];

const MOCK_STATS = {
  totalRooms: 20,
  occupied: 16,
  available: 3,
  maintenance: 1,
  overduePayments: 2,
  totalDebt: 12500000,
  openMaintenanceTickets: 4,
  urgentMaintenanceTickets: 1,
  contractsExpiringSoon: 2,
  revenueThisMonth: 64000000,
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
  { id: '1', icon: '⚠️', text: '2 hóa đơn quá hạn', route: 'ManagerBilling', color: '#EF4444' },
  { id: '2', icon: '🔧', text: '1 bảo trì khẩn cấp', route: 'ManagerMaintenance', color: '#F59E0B' },
  { id: '3', icon: '📋', text: '2 hợp đồng sắp hết hạn', route: 'ManagerContracts', color: '#3B82F6' },
];

const QUICK_ACTIONS = [
  { emoji: '🤝', label: 'Đón khách',  route: 'Onboarding',         color: Colors.primary },
  { emoji: '🧾', label: 'Hóa đơn',   route: 'ManagerBilling',      badge: 2, color: Colors.warning },
  { emoji: '🔧', label: 'Sửa chữa',  route: 'ManagerMaintenance',  badge: 4, color: Colors.error },
  { emoji: '🏠', label: 'Phòng',      route: 'RoomManage',          color: Colors.success },
  { emoji: '⚡', label: 'Chốt số',   route: 'MeterReading',        color: Colors.accent },
  { emoji: '📋', label: 'Hợp đồng',  route: 'ManagerContracts',    badge: 2, color: Colors.info },
  { emoji: '📦', label: 'Thiết bị',  route: 'Equipment',           color: Colors.textSecondary },
  { emoji: '👥', label: 'Khách thuê', route: 'TenantList',          color: Colors.primaryDark },
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

// ===================== MAIN =====================
export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const stats = MOCK_STATS;
  const occupancyRate = Math.round((stats.occupied / stats.totalRooms) * 100);

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

        {/* Alerts — compact pill row */}
        {MOCK_ALERTS.length > 0 && (
          <View style={styles.alertsRow}>
            {MOCK_ALERTS.map(alert => (
              <TouchableOpacity
                key={alert.id}
                style={[styles.alertPill, { borderColor: alert.color + '40', backgroundColor: alert.color + '0D' }]}
                onPress={() => navigation.navigate(alert.route)}
              >
                <Text style={styles.alertPillIcon}>{alert.icon}</Text>
                <Text style={[styles.alertPillText, { color: alert.color }]}>{alert.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Revenue + Profit */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statsCard}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.statsLabel}>Doanh thu T5</Text>
            <Text style={styles.statsValue}>{(stats.revenueThisMonth / 1_000_000).toFixed(1)}tr</Text>
            <Text style={styles.statsTrend}>▲ {stats.revenueTrend}%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statsCard, styles.statsCardAlt]}
            onPress={() => navigation.navigate('ManagerBilling')}
          >
            <Text style={styles.statsLabel}>Lợi nhuận</Text>
            <Text style={[styles.statsValue, { color: Colors.primary }]}>{(stats.profitThisMonth / 1_000_000).toFixed(1)}tr</Text>
            <Text style={[styles.statsTrend, { color: Colors.textMuted }]}>
              Chi: {(stats.expenseThisMonth / 1_000_000).toFixed(1)}tr
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a, i) => (
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

        {/* Managed Properties */}
        <Text style={styles.sectionTitle}>Toà nhà đang quản lý</Text>
        {MANAGED_PROPERTIES.map(prop => (
          <View key={prop.id} style={styles.propCard}>
            <View style={styles.propHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.propName}>{prop.name}</Text>
                <View style={styles.propAddressRow}>
                  <Text style={styles.propAddressIcon}>📍</Text>
                  <Text style={styles.propAddress}>{prop.address}</Text>
                </View>
              </View>
              <View style={styles.propFloorBadge}>
                <Text style={styles.propFloorText}>{prop.totalFloors} tầng</Text>
              </View>
            </View>

            <View style={styles.propRoomRow}>
              <View style={[styles.propRoomStat, { borderColor: Colors.success + '40', backgroundColor: Colors.success + '0D' }]}>
                <Text style={[styles.propRoomNum, { color: Colors.success }]}>{prop.occupied}</Text>
                <Text style={styles.propRoomLabel}>Đang thuê</Text>
              </View>
              <View style={[styles.propRoomStat, { borderColor: Colors.info + '40', backgroundColor: Colors.info + '0D' }]}>
                <Text style={[styles.propRoomNum, { color: Colors.info }]}>{prop.available}</Text>
                <Text style={styles.propRoomLabel}>Còn trống</Text>
              </View>
              {prop.maintenance > 0 && (
                <View style={[styles.propRoomStat, { borderColor: Colors.warning + '40', backgroundColor: Colors.warning + '0D' }]}>
                  <Text style={[styles.propRoomNum, { color: Colors.warning }]}>{prop.maintenance}</Text>
                  <Text style={styles.propRoomLabel}>Bảo trì</Text>
                </View>
              )}
              <View style={[styles.propRoomStat, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <Text style={styles.propRoomNum}>{prop.totalRooms}</Text>
                <Text style={styles.propRoomLabel}>Tổng phòng</Text>
              </View>
            </View>

            <View style={styles.propRatesRow}>
              <View style={styles.propRate}>
                <Text style={styles.propRateIcon}>⚡</Text>
                <Text style={styles.propRateValue}>{prop.electricityRate.toLocaleString('vi-VN')}đ/kWh</Text>
              </View>
              <Text style={styles.propRateSep}>·</Text>
              <View style={styles.propRate}>
                <Text style={styles.propRateIcon}>💧</Text>
                <Text style={styles.propRateValue}>{prop.waterRate.toLocaleString('vi-VN')}đ/m³</Text>
              </View>
              <Text style={styles.propRateSep}>·</Text>
              <View style={styles.propRate}>
                <Text style={styles.propRateIcon}>🏠</Text>
                <Text style={styles.propRateValue}>DV {(prop.serviceCharge / 1000).toFixed(0)}k/th</Text>
              </View>
            </View>

            <View style={styles.propFooter}>
              <Text style={styles.propHostLabel}>Chủ nhà: <Text style={styles.propHostName}>{prop.hostName}</Text></Text>
              <Text style={styles.propLeaseCost}>Thuê: {(prop.monthlyLeaseCost / 1_000_000).toFixed(0)}tr/tháng</Text>
            </View>
          </View>
        ))}

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
        </View>

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
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, marginTop: Spacing.xs },
  progressFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  bannerRight: { flex: 1, justifyContent: 'center', paddingLeft: Spacing.md },
  bannerStatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerStatText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  // Alerts compact
  alertsRow: { gap: Spacing.xs, marginBottom: Spacing.md },
  alertPill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    borderRadius: BorderRadius.lg, borderWidth: 1,
  },
  alertPillIcon: { fontSize: 14 },
  alertPillText: { fontSize: 12, fontWeight: '600', flex: 1 },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statsCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.md, ...Shadow.sm,
  },
  statsCardAlt: { borderWidth: 1, borderColor: Colors.primary + '20' },
  statsLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  statsValue: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  statsTrend: { fontSize: 11, fontWeight: '600', color: Colors.success, marginTop: 4 },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
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

  // Managed property cards
  propCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  propHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  propName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  propAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  propAddressIcon: { fontSize: 12, marginTop: 1 },
  propAddress: { fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  propFloorBadge: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, marginLeft: Spacing.sm,
  },
  propFloorText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  propRoomRow: {
    flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  propRoomStat: {
    flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  propRoomNum: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  propRoomLabel: { fontSize: 9, color: Colors.textSecondary, marginTop: 1, textAlign: 'center' },

  propRatesRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 6,
  },
  propRate: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  propRateIcon: { fontSize: 12 },
  propRateValue: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  propRateSep: { color: Colors.textMuted, fontSize: 14 },

  propFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  propHostLabel: { fontSize: 12, color: Colors.textSecondary },
  propHostName: { fontWeight: '700', color: Colors.textPrimary },
  propLeaseCost: { fontSize: 12, fontWeight: '700', color: Colors.primary },
});
