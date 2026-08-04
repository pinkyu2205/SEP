/**
 * Type definitions cho toàn bộ ứng dụng quản lý phòng trọ.
 */

// ======================== AUTH ========================
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  avatar?: string;
  role: UserRole;
  roomId?: string;
  isFirstLogin?: boolean;
  createdAt: string;
}

export type UserRole = 'tenant' | 'manager';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ======================== ROOM ========================
export type RoomStatus =
  | 'available'
  | 'occupied'
  | 'maintenance'
  | 'reserved'
  | 'pending_cleaning'
  | 'pending_contract'
  | 'expiring_soon';

export interface Room {
  id: string;
  name: string;
  floor: number;
  area: number;
  price: number;
  status: RoomStatus;
  propertyId: string;
  propertyName: string;
  tenantId?: string;
  tenantName?: string;
  description?: string;
  images?: string[];
}

// ======================== INVOICE (Hóa đơn) ========================
export type InvoiceStatus = 'pending' | 'paid' | 'overdue';

export interface InvoiceItem {
  label: string;
  quantity?: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  roomId: string;
  roomName: string;
  tenantId: string;
  tenantName: string;
  month: number;
  year: number;
  items: InvoiceItem[];
  totalAmount: number;
  outstandingBalance: number;
  grandTotal: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
  // Extended billing fields
  lateFee?: number;
  propertyId?: string;
  propertyName?: string;
  electricityConsumption?: number;
  waterConsumption?: number;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

// ======================== PAYMENT ========================
export type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'other';
export type PaymentStatus = 'pending' | 'processing' | 'verified' | 'rejected';

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  tenantId: string;
  tenantName: string;
  roomName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  bankCode?: string;
  bankAccount?: string;
  transferContent?: string;
  evidenceImageUri?: string;
  createdAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

// ======================== MAINTENANCE (Bảo trì) ========================
// Flow mới 17/07 (FE-maintenance-flow): PENDING → APPROVED → WAITING_TENANT_CONFIRM
// → CLOSED, nhánh REJECTED (tenant từ chối) + CANCELLED. Status cũ đã migrate.
export type MaintenanceStatus =
  | 'pending'          // chờ manager duyệt
  | 'approved'         // đã duyệt, chờ thợ ngoài sửa
  | 'waiting_confirm'  // manager báo xong, chờ tenant xác nhận (auto-close 3 ngày)
  | 'rejected'         // tenant từ chối kèm lý do + ảnh, chờ manager xem xét
  | 'closed'           // kết thúc
  | 'cancelled';
export type MaintenanceCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'structural' | 'other';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceTimeline {
  status: MaintenanceStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

export interface MaintenanceRequest {
  id: string;
  ticketCode: string;
  roomId: string;
  roomName: string;
  propertyId?: string;
  propertyName?: string;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  title: string;
  description: string;
  /** null khi ticket còn PENDING — manager gán lúc duyệt (flow 17/07 chiều). */
  category?: MaintenanceCategory;
  /** Optional — manager có thể gán khi duyệt, không bắt buộc. */
  priority?: MaintenancePriority;
  status: MaintenanceStatus;
  images: string[];
  /** Ảnh phân loại theo flow mới — ưu tiên dùng thay cho `images` (gộp cả 3). */
  beforeImages?: string[];
  afterImages?: string[];
  rejectImages?: string[];
  /** Lý do tenant từ chối nghiệm thu (status = rejected). */
  rejectReason?: string;
  resolutionNote?: string;
  assignedTo?: string;
  repairCost?: number;
  resolvedAt?: string;
  timeline: MaintenanceTimeline[];
  equipmentId?: string;
  equipmentName?: string;
  createdAt: string;
  updatedAt: string;
  estimatedCompletionDate?: string;
  actualCompletionDate?: string;
  doneAt?: string;
  tenantConfirmedAt?: string;
  /** Ai trả phí sửa (luồng hóa đơn sau CLOSED): HOST = công ty · TENANT = khách làm hư. */
  costPaidBy?: 'HOST' | 'TENANT';
  /** Nguyên nhân hư hỏng — chỉ có ý nghĩa khi costPaidBy=TENANT. */
  cause?: 'wear' | 'misuse';
  /**
   * Trạng thái đồng ý bồi thường (28/07/2026, BE-DONE-maintenance-damage-compensation) —
   * độc lập với `status` chính của ticket. 'pending' → tenant cần trả lời agreeToCharge
   * khi confirm(); 'disputed' → tenant đã khiếu nại, không có charge nào được tạo.
   */
  costAgreementStatus?: 'not_applicable' | 'pending' | 'agreed' | 'disputed' | 'waived';
  /** Lý do khiếu nại số tiền (khi costAgreementStatus=disputed). */
  costDisputeReason?: string;
  /** Số lần tenant đã từ chối nghiệm thu. */
  reopenCount?: number;
  /** Log ảnh đầy đủ mọi vòng (BE 23/07/2026) — không bị mất khi sửa lại/từ chối lại. */
  photoHistory?: MaintenancePhotoHistoryDto[];
}

export interface CreateMaintenanceRequest {
  title: string;
  description: string;
  images: string[];
  equipmentId?: string;
}

// ===== Real API DTOs (FE-maintenance-flow 17/07) — enum UPPERCASE khớp BE =====
// BE đã migrate status legacy (ACKNOWLEDGED/SCHEDULED/...) về bộ 6 giá trị này;
// mapper vẫn nhận string legacy phòng dữ liệu cũ (xem BE_STATUS_MAP).
export type MaintenanceReqStatus =
  | 'PENDING' | 'APPROVED' | 'WAITING_TENANT_CONFIRM'
  | 'REJECTED' | 'CLOSED' | 'CANCELLED';
export type MaintenanceReqPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MaintenanceReqCategory =
  | 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'APPLIANCE' | 'STRUCTURAL' | 'OTHER';

export interface MaintenancePhotoHistoryDto {
  type: 'BEFORE' | 'AFTER' | 'REJECT';
  url: string;
  createdAt: string;
}

export interface MaintenanceTimelineDto {
  // string (không phải MaintenanceReqStatus) vì timeline cũ còn chứa status legacy
  // trước migrate (ACKNOWLEDGED, SCHEDULED, DONE...) — mapper tự quy về bộ mới.
  oldStatus?: string;
  newStatus: string;
  note?: string;
  changedBy?: string;
  changedByName?: string;
  changedAt: string;
}

export interface MaintenanceRequestDto {
  id: number;
  requestCode: string;
  /** Tiêu đề sự cố tenant nhập (flow 17/07 chiều — field riêng, không còn ghép vào description). */
  title?: string;
  status: MaintenanceReqStatus;
  /** null khi PENDING — manager gán lúc duyệt. */
  category?: MaintenanceReqCategory | null;
  /** null trừ khi manager gán lúc duyệt (optional). */
  priority?: MaintenanceReqPriority | null;
  description: string;
  tenantId: number;
  tenantName: string;
  tenantPhone?: string;
  /** null khi ticket thuộc HĐ nguyên căn (WHOLE_HOUSE) — dùng roomName/propertyName để hiển thị. */
  roomId: number | null;
  roomName: string;
  propertyId: number;
  propertyName: string;
  equipmentId?: number;
  equipmentName?: string;
  assignedManagerId?: number;
  assignedManagerName?: string;
  resolutionNote?: string;
  /** Lý do tenant từ chối (status REJECTED). */
  rejectReason?: string;
  /** Số lần tenant đã từ chối nghiệm thu. */
  reopenCount?: number;
  /** Ảnh phân loại — ưu tiên hiển thị 3 field này; `images` là gộp cả ba (legacy). */
  beforeImages?: string[];
  afterImages?: string[];
  rejectImages?: string[];
  images: string[];
  /** Log ảnh đầy đủ mọi vòng (BE 23/07/2026) — không bị mất khi sửa lại/từ chối lại. */
  photoHistory?: MaintenancePhotoHistoryDto[];
  acknowledgedAt?: string;
  resolvedAt?: string;
  tenantConfirmedAt?: string;
  timeline: MaintenanceTimelineDto[];
  createdAt: string;
  updatedAt: string;
  repairCost?: number;
  costPaidBy?: 'HOST' | 'TENANT';
  cause?: 'WEAR' | 'MISUSE';
  scheduledDate?: string;
  /** 28/07/2026 — bồi thường khách làm hư (BE-DONE-maintenance-damage-compensation).
   * WAIVED (30/07): manager miễn thu qua /resolve-cost — khác NOT_APPLICABLE (chưa từng có phí). */
  costAgreementStatus?: 'NOT_APPLICABLE' | 'PENDING' | 'AGREED' | 'DISPUTED' | 'WAIVED';
  costDisputeReason?: string;
  /** Chỉ có khi vừa confirm(agreeToCharge=true) — hoá đơn MAINTENANCE vừa tạo kèm QR PayOS. */
  issuedInvoice?: MaintenanceIssuedInvoiceDto;
}

/** Khớp `TenantInvoiceResponse` (BE) — subset field FE cần để hiện hoá đơn/QR ngay sau confirm(). */
export interface MaintenanceIssuedInvoiceDto {
  id: number;
  code: string;
  type: string;
  propertyName: string;
  roomNumber?: string | null;
  month: number;
  year: number;
  billingPeriod?: string;
  totalAmount: number;
  lateFee?: number;
  grandTotal: number;
  status: string;
  dueDate: string;
  createdAt: string;
  paidAt?: string;
  payosCheckoutUrl?: string;
  payosQrCode?: string;
  payosOrderCode?: number;
}

// Flow 17/07: tenant không gửi priority — manager gán khi duyệt.
// category: xem field riêng bên dưới (thêm 27/07 — bắt buộc khi báo hỏng không gắn thiết bị).
// roomId/propertyId (fix 27/07): thuê theo phòng → gửi roomId; thuê nguyên căn → roomId
// để trống, propertyId BẮT BUỘC thay thế (BE không tự suy được, thiếu sẽ lỗi rõ ràng
// thay vì 500 như bản trước). Xem docs/BE-FIX-maintenance-wholehouse-roomId-2026-07-27.md.
export interface CreateMaintenanceRequestDto {
  roomId?: number;
  /** Bắt buộc khi KHÔNG có roomId (thuê nguyên căn). */
  propertyId?: number;
  equipmentId?: number;
  /** Bắt buộc, ≤200 ký tự — hiển thị trên list/detail. */
  title: string;
  /** Optional từ 27/07 — BE bỏ validate bắt buộc. */
  description?: string;
  /**
   * Bắt buộc khi KHÔNG có equipmentId (STRUCTURAL | ELECTRICAL | PLUMBING | OTHER —
   * không dùng APPLIANCE/FURNITURE ở nhánh này, BE tự chặn). Optional khi có equipmentId
   * (manager gán lúc duyệt). Xem docs/FE-maintenance-non-equipment-create.md (repo BE).
   */
  category?: string;
  images: string[];
}

/** PUT /{id}/approve — manager duyệt: BẮT BUỘC gán category, priority tùy chọn. */
export interface ApproveMaintenanceRequestDto {
  category: MaintenanceReqCategory;
  priority?: MaintenanceReqPriority;
}

/**
 * PUT /{id}/complete — manager báo sửa xong (cần ảnh AFTER trước hoặc gửi kèm).
 * costPaidBy=TENANT bắt buộc kèm cause + repairCost>0 (BE validate, xem
 * BE-DONE-maintenance-damage-compensation-2026-07-28.md).
 */
export interface CompleteMaintenanceRequestDto {
  resolutionNote?: string;
  afterImages?: string[];
  costPaidBy?: 'HOST' | 'TENANT';
  cause?: 'WEAR' | 'MISUSE';
  repairCost?: number;
}

/** PUT /{id}/confirm — tenant nghiệm thu; agreeToCharge bắt buộc khi costAgreementStatus=PENDING. */
export interface ConfirmMaintenanceRequestDto {
  accept?: boolean;
  agreeToCharge?: boolean;
  chargeDisputeReason?: string;
}

/**
 * PUT /{id}/resolve-cost (BE 30/07 — BE-HANDOFF-maintenance-flow-deadends) — manager xử lý
 * khoản bồi thường treo (costAgreementStatus PENDING/DISPUTED), dùng được cả khi ticket đã
 * CLOSED/CANCELLED. CHARGE: chốt thu (repairCost mới ghi đè số cũ nếu gửi) + phát hoá đơn
 * ngay (response kèm issuedInvoice). WAIVE: miễn thu → WAIVED.
 */
export interface ResolveCostRequestDto {
  action: 'CHARGE' | 'WAIVE';
  /** Chỉ dùng với CHARGE — bỏ trống = giữ số tiền cũ trên ticket. */
  repairCost?: number;
  note?: string;
}

export interface MaintenanceDashboardDto {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  cancelled: number;
  totalRepairCost: number;
}

export type EquipmentLifecycleStatus = 'NEW' | 'GOOD' | 'DAMAGED' | 'MAINTENANCE' | 'BROKEN' | 'DISPOSED';

// Khớp EquipmentResponse (BE) — dùng chung cho manager + tenant equipment API.
// equipmentName/category thường null với thiết bị bàn giao ban đầu; tên thật nằm ở
// catalogName (vd "Điều hòa", "Giường"). Field nào BE chưa chắc luôn trả → optional.
export interface EquipmentDto {
  id: number;
  equipmentName?: string | null;
  category?: string | null;
  qrCode?: string;
  status: EquipmentLifecycleStatus;
  roomId?: number | null;
  roomName?: string | null;
  roomNumber?: string | null;
  propertyId: number;
  catalogId?: number;
  catalogName?: string;
  houseArea?: string;
  source?: string;
  price?: number | null;
  note?: string | null;
  installationDate?: string | null;
  warrantyExpiredDate?: string | null;
  warrantyMonths?: number | null;
  warrantyStartDate?: string | null;
  warrantyEndDate?: string | null;
  /** Mức phạt cố định (VNĐ) khi hết bảo hành mà khách làm hư. */
  penaltyFee?: number | null;
  maintenanceCount: number;
  lastMaintenanceDate?: string | null;
  operationalStatus?: string;
  currentEffective?: boolean;
}

export interface EquipmentMaintenanceHistoryDto {
  id: number;
  equipmentId: number;
  maintenanceRequestId: number;
  requestCode: string;
  maintenanceDate: string;
  repairCost?: number;
  note?: string;
}

// ======================== METER READING (Chỉ số điện nước) ========================
export type MeterType = 'electricity' | 'water';

export interface MeterReading {
  id: string;
  roomId: string;
  roomName: string;
  type: MeterType;
  previousReading: number;
  currentReading: number;
  consumption: number;
  unitPrice: number;
  totalCost: number;
  month: number;
  year: number;
  imageUrl?: string;
  recordedBy: string;
  createdAt: string;
  isAbnormal?: boolean;
  abnormalNote?: string;
}

export interface PropertyMeterRecord {
  id: string;
  propertyId: string;
  propertyName: string;
  month: number;
  year: number;
  prevElectricity: number;
  newElectricity: number;
  prevWater: number;
  newWater: number;
  electricityConsumption: number;
  waterConsumption: number;
  electricityCost: number;
  waterCost: number;
  totalCost: number;
  activeTenants: number;
  costPerTenant: number;
  recordedBy: string;
  recordedAt: string;
  invoicesGenerated: boolean;
  isAbnormalElec?: boolean;
  isAbnormalWater?: boolean;
}

// ======================== CONTRACT ========================
// Tenant KHÔNG tự ký/gia hạn/chấm dứt hợp đồng qua app — toàn bộ action đó
// (send-otp, confirm, resubmit-approval, cancel, terminate) chỉ MANAGER/ADMIN gọi
// được (verify 27/07/2026). Vì vậy không còn trạng thái 'chờ ký' — chỉ xem.
export type ContractStatus =
  | 'draft'
  | 'pending_host_approval'
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'terminated';
export type ContractType = 'admin_manager' | 'manager_tenant';

export interface ContractEquipment {
  id: string;
  name: string;
  quantity: number;
  condition: string;
}

export interface Contract {
  id: string;
  code: string;
  type: ContractType;
  lessorName: string;
  lessorPhone?: string;
  lesseeName: string;
  lesseeCccd: string;
  lesseePhone: string;
  propertyName: string;
  propertyId?: string;
  roomCode?: string;
  roomId?: string;
  startDate: string;
  endDate: string;
  depositAmount: number;
  rentAmount: number;
  status: ContractStatus;
  equipmentList: ContractEquipment[];
  otpVerified?: boolean;
  signedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  /** EARLY_MOVE_OUT | VIOLATION | MUTUAL_AGREEMENT | NO_SHOW | OTHER — xem getContractTerminationTypeLabel. */
  terminationType?: string;
  renewalReminderSent?: boolean;
  autoRenew?: boolean;
  daysUntilExpiry?: number;
  pdfUrl?: string;
  qrCode?: string;
  notes?: string;
}

// ======================== NOTIFICATION ========================
export type NotificationType =
  | 'new_bill'
  | 'bill_overdue'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_pending_verify'
  | 'contract_expiring'
  | 'contract_expired'
  | 'maintenance_new'
  | 'maintenance_accepted'
  | 'maintenance_resolved'
  | 'equipment_damaged'
  | 'meter_reading_due'
  | 'tenant_onboarded'
  // Luồng trả phòng: gửi/duyệt/kiểm tra/quyết toán/hoàn cọc — báo cho bên còn lại.
  | 'checkout_request'
  | 'system';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  referenceId?: string;
  referenceType?: 'invoice' | 'contract' | 'maintenance' | 'equipment' | 'tenant';
  isRead: boolean;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  actionLabel?: string;
  actionRoute?: string;
}

// ======================== ANALYTICS ========================
export interface DashboardStats {
  totalRooms: number;
  occupied: number;
  available: number;
  maintenance: number;
  occupancyRate: number;
  monthlyRevenue: number;
  pendingPayments: number;
  overduePayments: number;
  totalDebt: number;
  debtRatio: number;
  openMaintenanceTickets: number;
  urgentMaintenanceTickets: number;
  maintenanceCostThisMonth: number;
  contractsExpiringSoon: number;
  contractsExpired: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueTrend: number; // % change
  profitThisMonth: number;
  expenseThisMonth: number;
}

export interface MonthlyRevenueStat {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
}

// ======================== TENANT ========================
export type TenantStatus = 'active' | 'pending_activation' | 'moved_out' | 'suspended';

export interface Tenant {
  id: string;
  userId?: string;
  fullName: string;
  phone: string;
  email?: string;
  cccd: string;
  dateOfBirth?: string;
  permanentAddress?: string;
  cccdFrontUri?: string;
  cccdBackUri?: string;
  avatarUri?: string;
  propertyId: string;
  propertyName: string;
  roomId: string;
  roomName: string;
  status: TenantStatus;
  moveInDate: string;
  moveOutDate?: string;
  depositAmount: number;
  contractId?: string;
  activeInvoiceCount?: number;
  unpaidAmount?: number;
  notes?: string;
  createdAt: string;
}

// ======================== TENANT RISK & WISHLIST ========================
export type TenantRiskLevel = 'low' | 'medium' | 'high';

export interface TenantRiskIndicator {
  tenantId: string;
  latePaymentCount: number;
  maintenanceFrequency: number;
  contractViolations: number;
  riskLevel: TenantRiskLevel;
  lastAssessedAt: string;
}

export interface WishlistUser {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  preferredDistrict?: string;
  maxBudget?: number;
  desiredMoveInDate?: string;
  notes?: string;
  createdAt: string;
  status: 'waiting' | 'contacted' | 'converted';
}

export interface TenantTimeline {
  tenantId: string;
  events: TenantTimelineEvent[];
}

export interface TenantTimelineEvent {
  id: string;
  type: 'move_in' | 'move_out' | 'payment' | 'maintenance' | 'contract_renewal' | 'violation';
  title: string;
  description?: string;
  amount?: number;
  date: string;
}

// ======================== RENEWAL & CHECKOUT ========================
export type RenewalStatus = 'pending' | 'approved' | 'rejected';
export type CheckoutStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface RenewalRequest {
  id: string;
  contractId: string;
  tenantId: string;
  requestedMonths: number;
  proposedStartDate: string;
  proposedEndDate: string;
  note?: string;
  status: RenewalStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface CheckoutRequest {
  id: string;
  contractId: string;
  tenantId: string;
  requestedMoveOutDate: string;
  reason: string;
  assetReturnConfirmed: boolean;
  depositRefundAmount?: number;
  depositRefundStatus?: 'pending' | 'processing' | 'paid';
  finalElectricity?: number;
  finalWater?: number;
  status: CheckoutStatus;
  createdAt: string;
  confirmedAt?: string;
}

// ======================== ONBOARDING ========================
export type OnboardingStep =
  | 'id_capture'
  | 'tenant_info'
  | 'room_inspection'
  | 'asset_confirmation'
  | 'meter_reading'
  | 'handover_confirmation'
  | 'sign_confirmation';

export interface OnboardingAsset {
  id: string;
  name: string;
  quantity: number;
  condition: 'good' | 'fair' | 'poor';
  notes?: string;
  confirmed: boolean;
}

export interface TenantOnboarding {
  id: string;
  contractId: string;
  tenantId: string;
  roomId: string;
  roomName: string;
  step: OnboardingStep;
  completedSteps: OnboardingStep[];
  // Step 1: ID Capture
  cccdFrontUri?: string;
  cccdBackUri?: string;
  ocrFullName?: string;
  ocrCccdNumber?: string;
  ocrDateOfBirth?: string;
  // Step 2: Tenant info + prorate
  moveInDate?: string;
  proratedRentAmount?: number;
  proratedDays?: number;
  // Step 3: Room condition
  roomConditionNotes?: string;
  roomConditionImages?: string[];
  roomConditionAreas?: { area: string; imageUri?: string; note?: string }[];
  // Step 4: Assets
  assets: OnboardingAsset[];
  // Step 5: Meter reading
  initialElectricity?: number;
  initialWater?: number;
  meterImages?: string[];
  meterOcrElec?: number;
  meterOcrWater?: number;
  // Step 6: Handover confirmation
  depositAmount?: number;
  equipmentList?: { name: string; quantity: number; condition: string }[];
  tenantSignatureUri?: string;
  managerSignatureUri?: string;
  handoverReportGenerated?: boolean;
  signatureImageUri?: string;
  confirmedAt?: string;
  createdAt: string;
}

// ======================== NOTIFICATION CENTER ========================
export interface NotificationGroup {
  date: string;
  notifications: AppNotification[];
}

// ======================== CHAT / COMMUNICATION ========================
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  receiverId: string;
  content: string;
  imageUri?: string;
  status: MessageStatus;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: UserRole;
  participantAvatar?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

// ======================== API RESPONSE ========================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ======================== SEARCH & LOCATION ========================
export interface City {
  id: string;
  name: string;
  availableRooms: number;
}

/** @deprecated Use City instead */
export type District = City;

export interface Ward {
  id: string;
  cityId: string;
  name: string;
  availableRooms: number;
}

export type PropertyType = 'apartment' | 'whole_house';

export interface SearchFilters {
  keyword?: string;
  propertyType?: 'apartment' | 'whole_house';
  cityId?: string;
  wardIds?: string[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  amenities?: string[];
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'nearest';
  latitude?: number;
  longitude?: number;
  page?: number;
  limit?: number;
}

export interface PropertyListing {
  id: string;
  name: string;
  address: string;
  city: string;
  ward: string;
  cityId: string;
  wardId: string;
  photos: string[];
  priceFrom: number;
  priceTo: number;
  totalRooms: number;
  availableRooms: number;
  area: number;
  propertyType: PropertyType;
  amenities: string[];
  houseEquipments?: string[];
  electricityRate: number;
  waterRate: number;
  depositMonths: number;
  serviceFee: number;
  description: string;
  paymentNote?: string;
  latitude: number;
  longitude: number;
  rooms: PropertyRoom[];
  hostName?: string;
  hostPhone?: string;
  createdAt: string;
}

export interface PropertyRoom {
  id: string;
  name: string;
  floor: number;
  area: number;
  price: number;
  status: 'available' | 'occupied';
  photos?: string[];
  equipments?: string[];
  description?: string;
}

export interface SearchResult {
  properties: PropertyListing[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NearbyRequest {
  latitude: number;
  longitude: number;
  radiusKm: number;
  limit?: number;
}
