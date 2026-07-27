import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { Button, Input } from '@/components/common';
import { useAuth } from '@/hooks';
import { useNavigation } from '@react-navigation/native';
import { realAuthService } from '@/services/auth/realAuthService';
import { showAlert } from '@/utils';

const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

// Màn này giờ chỉ còn áp dụng cho role KHÔNG phải tenant (manager/owner cấp mật khẩu tạm
// khi tạo tài khoản) — tenant lần đầu đã bị BE chặn login trước khi tới được màn này,
// phải qua TenantActivateScreen (SĐT + OTP + tự đặt mật khẩu), không còn mật khẩu mặc định.
export const ChangePasswordScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword) {
      return showAlert('Lỗi', 'Vui lòng nhập mật khẩu tạm thời đã được cấp.');
    }
    if (newPassword.length < 6) {
      return showAlert('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }
    if (newPassword !== confirmPassword) {
      return showAlert('Lỗi', 'Mật khẩu xác nhận không khớp.');
    }
    if (newPassword === currentPassword) {
      return showAlert('Lỗi', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    setLoading(true);
    try {
      await realAuthService.changePassword(currentPassword, newPassword, confirmPassword);
      // BE đã set is_first_login=false. Sang Tutorial; Tutorial sẽ clear cờ isFirstLogin ở client.
      navigation.navigate('Tutorial');
    } catch (err: any) {
      showAlert('Đổi mật khẩu thất bại', readErr(err, 'Không đổi được mật khẩu. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🔒</Text>
          <Text style={styles.title}>Đổi mật khẩu</Text>
          <Text style={styles.subtitle}>
            Xin chào <Text style={{fontWeight: 'bold', color: Colors.primary}}>{user?.fullName}</Text>, đây là lần đầu bạn đăng nhập. 
            Vui lòng đổi mật khẩu để bảo vệ tài khoản của bạn.
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Mật khẩu hiện tại"
            placeholder="Mật khẩu tạm thời đã được cấp"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <Input
            label="Mật khẩu mới"
            placeholder="Nhập mật khẩu mới"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <Input
            label="Xác nhận mật khẩu mới"
            placeholder="Nhập lại mật khẩu mới"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Button
            title="Đổi mật khẩu & Tiếp tục"
            onPress={handleSubmit}
            loading={loading}
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.white },
  container: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  emoji: { fontSize: 64, marginBottom: Spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md },
  form: { width: '100%' },
});
