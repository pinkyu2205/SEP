import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Cấu hình hiển thị thông báo khi app đang MỞ (foreground).
 * Mặc định iOS/Android không tự hiện banner khi app foreground -> phải khai báo.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Tạo kênh thông báo mặc định cho Android (bắt buộc từ Android 8+). */
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Thông báo chung',
    importance: Notifications.AndroidImportance.HIGH,
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
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
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
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    const data = (response.notification.request.content.data ?? {}) as NotificationData;
    onTap(data);
  }
}
