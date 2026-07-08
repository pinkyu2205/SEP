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
  // Lifecycle + Maintenance history (Maintenance_BE_Contract.md §2.4)
  // ===========================================================================

  /** GET /api/v1/equipment/{id} */
  getById: (id: number): Promise<MaintenanceEquipmentResponse> => {
    return api.get(`/api/v1/equipment/${id}`);
  },

  /** GET /api/v1/equipment?roomId= — thiết bị theo phòng */
  getByRoom: (roomId: number): Promise<MaintenanceEquipmentResponse[]> => {
    return api.get('/api/v1/equipment', { params: { roomId } });
  },

  /** PUT /api/v1/equipment/{id} — sửa thông tin thiết bị */
  updateEquipment: (
    id: number,
    data: Partial<AddEquipmentRequest>,
  ): Promise<MaintenanceEquipmentResponse> => {
    return api.put(`/api/v1/equipment/${id}`, data);
  },

  /** PATCH /api/v1/equipment/{id}/status — đổi lifecycle status */
  updateLifecycleStatus: (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<MaintenanceEquipmentResponse> => {
    return api.patch(`/api/v1/equipment/${id}/status`, { status });
  },

  /** GET /api/v1/equipment/{id}/maintenance-history */
  getMaintenanceHistory: (id: number): Promise<EquipmentMaintenanceHistoryResponse[]> => {
    return api.get(`/api/v1/equipment/${id}/maintenance-history`);
  },
};
