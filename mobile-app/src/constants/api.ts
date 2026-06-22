/**
 * API configuration.
 *
 * URL được cấu hình qua biến môi trường EXPO_PUBLIC_* (xem mobile-app/.env và .env.example).
 * Khi deploy chỉ cần đổi giá trị trong .env, KHÔNG sửa code ở đây.
 * Nếu không khai báo env thì rơi về giá trị dev mặc định (localhost) bên dưới.
 *
 * Gợi ý giá trị REAL_BASE_URL theo môi trường chạy:
 *   - Web / iOS simulator: http://localhost:8080
 *   - Android emulator:    http://10.0.2.2:8080
 *   - Thiết bị thật (LAN): http://<LAN-IP-máy-chạy-BE>:8080
 *   - Deploy thật:         https://api.<domain-cua-ban>
 */
export const API_CONFIG = {
  // Backend mock/legacy (giữ nguyên để tương thích code cũ).
  BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api',
  // Backend Spring thật (dùng cho luồng manager onboarding đã nối API).
  REAL_BASE_URL: process.env.EXPO_PUBLIC_REAL_API_BASE_URL ?? 'http://localhost:8080',
  // Backend public (không cần auth).
  PUBLIC_BASE_URL:
    process.env.EXPO_PUBLIC_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/public',
  // EAS projectId — BẮT BUỘC để lấy Expo Push Token (getExpoPushTokenAsync).
  // Lấy sau khi chạy `eas init`. Để trống khi chưa cấu hình push.
  EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
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
