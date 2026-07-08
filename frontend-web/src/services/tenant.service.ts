import api from './api';
import type { OnboardTenantRequest, TenantContractResponse } from '@/types/api.types';

const BASE = '/api/v1/properties';

/** Kết quả tra cứu khách theo SĐT (GET /api/v1/tenants/lookup). */
export interface TenantLookupResponse {
  exists: boolean;
  eligible?: boolean; // BE tự tính: SĐT có hợp lệ để onboard làm khách thuê không
  fullName?: string;
  phoneNumber?: string;
  cccd?: string;
  role?: string; // ROLE_USER | ROLE_TENANT | ROLE_ADMIN | ROLE_MANAGER | ROLE_OWNER
}

/** SĐT hợp lệ để onboard làm khách thuê (chưa có tài khoản, hoặc là USER/TENANT). */
export const isTenantEligibleRole = (role?: string): boolean =>
  !role || role === 'ROLE_USER' || role === 'ROLE_TENANT';

// BE (OnboardTenantRequest) deserialize bằng constructor sinh bởi Lombok, nên các field
// `boolean` (không phải Boolean) BẮT BUỘC phải có mặt trong JSON, thiếu 1 field là toàn bộ
// request 400 lỗi "Cannot map `null` into type `boolean`". Luôn set default tường minh ở đây.
const withBooleanDefaults = (data: OnboardTenantRequest): OnboardTenantRequest => ({
  requireDepositPayment: false,
  requireHostPriceApproval: false,
  draft: false,
  ...data,
});

export const tenantService = {
  /** POST /properties/{propertyId}/rooms/{roomId}/tenant-contract — Onboard khách vào 1 phòng */
  onboardRoomTenant: (
    propertyId: number,
    roomId: number,
    data: OnboardTenantRequest,
  ): Promise<TenantContractResponse> => {
    return api.post(`${BASE}/${propertyId}/rooms/${roomId}/tenant-contract`, withBooleanDefaults(data));
  },

  /** POST /properties/{propertyId}/tenant-contract — Onboard khách thuê nguyên căn */
  onboardWholeHouseTenant: (
    propertyId: number,
    data: OnboardTenantRequest,
  ): Promise<TenantContractResponse> => {
    return api.post(`${BASE}/${propertyId}/tenant-contract`, withBooleanDefaults(data));
  },

  /** GET /properties/{propertyId}/tenant-contracts — DS hợp đồng thuê của tòa.
   *  `silent`: tắt toast lỗi tự động của interceptor (caller tự xử lý). */
  listByProperty: (propertyId: number, opts?: { silent?: boolean }): Promise<TenantContractResponse[]> => {
    return api.get(
      `${BASE}/${propertyId}/tenant-contracts`,
      opts?.silent ? ({ skipErrorToast: true } as never) : undefined,
    );
  },

  // ===========================================================================
  // Onboarding v2 — Hợp đồng nháp (DRAFT) + gán khách cho manager
  // ===========================================================================

  /** Tạo hợp đồng nháp: POST .../tenant-contract với draft=true.
   *  roomId=null → thuê nguyên căn. */
  createDraft: (
    propertyId: number,
    roomId: number | null,
    data: OnboardTenantRequest,
  ): Promise<TenantContractResponse> => {
    const body = withBooleanDefaults({ ...data, draft: true });
    return roomId != null
      ? api.post(`${BASE}/${propertyId}/rooms/${roomId}/tenant-contract`, body)
      : api.post(`${BASE}/${propertyId}/tenant-contract`, body);
  },

  /** GET /tenant-contracts?status=DRAFT — DS hợp đồng nháp (admin). */
  listDrafts: (params?: { propertyId?: number; assignedManagerId?: string }): Promise<TenantContractResponse[]> => {
    return api.get('/api/v1/tenant-contracts', {
      params: { status: 'DRAFT', ...(params ?? {}) },
      skipErrorToast: true,
    } as never);
  },

  /** GET /tenant-contracts/{id} — chi tiết hợp đồng. */
  getById: (id: number): Promise<TenantContractResponse> => {
    return api.get(`/api/v1/tenant-contracts/${id}`);
  },

  /** PUT /tenant-contracts/{id} — sửa hợp đồng nháp (admin chỉnh field). */
  updateDraft: (id: number, data: Partial<OnboardTenantRequest>): Promise<TenantContractResponse> => {
    return api.put(`/api/v1/tenant-contracts/${id}`, data);
  },

  /** PATCH /tenant-contracts/{id}/assign-manager — gán manager đón khách + gửi thông báo. */
  assignManager: (
    id: number,
    data: { assignedManagerId: string; expectedReceptionDate?: string },
  ): Promise<TenantContractResponse> => {
    return api.patch(`/api/v1/tenant-contracts/${id}/assign-manager`, data);
  },

  /** POST /tenant-contracts/{id}/cancel — hủy hợp đồng nháp. */
  cancel: (id: number): Promise<void> => {
    return api.post(`/api/v1/tenant-contracts/${id}/cancel`);
  },

  /** GET /tenants/lookup?phone= — tra cứu khách theo SĐT (để tự điền + cảnh báo role). */
  lookupByPhone: (phone: string): Promise<TenantLookupResponse> => {
    return api.get('/api/v1/tenants/lookup', { params: { phone }, skipErrorToast: true } as never);
  },
};
