import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';
import { formatCurrency, getDaysUntil, formatRelativeTime } from '../../utils';

// Dữ liệu mẫu tổng hợp dashboard — sẽ thay bằng API
const DASHBOARD_DATA = {
  room: {
    name: 'Phòng 201',
    property: 'Nhà 15 Nguyễn Trãi',
    floor: 2,
    area: 25,
    moveInDate: '2026-01-01',
  },
  contract: {
    code: 'HD-MT-2025-001',
    endDate: '2026-12-31',
    status: 'active',
    daysLeft: getDaysUntil('2026-12-31'),
  },
  currentInvoice: {
    month: 5,
    year: 2026,
    total: 3855000,
    status: 'pending',
    dueDate: '2026-05-15',
    daysUntilDue: getDaysUntil('2026-05-15'),
  },
  overdueInvoices: 1,
  overdueAmount: 3855000,
  maintenance: {
    pending: 1,
    inProgress: 1,
  },
  notifications: [
    { id: '1', emoji: '⚠️', title: 'Hóa đơn tháng 3/2026 đã quá hạn', time: '2026-05-01T10:00:00Z', type: 'bill_overdue' },
    { id: '2', emoji: '🔧', title: 'Yêu cầu sửa ổ cắm đang được xử lý', time: '2026-04-27T14:00:00Z', type: 'maintenance_accepted' },
    { id: '3', emoji: '📄', title: 'Hóa đơn tháng 5/2026 đã được tạo', time: '2026-04-29T09:00:00Z', type: 'new_bill' },
  ],
};

interface QuickActionProps {
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
  badge?: number;
  onPress: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ emoji, label, sublabel, color, badge, onPress }) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.quickActionIcon, { backgroundColor: color + '15' }]}>
      <Text style={styles.quickActionEmoji}>{emoji}</Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.quickActionBadge}>
          <Text style={styles.quickActionBadgeText}>{badge}</Text>
        </View>
      )}
    </View>
    <Text style={styles.quickActionLabel}>{label}</Text>
    {sublabel && <Text style={styles.quickActionSublabel}>{sublabel}</Text>}
  </TouchableOpacity>
);

export const TenantHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const data = DASHBOARD_DATA;

  const isInvoiceUrgent = data.currentInvoice.daysUntilDue <= 3 && data.currentInvoice.status === 'pending';
  const hasOverdue = data.overdueInvoices > 0;
  const contractIsExpiringSoon = data.contract.daysLeft <= 60;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== Header ===== */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName || 'Khách thuê'}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBadge}
            onPress={() => navigation.navigate('TenantNotifications')}
          >
            <Text style={styles.notifEmoji}>🔔</Text>
            {data.notifications.length > 0 && (
              <View style={styles.notifCount}>
                <Text style={styles.notifCountText}>{data.notifications.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ===== Cảnh báo quá hạn ===== */}
        {hasOverdue && (
          <TouchableOpacity
            style={styles.alertBanner}
            onPress={() => navigation.navigate('InvoiceList')}
            activeOpacity={0.8}
          >
            <Text style={styles.alertEmoji}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Hóa đơn quá hạn!</Text>
              <Text style={styles.alertDesc}>
                {data.overdueInvoices} hóa đơn đang quá hạn · {formatCurrency(data.overdueAmount)}
              </Text>
            </View>
            <Text style={styles.alertArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* ===== Room Card ===== */}
        <View style={styles.roomCard}>
          <View style={styles.roomCardOverlay}>
            <View style={styles.roomCardTop}>
              <View>
                <Text style={styles.roomCardLabel}>Phòng của bạn</Text>
                <Text style={styles.roomCardName}>{data.room.name}</Text>
                <Text style={styles.roomCardProperty}>{data.room.property}</Text>
              </View>
              <View style={styles.roomCardStats}>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>{data.room.area}m²</Text>
                  <Text style={styles.roomStatLabel}>Diện tích</Text>
                </View>
                <View style={styles.roomStat}>
                  <Text style={styles.roomStatValue}>Tầng {data.room.floor}</Text>
                  <Text style={styles.roomStatLabel}>Vị trí</Text>
                </View>
              </View>
            </View>

            {/* Contract expiry bar */}
            <View style={styles.contractBar}>
              <Text style={styles.contractBarLabel}>
                📋 HĐ {data.contract.code}
              </Text>
              <Text style={[styles.contractBarDays, contractIsExpiringSoon && { color: '#FCD34D' }]}>
                {contractIsExpiringSoon ? '⚠️ ' : ''}{data.contract.daysLeft} ngày
              </Text>
            </View>
          </View>
        </View>

        {/* ===== Invoice Card ===== */}
        <View style={[styles.invoiceCard, isInvoiceUrgent && styles.invoiceCardUrgent, hasOverdue && !isInvoiceUrgent && styles.invoiceCardOverdue]}>
          <View style={styles.invoiceCardHeader}>
            <View>
              <Text style={styles.invoiceCardLabel}>
                {hasOverdue ? '⚠️ Có hóa đơn quá hạn' : `Hóa đơn tháng ${String(data.currentInvoice.month).padStart(2, '0')}/${data.currentInvoice.year}`}
              </Text>
              <Text style={[styles.invoiceCardAmount, hasOverdue && { color: Colors.error }]}>
                {formatCurrency(hasOverdue ? data.overdueAmount : data.currentInvoice.total)}
              </Text>
            </View>
            <View style={[
              styles.invoiceStatusBadge,
              { backgroundColor: hasOverdue ? Colors.error : data.currentInvoice.status === 'pending' ? Colors.warning : Colors.success }
            ]}>
              <Text style={styles.invoiceStatusText}>
                {hasOverdue ? 'Quá hạn' : data.currentInvoice.status === 'pending' ? 'Chờ TT' : 'Đã TT'}
              </Text>
            </View>
          </View>

          {data.currentInvoice.status === 'pending' && !hasOverdue && (
            <Text style={styles.invoiceDue}>
              📅 Hạn thanh toán: {data.currentInvoice.daysUntilDue} ngày nữa
            </Text>
          )}

          <TouchableOpacity
            style={[styles.invoicePayBtn, hasOverdue && { backgroundColor: Colors.error }]}
            onPress={() => navigation.navigate('InvoiceList')}
          >
            <Text style={styles.invoicePayBtnText}>
              {hasOverdue ? '🚨 Thanh toán ngay' : '💳 Xem & Thanh toán'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ===== Quick Actions ===== */}
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.quickGrid}>
          <QuickAction
            emoji="📄" label="Hóa đơn" sublabel="Xem hóa đơn" color={Colors.primary}
            badge={data.overdueInvoices}
            onPress={() => navigation.navigate('InvoiceList')}
          />
          <QuickAction
            emoji="🔧" label="Sửa chữa" sublabel={`${data.maintenance.pending} chờ xử lý`}
            color={Colors.warning} badge={data.maintenance.pending}
            onPress={() => navigation.navigate('MaintenanceList')}
          />
          <QuickAction
            emoji="📋" label="Hợp đồng" sublabel="Xem hợp đồng" color={Colors.accent}
            onPress={() => navigation.navigate('TenantContracts')}
          />
          <QuickAction
            emoji="💳" label="Lịch sử TT" sublabel="Giao dịch" color={Colors.success}
            onPress={() => navigation.navigate('PaymentHistory')}
          />
          <QuickAction
            emoji="📷" label="Quét QR" sublabel="Thiết bị" color={Colors.info}
            onPress={() => navigation.navigate('Scan')}
          />
          <QuickAction
            emoji="🏠" label="Bàn giao" sublabel="Nhận phòng" color={Colors.textSecondary}
            onPress={() => navigation.navigate('TenantOnboarding')}
          />
          <QuickAction
            emoji="👤" label="Hồ sơ" sublabel="Tài khoản" color={Colors.primaryDark}
            onPress={() => navigation.navigate('Profile')}
          />
        </View>

        {/* ===== Tình trạng bảo trì ===== */}
        {(data.maintenance.pending > 0 || data.maintenance.inProgress > 0) && (
          <>
            <Text style={styles.sectionTitle}>Tiến độ sửa chữa</Text>
            <TouchableOpacity
              style={styles.maintenanceCard}
              onPress={() => navigation.navigate('MaintenanceList')}
              activeOpacity={0.7}
            >
              <View style={styles.maintenanceRow}>
                <View style={[styles.maintenanceStat, { backgroundColor: Colors.warningLight }]}>
                  <Text style={[styles.maintenanceStatNum, { color: Colors.warning }]}>{data.maintenance.pending}</Text>
                  <Text style={[styles.maintenanceStatLabel, { color: Colors.warning }]}>Chờ xử lý</Text>
                </View>
                <View style={[styles.maintenanceStat, { backgroundColor: Colors.primaryBg }]}>
                  <Text style={[styles.maintenanceStatNum, { color: Colors.primary }]}>{data.maintenance.inProgress}</Text>
                  <Text style={[styles.maintenanceStatLabel, { color: Colors.primary }]}>Đang sửa</Text>
                </View>
                <View style={styles.maintenanceArrow}>
                  <Text style={styles.maintenanceArrowText}>→</Text>
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ===== Hợp đồng sắp hết hạn ===== */}
        {contractIsExpiringSoon && (
          <>
            <Text style={styles.sectionTitle}>Cảnh báo hợp đồng</Text>
            <TouchableOpacity
              style={styles.contractAlert}
              onPress={() => navigation.navigate('TenantContracts')}
              activeOpacity={0.8}
            >
              <Text style={styles.contractAlertEmoji}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.contractAlertTitle}>Hợp đồng sắp hết hạn</Text>
                <Text style={styles.contractAlertDesc}>
                  Còn {data.contract.daysLeft} ngày · Nhấn để xem và yêu cầu gia hạn
                </Text>
              </View>
              <Text style={styles.contractAlertArrow}>→</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ===== Thông báo gần đây ===== */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Thông báo gần đây</Text>
          <TouchableOpacity onPress={() => navigation.navigate('TenantNotifications')}>
            <Text style={styles.seeAllText}>Xem tất cả →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.notifCard}>
          {data.notifications.map((notif, i) => (
            <React.Fragment key={notif.id}>
              <View style={styles.notifItem}>
                <Text style={styles.notifEmoji}>{notif.emoji}</Text>
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>{notif.title}</Text>
                  <Text style={styles.notifTime}>{formatRelativeTime(notif.time)}</Text>
                </View>
              </View>
              {i < data.notifications.length - 1 && <View style={styles.notifDivider} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.lg },
  greeting: { fontSize: 14, color: Colors.textSecondary },
  userName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  notifBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  notifEmoji: { fontSize: 22 },
  notifCount: { position: 'absolute', top: 6, right: 6, backgroundColor: Colors.error, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  notifCountText: { color: Colors.white, fontSize: 10, fontWeight: '700' },

  // Alert Banner
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.error + '40',
  },
  alertEmoji: { fontSize: 22 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: Colors.error },
  alertDesc: { fontSize: 12, color: Colors.error, marginTop: 2 },
  alertArrow: { fontSize: 16, color: Colors.error, fontWeight: '700' },

  // Room Card
  roomCard: { height: 150, borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: Spacing.base, ...Shadow.md },
  roomCardOverlay: { flex: 1, padding: Spacing.lg, backgroundColor: 'rgba(79, 70, 229, 0.95)', justifyContent: 'space-between' },
  roomCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roomCardLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  roomCardName: { fontSize: 24, fontWeight: '800', color: Colors.white, marginTop: 2 },
  roomCardProperty: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  roomCardStats: { alignItems: 'flex-end', gap: 4 },
  roomStat: { alignItems: 'flex-end' },
  roomStatValue: { fontSize: 13, fontWeight: '700', color: Colors.white },
  roomStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  contractBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: BorderRadius.sm, padding: Spacing.xs + 2 },
  contractBarLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  contractBarDays: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // Invoice Card
  invoiceCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md, marginBottom: Spacing.lg },
  invoiceCardUrgent: { borderWidth: 1.5, borderColor: Colors.error },
  invoiceCardOverdue: { borderWidth: 1.5, borderColor: Colors.error },
  invoiceCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  invoiceCardLabel: { fontSize: 13, color: Colors.textSecondary },
  invoiceCardAmount: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  invoiceStatusBadge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full },
  invoiceStatusText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  invoiceDue: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  invoicePayBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  invoicePayBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md, marginTop: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, marginTop: Spacing.sm },
  seeAllText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // Quick Actions Grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  quickAction: { width: '30%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm, alignItems: 'flex-start' },
  quickActionIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm, position: 'relative' },
  quickActionEmoji: { fontSize: 22 },
  quickActionBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center' },
  quickActionBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.white },
  quickActionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  quickActionSublabel: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  // Maintenance
  maintenanceCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm, marginBottom: Spacing.lg },
  maintenanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  maintenanceStat: { flex: 1, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  maintenanceStatNum: { fontSize: 24, fontWeight: '800' },
  maintenanceStatLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  maintenanceArrow: { width: 32, alignItems: 'center' },
  maintenanceArrowText: { fontSize: 20, color: Colors.textMuted },

  // Contract Alert
  contractAlert: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.warning + '40',
  },
  contractAlertEmoji: { fontSize: 28 },
  contractAlertTitle: { fontSize: 14, fontWeight: '700', color: Colors.warning },
  contractAlertDesc: { fontSize: 12, color: Colors.warning, marginTop: 2 },
  contractAlertArrow: { fontSize: 16, color: Colors.warning, fontWeight: '700' },

  // Notifications
  notifCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm, marginBottom: Spacing.lg },
  notifItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  notifEmoji: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  notifTime: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  notifDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
});
