import realApiClient from '@/services/core/realApiClient';
import type {
  MaintenanceRequestDto,
  CreateMaintenanceRequestDto,
  ApproveMaintenanceRequestDto,
  CompleteMaintenanceRequestDto,
  MaintenanceDashboardDto,
} from '@/types';

/**
 * Maintenance service — flow mới 17/07 (FE-maintenance-flow):
 *   PENDING → approve → APPROVED → complete → WAITING_TENANT_CONFIRM
 *   → confirm → CLOSED  |  → reject → REJECTED → review-reject.
 * Không còn lịch hẹn / chi phí trong luồng này (billing sau CLOSED).
 * Base path /api/v1/maintenance, JWT tự inject qua realApiClient.
 */
const BASE = '/api/v1/maintenance';

export type MaintenancePhotoType = 'BEFORE' | 'AFTER' | 'REJECT';

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
   * POST / — tenant tạo yêu cầu: title + description + ≥1 ảnh BEFORE (URL). → PENDING.
   * KHÔNG gửi category/priority — manager gán khi duyệt (flow 17/07 chiều).
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

  /** PUT /{id}/confirm — TENANT xác nhận đã sửa xong (chỉ accept=true). → CLOSED */
  confirm: async (id: number): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/confirm`, {
      accept: true,
    });
    return data;
  },

  /**
   * PUT /{id}/reject — TENANT từ chối nghiệm thu (multipart: reason + files ≥1 ảnh).
   * → REJECTED. Từ chối KHÔNG dùng confirm accept=false.
   */
  reject: async (id: number, reason: string, imageUris: string[]): Promise<MaintenanceRequestDto> => {
    const form = new FormData();
    form.append('reason', reason);
    await appendFiles(form, imageUris);
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/reject`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
   * PUT /{id}/approve — manager duyệt yêu cầu, BẮT BUỘC gán category (phục vụ báo cáo
   * chi phí), priority tùy chọn. PENDING → APPROVED (phòng → MAINTENANCE).
   */
  approve: async (id: number, body: ApproveMaintenanceRequestDto): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/approve`, body);
    return data;
  },

  /**
   * PUT /{id}/complete — manager báo sửa xong (cần ảnh AFTER: upload trước qua
   * uploadPhotos hoặc gửi kèm URL). APPROVED → WAITING_TENANT_CONFIRM.
   */
  complete: async (id: number, body: CompleteMaintenanceRequestDto = {}): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/complete`, body);
    return data;
  },

  /**
   * PUT /{id}/review-reject — manager xem xét từ chối của tenant.
   * approve=true → APPROVED (sửa lại, ảnh AFTER cũ bị xóa);
   * approve=false → WAITING_TENANT_CONFIRM (giữ kết quả, chờ tenant/auto-confirm).
   */
  reviewReject: async (id: number, approve: boolean): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/review-reject`, {
      approve,
    });
    return data;
  },

  /** PUT /{id}/cancel — manager hủy (mọi trạng thái trừ CLOSED/CANCELLED). */
  cancel: async (id: number, reason?: string): Promise<MaintenanceRequestDto> => {
    const { data } = await realApiClient.put<MaintenanceRequestDto>(`${BASE}/${id}/cancel`, null, {
      params: reason ? { reason } : {},
    });
    return data;
  },

  // ---- Shared ----

  /** POST /{id}/photos?type= — upload ảnh BEFORE / AFTER / REJECT (multipart). */
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

  /** GET /dashboard — pending / inProgress (APPROVED+WAITING+REJECTED) / resolved (CLOSED) / cancelled. */
  getDashboard: async (propertyId?: number): Promise<MaintenanceDashboardDto> => {
    const { data } = await realApiClient.get<MaintenanceDashboardDto>(`${BASE}/dashboard`, {
      params: propertyId ? { propertyId } : {},
    });
    return data;
  },
};
