import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { Button, Input } from '@/components/common';
import { useAuth } from '@/hooks';
import { useNavigation } from '@react-navigation/native';

export const ChangePasswordScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    if (newPassword.length < 6) {
      return Alert.alert('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp.');
    }

    setLoading(true);
    // Mock API call
    setTimeout(() => {
      setLoading(false);
      // Điều hướng thẳng sang màn hình Tutorial thay vì trang chủ
      navigation.navigate('Tutorial');
    }, 1000);
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
