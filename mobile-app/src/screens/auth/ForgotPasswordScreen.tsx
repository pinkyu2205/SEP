import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { Button, Input } from '@/components/common';
import { useNavigation } from '@react-navigation/native';

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  
  const [step, setStep] = useState<'phone' | 'otp' | 'new_password'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOTP = () => {
    if (!phone.trim() || !/^[0-9]{10}$/.test(phone.trim())) {
      return showAlert('Lỗi', 'Vui lòng nhập số điện thoại hợp lệ (10 số).');
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('otp');
      showAlert('Thành công', 'Mã OTP đã được gửi đến số điện thoại của bạn (Mock: 123456)');
    }, 1000);
  };

  const handleVerifyOTP = () => {
    if (otp !== '123456') {
      return showAlert('Lỗi', 'Mã OTP không hợp lệ. Vui lòng thử lại (Mock: 123456).');
    }
    setStep('new_password');
  };

  const handleResetPassword = () => {
    if (newPassword.length < 6) {
      return showAlert('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }
    if (newPassword !== confirmPassword) {
      return showAlert('Lỗi', 'Mật khẩu xác nhận không khớp.');
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      showAlert('Thành công 🎉', 'Mật khẩu của bạn đã được đặt lại thành công. Vui lòng đăng nhập lại.', [
        { text: 'Đăng nhập ngay', onPress: () => navigation.navigate('Login') }
      ]);
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Quên mật khẩu</Text>
          <Text style={styles.subtitle}>
            {step === 'phone' && 'Nhập số điện thoại đã đăng ký để nhận mã OTP khôi phục mật khẩu.'}
            {step === 'otp' && `Chúng tôi đã gửi mã OTP 6 số đến SĐT ${phone}.`}
            {step === 'new_password' && 'Vui lòng đặt mật khẩu mới cho tài khoản của bạn.'}
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
              />
              <Button
                title="Gửi mã OTP"
                onPress={handleSendOTP}
                loading={loading}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}

          {step === 'otp' && (
            <>
              <Input
                label="Mã OTP (Nhập 123456)"
                placeholder="------"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: 5, fontSize: 24 }}
              />
              <Button
                title="Xác thực OTP"
                onPress={handleVerifyOTP}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}

          {step === 'new_password' && (
            <>
              <Input
                label="Mật khẩu mới"
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Input
                label="Xác nhận mật khẩu"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Button
                title="Đặt lại mật khẩu"
                onPress={handleResetPassword}
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
});
