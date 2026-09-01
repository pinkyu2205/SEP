import realApiClient from '@/services/core/realApiClient';
import type {
  MaintenanceRequestDto,
  CreateMaintenanceRequestDto,
  ApproveMaintenanceRequestDto,
  CompleteMaintenanceRequestDto,
  RejectFaultRequestDto,
  ReportFaultRequestDto,
  SubmitSelfRepairRequestDto,
  VerifyRepairRequestDto,
  OutstandingDamageDto,
  MaintenanceDashboardDto,
} from '@/types';

/**
 * Maintenance service — redesign 01/09/2026 (BE commit 8ddbc3e/28b177b, as-built):
 *   Luồng A: OPEN → approve → IN_REPAIR → complete → CLOSED
 *   Luồng B: OPEN → reject-fault → TENANT_FAULT → complete → CLOSED (tự tạo charge)
 *                  → reject-fault → PENDING_TENANT_REPAIR → submit-self-repair
 *                    → verify-repair → CLOSED | OUTSTANDING_DAMAGE
 * Không còn tenant confirm/reject nghiệm thu, không còn reopen — tạo phiếu mới kèm
 * previousRequestId. Base path /api/v1/maintenance, JWT tự inject qua realApiClient.
 */
const BASE = '/api/v1/maintenance';

export type MaintenancePhotoType = 'BEFORE' | 'FAULT_EVIDENCE' | 'SELF_REPAIR' | 'AFTER' | 'INVOICE';

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface MaintenanceListParams {
  status?: string;
  priority?: string;
  category?: string;
  propertyId?: number;
  roomId?: number;
  page?: number;
  size?: number;
}

/** RN FormData cho ảnh local URI (native cần object {uri,name,type}, web cần Blob). */
const appendFiles = async (form: FormData, uris: string[]) => {
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const name = uri.split('/').pop()?.split('?')[0] || `photo-${Date.now()}-${i}.jpg`;
    if (typeof window !== 'undefined' && (uri.startsWith('blob:') || uri.startsWith('data:'))) {
      const blob = await (await fetch(uri)).blob();
      form.append('files', blob as any, name);
    } else {
      form.append('files', { uri, name, type: 'image/jpeg' } as any);
    }
  }
};

export const realMaintenanceService = {
  // ---- Tenant ----

  /**
   * POST / — tenant tạo yêu cầu: title + ≥1 ảnh BEFORE (URL) + category (nếu không có
   * equipmentId). Gửi kèm previousRequestId khi tạo lại vì phiếu trước chưa ổn. → OPEN.
   */
  createRequest: async (body: CreateMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.post<MaintenanceRequestDto>(BASE, body);
    return data;
  },

  getMyRequests: async (
    params: MaintenanceListParams = {},
  ): Promise<SpringPage<MaintenanceRequestDto>> => {
    const { data } = await realApiClient.get<SpringPage<MaintenanceRequestDto>>(
      `${BASE}/my-requests`,
      { params: { page: 0, size: 50, ...params } },
    );
    return data;
  },

  getDetail: async (id: number): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.get<MaintenanceRequestDto>(`${BASE}/${id}`);
    return data;
  },

  /**
   * PUT /{id}/submit-self-repair — tenant nộp ảnh đã tự sửa (Luồng B, status
   * PENDING_TENANT_REPAIR). Cần ≥1 ảnh SELF_REPAIR — có thể đã upload trước qua
   * uploadPhotos hoặc gửi kèm ở đây (multipart).
   */
  submitSelfRepair: async (
    id: number, note: string | undefined, imageUris: string[],
  ): Promise<MaintenanceRequestDto> => {
    const form = new FormData();
    if (note) form.append('note', note);
    await appendFiles(form, imageUris);
    const { data } = await realApiClient.put<MaintenanceRequestDto>(
      `${BASE}/${id}/submit-self-repair`, form, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  // ---- Manager ----

  listForManager: async (
    params: MaintenanceListParams = {},
  ): Promise<SpringPage<MaintenanceRequestDto>> => {
    const { data } = await realApiClient.get<SpringPage<MaintenanceRequestDto>>(BASE, {
      params: { page: 0, size: 50, ...params },
    });
    return data;
  },

  /**
   * PUT /{id}/approve — manager duyệt (Luồng A: hao mòn/lỗi chủ), BẮT BUỘC gán
   * category, priority tùy chọn. OPEN → IN_REPAIR (phòng → MAINTENANCE).
   */
  approve: async (id: number, body: ApproveMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/approve`, body);
    return data;
  },

  /**
   * PUT /{id}/reject-fault — manager xác định lỗi do tenant (Luồng B). resolutionPath
   * MANAGER_REPAIR → TENANT_FAULT; TENANT_SELF_REPAIR → PENDING_TENANT_REPAIR (bắt buộc
   * kèm selfRepairDeadline + estimatedDamageAmount — BE không tự default).
   */
  rejectFault: async (id: number, body: RejectFaultRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/reject-fault`, body);
    return data;
  },

  /**
   * PUT /{id}/report-fault — thay reject-fault cho luồng mới (01/09/2026): chỉ mô tả +
   * ảnh bằng chứng, KHÔNG chọn hướng xử lý. OPEN → TENANT_FAULT, faultResolutionPath để
   * null, không tạo hoá đơn/notify — chờ admin duyệt trên web (PUT /{id}/admin-review).
   */
  reportFault: async (id: number, body: ReportFaultRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/report-fault`, body);
    return data;
  },

  /**
   * PUT /{id}/verify-repair — manager duyệt kết quả tenant tự sửa (status
   * PENDING_TENANT_REPAIR, cần đã có ≥1 ảnh SELF_REPAIR). accepted=true → CLOSED;
   * accepted=false → OUTSTANDING_DAMAGE (ghi outstanding_damage_records, chờ checkout).
   */
  verifyRepair: async (id: number, body: VerifyRepairRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/verify-repair`, body);
    return data;
  },

  /**
   * PUT /{id}/complete — manager báo sửa xong. Dùng cho cả IN_REPAIR (Luồng A) và
   * TENANT_FAULT (Luồng B nhánh manager sửa hộ — tự tạo charge + issuedInvoice trong
   * response). Cần AFTER + INVOICE + repairDescription + invoiceVendor/Date/Amount(>0).
   */
  complete: async (id: number, body: CompleteMaintenanceRequestDto = {}): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/complete`, body);
    return data;
  },

  /** GET /outstanding-damages — thiết bị hư chưa xử lý, chờ trừ cọc lúc checkout. */
  getOutstandingDamages: async (
    params: { propertyId?: number; tenantContractId?: number } = {},
  ): Promise<OutstandingDamageDto[]> => {
    const { data } = await realApiClient.get<OutstandingDamageDto[]>(`${BASE}/outstanding-damages`, { params });
    return data ?? [];
  },

  /** PUT /{id}/cancel — hủy (tenant chỉ khi OPEN; manager khi OPEN/IN_REPAIR). */
  cancel: async (id: number, reason?: string): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/cancel`, null, {
      params: reason ? { reason } : {},
    });
    return data;
  },

  // ---- Shared ----

  /** POST /{id}/photos?type= — upload ảnh BEFORE / FAULT_EVIDENCE / SELF_REPAIR / AFTER / INVOICE. */
  uploadPhotos: async (
    id: number,
    uris: string[],
    type: MaintenancePhotoType,
  ): Promise<MaintenanceRequestDto> => {
    const form = new FormData();
    await appendFiles(form, uris);
    const { data } = await realApiClient.post<MaintenanceRequestDto>(`${BASE}/${id}/photos`, form, {
      params: { type },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  /** GET /dashboard — open / inProgress / resolved / cancelled / totalRepairCost. */
  getDashboard: async (propertyId?: number): Promise<MaintenanceDashboardDto> => {
    const { data } = await realApiClient.get<MaintenanceDashboardDto>(`${BASE}/dashboard`, {
      params: propertyId ? { propertyId } : {},
    });
    return data;
  },
};
