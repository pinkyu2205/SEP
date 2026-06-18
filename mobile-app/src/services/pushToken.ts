import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import realApiClient from './realApiClient';

/**
 * Lấy push token (FCM trên Android / device token) và gửi lên BE lưu vào user hiện tại.
 * Gọi sau khi tenant đăng nhập. Best-effort: lỗi không chặn đăng nhập.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return; // web không hỗ trợ device push token kiểu FCM

    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (perm.status !== 'granted') return;

    let token: string | undefined;
    try {
      const dev = await Notifications.getDevicePushTokenAsync(); // FCM token trên Android
      token = typeof dev?.data === 'string' ? dev.data : JSON.stringify(dev?.data);
    } catch {
      try {
        const exp = await Notifications.getExpoPushTokenAsync();
        token = exp?.data;
      } catch {
        // bỏ qua
      }
    }
    if (!token) return;

    await realApiClient.post('/api/v1/user/me/push-token', { pushToken: token });
  } catch {
    // không chặn flow đăng nhập
  }
}
