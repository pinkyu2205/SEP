import { realPropertyService, ApiProperty, ApiRoom } from './propertyService.real';
import { realTenantService, TenantContractResponse } from './tenantService.real';
import { managerPropertyService } from './managerPropertyService';

/**
 * Adapter nối màn "Quản lý phòng" (RoomManageScreen) với backend Spring THẬT.
 * Gom 3 nguồn của BE về đúng shape UI đang dùng:
 *  - GET /properties                         → danh sách nhà của manager (scope theo JWT)
 *  - GET /properties/{id}/rooms              → phòng + giá/cọc/diện tích/trạng thái
 *  - GET /properties/{id}/tenant-contracts   → tên + SĐT khách thuê cho phòng đang RENTED
 *  - PATCH /properties/{id}/rooms/{rid}/status → đổi trạng thái vận hành
 *
 * Lưu ý các field BE CHƯA cấp (xem doc/ để biết phần BE cần bổ sung):
 *  - floor: suy ra từ số phòng (P101 → tầng 1). BE chưa trả tầng riêng.
 *  - electricityRate / waterRate theo phòng: chưa có endpoint manager → để optional, UI ẩn.
 *  - RoomStatus không có DISABLED → 'disabled' (Ngưng khai thác) map tạm sang DRAFT.
 */

// ── Trạng thái vận hành dùng trong UI ────────────────────────────────────────
export type OpStatus = 'available' | 'occupied' | 'maintenance' | 'disabled';

export interface OpProperty {
  id: string;            // String(propertyId) — dùng làm key + selection
  propertyId: number;    // id số để gọi API
  name: string;
  address: string;
  counts: OpRoomCounts;
}

export interface OpRoomCounts {
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  disabled: number;
}

export interface OpRoom {
  id: string;            // String(roomId) — key + selection trong UI
  roomId: number;        // id số để gọi API
  code: string;          // roomNumber
  floor: number;         // suy ra từ roomNumber
  area: number;
  maxOccupants: number;
  rentPrice: number;
  deposit: number;
  electricityRate?: number; // BE chưa cấp theo phòng — optional
  waterRate?: number;       // BE chưa cấp theo phòng — optional
  status: OpStatus;
  tenantName?: string;
  tenantPhone?: string;
}

// ── Mapping trạng thái BE <-> UI ─────────────────────────────────────────────
const toOpStatus = (s?: string): OpStatus => {
  switch ((s || '').toUpperCase()) {
    case 'AVAILABLE': return 'available';
    case 'RENTED': return 'occupied';
    case 'MAINTENANCE': return 'maintenance';
    default: return 'disabled'; // DRAFT / không xác định → ngưng khai thác
  }
};

// RoomStatus BE hợp lệ: DRAFT | AVAILABLE | RENTED | MAINTENANCE.
const toApiStatus = (op: OpStatus): string => {
  switch (op) {
    case 'available': return 'AVAILABLE';
    case 'occupied': return 'RENTED';
    case 'maintenance': return 'MAINTENANCE';
    case 'disabled': return 'DRAFT';
  }
};

// "P101" → 1, "203" → 2, "B12" → 1 (mặc định). Suy tầng từ chữ số trong mã phòng.
const deriveFloor = (roomNumber?: string): number => {
  const digits = (roomNumber || '').match(/\d+/)?.[0];
  if (!digits) return 1;
  const n = parseInt(digits, 10);
  return digits.length >= 3 ? Math.max(1, Math.floor(n / 100)) : 1;
};

const countByStatus = (rooms: ApiRoom[]): OpRoomCounts => ({
  total: rooms.length,
  available: rooms.filter(r => toOpStatus(r.status) === 'available').length,
  occupied: rooms.filter(r => toOpStatus(r.status) === 'occupied').length,
  maintenance: rooms.filter(r => toOpStatus(r.status) === 'maintenance').length,
  disabled: rooms.filter(r => toOpStatus(r.status) === 'disabled').length,
});

// Khoá để ghép hợp đồng khách thuê ACTIVE vào phòng (ưu tiên roomId, fallback roomNumber).
const activeTenantsByRoom = (contracts: TenantContractResponse[]) => {
  const byId = new Map<number, TenantContractResponse>();
  const byNumber = new Map<string, TenantContractResponse>();
  for (const c of contracts) {
    if ((c.status || '').toUpperCase() !== 'ACTIVE') continue;
    if (c.roomId != null) byId.set(c.roomId, c);
    if (c.roomNumber) byNumber.set(c.roomNumber, c);
  }
  return { byId, byNumber };
};

const mapProperty = (p: ApiProperty, rooms: ApiRoom[]): OpProperty => ({
  id: String(p.id),
  propertyId: p.id,
  name: p.propertyName,
  address: p.fullAddress || p.shortAddress || '',
  counts: countByStatus(rooms),
});

const mapRoom = (
  r: ApiRoom,
  tenant?: TenantContractResponse,
): OpRoom => ({
  id: String(r.id),
  roomId: r.id,
  code: r.roomNumber,
  floor: deriveFloor(r.roomNumber),
  area: r.area ?? 0,
  maxOccupants: r.maxOccupants ?? 0,
  rentPrice: r.price ?? 0,
  deposit: r.deposit ?? 0,
  status: toOpStatus(r.status),
  tenantName: tenant?.tenantFullName,
  tenantPhone: tenant?.tenantPhone,
});

export const roomOperationService = {
  /**
   * Danh sách nhà manager đang vận hành kèm số liệu phòng (cho màn chọn nhà).
   * Lấy rooms từng nhà để đếm trạng thái; 1 nhà lỗi không làm hỏng cả danh sách.
   */
  getProperties: async (): Promise<OpProperty[]> => {
    const scoped = await managerPropertyService.getScopedProperties();
    return Promise.all(
      scoped.map(async (p) => {
        try {
          const rooms = await realPropertyService.getRooms(p.id);
          return mapProperty(p, rooms);
        } catch {
          return mapProperty(p, []);
        }
      }),
    );
  },

  /** Danh sách phòng chi tiết của 1 nhà, kèm khách thuê hiện tại (nếu có). */
  getRooms: async (propertyId: number): Promise<OpRoom[]> => {
    const [rooms, contracts] = await Promise.all([
      realPropertyService.getRooms(propertyId),
      realTenantService.listByProperty(propertyId).catch(() => [] as TenantContractResponse[]),
    ]);
    const { byId, byNumber } = activeTenantsByRoom(contracts);
    return rooms.map(r => mapRoom(r, byId.get(r.id) ?? byNumber.get(r.roomNumber)));
  },

  /** Đổi trạng thái vận hành 1 phòng. */
  updateRoomStatus: async (propertyId: number, roomId: number, status: OpStatus): Promise<void> => {
    await realPropertyService.updateRoomStatus(propertyId, roomId, toApiStatus(status));
  },
};
