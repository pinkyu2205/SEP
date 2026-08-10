import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatCurrency, formatDate } from '@/utils';
import { SharedBill, InvoiceType } from '@/store/billsStore';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { realTenantSelfService } from '@/services/tenant/selfService';

/**
 * Tiền cọc đã đóng lúc mới vào ở — KHÔNG phải hoá đơn (BE lưu trên hợp đồng), nhưng
 * với khách nó vẫn là một khoản đã trả nên phải nằm chung lịch sử, không thì khách
 * tưởng hệ thống "quên" mất khoản lớn nhất mình từng đóng.
 */
interface DepositRow {
  contractId: number;
  contractCode: string;
  place: string;
  amount: number;
  /** Ngày thu đủ cọc (BE trả từ 05/08/2026); chưa có thì lùi về ngày ký HĐ. */
  paidAt?: string;
  /** true = ngày trên là ngày ký HĐ, không phải ngày thu tiền → phải ghi đúng nhãn. */
  dateIsSignedAt: boolean;
  /** PAYOS | CASH | undefined */
  method?: string;
}

/** Nhãn cách đóng cọc — khớp `depositMethod` của BE. */
const DEPOSIT_METHOD_LABEL: Record<string, string> = {
  PAYOS: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
};

/** Một dòng trong lịch sử: hoá đơn đã thanh toán hoặc khoản cọc. */
type HistoryRow =
  | { kind: 'invoice'; key: string; date: string; bill: SharedBill }
  | { kind: 'deposit'; key: string; date: string; deposit: DepositRow };

const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  deposit:     { label: 'Tiền cọc',   icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};

export const InvoiceHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<SharedBill[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);

    /** Cọc đã đóng của từng hợp đồng (kể cả HĐ đã kết thúc — vẫn là lịch sử của khách). */
    const loadDeposits = async (): Promise<DepositRow[]> => {
      const contracts = await realTenantSelfService.getMyContracts().catch(() => []);
      const details = await Promise.all(contracts.map(c =>
        realTenantSelfService.getContractDetail(c.id).catch(() => null)));
      return details.flatMap((d, i) => {
        if (!d) return [];
        const amount = d.deposit ?? d.depositAmount ?? contracts[i].deposit ?? contracts[i].depositAmount ?? 0;
        // Chỉ đưa vào lịch sử khi thật sự ĐÃ THU — chưa thu thì không phải "đã trả".
        if (amount <= 0 || (d.paymentStatus || '').toUpperCase() !== 'PAID') return [];
        const paidAt = d.depositPaidAt || d.signedAt || d.moveInDate;
        return [{
          contractId: d.id,
          contractCode: d.code || contracts[i].code,
          place: [d.roomCode || contracts[i].roomNumber, d.propertyName || contracts[i].propertyName]
            .filter(Boolean).join(' · '),
          amount,
          paidAt,
          dateIsSignedAt: !d.depositPaidAt,
          method: d.depositMethod ?? (d.payosOrderCode != null ? 'PAYOS' : undefined),
        }];
      });
    };

    Promise.all([
      realTenantBillingService.listInvoices({ status: 'PAID' })
        .then(r => r.map(toSharedBill)).catch(() => [] as SharedBill[]),
      loadDeposits().catch(() => [] as DepositRow[]),
    ])
      .then(([bills, deps]) => {
        if (!active) return;
        setInvoices(bills);
        // Hợp đồng nào đã có hoá đơn `HD-ONBOARD-{id}` thì BỎ thẻ cọc dựng riêng:
        // hoá đơn đó CHÍNH LÀ khoản cọc (BE 10/08/2026 bỏ gộp tiền nhà vào nó), giữ
        // cả hai là cùng một khoản tiền hiện hai lần và khách cộng ra gấp đôi.
        //
        // Vẫn giữ thẻ cọc cho hợp đồng KHÔNG có hoá đơn onboard — thu tiền mặt kiểu
        // cũ và dữ liệu seed không sinh hoá đơn, với chúng thẻ này là nguồn duy nhất.
        const invoicedContractIds = new Set(
          bills
            .map(b => /^HD-ONBOARD-(\d+)/.exec(b.code ?? '')?.[1])
            .filter(Boolean)
            .map(Number),
        );
        setDeposits(deps.filter(d => !invoicedContractIds.has(d.contractId)));
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []));

  const paidInvoices = invoices.filter(i => i.status === 'paid');

  // Trộn hoá đơn + cọc, mới nhất lên đầu.
  const rows: HistoryRow[] = [
    ...paidInvoices.map((bill): HistoryRow => ({
      kind: 'invoice', key: `inv-${bill.id}`, date: bill.paidAt || bill.createdAt, bill,
    })),
    ...deposits.map((deposit): HistoryRow => ({
      kind: 'deposit', key: `dep-${deposit.contractId}`, date: deposit.paidAt || '', deposit,
    })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  /** Thẻ tiền cọc — không mở được chi tiết vì cọc nằm trên hợp đồng, không phải hoá đơn. */
  const renderDeposit = (d: DepositRow) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.typeBadge, { backgroundColor: '#ECFDF5' }]}>
            <Text style={[styles.typeBadgeText, { color: '#059669' }]}>🔐 Tiền cọc</Text>
          </View>
          <Text style={styles.invoiceMonth}>HĐ {d.contractCode}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>Đã thanh toán</Text>
        </View>
      </View>
      <Text style={styles.invoiceRoom}>{d.place}</Text>

      <View style={styles.divider} />
      <View style={styles.lineRow}>
        <Text style={styles.lineLabel}>Tiền cọc giữ chỗ (đóng khi nhận nhà)</Text>
        <Text style={styles.lineVal}>{formatCurrency(d.amount)}</Text>
      </View>

      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Tổng cộng</Text>
        <Text style={styles.totalVal}>{formatCurrency(d.amount)}</Text>
      </View>

      <View style={styles.paidInfo}>
        <Text style={styles.paidText}>
          {d.paidAt
            ? `✅ ${d.dateIsSignedAt ? 'Đã đóng · ký hợp đồng ngày' : 'Đã đóng ngày'} ${formatDate(d.paidAt)}`
            : '✅ Đã đóng'}
        </Text>
        <Text style={styles.paidMethod}>{DEPOSIT_METHOD_LABEL[d.method ?? ''] ?? 'Thu tại chỗ'}</Text>
      </View>
      <Text style={styles.depositNote}>
        Cọc được hoàn lại khi trả phòng, sau khi trừ hoá đơn còn nợ và hư hỏng (nếu có).
      </Text>
    </View>
  );

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
          <Text style={styles.subtitle}>
            {paidInvoices.length} hóa đơn đã thanh toán
            {deposits.length > 0 ? ` · ${deposits.length} khoản cọc` : ''}
          </Text>
        </View>
      </View>

      <FlatList
        data={rows}
        renderItem={({ item }) => (
          item.kind === 'deposit' ? renderDeposit(item.deposit) : renderItem({ item: item.bill })
        )}
        keyExtractor={i => i.key}
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
  depositNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.sm },
  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 80, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
