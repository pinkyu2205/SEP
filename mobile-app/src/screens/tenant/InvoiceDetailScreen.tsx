import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, RENT_CYCLE, RENT_TERMINATION_AFTER_DAYS,
} from '@/constants';
import { formatCurrency, formatDate, getDaysUntil, onboardChargeLines, showAlert } from '@/utils';
import { tenantInvoiceDisputeService } from '@/services/tenant/invoiceDisputeService';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { SharedBill, BillStatus, InvoiceType } from '@/types/bill';
import { InvoicePaymentModal } from '@/components/invoice/InvoicePaymentModal';
import { UtilityEvidenceCard } from '@/components/invoice/UtilityEvidenceCard';
import { InvoiceDisputeModal } from '@/components/invoice/InvoiceDisputeModal';
import {
  canDisputeInvoice, isDisputeOpen, disputeReasonLabel, DISPUTE_REJECT_GRACE_DAYS,
  type InvoiceDispute,
} from '@/types/invoiceDispute';

// ── Config maps ─────────────────────────────────────────────
const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string; gradientTop: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF', gradientTop: '#7C3AED' },
  electricity: { label: 'Tiền điện',  icon: '⚡', color: '#D97706', bg: '#FEF9C3', gradientTop: '#D97706' },
  water:       { label: 'Tiền nước',  icon: '💧', color: '#2563EB', bg: '#DBEAFE', gradientTop: '#2563EB' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2', gradientTop: '#DC2626' },
  // `deposit` = hoá đơn HD-ONBOARD-*, GỘP cọc + tiền nhà chu kỳ đầu (xem types/bill.ts),
  // nên nhãn không được để mỗi chữ "Tiền cọc".
  deposit:     { label: 'Thu khi nhận phòng', icon: '🔐', color: '#059669', bg: '#ECFDF5', gradientTop: '#059669' },
};

const STATUS_CFG: Record<BillStatus, { label: string; color: string; bg: string; emoji: string }> = {
  pending:   { label: 'Chờ thanh toán',    color: Colors.warning,   bg: Colors.warningLight,  emoji: '🕐' },
  paid:      { label: 'Đã thanh toán',     color: Colors.success,   bg: Colors.successLight,  emoji: '✅' },
  overdue:   { label: 'Quá hạn',           color: Colors.error,     bg: Colors.errorLight,    emoji: '⚠️' },
  partial:   { label: 'Thanh toán 1 phần', color: Colors.info,      bg: Colors.infoLight,     emoji: '💸' },
  cancelled: { label: 'Đã huỷ',           color: Colors.textMuted, bg: Colors.background,    emoji: '🚫' },
};

const METHOD_LABEL: Record<string, string> = {
  qr:            '📱 QR Code / VietQR',
  bank_transfer: '🏦 Chuyển khoản ngân hàng',
  cash:          '💵 Tiền mặt',
  ewallet:       '💳 Ví điện tử',
  other:         '💳 Khác',
};

// ── Sub-components ──────────────────────────────────────────
const InfoRow: React.FC<{
  label: string; value: string;
  labelStyle?: object; valueStyle?: object;
  last?: boolean;
}> = ({ label, value, labelStyle, valueStyle, last }) => (
  <>
    <View style={row.wrap}>
      <Text style={[row.label, labelStyle]}>{label}</Text>
      <Text style={[row.value, valueStyle]}>{value}</Text>
    </View>
    {!last && <View style={row.divider} />}
  </>
);

const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 11 },
  label:   { fontSize: 13, color: Colors.textMuted, flex: 1 },
  value:   { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 2, textAlign: 'right' },
  divider: { height: 1, backgroundColor: Colors.divider },
});

// ── Screen ──────────────────────────────────────────────────
export const InvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { invoice: initialInvoice } = route.params as { invoice: SharedBill };

  // track live status updates (e.g. after QR payment)
  const [invoice, setInvoice] = useState<SharedBill>(initialInvoice);
  const [paying, setPaying]   = useState(false);
  /** Ảnh bằng chứng đang xem cỡ lớn (ảnh đồng hồ / hoá đơn gốc). */
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  /**
   * NẠP LẠI hoá đơn từ endpoint CHI TIẾT khi mở màn.
   *
   * ─── Vì sao cần, dù danh sách đã có sẵn đủ dữ liệu ────────────────────────
   * `GET /tenant/me/invoices/{id}` là nơi máy chủ ĐÁNH DẤU khách đã mở hoá đơn
   * (`markUtilityInvoiceViewedIfAbsent` → `utility_invoices.tenant_viewed_at`, BE
   * 02/09/2026). Màn này trước đây dựng hoàn toàn từ `route.params.invoice` — object
   * lấy từ danh sách — nên không gọi endpoint đó lần nào.
   *
   * Hậu quả đã gặp thật: khách mở hoá đơn ra đọc, gửi cả khiếu nại, mà app quản lý vẫn
   * ghi "khách chưa xem" — vì mốc duy nhất máy chủ có là cờ đã-đọc của bản ghi thông
   * báo, và khách vào thẳng tab Hoá đơn thì bản ghi đó nằm im. BE đã thêm cột mốc thật;
   * nếu FE không gọi endpoint chi tiết thì cột đó vĩnh viễn rỗng và việc BE làm thành vô ích.
   *
   * Tiện thể lấy luôn dữ liệu mới: danh sách có thể đã cũ vài phút.
   *
   * Nuốt lỗi: mất mạng thì vẫn hiển thị dữ liệu từ danh sách, không chặn khách xem hoá đơn.
   */
  useEffect(() => {
    let alive = true;
    realTenantBillingService.getInvoice(initialInvoice.id)
      .then(fresh => {
        if (!alive) return;
        /*
         * GIỮ trạng thái `paid` đã set tại chỗ.
         * Sự kiện realtime INVOICE_PAID có thể tới TRƯỚC khi lệnh gọi này trả về; đè bằng
         * bản chụp cũ hơn của máy chủ là màn hình nhảy ngược từ "đã trả" về "chờ trả".
         */
        setInvoice(prev => (prev.status === 'paid' ? prev : toSharedBill(fresh)));
      })
      .catch(() => { /* giữ nguyên dữ liệu từ danh sách */ });
    return () => { alive = false; };
  }, [initialInvoice.id]);

  /**
   * Đây là màn khách đang mở mã QR ngồi chờ, nên realtime đáng giá nhất ở đây: BE ghi
   * nhận PAID (PayOS webhook / quản lý xác nhận) là đóng QR và đổi trạng thái ngay,
   * khách không phải thoát ra vào lại để biết đã trả xong.
   *
   * `invoiceId` của event là number, `SharedBill.id` là string → so sánh dạng chuỗi.
   */
  // Chỉ `onEvent`: màn này vá thẳng trạng thái từ payload nên không cần nạp lại API
  // (và vì thế cũng không cần lớp poll dự phòng).
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID' && String(e.invoiceId) === String(invoice.id),
    onEvent: (event) => {
      setInvoice(prev => ({
        ...prev,
        status: 'paid',
        paidAt: event.paidAt ?? prev.paidAt,
        transactionId: event.transactionId ?? prev.transactionId,
      }));
      setPaying(false); // đóng modal QR nếu đang mở
    },
  });

  const tc  = TYPE_CFG[invoice.invoiceType];
  // Cách tính do BE dựng sẵn (10/08/2026). Hoá đơn cũ/seed không có → khối "Cách tính" ẩn.
  const breakdown = invoice.paymentBreakdown;
  const isPaid    = invoice.status === 'paid';
  // Trước 13/08/2026 chỗ này có nhánh riêng cho hoá đơn tiền phòng KỲ ĐẦU: tự dời hạn
  // thành "ngày nhận phòng + 3" và ép trạng thái về "chờ thanh toán". Bỏ hẳn — tiền kỳ
  // đầu giờ thu chung với tiền cọc trong mã QR lúc đón khách, không còn hoá đơn kỳ đầu
  // nào chờ thanh toán, nên cứ đi thẳng theo dueDate/status của BE như mọi hoá đơn khác.
  const isOverdue = invoice.status === 'overdue';
  const sc  = STATUS_CFG[invoice.status];
  const canPay    = invoice.status === 'pending' || isOverdue;
  const dueDate   = invoice.dueDate;
  const daysOver  = isOverdue ? Math.abs(getDaysUntil(dueDate)) : 0;

  /**
   * ─── Khiếu nại hoá đơn điện/nước (24/08/2026) ────────────────────────────
   *
   * Chỉ điện/nước mới có đường này: đó là loại hoá đơn duy nhất khách không đối
   * chiếu được bằng hợp đồng — số tiền đến từ một tờ giấy EVN admin tải lên, hoặc
   * một con số quản lý đọc từ mặt đồng hồ. Các loại khác đã có đường phản hồi
   * riêng (xem `canDisputeInvoice`).
   *
   * `disputePending` GÁC MỌI LỜI GIỤC TRẢ TIỀN trên màn này. Vừa bảo khách "đang
   * tra soát, chưa cần trả" mà bên dưới vẫn nhấp nháy "quá hạn 5 ngày" thì khách
   * không tin cái nào — và lần sau thà trả tiền sai còn hơn đi hỏi.
   */
  const dispute        = invoice.dispute;
  const disputePending = isDisputeOpen(dispute);
  const isUtility      = invoice.invoiceType === 'electricity' || invoice.invoiceType === 'water';
  const canDispute     = canDisputeInvoice(invoice.invoiceType, invoice.status, dispute);

  /** Gửi xong thì vá thẳng vào state — khỏi nạp lại cả hoá đơn chỉ để thấy cái banner. */
  const handleDisputeSubmitted = (d: InvoiceDispute) => {
    setInvoice(prev => ({ ...prev, dispute: d }));
    setDisputeOpen(false);
  };

  /**
   * Khách tự rút yêu cầu — xem kỹ lại ảnh rồi thấy mình nhầm.
   *
   * Không có đường này thì khách đành ngồi đợi admin bác một việc mà chính họ đã biết
   * là không có gì, trong lúc hoá đơn treo lơ lửng. Rút cũng là hành vi trung thực nên
   * KHÔNG bị tước quyền khiếu nại lại (xem `canDisputeInvoice`).
   */
  const handleWithdraw = () => {
    showAlert(
      'Rút yêu cầu tra soát?',
      'Hoá đơn sẽ trở lại bình thường và hạn thanh toán chạy tiếp. '
      + 'Nếu sau đó vẫn thấy chưa đúng, bạn gửi lại được.',
      [
        { text: 'Để tôi xem thêm', style: 'cancel' },
        {
          text: 'Rút yêu cầu',
          style: 'destructive',
          onPress: async () => {
            setWithdrawing(true);
            try {
              const d = await tenantInvoiceDisputeService.withdraw(invoice.id);
              setInvoice(prev => ({ ...prev, dispute: d }));
            } catch (err: any) {
              showAlert('Lỗi', err?.response?.data?.message || 'Không rút được yêu cầu.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  };

  /**
   * Dòng kỳ hoá đơn dưới tiêu đề.
   *
   * Hoá đơn thu lúc nhận phòng (`HD-ONBOARD-*`) KHÔNG thuộc kỳ tháng nào nên BE để
   * `month`/`year` null — `String(null).padStart(2,'0')` cho ra chữ "null" đập thẳng vào
   * mặt khách ("Tháng null/"). Có 3 đường, lấy cái nào có trước:
   *   1. month/year hợp lệ  → "Tháng 08/2026" (hoá đơn tháng bình thường)
   *   2. khoảng ngày BE dựng sẵn trong `paymentBreakdown` → "13/08/2026 → 31/08/2026"
   *   3. `billingPeriod` BE trả (vd "Thu lúc nhận phòng")
   * Không có gì thì ẨN hẳn dòng này, đừng bịa.
   */
  const periodLabel = ((): string | null => {
    const m = Number(invoice.month);
    const y = Number(invoice.year);
    if (Number.isFinite(m) && m >= 1 && m <= 12 && Number.isFinite(y) && y > 0) {
      return `Tháng ${String(m).padStart(2, '0')}/${y}`;
    }
    if (breakdown?.periodStart && breakdown?.periodEnd) {
      return `${formatDate(breakdown.periodStart)} → ${formatDate(breakdown.periodEnd)}`;
    }
    return invoice.billingPeriod?.trim() || null;
  })();

  /**
   * Các dòng trong `items` có cộng lại ĐÚNG bằng tổng không.
   *
   * Với hoá đơn onboard, BE đang trả dòng tiền nhà là NGUYÊN THÁNG (5.000.000) trong khi
   * tổng thu là cọc + tiền nhà chia theo số ngày ở (8.064.516). Bày cả hai lên màn thì
   * khách cộng nhẩm ra 10.000.000 rồi tưởng hệ thống tính sai — thà không hiện còn hơn.
   * Phần cấu thành ĐÚNG đã có ở khối "Cách tính" ngay phía trên (BE dựng sẵn).
   * Sai lệch ±1đ là do làm tròn, vẫn coi là khớp.
   */
  const itemsSum = invoice.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const itemsConsistent = invoice.items.length > 0
    && Math.abs(itemsSum - invoice.totalAmount) <= 1;

  /** Đường lui cho hoá đơn onboard: 2 khoản thật sự thu — xem @/utils/onboardBill. */
  const onboardLines = onboardChargeLines(invoice);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ── Hero header ── */}
      <View style={[s.hero, { backgroundColor: tc.gradientTop }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>

        <View style={s.heroBody}>
          <Text style={s.heroIcon}>{tc.icon}</Text>
          <Text style={s.heroLabel}>{tc.label}</Text>
          {!!periodLabel && <Text style={s.heroMonth}>{periodLabel}</Text>}
          <Text style={s.heroAmount}>{formatCurrency(invoice.grandTotal)}</Text>

          <View style={[s.statusBadge, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Text style={s.statusText}>{sc.emoji} {sc.label}</Text>
          </View>
        </View>

        <View style={s.codeChip}>
          <Text style={s.codeText}>{invoice.code}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Trạng thái khiếu nại ──
            Đặt TRÊN CÙNG, trên cả cảnh báo quá hạn: hoá đơn đang bị tra soát thì mọi
            con số bên dưới đều đang chờ xác minh — khách cần biết trước khi đọc gì khác. */}
        {!!dispute && dispute.status !== 'WITHDRAWN' && (
          <View style={[
            s.disputeBanner,
            dispute.status === 'ACCEPTED' && s.disputeBannerOk,
            dispute.status === 'REJECTED' && s.disputeBannerClosed,
          ]}>
            <Text style={s.disputeBannerTitle}>
              {dispute.status === 'OPEN'     && '⏳ Đang tra soát theo yêu cầu của bạn'}
              {dispute.status === 'ACCEPTED' && '✅ Đã xác nhận hoá đơn này sai'}
              {dispute.status === 'REJECTED' && 'ℹ️ Đã tra soát xong — hoá đơn giữ nguyên'}
            </Text>

            <Text style={s.disputeBannerReason}>
              Bạn báo: {disputeReasonLabel(dispute.reason)}
              {dispute.note ? ` — “${dispute.note}”` : ''}
            </Text>

            {dispute.status === 'OPEN' && (
              <>
                <Text style={s.disputeBannerBody}>
                  Gửi ngày {formatDate(dispute.createdAt)}. Trong lúc chờ kết luận, hoá đơn
                  tạm ngừng tính quá hạn — bạn chưa cần thanh toán.
                </Text>
                <TouchableOpacity
                  style={s.disputeWithdraw}
                  onPress={handleWithdraw}
                  disabled={withdrawing}
                  activeOpacity={0.7}
                >
                  <Text style={s.disputeWithdrawText}>
                    {withdrawing ? 'Đang rút…' : 'Tôi đã xem lại — rút yêu cầu'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {dispute.status !== 'OPEN' && !!dispute.resolutionNote && (
              <Text style={s.disputeBannerBody}>
                Phản hồi{dispute.resolvedByName ? ` từ ${dispute.resolvedByName}` : ''}
                {dispute.resolvedAt ? ` (${formatDate(dispute.resolvedAt)})` : ''}:{' '}
                {dispute.resolutionNote}
              </Text>
            )}

            {dispute.status === 'ACCEPTED' && (
              <Text style={s.disputeBannerBody}>
                {dispute.replacementInvoiceCode
                  ? `Hoá đơn thay thế: ${dispute.replacementInvoiceCode}. Bạn không phải trả bản này.`
                  : 'Hoá đơn đúng sẽ được phát hành lại — bạn không phải trả bản này.'}
              </Text>
            )}

            {/* Bác khiếu nại thì phải nói RÕ hạn mới, đừng chỉ nói "giữ nguyên": khách
                vừa được cho biết hạn cũ đã dừng, giờ cần biết dừng tới bao giờ. */}
            {dispute.status === 'REJECTED' && (
              <Text style={s.disputeBannerBody}>
                Hạn thanh toán chạy lại, được cộng thêm {DISPUTE_REJECT_GRACE_DAYS} ngày
                kể từ ngày có kết luận.
              </Text>
            )}
          </View>
        )}

        {/* ── Overdue alert ── */}
        {isOverdue && !disputePending && (
          <View style={s.overdueAlert}>
            <Text style={s.overdueIcon}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.overdueText}>
                Đã quá hạn {daysOver} ngày (hạn: {formatDate(invoice.dueDate)})
              </Text>
              {/* Tiền phòng: không phạt tiền, nhưng trễ lâu sẽ báo chủ nhà & đề nghị chấm dứt HĐ. */}
              {invoice.invoiceType === 'rent' && (
                <Text style={s.overdueSub}>
                  {daysOver >= RENT_TERMINATION_AFTER_DAYS
                    ? 'Đã quá ngày nhắc cuối — quản lý được quyền chấm dứt hợp đồng. Vui lòng thanh toán ngay.'
                    : `Không tính phí phạt, nhưng nếu tới ngày ${RENT_CYCLE.terminationFromDay} vẫn chưa thanh toán thì quản lý được quyền chấm dứt hợp đồng.`}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Thông tin hóa đơn ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📋 Thông tin hóa đơn</Text>
          <View style={s.card}>
            <InfoRow label="Phòng"        value={invoice.roomName} />
            <InfoRow label="Tòa nhà"      value={invoice.propertyName} />
            {/* Dùng lại `periodLabel` như ở hero — hoá đơn onboard cũ không có
                month/year, ghép chuỗi thẳng ra "Tháng null/undefined". */}
            {!!periodLabel && <InfoRow label="Kỳ hóa đơn" value={periodLabel} />}
            {/* Khoản thu ngay lúc nhận phòng đã trả xong, BE không đặt `dueDate` — hiện
                dòng "Hạn thanh toán" cho nó là vô nghĩa (và trước đây ra 01/01/1970). */}
            {!!dueDate && (
              <InfoRow
                label="Hạn thanh toán"
                value={formatDate(dueDate)}
                valueStyle={isOverdue ? { color: Colors.error, fontWeight: '700' } : {}}
                last
              />
            )}
          </View>
        </View>

        {/* ── Utility details (điện/nước) ── */}
        {invoice.invoiceType === 'electricity' && invoice.kwhUsed !== undefined && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>⚡ Chi tiết điện</Text>
            <View style={s.card}>
              {invoice.billingPeriod && (
                <InfoRow label="Kỳ ghi chỉ số" value={invoice.billingPeriod} />
              )}
              <InfoRow label="Số kWh sử dụng" value={`${invoice.kwhUsed} kWh`} />
              <InfoRow
                label="Đơn giá"
                value={`${(invoice.electricityRate ?? 0).toLocaleString('vi-VN')}đ / kWh`}
                last
              />
            </View>
          </View>
        )}

        {invoice.invoiceType === 'water' && invoice.m3Used !== undefined && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>💧 Chi tiết nước</Text>
            <View style={s.card}>
              {invoice.billingPeriod && (
                <InfoRow label="Kỳ ghi chỉ số" value={invoice.billingPeriod} />
              )}
              <InfoRow label="Số m³ sử dụng" value={`${invoice.m3Used} m³`} />
              <InfoRow
                label="Đơn giá"
                value={`${(invoice.waterRate ?? 0).toLocaleString('vi-VN')}đ / m³`}
                last
              />
            </View>
          </View>
        )}

        {/* ── Căn cứ tính tiền (điện/nước) ──
            Bày bằng chứng ngay dưới con số và TRƯỚC khối "Cách tính": khách thắc mắc
            hoá đơn điện là thắc mắc về CHỈ SỐ, không phải về phép nhân. */}
        {isUtility && <UtilityEvidenceCard invoice={invoice} onZoom={setZoomImage} />}

        {/* ── Đường khiếu nại ──
            Đặt ngay sau bằng chứng — đúng chỗ và đúng lúc khách vừa phát hiện có gì
            không khớp. Nhét tít cuối màn thì người thấy sai phải cuộn đi tìm, mà người
            không thấy gì sai vẫn bị mời khiếu nại; cả hai đều dở. */}
        {isUtility && canDispute && (
          <View style={s.section}>
            <TouchableOpacity
              style={s.disputeCta}
              onPress={() => setDisputeOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={s.disputeCtaIcon}>🚩</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.disputeCtaTitle}>Hoá đơn này không đúng?</Text>
                <Text style={s.disputeCtaSub}>
                  {isPaid
                    ? 'Đã thanh toán vẫn báo được — nếu sai, tiền được hoàn hoặc trừ vào kỳ sau.'
                    : 'Gửi yêu cầu tra soát. Hoá đơn tạm ngừng tính quá hạn trong lúc chờ.'}
                </Text>
              </View>
              <Text style={s.disputeCtaArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Cách tính (BE dựng sẵn) ──
            Đặt TRƯỚC "Chi tiết khoản thu": khoản thu lúc nhận phòng gồm tiền cọc + tiền
            nhà chia theo số ngày ở, ra một con số lẻ — khách nhìn thấy nó trước tiên sẽ
            hỏi "sao không phải nguyên tháng", nên công thức phải nằm ngay trên đầu.
            Hoá đơn cũ không có `paymentBreakdown` thì khối này tự ẩn. */}
        {!!breakdown && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>🧮 Cách tính</Text>
            <View style={s.card}>
              <View style={s.breakdownHead}>
                <Text style={s.breakdownTitle}>{breakdown.title}</Text>
              </View>

              {!!breakdown.formula && (
                <Text style={s.breakdownFormula}>{breakdown.formula}</Text>
              )}

              {breakdown.lines.map((l, i) => (
                <InfoRow
                  key={`${l.key}-${i}`}
                  label={l.label}
                  // BE đã format sẵn `displayValue`; chỉ khi là tiền mới format lại theo
                  // đúng kiểu tiền tệ của app cho khớp các dòng khác.
                  value={l.amount != null ? formatCurrency(l.amount) : l.displayValue}
                />
              ))}

              {!!breakdown.explanation && (
                <Text style={s.breakdownNote}>{breakdown.explanation}</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Chi tiết khoản thu ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🧾 Chi tiết khoản thu</Text>
          <View style={s.card}>
            {itemsConsistent ? (
              invoice.items.map((item, i) => (
                <InfoRow
                  key={i}
                  label={item.label}
                  value={formatCurrency(item.amount)}
                  valueStyle={item.amount < 0 ? { color: Colors.success } : {}}
                />
              ))
            ) : onboardLines ? (
              // Khoản thu lúc nhận phòng: dựng lại đúng 2 khoản thật sự thu, vì `items`
              // của BE ghi tiền nhà nguyên tháng nên cộng không ra tổng.
              onboardLines.map((l, i) => (
                <InfoRow key={i} label={l.label} value={formatCurrency(l.amount)} />
              ))
            ) : (
              <Text style={s.itemsFallback}>
                {breakdown
                  ? 'Cấu thành của khoản thu này xem ở mục “Cách tính” phía trên.'
                  : 'Chi tiết từng khoản chưa có cho hoá đơn này.'}
              </Text>
            )}
            {(invoice.lateFee ?? 0) > 0 && (
              <InfoRow
                label="⚠️ Phí trả chậm"
                value={`+${formatCurrency(invoice.lateFee)}`}
                labelStyle={{ color: Colors.error }}
                valueStyle={{ color: Colors.error }}
              />
            )}
            <View style={s.totalSeparator} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tổng cộng</Text>
              <Text style={[s.totalVal, isOverdue && { color: Colors.error }]}>
                {formatCurrency(invoice.grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Thông tin thanh toán (paid) ── */}
        {isPaid && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>💳 Thông tin thanh toán</Text>
            <View style={s.card}>
              {invoice.paidAt && (
                <InfoRow label="Ngày thanh toán" value={formatDate(invoice.paidAt)} />
              )}
              {invoice.paymentMethod && (
                <InfoRow
                  label="Phương thức"
                  value={METHOD_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod}
                />
              )}
              {invoice.transactionId && (
                <InfoRow label="Mã giao dịch" value={invoice.transactionId} last />
              )}
            </View>
            <View style={s.paidBanner}>
              <Text style={s.paidBannerText}>✅ Hóa đơn đã được thanh toán đầy đủ</Text>
            </View>
          </View>
        )}

        {/* ── Trạng thái timeline (chưa trả) ── */}
        {!isPaid && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>⏱ Trạng thái</Text>
            <View style={s.card}>
              {[
                { key: 'created', label: 'Phát hành', done: true },
                { key: 'pending', label: 'Chờ thanh toán', done: invoice.status !== 'pending' || false, active: invoice.status === 'pending' },
                { key: 'paid',    label: 'Hoàn tất', done: false },
              ].map((step, i, arr) => (
                <React.Fragment key={step.key}>
                  <View style={s.timelineStep}>
                    <View style={[
                      s.timelineDot,
                      step.done && { backgroundColor: Colors.success },
                      step.active && { backgroundColor: Colors.warning },
                      !step.done && !step.active && { backgroundColor: Colors.border },
                    ]}>
                      <Text style={{ fontSize: 10, color: Colors.white }}>
                        {step.done ? '✓' : step.active ? '●' : '○'}
                      </Text>
                    </View>
                    <Text style={[s.timelineLabel, (step.done || step.active) && { color: Colors.textPrimary, fontWeight: '600' }]}>
                      {step.label}
                    </Text>
                  </View>
                  {i < arr.length - 1 && (
                    <View style={[s.timelineLine, step.done && { backgroundColor: Colors.success }]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* ── Reminder / pay CTA ── */}
        {canPay && (
          <View style={[s.section, { marginBottom: 100 }]}>
            <View style={[s.reminderBanner, isOverdue && !disputePending && s.reminderBannerOverdue]}>
              <Text style={[s.reminderText, isOverdue && !disputePending && { color: Colors.error }]}>
                {disputePending
                  ? '⏸ Đang tra soát — hạn thanh toán tạm dừng, bạn chưa cần trả'
                  : isOverdue
                    ? `🚨 Đã quá hạn ${daysOver} ngày — vui lòng thanh toán ngay`
                    : `📅 Vui lòng thanh toán trước ${formatDate(invoice.dueDate)}`}
              </Text>
            </View>
          </View>
        )}

        {isPaid && <View style={{ height: 40 }} />}
      </ScrollView>

      {/* ── Sticky pay button ── */}
      {canPay && (
        <View style={s.stickyBar}>
          {/*
            Đang tra soát thì KHÔNG giục: giữ nút để ai muốn trả vẫn trả được (nhiều
            khách thích trả cho xong rồi nhận bù sau), nhưng bỏ màu đỏ và bỏ chữ "ngay".
            Nút đỏ giục trả nằm ngay dưới dòng "bạn chưa cần trả" là tự mâu thuẫn.
          */}
          <TouchableOpacity
            style={[s.payBtn, isOverdue && !disputePending && { backgroundColor: Colors.error }]}
            onPress={() => setPaying(true)}
            activeOpacity={0.85}
          >
            <Text style={s.payBtnText}>
              {disputePending
                ? '💳 Vẫn muốn thanh toán'
                : isOverdue ? '🚨 Thanh toán ngay' : '💳 Thanh toán ngay'}
            </Text>
            <Text style={s.payBtnAmount}>{formatCurrency(invoice.grandTotal)}</Text>
          </TouchableOpacity>
        </View>
      )}

      <InvoicePaymentModal
        visible={paying}
        invoice={invoice}
        onClose={() => setPaying(false)}
        onUpdate={setInvoice}
      />

      {/* Xem ảnh cỡ lớn — chỉ số trên mặt đồng hồ không tài nào đọc nổi ở cỡ thumbnail,
          mà đọc được con số đó mới là toàn bộ mục đích của việc đính ảnh. */}
      <Modal
        visible={!!zoomImage}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomImage(null)}
      >
        <TouchableOpacity
          style={s.zoomOverlay}
          activeOpacity={1}
          onPress={() => setZoomImage(null)}
        >
          {!!zoomImage && (
            <Image source={{ uri: zoomImage }} style={s.zoomImage} resizeMode="contain" />
          )}
          <Text style={s.zoomHint}>Chạm để đóng</Text>
        </TouchableOpacity>
      </Modal>

      <InvoiceDisputeModal
        visible={disputeOpen}
        invoiceId={invoice.id}
        invoiceType={invoice.invoiceType}
        onClose={() => setDisputeOpen(false)}
        onSubmitted={handleDisputeSubmitted}
      />
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Hero
  hero: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    position: 'relative',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  backIcon: { fontSize: 20, color: Colors.white, lineHeight: 24 },
  heroBody: { alignItems: 'center', paddingBottom: Spacing.sm },
  heroIcon:   { fontSize: 44, marginBottom: 6 },
  heroLabel:  { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroMonth:  { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 10 },
  heroAmount: { fontSize: 36, fontWeight: '900', color: Colors.white, marginBottom: 12 },
  statusBadge: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
  statusText:  { fontSize: 13, fontWeight: '700', color: Colors.white },
  codeChip: {
    position: 'absolute', top: Spacing.md, right: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  codeText: { fontSize: 11, fontWeight: '700', color: Colors.white },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  // Overdue alert
  overdueAlert: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  overdueIcon: { fontSize: 20 },
  overdueText: { fontSize: 13, fontWeight: '600', color: Colors.error, flex: 1, lineHeight: 20 },
  overdueSub:  { fontSize: 12, fontWeight: '600', color: Colors.error, opacity: 0.85, marginTop: 4, lineHeight: 17 },

  // Section
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm,
  },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, ...Shadow.sm },

  // Total row inside card
  totalSeparator: { height: 1, backgroundColor: Colors.divider, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  totalVal:   { fontSize: 22, fontWeight: '900', color: Colors.primary },

  // Paid banner
  paidBanner: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center', marginTop: Spacing.sm,
  },
  paidBannerText: { fontSize: 14, fontWeight: '600', color: Colors.success },

  // Timeline
  timelineStep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  timelineDot:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 13, color: Colors.textMuted },
  timelineLine:  { height: 1, backgroundColor: Colors.divider, marginLeft: 14, marginRight: 4 },

  // Reminder
  reminderBanner: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center',
  },
  reminderBannerOverdue: { backgroundColor: Colors.errorLight },
  reminderText: { fontSize: 13, fontWeight: '600', color: Colors.primary, textAlign: 'center', lineHeight: 20 },

  // Sticky pay bar
  stickyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    ...Shadow.md,
  },
  payBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  payBtnText:   { fontSize: 15, fontWeight: '700', color: Colors.white },
  payBtnAmount: { fontSize: 15, fontWeight: '800', color: Colors.white },

  // ── Khối "Cách tính" ──
  breakdownHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    marginBottom: 6,
  },
  breakdownTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  // Công thức để khách tự kiểm lại — chữ đều bề ngang cho các chữ số thẳng cột.
  breakdownFormula: {
    fontSize: 13, color: Colors.textPrimary, fontVariant: ['tabular-nums'],
    backgroundColor: Colors.background, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
  },
  breakdownNote: {
    marginTop: 8, fontSize: 12, lineHeight: 18, color: Colors.textSecondary,
  },
  itemsFallback: {
    fontSize: 12, lineHeight: 18, color: Colors.textMuted, paddingVertical: 6,
  },

  // ── Khiếu nại hoá đơn ──
  disputeBanner: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
    borderLeftWidth: 4, borderLeftColor: Colors.warning,
  },
  disputeBannerOk:     { backgroundColor: Colors.successLight, borderLeftColor: Colors.success },
  disputeBannerClosed: { backgroundColor: Colors.background,   borderLeftColor: Colors.textMuted },
  disputeBannerTitle:  { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  disputeBannerReason: {
    fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18, fontStyle: 'italic',
  },
  disputeBannerBody:   { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 },
  disputeWithdraw: {
    alignSelf: 'flex-start', marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  disputeWithdrawText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },

  disputeCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  disputeCtaIcon:  { fontSize: 20 },
  disputeCtaTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  disputeCtaSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  disputeCtaArrow: { fontSize: 22, color: Colors.textMuted, fontWeight: '300' },

  // ── Xem ảnh bằng chứng cỡ lớn ──
  zoomOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoomImage: { width: '100%', height: '82%' },
  zoomHint:  { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: Spacing.md },
});
