import api from './api';
import type {
  CalculateDepreciationRequest,
  DepreciationCalculationResponse,
} from '../types/api.types';

export const depreciationService = {
  /** POST /api/v1/properties/{propertyId}/depreciation/calculate — Tính khấu hao */
  calculate: (propertyId: number, data?: CalculateDepreciationRequest): Promise<DepreciationCalculationResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/depreciation/calculate`, data ?? {});
  },

  /** GET /api/v1/properties/{propertyId}/depreciation — Lấy kết quả khấu hao */
  getByProperty: (propertyId: number): Promise<DepreciationCalculationResponse> => {
    return api.get(`/api/v1/properties/${propertyId}/depreciation`);
  },
};
