import api from './api';
import type {
  PropertyRequest,
  PropertyResponse,
  ZoneSummaryProjection,
  Page,
} from '../types/api.types';

export const propertyService = {
  /**
   * GET /api/v1/properties/dashboard-summary
   * Thống kê Dashboard tổng quan theo Zone
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  getDashboardSummary: (): Promise<ZoneSummaryProjection[]> => {
    return api.get('/api/v1/properties/dashboard-summary');
  },

  /**
   * GET /api/v1/properties
   * Lấy danh sách BĐS phân trang theo vùng được quản lý
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  getProperties: (page: number = 0, size: number = 100): Promise<Page<PropertyResponse>> => {
    return api.get('/api/v1/properties', { params: { page, size } });
  },

  /**
   * POST /api/v1/properties
   * Tạo mới BĐS (kèm danh sách phòng nếu muốn)
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  createProperty: (data: PropertyRequest): Promise<PropertyResponse> => {
    return api.post('/api/v1/properties', data);
  },

  /**
   * PUT /api/v1/properties/{id}
   * Cập nhật thông tin BĐS
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  updateProperty: (id: string, data: PropertyRequest): Promise<PropertyResponse> => {
    return api.put(`/api/v1/properties/${id}`, data);
  },

  /**
   * DELETE /api/v1/properties/{id}
   * Xóa BĐS
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  deleteProperty: (id: string): Promise<void> => {
    return api.delete(`/api/v1/properties/${id}`);
  },
};
