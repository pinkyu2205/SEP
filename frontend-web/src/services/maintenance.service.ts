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

  /** GET /api/v1/maintenance/{id} */
  getRequestById: (id: number): Promise<MaintenanceRequestResponse> => {
    return api.get(`${BASE}/${id}`);
  },
};
