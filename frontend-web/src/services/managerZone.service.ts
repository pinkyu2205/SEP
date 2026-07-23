import api from './api';
import type { ManagerZonesResponse, AssignManagerZonesRequest } from '@/types/api.types';

export const managerZoneService = {
  /**
   * GET /api/v1/admin/managers
   * Danh sách manager kèm khu vực đang phụ trách. Requires: ROLE_ADMIN
   */
  listManagersWithZones: (): Promise<ManagerZonesResponse[]> => {
    return api.get('/api/v1/admin/managers');
  },

  /**
   * GET /api/v1/admin/managers/{managerId}/zones
   * Xem khu vực đang gán cho một manager. Requires: ROLE_ADMIN
   */
  getManagerZones: (managerId: string): Promise<ManagerZonesResponse> => {
    return api.get(`/api/v1/admin/managers/${managerId}/zones`);
  },

  /**
   * PUT /api/v1/admin/managers/{managerId}/zones
   * Gán / thay thế toàn bộ khu vực phụ trách của manager. Requires: ROLE_ADMIN
   */
  assignZones: (managerId: string, data: AssignManagerZonesRequest): Promise<ManagerZonesResponse> => {
    return api.put(`/api/v1/admin/managers/${managerId}/zones`, data);
  },
};
