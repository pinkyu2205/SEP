// ==========================================
//  TYPES - Web Admin Portal (Sub-leasing Model)
// ==========================================

/** Trạng thái phòng */
export type RoomStatus = 'available' | 'occupied' | 'maintenance';

/** Thông tin một phòng */
export interface Room {
  id: string;
  code: string;           // Mã phòng: VD "P101"
  floor: number;          // Tầng
  area: number;           // Diện tích (m²)
  maxOccupants: number;   // Sức chứa tối đa
  rentPrice: number;      // Giá thuê (VNĐ/tháng)
  deposit: number;        // Tiền cọc (VNĐ)
  electricityRate: number;// Đơn giá điện (VNĐ/kWh)
  waterRate: number;      // Đơn giá nước (VNĐ/m³)
  serviceCharge: number;  // Phí dịch vụ/tháng
  status: RoomStatus;
  tenantName?: string;    // Tên khách thuê hiện tại (nếu occupied)
}

/** Thông tin một căn nhà nguyên căn */
export interface Property {
  id: string;
  name: string;           // Tên tòa nhà: VD "Nhà Nguyễn Văn A"
  address: string;        // Địa chỉ
  totalFloors: number;    // Số tầng
  totalRooms: number;     // Số lượng phòng (Admin ghi, Manager tự tạo sau)
  monthlyLeaseCost: number; // Tiền thuê nhà gốc trả cho chủ (VNĐ/tháng)
  deposit: number;        // Tiền cọc nhà gốc
  managerId?: string;     // ID Manager đang thuê (liên kết qua HĐ)
  managerName?: string;   // Tên Manager (lấy từ HĐ, chỉ để hiển thị)
  rooms: Room[];          // Danh sách phòng (Manager tạo sau khi cải tạo)
  createdAt: string;
}

/** Trạng thái tài khoản */
export type UserStatus = 'pending_activation' | 'active' | 'moved_out';

/** Thông tin người dùng (dùng cho cả Manager và Tenant) */
export interface AppUser {
  id: string;
  fullName: string;       // Họ và tên
  phone: string;          // Số điện thoại (cũng là username đăng nhập)
  cccd: string;           // Số CCCD
  email?: string;         // Email (tuỳ chọn)
  role: 'admin' | 'manager' | 'tenant';
  status: UserStatus;
  createdAt: string;
}

// Backward-compatible aliases
export type TenantStatus = UserStatus;
export type ManagerStatus = 'active' | 'inactive';
export type Tenant = AppUser;
export type Manager = AppUser & {
  assignedPropertyIds: string[];
};

/** Loại Hợp đồng */
export type ContractType = 'admin_manager' | 'manager_tenant';

/** Trạng thái Hợp đồng */
export type ContractStatus = 'active' | 'expiring_soon' | 'terminated';

/** Thông tin Hợp đồng (2 tầng) */
export interface Contract {
  id: string;
  code: string;           // Mã HĐ, VD: HD-2026-001
  type: ContractType;     // Loại HĐ

  // Bên cho thuê (Admin hoặc Manager)
  lessorId: string;
  lessorName: string;

  // Bên thuê (Manager hoặc Tenant)
  lesseeId: string;
  lesseeName: string;
  lesseeCccd?: string;
  lesseePhone?: string;

  // Thông tin tài sản
  propertyId: string;
  propertyName: string;
  roomId?: string;        // Chỉ có nếu type = manager_tenant
  roomCode?: string;

  // Điều khoản
  startDate: string;
  endDate: string;
  depositAmount: number;
  rentAmount: number;
  
  // Tài sản bàn giao kèm HĐ
  equipmentList: ContractEquipment[];

  status: ContractStatus;
  notes?: string;
  createdAt: string;
}

/** Tài sản bàn giao trong Hợp đồng */
export interface ContractEquipment {
  id: string;
  name: string;           // Tên thiết bị (VD: "Điều hòa Daikin 9000BTU")
  quantity: number;       // Số lượng
  condition: string;      // Tình trạng (VD: "Mới", "Đã sử dụng - Tốt")
  source: 'admin' | 'manager'; // Ai bàn giao (Admin bàn giao nhà hoặc Manager thêm vào)
}

/** Trạng thái Trang thiết bị */
export type EquipmentStatus = 'good' | 'broken' | 'maintenance' | 'disposed';

/** Thông tin Trang thiết bị */
export interface Equipment {
  id: string;
  code: string;           // Mã QR Code của thiết bị (VD: EQ-101-AC)
  name: string;           // Tên thiết bị (VD: Điều hòa Daikin 9000BTU)
  category: string;       // Phân loại (VD: Điện lạnh, Nội thất, Vệ sinh...)
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
