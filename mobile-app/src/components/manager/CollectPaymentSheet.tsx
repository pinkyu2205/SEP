import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  managerInvoiceUnlockService, type InvoiceUnlockPurpose,
} from '@/services/manager/invoiceUnlockService';
import { realManagerInvoiceService, type ManagerPaymentQr } from '@/services/manager/invoiceService';
import { serverNow } from '@/utils/serverTime';

const SH = Dimensions.get('window').height;

/**
 * THU TIỀN HỘ KHÁCH — tiền mặt hoặc có người trả hộ.
 *
 * Hai tình huống thật mà app trước đây không đỡ được, khách chỉ còn cách tự chuyển khoản:
 *
 *  1. **Khách trả tiền mặt** (CASH_COLLECT). Quản lý nhận tiền mặt tại phòng, rồi tự
 *     chuyển đúng số đó từ tài khoản mình vào QR của hoá đơn. Tiền mặt nằm lại chỗ quản lý,
 *     hệ thống vẫn có một giao dịch khớp số — nên không có khoản nào "thu rồi mà không thấy".
 *     Đây là lý do quản lý **phải có sẵn tiền trong tài khoản** mới nhận tiền mặt.
 *
 *  2. **Người khác trả hộ** (PROXY_PAY). Khách nhờ người tới phòng trả thay. Quản lý xin
 *     tên người trả hộ, mở QR cho họ quét bằng app bank của chính họ. Tiền đi trực tiếp
 *     từ người trả hộ, quản lý không cầm đồng nào.
 *
 * Cả hai đều là quản lý tạo giao dịch trên hoá đơn của người khác, nên đều phải qua
 * **passcode một lần của admin** — xem `managerInvoiceUnlockService`.
 *
 * 3 bước: chọn hình thức → nhập mã admin (+ tên người trả hộ) → quét QR.
 */

type Step = 'mode' | 'passcode' | 'qr';

const PURPOSE_UI: Record<InvoiceUnlockPurpose, {
  icon: string; title: string; desc: string; color: string; bg: string;
}> = {
  CASH_COLLECT: {
    icon: '💵',
    title: 'Khách trả tiền mặt',
    desc: 'Bạn nhận tiền mặt, rồi tự chuyển đúng số đó vào QR. Cần có sẵn tiền trong tài khoản.',
    color: '#B45309',
    bg: '#FFFBEB',
  },
  PROXY_PAY: {
    icon: '👥',
    title: 'Có người trả hộ',
    desc: 'Người trả hộ tự quét QR bằng app bank của họ. Bạn không cầm tiền.',
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
};

const fmtVnd = (n?: number | null) =>
  n == null ? '—' : `${n.toLocaleString('vi-VN')}đ`;

/** Còn bao nhiêu giây tới `iso` (0 nếu đã qua). Dùng giờ server, không phải giờ máy. */
const secondsLeft = (iso?: string): number => {
  if (!iso) return 0;
  const end = new Date(iso).getTime();
  if (isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - serverNow().getTime()) / 1000));
};

const mmss = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const CollectPaymentSheet: React.FC<{
  invoiceId: number;
  invoiceCode: string;
  tenantName: string;
  roomLabel: string;
  onClose: () => void;
  /** Gọi khi QR đã tạo — màn ngoài nên nạp lại danh sách để bắt trạng thái PAID. */
  onQrCreated?: () => void;
  /**
   * Hình thức đã chọn sẵn từ màn ngoài → vào thẳng bước nhập mã.
   * Màn hoá đơn hiện HAI nút (tiền mặt · trả hộ) nên quản lý đã chọn xong trước khi
   * sheet mở; bắt chọn lại lần nữa trong sheet là thêm một bước vô nghĩa.
   */
  initialPurpose?: InvoiceUnlockPurpose;
}> = ({ invoiceId, invoiceCode, tenantName, roomLabel, onClose, onQrCreated, initialPurpose }) => {
  const [step, setStep] = useState<Step>(initialPurpose ? 'passcode' : 'mode');
  const [purpose, setPurpose] = useState<InvoiceUnlockPurpose | null>(initialPurpose ?? null);

  const [passcode, setPasscode] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  /**
   * Dòng phụ dưới lỗi. Tách khỏi `err` vì hai thứ khác bản chất: `err` là NGUYÊN NHÂN
   * (mã sai / PayOS từ chối / mạng), còn dòng này là HỆ QUẢ với cái mã vừa nhập.
   * Gộp một dòng thì đọc thành "mã sai nên đã bị dùng", trong khi mã có thể hoàn toàn
   * đúng mà lỗi nằm ở bước sau.
   */
  const [errHint, setErrHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [qr, setQr] = useState<ManagerPaymentQr | null>(null);
  const [left, setLeft] = useState(0);

  const ui = purpose ? PURPOSE_UI[purpose] : null;

  // Đếm ngược hạn QR. Hết hạn thì QR vô hiệu ở phía PayOS, nên phải nói rõ chứ đừng để
  // quản lý đứng chờ khách quét một mã đã chết.
  useEffect(() => {
    if (!qr?.expiresAt) return;
    setLeft(secondsLeft(qr.expiresAt));
    const t = setInterval(() => setLeft(secondsLeft(qr.expiresAt)), 1000);
    return () => clearInterval(t);
  }, [qr?.expiresAt]);

  const canSubmit = useMemo(() => {
    if (passcode.trim().length !== 6) return false;
    // Tên người trả hộ là bắt buộc — BE cũng chặn, nhưng chặn sớm ở đây để quản lý không
    // tiêu mất mã dùng-một-lần vào một request chắc chắn lỗi.
    if (purpose === 'PROXY_PAY' && !payerName.trim()) return false;
    return true;
  }, [passcode, purpose, payerName]);

  const submit = async () => {
    if (!purpose || !canSubmit || busy) return;
    setBusy(true);
    setErr(null);
    setErrHint(null);
    try {
      const verified = await managerInvoiceUnlockService.verifyPasscode(invoiceId, passcode);
      if (!verified.valid || !verified.unlockToken) {
        setErr(verified.message ?? 'Mã không đúng hoặc đã hết hạn.');
        setErrHint('Nhập lại cho đúng, hoặc xin admin mã mới nếu mã đã quá 15 phút.');
        return;
      }

      /**
       * Từ đây trở đi MÃ ĐÃ CHÁY. BE đánh dấu passcode `usedAt` ngay trong bước verify
       * ở trên, nên mọi lỗi phía sau đều không thể thử lại bằng mã cũ — phải xin admin
       * mã mới. Nói thẳng điều đó thay vì để quản lý bấm lại và nhận "mã không đúng".
       */
      try {
        const created = await realManagerInvoiceService.createPaymentQr(invoiceId, {
          unlockToken: verified.unlockToken,
          purpose,
          payerName: purpose === 'PROXY_PAY' ? payerName.trim() : undefined,
          payerPhone: purpose === 'PROXY_PAY' && payerPhone.trim() ? payerPhone.trim() : undefined,
        });
        setQr(created);
        setStep('qr');
        onQrCreated?.();
      } catch (e: any) {
        setPasscode('');
        const cause = e?.response?.data?.message || e?.message || 'Không tạo được mã QR.';
        setErr(`Mã admin ĐÚNG, nhưng không tạo được QR: ${cause}`);
        // KHÔNG nhắc lại con số vừa nhập ở đây: mã dùng một lần, in ra chỉ thêm chỗ rò rỉ.
        setErrHint('Mã vừa nhập dùng một lần nên đã tiêu — xin admin mã mới để thử lại. '
          + 'Nếu vẫn lỗi y hệt thì đó là lỗi phía hệ thống, báo kỹ thuật chứ đừng xin mã tiếp.');
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Không kiểm tra được mã — thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.headTitle}>
                {step === 'qr' ? 'Quét mã để nộp' : 'Thu tiền hộ khách'}
              </Text>
              <Text style={s.headSub} numberOfLines={1}>
                {tenantName} · {roomLabel} · {invoiceCode}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.closeBtn}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} bounces={false}>
            {/* ── BƯỚC 1: chọn hình thức ── */}
            {step === 'mode' && (
              <>
                {(Object.keys(PURPOSE_UI) as InvoiceUnlockPurpose[]).map(key => {
                  const cfg = PURPOSE_UI[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.modeCard, { backgroundColor: cfg.bg, borderColor: `${cfg.color}33` }]}
                      onPress={() => { setPurpose(key); setStep('passcode'); setErr(null); setErrHint(null); }}
                      activeOpacity={0.85}
                    >
                      <Text style={s.modeIcon}>{cfg.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.modeTitle, { color: cfg.color }]}>{cfg.title}</Text>
                        <Text style={s.modeDesc}>{cfg.desc}</Text>
                      </View>
                      <Text style={[s.modeChevron, { color: cfg.color }]}>›</Text>
                    </TouchableOpacity>
                  );
                })}

                <View style={s.infoBox}>
                  <Text style={s.infoText}>
                    Cả hai hình thức đều cần mã 6 số do admin cấp cho đúng hoá đơn này. Gọi
                    admin xin mã trước khi tiếp tục.
                  </Text>
                </View>
              </>
            )}

            {/* ── BƯỚC 2: nhập mã admin ── */}
            {step === 'passcode' && !!ui && (
              <>
                <View style={[s.modeBanner, { backgroundColor: ui.bg }]}>
                  <Text style={s.modeIcon}>{ui.icon}</Text>
                  <Text style={[s.modeBannerText, { color: ui.color }]}>{ui.title}</Text>
                  {!initialPurpose && (
                    <TouchableOpacity onPress={() => { setStep('mode'); setErr(null); setErrHint(null); }} hitSlop={8}>
                      <Text style={s.changeLink}>Đổi</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {purpose === 'PROXY_PAY' && (
                  <>
                    <Text style={s.label}>Tên người trả hộ *</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Hỏi và ghi đúng tên người đang đứng trước bạn"
                      placeholderTextColor={Colors.textMuted}
                      value={payerName}
                      onChangeText={t => { setPayerName(t); setErr(null); setErrHint(null); }}
                    />
                    <Text style={s.label}>SĐT người trả hộ</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Không bắt buộc"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="phone-pad"
                      value={payerPhone}
                      onChangeText={setPayerPhone}
                    />
                  </>
                )}

                <Text style={s.label}>Mã admin cấp *</Text>
                <TextInput
                  style={[s.input, s.codeInput]}
                  placeholder="6 số"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={passcode}
                  onChangeText={t => { setPasscode(t.replace(/\D/g, '')); setErr(null); setErrHint(null); }}
                />

                {!!err && <Text style={s.errText}>{err}</Text>}
            {!!errHint && <Text style={s.errHint}>{errHint}</Text>}

                <Text style={s.hint}>
                  Mã dùng một lần, hạn 15 phút, gắn đúng hoá đơn này. Nhập sai 3 lần thì
                  hoá đơn bị khoá 15 phút.
                </Text>

                <TouchableOpacity
                  style={[s.primaryBtn, (!canSubmit || busy) && s.primaryBtnOff]}
                  onPress={submit}
                  disabled={!canSubmit || busy}
                >
                  {busy
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={s.primaryBtnText}>Tạo mã QR</Text>}
                </TouchableOpacity>
              </>
            )}

            {/* ── BƯỚC 3: QR ── */}
            {step === 'qr' && !!qr && !!ui && (
              <>
                <View style={s.amountBox}>
                  <Text style={s.amountLabel}>Số tiền phải chuyển</Text>
                  <Text style={s.amountValue}>{fmtVnd(qr.amount)}</Text>
                </View>

                <View style={s.qrBox}>
                  {left > 0 ? (
                    <QRCode value={qr.qrCode} size={220} />
                  ) : (
                    <View style={s.qrDead}>
                      <Text style={s.qrDeadIcon}>⌛</Text>
                      <Text style={s.qrDeadText}>Mã QR đã hết hạn</Text>
                      <Text style={s.qrDeadHint}>Xin admin mã mới rồi tạo lại.</Text>
                    </View>
                  )}
                </View>

                {left > 0 && (
                  <Text style={[s.countdown, left <= 60 && { color: Colors.error }]}>
                    Còn hiệu lực {mmss(left)}
                  </Text>
                )}

                <View style={[s.infoBox, { backgroundColor: ui.bg }]}>
                  <Text style={[s.infoText, { color: ui.color }]}>
                    {purpose === 'CASH_COLLECT'
                      ? `Bạn đã nhận ${fmtVnd(qr.amount)} tiền mặt của khách. Giờ quét QR này bằng app bank của BẠN và chuyển đúng số đó.`
                      : `Đưa màn hình này cho ${payerName.trim()} quét bằng app bank của họ. Số tiền đã gắn trong mã, không cần nhập tay.`}
                  </Text>
                </View>

                <Text style={s.hint}>
                  Chuyển xong hệ thống tự ghi nhận và thông báo cho khách, chủ nhà và admin.
                  Không cần bạn xác nhận thêm.
                </Text>

                <TouchableOpacity style={s.secondaryBtn} onPress={onClose}>
                  <Text style={s.secondaryBtnText}>Đóng</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SH * 0.92,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 12,
  },

  head: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  headTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  headSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '700' },

  body: { paddingHorizontal: Spacing.lg, paddingBottom: 40, gap: Spacing.sm },

  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1,
  },
  modeIcon: { fontSize: 26 },
  modeTitle: { fontSize: 15, fontWeight: '800' },
  modeDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  modeChevron: { fontSize: 24, fontWeight: '700' },

  modeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.xs,
  },
  modeBannerText: { flex: 1, fontSize: 14, fontWeight: '800' },
  changeLink: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  label: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    marginTop: Spacing.sm, marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  codeInput: {
    fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center',
  },

  errText: {
    fontSize: 13, color: Colors.error, fontWeight: '600',
    marginTop: Spacing.sm, lineHeight: 18,
  },
  errHint: {
    fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 4,
  },
  hint: {
    fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginTop: Spacing.sm,
  },

  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md, ...Shadow.md,
  },
  primaryBtnOff: { backgroundColor: Colors.border, ...({ shadowOpacity: 0, elevation: 0 }) },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  secondaryBtn: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingVertical: 13, alignItems: 'center', marginTop: Spacing.md,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },

  amountBox: { alignItems: 'center', paddingVertical: Spacing.sm },
  amountLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  amountValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },

  qrBox: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    minHeight: 252,
  },
  qrDead: { alignItems: 'center', gap: 6, paddingVertical: Spacing.xl },
  qrDeadIcon: { fontSize: 40 },
  qrDeadText: { fontSize: 15, fontWeight: '800', color: Colors.error },
  qrDeadHint: { fontSize: 12, color: Colors.textSecondary },

  countdown: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textAlign: 'center', marginTop: Spacing.sm,
  },

  infoBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  infoText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, fontWeight: '500' },
});
