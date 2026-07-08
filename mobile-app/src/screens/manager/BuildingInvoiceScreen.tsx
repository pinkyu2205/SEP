import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { getPropertyById, getBuildingOps, BuildingInvoice, InvoiceStatus } from '@/data/managedProperties';

const FILTERS: { id: 'all' | InvoiceStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'unpaid', label: 'Chưa thu' },
  { id: 'paid', label: 'Đã thu' },
];

const STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  paid: { label: 'Đã thu', color: '#16A34A', bg: '#F0FDF4' },
  unpaid: { label: 'Chưa thu', color: '#D97706', bg: '#FEF3C7' },
  overdue: { label: 'Quá hạn', color: '#EF4444', bg: '#FEE2E2' },
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const BuildingInvoiceScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [invoices, setInvoices] = useState<BuildingInvoice[]>(() => getBuildingOps(propertyId).invoices);
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all');

  const totals = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.amount, 0);
    const collected = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    return { total, collected, remaining: total - collected };
  }, [invoices]);

  const list = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const confirmPayment = (inv: BuildingInvoice) => {
    Alert.alert(
      'Xác nhận thu tiền',
      `Xác nhận đã thu ${fmt(inv.amount)} từ ${inv.tenant} (${inv.room})?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đã thu (tiền mặt)',
          onPress: () => setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid', daysOverdue: undefined } : i)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Hoá đơn</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Tổng phải thu</Text>
          <Text style={styles.summaryVal}>{fmt(totals.total)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Còn lại</Text>
          <Text style={[styles.summaryVal, { color: totals.remaining > 0 ? '#EF4444' : '#16A34A' }]}>{fmt(totals.remaining)}</Text>
        </View>
      </View>

      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <Text style={styles.empty}>Không có hoá đơn</Text>
        ) : list.map(inv => {
          const st = STATUS_META[inv.status];
          return (
            <View key={inv.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{inv.room} · {inv.tenant}</Text>
                  <Text style={styles.cardMeta}>Kỳ {inv.period}{inv.daysOverdue ? ` · trễ ${inv.daysOverdue} ngày` : ''}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.amount}>{fmt(inv.amount)}</Text>
                {inv.status !== 'paid' && (
                  <TouchableOpacity style={styles.payBtn} onPress={() => confirmPayment(inv)}>
                    <Text style={styles.payBtnText}>Xác nhận thu</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  summaryRow: { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  summaryBox: { flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, ...Shadow.sm },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary },
  summaryVal: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginTop: 3 },

  filterRow: { flexGrow: 0, marginTop: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  scroll: { padding: Spacing.lg },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  amount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  payBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.md },
  payBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },
});
