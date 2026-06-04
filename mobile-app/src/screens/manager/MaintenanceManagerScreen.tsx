import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useTickets } from '../../store/maintenanceStore';
import { getPropertyById } from '../../data/managedProperties';

// ── Config ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  urgent: { label: '🚨 Khẩn cấp', color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: '🔴 Cao',       color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình',color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '🟢 Thấp',      color: '#10B981', bg: '#F0FDF4' },
} as const;

const STATUS_CONFIG = {
  pending:     { label: 'Chờ tiếp nhận', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  accepted:    { label: 'Đã tiếp nhận',  color: '#3B82F6', bg: '#EFF6FF', icon: '📋' },
  in_progress: { label: 'Đang xử lý',    color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧' },
  resolved:    { label: 'Hoàn tất',      color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  cancelled:   { label: 'Đã hủy',        color: '#6B7280', bg: '#F3F4F6', icon: '✕'  },
} as const;

const TODAY = '2026-05-21';

const daysBetween = (from: string) => {
  const ms = new Date(TODAY).getTime() - new Date(from).getTime();
  return Math.floor(ms / 86400000);
};

// ── Screen ──────────────────────────────────────────────────────────────────

export const MaintenanceManagerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const tickets = useTickets();

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  const stats = useMemo(() => {
    const open = tickets.filter(t => t.status !== 'resolved' && t.status !== 'cancelled');
    return {
      urgentOpen:   open.filter(t => t.priority === 'urgent').length,
      pendingNew:   tickets.filter(t => t.status === 'pending').length,
      inProgress:   tickets.filter(t => t.status === 'accepted' || t.status === 'in_progress').length,
      resolvedMonth:tickets.filter(t => t.status === 'resolved').length,
      slaAtRisk:    tickets.filter(t => t.status === 'pending' && daysBetween(t.createdAt) > 3).length,
      totalOpen:    open.length,
    };
  }, [tickets]);

  // Recent activity: last 4 tickets sorted by updatedAt desc
  const recentActivity = useMemo(() =>
    [...tickets]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 4),
    [tickets],
  );

  // Group by building, sorted by urgentOpen desc
  const buildingGroups = useMemo(() => {
    const map = new Map<string, { propertyId: string; propertyName: string; propertyType?: string; tickets: typeof tickets }>();
    tickets.forEach(t => {
      if (!map.has(t.propertyId)) {
        const prop = getPropertyById(t.propertyId);
        map.set(t.propertyId, {
          propertyId: t.propertyId,
          propertyName: t.propertyName,
          propertyType: prop?.propertyType || t.propertyType,
          tickets: [],
        });
      }
      map.get(t.propertyId)!.tickets.push(t);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aU = a.tickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length;
      const bU = b.tickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length;
      return bU - aU;
    });
  }, [tickets]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Bảo trì & Sửa chữa</Text>
          <Text style={s.subtitle}>Tháng 05/2026</Text>
        </View>

        {/* ── Stats row ────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.statsScroll} contentContainerStyle={s.statsContent}>
          <View style={[s.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[s.statNum, { color: Colors.error }]}>{stats.urgentOpen}</Text>
            <Text style={s.statLabel}>Khẩn cấp</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[s.statNum, { color: Colors.warning }]}>{stats.pendingNew}</Text>
            <Text style={s.statLabel}>Chờ tiếp nhận</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: '#8B5CF6' }]}>
            <Text style={[s.statNum, { color: '#8B5CF6' }]}>{stats.inProgress}</Text>
            <Text style={s.statLabel}>Đang xử lý</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.success }]}>
            <Text style={[s.statNum, { color: Colors.success }]}>{stats.resolvedMonth}</Text>
            <Text style={s.statLabel}>Hoàn tất T5</Text>
          </View>
          {stats.slaAtRisk > 0 && (
            <View style={[s.statCard, { borderTopColor: Colors.error, backgroundColor: Colors.errorLight }]}>
              <Text style={[s.statNum, { color: Colors.error }]}>{stats.slaAtRisk}</Text>
              <Text style={[s.statLabel, { color: Colors.error }]}>SLA vi phạm</Text>
            </View>
          )}
        </ScrollView>

        {/* ── SLA warning banner ───────────────────────────────────── */}
        {stats.slaAtRisk > 0 && (
          <View style={s.slaBanner}>
            <Text style={s.slaBannerIcon}>⚠️</Text>
            <Text style={s.slaBannerText}>
              {stats.slaAtRisk} ticket chờ tiếp nhận quá 3 ngày — cần xử lý ngay
            </Text>
          </View>
        )}

        {/* ── Recent Activity ──────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Hoạt động gần đây</Text>
          <View style={s.activityCard}>
            {recentActivity.map((t, i) => {
              const cfg       = STATUS_CONFIG[t.status];
              const priCfg    = PRIORITY_CONFIG[t.priority];
              const isLast    = i === recentActivity.length - 1;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[s.activityRow, !isLast && s.activityRowBorder]}
                  onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: t.id })}
                  activeOpacity={0.7}
                >
                  <View style={[s.activityDot, { backgroundColor: cfg.bg }]}>
                    <Text style={s.activityDotIcon}>{cfg.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.activityTopRow}>
                      <Text style={s.activityCode}>{t.ticketCode}</Text>
                      <View style={[s.activityPriBadge, { backgroundColor: priCfg.bg }]}>
                        <Text style={[s.activityPriText, { color: priCfg.color }]}>{priCfg.label}</Text>
                      </View>
                    </View>
                    <Text style={s.activityTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={s.activityMeta}>{t.propertyName} · {t.propertyType === 'WHOLE_HOUSE' ? 'Toàn bộ nhà' : t.roomName} · {t.updatedAt}</Text>
                  </View>
                  <View style={[s.activityStatus, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.activityStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Buildings section ────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Theo bất động sản</Text>
            <Text style={s.sectionCount}>{buildingGroups.length} tài sản</Text>
          </View>

          {buildingGroups.map(group => {
            const open      = group.tickets.filter(t => t.status !== 'resolved' && t.status !== 'cancelled');
            const urgent    = open.filter(t => t.priority === 'urgent');
            const inProg    = group.tickets.filter(t => t.status === 'in_progress' || t.status === 'accepted');
            const resolved  = group.tickets.filter(t => t.status === 'resolved');
            const pending   = group.tickets.filter(t => t.status === 'pending');
            const slaRisk   = pending.filter(t => daysBetween(t.createdAt) > 3);
            const total     = group.tickets.length;
            const doneRate  = total > 0 ? Math.round((resolved.length / total) * 100) : 100;

            const healthColor = urgent.length > 0 ? Colors.error
              : slaRisk.length > 0 ? Colors.warning
              : pending.length > 0 ? Colors.warning
              : Colors.success;
            const healthLabel = urgent.length > 0 ? '🔴 Khẩn cấp'
              : slaRisk.length > 0 ? '🟠 SLA vi phạm'
              : pending.length > 0 ? '🟡 Có ticket mới'
              : '🟢 Ổn định';

            return (
              <TouchableOpacity
                key={group.propertyId}
                style={[s.buildingCard, urgent.length > 0 && s.buildingCardUrgent]}
                onPress={() => navigation.navigate('BuildingMaintenance', {
                  propertyId: group.propertyId,
                  propertyName: group.propertyName,
                })}
                activeOpacity={0.75}
              >
                {/* Name row */}
                <View style={s.buildingCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.buildingName}>{group.propertyName}</Text>
                    <Text style={s.propertyTypeText}>
                      {group.propertyType === 'WHOLE_HOUSE' ? 'Nhà nguyên căn · bảo trì toàn nhà/thiết bị' : 'Toà nhà nhiều phòng · theo phòng'}
                    </Text>
                    <View style={[s.healthPill, { backgroundColor: healthColor + '18' }]}>
                      <Text style={[s.healthText, { color: healthColor }]}>{healthLabel}</Text>
                    </View>
                  </View>
                  {urgent.length > 0 && (
                    <View style={s.urgentBadge}>
                      <Text style={s.urgentBadgeText}>🚨 {urgent.length}</Text>
                    </View>
                  )}
                  <Text style={s.buildingArrow}>›</Text>
                </View>

                {/* Stats */}
                <View style={s.buildingStats}>
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: open.length > 0 ? Colors.warning : Colors.textMuted }]}>
                      {open.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Đang mở</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: pending.length > 0 ? Colors.warning : Colors.textMuted }]}>
                      {pending.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Chờ nhận</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: inProg.length > 0 ? '#8B5CF6' : Colors.textMuted }]}>
                      {inProg.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Xử lý</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: Colors.success }]}>{resolved.length}</Text>
                    <Text style={s.buildingStatLbl}>Hoàn tất</Text>
                  </View>
                </View>

                {/* Progress */}
                <View style={s.progRow}>
                  <View style={s.progBg}>
                    <View style={[s.progFill, {
                      width: `${doneRate}%` as any,
                      backgroundColor: doneRate === 100 ? Colors.success : doneRate >= 50 ? Colors.warning : Colors.error,
                    }]} />
                  </View>
                  <Text style={s.progPct}>{doneRate}% hoàn tất</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base },

  header:   { paddingTop: Spacing.md, paddingBottom: Spacing.base },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  statsScroll:  { flexGrow: 0, marginBottom: Spacing.md },
  statsContent: { paddingVertical: 4, gap: Spacing.sm },
  statCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderTopWidth: 3, ...Shadow.sm, minWidth: 82, alignItems: 'center',
  },
  statNum:   { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  slaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '30',
  },
  slaBannerIcon: { fontSize: 18 },
  slaBannerText: { fontSize: 13, fontWeight: '600', color: Colors.error, flex: 1 },

  section:          { marginBottom: Spacing.lg },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionTitle:     { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionCount:     { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  activityCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  activityRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: 12 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  activityDot:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activityDotIcon:   { fontSize: 16 },
  activityTopRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  activityCode:      { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.3 },
  activityPriBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  activityPriText:   { fontSize: 9, fontWeight: '700' },
  activityTitle:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  activityMeta:      { fontSize: 11, color: Colors.textMuted },
  activityStatus:    { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  activityStatusText:{ fontSize: 10, fontWeight: '700' },

  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  buildingCardUrgent: { borderColor: Colors.error + '60', borderLeftWidth: 3, borderLeftColor: Colors.error },

  buildingCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  buildingName:       { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  propertyTypeText:   { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  healthPill:         { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  healthText:         { fontSize: 10, fontWeight: '700' },
  urgentBadge:        {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, marginRight: Spacing.sm,
  },
  urgentBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.error },
  buildingArrow:   { fontSize: 22, color: Colors.textMuted, fontWeight: '300', marginTop: 2 },

  buildingStats:    { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  buildingStat:     { flex: 1, alignItems: 'center' },
  buildingStatNum:  { fontSize: 17, fontWeight: '800' },
  buildingStatLbl:  { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  statSep:          { width: 1, height: 28, backgroundColor: Colors.divider },

  progRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg:   { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5 },
  progFill: { height: 5, borderRadius: 2.5 },
  progPct:  { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, minWidth: 72 },
});
