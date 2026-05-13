import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Button, Input } from '../../components/common';
import { useAuth } from '../../hooks';
import { useNavigation } from '@react-navigation/native';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { phone?: string; password?: string } = {};
    if (!phone.trim()) {
      newErrors.phone = 'Vui lòng nhập số điện thoại';
    } else if (!/^[0-9]{10}$/.test(phone.trim())) {
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
      Alert.alert(
        'Đăng nhập thất bại',
        error.message || 'Sai số điện thoại hoặc mật khẩu. Vui lòng thử lại.'
      );
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
        {/* Header / Branding */}
        <View style={styles.brandSection}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoEmoji}>🏠</Text>
          </View>
          <Text style={styles.appName}>RoomRent</Text>
          <Text style={styles.appSlogan}>Quản lý phòng trọ thông minh</Text>
        </View>

        {/* Demo Credentials Info */}
        <View style={styles.demoBox}>
          <Text style={styles.demoText}><Text style={{fontWeight: 'bold'}}>Admin:</Text> 0999999999 / admin123</Text>
          <Text style={styles.demoText}><Text style={{fontWeight: 'bold'}}>Manager:</Text> 0909876543 / manager123</Text>
          <Text style={styles.demoText}><Text style={{fontWeight: 'bold'}}>Tenant cũ:</Text> 0901234567 / tenant123</Text>
          <Text style={styles.demoText}><Text style={{fontWeight: 'bold'}}>Tenant mới:</Text> 0888888888 / 123456</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Đăng nhập</Text>

          <Input
            label="Số điện thoại"
            placeholder="090..."
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
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
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Chưa có tài khoản?{' '}
            <Text style={styles.footerLink}>Liên hệ quản lý</Text>
          </Text>
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
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  logoEmoji: {
    fontSize: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
  },
  appSlogan: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: Spacing.xs,
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
    fontSize: 13,
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
});
