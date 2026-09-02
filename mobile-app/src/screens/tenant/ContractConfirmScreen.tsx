/**
 * XÁC NHẬN HỢP ĐỒNG — màn khách thuê bắt buộc đi qua trước khi vào app.
 *
 * Vì sao có màn này (đổi quy trình 27/08/2026): trước đây quản lý vừa gửi vừa nhập OTP
 * một mình trên máy của quản lý, nên "khách đã đồng ý hợp đồng" hoàn toàn không có
 * bằng chứng nào — khách có thể chưa từng đọc hợp đồng mà hợp đồng đã có hiệu lực.
 * Giờ khách phải tự đọc, tự bấm gửi OTP, tự nhập mã của mình; quản lý nhập mã riêng
 * trên máy quản lý. Cả hai xong thì hợp đồng mới hiệu lực.
 *
 * Nút "Gửi OTP xác nhận" là điểm mấu chốt — KHÔNG được gửi tự động thay khách. Chính
 * hành động bấm mới là thứ chứng minh khách đã xem và đồng ý.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  ActivityIndicator, TextInput, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { Contract } from '@/types';
import { showAlert } from '@/utils';
import { useAuth, useOtpCooldown } from '@/hooks';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import {
  realTenantSelfService, ContractDetailDto, TenantHandoverResponse,
} from '@/services/tenant/selfService';
import {
  ContractDetailBody, ImageViewerModal, mapDetail, contractBodyStyles as base,
} from '@/components/contract/ContractDetailBody';
import {
  contractConfirmService, type ContractConfirmState,
} from '@/services/shared/contractConfirmService';

const OTP_LENGTH = 6;

/** Nhịp hỏi lại BE xem quản lý đã nhập mã chưa. Bám đúng nhịp poll thanh toán của màn đón khách. */
const POLL_MS = 5000;

const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

export const ContractConfirmScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isFocused = useIsFocused();
  const { refreshPendingConfirm } = useAuth();
  const contractId: number = Number(route.params?.contractId);

  const [contract, setContract] = useState<Contract | null>(null);
  const [detailDto, setDetailDto] = useState<ContractDetailDto | null>(null);
  const [handover, setHandover] = useState<TenantHandoverResponse | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [agreed, setAgreed] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ContractConfirmState | null>(null);
  const { cooldown, startCooldown } = useOtpCooldown();

  /**
   * Đã bấm gửi trong PHIÊN NÀY hay chưa — cờ CỤC BỘ, cố ý không lấy từ BE.
   *
   * BE không lưu mốc "khách đã bấm gửi" (không có cột `confirm_requested_at`), nên
   * không có cách nào biết mã còn sống hay đã hết hạn từ phía server. Dùng cờ trong
   * phiên là đúng hơn: khách mở lại app sau khi mã hết hạn thì thấy lại nút Gửi thay
   * vì bị bắt nhập một mã không còn tồn tại. Bấm lại vô hại — BE chỉ sinh mã cho bên
   * chưa verify, không reset mốc của ai.
   */
  const [requested, setRequested] = useState(false);

  const tenantDone = !!state?.tenantOtpVerified;
  const activated = !!state?.activated;

  // ── Nạp hợp đồng ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!contractId) return;
    let active = true;
    setLoading(true);
    realTenantSelfService.getContractDetail(contractId)
      .then(d => { if (active) { setContract(mapDetail(d)); setDetailDto(d); } })
      .catch(err => {
        if (active) showAlert('Lỗi', readErr(err, 'Không tải được hợp đồng để xác nhận.'));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contractId]);

  /**
   * Chỉ số điện/nước + ảnh hiện trạng lúc bàn giao.
   *
   * BE mở cho HĐ `PENDING` đọc được từ 01/09/2026 (`TenantHandoverServiceImpl.READABLE`
   * = ACTIVE + PENDING) — trước đó nó chỉ trả cho HĐ ACTIVE nên ở màn này luôn hỏng và
   * cả mục bị ẩn. Đây chính là thứ khách cần soi TRƯỚC khi tick, vì chỉ số ghi ở đây là
   * mốc tính tiền điện nước cho tới lúc trả phòng.
   *
   * Vẫn nuốt lỗi và ẩn mục nếu hỏng: KHÔNG chặn việc xác nhận hợp đồng vì một mục phụ.
   */
  useEffect(() => {
    if (!contractId) return;
    let active = true;
    realTenantSelfService.getHandover(contractId)
      .then(d => { if (active) setHandover(d); })
      .catch(() => { if (active) setHandover(null); });
    return () => { active = false; };
  }, [contractId]);

  // ── Tiến độ xác nhận ────────────────────────────────────────────────────────
  const loadState = useCallback(async () => {
    try {
      const s = await contractConfirmService.getConfirmState(contractId);
      setState(s);
      // Khách đã nhập mã rồi thì chắc chắn đã từng bấm gửi — khôi phục cờ để mở app
      // lại là thấy ngay màn "đang chờ quản lý", không phải bấm gửi thêm lần nữa.
      if (s.tenantOtpVerified) setRequested(true);
      return s;
    } catch {
      // Lỗi mạng / BE chưa có endpoint → giữ nguyên tiến độ đang hiện, đừng nhấp nháy
      // về trạng thái rỗng. Người dùng vẫn bấm gửi/nhập mã được.
      return null;
    }
  }, [contractId]);

  useEffect(() => { if (contractId) void loadState(); }, [contractId, loadState]);

  /**
   * Poll khi đang chờ bên kia.
   *
   * Dừng khi màn không focus hoặc app xuống nền — poll nền chỉ tốn pin và quota, mà
   * khách quay lại là `isFocused`/AppState bật lại ngay. Cùng bài học với
   * `useBillingRealtime`, hook đó cũng phải tự tay xử lý đúng hai điều kiện này.
   */
  const appActive = useRef(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { appActive.current = s === 'active'; });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isFocused || activated || !requested) return;
    const t = setInterval(() => { if (appActive.current) void loadState(); }, POLL_MS);
    return () => clearInterval(t);
  }, [isFocused, activated, requested, loadState]);

  /**
   * Realtime: quản lý vừa ký OTP thì màn này đổi ngay, không phải đợi hết nhịp poll.
   *
   * Poll ở trên vẫn giữ làm lưới đỡ — WebSocket rớt (đổi mạng, app vừa từ nền lên) thì
   * không có gì báo, mà đây đúng là lúc hai người đang đứng nhìn màn hình chờ nhau.
   */
  useBillingRealtime({
    enabled: !activated && requested,
    onEvent: (e) => {
      if (e.contractId !== contractId) return;
      if (e.event !== 'CONTRACT_CONFIRM_PROGRESS' && e.event !== 'CONTRACT_ACTIVATED') return;
      void loadState();
    },
  });

  // Xong cả hai bên → mở đường vào app.
  useEffect(() => {
    if (!activated) return;
    void refreshPendingConfirm();
  }, [activated, refreshPendingConfirm]);

  // ── Hành động ───────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (sending) return;
    setSending(true);
    try {
      await contractConfirmService.sendConfirmOtp(contractId);
      setRequested(true);
      startCooldown();
      showAlert(
        'Đã gửi mã xác nhận',
        'Bạn và quản lý mỗi người nhận một mã RIÊNG. Hai bên cùng nhập đúng thì hợp đồng có hiệu lực.',
        undefined,
        '📩',
      );
      await loadState();
    } catch (err: any) {
      showAlert('Chưa gửi được mã', readErr(err, 'Không gửi được mã xác nhận. Thử lại sau giúp nhé.'));
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async () => {
    if (confirming) return;
    if (otp.trim().length !== OTP_LENGTH) {
      showAlert('Mã chưa đúng định dạng', `Mã xác nhận gồm ${OTP_LENGTH} chữ số.`);
      return;
    }
    setConfirming(true);
    try {
      const s = await contractConfirmService.confirmAsTenant(contractId, otp.trim());
      setState(s);
      setOtp('');

      /**
       * Ghi luôn BIÊN BẢN BÀN GIAO — ô tick ở trên đã bao gồm "đã nhận phòng đúng hiện
       * trạng ghi trên", nên đây là hệ quả trực tiếp của việc khách vừa xác nhận.
       *
       * Chỉ gọi khi HĐ đã `activated`: BE cố ý giữ `POST /handover/acknowledge` chỉ nhận
       * HĐ ACTIVE (xem doc BE-NEED-cho-xem-bien-ban-ban-giao-khi-HD-con-PENDING). Gọi sớm
       * là ghi biên bản "đã nhận phòng" cho một hợp đồng có thể không bao giờ có hiệu lực
       * — quản lý chưa nhập mã của họ, hoặc bỏ ngang.
       *
       * Nuốt lỗi: hợp đồng ĐÃ có hiệu lực rồi, đó mới là việc chính. Hỏng bước này thì
       * khách vẫn xác nhận lại được ở màn chi tiết hợp đồng, không đáng để hiện một hộp
       * lỗi đỏ ngay sau tin vui.
       */
      if (s.activated) {
        realTenantSelfService.acknowledgeHandover(contractId).catch(() => { /* xem chú thích */ });
      } else {
        showAlert(
          'Đã ghi nhận xác nhận của bạn',
          'Còn chờ quản lý nhập mã của họ là hợp đồng có hiệu lực.',
          undefined,
          '✅',
        );
      }
    } catch (err: any) {
      showAlert('Xác nhận không thành công', readErr(err, 'Mã xác nhận không đúng hoặc đã hết hạn.'));
    } finally {
      setConfirming(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading || !contract) {
    return (
      <SafeAreaView style={base.safeArea}>
        <View style={base.header}>
          <View style={{ width: 80 }} />
          <Text style={base.headerTitle}>Xác nhận hợp đồng</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={base.safeArea}>
      {/* Không có nút Quay lại: khách vào đây bằng cổng chặn, chưa xác nhận thì chưa
          vào app được. Lối ra duy nhất là xác nhận xong, hoặc đăng xuất. */}
      <View style={base.header}>
        <View style={{ width: 80 }} />
        <Text style={base.headerTitle}>Xác nhận hợp đồng</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={base.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.introBanner}>
          <Text style={styles.introTitle}>📄 Vui lòng đọc kỹ hợp đồng</Text>
          <Text style={styles.introText}>
            Sau khi bạn và quản lý cùng xác nhận bằng mã OTP, hợp đồng sẽ chính thức có
            hiệu lực và bạn được nhận phòng.
          </Text>
        </View>

        <ContractDetailBody
          contract={contract}
          detailDto={detailDto}
          handover={handover}
          onImagePress={setViewerImage}
        />

        {contract.pdfUrl && (
          <View style={base.actionSection}>
            <TouchableOpacity
              style={base.actionBtnSecondary}
              onPress={() => Linking.openURL(contract.pdfUrl!)}
            >
              <Text style={base.actionBtnSecondaryText}>📥 Xem bản PDF đầy đủ</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.confirmCard}>
          {activated ? (
            <>
              <Text style={styles.doneTitle}>🎉 Hợp đồng đã có hiệu lực</Text>
              <Text style={styles.doneText}>
                Chúc bạn ở vui vẻ! Từ giờ bạn xem hoá đơn và gửi yêu cầu ngay trong app.
              </Text>
              <TouchableOpacity
                style={base.actionBtnPrimary}
                onPress={() => { void refreshPendingConfirm(); navigation.reset({ index: 0, routes: [{ name: 'TenantTabs' }] }); }}
              >
                <Text style={base.actionBtnPrimaryText}>Vào trang chủ</Text>
              </TouchableOpacity>
            </>
          ) : tenantDone ? (
            <>
              <Text style={styles.stepTitle}>✅ Bạn đã xác nhận</Text>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.waitText}>Đang chờ quản lý nhập mã của họ…</Text>
              </View>
              <Text style={styles.hintText}>
                Quản lý đang ở cùng bạn — nhắc họ mở app và nhập mã vừa nhận là xong.
              </Text>
            </>
          ) : requested ? (
            <>
              <Text style={styles.stepTitle}>Nhập mã xác nhận của bạn</Text>
              <Text style={styles.hintText}>
                Mã gồm {OTP_LENGTH} chữ số. Quản lý nhận một mã KHÁC — đừng nhập nhầm mã của họ.
              </Text>
              <TextInput
                style={styles.otpInput}
                value={otp}
                onChangeText={t => setOtp(t.replace(/[^\d]/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                placeholder="••••••"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
              />
              <TouchableOpacity
                style={[base.actionBtnPrimary, (confirming || otp.length !== OTP_LENGTH) && styles.btnDisabled]}
                onPress={handleConfirm}
                disabled={confirming || otp.length !== OTP_LENGTH}
              >
                {confirming
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={base.actionBtnPrimaryText}>Xác nhận hợp đồng</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleSendOtp}
                disabled={cooldown > 0 || sending}
              >
                <Text style={[styles.resendText, (cooldown > 0 || sending) && styles.resendTextOff]}>
                  {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Đồng ý với hợp đồng</Text>
              <TouchableOpacity
                style={styles.agreeRow}
                onPress={() => setAgreed(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                  {agreed && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                {/*
                  Câu tick bao GỘP CẢ HAI việc (01/09/2026): đồng ý hợp đồng, và xác nhận
                  hiện trạng lúc nhận phòng. Trước đây hiện trạng phải xác nhận riêng ở màn
                  "Biên bản bàn giao" — sau khi khách đã dọn vào ở rồi mới được hỏi "phòng
                  lúc nhận có đúng không", nên lần ký thứ hai đó thành thủ tục cho có.
                  Ngoài đời chỉ có một thời điểm: quản lý bàn giao, khách kiểm tra rồi ký.
                */}
                <Text style={styles.agreeText}>
                  Tôi đã đọc và đồng ý với toàn bộ nội dung hợp đồng ở trên, và xác nhận
                  đã nhận phòng đúng hiện trạng và chỉ số điện nước ghi trên.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[base.actionBtnPrimary, (!agreed || sending) && styles.btnDisabled]}
                onPress={handleSendOtp}
                disabled={!agreed || sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={base.actionBtnPrimaryText}>Gửi OTP xác nhận</Text>}
              </TouchableOpacity>
              <Text style={styles.hintText}>
                Bấm gửi thì bạn và quản lý mỗi người nhận một mã riêng.
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      <ImageViewerModal url={viewerImage} onClose={() => setViewerImage(null)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  introBanner: {
    marginHorizontal: Spacing.base, marginTop: Spacing.base,
    padding: Spacing.base, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  introTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  introText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  confirmCard: {
    marginHorizontal: Spacing.base, marginBottom: 40,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, gap: Spacing.md, ...Shadow.md,
  },
  stepTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  hintText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },

  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: Colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  agreeText: { flex: 1, fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },

  otpInput: {
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, fontSize: 24, fontWeight: '800',
    letterSpacing: 8, color: Colors.textPrimary, backgroundColor: Colors.background,
  },

  btnDisabled: { opacity: 0.5 },

  resendBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  resendText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  resendTextOff: { color: Colors.textMuted },

  waitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  waitText: { fontSize: 14, color: Colors.textSecondary, flex: 1 },

  doneTitle: { fontSize: 17, fontWeight: '800', color: Colors.success, textAlign: 'center' },
  doneText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
