import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Colors, Spacing, BorderRadius, Shadow, checkoutMeta, CHECKOUT_AUTO_ACCEPT_DAYS,
} from '@/constants';
import { formatDate, showAlert, readApiError } from '@/utils';
import { checkoutService } from '@/services/manager/checkoutService';
import type { CheckoutRequestDto, CheckoutSettlementDto } from '@/services/tenant/selfService';
import { todayIso } from '@/utils/serverTime';

/**
 * QUYẾT TOÁN TRẢ PHÒNG — bước cuối của luồng checkout.
 *
 *   cọc − hoá đơn chưa trả − hư hỏng ± điều chỉnh = hoàn lại / khách đóng thêm
 *
 * Số tiền do BE tính (GET .../settlement); màn này chỉ hiển thị và ghi nhận thao tác.
 * Nút "Hoàn tất" nằm ở đây chứ không ở danh sách, vì complete terminate hợp đồng
 * ngay lập tức — chỉ được mở sau khi tiền nong xong.
 */

const money = (n: number) => (n || 0).toLocaleString('vi-VN') + 'đ';
const readErr = readApiError;

export const CheckoutSettlementScreen: React.FC<any> = ({ navigation, route }) => {
  const checkoutId: number = route?.params?.checkoutId;

  const [req, setReq] = useState<CheckoutRequestDto | null>(null);
  const [settlement, setSettlement] = useState<CheckoutSettlementDto | null>(null);
  /** BE chưa có API quyết toán → vẫn cho hoàn tất theo luồng cũ, không chặn vận hành. */
  const [settlementMissing, setSettlementMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Ngày trả phòng thực tế — gửi kèm khi thanh lý hợp đồng. */
  const [actualDate, setActualDate] = useState(todayIso());

  const load = useCallback(async () => {
    try {
      const detail = await checkoutService.get(checkoutId);
      setReq(detail);
      setActualDate(detail.expectedMoveOutDate || todayIso());
      try {
        setSettlement(detail.settlement ?? await checkoutService.getSettlement(checkoutId));
        setSettlementMissing(false);
      } catch {
        setSettlement(null);
        setSettlementMissing(true);
      }
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không tải được hồ sơ trả phòng.'));
    } finally {
      setLoading(false);
    }
  }, [checkoutId]);

  useEffect(() => { load(); }, [load]);

  const status = (req?.status || '').toUpperCase();
  const meta = checkoutMeta(status);
  const refundAmount = settlement?.refundAmount ?? 0;
  const extraCharge = settlement?.extraChargeAmount ?? 0;
  /**
   * Đã hoàn cọc chưa — nay chỉ đọc từ BE, vì manager không còn là người ghi nhận
   * (xem khối SETTLING bên dưới). Bên host đánh dấu ở Sổ cọc thì cờ này bật.
   */
  const refunded = !!settlement?.refundedAt;
  /**
   * Còn gì chặn thanh lý hợp đồng không.
   *
   * Chỉ còn MỘT thứ chặn: **khách còn nợ tiền** (`extraCharge`). Phần HOÀN cho khách
   * không chặn nữa — từ 18/08/2026 việc chuyển tiền do bộ phận tài chính làm ngoài app
   * (1–3 ngày làm việc) và hoàn toàn có thể xong sau khi hợp đồng đã thanh lý. Bắt
   * manager chờ hoàn cọc xong mới được đóng hồ sơ là khoá họ ở một việc không phải của
   * họ, và họ cũng không có cách nào biết tiền đã chuyển hay chưa.
   */
  const moneyDone = extraCharge <= 0;

  /**
   * ─── MÀN NÀY CHỈ HIỆN KHOẢN KHÁCH PHẢI TRẢ (18/08/2026) ──────────────────────
   *
   * Bảng quyết toán đầy đủ (cọc còn lại → trừ các khoản → hoàn lại khách) là bảng của
   * KHÁCH, không phải của quản lý. Bày nguyên bảng đó ở đây là để lộ đúng hai con số
   * quản lý không được biết theo @/constants/managerVisibility: **tiền cọc** và **tiền
   * phòng** (khoản "hoàn tiền phòng những ngày không ở" chính là tiền phòng chia theo
   * ngày — đọc dòng đó là suy ra giá thuê).
   *
   * Nên chỉ liệt kê phần khách PHẢI TRẢ: hoá đơn chưa thanh toán, hư hỏng, và các điều
   * chỉnh ÂM. Mọi khoản CỘNG cho khách đều bị bỏ — chúng chỉ có nghĩa khi đặt cạnh tiền
   * cọc, mà tiền cọc thì không hiện ở đây.
   *
   * Tiền cọc + phần hoàn được báo thẳng cho khách trong app của khách (xem
   * CheckoutDetailScreen), kèm mốc "1–3 ngày làm việc về tài khoản khách đã đăng ký".
   */
  const charges = React.useMemo(() => {
    if (!settlement) return [] as Array<{ key: string; label: string; amount: number }>;
    const rows: Array<{ key: string; label: string; amount: number }> = [];

    const invoices = settlement.unpaidInvoices ?? [];
    if (invoices.length) {
      invoices.forEach(inv => rows.push({
        key: `inv-${inv.id}`,
        label: `Hoá đơn ${inv.code || `#${inv.id}`}${inv.type ? ` (${inv.type})` : ''}`,
        amount: inv.amount,
      }));
    } else if (settlement.unpaidTotal > 0) {
      // BE không tách chi tiết thì vẫn phải hiện tổng, không thì khoản nợ biến mất.
      rows.push({ key: 'inv-total', label: 'Hoá đơn chưa thanh toán', amount: settlement.unpaidTotal });
    }

    const damages = settlement.damages ?? [];
    if (damages.length) {
      damages.forEach((d, i) => rows.push({ key: `dmg-${i}`, label: d.label, amount: d.amount }));
    } else if (settlement.damageTotal > 0) {
      rows.push({ key: 'dmg-total', label: 'Hư hỏng', amount: settlement.damageTotal });
    }

    (settlement.adjustments ?? [])
      .filter(a => a.amount < 0)
      .forEach((a, i) => rows.push({ key: `adj-${i}`, label: a.label, amount: Math.abs(a.amount) }));

    return rows;
  }, [settlement]);

  const chargeTotal = charges.reduce((sum, r) => sum + (r.amount || 0), 0);

  const submitSettlement = async () => {
    setBusy(true);
    try {
      await checkoutService.submitSettlement(checkoutId);
      showAlert(
        'Đã gửi khách',
        `Khách sẽ nhận thông báo để xác nhận. Quá ${CHECKOUT_AUTO_ACCEPT_DAYS} ngày không phản hồi thì hệ thống coi như khách đồng ý.`,
      );
      load();
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không gửi được bảng quyết toán.'));
    } finally {
      setBusy(false);
    }
  };


  const doComplete = async () => {
    setBusy(true);
    try {
      await checkoutService.complete(checkoutId, { actualMoveOutDate: actualDate.trim() });
      showAlert('Hoàn tất', 'Hợp đồng đã thanh lý, phòng trở về trạng thái trống.');
      navigation.goBack();
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không hoàn tất được.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmComplete = () =>
    showAlert(
      'Hoàn tất trả phòng?',
      'Hành động này THANH LÝ hợp đồng: phòng về trạng thái trống, thiết bị được khôi phục. Không đảo ngược được.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Hoàn tất', style: 'destructive', onPress: doComplete },
      ],
    );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quyết toán trả phòng</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Bối cảnh + trạng thái */}
        <View style={s.card}>
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.tenantName}>{req?.tenantFullName || 'Khách thuê'}</Text>
              <Text style={s.meta}>
                {req?.propertyName || '—'}{req?.roomNumber ? ` · Phòng ${req.roomNumber}` : ' · Nguyên căn'}
              </Text>
              <Text style={s.meta}>HĐ {req?.contractCode || `#${req?.contractId}`}</Text>
            </View>
            <View style={[s.statusChip, { backgroundColor: meta.bg }]}>
              <Text style={[s.statusChipText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          {!!req?.disputeReason && (
            <Text style={s.disputeBox}>Khách phản đối: {req.disputeReason}</Text>
          )}
        </View>

        {settlementMissing ? (
          <View style={s.warnCard}>
            <Text style={s.warnTitle}>Chưa có bảng quyết toán</Text>
            <Text style={s.warnText}>
              Backend chưa trả dữ liệu quyết toán cho hồ sơ này. Vẫn có thể hoàn tất trả phòng theo
              luồng cũ, nhưng sẽ không có bảng đối chiếu cọc để khách xác nhận.
            </Text>
          </View>
        ) : (
          <>
            {/* Khoản khách phải trả — KHÔNG hiện cọc và tiền phòng, xem chú thích ở `charges`. */}
            <Text style={s.sectionTitle}>Khoản khách phải trả</Text>
            <View style={s.card}>
              {charges.map(r => (
                <Row key={r.key} label={r.label} value={money(r.amount)} negative />
              ))}
              {charges.length === 0 && (
                <Text style={s.helper}>Không có khoản nào khách phải trả.</Text>
              )}

              <View style={s.divider} />
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>TỔNG KHOẢN TRỪ</Text>
                <Text style={[s.resultValue, { color: charges.length ? Colors.error : Colors.textSecondary }]}>
                  {money(chargeTotal)}
                </Text>
              </View>

              {/* Khách phải đóng THÊM = tiền mặt thật sự cần thu, quản lý phải biết.
                  Khác với TỔNG KHOẢN TRỪ ở trên: phần lớn khoản trừ cấn vào cọc. */}
              {extraCharge > 0 && (
                <View style={[s.resultRow, { marginTop: Spacing.xs }]}>
                  <Text style={s.resultLabel}>KHÁCH PHẢI ĐÓNG THÊM</Text>
                  <Text style={[s.resultValue, { color: Colors.error }]}>{money(extraCharge)}</Text>
                </View>
              )}
            </View>

            <Text style={s.mutedNote}>
              {extraCharge > 0
                ? 'Các khoản trên đã cấn hết tiền cọc, phần còn thiếu khách phải đóng thêm.'
                : 'Các khoản trên trừ vào tiền cọc — khách không phải đóng thêm. Tiền cọc còn lại và '
                  + 'tiền phòng những ngày không ở được hoàn thẳng cho khách trong 1–3 ngày làm việc, '
                  + 'về tài khoản khách đã đăng ký lúc gửi yêu cầu trả phòng.'}
              {'\n'}Số tiền cọc và tiền phòng không hiện ở đây — khách xem đầy đủ trong app của khách.
            </Text>
          </>
        )}

        {/* INSPECTING / DISPUTED → gửi bảng tiền cho khách */}
        {(status === 'INSPECTING' || status === 'DISPUTED') && !settlementMissing && (
          <>
            <TouchableOpacity style={[s.primaryBtn, busy && s.btnDisabled]} onPress={submitSettlement} disabled={busy}>
              <Text style={s.primaryBtnText}>
                {busy ? 'Đang gửi...' : status === 'DISPUTED' ? 'Gửi lại cho khách xác nhận' : 'Gửi khách xác nhận →'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.ghostBtn}
              onPress={() => navigation.navigate('CheckoutInspection', { checkoutId })}
            >
              <Text style={s.ghostBtnText}>← Quay lại sửa biên bản</Text>
            </TouchableOpacity>
          </>
        )}

        {/* WAITING_TENANT → tới lượt khách, manager không phải làm gì.
            Vẫn liệt kê việc kế tiếp để manager biết khi nào mới đến lượt mình. */}
        {status === 'WAITING_TENANT' && (
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>⏳ Đã gửi — đang chờ khách xác nhận</Text>
            <Text style={s.infoText}>
              Bây giờ chưa cần làm gì thêm.
              {req?.tenantResponseDeadline ? ` Hạn khách phản hồi: ${formatDate(req.tenantResponseDeadline)}.` : ''}
              {' '}Quá {CHECKOUT_AUTO_ACCEPT_DAYS} ngày không phản hồi, hệ thống tự coi như khách đồng ý.
            </Text>

            <Text style={s.stepsTitle}>Các bước còn lại</Text>
            <NextStep n={1} text="Khách mở app xem biên bản và bảng tiền, bấm Đồng ý hoặc Không đồng ý." />
            <NextStep
              n={2}
              // Không nhắc lại số tiền hoàn ở đây — đó là cọc + tiền phòng, xem `charges`.
              text={refundAmount > 0
                ? 'Khách đồng ý → chuyển khoản phần hoàn cho khách rồi tải ảnh biên lai lên đây (số tiền hiện ở bước hoàn cọc).'
                : extraCharge > 0
                  ? `Khách đồng ý → chờ khách thanh toán ${money(extraCharge)} còn thiếu.`
                  : 'Khách đồng ý → không phát sinh tiền, sang thẳng bước cuối.'}
            />
            <NextStep n={3} text="Bấm Hoàn tất trả phòng — hợp đồng thanh lý, phòng về trạng thái trống." last />

            <Text style={s.infoNote}>
              Nếu khách <Text style={{ fontWeight: '800' }}>không đồng ý</Text>, hồ sơ quay lại cho bạn sửa biên bản
              và chủ nhà cũng được báo.
            </Text>

            <TouchableOpacity style={s.refreshBtn} onPress={load} disabled={busy}>
              <Text style={s.refreshBtnText}>🔄 Kiểm tra khách đã phản hồi chưa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/**
          * SETTLING → chờ hoàn cọc / chờ khách đóng thêm.
          *
          * VIỆC HOÀN CỌC KHÔNG CÒN Ở APP QUẢN LÝ (18/08/2026). Trước đây manager tự
          * chuyển khoản rồi upload biên lai, mà form đó buộc phải hiện số tiền hoàn —
          * chính là tiền cọc còn lại, thứ manager không được biết
          * (@/constants/managerVisibility). Ẩn số mà giữ form thì manager không biết
          * chuyển bao nhiêu; nên bỏ hẳn việc chuyển tiền khỏi vai này.
          *
          * Nay: bộ phận tài chính (host/admin) chuyển trong 1–3 ngày làm việc về tài
          * khoản khách đã điền lúc gửi yêu cầu trả phòng — app của khách nói đúng câu đó
          * (CheckoutDetailScreen). Manager chỉ còn theo dõi và bấm hoàn tất.
          */}
        {status === 'SETTLING' && (
          <>
            {refundAmount > 0 && !refunded && (
              <View style={s.infoCard}>
                <Text style={s.infoTitle}>⏳ Đang chờ hoàn cọc cho khách</Text>
                <Text style={s.infoText}>
                  Bộ phận tài chính sẽ chuyển phần còn lại cho khách trong 1–3 ngày làm việc, về tài
                  khoản khách đã đăng ký khi gửi yêu cầu trả phòng. Bạn không phải chuyển tiền và
                  không cần tải biên lai.
                </Text>
                <Text style={s.infoNote}>
                  Vẫn hoàn tất trả phòng được ngay — việc chuyển tiền chạy song song, không chặn
                  thanh lý hợp đồng.
                </Text>
              </View>
            )}

            {extraCharge > 0 && (
              <View style={s.infoCard}>
                <Text style={s.infoTitle}>Chờ khách đóng thêm {money(extraCharge)}</Text>
                <Text style={s.infoText}>
                  {settlement?.extraChargeInvoiceId
                    ? `Hoá đơn quyết toán #${settlement.extraChargeInvoiceId} đã phát hành — khách thanh toán như hoá đơn thường.`
                    : 'Hệ thống sẽ phát hành hoá đơn quyết toán để khách thanh toán.'}
                </Text>
              </View>
            )}

            {refunded && (
              <View style={s.doneCard}>
                <Text style={s.doneText}>
                  ✓ Đã hoàn cọc cho khách ngày {formatDate(settlement?.refundedAt ?? todayIso())}
                </Text>
                <Text style={s.doneSub}>Bấm "Hoàn tất trả phòng" bên dưới để thanh lý hợp đồng.</Text>
              </View>
            )}
          </>
        )}

        {/* Hoàn tất — chỉ mở khi tiền đã xong (hoặc BE chưa có quyết toán) */}
        {(status === 'SETTLING' || settlementMissing) && (
          <View style={s.card}>
            <Text style={s.label}>Ngày trả phòng thực tế</Text>
            <TextInput style={s.input} value={actualDate} onChangeText={setActualDate} placeholder="YYYY-MM-DD" />
            <TouchableOpacity
              style={[
                s.completeBtn,
                { marginTop: Spacing.md },
                (!moneyDone && !settlementMissing) && s.btnDisabled,
                busy && s.btnDisabled,
              ]}
              onPress={confirmComplete}
              disabled={busy || (!moneyDone && !settlementMissing)}
            >
              <Text style={s.primaryBtnText}>🏁 Hoàn tất trả phòng (thanh lý HĐ)</Text>
            </TouchableOpacity>
            {!moneyDone && !settlementMissing && (
              <Text style={s.blockNote}>
                Chờ khách thanh toán hoá đơn quyết toán trước khi thanh lý hợp đồng.
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

/** Một bước trong danh sách "việc còn lại" — số thứ tự tròn + mô tả. */
const NextStep: React.FC<{ n: number; text: string; last?: boolean }> = ({ n, text, last }) => (
  <View style={[s.stepRow, last && { marginBottom: 0 }]}>
    <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
    <Text style={s.stepText}>{text}</Text>
  </View>
);

const Row: React.FC<{ label: string; value: string; negative?: boolean; bold?: boolean }> = ({
  label, value, negative, bold,
}) => (
  <View style={s.row}>
    <Text style={[s.rowLabel, bold && s.rowBold]} numberOfLines={2}>{label}</Text>
    <Text style={[s.rowValue, bold && s.rowBold, negative && { color: Colors.error }]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  body: { padding: Spacing.lg },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  tenantName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusChip: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  disputeBox: {
    fontSize: 12, color: Colors.error, fontWeight: '600', backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm, lineHeight: 17,
  },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  helper: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: 14, color: Colors.textPrimary,
  },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 5 },
  rowLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  rowBold: { fontWeight: '800', color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mutedNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: -Spacing.xs, marginBottom: Spacing.md, paddingHorizontal: Spacing.xs },
  resultLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
  resultValue: { fontSize: 20, fontWeight: '800' },

  warnCard: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  warnTitle: { fontSize: 14, fontWeight: '800', color: '#B45309', marginBottom: 4 },
  warnText: { fontSize: 12, color: '#B45309', lineHeight: 17 },

  infoCard: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  infoText: { fontSize: 12, color: Colors.primary, lineHeight: 17 },
  infoNote: {
    fontSize: 11, color: Colors.primary, lineHeight: 16, marginTop: Spacing.sm,
    paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(79,70,229,0.15)',
  },

  stepsTitle: { fontSize: 11, fontWeight: '800', color: Colors.primary, letterSpacing: 0.6, marginTop: Spacing.md, marginBottom: Spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  stepText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 17 },

  refreshBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '40',
  },
  refreshBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  doneCard: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md },
  doneText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  doneSub: { fontSize: 12, color: Colors.success, marginTop: 4, opacity: 0.85 },

  methodRow: { flexDirection: 'row', gap: Spacing.sm },
  methodChip: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  methodChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  methodChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  methodChipTextActive: { color: Colors.primary },
  proof: { width: '100%', height: 160, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, backgroundColor: Colors.divider },
  photoBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center' },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  primaryBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  completeBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  ghostBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  btnDisabled: { opacity: 0.5 },
  blockNote: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 16 },
});
