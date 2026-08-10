import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_TERMINATION_AFTER_DAYS,
  isFirstRentCycleInvoice, firstCycleStage, firstCycleDeadline, firstCycleTenantWarning,
} from '@/constants';
import { formatCurrency, formatDate, getDaysUntil } from '@/utils';
import { SharedBill, BillStatus, InvoiceType } from '@/store/billsStore';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { InvoicePaymentModal } from '@/components/invoice/InvoicePaymentModal';

type Invoice = SharedBill;
type InvoiceStatus = BillStatus;
type TypeFilter = 'all' | InvoiceType;
type StatusFilter = 'all' | 'unpaid' | InvoiceStatus;

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Chờ thanh toán',    color: Colors.warning, bg: Colors.warningLight },
  paid:      { label: 'Đã thanh toán',     color: Colors.success, bg: Colors.successLight },
  overdue:   { label: 'Quá hạn',           color: Colors.error,   bg: Colors.errorLight },
  partial:   { label: 'Thanh toán 1 phần', color: Colors.info,    bg: Colors.infoLight },
  cancelled: { label: 'Đã huỷ',           color: Colors.textMuted, bg: Colors.background },
};

const TYPE_CONFIG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  deposit:     { label: 'Tiền cọc',   icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};

const TYPE_FILTER_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all',         label: 'Tất cả' },
  { key: 'rent',        label: '🏠 Phòng' },
  { key: 'electricity', label: '⚡ Điện' },
  { key: 'water',       label: '💧 Nước' },
];

const STATUS_FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'unpaid',  label: 'Chưa TT' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'paid',    label: 'Đã TT' },
  { key: 'all',     label: 'Tất cả' },
];

type PendingCharge = Awaited<ReturnType<typeof realTenantBillingService.listPendingCharges>>[number];

const PENDING_CHARGE_CATEGORY: Record<string, string> = {
  MAINTENANCE: 'Phí sửa chữa (khách làm hư)',
};

export const InvoiceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<SharedBill[]>([]);
  // Khoản chờ thu (đã nghiệm thu, CHƯA phát hành hóa đơn) — hiện trước để khách không
  // bất ngờ khi hóa đơn MAINTENANCE xuất hiện kỳ tới.
  const [pendingCharges, setPendingCharges] = useState<PendingCharge[]>([]);
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unpaid');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      realTenantBillingService.listInvoices().catch(() => []),
      realTenantBillingService.listPendingCharges().catch(() => [] as PendingCharge[]),
    ])
      .then(([inv, charges]) => {
        setInvoices(inv.map(toSharedBill));
        setPendingCharges(charges.filter(c => (c.status || '').toUpperCase() === 'PENDING'));
      })
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const pendingChargeTotal = pendingCharges.reduce((s, c) => s + (c.amount ?? 0), 0);

  const filtered = invoices.filter(i => {
    if (typeFilter !== 'all' && i.invoiceType !== typeFilter) return false;
    if (statusFilter === 'unpaid') return i.status === 'pending' || i.status === 'overdue';
    if (statusFilter === 'all') return true;
    return i.status === statusFilter;
  });

  const overdueCount = invoices.filter(i => i.status === 'overdue').length;
  const pendingTotal = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.grandTotal, 0);
  const paidCount = invoices.filter(i => i.status === 'paid').length;

  const unpaidByType = (type: InvoiceType) =>
    invoices.filter(i => i.invoiceType === type && (i.status === 'pending' || i.status === 'overdue'));

  const handlePay = (invoice: Invoice) => setPayingInvoice(invoice);

  // Cập nhật invoice đang thanh toán + đồng bộ luôn vào danh sách (không cần reload cả trang).
  const handleInvoiceUpdate = (updated: Invoice) => {
    setPayingInvoice(updated);
    setInvoices(prev => prev.map(i => (i.id === updated.id ? updated : i)));
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const cfg     = STATUS_CONFIG[item.status];
    const typeCfg = TYPE_CONFIG[item.invoiceType];
    const isPaid    = item.status === 'paid';
    // Kỳ đầu chạy chính sách riêng: hạn thật là ngày nhận phòng + 3 ngày, KHÔNG phải
    // dueDate của BE (BE đang đặt dueDate = đúng ngày nhận phòng nên hôm sau đã gắn
    // OVERDUE). Trong 3 ngày đó vẫn coi là "chờ thanh toán" để khỏi doạ khách oan.
    const isFirstCycle = isFirstRentCycleInvoice(item);
    const firstCycleExpired = isFirstCycle && firstCycleStage(item) === 'expired';
    const isOverdue = isFirstCycle
      ? firstCycleExpired && !isPaid
      : item.status === 'overdue';
    const dueDate = isFirstCycle ? firstCycleDeadline(item) : item.dueDate;
    const daysOverdue = isOverdue ? Math.abs(getDaysUntil(dueDate)) : 0;

    return (
      <TouchableOpacity
        style={[styles.card, isOverdue && styles.cardOverdue]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('InvoiceDetail', { invoice: item })}
      >
        {isOverdue && <View style={styles.overdueStripe} />}

        {/* Header: type badge + month + status */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.typeBadge, { backgroundColor: typeCfg.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>
                {typeCfg.icon} {typeCfg.label}
              </Text>
            </View>
            <Text style={styles.invoiceMonth}>T{String(item.month).padStart(2, '0')}/{item.year}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isFirstCycle && !isPaid && !isOverdue ? Colors.warningLight : cfg.bg }]}>
            <Text style={[styles.statusText, { color: isFirstCycle && !isPaid && !isOverdue ? Colors.warning : cfg.color }]}>
              {isFirstCycle && !isPaid && !isOverdue ? 'Chờ thanh toán' : cfg.label}
            </Text>
          </View>
        </View>

        {/* Room info */}
        <Text style={styles.invoiceRoom}>{item.roomName} · {item.propertyName}</Text>

        {/* Utility detail line */}
        {item.invoiceType === 'electricity' && item.kwhUsed !== undefined && (
          <Text style={styles.utilityDetail}>⚡ {item.kwhUsed} kWh · {item.billingPeriod ?? '—'}</Text>
        )}
        {item.invoiceType === 'water' && item.m3Used !== undefined && (
          <Text style={styles.utilityDetail}>💧 {item.m3Used} m³ · {item.billingPeriod ?? '—'}</Text>
        )}

        {/* Amount row + due date */}
        <View style={styles.amountRow}>
          <Text style={[styles.amountVal, isOverdue && { color: Colors.error }, isPaid && { color: Colors.success }]}>
            {formatCurrency(item.grandTotal)}
          </Text>
          {isPaid ? (
            <Text style={styles.paidDateText}>✅ {item.paidAt ? formatDate(item.paidAt) : 'Đã TT'}</Text>
          ) : (
            <Text style={[styles.dueDateText, isOverdue && { color: Colors.error }]}>
              {isOverdue
                ? `Quá hạn ${daysOverdue} ngày`
                : `Hạn: ${formatDate(dueDate)}`}
            </Text>
          )}
        </View>

        {(item.lateFee ?? 0) > 0 && (
          <Text style={styles.lateFeeText}>+ Phí trả chậm: {formatCurrency(item.lateFee)}</Text>
        )}

        {/* Tiền phòng quá hạn: không phạt tiền, nhưng leo thang tới chấm dứt HĐ.
            Kỳ đầu có mốc riêng (3 ngày) nên cảnh báo ngay cả khi CHƯA quá hạn. */}
        {isFirstCycle && !isPaid ? (
          <Text style={styles.riskText}>⚠️ {firstCycleTenantWarning(item)}</Text>
        ) : isOverdue && item.invoiceType === 'rent' ? (
          <Text style={styles.riskText}>
            {daysOverdue >= RENT_TERMINATION_AFTER_DAYS
              ? '⚠️ Đã quá ngày nhắc cuối — quản lý được quyền chấm dứt hợp đồng.'
              : `⚠️ Tới ngày ${RENT_CYCLE.terminationFromDay} chưa thanh toán thì quản lý được quyền chấm dứt hợp đồng.`}
          </Text>
        ) : null}

        {/* Action buttons.
            Kỳ đầu còn trong 3 ngày: BE đã gắn OVERDUE nhưng ta vẫn coi là chờ thanh
            toán, nên phải mở nút thường ở đây — không thì hoá đơn không có nút nào. */}
        {(item.status === 'pending' || (isFirstCycle && !isPaid && !isOverdue)) && (
          <TouchableOpacity style={styles.payBtn} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>💳 Thanh toán ngay</Text>
          </TouchableOpacity>
        )}
        {isOverdue && (
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: Colors.error }]} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>🚨 Thanh toán ngay (Quá hạn)</Text>
          </TouchableOpacity>
        )}

        <View style={styles.detailFooter}>
          <Text style={styles.detailLink}>Xem chi tiết →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Hóa đơn</Text>
          <Text style={styles.subtitle}>Tiền phòng · Điện · Nước</Text>
        </View>
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('InvoiceHistory')}>
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tổng phải trả ──
          Trước đây đây là một ScrollView ngang đặt thẳng trong SafeAreaView (cột flex):
          ScrollView không có chiều cao nội dung cố định nên bị kéo giãn, chừa một
          mảng trắng to giữa tiêu đề và bộ lọc. Giờ bọc trong View và cho ScrollView
          `flexGrow: 0` nên khối chỉ cao đúng bằng nội dung.

          Nội dung cũng gộp lại: mỗi loại một thẻ to xếp dọc (icon/nhãn/tiền) vừa cao
          vừa lặp lại đúng con số của thẻ hoá đơn ngay bên dưới. Giờ là một dòng
          "Cần thanh toán + tổng tiền", loại phí thu nhỏ thành chip lọc nhanh. */}
      {(overdueCount > 0 || pendingTotal > 0) && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryTotalBox}>
              <Text style={styles.summaryTotalLabel}>Cần thanh toán</Text>
              <Text style={styles.summaryTotalValue}>{formatCurrency(pendingTotal)}</Text>
            </View>
            {overdueCount > 0 && (
              <TouchableOpacity
                style={[styles.overduePill, statusFilter === 'overdue' && styles.overduePillActive]}
                onPress={() => { setTypeFilter('all'); setStatusFilter('overdue'); }}
              >
                <Text style={[styles.overduePillText, statusFilter === 'overdue' && { color: Colors.white }]}>
                  ⚠️ {overdueCount} quá hạn
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.summaryTypesScroll}
            contentContainerStyle={styles.summaryTypes}
          >
            {(['rent', 'electricity', 'water'] as InvoiceType[]).map(type => {
              const bills = unpaidByType(type);
              if (!bills.length) return null;
              const cfg = TYPE_CONFIG[type];
              const total = bills.reduce((s, b) => s + b.grandTotal, 0);
              const isActive = typeFilter === type && statusFilter === 'unpaid';
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, { backgroundColor: cfg.bg }, isActive && styles.typeChipActive]}
                  onPress={() => { setTypeFilter(type); setStatusFilter('unpaid'); }}
                >
                  <Text style={styles.typeChipIcon}>{cfg.icon}</Text>
                  <Text style={[styles.typeChipLabel, { color: cfg.color }]} numberOfLines={1}>
                    {cfg.label}
                  </Text>
                  <Text style={[styles.typeChipAmount, { color: cfg.color }]} numberOfLines={1}>
                    {formatCurrency(total)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Filter row 1: Loại ── */}
      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>Loại</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {TYPE_FILTER_TABS.map(f => {
            const isActive = typeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setTypeFilter(f.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Filter row 2: Trạng thái ── */}
      <View style={[styles.filterBlock, styles.filterBlockLast]}>
        <Text style={styles.filterLabel}>Trạng thái</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {STATUS_FILTER_TABS.map(f => {
            const isActive = statusFilter === f.key;
            const activeStyle = f.key === 'overdue' ? styles.filterChipOverdue
              : f.key === 'paid' ? styles.filterChipPaid
              : styles.filterChipActive;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isActive && activeStyle]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderInvoice}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          pendingCharges.length > 0 ? (
            <View style={styles.pendingChargeCard}>
              <Text style={styles.pendingChargeTitle}>
                ⏳ Khoản chờ thu kỳ tới — {formatCurrency(pendingChargeTotal)}
              </Text>
              <Text style={styles.pendingChargeDesc}>
                Các khoản dưới đây đã được xác nhận và sẽ được đưa vào hóa đơn kỳ tới.
              </Text>
              {pendingCharges.map(c => (
                <View key={c.id} style={styles.pendingChargeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingChargeName}>
                      {PENDING_CHARGE_CATEGORY[(c.category || '').toUpperCase()] ?? c.category ?? 'Khoản thu khác'}
                    </Text>
                    {!!c.note && <Text style={styles.pendingChargeNote} numberOfLines={2}>{c.note}</Text>}
                    {!!c.createdAt && <Text style={styles.pendingChargeNote}>Ghi nhận {formatDate(c.createdAt)}</Text>}
                  </View>
                  <Text style={styles.pendingChargeAmount}>{formatCurrency(c.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.emptyDesc, { marginTop: Spacing.md }]}>Đang tải hóa đơn...</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>
                {statusFilter === 'paid' ? '✅' : '📄'}
              </Text>
              <Text style={styles.emptyTitle}>Không có hóa đơn</Text>
              <Text style={styles.emptyDesc}>
                {statusFilter === 'paid'
                  ? 'Chưa có hóa đơn nào đã thanh toán.'
                  : statusFilter === 'unpaid'
                    ? 'Tất cả hóa đơn đã được thanh toán.'
                    : 'Không có hóa đơn nào phù hợp với bộ lọc này.'}
              </Text>
            </View>
          )
        }
      />

      <InvoicePaymentModal
        visible={!!payingInvoice}
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onUpdate={handleInvoiceUpdate}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  historyBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Summary chips
  summaryCard: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingTop: Spacing.sm, paddingBottom: Spacing.sm, paddingLeft: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  summaryTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: Spacing.md,
  },
  summaryTotalBox: { flex: 1 },
  summaryTotalLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  summaryTotalValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginTop: 1 },
  // flexGrow: 0 — không có nó thì ScrollView ngang bị kéo giãn theo chiều dọc.
  summaryTypesScroll: { flexGrow: 0, marginTop: Spacing.sm },
  summaryTypes: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: Spacing.md },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  typeChipActive: { borderColor: Colors.primary + '80' },
  typeChipIcon: { fontSize: 12 },
  typeChipLabel: { fontSize: 11, fontWeight: '700' },
  typeChipAmount: { fontSize: 11, fontWeight: '800' },
  overduePill: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs,
    borderWidth: 1, borderColor: Colors.error + '40',
  },
  overduePillActive: { backgroundColor: Colors.error },
  overduePillText: { fontSize: 11, fontWeight: '700', color: Colors.error },

  // Filter rows
  filterBlock: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: Spacing.lg, paddingBottom: Spacing.xs,
  },
  filterBlockLast: { paddingBottom: Spacing.sm },
  filterLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    width: 72, flexShrink: 0,
  },
  filterChips: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingRight: Spacing.lg },
  filterChip: {
    height: 32, paddingHorizontal: 14, borderRadius: BorderRadius.full,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipOverdue: { backgroundColor: Colors.error,   borderColor: Colors.error   },
  filterChipPaid:    { backgroundColor: Colors.success, borderColor: Colors.success },
  filterText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  // Khoản chờ thu (pending charges — chưa thành hóa đơn)
  pendingChargeCard: {
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  pendingChargeTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  pendingChargeDesc: { fontSize: 12, color: '#B45309', marginTop: 2, lineHeight: 18 },
  pendingChargeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: '#FDE68A',
  },
  pendingChargeName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  pendingChargeNote: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pendingChargeAmount: { fontSize: 14, fontWeight: '800', color: '#B45309' },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md, overflow: 'hidden' },
  cardOverdue: { borderWidth: 1.5, borderColor: Colors.error + '60' },
  overdueStripe: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, backgroundColor: Colors.error },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  invoiceMonth: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  invoiceRoom: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  utilityDetail: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.xs },
  statusBadge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  amountVal: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  dueDateText: { fontSize: 12, color: Colors.textSecondary },
  paidDateText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  lateFeeText: { fontSize: 12, color: Colors.error, fontWeight: '600', marginTop: 3 },
  riskText: { fontSize: 11, color: Colors.error, fontWeight: '700', marginTop: 4, lineHeight: 16 },

  payBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  payBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
