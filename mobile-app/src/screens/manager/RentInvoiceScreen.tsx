import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
} from 'react-native';
import { showAlert, normalizeVi } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  RENT_CYCLE, RENT_POLICY_SHORT, RENT_POLICY_FULL, RENT_PARTIAL_CYCLE_NOTE, RENT_REMINDER_STEPS,
  RENT_TERMINATION_AFTER_DAYS,
  toMonthKey, shiftMonthKey, monthLabel, rentIssueDate, rentDueDate,
  daysOverdue, overdueStage, canTerminateForUnpaidRent, partialRentCycle,
} from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, RentInvoiceLite } from '@/services/manager/invoiceService';
import { checkoutService } from '@/services/manager/checkoutService';
import { todayIso } from '@/utils/serverTime';

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtDay = (iso: string) => iso.split('-').reverse().join('/');

interface PropItem { id: number; name: string; wholeHouse: boolean }
interface RentRow {
  key: string;
  contractId: number;
  roomId?: number;
  roomNumber?: string | null;
  tenantName: string;
  rentAmount: number;
  startDate: string;
  /** Ngày kết thúc HĐ — có giá trị giữa tháng nghĩa là kỳ cuối (trả phòng giữa tháng). */
  endDate?: string;
  /** Hoá đơn tiền phòng của kỳ này (nếu đã phát hành). */
  invoice?: RentInvoiceLite;
}

/**
 * TIỀN PHÒNG TỰ ĐỘNG — màn này chỉ THEO DÕI, manager KHÔNG gửi hoá đơn tay nữa.
 *
 * BE chạy cron: phát hành 00:05 ngày 1 (có prorate cho HĐ vào giữa tháng), nhắc khách
 * ngày 28 · 2–5 · 7, ngày 8 báo quản lý được quyền chấm dứt hợp đồng.
 * FE chỉ đọc kết quả và cho bấm chấm dứt khi đủ điều kiện.
 * Điện/nước không thuộc chu kỳ này (vẫn ghi chỉ số & gửi tay ở màn riêng).
 */
export const RentInvoiceScreen: React.FC<any> = ({ navigation, route }) => {
  const [props, setProps] = useState<PropItem[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  /**
   * Mở kèm `propertyId` (vd bấm "Xử lý chấm dứt hợp đồng" từ ô chi tiết hoá đơn) thì
   * chọn sẵn đúng nhà đó — trước đây màn này bỏ qua route.params nên rơi về danh sách
   * chọn nhà trống, người dùng phải tự mò lại từ đầu.
   */
  const paramPropertyId: number | null = route?.params?.propertyId != null
    ? Number(route.params.propertyId) : null;
  const [selectedId, setSelectedId] = useState<number | null>(paramPropertyId);
  const [month, setMonth] = useState(() => toMonthKey());
  const [rows, setRows] = useState<RentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [terminatingId, setTerminatingId] = useState<number | null>(null);
  /** Banner chính sách mặc định thu gọn — xem chú thích chỗ render. */
  const [policyOpen, setPolicyOpen] = useState(false);
  /** Lọc danh sách nhà — manager phụ trách nhiều khu vực thì danh sách này khá dài. */
  const [search, setSearch] = useState('');

  const loadProps = useCallback(async () => {
    try {
      setErrorProps(null);
      const scoped = await managerPropertyService.getScopedProperties();
      setProps(scoped.map(p => ({ id: p.id, name: p.propertyName, wholeHouse: p.wholeHouse === true })));
    } catch (e: any) {
      setErrorProps(e?.response?.data?.message || e?.message || 'Không tải được danh sách tòa nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    loadProps();
    // Vào kèm propertyId thì nạp luôn danh sách khách của nhà đó, khỏi bắt bấm thêm.
    if (paramPropertyId != null) loadRows(paramPropertyId, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProps, paramPropertyId]));

  const loadRows = useCallback(async (propId: number, m: string, silent = false) => {
    if (!silent) setLoadingRows(true);
    try {
      // HĐ đang hiệu lực + hoá đơn tiền phòng đã phát hành cho kỳ này.
      const [contracts, existing] = await Promise.all([
        realTenantService.listByProperty(propId),
        realManagerInvoiceService.listRentInvoices(propId, m).catch(() => [] as RentInvoiceLite[]),
      ]);
      const active = contracts.filter((c: TenantContractResponse) => (c.status || '').toUpperCase() === 'ACTIVE');
      setRows(active.map(c => ({
        key: String(c.id),
        contractId: c.id,
        roomId: c.roomId ?? undefined,
        roomNumber: c.roomNumber,
        tenantName: c.tenantFullName,
        rentAmount: c.rentAmount ?? 0,
        startDate: c.startDate || c.moveInDate || '',
        endDate: c.endDate ?? undefined,
        // Ghép hoá đơn theo contractId, fallback theo số phòng.
        invoice: existing.find(inv =>
          (inv.contractId != null && inv.contractId === c.id) ||
          (inv.roomNumber != null && inv.roomNumber === c.roomNumber),
        ),
      })));
    } catch {
      setRows([]);
    } finally {
      if (!silent) setLoadingRows(false);
    }
  }, []);

  /**
   * Khách trả tiền phòng → BE bắn `INVOICE_PAID` → nạp lại bảng của toà đang xem.
   * Nạp im lặng (`silent`) để không nháy spinner giữa lúc quản lý đang thao tác.
   * Lọc theo `propertyId` khi event có: hoá đơn của toà khác thì bảng này không đổi gì.
   */
  useBillingRealtime((event) => {
    if (event.event !== 'INVOICE_PAID' || selectedId == null) return;
    if (event.propertyId != null && event.propertyId !== selectedId) return;
    loadRows(selectedId, month, true);
  });

  const onSelect = (id: number) => { setSelectedId(id); loadRows(id, month); };
  const shiftMonth = (delta: number) => {
    const nm = shiftMonthKey(month, delta);
    setMonth(nm);
    if (selectedId != null) loadRows(selectedId, nm);
  };

  const isCurrentMonth = month === toMonthKey();

  const cycle = useMemo(() => {
    const issued = rows.filter(r => r.invoice);
    const overdue = issued.filter(r => {
      const st = (r.invoice?.status || '').toUpperCase();
      if (st === 'PAID' || st === 'CANCELLED') return false;
      return daysOverdue(r.invoice?.dueDate || rentDueDate(month)) > 0;
    });
    const atRisk = overdue.filter(r =>
      canTerminateForUnpaidRent(r.invoice?.dueDate || rentDueDate(month), r.invoice?.status));
    const paid = issued.filter(r => (r.invoice?.status || '').toUpperCase() === 'PAID').length;
    return {
      total: rows.length,
      issued: issued.length,
      missing: rows.length - issued.length,
      paid,
      overdue: overdue.length,
      atRisk: atRisk.length,
      settled: rows.length > 0 && paid === rows.length,
    };
  }, [rows, month]);

  /** Chấm dứt hợp đồng vì không thanh toán — chỉ mở sau ngày nhắc cuối. */
  const confirmTerminate = (row: RentRow) => {
    const od = daysOverdue(row.invoice?.dueDate || rentDueDate(month));
    showAlert(
      'Chấm dứt hợp đồng?',
      `${row.tenantName} — ${row.roomNumber ? `phòng ${row.roomNumber}` : 'nhà nguyên căn'} đã quá hạn tiền phòng ${od} ngày `
      + `và đã được nhắc lần cuối ngày ${RENT_CYCLE.finalReminderDay}.\n\n`
      + 'Chấm dứt sẽ THANH LÝ hợp đồng: khách mất quyền truy cập nhà/phòng trong app, phòng trở về trạng thái trống. '
      + 'Hành động này không đảo ngược được.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Chấm dứt hợp đồng',
          style: 'destructive',
          onPress: async () => {
            setTerminatingId(row.contractId);
            try {
              // type VIOLATION: BE chỉ cho khi thật sự có hoá đơn tiền phòng quá hạn
              // > 3 ngày — đúng điều kiện nút này đang mở.
              await realTenantService.terminateContract(row.contractId, {
                type: 'VIOLATION',
                reason: `Không thanh toán tiền phòng ${monthLabel(month).toLowerCase()} — quá hạn ${od} ngày, đã nhắc đủ các mốc theo chính sách.`,
              });
              /**
                * Chấm dứt xong PHẢI mở luôn thủ tục trả phòng: kiểm kê thiết bị, chốt
                * số điện nước, tất toán cọc. Bỏ bước này là mất tiền thật (cọc không
                * được trừ nợ, điện nước những ngày cuối không thu).
                * BE đã có POST /checkout-requests cho MANAGER nên tạo được ngay.
                */
              let checkoutId: number | null = null;
              try {
                const req = await checkoutService.createForTenant({
                  contractId: row.contractId,
                  expectedMoveOutDate: todayIso(),
                  reason: `Chấm dứt hợp đồng do không thanh toán tiền phòng ${monthLabel(month).toLowerCase()} (quá hạn ${od} ngày).`,
                });
                checkoutId = req?.id ?? null;
              } catch { /* tạo hụt thì vẫn báo thành công phần chấm dứt, xem ghi chú dưới */ }

              if (selectedId != null) await loadRows(selectedId, month, true);

              showAlert(
                'Đã chấm dứt hợp đồng',
                checkoutId
                  ? 'Đã mở yêu cầu trả phòng cho khách này. Sang đó để kiểm kê thiết bị, chốt số điện nước và tất toán tiền cọc.'
                  : 'Hợp đồng đã thanh lý, nhưng CHƯA mở được yêu cầu trả phòng. Bạn vào mục Trả phòng tạo thủ công để còn tất toán cọc.',
                [
                  { text: 'Để sau', style: 'cancel' },
                  {
                    text: checkoutId ? 'Xử lý trả phòng' : 'Mở mục Trả phòng',
                    onPress: () => navigation.navigate('CheckoutRequests'),
                  },
                ],
              );
            } catch (e: any) {
              showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không chấm dứt được hợp đồng.');
            } finally {
              setTerminatingId(null);
            }
          },
        },
      ],
    );
  };

  // Tìm không dấu: "nguyen can" khớp "NGUYEN_CAN", "mtx06" khớp "MTX#06".
  const filteredProps = useMemo(() => {
    const kw = normalizeVi(search.trim()).replace(/[^a-z0-9]/g, '');
    if (!kw) return props;
    return props.filter(p => normalizeVi(p.name).replace(/[^a-z0-9]/g, '').includes(kw));
  }, [props, search]);

  const multi = filteredProps.filter(p => !p.wholeHouse);
  const whole = filteredProps.filter(p => p.wholeHouse);

  /**
   * Một dòng MỘT HÀNG. Bản trước có thêm dòng phụ "Nhà nguyên căn" / "Nhà nhiều phòng" —
   * lặp lại y hệt tiêu đề nhóm ngay phía trên, tốn gấp đôi chiều cao mà không thêm thông tin.
   */
  const renderPropRow = (p: PropItem) => {
    const active = selectedId === p.id;
    return (
      <TouchableOpacity
        key={p.id}
        style={[s.propRow, active && s.propRowActive]}
        onPress={() => onSelect(p.id)}
        activeOpacity={0.7}
      >
        <Text style={[s.propName, active && s.propNameActive]} numberOfLines={1}>{p.name}</Text>
        <Text style={[s.propChevron, active && s.propCheck]}>{active ? '✓' : '›'}</Text>
      </TouchableOpacity>
    );
  };

  const renderRow = (row: RentRow) => {
    const inv = row.invoice;
    const status = (inv?.status || '').toUpperCase();
    const paid = status === 'PAID';
    // Kỳ lẻ: khách vào giữa tháng (kỳ đầu) hoặc trả phòng giữa tháng (kỳ cuối).
    // Kỳ đầu chỉ còn ý nghĩa "tiền chia theo ngày ở" để manager đối chiếu — tiền đó đã
    // thu chung với cọc ở mã QR lúc đón khách, nên KHÔNG có mốc nhắc/quá hạn riêng nữa.
    const partial = partialRentCycle(month, row.rentAmount, row.startDate, row.endDate);
    const due = inv?.dueDate || rentDueDate(month);
    const unpaid = !!inv && !paid && status !== 'CANCELLED';
    const od = unpaid ? daysOverdue(due) : 0;
    const stage = overdueStage(od);
    const canTerminate = unpaid && canTerminateForUnpaidRent(due, status);
    /**
     * Tháng khách mới dọn vào thì BE KHÔNG phát hoá đơn tiền phòng riêng — phần tiền
     * của tháng đó đã nằm trong mã QR lúc đón khách. Không có `inv` ở đây là ĐÚNG, nên
     * đừng để nhãn "Chờ phát hành" làm manager tưởng còn khoản phải đòi.
     */
    const collectedAtOnboarding = !inv && partial?.kind === 'first';

    return (
      <View key={row.key} style={[s.card, paid && s.cardPaid, canTerminate && s.cardRisk]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.roomCode}>{row.roomNumber ? `Phòng ${row.roomNumber}` : 'Nhà nguyên căn'}</Text>
            <Text style={s.tenant}>{row.tenantName}</Text>
          </View>
          <View style={[
            s.badge,
            paid || collectedAtOnboarding
              ? s.badgePaid
              : inv ? (od > 0 ? s.badgeOverdue : s.badgeIssued) : s.badgeMissing,
          ]}>
            <Text style={[s.badgeText, { color: inv || collectedAtOnboarding ? Colors.white : Colors.textMuted }]}>
              {collectedAtOnboarding
                ? '✓ Đã thu lúc đón khách'
                : paid ? '✓ Đã thu' : inv ? (od > 0 ? `Quá hạn ${od} ngày` : '✓ Đã phát hành') : 'Chờ phát hành'}
            </Text>
          </View>
        </View>

        {!collectedAtOnboarding && (
          <Text style={s.due}>
            Hạn nộp: {fmtDay(due)}
            {inv ? (inv.autoIssued === false ? ' · phát hành thủ công (kỳ cũ)' : ' · tự động') : ''}
          </Text>
        )}

        {stage === 'final' && !canTerminate && (
          <View style={s.warnBox}>
            <Text style={s.warnBoxText}>
              ⏰ Quá hạn {od} ngày — khách đã được nhắc. Ngày {RENT_CYCLE.finalReminderDay} nhắc lần cuối.
            </Text>
          </View>
        )}
        {canTerminate && (
          <View style={s.riskBox}>
            <Text style={s.riskText}>
              ⛔ Quá hạn {od} ngày, đã nhắc đủ các mốc — bạn được quyền chấm dứt hợp đồng.
            </Text>
          </View>
        )}
        {/* Kỳ lẻ: nói rõ tính từ ngày nào tới ngày nào + số tiền theo ngày, để manager
            đối chiếu ngay với hoá đơn BE phát hành thay vì phải bấm máy tính. */}
        {!!partial && (
          <View style={s.partialBox}>
            <Text style={s.partialTitle}>{partial.label}</Text>
            <Text style={s.partialText}>
              {partial.kind === 'first'
                ? `Khách nhận phòng ${fmtDay(row.startDate)} — phần tiền này đã thu chung với tiền cọc ở mã QR lúc đón khách, không phát hoá đơn riêng.`
                : `Rời phòng ${fmtDay(row.endDate || '')} — hoá đơn kỳ cuối gửi khách khi duyệt trả phòng.`}
              {' '}Hệ thống tính tiền theo số ngày ở rồi thu trực tiếp của khách.
            </Text>
          </View>
        )}

        <View style={s.amountRow}>
          {/* Không hiện số tiền thuê — xem @/constants/managerVisibility. */}
          <Text style={[s.amount, {
            fontSize: 14,
            color: paid || collectedAtOnboarding ? Colors.success : Colors.textSecondary,
          }]}>
            {collectedAtOnboarding
              ? '✓ Khách đã trả lúc đón khách'
              : paid ? '✓ Khách đã thanh toán' : inv ? 'Khách chưa thanh toán' : 'Chờ phát hành'}
          </Text>
          {canTerminate && (
            <TouchableOpacity
              style={[s.terminateBtn, terminatingId === row.contractId && s.btnDisabled]}
              onPress={() => confirmTerminate(row)}
              disabled={terminatingId === row.contractId}
            >
              {terminatingId === row.contractId
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={s.terminateBtnText}>⛔ Chấm dứt hợp đồng</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerSide}>
          <Text style={s.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Tiền phòng tự động</Text>
        <View style={s.headerSide} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Chính sách chu kỳ ──
            Thu gọn còn ĐÚNG MỘT DÒNG. Bản trước tuy đã gọi là "thu gọn" nhưng vẫn gồm
            tiêu đề + dòng tóm tắt + dải 6 chip mốc nhắc, chiếm gần 1/3 màn và chip thì
            bị cắt cụt chữ. Dải mốc là thông tin tra cứu, không phải thứ cần thấy mỗi lần
            mở màn — đẩy hết vào phần "Chi tiết". */}
        <View style={s.policyBox}>
          <TouchableOpacity
            style={s.policyHead}
            onPress={() => setPolicyOpen(o => !o)}
            activeOpacity={0.7}
          >
            <Text style={s.policyTitle} numberOfLines={1}>
              🤖 Tự động · {RENT_POLICY_SHORT}
            </Text>
            <Text style={s.policyToggle}>{policyOpen ? 'Thu gọn ▴' : 'Chi tiết ▾'}</Text>
          </TouchableOpacity>

          {policyOpen && (
            <View style={s.policyDetail}>
              {/* Dải mốc nhắc — xuống dòng tự nhiên thay vì cuộn ngang, ở đây có chỗ rộng */}
              <View style={s.reminderRow}>
                {RENT_REMINDER_STEPS.map(r => (
                  <View key={r.day} style={s.reminderChip}>
                    <Text style={s.reminderChipDay}>{r.day}</Text>
                    <Text style={s.reminderChipText}>{r.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[s.policyText, { marginTop: Spacing.sm }]}>{RENT_POLICY_FULL}</Text>
              <Text style={[s.policyText, { marginTop: 6 }]}>{RENT_PARTIAL_CYCLE_NOTE}</Text>
            </View>
          )}
        </View>

        {/* ── Chọn nhà: tiêu đề + ô tìm gộp một hàng, đỡ tốn thêm một dòng ── */}
        <View style={s.pickHead}>
          <Text style={s.sectionTitle}>Chọn tòa nhà / căn hộ</Text>
          {props.length > 0 && <Text style={s.pickCount}>{filteredProps.length}/{props.length}</Text>}
        </View>

        {props.length > 0 && (
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm tòa nhà / căn hộ..."
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Text style={s.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loadingProps ? (
          <View style={s.state}><ActivityIndicator color={Colors.primary} /><Text style={s.stateText}>Đang tải...</Text></View>
        ) : errorProps ? (
          <View style={s.state}>
            <Text style={s.stateEmoji}>⚠️</Text>
            <Text style={s.stateText}>{errorProps}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoadingProps(true); loadProps(); }}>
              <Text style={s.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : props.length === 0 ? (
          <View style={s.state}><Text style={s.stateEmoji}>🏢</Text><Text style={s.stateText}>Chưa có tòa nhà được giao</Text></View>
        ) : filteredProps.length === 0 ? (
          <View style={s.state}>
            <Text style={s.stateEmoji}>🔍</Text>
            <Text style={s.stateText}>Không có tòa nhà nào khớp “{search}”</Text>
          </View>
        ) : (
          <>
            {multi.length > 0 && <Text style={s.groupLabel}>🏢 Nhà nhiều phòng</Text>}
            {multi.map(renderPropRow)}
            {whole.length > 0 && <Text style={[s.groupLabel, multi.length > 0 && { marginTop: Spacing.md }]}>🏠 Nhà nguyên căn</Text>}
            {whole.map(renderPropRow)}
          </>
        )}

        {selectedId != null && (
          <>
            <View style={s.monthRow}>
              <TouchableOpacity style={s.monthBtn} onPress={() => shiftMonth(-1)}><Text style={s.monthBtnText}>‹</Text></TouchableOpacity>
              <Text style={s.monthLabel}>Kỳ thu: {monthLabel(month)}</Text>
              <TouchableOpacity style={s.monthBtn} onPress={() => shiftMonth(1)}><Text style={s.monthBtnText}>›</Text></TouchableOpacity>
            </View>

            {loadingRows ? (
              <View style={s.state}><ActivityIndicator color={Colors.primary} /></View>
            ) : rows.length === 0 ? (
              <View style={s.state}><Text style={s.stateEmoji}>🏠</Text><Text style={s.stateText}>Chưa có hợp đồng đang hiệu lực để thu tiền phòng.</Text></View>
            ) : (
              <>
                {/* ── Tình trạng chu kỳ ── */}
                <View style={s.cycleCard}>
                  <View style={s.cycleTop}>
                    <Text style={s.cycleTitle}>Đã phát hành {cycle.issued}/{cycle.total} hợp đồng</Text>
                    <View style={s.autoChip}>
                      <Text style={s.autoChipText}>🤖 Tự động</Text>
                    </View>
                  </View>
                  <Text style={s.cycleMeta}>
                    Phát hành {fmtDay(rentIssueDate(month))} · hạn nộp {fmtDay(rentDueDate(month))}
                  </Text>
                  <View style={s.cycleStats}>
                    <View style={s.cycleStat}>
                      <Text style={[s.cycleNum, { color: Colors.success }]}>{cycle.paid}</Text>
                      <Text style={s.cycleLbl}>Đã thu</Text>
                    </View>
                    <View style={s.cycleSep} />
                    <View style={s.cycleStat}>
                      <Text style={[s.cycleNum, { color: Colors.warning }]}>{cycle.overdue}</Text>
                      <Text style={s.cycleLbl}>Quá hạn</Text>
                    </View>
                    <View style={s.cycleSep} />
                    <View style={s.cycleStat}>
                      <Text style={[s.cycleNum, { color: cycle.atRisk > 0 ? Colors.error : Colors.textMuted }]}>{cycle.atRisk}</Text>
                      <Text style={s.cycleLbl}>Được chấm dứt</Text>
                    </View>
                  </View>

                  {cycle.settled ? (
                    <Text style={s.cycleDone}>
                      ✅ Kỳ này đã thu đủ — hệ thống sẽ tự phát hành lại vào ngày {RENT_CYCLE.issueDay} kỳ sau.
                    </Text>
                  ) : cycle.missing === 0 ? (
                    <Text style={s.cycleDone}>
                      ✅ Hệ thống đã phát hành đủ {cycle.total}/{cycle.total} hợp đồng và đã báo cho khách.
                    </Text>
                  ) : (
                    <Text style={s.cycleWarn}>
                      {cycle.missing} hợp đồng chưa có hoá đơn kỳ này
                      {isCurrentMonth
                        ? ` — hệ thống phát hành lúc 00:05 ngày ${RENT_CYCLE.issueDay}; HĐ ký sau đó sẽ có hoá đơn ở kỳ kế tiếp.`
                        : ' (kỳ cũ — chu kỳ tự động chỉ chạy cho kỳ hiện tại).'}
                    </Text>
                  )}
                </View>

                {rows.map(renderRow)}

                <Text style={s.footNote}>
                  Quản lý không cần gửi hoá đơn tiền phòng bằng tay. Hệ thống phát hành ngày {RENT_CYCLE.issueDay},
                  nhắc khách ngày {RENT_CYCLE.preNoticeDay} · {RENT_CYCLE.issueDay}–{RENT_CYCLE.dueDay} · {RENT_CYCLE.finalReminderDay};
                  quá hạn {RENT_TERMINATION_AFTER_DAYS} ngày (từ ngày {RENT_CYCLE.terminationFromDay}) mới mở quyền chấm dứt hợp đồng.
                </Text>
              </>
            )}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  headerSide: { width: 80 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  scroll: { padding: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  groupLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },

  policyBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, paddingLeft: Spacing.md,
    marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingRight: Spacing.md },
  policyTitle: { flex: 1, fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  policyToggle: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  policyDetail: { paddingRight: Spacing.md, marginTop: Spacing.sm },
  policyText: { fontSize: 12, color: Colors.primary, lineHeight: 18 },
  // Nằm trong phần Chi tiết nên có chỗ rộng — cho xuống dòng tự nhiên, khỏi cắt chữ.
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingRight: Spacing.md },
  reminderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.white, borderRadius: BorderRadius.full,
    paddingLeft: 4, paddingRight: 9, paddingVertical: 3,
  },
  reminderChipDay: {
    fontSize: 10, fontWeight: '800', color: Colors.white, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full, minWidth: 20, textAlign: 'center', paddingHorizontal: 5, paddingVertical: 2,
  },
  reminderChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  // Hàng chọn nhà: 1 dòng, padding dọc vừa đủ chạm tay (~44px) thay vì 2 dòng ~64px.
  propRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 11, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  propRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  propName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  propNameActive: { color: Colors.primary },
  propChevron: { fontSize: 18, color: Colors.textMuted, fontWeight: '400' },
  propCheck: { fontSize: 16, color: Colors.primary, fontWeight: '900' },

  // ── Tiêu đề + ô tìm ──
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickCount: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 8, marginBottom: Spacing.sm,
  },
  searchIcon: { fontSize: 13 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  searchClear: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },

  state: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  stateEmoji: { fontSize: 32 },
  stateText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.xs, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.sm },
  monthBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  monthBtnText: { fontSize: 20, color: Colors.primary, fontWeight: '900', lineHeight: 22 },
  monthLabel: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, minWidth: 150, textAlign: 'center' },

  cycleCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  cycleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cycleTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  autoChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryBg },
  autoChipText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  cycleMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cycleStats: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
  cycleStat: { flex: 1, alignItems: 'center' },
  cycleNum: { fontSize: 18, fontWeight: '800' },
  cycleLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  cycleSep: { width: 1, height: 28, backgroundColor: Colors.divider },
  cycleWarn: { fontSize: 12, color: Colors.warning, fontWeight: '600', marginTop: Spacing.sm, lineHeight: 17 },
  cycleDone: { fontSize: 12, color: Colors.success, fontWeight: '700', marginTop: Spacing.sm, lineHeight: 17 },
  btnDisabled: { opacity: 0.6 },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardPaid: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  cardRisk: { borderWidth: 1, borderColor: Colors.error },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs, gap: Spacing.sm },
  roomCode: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  tenant: { fontSize: 12, color: Colors.textSecondary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeMissing: { backgroundColor: Colors.background },
  badgeIssued: { backgroundColor: Colors.primary },
  badgePaid: { backgroundColor: Colors.success },
  badgeOverdue: { backgroundColor: Colors.error },
  badgeText: { fontSize: 11, fontWeight: '700' },
  due: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  hint: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginBottom: Spacing.xs },
  partialBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, marginBottom: Spacing.xs, gap: 2,
  },
  partialTitle: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  partialText: { fontSize: 11, color: Colors.primary, lineHeight: 16 },
  warnBox: { backgroundColor: Colors.warningLight, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs },
  warnBoxText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  riskBox: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs },
  riskText: { fontSize: 11, fontWeight: '700', color: Colors.error },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, gap: Spacing.sm },
  amount: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  terminateBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, alignItems: 'center', minWidth: 150 },
  terminateBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },

  footNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 17, marginTop: Spacing.sm },
});
