import apiClient from './apiClient';
import { API_CONFIG } from '../constants/api';
import {
  MaintenanceRequest,
  CreateMaintenanceRequest,
  MaintenanceStatus,
  ApiResponse,
  PaginatedResponse,
} from '../types';

/**
 * Maintenance Service - Quản lý yêu cầu sửa chữa / bảo trì.
 */

export const maintenanceService = {
  /**
   * Lấy danh sách yêu cầu sửa chữa
   */
  getRequests: async (page = 1, pageSize = 10): Promise<PaginatedResponse<MaintenanceRequest>> => {
    const { data } = await apiClient.get<PaginatedResponse<MaintenanceRequest>>(
      API_CONFIG.ENDPOINTS.MAINTENANCE,
      { params: { page, pageSize } }
    );
    return data;
  },

  /**
   * Lấy chi tiết yêu cầu
   */
  getRequestDetail: async (id: string): Promise<MaintenanceRequest> => {
    const { data } = await apiClient.get<ApiResponse<MaintenanceRequest>>(
      API_CONFIG.ENDPOINTS.MAINTENANCE_DETAIL(id)
    );
    return data.data;
  },

  /**
   * Tạo yêu cầu sửa chữa mới (Tenant)
   */
  createRequest: async (request: CreateMaintenanceRequest): Promise<MaintenanceRequest> => {
    const { data } = await apiClient.post<ApiResponse<MaintenanceRequest>>(
      API_CONFIG.ENDPOINTS.MAINTENANCE,
      request
    );
    return data.data;
  },

  /**
   * Cập nhật trạng thái yêu cầu (Manager)
   */
  updateStatus: async (
    id: string,
    status: MaintenanceStatus,
    repairCost?: number
  ): Promise<MaintenanceRequest> => {
    const { data } = await apiClient.patch<ApiResponse<MaintenanceRequest>>(
      API_CONFIG.ENDPOINTS.MAINTENANCE_UPDATE_STATUS(id),
      { status, repairCost }
    );
    return data.data;
  },
};
