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

// Shape thật BE trả về: GET /api/v1/notifications là Page<NotificationResponse>.
// Từ 05/08/2026 BE trả kèm `screen` + `params` (đúng payload của push) và đã sort
// id DESC sẵn — bấm vào thông báo là mở đúng hồ sơ/hoá đơn, không phải đoán theo type.
interface BeNotificationRow {
  id: number;
  title: string;
  content: string;
  type: string;            // BE hiện ghi "MAINTENANCE" cho mọi thông báo bảo trì
  screen?: string;
  params?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

/** Đổi type thô của BE về type UI (TYPE_CATEGORY/TYPE_ACCENT của các màn). */
const normalizeType = (row: BeNotificationRow): string => {
  const raw = (row.type || '').toUpperCase();
  /**
   * Hoá đơn & chu kỳ tiền phòng tự động (BE 05/08/2026):
   *   BILLING_REMINDER · BILLING_OVERDUE  — cron nhắc nợ
   *   RENT_ISSUED · RENT_REMINDER_PRE     — phát hành ngày 1 · nhắc trước ngày 28
   *   RENT_OVERDUE_MANAGER                — ngày 8, báo quản lý được chấm dứt HĐ
   *   UTILITY_INVOICE_CREATED             — manager vừa chốt số điện/nước
   * Gom hết về 2 nhóm UI để lọc theo tab "Hoá đơn" là thấy đủ.
   */
  if (raw.startsWith('BILLING_') || raw.startsWith('RENT_')
    || raw.includes('UTILITY') || raw.includes('INVOICE')) {
    return raw.includes('OVERDUE') ? 'bill_overdue' : 'new_bill';
  }
  /**
   * Tiền onboard (thuê tháng đầu + cọc) được PayOS ghi nhận — BE 08/08/2026.
   * Hai type cùng một sự kiện nhưng khác người nhận và khác màn đích:
   *   DEPOSIT_PAID_TENANT  → khách, mở Hoá đơn (tin CÓ số tiền)
   *   DEPOSIT_PAID_MANAGER → quản lý, mở tiếp luồng đón khách (tin KHÔNG có số tiền)
   * Không tách thì cả hai rơi xuống nhánh fallback và nằm sai tab.
   */
  if (raw.startsWith('DEPOSIT_PAID')) {
    return raw.endsWith('_MANAGER') ? 'contract_assigned' : 'new_bill';
  }
  // Host duyệt/từ chối giá → quản lý quay lại màn tiếp tục hợp đồng.
  if (raw.startsWith('PRICE_APPROVAL')) return 'contract_assigned';
  if (raw === 'MAINTENANCE') {
    // BE dùng chung 1 type — phân biệt qua nội dung: ticket mới / đã xong / cập nhật.
    if (/mới/i.test(row.title)) return 'maintenance_new';
    if (/DONE|CONFIRMED/.test(row.content)) return 'maintenance_resolved';
    return 'maintenance_accepted';
  }
  // Trả phòng (checkout-request) — nhận diện rộng vì chưa chốt chuỗi type BE.
  if (raw.includes('CHECKOUT') || /trả phòng/i.test(row.title)) return 'checkout_request';
  // Gán đón khách / hợp đồng (assign-manager, duyệt giá...) → mở ResumeContract.
  if (raw.includes('CONTRACT') || raw.includes('ASSIGN') || raw.includes('ONBOARD') ||
      /đón khách|hợp đồng/i.test(row.title)) {
    return 'contract_assigned';
  }
  // Type lạ giữ nguyên — UI có fallback (icon 🔔 Hệ thống), KHÔNG được crash.
  return row.type;
};

const mapRow = (row: BeNotificationRow): ApiNotification => ({
  id: row.id,
  title: row.title,
  body: row.content,
  type: normalizeType(row),
  isRead: row.read,
  screen: row.screen,
  params: row.params,
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
    // BE đã sort id DESC từ 05/08/2026 (page 0 = 50 thông báo MỚI nhất). Vẫn sort lại
    // ở FE cho chắc — rẻ, và không phụ thuộc vào việc BE có đổi lại thứ tự hay không.
    return rows.map(mapRow).sort((a, b) => b.id - a.id);
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
