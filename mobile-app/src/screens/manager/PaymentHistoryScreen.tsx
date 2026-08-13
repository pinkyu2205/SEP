import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, ScrollView,
  RefreshControl, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  RENT_AMOUNT_HIDDEN_NOTE, DEPOSIT_AMOUNT_HIDDEN_NOTE,
} from '@/constants';
import { formatCurrency, showAlert } from '@/utils';
import { realManagerInvoiceService, ManagerPayment } from '@/services/manager/invoiceService';
import { managerDepositService, ManagerDeposit } from '@/services/manager/depositService';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { serverNow } from '@/utils/serverTime';

/**
 * THU & ĐỐI SOÁT — toàn bộ giao dịch của khách thuê trong phạm vi manager quản lý.
 *
 * Tách khỏi màn "Hoá đơn tiền nhà": màn kia chỉ lo KỲ THU HIỆN TẠI của tiền nhà
 * (hệ thống tự phát hành hằng tháng, ai đã/chưa đóng). Màn này là dòng thời gian đầy
 * đủ, gộp 2 nguồn mà BE để ở 2 chỗ khác nhau:
 *   • Giao dịch hoá đơn — `/api/v1/manager/payments` (TenantPaymentClaim): mọi loại
 *     hoá đơn, cả tiền nhà lẫn điện/nước/dịch vụ.
 *   • Tiền cọc — nằm trên hợp đồng, không có trong bảng thanh toán (xem depositService).
 *
 * SỐ TIỀN (xem @/constants/managerVisibility):
 *   • Tiền nhà VÀ tiền cọc — ẩn, chỉ hiện trạng thái đã thu / chờ xác nhận / từ chối.
 *     (cọc: ẩn 07/08 → mở lại 10/08 → ẩn lại 13/08/2026)
 *   • Điện, nước, dịch vụ — HIỆN số tiền.
 */

type Filter = 'all' | 'VERIFIED' | 'PENDING_VERIFY' | 'REJECTED' | 'DEPOSIT';

// Bỏ emoji trong nhãn chip cho khớp các màn hoá đơn khác; icon đã nằm ở từng dòng.
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',            label: 'Tất cả' },
  { key: 'VERIFIED',       label: 'Đã xác nhận' },
  { key: 'PENDING_VERIFY', label: 'Chờ xác nhận' },
  { key: 'REJECTED',       label: 'Từ chối' },
  { key: 'DEPOSIT',        label: 'Tiền cọc' },
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

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực', PENDING: 'Chờ ký', EXPIRED: 'Hết hạn',
  TERMINATED: 'Đã chấm dứt', DRAFT: 'Nháp',
};

/**
 * Loại hoá đơn suy từ mã — BE `ManagerPaymentResponse` không trả `invoiceType`, mà
 * quy tắc ẩn/hiện số tiền lại phụ thuộc loại. Hai bộ mã đang tồn tại trong DB:
 *   • `HD-RENT-23-2026-08`, `HD-SVC-1-2026-08`
 *   • `INV00022-202608-R` / `-E` / `-W` / `-S`
 * Không khớp mẫu nào thì coi như tiền nhà (ẩn tiền) cho an toàn.
 */
type InvoiceKind = 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'UNKNOWN';
const invoiceKindOf = (code?: string): InvoiceKind => {
  const c = (code || '').toUpperCase();
  if (c.includes('-RENT-') || /-R$/.test(c)) return 'RENT';
  if (c.includes('-ELEC') || /-E$/.test(c)) return 'ELECTRICITY';
  if (c.includes('-WATER') || /-W$/.test(c)) return 'WATER';
  if (c.includes('-SVC') || /-S$/.test(c)) return 'SERVICE';
  return 'UNKNOWN';
};
const KIND_LABEL: Record<InvoiceKind, string> = {
  RENT: 'Hoá đơn tiền nhà', ELECTRICITY: 'Hoá đơn tiền điện', WATER: 'Hoá đơn tiền nước',
  SERVICE: 'Hoá đơn dịch vụ', UNKNOWN: 'Hoá đơn',
};
/** Chỉ tiền nhà mới bị ẩn; loại chưa nhận ra thì ẩn cho chắc. */
const isAmountHidden = (k: InvoiceKind) => k === 'RENT' || k === 'UNKNOWN';

/** Bỏ dấu để gõ không dấu vẫn tìm ra ("trang" → "Đỗ Minh Trang"). */
const norm = (s: string) =>
  (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[đĐ]/g, 'd').toLowerCase();

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-08-07T14:58" → "07/08/2026" (khoá nhóm theo ngày). */
const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const dayLabel = (key: string) => {
  // Mọi mục vào được màn này đều đã có thời điểm (xem `entries`) — nhánh này chỉ để
  // phòng dữ liệu BE thiếu `createdAt`, không phải trạng thái bình thường.
  if (!key) return 'Không rõ ngày';
  const [y, m, d] = key.split('-').map(Number);
  const that = new Date(y, m - 1, d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(serverNow()) - startOf(that)) / 86_400_000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return `${pad(d)}/${pad(m)}/${y}`;
};
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.slice(11, 16) : '');
/** Nhãn đầy đủ cho sheet chi tiết: "07/08/2026 · 14:58". */
const fullTime = (iso?: string) => {
  const k = dayKey(iso);
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  const t = timeOf(iso);
  return `${d}/${m}/${y}${t ? ` · ${t}` : ''}`;
};
const dateOnly = (iso?: string) => {
  const k = dayKey(iso);
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  return `${d}/${m}/${y}`;
};

/** 1 dòng trong dòng thời gian — gộp từ giao dịch hoá đơn và tiền cọc. */
interface Entry {
  key: string;
  kind: 'INVOICE' | 'DEPOSIT';
  /** Id giao dịch (INVOICE) — dùng để xác nhận / từ chối. */
  paymentId?: number;
  /** Id hợp đồng (DEPOSIT) — dùng để lấy số tiền cọc. */
  contractId?: number;
  tenantName: string;
  tenantPhone?: string;
  roomNumber?: string;
  propertyName: string;
  /** Mã hoá đơn hoặc mã hợp đồng. */
  ref: string;
  /** Loại hoá đơn (chỉ có nghĩa với kind === 'INVOICE'). */
  invoiceKind: InvoiceKind;
  /** Số tiền BE trả trong giao dịch hoá đơn. */
  amount?: number;
  method?: string;
  status: string;
  /** Thời điểm dùng để xếp + gom nhóm kỳ. */
  at?: string;
  note?: string;
  depositMonths?: number;
  moveInDate?: string;
  contractStatus?: string;
}

const fromPayment = (p: ManagerPayment): Entry => ({
  key: `inv-${p.id}`,
  kind: 'INVOICE',
  paymentId: p.id,
  tenantName: p.tenantName || '—',
  roomNumber: p.roomNumber ?? undefined,
  propertyName: p.propertyName || '—',
  ref: p.invoiceCode || '',
  invoiceKind: invoiceKindOf(p.invoiceCode),
  amount: p.amount,
  method: p.method,
  status: p.status,
  // Đã xác nhận thì mốc đúng là lúc xác nhận; chưa thì lúc khách báo.
  at: p.verifiedAt || p.createdAt,
  note: p.transferContent,
});

const fromDeposit = (d: ManagerDeposit): Entry => ({
  key: `dep-${d.contractId}`,
  kind: 'DEPOSIT',
  contractId: d.contractId,
  tenantName: d.tenantName,
  tenantPhone: d.tenantPhone,
  roomNumber: d.roomNumber,
  propertyName: d.propertyName,
  ref: d.contractCode,
  invoiceKind: 'UNKNOWN',
  method: d.method,
  status: d.status,
  at: d.paidAt,
  depositMonths: d.depositMonths,
  moveInDate: d.moveInDate,
  contractStatus: d.contractStatus,
});

/** Một dòng giao dịch trong dòng thời gian. */
const TxnRow: React.FC<{
  entry: Entry;
  onPress: (e: Entry) => void;
}> = React.memo(({ entry, onPress }) => {
  const mc = methodOf(entry.method);
  const st = statusOf(entry.status);
  const isDeposit = entry.kind === 'DEPOSIT';
  // Tiền cọc ẩn lại từ 13/08/2026 — xem @/constants/managerVisibility.
  const hidden = isDeposit || isAmountHidden(entry.invoiceKind);

  const amountText = hidden ? '•••' : formatCurrency(entry.amount ?? 0);

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onPress(entry)}>
      <View style={[s.rowIcon, isDeposit && { backgroundColor: Colors.primaryBg }]}>
        <Text style={{ fontSize: 16 }}>{isDeposit ? '🔐' : mc.icon}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>
          {entry.tenantName}{entry.roomNumber ? ` · ${entry.roomNumber}` : ''}
        </Text>
        <Text style={s.rowRef} numberOfLines={1}>
          {isDeposit ? 'Tiền cọc' : KIND_LABEL[entry.invoiceKind]} · {entry.ref || '—'}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>{entry.propertyName}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {mc.label} · {dayLabel(dayKey(entry.at))}{timeOf(entry.at) ? ` ${timeOf(entry.at)}` : ''}
        </Text>
      </View>

      <View style={s.rowRight}>
        <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
        </View>
        <Text style={[s.rowAmount, hidden && s.rowAmountHidden]} numberOfLines={1}>
          {amountText}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export const ManagerPaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Vào từ link "Tất cả tiền cọc" thì mở thẳng tab Tiền cọc, khỏi bắt bấm thêm.
  const initialFilter = (route.params?.filter as Filter | undefined) ?? 'all';
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [deposits, setDeposits] = useState<ManagerDeposit[]>([]);
  /** id các HĐ còn hiệu lực — lọc cọc của khách đã rời đi. */
  const [activeContractIds, setActiveContractIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Entry | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
      managerDepositService.list().catch(() => [] as ManagerDeposit[]),
      managerPropertyService.getScopedProperties().catch(() => [] as { id: number }[]),
    ])
      .then(async ([pay, dep, props]) => {
        setPayments(pay);
        setDeposits(dep);
        /**
         * Cọc của khách ĐÃ trả phòng / chấm dứt HĐ thì không hiện ở đây nữa: khoản đó
         * đã được tất toán (hoàn lại hoặc trừ vào hư hỏng) ở luồng Trả phòng, để lại
         * chỉ làm manager tưởng đang giữ tiền của người đã đi.
         *
         * Lọc theo `contractId` chứ không theo số phòng — cùng một phòng có thể đã qua
         * nhiều đời khách, ghép theo phòng là giữ nhầm cọc của người cũ.
         */
        const cts = await realTenantService
          .listActiveByProperties(props.map(p => Number(p.id)))
          .catch(() => [] as TenantContractResponse[]);
        setActiveContractIds(new Set(cts.map(c => Number(c.id))));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Trước 13/08/2026 chỗ này có `ensureDepositAmount` — gọi
  // GET /api/v1/tenant-contracts/{id} cho từng dòng cọc chỉ để lấy field `deposit`
  // (endpoint /manager/deposits không trả số tiền). Nay cọc ẩn số nên bỏ hẳn,
  // đỡ một loạt request mỗi lần cuộn danh sách.

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerBilling');
  };

  /**
   * Dòng thời gian mặc định = các lần thanh toán THẬT (có thời điểm).
   * Cọc CHƯA thu không phải một lần thanh toán nên không nằm ở đây — nếu để lẫn, nó
   * không có ngày và bị dồn thành một nhóm "không ngày" vô nghĩa ở cuối danh sách.
   */
  /**
   * Cọc của khách CÒN Ở. Khách đã trả phòng / chấm dứt HĐ thì cọc đã tất toán ở luồng
   * Trả phòng (hoàn lại hoặc trừ hư hỏng) — để lại đây làm manager tưởng còn đang giữ
   * tiền của người đã đi.
   *
   * Khi CHƯA nạp được hợp đồng nào thì giữ nguyên danh sách: thà hiện thừa còn hơn
   * giấu mất khoản thật chỉ vì một request hỏng.
   */
  const liveDeposits = useMemo(
    () => (activeContractIds.size === 0
      ? deposits
      : deposits.filter(d => activeContractIds.has(Number(d.contractId)))),
    [deposits, activeContractIds],
  );

  const timeline = useMemo(() => {
    const paidDeposits = liveDeposits.filter(d => !!d.paidAt);
    return [...payments.map(fromPayment), ...paidDeposits.map(fromDeposit)]
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [payments, liveDeposits]);

  /**
   * Riêng tab "Tiền cọc" thì hiện ĐỦ cả chưa thu — vào đây từ link "Tất cả tiền cọc"
   * bên màn Hoá đơn nên phải thấy đúng những dòng đang chưa thu ở màn kia.
   */
  const depositEntries = useMemo(
    () => liveDeposits.map(fromDeposit).sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    [liveDeposits],
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

  /**
   * Gom theo KỲ (tháng), mới nhất trước — cùng cách với màn Hoá đơn tiền nhà và Lịch
   * sử hoá đơn. Gom theo NGÀY như trước thì mỗi ngày một tiêu đề, chạy vài tháng là
   * hàng chục tiêu đề rời rạc, không đối soát theo kỳ được.
   * Trong mỗi kỳ vẫn xếp mới nhất trước và có nhãn ngày trên từng dòng.
   */
  /**
   * TIỀN CỌC TÁCH RIÊNG, GHIM LÊN ĐẦU (13/08/2026).
   *
   * Trước đây cọc nằm lẫn trong các mục "Kỳ MM/YYYY" cùng tiền điện/nước/dịch vụ. Nhưng
   * cọc khác hẳn về bản chất: thu MỘT LẦN lúc nhận nhà và sẽ HOÀN LẠI khi khách trả
   * phòng — trộn vào dòng tiền theo kỳ thì manager đọc ra "kỳ này thu được nhiều" trong
   * khi phần lớn là khoản sẽ phải trả lại.
   *
   * Ghim rồi thì cọc KHÔNG lặp lại ở mục kỳ nữa, nếu không đếm ra hai lần.
   */
  const sections = useMemo(() => {
    const deposits = filtered.filter(e => e.kind === 'DEPOSIT');
    const rest     = filtered.filter(e => e.kind !== 'DEPOSIT');

    const map = new Map<string, Entry[]>();
    for (const e of rest) {
      const k = (e.at || '').slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    const byPeriod = [...map.entries()]
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([key, data]) => {
        const [y, m] = key.split('-');
        return {
          key,
          title: m ? `Kỳ ${m}/${y}` : 'Chưa thu',
          pinned: false,
          count: data.length,
          deposits: 0,
          data: data.sort((a, b) => (b.at || '').localeCompare(a.at || '')),
        };
      });

    if (deposits.length === 0) return byPeriod;

    return [
      {
        key: '__deposit__',
        title: '🔐 Tiền cọc khách thuê',
        pinned: true,
        count: deposits.length,
        deposits: deposits.length,
        data: deposits.sort((a, b) => (b.at || '').localeCompare(a.at || '')),
      },
      ...byPeriod,
    ];
  }, [filtered]);

  const counts = useMemo(() => ({
    verified: payments.filter(p => p.status === 'VERIFIED').length,
    pending: payments.filter(p => p.status === 'PENDING_VERIFY').length,
    deposits: deposits.filter(d => (d.status || '').toUpperCase() === 'PAID').length,
  }), [payments, deposits]);

  /** Xác nhận / từ chối giao dịch khách báo đã chuyển — làm ngay trong sheet chi tiết. */
  const handleVerify = (e: Entry, approved: boolean) => {
    if (e.paymentId == null) return;
    const doIt = async () => {
      setActing(true);
      try {
        if (approved) await realManagerInvoiceService.verifyPayment(e.paymentId!);
        else await realManagerInvoiceService.rejectPayment(e.paymentId!);
        setSelected(null);
        load();
      } catch (err: any) {
        showAlert('Lỗi', err?.response?.data?.message || err?.message || 'Không xử lý được giao dịch.');
      } finally {
        setActing(false);
      }
    };
    showAlert(
      approved ? 'Xác nhận đã nhận tiền?' : 'Từ chối giao dịch?',
      approved
        ? `Xác nhận đã nhận đủ tiền hoá đơn ${e.ref} từ ${e.tenantName}?`
        : `Từ chối giao dịch ${e.ref} của ${e.tenantName}?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: approved ? 'Xác nhận' : 'Từ chối', style: approved ? 'default' : 'destructive', onPress: doIt },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Thu & Đối soát</Text>
          {/* Không rao "không hiển thị tiền thuê & tiền cọc" nữa (13/08/2026): nói ra
              chính là chỉ cho manager biết có thứ đang bị giấu, mà chẳng giúp họ làm
              việc gì. Chỗ nào thật sự cần giải thích thì đã có câu trong ô chi tiết. */}
          <Text style={s.subtitle}>Điện nước · dịch vụ · tiền cọc</Text>
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

      {/* ── Tổng quan: 3 ô bấm được để lọc, cùng kiểu với các màn hoá đơn ── */}
      <View style={s.statsRow}>
        {([
          { key: 'VERIFIED' as const, num: counts.verified, label: 'Đã xác nhận', color: Colors.success },
          { key: 'PENDING_VERIFY' as const, num: counts.pending, label: 'Chờ xác nhận', color: Colors.warning },
          { key: 'DEPOSIT' as const, num: counts.deposits, label: 'Đã thu cọc', color: Colors.primary },
        ]).map(st => {
          const on = filter === st.key;
          return (
            <TouchableOpacity
              key={st.key}
              style={[s.stat, on && { backgroundColor: st.color + '14', borderColor: st.color + '55' }]}
              onPress={() => setFilter(on ? 'all' : st.key)}
              activeOpacity={0.7}
            >
              <View style={[s.statDot, { backgroundColor: st.num > 0 ? st.color : Colors.textMuted }]} />
              <Text style={[s.statNum, { color: st.num > 0 ? st.color : Colors.textMuted }]}>{st.num}</Text>
              <Text style={s.statLbl}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Bộ lọc: cuộn ngang 1 hàng, không xuống dòng thành 2 tầng ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
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
      </ScrollView>

      {loading ? (
        <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.key}
          stickySectionHeadersEnabled={false}
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          renderSectionHeader={({ section }) => (
            <View style={[s.monthBar, section.pinned && s.depositBar]}>
              <Text style={[s.sectionHeader, section.pinned && s.depositBarTitle]}>{section.title}</Text>
              {/* Mục cọc nói rõ "sẽ hoàn lại" — không thì manager đọc thành doanh thu. */}
              <Text style={[s.monthMeta, section.pinned && s.depositBarMeta]}>
                {section.pinned
                  ? `${section.count} khoản · hoàn lại khi trả phòng`
                  : `${section.count} giao dịch`}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TxnRow entry={item} onPress={setSelected} />
          )}
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

      {/* ── Chi tiết giao dịch ─────────────────────────────────────── */}
      {selected && (() => {
        const e = selected;
        const st = statusOf(e.status);
        const mc = methodOf(e.method);
        const isDeposit = e.kind === 'DEPOSIT';
        const hidden = isDeposit || isAmountHidden(e.invoiceKind);
        const canVerify = !isDeposit && e.status.toUpperCase() === 'PENDING_VERIFY';

        return (
          <Modal transparent animationType="slide" onRequestClose={() => setSelected(null)}>
            <View style={s.modalOverlay}>
              <View style={s.sheet}>
                <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
                  <View style={s.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle}>
                        {e.tenantName}{e.roomNumber ? ` · ${e.roomNumber}` : ''}
                      </Text>
                      <Text style={s.modalSub}>
                        {isDeposit ? 'Tiền cọc hợp đồng' : KIND_LABEL[e.invoiceKind]}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={s.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[s.statusBanner, { backgroundColor: st.bg }]}>
                    <Text style={{ fontSize: 20 }}>{isDeposit ? '🔐' : mc.icon}</Text>
                    <Text style={[s.statusBannerText, { color: st.color }]}>{st.label}</Text>
                  </View>

                  {/* Số tiền — cọc/điện/nước/dịch vụ hiện rõ, riêng tiền nhà thì ẩn. */}
                  <View style={s.amountBox}>
                    <Text style={s.amountLabel}>
                      {isDeposit
                        ? (e.status.toUpperCase() === 'PAID' ? 'Tiền cọc đã chuyển' : 'Tiền cọc phải thu')
                        : 'Số tiền giao dịch'}
                    </Text>
                    {hidden ? (
                      <>
                        <Text style={s.amountHidden}>Không hiển thị</Text>
                        <Text style={s.amountNote}>
                          {isDeposit ? DEPOSIT_AMOUNT_HIDDEN_NOTE : RENT_AMOUNT_HIDDEN_NOTE}
                        </Text>
                      </>
                    ) : (
                      <Text style={s.amountValue}>{formatCurrency(e.amount ?? 0)}</Text>
                    )}
                    {isDeposit && !!e.depositMonths && (
                      <Text style={s.amountNote}>Tương đương {e.depositMonths} tháng tiền nhà</Text>
                    )}
                  </View>

                  <View style={s.detailBlock}>
                    <DetailRow label={isDeposit ? 'Mã hợp đồng' : 'Mã hoá đơn'} value={e.ref || '—'} />
                    <DetailRow label="Toà nhà" value={e.propertyName} />
                    {!!e.roomNumber && <DetailRow label="Phòng" value={e.roomNumber} />}
                    <DetailRow label="Khách thuê" value={e.tenantName} />
                    {/* SĐT ẩn với manager (13/08/2026). */}
                    <DetailRow label="Hình thức" value={e.method ? mc.label : 'Chưa thu'} />
                    <DetailRow
                      label={isDeposit ? 'Thời điểm thu cọc' : e.status.toUpperCase() === 'VERIFIED' ? 'Thời điểm xác nhận' : 'Thời điểm khách báo'}
                      value={fullTime(e.at)}
                    />
                    {isDeposit && !!e.moveInDate && <DetailRow label="Ngày nhận nhà" value={dateOnly(e.moveInDate)} />}
                    {isDeposit && !!e.contractStatus && (
                      <DetailRow
                        label="Trạng thái hợp đồng"
                        value={CONTRACT_STATUS_LABEL[e.contractStatus] ?? e.contractStatus}
                      />
                    )}
                    {!!e.note && <DetailRow label="Nội dung chuyển khoản" value={e.note} wrap />}
                  </View>

                  {canVerify && (
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.actionBtn, s.rejectBtn]}
                        disabled={acting}
                        onPress={() => handleVerify(e, false)}
                      >
                        <Text style={s.rejectBtnText}>Từ chối</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, s.verifyBtn]}
                        disabled={acting}
                        onPress={() => handleVerify(e, true)}
                      >
                        <Text style={s.verifyBtnText}>{acting ? 'Đang xử lý...' : '✓ Đã nhận tiền'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ label: string; value: string; wrap?: boolean }> = ({ label, value, wrap }) => (
  <View style={[s.detailRow, wrap && s.detailRowWrap]}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={[s.detailVal, wrap && s.detailValWrap]} selectable>{value}</Text>
  </View>
);

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
    flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.base,
  },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  statDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2 },

  // ScrollView ngang nằm trong container dọc: phải khoá chiều cao, không thì RN vừa
  // kéo giãn vừa cho SectionList bóp lại làm chip bị cắt mất nửa dưới.
  filterScroll: { flexGrow: 0, flexShrink: 0, height: 34, marginTop: Spacing.base },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  filterChip: {
    height: 32, justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextOn: { color: Colors.white },

  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 100 },
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.md, marginBottom: Spacing.sm,
  },
  sectionHeader: {
    fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase',
  },
  monthMeta: { fontSize: 11, color: Colors.textMuted },

  // Mục "Tiền cọc" ghim đầu — nền riêng để không bị đọc nhầm thành một kỳ nữa.
  depositBar: {
    backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#A5F3FC',
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  depositBarTitle: { color: '#0E7490', textTransform: 'none', fontSize: 13 },
  depositBarMeta:  { color: '#0891B2' },

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
  rowRef: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3 },
  rowMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6, maxWidth: 108 },
  rowAmount: { fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary },
  rowAmountHidden: { color: Colors.textMuted, letterSpacing: 1 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10.5, fontWeight: '800' },

  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    maxHeight: '88%',
  },
  sheetContent: { padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.base },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  modalClose: { fontSize: 18, color: Colors.textMuted, fontWeight: '700', padding: 2 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.base,
  },
  statusBannerText: { fontSize: 15, fontWeight: '800' },

  amountBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  amountLabel: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  amountValue: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  amountHidden: { fontSize: 16, fontWeight: '800', color: Colors.textMuted, marginTop: 4 },
  amountNote: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },

  detailBlock: { borderTopWidth: 1, borderColor: Colors.divider },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  detailRowWrap: { flexDirection: 'column', gap: 4 },
  detailLabel: { fontSize: 13, color: Colors.textSecondary },
  detailVal: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
  detailValWrap: { textAlign: 'left', lineHeight: 19 },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  actionBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  rejectBtn: { backgroundColor: Colors.errorLight },
  rejectBtnText: { fontSize: 14, fontWeight: '800', color: Colors.error },
  verifyBtn: { backgroundColor: Colors.success },
  verifyBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
});
