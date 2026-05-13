import type { Property, Contract, Equipment, AppUser } from '../types';

/**
 * Dữ liệu mẫu cho Property & Room.
 * Manager tự tạo phòng sau khi cải tạo. Admin chỉ ghi số lượng phòng dự kiến.
 */
export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'prop-1',
    name: 'Nhà Nguyễn Trãi',
    address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
    totalFloors: 3,
    totalRooms: 8,
    monthlyLeaseCost: 25000000,
    deposit: 50000000,
    managerId: 'm1',
    managerName: 'Nguyễn Văn Quản',
    createdAt: '2026-01-15',
    rooms: [
      { id: 'r1', code: 'P101', floor: 1, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'occupied', tenantName: 'Trần Văn A' },
      { id: 'r2', code: 'P102', floor: 1, area: 18, maxOccupants: 2, rentPrice: 3200000, deposit: 3200000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'occupied', tenantName: 'Lê Thị B' },
      { id: 'r3', code: 'P103', floor: 1, area: 22, maxOccupants: 3, rentPrice: 3800000, deposit: 3800000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'available' },
      { id: 'r4', code: 'P201', floor: 2, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'occupied', tenantName: 'Phạm Văn C' },
      { id: 'r5', code: 'P202', floor: 2, area: 25, maxOccupants: 3, rentPrice: 4000000, deposit: 4000000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'maintenance' },
      { id: 'r6', code: 'P203', floor: 2, area: 18, maxOccupants: 2, rentPrice: 3200000, deposit: 3200000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'available' },
      { id: 'r7', code: 'P301', floor: 3, area: 30, maxOccupants: 4, rentPrice: 4500000, deposit: 4500000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'occupied', tenantName: 'Ngô Thị D' },
      { id: 'r8', code: 'P302', floor: 3, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, serviceCharge: 100000, status: 'available' },
    ],
  },
  {
    id: 'prop-2',
    name: 'Nhà Lê Văn Sỹ',
    address: '456 Lê Văn Sỹ, Quận 3, TP.HCM',
    totalFloors: 4,
    totalRooms: 6,
    monthlyLeaseCost: 35000000,
    deposit: 70000000,
    managerId: 'm2',
    managerName: 'Trần Thị Quản',
    createdAt: '2026-02-10',
    rooms: [
      { id: 'r9', code: 'P101', floor: 1, area: 22, maxOccupants: 2, rentPrice: 4000000, deposit: 4000000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'occupied', tenantName: 'Hoàng Văn E' },
      { id: 'r10', code: 'P102', floor: 1, area: 20, maxOccupants: 2, rentPrice: 3800000, deposit: 3800000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'available' },
      { id: 'r11', code: 'P201', floor: 2, area: 25, maxOccupants: 3, rentPrice: 4200000, deposit: 4200000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'occupied', tenantName: 'Vũ Thị F' },
      { id: 'r12', code: 'P202', floor: 2, area: 22, maxOccupants: 2, rentPrice: 4000000, deposit: 4000000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'occupied', tenantName: 'Đặng Văn G' },
      { id: 'r13', code: 'P301', floor: 3, area: 28, maxOccupants: 3, rentPrice: 4500000, deposit: 4500000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'maintenance' },
      { id: 'r14', code: 'P302', floor: 3, area: 20, maxOccupants: 2, rentPrice: 3800000, deposit: 3800000, electricityRate: 3800, waterRate: 16000, serviceCharge: 120000, status: 'available' },
    ],
  },
  {
    id: 'prop-3',
    name: 'Nhà Cách Mạng Tháng 8',
    address: '789 CMT8, Quận 10, TP.HCM',
    totalFloors: 2,
    totalRooms: 4,
    monthlyLeaseCost: 18000000,
    deposit: 36000000,
    managerId: 'm1',
    managerName: 'Nguyễn Văn Quản',
    createdAt: '2026-03-05',
    rooms: [
      { id: 'r15', code: 'P101', floor: 1, area: 18, maxOccupants: 2, rentPrice: 3000000, deposit: 3000000, electricityRate: 3500, waterRate: 15000, serviceCharge: 80000, status: 'occupied', tenantName: 'Bùi Văn H' },
      { id: 'r16', code: 'P102', floor: 1, area: 20, maxOccupants: 2, rentPrice: 3200000, deposit: 3200000, electricityRate: 3500, waterRate: 15000, serviceCharge: 80000, status: 'occupied', tenantName: 'Cao Thị I' },
      { id: 'r17', code: 'P201', floor: 2, area: 22, maxOccupants: 3, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, serviceCharge: 80000, status: 'available' },
      { id: 'r18', code: 'P202', floor: 2, area: 18, maxOccupants: 2, rentPrice: 3000000, deposit: 3000000, electricityRate: 3500, waterRate: 15000, serviceCharge: 80000, status: 'occupied', tenantName: 'Lý Văn K' },
    ],
  },
];

/**
 * Dữ liệu mẫu cho người dùng (Manager + Tenant).
 */
export const MOCK_USERS: AppUser[] = [
  // Managers
  { id: 'm1', fullName: 'Nguyễn Văn Quản', phone: '0901234567', cccd: '079200100100', email: 'quan.nv@example.com', role: 'manager', status: 'active', createdAt: '2025-12-01' },
  { id: 'm2', fullName: 'Trần Thị Quản', phone: '0912345678', cccd: '079200100200', email: 'quan.tt@example.com', role: 'manager', status: 'active', createdAt: '2026-01-15' },
  // Tenants
  { id: 't1', fullName: 'Trần Văn A', phone: '0901111001', cccd: '079201001001', email: 'tranvana@gmail.com', role: 'tenant', status: 'active', createdAt: '2026-01-18' },
  { id: 't2', fullName: 'Lê Thị B', phone: '0901111002', cccd: '079201001002', role: 'tenant', status: 'active', createdAt: '2026-01-30' },
  { id: 't3', fullName: 'Phạm Văn C', phone: '0901111003', cccd: '079201001003', role: 'tenant', status: 'active', createdAt: '2026-02-13' },
  { id: 't4', fullName: 'Ngô Thị D', phone: '0901111004', cccd: '079201001004', email: 'ngothid@gmail.com', role: 'tenant', status: 'active', createdAt: '2026-02-28' },
  { id: 't5', fullName: 'Hoàng Văn E', phone: '0901111005', cccd: '079201001005', role: 'tenant', status: 'active', createdAt: '2026-02-13' },
  { id: 't6', fullName: 'Vũ Thị F', phone: '0901111006', cccd: '079201001006', role: 'tenant', status: 'active', createdAt: '2026-02-28' },
  { id: 't7', fullName: 'Đặng Văn G', phone: '0901111007', cccd: '079201001007', email: 'dangvang@gmail.com', role: 'tenant', status: 'active', createdAt: '2026-03-08' },
  { id: 't8', fullName: 'Bùi Văn H', phone: '0901111008', cccd: '079201001008', role: 'tenant', status: 'active', createdAt: '2026-03-13' },
  { id: 't9', fullName: 'Cao Thị I', phone: '0901111009', cccd: '079201001009', role: 'tenant', status: 'active', createdAt: '2026-03-18' },
  { id: 't10', fullName: 'Lý Văn K', phone: '0901111010', cccd: '079201001010', role: 'tenant', status: 'active', createdAt: '2026-03-30' },
];

// Backward-compatible exports
export const MOCK_TENANTS = MOCK_USERS.filter(u => u.role === 'tenant');
export const MOCK_MANAGERS = MOCK_USERS.filter(u => u.role === 'manager').map(u => ({ ...u, assignedPropertyIds: [] as string[] }));

/**
 * Dữ liệu mẫu cho Hợp đồng (2 tầng).
 */
export const MOCK_CONTRACTS: Contract[] = [
  // ========== HĐ Admin ↔ Manager ==========
  {
    id: 'c-am-1', code: 'HD-AM-2026-001', type: 'admin_manager',
    lessorId: 'admin', lessorName: 'Chủ tịch A (Admin)',
    lesseeId: 'm1', lesseeName: 'Nguyễn Văn Quản', lesseeCccd: '079200100100', lesseePhone: '0901234567',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    startDate: '2026-01-15', endDate: '2027-01-15',
    depositAmount: 50000000, rentAmount: 25000000, status: 'active',
    equipmentList: [
      { id: 'ceq1', name: 'Máy bơm nước tầng thượng', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'admin' },
      { id: 'ceq2', name: 'Bình nước nóng Ariston 30L', quantity: 8, condition: 'Mới', source: 'admin' },
      { id: 'ceq3', name: 'Cửa cuốn tầng trệt', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'admin' },
    ],
    createdAt: '2026-01-14',
  },
  {
    id: 'c-am-2', code: 'HD-AM-2026-002', type: 'admin_manager',
    lessorId: 'admin', lessorName: 'Chủ tịch A (Admin)',
    lesseeId: 'm2', lesseeName: 'Trần Thị Quản', lesseeCccd: '079200100200', lesseePhone: '0912345678',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ',
    startDate: '2026-02-10', endDate: '2027-02-10',
    depositAmount: 70000000, rentAmount: 35000000, status: 'active',
    equipmentList: [
      { id: 'ceq4', name: 'Thang máy mini', quantity: 1, condition: 'Mới', source: 'admin' },
      { id: 'ceq5', name: 'Camera an ninh', quantity: 4, condition: 'Mới', source: 'admin' },
    ],
    createdAt: '2026-02-09',
  },
  {
    id: 'c-am-3', code: 'HD-AM-2026-003', type: 'admin_manager',
    lessorId: 'admin', lessorName: 'Chủ tịch A (Admin)',
    lesseeId: 'm1', lesseeName: 'Nguyễn Văn Quản', lesseeCccd: '079200100100', lesseePhone: '0901234567',
    propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8',
    startDate: '2026-03-05', endDate: '2027-03-05',
    depositAmount: 36000000, rentAmount: 18000000, status: 'active',
    equipmentList: [
      { id: 'ceq6', name: 'Máy bơm nước', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'admin' },
    ],
    createdAt: '2026-03-04',
  },
  // ========== HĐ Manager ↔ Tenant ==========
  {
    id: 'c-mt-1', code: 'HD-MT-2026-001', type: 'manager_tenant',
    lessorId: 'm1', lessorName: 'Nguyễn Văn Quản',
    lesseeId: 't1', lesseeName: 'Trần Văn A', lesseeCccd: '079201001001', lesseePhone: '0901111001',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101',
    startDate: '2026-01-20', endDate: '2027-01-20',
    depositAmount: 3500000, rentAmount: 3500000, status: 'active',
    equipmentList: [
      { id: 'ceq7', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới', source: 'admin' },
      { id: 'ceq8', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Mới', source: 'manager' },
      { id: 'ceq9', name: 'Giường 1m6 + Nệm', quantity: 1, condition: 'Mới', source: 'manager' },
      { id: 'ceq10', name: 'Tủ quần áo 2 cánh', quantity: 1, condition: 'Mới', source: 'manager' },
    ],
    createdAt: '2026-01-19',
  },
  {
    id: 'c-mt-2', code: 'HD-MT-2026-002', type: 'manager_tenant',
    lessorId: 'm1', lessorName: 'Nguyễn Văn Quản',
    lesseeId: 't2', lesseeName: 'Lê Thị B', lesseeCccd: '079201001002', lesseePhone: '0901111002',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102',
    startDate: '2026-02-01', endDate: '2026-05-15',
    depositAmount: 3200000, rentAmount: 3200000, status: 'expiring_soon',
    equipmentList: [
      { id: 'ceq11', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới', source: 'admin' },
      { id: 'ceq12', name: 'Điều hòa Panasonic 9000BTU', quantity: 1, condition: 'Mới', source: 'manager' },
    ],
    notes: 'Hợp đồng ngắn hạn',
    createdAt: '2026-01-30',
  },
  {
    id: 'c-mt-3', code: 'HD-MT-2026-003', type: 'manager_tenant',
    lessorId: 'm2', lessorName: 'Trần Thị Quản',
    lesseeId: 't5', lesseeName: 'Hoàng Văn E', lesseeCccd: '079201001005', lesseePhone: '0901111005',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r9', roomCode: 'P101',
    startDate: '2026-02-15', endDate: '2027-02-15',
    depositAmount: 4000000, rentAmount: 4000000, status: 'active',
    equipmentList: [
      { id: 'ceq13', name: 'Camera an ninh (chung)', quantity: 1, condition: 'Mới', source: 'admin' },
      { id: 'ceq14', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới', source: 'manager' },
      { id: 'ceq15', name: 'Máy giặt Toshiba 8kg', quantity: 1, condition: 'Mới', source: 'manager' },
    ],
    createdAt: '2026-02-14',
  },
];

/**
 * Dữ liệu mẫu cho Trang thiết bị (Equipment).
 */
export const MOCK_EQUIPMENTS: Equipment[] = [
  { id: 'eq1', code: 'EQ-101-AC', name: 'Điều hòa Daikin 9000BTU', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', purchaseDate: '2025-01-10', purchasePrice: 8500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq2', code: 'EQ-101-WM', name: 'Máy giặt Toshiba 8kg', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', purchaseDate: '2025-01-10', purchasePrice: 4500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq3', code: 'EQ-102-AC', name: 'Điều hòa Panasonic 9000BTU', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102', purchaseDate: '2025-01-10', purchasePrice: 8200000, status: 'maintenance', notes: 'Báo lỗi E4, thợ đang kiểm tra', createdAt: '2025-01-10' },
  { id: 'eq4', code: 'EQ-103-FR', name: 'Tủ lạnh Aqua 130L', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r3', roomCode: 'P103', purchaseDate: '2025-01-10', purchasePrice: 3200000, status: 'broken', notes: 'Không làm lạnh', createdAt: '2025-01-10' },
  { id: 'eq5', code: 'EQ-C-WM01', name: 'Máy giặt chung khu A', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', purchaseDate: '2025-01-10', purchasePrice: 7500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq6', code: 'EQ-201-AC', name: 'Điều hòa Casper 9000BTU', category: 'Điện lạnh', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r7', roomCode: 'P201', purchaseDate: '2025-10-15', purchasePrice: 5500000, status: 'good', createdAt: '2025-10-15' },
];

