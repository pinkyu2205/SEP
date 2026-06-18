import realApiClient from './realApiClient';
import type {
  MaintenanceRequestDto,
  CreateMaintenanceRequestDto,
  ResolveMaintenanceRequestDto,
  MaintenanceDashboardDto,
  MaintenanceReqStatus,
} from '../types';

/**
 * Maintenance service (real backend — Maintenance_BE_Contract.md).
 * Base path /api/v1, JWT tự inject qua realApiClient.
 */
const BASE = '/api/v1/maintenance';

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface MaintenanceListParams {
  status?: string;
  priority?: string;
  category?: string;
  propertyId?: number;
  roomId?: number;
  page?: number;
  size?: number;
}

export const realMaintenanceService = {
  // ---- Tenant ----
  createRequest: async (body: CreateMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.post<MaintenanceRequestDto>(BASE, body);
    return data;
  },

  getMyRequests: async (
    params: MaintenanceListParams = {},
  ): Promise<SpringPage<MaintenanceRequestDto>> => {
    const { data } = await realApiClient.get<SpringPage<MaintenanceRequestDto>>(
      `${BASE}/my-requests`,
      { params: { page: 0, size: 50, ...params } },
    );
    return data;
  },

  getDetail: async (id: number): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.get<MaintenanceRequestDto>(`${BASE}/${id}`);
    return data;
  },

  // ---- Operations Manager ----
  listForManager: async (
    params: MaintenanceListParams = {},
  ): Promise<SpringPage<MaintenanceRequestDto>> => {
    const { data } = await realApiClient.get<SpringPage<MaintenanceRequestDto>>(BASE, {
      params: { page: 0, size: 50, ...params },
    });
    return data;
  },

  /** Đổi trạng thái + lịch hẹn (review & schedule). */
  updateStatus: async (
    id: number,
    status: MaintenanceReqStatus,
    note?: string,
    scheduledDate?: string,
  ): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/status`, {
      status,
      note,
      scheduledDate,
    });
    return data;
  },

  /** Hoàn tất + ghi chi phí (BE tạo expense + cập nhật equipment history). */
  resolve: async (
    id: number,
    body: ResolveMaintenanceRequestDto,
  ): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/resolve`, body);
    return data;
  },

  // ---- Admin / shared ----
  getDashboard: async (propertyId?: number): Promise<MaintenanceDashboardDto> => {
    const { data } = await realApiClient.get<MaintenanceDashboardDto>(`${BASE}/dashboard`, {
      params: propertyId ? { propertyId } : {},
    });
    return data;
  },
};
