import realApiClient from '@/services/core/realApiClient';
import type { EvidencePhoto } from './tenantService';

/**
 * Service cho dữ liệu "của chính tenant đang đăng nhập" (nối backend Spring THẬT).
 * Tất cả endpoint lấy user từ JWT — KHÔNG truyền id từ client.
 * Xem doc/Tenant_BE_Contract.md.
 */

// ===== Auth / hồ sơ =====
export interface AuthMe {
  id: string;
  username: string;
  fullName: string;
  phone?: string;
  email?: string;
  role: string;        // ROLE_TENANT | ROLE_MANAGER | ...
  avatarUrl?: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ===== Dashboard =====
export interface DashboardRoom {
  id: number | null; // null khi HĐ nguyên căn (WHOLE_HOUSE) — roomNumber = tên property
  roomNumber: string | null;
  floor?: number;
  area?: number;
  depositAmount?: number;
}
export interface DashboardContract {
  id: number;
  code: string;
  type?: 'ROOM' | 'WHOLE_HOUSE';
  startDate: string;
  endDate: string;
  daysLeft: number;
  status: string;
}
export interface DashboardBuilding {
  propertyId: number;
  name: string;
  address: string;
  totalFloors?: number;
  electricityRate?: number;
  waterRate?: number;
  serviceCharge?: number;
  hostName?: string;
  hostPhone?: string;
  // Người quản lý trực tiếp (manager) — tenant liên hệ người này, KHÔNG phải chủ sở hữu.
  // BE cần bổ sung (xem doc/BE-NEED-dashboard-manager-2026-06-29.md). FE đã ưu tiên dùng.
  managerName?: string;
  managerPhone?: string;
}
export interface DashboardSummary {
  overdueInvoiceCount: number;
  overdueTotal: number;
  maintenancePending: number;
  maintenanceInProgress: number;
  unreadNotifications: number;
}
export interface TenantDashboard {
  room: DashboardRoom | null;
  contract: DashboardContract | null;
  building: DashboardBuilding | null;
  summary: DashboardSummary | null;
}

// ===== Hợp đồng của tôi =====
export interface MyContractListItem {
  id: number;
  code: string;
  type: string;                 // WHOLE_HOUSE | ROOM
  propertyName: string;
  roomCode?: string | null;
  roomNumber?: string | null;
  lessorName?: string;
  lessorPhone?: string;
  startDate: string;
  endDate: string;
  rentAmount?: number;
  // BE list trả về `deposit`; detail trả về `depositAmount` → chấp nhận cả 2
  deposit?: number;
  depositAmount?: number;
  status: string;
}

export interface ContractEquipmentDto {
  id: number | string;
  name: string;
  condition?: string;
  quantity?: number;
}

export interface ContractDetailDto {
  id: number;
  code: string;
  type?: string;
  status: string;            // PENDING | ACTIVE | EXPIRED | TERMINATED
  lessorName?: string;
  lessorPhone?: string;
  lesseeName?: string;
  lesseeCccd?: string;
  lesseePhone?: string;
  propertyName?: string;
  roomCode?: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  equipmentList?: ContractEquipmentDto[];
  notes?: string;
  signedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  terminationType?: string;
  pdfUrl?: string;
}

// ===== Biên bản bàn giao (đón khách) =====
export interface HandoverEquipmentItem {
  id: number;
  name: string;
  condition?: string;
  quantity?: number;
  source?: string;      // EXISTING = có sẵn trong nhà | ADDED = lắp thêm theo deal
  scope?: string;       // ROOM = thuộc phòng | SHARED = khu vực chung
  roomNumber?: string;
  houseArea?: string;
  cost?: number;        // chỉ có khi source = ADDED
}

export interface TenantHandoverResponse {
  contractId: number;
  contractCode: string;
  propertyName?: string;
  roomNumber?: string;
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterImageUrl?: string;
  electricMeterCapturedAt?: string;
  waterMeterImageUrl?: string;
  waterMeterCapturedAt?: string;
  roomConditionUrls?: string[];
  roomConditionPhotos?: EvidencePhoto[];
  roomConditionNote?: string;
  equipmentSnapshot?: string;
  equipmentList?: HandoverEquipmentItem[];
  acknowledged: boolean;
  acknowledgedAt?: string;
}

// ===== Yêu cầu trả phòng (checkout-request) =====
// BE: TenantMeLifecycleController /api/v1/tenant/me/checkout-requests (tenant) +
// CheckoutRequestController /api/v1/checkout-requests (manager duyệt).
// Luồng: PENDING → APPROVED → COMPLETED (complete tự terminate HĐ + giải phóng
// phòng/thiết bị); PENDING → REJECTED; tenant tự hủy khi còn PENDING.
export type CheckoutRequestStatus =
  | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface CheckoutRequestDto {
  id: number;
  contractId: number;
  contractCode?: string;
  propertyName?: string;
  roomNumber?: string;
  tenantFullName?: string;
  tenantPhone?: string;
  expectedMoveOutDate?: string; // yyyy-MM-dd
  reason?: string;
  note?: string;
  status: CheckoutRequestStatus | string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedByName?: string;
  managerNote?: string;
  rejectReason?: string;
  completedAt?: string;
}

export interface CreateCheckoutRequestBody {
  contractId: number;
  expectedMoveOutDate: string; // yyyy-MM-dd
  reason: string;
  // BE chưa có field riêng cho TK hoàn cọc/ảnh — FE gộp thông tin TK vào note
  // (đã đề nghị field riêng trong API-ProcessGaps-BE-TODO.md).
  note?: string;
}

export const realTenantSelfService = {
  // ---- Hồ sơ / tài khoản ----
  getMe: async (): Promise<AuthMe> => {
    const { data } = await realApiClient.get<AuthMe>('/api/v1/auth/me');
    return data;
  },

  updateProfile: async (body: UpdateProfileRequest): Promise<AuthMe> => {
    const { data } = await realApiClient.put<AuthMe>('/api/v1/users/me', body);
    return data;
  },

  changePassword: async (body: ChangePasswordRequest): Promise<void> => {
    await realApiClient.post('/api/v1/auth/change-password', body);
  },

  // ---- Dashboard trang chủ ----
  getDashboard: async (): Promise<TenantDashboard> => {
    const { data } = await realApiClient.get<TenantDashboard>('/api/v1/tenant/me/dashboard');
    return data;
  },

  // ---- Hợp đồng của tôi ----
  getMyContracts: async (): Promise<MyContractListItem[]> => {
    const { data } = await realApiClient.get<MyContractListItem[]>('/api/v1/tenant/me/contracts');
    return data ?? [];
  },

  getContractDetail: async (id: number | string): Promise<ContractDetailDto> => {
    const { data } = await realApiClient.get<ContractDetailDto>(`/api/v1/tenant-contracts/${id}`);
    return data;
  },

  // ---- Biên bản bàn giao (chỉ áp dụng cho HĐ đang ACTIVE) ----
  getHandover: async (): Promise<TenantHandoverResponse> => {
    const { data } = await realApiClient.get<TenantHandoverResponse>('/api/v1/tenant/me/handover');
    return data;
  },

  // Xác nhận đã nhận đúng phòng/thiết bị như biên bản — chỉ gọi được 1 lần (BE chặn
  // gọi lại nếu đã acknowledged).
  acknowledgeHandover: async (): Promise<TenantHandoverResponse> => {
    const { data } = await realApiClient.post<TenantHandoverResponse>('/api/v1/tenant/me/handover/acknowledge');
    return data;
  },

  // ---- Yêu cầu trả phòng ----
  createCheckoutRequest: async (body: CreateCheckoutRequestBody): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>('/api/v1/tenant/me/checkout-requests', body);
    return data;
  },

  listMyCheckoutRequests: async (): Promise<CheckoutRequestDto[]> => {
    const { data } = await realApiClient.get<CheckoutRequestDto[]>('/api/v1/tenant/me/checkout-requests');
    return data ?? [];
  },

  getMyCheckoutRequest: async (id: number): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.get<CheckoutRequestDto>(`/api/v1/tenant/me/checkout-requests/${id}`);
    return data;
  },

  /** Tenant tự hủy yêu cầu đang PENDING. */
  cancelCheckoutRequest: async (id: number): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.delete<CheckoutRequestDto>(`/api/v1/tenant/me/checkout-requests/${id}`);
    return data;
  },
};

/**
 * Map enum status của BE (PENDING|ACTIVE|EXPIRED|TERMINATED) -> ContractStatus của FE.
 * BE không có 'expiring_soon' → tự suy từ endDate (còn ≤ 30 ngày & chưa hết hạn).
 */
export const mapBeContractStatus = (
  beStatus: string,
  daysUntilExpiry?: number,
): 'waiting_sign' | 'active' | 'expiring_soon' | 'expired' | 'terminated' => {
  switch ((beStatus || '').toUpperCase()) {
    case 'PENDING': return 'waiting_sign';
    case 'TERMINATED': return 'terminated';
    case 'EXPIRED': return 'expired';
    case 'ACTIVE':
      return daysUntilExpiry !== undefined && daysUntilExpiry >= 0 && daysUntilExpiry <= 30
        ? 'expiring_soon'
        : 'active';
    default: return 'active';
  }
};
