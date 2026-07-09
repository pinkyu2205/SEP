import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { useBills, InvoiceType } from '@/store/billsStore';

// ===================== CONFIG =====================
const TYPE_CONFIG: Record<InvoiceType, { icon: string; label: string; color: string; bg: string }> = {
  rent:        { icon: '🏠', label: 'Tiền phòng', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { icon: '⚡', label: 'Điện',       color: '#D97706', bg: '#FEF9C3' },
  water:       { icon: '💧', label: 'Nước',        color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { icon: '🔧', label: 'Phí bảo trì',  color: '#DC2626', bg: '#FEE2E2' },
};

const METHOD_LABEL: Record<string, string> = {
  qr:            '📱 QR',
  bank_transfer: '🏦 Chuyển khoản',
  cash:          '💵 Tiền mặt',
  ewallet:       '👛 Ví điện tử',
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

type TypeFilter   = 'all' | InvoiceType;
type StatusFilter = 'all' | 'paid' | 'overdue' | 'cancelled';

// ===================== SCREEN =====================
export const BillingHistoryScreen: React.FC = () => {
  const navigation  = useNavigation<any>();
  const allBills    = useBills();
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Only manager bills (HD- prefix), excluding currently pending ones
  const historyBills = useMemo(() => {
    return allBills
      .filter(b => b.code.startsWith('HD-'))
      .filter(b => {
        if (statusFilter === 'all')       return b.status === 'paid' || b.status === 'overdue' || b.status === 'cancelled';
        return b.status === statusFilter;
      })
      .filter(b => typeFilter === 'all' || b.invoiceType === typeFilter)
      .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt));
  }, [allBills, typeFilter, statusFilter]);

  const totalPaid = useMemo(
    () => historyBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.grandTotal, 0),
    [historyBills],
  );

  const counts = useMemo(() => ({
    paid:      allBills.filter(b => b.code.startsWith('HD-') && b.status === 'paid').length,
    overdue:   allBills.filter(b => b.code.startsWith('HD-') && b.status === 'overdue').length,
    cancelled: allBills.filter(b => b.code.startsWith('HD-') && b.status === 'cancelled').length,
  }), [allBills]);

  const renderItem = ({ item }: { item: (typeof historyBills)[0] }) => {
    const typeCfg = TYPE_CONFIG[item.invoiceType];
    const isPaid      = item.status === 'paid';
    const isOverdue   = item.status === 'overdue';
    const isCancelled = item.status === 'cancelled';

    return (
      <View style={[
        st.card,
        isPaid      && st.cardPaid,
        isOverdue   && st.cardOverdue,
        isCancelled && st.cardCancelled,
      ]}>
        {/* Top row: type badge + status badge */}
        <View style={st.cardTop}>
          <View style={[st.typeBadge, { backgroundColor: typeCfg.bg }]}>
            <Text style={[st.typeBadgeText, { color: typeCfg.color }]}>
              {typeCfg.icon} {typeCfg.label}
            </Text>
          </View>
          <View style={[
            st.statusBadge,
            isPaid      ? st.statusPaid :
            isOverdue   ? st.statusOverdue :
            st.statusCancelled,
          ]}>
            <Text style={[
              st.statusBadgeText,
              { color: isPaid ? Colors.success : isOverdue ? Colors.error : Colors.textMuted },
            ]}>
              {isPaid ? '✓ Đã thu' : isOverdue ? 'Quá hạn' : 'Đã huỷ'}
            </Text>
          </View>
        </View>

        {/* Middle: info + amount */}
        <View style={st.cardMid}>
          <View style={{ flex: 1 }}>
            <Text style={st.code}>{item.code}</Text>
            <Text style={st.meta}>{item.tenantName} · {item.roomName}</Text>
            <Text style={st.prop}>{item.propertyName}</Text>
          </View>
          <Text style={[st.amount, { color: isPaid ? Colors.success : isOverdue ? Colors.error : Colors.textMuted }]}>
            {fmt(item.grandTotal)}
          </Text>
        </View>

        {/* Utility detail */}
        {item.invoiceType === 'electricity' && item.kwhUsed !== undefined && (
          <Text style={st.detail}>⚡ {item.kwhUsed} kWh · {item.billingPeriod ?? ''}</Text>
        )}
        {item.invoiceType === 'water' && item.m3Used !== undefined && (
          <Text style={st.detail}>💧 {item.m3Used} m³ · {item.billingPeriod ?? ''}</Text>
        )}

        {/* Footer: date + method */}
        <View style={st.cardFoot}>
          <Text style={st.date}>
            {isPaid && item.paidAt ? `Đã thu: ${item.paidAt}` : `Tạo: ${item.createdAt}`}
          </Text>
          {item.paymentMethod && (
            <Text style={st.method}>{METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={st.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Lịch sử hóa đơn</Text>
        <View style={{ width: 70 }} />
      </View>

      {/* Summary bar */}
      <View style={st.summaryRow}>
        <View style={st.summaryItem}>
          <Text style={[st.summaryNum, { color: Colors.success }]}>{counts.paid}</Text>
          <Text style={st.summaryLbl}>Đã thu</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={[st.summaryNum, { color: Colors.error }]}>{counts.overdue}</Text>
          <Text style={st.summaryLbl}>Quá hạn</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={[st.summaryItem, { flex: 2 }]}>
          <Text style={[st.summaryAmt, { color: Colors.success }]}>{fmt(totalPaid)}</Text>
          <Text style={st.summaryLbl}>Tổng đã thu</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={st.filterBlock}>
        {/* Row 1 – Loại hóa đơn */}
        <View style={st.filterRow}>
          <Text style={st.filterLabel}>Loại</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
            {([
              { key: 'all',         label: 'Tất cả' },
              { key: 'rent',        label: '🏠 Tiền phòng' },
              { key: 'electricity', label: '⚡ Điện' },
              { key: 'water',       label: '💧 Nước' },
            ] as { key: TypeFilter; label: string }[]).map(f => (
              <TouchableOpacity
                key={f.key}
                style={[st.chip, typeFilter === f.key && st.chipActive]}
                onPress={() => setTypeFilter(f.key)}
              >
                <Text style={[st.chipText, typeFilter === f.key && st.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Row 2 – Trạng thái */}
        <View style={st.filterRow}>
          <Text style={st.filterLabel}>TT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
            {([
              { key: 'all',     label: 'Tất cả',   activeColor: Colors.primary,  activeBg: Colors.primaryBg },
              { key: 'paid',    label: '✓ Đã thu', activeColor: Colors.success,  activeBg: Colors.successLight },
              { key: 'overdue', label: 'Quá hạn',  activeColor: Colors.error,    activeBg: Colors.errorLight },
            ] as { key: StatusFilter; label: string; activeColor: string; activeBg: string }[]).map(f => {
              const isActive = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[st.chip, isActive && { backgroundColor: f.activeBg, borderColor: f.activeColor }]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[st.chipText, isActive && { color: f.activeColor, fontWeight: '700' }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={historyBills}
        keyExtractor={b => b.id}
        renderItem={renderItem}
        contentContainerStyle={st.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={st.empty}>
            <Text style={st.emptyEmoji}>📭</Text>
            <Text style={st.emptyTitle}>Chưa có lịch sử</Text>
            <Text style={st.emptyDesc}>Chưa có hóa đơn nào phù hợp với bộ lọc này.</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 60 }} />}
      />
    </SafeAreaView>
  );
};

// ===================== STYLES =====================
const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  backText:    { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 70 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg,
    marginTop: Spacing.md, borderRadius: BorderRadius.xl,
    padding: Spacing.base, ...Shadow.sm,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryNum:     { fontSize: 20, fontWeight: '800' },
  summaryAmt:     { fontSize: 15, fontWeight: '800' },
  summaryLbl:     { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.divider, marginHorizontal: Spacing.sm },

  filterBlock: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.lg,
    marginTop: Spacing.md, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md,
  },
  filterLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', width: 30, marginRight: Spacing.xs,
  },
  chipRow: { gap: Spacing.xs, paddingRight: Spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.divider,
  },
  cardPaid:      { borderLeftColor: Colors.success },
  cardOverdue:   { borderLeftColor: Colors.error },
  cardCancelled: { borderLeftColor: Colors.textMuted, opacity: 0.7 },

  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.sm,
  },
  typeBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusPaid:      { backgroundColor: Colors.successLight },
  statusOverdue:   { backgroundColor: Colors.errorLight },
  statusCancelled: { backgroundColor: Colors.background },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  cardMid:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.xs },
  code:     { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  meta:     { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  prop:     { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  amount:   { fontSize: 16, fontWeight: '800', marginLeft: Spacing.sm },
  detail:   { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.xs },

  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  date:     { fontSize: 11, color: Colors.textMuted },
  method:   { fontSize: 11, color: Colors.textMuted },

  empty:      { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  emptyDesc:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
