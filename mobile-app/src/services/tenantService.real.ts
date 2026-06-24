import realApiClient from './realApiClient';

/**
 * Tenant onboarding service nối backend Spring THẬT.
 */
export interface HouseholdMemberInput {
  fullName: string;
  relation?: string;
  phone?: string;
  dateOfBirth?: string; // yyyy-MM-dd
  cccd?: string;
}

export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  moveInDate: string; // yyyy-MM-dd
  rentAmount: number;
  deposit: number;
  endDate?: string;
  equipmentSnapshot?: string;

  depositMonths?: number;
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterImageUrl?: string;
  waterMeterImageUrl?: string;
  roomConditionUrls?: string[];
  roomConditionNote?: string;
  householdMembers?: HouseholdMemberInput[];

  // mobile: tạo HĐ PENDING, cần thanh toán cọc + OTP rồi confirm
  requireDepositPayment?: boolean;
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
  paymentStatus?: string; // PENDING | PAID | FAILED | CANCELLED
  payosOrderCode?: number;
  payosCheckoutUrl?: string;
  payosQrCode?: string;

  // Sau khi confirm: thông tin tài khoản tenant (BE bổ sung — xem MD work/Onboarding.md)
  tenantUsername?: string;
  tenantAccountCreated?: boolean; // true nếu vừa tạo mới tài khoản
  tenantRolePromoted?: boolean;   // true nếu vừa nâng ROLE_USER -> ROLE_TENANT
}

export interface OcrMeterResponse {
  reading: string;
  numbers: string[];
  rawText: string;
}

// Body cho POST /tenant-contracts/{id}/confirm (BE: ConfirmContractRequest).
// ⚠️ Tên field 'otp' suy ra từ DTO BE — nếu BE đặt tên khác (vd otpCode) thì đổi lại cho khớp.
export interface ConfirmContractRequest {
  otp: string;
}

export interface TenantLookupResponse {
  exists: boolean;
  fullName?: string;
  phoneNumber?: string;
  cccd?: string;
  role?: string; // BE (khuyến nghị) trả role để FE hiển thị hint chính xác
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

  // OCR chỉ số đồng hồ từ ảnh đã upload Cloudinary
  ocrMeter: async (imageUrl: string): Promise<OcrMeterResponse> => {
    const { data } = await realApiClient.post<OcrMeterResponse>('/api/v1/ocr/meter', { imageUrl });
    return data;
  },

  // Tra cứu khách thuê đã có theo SĐT để tự điền form
  lookupByPhone: async (phone: string): Promise<TenantLookupResponse> => {
    const { data } = await realApiClient.get<TenantLookupResponse>('/api/v1/tenants/lookup', {
      params: { phone },
    });
    return data;
  },

  // PayOS: tạo link/QR thanh toán cọc cho HĐ
  createDepositPayment: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/deposit-payment`
    );
    return data;
  },

  // Poll trạng thái HĐ / thanh toán
  getContract: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.get<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}`
    );
    return data;
  },

  // Chủ động hỏi PayOS & đồng bộ trạng thái thanh toán (local không có webhook)
  checkPayment: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/check-payment`
    );
    return data;
  },

  // Hoàn tất HĐ sau khi đã thanh toán cọc + OTP.
  // BE: confirm(Long id, @RequestBody ConfirmContractRequest) -> BẮT BUỘC có body (chứa mã OTP).
  confirmContract: async (
    contractId: number,
    body: ConfirmContractRequest,
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/confirm`,
      body,
    );
    return data;
  },
};
