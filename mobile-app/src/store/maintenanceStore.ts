import { useState, useEffect } from 'react';
import { MaintenanceRequest, MaintenanceStatus } from '@/types';

// ===================== TENANT MAINTENANCE REQUESTS =====================
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
    category: 'electrical', priority: 'urgent', status: 'in_progress', images: [],
    assignedTo: 'Thợ điện Nguyễn Quốc',
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-25T08:00:00Z' },
      { status: 'in_progress', note: 'Quản lý đã tiếp nhận và phân công thợ', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-25T10:00:00Z' },
      { status: 'in_progress', note: 'Thợ đang kiểm tra và sửa chữa', updatedBy: 'Thợ điện Nguyễn Quốc', updatedAt: '2026-04-27T14:00:00Z' },
    ],
    createdAt: '2026-04-25', updatedAt: '2026-04-27', estimatedCompletionDate: '2026-04-30',
  },
  {
    id: '4', ticketCode: 'TK-T-004', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Máy lạnh kêu to', description: 'Máy lạnh phát ra tiếng kêu lớn khi vận hành.',
    category: 'appliance', priority: 'medium', status: 'scheduled', images: [],
    assignedTo: 'KTV điện lạnh Phạm Tú (0906123456)',
    scheduledSlots: ['2026-06-26', '2026-06-27'],
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-06-24T09:00:00Z' },
      { status: 'acknowledged', note: 'Quản lý đã tiếp nhận, giao KTV Phạm Tú', updatedBy: 'Trần Văn Minh', updatedAt: '2026-06-24T10:00:00Z' },
      { status: 'scheduled', note: 'Đề xuất lịch: 26/06, 27/06 — chờ khách xác nhận', updatedBy: 'Trần Văn Minh', updatedAt: '2026-06-24T10:30:00Z' },
    ],
    createdAt: '2026-06-24', updatedAt: '2026-06-24',
  },
  {
    id: '5', ticketCode: 'TK-T-005', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Bóng đèn nhà tắm cháy', description: 'Bóng đèn LED nhà tắm bị cháy, đã thay mới.',
    category: 'electrical', priority: 'low', status: 'done', images: [], repairCost: 80000,
    assignedTo: 'Thợ điện Nguyễn Quốc', doneAt: '2026-06-24',
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-06-23T09:00:00Z' },
      { status: 'in_progress', note: 'Thợ đang thay bóng', updatedBy: 'Thợ điện Nguyễn Quốc', updatedAt: '2026-06-24T08:00:00Z' },
      { status: 'done', note: 'Đã thay bóng mới. Chi phí 80.000đ — chủ nhà trả', updatedBy: 'Thợ điện Nguyễn Quốc', updatedAt: '2026-06-24T09:00:00Z' },
    ],
    createdAt: '2026-06-23', updatedAt: '2026-06-24',
  },
  {
    id: '3', ticketCode: 'TK-T-003', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Tủ quần áo bị hỏng bản lề', description: 'Bản lề cánh tủ trái bị gãy, không đóng được.',
    category: 'furniture', priority: 'low', status: 'resolved', images: [], repairCost: 150000,
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-20T09:00:00Z' },
      { status: 'in_progress', note: 'Đã tiếp nhận', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-20T11:00:00Z' },
      { status: 'resolved', note: 'Đã thay bản lề mới, tủ đóng mở bình thường', updatedBy: 'Thợ mộc', updatedAt: '2026-04-22T16:00:00Z' },
    ],
    createdAt: '2026-04-20', updatedAt: '2026-04-22', resolvedAt: '2026-04-22',
  },
];

const ACTIVE_STATUSES: MaintenanceStatus[] = [
  'pending', 'accepted', 'acknowledged', 'scheduled', 'in_progress', 'on_hold', 'pending_approval', 'done',
];
const HISTORY_STATUSES: MaintenanceStatus[] = ['confirmed', 'resolved', 'cancelled'];

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
// Luồng cải thiện (rich). 'accepted' giữ lại như legacy.
export type TicketStatus =
  | 'pending'
  | 'acknowledged'
  | 'scheduled'
  | 'in_progress'
  | 'on_hold'
  | 'pending_approval'
  | 'done'
  | 'confirmed'
  | 'accepted'   // legacy
  | 'resolved'   // legacy / terminal đường real-API
  | 'cancelled';
export type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CostPaidBy     = 'host' | 'tenant';
export type DamageCause    = 'wear' | 'misuse';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface TimelineEntry {
  status: TicketStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export interface PhotoEvidence {
  id: string;
  type: 'before' | 'after';
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
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  images: string[];
  photos: PhotoEvidence[];
  assignedTo?: string;
  technicianId?: string;
  repairCost?: number;
  costPaidBy?: CostPaidBy;
  cause?: DamageCause;
  estimatedDate?: string;
  resolvedAt?: string;
  timeline: TimelineEntry[];
  equipmentName?: string;
  equipmentQr?: string;
  maintenanceCount?: number;
  lastRepairDate?: string;
  // ── Luồng cải thiện ──
  acknowledgedAt?: string;
  /** các khung giờ manager đề xuất, chờ tenant chọn */
  scheduledSlots?: string[];
  /** khung giờ tenant đã xác nhận */
  confirmedSlot?: string;
  onHoldReason?: string;
  approvalStatus?: ApprovalStatus;
  doneAt?: string;
  tenantConfirmedAt?: string;
  reopenCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ===================== SEED DATA =====================
const SEED: MaintenanceTicket[] = [
  {
    id: 't1', ticketCode: 'TK-2026-001',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P102', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    title: 'Điều hòa không lạnh',
    description: 'Bật điều hòa nhưng không ra hơi lạnh, máy vẫn chạy bình thường.',
    category: 'appliance', priority: 'high', status: 'in_progress',
    assignedTo: 'Thợ Minh (0909123456)',
    estimatedDate: '18/05/2026',
    images: [],
    photos: [{ id: 'ph1', type: 'before', uri: '', caption: 'Điều hòa bị chảy nước', capturedAt: '2026-05-10 09:30' }],
    equipmentName: 'Điều hòa Panasonic 9000BTU',
    equipmentQr: 'QR-NT-102-AC',
    maintenanceCount: 2, lastRepairDate: '2025-11-10',
    timeline: [
      { status: 'pending',     note: 'Khách tạo yêu cầu',                                         updatedBy: 'Lê Thị B', updatedAt: '2026-05-10 08:30' },
      { status: 'in_progress',    note: 'Manager tiếp nhận và sẽ liên hệ thợ',                       updatedBy: 'Manager',  updatedAt: '2026-05-10 09:00' },
      { status: 'in_progress', note: 'Đã giao thợ Minh xử lý, đang chờ phụ kiện board mạch',     updatedBy: 'Manager',  updatedAt: '2026-05-11 14:00' },
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
    category: 'electrical', priority: 'urgent', status: 'in_progress',
    assignedTo: 'Thợ điện Hùng (0908765432)',
    estimatedDate: '17/05/2026',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [
      { status: 'pending',  note: 'Khách tạo yêu cầu',                                          updatedBy: 'Phạm Văn C', updatedAt: '2026-05-14 07:00' },
      { status: 'in_progress', note: 'Khẩn cấp - đã giao thợ điện Hùng đến ngay buổi chiều',      updatedBy: 'Manager',    updatedAt: '2026-05-14 08:00' },
    ],
    createdAt: '2026-05-14', updatedAt: '2026-05-14',
  },
  {
    id: 't4', ticketCode: 'TK-2026-004',
    propertyId: 'prop-3', propertyName: 'Nhà CMT8',
    roomName: 'P101', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    title: 'Cửa phòng tắm bị kẹt',
    description: 'Chốt cửa phòng tắm bị hỏng, không khóa được từ bên trong.',
    category: 'furniture', priority: 'medium', status: 'resolved',
    repairCost: 250000, costPaidBy: 'host', resolvedAt: '2026-05-08',
    photos: [
      { id: 'ph2', type: 'before', uri: '', caption: 'Chốt cửa bị gãy', capturedAt: '2026-05-07 15:00' },
      { id: 'ph3', type: 'after',  uri: '', caption: 'Đã thay chốt mới', capturedAt: '2026-05-08 11:00' },
    ],
    images: [], maintenanceCount: 1, lastRepairDate: '2026-05-08',
    timeline: [
      { status: 'pending',     note: 'Khách tạo yêu cầu',                                                              updatedBy: 'Bùi Văn H', updatedAt: '2026-05-07 14:00' },
      { status: 'in_progress',    note: 'Đã liên hệ thợ mộc',                                                             updatedBy: 'Manager',   updatedAt: '2026-05-07 15:00' },
      { status: 'in_progress', note: 'Thợ mộc đang thi công thay chốt',                                                updatedBy: 'Manager',   updatedAt: '2026-05-08 09:00' },
      { status: 'resolved',    note: 'Hoàn tất, đã thay chốt mới loại tốt. Chi phí 250,000đ — chủ nhà trả',           updatedBy: 'Manager',   updatedAt: '2026-05-08 11:00' },
    ],
    createdAt: '2026-05-07', updatedAt: '2026-05-08',
  },
  {
    id: 't5', ticketCode: 'TK-2026-005',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    roomName: 'P301', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    title: 'Đèn phòng ngủ bị hỏng',
    description: 'Đèn LED âm trần phòng ngủ tắt đột ngột, không bật được.',
    category: 'electrical', priority: 'low', status: 'pending',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [{ status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Ngô Thị D', updatedAt: '2026-05-15 20:00' }],
    createdAt: '2026-05-15', updatedAt: '2026-05-15',
  },
  {
    id: 't6', ticketCode: 'TK-2026-006',
    propertyId: 'prop-3', propertyName: 'Nhà CMT8',
    roomName: 'P201', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    title: 'Máy bơm nước hỏng',
    description: 'Máy bơm nước tầng 2 bị hỏng, áp lực nước yếu toàn tầng.',
    category: 'plumbing', priority: 'urgent', status: 'pending',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [{ status: 'pending', note: 'Khách báo áp lực nước yếu liên tục', updatedBy: 'Bùi Văn H', updatedAt: '2026-05-18 07:30' }],
    createdAt: '2026-05-18', updatedAt: '2026-05-18',
  },
  {
    id: 't-house-1', ticketCode: 'TK-NVC-001', propertyType: 'WHOLE_HOUSE',
    propertyId: 'house-1', propertyName: 'Nhà Nguyễn Văn Cừ',
    roomName: 'Toàn bộ nhà', tenantName: 'Gia đình anh Minh', tenantPhone: '0909111222',
    title: 'Rò nước khu bếp',
    description: 'Người đại diện báo khu vực bếp bị rò nước nhẹ dưới bồn rửa.',
    category: 'plumbing', priority: 'medium', status: 'in_progress',
    assignedTo: 'Thợ nước Bình (0908123456)',
    estimatedDate: '22/05/2026',
    images: [],
    photos: [{ id: 'wh-ph1', type: 'before', uri: '', caption: 'Rò nước dưới bồn rửa', capturedAt: '2026-05-20 08:00' }],
    equipmentName: 'Bồn rửa bếp',
    equipmentQr: 'QR-NVC-SINK-01',
    maintenanceCount: 1,
    timeline: [
      { status: 'pending', note: 'Người đại diện thuê nhà tạo yêu cầu', updatedBy: 'Anh Minh', updatedAt: '2026-05-20 08:00' },
      { status: 'in_progress', note: 'Manager đã tiếp nhận', updatedBy: 'Manager', updatedAt: '2026-05-20 08:20' },
      { status: 'in_progress', note: 'Đã giao thợ nước kiểm tra', updatedBy: 'Manager', updatedAt: '2026-05-20 09:00' },
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
