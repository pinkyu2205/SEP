/**
 * Mapper: DTO real API (FE-maintenance-flow 17/07) -> model FE,
 * để các màn hình giữ nguyên UI mà chỉ đổi nguồn dữ liệu.
 */
import type { MaintenanceRequestDto, MaintenanceTimelineDto } from '@/types';
import type { MaintenanceRequest, MaintenanceStatus, MaintenanceCategory, MaintenancePriority } from '@/types';
import type { MaintenanceTicket, TicketStatus, TicketCategory, TicketPriority, TimelineEntry } from '@/store/maintenanceStore';

// Flow mới chỉ còn 6 status; các giá trị legacy (trước migrate 17/07) quy về
// status mới gần nhất để timeline/dữ liệu cũ vẫn hiển thị đúng.
const BE_STATUS_MAP: Record<string, MaintenanceStatus> = {
  // Bộ chính thức
  PENDING: 'pending',
  APPROVED: 'approved',
  WAITING_TENANT_CONFIRM: 'waiting_confirm',
  REJECTED: 'rejected',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  // Legacy (đã migrate phía BE, còn gặp trong timeline cũ)
  ACKNOWLEDGED: 'approved',
  SCHEDULED: 'approved',
  IN_PROGRESS: 'approved',
  ON_HOLD: 'approved',
  REOPENED: 'approved',
  PENDING_APPROVAL: 'waiting_confirm',
  DONE: 'waiting_confirm',
  CONFIRMED: 'closed',
  RESOLVED: 'closed',
  COMPLETED: 'closed',
  OPEN: 'pending',
  ASSIGNED: 'approved',
  ACCEPTED: 'approved',
  CANCELED: 'cancelled',
};

export const mapBeStatus = (s: string | undefined): MaintenanceStatus =>
  BE_STATUS_MAP[(s ?? '').toUpperCase()] ?? 'pending';

const lc = (s: string | undefined): string => (s ?? '').toLowerCase();

// category/priority null khi ticket PENDING (manager gán lúc duyệt) → undefined để UI ẩn badge.
const lcOrUndef = <T extends string>(s: string | null | undefined): T | undefined =>
  s ? (s.toLowerCase() as T) : undefined;

const mapTimeline = (timeline: MaintenanceTimelineDto[] = []): TimelineEntry[] =>
  timeline.map(t => ({
    status: mapBeStatus(t.newStatus) as TicketStatus,
    note: t.note ?? '',
    updatedBy: t.changedByName ?? t.changedBy ?? 'Hệ thống',
    updatedAt: t.changedAt,
  }));

const deriveTitle = (dto: MaintenanceRequestDto): string => {
  if (dto.title) return dto.title;
  if (dto.equipmentName) return dto.equipmentName;
  const head = dto.description?.split('—')[0]?.trim();
  return head || 'Yêu cầu sửa chữa';
};

/** DTO -> MaintenanceRequest (tenant model) */
export const dtoToTenantRequest = (dto: MaintenanceRequestDto): MaintenanceRequest => ({
  id: String(dto.id),
  ticketCode: dto.requestCode,
  roomId: String(dto.roomId),
  roomName: dto.roomName,
  propertyId: dto.propertyId != null ? String(dto.propertyId) : undefined,
  propertyName: dto.propertyName,
  tenantId: String(dto.tenantId),
  tenantName: dto.tenantName,
  tenantPhone: dto.tenantPhone,
  title: deriveTitle(dto),
  description: dto.description,
  category: lcOrUndef<MaintenanceCategory>(dto.category),
  priority: lcOrUndef<MaintenancePriority>(dto.priority),
  status: mapBeStatus(dto.status),
  images: dto.images ?? [],
  beforeImages: dto.beforeImages ?? dto.images ?? [],
  afterImages: dto.afterImages ?? [],
  rejectImages: dto.rejectImages ?? [],
  rejectReason: dto.rejectReason,
  resolutionNote: dto.resolutionNote,
  assignedTo: dto.assignedManagerName,
  repairCost: dto.repairCost,
  resolvedAt: dto.resolvedAt,
  tenantConfirmedAt: dto.tenantConfirmedAt,
  timeline: mapTimeline(dto.timeline).map(t => ({
    status: t.status as MaintenanceStatus,
    note: t.note,
    updatedBy: t.updatedBy,
    updatedAt: t.updatedAt,
  })),
  equipmentId: dto.equipmentId != null ? String(dto.equipmentId) : undefined,
  equipmentName: dto.equipmentName,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
  costPaidBy: dto.costPaidBy,
  reopenCount: dto.reopenCount,
});

/** DTO -> MaintenanceTicket (manager model) */
export const dtoToTicket = (dto: MaintenanceRequestDto): MaintenanceTicket => ({
  id: String(dto.id),
  ticketCode: dto.requestCode,
  propertyId: dto.propertyId != null ? String(dto.propertyId) : '',
  propertyName: dto.propertyName,
  roomName: dto.roomName,
  tenantName: dto.tenantName,
  tenantPhone: dto.tenantPhone ?? '',
  title: deriveTitle(dto),
  description: dto.description,
  category: lcOrUndef<TicketCategory>(dto.category),
  priority: lcOrUndef<TicketPriority>(dto.priority),
  status: mapBeStatus(dto.status) as TicketStatus,
  images: dto.images ?? [],
  beforeImages: dto.beforeImages ?? dto.images ?? [],
  afterImages: dto.afterImages ?? [],
  rejectImages: dto.rejectImages ?? [],
  rejectReason: dto.rejectReason,
  resolutionNote: dto.resolutionNote,
  photos: [],
  assignedTo: dto.assignedManagerName,
  repairCost: dto.repairCost,
  costPaidBy: dto.costPaidBy ? (lc(dto.costPaidBy) as 'host' | 'tenant') : undefined,
  reopenCount: dto.reopenCount ?? undefined,
  resolvedAt: dto.resolvedAt,
  tenantConfirmedAt: dto.tenantConfirmedAt,
  timeline: mapTimeline(dto.timeline),
  equipmentName: dto.equipmentName,
  maintenanceCount: undefined,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
});
