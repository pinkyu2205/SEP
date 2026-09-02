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

/** Khoản thu lúc nhận phòng — BE để `type = OTHER`, nhận diện theo mã (isOnboardCode). */
const ONBOARD_TYPE_CFG = {
  label: 'Thu khi nhận phòng', icon: '🔐', color: '#059669', bg: '#ECFDF5',
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
  /** Hoá đơn theo mã — để mở màn chi tiết hoá đơn từ một giao dịch. */
  const [invoiceByCode, setInvoiceByCode] = useState<Map<string, SharedBill>>(new Map());
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

  const hasFilter = typeFilter !== 'all' || methodFilter !== 'all' || !!query.trim();

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

  const renderTransaction = ({ item }: { item: Txn }) => {
    const method = METHOD_CONFIG[item.method] || METHOD_CONFIG.other;
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const place = [item.propertyName, item.roomName].filter(Boolean).join(' · ');
    // Hoá đơn onboard mang `type = OTHER` nên rơi vào nhãn "Khác" — vô nghĩa với khách.
    // Nhận diện theo MÃ và dùng đúng nhãn như các màn hoá đơn khác.
    const onboard = isOnboardCode(item.invoiceCode);
    const onboardInvoice = onboard ? invoiceByCode.get(item.invoiceCode) : undefined;
    // Dòng đã tách thì gắn nhãn theo đúng khoản của nó (Tiền cọc / Tiền phòng), chứ
    // không dùng nhãn gộp "Thu khi nhận phòng" nữa — tách ra mà vẫn chung một nhãn thì
    // nhìn hệt như bị hiển thị lặp.
    const cfg = item.splitPart
      ? typeCfg(item.invoiceType)
      : onboard ? ONBOARD_TYPE_CFG : typeCfg(item.invoiceType);

    return (
      <TouchableOpacity
        style={[styles.card, item.duplicate && styles.cardDuplicate]}
        activeOpacity={0.75}
        onPress={() => {
          // Khoản thu lúc nhận phòng là khoản GỘP (cọc + tiền nhà chu kỳ đầu) → mở màn
          // hoá đơn để khách thấy nó gồm những gì. Màn "Chi tiết giao dịch" chỉ nói được
          // đã chuyển bao nhiêu, bằng cách nào — không tách được khoản gộp.
          if (onboardInvoice) {
            navigation.navigate('InvoiceDetail', { invoice: onboardInvoice });
          } else if (item.contractId) {
            // Cọc không có bản ghi giao dịch riêng → mở thẳng hợp đồng chứa nó.
            navigation.navigate('ContractDetail', { contractId: item.contractId });
          } else {
            navigation.navigate('PaymentHistoryDetail', { transaction: item });
          }
        }}
      >
        <View style={styles.cardTop}>
          {/* Icon theo LOẠI PHÍ chứ không theo phương thức: khách quan tâm
              "trả tiền gì" trước, "trả bằng cách nào" là thông tin phụ ở dưới. */}
          <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
            <Text style={{ fontSize: 18 }}>{cfg.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.codeRow}>
              {/* Dòng tách ra hiện TÊN KHOẢN THU thay vì mã hoá đơn: hai nửa dùng chung
                  một mã HD-ONBOARD-*, để mã lên đầu thì hai thẻ nhìn y hệt nhau. */}
              <Text style={styles.invoiceCode} numberOfLines={1}>
                {item.splitLabel ?? item.invoiceCode}
              </Text>
              <View style={[styles.typeTag, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.typeTagText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            {!!place && <Text style={styles.place} numberOfLines={1}>{place}</Text>}
            {!!item.splitNote && (
              <Text style={styles.splitNote} numberOfLines={2}>{item.splitNote}</Text>
            )}
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


        {item.splitPart && (
          <View style={styles.splitBox}>
            <Text style={styles.splitBoxText}>
              🔗 Trả chung một lần khi nhận phòng · {item.invoiceCode}
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
            {onboardInvoice ? 'Xem hoá đơn →' : item.contractId ? 'Xem hợp đồng →' : 'Xem chi tiết →'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Thẻ giao dịch nằm TRONG khung của tháng.
   *
   * Hai viền hai bên do lớp bọc này vẽ, nối liền với nắp trên (tiêu đề tháng) và nắp
   * dưới (footer) thành một cái khung khép kín — nhìn là biết mấy hoá đơn này thuộc về
   * tháng nào, thay vì một dãy thẻ trôi tự do dưới một dòng chữ.
   */
  const renderInsideMonth = ({ item, index }: { item: Txn; index: number }) => (
    <View style={styles.sectionBody}>
      {/* Vạch ngăn mảnh giữa các giao dịch, KHÔNG phải mỗi giao dịch một thẻ nổi. */}
      {index > 0 && <View style={styles.rowDivider} />}
      {renderTransaction({ item })}
    </View>
  );

  /**
   * Tháng đang gập thì `data` rỗng — SectionList không dựng thẻ nào của tháng đó.
   * Dựng hết rồi ẩn bằng style thì vẫn trả đủ giá, mà đây có thể là hàng chục giao dịch.
   */
  const visibleSections = useMemo(
    () => sections.map(s => (isOpen(s.key) ? s : { ...s, data: [] as Txn[] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, openKeys, defaultOpen, hasFilter],
  );

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
        sections={visibleSections}
        keyExtractor={t => t.id}
        renderItem={renderInsideMonth}
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
                  {countTxns(filtered)} giao dịch · {formatCurrency(sumReal(filtered))}
                </Text>
                <TouchableOpacity onPress={() => { setTypeFilter('all'); setMethodFilter('all'); setQuery(''); }}>
                  <Text style={styles.filterReset}>Xóa lọc</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => {
          const open = isOpen(section.key);
          return (
            /*
              Tiêu đề là NÚT GẬP, và cũng là nắp trên của khung bọc cả nhóm: bo góc trên
              khi đang mở, bo cả bốn góc khi đã gập (lúc đó nó là toàn bộ cái thẻ).
            */
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => toggleSection(section.key)}
              style={[
                styles.sectionHeader,
                open ? styles.sectionHeaderOpen : styles.sectionHeaderClosed,
                section.pinned && styles.sectionHeaderPinned,
              ]}
            >
              {/*
                Ô biểu tượng bên trái — thẻ giao dịch bên trong đều mở đầu bằng một ô
                vuông bo tròn có nền nhạt (⚡ điện, 💧 nước). Thanh tháng không có gì ở
                đó nên nhìn như một cái gạch ngang lạc loài giữa dãy thẻ; thêm vào là nó
                thành anh em cùng một họ.
              */}
              <View style={[styles.sectionIcon, section.pinned && styles.sectionIconPinned]}>
                <Text style={styles.sectionIconGlyph}>{section.pinned ? '🔐' : '📅'}</Text>
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={[styles.sectionTitle, section.pinned && styles.sectionTitlePinned]}>
                  {section.title}
                </Text>
                <Text style={[styles.sectionMeta, section.pinned && styles.sectionMetaPinned]}>
                  {/* Cọc nói rõ "được hoàn khi trả phòng" — khách hay tưởng đây là khoản mất hẳn. */}
                  {section.pinned ? 'hoàn lại khi trả phòng' : `${section.count} giao dịch`}
                </Text>
              </View>
              {/*
                SỐ TIỀN tách ra khỏi dòng chữ nhỏ và cho đứng riêng.
                Gập lại rồi thì cả tháng chỉ còn đúng dòng này, mà thứ khách quét mắt tìm
                là con số — chôn nó giữa "1 giao dịch · 2.000.000 đ" cỡ 11px thì phải đọc
                cả dòng mới lọc ra được.
              */}
              <Text style={[styles.sectionTotal, section.pinned && styles.sectionTotalPinned]}>
                {formatCurrency(section.total)}
              </Text>
              {/* Mũi tên trong nền tròn — dấu hiệu quy ước cho "bấm được, còn nội dung bên trong". */}
              <View style={[styles.chevronWrap, section.pinned && styles.chevronWrapPinned]}>
                <Text style={[styles.chevron, section.pinned && styles.chevronPinned]}>
                  {open ? '⌃' : '⌄'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        /*
          Gập = KHÔNG dựng thẻ nào của tháng đó. Không dùng cách ẩn bằng style: danh sách
          này có thể hàng chục giao dịch, dựng hết rồi giấu đi thì vẫn trả giá đủ.
        */
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

  /*
    ── KHUNG BỌC MỘT THÁNG ────────────────────────────────────────────────────
    Ba mảnh ghép lại thành một khung khép kín: `sectionHeader` là nắp trên (cũng là nút
    gập), `sectionBody` vẽ hai viền hai bên quanh từng thẻ giao dịch, `sectionFooterOpen`
    là nắp dưới. Phải tách làm ba vì SectionList dựng header / item / footer thành ba
    khối anh em, không có chỗ nào bọc chung được cả nhóm.

    Nền của thân khung là `background` (xám) chứ không phải trắng: thẻ giao dịch màu
    trắng, để trắng trên trắng thì mất đường viền của từng thẻ.
  */
  /*
    Mềm hơn = ba thứ cùng lúc: bo góc rộng (xl thay vì lg), viền nhạt hơn hẳn màu
    `border` mặc định, và bỏ nét đậm 900. Một hình chữ nhật góc nhọn + chữ đậm nhất +
    màu bão hoà nhất đứng cạnh nhau là công thức chắc chắn ra "thô".
  */
  /*
    KHÔNG có bóng đổ ở đây.

    Bóng đổ chỉ vẽ được quanh MỘT view, mà khung tháng là ba view ghép lại (nắp trên /
    thân / nắp dưới). Đặt bóng lên nắp trên thì lúc mở ra nắp có bóng còn thân không —
    nắp trông như nổi hẳn lên trên phần thân, đúng cái cảm giác "đóng một kiểu mở một
    kiểu". Cả khung đi bằng viền, phẳng, giống hệt nhau ở cả hai trạng thái.
  */
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: '#EFF2F7',
  },
  sectionHeaderText: { flex: 1 },
  /** Đang mở: chỉ bo góc trên, viền dưới để `sectionBody` nối tiếp xuống. */
  sectionHeaderOpen: {
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    borderBottomWidth: 0,
  },
  /** Đã gập: cả nhóm chỉ còn đúng dòng này, nên bo đủ bốn góc. */
  sectionHeaderClosed: { borderRadius: BorderRadius.xl },

  sectionIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primaryBg, marginRight: Spacing.sm + 2,
  },
  sectionIconPinned: { backgroundColor: '#CFFAFE' },
  sectionIconGlyph: { fontSize: 17 },
  /*
    Khoảng cách giữa các thẻ nằm TRONG lớp bọc (paddingTop), không dùng
    `ItemSeparatorComponent`: dải cách của SectionList là một View anh em nằm NGOÀI lớp
    bọc, nên hai viền hai bên sẽ đứt một đoạn ở mỗi khe — khung hở thành từng khúc.
  */
  /*
    Thân khung dùng CHUNG nền trắng với nắp trên, không phải một máng xám lồng bên trong.

    Bản trước để nền xám rồi thả thẻ trắng có bóng đổ vào giữa: bấm mở ra là màu nền đổi,
    xuất hiện thêm một lớp thẻ nữa, và một cái viền nữa — nhìn ra hai vật thể khác nhau
    chứ không phải cùng một thẻ vừa cao lên. Giờ mở hay đóng cũng chỉ là một thẻ trắng,
    các giao dịch nằm trong đó như những DÒNG ngăn bằng vạch mảnh.
  */
  sectionBody: {
    backgroundColor: Colors.white,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#EFF2F7',
    paddingHorizontal: Spacing.base,
  },
  rowDivider: { height: 1, backgroundColor: '#F1F5F9' },
  sectionFooterOpen: {
    height: Spacing.sm,
    backgroundColor: Colors.white,
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#EFF2F7',
    borderBottomLeftRadius: BorderRadius.xl, borderBottomRightRadius: BorderRadius.xl,
  },
  /* Mũi tên để màu XÁM, không phải primary: nó là nút phụ, tô cùng màu với con số tiền
     là hai thứ cùng giành sự chú ý trên một dòng chỉ có bốn phần tử. */
  chevronWrap: {
    width: 28, height: 28, borderRadius: 14, marginLeft: Spacing.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  chevron: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, lineHeight: 17 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.1 },
  sectionMeta: { fontSize: 12, fontWeight: '500', color: Colors.textMuted, marginTop: 1 },
  sectionTotal: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginLeft: Spacing.sm },

  // Mục Tiền cọc ghim đầu — nền riêng để tách khỏi dãy nhóm-theo-tháng bên dưới,
  // nếu không nó trông như "một tháng nào đó" và mất luôn ý nghĩa ghim.
  sectionHeaderPinned: { backgroundColor: '#F0FDFF', borderColor: '#CFF3F8' },
  sectionTitlePinned: { color: '#0E7490' },
  sectionMetaPinned:  { color: '#0891B2' },
  sectionTotalPinned: { color: '#0E7490' },
  chevronWrapPinned:  { backgroundColor: '#DFF7FB' },
  chevronPinned:      { color: '#0891B2' },

  // Thẻ giao dịch
  /* Giao dịch là DÒNG trong thẻ tháng, không còn là thẻ nổi riêng: bỏ nền trắng, bỏ bóng
     đổ, bỏ bo góc — ba thứ đó chỉ có nghĩa khi nó tự đứng trên nền xám. */
  card: { paddingVertical: Spacing.base },
  cardDuplicate: {
    borderWidth: 1, borderColor: Colors.warning + '66', backgroundColor: '#FFFDF5',
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, marginVertical: Spacing.xs,
  },
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
  // Dòng phụ của khoản tách ra: kỳ tính tiền nhà / ghi chú cọc được hoàn.
  splitNote: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },
  // Dải nhắc "cùng một lần chuyển" — để khách không tưởng mình bị thu hai lần.
  splitBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 6, marginTop: Spacing.sm,
  },
  splitBoxText: { fontSize: 10.5, color: Colors.textMuted, fontWeight: '600' },
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
