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
   *   RENT_ISSUED · RENT_REMINDER_PRE     — phát hành ngày 1 · nhắc trước vào NGÀY CUỐI THÁNG
   *     (`remindUpcomingRent` chỉ chạy khi "ngày mai" là ngày 1, nên là 28/29/30/31 tuỳ
   *      tháng — không phải cố định 28 như ghi chú cũ)
   *   RENT_OVERDUE_MANAGER                — ngày 8, báo quản lý được chấm dứt HĐ
   *   UTILITY_INVOICE_CREATED             — manager vừa chốt số điện/nước
   * Gom hết về 2 nhóm UI để lọc theo tab "Hoá đơn" là thấy đủ.
   */
  /**
   * `RENT_UNPAID_MANAGER` (BE 26/08/2026) — cron báo quản lý từ ngày hạn tới ngày đủ điều
   * kiện chấm dứt HĐ.
   *
   * Xét TRƯỚC nhánh chung: chuỗi không chứa "OVERDUE" nên nó rơi vào `new_bill` — icon 🧾
   * xanh, đọc như một hoá đơn mới bình thường. Nhưng tin này luôn là **việc quản lý phải
   * làm ngay** (gọi nhắc khách), và tới ngày thứ ba là "mai đủ điều kiện chấm dứt hợp
   * đồng". Tô xanh dịu một việc đang chạy nước rút là cách nhanh nhất để nó bị lướt qua —
   * cùng lý do `MAINTENANCE_COMPLETED` được map sang màu cảnh báo thay vì xanh lá.
   */
  if (raw === 'RENT_UNPAID_MANAGER') return 'bill_overdue';
  /**
   * `UTILITY_LOSS_ALERT` (BE 27/08/2026) — tổng tiêu thụ các phòng thấp hơn giấy nhà nước
   * bất thường: dấu hiệu rò điện, công tơ hỏng, hoặc có người dùng chùa.
   *
   * Xét TRƯỚC nhánh chung: chuỗi chứa "UTILITY" nên nó rơi vào `new_bill` — icon 🧾 xanh,
   * đọc như một hoá đơn mới bình thường. Đây là việc phải đi kiểm tra hiện trường, càng
   * phát hiện sớm càng đỡ tiền; tô xanh dịu là cách chắc chắn để nó bị lướt qua.
   */
  if (raw === 'UTILITY_LOSS_ALERT') return 'bill_overdue';
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
  /**
   * Khách vừa thanh toán, báo cho quản lý — BE `PAYMENT_RECEIVED_MANAGER` (13/08/2026,
   * commit 731acad). Tin KHÔNG kèm số tiền (chính sách ẩn tiền khỏi manager).
   *
   * Phải xét TRƯỚC nhánh fallback: chuỗi này không chứa BILL/RENT/INVOICE/UTILITY nên
   * trước đây rơi thẳng xuống cuối, trả về type thô rồi nằm nhóm "Hệ thống" — đúng loại
   * thông báo quản lý cần thấy nhất lại là loại khó tìm nhất.
   */
  if (raw.startsWith('PAYMENT_RECEIVED')) return 'payment_success';
  /** Tới kỳ ghi điện/nước mà chưa có ảnh công tơ — BE `METER_READING_DUE`. */
  if (raw.startsWith('METER_READING')) return 'meter_reading_due';
  // Host duyệt/từ chối giá → quản lý quay lại màn tiếp tục hợp đồng.
  if (raw.startsWith('PRICE_APPROVAL')) return 'contract_assigned';
  /**
   * Bảo trì — BE tách thành 8 type theo sự kiện từ 13/08/2026 (commit 23f5d97).
   * Trước đó dùng chung một type `MAINTENANCE`, FE phải regex tiếng Việt để đoán.
   *
   * Lưu ý so sánh: nhánh legacy bên dưới dùng `raw === 'MAINTENANCE'` (so BẰNG), nên
   * các type mới `MAINTENANCE_*` KHÔNG lọt vào đó — phải map riêng ở đây, không thì
   * rơi hết xuống fallback và nằm nhóm "Hệ thống", mất khỏi tab Bảo trì.
   */
  if (raw.startsWith('MAINTENANCE_')) {
    switch (raw) {
      case 'MAINTENANCE_CREATED': return 'maintenance_new';
      case 'MAINTENANCE_APPROVED': return 'maintenance_accepted';
      // Khách BẮT BUỘC phải hành động: không xác nhận trong N ngày là hệ thống tự đóng
      // ticket. Tách riêng khỏi `maintenance_resolved` (màu xanh "xong rồi") vì tô xanh
      // một việc đang chờ người ta làm là cách nhanh nhất để họ bỏ qua nó.
      case 'MAINTENANCE_COMPLETED': return 'maintenance_confirm';
      case 'MAINTENANCE_COST_RESOLVED':
      case 'MAINTENANCE_COST_DISPUTED': return 'maintenance_cost';
      case 'MAINTENANCE_CANCELLED': return 'maintenance_cancelled';
      case 'MAINTENANCE_REJECTED_BY_TENANT': return 'maintenance_rejected';
      case 'MAINTENANCE_AUTO_CONFIRMED': return 'maintenance_resolved';
      default: return 'maintenance_accepted'; // type bảo trì BE thêm sau — vẫn đúng tab
    }
  }
  if (raw === 'MAINTENANCE') {
    // LEGACY: bản ghi lưu trước 13/08/2026, BE không phát type này nữa. Nội dung là câu
    // generic "đã đổi trạng thái thành: <ENUM>" nên không phân loại chính xác được —
    // đủ để nằm đúng tab là được. Bỏ hẳn nhánh này khi dữ liệu cũ hết hạn hiển thị.
    if (/mới/i.test(row.title)) return 'maintenance_new';
    return 'maintenance_accepted';
  }
  // Trả phòng (checkout-request) — nhận diện rộng vì chưa chốt chuỗi type BE.
  if (raw.includes('CHECKOUT') || /trả phòng/i.test(row.title)) return 'checkout_request';
  /**
   * Cron nhắc lịch đón khách (BE — xem doc/BE-NEED-nhac-lich-don-khach).
   * Khai báo TƯỜNG MINH thay vì dựa vào nhánh dưới: chuỗi `RECEPTION_*` không chứa
   * CONTRACT/ASSIGN/ONBOARD nên chỉ khớp được nhờ regex tiếng Việt trên `title` —
   * BE sửa lại câu chữ một lần là thông báo rơi xuống nhóm "Hệ thống".
   */
  if (raw.startsWith('RECEPTION_')) return 'contract_assigned';
  /**
   * `CONTRACT_EXPIRING` (BE 01/09/2026) — cron nhắc D-30 / D-15 / D-7 / D-1 / D-0.
   *
   * PHẢI xét trước nhánh `raw.includes('CONTRACT')` bên dưới, nếu không nó rơi vào
   * `contract_assigned` — nhóm "được giao đón khách MỚI", icon chào mừng. Tin báo hợp
   * đồng sắp hết hạn mà nằm đó thì vừa sai nhóm khi lọc tab, vừa đọc ngược nghĩa: khách
   * sắp phải dọn đi lại thấy một thông báo trông như vừa nhận nhà.
   *
   * Hai UI type `contract_expiring` / `contract_expired` đã có sẵn từ trước (đúng nhóm
   * "Hợp đồng", màu vàng và đỏ) — chỉ là chưa có đường nào sinh ra chúng.
   *
   * BE dùng CHUNG một type cho cả 5 mốc, chỉ khác câu chữ, nên mốc D-0 phải nhận ra qua
   * tiêu đề. Regex hỏng thì rơi về `contract_expiring` — vẫn đúng nhóm, chỉ mất sắc đỏ,
   * nên không lặp lại được cái bẫy của nhánh `RECEPTION_` ngay trên.
   */
  if (raw === 'CONTRACT_EXPIRING') {
    return /hôm nay/i.test(row.title) ? 'contract_expired' : 'contract_expiring';
  }
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
