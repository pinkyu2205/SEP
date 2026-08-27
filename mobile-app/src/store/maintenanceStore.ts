import { useState, useEffect } from 'react';
import { MaintenanceRequest, MaintenanceStatus, MaintenancePhotoHistoryDto } from '@/types';

// ===================== TENANT MAINTENANCE REQUESTS =====================

const ACTIVE_STATUSES: MaintenanceStatus[] = ['pending', 'approved', 'waiting_confirm', 'rejected'];
const HISTORY_STATUSES: MaintenanceStatus[] = ['closed', 'cancelled'];

/**
 * Yêu cầu bảo trì phía khách thuê — BẮT ĐẦU RỖNG.
 *
 * Trước 15/08/2026 nạp sẵn 4 yêu cầu bịa của "Nguyễn Văn A · Phòng 201"
 * (vòi nước rỉ, ổ cắm cháy...). Danh sách thật lấy từ `realMaintenanceService`;
 * store này chỉ giữ thay đổi cục bộ khi thao tác trên màn chi tiết.
 */
let _tenantRequests: MaintenanceRequest[] = [];
const _tenantListeners = new Set<() => void>();
const _notifyTenant = () => _tenantListeners.forEach(fn => fn());

export const tenantMaintenanceStore = {
  getAll: () => _tenantRequests,
  getActive: () => _tenantRequests.filter(r => ACTIVE_STATUSES.includes(r.status as MaintenanceStatus)),
  getHistory: () => _tenantRequests.filter(r => HISTORY_STATUSES.includes(r.status as MaintenanceStatus)),
  add: (req: MaintenanceRequest) => {
    _tenantRequests = [req, ..._tenantRequests];
    _notifyTenant();
  },
  update: (id: string, updates: Partial<MaintenanceRequest>) => {
    _tenantRequests = _tenantRequests.map(r => r.id === id ? { ...r, ...updates } : r);
    _notifyTenant();
  },
};

export const useTenantRequests = () => {
  const [requests, setRequests] = useState<MaintenanceRequest[]>(() => [..._tenantRequests]);
  useEffect(() => {
    const update = () => setRequests([..._tenantRequests]);
    _tenantListeners.add(update);
    return () => { _tenantListeners.delete(update); };
  }, []);
  return requests;
};

// ===================== TYPES =====================
// Flow mới 17/07 — khớp MaintenanceStatus bên types/index.ts.
export type TicketStatus =
  | 'pending'          // chờ manager duyệt
  | 'approved'         // đã duyệt, chờ thợ ngoài sửa
  | 'waiting_confirm'  // báo xong, chờ tenant xác nhận
  | 'rejected'         // tenant từ chối kèm lý do + ảnh
  | 'closed'
  | 'cancelled';
export type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'structural' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CostPaidBy     = 'host' | 'tenant';

export interface TimelineEntry {
  status: TicketStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PhotoEvidence {
  id: string;
  type: 'before' | 'after' | 'reject';
  uri: string;
  caption?: string;
  capturedAt: string;
}

export interface MaintenanceTicket {
  id: string;
  ticketCode: string;
  propertyType?: 'MULTI_ROOM' | 'WHOLE_HOUSE';
  propertyId: string;
  propertyName: string;
  roomName: string;
  tenantName: string;
  tenantPhone: string;
  title: string;
  description: string;
  /** null/undefined khi PENDING — manager gán lúc duyệt (flow 17/07 chiều). */
  category?: TicketCategory;
  /** Optional — manager có thể gán khi duyệt. */
  priority?: TicketPriority;
  status: TicketStatus;
  /** Ảnh gộp (legacy) — ưu tiên 3 field phân loại bên dưới. */
  images: string[];
  beforeImages?: string[];
  afterImages?: string[];
  rejectImages?: string[];
  rejectReason?: string;
  resolutionNote?: string;
  photos: PhotoEvidence[];
  assignedTo?: string;
  /** Chi phí thuộc luồng hóa đơn sau CLOSED — chỉ hiển thị nếu BE còn trả. */
  repairCost?: number;
  costPaidBy?: CostPaidBy;
  cause?: 'wear' | 'misuse';
  /** 28/07/2026 — bồi thường khách làm hư, độc lập với `status` chính. */
  costAgreementStatus?: 'not_applicable' | 'pending' | 'agreed' | 'disputed' | 'waived';
  costDisputeReason?: string;
  resolvedAt?: string;
  tenantConfirmedAt?: string;
  reopenCount?: number;
  timeline: TimelineEntry[];
  equipmentName?: string;
  equipmentQr?: string;
  maintenanceCount?: number;
  lastRepairDate?: string;
  createdAt: string;
  updatedAt: string;
  /** Log ảnh đầy đủ mọi vòng (BE 23/07/2026) — không bị mất khi sửa lại/từ chối lại. */
  photoHistory?: MaintenancePhotoHistoryDto[];
}


// ===================== STORE =====================
/**
 * Store cục bộ cho ticket bảo trì — BẮT ĐẦU RỖNG.
 *
 * Trước 15/08/2026 chỗ này nạp sẵn 5 ticket bịa (TK-2026-001 "Điều hòa không lạnh",
 * nhà "Nguyễn Trãi"...). Mọi danh sách ticket giờ đều lấy từ
 * `realMaintenanceService`; store này chỉ còn giữ thay đổi cục bộ trong lúc thao tác
 * trên màn chi tiết. Ticket không tải được từ BE → màn hiện "Không tìm thấy ticket",
 * đúng hơn là hiện một ticket không tồn tại.
 */
let _tickets: MaintenanceTicket[] = [];
const _listeners = new Set<() => void>();
const _notify = () => _listeners.forEach(fn => fn());

export const maintenanceStore = {
  updateTicket(id: string, updates: Partial<MaintenanceTicket>) {
    _tickets = _tickets.map(t => t.id === id ? { ...t, ...updates } : t);
    _notify();
  },
};

// ===================== HOOK =====================
export function useTickets(propertyId?: string): MaintenanceTicket[] {
  const getSlice = () =>
    propertyId ? _tickets.filter(t => t.propertyId === propertyId) : [..._tickets];

  const [tickets, setTickets] = useState<MaintenanceTicket[]>(getSlice);

  useEffect(() => {
    const update = () => setTickets(getSlice());
    _listeners.add(update);
    return () => { _listeners.delete(update); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  return tickets;
}
