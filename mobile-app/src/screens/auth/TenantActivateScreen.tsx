import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, ScrollView, Platform,
  TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Brand, Spacing, BorderRadius } from '@/constants';
import { BrandField } from '@/components/common';
import { useAuth, useOtpCooldown, RESEND_COOLDOWN_SEC } from '@/hooks';
import { realAuthService } from '@/services/auth/realAuthService';
import { isAccountEndedError, TENANT_ACCOUNT_ENDED_TITLE } from '@/services/tenant/accountAccess';
import { showAlert } from '@/utils';

const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

/**
 * Kích hoạt tài khoản khách thuê lần đầu: SĐT -> OTP -> tự đặt mật khẩu.
 * Thay cho mật khẩu mặc định cũ (BE giờ tạo password random, không phát cho khách).
 * Xem docs/FE-tenant-account-activation.md (repo BE) — 3 API dưới /auth/tenant-activate/**.
 *
 * ─── Thiết kế (làm lại 10/09/2026) ─────────────────────────────────────────────
 * Đổi tông chàm sang bảng `Brand` cho khớp logo, cùng ngôn ngữ với màn Đăng nhập.
 *
 * Thêm THANH BƯỚC ở đầu màn. Đây là luồng ba bước nhưng bản trước không nói ra ở đâu cả:
 * khách nhập số điện thoại xong bị nhảy sang ô OTP mà không biết còn mấy chặng nữa, và
 * nút "← Quay lại" thì lúc lùi một bước, lúc thoát hẳn màn — cùng một nút, hai hành vi,
 * không có gì báo trước. Có thanh bước thì cả hai chuyện đó tự sáng ra.
 *
 * Emoji 🔑 64px đổi thành ô biểu tượng bo tròn: emoji hiển thị mỗi hệ điều hành một kiểu
 * (và trên Android hay rơi về bản vẽ khác hẳn), không phải thứ nên đặt làm hình chính.
 */

const STEPS = ['Số điện thoại', 'Mã OTP', 'Mật khẩu'] as const;
type Step = 'phone' | 'otp' | 'password';
const STEP_INDEX: Record<Step, number> = { phone: 0, otp: 1, password: 2 };

/** Ba vạch ngang: vạch đã qua và vạch đang đứng tô xanh, vạch chưa tới để xám. */
const StepBar: React.FC<{ current: number }> = ({ current }) => (
  <View style={s.stepWrap}>
    <View style={s.stepBars}>
      {STEPS.map((label, i) => (
        <View
          key={label}
          style={[s.stepBar, i <= current ? s.stepBarOn : s.stepBarOff]}
        />
      ))}
    </View>
    <Text style={s.stepText}>
      Bước {current + 1}/{STEPS.length} · {STEPS[current]}
    </Text>
  </View>
);

export const TenantActivateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { activateTenant } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState<string>(route.params?.phone ?? '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  /** Hiện/ẩn cho CẢ HAI ô mật khẩu — xem chú thích ở chỗ dùng. */
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown(RESEND_COOLDOWN_SEC);

  const validatePhone = (): boolean => {
    if (!/^[0-9]{10}$/.test(phone.trim())) {
      showAlert('Lỗi', 'Vui lòng nhập số điện thoại hợp lệ (10 số).');
      return false;
    }
    return true;
  };

  const handleCheckPhone = async () => {
    if (!validatePhone()) return;
    setLoading(true);
    try {
      const res = await realAuthService.tenantActivateCheck(phone.trim());
      if (res.status === 'NEEDS_ACTIVATION') {
        await realAuthService.tenantActivateSendOtp(phone.trim());
        startCooldown();
        setStep('otp');
      } else if (res.status === 'READY_TO_LOGIN') {
        showAlert('Đã kích hoạt', res.message || 'Tài khoản đã kích hoạt. Vui lòng đăng nhập.', [
          { text: 'OK', onPress: () => navigation.navigate('Login', { phone: phone.trim() }) },
        ]);
      } else {
        // NOT_FOUND / NOT_ELIGIBLE — hiện đúng message BE, không gửi OTP
        showAlert('Không thể kích hoạt', res.message || 'Vui lòng liên hệ quản lý.');
      }
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không kiểm tra được số điện thoại. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await realAuthService.tenantActivateSendOtp(phone.trim());
      startCooldown();
      showAlert('Đã gửi lại mã', 'Mã OTP mới đã được gửi.');
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không gửi lại được mã OTP.'));
    } finally {
      setLoading(false);
    }
  };

  const handleContinueOtp = () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      showAlert('Lỗi', 'Vui lòng nhập đủ mã OTP gồm 6 chữ số.');
      return;
    }
    setStep('password');
  };

  const handleActivate = async () => {
    if (newPassword.length < 6) {
      showAlert('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Lỗi', 'Mật khẩu xác nhận không khớp.');
      return;
    }
    setLoading(true);
    try {
      await activateTenant(phone.trim(), otp.trim(), newPassword, confirmPassword);
      // Thành công: token đã lưu + user đã set trong context, RootNavigator tự chuyển vào app.
    } catch (err: any) {
      if (isAccountEndedError(err)) {
        showAlert(TENANT_ACCOUNT_ENDED_TITLE, err.message, undefined, '👋');
        return;
      }
      showAlert('Kích hoạt thất bại', err?.message || 'Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const goBackStep = () => {
    if (step === 'otp') setStep('phone');
    else if (step === 'password') setStep('otp');
    else navigation.goBack();
  };

  /** Nút chính đổi cả nhãn lẫn việc theo bước — gom một chỗ để phần JSX chỉ còn một nút. */
  const primary: { label: string; onPress: () => void; busy: boolean } =
    step === 'phone'
      ? { label: 'Tiếp tục', onPress: handleCheckPhone, busy: loading }
      : step === 'otp'
        ? { label: 'Xác nhận mã', onPress: handleContinueOtp, busy: false }
        : { label: 'Hoàn tất kích hoạt', onPress: handleActivate, busy: loading };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.flex}
      >
        <View style={s.topBar}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={goBackStep}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="arrow-back" size={20} color={Brand.greenDark} />
            <Text style={s.backText}>{step === 'phone' ? 'Đăng nhập' : 'Bước trước'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepBar current={STEP_INDEX[step]} />

          <View style={s.header}>
            <View style={s.iconTile}>
              <MaterialIcons
                name={step === 'phone' ? 'vpn-key' : step === 'otp' ? 'sms' : 'lock-reset'}
                size={30}
                color={Brand.greenDark}
              />
            </View>
            <Text style={s.title}>
              {step === 'phone' ? 'Kích hoạt tài khoản'
                : step === 'otp' ? 'Nhập mã xác nhận'
                  : 'Tạo mật khẩu'}
            </Text>
            <Text style={s.subtitle}>
              {step === 'phone' && 'Nhập số điện thoại trên hợp đồng thuê để kích hoạt tài khoản lần đầu.'}
              {step === 'otp' && `Mã 6 số đã gửi tới ${phone}. Nhập mã để xác nhận số điện thoại này là của bạn.`}
              {step === 'password' && 'Đặt mật khẩu riêng cho tài khoản. Từ lần sau bạn đăng nhập bằng mật khẩu này.'}
            </Text>
          </View>

          <View style={s.form}>
            {step === 'phone' && (
              <BrandField
                label="Số điện thoại"
                icon="phone-iphone"
                placeholder="Ví dụ: 0901234567"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                hint="Đúng số đã ghi trên hợp đồng thuê."
              />
            )}

            {step === 'otp' && (
              <>
                <BrandField
                  label="Mã OTP"
                  placeholder="------"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleContinueOtp}
                  // Ô này KHÔNG có biểu tượng bên trái: sáu chữ số phải nằm giữa ô mới đọc
                  // ra được thành từng cặp, thêm icon là lệch tâm và mất luôn tác dụng đó.
                  inputStyle={s.otpInput}
                />
                <TouchableOpacity
                  style={s.resendBtn}
                  onPress={handleResendOtp}
                  disabled={cooldown > 0 || loading}
                >
                  <Text style={[s.resendText, cooldown > 0 && s.resendTextOff]}>
                    {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Chưa nhận được mã? Gửi lại'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === 'password' && (
              <>
                {/*
                  MỘT nút "Hiện" điều khiển cả hai ô, không phải mỗi ô một nút.
                  Việc của khách ở đây là đối chiếu hai ô có khớp nhau không — bật/tắt
                  riêng từng ô thì vẫn phải nhớ ô kia gõ gì, đúng cái mà nút này sinh ra
                  để khỏi phải làm. Cùng cách hiển thị với màn Đăng nhập.
                */}
                <BrandField
                  label="Mật khẩu mới"
                  icon="lock-outline"
                  placeholder="Ít nhất 6 ký tự"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  right={(
                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility-off' : 'visibility'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                />
                <BrandField
                  label="Xác nhận mật khẩu"
                  icon="lock-outline"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  // Báo lệch NGAY khi đang gõ, đừng đợi bấm nút rồi bật hộp thoại: sai ở đây
                  // gần như luôn là gõ nhầm một ký tự, thấy sớm thì sửa một ký tự là xong.
                  error={
                    confirmPassword.length > 0 && confirmPassword !== newPassword
                      ? 'Hai mật khẩu chưa khớp'
                      : undefined
                  }
                />
              </>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, primary.busy && s.primaryBtnBusy]}
              onPress={primary.onPress}
              disabled={primary.busy}
              activeOpacity={0.85}
            >
              {primary.busy
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={s.primaryBtnText}>{primary.label}</Text>}
            </TouchableOpacity>

            <Text style={s.help}>
              Không kích hoạt được? <Text style={s.helpStrong}>Liên hệ quản lý toà nhà</Text> để được hỗ trợ.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing['3xl'] },

  topBar: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { color: Brand.greenDark, fontWeight: '700', fontSize: 15 },

  // ── Thanh bước ───────────────────────────────────────────────────────────
  stepWrap: { marginTop: Spacing.sm, marginBottom: Spacing.xl },
  stepBars: { flexDirection: 'row', gap: Spacing.sm },
  stepBar: { flex: 1, height: 4, borderRadius: 2 },
  stepBarOn: { backgroundColor: Brand.green },
  stepBarOff: { backgroundColor: Colors.divider },
  stepText: {
    marginTop: Spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },

  // ── Đầu màn ──────────────────────────────────────────────────────────────
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Brand.greenTint,
    borderWidth: 1,
    borderColor: 'rgba(67, 182, 73, 0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },

  // ── Form ─────────────────────────────────────────────────────────────────
  form: { width: '100%' },
  otpInput: {
    textAlign: 'center',
    letterSpacing: 10,
    fontSize: 24,
    fontWeight: '700',
  },
  resendBtn: { alignSelf: 'center', paddingVertical: Spacing.sm, marginBottom: Spacing.xs },
  resendText: { color: Brand.greenDark, fontWeight: '700', fontSize: 14 },
  resendTextOff: { color: Colors.textMuted, fontWeight: '600' },

  primaryBtn: {
    marginTop: Spacing.md,
    height: 54,
    borderRadius: BorderRadius.lg,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Brand.greenDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryBtnBusy: { opacity: 0.75 },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white, letterSpacing: 0.2 },

  help: {
    marginTop: Spacing.xl,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  helpStrong: { color: Colors.textPrimary, fontWeight: '700' },
});
