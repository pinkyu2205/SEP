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
  // 27/07 — 1 account có thể có nhiều HĐ ACTIVE (nhà/phòng khác nhau). Có trong
  // từng phần tử của `contracts[]`, dùng để hiện picker "Nhà đang thuê".
  propertyId?: number;
  propertyName?: string;
  roomId?: number;
  roomNumber?: string;
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
  /** HĐ đang chọn (primary) — không truyền contractId thì BE tự chọn HĐ mới nhất. */
  room: DashboardRoom | null;
  contract: DashboardContract | null;
  building: DashboardBuilding | null;
  summary: DashboardSummary | null;
  /** Toàn bộ HĐ ACTIVE của account — FE hiện picker "Nhà đang thuê" khi length > 1. */
  contracts?: DashboardContract[];
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
  // BE (TenantContractResponse) trả field thật là `deposit`, KHÔNG phải `depositAmount`
  // (khác `MyContractListItem` của API list — đã verify 27/07/2026 bằng curl thật).
  // depositAmount giữ lại làm optional phòng khi BE đổi tên; luôn đọc qua fallback
  // ở ContractDetailScreen.mapDetail, không dùng field này trực tiếp.
  deposit?: number;
  depositAmount?: number;
  /** Trạng thái thu cọc: PENDING | PAID | FAILED | CANCELLED (BE: TenantContract.paymentStatus). */
  paymentStatus?: string;
  /** Thời điểm thu đủ cọc — PayOS `paidAt`, hoặc lúc quản lý xác nhận tiền mặt (BE 05/08/2026). */
  depositPaidAt?: string;
  /** PAYOS | CASH | null — cách khách đóng cọc. */
  depositMethod?: string;
  /** Có mã đơn PayOS = khách chuyển khoản qua cổng; không có = thu tay/tiền mặt. */
  payosOrderCode?: number;
  moveInDate?: string;
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
// Luồng đầy đủ (chốt 03/08/2026, xem docs/PLAN-checkout-flow-2026-08-03.md và
// @/constants/checkout):
//   PENDING → APPROVED → INSPECTING → WAITING_TENANT → SETTLING → COMPLETED
//   nhánh phụ: REJECTED · CANCELLED (tenant tự huỷ khi PENDING) · DISPUTED (khách phản đối).
// BE đã có ĐỦ 9 trạng thái + inspection/settlement/dispute (verify 05/08/2026).
// Duyệt yêu cầu trả phòng còn set `contract.endDate` = ngày rời dự kiến và tính lại
// hoá đơn tiền phòng tháng đó theo số ngày ở thực tế.
export type CheckoutRequestStatus =
  | 'PENDING' | 'APPROVED' | 'INSPECTING' | 'WAITING_TENANT'
  | 'DISPUTED' | 'SETTLING' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

/** Một khoản hư hỏng ghi nhận khi kiểm tra phòng — mỗi khoản phải có bằng chứng. */
export interface CheckoutDamageItem {
  /** Thiết bị trong biên bản bàn giao lúc nhận nhà (nếu khoản này gắn với 1 món cụ thể). */
  equipmentId?: number;
  label: string;
  amount: number;
  note?: string;
  photos?: string[];
}

/** Biên bản kiểm tra phòng lúc trả (check-out inspection). */
export interface CheckoutInspectionDto {
  photos?: string[];
  roomConditionNote?: string;
  electricityFinalReading?: number;
  waterFinalReading?: number;
  /** Ảnh mặt đồng hồ lúc chốt số — khách xem lại được khi thắc mắc (BE có 05/08/2026). */
  electricMeterImageUrl?: string;
  waterMeterImageUrl?: string;
  damages?: CheckoutDamageItem[];
  inspectedAt?: string;
  inspectedByName?: string;
}

/** Bảng quyết toán — BE TÍNH, FE chỉ hiển thị (để FE cộng trừ là mỗi màn ra một số). */
export interface CheckoutSettlementDto {
  /** Cọc CÒN LẠI (đã trừ các lần cấn trừ giữa kỳ), không phải số đóng ban đầu. */
  depositAmount: number;
  unpaidInvoices?: Array<{ id: number; code?: string; type?: string; amount: number }>;
  unpaidTotal: number;
  damages?: CheckoutDamageItem[];
  damageTotal: number;
  /** Điều chỉnh khác: tiền nhà tính lại theo ngày, phí vệ sinh... (âm = trừ khách). */
  adjustments?: Array<{ label: string; amount: number }>;
  /** > 0 = hoàn lại cho khách. */
  refundAmount: number;
  /** > 0 = khách phải đóng thêm. */
  extraChargeAmount: number;
  extraChargeInvoiceId?: number | null;
  /** Đã ghi nhận hoàn cọc chưa (manager chuyển khoản tay + upload chứng từ). */
  refundedAt?: string;
  refundProofUrl?: string;
}

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
  // ── BE TODO: các khối dưới đây phục vụ luồng kiểm tra + quyết toán ──
  inspection?: CheckoutInspectionDto;
  settlement?: CheckoutSettlementDto;
  /** Lý do khách phản đối bảng quyết toán (status = DISPUTED). */
  disputeReason?: string;
  disputePhotos?: string[];
  disputedAt?: string;
  /** Hạn khách phải phản hồi; quá hạn BE tự coi như đồng ý. */
  tenantResponseDeadline?: string;
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
  // contractId: chọn HĐ nào làm primary khi account có nhiều HĐ ACTIVE (nhà/phòng
  // khác nhau). Bỏ trống thì BE tự chọn HĐ mới nhất (tương thích ngược).
  getDashboard: async (contractId?: number): Promise<TenantDashboard> => {
    const { data } = await realApiClient.get<TenantDashboard>('/api/v1/tenant/me/dashboard', {
      params: contractId != null ? { contractId } : undefined,
    });
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
  // contractId: BẮT BUỘC nếu account có ≥2 HĐ ACTIVE (BE ném lỗi "Bạn đang thuê
  // nhiều nhà..." nếu thiếu) — optional nếu chỉ có 1.
  getHandover: async (contractId?: number): Promise<TenantHandoverResponse> => {
    const { data } = await realApiClient.get<TenantHandoverResponse>('/api/v1/tenant/me/handover', {
      params: contractId != null ? { contractId } : undefined,
    });
    return data;
  },

  // Xác nhận đã nhận đúng phòng/thiết bị như biên bản — chỉ gọi được 1 lần (BE chặn
  // gọi lại nếu đã acknowledged).
  acknowledgeHandover: async (contractId?: number): Promise<TenantHandoverResponse> => {
    const { data } = await realApiClient.post<TenantHandoverResponse>(
      '/api/v1/tenant/me/handover/acknowledge',
      undefined,
      { params: contractId != null ? { contractId } : undefined },
    );
    return data;
  },

  // ---- Yêu cầu trả phòng ----
  // BE tự bắn thông báo + push cho quản lý ở mỗi thao tác (CHECKOUT_REQUESTED,
  // CHECKOUT_CANCELLED, CHECKOUT_SETTLEMENT_ACCEPTED, CHECKOUT_DISPUTED).
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

  // ---- Khách xác nhận bảng quyết toán (BE TODO — FE gọi sẵn) ----
  // Đồng ý: WAITING_TENANT → SETTLING. Quá hạn không phản hồi thì BE tự accept
  // (xem CHECKOUT_AUTO_ACCEPT_DAYS trong @/constants/checkout).
  acceptSettlement: async (id: number): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/tenant/me/checkout-requests/${id}/settlement/accept`,
    );
    return data;
  },

  /** Không đồng ý: WAITING_TENANT → DISPUTED, BE báo host + manager. */
  disputeSettlement: async (
    id: number,
    body: { reason: string; photos?: string[] },
  ): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/tenant/me/checkout-requests/${id}/settlement/dispute`, body,
    );
    return data;
  },
};

/**
 * Map enum status của BE (DRAFT|PENDING|ACTIVE|EXPIRED|TERMINATED) -> ContractStatus của FE.
 * BE không có 'expiring_soon' → tự suy từ endDate (còn ≤ 30 ngày & chưa hết hạn).
 *
 * LƯU Ý: tenant KHÔNG tự ký/kích hoạt hợp đồng qua app — toàn bộ action liên quan
 * (send-otp, confirm, resubmit-approval, cancel, terminate) đều @PreAuthorize
 * hasAnyRole('MANAGER','ADMIN') phía BE (verify 27/07/2026, TenantContractActionController).
 * Vì vậy PENDING không map thành 'waiting_sign' (ngụ ý tenant tự ký được — sai) mà
 * thành 'pending_host_approval' (chỉ để xem, không có action tự thực hiện).
 */
export const mapBeContractStatus = (
  beStatus: string,
  daysUntilExpiry?: number,
): 'draft' | 'pending_host_approval' | 'active' | 'expiring_soon' | 'expired' | 'terminated' => {
  switch ((beStatus || '').toUpperCase()) {
    case 'DRAFT': return 'draft';
    case 'PENDING': return 'pending_host_approval';
    case 'TERMINATED': return 'terminated';
    case 'EXPIRED': return 'expired';
    case 'ACTIVE':
      return daysUntilExpiry !== undefined && daysUntilExpiry >= 0 && daysUntilExpiry <= 30
        ? 'expiring_soon'
        : 'active';
    default: return 'draft';
  }
};
