import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

/**
 * Màn hình thành công sau khi hoàn tất onboarding tenant (xác nhận OTP).
 * Hiển thị thông tin hợp đồng + tài khoản khách, nút "Về trang chủ".
 *
 * route.params:
 *  - contractCode, tenantFullName, roomNumber?, phone
 *  - accountCreated?: boolean  // true = vừa tạo tài khoản mới
 *  - rolePromoted?: boolean    // true = vừa nâng ROLE_USER -> ROLE_TENANT
 *  - username?: string         // username đăng nhập (mặc định = SĐT)
 */
export const OnboardingSuccessScreen: React.FC<any> = ({ navigation, route }) => {
  const {
    contractCode,
    tenantFullName,
    roomNumber,
    phone,
    accountCreated,
    rolePromoted,
    username,
  } = route?.params ?? {};

  const loginUsername = username || phone;
  // Nếu BE chưa trả accountCreated/rolePromoted, suy luận: có rolePromoted hoặc không tạo mới => tài khoản đã tồn tại
  const isNewAccount = accountCreated === true;

  const goHome = () =>
    navigation.reset({ index: 0, routes: [{ name: 'ManagerTabs' }] });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>✓</Text>
        </View>

        <Text style={styles.title}>Hoàn tất khởi tạo 🎉</Text>
        <Text style={styles.subtitle}>
          Đã hoàn tất hợp đồng cho khách thuê. Khách có thể đăng nhập app để theo dõi hoá đơn,
          thanh toán và gửi yêu cầu sửa chữa.
        </Text>

        <View style={styles.card}>
          <Row label="Mã hợp đồng" value={contractCode || '—'} />
          <Row label="Khách thuê" value={tenantFullName || '—'} />
          {!!roomNumber && <Row label="Phòng" value={String(roomNumber)} />}
        </View>

        <Text style={styles.sectionLabel}>Thông tin tài khoản khách</Text>
        <View style={[styles.card, styles.accountCard]}>
          {isNewAccount ? (
            <>
              <Row label="Tài khoản" value={loginUsername || '—'} />
              <Row label="Mật khẩu mặc định" value="123456" />
              <Text style={styles.note}>
                Tài khoản mới đã được tạo. Nhắc khách đổi mật khẩu sau lần đăng nhập đầu tiên.
              </Text>
            </>
          ) : (
            <>
              <Row label="Tài khoản" value={loginUsername || '—'} />
              <Text style={styles.note}>
                {rolePromoted
                  ? `Tài khoản ${loginUsername} đã được cấp quyền Tenant — khách đăng nhập bằng mật khẩu hiện có.`
                  : `Tài khoản ${loginUsername} đã có trong hệ thống — khách đăng nhập bằng mật khẩu hiện có.`}
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.homeBtn} onPress={goHome} activeOpacity={0.85}>
          <Text style={styles.homeBtnText}>Về trang chủ</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, alignItems: 'center', paddingBottom: Spacing.xl },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.successLight,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xl, marginBottom: Spacing.lg,
  },
  iconText: { fontSize: 44, color: Colors.success, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.lg, lineHeight: 20, paddingHorizontal: Spacing.sm,
  },
  card: {
    width: '100%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, ...Shadow.sm,
  },
  accountCard: { borderColor: Colors.primaryLight, backgroundColor: Colors.primaryBg },
  sectionLabel: {
    alignSelf: 'flex-start', fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    marginTop: Spacing.lg, marginBottom: Spacing.sm, textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: Colors.textSecondary },
  rowValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: Spacing.md },
  note: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.sm, lineHeight: 18 },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.white },
  homeBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center' },
  homeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
