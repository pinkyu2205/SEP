import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_TERMINATION_AFTER_DAYS,
} from '@/constants';
import { billMonthLabel, formatCurrency, formatDate, getDaysUntil } from '@/utils';
import { SharedBill, BillStatus, InvoiceType } from '@/types/bill';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { InvoicePaymentModal } from '@/components/invoice/InvoicePaymentModal';
import { isDisputeOpen } from '@/types/invoiceDispute';

type Invoice = SharedBill;
type InvoiceStatus = BillStatus;
type StatusFilter = 'all' | 'unpaid' | InvoiceStatus;
type TypeFilter = 'all' | InvoiceType;

/**
 * MÀN HOÁ ĐƠN = HỘP THƯ ĐẦY ĐỦ — chốt 13/08/2026.
 *
 * Đây là nơi khách thấy MỌI khoản phải trả mà hệ thống gửi tới: tiền phòng, điện, nước,
 * phí bảo trì, tiền cọc. Cũng là nơi DUY NHẤT bấm thanh toán được (Thao tác nhanh không
 * có lối nào khác) — nên không được loại bớt loại nào ra khỏi đây.
 *
 * Vấn đề cũ không phải "thừa loại" mà là "trộn lẫn": mọi hoá đơn nằm chung một danh sách
 * phẳng, phân biệt bằng hàng chip "Loại" (Tất cả/Phòng/Điện/Nước) — vừa chiếm chỗ, vừa
 * bị cắt mất chip cuối trên máy màn nhỏ, và khách phải bấm lọc mới biết mình nợ những gì.
 *
 * Giờ gom sẵn theo TỪNG LOẠI, mỗi nhóm có tiêu đề + số lượng + tổng tiền của nhóm. Nhìn
 * một phát thấy ngay "nợ gì, mỗi thứ bao nhiêu" mà không phải bấm lọc. Nhóm rỗng tự ẩn.
 *
 * Thứ tự cố định theo mức độ khách quan tâm, KHÔNG theo số tiền — để vị trí các nhóm
 * đứng yên giữa các tháng, khách quen tay.
 */
const GROUP_ORDER: InvoiceType[] = ['rent', 'electricity', 'water', 'maintenance', 'deposit'];

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Chờ thanh toán',    color: Colors.warning, bg: Colors.warningLight },
  paid:      { label: 'Đã thanh toán',     color: Colors.success, bg: Colors.successLight },
  overdue:   { label: 'Quá hạn',           color: Colors.error,   bg: Colors.errorLight },
  partial:   { label: 'Thanh toán 1 phần', color: Colors.info,    bg: Colors.infoLight },
  cancelled: { label: 'Đã huỷ',           color: Colors.textMuted, bg: Colors.background },
};

const TYPE_CONFIG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  // `deposit` = hoá đơn HD-ONBOARD-*, GỘP cọc + tiền nhà chu kỳ đầu (xem types/bill.ts),
  // nên nhãn không được để mỗi chữ "Tiền cọc".
  deposit:     { label: 'Thu khi nhận phòng', icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};

/**
 * Bộ lọc trạng thái — ĐỦ 5 trạng thái hoá đơn của hệ thống (xem STATUS_CONFIG).
 *
 * Bản trước chỉ có 4 chip (Chưa trả / Quá hạn / Đã trả / Tất cả) nên hoá đơn ở trạng
 * thái `partial` và `cancelled` không có đường nào lọc tới — khách trả góp một phần rồi
 * thì không tìm lại được hoá đơn đó.
 *
 * Nhãn viết ĐỦ CHỮ: "Chưa TT"/"Đã TT" là tiếng lóng nội bộ, khách thuê không có nghĩa
 * vụ đoán "TT" là thanh toán.
 *
 * "Chưa trả" CỐ Ý chồng lấn với "Quá hạn" và "Chờ trả" — nó là bộ lọc mặc định gộp mọi
 * khoản còn nợ, thứ khách mở app ra là muốn thấy. Chồng lấn trong bộ lọc là chuyện bình
 * thường, y như chip "Tất cả".
 *
 * `match` dùng chung cho cả lọc lẫn đếm — trước đây điều kiện lọc viết rời trong
 * `filtered`, thêm chip mới là dễ quên đồng bộ, số trên chip lệch với danh sách.
 *
 * `color` cho mỗi chip một màu riêng khi được chọn, lấy đúng màu trạng thái ở
 * STATUS_CONFIG để chip và badge trên thẻ hoá đơn nói cùng một ngôn ngữ màu.
 */
const STATUS_FILTER_TABS: {
  key: StatusFilter;
  label: string;
  color: string;
  match: (i: Invoice) => boolean;
}[] = [
  { key: 'unpaid',    label: 'Cần trả',     color: Colors.primary,   match: i => i.status === 'pending' || i.status === 'overdue' || i.status === 'partial' },
  { key: 'pending',   label: 'Chờ trả',     color: Colors.warning,   match: i => i.status === 'pending' },
  { key: 'overdue',   label: 'Quá hạn',     color: Colors.error,     match: i => i.status === 'overdue' },
  { key: 'partial',   label: 'Trả 1 phần',  color: Colors.info,      match: i => i.status === 'partial' },
  { key: 'cancelled', label: 'Đã huỷ',      color: Colors.textMuted, match: i => i.status === 'cancelled' },
  { key: 'all',       label: 'Tất cả',      color: Colors.primary,   match: () => true },
];

/**
 * Bộ lọc LOẠI PHÍ — đủ 5 loại, dựng thẳng từ GROUP_ORDER nên không thể lệch với các
 * nhóm trong danh sách.
 *
 * Có nhóm rồi vẫn cần lọc: nhóm giúp NHÌN, lọc giúp TÌM. Khi khách có chục hoá đơn thì
 * bấm "Điện" nhanh hơn cuộn tìm nhóm Điện.
 */
const TYPE_FILTER_TABS: { key: TypeFilter; label: string; color: string }[] = [
  { key: 'all', label: 'Tất cả', color: Colors.primary },
  ...GROUP_ORDER.map(t => ({
    key: t as TypeFilter,
    label: `${TYPE_CONFIG[t].icon} ${TYPE_CONFIG[t].label}`,
    color: TYPE_CONFIG[t].color,
  })),
];

type PendingCharge = Awaited<ReturnType<typeof realTenantBillingService.listPendingCharges>>[number];

const PENDING_CHARGE_CATEGORY: Record<string, string> = {
  MAINTENANCE: 'Phí sửa chữa (khách làm hư)',
};

export const InvoiceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState<SharedBill[]>([]);
  // Khoản chờ thu (đã nghiệm thu, CHƯA phát hành hóa đơn) — hiện trước để khách không
  // bất ngờ khi hóa đơn MAINTENANCE xuất hiện kỳ tới.
  const [pendingCharges, setPendingCharges] = useState<PendingCharge[]>([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unpaid');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      realTenantBillingService.listInvoices().catch(() => []),
      realTenantBillingService.listPendingCharges().catch(() => [] as PendingCharge[]),
    ])
      .then(([inv, charges]) => {
        setInvoices(inv.map(toSharedBill));
        setPendingCharges(charges.filter(c => (c.status || '').toUpperCase() === 'PENDING'));
      })
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  /**
   * BE bắn `INVOICE_PAID` khi khách trả xong (QR/PayOS hoặc quản lý xác nhận) → nạp lại.
   * Refetch chứ không vá dòng: hoá đơn vừa trả có thể đang bị bộ lọc "Chưa thanh toán"
   * loại ra, phải để danh sách tự dựng lại theo bộ lọc hiện tại.
   */
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: reload,
  });

  const pendingChargeTotal = pendingCharges.reduce((s, c) => s + (c.amount ?? 0), 0);

  /**
   * HOÁ ĐƠN ĐÃ TRẢ KHÔNG NẰM Ở MÀN NÀY (13/08/2026).
   *
   * Màn Hoá đơn chỉ còn thứ khách CÒN PHẢI TRẢ. Mọi hoá đơn đã thanh toán dồn sang màn
   * Lịch sử (nút "Lịch sử" góc trên) — nếu để lẫn thì chip "Tất cả" trộn cả đã trả lẫn
   * chưa trả, và tổng của nhóm cộng luôn phần đã trả nên đọc ra số nợ sai gấp mấy lần.
   *
   * Lọc ngay từ nguồn thay vì trong từng bộ lọc: chỉ một chỗ để sau này ai đọc cũng thấy.
   */
  const owing = invoices.filter(i => i.status !== 'paid');

  const activeTab = STATUS_FILTER_TABS.find(t => t.key === statusFilter) ?? STATUS_FILTER_TABS[0];
  const matchType = (i: Invoice) => typeFilter === 'all' || i.invoiceType === typeFilter;
  const filtered = owing.filter(i => activeTab.match(i) && matchType(i));

  /**
   * Số trên chip = số hoá đơn khách sẽ THẤY nếu bấm chip đó, tức đã tính cả bộ lọc kia.
   * Đếm rời từng trục thì chip ghi "3" mà bấm vào ra 0 — số đó chỉ làm người dùng mất tin.
   */
  const statusCounts = useMemo(
    () => Object.fromEntries(
      STATUS_FILTER_TABS.map(t => [t.key, owing.filter(i => t.match(i) && matchType(i)).length]),
    ) as Record<StatusFilter, number>,
    [invoices, typeFilter],
  );
  const typeCounts = useMemo(
    () => Object.fromEntries(
      TYPE_FILTER_TABS.map(t => [
        t.key,
        owing.filter(i => activeTab.match(i) && (t.key === 'all' || i.invoiceType === t.key)).length,
      ]),
    ) as Record<TypeFilter, number>,
    [invoices, statusFilter],
  );

  /**
   * Gom theo loại, thứ tự cố định (xem GROUP_ORDER). Mỗi nhóm mang sẵn tổng tiền để
   * tiêu đề nhóm hiện luôn — khỏi cần thẻ tổng ở trên liệt kê lại từng loại.
   * Loại lạ ngoài GROUP_ORDER vẫn được gom vào cuối chứ không bị nuốt mất.
   */
  const sections = useMemo(() => {
    /**
     * Tổng của nhóm CHỈ cộng khoản CÒN NỢ, không cộng hoá đơn đã trả.
     *
     * Trước đây cộng tất: chọn "Tất cả" thì nhóm Tiền phòng hiện "15.341.935 đ" trong
     * khi khách chỉ còn nợ 4.677.419 đ — con số đó đọc như số tiền phải trả nên gây
     * hiểu nhầm nặng. Nhóm nào đã trả hết thì `owed = 0` và tiêu đề ghi "Đã trả đủ".
     */
    const owedOf = (rows: Invoice[]) =>
      rows.filter(i => i.status === 'pending' || i.status === 'overdue')
        .reduce((s, i) => s + i.grandTotal, 0);

    const seen = new Set<string>();
    const build = (type: InvoiceType) => {
      const data = filtered.filter(i => i.invoiceType === type);
      seen.add(type);
      const cfg = TYPE_CONFIG[type];
      return { key: type, title: `${cfg.icon} ${cfg.label}`, owed: owedOf(data), data };
    };
    const known = GROUP_ORDER.map(build);
    const rest = filtered.filter(i => !seen.has(i.invoiceType));
    return [
      ...known,
      ...(rest.length ? [{ key: 'other', title: '📄 Khoản khác', owed: owedOf(rest), data: rest }] : []),
    ].filter(s => s.data.length > 0);
  }, [filtered]);

  const unpaid = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;
  const pendingTotal = unpaid.reduce((sum, i) => sum + i.grandTotal, 0);

  const handlePay = (invoice: Invoice) => setPayingInvoice(invoice);

  // Cập nhật invoice đang thanh toán + đồng bộ luôn vào danh sách (không cần reload cả trang).
  const handleInvoiceUpdate = (updated: Invoice) => {
    setPayingInvoice(updated);
    setInvoices(prev => prev.map(i => (i.id === updated.id ? updated : i)));
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const cfg     = STATUS_CONFIG[item.status];
    const typeCfg = TYPE_CONFIG[item.invoiceType];
    const isPaid    = item.status === 'paid';
    // Bỏ nhánh riêng cho kỳ đầu (13/08/2026): tiền kỳ đầu thu chung với tiền cọc ở mã
    // QR lúc đón khách nên không còn hoá đơn kỳ đầu chờ thanh toán. Mọi hoá đơn đi
    // thẳng theo dueDate/status của BE.
    const isOverdue = item.status === 'overdue';
    const dueDate = item.dueDate;
    const daysOverdue = isOverdue ? Math.abs(getDaysUntil(dueDate)) : 0;
    /**
     * Hoá đơn đang được tra soát theo khiếu nại của khách.
     *
     * Phải hiện Ở ĐÂY chứ không chỉ trong màn chi tiết: danh sách là chỗ khách nhìn để
     * biết "mình còn nợ gì" — thấy một hoá đơn đỏ quá hạn mà không biết nó đang bị treo
     * vì chính yêu cầu của mình thì rất dễ hoảng và trả bừa cho xong.
     */
    const disputePending = isDisputeOpen(item.dispute);

    return (
      <TouchableOpacity
        style={[styles.card, isOverdue && styles.cardOverdue]}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('InvoiceDetail', { invoice: item })}
      >
        {isOverdue && <View style={styles.overdueStripe} />}

        {/* Header: type badge + month + status */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.typeBadge, { backgroundColor: typeCfg.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>
                {typeCfg.icon} {typeCfg.label}
              </Text>
            </View>
            {/* Hoá đơn onboard không thuộc kỳ nào → billMonthLabel trả null, ẩn luôn. */}
            {!!billMonthLabel(item) && (
              <Text style={styles.invoiceMonth}>{billMonthLabel(item)}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>
              {cfg.label}
            </Text>
          </View>
        </View>

        {/* Room info */}
        <Text style={styles.invoiceRoom}>{item.roomName} · {item.propertyName}</Text>

        {disputePending && (
          <Text style={styles.disputeChip}>⏳ Đang tra soát — tạm dừng hạn thanh toán</Text>
        )}

        {/* Utility detail line */}
        {item.invoiceType === 'electricity' && item.kwhUsed !== undefined && (
          <Text style={styles.utilityDetail}>⚡ {item.kwhUsed} kWh · {item.billingPeriod ?? '—'}</Text>
        )}
        {item.invoiceType === 'water' && item.m3Used !== undefined && (
          <Text style={styles.utilityDetail}>💧 {item.m3Used} m³ · {item.billingPeriod ?? '—'}</Text>
        )}

        {/* Amount row + due date */}
        <View style={styles.amountRow}>
          <Text style={[styles.amountVal, isOverdue && { color: Colors.error }, isPaid && { color: Colors.success }]}>
            {formatCurrency(item.grandTotal)}
          </Text>
          {isPaid ? (
            <Text style={styles.paidDateText}>✅ {item.paidAt ? formatDate(item.paidAt) : 'Đã TT'}</Text>
          ) : (
            <Text style={[styles.dueDateText, isOverdue && !disputePending && { color: Colors.error }]}>
              {disputePending
                ? 'Chờ kết luận'
                : isOverdue
                  ? `Quá hạn ${daysOverdue} ngày`
                  : `Hạn: ${formatDate(dueDate)}`}
            </Text>
          )}
        </View>

        {(item.lateFee ?? 0) > 0 && (
          <Text style={styles.lateFeeText}>+ Phí trả chậm: {formatCurrency(item.lateFee)}</Text>
        )}

        {/* Tiền phòng quá hạn: không phạt tiền, nhưng leo thang tới chấm dứt HĐ. */}
        {isOverdue && item.invoiceType === 'rent' && (
          <Text style={styles.riskText}>
            {daysOverdue >= RENT_TERMINATION_AFTER_DAYS
              ? '⚠️ Đã quá ngày nhắc cuối — quản lý được quyền chấm dứt hợp đồng.'
              : `⚠️ Tới ngày ${RENT_CYCLE.terminationFromDay} chưa thanh toán thì quản lý được quyền chấm dứt hợp đồng.`}
          </Text>
        )}

        {/* Action buttons */}
        {item.status === 'pending' && (
          <TouchableOpacity style={styles.payBtn} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>💳 Thanh toán ngay</Text>
          </TouchableOpacity>
        )}
        {isOverdue && (
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: Colors.error }]} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>🚨 Thanh toán ngay (Quá hạn)</Text>
          </TouchableOpacity>
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
        <View>
          <Text style={styles.title}>Hóa đơn</Text>
          <Text style={styles.subtitle}>Khoản còn phải trả · đã trả xem ở Lịch sử</Text>
        </View>
        {/* Trỏ về PaymentHistory — cùng màn với ô "Lịch sử TT" ngoài Thao tác nhanh.
            Trước 13/08/2026 nút này mở InvoiceHistoryScreen riêng, dẫn tới hai màn lịch
            sử chồng nhau (màn kia là tập cha). Nay một màn, hai lối vào. */}
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('PaymentHistory')}>
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tổng phải trả ──
          Trước đây đây là một ScrollView ngang đặt thẳng trong SafeAreaView (cột flex):
          ScrollView không có chiều cao nội dung cố định nên bị kéo giãn, chừa một
          mảng trắng to giữa tiêu đề và bộ lọc. Giờ bọc trong View và cho ScrollView
          `flexGrow: 0` nên khối chỉ cao đúng bằng nội dung.

          Nội dung cũng gộp lại: mỗi loại một thẻ to xếp dọc (icon/nhãn/tiền) vừa cao
          vừa lặp lại đúng con số của thẻ hoá đơn ngay bên dưới. Giờ là một dòng
          "Cần thanh toán + tổng tiền", loại phí thu nhỏ thành chip lọc nhanh. */}
      {(overdueCount > 0 || pendingTotal > 0) && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryTotalBox}>
              <Text style={styles.summaryTotalLabel}>Cần thanh toán</Text>
              <Text style={styles.summaryTotalValue}>{formatCurrency(pendingTotal)}</Text>
            </View>
            {overdueCount > 0 && (
              <TouchableOpacity
                style={[styles.overduePill, statusFilter === 'overdue' && styles.overduePillActive]}
                onPress={() => setStatusFilter('overdue')}
              >
                <Text style={[styles.overduePillText, statusFilter === 'overdue' && { color: Colors.white }]}>
                  ⚠️ {overdueCount} quá hạn
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cố tình KHÔNG liệt kê từng loại ở đây nữa: tiêu đề mỗi nhóm bên dưới đã
              mang tổng của nhóm, liệt kê lại là cùng một con số hiện hai lần. */}
        </View>
      )}

      {/* ── Lọc LOẠI PHÍ ── */}
      <View style={styles.filterBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {TYPE_FILTER_TABS.map(f => {
            const isActive = typeFilter === f.key;
            const count = typeCounts[f.key] ?? 0;
            const empty = count === 0 && !isActive;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: f.color, borderColor: f.color },
                  empty && styles.filterChipEmpty,
                ]}
                onPress={() => setTypeFilter(f.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive, empty && styles.filterTextEmpty]}>
                  {f.label}
                </Text>
                <Text style={[styles.filterCount, isActive && styles.filterCountActive, empty && styles.filterTextEmpty]}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Lọc TRẠNG THÁI ── */}
      <View style={[styles.filterBlock, styles.filterBlockLast]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {STATUS_FILTER_TABS.map(f => {
            const isActive = statusFilter === f.key;
            const count = statusCounts[f.key] ?? 0;
            // Chip rỗng vẫn bấm được, chỉ mờ đi — ẩn hẳn thì hàng chip nhảy chỗ mỗi lần
            // khách trả xong một hoá đơn, bấm nhầm liên tục.
            const empty = count === 0 && !isActive;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: f.color, borderColor: f.color },
                  empty && styles.filterChipEmpty,
                ]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive, empty && styles.filterTextEmpty]}>
                  {f.label}
                </Text>
                <Text style={[styles.filterCount, isActive && styles.filterCountActive, empty && styles.filterTextEmpty]}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderInvoice}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{section.title}</Text>
            <Text style={styles.groupCount}>{section.data.length}</Text>
            <View style={{ flex: 1 }} />
            {/* Chỉ nêu số CÒN NỢ. Nhóm đã trả hết ghi thẳng "Đã trả đủ" thay vì một số
                tiền — số tiền ở đây luôn bị đọc thành "phải trả". */}
            {section.owed > 0
              ? <Text style={styles.groupTotal}>Còn nợ {formatCurrency(section.owed)}</Text>
              : <Text style={styles.groupPaidOff}>✓ Đã trả đủ</Text>}
          </View>
        )}
        ListHeaderComponent={
          pendingCharges.length > 0 ? (
            <View style={styles.pendingChargeCard}>
              <Text style={styles.pendingChargeTitle}>
                ⏳ Khoản chờ thu kỳ tới — {formatCurrency(pendingChargeTotal)}
              </Text>
              <Text style={styles.pendingChargeDesc}>
                Các khoản dưới đây đã được xác nhận và sẽ được đưa vào hóa đơn kỳ tới.
              </Text>
              {pendingCharges.map(c => (
                <View key={c.id} style={styles.pendingChargeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingChargeName}>
                      {PENDING_CHARGE_CATEGORY[(c.category || '').toUpperCase()] ?? c.category ?? 'Khoản thu khác'}
                    </Text>
                    {!!c.note && <Text style={styles.pendingChargeNote} numberOfLines={2}>{c.note}</Text>}
                    {!!c.createdAt && <Text style={styles.pendingChargeNote}>Ghi nhận {formatDate(c.createdAt)}</Text>}
                  </View>
                  <Text style={styles.pendingChargeAmount}>{formatCurrency(c.amount)}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.emptyDesc, { marginTop: Spacing.md }]}>Đang tải hóa đơn...</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>
                {statusFilter === 'unpaid' || statusFilter === 'all' ? '✅' : '📄'}
              </Text>
              {/* Câu trạng thái rỗng bám theo NHÃN chip đang chọn. Rỗng ở màn này là
                  TIN VUI (hết nợ), không phải "không tìm thấy gì" — nên nói cho đúng. */}
              <Text style={styles.emptyTitle}>
                {statusFilter === 'unpaid' || statusFilter === 'all'
                  ? 'Bạn không còn khoản nào phải trả'
                  : 'Không có hóa đơn'}
              </Text>
              <Text style={styles.emptyDesc}>
                {statusFilter === 'unpaid' || statusFilter === 'all'
                  ? 'Mọi hoá đơn đã thanh toán xong. Xem lại các khoản đã trả ở mục Lịch sử.'
                  : statusFilter === 'overdue'
                    ? 'Không có hoá đơn nào quá hạn — bạn đang đóng đúng hạn.'
                    : statusFilter === 'partial'
                      ? 'Không có hoá đơn nào trả dở dang.'
                      : statusFilter === 'cancelled'
                        ? 'Không có hoá đơn nào bị huỷ.'
                        : 'Không có hoá đơn nào đang chờ thanh toán.'}
              </Text>
            </View>
          )
        }
      />

      <InvoicePaymentModal
        visible={!!payingInvoice}
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onUpdate={handleInvoiceUpdate}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  historyBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Summary chips
  summaryCard: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingTop: Spacing.sm, paddingBottom: Spacing.sm, paddingLeft: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  summaryTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: Spacing.md,
  },
  summaryTotalBox: { flex: 1 },
  summaryTotalLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  summaryTotalValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginTop: 1 },
  // flexGrow: 0 — không có nó thì ScrollView ngang bị kéo giãn theo chiều dọc.
  // Tiêu đề nhóm "🏠 Tiền phòng" / "⚡ Điện, nước & phí khác".
  groupHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  groupTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginRight: 6 },
  groupTotal:   { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  groupPaidOff: { fontSize: 12, fontWeight: '700', color: Colors.success },
  groupCount: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    backgroundColor: Colors.background, borderRadius: BorderRadius.full,
    minWidth: 22, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 2,
  },
  overduePill: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs,
    borderWidth: 1, borderColor: Colors.error + '40',
  },
  overduePillActive: { backgroundColor: Colors.error },
  overduePillText: { fontSize: 11, fontWeight: '700', color: Colors.error },

  // Filter rows
  filterBlock: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: Spacing.lg, paddingBottom: Spacing.xs,
  },
  filterBlockLast: { paddingBottom: Spacing.sm },
  filterChips: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingRight: Spacing.lg },
  filterChip: {
    height: 32, paddingHorizontal: 12, borderRadius: BorderRadius.full,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  // Trạng thái không có hoá đơn nào: mờ đi nhưng VẪN bấm được (xem chú thích chỗ render).
  filterChipEmpty: { opacity: 0.45 },
  // Số đếm — nền nhạt để tách khỏi nhãn mà không cần thêm dấu ngoặc.
  filterCount: {
    fontSize: 11, fontWeight: '800', color: Colors.textSecondary,
    backgroundColor: Colors.background, borderRadius: BorderRadius.full,
    minWidth: 18, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 1,
    overflow: 'hidden',
  },
  filterCountActive: { color: Colors.white, backgroundColor: '#FFFFFF33' },
  filterTextEmpty: { color: Colors.textMuted },
  // Màu chip khi được chọn nay lấy từ `color` của từng tab (STATUS_FILTER_TABS /
  // TYPE_FILTER_TABS) nên không còn ba style cứng cho primary/error/success.
  filterText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  // Khoản chờ thu (pending charges — chưa thành hóa đơn)
  pendingChargeCard: {
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  pendingChargeTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  pendingChargeDesc: { fontSize: 12, color: '#B45309', marginTop: 2, lineHeight: 18 },
  pendingChargeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: '#FDE68A',
  },
  pendingChargeName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  pendingChargeNote: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pendingChargeAmount: { fontSize: 14, fontWeight: '800', color: '#B45309' },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md, overflow: 'hidden' },
  cardOverdue: { borderWidth: 1.5, borderColor: Colors.error + '60' },
  overdueStripe: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, backgroundColor: Colors.error },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  invoiceMonth: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  invoiceRoom: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  utilityDetail: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.xs },
  statusBadge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  amountVal: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  dueDateText: { fontSize: 12, color: Colors.textSecondary },
  paidDateText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  lateFeeText: { fontSize: 12, color: Colors.error, fontWeight: '600', marginTop: 3 },
  disputeChip: {
    fontSize: 11, fontWeight: '700', color: '#92400E',
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start', marginTop: 6, overflow: 'hidden',
  },
  riskText: { fontSize: 11, color: Colors.error, fontWeight: '700', marginTop: 4, lineHeight: 16 },

  payBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  payBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
