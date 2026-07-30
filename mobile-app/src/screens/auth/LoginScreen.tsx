import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { Button, Input } from '@/components/common';
import { useAuth } from '@/hooks';
import { useNavigation, useRoute } from '@react-navigation/native';
import { showAlert } from '@/utils';

// BE (26/07) chặn login cho tenant chưa kích hoạt (isFirstLogin=true) bằng 422 kèm
// message này — bắt đúng chuỗi để đề nghị chuyển sang màn Kích hoạt thay vì chỉ báo lỗi.
const NOT_ACTIVATED_HINT = 'chưa kích hoạt';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { login } = useAuth();
  const [phone, setPhone] = useState<string>(route.params?.phone ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { phone?: string; password?: string } = {};
    const id = phone.trim();
    if (!id) {
      newErrors.phone = 'Vui lòng nhập số điện thoại hoặc tài khoản';
    } else if (/^[0-9]+$/.test(id) && id.length !== 10) {
      // Nếu nhập toàn số -> coi là SĐT, bắt buộc 10 số. Ngược lại coi là username.
      newErrors.phone = 'Số điện thoại không hợp lệ (10 số)';
    }
    if (!password.trim()) {
      newErrors.password = 'Vui lòng nhập mật khẩu';
    } else if (password.length < 6) {
      newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await login(phone.trim(), password);
      // Navigation sẽ tự chuyển sang Home thông qua RootNavigator (dựa vào cờ isFirstLogin và isAuthenticated)
    } catch (error: any) {
      const msg: string = error?.message || 'Sai số điện thoại hoặc mật khẩu. Vui lòng thử lại.';
      if (msg.toLowerCase().includes(NOT_ACTIVATED_HINT)) {
        showAlert('Tài khoản chưa kích hoạt', msg, [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Kích hoạt ngay', onPress: () => navigation.navigate('TenantActivate', { phone: phone.trim() }) },
        ]);
      } else {
        showAlert('Đăng nhập thất bại', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Header / Branding — logo đã có sẵn tên + slogan trong ảnh, không cần Text riêng */}
        <View style={styles.brandSection}>
          <View style={styles.logoCard}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Login Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Đăng nhập</Text>

          <Input
            label="Số điện thoại / Tài khoản"
            placeholder="090... hoặc long2"
            value={phone}
            onChangeText={setPhone}
            autoCapitalize="none"
            error={errors.phone}
          />

          <Input
            label="Mật khẩu"
            placeholder="Nhập mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            error={errors.password}
            rightIcon={
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </Text>
              </TouchableOpacity>
            }
          />

          <TouchableOpacity style={styles.forgotPassword} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
          </TouchableOpacity>

          <Button
            title="Đăng nhập"
            onPress={handleLogin}
            loading={loading}
            size="lg"
            style={styles.loginButton}
          />

          <TouchableOpacity
            style={styles.activateLink}
            onPress={() => navigation.navigate('TenantActivate', { phone: phone.trim() })}
          >
            <Text style={styles.activateLinkText}>
              Lần đầu thuê? <Text style={styles.activateLinkTextBold}>Kích hoạt tài khoản</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Chưa có tài khoản?{' '}
            <Text style={styles.footerLink}>Liên hệ quản lý</Text>
          </Text>
          <TouchableOpacity 
            style={styles.exploreButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.exploreButtonText}>
              ← Khám phá phòng trọ không cần đăng nhập
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  // Branding
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    ...Shadow.md,
  },
  logoImage: {
    width: '100%',
    height: 120,
  },
  // Demo Box
  demoBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  demoText: {
    color: Colors.white,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  // Form Card
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadow.lg,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  showPasswordText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  loginButton: {
    marginTop: Spacing.sm,
  },
  activateLink: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
    padding: Spacing.sm,
  },
  activateLinkText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  activateLinkTextBold: {
    color: Colors.primary,
    fontWeight: '700',
  },
  // Footer
  footer: {
    alignItems: 'center',
    marginTop: Spacing['2xl'],
  },
  footerText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  footerLink: {
    color: Colors.white,
    fontWeight: '700',
  },
  exploreButton: {
    marginTop: Spacing.base,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  exploreButtonText: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '500',
    textAlign: 'center',
  },
});

