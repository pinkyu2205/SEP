import realApiClient from '@/services/core/realApiClient';
import type {
  EquipmentDto,
  EquipmentMaintenanceHistoryDto,
  EquipmentLifecycleStatus,
} from '@/types';

/**
 * Equipment service (real backend — Maintenance_BE_Contract.md §2.4).
 * Operations Manager quản lý kho thiết bị theo phòng.
 */
export interface UpsertEquipmentBody {
  equipmentName: string;
  category: string;
  roomId?: number;
  installationDate?: string;
  warrantyExpiredDate?: string;
  qrCode?: string;
}

export const realEquipmentService = {
  /** Thiết bị theo phòng */
  getByRoom: async (roomId: number): Promise<EquipmentDto[]> => {
    const { data } = await realApiClient.get<EquipmentDto[]>('/api/v1/equipment', {
      params: { roomId },
    });
    return data;
  },

  /** Thiết bị theo property */
  getByProperty: async (propertyId: number): Promise<EquipmentDto[]> => {
    const { data } = await realApiClient.get<EquipmentDto[]>(
      `/api/v1/properties/${propertyId}/equipments`,
    );
    return data;
  },

  getById: async (id: number): Promise<EquipmentDto> => {
    const { data } = await realApiClient.get<EquipmentDto>(`/api/v1/equipment/${id}`);
    return data;
  },

  /** Thêm thiết bị vào property/phòng */
  create: async (propertyId: number, body: UpsertEquipmentBody): Promise<EquipmentDto> => {
    const { data } = await realApiClient.post<EquipmentDto>(
      `/api/v1/properties/${propertyId}/equipments`,
      body,
    );
    return data;
  },

  update: async (id: number, body: Partial<UpsertEquipmentBody>): Promise<EquipmentDto> => {
    const { data } = await realApiClient.put<EquipmentDto>(`/api/v1/equipment/${id}`, body);
    return data;
  },

  updateStatus: async (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<EquipmentDto> => {
    const { data } = await realApiClient.patch<EquipmentDto>(`/api/v1/equipment/${id}/status`, {
      status,
    });
    return data;
  },

  /**
   * Bật/tắt hiện diện thiết bị trong phòng (trục độc lập với status vật lý).
   * ACTIVE = đang lắp · DISABLED = đã gỡ. Chỉ cho thao tác thủ công — luồng đón khách
   * không còn khái niệm "khách từ chối thiết bị" (BE tự gắn toàn bộ nội thất ACTIVE
   * vào HĐ, xem FE-contract-equipment-auto.md). (Endpoint BE đang bổ sung.)
   */
  setOperationalStatus: async (
    id: number,
    operationalStatus: 'ACTIVE' | 'DISABLED',
    reason?: string,
  ): Promise<EquipmentDto> => {
    const { data } = await realApiClient.patch<EquipmentDto>(
      `/api/v1/equipments/${id}/operational-status`,
      { operationalStatus, reason },
    );
    return data;
  },

  getMaintenanceHistory: async (id: number): Promise<EquipmentMaintenanceHistoryDto[]> => {
    const { data } = await realApiClient.get<EquipmentMaintenanceHistoryDto[]>(
      `/api/v1/equipment/${id}/maintenance-history`,
    );
    return data;
  },
};
