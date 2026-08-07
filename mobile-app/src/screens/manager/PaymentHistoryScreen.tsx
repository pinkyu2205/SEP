import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, RENT_AMOUNT_HIDDEN_SHORT } from '@/constants';
import { realManagerInvoiceService, ManagerPayment } from '@/services/manager/invoiceService';
import { managerDepositService, ManagerDeposit } from '@/services/manager/depositService';

/**
 * LỊCH SỬ THANH TOÁN — toàn bộ giao dịch của khách thuê trong phạm vi manager quản lý.
 *
 * Tách khỏi màn "Hoá đơn & Thanh toán": màn kia chỉ lo KỲ THU HIỆN TẠI của tiền nhà
 * (hệ thống tự phát hành hằng tháng, ai đã/chưa đóng). Màn này là dòng thời gian đầy
 * đủ, gộp 2 nguồn mà BE để ở 2 chỗ khác nhau:
 *   • Giao dịch hoá đơn — `/api/v1/manager/payments` (TenantPaymentClaim): mọi loại
 *     hoá đơn, cả tiền nhà lẫn điện/nước/dịch vụ.
 *   • Tiền cọc — nằm trên hợp đồng, không có trong bảng thanh toán (xem depositService).
 *
 * ⚠️ KHÔNG hiện số tiền (xem @/constants/managerVisibility) — chỉ hiện đã thu / chờ
 * xác nhận / bị từ chối, hình thức và thời điểm.
 */

type Filter = 'all' | 'VERIFIED' | 'PENDING_VERIFY' | 'REJECTED' | 'DEPOSIT';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',            label: 'Tất cả' },
  { key: 'VERIFIED',       label: '✓ Đã xác nhận' },
  { key: 'PENDING_VERIFY', label: '⏳ Chờ xác nhận' },
  { key: 'REJECTED',       label: '✕ Từ chối' },
  { key: 'DEPOSIT',        label: '🔐 Tiền cọc' },
];

const METHOD_CONFIG: Record<string, { label: string; icon: string }> = {
  QR:            { label: 'QR VietQR',    icon: '📱' },
  PAYOS:         { label: 'PayOS',        icon: '📱' },
  BANK_TRANSFER: { label: 'Chuyển khoản', icon: '🏦' },
  CASH:          { label: 'Tiền mặt',     icon: '💵' },
  EWALLET:       { label: 'Ví điện tử',   icon: '👛' },
  OTHER:         { label: 'Khác',         icon: '💳' },
};
const methodOf = (m?: string) => METHOD_CONFIG[(m || '').toUpperCase()] ?? METHOD_CONFIG.OTHER;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  VERIFIED:       { label: '✓ Đã xác nhận', color: Colors.success,   bg: Colors.successLight },
  PENDING_VERIFY: { label: 'Chờ xác nhận',  color: Colors.warning,   bg: Colors.warningLight },
  REJECTED:       { label: 'Bị từ chối',    color: Colors.error,     bg: Colors.errorLight },
  PAID:           { label: '✓ Đã thu cọc',  color: Colors.success,   bg: Colors.successLight },
  PENDING:        { label: 'Chưa thu cọc',  color: Colors.warning,   bg: Colors.warningLight },
  FAILED:         { label: 'Thu thất bại',  color: Colors.error,     bg: Colors.errorLight },
  CANCELLED:      { label: 'Đã huỷ',        color: Colors.textMuted, bg: Colors.background },
};
const statusOf = (s?: string) =>
  STATUS_CONFIG[(s || '').toUpperCase()] ?? STATUS_CONFIG.PENDING_VERIFY;

/** Bỏ dấu để gõ không dấu vẫn tìm ra ("trang" → "Đỗ Minh Trang"). */
const norm = (s: string) =>
  (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[đĐ]/g, 'd').toLowerCase();

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-08-07T14:58" → "07/08/2026" (khoá nhóm theo ngày). */
const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const dayLabel = (key: string) => {
  // Mọi mục vào được màn này đều đã có thời điểm (xem `entries`) — nhánh này chỉ để
  // phòng dữ liệu BE thiếu `createdAt`, không phải trạng thái bình thường.
  if (!key) return 'Không rõ thời điểm';
  const [y, m, d] = key.split('-').map(Number);
  const that = new Date(y, m - 1, d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(that)) / 86_400_000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return `${pad(d)}/${pad(m)}/${y}`;
};
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.slice(11, 16) : '');

/** 1 dòng trong dòng thời gian — gộp từ giao dịch hoá đơn và tiền cọc. */
interface Entry {
  key: string;
  kind: 'INVOICE' | 'DEPOSIT';
  tenantName: string;
  roomNumber?: string;
  propertyName: string;
  /** Mã hoá đơn hoặc mã hợp đồng. */
  ref: string;
  method?: string;
  status: string;
  /** Thời điểm dùng để xếp + gom nhóm ngày. */
  at?: string;
  note?: string;
}

const fromPayment = (p: ManagerPayment): Entry => ({
  key: `inv-${p.id}`,
  kind: 'INVOICE',
  tenantName: p.tenantName || '—',
  roomNumber: p.roomNumber ?? undefined,
  propertyName: p.propertyName || '—',
  ref: p.invoiceCode || '',
  method: p.method,
  status: p.status,
  // Đã xác nhận thì mốc đúng là lúc xác nhận; chưa thì lúc khách báo.
  at: p.verifiedAt || p.createdAt,
  note: p.transferContent,
});

const fromDeposit = (d: ManagerDeposit): Entry => ({
  key: `dep-${d.contractId}`,
  kind: 'DEPOSIT',
  tenantName: d.tenantName,
  roomNumber: d.roomNumber,
  propertyName: d.propertyName,
  ref: d.contractCode,
  method: d.method,
  status: d.status,
  at: d.paidAt,
});

export const ManagerPaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Vào từ link "Tất cả tiền cọc" thì mở thẳng tab Tiền cọc, khỏi bắt bấm thêm.
  const initialFilter = (route.params?.filter as Filter | undefined) ?? 'all';
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [deposits, setDeposits] = useState<ManagerDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    Promise.all([
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
      managerDepositService.list().catch(() => [] as ManagerDeposit[]),
    ])
      .then(([pay, dep]) => { setPayments(pay); setDeposits(dep); })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerBilling');
  };

  /**
   * Dòng thời gian mặc định = các lần thanh toán THẬT (có thời điểm).
   * Cọc CHƯA thu không phải một lần thanh toán nên không nằm ở đây — nếu để lẫn, nó
   * không có ngày và bị dồn thành một nhóm "không ngày" vô nghĩa ở cuối danh sách.
   */
  const timeline = useMemo(() => {
    const paidDeposits = deposits.filter(d => !!d.paidAt);
    return [...payments.map(fromPayment), ...paidDeposits.map(fromDeposit)]
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [payments, deposits]);

  /**
   * Riêng tab "Tiền cọc" thì hiện ĐỦ cả chưa thu — vào đây từ link "Tất cả tiền cọc"
   * bên màn Hoá đơn nên phải thấy đúng những dòng đang chưa thu ở màn kia.
   */
  const depositEntries = useMemo(
    () => deposits.map(fromDeposit).sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    [deposits],
  );

  const filtered = useMemo(() => {
    const kw = norm(search.trim());
    const source = filter === 'DEPOSIT' ? depositEntries : timeline;
    return source.filter(e => {
      if (filter !== 'all' && filter !== 'DEPOSIT'
        && (e.kind !== 'INVOICE' || e.status.toUpperCase() !== filter)) return false;
      if (!kw) return true;
      return [e.tenantName, e.roomNumber, e.propertyName, e.ref]
        .some(v => norm(v || '').includes(kw));
    });
  }, [timeline, depositEntries, filter, search]);

  /** Gom theo ngày để đọc như một dòng thời gian, không phải một danh sách phẳng. */
  const sections = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const k = dayKey(e.at);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()]
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([key, data]) => ({ key, title: dayLabel(key), data }));
  }, [filtered]);

  const counts = useMemo(() => ({
    verified: payments.filter(p => p.status === 'VERIFIED').length,
    pending: payments.filter(p => p.status === 'PENDING_VERIFY').length,
    deposits: deposits.filter(d => (d.status || '').toUpperCase() === 'PAID').length,
  }), [payments, deposits]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Lịch sử thanh toán</Text>
          <Text style={s.subtitle}>Toàn bộ giao dịch của khách thuê · {RENT_AMOUNT_HIDDEN_SHORT}</Text>
        </View>
      </View>

      {/* ── Tìm kiếm ── */}
      <View style={s.searchBox}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm khách thuê, phòng, nhà, mã hoá đơn..."
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tổng quan ── */}
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={[s.statNum, { color: Colors.success }]}>{counts.verified}</Text>
          <Text style={s.statLbl}>Đã xác nhận</Text>
        </View>
        <View style={s.statSep} />
        <View style={s.stat}>
          <Text style={[s.statNum, { color: counts.pending > 0 ? Colors.warning : Colors.textMuted }]}>
            {counts.pending}
          </Text>
          <Text style={s.statLbl}>Chờ xác nhận</Text>
        </View>
        <View style={s.statSep} />
        <View style={s.stat}>
          <Text style={[s.statNum, { color: Colors.primary }]}>{counts.deposits}</Text>
          <Text style={s.statLbl}>Đã thu cọc</Text>
        </View>
      </View>

      {/* ── Bộ lọc ── */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, filter === f.key && s.filterChipOn]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterChipText, filter === f.key && s.filterChipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.key}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          renderSectionHeader={({ section }) => (
            <Text style={s.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const mc = methodOf(item.method);
            const st = statusOf(item.status);
            return (
              <View style={s.row}>
                <View style={[s.rowIcon, item.kind === 'DEPOSIT' && { backgroundColor: Colors.primaryBg }]}>
                  <Text style={{ fontSize: 16 }}>{item.kind === 'DEPOSIT' ? '🔐' : mc.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>
                    {item.tenantName}{item.roomNumber ? ` · ${item.roomNumber}` : ''}
                  </Text>
                  <Text style={s.rowMeta} numberOfLines={1}>
                    {item.kind === 'DEPOSIT' ? 'Tiền cọc' : 'Hoá đơn'} · {item.ref || '—'}
                  </Text>
                  <Text style={s.rowMeta} numberOfLines={1}>
                    {item.propertyName} · {mc.label}
                    {timeOf(item.at) ? ` · ${timeOf(item.at)}` : ''}
                  </Text>
                  {!!item.note && (
                    <Text style={s.rowNote} numberOfLines={1}>📝 {item.note}</Text>
                  )}
                </View>
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>{search ? '🔍' : '💳'}</Text>
              <Text style={s.emptyText}>
                {search
                  ? `Không tìm thấy giao dịch nào khớp "${search.trim()}".`
                  : 'Chưa có giao dịch thanh toán nào.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loading: { paddingVertical: Spacing.xl * 2, alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.base,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 4 },
  searchClear: { fontSize: 15, fontWeight: '800', color: Colors.textMuted, paddingHorizontal: 4 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginTop: Spacing.base,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2 },
  statSep: { width: 1, height: 26, backgroundColor: Colors.divider },

  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, marginTop: Spacing.base,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextOn: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: 100 },
  sectionHeader: {
    fontSize: 12, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', marginTop: Spacing.md, marginBottom: Spacing.sm,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  rowName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  rowMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  rowNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10.5, fontWeight: '800' },

  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
