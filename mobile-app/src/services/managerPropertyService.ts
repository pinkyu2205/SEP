import AsyncStorage from '@react-native-async-storage/async-storage';
import { realPropertyService, ApiProperty, ApiRoom } from './propertyService.real';
import { ManagedProperty, WholeHouseRentalStatus } from '../data/managedProperties';

/**
 * Adapter nối màn "Quản lý toà nhà" (BuildingListScreen) với backend Spring THẬT.
 * Lấy danh sách properties + rooms rồi map về shape ManagedProperty mà UI đang dùng,
 * để tận dụng lại toàn bộ helper (getPropPriority, getPriorityMeta, getIssueCount...).
 *
 * Lưu ý: các số liệu vận hành (hoá đơn quá hạn, chốt điện nước, hợp đồng sắp hết hạn)
 * chưa có endpoint riêng nên tạm để mặc định 0/false — xem doc/ để biết phần BE cần bổ sung.
 */

// "123 Nguyễn Trãi, Quận 5, TP.HCM" -> "Quận 5"
const pickDistrict = (addr?: string): string => {
  if (!addr) return '';
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '');
};

const wholeHouseStatus = (rooms: ApiRoom[], propStatus?: string): WholeHouseRentalStatus => {
  if (rooms.some(r => r.status === 'RENTED')) return 'rented';
  if (rooms.some(r => r.status === 'MAINTENANCE')) return 'maintenance';
  if (rooms.some(r => r.status === 'AVAILABLE')) return 'vacant';
  const s = (propStatus || '').toUpperCase();
  if (s.includes('RENT')) return 'rented';
  if (s.includes('MAINT')) return 'maintenance';
  return 'vacant';
};

const mapToManaged = (p: ApiProperty, rooms: ApiRoom[]): ManagedProperty => {
  const isWhole = p.wholeHouse === true;
  const occupied = rooms.filter(r => r.status === 'RENTED').length;
  const available = rooms.filter(r => r.status === 'AVAILABLE').length;
  const maintenance = rooms.filter(r => r.status === 'MAINTENANCE').length;
  const totalRooms = isWhole ? 0 : (rooms.length || p.totalRooms || 0);

  return {
    id: String(p.id),
    propertyType: isWhole ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
    name: p.propertyName,
    address: p.fullAddress || p.shortAddress || '',
    district: pickDistrict(p.fullAddress || p.shortAddress),
    totalFloors: 0,
    totalRooms,
    occupied,
    available,
    maintenance,
    monthlyLeaseCost: 0,
    electricityRate: 0,
    waterRate: 0,
    serviceCharge: 0,
    hostName: '',
    hasMaintenanceIssues: maintenance > 0,
    maintenanceCount: maintenance,
    hasUnpaidInvoices: false,
    unpaidCount: 0,
    missingUtility: false,
    hasExpiringContracts: false,
    expiringContractCount: 0,
    ...(isWhole
      ? { rentalStatus: wholeHouseStatus(rooms, p.status), monthlyRent: p.price }
      : {}),
  };
};

// Giải mã payload của JWT (base64url) -> object claims. Trả null nếu token không hợp lệ.
function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // atob + giải UTF-8 (username có dấu tiếng Việt vẫn parse được).
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Lấy ID manager đang đăng nhập từ JWT bằng cách "tự dò": tìm claim nào có giá trị
 * trùng với operationManagerId của một property bất kỳ. Nhờ vậy không cần biết tên
 * claim BE đặt (sub/userId/id/...). Trả null nếu không xác định được.
 */
function resolveManagerId(claims: Record<string, unknown> | null, properties: ApiProperty[]): string | null {
  if (!claims) return null;
  const claimValues = new Set(
    Object.values(claims).filter((v): v is string => typeof v === 'string'),
  );
  const id = properties.map((p) => p.operationManagerId).find((mid) => !!mid && claimValues.has(mid));
  return id ?? null;
}

export const managerPropertyService = {
  /**
   * Danh sách bất động sản của RIÊNG manager đang đăng nhập (host đã phân quyền),
   * kèm số liệu phòng. Lọc theo operationManagerId suy ra từ JWT.
   */
  getManagedProperties: async (): Promise<ManagedProperty[]> => {
    const token = await AsyncStorage.getItem('accessToken');
    const claims = token ? decodeJwtClaims(token) : null;

    const all = await realPropertyService.getProperties();
    const managerId = resolveManagerId(claims, all);

    // Lọc đúng nhà của manager. Nếu không xác định được id (vd JWT không chứa) thì
    // tạm hiện tất cả để không khoá người dùng — xem doc/ cho hướng xử lý triệt để (BE).
    const scoped = managerId ? all.filter((p) => p.operationManagerId === managerId) : all;
    if (!managerId) {
      console.warn('[managerProperties] Chưa xác định được managerId từ JWT — đang hiển thị tất cả. Claims:', claims);
    }

    return Promise.all(
      scoped.map(async (p) => {
        try {
          const rooms = await realPropertyService.getRooms(p.id);
          return mapToManaged(p, rooms);
        } catch {
          // Một property lỗi lấy rooms không nên làm hỏng cả danh sách.
          return mapToManaged(p, []);
        }
      }),
    );
  },
};
