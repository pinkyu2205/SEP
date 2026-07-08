import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import realApiClient from '@/services/core/realApiClient';
import { API_CONFIG } from '@/constants/api';
import { setupAndroidChannel } from '@/services/core/notifications';

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

/** Đăng ký token lên BE (gọi sau khi login). */
export async function registerPushToken(): Promise<void> {
  try {
    const token = await getExpoToken();
    if (!token) return;
    await realApiClient.post('/api/v1/user/me/push-token', {
      token,
      platform: Platform.OS, // 'ios' | 'android'
    });
  } catch {
    // không chặn flow đăng nhập
  }
}

/** Gỡ token khỏi BE (gọi TRƯỚC khi xoá accessToken lúc logout) để không gửi nhầm cho máy đã đăng xuất. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await getExpoToken();
    if (!token) return;
    await realApiClient.delete('/api/v1/user/me/push-token', { data: { token } });
  } catch {
    // best-effort
  }
}
