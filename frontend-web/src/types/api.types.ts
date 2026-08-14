// =============================================================================
// ENUMS — khớp 100% với Backend enums (Inbound Onboarding v2)
// =============================================================================

export type PropertyStatus =
  | 'DRAFT'
  | 'UNDER_RENOVATION'
  | 'RENOVATION_COMPLETED'   // căn import từ Excel dừng ở đây — đã cải tạo xong, chờ định giá & gửi Host
  | 'PENDING_HOST_REVIEW'
  | 'ACTIVE'
  | 'RENTED'                  // nguyên căn đã được cho thuê — đang có HĐ tenant hiệu lực
  | 'DISABLED'
  // Legacy (giữ lại cho tương thích)
  | 'MAINTENANCE'
  | 'INACTIVE';

export type RoomStatus = 'DRAFT' | 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';

export type PropertyType = 'INDIVIDUAL_ROOM' | 'WHOLE_HOUSE';

export type PricingScope = 'WHOLE_HOUSE' | 'ROOM';

export type EquipmentSource = 'INITIAL_HANDOVER' | 'PURCHASED';

export type EquipmentStatus = 'NEW' | 'GOOD' | 'DAMAGED' | 'BROKEN';

/** Trạng thái thiết bị khi khai báo manifest inbound (chỉ 2 giá trị) */
export type ManifestEquipmentStatus = 'NEW' | 'GOOD';

export type ContractStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export type UserRole = 'ROLE_ADMIN' | 'ROLE_OWNER' | 'ROLE_MANAGER' | 'ROLE_TENANT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'DISABLE';

export type PhotoType = 'BEFORE' | 'AFTER';

export type UtilityType = 'ELECTRIC' | 'WATER';

/** Khu vực trong nhà nguyên căn — dùng khi gán thiết bị */
export type HouseArea =
  | 'LIVING_ROOM'
  | 'BEDROOM'
  | 'KITCHEN'
  | 'BATHROOM'
  | 'BALCONY'
  | 'GARAGE'
  | 'OTHER';

// =============================================================================
// AUTH
// =============================================================================

export interface AuthRequest {
  username: string;
  password: string;
  phoneNumber?: string;
  role?: string;
}

export interface AuthResponse {
  token: string;
  username: string;
  role: string;
}

// =============================================================================
// ZONE
// =============================================================================

export interface ZoneRequest {
  name: string;
  description?: string | null;
  level: number; // 1 = Tỉnh/TP, 2 = Quận/Huyện
  parentId?: string | null; // UUID
}

export interface ZoneResponse {
  id: string; // UUID
  name: string;
  description?: string;
  level: number;
  parentId?: string;
  parentName?: string;
  fullName: string;
}

// =============================================================================
// ZONE — Import Excel
// =============================================================================

export interface ZoneImportResult {
  sheet: string;          // "1. Tinh_Thanh" | "2. Quan_Huyen"
  rowNumber: number;      // 1-based (dòng Excel)
  action: 'CREATED' | 'SKIPPED' | 'UPDATED';
  zoneName: string;
  level: 1 | 2;
  message: string;
}

export interface ZoneBulkImportResponse {
  dryRun: boolean;
  citiesCreated: number;
  citiesSkipped: number;
  districtsCreated: number;
  districtsSkipped: number;
  districtsUpdated: number;
  results: ZoneImportResult[];
  errors: [];
}

// =============================================================================
// MANAGER ZONES — gán khu vực phụ trách cho quản lý vận hành
// =============================================================================

export interface ManagerZonesResponse {
  managerId: string; // UUID, = User.id
  fullName: string;
  phoneNumber: string;
  username: string;
  role: 'ROLE_MANAGER';
  status: UserStatus;
  zones: ZoneResponse[];
}

export interface AssignManagerZonesRequest {
  zoneIds: string[]; // [] = gỡ hết
}

// =============================================================================
// MASTER DATA — Equipment Catalog & Renovation Categories
// =============================================================================

export interface EquipmentCatalogItem {
  id: number;
  name: string;
  description?: string;
}

export interface RenovationCategory {
  id: number;
  code: string;       // e.g. 'PAINTING', 'EQUIPMENT'
  name: string;       // e.g. 'Sơn sửa'
  description?: string;
}

// =============================================================================
// PROPERTY — Draft & Response (Inbound Onboarding v2)
// =============================================================================

/** Request tạo nháp property — POST /properties/draft */
export interface PropertyDraftRequest {
  propertyName: string;
  address: string;
  descriptions?: string;
  zoneId: string;       // UUID
  areaSize?: number;
  floorCount?: number;
  roomsPerFloor?: number;
  createdBy?: number;
  imageUrls?: string[];
}

/** Response từ tất cả endpoint property */
export interface PropertyResponse {
  id: number;
  propertyName: string;
  shortAddress: string;
  fullAddress: string;
  descriptions?: string;
  zoneId: string;        // UUID
  zoneName: string;
  areaSize?: number;
  wholeHouse: boolean | null;
  hasRenovation: boolean | null;
  totalFloor?: number;   // field thực từ BE
  floorCount?: number;   // alias cũ, giữ tương thích
  roomsPerFloor?: number;
  totalRooms: number;
  status: string;        // PropertyStatus
  price?: number;
  createdBy?: number;
  operationManagerId?: string;
  operationManagerName?: string;
  renovationCompleted: boolean;
  imageUrls?: string[];
  // Đơn giá điện/nước cấp nhà (theo giá nhà nước). BE trả ở GET /properties/{id}.
  electricityUnitPrice?: number | null;
  waterUnitPrice?: number | null;
  // TB chủ nhà gốc bàn giao (import đợt 1) — CHỈ hiển thị, không khấu hao.
  handoverEquipments?: HandoverEquipmentResponse[];
  // Đợt cải tạo đang hiệu lực + toàn bộ lịch sử cải tạo (có version v1/v2).
  activeRenovationSession?: RenovationSession | null;
  renovationSessions?: RenovationSession[];
  // Legacy fields (giữ tương thích)
  deposit?: number;
}

/**
 * 1 thiết bị/nội thất chủ nhà gốc bàn giao theo HĐ thuê (import đợt 1).
 * Chỉ để hiển thị ở màn chi tiết toà nhà — KHÔNG gán phòng, KHÔNG khấu hao.
 * GET /api/v1/properties/{id} (field handoverEquipments) hoặc
 * GET /api/v1/properties/{propertyId}/handover-equipments.
 */
export interface HandoverEquipmentResponse {
  id: number;
  catalogId: number;
  catalogName: string;
  description: string | null;
  roomNumber: string | null;
  houseArea: string | null;   // HouseArea: LIVING_ROOM | KITCHEN | ...
  status: string;             // EquipmentStatus: NEW | GOOD | DAMAGED | BROKEN
  quantity: number;
  note: string | null;
}

/**
 * Response cho trang guest công khai — GET /api/v1/public/properties[/{id}].
 * Gồm các field cơ bản giống `PropertyResponse` cộng dữ liệu cho khách thuê.
 * Các field lat/long, giá điện/nước, cọc, phí dịch vụ CÓ THỂ null khi OM chưa nhập.
 * (BE: BE-multipart-public-guest-api-2026-06-20.md)
 */
export interface GuestPropertyResponse {
  id: number;
  propertyName: string;
  shortAddress: string;
  fullAddress?: string;
  descriptions?: string;
  zoneId: string;        // UUID
  zoneName: string;
  areaSize?: number;
  wholeHouse: boolean | null;
  totalRooms?: number;
  status: string;        // PropertyStatus
  price?: number;
  operationManagerId?: string;
  operationManagerName?: string;
  imageUrls?: string[];
  // Field riêng cho guest (nullable)
  latitude?: number | null;
  longitude?: number | null;
  amenities?: string[];              // tên catalog thiết bị distinct của nhà
  electricityUnitPrice?: number | null;
  waterUnitPrice?: number | null;
  depositMonths?: number | null;
  serviceFee?: number | null;
  rentalAvailable?: boolean;         // còn nhận khách thuê hay không
}

/** Legacy — giữ lại cho PropertyFormModal cũ */
export interface PropertyCreateRequest {
  propertyName: string;
  address: string;
  descriptions?: string;
  zoneId: string;
  wholeHouse: boolean;
  areaSize?: number;
  totalRooms?: number;
  managedBy?: number;
  imageUrls?: string[];
}

// =============================================================================
// EQUIPMENT MANIFEST — Khai báo thiết bị có sẵn
// =============================================================================

export type ManifestEquipmentSource = 'INITIAL_HANDOVER' | 'PURCHASED';

export interface ManifestItem {
  catalogId: number;
  quantity: number;
  status: ManifestEquipmentStatus;
  source: ManifestEquipmentSource;
  price?: number;
}

export interface ManifestRequest {
  items: ManifestItem[];
}

export interface ManifestItemResponse {
  id: number;
  catalogId: number;
  catalogName: string;
  quantity: number;
  status: ManifestEquipmentStatus;
  assignedCount: number;
}

// =============================================================================
// INBOUND CONTRACT
// =============================================================================

/** Request tạo/cập nhật HĐ inbound — POST /properties/{id}/inbound-contract */
export interface InboundContractRequest {
  contractCode: string;
  ownerName: string;
  totalRentAmount: number;
  startDate: string;  // ISO date: '2026-01-01'
  endDate: string;
  contractScanUrl?: string;
}

export interface InboundContractResponse {
  id: number;
  propertyId: number;
  contractCode: string;
  ownerName: string;
  totalRentAmount: number;
  startDate: string;
  endDate: string;
  contractScanUrl?: string;
  status: ContractStatus;
}

// Legacy — giữ tương thích
export interface CreateInboundContractRequest {
  contractCode: string;
  ownerName: string;
  baseRentPrice: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
  contractScanUrl?: string;
}

// =============================================================================
// ONBOARDING OPTIONS — Chọn loại hình & cải tạo
// =============================================================================

export interface OnboardingOptionsRequest {
  wholeHouse: boolean;
  hasRenovation: boolean;
}

// =============================================================================
// STRUCTURE UPDATE — Cập nhật cấu trúc sau cải tạo
// =============================================================================

export interface StructureUpdateRequest {
  totalFloor: number;
  totalRooms: number;
}

// =============================================================================
// RENOVATION LINES — Chi phí cải tạo
// =============================================================================

export interface RenovationLineRequest {
  categoryId: number;
  cost: number;
  note?: string;
}

export interface RenovationLineResponse {
  id: number;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  cost: number;
  note?: string;
}

// =============================================================================
// RENOVATION SESSION (BE — grouped renovation history, có version v1/v2)
// =============================================================================

export type RenovationSessionStatus = 'IN_PROGRESS' | 'ACTIVE' | 'DISABLED';
export type EquipmentOperationalStatus = 'ACTIVE' | 'DISABLED';
export type EquipmentImportAction = 'THEM_MOI' | 'THAY_THE';

/** 1 thiết bị mua (PURCHASED) gắn theo 1 đợt cải tạo (renovationSession). */
export interface SessionEquipmentResponse {
  id: number;
  catalogId: number;
  catalogName: string;
  /** Mã QR thật trong DB (dạng "EQ-{id}") — BE thêm 30/07/2026, dùng thay QR tự sinh ở FE. */
  qrCode?: string;
  roomId: number | null;
  roomNumber: string | null;
  houseArea: string | null;
  source: 'PURCHASED' | 'INITIAL_HANDOVER';
  status: string;
  operationalStatus: EquipmentOperationalStatus;
  currentEffective: boolean;       // true = đang dùng; false = đã thay thế (THAY_THE)
  price: number;
  note: string | null;
  warrantyMonths: number | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  disabledAt: string | null;
}

export interface RenovationSession {
  id?: number;
  sessionNumber: number;
  versionLabel?: string;             // "v1", "v2", ...
  status?: RenovationSessionStatus;  // ACTIVE = đang hiệu lực, DISABLED = đợt cũ
  currentEffective?: boolean;
  startDate?: string;   // ISO date, may be null while in progress
  endDate?: string;     // ISO date, null if current session
  disabledAt?: string | null;
  totalCost: number;
  lines: RenovationLineResponse[];
  equipments?: SessionEquipmentResponse[];
}

/**
 * TB vận hành (đã gán phòng/khu vực) — GET /api/v1/properties/{id}/equipments.
 * Gồm cả PURCHASED lẫn INITIAL_HANDOVER đã gán; có version cải tạo + bảo hành.
 */
export interface OperationalEquipmentResponse {
  id: number;
  propertyId: number;
  roomId: number | null;
  catalogId: number;
  catalogName: string;
  houseArea: string | null;
  source: 'PURCHASED' | 'INITIAL_HANDOVER';
  status: string;
  price: number;
  note: string | null;
  warrantyMonths: number | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  operationalStatus: EquipmentOperationalStatus;
  currentEffective: boolean;               // true = đang dùng; false = đã thay thế
  renovationSessionNumber: number | null;
  renovationVersionLabel: string | null;   // "v1", "v2", ...
  disabledAt: string | null;
}

// =============================================================================
// RENOVATION SCHEDULE
// =============================================================================

export interface RenovationScheduleRequest {
  startDate: string;  // ISO date
  endDate: string;
}

// =============================================================================
// ROOM
// =============================================================================

export interface AddRoomRequest {
  roomNumber: string;
  area: number;
  maxOccupants?: number;
  propertyType: PropertyType;
  structureDescription?: string;
  imageUrls?: string;
  electricMeterCode?: string;
  waterMeterCode?: string;
  // Legacy fields
  price?: number;
  deposit?: number;
}

export interface RoomResponse {
  id: number;
  propertyId: number;
  propertyName: string;
  roomNumber: string;
  price?: number;
  deposit?: number;
  area: number;
  maxOccupants?: number;
  structureDescription?: string;
  imageUrls?: string;
  propertyType: PropertyType;
  status: RoomStatus;
  electricMeterCode?: string;
  waterMeterCode?: string;
}

// =============================================================================
// EQUIPMENT ASSIGNMENT — Gán thiết bị vào vị trí
// =============================================================================

export interface EquipmentAssignRequest {
  catalogId: number;
  quantity: number;
  status: ManifestEquipmentStatus;
  source: EquipmentSource;
  roomId?: number;        // Dùng khi chia phòng
  houseArea?: HouseArea;  // Dùng khi nhà nguyên căn
}

export interface EquipmentAssignmentResponse {
  id: number;
  propertyId?: number;
  catalogId: number;
  catalogName: string;
  quantity: number;
  source: EquipmentSource;   // INITIAL_HANDOVER | PURCHASED — từ BE EquipmentResponse
  status: EquipmentStatus;   // NEW | GOOD | DAMAGED | BROKEN
  price?: number;            // giá thiết bị (mới mua)
  note?: string;
  roomId?: number;
  roomNumber?: string;
  houseArea?: HouseArea;
}

// =============================================================================
// DEPRECIATION / PRICING — Giá đề xuất
// =============================================================================

export interface DepreciationRoomResult {
  roomId: number;
  roomNumber: string;
  totalRentAmount: number;
  totalRenovationCost: number;
  totalEquipmentCost: number;
  totalInvestment: number;
  contractMonths: number;
  monthlyBreakEven: number;
  suggestedMinPrice: number;
  calculatedAt: string;
}

export interface DepreciationWholeHouseResult {
  totalRentAmount: number;
  totalRenovationCost: number;
  totalEquipmentCost: number;
  totalInvestment: number;
  contractMonths: number;
  monthlyBreakEven: number;
  suggestedMinPrice: number;
  calculatedAt: string;
}

export interface PricingResponse {
  propertyId: number;
  pricingScope: PricingScope;
  wholeHouseResult?: DepreciationWholeHouseResult;
  roomResults?: DepreciationRoomResult[];
}

// ── Mô hình định giá mới (FORWARD/REVERSE) — base /api/v1/properties/{id}/pricing ──
// FORWARD: host biết lợi nhuận ròng mong muốn/tháng (pDesired).
// REVERSE: host biết ROI %/năm (roiExpected) trên tổng vốn đầu tư.
export type PricingMode = 'FORWARD' | 'REVERSE';

export interface CalculatePricingRequest {
  mode?: PricingMode;
  pDesired?: number;          // FORWARD: lợi nhuận ròng mong muốn/tháng (VND)
  roiExpected?: number;       // REVERSE: ROI %/năm trên CAPEX
  oOperation?: number;        // Chi phí vận hành cố định/tháng (mặc định 0)
  vRate?: number;             // Buffer trống phòng dạng thập phân (0.10 = 10%)
  roomQualityFactors?: Record<string, number>; // key = roomId (string), hệ số chất lượng
}

export interface RoomPricingResult {
  roomId: number;
  roomNumber: string;
  area: number;
  effectiveM2: number;
  weight: number;
  roomFloor: number;                 // Giá sàn tối thiểu — cảnh báo nếu nhập thấp hơn
  suggestedMinPrice: number;
  suggestedPriceWithProfit: number;  // Giá gợi ý niêm yết (đã gồm lợi nhuận)
  belowFloor?: boolean;
  // Optional — BE trả kèm để hiển thị chi tiết phân bổ theo phòng
  rentShare?: number;            // tiền thuê phân bổ cho phòng
  renovationShare?: number;      // cải tạo phân bổ cho phòng
  equipmentShare?: number;       // thiết bị phân bổ cho phòng
  totalRentAmount?: number;
  totalRenovationCost?: number;
  totalEquipmentCost?: number;
  totalInvestment?: number;      // tổng vốn phòng (capex phòng)
  contractMonths?: number;
  monthlyBreakEven?: number;     // hoàn vốn/tháng của phòng
}

export interface PricingCalculationResponse {
  propertyId: number;
  pricingScope: PricingScope;
  mode?: PricingMode;
  cRent?: number;
  cRenovation?: number;
  cEquipment?: number;
  capex: number;                 // Tổng vốn đầu tư (thuê trả trước + cải tạo + thiết bị)
  contractMonths: number;
  monthlyRecovery: number;       // Hoàn vốn kế toán/tháng
  fixedOpex: number;             // Chi phí nền/tháng = oOperation + hoàn vốn
  revenueMin?: number;
  revenueTarget: number;         // Doanh thu mục tiêu khi lấp đầy 100% (đã cộng buffer)
  pDesired?: number;
  roiExpected?: number;
  oOperation?: number;
  vRate?: number;
  commonAreaM2?: number;
  totalWeight?: number;
  roomCount?: number;
  roomResults?: RoomPricingResult[];
  wholeHouseResult?: RoomPricingResult;
}

export interface PricingReconciliationResponse {
  propertyId: number;
  month: string;                 // YYYY-MM
  actualRevenue: number;
  occupancyRate: number;
  actualProfit: number;          // actualRevenue - fixedOpex
  actualCashFlow: number;        // actualRevenue - oOperation
  fixedOpex: number;
  revenueTarget: number;
  revenueTargetAtOccupancy: number;
  pDesired: number;
  profitTargetMet: boolean;
  revenueTargetMet: boolean;
}

// =============================================================================
// ONBOARDING SUMMARY — Tổng hợp cho Host xem
// =============================================================================

export interface OnboardingSummaryResponse {
  propertyId: number;
  propertyName: string;
  status: string;
  wholeHouse: boolean;
  hasRenovation: boolean;
  floorCount?: number;
  totalFloor?: number;
  roomsPerFloor: number;
  totalRooms: number;
  renovationCompleted: boolean;
  renovationStartDate?: string;
  renovationEndDate?: string;
  submittedToHostAt?: string;
  equipmentManifest: ManifestItemResponse[];
  renovationLines: RenovationLineResponse[];
  totalRenovationCost: number;
  inboundContract: InboundContractResponse;
  pricing: PricingResponse;
}

// =============================================================================
// HOST CONFIRM — Host xác nhận giá & kích hoạt
// =============================================================================

export interface HostRoomPrice {
  roomId: number;
  price: number;
}

export interface HostConfirmRequest {
  contingencyPercent: number;
  operationManagerId?: string;     // Optional — host tự gán sau từ trang chi tiết
  propertyPrice?: number;          // Nhà nguyên căn (ghi đè tay)
  roomPrices?: HostRoomPrice[];    // Nhà chia phòng
}

export interface HostConfirmRoomResult {
  roomId: number;
  roomNumber: string;
  price: number;
  adminSuggestedPrice: number;
  status: RoomStatus;
}

export interface HostConfirmResponse {
  propertyId: number;
  pricingScope: PricingScope;
  propertyStatus: string;
  hostContingencyPercent: number;
  operationManagerId: number;
  propertyPrice?: number;
  rooms?: HostConfirmRoomResult[];
}

// =============================================================================
// USER
// =============================================================================

export interface UserResponse {
  id: string; // UUID
  username: string;
  phoneNumber?: string;
  role: string;
  status: UserStatus;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  phoneNumber?: string;
  role: string;
  // Thông tin hồ sơ bổ sung theo từng vai trò (FE gửi kèm khi tạo).
  // LƯU Ý: BE /api/v1/user hiện chỉ lưu username/phoneNumber/role — xem doc/ để biết phần BE cần bổ sung.
  fullName?: string;
  email?: string;
  cccd?: string;
}

// =============================================================================
// LEGACY TYPES — Giữ lại để tránh lỗi build ở các trang cũ
// =============================================================================

export interface AddEquipmentRequest {
  roomId?: number;
  name: string;
  source: EquipmentSource;
  purchasePrice?: number;
  status?: EquipmentStatus;
  note?: string;
}

export interface EquipmentResponse {
  id: number;
  propertyId: number;
  roomId?: number;
  name: string;
  source: EquipmentSource;
  purchasePrice?: number;
  status?: EquipmentStatus;
  note?: string;
}

export interface AddRenovationRequest {
  roomId?: number;
  description: string;
  cost?: number;
  completed?: boolean;
}

export interface RenovationResponse {
  id: number;
  propertyId: number;
  roomId?: number;
  description: string;
  cost?: number;
  completed: boolean;
}

export interface CalculateDepreciationRequest {
  monthlyOperatingCost?: number;
}

export interface DepreciationResultResponse {
  id: number;
  propertyId: number;
  inboundContractId: number;
  pricingScope: PricingScope;
  roomId?: number;
  roomNumber?: string;
  totalRenovationCost: number;
  totalEquipmentCost: number;
  originalDeposit: number;
  totalInvestment: number;
  contractMonths: number;
  monthlyDepreciation: number;
  baseRent: number;
  monthlyOperatingCost: number;
  suggestedMinPrice: number;
  calculatedAt: string;
}

export interface DepreciationCalculationResponse {
  propertyId: number;
  pricingScope: PricingScope;
  wholeHouseResult?: DepreciationResultResponse;
  roomResults?: DepreciationResultResponse[];
}

export interface RoomPriceConfirm {
  roomId: number;
  price: number;
  deposit: number;
}

export interface ConfirmPropertyActivationRequest {
  propertyPrice?: number;
  propertyDeposit?: number;
  roomPrices?: RoomPriceConfirm[];
  hasOngoingRenovation?: boolean;
}

export interface ActivatedRoom {
  roomId: number;
  roomNumber: string;
  price: number;
  deposit: number;
  suggestedMinPrice: number;
  status: RoomStatus;
}

export interface PropertyActivationResponse {
  propertyId: number;
  pricingScope: PricingScope;
  propertyStatus: PropertyStatus;
  propertyPrice?: number;
  propertyDeposit?: number;
  suggestedMinPrice?: number;
  rooms?: ActivatedRoom[];
}

// =============================================================================
// PAGINATION (Spring Data Page)
// =============================================================================

export interface Page<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// =============================================================================
// TENANT ONBOARDING — Khách thuê + Hợp đồng thuê
// =============================================================================

/** Thành viên ở cùng (nguyên căn / hộ gia đình) */
export interface HouseholdMemberInput {
  fullName: string;
  relation?: string;
  phone?: string;
  dateOfBirth?: string; // yyyy-MM-dd
  cccd?: string;
}

// Nội thất trong phạm vi HĐ (phòng + khu vực chung, hoặc cả căn nếu nguyên căn) —
// GET /properties/{propertyId}/contract-available-equipments?roomId=. CHỈ để hiển thị
// read-only: BE tự gắn toàn bộ thiết bị ACTIVE vào HĐ, không còn checkbox chọn
// (FE-contract-equipment-auto.md 2026-07).
export interface ContractAvailableEquipmentItem {
  id: number;
  name: string;
  condition: string; // NEW | GOOD | DAMAGED | BROKEN
  quantity: number;
  scope?: 'ROOM' | 'SHARED'; // thiết bị của phòng hay khu vực chung
  roomNumber?: string;
  houseArea?: string;
}

export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  dateOfBirth?: string;      // ISO date (yyyy-MM-dd) — ngày sinh khách chính, BE lưu vào draftTenantDob/Tenant.dateOfBirth
  cccdIssueDate?: string;    // ISO date — ngày cấp CCCD (in trên PDF HĐ: ${tenantCccdIssueDate})
  cccdIssuePlace?: string;   // nơi cấp CCCD (${tenantCccdIssuePlace})
  permanentAddress?: string; // hộ khẩu thường trú (field mới 16/07, in trên PDF HĐ: HKTT ${tenantAddress})
  moveInDate: string;        // ISO date (yyyy-MM-dd)
  rentAmount: number;
  deposit: number;
  endDate?: string;          // optional
  roomConditionUrl?: string;
  // Nội thất có sẵn: KHÔNG còn field nào để gửi — BE tự gắn toàn bộ thiết bị ACTIVE
  // trong phạm vi HĐ và tự sinh equipmentSnapshot (FE-contract-equipment-auto.md 2026-07).
  // `selectedEquipmentIds`/`equipmentSnapshot` request đã bỏ hẳn khỏi type: gửi
  // selectedEquipmentIds=[] còn bị BE hiểu là "không gắn nội thất nào".

  // --- Onboarding v2: field mở rộng (khớp mobile OnboardTenantRequest) ---
  depositMonths?: number;
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterImageUrl?: string;
  waterMeterImageUrl?: string;
  roomConditionUrls?: string[];
  roomConditionNote?: string;
  householdMembers?: HouseholdMemberInput[];
  requireDepositPayment?: boolean;
  requireHostPriceApproval?: boolean;

  // --- DRAFT flow (admin tạo hợp đồng nháp trên web) ---
  draft?: boolean;                 // true = tạo HĐ ở trạng thái DRAFT (không giữ phòng, không tạo account)
  assignedManagerId?: string;      // manager sẽ đón khách (mặc định = operationManagerId của property)
  draftContractFileUrl?: string;   // link file HĐ đã điền admin upload (Cloudinary)
  expectedReceptionDate?: string;  // ngày dự kiến đón khách (yyyy-MM-dd)
}

export interface TenantContractResponse {
  id: number;
  propertyId: number;
  roomId?: number;
  roomNumber?: string;
  tenantUserId: string;      // UUID
  tenantFullName: string;
  tenantPhone: string;
  tenantCccd?: string;
  tenantDateOfBirth?: string; // ISO date (yyyy-MM-dd) — ngày sinh khách chính
  tenantCccdIssueDate?: string;  // ISO date — ngày cấp CCCD (field mới 15/07, in trên PDF HĐ)
  tenantCccdIssuePlace?: string; // nơi cấp CCCD
  tenantPermanentAddress?: string; // hộ khẩu thường trú (field mới 16/07)
  contractCode: string;
  rentAmount: number;
  deposit: number;
  moveInDate: string;
  startDate: string;
  endDate?: string;
  status: ContractStatus;
  // Text BE sinh cho PDF, vd "Giường (Tốt) x1, Tủ lạnh (Mới) x1" (+ dòng "Lắp thêm: ...").
  equipmentSnapshot?: string;
  // Nội thất HĐ — đều read-only, BE tự gắn toàn bộ EXISTING ACTIVE (FE-contract-equipment-auto.md):
  availableEquipmentList?: ContractAvailableEquipmentItem[]; // inventory nhà trong phạm vi HĐ
  selectedExistingIds?: number[];   // ID nội thất có sẵn đã gắn (≈ toàn bộ available)
  selectedEquipmentIds?: number[];  // field cũ — BE có thể còn trả, chỉ đọc
  equipmentList?: ContractAvailableEquipmentItem[]; // thiết bị đã gắn HĐ (EXISTING + ADDED)

  // --- Onboarding v2 ---
  paymentStatus?: string;          // PENDING | PAID | FAILED | CANCELLED
  depositMonths?: number;
  tenantUsername?: string;         // sau confirm — username khách (= SĐT)
  assignedManagerId?: string;
  assignedManagerName?: string;
  // File HĐ giờ là PDF (BE đổi từ DOCX 2026-07-14, xem FE-draft-contract-pdf.md);
  // HĐ tạo trước đó có thể còn trỏ file .docx cũ trên Cloudinary.
  draftContractFileUrl?: string;
  // BE map sẵn = draftContractFileUrl (fallback field cũ nếu có) — dùng field nào
  // cũng ra cùng 1 URL kể cả sau khi HĐ đã ACTIVE (BE không render file mới sau ký,
  // xem FE-tenant-draft-contract-document.md 2026-07-09).
  documentUrl?: string;
  pdfUrl?: string; // alias BE thêm 2026-07-14 — cùng URL với documentUrl/draftContractFileUrl
  // true khi đã có file lưu (draftContractFileUrl không null) — dùng để bật nút "Xem hợp đồng",
  // xem FE-view-contract.md. KHÔNG mở draftContractFileUrl/documentUrl trực tiếp, dùng
  // GET /tenant-contracts/{id}/document/download (tenantService.viewContractDocument) —
  // file mới trả application/pdf, HĐ cũ có thể trả DOCX, phân nhánh theo Content-Type.
  contractFileAvailable?: boolean;
  expectedReceptionDate?: string;
  priceApprovalStatus?: string;    // PENDING_PRICE_APPROVAL | APPROVED_AWAITING_DEPOSIT | PRICE_REJECTED
  householdMembers?: HouseholdMemberInput[];
  // Chấm dứt HĐ — tự động (NO_SHOW, BE cron quá 10 ngày sau moveInDate chưa kích
  // hoạt) hoặc thanh lý tay đều populate 3 field này.
  terminatedAt?: string;
  terminationReason?: string;
  terminationType?: 'EARLY_MOVE_OUT' | 'VIOLATION' | 'MUTUAL_AGREEMENT' | 'NO_SHOW' | 'OTHER';
}

// =============================================================================
// BULK IMPORT — Import onboarding hàng loạt từ Excel
// POST /api/v1/import/onboarding-excel  (xem doc excel-import-frontend.md)
// =============================================================================

/** 1 lỗi validate trong file Excel (sheet / dòng / cột / message) */
export interface BulkImportError {
  sheet: string;             // VD: "1. Hop_Dong_Thue"
  rowNumber: number;         // số dòng Excel (1-based, gồm header)
  contractCode: string | null;
  field: string | null;
  message: string;
}

/** Kết quả 1 căn nhà trong import (có cả ở dry-run lẫn import thật) */
export interface BulkImportContractResult {
  importStatus: 'IMPORTED' | 'SKIPPED';
  contractCode: string;
  propertyId: number | null;   // null khi dry-run hoặc skip không tra được
  propertyName: string | null;
  finalStatus: string | null;  // UNDER_RENOVATION | PENDING_HOST_REVIEW | ...
  message: string | null;      // lý do skip / ghi chú dry-run
}

/** Response HTTP 200 của endpoint import (cả dry-run lẫn import thật) */
export interface BulkImportResponse {
  dryRun: boolean;
  contractsProcessed: number;  // số HĐ import thành công (không tính SKIPPED)
  contractsSkipped: number;    // số HĐ bỏ qua (trùng mã / trùng địa chỉ)
  renovationLinesImported: number;
  equipmentRowsImported: number;
  results: BulkImportContractResult[];
  errors: BulkImportError[]; // luôn [] khi HTTP 200
}

// =============================================================================
// BƯỚC 2 — Gắn ảnh hàng loạt từ file ZIP
// POST /api/v1/import/property-images-zip  (xem import-hang-loat-cach-hoat-dong-va-luu-anh.md)
// =============================================================================

/** Kết quả gắn ảnh cho 1 căn (theo mã hợp đồng) khi import ZIP */
export interface BulkImportImageContractResult {
  /** ATTACHED = đã gán · PREVIEW = dryRun · NOT_FOUND = mã không có trong DB */
  status: 'ATTACHED' | 'PREVIEW' | 'NOT_FOUND' | 'NO_IMAGES';
  contractCode: string;
  propertyId: number | null;
  propertyName: string | null;
  imagesAttached: number;
  message: string | null;
}

/** Response của POST /api/v1/import/property-images-zip (dry-run lẫn thật) */
export interface BulkImportImagesResponse {
  dryRun: boolean;
  contractsInZip: number;     // số mã hợp đồng (folder con) trong zip
  contractsMatched: number;   // khớp căn trong DB
  contractsNotFound: number;  // có trong zip nhưng không có trong DB
  imagesAttached: number;     // tổng ảnh đã/sẽ gán
  results: BulkImportImageContractResult[];
  warnings: string[];
}

/**
 * Response khi xóa cứng 1 căn nhà — endpoint `/purge` hoặc rollback theo contractCode.
 * (DELETE /properties/{id} thường chỉ trả 204 No Content, không có body này.)
 */
export interface PropertyPurgeResponse {
  propertyId: number;
  propertyName: string;
  contractCode: string | null;
  equipmentsDeleted: number;
  equipmentManifestsDeleted: number;
  renovationLinesDeleted: number;
  renovationSessionsDeleted: number;
  roomsDeleted: number;
  depreciationResultsDeleted: number;
  monthlyReadingsDeleted: number;
}

// =============================================================================
// MAINTENANCE — Bảo trì / Sửa chữa (flow mới 17/07: PENDING → APPROVED →
// WAITING_TENANT_CONFIRM → CLOSED, nhánh REJECTED/CANCELLED; web chỉ giám sát)
// =============================================================================

export type MaintenanceRequestStatus =
  | 'PENDING' | 'APPROVED' | 'WAITING_TENANT_CONFIRM' | 'REJECTED' | 'CLOSED' | 'CANCELLED'
  // legacy trước migrate — normalizeMaintenanceStatus tự quy về bucket hiển thị
  | 'IN_PROGRESS' | 'RESOLVED';
export type MaintenanceRequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MaintenanceRequestCategory =
  | 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'APPLIANCE' | 'STRUCTURAL' | 'OTHER';

export interface MaintenanceTimelineEntry {
  // string vì timeline cũ còn chứa status legacy trước migrate
  oldStatus?: string;
  newStatus: string;
  note?: string;
  changedBy?: string;
  changedByName?: string;
  changedAt: string;
}

export interface MaintenanceRequestResponse {
  id: number;
  requestCode: string;
  /** Tiêu đề tenant nhập (field mới 17/07 chiều). */
  title?: string;
  status: MaintenanceRequestStatus;
  /** null khi PENDING — manager gán lúc duyệt. */
  category?: MaintenanceRequestCategory | null;
  /** null trừ khi manager gán lúc duyệt (tùy chọn). */
  priority?: MaintenanceRequestPriority | null;
  description: string;
  tenantId: number;
  tenantName: string;
  tenantPhone?: string;
  roomId: number;
  roomName: string;
  propertyId: number;
  propertyName: string;
  equipmentId?: number;
  equipmentName?: string;
  assignedManagerId?: number;
  assignedManagerName?: string;
  scheduledDate?: string;
  repairCost?: number;
  resolutionNote?: string;
  /** Ai chịu chi phí: HOST = tính vào expense nhà, TENANT = khách tự trả. */
  costPaidBy?: 'HOST' | 'TENANT';
  /** Số lần khách từ chối nghiệm thu (REOPENED) — đã đề nghị BE expose. */
  reopenCount?: number;
  resolvedAt?: string;
  images: string[];
  timeline: MaintenanceTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceDashboardResponse {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  cancelled: number;
  totalRepairCost: number;
}

// --- Equipment (lifecycle + maintenance history) ---

export type EquipmentLifecycleStatus = 'GOOD' | 'MAINTENANCE' | 'BROKEN' | 'DISPOSED';

export interface MaintenanceEquipmentResponse {
  id: number;
  equipmentName?: string;     // có thể null — fallback sang catalogName
  catalogName?: string;
  category?: string;
  houseArea?: string;
  source?: string;
  qrCode?: string;
  status: string;             // EquipmentStatus: NEW|GOOD|MAINTENANCE|BROKEN|DISPOSED
  roomId?: number;
  roomName?: string;
  roomNumber?: string;        // BE trả số/mã phòng (nhà chia phòng); "Toàn nhà" cho nguyên căn
  propertyId: number;
  installationDate?: string;
  warrantyExpiredDate?: string;
  maintenanceCount: number;
  lastMaintenanceDate?: string;
  // Trục hiện diện trong phòng (độc lập với status vật lý). ACTIVE = đang lắp · DISABLED = đã gỡ.
  operationalStatus?: 'ACTIVE' | 'DISABLED';
  disabledAt?: string;
  disabledReason?: string;
}

export interface EquipmentMaintenanceHistoryResponse {
  id: number;
  equipmentId: number;
  maintenanceRequestId: number;
  requestCode: string;
  maintenanceDate: string;
  repairCost?: number;
  note?: string;
}
