import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
// CHỈ import KIỂU (type) — dòng này bị xoá hoàn toàn khi biên dịch, KHÔNG nạp module lúc chạy.
import type * as NotificationsModule from 'expo-notifications';

/**
 * Push notification (remote) đã bị GỠ khỏi Expo Go từ SDK 53.
 * Chỉ cần `import 'expo-notifications'` trong Expo Go là native stub tự in ERROR/WARN
 * "remote notifications removed" ngay lúc app khởi động — dù ta chưa gọi hàm nào.
 * => Trong Expo Go ta KHÔNG nạp module (lazy require) để log sạch. Ở development/production
 * build (không phải Expo Go) mọi thứ chạy đầy đủ như bình thường.
 * Xem: https://docs.expo.dev/develop/development-builds/introduction/
 */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Nạp expo-notifications theo kiểu lazy — chỉ require khi KHÔNG ở Expo Go.
 * Trả về null trong Expo Go để mọi hàm bên dưới tự bỏ qua an toàn.
 */
let cached: typeof NotificationsModule | null = null;
function getNotifications(): typeof NotificationsModule | null {
  if (isExpoGo) return null;
  if (!cached) cached = require('expo-notifications') as typeof NotificationsModule;
  return cached;
}

/**
 * Cấu hình hiển thị thông báo khi app đang MỞ (foreground).
 * Mặc định iOS/Android không tự hiện banner khi app foreground -> phải khai báo.
 */
const N = getNotifications();
if (N) {
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/** Tạo kênh thông báo mặc định cho Android (bắt buộc từ Android 8+). */
export async function setupAndroidChannel(): Promise<void> {
  const N = getNotifications();
  if (!N || Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('default', {
    name: 'Thông báo chung',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4F46E5',
  });
}

/**
 * Payload `data` mà BE đính kèm khi gửi push (xem doc/BE-notifications-setup.md).
 * Dùng để điều hướng khi người dùng bấm vào thông báo.
 */
export interface NotificationData {
  screen?: string;            // tên route trong navigator, vd 'InvoiceDetail'
  params?: Record<string, any>; // tham số route, vd { id: '123' }
  type?: string;              // loại noti, vd 'new_bill' | 'maintenance_new'
}

/**
 * Lắng nghe khi người dùng BẤM vào thông báo (app foreground/background).
 * Trả về hàm huỷ đăng ký.
 */
export function addNotificationResponseListener(
  onTap: (data: NotificationData) => void
): () => void {
  const N = getNotifications();
  if (!N) return () => {}; // Expo Go không hỗ trợ -> no-op
  const sub = N.addNotificationResponseReceivedListener(response => {
    const data = (response.notification.request.content.data ?? {}) as NotificationData;
    onTap(data);
  });
  return () => sub.remove();
}

/**
 * Xử lý trường hợp app bị TẮT HẲN rồi mở lại bằng cách bấm thông báo.
 * Gọi 1 lần khi app khởi động.
 */
export async function handleInitialNotification(
  onTap: (data: NotificationData) => void
): Promise<void> {
  const N = getNotifications();
  if (!N) return; // Expo Go không hỗ trợ -> bỏ qua
  const response = await N.getLastNotificationResponseAsync();
  if (response) {
    const data = (response.notification.request.content.data ?? {}) as NotificationData;
    onTap(data);
  }
}
