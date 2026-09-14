import { useState, useEffect } from 'react';
import { MaintenanceRequest, MaintenanceStatus, MaintenanceBillingHint, MaintenancePhotoHistoryDto } from '@/types';

// ===================== TENANT MAINTENANCE REQUESTS =====================

const ACTIVE_STATUSES: MaintenanceStatus[] =
  ['open', 'repair_scheduled', 'in_repair', 'tenant_fault', 'pending_tenant_repair', 'outstanding_damage'];
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
// Redesign 01/09/2026 — khớp MaintenanceStatus bên types/index.ts.
export type TicketStatus =
  | 'open'                  // chờ manager tới xem (đã có lịch hẹn)
  | 'repair_scheduled'       // đã duyệt/báo lỗi, chọn đặt lịch sửa sau thay vì sửa ngay
  | 'in_repair'              // đang sửa (Luồng A hoặc Luồng B nhánh manager sửa hộ)
  | 'tenant_fault'            // lỗi tenant, manager sẽ sửa hộ rồi charge
  | 'pending_tenant_repair'  // giao tenant tự sửa trước deadline
  | 'outstanding_damage'     // quá hạn/không đạt — chờ checkout trừ cọc
  | 'closed'
  | 'cancelled';
export type TicketCategory = 'appliance' | 'furniture' | 'plumbing' | 'electrical';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketFlowType = 'normal_wear' | 'tenant_fault';
export type TicketBillingHint = 'host_paid' | 'tenant_charge_pending' | 'deposit_deduction_pending' | 'none';
export type FaultResolutionPath = 'manager_repair' | 'tenant_self_repair';
export type DamageCause = 'wear' | 'tenant_misuse' | 'tenant_modification' | 'misuse';

export interface TimelineEntry {
  status: TicketStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PhotoEvidence {
  id: string;
  type: 'before' | 'after' | 'invoice' | 'fault_evidence' | 'self_repair';
  uri: string;
  caption?: string;
  capturedAt: string;
  /** 'image' khi thiếu (dữ liệu mock/legacy trước 14/09/2026 chỉ có ảnh). Video thêm
   * 14/09/2026 theo yêu cầu mentor — xem src/utils/evidenceMediaPicker.ts. */
  mediaType?: 'image' | 'video';
  /** Chỉ có khi mediaType==='video' (mili-giây) — hiện dạng mm:ss trên tile placeholder
   * local, ảnh/video local chưa upload nên chưa có gì để phát thật. */
  durationMs?: number;
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
  /** null/undefined khi OPEN chưa duyệt — manager gán lúc duyệt. */
  category?: TicketCategory;
  /** Optional — manager có thể gán khi duyệt. */
  priority?: TicketPriority;
  status: TicketStatus;
  flowType?: TicketFlowType;
  /** Gợi ý FE render khối chi phí — xem TicketBillingHint. */
  billingHint?: TicketBillingHint;
  /** Ảnh gộp (legacy) — ưu tiên các field phân loại bên dưới. */
  images: string[];
  beforeImages?: string[];
  afterImages?: string[];
  invoiceImages?: string[];
  faultEvidenceImages?: string[];
  selfRepairImages?: string[];
  resolutionNote?: string;
  /** Mô tả việc đã sửa (bắt buộc khi complete()). */
  repairDescription?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  previousRequestId?: string;
  damageCause?: DamageCause;
  /** Lý do manager ghi khi reject-fault. */
  faultReason?: string;
  faultResolutionPath?: FaultResolutionPath;
  /** Hạn tenant tự sửa (status = pending_tenant_repair). */
  selfRepairDeadline?: string;
  /** Ước tính thiệt hại — chốt số cuối lúc checkout. */
  estimatedDamageAmount?: number;
  /** Set qua admin-review (web) — null = chưa duyệt hoặc phiếu thuộc luồng reject-fault cũ. */
  adminReviewedAt?: string;
  adminReviewedByName?: string;
  adminApproved?: boolean;
  adminReviewNote?: string;
  photos: PhotoEvidence[];
  assignedTo?: string;
  resolvedAt?: string;
  timeline: TimelineEntry[];
  equipmentName?: string;
  equipmentQr?: string;
  maintenanceCount?: number;
  lastRepairDate?: string;
  createdAt: string;
  updatedAt: string;
  /** Chỉ có khi vừa complete() Luồng B (manager sửa hộ) — hoá đơn MAINTENANCE vừa tạo. */
  issuedInvoice?: MaintenanceRequest['issuedInvoice'];
  /** Log ảnh đầy đủ mọi vòng (append-only) — không bị mất khi tạo phiếu mới. */
  photoHistory?: MaintenancePhotoHistoryDto[];
  /** Lịch hẹn manager tới xem sự cố — tenant đặt lúc tạo / đổi qua reschedule-visit. */
  visitAppointmentAt?: string;
  /** Manager quét QR xác nhận có mặt — không đổi status, chỉ ghi mốc thời gian. */
  visitArrivalConfirmedAt?: string;
  /** Lịch hẹn sửa (status = repair_scheduled). */
  repairAppointmentAt?: string;
  /** Manager quét QR bắt đầu sửa. */
  repairStartedAt?: string;
  /**
   * Id hoá đơn thu phí lập TRƯỚC khi sửa (PUT /{id}/charge, 15/09/2026) — set rồi thì
   * không lập lại được nữa. Dùng chung với `issuedInvoice` (còn set = còn CHƯA thanh
   * toán) để biết đang chờ khách trả tiền hay đã xong, xem TicketDetailScreen.
   */
  chargeInvoiceId?: number | null;
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
