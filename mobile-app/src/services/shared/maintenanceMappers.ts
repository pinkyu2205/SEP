/**
 * Mapper: DTO real API (redesign 01/09/2026) -> model FE, để các màn hình giữ
 * nguyên UI mà chỉ đổi nguồn dữ liệu.
 */
import type { MaintenanceRequestDto, MaintenanceTimelineDto, MaintenanceIssuedInvoiceDto } from '@/types';
import type { MaintenanceRequest, MaintenanceStatus, MaintenanceCategory, MaintenancePriority } from '@/types';
import type { MaintenanceTicket, TicketStatus, TicketCategory, TicketPriority, TimelineEntry } from '@/store/maintenanceStore';
import type { TenantInvoice } from '@/services/tenant/billingService';
import { toSharedBill } from '@/services/tenant/billingService';
import type { SharedBill } from '@/types/bill';

// Bộ 7 status chính thức. Legacy (trước migrate 01/09) quy về status mới gần nhất
// để timeline cũ vẫn hiển thị đúng — REJECTED cũ không map thẳng sang trạng thái lỗi
// tenant nào (BE không tự suy được ý định cũ), quy an toàn về 'in_repair' để không
// crash UI; WAITING_TENANT_CONFIRM cũ (chờ nghiệm thu) cũng không còn ý nghĩa, coi
// như đang sửa. Status lạ không có trong bảng → mặc định 'in_repair', không throw.
const BE_STATUS_MAP: Record<string, MaintenanceStatus> = {
  // Bộ chính thức (redesign 01/09/2026 + lịch hẹn 05/09/2026)
  OPEN: 'open',
  REPAIR_SCHEDULED: 'repair_scheduled',
  IN_REPAIR: 'in_repair',
  TENANT_FAULT: 'tenant_fault',
  PENDING_TENANT_REPAIR: 'pending_tenant_repair',
  OUTSTANDING_DAMAGE: 'outstanding_damage',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  // Legacy (trước migrate 01/09 — BE tự map PENDING→OPEN, APPROVED/WAITING/REJECTED→IN_REPAIR
  // khi migrate DB, nhưng timeline cũ vẫn còn ghi lại các giá trị này).
  PENDING: 'open',
  APPROVED: 'in_repair',
  WAITING_TENANT_CONFIRM: 'in_repair',
  REJECTED: 'in_repair',
  // Legacy xa hơn (trước 17/07)
  ACKNOWLEDGED: 'in_repair',
  SCHEDULED: 'in_repair',
  IN_PROGRESS: 'in_repair',
  ON_HOLD: 'in_repair',
  REOPENED: 'in_repair',
  PENDING_APPROVAL: 'in_repair',
  DONE: 'in_repair',
  CONFIRMED: 'closed',
  RESOLVED: 'closed',
  COMPLETED: 'closed',
  ASSIGNED: 'in_repair',
  ACCEPTED: 'in_repair',
  CANCELED: 'cancelled',
};

export const mapBeStatus = (s: string | undefined): MaintenanceStatus =>
  BE_STATUS_MAP[(s ?? '').toUpperCase()] ?? 'in_repair';

const lc = (s: string | undefined): string => (s ?? '').toLowerCase();

// category/priority null khi ticket OPEN chưa duyệt → undefined để UI ẩn badge.
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
  // roomId null khi ticket thuộc HĐ nguyên căn (WHOLE_HOUSE) — giữ '' thay vì chuỗi "null".
  roomId: dto.roomId != null ? String(dto.roomId) : '',
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
  flowType: dto.flowType ? (lc(dto.flowType) as MaintenanceRequest['flowType']) : undefined,
  billingHint: dto.billingHint ? (lc(dto.billingHint) as MaintenanceRequest['billingHint']) : undefined,
  images: dto.images ?? [],
  beforeImages: dto.beforeImages ?? dto.images ?? [],
  afterImages: dto.afterImages ?? [],
  invoiceImages: dto.invoiceImages ?? [],
  faultEvidenceImages: dto.faultEvidenceImages ?? [],
  selfRepairImages: dto.selfRepairImages ?? [],
  resolutionNote: dto.resolutionNote,
  repairDescription: dto.repairDescription,
  invoiceVendor: dto.invoiceVendor,
  invoiceNumber: dto.invoiceNumber,
  invoiceDate: dto.invoiceDate,
  invoiceAmount: dto.invoiceAmount,
  previousRequestId: dto.previousRequestId != null ? String(dto.previousRequestId) : undefined,
  damageCause: dto.damageCause ? (lc(dto.damageCause) as MaintenanceRequest['damageCause']) : undefined,
  faultReason: dto.faultReason,
  faultResolutionPath: dto.faultResolutionPath
    ? (lc(dto.faultResolutionPath) as MaintenanceRequest['faultResolutionPath']) : undefined,
  selfRepairDeadline: dto.selfRepairDeadline,
  estimatedDamageAmount: dto.estimatedDamageAmount,
  assignedTo: dto.assignedManagerName,
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
  issuedInvoice: dto.issuedInvoice,
  photoHistory: dto.photoHistory,
  visitAppointmentAt: dto.visitAppointmentAt,
  visitArrivalConfirmedAt: dto.visitArrivalConfirmedAt,
  repairAppointmentAt: dto.repairAppointmentAt,
  repairStartedAt: dto.repairStartedAt,
  chargeInvoiceId: dto.chargeInvoiceId,
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
  flowType: dto.flowType ? (lc(dto.flowType) as MaintenanceTicket['flowType']) : undefined,
  billingHint: dto.billingHint ? (lc(dto.billingHint) as MaintenanceTicket['billingHint']) : undefined,
  images: dto.images ?? [],
  beforeImages: dto.beforeImages ?? dto.images ?? [],
  afterImages: dto.afterImages ?? [],
  invoiceImages: dto.invoiceImages ?? [],
  faultEvidenceImages: dto.faultEvidenceImages ?? [],
  selfRepairImages: dto.selfRepairImages ?? [],
  resolutionNote: dto.resolutionNote,
  repairDescription: dto.repairDescription,
  invoiceVendor: dto.invoiceVendor,
  invoiceNumber: dto.invoiceNumber,
  invoiceDate: dto.invoiceDate,
  invoiceAmount: dto.invoiceAmount,
  previousRequestId: dto.previousRequestId != null ? String(dto.previousRequestId) : undefined,
  damageCause: dto.damageCause ? (lc(dto.damageCause) as MaintenanceTicket['damageCause']) : undefined,
  faultReason: dto.faultReason,
  faultResolutionPath: dto.faultResolutionPath
    ? (lc(dto.faultResolutionPath) as MaintenanceTicket['faultResolutionPath']) : undefined,
  selfRepairDeadline: dto.selfRepairDeadline,
  estimatedDamageAmount: dto.estimatedDamageAmount,
  adminReviewedAt: dto.adminReviewedAt,
  adminReviewedByName: dto.adminReviewedByName,
  adminApproved: dto.adminApproved,
  adminReviewNote: dto.adminReviewNote,
  photos: [],
  assignedTo: dto.assignedManagerName,
  resolvedAt: dto.resolvedAt,
  timeline: mapTimeline(dto.timeline),
  equipmentName: dto.equipmentName,
  maintenanceCount: undefined,
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
  issuedInvoice: dto.issuedInvoice,
  photoHistory: dto.photoHistory,
  visitAppointmentAt: dto.visitAppointmentAt,
  visitArrivalConfirmedAt: dto.visitArrivalConfirmedAt,
  repairAppointmentAt: dto.repairAppointmentAt,
  repairStartedAt: dto.repairStartedAt,
  chargeInvoiceId: dto.chargeInvoiceId,
});

/**
 * `MaintenanceIssuedInvoiceDto` (hoá đơn bồi thường bảo trì, tạo lúc manager complete()
 * Luồng B) khớp field-cho-field với `TenantInvoice` (kể cả PayOS: payosQrCode/
 * payosCheckoutUrl/payosOrderCode) — dùng lại thẳng `toSharedBill()` để tenant thanh
 * toán bằng đúng `InvoicePaymentModal` đang dùng cho hoá đơn tiền phòng/điện/nước,
 * không viết lại QR renderer riêng cho bảo trì.
 */
export const toMaintenanceSharedBill = (inv: MaintenanceIssuedInvoiceDto): SharedBill =>
  toSharedBill(inv as unknown as TenantInvoice);
