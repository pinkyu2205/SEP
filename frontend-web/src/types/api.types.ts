// =============================================================================
// ENUMS — khớp 100% với Backend enums
// =============================================================================

export type PropertyStatus = 'DRAFT' | 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';

export type RoomStatus = 'DRAFT' | 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';

export type PropertyType = 'INDIVIDUAL_ROOM' | 'WHOLE_HOUSE';

export type PricingScope = 'WHOLE_HOUSE' | 'ROOM';

export type EquipmentSource = 'INITIAL_HANDOVER' | 'PURCHASED';

export type EquipmentStatus = 'NEW' | 'GOOD' | 'DAMAGED' | 'BROKEN';

export type ContractStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export type UserRole = 'ROLE_ADMIN' | 'ROLE_OWNER' | 'ROLE_MANAGER' | 'ROLE_TENANT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'DISABLE';

export type PhotoType = 'BEFORE' | 'AFTER';

export type UtilityType = 'ELECTRIC' | 'WATER';

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
// PROPERTY
// =============================================================================

export interface PropertyCreateRequest {
  propertyName: string;
  address: string;
  descriptions?: string;
  zoneId: string; // UUID
  wholeHouse: boolean;
  areaSize?: number;
  totalRooms?: number;
  managedBy?: number;
  imageUrls?: string[];
}

export interface PropertyResponse {
  id: number;
  propertyName: string;
  shortAddress: string;
  fullAddress: string;
  descriptions?: string;
  zoneId: string; // UUID
  zoneName: string;
  areaSize?: number;
  wholeHouse: boolean;
  totalRooms: number;
  status: string; // PropertyStatus
  price?: number;    // BigDecimal → number
  deposit?: number;  // BigDecimal → number
}

// =============================================================================
// ROOM
// =============================================================================

export interface AddRoomRequest {
  roomNumber: string;
  price?: number;
  deposit?: number;
  area: number;
  maxOccupants?: number;
  structureDescription?: string;
  imageUrls?: string;
  propertyType: PropertyType;
  electricMeterCode?: string;
  waterMeterCode?: string;
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
// EQUIPMENT
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

// =============================================================================
// RENOVATION
// =============================================================================

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

// =============================================================================
// INBOUND CONTRACT
// =============================================================================

export interface CreateInboundContractRequest {
  contractCode: string;
  ownerName: string;
  baseRentPrice: number;
  depositAmount: number;
  startDate: string; // ISO date: '2026-01-01'
  endDate: string;
  contractScanUrl?: string;
}

export interface InboundContractResponse {
  id: number;
  propertyId: number;
  contractCode: string;
  ownerName: string;
  baseRentPrice: number;
  depositAmount: number;
  startDate: string;
  endDate: string;
  contractScanUrl?: string;
  status: ContractStatus;
}

// =============================================================================
// DEPRECIATION
// =============================================================================

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

// =============================================================================
// PROPERTY ACTIVATION (CONFIRM GIÁ)
// =============================================================================

export interface RoomPriceConfirm {
  roomId: number;
  price: number;
  deposit: number;
}

export interface ConfirmPropertyActivationRequest {
  propertyPrice?: number;        // Nhà nguyên căn
  propertyDeposit?: number;      // Nhà nguyên căn
  roomPrices?: RoomPriceConfirm[]; // Nhà chia phòng
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
