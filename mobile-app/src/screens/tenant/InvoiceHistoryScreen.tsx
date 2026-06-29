import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { formatCurrency, formatDate } from '../../utils';
import { SharedBill, InvoiceType } from '../../store/billsStore';
import { realTenantBillingService, toSharedBill } from '../../services/tenantBillingService.real';

const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
};

export const InvoiceHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<SharedBill[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    setLoading(true);
    realTenantBillingService.listInvoices({ status: 'PAID' })
      .then(r => setInvoices(r.map(toSharedBill)))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, []));
  const paidInvoices = invoices.filter(i => i.status === 'paid');

  const renderItem = ({ item }: { item: SharedBill }) => {
    const tc = TYPE_CFG[item.invoiceType];
    return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => navigation.navigate('InvoiceDetail', { invoice: item })}
    >
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.typeBadge, { backgroundColor: tc.bg }]}>
            <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.icon} {tc.label}</Text>
          </View>
          <Text style={styles.invoiceMonth}>
            T{String(item.month).padStart(2, '0')}/{item.year}
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>Đã thanh toán</Text>
        </View>
      </View>
      <Text style={styles.invoiceRoom}>{item.roomName} · {item.propertyName}</Text>

      <View style={styles.divider} />

      {item.items.map((li, i) => (
        <View key={i} style={styles.lineRow}>
          <Text style={styles.lineLabel}>{li.label}</Text>
          <Text style={styles.lineVal}>{formatCurrency(li.amount)}</Text>
        </View>
      ))}

      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tổng cộng</Text>
        <Text style={styles.totalVal}>{formatCurrency(item.grandTotal)}</Text>
      </View>

      <View style={styles.paidInfo}>
        <Text style={styles.paidText}>
          ✅ Đã thanh toán ngày {item.paidAt ? formatDate(item.paidAt) : ''}
        </Text>
        {item.paymentMethod && (
          <Text style={styles.paidMethod}>
            {item.paymentMethod === 'qr' ? 'QR Code' : item.paymentMethod}
          </Text>
        )}
      </View>
      <View style={styles.detailFooter}>
        <Text style={styles.detailLink}>Xem chi tiết →</Text>
      </View>
    </TouchableOpacity>
  );};

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Lịch sử hóa đơn</Text>
          <Text style={styles.subtitle}>{paidInvoices.length} hóa đơn đã thanh toán</Text>
        </View>
      </View>

      <FlatList
        data={paidInvoices}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>Chưa có hóa đơn nào</Text>
              <Text style={styles.emptyDesc}>Các hóa đơn đã thanh toán sẽ hiển thị ở đây.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    ...Shadow.sm,
  },
  backBtnText: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.md,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  invoiceMonth: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  invoiceRoom: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
  statusBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: Colors.success },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  lineLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  lineVal: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  totalVal: { fontSize: 20, fontWeight: '800', color: Colors.success },

  paidInfo: {
    marginTop: Spacing.md, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  paidText: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  paidMethod: { fontSize: 12, color: Colors.textMuted },
  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 80, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
