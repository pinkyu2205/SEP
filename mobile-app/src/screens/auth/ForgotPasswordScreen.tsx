import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { Button } from '@/components/common';
import { useNavigation } from '@react-navigation/native';

/**
 * Quên mật khẩu — hướng dẫn liên hệ, KHÔNG tự đặt lại được.
 *
 * Backend chưa có endpoint quên mật khẩu / đặt lại mật khẩu (AuthController chỉ có
 * `tenant-activate/send-otp` cho lần kích hoạt đầu tiên). Bản trước của màn này giả lập
 * đủ 3 bước: bấm "Gửi mã OTP" → chờ 1 giây → báo đã gửi, OTP viết cứng là `123456`,
 * rồi hiện "Mật khẩu của bạn đã được đặt lại thành công 🎉" trong khi KHÔNG có request
 * nào rời khỏi máy. Người dùng tin là xong, quay ra đăng nhập bằng mật khẩu mới và
 * không vào được — đó là hỏng nặng hơn cả việc không có tính năng.
 *
 * Khi BE làm xong (POST /auth/forgot-password + /auth/reset-password) thì dựng lại
 * luồng 3 bước ở đây và nối vào API thật.
 */
export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Quên mật khẩu</Text>
          <Text style={styles.subtitle}>
            Hiện chưa thể tự đặt lại mật khẩu trong ứng dụng. Vui lòng liên hệ để được cấp lại.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bạn là khách thuê?</Text>
          <Text style={styles.cardText}>
            Nhắn cho quản lý toà nhà đang phụ trách nơi bạn ở. Quản lý sẽ xác minh và yêu cầu
            cấp lại mật khẩu cho bạn.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bạn là quản lý?</Text>
          <Text style={styles.cardText}>
            Liên hệ quản trị hệ thống để được đặt lại mật khẩu.
          </Text>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Nếu bạn là khách thuê mới và chưa từng đăng nhập, hãy dùng chức năng
            "Kích hoạt tài khoản" ở màn đăng nhập — mã OTP sẽ được gửi tới số điện thoại
            đã đăng ký trong hợp đồng.
          </Text>
        </View>

        <Button
          title="Về màn đăng nhập"
          onPress={() => navigation.navigate('Login')}
          style={{ marginTop: Spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.white },
  container: { padding: Spacing.xl, paddingBottom: Spacing['2xl'] },
  backBtn: { marginBottom: Spacing.xl, alignSelf: 'flex-start' },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 16 },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  emoji: { fontSize: 64, marginBottom: Spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  noteBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  noteText: { fontSize: 13, color: '#92400E', lineHeight: 19 },
});
