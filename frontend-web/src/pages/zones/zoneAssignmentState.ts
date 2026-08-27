import type { PropertyResponse } from '@/types/api.types';
import { isHostApproved } from '@/pages/host/properties/propertyListState';

/**
 * Gom nhà theo KHU VỰC (quận/huyện) để Host gán quản lý vận hành cho cả vùng
 * thay vì gán từng căn.
 *
 * Quy tắc nghiệp vụ đã chốt: **một quận chỉ có một quản lý**. Vì vậy quản lý của
 * một khu vực không phải dữ liệu riêng — nó chính là `operationManagerId` chung
 * của mọi nhà trong khu vực đó. Suy ngược ra như vậy nên màn này chạy được ngay
 * bằng API sẵn có, chưa cần BE lưu bảng quy tắc (xem doc/ về pha 2).
 *
 * Hệ quả: khu vực nào các nhà đang mang quản lý KHÁC nhau là di sản của thời gán
 * tay từng căn — Host phải chốt một người, đó là trạng thái `MIXED`.
 */

/** Ngưỡng cảnh báo tải của một quản lý. Chỉ cảnh báo, KHÔNG chặn Host. */
export const WARN_PROPERTIES_PER_MANAGER = 8;
export const WARN_ROOMS_PER_MANAGER = 40;

/**
 * BE chỉ chấp nhận `PATCH /properties/{id}/operation-manager` khi nhà ở một trong các
 * trạng thái này — ngoài ra trả lỗi *"Chỉ có thể gán/đổi Operation Manager khi nhà đang
 * PENDING_OPERATION_MANAGER, ACTIVE hoặc RENTED"*.
 *
 * Nhà đang cải tạo / vô hiệu vẫn THUỘC khu vực và vẫn hiện trong danh sách, nhưng phải
 * loại khỏi lô gán, nếu không cả cụm sẽ chết giữa chừng vì một căn.
 */
export const ASSIGNABLE_STATUSES = new Set(['PENDING_OPERATION_MANAGER', 'ACTIVE', 'RENTED']);

export const isAssignable = (p: PropertyResponse): boolean => ASSIGNABLE_STATUSES.has(p.status);

export type ZoneState =
  | 'UNASSIGNED' // chưa nhà nào có quản lý
  | 'ASSIGNED'   // mọi nhà cùng một quản lý — trạng thái đúng
  | 'PARTIAL'    // đã có một quản lý nhưng vài căn còn trống
  | 'MIXED';     // nhiều quản lý lẫn nhau — cần Host chốt

export interface ZoneGroup {
  zoneId: string;
  zoneName: string;
  /** MỌI nhà trong khu vực — kể cả nhà đang cải tạo/vô hiệu, để Host nhìn thấy đủ. */
  properties: PropertyResponse[];
  /** Số đơn vị cho thuê: nguyên căn = 1, chia phòng = số phòng. */
  units: number;
  /**
   * Trạng thái tính TRÊN NHÀ ĐỔI ĐƯỢC. Nhà đang cải tạo/vô hiệu không đổi được nên
   * không được để chúng khoá khu vực ở "Cần chốt" vĩnh viễn.
   */
  state: ZoneState;
  /** Quản lý của khu vực khi ASSIGNED/PARTIAL; với MIXED là người đang giữ nhiều nhà nhất. */
  managerId?: string;
  managerName?: string;
  /** Các quản lý đang xuất hiện trong khu vực (trên nhà đổi được), nhiều nhà nhất xếp trước. */
  managerBreakdown: { managerId: string; managerName: string; count: number }[];
  /** Số nhà đổi được nhưng chưa có quản lý. */
  unassignedCount: number;
  /** Số nhà đổi được (ACTIVE / RENTED / PENDING_OPERATION_MANAGER). */
  assignableCount: number;
  /** Số nhà KHÔNG đổi được lúc này (đang cải tạo, vô hiệu...). */
  blockedCount: number;
}

/** Đơn vị cho thuê của một nhà — nguyên căn tính 1, chia phòng tính theo số phòng. */
export const unitsOf = (p: PropertyResponse): number =>
  p.wholeHouse === true || !p.totalRooms ? 1 : p.totalRooms;

export const ZONE_STATE_META: Record<ZoneState, { label: string; cls: string; dot: string }> = {
  ASSIGNED:   { label: 'Đã gán',       cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  PARTIAL:    { label: 'Còn thiếu',    cls: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  UNASSIGNED: { label: 'Chưa gán',     cls: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400' },
  MIXED:      { label: 'Cần chốt',     cls: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500' },
};

/**
 * Nhà thuộc phạm vi màn Khu vực.
 *
 * Gồm nhà Host đã duyệt giá, **và** nhà admin vừa gửi Host duyệt (`PENDING_HOST_REVIEW`).
 *
 * Vì sao thêm nhóm chờ duyệt: quản lý được gán theo KHU VỰC, và nhà tự nhận người của khu
 * vực ngay khi Host bấm duyệt. Nếu màn này chỉ hiện nhà đã duyệt thì Host mở ra thấy
 * "Tổng khu vực 0" cho tới lúc duyệt xong căn đầu tiên — đúng lúc cần nhìn để biết khu vực
 * đó đã có ai chưa thì lại không thấy gì. Nhà chờ duyệt vẫn nằm trong khu vực và vẫn sẽ rơi
 * vào tay người đang giữ khu vực đó, nên nó thuộc về bức tranh này.
 *
 * Vẫn ẩn DRAFT và RENOVATION_COMPLETED: admin chưa gửi đi thì chưa có gì để Host quyết.
 *
 * Lưu ý: nhà `PENDING_HOST_REVIEW` KHÔNG nằm trong `ASSIGNABLE_STATUSES`, nên nó đếm vào
 * `blockedCount` và không tham gia quyết định `state` — đúng như mong muốn, vì BE chưa cho
 * gán quản lý lên nhà chưa duyệt.
 */
export const isZoneRelevant = (p: PropertyResponse): boolean =>
  isHostApproved(p) || p.status === 'PENDING_HOST_REVIEW';

/**
 * Gom danh sách nhà thành các khu vực. Phạm vi xem `isZoneRelevant`.
 */
export const groupByZone = (properties: PropertyResponse[]): ZoneGroup[] => {
  const byZone = new Map<string, PropertyResponse[]>();
  properties.filter(isZoneRelevant).forEach((p) => {
    const key = p.zoneId || '__none__';
    const list = byZone.get(key);
    if (list) list.push(p);
    else byZone.set(key, [p]);
  });

  const groups: ZoneGroup[] = [];
  byZone.forEach((props, zoneId) => {
    // Chỉ nhà đổi được mới quyết định trạng thái khu vực — xem chú thích ở ZoneGroup.state.
    const assignable = props.filter(isAssignable);
    const counts = new Map<string, { managerName: string; count: number }>();
    let unassignedCount = 0;

    assignable.forEach((p) => {
      if (!p.operationManagerId) {
        unassignedCount += 1;
        return;
      }
      const cur = counts.get(p.operationManagerId);
      if (cur) cur.count += 1;
      else counts.set(p.operationManagerId, { managerName: p.operationManagerName || '', count: 1 });
    });

    const managerBreakdown = [...counts.entries()]
      .map(([managerId, v]) => ({ managerId, managerName: v.managerName, count: v.count }))
      .sort((a, b) => b.count - a.count);

    let state: ZoneState;
    if (managerBreakdown.length === 0) state = 'UNASSIGNED';
    else if (managerBreakdown.length > 1) state = 'MIXED';
    else state = unassignedCount > 0 ? 'PARTIAL' : 'ASSIGNED';

    groups.push({
      zoneId,
      zoneName: props[0]?.zoneName || 'Chưa xác định khu vực',
      properties: props,
      units: props.reduce((sum, p) => sum + unitsOf(p), 0),
      state,
      managerId: managerBreakdown[0]?.managerId,
      managerName: managerBreakdown[0]?.managerName,
      managerBreakdown,
      unassignedCount,
      assignableCount: assignable.length,
      blockedCount: props.length - assignable.length,
    });
  });

  // Việc Host cần xử lý lên trước: cần chốt → còn thiếu → chưa gán → đã xong.
  const ORDER: Record<ZoneState, number> = { MIXED: 0, PARTIAL: 1, UNASSIGNED: 2, ASSIGNED: 3 };
  return groups.sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.zoneName.localeCompare(b.zoneName, 'vi'),
  );
};

/** Tải hiện tại của từng quản lý, gom trên toàn bộ khu vực. */
export interface ManagerLoad {
  zones: number;
  properties: number;
  units: number;
}

export const loadByManager = (groups: ZoneGroup[]): Map<string, ManagerLoad> => {
  const map = new Map<string, ManagerLoad>();
  const bump = (id: string) => {
    const cur = map.get(id) ?? { zones: 0, properties: 0, units: 0 };
    map.set(id, cur);
    return cur;
  };

  groups.forEach((g) => {
    const assignedProps = g.properties.filter((p) => p.operationManagerId);

    if (assignedProps.length > 0) {
      assignedProps.forEach((p) => {
        const cur = bump(p.operationManagerId as string);
        cur.properties += 1;
        cur.units += unitsOf(p);
      });
      // Đếm khu vực riêng để một quản lý phụ trách nhiều nhà cùng quận chỉ tính 1.
      new Set(assignedProps.map((p) => p.operationManagerId as string)).forEach((mid) => {
        bump(mid).zones += 1;
      });
      return;
    }

    /**
     * Chưa nhà nào mang `operationManagerId` nhưng khu vực ĐÃ có người phụ trách
     * (`g.managerId` được bù từ bảng `zone_managers` — xem `groups` ở ZoneOverview).
     *
     * Xảy ra ở đúng bước đầu quy trình: admin gửi nhà → Host gán quản lý khu vực → rồi
     * mới duyệt giá. Nhà chỉ nhận id quản lý SAU khi duyệt, nên nếu chỉ đếm theo
     * `operationManagerId` thì người vừa được gán vẫn hiện "chưa phụ trách khu vực nào" —
     * Host mở hộp thoại gán khu vực thứ hai, không thấy ai đang bận, dễ giao trùng một
     * người cho quá nhiều khu vực mà không hay.
     */
    if (g.managerId) {
      const cur = bump(g.managerId);
      cur.zones += 1;
      cur.properties += g.properties.length;
      cur.units += g.units;
    }
  });
  return map;
};

/** Những gì sẽ xảy ra nếu gán `managerId` cho khu vực — dùng để cho Host xem trước. */
export interface AssignPreview {
  /** Nhà đã do đúng người này phụ trách — không đụng tới. */
  unchanged: PropertyResponse[];
  /** Nhà chưa có quản lý — gán mới. */
  fresh: PropertyResponse[];
  /** Nhà đang do người khác phụ trách — bàn giao, kéo theo cả hợp đồng. */
  handover: PropertyResponse[];
  /** Nhà BE không cho đổi lúc này (đang cải tạo / vô hiệu) — bỏ khỏi lô, chỉ báo cho Host biết. */
  blocked: PropertyResponse[];
}

export const previewAssign = (group: ZoneGroup, managerId: string): AssignPreview => {
  const unchanged: PropertyResponse[] = [];
  const fresh: PropertyResponse[] = [];
  const handover: PropertyResponse[] = [];
  const blocked: PropertyResponse[] = [];
  group.properties.forEach((p) => {
    if (!isAssignable(p)) {
      // Chỉ tính là "vướng" khi nhà đó thực sự đang khác người — nhà cải tạo mà đã đúng
      // người rồi thì không có gì phải báo.
      if (p.operationManagerId !== managerId) blocked.push(p);
      return;
    }
    if (p.operationManagerId === managerId) unchanged.push(p);
    else if (!p.operationManagerId) fresh.push(p);
    else handover.push(p);
  });
  return { unchanged, fresh, handover, blocked };
};
