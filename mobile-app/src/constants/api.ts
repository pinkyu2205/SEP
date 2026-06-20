import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API configuration.
 */

// Cổng backend Spring. Đổi nếu BE chạy cổng khác.
const BACKEND_PORT = 8080;

/**
 * Lấy IP LAN của máy đang chạy dev server (Metro + backend) — suy ra từ hostUri
 * mà Expo Go dùng để tải bundle. VD hostUri = "192.168.1.5:8081" -> "192.168.1.5".
 * Nhờ vậy thiết bị thật gọi được backend trên máy dev mà KHÔNG phải sửa IP tay.
 */
function getDevServerHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    // @ts-ignore - các bản Expo cũ
    (Constants as any).expoGoConfig?.debuggerHost ||
    // @ts-ignore
    (Constants as any).manifest2?.extra?.expoGo?.developer?.host ||
    // @ts-ignore
    (Constants as any).manifest?.debuggerHost;
  if (!hostUri) return null;
  return String(hostUri).split('://').pop()!.split(':')[0] || null;
}

/**
 * Base URL backend Spring thật, tự suy theo nền tảng:
 * - web: '' (cùng origin, đi qua dev proxy của Metro — xem metro.config.js)
 * - thiết bị thật / Expo Go: http://<LAN-IP-máy-dev>:8080
 * - Android emulator: http://10.0.2.2:8080 · iOS simulator: http://localhost:8080
 */
function resolveRealBaseUrl(): string {
  if (Platform.OS === 'web') return '';
  const host = getDevServerHost();
  if (host) return `http://${host}:${BACKEND_PORT}`;
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${BACKEND_PORT}`
    : `http://localhost:${BACKEND_PORT}`;
}

export const REAL_BASE_URL = resolveRealBaseUrl();

export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000/api', // TODO: Thay bằng URL backend thật
  // Backend Spring thật (đã tự suy ra IP LAN cho thiết bị thật, xem resolveRealBaseUrl).
  REAL_BASE_URL,
  TIMEOUT: 15000, // 15 seconds
  ENDPOINTS: {
    // Auth
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH_TOKEN: '/auth/refresh',
    PROFILE: '/auth/profile',

    // Invoices (Hóa đơn)
    INVOICES: '/invoices',
    INVOICE_DETAIL: (id: string) => `/invoices/${id}`,
    INVOICE_PAY: (id: string) => `/invoices/${id}/pay`,

    // Rooms (Phòng)
    ROOMS: '/rooms',
    ROOM_DETAIL: (id: string) => `/rooms/${id}`,

    // Maintenance (Bảo trì / Sửa chữa)
    MAINTENANCE: '/maintenance-requests',
    MAINTENANCE_DETAIL: (id: string) => `/maintenance-requests/${id}`,
    MAINTENANCE_UPDATE_STATUS: (id: string) => `/maintenance-requests/${id}/status`,

    // Meter Readings (Chỉ số điện nước)
    METER_READINGS: '/meter-readings',
    METER_READING_OCR: '/meter-readings/ocr',

    // Equipment (Trang thiết bị)
    EQUIPMENT: '/equipment',
    EQUIPMENT_DETAIL: (id: string) => `/equipment/${id}`,

    // Notifications
    NOTIFICATIONS: '/notifications',
    NOTIFICATION_REGISTER_TOKEN: '/notifications/register-token',
  },
} as const;
