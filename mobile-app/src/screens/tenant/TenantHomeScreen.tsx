import React from 'react';
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

const DASHBOARD_DATA = {
  room: { name: 'Phòng 201', property: BUILDING_INFO.name, floor: 2, area: 25 },
  contract: { code: 'HD-MT-2025-001', endDate: '2026-12-31', daysLeft: getDaysUntil('2026-12-31') },
  depositAmount: 7000000,
  invoices: [
    { id: 'inv-1', type: 'rent', month: 5, year: 2026, total: 3500000, status: 'pending' as const, dueDate: '2026-05-15' },
    { id: 'inv-2', type: 'electricity', month: 4, year: 2026, total: 205000, status: 'overdue' as const, dueDate: '2026-05-05' },
    { id: 'inv-3', type: 'water', month: 4, year: 2026, total: 150000, status: 'paid' as const, dueDate: '2026-05-05' },
  ],
  overdueInvoices: 1,
  overdueAmount: 3855000,
  maintenance: { pending: 1, inProgress: 1 },
  unreadNotifications: 3,
};

const QUICK_ACTIONS = [
  { emoji: '📄', label: 'Hóa đơn',   route: 'InvoiceList',    badge: 1,   color: Colors.primary   },
  { emoji: '🔧', label: 'Sửa chữa',  route: 'MaintenanceList', badge: 1,   color: Colors.warning   },
  { emoji: '📋', label: 'Hợp đồng',  route: 'TenantContracts', badge: 0,   color: Colors.info      },
  { emoji: '💳', label: 'Lịch sử TT', route: 'PaymentHistory', badge: 0,   color: Colors.success   },
  { emoji: '📷', label: 'Quét QR',   route: 'Scan',            badge: 0,   color: Colors.accent    },
  { emoji: '🏠', label: 'Bàn giao',  route: 'TenantOnboarding', badge: 0,  color: Colors.textSecondary },
  { emoji: '👤', label: 'Hồ sơ',     route: 'Profile',          badge: 0,  color: Colors.primaryDark },
];

// ── Component ──────────────────────────────────────────────
export const TenantHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const data = DASHBOARD_DATA;

  const hasOverdue          = data.overdueInvoices > 0;
  const hasMaintenance      = data.maintenance.pending > 0 || data.maintenance.inProgress > 0;
  const contractExpiringSoon = data.contract.daysLeft <= 60;

  const alerts = [
    hasMaintenance   && { id: 'maint',    icon: '🔧', text: `${data.maintenance.pending} chờ xử lý · ${data.maintenance.inProgress} đang sửa`,  route: 'MaintenanceList', color: Colors.warning },
    contractExpiringSoon && { id: 'contract', icon: '📋', text: `Hợp đồng còn ${data.contract.daysLeft} ngày`,                                    route: 'TenantContracts', color: Colors.info    },
  ].filter(Boolean) as { id: string; icon: string; text: string; route: string; color: string }[];

  const getInvoiceConfig = (type: string) => {
    switch(type) {
      case 'electricity': return { label: 'Tiền điện', icon: '⚡', color: Colors.warning };
      case 'water': return { label: 'Tiền nước', icon: '💧', color: Colors.info };
      case 'rent': return { label: 'Tiền nhà', icon: '🏠', color: Colors.primary };
      default: return { label: 'Hóa đơn', icon: '📄', color: Colors.textSecondary };
    }
  };

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

        {/* Invoices List */}
        <Text style={styles.sectionTitle}>Hóa đơn cần thanh toán</Text>
        {data.invoices.map((invoice) => {
          const config = getInvoiceConfig(invoice.type);
          const isOverdue = invoice.status === 'overdue';
          const isPaid = invoice.status === 'paid';
          
          let statusColor = config.color;
          if (isOverdue) statusColor = Colors.error;
          if (isPaid) statusColor = Colors.success;

          return (
            <TouchableOpacity
              key={invoice.id}
              style={[styles.invoiceCard, { borderColor: statusColor + '50' }]}
              onPress={() => navigation.navigate('InvoiceList')}
              activeOpacity={0.8}
            >
              <View style={styles.invoiceRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.invoiceIconBox, { backgroundColor: statusColor + '15' }]}>
                    <Text style={styles.invoiceIconText}>{config.icon}</Text>
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.invoiceLabel}>
                      {config.label} T{String(invoice.month).padStart(2,'0')}/{invoice.year}
                    </Text>
                    <Text style={[styles.invoiceAmount, { color: statusColor }]}>
                      {formatCurrency(invoice.total)}
                    </Text>
                  </View>
                </View>
                
                <View style={[styles.invoiceStatusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.invoiceStatusText}>
                    {isOverdue ? 'Quá hạn' : isPaid ? 'Đã TT' : 'Chờ TT'}
                  </Text>
                </View>
              </View>
              
              {!isPaid && (
                <View style={[styles.invoiceBtn, { backgroundColor: statusColor }]}>
                  <Text style={styles.invoiceBtnText}>
                    {isOverdue ? '🚨 Thanh toán ngay' : '💳 Xem & Thanh toán'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

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
                {a.badge > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>{a.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

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

  // Invoice List
  invoiceCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, borderWidth: 1.5, ...Shadow.sm },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  invoiceIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  invoiceIconText: { fontSize: 24 },
  invoiceLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', marginBottom: 2 },
  invoiceAmount: { fontSize: 20, fontWeight: '800' },
  invoiceStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  invoiceStatusText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  invoiceBtn: { borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  invoiceBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { width: '22%', alignItems: 'center', backgroundColor: Colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm },
  actionIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  actionEmoji: { fontSize: 22 },
  actionBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  actionBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },
  actionLabel: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
});
