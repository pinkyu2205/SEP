import api from './api';
import type {
  CreateInboundContractRequest,
  InboundContractResponse,
} from '@/types/api.types';

export const inboundContractService = {
  /** POST /api/v1/properties/{propertyId}/inbound-contract — Ký hợp đồng inbound */
  signContract: (propertyId: number, data: CreateInboundContractRequest): Promise<InboundContractResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/inbound-contract`, data);
  },

  /** GET /api/v1/properties/{propertyId}/inbound-contract — Lấy HĐ inbound */
  getContractByProperty: (propertyId: number): Promise<InboundContractResponse> => {
    return api.get(`/api/v1/properties/${propertyId}/inbound-contract`);
  },
};
