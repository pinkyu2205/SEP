import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { RealtimeBadge } from '@/components/common';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput,
} from 'react-native';
import { showAlert, activeRentingKeys, belongsToActiveTenant } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_AMOUNT_HIDDEN_NOTE,
} from '@/constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '@/services/manager/invoiceService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { serverNow } from '@/utils/serverTime';

/**
 * HOÁ ĐƠN TIỀN NHÀ — màn theo dõi kỳ thu HIỆN TẠI.
 *
 * Phạm vi màn này CHỈ là tiền nhà/phòng: hoá đơn hệ thống tự phát hành hằng kỳ và
 * việc thu chúng. Tiền cọc, phí bảo trì, điện nước… đều đã tách sang màn
 * "Thu & Đối soát" (ManagerPaymentHistory, vào từ Thao tác nhanh ở Trang chủ) —
 * trước đây trộn chung nên không quản lý được việc nào ra việc nào.
 *
 * ⚠️ Màn này KHÔNG hiện số tiền (chốt 07/08/2026 — xem @/constants/managerVisibility).
 * Manager chỉ cần biết khách đã thanh toán hoá đơn tiền phòng của kỳ hay chưa, nên
 * mọi thống kê ở đây đếm theo SỐ HOÁ ĐƠN chứ không cộng tiền.
 *
 * Thứ tự trên màn đi theo việc manager cần làm, không theo thứ tự dữ liệu:
 *   1. Kỳ này thu tới đâu (bao nhiêu hoá đơn đã thanh toán / tổng).
 *   2. Việc cần xử lý: giao dịch chờ xác nhận, hoá đơn quá hạn.
 *   3. Từng nhà: nhà nào chưa thu xong, bấm vào xem chi tiết.
 *   4. Giao dịch gần đây.
 * Lịch sử mọi kỳ đã qua nằm ở màn riêng (BillingHistory) — vào từ mục "Theo nhà".
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

const TX_PREVIEW = 5;
/**
 * Số dòng hiện sẵn mỗi danh sách. Manager có thể phụ trách 50–100 nhà, mỗi kỳ vài
 * trăm hoá đơn — đổ hết ra một trang thì vừa không cuộn nổi vừa dựng chậm. Cắt ngắn
 * mặc định, ai cần xem đủ thì bấm "Xem thêm".
 */
const LIST_PREVIEW = 5;

/** Nút bung/thu gọn cuối mỗi danh sách bị cắt. */
const MoreRow = ({ hidden, expanded, onPress, unit }: {
  hidden: number; expanded: boolean; onPress: () => void; unit: string;
}) => (
  <TouchableOpacity style={s.moreRow} onPress={onPress} activeOpacity={0.7}>
    <Text style={s.moreRowText}>
      {expanded ? '⌃  Thu gọn' : `⌄  Xem thêm ${hidden} ${unit}`}
    </Text>
  </TouchableOpacity>
);

type StatusKey = 'all' | 'PAID' | 'PENDING' | 'OVERDUE';

/**
 * Thanh tiến độ 3 đoạn: đã thu · chưa thu · quá hạn.
 *
 * Thay cho thanh 1 màu cũ (chỉ vẽ tỉ lệ đã thu) — nhìn một cái là biết phần còn
 * lại đang kẹt ở "chưa tới hạn" hay đã "quá hạn", không phải đọc con số bên dưới.
 */
const SegBar = ({ paid, pending, overdue }: { paid: number; pending: number; overdue: number }) => {
  const total = paid + pending + overdue;
  if (total === 0) return <View style={s.segBg} />;
  const pct = (n: number) => `${(n / total) * 100}%` as any;
  return (
    <View style={s.segBg}>
      {paid > 0 && <View style={[s.segPart, { width: pct(paid), backgroundColor: Colors.success }]} />}
      {pending > 0 && <View style={[s.segPart, { width: pct(pending), backgroundColor: Colors.warning }]} />}
      {overdue > 0 && <View style={[s.segPart, { width: pct(overdue), backgroundColor: Colors.error }]} />}
    </View>
  );
};

export const BillingManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVerifications, setShowVerifications] = useState(true);
  const [search, setSearch] = useState('');
  /** Bấm vào ô số ở thẻ tổng quan để thu hẹp danh sách "Theo nhà" bên dưới. */
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  const [expandOverdue, setExpandOverdue] = useState(false);
  const [expandPending, setExpandPending] = useState(false);
  const [expandBuildings, setExpandBuildings] = useState(false);

  const [activeContracts, setActiveContracts] = useState<TenantContractResponse[]>([]);
  /** Phòng còn khách thuê — dùng lọc việc "Cần xử lý". */
  const rentingKeys = useMemo(() => activeRentingKeys(activeContracts), [activeContracts]);

  const load = useCallback(() => {
    Promise.all([
      // Màn này CHỈ về tiền nhà (RENT). Điện/nước có thống kê riêng ở màn Ghi chỉ số
      // & Hóa đơn; tiền cọc và mọi khoản thu khác nằm ở màn Thu & Đối soát.
      realManagerInvoiceService.listInvoices({ type: 'RENT' }).catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
    ])
      .then(async ([inv, pay]) => {
        setInvoices(inv);
        setPayments(pay);
        // Cần HĐ đang hiệu lực để loại hoá đơn của khách ĐÃ chấm dứt khỏi "Cần xử lý".
        // Lấy propertyId từ chính hoá đơn — chúng đã được BE giới hạn theo quyền manager,
        // nên không cần gọi thêm API danh sách nhà. Xem listActiveByProperties.
        const ids = [...new Set(inv.map(i => Number(i.propertyId)).filter(Number.isFinite))];
        const cts = await realTenantService.listActiveByProperties(ids)
          .catch(() => [] as TenantContractResponse[]);
        setActiveContracts(cts);
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Danh sách hoá đơn của quản lý — khách trả xong là đổi trạng thái ngay, không phải
  // thoát ra vào lại màn. `onRefresh` để hook dùng được cả lớp poll dự phòng khi WS chết.
  const { connected: liveOn } = useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: load,
  });

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  // Tìm theo khách / phòng / nhà / mã hoá đơn — áp cho cả hoá đơn lẫn giao dịch để
  // gõ 1 lần là cả màn cùng thu hẹp, không phải nhớ ô nào lọc phần nào.
  const kw = norm(search.trim());
  const matchInvoice = useCallback((i: ManagerInvoice) =>
    !kw || [i.tenantName, i.roomNumber, i.propertyName, i.code].some(v => norm(v || '').includes(kw)),
    [kw]);
  const matchPayment = useCallback((p: ManagerPayment) =>
    !kw || [p.tenantName, p.roomNumber, p.propertyName, p.invoiceCode].some(v => norm(v || '').includes(kw)),
    [kw]);

  /**
   * CHỈ hoá đơn của KỲ ĐANG HIỂN THỊ.
   *
   * `listInvoices({ type: 'RENT' })` không nhận tham số kỳ nên BE trả về hoá đơn của
   * MỌI tháng. Trước đây màn này đếm hết → tiêu đề ghi "Kỳ thu Tháng 08/2026" nhưng
   * con số lại gộp cả các kỳ trước, và không khớp với màn "Tiền phòng tự động"
   * (màn đó luôn tính theo đúng một kỳ).
   */
  const period = useMemo(() => {
    const d = serverNow();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, []);
  const shownInvoices = useMemo(
    () => invoices.filter(i => i.month === period.month && i.year === period.year && matchInvoice(i)),
    [invoices, period, matchInvoice],
  );

  /**
   * Đếm theo SỐ HOÁ ĐƠN, không cộng tiền — manager không được thấy số tiền thuê
   * (xem @/constants/managerVisibility). Tỉ lệ hoàn thành cũng tính theo số hoá đơn.
   */
  const stats = useMemo(() => {
    const paid    = shownInvoices.filter(i => i.status === 'PAID');
    const pending = shownInvoices.filter(i => i.status === 'PENDING');
    const overdue = shownInvoices.filter(i => i.status === 'OVERDUE');
    const total = shownInvoices.length;
    return {
      paidCount: paid.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
      total,
      rate: total > 0 ? Math.round((paid.length / total) * 100) : 0,
    };
  }, [shownInvoices]);

  const pendingVerifications = useMemo(
    () => payments.filter(p => p.status === 'PENDING_VERIFY' && matchPayment(p)),
    [payments, matchPayment],
  );
  /**
   * Giao dịch của hoá đơn TIỀN NHÀ.
   *
   * ManagerPaymentResponse của BE không có field loại hoá đơn, chỉ có `invoiceCode`.
   * Thay vì đoán loại từ hình dạng mã (HD-RENT-…, INV0001-202607-R, …) — dễ sai khi
   * BE đổi quy tắc sinh mã — đối chiếu thẳng với tập mã của hoá đơn RENT đã tải ở
   * trên. Chính xác tuyệt đối, và tự đúng khi BE thêm loại hoá đơn mới.
   */
  const rentInvoiceCodes = useMemo(
    () => new Set(invoices.map(i => i.code).filter(Boolean)),
    [invoices],
  );
  const isRentPayment = useCallback(
    (p: ManagerPayment) => rentInvoiceCodes.has(p.invoiceCode),
    [rentInvoiceCodes],
  );

  const verifiedTx = useMemo(
    () => payments.filter(p => p.status === 'VERIFIED' && isRentPayment(p) && matchPayment(p))
      .sort((a, b) => (b.verifiedAt || b.createdAt).localeCompare(a.verifiedAt || a.createdAt)),
    [payments, isRentPayment, matchPayment],
  );

  const buildingGroups = useMemo(() => {
    const map = new Map<number, { propertyId: number; propertyName: string; invoices: ManagerInvoice[] }>();
    // Lọc theo trạng thái đang chọn ở thẻ tổng quan; nhà nào không còn hoá đơn nào
    // khớp thì tự biến mất khỏi danh sách.
    const scoped = statusFilter === 'all'
      ? shownInvoices
      : shownInvoices.filter(i => i.status === statusFilter);
    scoped.forEach(i => {
      if (!map.has(i.propertyId)) map.set(i.propertyId, { propertyId: i.propertyId, propertyName: i.propertyName, invoices: [] });
      map.get(i.propertyId)!.invoices.push(i);
    });
    // Nhà nào còn nợ nhiều nhất lên đầu — đó là nhà cần đụng tới trước.
    return Array.from(map.values()).sort((a, b) =>
      b.invoices.filter(x => x.status === 'OVERDUE').length - a.invoices.filter(x => x.status === 'OVERDUE').length);
  }, [shownInvoices, statusFilter]);

  const handleVerify = (p: ManagerPayment, approved: boolean) => {
    const doIt = async () => {
      try {
        if (approved) await realManagerInvoiceService.verifyPayment(p.id);
        else await realManagerInvoiceService.rejectPayment(p.id);
        load();
      } catch (e: any) {
        showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không xử lý được giao dịch (BE chưa có endpoint?).');
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

  const now = serverNow();
  const monthLabel = `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const inCollectWindow = now.getDate() >= RENT_CYCLE.issueDay && now.getDate() <= RENT_CYCLE.dueDay;
  const rateColor = stats.rate >= 80 ? Colors.success : stats.rate >= 50 ? Colors.warning : Colors.error;
  /**
   * Số ngày trễ so với hạn nộp; âm = còn hạn.
   *
   * Trước 13/08/2026 chỗ này có nhánh "kỳ đầu": nhận diện bằng hoá đơn phát hành cùng
   * ngày với hạn nộp rồi cộng thêm 3 ngày ân hạn. Bỏ hẳn — tiền kỳ đầu nay thu chung
   * với tiền cọc ở mã QR lúc đón khách nên không còn hoá đơn kỳ đầu nào chờ thu, mà
   * cách nhận diện đó lại quét trúng cả hoá đơn khác có ngày phát hành trùng hạn nộp.
   */
  const daysLate = useCallback((inv: ManagerInvoice) => {
    if (!inv.dueDate) return 0;
    const d = new Date(`${inv.dueDate.slice(0, 10)}T00:00:00`);
    if (isNaN(d.getTime())) return 0;
    const today = serverNow(); today.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - d.getTime()) / 86_400_000);
  }, []);

  /**
   * Việc cần xử lý, xếp theo mức gấp: quá hạn lâu nhất → quá hạn ít → chưa thu.
   * Hiện thẳng tên khách + phòng + số ngày trễ để manager biết gọi ai trước,
   * thay vì chỉ đưa một con số rồi bắt tự đi tìm.
   */
  /**
   * Khách ĐÃ chấm dứt hợp đồng thì hoá đơn còn nợ của họ KHÔNG nằm trong "Cần xử lý":
   * họ đã rời đi, manager không đòi được nữa, để lại chỉ làm đầy danh sách bằng việc
   * không làm được. Phần nợ đó thuộc luồng tất toán ở mục Trả phòng.
   * BE vẫn giữ hoá đơn ở trạng thái OVERDUE nên phải tự lọc — xem @/utils.
   */
  const actionable = useMemo(
    () => shownInvoices.filter(i => belongsToActiveTenant(i, rentingKeys)),
    [shownInvoices, rentingKeys],
  );
  /**
   * QUÁ HẠN LẤY THEO MỌI KỲ, không riêng kỳ đang xem.
   *
   * Nợ không hết hạn khi sang tháng mới: hoá đơn tháng 8 chưa trả thì tháng 10 vẫn là
   * việc phải đòi. Trước 18/08/2026 danh sách này dựng từ `actionable` (đã lọc theo kỳ
   * hiện tại) nên Trang chủ báo "8 hoá đơn quá hạn" mà bấm vào đây lại hiện "Không còn
   * việc tồn" — hai màn cùng một dữ liệu mà nói ngược nhau.
   *
   * Thẻ "Kỳ này đã thu tới đâu" phía trên VẪN theo đúng một kỳ — đó là tiến độ thu của
   * kỳ, khác việc tồn đọng.
   */
  const overdueList = useMemo(
    () => invoices
      .filter(i => i.status === 'OVERDUE' && matchInvoice(i) && belongsToActiveTenant(i, rentingKeys))
      .sort((a, b) => daysLate(b) - daysLate(a)),
    [invoices, matchInvoice, rentingKeys, daysLate],
  );
  const pendingList = useMemo(
    () => actionable.filter(i => i.status === 'PENDING')
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    [actionable],
  );
  const hasTodo = pendingVerifications.length > 0 || overdueList.length > 0 || pendingList.length > 0;
  // Chỉ xem nhanh vài giao dịch mới nhất — đủ thì sang màn Lịch sử thanh toán.
  const shownTx = verifiedTx.slice(0, TX_PREVIEW);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Hóa đơn tiền nhà</Text>
            <Text style={s.subtitle}>Kỳ thu {monthLabel}</Text>
          </View>
          {/* Nói rõ màn đang cập nhật bằng lớp nào — xem RealtimeBadge. */}
          <RealtimeBadge connected={liveOn} />
        </View>

        {loading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* ── Tìm kiếm: lọc cùng lúc hoá đơn + giao dịch bên dưới ── */}
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

            {/* ── (1) Kỳ này thu tới đâu — đếm theo SỐ HOÁ ĐƠN, không hiện tiền ── */}
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <Text style={s.heroLabel}>{search ? 'Kết quả tìm kiếm' : 'Kỳ này đã thu tới đâu'}</Text>
                <TouchableOpacity style={s.autoChip} onPress={() => navigation.navigate('RentInvoice')}>
                  <Text style={s.autoChipText}>
                    {inCollectWindow ? `● Đang thu (ngày ${RENT_CYCLE.issueDay}–${RENT_CYCLE.dueDay})` : '🤖 Tự động'} ›
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={s.heroFigure}>
                <Text style={s.heroAmount}>{stats.paidCount}</Text>
                <Text style={s.heroSlash}>/{stats.total}</Text>
                <View style={s.heroFigureText}>
                  <Text style={s.heroUnit}>hoá đơn đã thu</Text>
                  <Text style={[s.heroRate, { color: rateColor }]}>{stats.rate}% hoàn thành</Text>
                </View>
              </View>

              <SegBar paid={stats.paidCount} pending={stats.pendingCount} overdue={stats.overdueCount} />

              {/* Ô số bấm được = bộ lọc nhanh cho danh sách "Theo nhà" bên dưới. */}
              <View style={s.heroStats}>
                {([
                  { key: 'PAID' as const, num: stats.paidCount, label: 'Đã thu', color: Colors.success },
                  { key: 'PENDING' as const, num: stats.pendingCount, label: 'Chưa thu', color: Colors.warning },
                  { key: 'OVERDUE' as const, num: stats.overdueCount, label: 'Quá hạn', color: Colors.error },
                ]).map(st => {
                  const on = statusFilter === st.key;
                  return (
                    <TouchableOpacity
                      key={st.key}
                      style={[s.heroStat, on && { backgroundColor: st.color + '14', borderColor: st.color + '55' }]}
                      onPress={() => setStatusFilter(on ? 'all' : st.key)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.heroDot, { backgroundColor: st.num > 0 ? st.color : Colors.textMuted }]} />
                      <Text style={[s.heroStatNum, { color: st.num > 0 ? st.color : Colors.textMuted }]}>{st.num}</Text>
                      <Text style={s.heroStatLbl}>{st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.heroTotal}>
                {stats.total > 0 ? RENT_AMOUNT_HIDDEN_NOTE : 'Chưa có hoá đơn nào trong kỳ'}
              </Text>
            </View>


            {/* ── (2) Việc cần xử lý ── */}
            {hasTodo ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Cần xử lý</Text>

                {/* ① Quá hạn — gấp nhất, trễ lâu nhất lên đầu. */}
                {overdueList.length > 0 && (
                  <View style={[s.todoGroup, { borderLeftColor: Colors.error }]}>
                    <View style={s.todoGroupHead}>
                      <Text style={[s.todoGroupTitle, { color: Colors.error }]}>
                        ⚠️  {overdueList.length} hoá đơn quá hạn
                      </Text>
                      <Text style={s.todoGroupHint}>
                        Trễ {RENT_CYCLE.terminationFromDay - RENT_CYCLE.dueDay}+ ngày được quyền chấm dứt HĐ
                      </Text>
                    </View>
                    {(expandOverdue ? overdueList : overdueList.slice(0, LIST_PREVIEW)).map((inv, i) => {
                      const late = daysLate(inv);
                      // Hạn ngày 5, ngày 8 mới được chấm dứt — tức trễ 3 ngày.
                      const canTerminate = late >= RENT_CYCLE.terminationFromDay - RENT_CYCLE.dueDay;
                      return (
                        <TouchableOpacity
                          key={inv.id}
                          style={[s.todoItem, i > 0 && s.todoItemBorder]}
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('BuildingBilling', {
                            propertyId: String(inv.propertyId), propertyName: inv.propertyName,
                          })}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.todoItemName}>
                              {inv.tenantName || 'Khách thuê'}{inv.roomNumber ? ` · ${inv.roomNumber}` : ''}
                            </Text>
                            {/* Danh sách này gồm cả kỳ cũ nên PHẢI ghi rõ kỳ nào —
                                không thì "trễ 47 ngày" đọc ra như nợ của kỳ đang xem. */}
                            <Text style={s.todoItemMeta} numberOfLines={1}>
                              {inv.propertyName}
                              {(inv.month !== period.month || inv.year !== period.year)
                                && `  ·  kỳ ${String(inv.month).padStart(2, '0')}/${inv.year}`}
                            </Text>
                          </View>
                          <View style={s.todoItemRight}>
                            <Text style={[s.todoLate, { color: Colors.error }]}>trễ {late} ngày</Text>
                            {canTerminate && <Text style={s.todoFlag}>được chấm dứt HĐ</Text>}
                          </View>
                          <Text style={s.todoArrow}>›</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {overdueList.length > LIST_PREVIEW && (
                      <MoreRow hidden={overdueList.length - LIST_PREVIEW} expanded={expandOverdue}
                        onPress={() => setExpandOverdue(v => !v)} unit="khách" />
                    )}
                  </View>
                )}

                {/* ② Chưa thanh toán — chưa tới hạn, chỉ cần nhắc. */}
                {pendingList.length > 0 && (
                  <View style={[s.todoGroup, { borderLeftColor: Colors.warning }]}>
                    <View style={s.todoGroupHead}>
                      <Text style={[s.todoGroupTitle, { color: Colors.warning }]}>
                        ⏳  {pendingList.length} hoá đơn chưa thanh toán
                      </Text>
                      <Text style={s.todoGroupHint}>Hệ thống tự nhắc khách mỗi ngày tới hạn nộp</Text>
                    </View>
                    {(expandPending ? pendingList : pendingList.slice(0, LIST_PREVIEW)).map((inv, i) => {
                      const late = daysLate(inv);
                      return (
                        <TouchableOpacity
                          key={inv.id}
                          style={[s.todoItem, i > 0 && s.todoItemBorder]}
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('BuildingBilling', {
                            propertyId: String(inv.propertyId), propertyName: inv.propertyName,
                          })}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.todoItemName}>
                              {inv.tenantName || 'Khách thuê'}{inv.roomNumber ? ` · ${inv.roomNumber}` : ''}
                            </Text>
                            <Text style={s.todoItemMeta} numberOfLines={1}>{inv.propertyName}</Text>
                          </View>
                          <Text style={[s.todoLate, { color: Colors.warning }]}>
                            {late >= 0 ? 'tới hạn hôm nay' : `còn ${-late} ngày`}
                          </Text>
                          <Text style={s.todoArrow}>›</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {pendingList.length > LIST_PREVIEW && (
                      <MoreRow hidden={pendingList.length - LIST_PREVIEW} expanded={expandPending}
                        onPress={() => setExpandPending(v => !v)} unit="khách" />
                    )}
                  </View>
                )}

                {/* ③ Giao dịch chờ xác nhận — việc phải thao tác tay. */}
                {pendingVerifications.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={s.todoRow}
                      onPress={() => setShowVerifications(v => !v)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.todoIcon, { backgroundColor: Colors.primaryBg }]}>
                        <Text style={{ fontSize: 16 }}>💳</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.todoTitle}>{pendingVerifications.length} giao dịch chờ xác nhận</Text>
                        <Text style={s.todoSub}>Khách báo đã chuyển — kiểm tra rồi xác nhận đã nhận tiền</Text>
                      </View>
                      <Text style={s.todoArrow}>{showVerifications ? '⌄' : '›'}</Text>
                    </TouchableOpacity>

                    {showVerifications && pendingVerifications.map(item => {
                      const mc = methodOf(item.method);
                      return (
                        <View key={item.id} style={s.verifyCard}>
                          <View style={s.verifyTop}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.verifyName}>
                                {item.tenantName}{item.roomNumber ? ` · ${item.roomNumber}` : ''}
                              </Text>
                              <Text style={s.verifyMeta}>
                                {item.propertyName} · {item.invoiceCode}
                              </Text>
                              <Text style={s.verifyMeta}>
                                {mc.icon} {mc.label} · {fmtWhen(item.createdAt)}
                              </Text>
                            </View>
                          </View>
                          {!!item.transferContent && (
                            <Text style={s.verifyContent} numberOfLines={1}>📝 {item.transferContent}</Text>
                          )}
                          <View style={s.verifyActions}>
                            <TouchableOpacity style={s.rejectBtn} onPress={() => handleVerify(item, false)}>
                              <Text style={s.rejectBtnText}>Từ chối</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.approveBtn} onPress={() => handleVerify(item, true)}>
                              <Text style={s.approveBtnText}>✓ Đã nhận tiền</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            ) : shownInvoices.length > 0 && (
              <View style={s.clearCard}>
                <Text style={s.clearText}>✅  Không còn việc tồn — kỳ này đang chạy ổn</Text>
              </View>
            )}

            {/* ── (3) Theo nhà ── */}
            {buildingGroups.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>
                    Theo nhà
                    {statusFilter !== 'all' && (
                      <Text style={s.sectionNote}>
                        {'  '}· {statusFilter === 'PAID' ? 'đã thu' : statusFilter === 'PENDING' ? 'chưa thu' : 'quá hạn'}
                      </Text>
                    )}
                  </Text>
                  {/* Đang lọc thì nút bỏ lọc nằm ngay trên danh sách nó tác động,
                      không cần thêm một dải báo riêng ở trên nữa. */}
                  <TouchableOpacity onPress={() =>
                    statusFilter === 'all' ? navigation.navigate('BillingHistory') : setStatusFilter('all')}>
                    <Text style={s.sectionLink}>
                      {statusFilter === 'all' ? '🗂 Lịch sử các kỳ →' : 'Bỏ lọc ✕'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {(expandBuildings ? buildingGroups : buildingGroups.slice(0, LIST_PREVIEW)).map(group => {
                  const paid    = group.invoices.filter(b => b.status === 'PAID');
                  const pending = group.invoices.filter(b => b.status === 'PENDING');
                  const overdue = group.invoices.filter(b => b.status === 'OVERDUE');
                  const unpaidCount = pending.length + overdue.length;
                  const rate = group.invoices.length > 0
                    ? Math.round((paid.length / group.invoices.length) * 100) : 0;
                  const barColor = rate >= 80 ? Colors.success : rate >= 50 ? Colors.warning : Colors.error;

                  return (
                    <TouchableOpacity
                      key={group.propertyId}
                      style={s.buildingCard}
                      onPress={() => navigation.navigate('BuildingBilling', {
                        propertyId: String(group.propertyId), propertyName: group.propertyName,
                      })}
                      activeOpacity={0.75}
                    >
                      <View style={s.buildingTop}>
                        <View style={[s.buildingAvatar, { backgroundColor: barColor + '18' }]}>
                          <Text style={[s.buildingAvatarText, { color: barColor }]}>{rate}%</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.buildingName} numberOfLines={1}>{group.propertyName}</Text>
                          <Text style={s.buildingMoney}>
                            {unpaidCount > 0
                              ? <>Còn <Text style={{ color: Colors.error, fontWeight: '800' }}>{unpaidCount} khách</Text> chưa thanh toán</>
                              : <Text style={{ color: Colors.success, fontWeight: '800' }}>Tất cả đã thanh toán</Text>}
                          </Text>
                        </View>
                        <Text style={s.buildingArrow}>›</Text>
                      </View>

                      <SegBar paid={paid.length} pending={pending.length} overdue={overdue.length} />

                      <View style={s.pillRow}>
                        <View style={[s.pill, { backgroundColor: Colors.successLight }]}>
                          <Text style={[s.pillText, { color: Colors.success }]}>✓ {paid.length} đã thu</Text>
                        </View>
                        {pending.length > 0 && (
                          <View style={[s.pill, { backgroundColor: Colors.warningLight }]}>
                            <Text style={[s.pillText, { color: Colors.warning }]}>{pending.length} chưa thu</Text>
                          </View>
                        )}
                        {overdue.length > 0 && (
                          <View style={[s.pill, { backgroundColor: Colors.errorLight }]}>
                            <Text style={[s.pillText, { color: Colors.error }]}>⚠ {overdue.length} quá hạn</Text>
                          </View>
                        )}
                        <Text style={s.buildingCount}>{group.invoices.length} hoá đơn</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {buildingGroups.length > LIST_PREVIEW && (
                  <MoreRow hidden={buildingGroups.length - LIST_PREVIEW} expanded={expandBuildings}
                    onPress={() => setExpandBuildings(v => !v)} unit="nhà" />
                )}
              </View>
            )}

            {/* ── (4) Giao dịch tiền nhà gần đây ──
                Chỉ giao dịch của hoá đơn TIỀN NHÀ. Cọc, bảo trì, điện nước đã chuyển
                hẳn sang màn "Thu & Đối soát" (ManagerPaymentHistory) — màn này chỉ lo
                đúng một việc: phát hành & theo dõi thu tiền nhà. ── */}
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionTitle}>Giao dịch tiền nhà gần đây</Text>
                <TouchableOpacity onPress={() => navigation.navigate('ManagerPaymentHistory')}>
                  <Text style={s.sectionLink}>💳 Thu & Đối soát →</Text>
                </TouchableOpacity>
              </View>

              {verifiedTx.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyText}>Chưa có giao dịch tiền nhà nào được xác nhận.</Text>
                </View>
              ) : (
                <View style={s.txCard}>
                  {shownTx.map((tx, i) => {
                    const mc = methodOf(tx.method);
                    return (
                      <View key={tx.id} style={[s.txRow, i > 0 && s.txRowBorder]}>
                        <View style={s.txIcon}><Text style={{ fontSize: 16 }}>{mc.icon}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.txName}>
                            {tx.tenantName}{tx.roomNumber ? ` · ${tx.roomNumber}` : ''}
                          </Text>
                          <Text style={s.txMeta}>
                            {mc.label} · {fmtWhen(tx.verifiedAt || tx.createdAt)}
                          </Text>
                        </View>
                        <Text style={s.txAmt}>✓ Đã thu</Text>
                      </View>
                    );
                  })}
                  {/* Chỉ xem nhanh vài giao dịch mới nhất ở đây; xem đủ thì sang màn
                      Lịch sử thanh toán (có lọc theo trạng thái + gộp cả tiền cọc). */}
                  {verifiedTx.length > TX_PREVIEW && (
                    <TouchableOpacity
                      style={s.txMore}
                      onPress={() => navigation.navigate('ManagerPaymentHistory')}
                    >
                      <Text style={s.txMoreText}>
                        Xem toàn bộ {verifiedTx.length} giao dịch →
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {shownInvoices.length === 0
              && pendingVerifications.length === 0 && verifiedTx.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>{search ? '🔍' : '🧾'}</Text>
                <Text style={s.emptyText}>
                  {search
                    ? `Không tìm thấy khách thuê, phòng hay hoá đơn nào khớp "${search.trim()}".`
                    : `Chưa có hoá đơn tiền nhà nào trong kỳ này.\nHệ thống tự phát hành vào ngày ${RENT_CYCLE.issueDay} hằng tháng.`}
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base },
  loading: { paddingVertical: Spacing.xl * 2, alignItems: 'center' },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingTop: Spacing.md, paddingBottom: Spacing.base,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title:    { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // ── (1) Hero: kỳ này thu tới đâu ──
  heroCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg, ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  autoChip: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  autoChipText: { fontSize: 10.5, fontWeight: '800', color: Colors.primary },
  heroFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: Spacing.sm },
  heroAmount: { fontSize: 38, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1 },
  heroSlash: { fontSize: 20, fontWeight: '800', color: Colors.textMuted },
  heroFigureText: { marginLeft: Spacing.sm, flex: 1 },
  heroUnit: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  heroRate: { fontSize: 11.5, fontWeight: '800', marginTop: 1 },
  heroTotal: {
    fontSize: 11.5, color: Colors.textMuted, marginTop: Spacing.md, lineHeight: 17,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider,
  },

  // ── Thanh tiến độ phân đoạn (đã thu · chưa thu · quá hạn) ──
  segBg: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: Colors.divider, marginTop: Spacing.md, gap: 2,
  },
  segPart: { height: '100%' },

  // ── Chip nhỏ trong thẻ nhà ──
  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
  pill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10.5, fontWeight: '800' },

  // ── Thanh tìm kiếm ──
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.base, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 4,
  },
  searchClear: { fontSize: 15, fontWeight: '800', color: Colors.textMuted, paddingHorizontal: 4 },

  heroStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  heroStat: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: Colors.background,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  heroStatNum: { fontSize: 18, fontWeight: '900' },
  heroStatLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },

  // ── Section chung ──
  section: { marginBottom: Spacing.lg },
  // Các con bên trong đã có marginBottom nên hàng này không thêm nữa (tránh hở gấp đôi).
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionLink:  { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  sectionCount: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
  sectionNote: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  // ── (2) Việc cần xử lý ──
  todoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  todoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todoTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  todoSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  todoArrow: { fontSize: 18, color: Colors.textMuted, fontWeight: '700', marginLeft: 4 },
  moreRow: {
    paddingVertical: Spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  moreRowText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },

  // ── Nhóm việc cần xử lý: dải màu trái báo mức gấp ──
  todoGroup: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
    marginBottom: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  todoGroupHead: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  todoGroupTitle: { fontSize: 13.5, fontWeight: '800' },
  todoGroupHint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  todoItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  todoItemBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  todoItemName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  todoItemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  todoItemRight: { alignItems: 'flex-end' },
  todoLate: { fontSize: 11.5, fontWeight: '800' },
  todoFlag: {
    fontSize: 9.5, fontWeight: '800', color: Colors.error,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, overflow: 'hidden',
  },

  clearCard: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, alignItems: 'center',
  },
  clearText: { fontSize: 13, fontWeight: '700', color: Colors.success },

  verifyCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  verifyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  verifyName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  verifyMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  verifyContent: {
    fontSize: 11.5, color: Colors.textSecondary, backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: Spacing.sm,
  },
  verifyActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  rejectBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  approveBtn: {
    flex: 1.6, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.success,
  },
  approveBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },

  // ── (3) Theo nhà ──
  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  buildingTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  buildingAvatar: {
    width: 44, height: 44, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  buildingAvatarText: { fontSize: 13, fontWeight: '900' },
  buildingName: { fontSize: 14.5, fontWeight: '800', color: Colors.textPrimary },
  buildingArrow: { fontSize: 20, color: Colors.textMuted, fontWeight: '700' },
  buildingMoney: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },
  buildingCount: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, marginLeft: 'auto' },

  // ── (4) Giao dịch ──
  txCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  txRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  txIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  txName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  txMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  txAmt:  { fontSize: 13, fontWeight: '800', color: Colors.success },
  txMore: {
    paddingVertical: Spacing.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  txMoreText: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },

  // ── Rỗng ──
  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
