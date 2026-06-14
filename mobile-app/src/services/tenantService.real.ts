import realApiClient from './realApiClient';

/**
 * Tenant onboarding service nối backend Spring THẬT.
 */
export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  moveInDate: string; // yyyy-MM-dd
  rentAmount: number;
  deposit: number;
  endDate?: string;
  equipmentSnapshot?: string;
}

export interface TenantContractResponse {
  id: number;
  propertyId: number;
  roomId?: number;
  roomNumber?: string;
  tenantUserId: string;
  tenantFullName: string;
  tenantPhone: string;
  tenantCccd?: string;
  contractCode: string;
  rentAmount: number;
  deposit: number;
  moveInDate: string;
  startDate: string;
  endDate?: string;
  status: string;
}

export const realTenantService = {
  onboardRoomTenant: async (
    propertyId: number,
    roomId: number,
    body: OnboardTenantRequest
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/properties/${propertyId}/rooms/${roomId}/tenant-contract`,
      body
    );
    return data;
  },

  onboardWholeHouseTenant: async (
    propertyId: number,
    body: OnboardTenantRequest
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/properties/${propertyId}/tenant-contract`,
      body
    );
    return data;
  },

  listByProperty: async (propertyId: number): Promise<TenantContractResponse[]> => {
    const { data } = await realApiClient.get<TenantContractResponse[]>(
      `/api/v1/properties/${propertyId}/tenant-contracts`
    );
    return data ?? [];
  },
};
