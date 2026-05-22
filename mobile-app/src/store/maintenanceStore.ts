import { useState, useEffect } from 'react';

// ===================== TYPES =====================
export type TicketStatus   = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'cancelled';
export type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
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
  repairCost?: number;
  costPaidBy?: CostPaidBy;
  estimatedDate?: string;
  resolvedAt?: string;
  timeline: TimelineEntry[];
  equipmentName?: string;
  equipmentQr?: string;
  maintenanceCount?: number;
  lastRepairDate?: string;
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
      { status: 'accepted',    note: 'Manager tiếp nhận và sẽ liên hệ thợ',                       updatedBy: 'Manager',  updatedAt: '2026-05-10 09:00' },
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
    category: 'electrical', priority: 'urgent', status: 'accepted',
    assignedTo: 'Thợ điện Hùng (0908765432)',
    estimatedDate: '17/05/2026',
    images: [], photos: [], maintenanceCount: 0,
    timeline: [
      { status: 'pending',  note: 'Khách tạo yêu cầu',                                          updatedBy: 'Phạm Văn C', updatedAt: '2026-05-14 07:00' },
      { status: 'accepted', note: 'Khẩn cấp - đã giao thợ điện Hùng đến ngay buổi chiều',      updatedBy: 'Manager',    updatedAt: '2026-05-14 08:00' },
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
      { status: 'accepted',    note: 'Đã liên hệ thợ mộc',                                                             updatedBy: 'Manager',   updatedAt: '2026-05-07 15:00' },
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
      { status: 'accepted', note: 'Manager đã tiếp nhận', updatedBy: 'Manager', updatedAt: '2026-05-20 08:20' },
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
