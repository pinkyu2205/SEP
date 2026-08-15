import realApiClient from '@/services/core/realApiClient';
import type {
  EquipmentDto,
  EquipmentMaintenanceHistoryDto,
  EquipmentLifecycleStatus,
} from '@/types';

/**
 * Equipment service (real backend).
 *
 * ⚠ Đường dẫn ở đây đã được đối chiếu trực tiếp với source BE
 * (EquipmentController, GlobalEquipmentController, MaintenanceEquipmentController,
 * EquipmentQrController) ngày 15/08/2026. Nhóm endpoint không gắn property nằm ở
 * MaintenanceEquipmentController và ĐỀU có hậu tố `-feature` / `/feature` —
 * trước đây FE gọi thiếu hậu tố nên toàn bộ sửa thiết bị + đổi trạng thái 404 im lặng.
 */

/** Body của POST /properties/{id}/equipments — khớp CreateAddedEquipmentRequest của BE. */
export interface CreateEquipmentBody {
  equipmentName: string; // bắt buộc
  category: string; // bắt buộc
  cost?: number;
  roomId?: number; // bỏ trống = gắn thẳng vào nhà (nguyên căn / khu vực chung)
}

export const realEquipmentService = {
  /** Thiết bị theo phòng — GET /api/v1/equipment/feature?roomId= */
  getByRoom: async (roomId: number): Promise<EquipmentDto[]> => {
    const { data } = await realApiClient.get<EquipmentDto[]>('/api/v1/equipment/feature', {
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
    const { data } = await realApiClient.get<EquipmentDto>(`/api/v1/equipment/${id}/feature`);
    return data;
  },

  /** Thêm thiết bị lắp thêm vào property/phòng */
  create: async (propertyId: number, body: CreateEquipmentBody): Promise<EquipmentDto> => {
    const { data } = await realApiClient.post<EquipmentDto>(
      `/api/v1/properties/${propertyId}/equipments`,
      body,
    );
    return data;
  },

  /** Sửa thông tin thiết bị — BE nhận nguyên EquipmentResponse, gửi phần thay đổi là đủ. */
  update: async (id: number, body: Partial<EquipmentDto>): Promise<EquipmentDto> => {
    const { data } = await realApiClient.put<EquipmentDto>(`/api/v1/equipment/${id}/feature`, body);
    return data;
  },

  updateStatus: async (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<EquipmentDto> => {
    const { data } = await realApiClient.patch<EquipmentDto>(
      `/api/v1/equipment/${id}/status-feature`,
      { status },
    );
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

  /**
   * Lịch sử bảo trì của 1 thiết bị.
   * Lưu ý BE có 2 endpoint gần giống nhau: `/maintenance-history` (trả
   * MaintenanceRequestResponse — phiếu bảo trì) và `/maintenance-history-feature`
   * (trả EquipmentMaintenanceHistoryResponse — đúng shape FE cần). Dùng cái sau.
   */
  getMaintenanceHistory: async (id: number): Promise<EquipmentMaintenanceHistoryDto[]> => {
    const { data } = await realApiClient.get<EquipmentMaintenanceHistoryDto[]>(
      `/api/v1/equipment/${id}/maintenance-history-feature`,
    );
    return data;
  },
};
