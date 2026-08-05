import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE,
} from '@/constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '@/services/manager/invoiceService';

/**
 * HOÁ ĐƠN & THANH TOÁN (tiền nhà) — màn theo dõi kỳ thu HIỆN TẠI.
 *
 * Thứ tự trên màn đi theo việc manager cần làm, không theo thứ tự dữ liệu:
 *   1. Kỳ này thu tới đâu (tiền, không phải số đếm) — trả lời câu hỏi đầu tiên luôn.
 *   2. Việc cần xử lý: giao dịch chờ xác nhận, hoá đơn quá hạn.
 *   3. Từng nhà: nhà nào chưa thu xong, bấm vào xem chi tiết.
 *   4. Giao dịch gần đây.
 * Lịch sử mọi kỳ đã qua nằm ở màn riêng (BillingHistory) — vào từ mục "Theo nhà".
 */

const METHOD_CONFIG: Record<string, { label: string; icon: string }> = {
  QR:            { label: 'QR VietQR',    icon: '📱' },
  BANK_TRANSFER: { label: 'Chuyển khoản', icon: '🏦' },
  CASH:          { label: 'Tiền mặt',     icon: '💵' },
  EWALLET:       { label: 'Ví điện tử',   icon: '👛' },
  OTHER:         { label: 'Khác',         icon: '💳' },
};
const methodOf = (m: string) => METHOD_CONFIG[(m || '').toUpperCase()] ?? METHOD_CONFIG.OTHER;

const fmt = (n: number) => (n ?? 0).toLocaleString('vi-VN') + 'đ';
/** Rút gọn cho các ô số liệu chật: 5.800.000 → "5,8tr". */
const fmtShort = (n: number) => {
  const v = n ?? 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')}tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')}tr`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};

/** "Hôm nay 13:58" / "Hôm qua 09:12" / "05/08 13:58" — dễ đọc hơn ISO thô. */
const fmtWhen = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return `Hôm nay ${hhmm}`;
  if (diffDays === 1) return `Hôm qua ${hhmm}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
};

const TX_PREVIEW = 5;

export const BillingManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVerifications, setShowVerifications] = useState(true);
  const [showAllTx, setShowAllTx] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      // Màn này CHỈ về tiền nhà (RENT). Điện/nước có thống kê riêng ở màn Ghi chỉ số & Hóa đơn.
      realManagerInvoiceService.listInvoices({ type: 'RENT' }).catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
    ])
      .then(([inv, pay]) => { setInvoices(inv); setPayments(pay); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  const stats = useMemo(() => {
    const paid    = invoices.filter(i => i.status === 'PAID');
    const pending = invoices.filter(i => i.status === 'PENDING');
    const overdue = invoices.filter(i => i.status === 'OVERDUE');
    const sum = (list: ManagerInvoice[]) => list.reduce((s, i) => s + (i.amount || 0), 0);
    const paidAmt = sum(paid);
    const dueAmt = sum(pending) + sum(overdue);
    const total = paidAmt + dueAmt;
    return {
      paidCount: paid.length, paidAmt,
      pendingCount: pending.length, pendingAmt: sum(pending),
      overdueCount: overdue.length, overdueAmt: sum(overdue),
      total, dueAmt,
      rate: total > 0 ? Math.round((paidAmt / total) * 100) : 0,
    };
  }, [invoices]);

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
    // Nhà nào còn nợ nhiều nhất lên đầu — đó là nhà cần đụng tới trước.
    return Array.from(map.values()).sort((a, b) =>
      b.invoices.filter(x => x.status === 'OVERDUE').length - a.invoices.filter(x => x.status === 'OVERDUE').length);
  }, [invoices]);

  const handleVerify = (p: ManagerPayment, approved: boolean) => {
    const doIt = async () => {
      try {
        if (approved) await realManagerInvoiceService.verifyPayment(p.id);
        else await realManagerInvoiceService.rejectPayment(p.id);
        load();
      } catch (e: any) {
        showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không xử lý được giao dịch (BE chưa có endpoint?).');
      }
    };

    showAlert(
      approved ? 'Xác nhận thanh toán?' : 'Từ chối thanh toán?',
      approved ? `Xác nhận đã nhận đủ ${fmt(p.amount)} từ ${p.tenantName}?` : 'Từ chối giao dịch này?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: approved ? 'Xác nhận' : 'Từ chối', style: approved ? 'default' : 'destructive', onPress: doIt },
      ],
    );
  };

  const now = new Date();
  const monthLabel = `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const inCollectWindow = now.getDate() >= RENT_CYCLE.issueDay && now.getDate() <= RENT_CYCLE.dueDay;
  const rateColor = stats.rate >= 80 ? Colors.success : stats.rate >= 50 ? Colors.warning : Colors.error;
  const hasTodo = pendingVerifications.length > 0 || stats.overdueCount > 0;
  const shownTx = showAllTx ? verifiedTx : verifiedTx.slice(0, TX_PREVIEW);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Hóa đơn & Thanh toán</Text>
            <Text style={s.subtitle}>Tiền nhà · {monthLabel}</Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* ── (1) Kỳ này thu tới đâu ── */}
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <Text style={s.heroLabel}>Đã thu kỳ này</Text>
                <TouchableOpacity style={s.autoChip} onPress={() => navigation.navigate('RentInvoice')}>
                  <Text style={s.autoChipText}>
                    {inCollectWindow ? `● Đang thu (ngày ${RENT_CYCLE.issueDay}–${RENT_CYCLE.dueDay})` : '🤖 Tự động'} ›
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={s.heroAmount}>{fmt(stats.paidAmt)}</Text>
              <Text style={s.heroTotal}>
                {stats.total > 0 ? `trên tổng ${fmt(stats.total)} phải thu` : 'Chưa có hoá đơn nào trong kỳ'}
              </Text>

              <View style={s.progRow}>
                <View style={s.progBg}>
                  <View style={[s.progFill, { width: `${stats.rate}%` as any, backgroundColor: rateColor }]} />
                </View>
                <Text style={[s.progPct, { color: rateColor }]}>{stats.rate}%</Text>
              </View>

              <View style={s.heroStats}>
                <View style={s.heroStat}>
                  <Text style={[s.heroStatNum, { color: Colors.success }]}>{stats.paidCount}</Text>
                  <Text style={s.heroStatLbl}>Đã thu</Text>
                </View>
                <View style={s.heroSep} />
                <View style={s.heroStat}>
                  <Text style={[s.heroStatNum, { color: Colors.warning }]}>{stats.pendingCount}</Text>
                  <Text style={s.heroStatLbl}>Chưa thu · {fmtShort(stats.pendingAmt)}</Text>
                </View>
                <View style={s.heroSep} />
                <View style={s.heroStat}>
                  <Text style={[s.heroStatNum, { color: stats.overdueCount > 0 ? Colors.error : Colors.textMuted }]}>
                    {stats.overdueCount}
                  </Text>
                  <Text style={s.heroStatLbl}>Quá hạn · {fmtShort(stats.overdueAmt)}</Text>
                </View>
              </View>
            </View>

            {/* ── (2) Việc cần xử lý ── */}
            {hasTodo ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Cần xử lý</Text>

                {stats.overdueCount > 0 && (
                  <TouchableOpacity style={s.todoRow} onPress={() => navigation.navigate('RentInvoice')}>
                    <View style={[s.todoIcon, { backgroundColor: Colors.errorLight }]}>
                      <Text style={{ fontSize: 16 }}>⚠️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.todoTitle}>{stats.overdueCount} hoá đơn quá hạn</Text>
                      <Text style={s.todoSub}>
                        Còn {fmt(stats.overdueAmt)} chưa thu — quá {RENT_CYCLE.terminationFromDay - RENT_CYCLE.dueDay} ngày
                        thì được quyền chấm dứt hợp đồng
                      </Text>
                    </View>
                    <Text style={s.todoArrow}>›</Text>
                  </TouchableOpacity>
                )}

                {pendingVerifications.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={s.todoRow}
                      onPress={() => setShowVerifications(v => !v)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.todoIcon, { backgroundColor: Colors.primaryBg }]}>
                        <Text style={{ fontSize: 16 }}>💳</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.todoTitle}>{pendingVerifications.length} giao dịch chờ xác nhận</Text>
                        <Text style={s.todoSub}>Khách báo đã chuyển — kiểm tra rồi xác nhận đã nhận tiền</Text>
                      </View>
                      <Text style={s.todoArrow}>{showVerifications ? '⌄' : '›'}</Text>
                    </TouchableOpacity>

                    {showVerifications && pendingVerifications.map(item => {
                      const mc = methodOf(item.method);
                      return (
                        <View key={item.id} style={s.verifyCard}>
                          <View style={s.verifyTop}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.verifyName}>
                                {item.tenantName}{item.roomNumber ? ` · ${item.roomNumber}` : ''}
                              </Text>
                              <Text style={s.verifyMeta}>
                                {item.propertyName} · {item.invoiceCode}
                              </Text>
                              <Text style={s.verifyMeta}>
                                {mc.icon} {mc.label} · {fmtWhen(item.createdAt)}
                              </Text>
                            </View>
                            <Text style={s.verifyAmt}>{fmt(item.amount)}</Text>
                          </View>
                          {!!item.transferContent && (
                            <Text style={s.verifyContent} numberOfLines={1}>📝 {item.transferContent}</Text>
                          )}
                          <View style={s.verifyActions}>
                            <TouchableOpacity style={s.rejectBtn} onPress={() => handleVerify(item, false)}>
                              <Text style={s.rejectBtnText}>Từ chối</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.approveBtn} onPress={() => handleVerify(item, true)}>
                              <Text style={s.approveBtnText}>✓ Đã nhận tiền</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            ) : invoices.length > 0 && (
              <View style={s.clearCard}>
                <Text style={s.clearText}>✅  Không còn việc tồn — kỳ này đang chạy ổn</Text>
              </View>
            )}

            {/* ── (3) Theo nhà ── */}
            {buildingGroups.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Theo nhà</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('BillingHistory')}>
                    <Text style={s.sectionLink}>🗂 Lịch sử các kỳ →</Text>
                  </TouchableOpacity>
                </View>

                {buildingGroups.map(group => {
                  const paid    = group.invoices.filter(b => b.status === 'PAID');
                  const overdue = group.invoices.filter(b => b.status === 'OVERDUE');
                  const uncollected = group.invoices
                    .filter(b => b.status === 'PENDING' || b.status === 'OVERDUE')
                    .reduce((sum, b) => sum + (b.amount || 0), 0);
                  const rate = group.invoices.length > 0
                    ? Math.round((paid.length / group.invoices.length) * 100) : 0;
                  const barColor = rate >= 80 ? Colors.success : rate >= 50 ? Colors.warning : Colors.error;

                  return (
                    <TouchableOpacity
                      key={group.propertyId}
                      style={s.buildingCard}
                      onPress={() => navigation.navigate('BuildingBilling', {
                        propertyId: String(group.propertyId), propertyName: group.propertyName,
                      })}
                      activeOpacity={0.75}
                    >
                      <View style={s.buildingTop}>
                        <Text style={s.buildingName} numberOfLines={1}>{group.propertyName}</Text>
                        {overdue.length > 0 && (
                          <View style={s.overdueTag}>
                            <Text style={s.overdueTagText}>{overdue.length} quá hạn</Text>
                          </View>
                        )}
                        <Text style={s.buildingArrow}>›</Text>
                      </View>

                      <Text style={s.buildingMoney}>
                        {uncollected > 0
                          ? <>Còn thu <Text style={{ color: Colors.error }}>{fmt(uncollected)}</Text></>
                          : <>Đã thu đủ <Text style={{ color: Colors.success }}>{fmt(paid.reduce((s2, b) => s2 + (b.amount || 0), 0))}</Text></>}
                        <Text style={s.buildingCount}>  ·  {paid.length}/{group.invoices.length} hoá đơn</Text>
                      </Text>

                      <View style={s.progRow}>
                        <View style={s.progBg}>
                          <View style={[s.progFill, { width: `${rate}%` as any, backgroundColor: barColor }]} />
                        </View>
                        <Text style={[s.progPct, { color: barColor }]}>{rate}%</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── (4) Giao dịch gần đây ── */}
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>Giao dịch gần đây</Text>
                <Text style={s.sectionCount}>{verifiedTx.length} đã xác nhận</Text>
              </View>

              {verifiedTx.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>Chưa có giao dịch nào được xác nhận.</Text>
                </View>
              ) : (
                <View style={s.txCard}>
                  {shownTx.map((tx, i) => {
                    const mc = methodOf(tx.method);
                    return (
                      <View key={tx.id} style={[s.txRow, i > 0 && s.txRowBorder]}>
                        <View style={s.txIcon}><Text style={{ fontSize: 16 }}>{mc.icon}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.txName}>
                            {tx.tenantName}{tx.roomNumber ? ` · ${tx.roomNumber}` : ''}
                          </Text>
                          <Text style={s.txMeta}>
                            {mc.label} · {fmtWhen(tx.verifiedAt || tx.createdAt)}
                          </Text>
                        </View>
                        <Text style={s.txAmt}>+{fmt(tx.amount)}</Text>
                      </View>
                    );
                  })}
                  {verifiedTx.length > TX_PREVIEW && (
                    <TouchableOpacity style={s.txMore} onPress={() => setShowAllTx(v => !v)}>
                      <Text style={s.txMoreText}>
                        {showAllTx ? 'Thu gọn' : `Xem thêm ${verifiedTx.length - TX_PREVIEW} giao dịch`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {invoices.length === 0 && pendingVerifications.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>🧾</Text>
                <Text style={s.emptyText}>
                  Chưa có hoá đơn tiền nhà nào trong kỳ này.{'\n'}
                  Hệ thống tự phát hành vào ngày {RENT_CYCLE.issueDay} hằng tháng.
                </Text>
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
  loading: { paddingVertical: Spacing.xl * 2, alignItems: 'center' },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingTop: Spacing.md, paddingBottom: Spacing.base,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // ── (1) Hero: kỳ này thu tới đâu ──
  heroCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg, ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  autoChip: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  autoChipText: { fontSize: 10.5, fontWeight: '800', color: Colors.primary },
  heroAmount: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginTop: Spacing.sm },
  heroTotal: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },

  heroStats: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.base, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 18, fontWeight: '800' },
  heroStatLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  heroSep: { width: 1, height: 26, backgroundColor: Colors.divider },

  // ── Thanh tiến độ (dùng chung hero + thẻ nhà) ──
  progRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  progBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 3 },
  progPct: { fontSize: 11, fontWeight: '800', minWidth: 34, textAlign: 'right' },

  // ── Section chung ──
  section: { marginBottom: Spacing.lg },
  // Các con bên trong đã có marginBottom nên hàng này không thêm nữa (tránh hở gấp đôi).
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionLink:  { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  sectionCount: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },

  // ── (2) Việc cần xử lý ──
  todoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  todoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todoTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  todoSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  todoArrow: { fontSize: 20, color: Colors.textMuted, fontWeight: '700' },

  clearCard: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, alignItems: 'center',
  },
  clearText: { fontSize: 13, fontWeight: '700', color: Colors.success },

  verifyCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  verifyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  verifyName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  verifyMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  verifyAmt:  { fontSize: 16, fontWeight: '900', color: Colors.primary },
  verifyContent: {
    fontSize: 11.5, color: Colors.textSecondary, backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: Spacing.sm,
  },
  verifyActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  rejectBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  approveBtn: {
    flex: 1.6, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.success,
  },
  approveBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },

  // ── (3) Theo nhà ──
  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  buildingTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buildingName: { flex: 1, fontSize: 14.5, fontWeight: '800', color: Colors.textPrimary },
  overdueTag: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  overdueTagText: { fontSize: 10, fontWeight: '800', color: Colors.error },
  buildingArrow: { fontSize: 20, color: Colors.textMuted, fontWeight: '700' },
  buildingMoney: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 6 },
  buildingCount: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted },

  // ── (4) Giao dịch ──
  txCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  txRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  txIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  txName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  txMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  txAmt:  { fontSize: 14, fontWeight: '800', color: Colors.success },
  txMore: {
    paddingVertical: Spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  txMoreText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },

  // ── Rỗng ──
  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
