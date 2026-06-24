/**
 * Mapper: DTO real API (Maintenance_BE_Contract.md) -> shape mock sẵn có,
 * để các màn hình giữ nguyên UI mà chỉ đổi nguồn dữ liệu.
 */
import type { MaintenanceRequestDto, MaintenanceTimelineDto } from '../types';
import type { MaintenanceRequest, MaintenanceStatus, MaintenanceCategory, MaintenancePriority } from '../types';
import type { MaintenanceTicket, TicketStatus, TicketCategory, TicketPriority, TimelineEntry } from '../store/maintenanceStore';
import { normalizeReqStatus } from '../utils/helpers';

const lcStatus = (s: string | undefined): string => normalizeReqStatus(s).toLowerCase();
const lc = (s: string | undefined): string => (s ?? '').toLowerCase();

const mapTimeline = (timeline: MaintenanceTimelineDto[] = []): TimelineEntry[] =>
  timeline.map(t => ({
    status: lcStatus(t.newStatus) as TicketStatus,
    note: t.note ?? '',
    updatedBy: t.changedByName ?? t.changedBy ?? 'Hệ thống',
    updatedAt: t.changedAt,
  }));

const deriveTitle = (dto: MaintenanceRequestDto): string => {
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
  category: lc(dto.category) as MaintenanceCategory,
  priority: lc(dto.priority) as MaintenancePriority,
  status: lcStatus(dto.status) as MaintenanceStatus,
  images: dto.images ?? [],
  assignedTo: dto.assignedManagerName,
  repairCost: dto.repairCost,
  resolvedAt: dto.resolvedAt,
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
  estimatedCompletionDate: dto.scheduledDate,
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
  category: lc(dto.category) as TicketCategory,
  priority: lc(dto.priority) as TicketPriority,
  status: lcStatus(dto.status) as TicketStatus,
  images: dto.images ?? [],
  photos: [],
  assignedTo: dto.assignedManagerName,
  repairCost: dto.repairCost,
  estimatedDate: dto.scheduledDate,
  resolvedAt: dto.resolvedAt,
  timeline: mapTimeline(dto.timeline),
  equipmentName: dto.equipmentName,
  maintenanceCount: undefined,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
});
