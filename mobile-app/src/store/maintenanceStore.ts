import { useState, useEffect } from 'react';
import { MaintenanceRequest, MaintenanceStatus, MaintenancePhotoHistoryDto } from '@/types';

// ===================== TENANT MAINTENANCE REQUESTS =====================
// Seed mock theo flow mới 17/07: pending → approved → waiting_confirm → closed
// (nhánh rejected/cancelled). Chỉ dùng khi offline/demo không có BE.
const SEED_TENANT_REQUESTS: MaintenanceRequest[] = [
  {
    id: '1', ticketCode: 'TK-T-001', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Vòi nước bồn rửa bị rỉ', description: 'Vòi nước bồn rửa mặt trong toilet bị rỉ nước liên tục, gây lãng phí nước.',
    category: 'plumbing', priority: 'medium', status: 'pending', images: [],
    timeline: [{ status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-28T09:00:00Z' }],
    createdAt: '2026-04-28', updatedAt: '2026-04-28',
  },
  {
    id: '2', ticketCode: 'TK-T-002', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Ổ cắm điện bị cháy', description: 'Ổ cắm bên cạnh bàn học bị cháy, có mùi khét, không dùng được.',
    category: 'electrical', priority: 'urgent', status: 'approved', images: [],
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-25T08:00:00Z' },
      { status: 'approved', note: 'Quản lý đã duyệt, đang chờ thợ ngoài sửa', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-25T10:00:00Z' },
    ],
    createdAt: '2026-04-25', updatedAt: '2026-04-27',
  },
  {
    id: '5', ticketCode: 'TK-T-005', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Bóng đèn nhà tắm cháy', description: 'Bóng đèn LED nhà tắm bị cháy, đã thay mới.',
    category: 'electrical', priority: 'low', status: 'waiting_confirm', images: [],
    resolutionNote: 'Đã thay bóng LED mới, bật sáng bình thường',
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-06-23T09:00:00Z' },
      { status: 'approved', note: 'Quản lý đã duyệt', updatedBy: 'Trần Văn Minh', updatedAt: '2026-06-24T08:00:00Z' },
      { status: 'waiting_confirm', note: 'Đã thay bóng mới — chờ khách nghiệm thu', updatedBy: 'Trần Văn Minh', updatedAt: '2026-06-24T09:00:00Z' },
    ],
    createdAt: '2026-06-23', updatedAt: '2026-06-24',
  },
  {
    id: '3', ticketCode: 'TK-T-003', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Tủ quần áo bị hỏng bản lề', description: 'Bản lề cánh tủ trái bị gãy, không đóng được.',
    category: 'furniture', priority: 'low', status: 'closed', images: [],
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-20T09:00:00Z' },
      { status: 'approved', note: 'Đã duyệt', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-20T11:00:00Z' },
      { status: 'waiting_confirm', note: 'Đã thay bản lề mới, tủ đóng mở bình thường', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-22T15:00:00Z' },
      { status: 'closed', note: 'Khách xác nhận hoàn tất', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-22T16:00:00Z' },
    ],
    createdAt: '2026-04-20', updatedAt: '2026-04-22', resolvedAt: '2026-04-22',
  },
];

const ACTIVE_STATUSES: MaintenanceStatus[] = ['pending', 'approved', 'waiting_confirm', 'rejected'];
const HISTORY_STATUSES: MaintenanceStatus[] = ['closed', 'cancelled'];

let _tenantRequests: MaintenanceRequest[] = [...SEED_TENANT_REQUESTS];
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

// ===================== SEED DATA =====================
const SEED: MaintenanceTicket[] = [
  {
    id: 't1', ticketCode: 'TK-2026-001',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P102', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    title: 'Điều hòa không lạnh',
    description: 'Bật điều hòa nhưng không ra hơi lạnh, máy vẫn chạy bình thường.',
    category: 'appliance', priority: 'high', status: 'approved',
    images: [],
    photos: [{ id: 'ph1', type: 'before', uri: '', caption: 'Điều hòa bị chảy nước', capturedAt: '2026-05-10 09:30' }],
    equipmentName: 'Điều hòa Panasonic 9000BTU',
    equipmentQr: 'QR-NT-102-AC',
    maintenanceCount: 2, lastRepairDate: '2025-11-10',
    timeline: [
      { status: 'pending',  note: 'Khách tạo yêu cầu',                    updatedBy: 'Lê Thị B', updatedAt: '2026-05-10 08:30' },
      { status: 'approved', note: 'Manager duyệt, chờ thợ ngoài đến sửa', updatedBy: 'Manager',  updatedAt: '2026-05-10 09:00' },
    ],
    createdAt: '2026-05-10', updatedAt: '2026-05-11',
  },
  {
    id: 't2', ticketCode: 'TK-2026-002',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P201', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    title: 'Vòi nước bị rỉ',
    description: 'Vòi nước bồn rửa nhà bếp bị rỉ liên tục, chảy cả ngày.',
    category: 'plumbing', priority: 'medium', status: 'pending',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [{ status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Phạm Văn C', updatedAt: '2026-05-13 16:00' }],
    createdAt: '2026-05-13', updatedAt: '2026-05-13',
  },
  {
    id: 't3', ticketCode: 'TK-2026-003',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P201', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    title: 'Ổ cắm điện bị cháy',
    description: 'Ổ cắm điện bên cạnh bàn học bị cháy đen, có mùi khét.',
    category: 'electrical', priority: 'urgent', status: 'waiting_confirm',
    resolutionNote: 'Đã thay ổ cắm mới, kiểm tra an toàn điện OK',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [
      { status: 'pending',         note: 'Khách tạo yêu cầu',                     updatedBy: 'Phạm Văn C', updatedAt: '2026-05-14 07:00' },
      { status: 'approved',        note: 'Khẩn cấp — duyệt ngay, gọi thợ điện',   updatedBy: 'Manager',    updatedAt: '2026-05-14 08:00' },
      { status: 'waiting_confirm', note: 'Đã thay ổ cắm — chờ khách nghiệm thu',  updatedBy: 'Manager',    updatedAt: '2026-05-14 15:00' },
    ],
    createdAt: '2026-05-14', updatedAt: '2026-05-14',
  },
  {
    id: 't4', ticketCode: 'TK-2026-004',
    propertyId: 'prop-3', propertyName: 'Nhà CMT8',
    roomName: 'P101', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    title: 'Cửa phòng tắm bị kẹt',
    description: 'Chốt cửa phòng tắm bị hỏng, không khóa được từ bên trong.',
    category: 'furniture', priority: 'medium', status: 'closed',
    resolvedAt: '2026-05-08',
    photos: [
      { id: 'ph2', type: 'before', uri: '', caption: 'Chốt cửa bị gãy', capturedAt: '2026-05-07 15:00' },
      { id: 'ph3', type: 'after',  uri: '', caption: 'Đã thay chốt mới', capturedAt: '2026-05-08 11:00' },
    ],
    images: [], maintenanceCount: 1, lastRepairDate: '2026-05-08',
    timeline: [
      { status: 'pending',         note: 'Khách tạo yêu cầu',                          updatedBy: 'Bùi Văn H', updatedAt: '2026-05-07 14:00' },
      { status: 'approved',        note: 'Đã duyệt, liên hệ thợ mộc',                  updatedBy: 'Manager',   updatedAt: '2026-05-07 15:00' },
      { status: 'waiting_confirm', note: 'Đã thay chốt mới loại tốt — chờ nghiệm thu', updatedBy: 'Manager',   updatedAt: '2026-05-08 11:00' },
      { status: 'closed',          note: 'Khách xác nhận hoàn tất',                    updatedBy: 'Bùi Văn H', updatedAt: '2026-05-08 12:00' },
    ],
    createdAt: '2026-05-07', updatedAt: '2026-05-08',
  },
  {
    id: 't5', ticketCode: 'TK-2026-005',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P301', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    title: 'Đèn phòng ngủ bị hỏng',
    description: 'Đèn LED âm trần phòng ngủ tắt đột ngột, không bật được.',
    category: 'electrical', priority: 'low', status: 'rejected',
    rejectReason: 'Đèn sáng lại được 1 hôm rồi tắt tiếp',
    reopenCount: 1,
    images: [], photos: [], maintenanceCount: 0,
    timeline: [
      { status: 'pending',         note: 'Khách tạo yêu cầu',                       updatedBy: 'Ngô Thị D', updatedAt: '2026-05-15 20:00' },
      { status: 'approved',        note: 'Đã duyệt',                                updatedBy: 'Manager',   updatedAt: '2026-05-16 08:00' },
      { status: 'waiting_confirm', note: 'Đã thay đèn — chờ khách nghiệm thu',      updatedBy: 'Manager',   updatedAt: '2026-05-16 15:00' },
      { status: 'rejected',        note: 'Khách từ chối: đèn lại tắt sau 1 ngày',   updatedBy: 'Ngô Thị D', updatedAt: '2026-05-18 09:00' },
    ],
    createdAt: '2026-05-15', updatedAt: '2026-05-18',
  },
  {
    id: 't-house-1', ticketCode: 'TK-NVC-001', propertyType: 'WHOLE_HOUSE',
    propertyId: 'house-1', propertyName: 'Nhà Nguyễn Văn Cừ',
    roomName: 'Toàn bộ nhà', tenantName: 'Gia đình anh Minh', tenantPhone: '0909111222',
    title: 'Rò nước khu bếp',
    description: 'Người đại diện báo khu vực bếp bị rò nước nhẹ dưới bồn rửa.',
    category: 'plumbing', priority: 'medium', status: 'approved',
    images: [],
    photos: [{ id: 'wh-ph1', type: 'before', uri: '', caption: 'Rò nước dưới bồn rửa', capturedAt: '2026-05-20 08:00' }],
    equipmentName: 'Bồn rửa bếp',
    equipmentQr: 'QR-NVC-SINK-01',
    maintenanceCount: 1,
    timeline: [
      { status: 'pending',  note: 'Người đại diện thuê nhà tạo yêu cầu', updatedBy: 'Anh Minh', updatedAt: '2026-05-20 08:00' },
      { status: 'approved', note: 'Manager đã duyệt, chờ thợ nước',      updatedBy: 'Manager',  updatedAt: '2026-05-20 08:20' },
    ],
    createdAt: '2026-05-20', updatedAt: '2026-05-20',
  },
];

// ===================== STORE =====================
let _tickets: MaintenanceTicket[] = [...SEED];
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
