import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';
import { formatCurrency, getDaysUntil } from '../../utils';

// ── Mock data ──────────────────────────────────────────────
const BUILDING_INFO = {
  name: 'Nhà Nguyễn Trãi',
  address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
  totalFloors: 3,
  totalRooms: 8,
  electricityRate: 3500,    // đ/kWh — do host cài đặt
  waterRate: 15000,         // đ/m³  — do host cài đặt
  serviceCharge: 100000,    // đ/tháng — do host cài đặt
  hostName: 'Nguyễn Văn Host',
  hostPhone: '0901000001',
};

type InvoiceStatus = 'pending' | 'overdue' | 'awaiting' | 'paid';

const MONTHLY_INVOICE = {
  id: 'inv-may-2026',
  period: 'T05/2026',
  dueDate: '2026-05-25',
  status: 'pending' as InvoiceStatus,
  total: 3855000,
  breakdown: [
    { icon: '🏠', label: 'Tiền nhà',       amount: 3000000 },
    { icon: '⚡', label: 'Điện',            amount: 525000  },
    { icon: '💧', label: 'Nước',            amount: 180000  },
    { icon: '🧾', label: 'Phí dịch vụ',    amount: 150000  },
  ],
};

const INV_STATUS_CFG: Record<InvoiceStatus, { label: string; badge: string; amount: string; cta: string }> = {
  pending:  { label: 'Chưa thanh toán', badge: Colors.warning, amount: Colors.textPrimary, cta: Colors.primary },
  overdue:  { label: 'Quá hạn',         badge: Colors.error,   amount: Colors.error,       cta: Colors.error   },
  awaiting: { label: 'Chờ xác nhận',    badge: Colors.info,    amount: Colors.textPrimary, cta: Colors.info    },
  paid:     { label: 'Đã thanh toán',   badge: Colors.success, amount: Colors.success,     cta: Colors.success },
};

const DASHBOARD_DATA = {
  room: { name: 'Phòng 201', property: BUILDING_INFO.name, floor: 2, area: 25 },
  contract: { code: 'HD-MT-2025-001', endDate: '2026-12-31', daysLeft: getDaysUntil('2026-12-31') },
  depositAmount: 7000000,
  maintenance: { pending: 1, inProgress: 1 },
  unreadNotifications: 3,
};

const QUICK_ACTIONS = [
  { emoji: '📄', label: 'Hóa đơn',    route: 'InvoiceList',      badge: 1, color: Colors.primary,       primary: true  },
  { emoji: '🔧', label: 'Sửa chữa',   route: 'MaintenanceList',  badge: 1, color: Colors.warning,       primary: true  },
  { emoji: '📱', label: 'Thiết bị',   route: 'RoomEquipment',    badge: 0, color: '#0EA5E9',            primary: true  },
  { emoji: '📋', label: 'Hợp đồng',   route: 'TenantContracts',  badge: 0, color: Colors.info,          primary: false },
  { emoji: '💳', label: 'Lịch sử TT', route: 'PaymentHistory',   badge: 0, color: Colors.success,       primary: false },
  { emoji: '📷', label: 'Quét QR',    route: 'Scan',             badge: 0, color: Colors.accent,        primary: false },
  { emoji: '🏠', label: 'Bàn giao',   route: 'TenantOnboarding', badge: 0, color: Colors.textSecondary, primary: false },
  { emoji: '🚪', label: 'Trả phòng',  route: 'RequestCheckout',  badge: 0, color: '#DC2626',            primary: false },
  { emoji: '👤', label: 'Hồ sơ',      route: 'Profile',          badge: 0, color: Colors.primaryDark,   primary: false },
];

// ── Component ──────────────────────────────────────────────
export const TenantHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const data = DASHBOARD_DATA;
  const inv = MONTHLY_INVOICE;
  const invCfg = INV_STATUS_CFG[inv.status];
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded]     = useState(false);

  const isOverdue           = inv.status === 'overdue';
  const hasMaintenance      = data.maintenance.pending > 0 || data.maintenance.inProgress > 0;
  const contractExpiringSoon = data.contract.daysLeft <= 60;

  const alerts = [
    isOverdue        && { id: 'overdue',  icon: '🚨', text: `Hóa đơn T05/2026 quá hạn — ${inv.total.toLocaleString('vi-VN')}đ`,         route: 'InvoiceList',     color: Colors.error   },
    hasMaintenance   && { id: 'maint',    icon: '🔧', text: `${data.maintenance.pending} chờ xử lý · ${data.maintenance.inProgress} đang sửa`, route: 'MaintenanceList', color: Colors.warning },
    contractExpiringSoon && { id: 'contract', icon: '📋', text: `Hợp đồng còn ${data.contract.daysLeft} ngày`,                            route: 'TenantContracts', color: Colors.info    },
  ].filter(Boolean) as { id: string; icon: string; text: string; route: string; color: string }[];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName ?? 'Khách thuê'}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('TenantNotifications')}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
            {data.unreadNotifications > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{data.unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Room Banner */}
        <View style={styles.roomCard}>
          <View style={styles.roomTop}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.roomLabel}>PHÒNG CỦA BẠN</Text>
              <Text style={styles.roomName}>{data.room.name}</Text>
              <Text style={styles.roomProperty}>{data.room.property}</Text>
              <View style={styles.addressRow}>
                <Text style={styles.addressIcon}>📍</Text>
                <Text style={styles.addressText} numberOfLines={2}>{BUILDING_INFO.address}</Text>
              </View>
            </View>
            <View style={styles.roomStats}>
              <View style={styles.roomStatRow}>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>{data.room.area}m²</Text>
                  <Text style={styles.roomStatLabel}>Diện tích</Text>
                </View>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>Tầng {data.room.floor}</Text>
                  <Text style={styles.roomStatLabel}>Vị trí</Text>
                </View>
              </View>
              <View style={[styles.roomStatRow, { marginTop: 8 }]}>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>{BUILDING_INFO.totalFloors} tầng</Text>
                  <Text style={styles.roomStatLabel}>Tòa nhà</Text>
                </View>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>{formatCurrency(data.depositAmount).replace(' đ', 'đ')}</Text>
                  <Text style={styles.roomStatLabel}>Tiền cọc</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.contractBar}>
            <Text style={styles.contractBarText}>📋 HĐ {data.contract.code}</Text>
            <Text style={[styles.contractBarDays, contractExpiringSoon && { color: '#FCD34D' }]}>
              {contractExpiringSoon ? '⚠️ ' : ''}{data.contract.daysLeft} ngày
            </Text>
          </View>
        </View>

        {/* Building info card — thông tin do host/admin cài đặt */}
        <View style={styles.buildingCard}>
          <View style={styles.buildingCardHeader}>
            <Text style={styles.buildingCardTitle}>🏢 Thông tin tòa nhà</Text>
            <Text style={styles.buildingCardSub}>Cài đặt bởi Host</Text>
          </View>
          <View style={styles.buildingAddressRow}>
            <Text style={styles.buildingAddressIcon}>📍</Text>
            <Text style={styles.buildingAddress}>{BUILDING_INFO.address}</Text>
          </View>
          <View style={styles.buildingRatesRow}>
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateIcon}>⚡</Text>
              <Text style={styles.buildingRateValue}>{BUILDING_INFO.electricityRate.toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.buildingRateLabel}>/ kWh</Text>
            </View>
            <View style={styles.buildingRateDivider} />
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateIcon}>💧</Text>
              <Text style={styles.buildingRateValue}>{BUILDING_INFO.waterRate.toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.buildingRateLabel}>/ m³</Text>
            </View>
            <View style={styles.buildingRateDivider} />
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateIcon}>🏠</Text>
              <Text style={styles.buildingRateValue}>{(BUILDING_INFO.serviceCharge / 1000).toFixed(0)}k</Text>
              <Text style={styles.buildingRateLabel}>Dịch vụ/tháng</Text>
            </View>
          </View>
          <View style={styles.buildingHostRow}>
            <Text style={styles.buildingHostLabel}>Chủ nhà: </Text>
            <Text style={styles.buildingHostName}>{BUILDING_INFO.hostName}</Text>
            <Text style={styles.buildingHostPhone}>  {BUILDING_INFO.hostPhone}</Text>
          </View>
        </View>

        {/* Alert pills */}
        {alerts.length > 0 && (
          <View style={styles.alertsCol}>
            {alerts.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[styles.alertPill, { borderColor: a.color + '40', backgroundColor: a.color + '0D' }]}
                onPress={() => navigation.navigate(a.route)}
              >
                <Text style={styles.alertPillIcon}>{a.icon}</Text>
                <Text style={[styles.alertPillText, { color: a.color }]}>{a.text}</Text>
                <Text style={[styles.alertPillArrow, { color: a.color }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Monthly Invoice Card ── */}
        <Text style={styles.sectionTitle}>Hóa đơn cần thanh toán</Text>
        <View style={[styles.invCard, isOverdue && styles.invCardOverdue]}>

          {/* Top: total + status badge */}
          <View style={styles.invTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invTotalLabel}>Tổng cần thanh toán</Text>
              <Text style={[styles.invTotalAmount, { color: invCfg.amount }]}>
                {formatCurrency(inv.total)}
              </Text>
            </View>
            <View style={[styles.invStatusBadge, { backgroundColor: invCfg.badge }]}>
              <Text style={styles.invStatusText}>{invCfg.label}</Text>
            </View>
          </View>

          {/* Meta */}
          <View style={styles.invMeta}>
            <Text style={styles.invMetaItem}>
              <Text style={styles.invMetaKey}>📅 Kỳ hóa đơn  </Text>
              <Text style={styles.invMetaVal}>{inv.period}</Text>
            </Text>
            <Text style={styles.invMetaItem}>
              <Text style={styles.invMetaKey}>⏰ Hạn thanh toán  </Text>
              <Text style={[styles.invMetaVal, isOverdue && { color: Colors.error, fontWeight: '700' }]}>
                {inv.dueDate.split('-').reverse().join('/')}
              </Text>
            </Text>
          </View>

          <View style={styles.invDivider} />

          {/* Collapsible breakdown */}
          <TouchableOpacity
            style={styles.invBreakdownToggle}
            onPress={() => setBreakdownExpanded(e => !e)}
            activeOpacity={0.7}
          >
            <Text style={styles.invBreakdownLabel}>Chi tiết gồm có</Text>
            <Text style={styles.invBreakdownArrow}>{breakdownExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {breakdownExpanded && (
            <View style={styles.invBreakdown}>
              {inv.breakdown.map((row, idx) => (
                <View key={idx} style={styles.invBreakdownRow}>
                  <Text style={styles.invBdIcon}>{row.icon}</Text>
                  <Text style={styles.invBdLabel}>{row.label}</Text>
                  <View style={styles.invBdDots} />
                  <Text style={styles.invBdAmount}>{row.amount.toLocaleString('vi-VN')}đ</Text>
                </View>
              ))}
            </View>
          )}

          {/* CTA */}
          {inv.status !== 'paid' && (
            <TouchableOpacity
              style={[styles.invCTA, { backgroundColor: invCfg.cta }]}
              onPress={() => navigation.navigate('InvoiceList')}
              activeOpacity={0.85}
            >
              <Text style={styles.invCTAText}>
                {isOverdue ? '🚨 Thanh toán ngay' : 'Xem chi tiết & Thanh toán'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        </View>
        <View style={styles.actionsGrid}>
          {(actionsExpanded ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 4)).map((a, i) => (
            <TouchableOpacity
              key={i}
              style={styles.actionBtn}
              onPress={() => navigation.navigate(a.route)}
              activeOpacity={0.75}
            >
              <View style={[
                styles.actionIconWrap,
                { backgroundColor: a.color + (a.primary ? '1A' : '0F') },
              ]}>
                <Text style={styles.actionEmoji}>{a.emoji}</Text>
                {a.badge > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{a.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.actionLabel, !a.primary && styles.actionLabelSecondary]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.actionsToggle}
          onPress={() => setActionsExpanded(e => !e)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionsToggleText}>
            {actionsExpanded ? 'Thu gọn ▲' : `Xem thêm ▼`}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.lg },
  greeting: { fontSize: 13, color: Colors.textSecondary },
  userName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  notifBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  notifBadge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notifBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  // Room card
  roomCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: Spacing.md, backgroundColor: 'rgba(79,70,229,0.95)', padding: Spacing.lg, ...Shadow.md },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  roomLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  roomName: { fontSize: 26, fontWeight: '800', color: Colors.white, marginTop: 2 },
  roomProperty: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5, gap: 3 },
  addressIcon: { fontSize: 11, marginTop: 1 },
  addressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1, lineHeight: 16 },
  roomStats: { alignItems: 'flex-end', gap: 6 },
  roomStatRow: { flexDirection: 'row', gap: 16, justifyContent: 'flex-end' },
  roomStat: { alignItems: 'flex-end' },
  roomStatValue: { fontSize: 13, fontWeight: '700', color: Colors.white },
  roomStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  contractBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  contractBarText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  contractBarDays: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // Building info card
  buildingCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  buildingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  buildingCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  buildingCardSub: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  buildingAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  buildingAddressIcon: { fontSize: 13, marginTop: 1 },
  buildingAddress: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500', flex: 1, lineHeight: 18 },
  buildingRatesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  buildingRate: { flex: 1, alignItems: 'center', gap: 2 },
  buildingRateIcon: { fontSize: 16 },
  buildingRateValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  buildingRateLabel: { fontSize: 10, color: Colors.textMuted },
  buildingRateDivider: { width: 1, height: 36, backgroundColor: Colors.divider },
  buildingHostRow: { flexDirection: 'row', alignItems: 'center' },
  buildingHostLabel: { fontSize: 12, color: Colors.textSecondary },
  buildingHostName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  buildingHostPhone: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  // Alerts
  alertsCol: { gap: Spacing.xs, marginBottom: Spacing.md },
  alertPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 9, borderRadius: BorderRadius.lg, borderWidth: 1 },
  alertPillIcon: { fontSize: 14 },
  alertPillText: { flex: 1, fontSize: 12, fontWeight: '600' },
  alertPillArrow: { fontSize: 20, fontWeight: '400' },

  // ── Unified Invoice Card ──
  invCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm,
  },
  invCardOverdue: { borderColor: Colors.error + '60' },
  invTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  invTotalLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  invTotalAmount: { fontSize: 26, fontWeight: '800' },
  invStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full, marginTop: 4 },
  invStatusText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  invMeta: { gap: 3, marginBottom: Spacing.sm },
  invMetaItem: { fontSize: 12, lineHeight: 18 },
  invMetaKey: { color: Colors.textMuted },
  invMetaVal: { color: Colors.textPrimary, fontWeight: '600' },
  invDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.sm },
  invBreakdownToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  invBreakdownLabel: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  invBreakdownArrow: { fontSize: 10, color: Colors.textMuted },
  invBreakdown: { paddingTop: Spacing.sm, gap: 6 },
  invBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invBdIcon:   { fontSize: 14, width: 20, textAlign: 'center' },
  invBdLabel:  { fontSize: 12, color: Colors.textSecondary },
  invBdDots:   { flex: 1, height: 1, borderBottomWidth: 1, borderBottomColor: Colors.divider, borderStyle: 'dashed' },
  invBdAmount: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  invCTA: {
    marginTop: Spacing.base, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  invCTAText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // ── Quick Actions ──
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  actionBtn: {
    width: '22%', alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 10, paddingHorizontal: 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border + '80',
    ...Shadow.sm,
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  actionEmoji: { fontSize: 18 },
  actionBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 14, height: 14, borderRadius: 7,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  actionBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },
  actionLabel: { fontSize: 9.5, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  actionLabelSecondary: { fontWeight: '500', color: Colors.textMuted },
  actionsToggle: {
    alignSelf: 'center', paddingVertical: 6, paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  actionsToggleText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
