import api from './api';

/**
 * Gán quản lý vận hành theo KHU VỰC — bảng `zone_managers` phía BE.
 *
 * Trước 15/08/2026 FE phải tự xoay: gom nhà theo `zoneId` rồi gọi lặp
 * `PATCH /properties/{id}/operation-manager` cho từng căn. Cách đó không atomic —
 * đổi 8 nhà mà chết ở nhà thứ 5 là khu vực nửa nạc nửa mỡ, manager cũ còn 3 nhà.
 *
 * BE đã làm endpoint thật (verify trực tiếp 15/08/2026): một lệnh đổi cả khu vực,
 * tự cập nhật `operationManagerId` của mọi nhà bên trong + chuyển hợp đồng, và trả về
 * bản ghi bàn giao để FE biết đã ảnh hưởng bao nhiêu nhà / hợp đồng.
 */

/** Một khu vực đang có quản lý — `GET /api/v1/zones/assignments`. */
export interface ZoneAssignment {
  zoneId: string;
  zoneName: string;
  managerId: string;
  managerUsername: string;
  managerFullName: string;
  managerPhone?: string;
  /** Số nhà đang hoạt động trong khu vực (BE đếm sẵn). */
  activeProperties: number;
  assignedAt: string;
  assignedBy: string;
  assignedByUsername: string;
}

/** Một lần bàn giao khu vực — trả về khi PUT, và khi GET lịch sử. */
export interface ZoneHandover {
  id: number;
  zoneId: string;
  /** null = lần gán đầu tiên, khu vực trước đó chưa có ai. */
  fromManagerId: string | null;
  fromManagerUsername: string | null;
  toManagerId: string;
  toManagerUsername: string;
  affectedProperties: number;
  affectedContracts: number;
  changedBy: string;
  changedByUsername: string;
  changedAt: string;
}

/** Mốc phân công của MỘT tài khoản — dùng ở màn chi tiết người dùng. */
export interface UserAssignmentHistoryItem {
  zoneId: string;
  zoneName?: string;
  /** ASSIGNED = nhận khu vực · REVOKED = bị chuyển đi. */
  action?: string;
  at?: string;
  changedAt?: string;
  byUsername?: string;
  changedByUsername?: string;
  properties?: number;
  affectedProperties?: number;
}

/** Quản lý chưa phụ trách khu vực nào — `GET /api/v1/managers/idle`. */
export interface IdleManager {
  id: string;
  username: string;
  fullName?: string;
  phoneNumber?: string;
  status: string;
  /** Luôn 0 với danh sách này, BE trả kèm cho rõ nghĩa. */
  zoneCount: number;
}

export const zoneAssignmentService = {
  /** GET /api/v1/zones/assignments — mọi khu vực đang có quản lý. Quyền: ADMIN + OWNER. */
  list: (): Promise<ZoneAssignment[]> => api.get('/api/v1/zones/assignments'),

  /**
   * PUT /api/v1/zones/{zoneId}/manager — gán/đổi quản lý cho CẢ khu vực.
   * BE chạy trong một transaction: đổi bảng phân công + mọi nhà trong khu vực + hợp đồng.
   */
  assign: (zoneId: string, managerId: string): Promise<ZoneHandover> =>
    api.put(`/api/v1/zones/${zoneId}/manager`, { managerId }),

  /**
   * DELETE /api/v1/zones/{zoneId}/manager — GỠ quản lý, khu vực về "chưa gán".
   *
   * ⚠️ Nặng hơn vẻ ngoài của một nút gỡ. BE chạy hai lệnh dây chuyền:
   *   • Nhà: `operationManagerId = null`, và ACTIVE → **PENDING_OPERATION_MANAGER**
   *     (nhà rớt khỏi trạng thái đang khai thác).
   *   • Hợp đồng: `assignedManager = null` cho MỌI hợp đồng chưa TERMINATED — gồm cả
   *     hợp đồng đang có khách ở.
   *
   * Nên chỉ dùng khi thật sự chưa có người thay (quản lý nghỉ việc, tài khoản bị khoá).
   * Còn lại luôn ưu tiên `assign` sang người mới — khách không bị mất đầu mối liên hệ.
   */
  remove: (zoneId: string): Promise<void> =>
    api.delete(`/api/v1/zones/${zoneId}/manager`),

  /**
   * POST /api/v1/zones/manager-transfer — gán sang khu vực mới VÀ gỡ khỏi khu vực cũ trong
   * MỘT transaction (BE thêm 19/08/2026).
   *
   * Thay cho cách cũ phải gọi `assign` rồi `remove` nối tiếp: hai lệnh rời nhau, hỏng giữa
   * chừng là người đó vừa nhận chỗ mới vừa còn ôm chỗ cũ mà không ai biết.
   */
  transfer: (managerId: string, toZoneId: string, releaseZoneIds: string[]): Promise<ZoneHandover> =>
    api.post('/api/v1/zones/manager-transfer', { managerId, toZoneId, releaseZoneIds }),

  /** GET /api/v1/managers/idle — quản lý chưa phụ trách khu vực nào. Quyền: ADMIN + OWNER. */
  idleManagers: (): Promise<IdleManager[]> => api.get('/api/v1/managers/idle'),

  /** GET /api/v1/zones/{zoneId}/handovers — lịch sử bàn giao của một khu vực. */
  handovers: (zoneId: string): Promise<ZoneHandover[]> =>
    api.get(`/api/v1/zones/${zoneId}/handovers`),

  /** GET /api/v1/users/{userId}/assignment-history — các mốc phân công của một tài khoản. */
  userHistory: (userId: string): Promise<UserAssignmentHistoryItem[]> =>
    api.get(`/api/v1/users/${userId}/assignment-history`),
};
