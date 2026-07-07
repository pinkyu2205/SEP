import api from './api';
import type {
  ConfirmPropertyActivationRequest,
  PropertyActivationResponse,
} from '@/types/api.types';

export const activationService = {
  /** POST /api/v1/properties/{propertyId}/activation/confirm — Xác nhận giá & kích hoạt */
  confirmActivation: (propertyId: number, data: ConfirmPropertyActivationRequest): Promise<PropertyActivationResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/activation/confirm`, data);
  },
};
