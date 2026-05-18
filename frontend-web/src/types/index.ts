// ==========================================
//  TYPES - Host Management Portal (UrbanNest Sub-leasing Model)
// ==========================================

export type PlatformRole = 'super_admin' | 'host' | 'manager' | 'tenant';

export const ROLE_HIERARCHY: PlatformRole[] = ['super_admin', 'host', 'manager', 'tenant'];

export const ROLE_SCOPE_RULES: Record<PlatformRole, string> = {
  super_admin: 'Full access to every web module and all platform data',
  host: 'Manage only assigned buildings, managers, contracts, billing, and reports',
  manager: 'Manage only assigned buildings, rooms, tenants, maintenance, and bills',
  tenant: 'Access only personal information and tenant app services',
};

export type SuperAdminPermission =
  | 'users.manage'
  | 'roles.manage'
  | 'hosts.approve'
  | 'buildings.monitor'
  | 'rooms.monitor'
  | 'billing.monitor'
  | 'contracts.monitor'
  | 'maintenance.monitor'
  | 'equipment.monitor'
  | 'settings.manage'
  | 'audit.view'
  | 'security.manage';

export type PlatformAccountStatus =
  | 'pending_approval'
  | 'active'
  | 'inactive'
  | 'locked'
  | 'suspended'
  | 'rejected';

export interface PlatformUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: PlatformRole;
  status: PlatformAccountStatus;
  hostId?: string;
  hostName?: string;
  assignedScope?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface PlatformHostAccount {
  id: string;
  ownerName: string;
  businessName: string;
  email: string;
  phone: string;
  status: PlatformAccountStatus;
  buildings: number;
  rooms: number;
  managers: number;
  tenants: number;
  monthlyRevenue: number;
  unpaidBills: number;
  performanceScore: number;
  registeredAt: string;
  lastActivityAt: string;
}

export type PlatformBillStatus = 'paid' | 'unpaid' | 'overdue' | 'pending';

export interface PlatformBill {
  id: string;
  hostName: string;
  buildingName: string;
  tenantName: string;
  amount: number;
  status: PlatformBillStatus;
  paymentMethod: 'bank_transfer' | 'cash' | 'qr' | 'card';
  issuedAt: string;
  dueDate: string;
}

export type AuditSeverity = 'normal' | 'warning' | 'critical';

export interface AuditLog {
  id: string;
  actor: string;
  role: PlatformRole;
  action: string;
  target: string;
  ipAddress: string;
  severity: AuditSeverity;
  createdAt: string;
}

/** Trạng thái phòng */
export type RoomStatus = 'available' | 'occupied' | 'maintenance';

/** Thông tin một phòng */
export interface Room {
  id: string;
  code: string;
  floor: number;
  area: number;
  maxOccupants: number;
  rentPrice: number;
  deposit: number;
  electricityRate: number;
  waterRate: number;
  serviceCharge: number;
  status: RoomStatus;
  tenantName?: string;
}

/** Thông tin một căn nhà nguyên căn */
export interface Property {
  id: string;
  name: string;
  address: string;
  totalFloors: number;
  totalRooms: number;
  monthlyLeaseCost: number;
  deposit: number;
  managerId?: string;
  managerName?: string;
  rooms: Room[];
  createdAt: string;
}

/** Trạng thái tài khoản */
export type UserStatus = 'pending_activation' | 'active' | 'moved_out';

/** Thông tin người dùng (Host, Manager, Tenant) */
export interface AppUser {
  id: string;
  fullName: string;
  phone: string;
  cccd: string;
  email?: string;
  role: Exclude<PlatformRole, 'super_admin'>;
  status: UserStatus;
  createdAt: string;
  // Optional tenant-specific fields (populated when assigned to a room)
  propertyId?: string;
  propertyName?: string;
  roomId?: string;
  roomCode?: string;
  moveInDate?: string;
  moveOutDate?: string;
}

// Backward-compatible aliases
export type TenantStatus = UserStatus;
export type ManagerStatus = 'active' | 'inactive' | 'on_leave';
export type Tenant = AppUser;
export type Manager = Omit<AppUser, 'status'> & {
  assignedPropertyIds: string[];
  status: ManagerStatus;
};

/** Loại Hợp đồng */
export type ContractType = 'admin_manager' | 'manager_tenant';

/** Trạng thái Hợp đồng */
export type ContractStatus = 'pending_approval' | 'active' | 'expiring_soon' | 'terminated';

/** Thông tin Hợp đồng (2 tầng) */
export interface Contract {
  id: string;
  code: string;
  type: ContractType;

  lessorId: string;
  lessorName: string;

  lesseeId: string;
  lesseeName: string;
  lesseeCccd?: string;
  lesseePhone?: string;

  propertyId: string;
  propertyName: string;
  roomId?: string;
  roomCode?: string;

  startDate: string;
  endDate: string;
  depositAmount: number;
  rentAmount: number;

  equipmentList: ContractEquipment[];

  status: ContractStatus;
  notes?: string;
  createdAt: string;
}

/** Tài sản bàn giao trong Hợp đồng */
export interface ContractEquipment {
  id: string;
  name: string;
  quantity: number;
  condition: string;
  source: 'host' | 'manager';
}

/** Trạng thái Trang thiết bị */
export type EquipmentStatus = 'good' | 'broken' | 'maintenance' | 'disposed';

/** Thông tin Trang thiết bị */
export interface Equipment {
  id: string;
  code: string;
  name: string;
  category: string;
  propertyId: string;
  propertyName: string;
  roomId?: string;
  roomCode?: string;
  purchaseDate: string;
  purchasePrice: number;
  status: EquipmentStatus;
  notes?: string;
  createdAt: string;
}

// ==========================================
//  NEW TYPES - Host Management Portal
// ==========================================

export type MaintenancePriority = 'critical' | 'high' | 'medium' | 'low';
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export interface MaintenanceRequest {
  id: string;
  code: string;
  propertyId: string;
  propertyName: string;
  roomId?: string;
  roomCode?: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  reportedBy: string;
  assignedManagerId?: string;
  assignedManagerName?: string;
  estimatedCost?: number;
  actualCost?: number;
  reportedAt: string;
  resolvedAt?: string;
  createdAt: string;
}

export type NotificationType =
  | 'contract_expiry'
  | 'unpaid_invoice'
  | 'maintenance_delay'
  | 'occupancy_alert'
  | 'approval_needed';

export interface PortalNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  priority: 'high' | 'medium' | 'low';
  relatedId?: string;
  createdAt: string;
}
