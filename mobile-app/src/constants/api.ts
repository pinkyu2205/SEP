import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API configuration.
 *
 * URL có thể cấu hình qua biến môi trường EXPO_PUBLIC_* (xem mobile-app/.env và .env.example).
 * Khi deploy chỉ cần đổi giá trị trong .env, KHÔNG sửa code ở đây.
 * Nếu không khai báo env thì REAL_BASE_URL tự suy theo nền tảng (xem resolveRealBaseUrl):
 *   - Web / iOS simulator: http://localhost:8080
 *   - Android emulator:    http://10.0.2.2:8080
 *   - Thiết bị thật (LAN): http://<LAN-IP-máy-chạy-BE>:8080 (tự dò qua Expo hostUri)
 *   - Deploy thật:         đặt EXPO_PUBLIC_REAL_API_BASE_URL=https://api.<domain-cua-ban>
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
  // Backend mock/legacy (giữ nguyên để tương thích code cũ).
  BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api',
  // Backend Spring thật.
  // - WEB: LUÔN dùng '' (đi qua dev proxy của Metro → tránh CORS), BỎ QUA env. Nếu để env
  //   trỏ thẳng http://localhost:8080 thì web gọi khác origin → dính CORS → login fail.
  // - NATIVE (Expo Go / thiết bị thật / build): ưu tiên env (LAN IP / domain thật),
  //   không có thì tự suy theo nền tảng (xem resolveRealBaseUrl ở trên).
  REAL_BASE_URL:
    Platform.OS === 'web'
      ? REAL_BASE_URL
      : (process.env.EXPO_PUBLIC_REAL_API_BASE_URL ?? REAL_BASE_URL),
  // Backend public (không cần auth).
  PUBLIC_BASE_URL:
    process.env.EXPO_PUBLIC_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/public',
  // EAS projectId — BẮT BUỘC để lấy Expo Push Token (getExpoPushTokenAsync).
  //
  // `eas init` đã ghi sẵn id vào app.json (`extra.eas.projectId`), nên đọc thẳng từ đó
  // làm nguồn mặc định. Trước đây chỉ đọc env: .env để TRỐNG -> getExpoToken() thoát
  // sớm -> máy không bao giờ đăng ký push token -> BE gửi thông báo mà không ai nhận.
  // Env vẫn được ưu tiên để build nội bộ trỏ sang project Expo khác mà không sửa code.
  EAS_PROJECT_ID:
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    (Constants.expoConfig?.extra as any)?.eas?.projectId ||
    (Constants as any).easConfig?.projectId ||
    '',
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

    // Maintenance (Bảo trì / Sửa chữa) — legacy mock endpoints
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

/**
 * URL PayOS redirect về sau khi thanh toán xong / huỷ.
 *
 * Đây KHÔNG phải trang của app — mobile mở checkout PayOS trong WebView rồi bắt
 * sự kiện điều hướng: URL bắt đầu bằng PAY_SUCCESS_URL thì đóng WebView và xác
 * nhận đã trả, PAY_CANCEL_URL thì chỉ đóng.
 *
 * ⚠️ PHẢI KHỚP CHÍNH XÁC returnUrl/cancelUrl mà BE cấu hình cho PayOS. Lệch một
 * ký tự là WebView không bắt được điều hướng → thanh toán xong màn hình vẫn treo
 * ở trang PayOS, hoá đơn không tự đánh dấu đã trả.
 * Giá trị hiện tại theo BE-HANDOFF-https-payos-ready-2026-08-06.md (06/08/2026).
 */
export const PAY_SUCCESS_URL = 'https://sep-frontend-prod.vercel.app/payment-success';
export const PAY_CANCEL_URL = 'https://sep-frontend-prod.vercel.app/payment-cancel';
