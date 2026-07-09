/**
 * Mapper: DTO real API (Maintenance_BE_Contract.md) -> shape mock sẵn có,
 * để các màn hình giữ nguyên UI mà chỉ đổi nguồn dữ liệu.
 */
import type { MaintenanceRequestDto, MaintenanceTimelineDto } from '@/types';
import type { MaintenanceRequest, MaintenanceStatus, MaintenanceCategory, MaintenancePriority } from '@/types';
import type { MaintenanceTicket, TicketStatus, TicketCategory, TicketPriority, TimelineEntry } from '@/store/maintenanceStore';

// Map 1-1 đủ bộ enum BE → status FE, giữ nguyên độ chi tiết để UI hiển thị đúng
// "Đã tiếp nhận / Đã hẹn lịch / Chờ nghiệm thu..." (trước đây bị bóp hết về 4 loại
// nên khách đã được hẹn lịch vẫn thấy "Chờ xử lý", và DONE thành resolved làm
// tenant mất nút nghiệm thu).
const BE_STATUS_MAP: Record<string, MaintenanceStatus> = {
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  PENDING_APPROVAL: 'pending_approval',
  DONE: 'done',
  CONFIRMED: 'confirmed',
  REOPENED: 'reopened',
  CANCELLED: 'cancelled',
  // legacy / alias còn gặp trong dữ liệu cũ
  RESOLVED: 'resolved',
  COMPLETED: 'resolved',
  OPEN: 'pending',
  ASSIGNED: 'acknowledged',
  ACCEPTED: 'acknowledged',
  CANCELED: 'cancelled',
  REJECTED: 'cancelled',
};

export const mapBeStatus = (s: string | undefined): MaintenanceStatus =>
  BE_STATUS_MAP[(s ?? '').toUpperCase()] ?? 'pending';

const lc = (s: string | undefined): string => (s ?? '').toLowerCase();

// BE trả scheduledDate = confirmedSlot (nếu khách đã chọn) hoặc chuỗi slot đề xuất
// phân tách bằng dấu phẩy. Khách đã chọn hay chưa suy từ timeline ("Khách chọn lịch: ...").
const deriveSchedule = (
  dto: MaintenanceRequestDto,
): { scheduledSlots?: string[]; confirmedSlot?: string } => {
  if (!dto.scheduledDate) return {};
  const slots = dto.scheduledDate.split(',').map(s => s.trim()).filter(Boolean);
  if (slots.length === 0) return {};
  const confirmed = (dto.timeline ?? []).some(t => (t.note ?? '').startsWith('Khách chọn lịch'));
  return confirmed ? { scheduledSlots: slots, confirmedSlot: slots[0] } : { scheduledSlots: slots };
};

const mapTimeline = (timeline: MaintenanceTimelineDto[] = []): TimelineEntry[] =>
  timeline.map(t => ({
    status: mapBeStatus(t.newStatus) as TicketStatus,
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
export const dtoToTenantRequest = (dto: MaintenanceRequestDto): MaintenanceRequest => {
  const schedule = deriveSchedule(dto);
  return {
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
    status: mapBeStatus(dto.status),
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
    estimatedCompletionDate: schedule.confirmedSlot ?? dto.scheduledDate,
    scheduledSlots: schedule.scheduledSlots,
    confirmedSlot: schedule.confirmedSlot,
  };
};

/** DTO -> MaintenanceTicket (manager model) */
export const dtoToTicket = (dto: MaintenanceRequestDto): MaintenanceTicket => {
  const schedule = deriveSchedule(dto);
  return {
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
    status: mapBeStatus(dto.status) as TicketStatus,
    images: dto.images ?? [],
    photos: [],
    assignedTo: dto.assignedManagerName,
    repairCost: dto.repairCost,
    costPaidBy: dto.costPaidBy ? (lc(dto.costPaidBy) as 'host' | 'tenant') : undefined,
    cause: dto.cause ? (lc(dto.cause) as 'wear' | 'misuse') : undefined,
    reopenCount: dto.reopenCount ?? undefined,
    estimatedDate: schedule.confirmedSlot ?? dto.scheduledDate,
    resolvedAt: dto.resolvedAt,
    timeline: mapTimeline(dto.timeline),
    equipmentName: dto.equipmentName,
    maintenanceCount: undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    scheduledSlots: schedule.scheduledSlots,
    confirmedSlot: schedule.confirmedSlot,
  };
};
