import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { PaymentTransaction } from '@/types';
import { formatCurrency, formatDateTime } from '@/utils';
import { realTenantBillingService, TenantPayment } from '@/services/tenant/billingService';

// Map lịch sử thanh toán BE -> shape PaymentTransaction màn đang dùng.
const PAY_METHOD_MAP: Record<string, PaymentTransaction['method']> = {
  QR: 'qr', BANK_TRANSFER: 'bank_transfer', CASH: 'cash', EWALLET: 'other', OTHER: 'other',
};
const toTxn = (p: TenantPayment): PaymentTransaction => ({
  id: String(p.id),
  invoiceId: String(p.invoiceId),
  invoiceCode: p.invoiceCode,
  tenantId: '',
  tenantName: '',
  roomName: p.roomNumber ? `Phòng ${p.roomNumber}` : (p.propertyName ?? ''),
  amount: p.amount,
  method: PAY_METHOD_MAP[p.method] ?? 'other',
  status: 'verified',
  transferContent: p.transactionId,
  createdAt: p.paidAt,
  verifiedAt: p.paidAt,
});

const METHOD_CONFIG: Record<string, { label: string; emoji: string }> = {
  qr: { label: 'QR Code', emoji: '📱' },
  bank_transfer: { label: 'Chuyển khoản', emoji: '🏦' },
  cash: { label: 'Tiền mặt', emoji: '💵' },
  other: { label: 'Khác', emoji: '💳' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ xác nhận', color: Colors.warning, bg: Colors.warningLight },
  processing: { label: 'Đang xử lý', color: Colors.info, bg: Colors.infoLight },
  verified: { label: 'Đã xác nhận', color: Colors.success, bg: Colors.successLight },
  rejected: { label: 'Bị từ chối', color: Colors.error, bg: Colors.errorLight },
};


export const PaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    realTenantBillingService.listPayments()
      .then(rows => setTransactions(rows.map(toTxn)))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, []));

  const totalPaid = transactions.reduce((sum, t) => sum + t.amount, 0);

  const renderTransaction = ({ item }: { item: PaymentTransaction }) => {
    const method = METHOD_CONFIG[item.method] || METHOD_CONFIG.other;
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('PaymentHistoryDetail', { transaction: item })}
      >
        <View style={styles.cardTop}>
          <View style={[styles.methodIcon, { backgroundColor: Colors.primaryBg }]}>
            <Text style={{ fontSize: 22 }}>{method.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.invoiceCode}>{item.invoiceCode}</Text>
            <Text style={styles.roomName}>{item.roomName}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Số tiền</Text>
          <Text style={styles.amountValue}>{formatCurrency(item.amount)}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Phương thức</Text>
            <Text style={styles.metaValue}>{method.label}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Thời gian GD</Text>
            <Text style={styles.metaValue}>{formatDateTime(item.createdAt)}</Text>
          </View>
        </View>

        {item.transferContent && (
          <View style={styles.transferRow}>
            <Text style={styles.metaLabel}>Nội dung CK</Text>
            <Text style={styles.transferContent}>{item.transferContent}</Text>
          </View>
        )}

        {item.verifiedAt && item.verifiedBy && (
          <View style={styles.verifiedRow}>
            <Text style={styles.verifiedText}>
              ✅ Xác nhận bởi {item.verifiedBy} · {formatDateTime(item.verifiedAt)}
            </Text>
          </View>
        )}

        {item.notes && (
          <Text style={styles.notes}>{item.notes}</Text>
        )}

        {item.status === 'rejected' && (
          <View style={styles.rejectedNote}>
            <Text style={styles.rejectedText}>
              ❌ Giao dịch bị từ chối. Vui lòng liên hệ quản lý để biết thêm chi tiết.
            </Text>
          </View>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lịch sử thanh toán</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tổng đã thanh toán */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Tổng đã thanh toán</Text>
        <Text style={styles.summaryAmount}>{formatCurrency(totalPaid)}</Text>
        <Text style={styles.summaryCount}>
          {transactions.length} giao dịch đã xác nhận
        </Text>
      </View>

      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💳</Text>
              <Text style={styles.emptyTitle}>Chưa có giao dịch</Text>
              <Text style={styles.emptyDesc}>Lịch sử thanh toán sẽ hiển thị ở đây</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  summaryCard: {
    margin: Spacing.lg, backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, alignItems: 'center', ...Shadow.md,
  },
  summaryLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: Spacing.xs },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: Colors.white },
  summaryCount: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
    alignSelf: 'flex-start',
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  methodIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  invoiceCode: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  roomName: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },

  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  amountLabel: { fontSize: 13, color: Colors.textMuted },
  amountValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  metaRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  transferRow: { marginTop: Spacing.xs, marginBottom: Spacing.sm },
  transferContent: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginTop: 2 },

  verifiedRow: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  verifiedText: { fontSize: 12, color: Colors.success, fontWeight: '500' },

  notes: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm, fontStyle: 'italic' },

  rejectedNote: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  rejectedText: { fontSize: 12, color: Colors.error, fontWeight: '500' },

  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
