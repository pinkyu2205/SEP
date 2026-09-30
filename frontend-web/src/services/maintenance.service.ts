import api from './api';
import type {
  Page,
  MaintenanceRequestResponse,
  MaintenanceDashboardResponse,
  MaintenanceAdminReviewRequest,
  RefusalReviewStatus,
} from '@/types/api.types';

const BASE = '/api/v1/maintenance';

export interface MaintenanceListFilters {
  status?: string;
  priority?: string;
  category?: string;
  propertyId?: number;
  roomId?: number;
  /** true = chỉ phiếu khách từ chối trả (công ty trả hộ). */
  companyAbsorbedFault?: boolean;
}

export interface MaintenanceDashboardFilters {
  propertyId?: number;
  from?: string;
  to?: string;
}

/**
 * Maintenance service (Web) — CHỈ ĐỌC/giám sát. Flow mới 17/07: mọi thao tác
 * (duyệt request, báo xong, review-reject, hủy) làm trên mobile manager.
 * LƯU Ý: PUT /{id}/approve giờ nghĩa là DUYỆT REQUEST (không còn duyệt chi phí) —
 * web không được gọi; chi phí thuộc luồng hóa đơn sau khi ticket CLOSED.
 */
export const maintenanceService = {
  /** GET /api/v1/maintenance/dashboard */
  getDashboard: (filters: MaintenanceDashboardFilters = {}): Promise<MaintenanceDashboardResponse> => {
    return api.get(`${BASE}/dashboard`, { params: filters });
  },

  /** GET /api/v1/maintenance — danh sách phân trang + lọc */
  getRequests: (
    filters: MaintenanceListFilters = {},
    page = 0,
    size = 10,
  ): Promise<Page<MaintenanceRequestResponse>> => {
    return api.get(BASE, { params: { ...filters, page, size } });
  },

  /**
   * PUT /api/v1/maintenance/{id}/refusal-review — admin xem xét cờ đỏ "khách từ chối trả".
   * ⚠️ BE CHƯA CÓ (đề xuất trong docs/BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md). Trang
   * `RefusedPayments` khoá 2 nút Bỏ cờ / Trừ cọc bằng `REFUSAL_REVIEW_BE_READY` tới khi BE ship.
   */
  reviewRefusal: (
    id: number,
    body: { decision: Exclude<RefusalReviewStatus, 'PENDING'>; note: string },
  ): Promise<MaintenanceRequestResponse> => {
    return api.put(`${BASE}/${id}/refusal-review`, body);
  },

  /** GET /api/v1/maintenance/{id} */
  getRequestById: (id: number): Promise<MaintenanceRequestResponse> => {
    return api.get(`${BASE}/${id}`);
  },

  /**
   * PUT /api/v1/maintenance/{id}/admin-review — role ADMIN only. Duyệt/không duyệt
   * phiếu "báo lỗi do khách" (report-fault, 01/09/2026) — không đổi status, chỉ ghi
   * nhận quyết định; xử lý sửa/thu tiền tiếp theo nằm ngoài hệ thống.
   */
  adminReviewFault: (id: number, body: MaintenanceAdminReviewRequest): Promise<MaintenanceRequestResponse> => {
    return api.put(`${BASE}/${id}/admin-review`, body);
  },
};
