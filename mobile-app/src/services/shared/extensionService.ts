import realApiClient from '@/services/core/realApiClient';

/**
 * ĐƠN XIN GIA HẠN HỢP ĐỒNG — dùng chung cho app khách thuê và app quản lý.
 *
 * ─── Luật đã chốt (02/09/2026) ────────────────────────────────────────────────
 * Khách xin thêm **SỐ THÁNG**, không chọn ngày: khách nghĩ theo tháng, bắt họ tính ra
 * ngày kết thúc là bắt họ tự tính, mà tính sai thì đơn sai. Máy chủ tự suy
 * `newEndDate = endDate + months`.
 *
 * Đơn gửi CÙNG LÚC cho ba vai, không xếp tầng:
 *   • Quản lý — xem và thêm ý kiến, KHÔNG duyệt. Họ nắm thứ admin không có: khách trả
 *     tiền đúng hạn không, phòng có bị phàn nàn không.
 *   • Host    — xem.
 *   • Admin   — người duy nhất bấm duyệt, vì chỉ họ nắm hợp đồng với chủ nhà còn bao lâu.
 *
 * Gia hạn chỉ kéo dài thời gian, **KHÔNG đổi giá thuê** — nhờ vậy không ai phải quyết con
 * số nào, và chính sách "quản lý không thấy tiền thuê" không bị đụng tới.
 *
 * ⚠️ KHÔNG BAO GIỜ hiện lý do trần gia hạn cho khách. Trần đến từ hạn hợp đồng của công ty
 * với chủ nhà — khách không được biết công ty đang thuê lại, càng không được biết hợp đồng
 * đó hết khi nào (biết là suy ra được vị thế công ty khi thương lượng). Máy chủ đã chỉ trả
 * đúng `maxMonths` trần trụi, phía app cũng phải giữ nguyên tinh thần đó: chỉ nói được bao
 * nhiêu tháng, không nói vì sao.
 */

export type ExtensionRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  /** Quá 7 ngày không ai duyệt — máy chủ tự đóng, hợp đồng chạy tiếp luồng hết hạn. */
  | 'EXPIRED'
  | 'WITHDRAWN';

export interface ExtensionRequest {
  id: number;
  contractId: number;
  contractCode?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantUserId?: string | null;
  tenantFullName?: string | null;
  tenantPhone?: string | null;
  /** Số tháng khách xin thêm. */
  months: number;
  /** Ngày kết thúc mới nếu đơn được duyệt — máy chủ tính sẵn. */
  newEndDate?: string | null;
  /** Lời nhắn của khách. */
  note?: string | null;
  status: ExtensionRequestStatus;
  createdAt?: string | null;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  /** Ý kiến quản lý — admin đọc trước khi quyết. */
  managerNote?: string | null;
  rejectReason?: string | null;
}

/**
 * Trần gia hạn.
 *
 * `maxMonths = 0` nghĩa là không gia hạn được — app phải ẩn hẳn nút xin, đừng để khách
 * bấm vào rồi mới nhận lỗi.
 */
export interface ExtensionOptions {
  maxMonths: number;
}

const TENANT = '/api/v1/tenant/me';

export const extensionService = {
  // ── Khách thuê ───────────────────────────────────────────────────────────
  /** Trần gia hạn của một hợp đồng. Chỉ có `maxMonths`, không kèm lý do. */
  getOptions: async (contractId: number): Promise<ExtensionOptions> => {
    const { data } = await realApiClient.get<ExtensionOptions>(
      `${TENANT}/contracts/${contractId}/extension-options`,
    );
    return data;
  },

  /**
   * Đơn của chính khách trên một hợp đồng, mới nhất trước.
   *
   * Không có lệnh này thì đơn chỉ tồn tại trong bộ nhớ màn hình: khách thoát app mở lại
   * là app quên mất, lại mời gửi đơn lần nữa, và lệnh rút đơn cũng vô dụng vì mất
   * `requestId`. Máy chủ đã xoá `managerNote` khỏi bản trả cho khách (ghi chú nội bộ để
   * admin quyết, không viết cho khách đọc).
   */
  listForTenant: async (contractId: number): Promise<ExtensionRequest[]> => {
    const { data } = await realApiClient.get<ExtensionRequest[]>(
      `${TENANT}/contracts/${contractId}/extension-requests`,
    );
    return Array.isArray(data) ? data : [];
  },

  create: async (contractId: number, months: number, note?: string): Promise<ExtensionRequest> => {
    const { data } = await realApiClient.post<ExtensionRequest>(
      `${TENANT}/contracts/${contractId}/extension-requests`,
      { months, note: note?.trim() || undefined },
    );
    return data;
  },

  /** Khách rút đơn — thoát nhánh hoãn, luồng hết hạn chạy tiếp bình thường. */
  withdraw: async (requestId: number): Promise<ExtensionRequest> => {
    const { data } = await realApiClient.delete<ExtensionRequest>(
      `${TENANT}/extension-requests/${requestId}`,
    );
    return data;
  },

  // ── Quản lý ──────────────────────────────────────────────────────────────
  /** Hàng chờ của quản lý. Chỉ để XEM — quản lý không có lệnh duyệt. */
  listForManager: async (status?: ExtensionRequestStatus): Promise<ExtensionRequest[]> => {
    const { data } = await realApiClient.get<ExtensionRequest[]>(
      '/api/v1/manager/extension-requests',
      { params: status ? { status } : {} },
    );
    return Array.isArray(data) ? data : [];
  },

  /**
   * Ý kiến của quản lý về đơn.
   *
   * Không phải phê duyệt — chỉ là dòng admin đọc trước khi quyết. Có nó thì admin không
   * duyệt trong bóng tối: admin không biết khách này có nợ treo hay bị phàn nàn gì.
   */
  addManagerNote: async (requestId: number, note: string): Promise<ExtensionRequest> => {
    const { data } = await realApiClient.post<ExtensionRequest>(
      `/api/v1/manager/extension-requests/${requestId}/note`,
      { note: note.trim() },
    );
    return data;
  },
};

/** Nhãn trạng thái cho người đọc, kèm màu. */
export const EXTENSION_STATUS_META: Record<
  ExtensionRequestStatus,
  { label: string; tenantHint: string; color: string; bg: string }
> = {
  PENDING: {
    label: 'Đang chờ duyệt',
    tenantHint: 'Đơn của bạn đã gửi đi. Quản lý và bộ phận quản trị đang xem.',
    color: '#B45309', bg: '#FEF3C7',
  },
  APPROVED: {
    label: 'Đã duyệt',
    tenantHint: 'Hợp đồng của bạn đã được gia hạn. Giá thuê giữ nguyên.',
    color: '#047857', bg: '#D1FAE5',
  },
  REJECTED: {
    label: 'Bị từ chối',
    tenantHint: 'Đơn không được duyệt. Xem lý do bên dưới.',
    color: '#B91C1C', bg: '#FEE2E2',
  },
  EXPIRED: {
    label: 'Quá hạn xử lý',
    tenantHint: 'Đơn không được xử lý kịp trước ngày hết hạn hợp đồng.',
    color: '#57534E', bg: '#E7E5E4',
  },
  WITHDRAWN: {
    label: 'Bạn đã rút đơn',
    tenantHint: 'Đơn đã được rút lại.',
    color: '#57534E', bg: '#E7E5E4',
  },
};
