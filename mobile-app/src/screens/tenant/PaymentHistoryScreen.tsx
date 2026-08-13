import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { PaymentTransaction } from '@/types';
import { formatCurrency, formatDateTime } from '@/utils';
import {
  realTenantBillingService, TenantPayment, TenantInvoiceType,
} from '@/services/tenant/billingService';
import { realTenantSelfService } from '@/services/tenant/selfService';

/**
 * Lịch sử thanh toán của khách thuê.
 *
 * Bản cũ chỉ có một thẻ tổng tím + danh sách phẳng, và `toTxn` bỏ mất hai field BE
 * đã trả là `invoiceType` và `propertyName` — nên mọi giao dịch trông giống hệt
 * nhau, không biết đang trả tiền phòng hay tiền điện, ở nhà nào.
 *
 * Bản này giữ đủ dữ liệu BE trả, gom giao dịch THEO THÁNG (mỗi tháng có tổng tiền
 * riêng), thêm lọc theo loại phí / phương thức và ô tìm theo mã hoá đơn hoặc mã
 * giao dịch.
 */

// ── Chuẩn hoá dữ liệu BE ─────────────────────────────────────────────────────
const PAY_METHOD_MAP: Record<string, PaymentTransaction['method']> = {
  QR: 'qr', BANK_TRANSFER: 'bank_transfer', CASH: 'cash', EWALLET: 'other', OTHER: 'other',
};

/**
 * Loại khoản đã trả. `DEPOSIT` không phải loại hoá đơn của BE — tiền cọc nằm trên
 * chính hợp đồng (TenantContract.deposit + depositPaidAt + depositMethod), không đi
 * qua bảng hoá đơn, nên phải ghép thêm ở FE.
 */
type PayKind = TenantInvoiceType | 'DEPOSIT';

/** Giao dịch đã chuẩn hoá — giữ thêm loại phí & tên nhà so với PaymentTransaction gốc. */
interface Txn extends PaymentTransaction {
  invoiceType: PayKind;
  propertyName: string;
  /** "YYYY-MM" — khoá gom nhóm theo tháng. */
  monthKey: string;
  /** Cọc thì bấm sang màn chi tiết hợp đồng thay vì chi tiết giao dịch. */
  contractId?: number;
  /**
   * Bản ghi thu tiền lặp của cùng một hoá đơn — vẫn hiện đủ nhưng KHÔNG cộng vào
   * tổng. Xem markDuplicates().
   */
  duplicate?: boolean;
}

/**
 * Đánh dấu giao dịch trùng.
 *
 * BE ghi `tenant_payments.amount = invoice.grandTotal`, tức mỗi bản ghi luôn là
 * TOÀN BỘ số tiền hoá đơn — không có khái niệm trả góp. Nên hoá đơn nào có từ 2 bản
 * ghi trở lên thì từ cái thứ 2 chắc chắn là ghi lặp, không phải khách trả thêm.
 *
 * Nguồn lặp đã biết: `approvePaymentClaim()` không kiểm tra hoá đơn đã PAID chưa
 * trước khi gọi `markPaid()`, nên khách trả qua PayOS xong quản lý bấm duyệt lại
 * claim cũ là sinh thêm một dòng. Đây là bug BE — FE chỉ tránh cộng dồn sai, không
 * giấu bản ghi nào.
 */
const markDuplicates = (rows: Txn[]): Txn[] => {
  const seen = new Set<string>();
  return [...rows]
    // Cũ trước: bản ghi đầu tiên của mỗi hoá đơn mới là bản thật.
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    .map(t => {
      // Cọc gắn với hợp đồng, mỗi hợp đồng chỉ có một khoản → không xét trùng.
      if (t.invoiceType === 'DEPOSIT' || !t.invoiceCode) return t;
      const isDup = seen.has(t.invoiceCode);
      seen.add(t.invoiceCode);
      return isDup ? { ...t, duplicate: true } : t;
    });
};

const sumReal = (rows: Txn[]) => rows.reduce((s, t) => (t.duplicate ? s : s + t.amount), 0);

const toTxn = (p: TenantPayment): Txn => ({
  id: String(p.id),
  invoiceId: String(p.invoiceId),
  invoiceCode: p.invoiceCode,
  tenantId: '',
  tenantName: '',
  roomName: p.roomNumber ? `Phòng ${p.roomNumber}` : '',
  amount: p.amount,
  method: PAY_METHOD_MAP[p.method] ?? 'other',
  status: 'verified',
  transferContent: p.transactionId,
  createdAt: p.paidAt,
  verifiedAt: p.paidAt,
  invoiceType: p.invoiceType,
  propertyName: p.propertyName ?? '',
  monthKey: (p.paidAt || '').slice(0, 7),
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

/** Đồng bộ với TYPE_CONFIG ở màn Hoá đơn để hai màn nhìn ra cùng một loại phí. */
const TYPE_CONFIG: Record<PayKind, { label: string; icon: string; color: string; bg: string }> = {
  RENT: { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  ELECTRICITY: { label: 'Tiền điện', icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  WATER: { label: 'Tiền nước', icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  SERVICE: { label: 'Dịch vụ', icon: '🧾', color: '#0D9488', bg: '#CCFBF1' },
  MAINTENANCE: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  DEPOSIT: { label: 'Tiền cọc', icon: '🔐', color: '#0891B2', bg: '#CFFAFE' },
  OTHER: { label: 'Khác', icon: '💠', color: '#64748B', bg: '#F1F5F9' },
};
const typeCfg = (t: PayKind) => TYPE_CONFIG[t] ?? TYPE_CONFIG.OTHER;

type TypeFilter = 'all' | PayKind;
type MethodFilter = 'all' | PaymentTransaction['method'];

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'RENT', label: '🏠 Tiền phòng' },
  { key: 'DEPOSIT', label: '🔐 Tiền cọc' },
  { key: 'ELECTRICITY', label: '⚡ Điện' },
  { key: 'WATER', label: '💧 Nước' },
  { key: 'MAINTENANCE', label: '🔧 Bảo trì' },
];

/** Cọc: PAYOS = chuyển khoản qua cổng, CASH = quản lý thu tay. */
const DEPOSIT_METHOD_MAP: Record<string, PaymentTransaction['method']> = {
  PAYOS: 'bank_transfer', CASH: 'cash', QR: 'qr', BANK_TRANSFER: 'bank_transfer',
};
const METHOD_TABS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'Mọi hình thức' },
  { key: 'qr', label: '📱 QR' },
  { key: 'bank_transfer', label: '🏦 Chuyển khoản' },
  { key: 'cash', label: '💵 Tiền mặt' },
];

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return m ? `Tháng ${Number(m)}/${y}` : 'Không rõ thời gian';
};

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

export const PaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [query, setQuery] = useState('');

  /**
   * Tiền cọc không nằm trong bảng hoá đơn nên `/tenant/me/payments` không trả về.
   * Phải lấy từ hợp đồng: danh sách HĐ chỉ có số tiền cọc, còn thời điểm & hình thức
   * thu nằm ở API chi tiết → gọi detail cho những HĐ có cọc (khách thường chỉ vài HĐ).
   * Chỉ đưa vào lịch sử khi đã thu xong (paymentStatus = PAID).
   */
  const loadDeposits = useCallback(async (): Promise<Txn[]> => {
    const list = await realTenantSelfService.getMyContracts().catch(() => []);
    const withDeposit = list.filter(c => (c.deposit ?? c.depositAmount ?? 0) > 0);
    const details = await Promise.all(
      withDeposit.map(c => realTenantSelfService.getContractDetail(c.id).catch(() => null)),
    );

    return details.flatMap((d, i) => {
      const c = withDeposit[i];
      const amount = d?.deposit ?? d?.depositAmount ?? c.deposit ?? c.depositAmount ?? 0;
      if (!d || amount <= 0) return [];
      if ((d.paymentStatus ?? '').toUpperCase() !== 'PAID') return [];
      // Thiếu depositPaidAt (HĐ cũ thu tay trước khi BE lưu mốc) → dùng ngày bắt đầu HĐ.
      const paidAt = d.depositPaidAt || d.moveInDate || c.startDate;
      return [{
        id: `deposit-${c.id}`,
        invoiceId: '',
        invoiceCode: c.code,
        tenantId: '',
        tenantName: '',
        roomName: c.roomNumber || c.roomCode ? `Phòng ${c.roomNumber ?? c.roomCode}` : '',
        amount,
        method: DEPOSIT_METHOD_MAP[(d.depositMethod ?? '').toUpperCase()] ?? 'other',
        status: 'verified' as const,
        transferContent: d.payosOrderCode ? `PayOS #${d.payosOrderCode}` : undefined,
        createdAt: paidAt,
        verifiedAt: paidAt,
        invoiceType: 'DEPOSIT' as const,
        propertyName: c.propertyName ?? '',
        monthKey: (paidAt || '').slice(0, 7),
        contractId: c.id,
      }];
    });
  }, []);

  const load = useCallback((isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    Promise.all([
      realTenantBillingService.listPayments().then(rows => rows.map(toTxn)).catch(() => [] as Txn[]),
      loadDeposits().catch(() => [] as Txn[]),
    ])
      .then(([invoicePays, depositPays]) => setTransactions(markDuplicates([...invoicePays, ...depositPays])))
      .catch(() => setTransactions([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [loadDeposits]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Thống kê trên TOÀN BỘ giao dịch, không đổi theo bộ lọc ──
  const stats = useMemo(() => {
    const thisMonth = (new Date().toISOString()).slice(0, 7);
    const inMonth = transactions.filter(t => t.monthKey === thisMonth);
    const latest = transactions.reduce<string | null>(
      (m, t) => (!m || t.createdAt > m ? t.createdAt : m), null,
    );
    const deposits = transactions.filter(t => t.invoiceType === 'DEPOSIT');
    const dups = transactions.filter(t => t.duplicate);
    return {
      // Tổng KHÔNG cộng bản ghi trùng — nếu cộng thì số tiền bị thổi lên đúng bằng
      // số tiền của hoá đơn bị ghi lặp.
      total: sumReal(transactions),
      count: transactions.length,
      realCount: transactions.length - dups.length,
      duplicateCount: dups.length,
      duplicateAmount: dups.reduce((s, t) => s + t.amount, 0),
      monthTotal: sumReal(inMonth), monthCount: inMonth.length,
      latest,
      // Cọc là khoản sẽ được hoàn lại khi trả phòng — tách riêng để khách không
      // tưởng toàn bộ số tiền trên kia là chi phí đã mất.
      depositTotal: sumReal(deposits),
      depositCount: deposits.length,
    };
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return transactions.filter(t =>
      (typeFilter === 'all' || t.invoiceType === typeFilter) &&
      (methodFilter === 'all' || t.method === methodFilter) &&
      (!q || [t.invoiceCode, t.transferContent, t.propertyName, t.roomName]
        .some(v => v && norm(String(v)).includes(q))),
    );
  }, [transactions, typeFilter, methodFilter, query]);

  /**
   * TIỀN CỌC GHIM LÊN ĐẦU, phần còn lại gom theo tháng (mới nhất trước).
   *
   * Cọc là khoản đóng MỘT LẦN lúc nhận nhà và sẽ được hoàn lại khi trả phòng — khách
   * tra nó nhiều nhất mà nó lại nằm lọt thỏm ở tháng xa nhất cuối danh sách, phải cuộn
   * qua hàng chục giao dịch mới thấy. Ghim lên trên để mở màn là thấy ngay.
   *
   * Cũng vì bản chất khác (một lần, được hoàn) nên không nhập vào tổng theo tháng cùng
   * tiền phòng/điện/nước — cộng chung sẽ ra một con số không có nghĩa gì.
   *
   * Ghim rồi thì cọc KHÔNG lặp lại ở nhóm tháng nữa, nếu không khách đếm ra hai lần.
   */
  const sections = useMemo(() => {
    const deposits = filtered.filter(t => t.invoiceType === 'DEPOSIT');
    const rest = filtered.filter(t => t.invoiceType !== 'DEPOSIT');

    const byMonth = new Map<string, Txn[]>();
    for (const t of rest) {
      byMonth.set(t.monthKey, [...(byMonth.get(t.monthKey) ?? []), t]);
    }
    const monthSections = [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        title: monthLabel(key),
        pinned: false,
        total: sumReal(items),
        data: items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      }));

    if (!deposits.length) return monthSections;

    return [
      {
        key: '__deposit__',
        title: '🔐 Tiền cọc',
        pinned: true,
        total: sumReal(deposits),
        data: deposits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      },
      ...monthSections,
    ];
  }, [filtered]);

  const hasFilter = typeFilter !== 'all' || methodFilter !== 'all' || !!query.trim();

  const renderTransaction = ({ item }: { item: Txn }) => {
    const method = METHOD_CONFIG[item.method] || METHOD_CONFIG.other;
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const cfg = typeCfg(item.invoiceType);
    const place = [item.propertyName, item.roomName].filter(Boolean).join(' · ');

    return (
      <TouchableOpacity
        style={[styles.card, item.duplicate && styles.cardDuplicate]}
        activeOpacity={0.75}
        onPress={() => (item.contractId
          // Cọc không có bản ghi giao dịch riêng → mở thẳng hợp đồng chứa nó.
          ? navigation.navigate('ContractDetail', { contractId: item.contractId })
          : navigation.navigate('PaymentHistoryDetail', { transaction: item }))}
      >
        <View style={styles.cardTop}>
          {/* Icon theo LOẠI PHÍ chứ không theo phương thức: khách quan tâm
              "trả tiền gì" trước, "trả bằng cách nào" là thông tin phụ ở dưới. */}
          <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
            <Text style={{ fontSize: 18 }}>{cfg.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.codeRow}>
              <Text style={styles.invoiceCode} numberOfLines={1}>{item.invoiceCode}</Text>
              <View style={[styles.typeTag, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.typeTagText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            {!!place && <Text style={styles.place} numberOfLines={1}>{place}</Text>}
          </View>
          <Text style={[styles.amountValue, item.duplicate && styles.amountMuted]}>
            {formatCurrency(item.amount)}
          </Text>
        </View>

        {item.duplicate && (
          <View style={styles.dupNote}>
            <Text style={styles.dupNoteText}>
              ⚠️ Hoá đơn này đã được ghi nhận thanh toán ở giao dịch trước — khoản này
              không cộng vào tổng. Nếu bạn đã bị trừ tiền hai lần, hãy báo quản lý.
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Hình thức</Text>
            <Text style={styles.metaValue}>{method.emoji} {method.label}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Thời gian</Text>
            <Text style={styles.metaValue}>{formatDateTime(item.createdAt)}</Text>
          </View>
        </View>

        {!!item.transferContent && (
          <View style={styles.transferRow}>
            <Text style={styles.metaLabel}>Mã giao dịch / Nội dung CK</Text>
            <Text style={styles.transferContent} numberOfLines={1}>{item.transferContent}</Text>
          </View>
        )}

        {item.status === 'rejected' && (
          <View style={styles.rejectedNote}>
            <Text style={styles.rejectedText}>
              ❌ Giao dịch bị từ chối. Vui lòng liên hệ quản lý để biết thêm chi tiết.
            </Text>
          </View>
        )}

        <View style={styles.cardFoot}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={styles.detailLink}>
            {item.contractId ? 'Xem hợp đồng →' : 'Xem chi tiết →'}
          </Text>
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

      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        renderItem={renderTransaction}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* ── Tổng quan ── */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tổng đã thanh toán</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(stats.total)}</Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatNum}>{stats.count}</Text>
                  <Text style={styles.summaryStatLbl}>giao dịch</Text>
                </View>
                <View style={styles.summarySep} />
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatNum}>{formatCurrency(stats.monthTotal)}</Text>
                  <Text style={styles.summaryStatLbl}>tháng này ({stats.monthCount})</Text>
                </View>
              </View>
              {stats.duplicateCount > 0 && (
                <Text style={styles.summaryWarn}>
                  ⚠️ {stats.duplicateCount} giao dịch bị ghi trùng ({formatCurrency(stats.duplicateAmount)})
                  — đã trừ khỏi tổng ở trên
                </Text>
              )}
              {stats.depositCount > 0 && (
                <Text style={styles.summaryNote}>
                  🔐 Trong đó {formatCurrency(stats.depositTotal)} là tiền cọc — sẽ được hoàn khi trả phòng
                </Text>
              )}
              {!!stats.latest && (
                <Text style={styles.summaryLatest}>
                  Gần nhất: {formatDateTime(stats.latest)}
                </Text>
              )}
            </View>

            {/* ── Tìm kiếm ── */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm mã hoá đơn, mã giao dịch, phòng..."
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
              />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.searchClear}>
                  <Text style={styles.searchClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Lọc theo loại phí ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {TYPE_TABS.map(f => (
                <TouchableOpacity key={f.key}
                  style={[styles.chip, typeFilter === f.key && styles.chipActive]}
                  onPress={() => setTypeFilter(f.key)}>
                  <Text style={[styles.chipText, typeFilter === f.key && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── Lọc theo hình thức ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {METHOD_TABS.map(f => (
                <TouchableOpacity key={f.key}
                  style={[styles.chip, methodFilter === f.key && styles.chipActive]}
                  onPress={() => setMethodFilter(f.key)}>
                  <Text style={[styles.chipText, methodFilter === f.key && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {hasFilter && (
              <View style={styles.filterSummary}>
                <Text style={styles.filterSummaryText}>
                  {filtered.length} giao dịch · {formatCurrency(sumReal(filtered))}
                </Text>
                <TouchableOpacity onPress={() => { setTypeFilter('all'); setMethodFilter('all'); setQuery(''); }}>
                  <Text style={styles.filterReset}>Xóa lọc</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, section.pinned && styles.sectionHeaderPinned]}>
            <Text style={[styles.sectionTitle, section.pinned && styles.sectionTitlePinned]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionMeta, section.pinned && styles.sectionMetaPinned]}>
              {/* Cọc nói rõ "được hoàn khi trả phòng" — khách hay tưởng đây là khoản mất hẳn. */}
              {section.pinned
                ? `${formatCurrency(section.total)} · hoàn lại khi trả phòng`
                : `${section.data.length} giao dịch · ${formatCurrency(section.total)}`}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        SectionSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator size="large" color={Colors.primary} /></View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{hasFilter ? '🔍' : '💳'}</Text>
              <Text style={styles.emptyTitle}>
                {hasFilter ? 'Không có giao dịch khớp' : 'Chưa có giao dịch'}
              </Text>
              <Text style={styles.emptyDesc}>
                {hasFilter
                  ? 'Thử bỏ bớt bộ lọc hoặc từ khóa tìm kiếm.'
                  : 'Các khoản bạn đã thanh toán sẽ hiển thị ở đây.'}
              </Text>
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

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

  // Tổng quan
  summaryCard: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, ...Shadow.md,
  },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  summaryAmount: { fontSize: 26, fontWeight: '800', color: Colors.white, marginTop: 2 },
  summaryStats: {
    flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatNum: { fontSize: 14, fontWeight: '800', color: Colors.white },
  summaryStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  summarySep: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryWarn: { fontSize: 11, fontWeight: '600', color: '#FEF08A', marginTop: Spacing.sm, lineHeight: 16 },
  summaryNote: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: Spacing.sm, lineHeight: 16 },
  summaryLatest: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  // Tìm kiếm + lọc
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, height: 42, marginTop: Spacing.md,
  },
  searchIcon: { fontSize: 13 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 0 },
  searchClear: { padding: 4 },
  searchClearText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  // flexGrow: 0 — thiếu là ScrollView ngang bị kéo giãn theo chiều dọc.
  chipScroll: { flexGrow: 0, marginTop: Spacing.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: {
    height: 30, paddingHorizontal: 12, borderRadius: BorderRadius.full,
    justifyContent: 'center', backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  filterSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  filterSummaryText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterReset: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // Tiêu đề nhóm tháng
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  sectionMeta: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },

  // Mục Tiền cọc ghim đầu — nền riêng để tách khỏi dãy nhóm-theo-tháng bên dưới,
  // nếu không nó trông như "một tháng nào đó" và mất luôn ý nghĩa ghim.
  sectionHeaderPinned: {
    backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#A5F3FC',
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
  },
  sectionTitlePinned: { color: '#0E7490' },
  sectionMetaPinned:  { color: '#0891B2' },

  // Thẻ giao dịch
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  cardDuplicate: { borderWidth: 1, borderColor: Colors.warning + '66', backgroundColor: '#FFFDF5' },
  amountMuted: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  dupNote: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  dupNoteText: { fontSize: 11, color: Colors.warning, fontWeight: '600', lineHeight: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  typeIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invoiceCode: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
  typeTag: { borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  typeTagText: { fontSize: 10, fontWeight: '700' },
  place: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  amountValue: { fontSize: 15, fontWeight: '800', color: Colors.primary },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },

  metaRow: { flexDirection: 'row', gap: Spacing.md },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  metaValue: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },

  transferRow: { marginTop: Spacing.sm },
  transferContent: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary, marginTop: 2 },

  rejectedNote: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  rejectedText: { fontSize: 12, color: Colors.error, fontWeight: '500' },

  cardFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 10, fontWeight: '700' },
  detailLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 48, alignItems: 'center' },
  emptyEmoji: { fontSize: 44, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
