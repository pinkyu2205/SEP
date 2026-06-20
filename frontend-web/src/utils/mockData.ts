import type { Property, Contract, Equipment, AppUser, Manager, MaintenanceRequest, PortalNotification } from '../types';

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

export const MOCK_USERS: AppUser[] = [
  { id: 'm1', fullName: 'Nguyễn Văn Quản', phone: '0901234567', cccd: '079200100100', email: 'quan.nv@hoangbinhland.vn', role: 'manager', status: 'active', createdAt: '2025-12-01' },
  { id: 'm2', fullName: 'Trần Thị Quản', phone: '0912345678', cccd: '079200100200', email: 'quan.tt@hoangbinhland.vn', role: 'manager', status: 'active', createdAt: '2026-01-15' },
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

export const MOCK_TENANTS = MOCK_USERS.filter(u => u.role === 'tenant');
export const MOCK_MANAGERS: Manager[] = MOCK_USERS.filter(u => u.role === 'manager').map(u => ({
  ...u,
  assignedPropertyIds: [] as string[],
  status: 'active' as const,
}));

export const MOCK_CONTRACTS: Contract[] = [
  // ========== Host ↔ Manager Contracts ==========
  {
    id: 'c-am-1', code: 'HD-AM-2026-001', type: 'admin_manager',
    lessorId: 'host', lessorName: 'Hoàng Bình Land',
    lesseeId: 'm1', lesseeName: 'Nguyễn Văn Quản', lesseeCccd: '079200100100', lesseePhone: '0901234567',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi',
    startDate: '2026-01-15', endDate: '2027-01-15',
    depositAmount: 50000000, rentAmount: 25000000, status: 'active',
    equipmentList: [
      { id: 'ceq1', name: 'Máy bơm nước tầng thượng', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'host' },
      { id: 'ceq2', name: 'Bình nước nóng Ariston 30L', quantity: 8, condition: 'Mới', source: 'host' },
      { id: 'ceq3', name: 'Cửa cuốn tầng trệt', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'host' },
    ],
    createdAt: '2026-01-14',
  },
  {
    id: 'c-am-2', code: 'HD-AM-2026-002', type: 'admin_manager',
    lessorId: 'host', lessorName: 'Hoàng Bình Land',
    lesseeId: 'm2', lesseeName: 'Trần Thị Quản', lesseeCccd: '079200100200', lesseePhone: '0912345678',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ',
    startDate: '2026-02-10', endDate: '2027-02-10',
    depositAmount: 70000000, rentAmount: 35000000, status: 'active',
    equipmentList: [
      { id: 'ceq4', name: 'Thang máy mini', quantity: 1, condition: 'Mới', source: 'host' },
      { id: 'ceq5', name: 'Camera an ninh', quantity: 4, condition: 'Mới', source: 'host' },
    ],
    createdAt: '2026-02-09',
  },
  {
    id: 'c-am-3', code: 'HD-AM-2026-003', type: 'admin_manager',
    lessorId: 'host', lessorName: 'Hoàng Bình Land',
    lesseeId: 'm1', lesseeName: 'Nguyễn Văn Quản', lesseeCccd: '079200100100', lesseePhone: '0901234567',
    propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8',
    startDate: '2026-03-05', endDate: '2027-03-05',
    depositAmount: 36000000, rentAmount: 18000000, status: 'active',
    equipmentList: [
      { id: 'ceq6', name: 'Máy bơm nước', quantity: 1, condition: 'Đã sử dụng - Tốt', source: 'host' },
    ],
    createdAt: '2026-03-04',
  },
  // ========== Manager ↔ Tenant Contracts ==========
  {
    id: 'c-mt-1', code: 'HD-MT-2026-001', type: 'manager_tenant',
    lessorId: 'm1', lessorName: 'Nguyễn Văn Quản',
    lesseeId: 't1', lesseeName: 'Trần Văn A', lesseeCccd: '079201001001', lesseePhone: '0901111001',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101',
    startDate: '2026-01-20', endDate: '2027-01-20',
    depositAmount: 3500000, rentAmount: 3500000, status: 'active',
    equipmentList: [
      { id: 'ceq7', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới', source: 'host' },
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
      { id: 'ceq11', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới', source: 'host' },
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
      { id: 'ceq13', name: 'Camera an ninh (chung)', quantity: 1, condition: 'Mới', source: 'host' },
      { id: 'ceq14', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới', source: 'manager' },
      { id: 'ceq15', name: 'Máy giặt Toshiba 8kg', quantity: 1, condition: 'Mới', source: 'manager' },
    ],
    createdAt: '2026-02-14',
  },
];

// Pending approval contracts (awaiting Host sign-off)
export const MOCK_PENDING_CONTRACTS: Contract[] = [
  {
    id: 'c-pa-1', code: 'HD-MT-2026-PA-001', type: 'manager_tenant',
    lessorId: 'm1', lessorName: 'Nguyễn Văn Quản',
    lesseeId: 't3', lesseeName: 'Phạm Văn C', lesseeCccd: '079201001003', lesseePhone: '0901111003',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r8', roomCode: 'P302',
    startDate: '2026-06-01', endDate: '2027-06-01',
    depositAmount: 3500000, rentAmount: 3500000, status: 'pending_approval',
    equipmentList: [],
    notes: 'Khách thuê mới — đã hoàn tất kiểm tra hồ sơ.',
    createdAt: '2026-05-14',
  },
  {
    id: 'c-pa-2', code: 'HD-MT-2026-PA-002', type: 'manager_tenant',
    lessorId: 'm2', lessorName: 'Trần Thị Quản',
    lesseeId: 't6', lesseeName: 'Vũ Thị F', lesseeCccd: '079201001006', lesseePhone: '0901111006',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r10', roomCode: 'P102',
    startDate: '2026-06-01', endDate: '2027-06-01',
    depositAmount: 3800000, rentAmount: 3800000, status: 'pending_approval',
    equipmentList: [],
    createdAt: '2026-05-09',
  },
  {
    id: 'c-pa-3', code: 'HD-MT-2026-PA-003', type: 'manager_tenant',
    lessorId: 'm1', lessorName: 'Nguyễn Văn Quản',
    lesseeId: 't8', lesseeName: 'Bùi Văn H', lesseeCccd: '079201001008', lesseePhone: '0901111008',
    propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8', roomId: 'r17', roomCode: 'P201',
    startDate: '2026-06-15', endDate: '2027-06-15',
    depositAmount: 3500000, rentAmount: 3500000, status: 'pending_approval',
    equipmentList: [],
    createdAt: '2026-05-14',
  },
];

export const ALL_CONTRACTS: Contract[] = [...MOCK_CONTRACTS, ...MOCK_PENDING_CONTRACTS];

export const MOCK_EQUIPMENTS: Equipment[] = [
  { id: 'eq1', code: 'EQ-101-AC', name: 'Điều hòa Daikin 9000BTU', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', purchaseDate: '2025-01-10', purchasePrice: 8500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq2', code: 'EQ-101-WM', name: 'Máy giặt Toshiba 8kg', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', purchaseDate: '2025-01-10', purchasePrice: 4500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq3', code: 'EQ-102-AC', name: 'Điều hòa Panasonic 9000BTU', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102', purchaseDate: '2025-01-10', purchasePrice: 8200000, status: 'maintenance', notes: 'Báo lỗi E4, thợ đang kiểm tra', createdAt: '2025-01-10' },
  { id: 'eq4', code: 'EQ-103-FR', name: 'Tủ lạnh Aqua 130L', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r3', roomCode: 'P103', purchaseDate: '2025-01-10', purchasePrice: 3200000, status: 'broken', notes: 'Không làm lạnh', createdAt: '2025-01-10' },
  { id: 'eq5', code: 'EQ-C-WM01', name: 'Máy giặt chung khu A', category: 'Điện lạnh', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', purchaseDate: '2025-01-10', purchasePrice: 7500000, status: 'good', createdAt: '2025-01-10' },
  { id: 'eq6', code: 'EQ-201-AC', name: 'Điều hòa Casper 9000BTU', category: 'Điện lạnh', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r7', roomCode: 'P201', purchaseDate: '2025-10-15', purchasePrice: 5500000, status: 'good', createdAt: '2025-10-15' },
];

// ==========================================
//  Maintenance Requests
// ==========================================
export const MOCK_MAINTENANCE_REQUESTS: MaintenanceRequest[] = [
  {
    id: 'mr-1', code: 'MR-2026-001',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102',
    title: 'Điều hòa báo lỗi E4 — không làm lạnh',
    description: 'Điều hòa phòng P102 hiển thị mã lỗi E4, không làm lạnh được. Khách thuê phản ánh nhiệt độ phòng vẫn cao dù đã bật điều hòa.',
    priority: 'high', status: 'in_progress',
    reportedBy: 'Lê Thị B',
    assignedManagerId: 'm1', assignedManagerName: 'Nguyễn Văn Quản',
    estimatedCost: 500000,
    reportedAt: '2026-04-28', createdAt: '2026-04-28',
  },
  {
    id: 'mr-2', code: 'MR-2026-002',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r5', roomCode: 'P202',
    title: 'Đường ống nước nhà vệ sinh bị rò rỉ',
    description: 'Ống nước nhà vệ sinh tầng 2 bị rò rỉ, gây thấm nước xuống sàn tầng dưới. Cần xử lý khẩn cấp để tránh hư hỏng thêm.',
    priority: 'critical', status: 'open',
    reportedBy: 'Nguyễn Văn Quản',
    assignedManagerId: 'm1', assignedManagerName: 'Nguyễn Văn Quản',
    estimatedCost: 2000000,
    reportedAt: '2026-05-10', createdAt: '2026-05-10',
  },
  {
    id: 'mr-3', code: 'MR-2026-003',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r13', roomCode: 'P301',
    title: 'Ổ cắm điện không có điện',
    description: 'Hai ổ cắm điện gắn tường trong phòng P301 không có điện. Có thể do cầu dao bị nhảy hoặc dây điện nội bộ bị hỏng.',
    priority: 'medium', status: 'open',
    reportedBy: 'Trần Thị Quản',
    assignedManagerId: 'm2', assignedManagerName: 'Trần Thị Quản',
    estimatedCost: 300000,
    reportedAt: '2026-05-08', createdAt: '2026-05-08',
  },
  {
    id: 'mr-4', code: 'MR-2026-004',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r4', roomCode: 'P201',
    title: 'Khóa cửa phòng bị kẹt',
    description: 'Khóa cửa phòng P201 khó mở, chìa khóa hay bị kẹt khi xoay. Khách thuê phản ánh phải mất nhiều thời gian để vào phòng.',
    priority: 'medium', status: 'resolved',
    reportedBy: 'Phạm Văn C',
    assignedManagerId: 'm1', assignedManagerName: 'Nguyễn Văn Quản',
    estimatedCost: 150000, actualCost: 120000,
    reportedAt: '2026-05-01', resolvedAt: '2026-05-03', createdAt: '2026-05-01',
  },
  {
    id: 'mr-5', code: 'MR-2026-005',
    propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8',
    title: 'Hệ thống đèn hành lang tầng 1 không sáng',
    description: 'Toàn bộ đèn hành lang tầng 1 bị tắt, nhiều bóng đèn có vẻ đã cháy. Ảnh hưởng đến sinh hoạt và an toàn ban đêm.',
    priority: 'low', status: 'open',
    reportedBy: 'Nguyễn Văn Quản',
    assignedManagerId: 'm1', assignedManagerName: 'Nguyễn Văn Quản',
    estimatedCost: 200000,
    reportedAt: '2026-05-12', createdAt: '2026-05-12',
  },
  {
    id: 'mr-6', code: 'MR-2026-006',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r9', roomCode: 'P101',
    title: 'Máy giặt rung lắc mạnh khi vắt',
    description: 'Máy giặt phòng P101 rung lắc rất mạnh trong chu trình vắt, gây tiếng ồn lớn làm phiền khách thuê các phòng xung quanh.',
    priority: 'low', status: 'in_progress',
    reportedBy: 'Hoàng Văn E',
    assignedManagerId: 'm2', assignedManagerName: 'Trần Thị Quản',
    estimatedCost: 400000,
    reportedAt: '2026-05-05', createdAt: '2026-05-05',
  },
  {
    id: 'mr-7', code: 'MR-2026-007',
    propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r3', roomCode: 'P103',
    title: 'Tủ lạnh ngừng hoạt động',
    description: 'Tủ lạnh phòng P103 đột ngột ngừng làm lạnh hoàn toàn, thực phẩm bên trong đang bị hỏng. Cần thợ kiểm tra khẩn.',
    priority: 'high', status: 'open',
    reportedBy: 'Nguyễn Văn Quản',
    assignedManagerId: 'm1', assignedManagerName: 'Nguyễn Văn Quản',
    estimatedCost: 1500000,
    reportedAt: '2026-05-13', createdAt: '2026-05-13',
  },
  {
    id: 'mr-8', code: 'MR-2026-008',
    propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ',
    title: 'Camera an ninh tầng 2 mất kết nối (Camera 3)',
    description: 'Camera số 3 đặt tại hành lang tầng 2 đã mất kết nối liên tục 3 ngày, không có hình ảnh giám sát. Cần kiểm tra hệ thống mạng và thiết bị.',
    priority: 'high', status: 'open',
    reportedBy: 'Trần Thị Quản',
    assignedManagerId: 'm2', assignedManagerName: 'Trần Thị Quản',
    estimatedCost: 800000,
    reportedAt: '2026-05-11', createdAt: '2026-05-11',
  },
];

// ==========================================
//  Portal Notifications
// ==========================================
export const MOCK_NOTIFICATIONS: PortalNotification[] = [
  { id: 'n-1', type: 'approval_needed', title: 'Hợp đồng chờ phê duyệt', message: 'HD-MT-2026-PA-001 do Nguyễn Văn Quản gửi lên đang chờ chữ ký phê duyệt của Host.', isRead: false, priority: 'high', relatedId: 'c-pa-1', createdAt: '2026-05-14T08:00:00Z' },
  { id: 'n-2', type: 'contract_expiry', title: 'Hợp đồng sắp hết hạn trong 3 ngày', message: 'HD-MT-2026-002 (Lê Thị B — Phòng P102) hết hạn ngày 15/05/2026. Cần xử lý gia hạn hoặc kết thúc hợp đồng.', isRead: false, priority: 'high', relatedId: 'c-mt-2', createdAt: '2026-05-12T09:00:00Z' },
  { id: 'n-3', type: 'maintenance_delay', title: 'Sự cố bảo trì khẩn cấp chưa xử lý', message: 'MR-2026-002 (Rò rỉ ống nước — Phòng P202, Nhà Nguyễn Trãi) đã mở 5 ngày chưa được giải quyết. Cần kiểm tra ngay.', isRead: false, priority: 'high', relatedId: 'mr-2', createdAt: '2026-05-13T10:00:00Z' },
  { id: 'n-4', type: 'unpaid_invoice', title: 'Cảnh báo hóa đơn chưa thu', message: 'Khách thuê Phạm Văn C (Phòng P201 — Nhà Nguyễn Trãi) có hóa đơn tiền thuê tháng 4/2026 quá hạn thanh toán.', isRead: false, priority: 'medium', createdAt: '2026-05-10T11:00:00Z' },
  { id: 'n-5', type: 'approval_needed', title: 'Hợp đồng chờ phê duyệt', message: 'HD-MT-2026-PA-003 do Nguyễn Văn Quản gửi lên đang chờ xác nhận của Host để hoàn tất quy trình nhận phòng.', isRead: false, priority: 'high', relatedId: 'c-pa-3', createdAt: '2026-05-14T12:00:00Z' },
  { id: 'n-6', type: 'approval_needed', title: 'Hợp đồng chờ phê duyệt', message: 'HD-MT-2026-PA-002 do Trần Thị Quản gửi lên cần được Host phê duyệt để tiếp tục quy trình bàn giao phòng.', isRead: true, priority: 'high', relatedId: 'c-pa-2', createdAt: '2026-05-09T08:00:00Z' },
  { id: 'n-7', type: 'occupancy_alert', title: 'Cảnh báo tỷ lệ lấp đầy thấp', message: 'Nhà Lê Văn Sỹ có tỷ lệ lấp đầy giảm xuống còn 67% — 2 phòng trống liên tục 14 ngày chưa có khách thuê mới.', isRead: true, priority: 'medium', relatedId: 'prop-2', createdAt: '2026-05-08T14:00:00Z' },
  { id: 'n-8', type: 'contract_expiry', title: 'Thông báo hết hạn hợp đồng Host – Quản lý', message: 'HD-AM-2026-001 (Nguyễn Văn Quản — Nhà Nguyễn Trãi) sẽ hết hạn sau 60 ngày vào ngày 15/01/2027. Nên chuẩn bị gia hạn sớm.', isRead: false, priority: 'low', relatedId: 'c-am-1', createdAt: '2026-05-07T09:00:00Z' },
  { id: 'n-9', type: 'maintenance_delay', title: 'Sự cố bảo trì chưa được xử lý — 7 ngày', message: 'MR-2026-003 (Ổ cắm điện không có điện — Phòng P301, Nhà Lê Văn Sỹ) đã tồn tại 7 ngày chưa được giải quyết.', isRead: true, priority: 'medium', relatedId: 'mr-3', createdAt: '2026-05-06T10:00:00Z' },
  { id: 'n-10', type: 'unpaid_invoice', title: 'Sắp đến hạn thanh toán tiền thuê nhà', message: 'Khoản thanh toán thuê nhà hàng tháng 35.000.000₫ cho Nhà Lê Văn Sỹ đến hạn trong 5 ngày. Vui lòng chuẩn bị thanh toán đúng hạn.', isRead: true, priority: 'low', createdAt: '2026-05-05T11:00:00Z' },
];
