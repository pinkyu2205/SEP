import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '../../services/managerInvoiceService.real';

const METHOD_CONFIG: Record<string, { label: string; icon: string }> = {
  QR:            { label: 'QR VietQR',    icon: '📱' },
  BANK_TRANSFER: { label: 'Chuyển khoản', icon: '🏦' },
  CASH:          { label: 'Tiền mặt',     icon: '💵' },
  EWALLET:       { label: 'Ví điện tử',   icon: '👛' },
  OTHER:         { label: 'Khác',         icon: '💳' },
};
const methodOf = (m: string) => METHOD_CONFIG[(m || '').toUpperCase()] ?? METHOD_CONFIG.OTHER;

const fmt = (n: number) => (n ?? 0).toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const [d, t] = iso.split('T');
  return `${d} ${t?.slice(0, 5) ?? ''}`.trim();
};

export const BillingManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showVerifications, setShowVerifications] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
    ])
      .then(([inv, pay]) => { setInvoices(inv); setPayments(pay); })
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  const stats = useMemo(() => ({
    paidCount:    invoices.filter(i => i.status === 'PAID').length,
    paidAmt:      invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0),
    pendingCount: invoices.filter(i => i.status === 'PENDING').length,
    pendingAmt:   invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0),
    overdueCount: invoices.filter(i => i.status === 'OVERDUE').length,
    overdueAmt:   invoices.filter(i => i.status === 'OVERDUE').reduce((s, i) => s + i.amount, 0),
  }), [invoices]);

  const pendingVerifications = useMemo(() => payments.filter(p => p.status === 'PENDING_VERIFY'), [payments]);
  const verifiedTx = useMemo(
    () => payments.filter(p => p.status === 'VERIFIED')
      .sort((a, b) => (b.verifiedAt || b.createdAt).localeCompare(a.verifiedAt || a.createdAt)),
    [payments],
  );

  const buildingGroups = useMemo(() => {
    const map = new Map<number, { propertyId: number; propertyName: string; invoices: ManagerInvoice[] }>();
    invoices.forEach(i => {
      if (!map.has(i.propertyId)) map.set(i.propertyId, { propertyId: i.propertyId, propertyName: i.propertyName, invoices: [] });
      map.get(i.propertyId)!.invoices.push(i);
    });
    return Array.from(map.values()).sort((a, b) =>
      b.invoices.filter(x => x.status === 'OVERDUE').length - a.invoices.filter(x => x.status === 'OVERDUE').length);
  }, [invoices]);

  const handleVerify = (p: ManagerPayment, approved: boolean) => {
    Alert.alert(
      approved ? 'Xác nhận thanh toán?' : 'Từ chối thanh toán?',
      approved ? `Xác nhận đã nhận đủ ${fmt(p.amount)} từ ${p.tenantName}?` : 'Từ chối giao dịch này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: approved ? 'Xác nhận' : 'Từ chối',
          style: approved ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (approved) await realManagerInvoiceService.verifyPayment(p.id);
              else await realManagerInvoiceService.rejectPayment(p.id);
              load();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không xử lý được giao dịch (BE chưa có endpoint?).');
            }
          },
        },
      ],
    );
  };

  const now = new Date();
  const monthLabel = `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Hóa đơn & Thanh toán</Text>
          <Text style={s.subtitle}>{monthLabel}</Text>
        </View>

        {/* ── (1) Gửi hoá đơn tiền nhà — ưu tiên đầu màn ── */}
        <TouchableOpacity style={s.rentCta} onPress={() => navigation.navigate('RentInvoice')} activeOpacity={0.85}>
          <Text style={s.rentCtaIcon}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.rentCtaTitle}>Gửi hóa đơn tiền nhà</Text>
            <Text style={s.rentCtaSub}>Tiền phòng/nhà hàng tháng — hoá đơn riêng, theo hợp đồng</Text>
          </View>
          <Text style={s.rentCtaArrow}>›</Text>
        </TouchableOpacity>

        {/* ── Stats ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsScroll} contentContainerStyle={s.statsContent}>
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

        {loading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* ── (2b) Thông báo: Chờ xác nhận thanh toán ── */}
            {pendingVerifications.length > 0 && (
              <View style={s.section}>
                <TouchableOpacity style={s.sectionHeader} onPress={() => setShowVerifications(v => !v)} activeOpacity={0.8}>
                  <View style={s.sectionTitleRow}>
                    <View style={s.alertDot} />
                    <Text style={s.sectionTitle}>Chờ xác nhận ({pendingVerifications.length})</Text>
                  </View>
                  <Text style={s.chevron}>{showVerifications ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showVerifications && pendingVerifications.map(item => {
                  const mc = methodOf(item.method);
                  return (
                    <View key={item.id} style={s.verifyCard}>
                      <View style={s.verifyCardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.verifyCode}>{item.invoiceCode}</Text>
                          <Text style={s.verifyMeta}>{item.tenantName}{item.roomNumber ? ` · ${item.roomNumber}` : ''}</Text>
                          <Text style={s.verifyProp}>{item.propertyName}</Text>
                        </View>
                        <Text style={s.verifyAmt}>{fmt(item.amount)}</Text>
                      </View>
                      <View style={s.verifyMethodRow}>
                        <Text style={s.verifyMethodText}>{mc.icon} {mc.label}</Text>
                        <Text style={s.verifyDate}>{fmtDate(item.createdAt)}</Text>
                      </View>
                      {item.transferContent && <Text style={s.verifyContent} numberOfLines={1}>📝 {item.transferContent}</Text>}
                      <View style={s.verifyActions}>
                        <TouchableOpacity style={s.rejectBtn} onPress={() => handleVerify(item, false)}>
                          <Text style={s.rejectBtnText}>Từ chối</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.approveBtn} onPress={() => handleVerify(item, true)}>
                          <Text style={s.approveBtnText}>✓ Xác nhận đã nhận</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── (3) Lịch sử giao dịch (ngay trong màn) ── */}
            <View style={s.section}>
              <View style={s.sectionHeaderPlain}>
                <Text style={s.sectionTitle}>Lịch sử giao dịch</Text>
                <Text style={s.sectionCount}>{verifiedTx.length} đã xác nhận</Text>
              </View>
              {verifiedTx.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>Chưa có giao dịch nào được xác nhận.</Text>
                </View>
              ) : (
                verifiedTx.slice(0, 10).map(tx => {
                  const mc = methodOf(tx.method);
                  return (
                    <View key={tx.id} style={s.txRow}>
                      <View style={s.txIcon}><Text style={{ fontSize: 18 }}>{mc.icon}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.txCode}>{tx.invoiceCode}</Text>
                        <Text style={s.txMeta}>{tx.tenantName}{tx.roomNumber ? ` · ${tx.roomNumber}` : ''} · {mc.label}</Text>
                        <Text style={s.txDate}>{fmtDate(tx.verifiedAt || tx.createdAt)}</Text>
                      </View>
                      <Text style={s.txAmt}>{fmt(tx.amount)}</Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* ── Theo bất động sản ── */}
            {buildingGroups.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderPlain}>
                  <Text style={s.sectionTitle}>Theo bất động sản</Text>
                  <Text style={s.sectionCount}>{buildingGroups.length} tài sản</Text>
                </View>

                {buildingGroups.map(group => {
                  const paid    = group.invoices.filter(b => b.status === 'PAID');
                  const pending = group.invoices.filter(b => b.status === 'PENDING');
                  const overdue = group.invoices.filter(b => b.status === 'OVERDUE');
                  const uncollected = [...pending, ...overdue].reduce((sum, b) => sum + b.amount, 0);
                  const collected   = paid.reduce((sum, b) => sum + b.amount, 0);
                  const payRate = group.invoices.length > 0 ? Math.round((paid.length / group.invoices.length) * 100) : 0;
                  const barColor = payRate >= 80 ? Colors.success : payRate >= 50 ? Colors.warning : Colors.error;

                  return (
                    <TouchableOpacity
                      key={group.propertyId}
                      style={s.buildingCard}
                      onPress={() => navigation.navigate('BuildingBilling', { propertyId: String(group.propertyId), propertyName: group.propertyName })}
                      activeOpacity={0.75}
                    >
                      <View style={s.buildingCardHeader}>
                        <Text style={s.buildingName} numberOfLines={1}>{group.propertyName}</Text>
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
                          <Text style={[s.buildingStatNum, { color: overdue.length > 0 ? Colors.error : Colors.textMuted }]}>{overdue.length}</Text>
                          <Text style={s.buildingStatLbl}>Quá hạn</Text>
                        </View>
                        <View style={s.statSep} />
                        <View style={[s.buildingStat, { flex: 2, alignItems: 'flex-end' }]}>
                          <Text style={[s.buildingStatAmt, { color: uncollected > 0 ? Colors.error : Colors.success }]}>
                            {uncollected > 0 ? fmt(uncollected) : fmt(collected)}
                          </Text>
                          <Text style={s.buildingStatLbl}>{uncollected > 0 ? 'Cần thu' : 'Đã thu'}</Text>
                        </View>
                      </View>
                      <View style={s.progRow}>
                        <View style={s.progBg}><View style={[s.progFill, { width: `${payRate}%` as any, backgroundColor: barColor }]} /></View>
                        <Text style={[s.progPct, { color: barColor }]}>{payRate}%</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {invoices.length === 0 && pendingVerifications.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>🧾</Text>
                <Text style={s.emptyText}>Chưa có hóa đơn nào trong kỳ này.</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base },

  header:    { paddingTop: Spacing.md, paddingBottom: Spacing.base },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  rentCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.md,
  },
  rentCtaIcon:  { fontSize: 28 },
  rentCtaTitle: { fontSize: 16, fontWeight: '800', color: Colors.white },
  rentCtaSub:   { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  rentCtaArrow: { fontSize: 24, color: Colors.white, fontWeight: '800' },

  blockLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  actionCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  actionIcon:  { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  actionSub:   { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  statsScroll:  { flexGrow: 0, marginBottom: Spacing.lg },
  statsContent: { paddingVertical: 4, gap: Spacing.sm },
  statCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderTopWidth: 3, ...Shadow.sm, minWidth: 88, alignItems: 'center' },
  statNum:   { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  statAmt:   { fontSize: 11, fontWeight: '700', marginTop: 2 },

  loading: { paddingVertical: Spacing['3xl'], alignItems: 'center' },

  section: { marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  sectionHeaderPlain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.sm, marginBottom: Spacing.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  sectionCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  chevron:      { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },

  verifyCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.warning },
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

  // Transaction history
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  txIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  txCode: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  txMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  txAmt:  { fontSize: 15, fontWeight: '800', color: Colors.success },

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  buildingCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  buildingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  buildingName:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
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
