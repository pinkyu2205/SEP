import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius } from '../../constants';
import { useAuth } from '../../hooks';
import {
  MANAGED_PROPERTIES, getPropPriority, getPriorityMeta, getIssueCount,
} from '../../data/managedProperties';

// ── Mock data ──────────────────────────────────────────────────────────────

const PRIORITY_ITEMS = [
  { id: 'p1', icon: '🧾', label: 'Hóa đơn quá hạn',  count: 2, urgency: 'critical', color: Colors.error,   route: 'ManagerBilling' },
  { id: 'p2', icon: '🔧', label: 'Bảo trì khẩn cấp', count: 1, urgency: 'critical', color: Colors.error,   route: 'ManagerMaintenance' },
  { id: 'p3', icon: '⚡', label: 'Chốt điện nước',   count: 3, urgency: 'warning',  color: Colors.warning, route: 'MeterReading' },
  { id: 'p4', icon: '📋', label: 'HĐ sắp hết hạn',   count: 2, urgency: 'info',     color: Colors.info,    route: 'ManagerContracts' },
  { id: 'p5', icon: '🚪', label: 'Check-in hôm nay', count: 1, urgency: 'success',  color: Colors.success, route: 'Onboarding' },
];

const QUICK_ACTIONS = [
  { emoji: '🤝', label: 'Đón khách',  route: 'Onboarding',        color: Colors.primary,       badge: 0 },
  { emoji: '🧾', label: 'Hóa đơn',   route: 'ManagerBilling',     color: Colors.warning,       badge: 2 },
  { emoji: '🔧', label: 'Bảo trì',   route: 'ManagerMaintenance', color: Colors.error,         badge: 4 },
  { emoji: '⚡', label: 'Chốt số',   route: 'MeterReading',       color: Colors.accent,        badge: 0 },
  { emoji: '🏠', label: 'Phòng',     route: 'RoomManage',         color: Colors.success,       badge: 0 },
  { emoji: '👥', label: 'Khách thuê', route: 'TenantList',        color: Colors.primary,       badge: 0 },
  { emoji: '📦', label: 'Thiết bị',  route: 'Equipment',          color: Colors.textSecondary, badge: 0 },
  { emoji: '📋', label: 'Hợp đồng',  route: 'ManagerContracts',   color: Colors.info,          badge: 2 },
] as const;

const MOCK_STATS = {
  totalRooms: 20,
  occupied: 16,
  available: 3,
  maintenance: 1,
  totalDebt: 12500000,
  unreadNotifications: 6,
};

// ── Component ──────────────────────────────────────────────────────────────

export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const stats = MOCK_STATS;
  const occupancyRate = Math.round((stats.occupied / stats.totalRooms) * 100);

  const attentionBuildings = useMemo(
    () => [...MANAGED_PROPERTIES].sort((a, b) => getPropPriority(a) - getPropPriority(b)).slice(0, 3),
    [],
  );

  const activeItems    = PRIORITY_ITEMS.filter(p => p.count > 0);
  const criticalItems  = activeItems.filter(p => p.urgency === 'critical');
  const secondaryItems = activeItems.filter(p => p.urgency !== 'critical');
  const urgentTotal    = criticalItems.reduce((sum, p) => sum + p.count, 0);

  // Status sentence shown inside the hero card
  const heroStatusText  = urgentTotal > 0
    ? `${urgentTotal} việc cần xử lý ngay`
    : 'Hoạt động ổn định hôm nay';
  const heroStatusColor = urgentTotal > 0 ? '#FCD34D' : '#6EE7B7';

  const firstName = user?.fullName?.split(' ').pop() ?? 'Quản lý';
  const todayStr  = new Date().toLocaleDateString('vi-VN', {
    weekday: 'short', day: 'numeric', month: 'numeric',
  });

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerDate}>{todayStr}</Text>
            <Text style={s.headerName}>Chào, {firstName} 👋</Text>
          </View>
          <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('NotificationCenter')}>
            <Text style={s.notifIcon}>🔔</Text>
            {stats.unreadNotifications > 0 && (
              <View style={s.notifBadge}>
                <Text style={s.notifBadgeText}>
                  {stats.unreadNotifications > 9 ? '9+' : stats.unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Hero Analytics Card ────────────────────────────────────── */}
        {/*
          Depth achieved through three layers:
            1. Decorative circles (position:absolute, clipped by overflow:hidden)
            2. A progress bar that uses the accent colour as a "glow fill"
            3. A live status sentence that turns amber when issues exist
        */}
        <View style={s.hero}>

          {/* Background decoration — purely visual, no touch interception */}
          <View style={s.heroDecor1} pointerEvents="none" />
          <View style={s.heroDecor2} pointerEvents="none" />
          <View style={s.heroDecor3} pointerEvents="none" />

          {/* Label row */}
          <Text style={s.heroLabel}>
            TỔNG QUAN  ·  {MANAGED_PROPERTIES.length} toà  ·  {stats.totalRooms} phòng
          </Text>

          {/* Primary metric: occupancy % (dominant) + alert pill */}
          <View style={s.heroMetricRow}>
            <Text style={s.heroRate}>{occupancyRate}%</Text>
            {urgentTotal > 0 && (
              <View style={s.heroAlertPill}>
                <Text style={s.heroAlertPillText}>⚠ {urgentTotal} khẩn</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={s.heroProg}>
            <View style={[s.heroProgFill, { width: `${occupancyRate}%` as any }]} />
          </View>

          {/* Meta + live status — in one row for compactness */}
          <View style={s.heroMetaRow}>
            <Text style={s.heroMeta}>{stats.occupied}/{stats.totalRooms} phòng đang thuê</Text>
            <View style={[s.heroStatusDot, { backgroundColor: heroStatusColor }]} />
            <Text style={[s.heroStatusText, { color: heroStatusColor }]}>{heroStatusText}</Text>
          </View>

          {/* Hairline divider */}
          <View style={s.heroDivider} />

          {/* Secondary stats — clearly subordinate row */}
          <View style={s.heroStatsRow}>
            <View style={s.heroStatItem}>
              <Text style={s.heroStatNum}>{stats.occupied}</Text>
              <Text style={s.heroStatLbl}>Đang thuê</Text>
            </View>
            <View style={s.heroStatSep} />
            <View style={s.heroStatItem}>
              <Text style={[s.heroStatNum, { color: 'rgba(255,255,255,0.5)' }]}>{stats.available}</Text>
              <Text style={s.heroStatLbl}>Phòng trống</Text>
            </View>
            <View style={s.heroStatSep} />
            <View style={s.heroStatItem}>
              <Text style={[s.heroStatNum, { color: '#FCD34D' }]}>
                {(stats.totalDebt / 1_000_000).toFixed(1)}tr
              </Text>
              <Text style={s.heroStatLbl}>Công nợ</Text>
            </View>
          </View>

        </View>

        {/* ── Cần xử lý hôm nay ─────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Cần xử lý hôm nay</Text>
          {urgentTotal > 0 && (
            <View style={s.urgentPill}>
              <Text style={s.urgentPillText}>{urgentTotal} khẩn</Text>
            </View>
          )}
        </View>

        {activeItems.length === 0 ? (
          /* ── All clear state ── */
          <View style={s.clearCard}>
            <Text style={s.clearText}>✅  Mọi thứ ổn định hôm nay</Text>
          </View>
        ) : (
          <>
            {/* ── Featured critical cards (2-column grid) ──────────── */}
            {criticalItems.length > 0 && (
              <View style={s.featuredGrid}>
                {criticalItems.slice(0, 2).map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.featuredCard, {
                      backgroundColor : item.color + '0C',
                      borderColor     : item.color + '2E',
                    }]}
                    onPress={() => navigation.navigate(item.route)}
                    activeOpacity={0.72}
                  >
                    {/* Icon + count badge */}
                    <View style={s.featuredTop}>
                      <View style={[s.featuredIconWrap, { backgroundColor: item.color + '1A' }]}>
                        <Text style={s.featuredEmoji}>{item.icon}</Text>
                      </View>
                      <View style={[s.featuredCountBadge, { backgroundColor: item.color }]}>
                        <Text style={s.featuredCountText}>{item.count}</Text>
                      </View>
                    </View>

                    {/* Label */}
                    <Text style={s.featuredLabel} numberOfLines={2}>{item.label}</Text>

                    {/* CTA */}
                    <Text style={[s.featuredCta, { color: item.color }]}>Xử lý →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Secondary items — compact grouped list ────────────── */}
            {secondaryItems.length > 0 && (
              <View style={s.secondaryCard}>
                {secondaryItems.map((item, i) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.secondaryRow,
                      i < secondaryItems.length - 1 && s.secondaryRowBorder,
                    ]}
                    onPress={() => navigation.navigate(item.route)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.secondaryIconWrap, { backgroundColor: item.color + '14' }]}>
                      <Text style={s.secondaryEmoji}>{item.icon}</Text>
                    </View>
                    <Text style={s.secondaryLabel}>{item.label}</Text>
                    <View style={[s.secondaryBadge, { backgroundColor: item.color + '15' }]}>
                      <Text style={[s.secondaryBadgeText, { color: item.color }]}>{item.count}</Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Thao tác nhanh ────────────────────────────────────────── */}
        <View style={[s.sectionRow, { marginTop: Spacing.lg }]}>
          <Text style={s.sectionTitle}>Thao tác nhanh</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.actionsScroll}
          contentContainerStyle={s.actionsContent}
        >
          {QUICK_ACTIONS.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={s.actionChip}
              onPress={() => navigation.navigate(a.route)}
              activeOpacity={0.7}
            >
              <View style={[s.actionIconWrap, { backgroundColor: a.color + '15' }]}>
                <Text style={s.actionEmoji}>{a.emoji}</Text>
                {a.badge > 0 && (
                  <View style={s.actionBadge}>
                    <Text style={s.actionBadgeText}>{a.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Toà nhà cần chú ý ─────────────────────────────────────── */}
        <View style={[s.sectionRow, { marginTop: Spacing.lg }]}>
          <Text style={s.sectionTitle}>Cần chú ý</Text>
          <TouchableOpacity onPress={() => navigation.navigate('BuildingList')}>
            <Text style={s.sectionLink}>Xem tất cả →</Text>
          </TouchableOpacity>
        </View>

        {attentionBuildings.map(prop => {
          const isWholeHouse = prop.propertyType === 'WHOLE_HOUSE';
          const occ = isWholeHouse || prop.totalRooms === 0 ? 0 : Math.round((prop.occupied / prop.totalRooms) * 100);
          const { severity, color: borderColor } = getPriorityMeta(prop);
          const issues = getIssueCount(prop);
          const occColor = occ >= 80 ? Colors.success
            : occ >= 60 ? Colors.primary
            : occ >= 40 ? Colors.warning
            : Colors.error;

          return (
            <TouchableOpacity
              key={prop.id}
              style={[s.buildingCard, { borderLeftColor: borderColor ?? Colors.border }]}
              onPress={() => navigation.navigate(isWholeHouse ? 'WholeHouseDetail' : 'BuildingDetail', { propertyId: prop.id })}
              activeOpacity={0.7}
            >
              <View style={s.buildingInfo}>
                <Text style={s.buildingName} numberOfLines={1}>{prop.name}</Text>
                <Text style={s.buildingDistrict}>{isWholeHouse ? 'Nhà nguyên căn' : prop.district}</Text>
              </View>
              <View style={s.buildingStats}>
                <Text style={[s.buildingOcc, { color: isWholeHouse ? Colors.warning : occColor }]}>
                  {isWholeHouse ? (prop.rentalStatus === 'vacant' ? 'Trống' : 'Thuê') : `${occ}%`}
                </Text>
                {issues > 0 && (
                  <View style={[
                    s.buildingIssuePill,
                    { backgroundColor: severity === 'critical' ? Colors.errorLight : Colors.warningLight },
                  ]}>
                    <Text style={[
                      s.buildingIssueText,
                      { color: severity === 'critical' ? Colors.error : Colors.warning },
                    ]}>
                      {issues} vấn đề
                    </Text>
                  </View>
                )}
                <Text style={s.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── View All Buildings CTA ─────────────────────────────────── */}
        <TouchableOpacity
          style={s.viewAllBtn}
          onPress={() => navigation.navigate('BuildingList')}
          activeOpacity={0.8}
        >
          <Text style={s.viewAllText}>🏢  Quản lý tất cả toà nhà ({MANAGED_PROPERTIES.length})</Text>
          <Text style={s.viewAllArrow}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.base, paddingBottom: Spacing.md,
  },
  headerDate: { fontSize: 11, fontWeight: '400', color: Colors.textMuted, marginBottom: 3, letterSpacing: 0.1 },
  headerName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
  notifBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  notifIcon:      { fontSize: 16 },
  notifBadge:     {
    position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14,
    borderRadius: 7, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },

  // ── Hero Card ─────────────────────────────────────────────────────
  hero: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.base,
    paddingTop: 14,
    paddingBottom: 13,
    marginBottom: Spacing.lg,
    overflow: 'hidden',   // clips the decorative circles
    // Colour-matched shadow — avoids the generic grey smear
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },

  // Decorative background circles — absolute, clipped, touch-transparent
  heroDecor1: {
    position: 'absolute', top: -45, right: -35,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute', bottom: -20, right: 32,
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDecor3: {
    position: 'absolute', top: 18, right: 80,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  heroLabel: {
    fontSize: 9, fontWeight: '600',
    color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, marginBottom: 7,
  },

  heroMetricRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', marginBottom: 8,
  },
  heroRate: { fontSize: 36, fontWeight: '900', color: Colors.white, lineHeight: 40 },

  heroAlertPill: {
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 4, marginBottom: 2,
  },
  heroAlertPillText: { fontSize: 10, fontWeight: '700', color: Colors.white },

  heroProg: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2, marginBottom: 7,
  },
  heroProgFill: { height: 4, backgroundColor: Colors.accent, borderRadius: 2 },

  // Meta + live status sentence on one compact row
  heroMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginBottom: 11, flexWrap: 'wrap',
  },
  heroMeta: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '400' },
  heroStatusDot: { width: 5, height: 5, borderRadius: 2.5 },
  heroStatusText: { fontSize: 10, fontWeight: '600' },

  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 11 },

  heroStatsRow: { flexDirection: 'row', alignItems: 'center' },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatSep:  { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroStatNum:  { fontSize: 15, fontWeight: '700', color: Colors.white },
  heroStatLbl:  { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: '400', marginTop: 2 },

  // ── Section headers ───────────────────────────────────────────────
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.xs + 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sectionLink:  { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  urgentPill: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  urgentPillText: { fontSize: 10, fontWeight: '700', color: Colors.error },

  // ── Priority center: all-clear state ─────────────────────────────
  clearCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  clearText: { fontSize: 13, color: Colors.textSecondary },

  // ── Priority center: featured (critical) cards ────────────────────
  // Two-column grid; each card gets flex:1 so a single card fills full width.
  featuredGrid: {
    flexDirection: 'row', gap: 8, marginBottom: 8,
  },
  featuredCard: {
    flex: 1, borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: 11, paddingHorizontal: 11,
  },
  featuredTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 7,
  },
  featuredIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  featuredEmoji:      { fontSize: 14 },
  featuredCountBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  featuredCountText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  featuredLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textPrimary,
    lineHeight: 16, marginBottom: 5,
  },
  featuredCta: { fontSize: 11, fontWeight: '600' },

  // ── Priority center: secondary items list ─────────────────────────
  secondaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: Spacing.xs,
  },
  secondaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    gap: Spacing.md,
  },
  secondaryRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  secondaryIconWrap:  {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryEmoji:     { fontSize: 13 },
  secondaryLabel:     { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  secondaryBadge:     {
    minWidth: 22, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  secondaryBadgeText: { fontSize: 10, fontWeight: '700' },

  chevron: { fontSize: 15, color: Colors.textMuted },

  // ── Quick actions ─────────────────────────────────────────────────
  actionsScroll:  { flexGrow: 0, marginBottom: Spacing.xs },
  actionsContent: { paddingBottom: 2, gap: Spacing.sm },
  actionChip: {
    alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    paddingVertical: 6, paddingHorizontal: 9,
    borderWidth: 1, borderColor: Colors.border, minWidth: 56,
  },
  actionIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  actionEmoji:     { fontSize: 15 },
  actionBadge:     {
    position: 'absolute', top: -3, right: -3, minWidth: 14, height: 14,
    borderRadius: 7, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  actionBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },
  actionLabel:     { fontSize: 10, fontWeight: '500', color: Colors.textSecondary, textAlign: 'center' },

  // ── Building attention cards ──────────────────────────────────────
  buildingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: 13, paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
  },
  buildingInfo:      { flex: 1 },
  buildingName:      { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  buildingDistrict:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  buildingStats:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buildingOcc:       { fontSize: 13, fontWeight: '700' },
  buildingIssuePill: { borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 3 },
  buildingIssueText: { fontSize: 10, fontWeight: '600' },

  // ── View all CTA ──────────────────────────────────────────────────
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderWidth: 1, borderColor: Colors.primary + '28',
    marginTop: Spacing.xs,
  },
  viewAllText:  { fontSize: 13, fontWeight: '600', color: Colors.primary },
  viewAllArrow: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
});
