// ==========================================
//  TYPES - Web Admin Portal
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
  monthlyLeaseCost: number; // Tiền thuê nhà gốc trả cho chủ (VNĐ/tháng)
  managerName: string;    // Tên quản lý phụ trách
  managerPhone: string;   // SĐT quản lý
  rooms: Room[];          // Danh sách phòng
  createdAt: string;
}

/** Trạng thái tài khoản khách thuê */
export type TenantStatus = 'pending_activation' | 'active' | 'moved_out';

/** Thông tin khách thuê */
export interface Tenant {
  id: string;
  fullName: string;       // Họ và tên
  phone: string;          // Số điện thoại (cũng là username đăng nhập)
  cccd: string;           // Số CCCD
  email?: string;         // Email (tuỳ chọn)
  propertyId: string;     // ID nhà đang ở
  propertyName: string;   // Tên nhà
  roomId: string;         // ID phòng
  roomCode: string;       // Mã phòng (VD: P101)
  moveInDate: string;     // Ngày vào ở
  moveOutDate?: string;   // Ngày rời (nếu đã rời)
  status: TenantStatus;
  createdAt: string;
}
