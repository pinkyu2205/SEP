import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { PaymentTransaction } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils';

const MOCK_TRANSACTIONS: PaymentTransaction[] = [
  {
    id: 'txn-1', invoiceId: '2', invoiceCode: 'HD-T04-2026', tenantId: 't1',
    tenantName: 'Nguyễn Văn A', roomName: 'Phòng 201',
    amount: 3755000, method: 'qr', status: 'verified',
    bankCode: 'MB', bankAccount: '0865803493',
    transferContent: 'HD2 T4 Phong 201',
    createdAt: '2026-04-10T09:30:00Z', verifiedAt: '2026-04-10T11:00:00Z',
    verifiedBy: 'Trần Văn Minh',
  },
  {
    id: 'txn-2', invoiceId: '5', invoiceCode: 'HD-T03-2026', tenantId: 't1',
    tenantName: 'Nguyễn Văn A', roomName: 'Phòng 201',
    amount: 3755000, method: 'qr', status: 'verified',
    bankCode: 'MB', bankAccount: '0865803493',
    transferContent: 'HD5 T3 Phong 201',
    createdAt: '2026-03-12T14:15:00Z', verifiedAt: '2026-03-12T16:00:00Z',
    verifiedBy: 'Trần Văn Minh',
  },
  {
    id: 'txn-3', invoiceId: '6', invoiceCode: 'HD-T02-2026', tenantId: 't1',
    tenantName: 'Nguyễn Văn A', roomName: 'Phòng 201',
    amount: 3700000, method: 'cash', status: 'verified',
    createdAt: '2026-02-08T10:00:00Z', verifiedAt: '2026-02-08T10:05:00Z',
    verifiedBy: 'Trần Văn Minh',
    notes: 'Thanh toán tiền mặt tại văn phòng',
  },
  {
    id: 'txn-4', invoiceId: '1', invoiceCode: 'HD-T05-2026', tenantId: 't1',
    tenantName: 'Nguyễn Văn A', roomName: 'Phòng 201',
    amount: 3855000, method: 'qr', status: 'pending',
    transferContent: 'HD1 T5 Phong 201',
    createdAt: '2026-05-02T08:00:00Z',
  },
];

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

const FILTER_OPTIONS: { key: 'all' | 'pending' | 'verified' | 'rejected'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'verified', label: 'Đã xác nhận' },
  { key: 'rejected', label: 'Bị từ chối' },
];

export const PaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | string>('all');

  const filtered = filter === 'all'
    ? MOCK_TRANSACTIONS
    : MOCK_TRANSACTIONS.filter(t => t.status === filter);

  const totalPaid = MOCK_TRANSACTIONS
    .filter(t => t.status === 'verified')
    .reduce((sum, t) => sum + t.amount, 0);

  const renderTransaction = ({ item }: { item: PaymentTransaction }) => {
    const method = METHOD_CONFIG[item.method] || METHOD_CONFIG.other;
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

    return (
      <View style={styles.card}>
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
      </View>
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
          {MOCK_TRANSACTIONS.filter(t => t.status === 'verified').length} giao dịch đã xác nhận
        </Text>
      </View>

      {/* Bộ lọc */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTER_OPTIONS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        renderItem={renderTransaction}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💳</Text>
            <Text style={styles.emptyTitle}>Chưa có giao dịch</Text>
            <Text style={styles.emptyDesc}>Lịch sử thanh toán sẽ hiển thị ở đây</Text>
          </View>
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

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
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

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
