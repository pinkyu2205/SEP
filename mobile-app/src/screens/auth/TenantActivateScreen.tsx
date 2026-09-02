import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { Button, Input } from '@/components/common';
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
 */
export const TenantActivateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { activateTenant } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp' | 'password'>('phone');
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={goBackStep}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Kích hoạt tài khoản</Text>
          <Text style={styles.subtitle}>
            {step === 'phone' && 'Nhập số điện thoại trên hợp đồng thuê để kích hoạt tài khoản lần đầu.'}
            {step === 'otp' && `Mã OTP đã được gửi đi. Nhập mã 6 số để xác nhận số điện thoại ${phone}.`}
            {step === 'password' && 'Tạo mật khẩu mới cho tài khoản của bạn.'}
          </Text>
        </View>

        <View style={styles.form}>
          {step === 'phone' && (
            <>
              <Input
                label="Số điện thoại"
                placeholder="Ví dụ: 0901234567"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
              />
              <Button title="Tiếp tục" onPress={handleCheckPhone} loading={loading} style={{ marginTop: Spacing.lg }} />
            </>
          )}

          {step === 'otp' && (
            <>
              <Input
                label="Mã OTP"
                placeholder="------"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: 5, fontSize: 24 }}
              />
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleResendOtp}
                disabled={cooldown > 0 || loading}
              >
                <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
                  {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã OTP'}
                </Text>
              </TouchableOpacity>
              <Button title="Tiếp tục" onPress={handleContinueOtp} style={{ marginTop: Spacing.lg }} />
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
              <Input
                label="Mật khẩu mới"
                placeholder="Ít nhất 6 ký tự"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                rightIcon={
                  <TouchableOpacity
                    onPress={() => setShowPassword(v => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.showPasswordText}>{showPassword ? 'Ẩn' : 'Hiện'}</Text>
                  </TouchableOpacity>
                }
              />
              <Input
                label="Xác nhận mật khẩu"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Button
                title="Hoàn tất kích hoạt"
                onPress={handleActivate}
                loading={loading}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.white },
  container: { flex: 1, padding: Spacing.xl },
  backBtn: { marginBottom: Spacing.xl, alignSelf: 'flex-start' },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 16 },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  emoji: { fontSize: 64, marginBottom: Spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md },
  form: { width: '100%' },
  resendBtn: { alignSelf: 'center', marginTop: Spacing.md, padding: Spacing.sm },
  resendText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  resendTextDisabled: { color: Colors.textMuted },
  showPasswordText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
