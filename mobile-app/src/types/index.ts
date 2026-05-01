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
  roomId?: string; // Chỉ có nếu là Tenant
  createdAt: string;
}

export type UserRole = 'tenant' | 'manager' | 'admin';

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
export type RoomStatus = 'available' | 'occupied' | 'maintenance';

export interface Room {
  id: string;
  name: string; // VD: "Phòng 101"
  floor: number;
  area: number; // m²
  price: number; // Tiền phòng hàng tháng
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
  label: string; // "Tiền phòng", "Điện", "Nước", "Phí dịch vụ"
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
  month: number; // 1-12
  year: number;
  items: InvoiceItem[];
  totalAmount: number;
  outstandingBalance: number; // Dư nợ kỳ trước
  grandTotal: number; // totalAmount + outstandingBalance
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

// ======================== MAINTENANCE (Bảo trì) ========================
export type MaintenanceStatus = 'pending' | 'in_progress' | 'resolved';
export type MaintenanceCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';

export interface MaintenanceRequest {
  id: string;
  roomId: string;
  roomName: string;
  tenantId: string;
  tenantName: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  status: MaintenanceStatus;
  images: string[];
  repairCost?: number;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceRequest {
  title: string;
  description: string;
  category: MaintenanceCategory;
  images: string[]; // Base64 hoặc URI
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
  consumption: number; // currentReading - previousReading
  month: number;
  year: number;
  imageUrl?: string; // Ảnh chụp công tơ
  recordedBy: string;
  createdAt: string;
}

// ======================== EQUIPMENT (Trang thiết bị) ========================
export type EquipmentStatus = 'active' | 'damaged' | 'retired';

export interface Equipment {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  category: string;
  qrCode: string;
  status: EquipmentStatus;
  installedAt: string;
  lastMaintenanceAt?: string;
  notes?: string;
}

// ======================== NOTIFICATION ========================
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: 'invoice' | 'maintenance' | 'payment_reminder' | 'system';
  referenceId?: string; // ID hóa đơn hoặc maintenance request
  isRead: boolean;
  createdAt: string;
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
