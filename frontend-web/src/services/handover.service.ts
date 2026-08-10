import api from './api';

/**
 * TIẾN ĐỘ NHẬN NHÀ / GIAO PHÒNG — trang giám sát của Admin.
 *
 * Trả lời câu hỏi mentor nêu 07/08/2026 (ý 16): trên web không xem được manager đã tới
 * lấy phòng từ chủ nhà chưa, và đã giao phòng cho khách thuê chưa.
 *
 * BE: `AdminHandoverController` — `GET /api/v1/admin/handover-status` (ROLE_ADMIN).
 *   • không truyền `propertyId` → danh sách tóm tắt mọi toà, `rooms` = null
 *   • có `propertyId`          → chi tiết 1 toà, có `rooms[]`
 *
 * Hai mốc được suy ra từ dữ liệu vận hành sẵn có, không phải cột riêng:
 *   • Nhận nhà  ← `Property.status` chuyển sang ACTIVE (`managerAcceptedAt`)
 *   • Giao phòng ← hợp đồng khách thuê ACTIVE + ảnh hiện trạng + chỉ số điện/nước
 */

const ADMIN = '/api/v1/admin';

/** 1 phòng trong 1 toà — chỉ có ở lời gọi chi tiết. */
export interface RoomHandover {
  roomNumber: string;
  tenantName?: string | null;
  contractStatus?: string | null;   // DRAFT | PENDING | ACTIVE | TERMINATED | EXPIRED
  moveInDate?: string | null;       // YYYY-MM-DD
  activatedAt?: string | null;      // ISO-8601 — mốc HĐ có hiệu lực
  conditionPhotoCount?: number | null;
  hasMeterReadings?: boolean | null;
}

export interface HandoverStatus {
  propertyId: number;
  propertyName: string;
  propertyStatus: string;           // PropertyStatus của BE
  operationManagerName?: string | null;
  managerAcceptedAt?: string | null; // ISO-8601 — mốc manager nhận nhà từ host
  totalRooms?: number | null;
  roomsHandedOver?: number | null;
  rooms?: RoomHandover[] | null;
}

export const handoverService = {
  /** Bảng tóm tắt mọi toà. `rooms` luôn null ở đây — payload nhẹ. */
  list: async (): Promise<HandoverStatus[]> => {
    const { data } = await api.get<HandoverStatus[]>(`${ADMIN}/handover-status`);
    return data ?? [];
  },

  /** Chi tiết 1 toà, kèm `rooms[]`. */
  detail: async (propertyId: number): Promise<HandoverStatus> => {
    const { data } = await api.get<HandoverStatus>(`${ADMIN}/handover-status`, {
      params: { propertyId },
    });
    return data;
  },
};
