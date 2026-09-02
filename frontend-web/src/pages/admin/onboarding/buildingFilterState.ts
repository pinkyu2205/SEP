/**
 * State lọc / sắp xếp / phân trang cho danh sách tòa nhà — dùng chung cho
 * 2 module "Khởi tạo nhà" và "Cấu hình khai thác".
 *
 * Tách khỏi BuildingFilters.tsx để file .tsx chỉ export component — điều kiện
 * để React Fast Refresh hot-reload được (xem cảnh báo "export is incompatible").
 */
import { useEffect, useMemo, useState } from 'react';
import type { PropertyResponse } from '@/types/api.types';

/** 2 bước của quy trình tiếp nhận nhà — dùng cho stepper ở đầu trang. */
export const ONBOARDING_STEPS = [
  { label: 'Khởi tạo nhà', to: '/admin/buildings/draft' },
  { label: 'Cấu hình khai thác', to: '/admin/buildings/configuration' },
];

// ─── Bỏ dấu tiếng Việt để tìm kiếm "thu duc" ra "Thủ Đức" ───────────────────
export const normalizeVi = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

export type SortKey =
  | 'newest' | 'oldest' | 'name' | 'name_desc'
  | 'rooms_desc' | 'rooms_asc' | 'area_desc'
  | 'lease_soon';

export const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Mới thêm gần nhất',
  oldest: 'Thêm sớm nhất',
  name: 'Tên A → Z',
  name_desc: 'Tên Z → A',
  rooms_desc: 'Nhiều phòng nhất',
  rooms_asc: 'Ít phòng nhất',
  area_desc: 'Diện tích lớn nhất',
  lease_soon: 'HĐ chủ nhà sắp hết hạn',
};

export type TypeFilter = 'all' | 'whole' | 'rooms' | 'unset';
export type RenovationFilter = 'all' | 'done' | 'in_progress' | 'none';
export type ManagerFilter = 'all' | 'assigned' | 'unassigned';
export type ViewMode = 'grid' | 'table';

export const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'Tất cả', whole: 'Nhà nguyên căn', rooms: 'Phòng trọ', unset: 'Chưa chọn loại',
};
export const RENO_LABEL: Record<RenovationFilter, string> = {
  all: 'Tất cả', done: 'Đã cải tạo xong', in_progress: 'Đang cải tạo', none: 'Không cải tạo',
};
export const MANAGER_LABEL: Record<ManagerFilter, string> = {
  all: 'Tất cả', assigned: 'Đã gán quản lý', unassigned: 'Chưa gán quản lý',
};

export interface StatusOption {
  value: string;
  label: string;
  /** class màu cho chip khi được chọn — mặc định indigo */
  cls?: string;
}

export const GRID_SIZES = [9, 18, 36];
export const TABLE_SIZES = [10, 25, 50];

export interface BuildingFilters {
  search: string; setSearch: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  /** Bật = chỉ hiện các tòa nhà `needsAttention` trả true. */
  attention: boolean; setAttention: (v: boolean) => void;
  /** Số tòa nhà đang cần xử lý (tính trên TOÀN danh sách, không theo bộ lọc). */
  attentionCount: number;
  zone: string; setZone: (v: string) => void;
  type: TypeFilter; setType: (v: TypeFilter) => void;
  renovation: RenovationFilter; setRenovation: (v: RenovationFilter) => void;
  manager: ManagerFilter; setManager: (v: ManagerFilter) => void;
  sortBy: SortKey; setSortBy: (v: SortKey) => void;
  view: ViewMode; setView: (v: ViewMode) => void;
  perPage: number; setPerPage: (v: number) => void;
  page: number; setPage: (v: number) => void;
  totalPages: number;
  /** toàn bộ danh sách sau khi lọc + sắp xếp */
  filtered: PropertyResponse[];
  /** phần tử của trang hiện tại */
  paged: PropertyResponse[];
  /** số lượng theo từng trạng thái (dùng cho chip) */
  statusCounts: Record<string, number>;
  zoneOptions: string[];
  activeCount: number;
  reset: () => void;
  total: number;
}

/**
 * @param effectiveStatus map 1 tòa nhà → mã trạng thái dùng để lọc.
 *        Mặc định là `b.status`; màn "Khởi tạo nhà" override để tách
 *        nhóm INITIALIZED (đánh dấu FE-side).
 * @param needsAttention "căn này còn việc phải làm". Tách khỏi `status` vì hai
 *        thứ CẮT NHAU chứ không loại trừ nhau: một căn vừa "Đã khởi tạo" vừa
 *        sắp hết hạn HĐ chủ nhà — nhét vào cùng một ô trạng thái thì mất một
 *        trong hai thông tin. Không truyền → bộ lọc này tắt hẳn.
 */
export const useBuildingFilters = (
  buildings: PropertyResponse[],
  opts: {
    storageKey: string;
    effectiveStatus?: (b: PropertyResponse) => string;
    needsAttention?: (b: PropertyResponse) => boolean;
  },
): BuildingFilters => {
  const { storageKey, effectiveStatus, needsAttention } = opts;
  const statusOf = effectiveStatus ?? ((b: PropertyResponse) => b.status);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [attention, setAttention] = useState(false);
  const [zone, setZone] = useState('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [renovation, setRenovation] = useState<RenovationFilter>('all');
  const [manager, setManager] = useState<ManagerFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [view, setViewRaw] = useState<ViewMode>(
    () => (localStorage.getItem(`${storageKey}:view`) as ViewMode) || 'grid'
  );
  const [perPage, setPerPage] = useState(view === 'table' ? TABLE_SIZES[0] : GRID_SIZES[0]);
  const [page, setPage] = useState(1);

  // Đổi kiểu xem → nhớ lựa chọn + đưa số dòng/trang về mặc định của kiểu đó.
  const setView = (v: ViewMode) => {
    setViewRaw(v);
    localStorage.setItem(`${storageKey}:view`, v);
    setPerPage(v === 'table' ? TABLE_SIZES[0] : GRID_SIZES[0]);
  };

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = { all: buildings.length };
    buildings.forEach(b => {
      const k = statusOf(b);
      acc[k] = (acc[k] ?? 0) + 1;
    });
    return acc;
  }, [buildings, effectiveStatus]);

  const attentionCount = useMemo(
    () => (needsAttention ? buildings.filter(needsAttention).length : 0),
    [buildings, needsAttention]
  );

  const zoneOptions = useMemo(
    () => [...new Set(buildings.map(b => b.zoneName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [buildings]
  );

  const filtered = useMemo(() => {
    const kw = normalizeVi(search.trim());
    const list = buildings.filter(b => {
      if (status !== 'all' && statusOf(b) !== status) return false;
      if (attention && needsAttention && !needsAttention(b)) return false;
      if (zone !== 'all' && b.zoneName !== zone) return false;

      if (type === 'whole' && b.wholeHouse !== true) return false;
      if (type === 'rooms' && b.wholeHouse !== false) return false;
      if (type === 'unset' && b.wholeHouse !== null) return false;

      if (renovation === 'done' && !b.renovationCompleted) return false;
      if (renovation === 'in_progress' && !(b.hasRenovation && !b.renovationCompleted)) return false;
      if (renovation === 'none' && (b.hasRenovation || b.renovationCompleted)) return false;

      if (manager === 'assigned' && !b.operationManagerName) return false;
      if (manager === 'unassigned' && b.operationManagerName) return false;

      if (kw) {
        const hay = [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName, b.operationManagerName]
          .filter(Boolean).map(v => normalizeVi(String(v))).join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    // BE không trả createdAt → dùng id (auto-increment): id lớn = thêm sau.
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name':       return a.propertyName.localeCompare(b.propertyName, 'vi');
        case 'name_desc':  return b.propertyName.localeCompare(a.propertyName, 'vi');
        case 'rooms_desc': return (b.totalRooms || 0) - (a.totalRooms || 0);
        case 'rooms_asc':  return (a.totalRooms || 0) - (b.totalRooms || 0);
        case 'area_desc':  return (b.areaSize || 0) - (a.areaSize || 0);
        // Hết hạn gần nhất lên đầu; căn CHƯA có HĐ chủ nhà đứng trên cùng vì
        // đó mới là căn tắc nhất, không phải căn "hạn xa nhất".
        case 'lease_soon': {
          const k = (x: PropertyResponse) => x.leaseEndDate ?? '';
          if (!k(a) !== !k(b)) return k(a) ? 1 : -1;
          return k(a).localeCompare(k(b));
        }
        case 'oldest':     return a.id - b.id;
        default:           return b.id - a.id;
      }
    });
  }, [buildings, search, status, attention, zone, type, renovation, manager, sortBy, effectiveStatus, needsAttention]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [search, status, attention, zone, type, renovation, manager, sortBy, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const activeCount =
    (search.trim() ? 1 : 0) + (status !== 'all' ? 1 : 0) + (attention ? 1 : 0) +
    (zone !== 'all' ? 1 : 0) + (type !== 'all' ? 1 : 0) +
    (renovation !== 'all' ? 1 : 0) + (manager !== 'all' ? 1 : 0);

  const reset = () => {
    setSearch(''); setStatus('all'); setAttention(false); setZone('all');
    setType('all'); setRenovation('all'); setManager('all'); setSortBy('newest');
  };

  return {
    search, setSearch, status, setStatus, attention, setAttention, attentionCount,
    zone, setZone, type, setType,
    renovation, setRenovation, manager, setManager, sortBy, setSortBy,
    view, setView, perPage, setPerPage, page, setPage, totalPages,
    filtered, paged, statusCounts, zoneOptions, activeCount, reset,
    total: buildings.length,
  };
};
