import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  RENT_POLICY_FULL, RENT_REMINDERS,
  toMonthKey, shiftMonthKey, monthLabel, rentIssueDate, rentDueDate,
  isIssueWindowOpen, issueWindowReason, daysOverdue, overdueStage,
} from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, RentInvoiceLite } from '@/services/manager/invoiceService';

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
  /** Hoá đơn tiền nhà của kỳ này (nếu đã phát hành). */
  invoice?: RentInvoiceLite;
}

/**
 * Tiền nhà TỰ ĐỘNG — màn này chỉ THEO DÕI chu kỳ do BE chạy (phát hành ngày 1,
 * hạn nộp ngày 5). Manager chỉ còn nút "Gửi tiền nhà" cho các HĐ bị sót, và nút
 * này chỉ sáng trong ngày 1–5.
 * Điện/nước không thuộc chu kỳ này (vẫn ghi chỉ số & gửi tay ở màn riêng).
 */
export const RentInvoiceScreen: React.FC<any> = ({ navigation }) => {
  const [props, setProps] = useState<PropItem[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => toMonthKey());
  const [rows, setRows] = useState<RentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

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
      // HĐ đang hiệu lực + hoá đơn tiền nhà BE đã phát hành cho kỳ này.
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

  const onSelect = (id: number) => { setSelectedId(id); loadRows(id, month); };
  const shiftMonth = (delta: number) => {
    const nm = shiftMonthKey(month, delta);
    setMonth(nm);
    if (selectedId != null) loadRows(selectedId, nm);
  };

  const windowOpen = isIssueWindowOpen(month);
  const lockedReason = issueWindowReason(month);

  const cycle = useMemo(() => {
    const issued = rows.filter(r => r.invoice);
    const overdue = issued.filter(r => {
      const st = (r.invoice?.status || '').toUpperCase();
      if (st === 'PAID' || st === 'CANCELLED') return false;
      return daysOverdue(r.invoice?.dueDate || rentDueDate(month)) > 0;
    });
    const atRisk = overdue.filter(r =>
      overdueStage(daysOverdue(r.invoice?.dueDate || rentDueDate(month))) === 'termination');
    const paid = issued.filter(r => (r.invoice?.status || '').toUpperCase() === 'PAID').length;
    return {
      total: rows.length,
      issued: issued.length,
      missing: rows.length - issued.length,
      paid,
      overdue: overdue.length,
      atRisk: atRisk.length,
      // Phát hành đủ + thu đủ → kỳ này chốt xong, khoá hẳn thao tác gửi.
      settled: rows.length > 0 && paid === rows.length,
    };
  }, [rows, month]);

  const postRent = (row: RentRow) => {
    if (selectedId == null) return Promise.reject(new Error('no property'));
    const body = {
      contractId: row.contractId,
      billingMonth: month,
      amount: row.rentAmount,
      dueDate: rentDueDate(month),
      note: 'Manager gửi tay — ngoài chu kỳ tự động',
    };
    return row.roomId
      ? realManagerInvoiceService.createRoomRentInvoice(selectedId, row.roomId, body)
      : realManagerInvoiceService.createPropertyRentInvoice(selectedId, body);
  };

  const sendOne = async (row: RentRow) => {
    setSendingId(row.key);
    try {
      await postRent(row);
      if (selectedId != null) await loadRows(selectedId, month, true);
      showAlert('Đã gửi', `Hóa đơn tiền nhà ${fmt(row.rentAmount)} đã gửi cho ${row.tenantName}. Hạn nộp ${fmtDay(rentDueDate(month))}.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không phát hành được hóa đơn tiền nhà.');
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    const pending = rows.filter(r => !r.invoice && r.rentAmount > 0);
    if (!pending.length) { showAlert('Thông báo', 'Kỳ này đã phát hành đủ hoặc chưa có tiền nhà hợp lệ.'); return; }
    setSendingId('__all__');
    try {
      await Promise.all(pending.map(postRent));
      if (selectedId != null) await loadRows(selectedId, month, true);
      showAlert('Đã gửi', `Đã gửi tiền nhà cho ${pending.length} hợp đồng còn thiếu.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không phát hành được hóa đơn tiền nhà.');
    } finally {
      setSendingId(null);
    }
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
    // HĐ ký sau ngày phát hành của kỳ này → job ngày 1 chưa "thấy" hợp đồng.
    const newThisMonth = !inv && row.startDate.startsWith(month);

    return (
      <View key={row.key} style={[s.card, paid && s.cardPaid, stage === 'termination' && s.cardRisk]}>
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
              {paid ? '✓ Đã thu' : inv ? (od > 0 ? `Quá hạn ${od} ngày` : '✓ Đã phát hành') : 'Chưa phát hành'}
            </Text>
          </View>
        </View>

        <Text style={s.due}>
          Hạn nộp: {fmtDay(due)}
          {inv?.autoIssued === false ? ' · manager gửi tay' : inv ? ' · tự động' : ''}
        </Text>

        {stage === 'termination' && (
          <View style={s.riskBox}>
            <Text style={s.riskText}>
              ⚠️ Quá hạn {od} ngày — đã báo chủ nhà, đề nghị chấm dứt hợp đồng.
            </Text>
          </View>
        )}
        {newThisMonth && (
          <Text style={s.hint}>
            HĐ bắt đầu {fmtDay(row.startDate)} — kỳ đầu phát hành khi kích hoạt hợp đồng.
          </Text>
        )}

        {/* Đã có hoá đơn → manager KHÔNG gửi tay được nữa. Nói rõ lý do thay vì
            im lặng giấu nút đi, để manager không tưởng là app lỗi. */}
        {!!inv && (
          <View style={s.lockRow}>
            <Text style={s.lockText}>
              {paid
                ? '🔒 Khách đã thanh toán — kỳ này đã chốt, khoá đến kỳ sau.'
                : inv.autoIssued === false
                  ? '🔒 Đã phát hành cho kỳ này — không gửi lại được.'
                  : '🔒 Hệ thống đã tự phát hành ngày 1 — không nhập tay được nữa.'}
            </Text>
          </View>
        )}

        <View style={s.amountRow}>
          <Text style={s.amount}>{fmt(row.rentAmount)}</Text>
          {!inv && (
            <TouchableOpacity
              style={[s.sendBtn, !windowOpen && s.sendBtnDisabled]}
              onPress={() => sendOne(row)}
              disabled={!windowOpen || sendingId === row.key}
            >
              {sendingId === row.key
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={[s.sendBtnText, !windowOpen && s.sendBtnTextDisabled]}>🏠 Gửi tiền nhà</Text>}
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
        <Text style={s.headerTitle}>Tiền nhà tự động</Text>
        <View style={s.headerSide} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Chính sách chu kỳ ── */}
        <View style={s.policyBox}>
          <Text style={s.policyTitle}>🤖 Chu kỳ tự động</Text>
          <Text style={s.policyText}>{RENT_POLICY_FULL}</Text>
          <View style={s.reminderRow}>
            {RENT_REMINDERS.map(r => (
              <View key={r.offset} style={s.reminderChip}>
                <Text style={s.reminderChipText}>
                  {r.offset === 0 ? 'Ngày hạn' : r.offset < 0 ? `D${r.offset}` : `D+${r.offset}`} · {r.label}
                </Text>
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
              <View style={s.state}><Text style={s.stateEmoji}>🏠</Text><Text style={s.stateText}>Chưa có hợp đồng đang hiệu lực để thu tiền nhà.</Text></View>
            ) : (
              <>
                {/* ── Tình trạng chu kỳ ── */}
                <View style={s.cycleCard}>
                  <View style={s.cycleTop}>
                    <Text style={s.cycleTitle}>Đã phát hành {cycle.issued}/{cycle.total} hợp đồng</Text>
                    <View style={[s.windowChip, windowOpen ? s.windowChipOpen : s.windowChipClosed]}>
                      <Text style={[s.windowChipText, { color: windowOpen ? Colors.success : Colors.textMuted }]}>
                        {windowOpen ? '● Cửa sổ gửi tay đang mở' : '○ Đã khoá gửi tay'}
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
                      <Text style={s.cycleLbl}>Đề nghị chấm dứt</Text>
                    </View>
                  </View>
                  {cycle.settled ? (
                    <Text style={s.cycleDone}>
                      🔒 Kỳ này đã thu đủ và chốt sổ — mở lại vào kỳ {monthLabel(shiftMonthKey(month, 1)).toLowerCase()}.
                    </Text>
                  ) : cycle.missing === 0 ? (
                    <Text style={s.cycleDone}>
                      🔒 Đã phát hành đủ {cycle.total}/{cycle.total} hợp đồng — không cần gửi tay nữa.
                    </Text>
                  ) : (
                    <Text style={s.cycleWarn}>
                      {cycle.missing} hợp đồng chưa có hoá đơn kỳ này
                      {windowOpen ? ' — bấm gửi tay bên dưới.' : ` — ${lockedReason}`}
                    </Text>
                  )}
                  {windowOpen && cycle.missing > 0 && (
                    <TouchableOpacity style={s.sendAllBtn} onPress={sendAll} disabled={sendingId === '__all__'}>
                      {sendingId === '__all__'
                        ? <ActivityIndicator color={Colors.white} />
                        : <Text style={s.sendAllBtnText}>Gửi tiền nhà còn thiếu ({cycle.missing}) →</Text>}
                    </TouchableOpacity>
                  )}
                </View>

                {rows.map(renderRow)}
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
  windowChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  windowChipOpen: { backgroundColor: Colors.successLight },
  windowChipClosed: { backgroundColor: Colors.background },
  windowChipText: { fontSize: 10, fontWeight: '800' },
  cycleMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cycleStats: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
  cycleStat: { flex: 1, alignItems: 'center' },
  cycleNum: { fontSize: 18, fontWeight: '800' },
  cycleLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  cycleSep: { width: 1, height: 28, backgroundColor: Colors.divider },
  cycleWarn: { fontSize: 12, color: Colors.warning, fontWeight: '600', marginTop: Spacing.sm },
  cycleDone: { fontSize: 12, color: Colors.success, fontWeight: '700', marginTop: Spacing.sm, lineHeight: 17 },
  lockRow: { backgroundColor: Colors.background, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, marginBottom: Spacing.xs },
  lockText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, lineHeight: 16 },
  sendAllBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  sendAllBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white },

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
  riskBox: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs },
  riskText: { fontSize: 11, fontWeight: '700', color: Colors.error },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  amount: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, alignItems: 'center', minWidth: 130 },
  sendBtnDisabled: { backgroundColor: Colors.divider },
  sendBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  sendBtnTextDisabled: { color: Colors.textMuted },
});
