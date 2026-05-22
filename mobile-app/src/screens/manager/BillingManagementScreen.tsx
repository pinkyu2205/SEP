import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useBills, billsStore } from '../../store/billsStore';
import { getPropertyById } from '../../data/managedProperties';

// ===================== TYPES =====================
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'ewallet';

interface PaymentRecord {
  id: string;
  billCode: string;
  tenantName: string;
  roomName: string;
  propertyName: string;
  amount: number;
  method: PaymentMethod;
  status: 'pending_verify' | 'verified' | 'rejected';
  transferContent?: string;
  createdAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

// ===================== MOCK DATA =====================
const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: 'p1', billCode: 'HD-T5-102', tenantName: 'Lê Thị B', roomName: 'P102',
    propertyName: 'Nhà Nguyễn Trãi', amount: 3860000, method: 'qr', status: 'verified',
    transferContent: 'HD-T5-102 Phong 102 Le Thi B',
    createdAt: '2026-05-10T14:30:00', verifiedAt: '2026-05-10T14:35:00', verifiedBy: 'Manager',
  },
  {
    id: 'p2', billCode: 'HD-T5-101', tenantName: 'Trần Văn A', roomName: 'P101',
    propertyName: 'Nhà Nguyễn Trãi', amount: 4352500, method: 'bank_transfer', status: 'pending_verify',
    transferContent: 'CK tien phong thang 5 Tran Van A',
    createdAt: '2026-05-14T09:15:00',
  },
  {
    id: 'p3', billCode: 'HD-T5-CMT-101', tenantName: 'Bùi Văn H', roomName: 'P101',
    propertyName: 'Nhà CMT8', amount: 4845000, method: 'ewallet', status: 'pending_verify',
    transferContent: 'Thanh toan qua MoMo T5',
    createdAt: '2026-05-15T10:00:00',
  },
  {
    id: 'p-house-1', billCode: 'HD-NVC-T5', tenantName: 'Gia đình anh Minh', roomName: 'Nhà nguyên căn',
    propertyName: 'Nhà Nguyễn Văn Cừ', amount: 13040000, method: 'bank_transfer', status: 'pending_verify',
    transferContent: 'Thanh toan nha nguyen can T5 gia dinh anh Minh',
    createdAt: '2026-05-16T08:30:00',
  },
];

// ===================== HELPERS =====================
const METHOD_CONFIG: Record<PaymentMethod, { label: string; icon: string }> = {
  qr:            { label: 'QR VietQR',    icon: '📱' },
  bank_transfer: { label: 'Chuyển khoản', icon: '🏦' },
  cash:          { label: 'Tiền mặt',     icon: '💵' },
  ewallet:       { label: 'Ví điện tử',   icon: '👛' },
};

const fmt     = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso: string) => {
  const [d, t] = iso.split('T');
  return `${d} ${t?.slice(0, 5) ?? ''}`.trim();
};

// ===================== SCREEN =====================
export const BillingManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const bills      = useBills();
  const [payments, setPayments]             = useState(MOCK_PAYMENTS);
  const [showVerifications, setShowVerifications] = useState(true);

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  // Manager bills only (exclude tenant-side bills which use INV- prefix)
  const managerBills = useMemo(
    () => bills.filter(b => b.code.startsWith('HD-')),
    [bills],
  );

  const stats = useMemo(() => ({
    paidCount:    managerBills.filter(b => b.status === 'paid').length,
    paidAmt:      managerBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.grandTotal, 0),
    pendingCount: managerBills.filter(b => b.status === 'pending').length,
    pendingAmt:   managerBills.filter(b => b.status === 'pending').reduce((s, b) => s + b.grandTotal, 0),
    overdueCount: managerBills.filter(b => b.status === 'overdue').length,
    overdueAmt:   managerBills.filter(b => b.status === 'overdue').reduce((s, b) => s + b.grandTotal, 0),
  }), [managerBills]);

  const pendingVerifications = payments.filter(p => p.status === 'pending_verify');

  // Group bills by building
  const buildingGroups = useMemo(() => {
    const map = new Map<string, { propertyId: string; propertyName: string; propertyType?: string; bills: typeof managerBills }>();
    managerBills.forEach(b => {
      if (!map.has(b.propertyId)) {
        const prop = getPropertyById(b.propertyId);
        map.set(b.propertyId, {
          propertyId: b.propertyId,
          propertyName: b.propertyName,
          propertyType: prop?.propertyType || b.propertyType,
          bills: [],
        });
      }
      map.get(b.propertyId)!.bills.push(b);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aO = a.bills.filter(x => x.status === 'overdue').length;
      const bO = b.bills.filter(x => x.status === 'overdue').length;
      return bO - aO;
    });
  }, [managerBills]);

  const handleVerifyPayment = (paymentId: string, approved: boolean) => {
    Alert.alert(
      approved ? 'Xác nhận thanh toán?' : 'Từ chối thanh toán?',
      approved ? 'Xác nhận đã nhận đủ tiền từ khách thuê?' : 'Từ chối giao dịch này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: approved ? 'Xác nhận' : 'Từ chối',
          style: approved ? 'default' : 'destructive',
          onPress: () => {
            const payment = payments.find(p => p.id === paymentId);
            if (!payment) return;
            setPayments(prev => prev.map(p =>
              p.id === paymentId
                ? { ...p, status: approved ? 'verified' : 'rejected', verifiedAt: new Date().toISOString(), verifiedBy: 'Manager' }
                : p
            ));
            if (approved) {
              billsStore.updateByCode(payment.billCode, 'paid', {
                paidAt: new Date().toISOString().split('T')[0],
                paidAmount: payment.amount,
              });
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Hóa đơn & Thanh toán</Text>
          <Text style={s.subtitle}>Tháng 05/2026</Text>
        </View>

        {/* ── Stats row ────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.statsScroll} contentContainerStyle={s.statsContent}>
          <View style={[s.statCard, { borderTopColor: Colors.success }]}>
            <Text style={[s.statNum, { color: Colors.success }]}>{stats.paidCount}</Text>
            <Text style={s.statLabel}>Đã thu</Text>
            <Text style={[s.statAmt, { color: Colors.success }]}>{(stats.paidAmt / 1e6).toFixed(1)}tr</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[s.statNum, { color: Colors.warning }]}>{stats.pendingCount}</Text>
            <Text style={s.statLabel}>Chưa thu</Text>
            <Text style={[s.statAmt, { color: Colors.warning }]}>{(stats.pendingAmt / 1e6).toFixed(1)}tr</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[s.statNum, { color: Colors.error }]}>{stats.overdueCount}</Text>
            <Text style={s.statLabel}>Quá hạn</Text>
            <Text style={[s.statAmt, { color: Colors.error }]}>{(stats.overdueAmt / 1e6).toFixed(1)}tr</Text>
          </View>
          {pendingVerifications.length > 0 && (
            <View style={[s.statCard, { borderTopColor: Colors.primary }]}>
              <Text style={[s.statNum, { color: Colors.primary }]}>{pendingVerifications.length}</Text>
              <Text style={s.statLabel}>Chờ xác nhận</Text>
              <Text style={[s.statAmt, { color: Colors.primary }]}>GD</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Pending verifications ────────────────────────────────── */}
        {pendingVerifications.length > 0 && (
          <View style={s.section}>
            <TouchableOpacity
              style={s.sectionHeader}
              onPress={() => setShowVerifications(v => !v)}
              activeOpacity={0.8}
            >
              <View style={s.sectionTitleRow}>
                <View style={s.alertDot} />
                <Text style={s.sectionTitle}>Chờ xác nhận ({pendingVerifications.length})</Text>
              </View>
              <Text style={s.chevron}>{showVerifications ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showVerifications && pendingVerifications.map(item => {
              const mc = METHOD_CONFIG[item.method];
              return (
                <View key={item.id} style={s.verifyCard}>
                  <View style={s.verifyCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.verifyCode}>{item.billCode}</Text>
                      <Text style={s.verifyMeta}>{item.tenantName} · {item.roomName}</Text>
                      <Text style={s.verifyProp}>{item.propertyName}</Text>
                    </View>
                    <Text style={s.verifyAmt}>{fmt(item.amount)}</Text>
                  </View>
                  <View style={s.verifyMethodRow}>
                    <Text style={s.verifyMethodText}>{mc.icon} {mc.label}</Text>
                    <Text style={s.verifyDate}>{fmtDate(item.createdAt)}</Text>
                  </View>
                  {item.transferContent && (
                    <Text style={s.verifyContent} numberOfLines={1}>📝 {item.transferContent}</Text>
                  )}
                  <View style={s.verifyActions}>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => handleVerifyPayment(item.id, false)}>
                      <Text style={s.rejectBtnText}>Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.approveBtn} onPress={() => handleVerifyPayment(item.id, true)}>
                      <Text style={s.approveBtnText}>✓ Xác nhận đã nhận</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Buildings section ────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderPlain}>
            <Text style={s.sectionTitle}>Theo bất động sản</Text>
            <Text style={s.sectionCount}>{buildingGroups.length} tài sản</Text>
          </View>

          {buildingGroups.map(group => {
            const paid    = group.bills.filter(b => b.status === 'paid');
            const pending = group.bills.filter(b => b.status === 'pending');
            const overdue = group.bills.filter(b => b.status === 'overdue');
            const uncollected = [...pending, ...overdue].reduce((s, b) => s + b.grandTotal, 0);
            const collectedAmt = paid.reduce((s, b) => s + b.grandTotal, 0);
            const payRate = group.bills.length > 0
              ? Math.round((paid.length / group.bills.length) * 100) : 0;
            const barColor = payRate >= 80 ? Colors.success : payRate >= 50 ? Colors.warning : Colors.error;

            return (
              <TouchableOpacity
                key={group.propertyId}
                style={s.buildingCard}
                onPress={() => navigation.navigate('BuildingBilling', {
                  propertyId: group.propertyId,
                  propertyName: group.propertyName,
                })}
                activeOpacity={0.75}
              >
                <View style={s.buildingCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.buildingName} numberOfLines={1}>{group.propertyName}</Text>
                    <Text style={s.propertyTypeText}>
                      {group.propertyType === 'WHOLE_HOUSE' ? 'Nhà nguyên căn · 1 hóa đơn/tháng' : 'Toà nhà nhiều phòng · theo phòng'}
                    </Text>
                  </View>
                  <Text style={s.buildingArrow}>›</Text>
                </View>

                <View style={s.buildingStats}>
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: Colors.success }]}>{paid.length}</Text>
                    <Text style={s.buildingStatLbl}>Đã thu</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: Colors.warning }]}>{pending.length}</Text>
                    <Text style={s.buildingStatLbl}>Chưa thu</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: overdue.length > 0 ? Colors.error : Colors.textMuted }]}>
                      {overdue.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Quá hạn</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={[s.buildingStat, { flex: 2, alignItems: 'flex-end' }]}>
                    <Text style={[s.buildingStatAmt, { color: uncollected > 0 ? Colors.error : Colors.success }]}>
                      {uncollected > 0 ? fmt(uncollected) : fmt(collectedAmt)}
                    </Text>
                    <Text style={s.buildingStatLbl}>{uncollected > 0 ? 'Cần thu' : 'Đã thu'}</Text>
                  </View>
                </View>

                <View style={s.progRow}>
                  <View style={s.progBg}>
                    <View style={[s.progFill, { width: `${payRate}%` as any, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[s.progPct, { color: barColor }]}>{payRate}%</Text>
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

// ── Styles ─────────────────────────────────────────────────────────────────

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

  statsScroll:  { flexGrow: 0, marginBottom: Spacing.lg },
  statsContent: { paddingVertical: 4, gap: Spacing.sm },
  statCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderTopWidth: 3, ...Shadow.sm, minWidth: 88, alignItems: 'center',
  },
  statNum:   { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statAmt:   { fontSize: 11, fontWeight: '700', marginTop: 2 },

  section: { marginBottom: Spacing.lg },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, marginBottom: Spacing.sm,
  },
  sectionHeaderPlain: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: Spacing.sm, marginBottom: Spacing.sm,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  sectionCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  chevron:      { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },

  verifyCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  verifyCardTop:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  verifyCode:      { fontSize: 14, fontWeight: '700', color: Colors.primary },
  verifyMeta:      { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  verifyProp:      { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  verifyAmt:       { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginLeft: Spacing.sm },
  verifyMethodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  verifyMethodText:{ fontSize: 12, color: Colors.textSecondary },
  verifyDate:      { fontSize: 11, color: Colors.textMuted },
  verifyContent:   { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.sm },
  verifyActions:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  rejectBtn:       { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.errorLight, alignItems: 'center' },
  rejectBtnText:   { fontSize: 13, fontWeight: '600', color: Colors.error },
  approveBtn:      { flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  approveBtnText:  { fontSize: 13, fontWeight: '700', color: Colors.white },

  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  buildingCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  buildingName:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  propertyTypeText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  buildingArrow: { fontSize: 22, color: Colors.textMuted, fontWeight: '300' },

  buildingStats: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  buildingStat:  { alignItems: 'center', flex: 1 },
  buildingStatNum: { fontSize: 17, fontWeight: '800' },
  buildingStatAmt: { fontSize: 13, fontWeight: '800' },
  buildingStatLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  statSep:         { width: 1, height: 30, backgroundColor: Colors.divider },

  progRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg:   { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5 },
  progFill: { height: 5, borderRadius: 2.5 },
  progPct:  { fontSize: 11, fontWeight: '700', minWidth: 30, textAlign: 'right' },
});
