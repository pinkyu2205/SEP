import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';
import {
  MANAGED_PROPERTIES, getPropPriority, getPriorityMeta, getHealthSummary,
} from '../../data/managedProperties';

// ===================== MOCK DATA =====================

const CRITICAL_TASKS = [
  { id: 't2', icon: '🧾', label: 'Hóa đơn quá hạn', count: 2, color: '#EF4444', route: 'ManagerBilling' },
  { id: 't3', icon: '🔧', label: 'Bảo trì khẩn', count: 1, color: '#EF4444', route: 'ManagerMaintenance' },
  { id: 't6', icon: '📦', label: 'Check-out hôm nay', count: 0, color: '#EF4444', route: 'TenantList' },
];

const OPERATIONAL_TASKS = [
  { id: 't1', icon: '⚡', label: 'Chốt điện nước', count: 3, color: '#F59E0B', route: 'MeterReading' },
  { id: 't5', icon: '🚪', label: 'Check-in hôm nay', count: 1, color: '#10B981', route: 'Onboarding' },
  { id: 't4', icon: '📋', label: 'HĐ sắp hết hạn', count: 2, color: '#3B82F6', route: 'ManagerContracts' },
];

const OPERATIONAL_INDICATORS = [
  { id: 'o1', icon: '🏚️', label: 'Trống quá lâu', desc: '1 phòng >30 ngày', color: '#F59E0B', route: 'RoomManage' },
  { id: 'o2', icon: '💸', label: 'Trễ thanh toán', desc: '2 khách nợ cũ', color: '#EF4444', route: 'ManagerBilling' },
  { id: 'o3', icon: '🔔', label: 'Chờ duyệt bảo trì', desc: '1 yêu cầu mới', color: '#8B5CF6', route: 'ManagerMaintenance' },
];

const MOCK_STATS = {
  totalRooms: 20,
  occupied: 16,
  available: 3,
  maintenance: 1,
  totalDebt: 12500000,
  unreadNotifications: 6,
};

const PRIMARY_ACTIONS = [
  { emoji: '🤝', label: 'Đón khách',  route: 'Onboarding',        color: Colors.primary },
  { emoji: '🧾', label: 'Hóa đơn',   route: 'ManagerBilling',     badge: 2, color: '#F59E0B' },
  { emoji: '🔧', label: 'Bảo trì',   route: 'ManagerMaintenance', badge: 4, color: '#EF4444' },
  { emoji: '⚡', label: 'Chốt số',   route: 'MeterReading',       color: Colors.accent },
];

const SECONDARY_ACTIONS = [
  { emoji: '🏠', label: 'Phòng',     route: 'RoomManage',       color: Colors.success },
  { emoji: '📋', label: 'Hợp đồng',  route: 'ManagerContracts', badge: 2, color: Colors.info },
  { emoji: '📦', label: 'Thiết bị',  route: 'Equipment',        color: Colors.textSecondary },
  { emoji: '👥', label: 'Khách thuê', route: 'TenantList',       color: Colors.primary },
];

const BUILDING_FILTERS = [
  { id: 'all',         label: 'Tất cả' },
  { id: 'vacant',      label: '🚪 Phòng trống' },
  { id: 'maintenance', label: '🔧 Bảo trì' },
  { id: 'expiring',    label: '📋 HĐ sắp hết' },
  { id: 'unpaid',      label: '💸 Nợ tiền' },
  { id: 'utility',     label: '⚡ Thiếu chỉ số' },
];

// ===================== TASK CARDS =====================
type CriticalTask = typeof CRITICAL_TASKS[0];
type OperationalTask = typeof OPERATIONAL_TASKS[0];

const CriticalTaskCard: React.FC<{ task: CriticalTask; onPress: () => void }> = ({ task, onPress }) => {
  const active = task.count > 0;
  return (
    <TouchableOpacity
      style={[
        taskSt.card,
        active ? { borderLeftColor: task.color } : taskSt.cardEmpty,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[taskSt.iconWrap, { backgroundColor: active ? task.color + '15' : '#F3F4F6' }]}>
        <Text style={taskSt.icon}>{task.icon}</Text>
      </View>
      <Text style={[taskSt.count, { color: active ? task.color : '#C4C9D4' }]}>{task.count}</Text>
      <Text style={taskSt.label} numberOfLines={2}>{task.label}</Text>
    </TouchableOpacity>
  );
};

const OperationalTaskCard: React.FC<{ task: OperationalTask; onPress: () => void }> = ({ task, onPress }) => {
  const active = task.count > 0;
  return (
    <TouchableOpacity style={taskSt.opCard} onPress={onPress} activeOpacity={0.75}>
      <Text style={taskSt.opIcon}>{task.icon}</Text>
      <Text style={[taskSt.opCount, { color: active ? task.color : '#C4C9D4' }]}>{task.count}</Text>
      <Text style={taskSt.opLabel} numberOfLines={2}>{task.label}</Text>
    </TouchableOpacity>
  );
};

const taskSt = StyleSheet.create({
  card: {
    width: '30%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.sm, alignItems: 'center',
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
  },
  cardEmpty: { borderLeftColor: '#E5E7EB', backgroundColor: '#FAFAFA', opacity: 0.8 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  icon: { fontSize: 16 },
  count: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  label: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center', marginTop: 2, lineHeight: 14 },

  opCard: {
    width: '30%', backgroundColor: '#F8FAFC', borderRadius: BorderRadius.lg,
    padding: Spacing.sm, alignItems: 'center',
    borderWidth: 1, borderColor: '#EEF2F7',
  },
  opIcon: { fontSize: 18, marginBottom: 3 },
  opCount: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  opLabel: { fontSize: 10, fontWeight: '500', color: Colors.textMuted, textAlign: 'center', marginTop: 2, lineHeight: 14 },
});

// ===================== MAIN =====================
export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const stats = MOCK_STATS;
  const occupancyRate = Math.round((stats.occupied / stats.totalRooms) * 100);

  const [buildingFilter, setBuildingFilter] = useState('all');
  const [buildingSearch, setBuildingSearch] = useState('');
  const [showMoreActions, setShowMoreActions] = useState(false);

  const criticalActiveCount = CRITICAL_TASKS.filter(t => t.count > 0).length;

  const filteredProps = useMemo(() => {
    let props = [...MANAGED_PROPERTIES].sort((a, b) => getPropPriority(a) - getPropPriority(b));
    if (buildingSearch.trim()) {
      const q = buildingSearch.toLowerCase();
      props = props.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
      );
    }
    switch (buildingFilter) {
      case 'vacant':      return props.filter(p => p.available > 0);
      case 'maintenance': return props.filter(p => p.maintenance > 0);
      case 'expiring':    return props.filter(p => p.hasExpiringContracts);
      case 'unpaid':      return props.filter(p => p.hasUnpaidInvoices);
      case 'utility':     return props.filter(p => p.missingUtility);
      default:            return props;
    }
  }, [buildingFilter, buildingSearch]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName || 'Quản lý'}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('NotificationCenter')}>
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

        {/* Hero Banner — Property Operations Overview */}
        <View style={styles.banner}>

          {/* Top row: occupancy + status breakdown */}
          <View style={styles.bannerTopRow}>
            {/* Left: occupancy */}
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerLabel}>TỈ LỆ LẤP ĐẦY</Text>
              <Text style={styles.bannerValue}>{occupancyRate}%</Text>
              <Text style={styles.bannerSub}>{stats.occupied}/{stats.totalRooms} phòng đang thuê</Text>
              <Text style={styles.bannerMeta}>
                {MANAGED_PROPERTIES.length} tòa nhà  ·  {stats.totalRooms} phòng
              </Text>
            </View>

            {/* Right: room status breakdown */}
            <View style={styles.bannerRight}>
              <View style={styles.bannerStatRow}>
                <Text style={styles.bannerStatEmoji}>⚪</Text>
                <Text style={styles.bannerStatLabel}>Phòng trống</Text>
                <Text style={styles.bannerStatCount}>{stats.available}</Text>
              </View>
              <View style={styles.bannerStatRow}>
                <Text style={styles.bannerStatEmoji}>🟢</Text>
                <Text style={styles.bannerStatLabel}>Đang thuê</Text>
                <Text style={styles.bannerStatCount}>{stats.occupied}</Text>
              </View>
              <View style={styles.bannerStatRow}>
                <Text style={styles.bannerStatEmoji}>🟡</Text>
                <Text style={styles.bannerStatLabel}>Bảo trì</Text>
                <Text style={styles.bannerStatCount}>{stats.maintenance}</Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.bannerDivider} />

          {/* Bottom row: debt + progress bar */}
          <View style={styles.bannerBottomRow}>
            <View style={styles.bannerDebtSection}>
              <Text style={styles.bannerDebtLabel}>Công nợ cần thu</Text>
              <Text style={styles.bannerDebtVal}>{(stats.totalDebt / 1_000_000).toFixed(1)}tr</Text>
            </View>
            <View style={styles.bannerProgressSection}>
              <Text style={styles.bannerProgressLabel}>Tỉ lệ lấp đầy</Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${occupancyRate}%` }]} />
              </View>
              <Text style={styles.bannerProgressPct}>{occupancyRate}% · {stats.occupied}/{stats.totalRooms}</Text>
            </View>
          </View>

        </View>

        {/* Ưu tiên xử lý — Critical tasks */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ưu tiên xử lý</Text>
          {criticalActiveCount > 0 && (
            <View style={styles.criticalBadge}>
              <Text style={styles.criticalBadgeText}>{criticalActiveCount} cần xử lý</Text>
            </View>
          )}
        </View>
        <View style={styles.taskGrid}>
          {CRITICAL_TASKS.map(task => (
            <CriticalTaskCard key={task.id} task={task} onPress={() => navigation.navigate(task.route)} />
          ))}
        </View>

        {/* Công việc hôm nay — Operational tasks */}
        <Text style={[styles.sectionTitleSoft, { marginBottom: Spacing.sm }]}>Công việc hôm nay</Text>
        <View style={[styles.taskGrid, { marginBottom: Spacing.lg }]}>
          {OPERATIONAL_TASKS.map(task => (
            <OperationalTaskCard key={task.id} task={task} onPress={() => navigation.navigate(task.route)} />
          ))}
        </View>

        {/* Operational Indicators */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.indicatorsRow} contentContainerStyle={styles.indicatorsContent}>
          {OPERATIONAL_INDICATORS.map(ind => (
            <TouchableOpacity
              key={ind.id}
              style={[styles.indicatorCard, { borderColor: ind.color + '30' }]}
              onPress={() => navigation.navigate(ind.route)}
            >
              <Text style={styles.indicatorIcon}>{ind.icon}</Text>
              <View>
                <Text style={[styles.indicatorLabel, { color: ind.color }]}>{ind.label}</Text>
                <Text style={styles.indicatorDesc}>{ind.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quick Actions — Primary */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
          <TouchableOpacity onPress={() => setShowMoreActions(v => !v)}>
            <Text style={styles.sectionLink}>{showMoreActions ? 'Thu gọn' : 'Xem thêm'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsGrid}>
          {PRIMARY_ACTIONS.map((a, i) => (
            <TouchableOpacity key={i} style={styles.actionBtn} onPress={() => navigation.navigate(a.route)}>
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

        {/* Quick Actions — Secondary (toggled) */}
        {showMoreActions && (
          <View style={[styles.actionsGrid, { marginTop: Spacing.xs }]}>
            {SECONDARY_ACTIONS.map((a, i) => (
              <TouchableOpacity key={i} style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => navigation.navigate(a.route)}>
                <View style={[styles.actionIconWrap, { backgroundColor: a.color + '12' }]}>
                  <Text style={styles.actionEmoji}>{a.emoji}</Text>
                  {a.badge && a.badge > 0 ? (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionBadgeText}>{a.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.actionLabel, { color: Colors.textMuted }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Building Search + Filter */}
        <View style={[styles.sectionHeader, { marginTop: Spacing.xl }]}>
          <Text style={styles.sectionTitle}>Toà nhà đang quản lý</Text>
          <Text style={styles.sectionCount}>{filteredProps.length}/{MANAGED_PROPERTIES.length} toà</Text>
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            style={styles.searchBarInput}
            placeholder="Tìm theo tên, quận, địa chỉ..."
            placeholderTextColor={Colors.textMuted}
            value={buildingSearch}
            onChangeText={setBuildingSearch}
          />
          {buildingSearch.length > 0 && (
            <TouchableOpacity onPress={() => setBuildingSearch('')}>
              <Text style={styles.searchBarClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.bFilterRow} contentContainerStyle={styles.bFilterContent}>
          {BUILDING_FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.bFilterChip, buildingFilter === f.id && styles.bFilterChipActive]}
              onPress={() => setBuildingFilter(f.id)}
            >
              <Text style={[styles.bFilterText, buildingFilter === f.id && styles.bFilterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Building Cards */}
        {filteredProps.length === 0 ? (
          <View style={styles.emptyProps}>
            <Text style={styles.emptyPropsText}>Không tìm thấy toà nhà phù hợp</Text>
          </View>
        ) : filteredProps.map(prop => {
          const occ = Math.round((prop.occupied / prop.totalRooms) * 100);
          const occColor = occ >= 80 ? Colors.success : occ >= 60 ? Colors.primary : occ >= 40 ? '#F59E0B' : '#EF4444';
          const { severity, color: priorityColor } = getPriorityMeta(prop);
          const health = getHealthSummary(prop);

          return (
            <TouchableOpacity
              key={prop.id}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('BuildingDetail', { propertyId: prop.id })}
              style={[
                styles.propCard,
                priorityColor != null && { borderLeftWidth: 3, borderLeftColor: priorityColor },
                severity === 'critical' && styles.propCardCritical,
              ]}
            >
              {/* Header — name · address · floors */}
              <View style={styles.propHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.propNameRow}>
                    {priorityColor != null && <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />}
                    <Text style={styles.propName} numberOfLines={1}>{prop.name}</Text>
                  </View>
                  <Text style={styles.propAddress} numberOfLines={1}>{prop.address}</Text>
                </View>
                <View style={styles.propFloorBadge}>
                  <Text style={styles.propFloorText}>{prop.totalFloors} tầng</Text>
                </View>
              </View>

              {/* Occupancy bar */}
              <View style={styles.propOccRow}>
                <View style={styles.propOccBarBg}>
                  <View style={[styles.propOccBarFill, { width: `${occ}%`, backgroundColor: occColor }]} />
                </View>
                <Text style={[styles.propOccPct, { color: occColor }]}>{occ}%</Text>
              </View>

              {/* Room status — occupied · vacant · maintenance(if >0) */}
              <View style={styles.propRoomRow}>
                <View style={styles.propRoomStat}>
                  <Text style={[styles.propRoomNum, { color: Colors.success }]}>{prop.occupied}</Text>
                  <Text style={styles.propRoomLabel}>đang thuê</Text>
                </View>
                <View style={styles.propRoomSep} />
                <View style={styles.propRoomStat}>
                  <Text style={[styles.propRoomNum, { color: Colors.textSecondary }]}>{prop.available}</Text>
                  <Text style={styles.propRoomLabel}>trống</Text>
                </View>
                {prop.maintenance > 0 && (
                  <>
                    <View style={styles.propRoomSep} />
                    <View style={styles.propRoomStat}>
                      <Text style={[styles.propRoomNum, { color: '#F59E0B' }]}>{prop.maintenance}</Text>
                      <Text style={styles.propRoomLabel}>bảo trì</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Lightweight health summary + navigation affordance */}
              <View style={styles.propHealthRow}>
                <Text style={[styles.propHealthText, { color: health.color }]}>{health.label}</Text>
                <Text style={styles.propChevron}>Chi tiết ›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

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

  // Hero Banner
  banner: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, marginBottom: Spacing.xl,
  },
  bannerTopRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bannerLeft: { flex: 1.4 },
  bannerLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1 },
  bannerValue: { fontSize: 52, fontWeight: '900', color: Colors.white, marginTop: 2, lineHeight: 58 },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  bannerMeta: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontWeight: '500' },
  bannerRight: { flex: 1, justifyContent: 'center', paddingLeft: Spacing.md },
  bannerStatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  bannerStatEmoji: { fontSize: 13, width: 18 },
  bannerStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', flex: 1, fontWeight: '500' },
  bannerStatCount: { fontSize: 15, fontWeight: '800', color: Colors.white },
  bannerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: Spacing.md },
  bannerBottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  bannerDebtSection: { flex: 1 },
  bannerDebtLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 2 },
  bannerDebtVal: { fontSize: 22, fontWeight: '900', color: '#FCD34D' },
  bannerProgressSection: { flex: 1.6 },
  bannerProgressLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: 4 },
  progressBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  bannerProgressPct: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  sectionTitleSoft: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sectionCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  sectionLink: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  criticalBadge: {
    backgroundColor: '#FEE2E2', paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  criticalBadgeText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },

  taskGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },

  // Operational Indicators
  indicatorsRow: { flexGrow: 0, marginBottom: Spacing.lg },
  indicatorsContent: { paddingBottom: 4, gap: Spacing.sm },
  indicatorCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, ...Shadow.sm,
  },
  indicatorIcon: { fontSize: 18 },
  indicatorLabel: { fontSize: 12, fontWeight: '700' },
  indicatorDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  actionBtn: {
    width: '22%', alignItems: 'center', backgroundColor: Colors.white,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.background, elevation: 0, shadowOpacity: 0,
    borderWidth: 1, borderColor: Colors.border,
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

  // Building search + filter
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10,
    ...Shadow.sm, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  searchBarIcon: { fontSize: 16 },
  searchBarInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  searchBarClear: { fontSize: 14, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  bFilterRow: { flexGrow: 0, marginBottom: Spacing.md },
  bFilterContent: { paddingBottom: 4, gap: Spacing.sm },
  bFilterChip: {
    height: 32, justifyContent: 'center',
    paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  bFilterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  bFilterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  bFilterTextActive: { color: Colors.white },

  emptyProps: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyPropsText: { fontSize: 13, color: Colors.textMuted },

  // Building Cards
  propCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  propCardCritical: { backgroundColor: '#FFFBFB' },
  propHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  propNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  propName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, flexShrink: 1 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  propAddress: { fontSize: 12, color: Colors.textMuted },
  propFloorBadge: {
    backgroundColor: '#F1F5F9', paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, marginLeft: Spacing.sm,
  },
  propFloorText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  propOccRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  propOccBarBg: { flex: 1, height: 6, backgroundColor: '#F0F0F0', borderRadius: 3 },
  propOccBarFill: { height: 6, borderRadius: 3 },
  propOccPct: { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  propRoomRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  propRoomStat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  propRoomNum: { fontSize: 14, fontWeight: '800' },
  propRoomLabel: { fontSize: 11, color: Colors.textMuted },
  propRoomSep: { width: 1, height: 12, backgroundColor: Colors.divider },

  propHealthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  propHealthText: { fontSize: 12, fontWeight: '700' },
  propChevron: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
});
