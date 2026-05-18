import type {
  AuditLog,
  PlatformAccountStatus,
  PlatformBill,
  PlatformHostAccount,
  PlatformRole,
  PlatformUser,
  SuperAdminPermission,
} from '../types';
import {
  ALL_CONTRACTS,
  MOCK_EQUIPMENTS,
  MOCK_MAINTENANCE_REQUESTS,
  MOCK_PROPERTIES,
  MOCK_USERS,
} from './mockData';

export const SUPER_ADMIN_PERMISSIONS: Record<PlatformRole, {
  rank: number;
  label: string;
  scope: string;
  permissions: SuperAdminPermission[];
}> = {
  super_admin: {
    rank: 1,
    label: 'Super Admin',
    scope: 'Toàn hệ thống web, toàn bộ dữ liệu và cấu hình nền tảng',
    permissions: [
      'users.manage',
      'roles.manage',
      'hosts.approve',
      'buildings.monitor',
      'rooms.monitor',
      'billing.monitor',
      'contracts.monitor',
      'maintenance.monitor',
      'equipment.monitor',
      'settings.manage',
      'audit.view',
      'security.manage',
    ],
  },
  host: {
    rank: 2,
    label: 'Host/Admin System',
    scope: 'Chỉ quản lý buildings, managers, tenants, billing trong phạm vi được gán',
    permissions: [
      'buildings.monitor',
      'rooms.monitor',
      'billing.monitor',
      'contracts.monitor',
      'maintenance.monitor',
      'equipment.monitor',
    ],
  },
  manager: {
    rank: 3,
    label: 'Manager',
    scope: 'Chỉ quản lý buildings, rooms, tenants, maintenance được phân công',
    permissions: [
      'rooms.monitor',
      'billing.monitor',
      'contracts.monitor',
      'maintenance.monitor',
      'equipment.monitor',
    ],
  },
  tenant: {
    rank: 4,
    label: 'Tenant',
    scope: 'Chỉ truy cập dữ liệu cá nhân qua tenant app',
    permissions: [],
  },
};

export const PLATFORM_HOSTS: PlatformHostAccount[] = [
  {
    id: 'host-1',
    ownerName: 'Nguyễn Minh Khôi',
    businessName: 'UrbanNest Host',
    email: 'host@urbannest.vn',
    phone: '0909000001',
    status: 'active',
    buildings: 3,
    rooms: 18,
    managers: 2,
    tenants: 10,
    monthlyRevenue: 128000000,
    unpaidBills: 4,
    performanceScore: 92,
    registeredAt: '2025-10-15',
    lastActivityAt: '2026-05-18 09:12',
  },
  {
    id: 'host-2',
    ownerName: 'Trần Hoàng An',
    businessName: 'AnHouse System',
    email: 'ops@anhouse.vn',
    phone: '0909000002',
    status: 'pending_approval',
    buildings: 2,
    rooms: 26,
    managers: 1,
    tenants: 0,
    monthlyRevenue: 0,
    unpaidBills: 0,
    performanceScore: 0,
    registeredAt: '2026-05-16',
    lastActivityAt: '2026-05-18 08:44',
  },
  {
    id: 'host-3',
    ownerName: 'Lê Thanh Mai',
    businessName: 'MaiStay Rentals',
    email: 'admin@maistay.vn',
    phone: '0909000003',
    status: 'suspended',
    buildings: 5,
    rooms: 64,
    managers: 4,
    tenants: 41,
    monthlyRevenue: 356000000,
    unpaidBills: 11,
    performanceScore: 68,
    registeredAt: '2025-08-20',
    lastActivityAt: '2026-05-12 18:02',
  },
  {
    id: 'host-4',
    ownerName: 'Phạm Quốc Huy',
    businessName: 'Huy Residence',
    email: 'contact@huyresidence.vn',
    phone: '0909000004',
    status: 'active',
    buildings: 4,
    rooms: 42,
    managers: 3,
    tenants: 34,
    monthlyRevenue: 241000000,
    unpaidBills: 6,
    performanceScore: 85,
    registeredAt: '2025-12-08',
    lastActivityAt: '2026-05-18 07:39',
  },
];

export const PLATFORM_USERS: PlatformUser[] = [
  {
    id: 'sa-1',
    fullName: 'Super Admin',
    email: 'superadmin@roomrent.vn',
    phone: '0900000000',
    role: 'super_admin',
    status: 'active',
    assignedScope: 'Toàn nền tảng',
    lastLoginAt: '2026-05-18 09:32',
    createdAt: '2025-01-01',
  },
  ...PLATFORM_HOSTS.map(host => ({
    id: host.id,
    fullName: host.ownerName,
    email: host.email,
    phone: host.phone,
    role: 'host' as const,
    status: host.status,
    hostId: host.id,
    hostName: host.businessName,
    assignedScope: `${host.buildings} buildings, ${host.rooms} rooms`,
    lastLoginAt: host.lastActivityAt,
    createdAt: host.registeredAt,
  })),
  ...MOCK_USERS.map(user => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email ?? `${user.phone}@roomrent.local`,
    phone: user.phone,
    role: user.role,
    status: user.status === 'moved_out' ? 'inactive' as PlatformAccountStatus : 'active' as PlatformAccountStatus,
    hostId: 'host-1',
    hostName: 'UrbanNest Host',
    assignedScope: user.role === 'manager' ? 'Buildings được Host phân công' : 'Tenant app cá nhân',
    lastLoginAt: user.role === 'manager' ? '2026-05-18 08:15' : '2026-05-17 21:04',
    createdAt: user.createdAt,
  })),
];

export const PLATFORM_REVENUE_CHART = [
  { month: 'T12/2025', revenue: 520000000, paid: 488000000, unpaid: 32000000 },
  { month: 'T01/2026', revenue: 548000000, paid: 514000000, unpaid: 34000000 },
  { month: 'T02/2026', revenue: 586000000, paid: 552000000, unpaid: 34000000 },
  { month: 'T03/2026', revenue: 622000000, paid: 588000000, unpaid: 34000000 },
  { month: 'T04/2026', revenue: 673000000, paid: 626000000, unpaid: 47000000 },
  { month: 'T05/2026', revenue: 725000000, paid: 662000000, unpaid: 63000000 },
];

export const PLATFORM_OCCUPANCY_CHART = [
  { month: 'T12/2025', occupancy: 76, rooms: 122 },
  { month: 'T01/2026', occupancy: 79, rooms: 130 },
  { month: 'T02/2026', occupancy: 81, rooms: 138 },
  { month: 'T03/2026', occupancy: 83, rooms: 145 },
  { month: 'T04/2026', occupancy: 84, rooms: 150 },
  { month: 'T05/2026', occupancy: 86, rooms: 150 },
];

export const PLATFORM_USER_GROWTH_CHART = [
  { month: 'T12/2025', hosts: 8, managers: 19, tenants: 86 },
  { month: 'T01/2026', hosts: 9, managers: 23, tenants: 94 },
  { month: 'T02/2026', hosts: 10, managers: 28, tenants: 106 },
  { month: 'T03/2026', hosts: 11, managers: 31, tenants: 119 },
  { month: 'T04/2026', hosts: 12, managers: 34, tenants: 126 },
  { month: 'T05/2026', hosts: 14, managers: 38, tenants: 135 },
];

export const PLATFORM_ACTIVITY_CHART = [
  { day: '13/05', logins: 92, contracts: 12, payments: 41, maintenance: 9 },
  { day: '14/05', logins: 108, contracts: 18, payments: 56, maintenance: 12 },
  { day: '15/05', logins: 101, contracts: 10, payments: 49, maintenance: 7 },
  { day: '16/05', logins: 84, contracts: 8, payments: 35, maintenance: 6 },
  { day: '17/05', logins: 76, contracts: 5, payments: 28, maintenance: 4 },
  { day: '18/05', logins: 118, contracts: 15, payments: 62, maintenance: 13 },
];

export const PLATFORM_BILLS: PlatformBill[] = [
  { id: 'INV-2026-0518-001', hostName: 'UrbanNest Host', buildingName: 'Nhà Nguyễn Trãi', tenantName: 'Lê Thị B', amount: 5500000, status: 'overdue', paymentMethod: 'qr', issuedAt: '2026-05-01', dueDate: '2026-05-10' },
  { id: 'INV-2026-0518-002', hostName: 'UrbanNest Host', buildingName: 'Nhà Lê Văn Sỹ', tenantName: 'Hoàng Văn E', amount: 7200000, status: 'paid', paymentMethod: 'bank_transfer', issuedAt: '2026-05-01', dueDate: '2026-05-10' },
  { id: 'INV-2026-0518-003', hostName: 'MaiStay Rentals', buildingName: 'Mai Tower 1', tenantName: 'Đỗ Minh Tâm', amount: 6400000, status: 'pending', paymentMethod: 'card', issuedAt: '2026-05-05', dueDate: '2026-05-15' },
  { id: 'INV-2026-0518-004', hostName: 'Huy Residence', buildingName: 'Huy Residence Q7', tenantName: 'Võ Thị Linh', amount: 8100000, status: 'unpaid', paymentMethod: 'cash', issuedAt: '2026-05-08', dueDate: '2026-05-18' },
  { id: 'INV-2026-0518-005', hostName: 'MaiStay Rentals', buildingName: 'Mai Studio B', tenantName: 'Nguyễn Gia Bảo', amount: 4900000, status: 'overdue', paymentMethod: 'bank_transfer', issuedAt: '2026-05-03', dueDate: '2026-05-12' },
  { id: 'INV-2026-0518-006', hostName: 'UrbanNest Host', buildingName: 'Nhà Cách Mạng Tháng 8', tenantName: 'Bùi Văn H', amount: 4600000, status: 'paid', paymentMethod: 'qr', issuedAt: '2026-05-01', dueDate: '2026-05-10' },
  { id: 'INV-2026-0518-007', hostName: 'Huy Residence', buildingName: 'Huy House Thủ Đức', tenantName: 'Phan Bảo Ngọc', amount: 5900000, status: 'unpaid', paymentMethod: 'bank_transfer', issuedAt: '2026-05-05', dueDate: '2026-05-20' },
  { id: 'INV-2026-0518-008', hostName: 'MaiStay Rentals', buildingName: 'Mai Tower 2', tenantName: 'Trần Hải Nam', amount: 9300000, status: 'pending', paymentMethod: 'card', issuedAt: '2026-05-09', dueDate: '2026-05-19' },
];

export type PlatformContractStatus = 'pending' | 'active' | 'expired' | 'rejected' | 'terminated';

export interface PlatformContractRow {
  id: string;
  code: string;
  hostName: string;
  creatorName: string;
  creatorRole: 'Host' | 'Manager';
  contractType: string;
  buildingName: string;
  tenantOrManager: string;
  status: PlatformContractStatus;
  approvalHistory: string;
  createdAt: string;
  endDate: string;
}

export const PLATFORM_CONTRACTS: PlatformContractRow[] = [
  ...ALL_CONTRACTS.map(contract => ({
    id: contract.id,
    code: contract.code,
    hostName: 'UrbanNest Host',
    creatorName: contract.lessorName,
    creatorRole: contract.type === 'admin_manager' ? 'Host' as const : 'Manager' as const,
    contractType: contract.type === 'admin_manager' ? 'Host/Admin System - Manager' : 'Manager - Tenant',
    buildingName: contract.propertyName,
    tenantOrManager: contract.lesseeName,
    status: contract.status === 'pending_approval' ? 'pending' as const : contract.status === 'expiring_soon' ? 'active' as const : contract.status,
    approvalHistory: contract.status === 'pending_approval' ? 'Đang chờ Host phê duyệt' : 'Đã duyệt và đồng bộ',
    createdAt: contract.createdAt,
    endDate: contract.endDate,
  })),
  {
    id: 'sys-contract-1',
    code: 'HD-SYS-2025-099',
    hostName: 'MaiStay Rentals',
    creatorName: 'Lê Thanh Mai',
    creatorRole: 'Host',
    contractType: 'Host/Admin System - Manager',
    buildingName: 'Mai Tower 1',
    tenantOrManager: 'Đặng Quang Phúc',
    status: 'expired',
    approvalHistory: 'Tự động hết hạn ngày 30/04/2026',
    createdAt: '2025-04-30',
    endDate: '2026-04-30',
  },
  {
    id: 'sys-contract-2',
    code: 'HD-SYS-2026-REJ',
    hostName: 'Huy Residence',
    creatorName: 'Ngô Minh Long',
    creatorRole: 'Manager',
    contractType: 'Manager - Tenant',
    buildingName: 'Huy House Thủ Đức',
    tenantOrManager: 'Lâm Mỹ Duyên',
    status: 'rejected',
    approvalHistory: 'Super Admin ghi nhận Host từ chối do thiếu CCCD',
    createdAt: '2026-05-11',
    endDate: '2027-05-11',
  },
];

export const PLATFORM_BUILDINGS = [
  ...MOCK_PROPERTIES.map(property => ({
    id: property.id,
    hostName: 'UrbanNest Host',
    buildingName: property.name,
    address: property.address,
    managerName: property.managerName ?? 'Chưa phân công',
    totalRooms: property.rooms.length,
    occupiedRooms: property.rooms.filter(room => room.status === 'occupied').length,
    maintenanceRooms: property.rooms.filter(room => room.status === 'maintenance').length,
    monthlyRevenue: property.rooms.filter(room => room.status === 'occupied').reduce((sum, room) => sum + room.rentPrice, 0),
  })),
  { id: 'sys-building-1', hostName: 'MaiStay Rentals', buildingName: 'Mai Tower 1', address: '22 Phan Xích Long, Phú Nhuận, TP.HCM', managerName: 'Đặng Quang Phúc', totalRooms: 24, occupiedRooms: 19, maintenanceRooms: 2, monthlyRevenue: 142000000 },
  { id: 'sys-building-2', hostName: 'Huy Residence', buildingName: 'Huy Residence Q7', address: '88 Nguyễn Thị Thập, Quận 7, TP.HCM', managerName: 'Ngô Minh Long', totalRooms: 18, occupiedRooms: 16, maintenanceRooms: 1, monthlyRevenue: 99000000 },
  { id: 'sys-building-3', hostName: 'AnHouse System', buildingName: 'AnHouse Bình Thạnh', address: '15 Ung Văn Khiêm, Bình Thạnh, TP.HCM', managerName: 'Chờ duyệt Host', totalRooms: 26, occupiedRooms: 0, maintenanceRooms: 0, monthlyRevenue: 0 },
];

export const PLATFORM_EQUIPMENT_ROWS = [
  ...MOCK_EQUIPMENTS.map(equipment => ({
    id: equipment.id,
    code: equipment.code,
    name: equipment.name,
    hostName: 'UrbanNest Host',
    buildingName: equipment.propertyName,
    roomCode: equipment.roomCode ?? 'Khu chung',
    status: equipment.status,
    qrPayload: `roomrent://equipment/${equipment.code}`,
    lastUpdatedAt: equipment.createdAt,
  })),
  { id: 'eq-sys-1', code: 'EQ-MAI-CAM-02', name: 'Camera hành lang tầng 2', hostName: 'MaiStay Rentals', buildingName: 'Mai Tower 1', roomCode: 'Khu chung', status: 'maintenance', qrPayload: 'roomrent://equipment/EQ-MAI-CAM-02', lastUpdatedAt: '2026-05-12' },
  { id: 'eq-sys-2', code: 'EQ-HUY-PUMP-01', name: 'Máy bơm nước chính', hostName: 'Huy Residence', buildingName: 'Huy Residence Q7', roomCode: 'Kỹ thuật', status: 'good', qrPayload: 'roomrent://equipment/EQ-HUY-PUMP-01', lastUpdatedAt: '2026-05-01' },
];

export const PLATFORM_MAINTENANCE_REQUESTS = [
  ...MOCK_MAINTENANCE_REQUESTS.map(request => ({
    ...request,
    hostName: 'UrbanNest Host',
  })),
  {
    id: 'mr-sys-1',
    code: 'MR-SYS-2026-101',
    propertyId: 'sys-building-1',
    propertyName: 'Mai Tower 1',
    roomCode: 'P1203',
    title: 'Bình nóng lạnh không hoạt động',
    description: 'Tenant báo thiết bị không lên nguồn trong 2 ngày.',
    priority: 'high' as const,
    status: 'open' as const,
    reportedBy: 'Đỗ Minh Tâm',
    assignedManagerName: 'Đặng Quang Phúc',
    estimatedCost: 900000,
    reportedAt: '2026-05-17',
    createdAt: '2026-05-17',
    hostName: 'MaiStay Rentals',
  },
  {
    id: 'mr-sys-2',
    code: 'MR-SYS-2026-102',
    propertyId: 'sys-building-2',
    propertyName: 'Huy Residence Q7',
    roomCode: 'P0708',
    title: 'Cửa phòng bị lệch bản lề',
    description: 'Không đóng kín, cần sửa trước khi bàn giao khách mới.',
    priority: 'medium' as const,
    status: 'in_progress' as const,
    reportedBy: 'Võ Thị Linh',
    assignedManagerName: 'Ngô Minh Long',
    estimatedCost: 350000,
    reportedAt: '2026-05-15',
    createdAt: '2026-05-15',
    hostName: 'Huy Residence',
  },
];

export const AUDIT_LOGS: AuditLog[] = [
  { id: 'log-1', actor: 'Super Admin', role: 'super_admin', action: 'Đổi trạng thái Host', target: 'MaiStay Rentals: suspended', ipAddress: '118.69.12.45', severity: 'warning', createdAt: '2026-05-18 09:20' },
  { id: 'log-2', actor: 'Nguyễn Minh Khôi', role: 'host', action: 'Phê duyệt hợp đồng', target: 'HD-MT-2026-PA-001', ipAddress: '113.161.88.21', severity: 'normal', createdAt: '2026-05-18 08:58' },
  { id: 'log-3', actor: 'Trần Thị Quản', role: 'manager', action: 'Cập nhật bảo trì', target: 'MR-2026-006', ipAddress: '14.241.33.10', severity: 'normal', createdAt: '2026-05-18 08:31' },
  { id: 'log-4', actor: 'Unknown device', role: 'host', action: 'Đăng nhập thất bại 5 lần', target: 'ops@anhouse.vn', ipAddress: '45.77.88.91', severity: 'critical', createdAt: '2026-05-18 07:46' },
  { id: 'log-5', actor: 'Super Admin', role: 'super_admin', action: 'Cập nhật chính sách mật khẩu', target: 'Account Policy', ipAddress: '118.69.12.45', severity: 'normal', createdAt: '2026-05-17 17:05' },
  { id: 'log-6', actor: 'Lê Thanh Mai', role: 'host', action: 'Xuất báo cáo tài chính', target: 'MaiStay Rentals - T05/2026', ipAddress: '171.244.10.20', severity: 'warning', createdAt: '2026-05-17 16:22' },
];

export const SYSTEM_SETTINGS = [
  { id: 'billing', title: 'Quy tắc tính tiền', description: 'Giá dịch vụ, phí phạt trễ hạn, chu kỳ xuất hóa đơn', status: 'Đang áp dụng' },
  { id: 'payments', title: 'Phương thức thanh toán', description: 'QR, chuyển khoản, tiền mặt, thẻ và đối soát giao dịch', status: '4 phương thức' },
  { id: 'contracts', title: 'Mẫu hợp đồng', description: 'Template Host - Manager và Manager - Tenant toàn hệ thống', status: '6 mẫu' },
  { id: 'notifications', title: 'Thông báo', description: 'Email, in-app, nhắc thanh toán, nhắc hết hạn hợp đồng', status: 'Đã bật' },
  { id: 'accounts', title: 'Chính sách tài khoản', description: 'Mật khẩu, khóa tài khoản, phiên đăng nhập và MFA', status: 'Bảo mật cao' },
];
