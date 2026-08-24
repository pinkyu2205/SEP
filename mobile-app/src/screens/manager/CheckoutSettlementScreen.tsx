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

/** Nhãn tiếng Việt cho `TenantInvoiceType` BE trả trong `finalCharges`. */
const CHARGE_LABEL: Record<string, string> = {
  ELECTRICITY: 'Tiền điện',
  WATER: 'Tiền nước',
  COMPENSATION: 'Bồi thường hư hỏng',
  RENT: 'Tiền nhà',
  SERVICE: 'Phí dịch vụ',
  MAINTENANCE: 'Phí bảo trì',
  OTHER: 'Khoản khác',
};

export const CheckoutSettlementScreen: React.FC<any> = ({ navigation, route }) => {
  const checkoutId: number = route?.params?.checkoutId;

  const [req, setReq] = useState<CheckoutRequestDto | null>(null);
  const [settlement, setSettlement] = useState<CheckoutSettlementDto | null>(null);
  /** BE chưa có API quyết toán → vẫn cho hoàn tất theo luồng cũ, không chặn vận hành. */
  const [settlementMissing, setSettlementMissing] = useState(false);
  /** Lỗi tải bảng quyết toán KHÁC 404 — hiện ra thay vì âm thầm mở cổng thanh lý. */
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Ngày trả phòng thực tế — gửi kèm khi thanh lý hợp đồng. */
  const [actualDate, setActualDate] = useState(todayIso());

  const load = useCallback(async () => {
    try {
      const detail = await checkoutService.get(checkoutId);
      setReq(detail);
      setActualDate(detail.expectedMoveOutDate || todayIso());
      /*
        CHỈ 404 mới coi là "hồ sơ này chưa có bảng quyết toán".

        `settlementMissing` mở cổng cho nút Hoàn tất (vừa cho hiện vừa cho bấm), nên bắt
        mọi lỗi vào đây là FAIL-OPEN: mạng chập hay BE 500 một nhịp cũng thành "không có
        quyết toán" và manager thanh lý được hợp đồng còn nợ tiền.

        BE trả 404 (`ResourceNotFoundException` → `GlobalExceptionHandler`) khi thật sự
        chưa có biên bản kiểm tra; mọi mã khác là trục trặc, phải coi như CHƯA BIẾT và
        giữ cổng đóng. BE nay cũng đã tự chặn bằng `assertChargesSettledBeforeComplete`
        nên đây là lớp thứ hai, không phải lớp duy nhất.
      */
      try {
        setSettlement(detail.settlement ?? await checkoutService.getSettlement(checkoutId));
        setSettlementMissing(false);
        setSettlementError(null);
      } catch (err: any) {
        const status = err?.response?.status;
        setSettlement(null);
        setSettlementMissing(status === 404);
        setSettlementError(status === 404 ? null : readErr(err, 'Không tải được bảng quyết toán.'));
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
  /**
   * Cọc KHÔNG còn bị cấn trừ (mô hình mới 20/08/2026) — số hoàn luôn là nguyên cọc.
   * Màn này không hiện nó (quản lý không được thấy tiền cọc), chỉ dùng để biết đã hoàn chưa.
   */
  const chargesTotal = settlement?.chargesTotal ?? 0;
  const chargesPaid = settlement?.chargesPaid ?? 0;
  const stillOwed = Math.max(0, chargesTotal - chargesPaid);
  /**
   * Đã hoàn cọc chưa — nay chỉ đọc từ BE, vì manager không còn là người ghi nhận
   * (xem khối SETTLING bên dưới). Bên host đánh dấu ở Sổ cọc thì cờ này bật.
   */
  const refunded = !!settlement?.refundedAt;
  /**
   * Còn ĐÚNG MỘT thứ chặn thanh lý: khách chưa trả hết khoản cuối kỳ.
   * Việc hoàn cọc KHÔNG chặn — chạy song song.
   *
   * ─── Từng có điều kiện thứ hai, đã bỏ. Đừng thêm lại. ────────────────────
   * Sáng 24/08/2026 nút này có thêm cổng `refundPaidAt` (bắt host bấm "đã chuyển cọc"
   * mới cho hoàn tất). Lý do lúc đó: `terminateActiveContract` bên BE kéo theo
   * `disableTenantAccountIfNoActiveContracts`, nên thanh lý xong là khách **mất quyền
   * đăng nhập** — không bấm được "✓ đã nhận đủ" hay "✗ chưa nhận", tức mất luôn nguồn
   * của màn Khiếu nại hoàn cọc bên admin, đúng lúc cần nó nhất.
   *
   * Chiều 24/08/2026 BE sửa gốc: thanh lý KHÔNG còn khoá tài khoản nữa. Việc khoá đi
   * theo vòng đời cọc — khách bấm ✓ thì khoá, bấm ✗ thì giữ nguyên quyền, im lặng 30
   * ngày sau khi host chuyển thì cron khoá (`REFUND_SILENCE_DISABLE_DAYS`).
   *
   * Cổng kia mất lý do tồn tại, nên bỏ: giữ lại chỉ tổ neo phòng ở trạng thái RENTED
   * thêm 1–3 ngày chờ một lệnh chuyển khoản, mà không bảo vệ thêm được gì cho khách.
   * Giải phóng phòng sớm mới là thứ đáng giá — phòng trống không cho thuê được là chi
   * phí thật.
   */
  const moneyDone = stillOwed <= 0;

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

    /**
     * `finalCharges` gồm CẢ hoá đơn điện/nước kỳ cuối, bồi thường hư hỏng và hoá đơn còn
     * nợ — BE gộp sẵn từ 20/08/2026, FE không phải ghép từ nhiều mảng như trước.
     */
    const invoices = settlement.finalCharges ?? [];
    if (invoices.length) {
      invoices.forEach(inv => rows.push({
        key: `inv-${inv.id}`,
        label: `${CHARGE_LABEL[inv.type ?? ''] ?? 'Hoá đơn'} ${inv.code || `#${inv.id}`}`,
        amount: inv.amount,
      }));
    } else if (chargesTotal > 0) {
      // BE không tách chi tiết thì vẫn phải hiện tổng, không thì khoản nợ biến mất.
      rows.push({ key: 'inv-total', label: 'Khoản khách phải trả', amount: chargesTotal });
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

        {/* Lỗi tải (khác 404): nói rõ là TRỤC TRẶC, và cổng thanh lý vẫn đóng — đừng để
            người dùng tưởng hồ sơ này vốn không có bảng quyết toán. */}
        {settlementError && (
          <View style={s.warnCard}>
            <Text style={s.warnTitle}>Không tải được bảng quyết toán</Text>
            <Text style={s.warnText}>{settlementError}</Text>
            <Text style={s.warnText}>
              Chưa thanh lý được cho tới khi tải lại được — mở lại màn này để thử lần nữa.
            </Text>
          </View>
        )}

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

              {/* Đã thu được bao nhiêu — mô hình mới: khách TRẢ các khoản này, không cấn cọc. */}
              {chargesPaid > 0 && stillOwed > 0 && (
                <View style={[s.resultRow, { marginTop: Spacing.xs }]}>
                  <Text style={s.resultLabel}>CÒN PHẢI THU</Text>
                  <Text style={[s.resultValue, { color: Colors.error }]}>{money(stillOwed)}</Text>
                </View>
              )}
            </View>

            <Text style={s.mutedNote}>
              {stillOwed > 0
                ? 'Khách thanh toán các khoản trên như hoá đơn thường. Trả đủ rồi chủ nhà mới hoàn cọc.'
                : 'Khách đã thanh toán đủ. Tiền cọc được chủ nhà hoàn NGUYÊN VẸN về tài khoản khách '
                  + 'đã đăng ký lúc gửi yêu cầu trả phòng, trong 1–3 ngày làm việc.'}
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
              // Không nhắc số tiền cọc ở đây — quản lý không được thấy (managerVisibility).
              text={stillOwed > 0
                ? `Khách đồng ý → chờ khách thanh toán ${money(stillOwed)}. Trả đủ rồi chủ nhà mới hoàn cọc.`
                : 'Khách đồng ý → không còn khoản nào phải thu, sang thẳng bước cuối.'}
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
            {stillOwed > 0 ? (
              <View style={s.infoCard}>
                <Text style={s.infoTitle}>Chờ khách thanh toán {money(stillOwed)}</Text>
                <Text style={s.infoText}>
                  Các khoản cuối kỳ đã phát hành thành hoá đơn — khách thanh toán như hoá đơn
                  thường trong app của họ.
                </Text>
                <Text style={s.infoNote}>
                  Chủ nhà chỉ hoàn cọc sau khi khách trả đủ. Bạn không phải thu tiền mặt.
                </Text>
              </View>
            ) : !refunded && (
              <View style={s.infoCard}>
                <Text style={s.infoTitle}>⏳ Khách đã trả đủ — đang chờ hoàn cọc</Text>
                <Text style={s.infoText}>
                  Chủ nhà chuyển cọc về tài khoản khách đã đăng ký, trong 1–3 ngày làm việc.
                  Bạn không phải chuyển tiền và không cần tải biên lai.
                </Text>
                <Text style={s.infoNote}>
                  Vẫn hoàn tất trả phòng được ngay — thanh lý hợp đồng KHÔNG khoá tài khoản
                  khách (BE sửa 24/08/2026), nên khách vẫn vào app xác nhận nhận cọc bình thường.
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
            {/* Vẫn HIỆN nút khi chưa đủ điều kiện, chỉ làm xám + nói rõ đang chờ gì.
                Ẩn hẳn thì manager không biết bước này tồn tại và ngồi đợi mò. */}
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
            {!settlementMissing && !moneyDone && (
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
