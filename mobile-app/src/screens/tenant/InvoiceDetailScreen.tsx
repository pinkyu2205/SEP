import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatCurrency, formatDate, getDaysUntil } from '@/utils';
import { SharedBill, BillStatus, InvoiceType } from '@/store/billsStore';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';

// ── VietQR ──────────────────────────────────────────────────
const VIETQR_BANK_BIN  = '970422';
const VIETQR_ACCOUNT   = '0865803493';
const VIETQR_ACCOUNT_NAME = 'ROOMRENT';
const buildVietQRUrl = (amount: number, content: string) =>
  `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(VIETQR_ACCOUNT_NAME)}`;

// ── Config maps ─────────────────────────────────────────────
const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string; gradientTop: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF', gradientTop: '#7C3AED' },
  electricity: { label: 'Tiền điện',  icon: '⚡', color: '#D97706', bg: '#FEF9C3', gradientTop: '#D97706' },
  water:       { label: 'Tiền nước',  icon: '💧', color: '#2563EB', bg: '#DBEAFE', gradientTop: '#2563EB' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2', gradientTop: '#DC2626' },
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
  const [processing, setProcessing] = useState(false);

  const tc  = TYPE_CFG[invoice.invoiceType];
  const sc  = STATUS_CFG[invoice.status];
  const isOverdue = invoice.status === 'overdue';
  const isPaid    = invoice.status === 'paid';
  const canPay    = invoice.status === 'pending' || isOverdue;
  const daysOver  = isOverdue ? Math.abs(getDaysUntil(invoice.dueDate)) : 0;

  const qrContent = `HD${invoice.id} T${invoice.month} ${invoice.roomName}`;
  const qrUrl     = buildVietQRUrl(invoice.grandTotal, qrContent);

  const handleConfirmPaid = () => {
    if (processing) return;
    setProcessing(true);
    // Nhờ BE đồng bộ trạng thái thanh toán hoá đơn này.
    realTenantBillingService.checkInvoicePayment(invoice.id)
      .then(updated => { setInvoice(toSharedBill(updated)); setPaying(false); })
      .catch(() => Alert.alert('Đang xử lý', 'Hệ thống sẽ tự xác nhận sau khi nhận được giao dịch.'))
      .finally(() => setProcessing(false));
  };

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
          <Text style={s.heroMonth}>
            Tháng {String(invoice.month).padStart(2, '0')}/{invoice.year}
          </Text>
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

        {/* ── Overdue alert ── */}
        {isOverdue && (
          <View style={s.overdueAlert}>
            <Text style={s.overdueIcon}>🚨</Text>
            <Text style={s.overdueText}>
              Đã quá hạn {daysOver} ngày (hạn: {formatDate(invoice.dueDate)})
            </Text>
          </View>
        )}

        {/* ── Thông tin hóa đơn ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📋 Thông tin hóa đơn</Text>
          <View style={s.card}>
            <InfoRow label="Phòng"        value={invoice.roomName} />
            <InfoRow label="Tòa nhà"      value={invoice.propertyName} />
            <InfoRow label="Kỳ hóa đơn"  value={`Tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`} />
            <InfoRow
              label="Hạn thanh toán"
              value={formatDate(invoice.dueDate)}
              valueStyle={isOverdue ? { color: Colors.error, fontWeight: '700' } : {}}
              last
            />
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

        {/* ── Chi tiết khoản thu ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🧾 Chi tiết khoản thu</Text>
          <View style={s.card}>
            {invoice.items.map((item, i) => (
              <InfoRow
                key={i}
                label={item.label}
                value={formatCurrency(item.amount)}
                valueStyle={item.amount < 0 ? { color: Colors.success } : {}}
              />
            ))}
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
            <View style={[s.reminderBanner, isOverdue && s.reminderBannerOverdue]}>
              <Text style={[s.reminderText, isOverdue && { color: Colors.error }]}>
                {isOverdue
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
          <TouchableOpacity
            style={[s.payBtn, isOverdue && { backgroundColor: Colors.error }]}
            onPress={() => setPaying(true)}
            activeOpacity={0.85}
          >
            <Text style={s.payBtnText}>
              {isOverdue ? '🚨 Thanh toán ngay' : '💳 Thanh toán ngay'}
            </Text>
            <Text style={s.payBtnAmount}>{formatCurrency(invoice.grandTotal)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── VietQR Modal ── */}
      <Modal visible={paying} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.modal}>
            <TouchableOpacity style={s.modalClose} onPress={() => setPaying(false)}>
              <Text style={{ fontSize: 15, color: Colors.textMuted }}>✕</Text>
            </TouchableOpacity>

            <Text style={s.modalTitle}>Thanh toán hóa đơn</Text>

            <View style={[s.modalTypeBadge, { backgroundColor: tc.bg }]}>
              <Text style={[s.modalTypeText, { color: tc.color }]}>
                {tc.icon} {tc.label} · T{String(invoice.month).padStart(2, '0')}/{invoice.year}
              </Text>
            </View>

            <View style={s.qrWrap}>
              <Image source={{ uri: qrUrl }} style={s.qrImg} resizeMode="contain" />
            </View>

            <Text style={s.qrHint}>Mở app Ngân hàng → Quét mã QR → Thông tin tự động điền sẵn</Text>

            <View style={s.bankBox}>
              {[
                { k: 'Ngân hàng',    v: 'MB Bank' },
                { k: 'Số tài khoản', v: VIETQR_ACCOUNT },
                { k: 'Số tiền',      v: formatCurrency(invoice.grandTotal), bold: true },
                { k: 'Nội dung CK',  v: qrContent },
              ].map(r => (
                <View key={r.k} style={s.bankRow}>
                  <Text style={s.bankLabel}>{r.k}</Text>
                  <Text style={[s.bankVal, r.bold && { color: Colors.primary, fontSize: 16, fontWeight: '800' }]}>
                    {r.v}
                  </Text>
                </View>
              ))}
            </View>

            {(invoice.lateFee ?? 0) > 0 && (
              <View style={s.lateFeeBox}>
                <Text style={s.lateFeeBoxText}>
                  Bao gồm phí trả chậm: {formatCurrency(invoice.lateFee)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.confirmBtn, processing && { backgroundColor: Colors.textSecondary }]}
              onPress={handleConfirmPaid}
              disabled={processing}
            >
              {processing ? (
                <>
                  <ActivityIndicator size="small" color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={s.confirmBtnText}>Hệ thống đang xác nhận giao dịch...</Text>
                </>
              ) : (
                <Text style={s.confirmBtnText}>Tôi đã chuyển khoản xong</Text>
              )}
            </TouchableOpacity>

            {!processing && (
              <TouchableOpacity style={s.cancelBtn} onPress={() => setPaying(false)}>
                <Text style={s.cancelBtnText}>Để sau</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  overdueIcon: { fontSize: 20 },
  overdueText: { fontSize: 13, fontWeight: '600', color: Colors.error, flex: 1, lineHeight: 20 },

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

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, maxHeight: '95%',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  modalTypeBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, alignSelf: 'center', marginBottom: Spacing.md },
  modalTypeText:  { fontSize: 13, fontWeight: '700' },

  qrWrap: {
    alignSelf: 'center', backgroundColor: Colors.white,
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 2, borderColor: Colors.divider, marginBottom: Spacing.md,
  },
  qrImg:  { width: 220, height: 280 },
  qrHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md, fontStyle: 'italic' },

  bankBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  bankLabel: { fontSize: 13, color: Colors.textMuted },
  bankVal:   { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  lateFeeBox:     { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  lateFeeBoxText: { fontSize: 13, fontWeight: '600', color: Colors.error, textAlign: 'center' },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', ...Shadow.sm, marginBottom: Spacing.md,
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white, flexShrink: 1, textAlign: 'center' },
  cancelBtn:      { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText:  { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
