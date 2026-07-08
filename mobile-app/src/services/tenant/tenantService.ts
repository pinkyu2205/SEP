import realApiClient from '@/services/core/realApiClient';

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

// 1 dòng trong biên bản bàn giao thiết bị (snapshot theo hợp đồng).
// EXISTING = thiết bị sẵn có của nhà/phòng được bàn giao · ADDED = khách lắp thêm (chủ đầu tư mua).
export interface EquipmentSnapshotItem {
  equipmentId?: number;
  name: string;
  category: string;
  quantity: number;
  cost?: number;
  source: 'EXISTING' | 'ADDED';
  ownedBy: 'OWNER';
}

export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  moveInDate: string; // yyyy-MM-dd
  rentAmount: number;
  deposit: number;
  endDate?: string;
  // Biên bản bàn giao thiết bị: JSON.stringify({ handoverDate, items: EquipmentSnapshotItem[] }).
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
  // Case 2: manager chưa chắc giá -> BE tạo HĐ chờ Host duyệt giá, CHƯA thu cọc.
  requireHostPriceApproval?: boolean;
  // Thiết bị sẵn có khách KHÔNG nhận -> BE set operationalStatus=DISABLED (gỡ khỏi phòng),
  // lưu disabled_reason + gắn contract; tự ACTIVE lại khi hết HĐ. Xem Phần C của plan.
  declinedEquipmentIds?: number[];
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

  // Duyệt giá (Case 2). Tên field suy ra từ thiết kế — chỉnh nếu BE đặt khác.
  priceApprovalStatus?: ContractPriceApprovalStatus;
  priceRejectReason?: string;
  equipmentSnapshot?: string;
}

// Trạng thái duyệt giá của hợp đồng (Case 2 — gửi Host duyệt).
export type ContractPriceApprovalStatus =
  | 'PENDING_PRICE_APPROVAL'   // chờ Host duyệt
  | 'APPROVED_AWAITING_DEPOSIT' // Host đồng ý, chờ manager thu cọc
  | 'PRICE_REJECTED';          // Host từ chối (+ lý do)

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

// Onboarding v2: username khách thuê MỚI = SĐT thuần (BE bỏ tiền tố 't').
// Xem BE-tenant-onboarding-v2-handoff.md §3.3/§4.7.
// Dùng làm fallback khi confirm response không kèm tenantUsername.
export const defaultTenantUsername = (phone: string): string =>
  String(phone).replace(/\D/g, '');

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

  // Gửi OTP xác nhận hợp đồng tới SĐT khách (BE: POST /tenant-contracts/{id}/send-otp).
  // Dev OTP mode: BE không gửi SMS thật, confirm chấp nhận mọi mã 6 số. Prod (Twilio): bắt buộc
  // gọi bước này trước confirm để có mã hợp lệ. Xem tài liệu tiếp khách §7.1.
  sendContractOtp: async (contractId: number): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/send-otp`);
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

  // ===== Duyệt giá (Case 2) — phụ thuộc BE, tên endpoint suy ra từ thiết kế =====

  // Danh sách HĐ chờ xử lý của manager: gồm DRAFT/PENDING được gán (đón khách v2)
  // và các HĐ chờ/đã duyệt/bị từ chối giá. Chấp nhận array thuần lẫn Spring Page.
  listManagedContracts: async (
    status?: ContractPriceApprovalStatus | 'DRAFT' | 'PENDING',
  ): Promise<TenantContractResponse[]> => {
    const { data } = await realApiClient.get<
      TenantContractResponse[] | { content?: TenantContractResponse[] }
    >('/api/v1/tenant-contracts/managed', { params: status ? { status } : {} });
    if (Array.isArray(data)) return data;
    return data?.content ?? [];
  },

  // Manager chỉnh giá sau khi Host từ chối -> gửi Host duyệt lại.
  resubmitPriceApproval: async (
    contractId: number,
    body: { rentAmount: number; deposit: number },
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/resubmit-approval`,
      body,
    );
    return data;
  },

  // Hủy hợp đồng (khi manager quyết định không tiếp tục onboarding).
  cancelContract: async (contractId: number): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/cancel`);
  },

  // Trả phòng / trả nhà: kết thúc HĐ đang hiệu lực (manager). Phòng tự về AVAILABLE.
  // (BE TODO nếu chưa có endpoint này — FE gọi sẵn.)
  terminateContract: async (contractId: number, reason?: string): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/terminate`, { reason });
  },
};
