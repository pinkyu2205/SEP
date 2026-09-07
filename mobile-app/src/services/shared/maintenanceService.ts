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
  RescheduleVisitRequestDto,
  RescheduleRepairRequestDto,
  ManagerAvailabilitySlotDto,
} from '@/types';

/**
 * Maintenance service — redesign 01/09/2026 (BE commit 8ddbc3e/28b177b) + lịch hẹn/quét
 * QR 05/09/2026 (BE commit e0b1d2d, xem docs/maintenance-appointment-implementation-spec.md):
 *   Luồng A: OPEN(+visitAppointmentAt) → confirm-arrival → approve
 *            → [REPAIR_SCHEDULED → start-repair →] IN_REPAIR → complete → CLOSED
 *   Luồng B: OPEN → confirm-arrival → reject-fault
 *            → [REPAIR_SCHEDULED → start-repair →] TENANT_FAULT → complete → CLOSED
 *                  → reject-fault → PENDING_TENANT_REPAIR → submit-self-repair
 *                    → verify-repair → CLOSED | OUTSTANDING_DAMAGE
 * REPAIR_SCHEDULED chỉ xuất hiện khi manager chọn "đặt lịch sửa sau" lúc approve/
 * reject-fault thay vì sửa ngay. Gate quét QR (confirm-arrival/start-repair) chỉ chặn
 * phía app — BE không validate việc quét, chỉ ghi mốc thời gian khi được gọi.
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
   * equipmentId) + visitAppointmentAt BẮT BUỘC (giờ hành chính 07:00–18:00, không trùng
   * lịch manager phụ trách nhà — 409 nếu trùng). Gửi kèm previousRequestId khi tạo lại
   * vì phiếu trước chưa ổn. → OPEN.
   */
  createRequest: async (body: CreateMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.post<MaintenanceRequestDto>(BASE, body);
    return data;
  },

  /**
   * PUT /{id}/reschedule-visit — tenant hoặc manager đổi lịch hẹn xem. Chỉ khi OPEN,
   * chưa confirm-arrival, và còn TRƯỚC ngày hẹn hiện tại (đúng ngày hẹn trở đi chỉ được
   * huỷ, không đổi được nữa).
   */
  rescheduleVisit: async (
    id: number, body: RescheduleVisitRequestDto,
  ): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/reschedule-visit`, body);
    return data;
  },

  /**
   * GET /manager-availability — khung giờ VISIT/REPAIR đã bận của 1 manager (hoặc theo
   * propertyId), dùng để tô xám ô giờ đã bận lúc tenant/manager chọn lịch hẹn.
   */
  getManagerAvailability: async (
    params: { propertyId?: number; managerId?: string; from: string; to: string },
  ): Promise<ManagerAvailabilitySlotDto[]> => {
    const { data } = await realApiClient.get<ManagerAvailabilitySlotDto[]>(
      `${BASE}/manager-availability`, { params },
    );
    return data ?? [];
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
   * PUT /{id}/confirm-arrival — manager quét QR đúng thiết bị (app tự chặn, BE không
   * validate) xác nhận đã có mặt tại hiện trường. OPEN → OPEN, chỉ ghi mốc thời gian —
   * BẮT BUỘC gọi trước approve/reject-fault (trừ phiếu cũ không có visitAppointmentAt).
   */
  confirmArrival: async (id: number): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/confirm-arrival`);
    return data;
  },

  /**
   * PUT /{id}/approve — manager duyệt (Luồng A: hao mòn/lỗi chủ), BẮT BUỘC gán
   * category, priority tùy chọn. Không kèm repairAppointmentAt → sửa ngay, OPEN →
   * IN_REPAIR (phòng → MAINTENANCE). Kèm repairAppointmentAt → đặt lịch sửa sau,
   * OPEN → REPAIR_SCHEDULED (chờ startRepair()).
   */
  approve: async (id: number, body: ApproveMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/approve`, body);
    return data;
  },

  /**
   * PUT /{id}/reject-fault — manager xác định lỗi do tenant (Luồng B). resolutionPath
   * MANAGER_REPAIR → TENANT_FAULT (hoặc REPAIR_SCHEDULED nếu kèm repairAppointmentAt);
   * TENANT_SELF_REPAIR → PENDING_TENANT_REPAIR (bắt buộc kèm selfRepairDeadline +
   * estimatedDamageAmount — BE không tự default).
   */
  rejectFault: async (id: number, body: RejectFaultRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/reject-fault`, body);
    return data;
  },

  /**
   * PUT /{id}/reschedule-repair — manager-only, đổi lịch sửa. Chỉ khi REPAIR_SCHEDULED
   * và còn trước ngày hẹn (tenant không tự đổi lịch sửa — liên hệ qua manager).
   */
  rescheduleRepair: async (
    id: number, body: RescheduleRepairRequestDto,
  ): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/reschedule-repair`, body);
    return data;
  },

  /**
   * PUT /{id}/start-repair — manager quét QR (lần 2, app tự chặn) bắt đầu sửa từ
   * REPAIR_SCHEDULED. Chuyển IN_REPAIR (Luồng A) hoặc TENANT_FAULT (Luồng B) tuỳ
   * flowType đã lưu sẵn — không cần truyền lại.
   */
  startRepair: async (id: number): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/start-repair`);
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

  /** PUT /{id}/cancel — hủy (tenant chỉ khi OPEN; manager mọi trạng thái trừ CLOSED/CANCELLED, kể cả REPAIR_SCHEDULED). */
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

  /**
   * DELETE /{id}/photos?type=&url= — gỡ 1 ảnh ĐÃ upload (BE ship 07/09/2026, xem
   * docs/BE-YEUCAU-xoa-anh-va-gop-tien-den-bu-2026-09-07.md). Chỉ được khi phiếu chưa
   * CLOSED/CANCELLED — dùng để đổi ảnh chọn nhầm mà không cần liên hệ ngoài luồng.
   */
  deletePhoto: async (
    id: number, type: MaintenancePhotoType, url: string,
  ): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.delete<MaintenanceRequestDto>(`${BASE}/${id}/photos`, {
      params: { type, url },
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
