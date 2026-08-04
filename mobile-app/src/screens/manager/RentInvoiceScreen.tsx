import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  RENT_CYCLE, RENT_POLICY_FULL, RENT_REMINDER_STEPS, RENT_TERMINATION_AFTER_DAYS,
  toMonthKey, shiftMonthKey, monthLabel, rentIssueDate, rentDueDate,
  daysOverdue, overdueStage, canTerminateForUnpaidRent,
} from '@/constants';
import { useAuth } from '@/hooks';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, RentInvoiceLite } from '@/services/manager/invoiceService';
import { runRentAutoBilling, RentAutoBillingResult } from '@/services/manager/rentAutoBilling';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';
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
  /** Hoá đơn tiền phòng của kỳ này (nếu đã phát hành). */
  invoice?: RentInvoiceLite;
}

/**
 * TIỀN PHÒNG TỰ ĐỘNG — màn này chỉ THEO DÕI, manager KHÔNG gửi hoá đơn tay nữa.
 *
 * Hệ thống tự phát hành ngày 1 (hiện do app chạy hộ vì BE chưa có cron — xem
 * services/manager/rentAutoBilling), nhắc khách ngày 28 · 1–5 · 7, và từ ngày 8 mở
 * quyền chấm dứt hợp đồng cho hợp đồng vẫn chưa thanh toán.
 * Điện/nước không thuộc chu kỳ này (vẫn ghi chỉ số & gửi tay ở màn riêng).
 */
export const RentInvoiceScreen: React.FC<any> = ({ navigation }) => {
  const { user } = useAuth();

  const [props, setProps] = useState<PropItem[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => toMonthKey());
  const [rows, setRows] = useState<RentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  /** Kết quả đợt phát hành tự động gần nhất — để manager biết hệ thống đã làm gì. */
  const [auto, setAuto] = useState<RentAutoBillingResult | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [terminatingId, setTerminatingId] = useState<number | null>(null);

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
  useFocusEffect(useCallback(() => { loadProps(); }, [loadProps]));

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

  /** Chạy đợt phát hành tự động rồi nạp lại bảng. `force` = bấm nút chạy lại. */
  const runAuto = useCallback(async (force: boolean) => {
    if (!user?.id) return;
    setAutoRunning(true);
    try {
      const res = await runRentAutoBilling(user.id, { force });
      // Lượt bị bỏ qua vì giãn cách thì giữ nguyên kết quả cũ (đừng xoá mất báo lỗi).
      if (!res.skipped) setAuto(res);
      if (selectedId != null) await loadRows(selectedId, month, true);
      if (force) {
        showAlert(
          res.issued > 0 ? 'Đã phát hành' : 'Không có gì để phát hành',
          res.issued > 0
            ? `Hệ thống vừa phát hành ${res.issued} hoá đơn tiền phòng và gửi thông báo cho khách.`
            : res.failed > 0
              ? `Không phát hành được ${res.failed} hoá đơn. ${res.error ?? ''}`.trim()
              : 'Mọi hợp đồng đang hiệu lực đều đã có hoá đơn của kỳ này.',
        );
      }
    } finally {
      setAutoRunning(false);
    }
  }, [user?.id, selectedId, month, loadRows]);

  // Vào màn là chạy kiểm tra luôn (có giãn cách bên trong nên không dội API).
  useFocusEffect(useCallback(() => { runAuto(false); }, [runAuto]));

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
              await realTenantService.terminateContract(
                row.contractId,
                `Không thanh toán tiền phòng ${monthLabel(month).toLowerCase()} — quá hạn ${od} ngày, đã nhắc đủ các mốc theo chính sách.`,
              );
              showAlert('Đã chấm dứt', 'Hợp đồng đã được thanh lý. Khách thuê không còn quyền truy cập phòng này trong app.');
              if (selectedId != null) await loadRows(selectedId, month, true);
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

  const multi = props.filter(p => !p.wholeHouse);
  const whole = props.filter(p => p.wholeHouse);

  const renderPropRow = (p: PropItem) => (
    <TouchableOpacity
      key={p.id}
      style={[s.propRow, selectedId === p.id && s.propRowActive]}
      onPress={() => onSelect(p.id)}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.propName}>{p.name}</Text>
        <Text style={s.propMeta}>{p.wholeHouse ? 'Nhà nguyên căn' : 'Nhà nhiều phòng'}</Text>
      </View>
      {selectedId === p.id && <Text style={s.check}>✓</Text>}
    </TouchableOpacity>
  );

  const renderRow = (row: RentRow) => {
    const inv = row.invoice;
    const status = (inv?.status || '').toUpperCase();
    const paid = status === 'PAID';
    const due = inv?.dueDate || rentDueDate(month);
    const od = inv && !paid && status !== 'CANCELLED' ? daysOverdue(due) : 0;
    const stage = overdueStage(od);
    const canTerminate = !!inv && canTerminateForUnpaidRent(due, status);
    // HĐ ký sau ngày phát hành của kỳ này → đợt tự động kế tiếp sẽ phát hành.
    const newThisMonth = !inv && row.startDate.startsWith(month);

    return (
      <View key={row.key} style={[s.card, paid && s.cardPaid, canTerminate && s.cardRisk]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.roomCode}>{row.roomNumber ? `Phòng ${row.roomNumber}` : 'Nhà nguyên căn'}</Text>
            <Text style={s.tenant}>{row.tenantName}</Text>
          </View>
          <View style={[
            s.badge,
            paid ? s.badgePaid : inv ? (od > 0 ? s.badgeOverdue : s.badgeIssued) : s.badgeMissing,
          ]}>
            <Text style={[s.badgeText, { color: inv ? Colors.white : Colors.textMuted }]}>
              {paid ? '✓ Đã thu' : inv ? (od > 0 ? `Quá hạn ${od} ngày` : '✓ Đã phát hành') : 'Chờ phát hành'}
            </Text>
          </View>
        </View>

        <Text style={s.due}>
          Hạn nộp: {fmtDay(due)}
          {inv ? (inv.autoIssued === false ? ' · phát hành thủ công (kỳ cũ)' : ' · tự động') : ''}
        </Text>

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
        {newThisMonth && (
          <Text style={s.hint}>
            HĐ bắt đầu {fmtDay(row.startDate)} — hệ thống sẽ phát hành ở đợt kiểm tra kế tiếp.
          </Text>
        )}

        <View style={s.amountRow}>
          <Text style={s.amount}>{fmt(row.rentAmount)}</Text>
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
        {/* ── Chính sách chu kỳ ── */}
        <View style={s.policyBox}>
          <Text style={s.policyTitle}>🤖 Chạy hoàn toàn tự động</Text>
          <Text style={s.policyText}>{RENT_POLICY_FULL}</Text>
          <View style={s.reminderRow}>
            {RENT_REMINDER_STEPS.map(r => (
              <View key={r.day} style={s.reminderChip}>
                <Text style={s.reminderChipText}>Ngày {r.day} · {r.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.sectionTitle}>Chọn tòa nhà / căn hộ</Text>

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
        ) : (
          <>
            {multi.length > 0 && <Text style={s.groupLabel}>🏢 Nhà nhiều phòng</Text>}
            {multi.map(renderPropRow)}
            {whole.length > 0 && <Text style={[s.groupLabel, { marginTop: Spacing.md }]}>🏠 Nhà nguyên căn</Text>}
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
                      <Text style={s.autoChipText}>
                        {autoRunning ? '● Đang kiểm tra...' : '🤖 Tự động'}
                      </Text>
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
                        ? ' — hệ thống sẽ tự phát hành ở đợt kiểm tra kế tiếp.'
                        : ' (kỳ cũ — chu kỳ tự động chỉ chạy cho kỳ hiện tại).'}
                    </Text>
                  )}

                  {/* Không phải nhập tay: đây chỉ là chạy lại đúng đợt tự động, dùng khi
                      mạng lỗi hoặc hợp đồng vừa ký xong muốn có hoá đơn ngay. */}
                  {isCurrentMonth && cycle.missing > 0 && (
                    <TouchableOpacity
                      style={[s.autoBtn, autoRunning && s.btnDisabled]}
                      onPress={() => runAuto(true)}
                      disabled={autoRunning}
                    >
                      {autoRunning
                        ? <ActivityIndicator color={Colors.white} />
                        : <Text style={s.autoBtnText}>🤖 Chạy phát hành tự động ngay</Text>}
                    </TouchableOpacity>
                  )}

                  {!!auto?.error && auto.failed > 0 && (
                    <Text style={s.autoError}>
                      ⚠️ Đợt tự động gần nhất lỗi {auto.failed} hoá đơn: {auto.error}
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
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.md,
    marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  policyTitle: { fontSize: 13, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  policyText: { fontSize: 12, color: Colors.primary, lineHeight: 18 },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  reminderChip: { backgroundColor: Colors.white, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  reminderChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  propRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  propRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  propName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  propMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  check: { fontSize: 16, color: Colors.primary, fontWeight: '900' },

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
  autoBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  autoBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },
  autoError: { fontSize: 11, color: Colors.error, marginTop: Spacing.sm, lineHeight: 16 },
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
