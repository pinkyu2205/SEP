import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_TERMINATION_AFTER_DAYS,
  BILL_PAYMENT_DAYS, canTerminateForUnpaidInvoice,
} from '@/constants';
import { billMonthLabel, formatCurrency, formatDate, getDaysUntil } from '@/utils';
import { SharedBill, InvoiceType } from '@/types/bill';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { InvoicePaymentModal } from '@/components/invoice/InvoicePaymentModal';
import { isDisputeOpen } from '@/types/invoiceDispute';

type Invoice = SharedBill;
/** MỘT bộ lọc duy nhất: tất cả / quá hạn / từng loại phí. */
type Filter = 'all' | 'overdue' | InvoiceType;

/**
 * MÀN HOÁ ĐƠN (tenant) — làm lại 24/09/2026.
 *
 * Đây là nơi DUY NHẤT khách bấm thanh toán, và chỉ chứa khoản CÒN PHẢI TRẢ — đã trả nằm ở
 * màn Lịch sử (nút góc trên).
 *
 * Bản trước có HAI hàng chip (loại phí × trạng thái, 11 chip, bị cắt ở mép phải) cộng tiêu
 * đề nhóm theo loại lặp lại đúng thông tin của chip và badge trên thẻ — khách nhìn loạn.
 * Mà trạng thái trên màn này thực ra chỉ có 2: chờ trả hoặc quá hạn ("Trả 1 phần" không bao
 * giờ xảy ra — hệ thống chỉ thu đủ; hoá đơn huỷ không phải khoản phải trả). Nên giờ:
 *   • 1 hàng chip: Tất cả · Quá hạn · rồi CHỈ những loại phí đang có hoá đơn.
 *   • Danh sách phẳng, quá hạn lên đầu rồi tới hạn gần nhất — thứ cần trả trước nằm trên.
 *   • Thẻ gọn: loại + kỳ, số tiền, hạn, nút trả. Cả thẻ bấm được để xem chi tiết.
 */

const TYPE_ORDER: InvoiceType[] = ['rent', 'electricity', 'water', 'maintenance', 'deposit'];

const TYPE_CONFIG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Tiền điện',  icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Tiền nước',  icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí sửa chữa', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  // `deposit` = hoá đơn HD-ONBOARD-*, GỘP cọc + tiền nhà chu kỳ đầu (xem types/bill.ts).
  deposit:     { label: 'Thu khi nhận phòng', icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};
const FALLBACK_TYPE = { label: 'Khoản khác', icon: '📄', color: Colors.textSecondary, bg: Colors.background };
const typeCfgOf = (t: InvoiceType) => TYPE_CONFIG[t] ?? FALLBACK_TYPE;

const CHIP_LABEL: Record<InvoiceType, string> = {
  rent: '🏠 Phòng', electricity: '⚡ Điện', water: '💧 Nước', maintenance: '🔧 Sửa chữa', deposit: '🔐 Nhận phòng',
};

type PendingCharge = Awaited<ReturnType<typeof realTenantBillingService.listPendingCharges>>[number];

const PENDING_CHARGE_CATEGORY: Record<string, string> = {
  MAINTENANCE: 'Phí sửa chữa (khách làm hư)',
};

export const InvoiceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<SharedBill[]>([]);
  // Khoản chờ thu (đã nghiệm thu, CHƯA phát hành hoá đơn) — báo trước để khách không bất ngờ.
  const [pendingCharges, setPendingCharges] = useState<PendingCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const reload = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    Promise.all([
      realTenantBillingService.listInvoices().catch(() => []),
      realTenantBillingService.listPendingCharges().catch(() => [] as PendingCharge[]),
    ])
      .then(([inv, charges]) => {
        setInvoices(inv.map(toSharedBill));
        setPendingCharges(charges.filter(c => (c.status || '').toUpperCase() === 'PENDING'));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // BE bắn `INVOICE_PAID` khi khách trả xong (QR/PayOS hoặc quản lý xác nhận) → nạp lại.
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: () => reload(),
  });

  const pendingChargeTotal = pendingCharges.reduce((s, c) => s + (c.amount ?? 0), 0);

  /** Chỉ khoản còn phải trả. `partial` gộp vào đây cho chắc dù BE không gán. */
  const owing = useMemo(
    () => invoices
      .filter(i => i.status === 'pending' || i.status === 'overdue' || i.status === 'partial')
      .sort((a, b) => {
        const ao = a.status === 'overdue' ? 0 : 1;
        const bo = b.status === 'overdue' ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      }),
    [invoices],
  );

  const overdue = owing.filter(i => i.status === 'overdue');
  const total = owing.reduce((s, i) => s + i.grandTotal, 0);
  const overdueTotal = overdue.reduce((s, i) => s + i.grandTotal, 0);

  // Chip: chỉ hiện loại đang có hoá đơn — không còn chip "0" mờ chiếm chỗ.
  const chips = useMemo(() => {
    const list: { key: Filter; label: string; count: number; danger?: boolean }[] = [
      { key: 'all', label: 'Tất cả', count: owing.length },
    ];
    if (overdue.length > 0) list.push({ key: 'overdue', label: 'Quá hạn', count: overdue.length, danger: true });
    for (const t of TYPE_ORDER) {
      const n = owing.filter(i => i.invoiceType === t).length;
      if (n > 0) list.push({ key: t, label: CHIP_LABEL[t], count: n });
    }
    return list;
  }, [owing, overdue.length]);

  // Chip đang chọn biến mất (vừa trả xong hết loại đó) → tự về "Tất cả".
  const activeFilter: Filter = chips.some(c => c.key === filter) ? filter : 'all';
  const visible = owing.filter(i =>
    activeFilter === 'all' ? true
      : activeFilter === 'overdue' ? i.status === 'overdue'
        : i.invoiceType === activeFilter);

  const handleInvoiceUpdate = (updated: Invoice) => {
    setPayingInvoice(updated);
    setInvoices(prev => prev.map(i => (i.id === updated.id ? updated : i)));
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const typeCfg = typeCfgOf(item.invoiceType);
    const isOverdue = item.status === 'overdue';
    const daysOverdue = isOverdue ? Math.abs(getDaysUntil(item.dueDate)) : 0;
    const daysLeft = !isOverdue ? getDaysUntil(item.dueDate) : 0;
    // Hoá đơn đang tra soát theo khiếu nại của khách — hạn tạm dừng, nói rõ để khách khỏi hoảng.
    const disputePending = isDisputeOpen(item.dispute);
    const period = billMonthLabel(item);
    const usage = item.invoiceType === 'electricity' && item.kwhUsed !== undefined
      ? `${item.kwhUsed} kWh`
      : item.invoiceType === 'water' && item.m3Used !== undefined
        ? `${item.m3Used} m³`
        : null;

    const dueText = disputePending
      ? 'Đang tra soát — tạm dừng hạn'
      : isOverdue
        ? `Quá hạn ${daysOverdue} ngày`
        : daysLeft === 0
          ? 'Hạn hôm nay'
          : daysLeft > 0 && daysLeft <= 3
            ? `Còn ${daysLeft} ngày · hạn ${formatDate(item.dueDate)}`
            : `Hạn ${formatDate(item.dueDate)}`;
    const dueColor = disputePending ? Colors.info
      : isOverdue ? Colors.error
        : daysLeft <= 3 ? Colors.warning : Colors.textMuted;

    return (
      <TouchableOpacity
        style={[styles.card, isOverdue && styles.cardOverdue]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('InvoiceDetail', { invoice: item })}
      >
        <View style={styles.cardTop}>
          <View style={[styles.typeIcon, { backgroundColor: typeCfg.bg }]}>
            <Text style={styles.typeIconText}>{typeCfg.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {typeCfg.label}{period ? ` ${period}` : ''}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {[item.roomName && `Phòng ${item.roomName}`, usage].filter(Boolean).join(' · ') || item.propertyName}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <View style={styles.amountRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.amount, isOverdue && { color: Colors.error }]}>
              {formatCurrency(item.grandTotal)}
            </Text>
            {(item.lateFee ?? 0) > 0 && (
              <Text style={styles.lateFee}>gồm phí trả chậm {formatCurrency(item.lateFee)}</Text>
            )}
          </View>
          <Text style={[styles.due, { color: dueColor }]}>{dueText}</Text>
        </View>

        {/* Tiền phòng quá hạn: không phạt tiền, nhưng leo thang tới chấm dứt HĐ. */}
        {isOverdue && item.invoiceType === 'rent' && (
          <Text style={styles.risk}>
            {daysOverdue >= RENT_TERMINATION_AFTER_DAYS
              ? 'Đã quá ngày nhắc cuối — quản lý được quyền chấm dứt hợp đồng.'
              : `Tới ngày ${RENT_CYCLE.terminationFromDay} chưa trả thì quản lý được quyền chấm dứt hợp đồng.`}
          </Text>
        )}

        {/* Điện, nước, phí sửa chữa, dịch vụ (24/09/2026): KHÔNG phí trễ hạn, hạn 5 ngày kể từ
            ngày phát hành, quá hạn là quản lý được quyền chấm dứt HĐ ngay — nói trước cho khách. */}
        {item.invoiceType !== 'rent' && item.invoiceType !== 'deposit' && !disputePending && (() => {
          const deadline = item.dueDate;
          const canTerm = canTerminateForUnpaidInvoice({
            type: item.invoiceType, status: item.status, dueDate: item.dueDate, createdAt: item.createdAt,
          });
          return (
            <Text style={[styles.risk, !canTerm && styles.riskSoft]}>
              {canTerm
                ? `Đã quá ${BILL_PAYMENT_DAYS} ngày kể từ ngày phát hành — quản lý được quyền chấm dứt hợp đồng. Thanh toán ngay.`
                : `Trả trước ${deadline ? formatDate(deadline) : 'hạn'} (${BILL_PAYMENT_DAYS} ngày kể từ ngày phát hành). Quá hạn này quản lý được quyền chấm dứt hợp đồng.`}
            </Text>
          );
        })()}

        <TouchableOpacity
          style={[styles.payBtn, isOverdue && { backgroundColor: Colors.error }]}
          onPress={() => setPayingInvoice(item)}
          activeOpacity={0.85}
        >
          <Text style={styles.payBtnText}>Thanh toán</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View style={{ gap: Spacing.md }}>
      {/* Tổng phải trả */}
      {/* Thẻ trắng, chỉ phần quá hạn mang màu đỏ — tô đỏ cả khối thì 300k quá hạn trông
          như cả 6 triệu đều trễ, khách hoảng không cần thiết. */}
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>{owing.length > 0 ? 'Tổng cần thanh toán' : 'Bạn không còn nợ khoản nào'}</Text>
        <Text style={styles.summaryValue}>{formatCurrency(total)}</Text>
        {owing.length > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summarySub}>{owing.length} hoá đơn</Text>
            {overdue.length > 0 && (
              <TouchableOpacity style={styles.overduePill} onPress={() => setFilter('overdue')} activeOpacity={0.8}>
                <Text style={styles.overduePillText}>
                  {overdue.length} quá hạn · {formatCurrency(overdueTotal)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {pendingCharges.length > 0 && (
        <View style={styles.pendingCharge}>
          <Text style={styles.pendingChargeTitle}>
            Sắp tính vào kỳ tới · {formatCurrency(pendingChargeTotal)}
          </Text>
          {pendingCharges.map(c => (
            <View key={c.id} style={styles.pendingChargeRow}>
              <Text style={styles.pendingChargeName} numberOfLines={1}>
                {PENDING_CHARGE_CATEGORY[(c.category || '').toUpperCase()] ?? c.category ?? 'Khoản thu khác'}
                {c.createdAt ? ` · ${formatDate(c.createdAt)}` : ''}
              </Text>
              <Text style={styles.pendingChargeAmount}>{formatCurrency(c.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Một hàng lọc duy nhất */}
      {owing.length > 0 && chips.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map(c => {
            const active = activeFilter === c.key;
            const activeColor = c.danger ? Colors.error : Colors.primary;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, active && { backgroundColor: activeColor, borderColor: activeColor }]}
                onPress={() => setFilter(c.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, c.danger && !active && { color: Colors.error }, active && styles.chipTextActive]}>
                  {c.label} {c.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Hoá đơn</Text>
        {/* Trỏ về PaymentHistory — nơi xem mọi khoản đã trả. */}
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('PaymentHistory')}>
          <Text style={styles.historyBtnText}>🕘 Đã trả</Text>
        </TouchableOpacity>
      </View>

      {loading && invoices.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={i => i.id}
          renderItem={renderInvoice}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={{ marginBottom: Spacing.md }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={Colors.primary} />}
          ListEmptyComponent={
            owing.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>✅</Text>
                <Text style={styles.emptyTitle}>Đã thanh toán hết</Text>
                <Text style={styles.emptyDesc}>Xem lại các khoản đã trả ở mục "Đã trả".</Text>
              </View>
            ) : null
          }
        />
      )}

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  historyBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.full,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: 110 },

  // Tổng
  summary: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  summaryValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  summarySub: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  overduePill: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  overduePillText: { fontSize: 12, fontWeight: '700', color: Colors.error },

  // Khoản chờ thu kỳ tới
  pendingCharge: {
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: '#FDE68A', gap: 4,
  },
  pendingChargeTitle: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  pendingChargeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pendingChargeName: { flex: 1, fontSize: 12, color: '#B45309' },
  pendingChargeAmount: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  // Chip lọc
  chips: { gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  // Thẻ hoá đơn
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  cardOverdue: { borderColor: '#FCA5A5', borderLeftWidth: 4, borderLeftColor: Colors.error },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  typeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeIconText: { fontSize: 18 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  cardSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 22, color: Colors.textMuted },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.md, gap: Spacing.sm },
  amount: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  lateFee: { fontSize: 11, color: Colors.error, marginTop: 1 },
  due: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  risk: {
    fontSize: 12, color: '#991B1B', backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6,
    marginTop: Spacing.sm, lineHeight: 17,
  },
  riskSoft: { color: '#92400E', backgroundColor: '#FFFBEB' },
  payBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 11, alignItems: 'center',
  },
  payBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
