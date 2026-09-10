import React, { useState } from 'react';
import { BrandLockup } from '@/components/common/BrandLogo';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import Svg, {
  Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Brand, Spacing, BorderRadius } from '@/constants';
import { BrandField } from '@/components/common';
import { useAuth } from '@/hooks';
import { useNavigation, useRoute } from '@react-navigation/native';
import { showAlert } from '@/utils';
import { isAccountEndedError, TENANT_ACCOUNT_ENDED_TITLE } from '@/services/tenant/accountAccess';

/**
 * MÀN ĐĂNG NHẬP — mặt tiền của thương hiệu Hoàng Bình Land.
 *
 * Bản trước dùng nền chàm `Colors.primary` (#4F46E5) và logo nằm trong một thẻ trắng rộng
 * hết màn. Hai vấn đề: tông chàm không có trong logo, nên màn đầu tiên người dùng thấy lại
 * là màn duy nhất không mang màu thương hiệu; và thẻ trắng to bằng thẻ form bên dưới khiến
 * logo trông như một khối nội dung nữa chứ không phải chữ ký của sản phẩm.
 *
 * Nay nền là `Brand.ink` (đen ngả xanh lá, lấy từ logo) với hai quầng sáng rất nhạt — xanh
 * lá góc trên, đỏ góc dưới. Đỏ và xanh lá cạnh nhau rất dễ thành màu Giáng sinh, nên theo
 * đúng luật của bảng `Brand`: quầng đỏ mờ hơn hẳn quầng xanh, hai quầng nằm hai góc đối
 * diện, và mọi thứ bấm được đều chỉ dùng xanh lá. Đỏ trên màn này chỉ còn sống trong logo
 * và trong chữ báo lỗi — đúng nghĩa "điểm nhấn hiếm".
 *
 * KHÔNG dùng `Button`/`Input` dùng chung: cả hai hard-code `Colors.primary`, kéo tông chàm
 * ngược vào đây. Ô nhập thay bằng `BrandField` — xem lý do trong chính file đó.
 */

// BE (26/07) chặn login cho tenant chưa kích hoạt (isFirstLogin=true) bằng 422 kèm
// message này — bắt đúng chuỗi để đề nghị chuyển sang màn Kích hoạt thay vì chỉ báo lỗi.
const NOT_ACTIVATED_HINT = 'chưa kích hoạt';

/** Nền tối + hai quầng sáng thương hiệu. Vẽ bằng SVG vì dự án không có expo-linear-gradient. */
const Backdrop: React.FC = () => (
  <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
    <Defs>
      <SvgLinearGradient id="base" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#123018" />
        <Stop offset="1" stopColor="#07150C" />
      </SvgLinearGradient>
      <RadialGradient id="glowGreen" cx="0.18" cy="0.1" r="0.8">
        <Stop offset="0" stopColor={Brand.green} stopOpacity="0.45" />
        <Stop offset="1" stopColor={Brand.green} stopOpacity="0" />
      </RadialGradient>
      {/* Nhạt hơn quầng xanh một nửa — đỏ ở độ đậm ngang xanh là ra ngay không khí lễ hội. */}
      <RadialGradient id="glowRed" cx="0.92" cy="0.95" r="0.7">
        <Stop offset="0" stopColor={Brand.red} stopOpacity="0.22" />
        <Stop offset="1" stopColor={Brand.red} stopOpacity="0" />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#base)" />
    <Rect width="100%" height="100%" fill="url(#glowGreen)" />
    <Rect width="100%" height="100%" fill="url(#glowRed)" />
  </Svg>
);

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
      if (isAccountEndedError(error)) {
        // Khách đã trả phòng xong — không phải lỗi sai mật khẩu, nói cho tử tế.
        showAlert(TENANT_ACCOUNT_ENDED_TITLE, msg, undefined, '👋');
      } else if (msg.toLowerCase().includes(NOT_ACTIVATED_HINT)) {
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
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <Backdrop />

      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.flex}
        >
          {/*
            Cuộn được, và `flexGrow: 1` + căn giữa để màn cao vẫn cân giữa như cũ.
            Bản trước là View cứng: bàn phím bật lên trên máy màn nhỏ là nút đăng nhập bị
            đẩy khuất, không cuộn tới được.
          */}
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/*
              Logo vẫn nằm trên nền trắng — chữ đỏ và chữ xanh lá đậm của logo đặt thẳng lên
              nền `ink` là mất tương phản, nhất là chữ B xanh.

              Khác bản cũ ở chỗ thẻ trắng nay VỪA ĐÚNG cỡ logo chứ không kéo rộng hết màn.
              Thẻ cũ to ngang thẻ form bên dưới nên logo đọc như một khối nội dung nữa;
              thu lại thành một tấm nhỏ giữa màn thì nó trở lại đúng vai chữ ký thương hiệu.
              Slogan chuyển ra ngoài, viết bằng chữ hệ thống trên nền tối.
            */}
            <View style={s.brand}>
              <View style={s.logoCard}>
                <BrandLockup width={176} />
              </View>
              <Text style={s.brandSlogan}>Nền tảng quản lý cho thuê</Text>
            </View>

            <View style={s.card}>
              <Text style={s.title}>Đăng nhập</Text>
              <Text style={s.subtitle}>Nhà, hợp đồng và hoá đơn — trong một ứng dụng.</Text>

              <BrandField
                label="Số điện thoại / Tài khoản"
                icon="person-outline"
                placeholder="Nhập số điện thoại hoặc tài khoản"
                value={phone}
                onChangeText={setPhone}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                error={errors.phone}
              />

              <BrandField
                label="Mật khẩu"
                icon="lock-outline"
                placeholder="Nhập mật khẩu"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                error={errors.password}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                right={(
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
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

              <TouchableOpacity
                style={s.forgot}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={s.forgotText}>Quên mật khẩu?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, loading && s.primaryBtnBusy]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={s.primaryBtnText}>Đăng nhập</Text>}
              </TouchableOpacity>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>hoặc</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity
                style={s.activateBtn}
                onPress={() => navigation.navigate('TenantActivate', { phone: phone.trim() })}
                activeOpacity={0.8}
              >
                <MaterialIcons name="how-to-reg" size={18} color={Brand.greenDark} />
                <Text style={s.activateText}>Lần đầu thuê? Kích hoạt tài khoản</Text>
              </TouchableOpacity>
            </View>

            <View style={s.footer}>
              {/* "Liên hệ quản lý" KHÔNG bấm được — bản cũ tô nó như một liên kết nên ai
                  cũng thử bấm và không có gì xảy ra. Giữ nguyên là chữ nhấn mạnh. */}
              <Text style={s.footerText}>
                Chưa có tài khoản? <Text style={s.footerStrong}>Liên hệ quản lý</Text>
              </Text>

              <TouchableOpacity
                style={s.exploreBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <MaterialIcons name="travel-explore" size={18} color={Colors.white} />
                <Text style={s.exploreText}>Xem phòng trọ không cần đăng nhập</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.ink },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing['2xl'],
  },

  // ── Thương hiệu ──────────────────────────────────────────────────────────
  brand: { alignItems: 'center', marginBottom: Spacing.xl },
  logoCard: {
    alignSelf: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
    borderRadius: 26,
    backgroundColor: Colors.white,
    alignItems: 'center',
    // Bóng đổ ăn theo màu xanh thương hiệu, không phải đen — trên nền tối bóng đen
    // gần như tàng hình, còn quầng xanh làm tấm logo trông như đang phát sáng.
    // (Chỉ iOS: Android vẽ bóng theo `elevation` và bỏ qua `shadowColor`, ở đó tấm logo
    // vẫn nổi nhờ nền trắng trên nền tối — mất quầng sáng chứ không hỏng bố cục.)
    shadowColor: Brand.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  brandSlogan: {
    marginTop: Spacing.md,
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    letterSpacing: 0.3,
  },

  // ── Thẻ form ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.white,
    borderRadius: 26,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.4 },
  subtitle: {
    marginTop: 5,
    marginBottom: Spacing.lg,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  forgot: { alignSelf: 'flex-end', paddingVertical: Spacing.xs, marginBottom: Spacing.md },
  forgotText: { fontSize: 13, fontWeight: '700', color: Brand.greenDark },

  // ── Nút chính ────────────────────────────────────────────────────────────
  primaryBtn: {
    height: 54,
    borderRadius: BorderRadius.lg,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Brand.greenDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnBusy: { opacity: 0.75 },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white, letterSpacing: 0.2 },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  dividerText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 48,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Brand.green,
    backgroundColor: Brand.greenTint,
  },
  activateText: { fontSize: 14, fontWeight: '700', color: Brand.greenDark },

  // ── Chân màn ─────────────────────────────────────────────────────────────
  footer: { alignItems: 'center', marginTop: Spacing.xl },
  footerText: { fontSize: 13.5, color: 'rgba(255,255,255,0.72)' },
  footerStrong: { color: Colors.white, fontWeight: '800' },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.base,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  exploreText: { fontSize: 13.5, fontWeight: '600', color: Colors.white },
});
