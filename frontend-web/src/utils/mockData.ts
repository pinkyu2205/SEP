import type { Property, Tenant, Manager, Contract, Equipment } from '../types';

/**
 * Dữ liệu mẫu cho Property & Room.
 * Sẽ được thay bằng API call khi backend sẵn sàng.
 */
export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'prop-1',
    name: 'Nhà Nguyễn Trãi',
    address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
    totalFloors: 3,
    monthlyLeaseCost: 25000000,
    managerName: 'Nguyễn Văn Quản',
    managerPhone: '0901234567',
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
    monthlyLeaseCost: 35000000,
    managerName: 'Trần Thị Quản',
    managerPhone: '0912345678',
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
    monthlyLeaseCost: 18000000,
    managerName: 'Nguyễn Văn Quản',
    managerPhone: '0901234567',
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
 * Dữ liệu mẫu cho Khách thuê.
 */
export const MOCK_TENANTS: Tenant[] = [
  { id: 't1', fullName: 'Trần Văn A', phone: '0901111001', cccd: '079201001001', email: 'tranvana@gmail.com', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', moveInDate: '2026-01-20', status: 'active', createdAt: '2026-01-18' },
  { id: 't2', fullName: 'Lê Thị B', phone: '0901111002', cccd: '079201001002', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102', moveInDate: '2026-02-01', status: 'active', createdAt: '2026-01-30' },
  { id: 't3', fullName: 'Phạm Văn C', phone: '0901111003', cccd: '079201001003', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r4', roomCode: 'P201', moveInDate: '2026-02-15', status: 'active', createdAt: '2026-02-13' },
  { id: 't4', fullName: 'Ngô Thị D', phone: '0901111004', cccd: '079201001004', email: 'ngothid@gmail.com', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r7', roomCode: 'P301', moveInDate: '2026-03-01', status: 'active', createdAt: '2026-02-28' },
  { id: 't5', fullName: 'Hoàng Văn E', phone: '0901111005', cccd: '079201001005', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r9', roomCode: 'P101', moveInDate: '2026-02-15', status: 'active', createdAt: '2026-02-13' },
  { id: 't6', fullName: 'Vũ Thị F', phone: '0901111006', cccd: '079201001006', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r11', roomCode: 'P201', moveInDate: '2026-03-01', status: 'active', createdAt: '2026-02-28' },
  { id: 't7', fullName: 'Đặng Văn G', phone: '0901111007', cccd: '079201001007', email: 'dangvang@gmail.com', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ', roomId: 'r12', roomCode: 'P202', moveInDate: '2026-03-10', status: 'active', createdAt: '2026-03-08' },
  { id: 't8', fullName: 'Bùi Văn H', phone: '0901111008', cccd: '079201001008', propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8', roomId: 'r15', roomCode: 'P101', moveInDate: '2026-03-15', status: 'active', createdAt: '2026-03-13' },
  { id: 't9', fullName: 'Cao Thị I', phone: '0901111009', cccd: '079201001009', propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8', roomId: 'r16', roomCode: 'P102', moveInDate: '2026-03-20', status: 'active', createdAt: '2026-03-18' },
  { id: 't10', fullName: 'Lý Văn K', phone: '0901111010', cccd: '079201001010', propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8', roomId: 'r18', roomCode: 'P202', moveInDate: '2026-04-01', status: 'active', createdAt: '2026-03-30' },
  { id: 't11', fullName: 'Trương Văn L', phone: '0901111011', cccd: '079201001011', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r3', roomCode: 'P103', moveInDate: '2026-04-25', status: 'pending_activation', createdAt: '2026-04-24' },
  { id: 't12', fullName: 'Đinh Thị M', phone: '0901111012', cccd: '079201001012', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', moveInDate: '2025-06-01', moveOutDate: '2025-12-31', status: 'moved_out', createdAt: '2025-05-28' },
];

/**
 * Dữ liệu mẫu cho Quản lý (Manager).
 */
export const MOCK_MANAGERS: Manager[] = [
  { id: 'm1', fullName: 'Nguyễn Văn Quản', phone: '0901234567', email: 'quan.nv@example.com', status: 'active', assignedPropertyIds: ['prop-1', 'prop-3'], createdAt: '2025-12-01' },
  { id: 'm2', fullName: 'Trần Thị Quản', phone: '0912345678', email: 'quan.tt@example.com', status: 'active', assignedPropertyIds: ['prop-2'], createdAt: '2026-01-15' },
  { id: 'm3', fullName: 'Lê Văn Trợ', phone: '0923456789', status: 'inactive', assignedPropertyIds: [], createdAt: '2026-02-20' },
];

/**
 * Dữ liệu mẫu cho Hợp đồng (Contract).
 */
export const MOCK_CONTRACTS: Contract[] = [
  { id: 'c1', code: 'HD-2026-001', tenantId: 't1', tenantName: 'Trần Văn A', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', startDate: '2026-01-20', endDate: '2027-01-20', depositAmount: 3500000, rentAmount: 3500000, status: 'active', createdAt: '2026-01-19' },
  { id: 'c2', code: 'HD-2026-002', tenantId: 't2', tenantName: 'Lê Thị B', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r2', roomCode: 'P102', startDate: '2026-02-01', endDate: '2026-05-15', depositAmount: 3200000, rentAmount: 3200000, status: 'expiring_soon', notes: 'Hợp đồng ngắn hạn', createdAt: '2026-01-30' },
  { id: 'c3', code: 'HD-2025-099', tenantId: 't12', tenantName: 'Đinh Thị M', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', roomId: 'r1', roomCode: 'P101', startDate: '2025-06-01', endDate: '2025-12-31', depositAmount: 3500000, rentAmount: 3500000, status: 'terminated', notes: 'Khách dọn đi đúng hạn', createdAt: '2025-05-28' },
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
