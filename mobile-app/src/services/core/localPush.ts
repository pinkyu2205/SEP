import { Platform } from 'react-native';
// CHỈ import KIỂU — không nạp module lúc chạy (Expo Go in ERROR ngay khi import thật).
import type * as NotificationsModule from 'expo-notifications';
import { setupAndroidChannel, isExpoGo, NotificationData } from '@/services/core/notifications';

/**
 * Bắn thông báo LÊN THANH THÔNG BÁO CỦA MÁY ngay lập tức (local notification).
 *
 * Vì sao cần: push từ server chỉ có khi BE gọi Expo Push API. Luồng trả phòng hiện
 * BE chưa bắn push cho phần lớn bước, nên app tự phát hiện đối phương vừa làm gì
 * (useCheckoutWatcher) rồi tự bắn thông báo trên máy người nhận — hiển thị y hệt
 * push thật, bấm vào vẫn điều hướng đúng màn nhờ dùng chung payload `data`.
 *
 * Giới hạn: chỉ chạy khi app còn sống (foreground/background chưa bị kill) và trên
 * development/production build — Expo Go SDK 53+ đã gỡ notifications. Ở những môi
 * trường không bắn được thì trả false để nơi gọi hiện toast trong app thay thế.
 */

let permissionChecked = false;
let permissionGranted = false;

async function ensurePermission(N: typeof NotificationsModule): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  try {
    let perm = await N.getPermissionsAsync();
    if (perm.status !== 'granted') perm = await N.requestPermissionsAsync();
    permissionGranted = perm.status === 'granted';
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

export interface LocalPushInput {
  title: string;
  body: string;
  /** Payload điều hướng khi bấm — cùng shape với push của BE. */
  data?: NotificationData;
}

/** Trả về true nếu đã đẩy được lên thanh thông báo của máy. */
export async function pushLocalNotification(input: LocalPushInput): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const N = require('expo-notifications') as typeof NotificationsModule;
    if (!(await ensurePermission(N))) return false;
    await setupAndroidChannel();
    await N.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        // expo-notifications yêu cầu Record<string, unknown>; NotificationData là
        // interface nên phải trải ra để có index signature.
        data: { ...(input.data ?? {}) },
        sound: true,
      },
      trigger: null, // null = hiện ngay
    });
    return true;
  } catch {
    return false; // không chặn luồng nghiệp vụ vì một thông báo
  }
}
