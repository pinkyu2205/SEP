// =============================================================================
// ENUMS — khớp 100% với Backend enums (Inbound Onboarding v2)
// =============================================================================

export type PropertyStatus =
  | 'DRAFT'
  | 'UNDER_RENOVATION'
  | 'RENOVATION_COMPLETED'   // căn import từ Excel dừng ở đây — đã cải tạo xong, chờ định giá & gửi Host
  | 'PENDING_HOST_REVIEW'
  | 'ACTIVE'
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

export type ContractStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

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
  description?: string;
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
  // Legacy fields (giữ tương thích)
  deposit?: number;
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
// RENOVATION SESSION (BE mục 10 — grouped renovation history)
// =============================================================================

export interface RenovationSession {
  sessionNumber: number;
  startDate?: string;   // ISO date, may be null while in progress
  endDate?: string;     // ISO date, null if current session
  totalCost: number;
  lines: RenovationLineResponse[];
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

export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  moveInDate: string;        // ISO date (yyyy-MM-dd)
  rentAmount: number;
  deposit: number;
  endDate?: string;          // optional
  equipmentSnapshot?: string;
  roomConditionUrl?: string;
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
  contractCode: string;
  rentAmount: number;
  deposit: number;
  moveInDate: string;
  startDate: string;
  endDate?: string;
  status: ContractStatus;
  equipmentSnapshot?: string;
}
