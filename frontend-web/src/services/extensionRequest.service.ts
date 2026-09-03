import api from './api';

/**
 * ĐƠN XIN GIA HẠN HỢP ĐỒNG — phần của admin.
 *
 * ─── Vì sao ADMIN duyệt chứ không phải quản lý ────────────────────────────────
 * Thứ quyết định gia hạn được hay không là **hợp đồng của công ty với chủ nhà còn bao
 * lâu** — quan hệ đó thuộc về host/admin, quản lý không nắm. Máy chủ đã chặn cứng:
 * `InboundLeaseRules.assertOccupancyWindow` không cho ngày kết thúc mới vượt hạn hợp đồng
 * gốc, và số tháng tối đa được tính sẵn cho khách qua `extension-options`.
 *
 * Gia hạn cũng là cam kết thương mại, mà theo luật chốt 07/08/2026 quản lý bị giữ ngoài
 * mọi chuyện tiền bạc của hợp đồng.
 *
 * Quản lý vẫn góp ý được (`managerNote`) — họ nắm thứ admin không có: khách trả tiền đúng
 * hạn không, phòng có bị phàn nàn không. Đọc nó trước khi bấm duyệt.
 *
 * ─── Gia hạn KHÔNG đổi giá ────────────────────────────────────────────────────
 * Chỉ kéo dài thời gian ở. Nhờ vậy không ai phải quyết con số nào. Muốn đổi giá thì không
 * đi đường gia hạn — làm hợp đồng mới.
 */

export type ExtensionRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  /** Quá 7 ngày không ai duyệt — máy chủ tự đóng, hợp đồng chạy tiếp luồng hết hạn. */
  | 'EXPIRED'
  | 'WITHDRAWN';

export interface AdminExtensionRequest {
  id: number;
  contractId: number;
  contractCode?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantFullName?: string | null;
  tenantPhone?: string | null;
  /** Số tháng khách xin thêm — khách nghĩ theo tháng, máy chủ tự suy ra ngày. */
  months: number;
  /** Ngày kết thúc mới nếu duyệt. Máy chủ tính sẵn, FE không tự cộng. */
  newEndDate?: string | null;
  /** Lời nhắn của khách. */
  note?: string | null;
  status: ExtensionRequestStatus;
  createdAt?: string | null;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  /** Ghi chú NỘI BỘ của quản lý — máy chủ đã xoá khỏi bản trả cho khách. */
  managerNote?: string | null;
  rejectReason?: string | null;
}

const BASE = '/api/v1/admin/extension-requests';

export const extensionRequestService = {
  list: async (status?: ExtensionRequestStatus): Promise<AdminExtensionRequest[]> => {
    const rows = await api.get<unknown, AdminExtensionRequest[]>(
      BASE, { params: status ? { status } : {} },
    );
    return Array.isArray(rows) ? rows : [];
  },

  /**
   * Duyệt — máy chủ gọi `extendContract` với `newRentAmount = null`, dời `endDate`, và
   * thoát nhánh hoãn nếu hợp đồng đang bị giữ lại chờ đơn này.
   */
  approve: (id: number): Promise<AdminExtensionRequest> =>
    api.post(`${BASE}/${id}/approve`),

  /** Từ chối — lý do BẮT BUỘC, khách đọc được nguyên văn. */
  reject: (id: number, reason: string): Promise<AdminExtensionRequest> =>
    api.post(`${BASE}/${id}/reject`, { reason: reason.trim() }),
};

export const EXTENSION_STATUS_META: Record<
  ExtensionRequestStatus,
  { label: string; cls: string }
> = {
  PENDING:   { label: 'Chờ duyệt',      cls: 'bg-amber-100 text-amber-700' },
  APPROVED:  { label: 'Đã duyệt',       cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: 'Đã từ chối',     cls: 'bg-rose-100 text-rose-700' },
  EXPIRED:   { label: 'Quá hạn xử lý',  cls: 'bg-slate-200 text-slate-600' },
  WITHDRAWN: { label: 'Khách đã rút',   cls: 'bg-slate-100 text-slate-500' },
};
