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
export type MaintenanceStatus = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'cancelled';
export type MaintenanceCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
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
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  images: string[];
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
}

export interface CreateMaintenanceRequest {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  images: string[];
  equipmentId?: string;
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

// ======================== EQUIPMENT (Trang thiết bị) ========================
export type EquipmentStatus = 'active' | 'repairing' | 'damaged' | 'replaced' | 'retired' | 'broken' | 'needs_check';

export interface EquipmentMaintenanceRecord {
  id: string;
  date: string;
  type: 'repair' | 'maintenance' | 'replacement';
  description: string;
  cost: number;
  performedBy: string;
  ticketId?: string;
}

export interface Equipment {
  id: string;
  assetId: string;
  name: string;
  houseId: string;
  houseName?: string;
  roomId?: string;
  roomName?: string;
  category: string;
  qrCode: string;
  status: EquipmentStatus;
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  installationDate: string;
  warrantyExpiry?: string;
  lastMaintenanceAt?: string;
  maintenanceHistory: EquipmentMaintenanceRecord[];
  currentTenantId?: string;
  currentTenantName?: string;
  notes?: string;
  images?: string[];
}

// ======================== CONTRACT ========================
export type ContractStatus =
  | 'draft'
  | 'pending_host_approval'
  | 'waiting_tenant_signature'
  | 'waiting_sign'
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
export interface District {
  id: string;
  name: string;
  availableRooms: number;
}

export interface Ward {
  id: string;
  districtId: string;
  name: string;
  availableRooms: number;
}

export interface SearchFilters {
  keyword?: string;
  districtId?: string;
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
  district: string;
  ward: string;
  districtId: string;
  wardId: string;
  photos: string[];
  priceFrom: number;
  priceTo: number;
  totalRooms: number;
  availableRooms: number;
  area: number;
  amenities: string[];
  electricityRate: number;
  waterRate: number;
  depositMonths: number;
  serviceFee: number;
  description: string;
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
