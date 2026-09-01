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
// Redesign 01/09/2026 (BE commit 8ddbc3e/28b177b — as-built, xem
// docs/maintenance-implementation-spec.md): 2 luồng.
//   Luồng A (hao mòn/lỗi chủ):  OPEN → IN_REPAIR → CLOSED
//   Luồng B (lỗi tenant):       OPEN → TENANT_FAULT → CLOSED (manager sửa hộ, tự tạo charge)
//                                OPEN → PENDING_TENANT_REPAIR → CLOSED | OUTSTANDING_DAMAGE
// KHÔNG còn tenant confirm/reject nghiệm thu, KHÔNG còn reopen cùng phiếu — không hài
// lòng thì tạo phiếu mới kèm previousRequestId. Chi phí không còn dispute trong module
// này — HOST_PAID chỉ hiển thị tham khảo, TENANT_CHARGE_PENDING/DEPOSIT_DEDUCTION_PENDING
// tự động qua billing/checkout.
export type MaintenanceStatus =
  | 'open'                    // chờ manager check
  | 'in_repair'                // đang sửa (Luồng A, hoặc Luồng B nhánh manager sửa hộ)
  | 'tenant_fault'              // lỗi tenant, manager sẽ sửa hộ rồi charge
  | 'pending_tenant_repair'    // giao tenant tự sửa trước deadline
  | 'outstanding_damage'       // quá hạn/không đạt — chờ checkout trừ cọc
  | 'closed'                   // hoàn tất
  | 'cancelled';
export type MaintenanceCategory = 'appliance' | 'furniture' | 'plumbing' | 'electrical';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceFlowType = 'normal_wear' | 'tenant_fault';
/** Gợi ý FE hiển thị khối chi phí — xem MaintenanceBillingHint (BE). */
export type MaintenanceBillingHint =
  | 'host_paid' | 'tenant_charge_pending' | 'deposit_deduction_pending' | 'none';
export type FaultResolutionPath = 'manager_repair' | 'tenant_self_repair';
export type DamageCause = 'wear' | 'tenant_misuse' | 'tenant_modification' | 'misuse';

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
  /** null khi ticket còn OPEN — manager gán lúc duyệt. */
  category?: MaintenanceCategory;
  /** Optional — manager có thể gán khi duyệt, không bắt buộc. */
  priority?: MaintenancePriority;
  status: MaintenanceStatus;
  flowType?: MaintenanceFlowType;
  /** Gợi ý FE render khối chi phí — xem MaintenanceBillingHint. */
  billingHint?: MaintenanceBillingHint;
  images: string[];
  /** Ảnh phân loại — ưu tiên dùng thay cho `images` (gộp legacy). */
  beforeImages?: string[];
  afterImages?: string[];
  invoiceImages?: string[];
  faultEvidenceImages?: string[];
  selfRepairImages?: string[];
  resolutionNote?: string;
  /** Mô tả việc đã sửa (bắt buộc khi manager complete()). */
  repairDescription?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  /** Id phiếu trước đó nếu đây là phiếu tạo lại (khách chưa ổn với lần sửa trước). */
  previousRequestId?: string;
  damageCause?: DamageCause;
  /** Lý do manager ghi khi reject-fault (lỗi do tenant). */
  faultReason?: string;
  faultResolutionPath?: FaultResolutionPath;
  /** Hạn tenant tự sửa (status = pending_tenant_repair). */
  selfRepairDeadline?: string;
  /** Ước tính thiệt hại — chốt số cuối lúc checkout. */
  estimatedDamageAmount?: number;
  assignedTo?: string;
  resolvedAt?: string;
  timeline: MaintenanceTimeline[];
  equipmentId?: string;
  equipmentName?: string;
  createdAt: string;
  updatedAt: string;
  /** Chỉ có khi vừa complete() Luồng B (manager sửa hộ) — hoá đơn MAINTENANCE vừa tạo kèm QR PayOS. */
  issuedInvoice?: MaintenanceIssuedInvoiceDto;
  /** Log ảnh đầy đủ mọi vòng (append-only) — không bị mất khi tạo phiếu mới. */
  photoHistory?: MaintenancePhotoHistoryDto[];
}

export interface CreateMaintenanceRequest {
  title: string;
  description: string;
  images: string[];
  equipmentId?: string;
}

// ===== Real API DTOs (redesign 01/09/2026) — enum UPPERCASE khớp BE =====
export type MaintenanceReqStatus =
  | 'OPEN' | 'IN_REPAIR' | 'TENANT_FAULT' | 'PENDING_TENANT_REPAIR'
  | 'OUTSTANDING_DAMAGE' | 'CLOSED' | 'CANCELLED';
export type MaintenanceReqPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MaintenanceReqCategory = 'APPLIANCE' | 'FURNITURE' | 'PLUMBING' | 'ELECTRICAL';
export type MaintenanceReqFlowType = 'NORMAL_WEAR' | 'TENANT_FAULT';
export type MaintenanceReqBillingHint =
  | 'HOST_PAID' | 'TENANT_CHARGE_PENDING' | 'DEPOSIT_DEDUCTION_PENDING' | 'NONE';
export type MaintenanceReqFaultResolutionPath = 'MANAGER_REPAIR' | 'TENANT_SELF_REPAIR';
export type MaintenanceReqDamageCause = 'WEAR' | 'TENANT_MISUSE' | 'TENANT_MODIFICATION' | 'MISUSE';

export interface MaintenancePhotoHistoryDto {
  type: 'BEFORE' | 'FAULT_EVIDENCE' | 'SELF_REPAIR' | 'AFTER' | 'INVOICE';
  url: string;
  createdAt: string;
}

export interface MaintenanceTimelineDto {
  // string (không phải MaintenanceReqStatus) vì timeline cũ còn chứa status legacy
  // trước migrate 01/09 (PENDING/APPROVED/...) — mapper tự quy về bộ mới.
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
  title?: string;
  status: MaintenanceReqStatus;
  flowType?: MaintenanceReqFlowType;
  billingHint?: MaintenanceReqBillingHint;
  /** null khi OPEN chưa duyệt — manager gán lúc duyệt. */
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
  repairDescription?: string;
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  previousRequestId?: number;
  damageCause?: MaintenanceReqDamageCause;
  faultReason?: string;
  faultResolutionPath?: MaintenanceReqFaultResolutionPath;
  selfRepairDeadline?: string;
  estimatedDamageAmount?: number;
  /** Set qua PUT /{id}/admin-review — null nghĩa là chưa duyệt (hoặc phiếu thuộc luồng
   * reject-fault cũ, không đi qua report-fault/admin-review). */
  adminReviewedAt?: string;
  adminReviewedBy?: string;
  adminReviewedByName?: string;
  adminApproved?: boolean;
  adminReviewNote?: string;
  /** Ảnh phân loại — ưu tiên hiển thị các field này; `images` là gộp tất cả (legacy). */
  beforeImages?: string[];
  afterImages?: string[];
  invoiceImages?: string[];
  faultEvidenceImages?: string[];
  selfRepairImages?: string[];
  images: string[];
  /** Log ảnh đầy đủ mọi vòng (append-only) — không bị mất khi tạo phiếu mới. */
  photoHistory?: MaintenancePhotoHistoryDto[];
  acknowledgedAt?: string;
  resolvedAt?: string;
  timeline: MaintenanceTimelineDto[];
  createdAt: string;
  updatedAt: string;
  /** Chỉ có khi vừa complete() Luồng B (manager sửa hộ) — hoá đơn MAINTENANCE vừa tạo kèm QR PayOS. */
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

// Tenant không gửi priority — manager gán khi duyệt. roomId/propertyId: thuê theo
// phòng → gửi roomId; thuê nguyên căn → roomId để trống, propertyId BẮT BUỘC thay thế.
export interface CreateMaintenanceRequestDto {
  roomId?: number;
  /** Bắt buộc khi KHÔNG có roomId (thuê nguyên căn). */
  propertyId?: number;
  equipmentId?: number;
  /** Id phiếu trước — dùng khi tạo lại vì phiếu cũ đã CLOSED nhưng chưa ổn. */
  previousRequestId?: number;
  /** Bắt buộc, ≤200 ký tự — hiển thị trên list/detail. */
  title: string;
  description?: string;
  /** Bắt buộc khi KHÔNG có equipmentId — APPLIANCE | FURNITURE | PLUMBING | ELECTRICAL. */
  category?: string;
  images: string[];
}

/** PUT /{id}/approve — manager duyệt (Luồng A): BẮT BUỘC gán category, priority tùy chọn. */
export interface ApproveMaintenanceRequestDto {
  category: MaintenanceReqCategory;
  priority?: MaintenanceReqPriority;
}

/**
 * PUT /{id}/complete — manager báo sửa xong, dùng cho cả IN_REPAIR (Luồng A) lẫn
 * TENANT_FAULT + MANAGER_REPAIR (Luồng B — tự tạo charge + issuedInvoice trong response).
 * BE bắt buộc: repairDescription, afterImages, invoiceImages, invoiceVendor, invoiceDate,
 * invoiceAmount(>0) — afterImages/invoiceImages có thể đã upload trước qua POST /photos.
 */
export interface CompleteMaintenanceRequestDto {
  resolutionNote?: string;
  repairDescription?: string;
  afterImages?: string[];
  invoiceImages?: string[];
  invoiceVendor?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
}

/**
 * PUT /{id}/reject-fault — manager xác định lỗi do tenant (Luồng B). BE bắt buộc
 * faultReason, faultEvidenceImages(≥1), resolutionPath; TENANT_SELF_REPAIR còn bắt buộc
 * thêm selfRepairDeadline + estimatedDamageAmount(>0) — BE KHÔNG tự default 14 ngày dù
 * config có, FE phải tự gửi (xem docs/BE-YEUCAU-chot-redesign-maintenance-2026-09-01.md).
 */
export interface RejectFaultRequestDto {
  faultReason: string;
  faultEvidenceImages: string[];
  resolutionPath: MaintenanceReqFaultResolutionPath;
  selfRepairDeadline?: string;
  estimatedDamageAmount?: number;
}

/**
 * PUT /{id}/report-fault — thay reject-fault cho luồng mới (01/09/2026): manager chỉ
 * báo mô tả + ảnh bằng chứng, KHÔNG tự chọn hướng xử lý — gửi thẳng cho admin duyệt
 * trên web qua PUT /{id}/admin-review. Xem docs/BE-YEUCAU-luong-loi-do-khach-admin-duyet.
 */
export interface ReportFaultRequestDto {
  faultReason: string;
  faultEvidenceImages: string[];
}

/** PUT /{id}/submit-self-repair — tenant nộp ảnh đã tự sửa (JSON hoặc multipart). */
export interface SubmitSelfRepairRequestDto {
  note?: string;
  selfRepairImages?: string[];
}

/** PUT /{id}/verify-repair — manager duyệt kết quả tenant tự sửa. */
export interface VerifyRepairRequestDto {
  accepted: boolean;
  note?: string;
  verifyImages?: string[];
}

/** GET /outstanding-damages — thiết bị hư chưa xử lý, chờ trừ cọc lúc checkout. */
export interface OutstandingDamageDto {
  id: number;
  maintenanceRequestId: number;
  tenantContractId: number;
  equipmentId?: number;
  label: string;
  estimatedAmount: number;
  note?: string;
  photos: string[];
  createdAt: string;
}

export interface MaintenanceDashboardDto {
  open: number;
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
  /** Chỉ có giá trị khi operationalStatus = DISABLED (thiết bị đã gỡ khỏi phòng). */
  disabledAt?: string | null;
  disabledReason?: string | null;
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
  /** Tham số route BE gửi kèm (vd { requestId: 12 }) — có từ 05/08/2026. */
  actionParams?: Record<string, any>;
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
