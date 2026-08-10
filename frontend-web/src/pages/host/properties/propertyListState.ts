/**
 * State lọc / sắp xếp / phân trang cho màn "Bất động sản" của Host.
 * Tách khỏi file .tsx để phần component chỉ export component (điều kiện để
 * React Fast Refresh hot-reload được).
 */
import { useEffect, useMemo, useState } from 'react';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';

export const formatVnd = (v: number) => new Intl.NumberFormat('vi-VN').format(v) + ' đ';

/**
 * Khoảng giá phòng của một nhà CHIA PHÒNG.
 * Nhà loại này để `Property.price` null vì giá nằm trên từng phòng — không suy ra
 * khoảng giá từ `rooms[]` thì card ghi "Chưa định giá" dù phòng nào cũng có giá.
 */
export interface RoomPriceRange { min: number; max: number; rooms: number }

/** "8.200.000 đ" nếu mọi phòng cùng giá, "7.000.000 – 9.000.000 đ" nếu khác nhau. */
export const formatRoomPriceRange = (r: RoomPriceRange) =>
  r.min === r.max ? formatVnd(r.min) : `${formatVnd(r.min)} – ${formatVnd(r.max)}`;

export const typeLabel = (p: PropertyResponse) =>
  p.wholeHouse === null ? 'Chưa xác định' : p.wholeHouse ? 'Nguyên căn' : 'Chia phòng';

export const STATUS_BADGE: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING_HOST_REVIEW:       { label: 'Chờ phê duyệt',   cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  PENDING_OPERATION_MANAGER: { label: 'Chờ gán quản lý', cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  ACTIVE:                    { label: 'Hoạt động',       cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  RENTED:                    { label: 'Đã cho thuê',     cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  UNDER_RENOVATION:          { label: 'Đang cải tạo',    cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  RENOVATION_COMPLETED:      { label: 'Đã cải tạo xong', cls: 'bg-teal-100 text-teal-700',       dot: 'bg-teal-500' },
  DRAFT:                     { label: 'Nháp',            cls: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  DISABLED:                  { label: 'Vô hiệu',         cls: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
};

/** Chip lọc nhanh — chỉ các trạng thái Host thực sự thấy trên màn này. */
export const HOST_STATUS_CHIPS: { value: string; label: string; cls: string }[] = [
  { value: 'all',                       label: 'Tất cả',         cls: 'border-slate-900 bg-slate-900 text-white' },
  { value: 'ACTIVE',                    label: 'Hoạt động',      cls: 'border-emerald-600 bg-emerald-600 text-white' },
  { value: 'RENTED',                    label: 'Đã cho thuê',    cls: 'border-blue-600 bg-blue-600 text-white' },
  { value: 'PENDING_OPERATION_MANAGER', label: 'Chờ gán quản lý', cls: 'border-violet-600 bg-violet-600 text-white' },
  { value: 'UNDER_RENOVATION',          label: 'Đang cải tạo',   cls: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'DISABLED',                  label: 'Vô hiệu',        cls: 'border-rose-600 bg-rose-600 text-white' },
];

/**
 * Nhà đã được Host duyệt thành công (chỉ những căn này mới hiện ở màn Bất động sản của Host).
 * - ACTIVE / RENTED / PENDING_OPERATION_MANAGER: chắc chắn đã qua host-confirm.
 * - UNDER_RENOVATION / DISABLED: chỉ tính nếu đã từng được duyệt (đã có giá thuê hoặc đã gán quản lý)
 *   → loại các căn admin đang onboarding (cải tạo lần đầu / nháp bị vô hiệu) chưa gửi Host.
 * Ẩn hẳn: DRAFT, RENOVATION_COMPLETED (admin chưa "Định giá & gửi Host"), PENDING_HOST_REVIEW (đang chờ duyệt).
 */
export const isHostApproved = (p: PropertyResponse): boolean => {
  if (p.status === 'ACTIVE' || p.status === 'RENTED' || p.status === 'PENDING_OPERATION_MANAGER') return true;
  if (p.status === 'UNDER_RENOVATION' || p.status === 'DISABLED') {
    return (p.price ?? 0) > 0 || !!p.operationManagerId;
  }
  return false;
};

export type SortKey =
  | 'newest' | 'oldest' | 'name' | 'name_desc'
  | 'price_desc' | 'price_asc' | 'rooms_desc';

export const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Mới thêm gần nhất',
  oldest: 'Thêm sớm nhất',
  name: 'Tên A → Z',
  name_desc: 'Tên Z → A',
  price_desc: 'Giá thuê cao nhất',
  price_asc: 'Giá thuê thấp nhất',
  rooms_desc: 'Nhiều phòng nhất',
};

export type TypeFilter = 'all' | 'whole' | 'room';
export type ManagerFilter = 'all' | 'assigned' | 'unassigned';
export type ViewMode = 'grid' | 'table';

export const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'Tất cả loại hình', whole: 'Nhà nguyên căn', room: 'Nhà chia phòng',
};
export const MANAGER_LABEL: Record<ManagerFilter, string> = {
  all: 'Tất cả', assigned: 'Đã gán quản lý', unassigned: 'Chưa có quản lý',
};

export const GRID_SIZES = [9, 18, 36];
export const TABLE_SIZES = [10, 25, 50];

const VIEW_KEY = 'host-properties:view';

export interface PropertyListFilters {
  search: string; setSearch: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  zone: string; setZone: (v: string) => void;
  type: TypeFilter; setType: (v: TypeFilter) => void;
  manager: ManagerFilter; setManager: (v: ManagerFilter) => void;
  sortBy: SortKey; setSortBy: (v: SortKey) => void;
  view: ViewMode; setView: (v: ViewMode) => void;
  perPage: number; setPerPage: (v: number) => void;
  page: number; setPage: (v: number) => void;
  totalPages: number;
  filtered: PropertyResponse[];
  paged: PropertyResponse[];
  statusCounts: Record<string, number>;
  zoneOptions: string[];
  activeCount: number;
  reset: () => void;
  total: number;
}

export const usePropertyListFilters = (items: PropertyResponse[]): PropertyListFilters => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [zone, setZone] = useState('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [manager, setManager] = useState<ManagerFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [view, setViewRaw] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid'
  );
  const [perPage, setPerPage] = useState(view === 'table' ? TABLE_SIZES[0] : GRID_SIZES[0]);
  const [page, setPage] = useState(1);

  const setView = (v: ViewMode) => {
    setViewRaw(v);
    localStorage.setItem(VIEW_KEY, v);
    setPerPage(v === 'table' ? TABLE_SIZES[0] : GRID_SIZES[0]);
  };

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = { all: items.length };
    items.forEach(p => { acc[p.status] = (acc[p.status] ?? 0) + 1; });
    return acc;
  }, [items]);

  const zoneOptions = useMemo(
    () => [...new Set(items.map(p => p.zoneName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [items]
  );

  const filtered = useMemo(() => {
    const kw = normalizeVi(search.trim());
    const list = items.filter(p => {
      if (status !== 'all' && p.status !== status) return false;
      if (zone !== 'all' && p.zoneName !== zone) return false;
      if (type === 'whole' && p.wholeHouse !== true) return false;
      if (type === 'room' && p.wholeHouse !== false) return false;
      if (manager === 'assigned' && !p.operationManagerId) return false;
      if (manager === 'unassigned' && p.operationManagerId) return false;
      if (kw) {
        const hay = [p.propertyName, p.shortAddress, p.fullAddress, p.zoneName, p.operationManagerName]
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
        case 'price_desc': return (b.price ?? 0) - (a.price ?? 0);
        case 'price_asc':  return (a.price ?? 0) - (b.price ?? 0);
        case 'rooms_desc': return (b.totalRooms || 0) - (a.totalRooms || 0);
        case 'oldest':     return a.id - b.id;
        default:           return b.id - a.id;
      }
    });
  }, [items, search, status, zone, type, manager, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [search, status, zone, type, manager, sortBy, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const activeCount =
    (search.trim() ? 1 : 0) + (status !== 'all' ? 1 : 0) + (zone !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) + (manager !== 'all' ? 1 : 0);

  const reset = () => {
    setSearch(''); setStatus('all'); setZone('all');
    setType('all'); setManager('all'); setSortBy('newest');
  };

  return {
    search, setSearch, status, setStatus, zone, setZone, type, setType,
    manager, setManager, sortBy, setSortBy, view, setView,
    perPage, setPerPage, page, setPage, totalPages,
    filtered, paged, statusCounts, zoneOptions, activeCount, reset,
    total: items.length,
  };
};
