import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { StatusBadge } from '../../components/common';
import { Invoice, InvoiceStatus } from '../../types';
import { formatCurrency, getInvoiceStatusLabel } from '../../utils';

const MOCK_INVOICES: Invoice[] = [
  {
    id: '1', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 4, year: 2026,
    items: [
      { label: 'Tiền phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện', quantity: 150, unitPrice: 3500, amount: 525000 },
      { label: 'Nước', quantity: 12, unitPrice: 15000, amount: 180000 },
      { label: 'Phí DV', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3855000, outstandingBalance: 0, grandTotal: 3855000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-04-29',
  },
  {
    id: '2', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 3, year: 2026,
    items: [
      { label: 'Tiền phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện', quantity: 130, unitPrice: 3500, amount: 455000 },
      { label: 'Nước', quantity: 10, unitPrice: 15000, amount: 150000 },
      { label: 'Phí DV', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3755000, outstandingBalance: 0, grandTotal: 3755000,
    status: 'paid', dueDate: '2026-04-15', paidAt: '2026-04-10', createdAt: '2026-03-29',
  },
];

const getVariant = (s: InvoiceStatus) =>
  s === 'paid' ? 'success' as const : s === 'overdue' ? 'error' as const : 'warning' as const;

export const InvoiceListScreen: React.FC = () => {
  const renderItem = ({ item }: { item: Invoice }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.row}>
        <View>
          <Text style={styles.month}>Tháng {String(item.month).padStart(2, '0')}/{item.year}</Text>
          <Text style={styles.room}>{item.roomName}</Text>
        </View>
        <StatusBadge label={getInvoiceStatusLabel(item.status)} variant={getVariant(item.status)} />
      </View>
      <View style={styles.divider} />
      {item.items.map((li, i) => (
        <View key={i} style={styles.lineRow}>
          <Text style={styles.lineLabel}>{li.label}</Text>
          <Text style={styles.lineVal}>{formatCurrency(li.amount)}</Text>
        </View>
      ))}
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.totalLabel}>Tổng cộng</Text>
        <Text style={styles.totalVal}>{formatCurrency(item.grandTotal)}</Text>
      </View>
      {item.status === 'pending' && (
        <TouchableOpacity style={styles.payBtn}>
          <Text style={styles.payText}>💳 Thanh toán ngay</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Hóa đơn</Text>
        <Text style={styles.subtitle}>Danh sách hóa đơn hàng tháng</Text>
      </View>
      <FlatList
        data={MOCK_INVOICES}
        renderItem={renderItem}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  room: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  lineLabel: { fontSize: 14, color: Colors.textSecondary },
  lineVal: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  totalLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  totalVal: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  payBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  payText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
