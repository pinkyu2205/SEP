import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Modal, TextInput, ScrollView, Dimensions, ActivityIndicator,
} from 'react-native';
import { showAlert, activeRentingKeys, belongsToActiveTenant, billMonthLabel } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_AMOUNT_HIDDEN_NOTE,
  RENT_TERMINATION_AFTER_DAYS,
} from '@/constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerInvoiceStatus,
} from '@/services/manager/invoiceService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { checkoutService } from '@/services/manager/checkoutService';
import { serverNow, todayIso } from '@/utils/serverTime';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial' | 'cancelled';
type FilterType = 'all' | BillStatus;

// ===================== CONSTANTS =====================
const fmt = (n: number) => (n ?? 0).toLocaleString('vi-VN') + 'đ';

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: 'Chưa thanh toán',     color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  paid:      { label: 'Đã thanh toán',       color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  overdue:   { label: 'Quá hạn',             color: '#EF4444', bg: '#FEF2F2', icon: '🚨' },
  partial:   { label: 'Thanh toán một phần', color: '#3B82F6', bg: '#EFF6FF', icon: '💛' },
  cancelled: { label: 'Đã huỷ',              color: '#9CA3AF', bg: '#F3F4F6', icon: '🚫' },
};

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',     label: 'Tất cả' },
  // Thứ tự + nhãn khớp với 3 ô số ở thẻ tổng quan và với màn Lịch sử hoá đơn.
  { id: 'paid',    label: 'Đã thu' },
  { id: 'pending', label: 'Chưa thu' },
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'partial', label: 'Một phần' },
];

const STATUS_ORDER: Record<BillStatus, number> = { overdue: 0, pending: 1, partial: 2, paid: 3, cancelled: 4 };

/**
 * Số ngày trễ so với hạn nộp. Cùng công thức với màn Hoá đơn tiền nhà.
 *
 * Trước 13/08/2026 còn cộng thêm 3 ngày ân hạn cho "kỳ đầu" (nhận diện bằng hoá đơn
 * phát hành cùng ngày hạn nộp). Bỏ hẳn: tiền kỳ đầu nay thu chung với tiền cọc ở mã QR
 * lúc đón khách nên không còn hoá đơn kỳ đầu chờ thu.
 */
const lateDays = (inv: ManagerInvoice): number => {
  if (!inv.dueDate) return 0;
  const d = new Date(`${inv.dueDate.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return 0;
  const today = serverNow(); today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
};

/**
 * Được quyền chấm dứt hợp đồng vì không trả tiền phòng chưa?
 * Hạn ngày 5 → ngày 8 mới được chấm dứt, tức trễ 3 ngày.
 */
const canTerminateInvoice = (inv: ManagerInvoice): boolean => {
  const st = (inv.status || '').toUpperCase();
  if (st === 'PAID' || st === 'CANCELLED') return false;
  return lateDays(inv) >= RENT_TERMINATION_AFTER_DAYS;
};

const toLocalStatus = (s: ManagerInvoiceStatus): BillStatus => {
  switch (s) {
    case 'PAID':      return 'paid';
    case 'OVERDUE':   return 'overdue';
    case 'PARTIAL':   return 'partial';
    case 'CANCELLED': return 'cancelled';
    default:          return 'pending';
  }
};

// ===================== SCREEN =====================
export const BuildingBillingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { propertyId, propertyName } = route.params as { propertyId: string; propertyName: string };
  const pid = Number(propertyId);

  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading,  setLoading]  = useState(true);

  /**
   * Hợp đồng đang hiệu lực của nhà này — cần `contractId` để chấm dứt ngay tại màn
   * này. `ManagerInvoiceResponse` của BE không trả contractId, chỉ có roomNumber, nên
   * phải nạp thêm danh sách hợp đồng rồi ghép theo phòng.
   */
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [terminating, setTerminating] = useState(false);

  // Chỉ lấy hoá đơn TIỀN NHÀ (RENT) của BĐS này — điện/nước có thống kê riêng ở màn Ghi chỉ số.
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      realManagerInvoiceService.listInvoices({ type: 'RENT' }).catch(() => [] as ManagerInvoice[]),
      realTenantService.listByProperty(pid).catch(() => [] as TenantContractResponse[]),
    ])
      .then(([list, cts]) => {
        const active = cts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE');
        setContracts(active);
        // Bỏ hoá đơn của khách ĐÃ chấm dứt hợp đồng (13/08/2026): họ không còn ở đây,
        // manager không đòi được nữa — phần nợ xử lý ở luồng tất toán Trả phòng.
        // BE vẫn trả các hoá đơn đó ở trạng thái OVERDUE nên phải tự lọc.
        // Lọc NGAY TẠI NGUỒN để con số thống kê (đã thu / quá hạn) khớp với danh sách
        // bên dưới — lọc riêng ở phần hiển thị là hai chỗ đá nhau.
        const keys = activeRentingKeys(active);
        setInvoices(
          list.filter(i => i.propertyId === pid && belongsToActiveTenant(i, keys)),
        );
      })
      .finally(() => setLoading(false));
  }, [pid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [search,           setSearch]           = useState('');
  const [filter,           setFilter]           = useState<FilterType>('all');
  /** Lọc theo KỲ (YYYY-MM) — 'all' = mọi kỳ. */
  const [periodFilter,     setPeriodFilter]     = useState<string>('all');
  const [selectedBill,     setSelectedBill]     = useState<ManagerInvoice | null>(null);
  const [showCashModal,    setShowCashModal]    = useState(false);
  const [showEwalletModal, setShowEwalletModal] = useState(false);
  const [cashNote,         setCashNote]         = useState('');
  const [submitting,       setSubmitting]       = useState(false);

  const isWholeHouse = (b: ManagerInvoice) => !b.roomNumber;

  /**
   * Các KỲ có hoá đơn, mới nhất trước — dựng từ chính dữ liệu nên không bao giờ có
   * chip rỗng. Nhà thuê lâu là hàng chục kỳ, cuộn tìm rất mệt.
   */
  const periods = useMemo(() => {
    const set = new Set(invoices.map(b => `${b.year}-${String(b.month).padStart(2, '0')}`));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const filteredBills = useMemo(() => {
    let list = invoices;
    if (periodFilter !== 'all') {
      list = list.filter(b => `${b.year}-${String(b.month).padStart(2, '0')}` === periodFilter);
    }
    if (filter !== 'all') list = list.filter(b => toLocalStatus(b.status) === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.tenantName || '').toLowerCase().includes(q) ||
        (b.roomNumber || '').toLowerCase().includes(q) ||
        (b.code || '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => STATUS_ORDER[toLocalStatus(a.status)] - STATUS_ORDER[toLocalStatus(b.status)]);
  }, [invoices, filter, search, periodFilter]);

  // Đếm theo SỐ HOÁ ĐƠN, không cộng tiền — manager không được thấy số tiền thuê
  // (xem @/constants/managerVisibility).
  const stats = useMemo(() => {
    const paid    = invoices.filter(b => b.status === 'PAID');
    const overdue = invoices.filter(b => b.status === 'OVERDUE');
    return {
      total:        invoices.length,
      paidCount:    paid.length,
      overdueCount: overdue.length,
      unpaidCount:  invoices.filter(b => b.status !== 'PAID' && b.status !== 'CANCELLED').length,
    };
  }, [invoices]);

  /**
   * Gom hoá đơn theo KỲ, mới nhất trước — nhà thuê lâu là hàng chục kỳ, đổ ra một
   * danh sách phẳng thì không biết hoá đơn nào của tháng nào. Mỗi kỳ có tiêu đề
   * riêng kèm tình trạng thu của chính kỳ đó.
   */
  const sections = useMemo(() => {
    const byMonth = new Map<string, ManagerInvoice[]>();
    for (const b of filteredBills) {
      const key = `${b.year}-${String(b.month).padStart(2, '0')}`;
      byMonth.set(key, [...(byMonth.get(key) ?? []), b]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        const [y, m] = key.split('-');
        return {
          key,
          title: `${m}/${y}`,
          paid: list.filter(i => i.status === 'PAID').length,
          overdue: list.filter(i => i.status === 'OVERDUE').length,
          data: list,
        };
      });
  }, [filteredBills]);

  const payRate  = stats.total > 0 ? Math.round((stats.paidCount / stats.total) * 100) : 0;
  const barColor = payRate >= 80 ? Colors.success : payRate >= 50 ? Colors.warning : Colors.error;

  /** Ghép hoá đơn → hợp đồng: theo số phòng; nhà nguyên căn thì chỉ có 1 HĐ. */
  const contractOf = (inv: ManagerInvoice) =>
    (inv.roomNumber
      ? contracts.find(c => c.roomNumber === inv.roomNumber)
      : contracts[0]) ?? null;

  /**
   * Chấm dứt hợp đồng NGAY tại đây rồi mở luôn yêu cầu trả phòng.
   * Trước đây nút này chỉ điều hướng sang màn "Tiền phòng tự động" để bấm tiếp —
   * thừa một bước và người dùng không hiểu vì sao bị đá sang màn khác.
   */
  const confirmTerminate = (inv: ManagerInvoice) => {
    const contract = contractOf(inv);
    if (!contract) {
      showAlert('Không tìm được hợp đồng', 'Không xác định được hợp đồng của hoá đơn này. Thử tải lại màn hình.');
      return;
    }
    const late = lateDays(inv);
    showAlert(
      'Chấm dứt hợp đồng?',
      `${inv.tenantName || 'Khách thuê'} — ${inv.roomNumber ? `phòng ${inv.roomNumber}` : 'nhà nguyên căn'} `
      + `đã quá hạn tiền phòng ${late} ngày và đã được nhắc đủ các mốc.\n\n`
      + 'Chấm dứt sẽ THANH LÝ hợp đồng: khách mất quyền truy cập phòng trong app, phòng về trạng thái trống. '
      + 'Hành động này không đảo ngược được.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Chấm dứt hợp đồng',
          style: 'destructive',
          onPress: async () => {
            setTerminating(true);
            try {
              await realTenantService.terminateContract(contract.id, {
                type: 'VIOLATION',
                reason: `Không thanh toán tiền phòng T${String(inv.month).padStart(2, '0')}/${inv.year} — quá hạn ${late} ngày, đã nhắc đủ các mốc theo chính sách.`,
              });

              // Mở luôn thủ tục trả phòng để còn kiểm kê thiết bị và tất toán cọc.
              let ok = false;
              try {
                await checkoutService.createForTenant({
                  contractId: contract.id,
                  expectedMoveOutDate: todayIso(),
                  reason: `Chấm dứt hợp đồng do không thanh toán tiền phòng T${String(inv.month).padStart(2, '0')}/${inv.year}.`,
                });
                ok = true;
              } catch { /* báo rõ ở dưới, không nuốt */ }

              setSelectedBill(null);
              load();
              showAlert(
                'Đã chấm dứt hợp đồng',
                ok
                  ? 'Đã mở yêu cầu trả phòng. Sang đó để kiểm kê thiết bị, chốt số điện nước và tất toán tiền cọc.'
                  : 'Hợp đồng đã thanh lý, nhưng CHƯA mở được yêu cầu trả phòng. Vào mục Trả phòng tạo thủ công để còn tất toán cọc.',
                [
                  { text: 'Để sau', style: 'cancel' },
                  { text: 'Xử lý trả phòng', onPress: () => navigation.navigate('CheckoutRequests') },
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

  const recordPaid = async (method: string, note?: string) => {
    if (!selectedBill) return;
    setSubmitting(true);
    try {
      await realManagerInvoiceService.markInvoicePaid(selectedBill.id, { method, note });
      setShowCashModal(false); setShowEwalletModal(false);
      setSelectedBill(null); setCashNote('');
      showAlert('✅ Thành công', 'Đã ghi nhận thanh toán.');
      load();
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không ghi nhận được (BE chưa có endpoint?).');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{propertyName}</Text>
          <Text style={s.headerSub}>Hóa đơn tiền nhà</Text>
        </View>
      </View>

      {/* ── Thẻ tổng quan ──
          Dùng CHUNG bố cục với màn "Hóa đơn tiền nhà" và "Lịch sử hoá đơn":
          số lớn dạng đã-thu/tổng, thanh 3 đoạn, rồi 3 ô Đã thu · Chưa thu · Quá hạn
          theo đúng thứ tự đó. Trước đây màn này tự bày một kiểu riêng (2/4 · Quá hạn ·
          Chưa thanh toán + thanh 1 màu) nên nhìn như của app khác. ── */}
      <View style={s.summaryCard}>
        <View style={s.heroFigure}>
          <Text style={s.heroAmount}>{stats.paidCount}</Text>
          <Text style={s.heroSlash}>/{stats.total}</Text>
          <View style={s.heroFigureText}>
            <Text style={s.heroUnit}>hoá đơn đã thu</Text>
            <Text style={[s.heroRate, { color: barColor }]}>{payRate}% hoàn thành</Text>
          </View>
        </View>

        <View style={s.segBg}>
          {stats.paidCount > 0 && (
            <View style={[s.segPart, {
              width: `${(stats.paidCount / Math.max(1, stats.total)) * 100}%` as any,
              backgroundColor: Colors.success,
            }]} />
          )}
          {stats.unpaidCount - stats.overdueCount > 0 && (
            <View style={[s.segPart, {
              width: `${((stats.unpaidCount - stats.overdueCount) / Math.max(1, stats.total)) * 100}%` as any,
              backgroundColor: Colors.warning,
            }]} />
          )}
          {stats.overdueCount > 0 && (
            <View style={[s.segPart, {
              width: `${(stats.overdueCount / Math.max(1, stats.total)) * 100}%` as any,
              backgroundColor: Colors.error,
            }]} />
          )}
        </View>

        <View style={s.heroStats}>
          {([
            { key: 'paid' as const, num: stats.paidCount, label: 'Đã thu', color: Colors.success },
            { key: 'pending' as const, num: stats.unpaidCount - stats.overdueCount, label: 'Chưa thu', color: Colors.warning },
            { key: 'overdue' as const, num: stats.overdueCount, label: 'Quá hạn', color: Colors.error },
          ]).map(st => {
            const on = filter === st.key;
            return (
              <TouchableOpacity
                key={st.key}
                style={[s.heroStat, on && { backgroundColor: st.color + '14', borderColor: st.color + '55' }]}
                onPress={() => setFilter(on ? 'all' : st.key)}
                activeOpacity={0.7}
              >
                <View style={[s.heroDot, { backgroundColor: st.num > 0 ? st.color : Colors.textMuted }]} />
                <Text style={[s.heroStatNum, { color: st.num > 0 ? st.color : Colors.textMuted }]}>{st.num}</Text>
                <Text style={s.heroStatLbl}>{st.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Search ───────────────────────────────────────────────── */}
      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm theo tên, phòng, mã hóa đơn..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Lọc theo KỲ ──────────────────────────────────────────
          Chỉ hiện khi có từ 2 kỳ trở lên — một kỳ thì hàng chip này thừa. */}
      {periods.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.filterScroll} contentContainerStyle={s.filterContent}>
          <TouchableOpacity
            style={[s.filterChip, periodFilter === 'all' && s.filterChipActive]}
            onPress={() => setPeriodFilter('all')}
          >
            <Text style={[s.filterText, periodFilter === 'all' && s.filterTextActive]}>Mọi kỳ</Text>
          </TouchableOpacity>
          {periods.map(p => {
            const [y, m] = p.split('-');
            return (
              <TouchableOpacity
                key={p}
                style={[s.filterChip, periodFilter === p && s.filterChipActive]}
                onPress={() => setPeriodFilter(p)}
              >
                <Text style={[s.filterText, periodFilter === p && s.filterTextActive]}>{m}/{y}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Filter chips ─────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[s.filterChip, filter === f.id && s.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[s.filterText, filter === f.id && s.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Bill list ────────────────────────────────────────────── */}
      {loading ? (
        <View style={s.emptyState}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={i => String(i.id)}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={s.monthBar}>
              <Text style={s.monthTitle}>Kỳ {section.title}</Text>
              <View style={s.monthBadges}>
                {section.overdue > 0 && (
                  <View style={[s.monthPill, { backgroundColor: Colors.errorLight }]}>
                    <Text style={[s.monthPillText, { color: Colors.error }]}>{section.overdue} quá hạn</Text>
                  </View>
                )}
                <View style={[s.monthPill, { backgroundColor: section.paid === section.data.length ? Colors.successLight : Colors.white }]}>
                  <Text style={[s.monthPillText, { color: section.paid === section.data.length ? Colors.success : Colors.textSecondary }]}>
                    {section.paid === section.data.length ? `✓ đã thu đủ ${section.data.length}` : `đã thu ${section.paid}/${section.data.length}`}
                  </Text>
                </View>
              </View>
            </View>
          )}
          renderItem={({ item }) => {
            const st  = toLocalStatus(item.status);
            const cfg = STATUS_CONFIG[st];
            return (
              <TouchableOpacity
                style={[s.billCard, st === 'overdue' && s.billCardOverdue]}
                onPress={() => setSelectedBill(item)}
                activeOpacity={0.8}
              >
                <View style={s.billCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.billCode}>{item.code}</Text>
                    <Text style={s.billRoom}>{isWholeHouse(item) ? 'Nhà nguyên căn' : `Phòng ${item.roomNumber}`}</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={s.statusIcon}>{cfg.icon}</Text>
                    <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <View style={s.billTenantRow}>
                  <Text style={s.billTenant}>👤 {item.tenantName || '—'}</Text>
                  <Text style={s.billMonth}>{billMonthLabel(item) ?? '—'}</Text>
                </View>
                <View style={s.billAmountRow}>
                  <Text style={s.billDue}>Hạn: {item.dueDate}</Text>
                  {/* Không hiện số tiền thuê — xem @/constants/managerVisibility. */}
                  <Text style={[s.billTotal, st === 'overdue' && { color: Colors.error }]}>
                    {st === 'paid' ? '✓ Đã thanh toán' : st === 'overdue' ? 'Quá hạn' : 'Chưa thanh toán'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={{ fontSize: 40 }}>🏠</Text>
              <Text style={s.emptyText}>Chưa có hóa đơn tiền nhà</Text>
            </View>
          }
        />
      )}

      {/* ── Bill Detail Modal ─────────────────────────────────────── */}
      {selectedBill && !showCashModal && !showEwalletModal && (() => {
        const st  = toLocalStatus(selectedBill.status);
        const cfg = STATUS_CONFIG[st];
        return (
          <Modal transparent animationType="slide">
            <View style={s.modalOverlay}>
              <View style={s.billDetailSheet}>
                <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                  contentContainerStyle={s.billDetailContent}>
                  <View style={s.modalHeader}>
                    <Text style={s.modalTitle}>{selectedBill.code}</Text>
                    <TouchableOpacity onPress={() => setSelectedBill(null)}>
                      <Text style={s.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[s.statusBannerFull, { backgroundColor: cfg.bg }]}>
                    <Text style={s.statusBannerIcon}>{cfg.icon}</Text>
                    <Text style={[s.statusBannerText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>

                  <View style={s.detailSection}>
                    {[
                      { label: isWholeHouse(selectedBill) ? 'Người đại diện' : 'Khách thuê', val: selectedBill.tenantName || '—' },
                      { label: isWholeHouse(selectedBill) ? 'Tài sản thuê' : 'Phòng', val: isWholeHouse(selectedBill) ? selectedBill.propertyName : `Phòng ${selectedBill.roomNumber}` },
                      { label: 'Tháng', val: billMonthLabel(selectedBill) ?? '—' },
                      { label: 'Hạn thanh toán', val: selectedBill.dueDate, overdue: st === 'overdue' },
                    ].map((row, i) => (
                      <View key={i} style={s.detailRow}>
                        <Text style={s.detailLabel}>{row.label}</Text>
                        <Text style={[s.detailVal, row.overdue && { color: Colors.error }]}>{row.val}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Số tiền thuê do hệ thống thu thẳng của khách — manager chỉ theo dõi
                      đã/chưa thanh toán (xem @/constants/managerVisibility). */}
                  <View style={s.totalRowCompact}>
                    <Text style={s.totalLabel}>TIỀN NHÀ</Text>
                    <Text style={[s.totalAmount, { fontSize: 16, color: st === 'paid' ? Colors.success : Colors.warning }]}>
                      {st === 'paid' ? '✓ Khách đã thanh toán' : 'Khách chưa thanh toán'}
                    </Text>
                  </View>
                  <Text style={s.hiddenAmountNote}>{RENT_AMOUNT_HIDDEN_NOTE}</Text>

                  {st !== 'paid' && st !== 'cancelled' && (
                    <View style={s.paymentActions}>
                      <Text style={s.paymentActionsTitle}>Ghi nhận thanh toán</Text>
                      {/* Đã bỏ nút "Hiện QR cho khách quét": QR do FE tự ghép URL
                          img.vietqr.io từ `invoice.amount`, mà từ BE commit a52c370
                          `amount` là NULL với tài khoản quản lý → mã QR sinh ra sai số
                          tiền. Khách tự thanh toán trong app của mình (PayOS); ở đây
                          quản lý chỉ GHI NHẬN khoản đã nhận ngoài luồng app.
                          Muốn có lại QR thì BE phải trả `payosQrCode` trong
                          ManagerInvoiceResponse — xem docs/BE-NEED-*-2026-08-08.md. */}
                      <Text style={s.paymentActionsHint}>
                        Khách thuê thanh toán trong app của mình. Chỉ dùng các nút dưới khi
                        khách trả trực tiếp cho bạn.
                      </Text>
                      <View style={s.payAltRow}>
                        <TouchableOpacity style={s.payAltBtn} onPress={() => setShowCashModal(true)}>
                          <Text style={s.payAltIcon}>💵</Text>
                          <Text style={s.payAltText}>Tiền mặt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.payAltBtn} onPress={() => setShowEwalletModal(true)}>
                          <Text style={s.payAltIcon}>👛</Text>
                          <Text style={s.payAltText}>Ví điện tử</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.payAltBtn} disabled={submitting} onPress={() => recordPaid('BANK_TRANSFER')}>
                          <Text style={s.payAltIcon}>🏦</Text>
                          <Text style={s.payAltText}>CK ngân hàng</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Hoá đơn quá hạn → mở đường sang chỗ chấm dứt hợp đồng.
                      KHÔNG gọi terminateContract ngay tại đây: ManagerInvoice không
                      mang `contractId` — màn "Tiền phòng tự động" mới có đủ dữ liệu
                      hợp đồng để chốt đúng. */}
                  {st === 'overdue' && (() => {
                    const late = lateDays(selectedBill);
                    // Chỉ MỜI chấm dứt khi thật sự đã đủ điều kiện — dùng cùng luật với
                    // màn "Tiền phòng tự động". Trước đây chỉ xét nhãn OVERDUE nên bấm
                    // sang bên kia thì không có nút nào để bấm tiếp.
                    // Hợp đồng đã thanh lý rồi thì không còn gì để chấm dứt nữa — BE
                    // vẫn giữ hoá đơn ở trạng thái OVERDUE nên phải tự kiểm tra, không
                    // thì nút vẫn hiện và bấm vào chỉ báo "không tìm được hợp đồng".
                    const contract = contractOf(selectedBill);
                    const canTerminate = !!contract && canTerminateInvoice(selectedBill);
                    const graceLeft = RENT_TERMINATION_AFTER_DAYS - late;
                    return (
                      <View style={[s.terminateBox, !canTerminate && s.terminateBoxSoft]}>
                        <Text style={[s.terminateTitle, !canTerminate && s.terminateTitleSoft]}>
                          {!contract
                            ? 'Hợp đồng đã chấm dứt'
                            : canTerminate ? 'Khách không thanh toán?' : 'Đang quá hạn — chưa được chấm dứt'}
                        </Text>
                        <Text style={[s.terminateHint, !canTerminate && s.terminateTitleSoft]}>
                          {!contract
                            ? 'Hợp đồng của khách này đã được thanh lý. Hoá đơn còn nợ vẫn giữ lại để đối soát; phần tiền cọc và bàn giao xử lý ở mục Trả phòng.'
                            : canTerminate
                              ? `Đã quá hạn ${late} ngày và đã nhắc đủ các mốc. Bạn được quyền chấm dứt hợp đồng thuê.`
                              : graceLeft <= 1
                                ? 'Hôm nay là ngày cuối trong hạn. Hết hôm nay mà khách chưa trả thì từ ngày mai bạn được quyền chấm dứt hợp đồng.'
                                : `Hệ thống vẫn đang nhắc khách mỗi ngày. Còn ${graceLeft} ngày nữa, nếu vẫn chưa thu được thì bạn được quyền chấm dứt hợp đồng.`}
                        </Text>
                        {!contract && (
                          <TouchableOpacity
                            style={s.terminateBtn}
                            activeOpacity={0.8}
                            onPress={() => { setSelectedBill(null); navigation.navigate('CheckoutRequests'); }}
                          >
                            <Text style={s.terminateBtnText}>🚪  Sang mục Trả phòng  →</Text>
                          </TouchableOpacity>
                        )}
                        {canTerminate && (
                          <TouchableOpacity
                            style={s.terminateBtn}
                            activeOpacity={0.8}
                            disabled={terminating}
                            onPress={() => confirmTerminate(selectedBill)}
                          >
                            <Text style={s.terminateBtnText}>{terminating ? "Đang xử lý…" : "⛔  Chấm dứt hợp đồng"}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}

                  {st === 'paid' && (
                    <View style={s.paidInfo}>
                      <Text style={s.paidInfoText}>✅ Hóa đơn đã được thanh toán.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}


      {/* ── Cash Modal ───────────────────────────────────────────── */}
      {showCashModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>💵 Ghi nhận tiền mặt</Text>
              {/* ⚠️ Không hiện số tiền cần thu (@/constants/managerVisibility) — manager
                  phải đối chiếu số trên app của khách trước khi bấm xác nhận. */}
              <View style={s.cashAmountBox}>
                <Text style={s.cashAmountLabel}>Hoá đơn</Text>
                <Text style={[s.cashAmount, { fontSize: 18 }]}>{selectedBill.code}</Text>
              </View>
              <Text style={s.cashHint}>
                Số tiền hiển thị trên app của khách thuê. Đối chiếu đúng số đó rồi mới xác nhận.
              </Text>
              <TextInput
                style={s.cashNoteInput}
                placeholder="Ghi chú (tùy chọn)..."
                value={cashNote}
                onChangeText={setCashNote}
                multiline
              />
              <TouchableOpacity style={s.confirmPayBtn} disabled={submitting} onPress={() => recordPaid('CASH', cashNote)}>
                <Text style={s.confirmPayBtnText}>✅ Xác nhận đã thu tiền mặt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowCashModal(false); setCashNote(''); }}>
                <Text style={s.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── E-wallet Modal ───────────────────────────────────────── */}
      {showEwalletModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>👛 Ví điện tử</Text>
              <View style={s.cashAmountBox}>
                <Text style={s.cashAmountLabel}>Hoá đơn</Text>
                <Text style={[s.cashAmount, { fontSize: 18 }]}>{selectedBill.code}</Text>
              </View>
              <Text style={s.cashHint}>Chọn ví điện tử khách đã thanh toán:</Text>
              {['MoMo', 'ZaloPay', 'VNPay', 'Ví khác'].map(wallet => (
                <TouchableOpacity key={wallet} style={s.ewalletOption} disabled={submitting} onPress={() => recordPaid('EWALLET', wallet)}>
                  <Text style={s.ewalletOptionText}>👛 {wallet}</Text>
                  <Text style={s.ewalletOptionArrow}>→</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEwalletModal(false)}>
                <Text style={s.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white,
  },
  backBtn:   { padding: 4 },
  backIcon:  { fontSize: 30, color: Colors.primary, fontWeight: '300', lineHeight: 34 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  summaryCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.base, marginTop: Spacing.md,
    borderRadius: BorderRadius.xl, padding: Spacing.base,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },


  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    ...Shadow.sm, marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon:  { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  searchClear: { fontSize: 14, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  filterScroll:     { flexGrow: 0, marginBottom: Spacing.md },
  filterContent:    { paddingHorizontal: Spacing.base, paddingBottom: 4, gap: Spacing.sm },
  filterChip:       {
    height: 30, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.base, paddingTop: 4, paddingBottom: 100 },

  billCard:        {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  billCardOverdue:  { borderColor: Colors.error + '50', borderWidth: 1.5 },
  billCardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  billCode:         { fontSize: 14, fontWeight: '700', color: Colors.primary },
  billRoom:         { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, gap: 4 },
  statusIcon:       { fontSize: 11 },
  statusText:       { fontSize: 11, fontWeight: '700' },
  billTenantRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  billTenant:       { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  billMonth:        { fontSize: 12, color: Colors.textMuted },
  billAmountRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  billDue:          { fontSize: 12, color: Colors.textSecondary },
  billTotal:        { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText:  { fontSize: 14, color: Colors.textMuted },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:    {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40,
  },
  billDetailSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, maxHeight: SCREEN_HEIGHT * 0.92,
  },
  billDetailContent: { padding: Spacing.xl, paddingBottom: 40 },
  modalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle:        { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalClose:        { fontSize: 20, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  statusBannerFull: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg,
  },
  statusBannerIcon: { fontSize: 22 },
  statusBannerText: { fontSize: 16, fontWeight: '700' },

  detailSection: { marginBottom: Spacing.md },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider },
  detailLabel:   { fontSize: 14, color: Colors.textSecondary },
  detailVal:     { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },

  totalRowCompact: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.lg,
  },
  totalLabel:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  totalAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  hiddenAmountNote: {
    fontSize: 11.5, color: Colors.textMuted, lineHeight: 16,
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },

  paymentActions:      { marginBottom: Spacing.md },
  paymentActionsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  paymentActionsHint: {
    fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginBottom: Spacing.md,
  },
  payAltRow:    { flexDirection: 'row', gap: Spacing.sm },
  payAltBtn:    {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  payAltIcon: { fontSize: 20, marginBottom: 4 },
  payAltText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

  paidInfo:     { backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.md },
  paidInfoText: { fontSize: 14, color: Colors.success, lineHeight: 22, fontWeight: '500' },

  confirmPayBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  confirmPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  cashAmountBox:   {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md,
  },
  cashAmountLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  cashAmount:      { fontSize: 28, fontWeight: '800', color: Colors.primary },
  cashHint:        { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 18 },
  cashNoteInput:   {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, marginBottom: Spacing.lg, minHeight: 80,
  },
  cancelBtn:     { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },

  ewalletOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 14, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  ewalletOptionText:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  ewalletOptionArrow: { fontSize: 16, color: Colors.textMuted },
  heroFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  heroAmount: { fontSize: 38, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1 },
  heroSlash: { fontSize: 20, fontWeight: '800', color: Colors.textMuted },
  heroFigureText: { marginLeft: Spacing.sm, flex: 1 },
  heroUnit: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  heroRate: { fontSize: 11.5, fontWeight: '800', marginTop: 1 },
  segBg: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: Colors.divider, marginTop: Spacing.md, gap: 2,
  },
  segPart: { height: '100%' },
  heroStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  heroStat: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: Colors.background,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  heroStatNum: { fontSize: 18, fontWeight: '900' },
  heroStatLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    marginTop: Spacing.sm, marginBottom: Spacing.xs,
  },
  monthTitle: { fontSize: 11.5, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase' },
  monthBadges: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  monthPill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  monthPillText: { fontSize: 10, fontWeight: '800' },
  terminateBox: {
    marginTop: Spacing.base, padding: Spacing.base,
    borderRadius: BorderRadius.lg, backgroundColor: '#FEF2F2',
    borderWidth: 1, borderColor: '#FECACA',
  },
  terminateTitle: { fontSize: 13.5, fontWeight: '800', color: '#B91C1C' },
  terminateHint: { fontSize: 11.5, color: '#B91C1C', marginTop: 3, lineHeight: 17, opacity: 0.85 },
  terminateBtn: {
    marginTop: Spacing.md, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error, alignItems: 'center',
  },
  terminateBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },
  terminateBoxSoft: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  terminateTitleSoft: { color: '#B45309' },
});
