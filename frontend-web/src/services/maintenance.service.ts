import api from './api';
import type {
  Page,
  MaintenanceRequestResponse,
  MaintenanceDashboardResponse,
} from '@/types/api.types';

const BASE = '/api/v1/maintenance';

export interface MaintenanceListFilters {
  status?: string;
  priority?: string;
  category?: string;
  propertyId?: number;
  roomId?: number;
}

export interface MaintenanceDashboardFilters {
  propertyId?: number;
  from?: string;
  to?: string;
}

/**
 * Maintenance service (Web Admin) — chủ yếu đọc; thao tác assign/resolve thực hiện
 * ở mobile Operations Manager. Ngoại lệ: DUYỆT CHI PHÍ vượt ngưỡng (PENDING_APPROVAL)
 * làm trên web vì BE giới hạn ROLE_ADMIN (đề nghị mở HOST trong API-ProcessGaps-BE-TODO.md).
 */
export const maintenanceService = {
  /**
   * PUT /api/v1/maintenance/{id}/approve — duyệt/từ chối chi phí sửa chữa vượt
   * ngưỡng (ticket PENDING_APPROVAL). BE hiện chỉ cho ROLE_ADMIN.
   */
  decideCost: (id: number, approve: boolean): Promise<MaintenanceRequestResponse> => {
    return api.put(`${BASE}/${id}/approve`, { approve });
  },

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

  /** GET /api/v1/maintenance/{id} */
  getRequestById: (id: number): Promise<MaintenanceRequestResponse> => {
    return api.get(`${BASE}/${id}`);
  },
};
