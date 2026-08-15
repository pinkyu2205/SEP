import api from './api';
import type {
  AddEquipmentRequest,
  EquipmentResponse,
  MaintenanceEquipmentResponse,
  EquipmentMaintenanceHistoryResponse,
  EquipmentLifecycleStatus,
} from '@/types/api.types';

export const equipmentService = {
  /** POST /api/v1/properties/{propertyId}/equipments — Thêm thiết bị */
  addEquipment: (propertyId: number, data: AddEquipmentRequest): Promise<EquipmentResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/equipments`, data);
  },

  /** GET /api/v1/properties/{propertyId}/equipments — Danh sách thiết bị (legacy type) */
  getEquipmentsByProperty: (propertyId: number): Promise<EquipmentResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/equipments`);
  },

  /** GET /api/v1/properties/{propertyId}/equipments — full DTO (cho trang QR) */
  getPropertyEquipment: (propertyId: number): Promise<MaintenanceEquipmentResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/equipments`);
  },

  // ===========================================================================
  // Lifecycle + Maintenance history
  //
  // ⚠ Nhóm endpoint KHÔNG gắn property nằm ở MaintenanceEquipmentController của BE
  // và đều có hậu tố `/feature` / `-feature`. Đã đối chiếu source BE ngày 15/08/2026.
  // Trước đó FE gọi thiếu hậu tố → sửa thiết bị và đổi trạng thái 404 im lặng.
  // ===========================================================================

  /** GET /api/v1/equipment/{id}/feature */
  getById: (id: number): Promise<MaintenanceEquipmentResponse> => {
    return api.get(`/api/v1/equipment/${id}/feature`);
  },

  /** GET /api/v1/equipment/feature?roomId= — thiết bị theo phòng */
  getByRoom: (roomId: number): Promise<MaintenanceEquipmentResponse[]> => {
    return api.get('/api/v1/equipment/feature', { params: { roomId } });
  },

  /** PUT /api/v1/equipment/{id}/feature — sửa thông tin thiết bị */
  updateEquipment: (
    id: number,
    data: Partial<AddEquipmentRequest>,
  ): Promise<MaintenanceEquipmentResponse> => {
    return api.put(`/api/v1/equipment/${id}/feature`, data);
  },

  /** PATCH /api/v1/equipment/{id}/status-feature — đổi lifecycle status */
  updateLifecycleStatus: (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<MaintenanceEquipmentResponse> => {
    return api.patch(`/api/v1/equipment/${id}/status-feature`, { status });
  },

  /**
   * GET /api/v1/equipment/{id}/maintenance-history-feature
   * BE có 2 endpoint gần trùng tên: bản không hậu tố trả MaintenanceRequestResponse
   * (phiếu bảo trì), bản `-feature` trả EquipmentMaintenanceHistoryResponse — cái FE cần.
   */
  getMaintenanceHistory: (id: number): Promise<EquipmentMaintenanceHistoryResponse[]> => {
    return api.get(`/api/v1/equipment/${id}/maintenance-history-feature`);
  },
};
