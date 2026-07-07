import realApiClient from '@/services/core/realApiClient';

/**
 * Service đọc danh sách thông báo lưu trong DB (in-app notification center)
 * nối backend Spring THẬT. Push chỉ là "best-effort"; danh sách này là nguồn
 * chính xác để user xem lại khi mở app (xem doc/BE-notifications-setup.md).
 */
export interface ApiNotification {
  id: number;
  title: string;
  body: string;
  type: string;            // new_bill | bill_overdue | payment_success | maintenance_new | ...
  isRead: boolean;
  // Điều hướng khi bấm (khớp data payload của push)
  screen?: string;
  params?: Record<string, any>;
  createdAt: string;       // ISO
}

export const realNotificationService = {
  /** Danh sách thông báo của user hiện tại (mới nhất trước). */
  list: async (): Promise<ApiNotification[]> => {
    const { data } = await realApiClient.get<ApiNotification[]>('/api/v1/notifications');
    return data ?? [];
  },

  /** Số thông báo chưa đọc (cho badge). */
  unreadCount: async (): Promise<number> => {
    const { data } = await realApiClient.get<{ count: number }>('/api/v1/notifications/unread-count');
    return data?.count ?? 0;
  },

  /** Đánh dấu 1 thông báo đã đọc. */
  markRead: async (id: number): Promise<void> => {
    await realApiClient.patch(`/api/v1/notifications/${id}/read`);
  },

  /** Đánh dấu tất cả đã đọc. */
  markAllRead: async (): Promise<void> => {
    await realApiClient.patch('/api/v1/notifications/read-all');
  },
};
