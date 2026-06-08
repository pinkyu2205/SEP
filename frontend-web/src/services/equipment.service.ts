import api from './api';
import type { AddEquipmentRequest, EquipmentResponse } from '../types/api.types';

export const equipmentService = {
  /** POST /api/v1/properties/{propertyId}/equipments — Thêm thiết bị */
  addEquipment: (propertyId: number, data: AddEquipmentRequest): Promise<EquipmentResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/equipments`, data);
  },

  /** GET /api/v1/properties/{propertyId}/equipments — Danh sách thiết bị */
  getEquipmentsByProperty: (propertyId: number): Promise<EquipmentResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/equipments`);
  },
};
