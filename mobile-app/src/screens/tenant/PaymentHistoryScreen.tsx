import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { PaymentTransaction } from '@/types';
import { formatCurrency, formatDate, formatDateTime, isOnboardBillCode } from '@/utils';
import {
  realTenantBillingService, toSharedBill, TenantPayment, TenantInvoiceType,
} from '@/services/tenant/billingService';
import { SharedBill } from '@/types/bill';
import { realTenantSelfService } from '@/services/tenant/selfService';
import { currentMonthIso } from '@/utils/serverTime';

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
  /**
   * Dòng được tách ra từ một lần chuyển tiền gộp (xem splitOnboardPayments).
   * `groupId` = id của lần chuyển gốc, để đếm "N giao dịch" không bị nhân đôi.
   */
  splitPart?: boolean;
  groupId?: string;
  /** Tên khoản thu, thay cho mã hoá đơn ở dòng tiêu đề của thẻ. */
  splitLabel?: string;
  /** Dòng phụ: kỳ tính của phần tiền nhà chu kỳ đầu. */
  splitNote?: string;
}

/** Mã hoá đơn thu lúc nhận phòng của một hợp đồng — quy ước BE, dùng ở nhiều màn. */
const onboardCodeOf = (contractId: number) => `HD-ONBOARD-${contractId}`;
const isOnboardCode = isOnboardBillCode;

/**
 * BỎ dòng "Tiền cọc" FE tự dựng khi hợp đồng đó đã có giao dịch onboard.
 *
 * Khách chỉ chuyển MỘT lần lúc nhận phòng (cọc + tiền nhà chu kỳ đầu) và BE trả đúng một
 * bản ghi `HD-ONBOARD-{contractId}` với số tiền gộp trong `/tenant/me/payments`. Dòng
 * "Tiền cọc" do FE tự dựng từ `contract.deposit` (xem loadDeposits) là cùng lần chuyển
 * đó — giữ lại là hiện hai dòng, cùng một mã PayOS, tổng bị thổi lên (BE xác nhận
 * 13/08/2026).
 *
 * Vẫn giữ `loadDeposits` cho hợp đồng CŨ chưa có hoá đơn onboard: ở đó dòng tự dựng là
 * bản ghi duy nhất chứng minh khách đã đóng cọc, xoá đi là mất dữ liệu.
 *
 * Tiền cọc của hợp đồng mới khách vẫn tra được: nó nằm trong chi tiết hoá đơn onboard
 * ("Tiền cọc (N tháng)") và trong màn hợp đồng.
 */
const dropDepositsInsideOnboard = (invoicePays: Txn[], depositPays: Txn[]): Txn[] => {
  const onboardCodes = new Set(
    invoicePays.map(t => t.invoiceCode).filter(isOnboardCode),
  );
  return depositPays.filter(d => {
    const code = d.contractId != null ? onboardCodeOf(d.contractId) : '';
    return !onboardCodes.has(code);
  });
};

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

/** Số LẦN CHUYỂN TIỀN — hai nửa của một khoản gộp chỉ tính là một. */
const countTxns = (rows: Txn[]) => new Set(rows.map(t => t.groupId ?? t.id)).size;

/**
 * TÁCH khoản thu lúc nhận phòng thành 2 dòng: tiền cọc và tiền nhà chu kỳ đầu.
 *
 * Khách chuyển MỘT lần nhưng thực chất trả hai khoản có bản chất khác hẳn nhau: cọc là
 * tiền được HOÀN LẠI khi trả phòng, tiền nhà chu kỳ đầu là tiền đã chi. Gộp làm một
 * dòng `HD-ONBOARD-*` thì khách phải mở vào chi tiết hoá đơn mới biết mình đã đóng cọc
 * bao nhiêu, và tab lọc "🔐 Tiền cọc" luôn rỗng vì BE gắn hoá đơn onboard là `OTHER`.
 *
 * Chia theo `paymentBreakdown.depositAmount` của BE (PaymentBreakdownBuilder
 * .fromOnboardInvoice — có sẵn cả depositMonths và kỳ tính periodStart/periodEnd).
 * Phần tiền nhà = **số tiền đã chuyển − cọc**, lấy mốc là số tiền của chính giao dịch
 * chứ không phải `grandTotal` của hoá đơn, để hai dòng luôn cộng đúng bằng con số ở thẻ
 * tổng phía trên, kể cả khi BE đổi cách làm tròn.
 *
 * Không đủ dữ liệu tin cậy (thiếu breakdown, cọc ≤ 0, hoặc cọc ≥ số đã chuyển) thì GIỮ
 * NGUYÊN một dòng như cũ — thà hiện gộp còn hơn bịa ra con số.
 *
 * Chạy SAU markDuplicates: hàm đó nhận diện trùng theo `invoiceCode`, mà hai nửa dùng
 * chung một mã — tách trước là nửa sau bị đánh dấu trùng và biến mất khỏi tổng.
 */
const splitOnboardPayments = (rows: Txn[], billByCode: Map<string, SharedBill>): Txn[] =>
  rows.flatMap((t): Txn[] => {
    if (t.duplicate || !isOnboardCode(t.invoiceCode)) return [t];

    const bd = billByCode.get(t.invoiceCode)?.paymentBreakdown;
    const deposit = Number(bd?.depositAmount);
    if (!Number.isFinite(deposit) || deposit <= 0) return [t];

    const rent = t.amount - deposit;
    if (rent <= 0) return [t];

    const months = Number(bd?.depositMonths);
    const period = bd?.periodStart && bd?.periodEnd
      ? `Kỳ ${formatDate(bd.periodStart)} → ${formatDate(bd.periodEnd)}`
      : undefined;

    return [
      {
        ...t,
        id: `${t.id}-deposit`,
        groupId: t.id,
        splitPart: true,
        amount: deposit,
        invoiceType: 'DEPOSIT',
        splitLabel: Number.isFinite(months) && months > 0 ? `Tiền cọc (${months} tháng)` : 'Tiền cọc',
        splitNote: 'Được hoàn lại khi trả phòng, sau khi trừ hư hỏng (nếu có)',
      },
      {
        ...t,
        id: `${t.id}-rent`,
        groupId: t.id,
        splitPart: true,
        amount: rent,
        invoiceType: 'RENT',
        splitLabel: 'Tiền nhà chu kỳ đầu',
        splitNote: period,
      },
    ];
  });

/**
 * Phương thức của một giao dịch.
 *
 * Khoản thu lúc nhận phòng chỉ có MỘT đường vào: quét QR PayOS. Nên hễ BE không nói rõ
 * được phương thức thì hiển thị QR, thay vì đổ về "Khác" — khách đọc "Khác" không hiểu
 * mình đã trả bằng gì.
 *
 * Bắt theo KẾT QUẢ MAP chứ không so từng chuỗi: dữ liệu thật rơi vào đây có thể là
 * `OTHER` (bản ghi cũ) hoặc `PAYOS` (BE chưa restart sau khi pull commit 898f96c) —
 * cả hai đều không có trong PAY_METHOD_MAP nên cùng ra 'other'. So chuỗi thì sót.
 *
 * Chỉ áp cho hoá đơn onboard. BE nói rõ QR/CASH/BANK_TRANSFER thì tôn trọng dữ liệu.
 */
const methodOfPayment = (p: TenantPayment): Txn['method'] => {
  const mapped = PAY_METHOD_MAP[p.method] ?? 'other';
  return isOnboardCode(p.invoiceCode) && mapped === 'other' ? 'qr' : mapped;
};

const toTxn = (p: TenantPayment): Txn => ({
  id: String(p.id),
  invoiceId: String(p.invoiceId),
  invoiceCode: p.invoiceCode,
  tenantId: '',
  tenantName: '',
  roomName: p.roomNumber ? `Phòng ${p.roomNumber}` : '',
  amount: p.amount,
  method: methodOfPayment(p),
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

/** Khoản thu lúc nhận phòng — BE để `type = OTHER`, nhận diện theo mã (isOnboardCode). */
const ONBOARD_TYPE_CFG = {
  label: 'Thu khi nhận phòng', icon: '🔐', color: '#059669', bg: '#ECFDF5',
};
const typeCfg = (t: PayKind) => TYPE_CONFIG[t] ?? TYPE_CONFIG.OTHER;

type TypeFilter = 'all' | PayKind;

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'RENT', label: '🏠 Phòng' },
  { key: 'DEPOSIT', label: '🔐 Cọc' },
  { key: 'ELECTRICITY', label: '⚡ Điện' },
  { key: 'WATER', label: '💧 Nước' },
  { key: 'MAINTENANCE', label: '🔧 Bảo trì' },
];

/** Cọc: PAYOS = chuyển khoản qua cổng, CASH = quản lý thu tay. */
const DEPOSIT_METHOD_MAP: Record<string, PaymentTransaction['method']> = {
  PAYOS: 'bank_transfer', CASH: 'cash', QR: 'qr', BANK_TRANSFER: 'bank_transfer',
};

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  return m ? `Tháng ${Number(m)}/${y}` : 'Không rõ thời gian';
};

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

export const PaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [transactions, setTransactions] = useState<Txn[]>([]);
  /** Hoá đơn theo mã — để mở màn chi tiết hoá đơn từ một giao dịch. */
  const [invoiceByCode, setInvoiceByCode] = useState<Map<string, SharedBill>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
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
      // Nạp kèm hoá đơn để bấm "Xem hoá đơn" ở khoản thu onboard mở được màn chi tiết
      // (nơi có phần cấu thành của khoản gộp). Route InvoiceDetail nhận cả object hoá
      // đơn chứ không nhận id, nên phải có sẵn ở đây.
      realTenantBillingService.listInvoices().then(rows => rows.map(toSharedBill))
        .catch(() => [] as SharedBill[]),
    ])
      .then(([invoicePays, depositPays, invoices]) => {
        const byCode = new Map(invoices.filter(i => !!i.code).map(i => [i.code, i]));
        setInvoiceByCode(byCode);
        setTransactions(splitOnboardPayments(
          markDuplicates([
            ...invoicePays,
            ...dropDepositsInsideOnboard(invoicePays, depositPays),
          ]),
          byCode,
        ));
      })
      .catch(() => setTransactions([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [loadDeposits]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Trả xong là có giao dịch mới — nạp lại để lịch sử không phải chờ khách tự kéo refresh.
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: () => load(true),
  });

  // ── Thống kê trên TOÀN BỘ giao dịch, không đổi theo bộ lọc ──
  const stats = useMemo(() => {
    const thisMonth = currentMonthIso();
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
      // Đếm theo LẦN CHUYỂN TIỀN (countTxns), không đếm số thẻ: khoản thu lúc nhận
      // phòng hiện thành 2 thẻ (cọc + tiền nhà) nhưng khách chỉ chuyển một lần.
      count: countTxns(transactions),
      realCount: countTxns(transactions.filter(t => !t.duplicate)),
      duplicateCount: dups.length,
      duplicateAmount: dups.reduce((s, t) => s + t.amount, 0),
      monthTotal: sumReal(inMonth), monthCount: countTxns(inMonth),
      latest,
      // Cọc là khoản sẽ được hoàn lại khi trả phòng — tách riêng để khách không
      // tưởng toàn bộ số tiền trên kia là chi phí đã mất.
      depositTotal: sumReal(deposits),
      depositCount: deposits.length,
    };
  }, [transactions]);

  /**
   * MỘT hàng lọc (24/09/2026): chỉ những loại khách thực sự đã trả, kèm số giao dịch.
   * Bản cũ có 2 hàng (6 loại cố định + 4 hình thức) — chip rỗng, bị cắt mép, lọc theo
   * hình thức gần như không ai dùng (tìm mã giao dịch ở ô tìm kiếm là đủ).
   */
  const typeChips = useMemo(() => {
    const chips: { key: TypeFilter; label: string; count: number }[] = [
      { key: 'all', label: 'Tất cả', count: countTxns(transactions) },
    ];
    for (const tab of TYPE_TABS) {
      if (tab.key === 'all') continue;
      const n = countTxns(transactions.filter(t => t.invoiceType === tab.key));
      if (n > 0) chips.push({ key: tab.key, label: tab.label, count: n });
    }
    return chips;
  }, [transactions]);
  // Loại đang chọn không còn giao dịch nào → tự về "Tất cả".
  const activeType: TypeFilter = typeChips.some(c => c.key === typeFilter) ? typeFilter : 'all';

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return transactions.filter(t =>
      (activeType === 'all' || t.invoiceType === activeType) &&
      (!q || [t.invoiceCode, t.transferContent, t.propertyName, t.roomName]
        .some(v => v && norm(String(v)).includes(q))),
    );
  }, [transactions, activeType, query]);

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
        /*
          Đếm SẴN ở đây, đừng để tiêu đề tự đếm `section.data`.
          Nhóm đang gập có `data` rỗng (xem `visibleSections`) — tiêu đề mà đếm mảng đó
          thì mọi tháng gập đều hiện "0 giao dịch" bên cạnh tổng tiền khác 0, tự mâu
          thuẫn ngay trên một dòng. Tổng tiền không dính lỗi này vì nó vốn tính sẵn.
        */
        count: countTxns(items),
        data: items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      }));

    if (!deposits.length) return monthSections;

    return [
      {
        key: '__deposit__',
        // Emoji chuyển vào ô biểu tượng bên trái, không dính vào chuỗi tiêu đề nữa.
        title: 'Tiền cọc',
        pinned: true,
        total: sumReal(deposits),
        count: countTxns(deposits),
        data: deposits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      },
      ...monthSections,
    ];
  }, [filtered]);

  const hasFilter = activeType !== 'all' || !!query.trim();

  /**
   * ── NHÓM THÁNG GẬP LẠI ĐƯỢC ──────────────────────────────────────────────
   *
   * Mỗi giao dịch là một thẻ cao ~180px với đủ hình thức · thời gian · mã CK. Khách ở
   * một năm là hơn ba chục thẻ nối đuôi nhau: muốn xem tháng 3 phải cuộn qua toàn bộ
   * tháng 4→12, mà nhìn màn hình chỉ thấy hai thẻ một lúc nên không có cách nào định vị
   * mình đang ở đâu. Gập lại thì cả năm nằm gọn trong một màn, chọn tháng rồi mới mở.
   *
   * `null` = chưa ai bấm gì → dùng mặc định: mở tháng mới nhất (và mục Tiền cọc đã ghim
   * — ghim để thấy ngay mà lại gập kín thì ghim làm gì). Bấm một cái là chốt lựa chọn
   * của khách, từ đó không tự mở/đóng sau lưng họ nữa.
   */
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null);

  const defaultOpen = useMemo(() => {
    const keys = new Set<string>();
    sections.forEach(s => { if (s.pinned) keys.add(s.key); });
    const newestMonth = sections.find(s => !s.pinned);
    if (newestMonth) keys.add(newestMonth.key);
    return keys;
  }, [sections]);

  /**
   * Đang lọc/tìm thì MỞ HẾT, bất kể khách đã gập gì.
   *
   * Gõ từ khoá xong mà kết quả nằm trong một tháng đang gập thì màn hình hiện ra y như
   * "không tìm thấy gì" — chỉ khác là có một dòng tiêu đề tháng nào đó. Lọc là hành động
   * nói rõ "tôi muốn thấy thứ khớp", nên không có lý do gì giấu nó đi.
   */
  const isOpen = (key: string) => hasFilter || (openKeys ?? defaultOpen).has(key);

  const toggleSection = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev ?? defaultOpen);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const openTxn = (item: Txn) => {
    // Khoản thu lúc nhận phòng là khoản GỘP → mở hoá đơn để thấy nó gồm những gì.
    const onboardInvoice = isOnboardCode(item.invoiceCode) ? invoiceByCode.get(item.invoiceCode) : undefined;
    if (onboardInvoice) navigation.navigate('InvoiceDetail', { invoice: onboardInvoice });
    // Cọc không có bản ghi giao dịch riêng → mở thẳng hợp đồng chứa nó.
    else if (item.contractId) navigation.navigate('ContractDetail', { contractId: item.contractId });
    else navigation.navigate('PaymentHistoryDetail', { transaction: item });
  };

  /**
   * Một giao dịch = MỘT DÒNG gọn (làm lại 24/09/2026): icon loại · tên khoản + kỳ ·
   * "hình thức · thời gian" · số tiền. Bản cũ mỗi giao dịch là một thẻ ~180px với ô
   * Hình thức/Thời gian/Mã CK/badge "Đã xác nhận" (mọi dòng đều đã xác nhận) — màn hình
   * chỉ chứa được 2 giao dịch. Mã giao dịch, nội dung CK xem ở màn chi tiết.
   */
  const renderTransaction = ({ item, index }: { item: Txn; index: number }) => {
    const method = METHOD_CONFIG[item.method] || METHOD_CONFIG.other;
    const onboard = isOnboardCode(item.invoiceCode);
    const cfg = item.splitPart
      ? typeCfg(item.invoiceType)
      : onboard ? ONBOARD_TYPE_CFG : typeCfg(item.invoiceType);
    const title = item.splitLabel ?? (onboard ? ONBOARD_TYPE_CFG.label : cfg.label);

    return (
      <View style={styles.sectionBody}>
        {index > 0 && <View style={styles.rowDivider} />}
        <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openTxn(item)}>
          <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
            <Text style={{ fontSize: 17 }}>{cfg.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {method.emoji} {method.label} · {formatDateTime(item.createdAt)}
            </Text>
            {!!item.splitNote && <Text style={styles.rowNote} numberOfLines={2}>{item.splitNote}</Text>}
            {item.duplicate && (
              <Text style={styles.rowWarn}>
                Ghi nhận trùng — không cộng vào tổng. Nếu bị trừ tiền 2 lần, hãy báo quản lý.
              </Text>
            )}
            {item.status === 'rejected' && (
              <Text style={styles.rowWarn}>Giao dịch bị từ chối — liên hệ quản lý.</Text>
            )}
          </View>
          <Text style={[styles.rowAmount, item.duplicate && styles.amountMuted]}>
            {formatCurrency(item.amount)}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  /** Tháng đang gập thì `data` rỗng — không dựng thẻ nào của tháng đó. */
  const visibleSections = useMemo(
    () => sections.map(s => (isOpen(s.key) ? s : { ...s, data: [] as Txn[] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, openKeys, defaultOpen, hasFilter],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Quay lại">
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đã thanh toán</Text>
      </View>

      <SectionList
        sections={visibleSections}
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
          <View style={{ gap: Spacing.md, marginBottom: Spacing.xs }}>
            {/* ── Tổng quan: thẻ trắng, cùng kiểu màn Hoá đơn ── */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tổng đã thanh toán</Text>
              <Text style={styles.summaryAmount}>{formatCurrency(stats.total)}</Text>
              <Text style={styles.summarySub}>
                {stats.count} giao dịch
                {stats.monthCount > 0 ? `  ·  tháng này ${formatCurrency(stats.monthTotal)}` : ''}
              </Text>
              {stats.depositCount > 0 && (
                <View style={styles.depositPill}>
                  <Text style={styles.depositPillText}>
                    🔐 Gồm {formatCurrency(stats.depositTotal)} tiền cọc — hoàn lại khi trả phòng
                  </Text>
                </View>
              )}
              {stats.duplicateCount > 0 && (
                <Text style={styles.summaryWarn}>
                  ⚠️ {stats.duplicateCount} giao dịch ghi trùng ({formatCurrency(stats.duplicateAmount)}) — đã trừ khỏi tổng
                </Text>
              )}
            </View>

            {/* ── Tìm kiếm ── */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Tìm mã hoá đơn, mã giao dịch…"
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
              />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.searchClear}>
                  <Text style={styles.searchClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── MỘT hàng lọc: chỉ những loại khách thực sự đã trả ── */}
            {typeChips.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {typeChips.map(f => {
                  const active = activeType === f.key;
                  return (
                    <TouchableOpacity key={f.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTypeFilter(f.key)}
                      activeOpacity={0.8}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {f.label} {f.count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {hasFilter && (
              <View style={styles.filterSummary}>
                <Text style={styles.filterSummaryText}>
                  {countTxns(filtered)} giao dịch · {formatCurrency(sumReal(filtered))}
                </Text>
                <TouchableOpacity onPress={() => { setTypeFilter('all'); setQuery(''); }}>
                  <Text style={styles.filterReset}>Xoá lọc</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => {
          const open = isOpen(section.key);
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => toggleSection(section.key)}
              style={[styles.sectionHeader, open ? styles.sectionHeaderOpen : styles.sectionHeaderClosed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {section.pinned ? '🔐 Tiền cọc' : section.title}
                </Text>
                <Text style={styles.sectionMeta}>
                  {section.pinned ? 'Hoàn lại khi trả phòng' : `${section.count} giao dịch`}
                </Text>
              </View>
              <Text style={[styles.sectionTotal, section.pinned && { color: '#0E7490' }]}>
                {formatCurrency(section.total)}
              </Text>
              <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
          );
        }}
        renderSectionFooter={({ section }) => (
          isOpen(section.key) ? <View style={styles.sectionFooterOpen} /> : null
        )}
        SectionSeparatorComponent={() => <View style={{ height: 0 }} />}
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
                  ? 'Thử bỏ bộ lọc hoặc từ khoá tìm kiếm.'
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 30, lineHeight: 34, color: Colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  list: { padding: Spacing.base, paddingBottom: 60 },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  summarySub: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
  depositPill: {
    alignSelf: 'flex-start', marginTop: Spacing.sm, backgroundColor: '#ECFEFF',
    borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4,
  },
  depositPillText: { fontSize: 12, fontWeight: '600', color: '#0E7490' },
  summaryWarn: { fontSize: 12, color: Colors.error, marginTop: Spacing.sm, fontWeight: '600' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, height: 44,
  },
  searchIcon: { fontSize: 14, marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 0 },
  searchClear: { padding: 4 },
  searchClearText: { fontSize: 14, color: Colors.textMuted },

  chipRow: { gap: Spacing.sm, paddingRight: Spacing.base },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  filterSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterSummaryText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  filterReset: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  // Nhóm tháng: tiêu đề là nắp trên, footer là nắp dưới của cùng một khung.
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, marginTop: Spacing.md,
  },
  sectionHeaderOpen: {
    borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sectionHeaderClosed: { borderRadius: BorderRadius.lg },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  sectionMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  sectionTotal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  chevron: { fontSize: 16, color: Colors.textMuted, width: 18, textAlign: 'center' },
  sectionBody: {
    backgroundColor: Colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border,
  },
  sectionFooterOpen: {
    height: 6, backgroundColor: Colors.white, borderWidth: 1, borderTopWidth: 0, borderColor: Colors.border,
    borderBottomLeftRadius: BorderRadius.lg, borderBottomRightRadius: BorderRadius.lg,
  },
  rowDivider: { height: 1, backgroundColor: Colors.divider, marginLeft: 62 },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  typeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  rowWarn: { fontSize: 11, color: Colors.error, marginTop: 3 },
  rowAmount: { fontSize: 14, fontWeight: '800', color: Colors.success },
  amountMuted: { color: Colors.textMuted, textDecorationLine: 'line-through' },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
