/**
 * API configuration.
 * Thay đổi BASE_URL khi backend API được triển khai.
 */
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000/api', // TODO: Thay bằng URL backend thật
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
