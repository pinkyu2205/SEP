import api from './api';
import type { OnboardTenantRequest, TenantContractResponse } from '@/types/api.types';

const BASE = '/api/v1/properties';

export const tenantService = {
  /** POST /properties/{propertyId}/rooms/{roomId}/tenant-contract — Onboard khách vào 1 phòng */
  onboardRoomTenant: (
    propertyId: number,
    roomId: number,
    data: OnboardTenantRequest,
  ): Promise<TenantContractResponse> => {
    return api.post(`${BASE}/${propertyId}/rooms/${roomId}/tenant-contract`, data);
  },

  /** POST /properties/{propertyId}/tenant-contract — Onboard khách thuê nguyên căn */
  onboardWholeHouseTenant: (
    propertyId: number,
    data: OnboardTenantRequest,
  ): Promise<TenantContractResponse> => {
    return api.post(`${BASE}/${propertyId}/tenant-contract`, data);
  },

  /** GET /properties/{propertyId}/tenant-contracts — DS hợp đồng thuê của tòa.
   *  `silent`: tắt toast lỗi tự động của interceptor (caller tự xử lý). */
  listByProperty: (propertyId: number, opts?: { silent?: boolean }): Promise<TenantContractResponse[]> => {
    return api.get(
      `${BASE}/${propertyId}/tenant-contracts`,
      opts?.silent ? ({ skipErrorToast: true } as never) : undefined,
    );
  },
};
