import { Platform } from 'react-native';
// CHỈ import KIỂU — không nạp module lúc chạy (tránh Expo Go in ERROR/WARN khi import).
import type * as NotificationsModule from 'expo-notifications';
import realApiClient from '@/services/core/realApiClient';
import { API_CONFIG } from '@/constants/api';
import { setupAndroidChannel, isExpoGo } from '@/services/core/notifications';

/**
 * Lấy EXPO PUSH TOKEN và gửi lên BE lưu vào user hiện tại.
 * Gọi sau khi đăng nhập (cả tenant lẫn manager). Best-effort: lỗi không chặn đăng nhập.
 *
 * BE dùng token này để gọi Expo Push API (exp.host) — xem doc/BE-notifications-setup.md.
 * Lưu ý: Expo push token CHỈ hoạt động trên development/production build + thiết bị thật,
 * KHÔNG chạy trên Expo Go (SDK mới) hay emulator.
 */
async function getExpoToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null; // web không hỗ trợ push kiểu này
  if (isExpoGo) return null; // Expo Go (SDK 53+) đã gỡ remote push -> bỏ qua, tránh log lỗi

  // Lazy require: chỉ nạp expo-notifications khi thật sự cần (đã chắc chắn không phải Expo Go).
  const Notifications = require('expo-notifications') as typeof NotificationsModule;

  await setupAndroidChannel();

  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') {
    perm = await Notifications.requestPermissionsAsync();
  }
  if (perm.status !== 'granted') return null;

  const projectId = API_CONFIG.EAS_PROJECT_ID;
  if (!projectId) {
    console.warn('[push] Thiếu EXPO_PUBLIC_EAS_PROJECT_ID trong .env — bỏ qua đăng ký push token.');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch (e) {
    console.warn('[push] Không lấy được Expo push token:', e);
    return null;
  }
}

/**
 * Đăng ký token lên BE (gọi sau khi login).
 *
 * Body PHẢI là `{ pushToken }` — BE (PushTokenRequest) khai @NotBlank đúng tên field
 * này; gửi tên khác là 400 "Thiếu push token" và máy sẽ không nhận được thông báo nào.
 * `platform` BE chưa dùng, gửi kèm để sau này phân biệt iOS/Android.
 */
export async function registerPushToken(): Promise<void> {
  try {
    const token = await getExpoToken();
    if (!token) return;
    await realApiClient.post('/api/v1/user/me/push-token', {
      pushToken: token,
      platform: Platform.OS, // 'ios' | 'android'
    });
  } catch {
    // không chặn flow đăng nhập
  }
}

/**
 * Gỡ token khỏi BE (gọi TRƯỚC khi xoá accessToken lúc logout) để máy đã đăng xuất
 * không còn nhận thông báo của tài khoản cũ.
 *
 * BE đã có `DELETE /api/v1/user/me/push-token` từ 08/08/2026 (bảng `user_push_tokens`,
 * 1 tài khoản nhiều máy):
 *   • CÓ body `{ pushToken }` → gỡ đúng máy đó
 *   • KHÔNG body            → gỡ mọi máy của tài khoản
 *
 * Gửi kèm token khi lấy được để không đá văng các máy khác của cùng người dùng.
 * ⚠️ Lấy token KHÔNG được là điều kiện chặn: trước đây hàm này gọi `getExpoToken()`
 * rồi `return` sớm khi null, nên trên máy chưa cấp quyền / chưa cấu hình push thì
 * lệnh DELETE KHÔNG BAO GIỜ chạy và token cũ ở lại BE vĩnh viễn. Giờ vẫn gọi DELETE
 * không body — coi như đăng xuất khỏi mọi máy, đúng ý người dùng hơn là im lặng bỏ qua.
 */
export async function unregisterPushToken(): Promise<void> {
  let token: string | null = null;
  try {
    token = await getExpoToken();
  } catch {
    // bỏ qua — vẫn phải gọi DELETE bên dưới
  }
  try {
    await realApiClient.delete('/api/v1/user/me/push-token', {
      data: token ? { pushToken: token } : undefined,
    });
  } catch {
    // best-effort: lỗi mạng lúc logout không được chặn việc đăng xuất
  }
}
