import api from './api';
import type { Page } from '@/types/api.types';

/**
 * Thông báo hệ thống dùng chung — GET /api/v1/notifications (bảng `notifications`).
 *
 * KHÁC với hostService.listNotifications (/api/v1/host/notifications) vốn đọc bảng
 * `host_notifications` và chỉ tự sinh 3 loại nhắc việc: căn chờ duyệt giá, HĐ chờ
 * duyệt, master lease sắp hết hạn.
 *
 * Các thông báo do cron nghiệp vụ bắn (BillingCronServiceImpl) — nhắc hạn / quá hạn
 * tiền phòng cho khách, cảnh báo cho quản lý & host — lại nằm ở bảng chung này.
 * App mobile đọc đúng bảng nên nhận được; web host trước giờ không gọi endpoint này
 * nên KHÔNG hiện. Service này lấp chỗ đó.
 */

const BASE = '/api/v1/notifications';

export interface AppNotificationDto {
  id: number;
  title: string;
  content: string;
  /** VD: RENT_OVERDUE_HOST, RENT_OVERDUE_MANAGER, BILLING_OVERDUE, BILLING_REMINDER… */
  type: string;
  screen?: string;
  params?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

/**
 * Thông báo cảnh báo công nợ mà Host cần thấy trên web.
 *
 * Bỏ `RENT_FIRST_CYCLE_OVERDUE` (13/08/2026): tiền chu kỳ đầu thu chung với tiền cọc ở
 * mã QR lúc đón khách nên không còn kỳ đầu nào quá hạn được.
 */
export const HOST_OVERDUE_TYPES = ['RENT_OVERDUE_HOST'];

export const notificationService = {
  list: (params: { unreadOnly?: boolean; page?: number; size?: number } = {}): Promise<Page<AppNotificationDto>> =>
    api.get(BASE, { params }),

  unreadCount: (): Promise<{ count: number }> => api.get(`${BASE}/unread-count`),

  markRead: (id: number): Promise<void> => api.put(`${BASE}/${id}/read`),

  markAllRead: (): Promise<void> => api.put(`${BASE}/read-all`),
};
