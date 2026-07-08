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

// Shape thật BE trả về: GET /api/v1/notifications là Page<NotificationResponse>
// với mỗi phần tử {id, title, content, type, read, createdAt}.
interface BeNotificationRow {
  id: number;
  title: string;
  content: string;
  type: string;            // BE hiện ghi "MAINTENANCE" cho mọi thông báo bảo trì
  read: boolean;
  createdAt: string;
}

/** Đổi type thô của BE về type UI (TYPE_CATEGORY/TYPE_ACCENT của các màn). */
const normalizeType = (row: BeNotificationRow): string => {
  if (row.type === 'MAINTENANCE') {
    // BE dùng chung 1 type — phân biệt qua nội dung: ticket mới / đã xong / cập nhật.
    if (/mới/i.test(row.title)) return 'maintenance_new';
    if (/DONE|CONFIRMED/.test(row.content)) return 'maintenance_resolved';
    return 'maintenance_accepted';
  }
  return row.type;
};

const mapRow = (row: BeNotificationRow): ApiNotification => ({
  id: row.id,
  title: row.title,
  body: row.content,
  type: normalizeType(row),
  isRead: row.read,
  createdAt: row.createdAt,
});

export const realNotificationService = {
  /** Danh sách thông báo của user hiện tại (mới nhất trước). */
  list: async (): Promise<ApiNotification[]> => {
    const { data } = await realApiClient.get<{ content?: BeNotificationRow[] } | BeNotificationRow[]>(
      '/api/v1/notifications',
      { params: { size: 50 } },
    );
    const rows = Array.isArray(data) ? data : data?.content ?? [];
    return rows.map(mapRow);
  },

  /** Số thông báo chưa đọc (cho badge). */
  unreadCount: async (): Promise<number> => {
    const { data } = await realApiClient.get<{ count: number }>('/api/v1/notifications/unread-count');
    return data?.count ?? 0;
  },

  /** Đánh dấu 1 thông báo đã đọc (BE là PUT, không phải PATCH). */
  markRead: async (id: number): Promise<void> => {
    await realApiClient.put(`/api/v1/notifications/${id}/read`);
  },

  /** Đánh dấu tất cả đã đọc. */
  markAllRead: async (): Promise<void> => {
    await realApiClient.put('/api/v1/notifications/read-all');
  },
};
