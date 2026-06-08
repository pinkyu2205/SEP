import api from './api';
import type { AddRenovationRequest, RenovationResponse } from '../types/api.types';

export const renovationService = {
  /** POST /api/v1/properties/{propertyId}/renovations — Thêm hạng mục cải tạo */
  addRenovation: (propertyId: number, data: AddRenovationRequest): Promise<RenovationResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/renovations`, data);
  },

  /** GET /api/v1/properties/{propertyId}/renovations — Danh sách cải tạo */
  getRenovationsByProperty: (propertyId: number): Promise<RenovationResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/renovations`);
  },
};
