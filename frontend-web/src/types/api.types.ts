// ========================
// Enums (khớp 100% với Backend)
// ========================
export type RoomStatus = 'AVAILABLE' | 'RENTED' | 'MAINTENANCE';

export type RoomType = 'INDIVIDUAL_ROOM' | 'WHOLE_HOUSE';

export type UserRole = 'ROLE_ADMIN' | 'ROLE_OWNER' | 'ROLE_MANAGER' | 'ROLE_TENANT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

// ========================
// Auth
// ========================
export interface AuthRequest {
  username: string;
  password: string;
  phoneNumber?: string;  // Dùng khi đăng ký
  role?: string;         // Dùng khi đăng ký (VD: ROLE_TENANT)
}

export interface AuthResponse {
  token: string;
  username: string;
  role: string;
}

// ========================
// Zone
// ========================
export interface ZoneRequest {
  name: string;
  description?: string;
  level: number;       // 1 = Tỉnh/TP, 2 = Quận/Huyện, 3 = Phường/Xã
  parentId?: string | null;
}

export interface ZoneResponse {
  id: string;
  name: string;
  description?: string;
  level: number;
  parentId?: string;
  parentName?: string;
  fullName: string;
}

// Dashboard summary (từ PropertyController → /dashboard-summary)
export interface ZoneSummaryProjection {
  zoneId: string;
  zoneName: string;
  wholeHouseCount: number;
  roomBasedCount: number;
}

// ========================
// Room
// ========================
export interface RoomRequest {
  roomNumber: string;
  price: number;
  deposit: number;
  area: number;
}

export interface RoomResponse {
  id: string;
  roomNumber: string;
  price: number;
  deposit: number;
  area: number;
  status: RoomStatus;
  imageUrls: string;
}

// ========================
// Property
// ========================
export interface PropertyRequest {
  title: string;
  description: string;
  address: string;
  wholeHouse: boolean;
  electricityPrice: number;
  waterPrice: number;
  imageUrls: string;
  zoneId: string;
  authorizedOwnerName: string;
  defaultPrice?: number;
  defaultDeposit?: number;
  defaultArea?: number;
  rooms: RoomRequest[];
}

export interface PropertyResponse {
  id: string;
  title: string;
  description: string;
  address: string;
  isWholeHouse: boolean;
  totalRooms: number;
  electricityPrice: number;
  waterPrice: number;
  imageUrls: string;
  zoneId: string;
  zoneFullName: string;
  ownerId: string;
  rooms: RoomResponse[];
}

// ========================
// Pagination (Spring Data Page)
// ========================
export interface Page<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;        // current page (0-indexed)
  first: boolean;
  last: boolean;
  empty: boolean;
}
