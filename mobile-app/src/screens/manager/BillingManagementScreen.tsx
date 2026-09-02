import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { RealtimeBadge } from '@/components/common';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, Modal, Pressable,
} from 'react-native';
import { showAlert, activeRentingKeys, belongsToActiveTenant } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_AMOUNT_HIDDEN_NOTE,
  canTerminateForUnpaidRent, monthLabel as monthLabelOf, shiftMonthKey, toMonthKey,
  RENT_TERMINATION_AFTER_DAYS,
} from '@/constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '@/services/manager/invoiceService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { checkoutService } from '@/services/manager/checkoutService';
import { serverNow, todayIso } from '@/utils/serverTime';

/**
 * HOÁ ĐƠN TIỀN NHÀ — một màn duy nhất cho cả kỳ thu.
 *
 * ─── Vì sao dựng lại (30/08/2026) ────────────────────────────────────────────
 * Bản trước tách làm HAI màn: màn này cho con số tổng, rồi phải nhảy sang "Tiền phòng
 * tự động" chọn nhà mới thấy được TỪNG KHÁCH. Nhưng câu hỏi duy nhất manager mở màn
 * này để hỏi lại là "kỳ này còn AI chưa trả" — tức luôn luôn phải nhảy màn. Hai nửa
 * của cùng một việc mà đặt ở hai nơi thì thao tác nào cũng dở dang.
 *
 * Nay gộp một màn: bấm tên nhà là bung ra từng khách ngay tại chỗ, bấm một khách là
 * mở sheet hành động. Không rời màn, không mất ngữ cảnh danh sách.
 *
 * Ba thứ khác đã sửa cùng lúc:
 *   • Bản cũ khi kỳ chưa có hoá đơn hiện BA khối rỗng nói cùng một chuyện. Nay đúng MỘT.
 *   • "0/0 · 0% hoàn thành" tô ĐỎ khi chưa phát hành hoá đơn nào — đỏ nghĩa là đang tệ,
 *     trong khi thực tế chỉ là chưa tới ngày 1. Nay chưa có hoá đơn thì không vẽ tiến độ.
 *   • Ô tìm kiếm nằm trên cùng kể cả khi không có gì để tìm. Nay chỉ hiện khi có dữ liệu.
 *
 * Thêm được ô CHỌN KỲ mà không cần API mới: `listInvoices({type:'RENT'})` vốn trả về
 * mọi tháng, trước đây bị lọc bỏ hết trừ tháng hiện tại. Giờ cho chọn tháng để tra lại
 * kỳ cũ ngay tại đây.
 *
 * ⚠️ Màn này KHÔNG hiện số tiền (chốt 07/08/2026 — xem @/constants/managerVisibility).
 * Mọi thống kê đếm theo SỐ HOÁ ĐƠN. Đừng thêm cột tiền vào đây.
 *
 * Phạm vi: CHỈ tiền nhà/phòng. Tiền cọc, điện nước, phí bảo trì nằm ở màn
 * "Tiền khách đã trả" (ManagerPaymentHistory).
 */

const METHOD_CONFIG: Record<string, { label: string; icon: string }> = {
  QR:            { label: 'QR VietQR',    icon: '📱' },
  BANK_TRANSFER: { label: 'Chuyển khoản', icon: '🏦' },
  CASH:          { label: 'Tiền mặt',     icon: '💵' },
  EWALLET:       { label: 'Ví điện tử',   icon: '👛' },
  OTHER:         { label: 'Khác',         icon: '💳' },
};
const methodOf = (m: string) => METHOD_CONFIG[(m || '').toUpperCase()] ?? METHOD_CONFIG.OTHER;

/**
 * Bỏ dấu + thường hoá để tìm "trang" ra "Đỗ Minh Trang", gõ không dấu vẫn thấy.
 * Manager gõ nhanh trên điện thoại, bắt gõ đúng dấu là không dùng được.
 */
const norm = (s: string) =>
  (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[đĐ]/g, 'd').toLowerCase();

/** "Hôm nay 13:58" / "Hôm qua 09:12" / "05/08 13:58" — dễ đọc hơn ISO thô. */
const fmtWhen = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(serverNow()) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return `Hôm nay ${hhmm}`;
  if (diffDays === 1) return `Hôm qua ${hhmm}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
};

const fmtDay = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

/** Số ngày trễ so với hạn nộp; ≤0 = còn hạn. */
const lateDays = (dueDate?: string | null) => {
  if (!dueDate) return 0;
  const d = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return 0;
  const today = serverNow(); today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
};

type StatusKey = 'all' | 'PAID' | 'PENDING' | 'OVERDUE';

/** Trạng thái một hoá đơn, quy về đúng thứ manager cần thấy trên một dòng. */
const rowState = (inv: ManagerInvoice) => {
  if (inv.status === 'PAID') {
    return { icon: '✓', label: 'Đã thu', color: Colors.success, bg: Colors.successLight };
  }
  const late = lateDays(inv.dueDate);
  if (inv.status === 'OVERDUE' || late > 0) {
    return { icon: '🔴', label: `Trễ ${late} ngày`, color: Colors.error, bg: Colors.errorLight };
  }
  return {
    icon: '⏰',
    label: late === 0 ? 'Hạn hôm nay' : `Còn ${-late} ngày`,
    color: Colors.warning,
    bg: Colors.warningLight,
  };
};

/**
 * Thanh tiến độ 3 đoạn: đã thu · chưa thu · quá hạn.
 *
 * Thay cho thanh 1 màu cũ (chỉ vẽ tỉ lệ đã thu) — nhìn một cái là biết phần còn lại
 * đang kẹt ở "chưa tới hạn" hay đã "quá hạn", không phải đọc con số bên dưới.
 */
const SegBar = ({ paid, pending, overdue }: { paid: number; pending: number; overdue: number }) => {
  const total = paid + pending + overdue;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%` as any;
  return (
    <View style={s.segBg}>
      {paid > 0 && <View style={[s.segPart, { width: pct(paid), backgroundColor: Colors.success }]} />}
      {pending > 0 && <View style={[s.segPart, { width: pct(pending), backgroundColor: Colors.warning }]} />}
      {overdue > 0 && <View style={[s.segPart, { width: pct(overdue), backgroundColor: Colors.error }]} />}
    </View>
  );
};

/** Chip lọc kiêm ô số — thay 3 ô số rời của bản cũ (chiếm 1/4 màn mà không bấm được). */
const Chip = ({ label, count, active, tone, onPress }: {
  label: string; count: number; active: boolean; tone: string; onPress: () => void;
}) => (
  <TouchableOpacity
    style={[s.chip, active && { backgroundColor: tone, borderColor: tone }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[s.chipText, active && { color: Colors.white }]}>{label}</Text>
    <View style={[s.chipCount, active && { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
      <Text style={[s.chipCountText, active && { color: Colors.white }]}>{count}</Text>
    </View>
  </TouchableOpacity>
);

export const BillingManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  /** Kỳ đang xem — bản cũ chốt cứng tháng hiện tại, không tra lại kỳ cũ được. */
  const [month, setMonth] = useState(() => toMonthKey());
  /** Nhà nào đang bung. Mặc định đóng hết cho danh sách ngắn, trừ khi chỉ có 1 nhà. */
  const [openHouses, setOpenHouses] = useState<Set<number>>(new Set());
  /** Dòng đang mở sheet chi tiết. */
  const [sheetRow, setSheetRow] = useState<ManagerInvoice | null>(null);
  const [terminating, setTerminating] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const [activeContracts, setActiveContracts] = useState<TenantContractResponse[]>([]);
  const rentingKeys = useMemo(() => activeRentingKeys(activeContracts), [activeContracts]);

  const load = useCallback(() => {
    Promise.all([
      realManagerInvoiceService.listInvoices({ type: 'RENT' }).catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
    ])
      .then(async ([inv, pay]) => {
        setInvoices(inv);
        setPayments(pay);
        const ids = [...new Set(inv.map(i => Number(i.propertyId)).filter(Number.isFinite))];
        const cts = await realTenantService.listActiveByProperties(ids)
          .catch(() => [] as TenantContractResponse[]);
        setActiveContracts(cts);
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { connected: liveOn } = useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: load,
  });

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  // Một ô tìm cho cả nhà, phòng, khách và mã hoá đơn — manager không phải nhớ ô nào
  // lọc phần nào.
  const kw = norm(search.trim());
  const matchInvoice = useCallback((i: ManagerInvoice) =>
    !kw || [i.tenantName, i.roomNumber, i.propertyName, i.code].some(v => norm(v || '').includes(kw)),
    [kw]);
  const matchPayment = useCallback((p: ManagerPayment) =>
    !kw || [p.tenantName, p.roomNumber, p.propertyName, p.invoiceCode].some(v => norm(v || '').includes(kw)),
    [kw]);

  const [pyear, pmonth] = month.split('-').map(Number);
  /** Hoá đơn của ĐÚNG kỳ đang chọn. BE trả mọi tháng nên phải tự lọc. */
  const periodInvoices = useMemo(
    () => invoices.filter(i => i.month === pmonth && i.year === pyear),
    [invoices, pmonth, pyear],
  );
  const shownInvoices = useMemo(
    () => periodInvoices.filter(matchInvoice),
    [periodInvoices, matchInvoice],
  );

  const stats = useMemo(() => {
    const paid    = shownInvoices.filter(i => i.status === 'PAID').length;
    const pending = shownInvoices.filter(i => i.status === 'PENDING').length;
    const overdue = shownInvoices.filter(i => i.status === 'OVERDUE').length;
    const total = shownInvoices.length;
    return { paid, pending, overdue, total, rate: total > 0 ? Math.round((paid / total) * 100) : 0 };
  }, [shownInvoices]);

  const pendingVerifications = useMemo(
    () => payments.filter(p => p.status === 'PENDING_VERIFY' && matchPayment(p)),
    [payments, matchPayment],
  );

  const rentInvoiceCodes = useMemo(
    () => new Set(invoices.map(i => i.code).filter(Boolean)),
    [invoices],
  );
  const verifiedTx = useMemo(
    () => payments
      .filter(p => p.status === 'VERIFIED' && rentInvoiceCodes.has(p.invoiceCode) && matchPayment(p))
      .sort((a, b) => (b.verifiedAt || b.createdAt).localeCompare(a.verifiedAt || a.createdAt))
      .slice(0, 5),
    [payments, rentInvoiceCodes, matchPayment],
  );

  /**
   * Khách quá hạn cần gọi — loại hoá đơn của người ĐÃ chấm dứt hợp đồng: họ rời đi rồi,
   * manager không đòi được, để lại chỉ làm đầy danh sách bằng việc không làm được.
   */
  const needAction = useMemo(
    () => shownInvoices
      .filter(i => i.status === 'OVERDUE' && belongsToActiveTenant(i, rentingKeys))
      .sort((a, b) => lateDays(b.dueDate) - lateDays(a.dueDate)),
    [shownInvoices, rentingKeys],
  );

  /** Gom theo nhà; nhà còn nợ nhiều nhất lên đầu — đó là nhà phải đụng tới trước. */
  const houses = useMemo(() => {
    const scoped = statusFilter === 'all'
      ? shownInvoices
      : shownInvoices.filter(i => i.status === statusFilter);
    const map = new Map<number, { id: number; name: string; items: ManagerInvoice[] }>();
    scoped.forEach(i => {
      if (!map.has(i.propertyId)) map.set(i.propertyId, { id: i.propertyId, name: i.propertyName, items: [] });
      map.get(i.propertyId)!.items.push(i);
    });
    return [...map.values()]
      .map(h => ({
        ...h,
        items: h.items.sort((a, b) => lateDays(b.dueDate) - lateDays(a.dueDate)),
        paid: h.items.filter(x => x.status === 'PAID').length,
        overdue: h.items.filter(x => x.status === 'OVERDUE').length,
      }))
      .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name, 'vi'));
  }, [shownInvoices, statusFilter]);

  /*
    Gõ tìm kiếm thì bung sẵn mọi nhà còn khớp: người dùng gõ tên khách là muốn thấy
    NGAY dòng khách đó, bắt bấm thêm một lần để bung nhà là thừa một thao tác.
    Một nhà duy nhất cũng bung sẵn — không có gì để chọn thì đừng bắt chọn.
  */
  const autoOpen = kw.length > 0 || houses.length === 1;

  const toggleHouse = (id: number) => setOpenHouses(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleVerify = (p: ManagerPayment, approved: boolean) => {
    const doIt = async () => {
      try {
        if (approved) await realManagerInvoiceService.verifyPayment(p.id);
        else await realManagerInvoiceService.rejectPayment(p.id);
        load();
      } catch (e: any) {
        showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không xử lý được giao dịch.');
      }
    };
    showAlert(
      approved ? 'Xác nhận thanh toán?' : 'Từ chối thanh toán?',
      approved
        ? `Xác nhận đã nhận đủ tiền hoá đơn ${p.invoiceCode} từ ${p.tenantName}?`
        : 'Từ chối giao dịch này?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: approved ? 'Xác nhận' : 'Từ chối', style: approved ? 'default' : 'destructive', onPress: doIt },
      ],
    );
  };

  /**
   * Chấm dứt hợp đồng vì không đóng tiền phòng.
   *
   * Chấm dứt xong PHẢI mở luôn thủ tục trả phòng: kiểm kê thiết bị, chốt số điện nước,
   * tất toán cọc. Bỏ bước này là mất tiền thật (cọc không trừ được nợ, điện nước những
   * ngày cuối không thu). Tạo hụt phiếu trả phòng thì vẫn báo phần chấm dứt đã xong và
   * chỉ đường tạo tay — im lặng ở đây là để rơi mất khoản cọc.
   */
  const handleTerminate = (inv: ManagerInvoice) => {
    const od = lateDays(inv.dueDate);
    const contractId = inv.contractId;
    if (contractId == null) {
      showAlert('Thiếu dữ liệu', 'Hoá đơn này không gắn với hợp đồng nào nên không chấm dứt được từ đây.');
      return;
    }
    showAlert(
      'Đề nghị chấm dứt hợp đồng?',
      `${inv.tenantName || 'Khách'}${inv.roomNumber ? ` · phòng ${inv.roomNumber}` : ''} đã quá hạn `
      + `${od} ngày. Sau khi chấm dứt, hệ thống mở luôn yêu cầu trả phòng để kiểm kê và tất toán cọc.`,
      [
        { text: 'Để sau', style: 'cancel' },
        {
          text: 'Chấm dứt',
          style: 'destructive',
          onPress: async () => {
            setTerminating(true);
            try {
              await realTenantService.terminateContract(contractId, {
                type: 'VIOLATION',
                reason: `Không thanh toán tiền phòng ${monthLabelOf(month).toLowerCase()} — quá hạn ${od} ngày, `
                  + 'đã nhắc đủ các mốc theo chính sách.',
              });
              let checkoutId: number | null = null;
              try {
                const req = await checkoutService.createForTenant({
                  contractId,
                  expectedMoveOutDate: todayIso(),
                  reason: `Chấm dứt hợp đồng do không thanh toán tiền phòng ${monthLabelOf(month).toLowerCase()} (quá hạn ${od} ngày).`,
                });
                checkoutId = req?.id ?? null;
              } catch { /* xem chú thích trên */ }
              setSheetRow(null);
              load();
              showAlert(
                'Đã chấm dứt hợp đồng',
                checkoutId
                  ? 'Đã mở yêu cầu trả phòng cho khách này. Sang đó để kiểm kê thiết bị, chốt số điện nước và tất toán tiền cọc.'
                  : 'Hợp đồng đã thanh lý, nhưng CHƯA mở được yêu cầu trả phòng. Bạn vào mục Trả phòng tạo thủ công để còn tất toán cọc.',
                [
                  { text: 'Để sau', style: 'cancel' },
                  { text: checkoutId ? 'Xử lý trả phòng' : 'Mở mục Trả phòng', onPress: () => navigation.navigate('CheckoutRequests') },
                ],
              );
            } catch (e: any) {
              showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không chấm dứt được hợp đồng.');
            } finally {
              setTerminating(false);
            }
          },
        },
      ],
    );
  };

  const atCurrentMonth = month >= toMonthKey();
  const hasAnyThisPeriod = periodInvoices.length > 0;

  /**
   * 12 kỳ gần nhất cho danh sách chọn, kèm số hoá đơn của từng kỳ.
   *
   * Con số đó quan trọng hơn vẻ ngoài: nó cho biết kỳ nào có dữ liệu TRƯỚC KHI bấm.
   * Không có nó thì manager bấm mò vào một tháng rỗng rồi lại phải bấm ra.
   */
  const monthOptions = useMemo(() => {
    const cur = toMonthKey();
    return Array.from({ length: 12 }, (_, i) => {
      const key = shiftMonthKey(cur, -i);
      const [y, m] = key.split('-').map(Number);
      return { key, label: monthLabelOf(key), count: invoices.filter(x => x.month === m && x.year === y).length };
    });
  }, [invoices]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Header: quay lại · tiêu đề · chọn kỳ ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerMid}>
          <Text style={s.h1}>Hoá đơn tiền nhà</Text>
          {/*
            Mũi tên để nhảy kỳ liền kề, BẤM VÀO TÊN THÁNG để mở danh sách chọn.
            Chỉ có mũi tên thì lùi 5 kỳ phải bấm 5 lần, mà vùng chạm của mũi tên cũng
            nhỏ — hai lý do đều đủ để cần một danh sách chọn thẳng.
          */}
          <View style={s.monthRow}>
            <TouchableOpacity onPress={() => setMonth(m => shiftMonthKey(m, -1))} style={s.monthBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.monthArrow}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMonthPickerOpen(true)} style={s.monthPick} activeOpacity={0.7}>
              <Text style={s.monthText}>{monthLabelOf(month)}</Text>
              <Text style={s.monthCaret}>▾</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => !atCurrentMonth && setMonth(m => shiftMonthKey(m, 1))}
              disabled={atCurrentMonth}
              style={s.monthBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.monthArrow, atCurrentMonth && s.monthArrowOff]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
        <RealtimeBadge connected={liveOn} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollBody}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
      >
        {/*
          Ô tìm chỉ hiện khi kỳ này CÓ hoá đơn. Bản cũ để nó trên cùng kể cả lúc chưa
          phát hành gì — một ô tìm kiếm không tìm được gì chỉ chiếm chỗ và gợi ý sai
          rằng dữ liệu đang bị lọc mất.
        */}
        {hasAnyThisPeriod && (
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Tìm nhà, phòng, khách thuê…"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Tiến độ kỳ + chip lọc ── */}
        {stats.total > 0 && (
          <View style={s.card}>
            <View style={s.progressTop}>
              <Text style={s.progressNum}>
                {stats.paid}<Text style={s.progressDen}>/{stats.total}</Text>
              </Text>
              <Text style={s.progressLabel}>hoá đơn đã thu</Text>
              <View style={s.flex1} />
              <Text style={[s.ratePill, stats.rate === 100 && { color: Colors.success }]}>{stats.rate}%</Text>
            </View>
            <SegBar paid={stats.paid} pending={stats.pending} overdue={stats.overdue} />
            <View style={s.chipRow}>
              <Chip label="Tất cả" count={stats.total} tone={Colors.textPrimary}
                active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
              <Chip label="Chưa thu" count={stats.pending} tone={Colors.warning}
                active={statusFilter === 'PENDING'} onPress={() => setStatusFilter(statusFilter === 'PENDING' ? 'all' : 'PENDING')} />
              <Chip label="Quá hạn" count={stats.overdue} tone={Colors.error}
                active={statusFilter === 'OVERDUE'} onPress={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'all' : 'OVERDUE')} />
              <Chip label="Đã thu" count={stats.paid} tone={Colors.success}
                active={statusFilter === 'PAID'} onPress={() => setStatusFilter(statusFilter === 'PAID' ? 'all' : 'PAID')} />
            </View>
            <Text style={s.hiddenNote}>{RENT_AMOUNT_HIDDEN_NOTE}</Text>
          </View>
        )}

        {/* ── Cần xử lý: giao dịch chờ xác nhận (thao tác tay) ── */}
        {pendingVerifications.length > 0 && (
          <View style={[s.card, s.cardWarn]}>
            <Text style={s.sectionTitle}>⚡ Chờ bạn xác nhận ({pendingVerifications.length})</Text>
            {pendingVerifications.slice(0, 5).map(p => {
              const m = methodOf(p.method);
              return (
                <View key={p.id} style={s.verifyRow}>
                  <View style={s.flex1}>
                    <Text style={s.verifyName} numberOfLines={1}>
                      {p.tenantName}{p.roomNumber ? ` · ${p.roomNumber}` : ''}
                    </Text>
                    <Text style={s.verifySub} numberOfLines={1}>
                      {m.icon} {m.label} · {fmtWhen(p.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity style={s.btnReject} onPress={() => handleVerify(p, false)}>
                    <Text style={s.btnRejectText}>Từ chối</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.btnOk} onPress={() => handleVerify(p, true)}>
                    <Text style={s.btnOkText}>Xác nhận</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Cần xử lý: khách quá hạn ── */}
        {needAction.length > 0 && (
          <View style={[s.card, s.cardDanger]}>
            <Text style={s.sectionTitle}>🔴 Cần gọi nhắc ({needAction.length})</Text>
            {needAction.slice(0, 5).map(i => (
              <TouchableOpacity key={i.id} style={s.actionRow} onPress={() => setSheetRow(i)} activeOpacity={0.7}>
                <View style={s.flex1}>
                  <Text style={s.actionName} numberOfLines={1}>
                    {i.tenantName || 'Khách thuê'}{i.roomNumber ? ` · ${i.roomNumber}` : ''}
                  </Text>
                  <Text style={s.actionSub} numberOfLines={1}>{i.propertyName}</Text>
                </View>
                <Text style={s.actionLate}>trễ {lateDays(i.dueDate)} ngày</Text>
                <Text style={s.chev}>›</Text>
              </TouchableOpacity>
            ))}
            {needAction.length > 5 && (
              <Text style={s.moreHint}>… và {needAction.length - 5} khách nữa ở danh sách bên dưới</Text>
            )}
          </View>
        )}

        {/* ── Theo nhà: bấm để bung từng khách ── */}
        {houses.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitleOut}>
              Theo nhà{statusFilter !== 'all' ? ' (đang lọc)' : ''}
            </Text>
            {houses.map(h => {
              const open = autoOpen || openHouses.has(h.id);
              const done = h.paid === h.items.length;
              return (
                <View key={h.id} style={s.house}>
                  <TouchableOpacity style={s.houseHead} onPress={() => toggleHouse(h.id)} activeOpacity={0.7}>
                    <Text style={s.houseCaret}>{open ? '▾' : '▸'}</Text>
                    <View style={s.flex1}>
                      <Text style={s.houseName} numberOfLines={1}>{h.name}</Text>
                      <Text style={s.houseSub}>
                        {done
                          ? 'đã thu đủ'
                          : `${h.paid}/${h.items.length} đã thu${h.overdue > 0 ? ` · ${h.overdue} quá hạn` : ''}`}
                      </Text>
                    </View>
                    {/*
                      Lối vào lịch sử MỌI KỲ của riêng nhà này — khác với ô chọn kỳ ở
                      header (một kỳ, mọi nhà). Đặt ngay trên dòng tên nhà vì đó là chỗ
                      duy nhất đang có sẵn ngữ cảnh "nhà nào".
                      Là TouchableOpacity lồng nhau: bấm vào đây KHÔNG bung/thu accordion.
                    */}
                    <TouchableOpacity
                      onPress={() => navigation.navigate('BillingHistory', { propertyId: h.id })}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={s.houseHistory}>Lịch sử</Text>
                    </TouchableOpacity>
                    <View style={[s.houseDot, {
                      backgroundColor: h.overdue > 0 ? Colors.error : done ? Colors.success : Colors.warning,
                    }]} />
                  </TouchableOpacity>

                  {open && h.items.map(i => {
                    const st = rowState(i);
                    return (
                      <TouchableOpacity key={i.id} style={s.tRow} onPress={() => setSheetRow(i)} activeOpacity={0.7}>
                        <Text style={s.tRoom} numberOfLines={1}>{i.roomNumber || 'Nguyên căn'}</Text>
                        <Text style={s.tName} numberOfLines={1}>{i.tenantName || '—'}</Text>
                        <View style={[s.tPill, { backgroundColor: st.bg }]}>
                          <Text style={[s.tPillText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Giao dịch gần đây (chỉ khi có) ── */}
        {verifiedTx.length > 0 && (
          <View style={s.section}>
            <View style={s.txHead}>
              <Text style={s.sectionTitleOut}>Giao dịch gần đây</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ManagerPaymentHistory')}>
                <Text style={s.link}>Xem tất cả ›</Text>
              </TouchableOpacity>
            </View>
            <View style={s.card}>
              {verifiedTx.map(p => {
                const m = methodOf(p.method);
                return (
                  <View key={p.id} style={s.txRow}>
                    <Text style={s.txIcon}>{m.icon}</Text>
                    <View style={s.flex1}>
                      <Text style={s.txName} numberOfLines={1}>
                        {p.tenantName}{p.roomNumber ? ` · ${p.roomNumber}` : ''}
                      </Text>
                      <Text style={s.txSub} numberOfLines={1}>{m.label} · {fmtWhen(p.verifiedAt || p.createdAt)}</Text>
                    </View>
                    <Text style={s.txOk}>✓</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/*
          ── Trạng thái rỗng: ĐÚNG MỘT khối ──
          Bản cũ hiện ba khối rỗng chồng nhau ("chưa có hoá đơn", "chưa có giao dịch",
          "chưa có hoá đơn tiền nhà nào") — cùng một tin nhắc lại ba lần.
          Câu chữ đổi theo lý do thật: chưa tới ngày phát hành, hay lọc/tìm không ra.
        */}
        {houses.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🧾</Text>
            {!hasAnyThisPeriod ? (
              <>
                <Text style={s.emptyTitle}>Kỳ này chưa có hoá đơn</Text>
                <Text style={s.emptyText}>
                  Hệ thống tự phát hành vào ngày {RENT_CYCLE.issueDay} hằng tháng,
                  hạn nộp ngày {RENT_CYCLE.dueDay}.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.emptyTitle}>Không có hoá đơn nào khớp</Text>
                <Text style={s.emptyText}>
                  {kw ? `Không tìm thấy “${search.trim()}”. ` : ''}
                  Thử bỏ bớt bộ lọc hoặc từ khoá.
                </Text>
                <TouchableOpacity
                  style={s.emptyBtn}
                  onPress={() => { setSearch(''); setStatusFilter('all'); }}
                >
                  <Text style={s.emptyBtnText}>Xoá bộ lọc</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Chọn kỳ thu ── */}
      <Modal visible={monthPickerOpen} transparent animationType="slide" onRequestClose={() => setMonthPickerOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setMonthPickerOpen(false)} />
        <View style={s.sheet}>
          <View style={s.sheetGrip} />
          <Text style={s.sheetName}>Chọn kỳ thu</Text>
          <Text style={s.sheetSub}>Hệ thống phát hành hoá đơn ngày {RENT_CYCLE.issueDay} hằng tháng</Text>
          <ScrollView style={s.monthList} showsVerticalScrollIndicator={false}>
            {monthOptions.map(o => {
              const active = o.key === month;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[s.monthItem, active && s.monthItemOn]}
                  onPress={() => { setMonth(o.key); setMonthPickerOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.monthItemText, active && s.monthItemTextOn]}>{o.label}</Text>
                  <View style={s.flex1} />
                  <Text style={[s.monthItemCount, o.count === 0 && s.monthItemEmpty]}>
                    {o.count === 0 ? 'chưa có' : `${o.count} hoá đơn`}
                  </Text>
                  {active && <Text style={s.monthItemTick}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={s.sheetClose} onPress={() => setMonthPickerOpen(false)}>
            <Text style={s.sheetCloseText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Sheet chi tiết một khách ── */}
      <Modal visible={sheetRow != null} transparent animationType="slide" onRequestClose={() => setSheetRow(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setSheetRow(null)} />
        <View style={s.sheet}>
          <View style={s.sheetGrip} />
          {sheetRow && (() => {
            const st = rowState(sheetRow);
            const od = lateDays(sheetRow.dueDate);
            const canTerm = sheetRow.status !== 'PAID'
              && canTerminateForUnpaidRent(sheetRow.dueDate, sheetRow.status);
            return (
              <>
                <Text style={s.sheetName}>{sheetRow.tenantName || 'Khách thuê'}</Text>
                <Text style={s.sheetSub}>
                  {sheetRow.propertyName}{sheetRow.roomNumber ? ` · ${sheetRow.roomNumber}` : ' · Nguyên căn'}
                </Text>

                <View style={[s.sheetState, { backgroundColor: st.bg }]}>
                  <Text style={[s.sheetStateText, { color: st.color }]}>{st.icon}  {st.label}</Text>
                </View>

                <View style={s.sheetInfo}>
                  <View style={s.sheetLine}>
                    <Text style={s.sheetKey}>Mã hoá đơn</Text>
                    <Text style={s.sheetVal}>{sheetRow.code || '—'}</Text>
                  </View>
                  <View style={s.sheetLine}>
                    <Text style={s.sheetKey}>Hạn nộp</Text>
                    <Text style={s.sheetVal}>{fmtDay(sheetRow.dueDate)}</Text>
                  </View>
                  <View style={s.sheetLine}>
                    <Text style={s.sheetKey}>Kỳ thu</Text>
                    <Text style={s.sheetVal}>{monthLabelOf(month)}</Text>
                  </View>
                </View>

                {/* Số tiền cố ý KHÔNG hiện — xem chú thích đầu file. */}
                <Text style={s.sheetNote}>{RENT_AMOUNT_HIDDEN_NOTE}</Text>

                {canTerm ? (
                  <TouchableOpacity
                    style={[s.sheetDanger, terminating && s.btnDisabled]}
                    disabled={terminating}
                    onPress={() => handleTerminate(sheetRow)}
                  >
                    <Text style={s.sheetDangerText}>
                      {terminating ? 'Đang xử lý…' : '⚠️  Đề nghị chấm dứt hợp đồng'}
                    </Text>
                  </TouchableOpacity>
                ) : sheetRow.status !== 'PAID' && (
                  /*
                    Nói rõ CÒN BAO LÂU nữa mới được chấm dứt, thay vì ẩn nút không lời
                    giải thích — manager hay hỏi "sao nhà kia bấm được mà đây không".
                  */
                  <Text style={s.sheetHint}>
                    {od <= 0
                      ? 'Chưa tới hạn nộp — chưa đề nghị chấm dứt hợp đồng được.'
                      : `Quá hạn ${od} ngày. Quá hạn đủ ${RENT_TERMINATION_AFTER_DAYS} ngày mới đề nghị chấm dứt được.`}
                  </Text>
                )}

                <TouchableOpacity style={s.sheetClose} onPress={() => setSheetRow(null)}>
                  <Text style={s.sheetCloseText}>Đóng</Text>
                </TouchableOpacity>
              </>
            );
          })()}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  scroll: { flex: 1 },
  scrollBody: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 22, lineHeight: 24, color: Colors.primary, fontWeight: '800' },
  headerMid: { flex: 1 },
  h1: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  monthBtn: { paddingHorizontal: 4 },
  monthArrow: { fontSize: 18, lineHeight: 20, color: Colors.primary, fontWeight: '800' },
  monthArrowOff: { color: Colors.textMuted },
  monthPick: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: Colors.primaryBg,
  },
  monthText: { fontSize: 13, fontWeight: '800', color: Colors.primary, textAlign: 'center' },
  monthCaret: { fontSize: 10, color: Colors.primary },

  // ── Danh sách chọn kỳ ──
  monthList: { marginTop: Spacing.md, maxHeight: 340 },
  monthItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 13, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, marginBottom: 4, backgroundColor: Colors.background,
  },
  monthItemOn: { backgroundColor: Colors.primaryBg },
  monthItemText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  monthItemTextOn: { color: Colors.primary, fontWeight: '900' },
  monthItemCount: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  monthItemEmpty: { color: Colors.textMuted, fontStyle: 'italic', fontWeight: '500' },
  monthItemTick: { fontSize: 15, fontWeight: '900', color: Colors.primary },

  // ── Tìm kiếm ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, height: 44, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  searchClear: { fontSize: 14, color: Colors.textMuted, paddingHorizontal: 4 },

  // ── Thẻ ──
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm,
  },
  cardWarn: { borderLeftWidth: 3, borderLeftColor: Colors.warning },
  cardDanger: { borderLeftWidth: 3, borderLeftColor: Colors.error },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionTitleOut: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },

  // ── Tiến độ ──
  progressTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: Spacing.sm },
  progressNum: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary },
  progressDen: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  progressLabel: { fontSize: 13, color: Colors.textSecondary },
  ratePill: { fontSize: 15, fontWeight: '900', color: Colors.textSecondary },
  segBg: { height: 7, borderRadius: 4, backgroundColor: Colors.divider, flexDirection: 'row', overflow: 'hidden' },
  segPart: { height: '100%' },

  // ── Chip ──
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipCount: { minWidth: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: Colors.divider, alignItems: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '900', color: Colors.textSecondary },
  hiddenNote: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 15 },

  // ── Chờ xác nhận ──
  verifyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  verifyName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  verifySub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  btnReject: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.background },
  btnRejectText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  btnOk: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.success },
  btnOkText: { fontSize: 12, fontWeight: '800', color: Colors.white },

  // ── Cần gọi nhắc ──
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  actionName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  actionSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  actionLate: { fontSize: 12, fontWeight: '800', color: Colors.error },
  chev: { fontSize: 18, color: Colors.textMuted },
  moreHint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.sm, fontStyle: 'italic' },

  // ── Theo nhà ──
  house: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  houseHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md },
  houseCaret: { fontSize: 13, color: Colors.textMuted, width: 12 },
  houseName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  houseSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  houseHistory: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  houseDot: { width: 9, height: 9, borderRadius: 5 },
  tRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.background,
  },
  tRoom: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, width: 76 },
  tName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  tPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tPillText: { fontSize: 11, fontWeight: '800' },

  // ── Giao dịch ──
  txHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  txIcon: { fontSize: 16 },
  txName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  txSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  txOk: { fontSize: 14, color: Colors.success, fontWeight: '900' },

  // ── Rỗng ──
  empty: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, alignItems: 'center', ...Shadow.sm,
  },
  emptyIcon: { fontSize: 34, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: 9,
    borderRadius: BorderRadius.md, backgroundColor: Colors.primaryBg,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // ── Sheet ──
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: Spacing.xl * 1.5,
  },
  sheetGrip: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  sheetName: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  sheetSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  sheetState: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: Spacing.md },
  sheetStateText: { fontSize: 13, fontWeight: '800' },
  sheetInfo: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider },
  sheetLine: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetKey: { fontSize: 13, color: Colors.textSecondary },
  sheetVal: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  sheetNote: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.md, lineHeight: 15 },
  sheetHint: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.md, lineHeight: 17 },
  sheetDanger: {
    marginTop: Spacing.md, paddingVertical: 13, borderRadius: BorderRadius.md,
    backgroundColor: Colors.errorLight, alignItems: 'center',
  },
  sheetDangerText: { fontSize: 14, fontWeight: '800', color: Colors.error },
  btnDisabled: { opacity: 0.5 },
  sheetClose: {
    marginTop: Spacing.sm, paddingVertical: 13, borderRadius: BorderRadius.md,
    backgroundColor: Colors.background, alignItems: 'center',
  },
  sheetCloseText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
});
