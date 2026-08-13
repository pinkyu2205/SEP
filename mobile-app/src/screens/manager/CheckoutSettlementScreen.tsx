import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Colors, Spacing, BorderRadius, Shadow, checkoutMeta, CHECKOUT_AUTO_ACCEPT_DAYS,
} from '@/constants';
import { formatDate, showAlert, readApiError } from '@/utils';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
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

  // Form ghi nhận hoàn cọc
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [proofUrl, setProofUrl] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [uploading, setUploading] = useState(false);
  const [actualDate, setActualDate] = useState(todayIso());
  /** Đã ghi nhận hoàn cọc thành công trong phiên này (BE chưa trả `refundedAt`). */
  const [refundRecorded, setRefundRecorded] = useState(false);

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
   * Đã hoàn cọc chưa. KHÔNG chỉ dựa vào `settlement.refundedAt` của BE: hiện BE nhận
   * lệnh hoàn cọc (200 OK) nhưng chưa trả lại cờ này, nên nếu chỉ tin BE thì manager
   * hoàn tiền xong vẫn bị khoá nút thanh lý vĩnh viễn. Ghi nhận thành công trong phiên
   * cũng tính là đã hoàn.
   */
  const refunded = !!settlement?.refundedAt || refundRecorded;
  /** Không còn tiền phải chuyển qua lại → có thể đóng hồ sơ. */
  const moneyDone = refunded || (refundAmount <= 0 && extraCharge <= 0);

  const uploadProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return showAlert('Thiếu quyền', 'Cần quyền truy cập thư viện ảnh.');
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      setProofUrl(await uploadImageToCloudinary(result.assets[0].uri));
    } catch (e: any) {
      showAlert('Lỗi upload', readErr(e, 'Không tải được ảnh chứng từ.'));
    } finally {
      setUploading(false);
    }
  };

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

  const submitRefund = async () => {
    if (method === 'BANK_TRANSFER' && !proofUrl) {
      return showAlert('Thiếu chứng từ', 'Tải ảnh biên lai chuyển khoản để khách đối chiếu khi cần.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt.trim())) {
      return showAlert('Ngày không hợp lệ', 'Nhập ngày dạng YYYY-MM-DD.');
    }
    setBusy(true);
    try {
      await checkoutService.refund(checkoutId, {
        amount: refundAmount,
        method,
        proofUrl: proofUrl || undefined,
        paidAt: paidAt.trim(),
      });
      setRefundRecorded(true);
      showAlert('Đã ghi nhận', 'Đã lưu chứng từ hoàn cọc. Giờ có thể bấm "Hoàn tất trả phòng" bên dưới.');
      load();
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không ghi nhận được khoản hoàn cọc.'));
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
            {/* Bảng quyết toán */}
            <Text style={s.sectionTitle}>Bảng quyết toán</Text>
            <View style={s.card}>
              <Row label="Tiền cọc còn lại" value={money(settlement!.depositAmount)} bold />

              {(settlement!.unpaidInvoices ?? []).map(inv => (
                <Row
                  key={inv.id}
                  label={`− Hoá đơn ${inv.code || `#${inv.id}`}${inv.type ? ` (${inv.type})` : ''}`}
                  value={`−${money(inv.amount)}`}
                  negative
                />
              ))}
              {!settlement!.unpaidInvoices?.length && settlement!.unpaidTotal > 0 && (
                <Row label="− Hoá đơn chưa thanh toán" value={`−${money(settlement!.unpaidTotal)}`} negative />
              )}

              {(settlement!.damages ?? []).map((d, i) => (
                <Row key={i} label={`− ${d.label}`} value={`−${money(d.amount)}`} negative />
              ))}
              {!settlement!.damages?.length && settlement!.damageTotal > 0 && (
                <Row label="− Hư hỏng" value={`−${money(settlement!.damageTotal)}`} negative />
              )}

              {(settlement!.adjustments ?? []).map((a, i) => (
                <Row
                  key={`adj-${i}`}
                  label={a.amount < 0 ? `− ${a.label}` : `+ ${a.label}`}
                  value={`${a.amount < 0 ? '−' : '+'}${money(Math.abs(a.amount))}`}
                  negative={a.amount < 0}
                />
              ))}

              <View style={s.divider} />
              {refundAmount > 0 ? (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>HOÀN LẠI KHÁCH</Text>
                  <Text style={[s.resultValue, { color: Colors.success }]}>{money(refundAmount)}</Text>
                </View>
              ) : extraCharge > 0 ? (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>KHÁCH PHẢI ĐÓNG THÊM</Text>
                  <Text style={[s.resultValue, { color: Colors.error }]}>{money(extraCharge)}</Text>
                </View>
              ) : (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>KHÔNG PHÁT SINH</Text>
                  <Text style={[s.resultValue, { color: Colors.textSecondary }]}>0đ</Text>
                </View>
              )}
            </View>
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
              text={refundAmount > 0
                ? `Khách đồng ý → bạn chuyển khoản ${money(refundAmount)} cho khách rồi tải ảnh biên lai lên đây.`
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

        {/* SETTLING → hoàn cọc / chờ khách đóng thêm */}
        {status === 'SETTLING' && (
          <>
            {refundAmount > 0 && !refunded && (
              <>
                <Text style={s.sectionTitle}>Ghi nhận hoàn cọc</Text>
                <View style={s.card}>
                  <Text style={s.helper}>
                    Chuyển khoản cho khách ngoài app rồi tải chứng từ lên đây — hệ thống chỉ lưu bằng chứng.
                  </Text>

                  <Text style={s.label}>Hình thức</Text>
                  <View style={s.methodRow}>
                    {(['BANK_TRANSFER', 'CASH'] as const).map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[s.methodChip, method === m && s.methodChipActive]}
                        onPress={() => setMethod(m)}
                      >
                        <Text style={[s.methodChipText, method === m && s.methodChipTextActive]}>
                          {m === 'BANK_TRANSFER' ? '🏦 Chuyển khoản' : '💵 Tiền mặt'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Ngày chuyển</Text>
                  <TextInput style={s.input} value={paidAt} onChangeText={setPaidAt} placeholder="YYYY-MM-DD" />

                  <Text style={s.label}>
                    Ảnh chứng từ{method === 'BANK_TRANSFER' ? ' (bắt buộc)' : ' (tuỳ chọn)'}
                  </Text>
                  {!!proofUrl && <Image source={{ uri: proofUrl }} style={s.proof} />}
                  <TouchableOpacity style={s.photoBtn} onPress={uploadProof} disabled={uploading}>
                    <Text style={s.photoBtnText}>
                      {uploading ? 'Đang tải...' : proofUrl ? '🔄 Đổi ảnh khác' : '🖼️ Tải ảnh biên lai'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.primaryBtn, { marginTop: Spacing.md }, busy && s.btnDisabled]}
                    onPress={submitRefund}
                    disabled={busy || uploading}
                  >
                    <Text style={s.primaryBtnText}>
                      {busy ? 'Đang lưu...' : `✓ Đã hoàn ${money(refundAmount)}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
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
                  ✓ Đã hoàn cọc {money(refundAmount)} ngày {formatDate(settlement?.refundedAt ?? paidAt)}
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
                {refundAmount > 0
                  ? 'Ghi nhận hoàn cọc trước khi thanh lý hợp đồng.'
                  : 'Chờ khách thanh toán hoá đơn quyết toán trước khi thanh lý hợp đồng.'}
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
