import api from './api';
import type {
  ZoneRequest,
  ZoneResponse,
  Page,
} from '@/types/api.types';

export const zoneService = {
  /**
   * POST /api/v2/zones
   * Tạo mới một khu vực (Tỉnh/Quận/Phường)
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  createZone: (data: ZoneRequest): Promise<ZoneResponse> => {
    return api.post('/api/v2/zones', data);
  },

  /**
   * GET /api/v2/zones
   * Lấy tất cả khu vực (có phân trang)
   * Requires: Authenticated
   */
  getAllZones: (page: number = 0, size: number = 100): Promise<Page<ZoneResponse>> => {
    return api.get('/api/v2/zones', { params: { page, size } });
  },

  /**
   * GET /api/v2/zones/root
   * Lấy danh sách Tỉnh/Thành phố (Level 1)
   * Requires: Authenticated
   */
  getRootZones: (): Promise<ZoneResponse[]> => {
    return api.get('/api/v2/zones/root');
  },

  /**
   * GET /api/v2/zones/{parentId}/children
   * Lấy danh sách khu vực con (Tỉnh → Quận, Quận → Phường)
   * Requires: Authenticated
   */
  getChildrenZones: (parentId: string): Promise<ZoneResponse[]> => {
    return api.get(`/api/v2/zones/${parentId}/children`);
  },

  /**
   * GET /api/v2/zones/{id}
   * Lấy chi tiết 1 khu vực theo ID
   * Requires: Authenticated
   */
  getZoneById: (id: string): Promise<ZoneResponse> => {
    return api.get(`/api/v2/zones/${id}`);
  },

  /**
   * PUT /api/v2/zones/{id}
   * Cập nhật thông tin khu vực
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  updateZone: (id: string, data: ZoneRequest): Promise<ZoneResponse> => {
    return api.put(`/api/v2/zones/${id}`, data);
  },

  /**
   * DELETE /api/v2/zones/{id}
   * Xóa khu vực
   * Requires: ROLE_ADMIN
   */
  deleteZone: (id: string): Promise<void> => {
    return api.delete(`/api/v2/zones/${id}`);
  },
};
