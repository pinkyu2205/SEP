/**
 * State lọc / sắp xếp / phân trang cho màn "Bất động sản" của Host.
 * Tách khỏi file .tsx để phần component chỉ export component (điều kiện để
 * React Fast Refresh hot-reload được).
 */
import { useEffect, useMemo, useState } from 'react';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import type { PropertyOperationStatus } from './propertyOperationStatus';

export const formatVnd = (v: number) => new Intl.NumberFormat('vi-VN').format(v) + ' đ';

/**
 * Khoảng giá phòng của một nhà CHIA PHÒNG.
 * Nhà loại này để `Property.price` null vì giá nằm trên từng phòng — không suy ra
 * khoảng giá từ `rooms[]` thì card ghi "Chưa định giá" dù phòng nào cũng có giá.
 */
export interface RoomPriceRange { min: number; max: number; rooms: number }

/**
 * MỘT con số duy nhất: giá phòng CAO NHẤT của căn.
 *
 * ─── Vì sao bỏ cách hiện khoảng giá (30/08/2026) ─────────────────────────────
 * Bản trước in "min – max" khi các phòng lệch giá. Nhưng BE chia đều diện tích sàn cho
 * số phòng nên giá phòng hay lệch nhau đúng vài ĐỒNG do làm tròn — ra những dòng như
 * "3.946.759 đ – 3.946.760 đ": dài gấp đôi, chiếm hết chiều ngang ô giá, mà hai đầu
 * khoảng thì lệch nhau 1 đồng. Người đọc phải nhìn kỹ mới thấy đó thực chất là một giá.
 *
 * Lấy CAO NHẤT chứ không phải thấp nhất hay trung bình: đây là giá niêm yết dùng để
 * chào khách, lấy mức cao nhất là cách nói an toàn — không hứa hẹn mức rẻ hơn mức nhà
 * thực sự có. Số phòng đi kèm ở nhãn phụ để không ai tưởng đó là giá cả căn.
 */
export const formatRoomPriceTop = (r: RoomPriceRange) => formatVnd(r.max);

export const typeLabel = (p: PropertyResponse) =>
  p.wholeHouse === null ? 'Chưa xác định' : p.wholeHouse ? 'Nguyên căn' : 'Chia phòng';

/**
 * Nhãn cho `PropertyStatus` — VÒNG ĐỜI HỒ SƠ nhà, KHÔNG phải tình trạng cho thuê.
 *
 * ⚠️ `RENTED` ("Đã cho thuê") là NHÁNH CHẾT: không chỗ nào trong BE gán trạng thái đó
 * (xem `services/useOccupiedProperties.ts`). Giữ lại để không vỡ nếu BE sau này có
 * gán, nhưng ĐỪNG dựa vào nó để biết căn nào đang có khách — dùng `RentalState` của
 * `propertyOperationStatus.ts`, suy từ số phòng và hợp đồng đang chạy.
 */
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
 * - UNDER_RENOVATION / DISABLED: chỉ tính nếu đã từng được duyệt (đã có giá thuê hoặc đã có quản lý)
 *   → loại các căn admin đang onboarding (cải tạo lần đầu / nháp bị vô hiệu) chưa gửi Host.
 *
 * Vế `operationManagerId` vẫn giữ dù quản lý nay đến từ khu vực chứ không gán tay:
 * đường duy nhất để một nhà có quản lý là host-confirm (tự nhận theo khu vực) hoặc
 * gán khu vực — mà gán khu vực chỉ chạm vào nhà ĐÃ duyệt. Nên "có quản lý ⇒ đã duyệt"
 * vẫn đúng. Bỏ vế này sẽ ẩn mất nhà CHIA PHÒNG đang cải tạo, vì loại đó để
 * `price` null (giá nằm trên từng phòng) nên không qua được `price > 0`.
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
  | 'price_desc' | 'price_asc' | 'rooms_desc' | 'debt_desc';

export const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Mới thêm gần nhất',
  oldest: 'Thêm sớm nhất',
  name: 'Tên A → Z',
  name_desc: 'Tên Z → A',
  price_desc: 'Giá thuê cao nhất',
  price_asc: 'Giá thuê thấp nhất',
  rooms_desc: 'Nhiều phòng nhất',
  debt_desc: 'Nợ nhiều nhất kỳ này',
};

/**
 * Lọc theo TÌNH TRẠNG KHAI THÁC — khác hẳn lọc theo `status` (vòng đời hồ sơ nhà).
 *
 * Hai thứ này dễ nhầm nên để cạnh nhau cho thấy rõ: một căn `ACTIVE` ("Hoạt động")
 * hoàn toàn có thể đang để trống không ra đồng nào. Chip "Hoạt động" trả lời "hồ sơ
 * đã xong chưa", chip ở đây trả lời "có khách chưa".
 */
export type RentalFilter = 'all' | 'rented' | 'partial' | 'vacant' | 'incoming' | 'setup';

export const RENTAL_FILTER_LABEL: Record<RentalFilter, string> = {
  all: 'Tất cả',
  /** Gồm cả căn đã kín và căn mới có vài phòng — miễn là đang ra tiền. */
  rented: 'Đang có khách',
  partial: 'Còn phòng trống',
  vacant: 'Đang để trống',
  incoming: 'Chờ đón khách',
  setup: 'Chưa mở cho thuê',
};

/** Lọc theo kết quả thu tiền của KỲ ĐANG CHỌN. */
export type BillFilter = 'all' | 'debt' | 'overdue' | 'clear';

export const BILL_FILTER_LABEL: Record<BillFilter, string> = {
  all: 'Tất cả',
  debt: 'Còn hoá đơn chưa trả',
  overdue: 'Có hoá đơn quá hạn',
  clear: 'Đã thu đủ',
};

export type TypeFilter = 'all' | 'whole' | 'room';
export type ManagerFilter = 'all' | 'assigned' | 'unassigned';
export type ViewMode = 'grid' | 'table';

export const TYPE_LABEL: Record<TypeFilter, string> = {
  all: 'Tất cả loại hình', whole: 'Nhà nguyên căn', room: 'Nhà chia phòng',
};
/**
 * Quản lý vận hành đến từ KHU VỰC của nhà (một quận một quản lý), không gán riêng
 * từng căn — nên "chưa có quản lý" ở đây nghĩa là *khu vực* của nhà chưa được gán.
 * Xử lý ở màn /host/zones.
 */
export const MANAGER_LABEL: Record<ManagerFilter, string> = {
  all: 'Tất cả', assigned: 'Khu vực đã có quản lý', unassigned: 'Khu vực chưa có quản lý',
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
  rental: RentalFilter; setRental: (v: RentalFilter) => void;
  bill: BillFilter; setBill: (v: BillFilter) => void;
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

/**
 * @param opStatus id nhà → tình trạng khai thác & thu tiền. Truyền `undefined` (hoặc
 *   map rỗng lúc đang tải) thì hai bộ lọc `rental`/`bill` KHÔNG lọc gì cả — không
 *   được lọc bằng dữ liệu chưa về, vì như thế danh sách sẽ trống trơn rồi tự đầy lại,
 *   host tưởng mất nhà.
 */
export const usePropertyListFilters = (
  items: PropertyResponse[],
  opStatus?: Map<number, PropertyOperationStatus>,
): PropertyListFilters => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [zone, setZone] = useState('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [manager, setManager] = useState<ManagerFilter>('all');
  const [rental, setRental] = useState<RentalFilter>('all');
  const [bill, setBill] = useState<BillFilter>('all');
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

      const op = opStatus?.get(p.id);
      if (rental !== 'all') {
        // Chưa biết tình trạng thì GIỮ LẠI: ẩn đi là nói dối "căn này không thuộc nhóm".
        if (op) {
          // "Đang có khách" gồm cả căn đã kín (RENTED) lẫn căn mới có vài phòng (PARTIAL).
          if (rental === 'rented' && op.rental !== 'RENTED' && op.rental !== 'PARTIAL') return false;
          if (rental === 'partial' && op.rental !== 'PARTIAL') return false;
          // "Để trống" KHÔNG gom căn đã có hồ sơ chờ đón khách: nhãn nói "để trống" mà
          // trả về cả căn sắp có khách thì con số trên ô KPI không khớp danh sách bên
          // dưới. Nhóm đó có chip riêng `incoming`.
          if (rental === 'vacant'   && op.rental !== 'VACANT') return false;
          if (rental === 'incoming' && op.rental !== 'INCOMING') return false;
          if (rental === 'setup'    && op.rental !== 'SETUP') return false;
        }
      }
      if (bill !== 'all' && op) {
        if (bill === 'debt' && op.bills.pending + op.bills.overdue === 0) return false;
        if (bill === 'overdue' && op.bills.overdue === 0) return false;
        // "Đã thu đủ" chỉ tính căn CÓ hoá đơn kỳ này — căn không phát sinh hoá đơn nào
        // không phải là căn đã thu xong.
        if (bill === 'clear' && op.billState !== 'CLEAR') return false;
      }

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
        case 'debt_desc':
          return (opStatus?.get(b.id)?.bills.outstanding ?? 0)
               - (opStatus?.get(a.id)?.bills.outstanding ?? 0);
        case 'oldest':     return a.id - b.id;
        default:           return b.id - a.id;
      }
    });
  }, [items, search, status, zone, type, manager, rental, bill, sortBy, opStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [search, status, zone, type, manager, rental, bill, sortBy, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const activeCount =
    (search.trim() ? 1 : 0) + (status !== 'all' ? 1 : 0) + (zone !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) + (manager !== 'all' ? 1 : 0) +
    (rental !== 'all' ? 1 : 0) + (bill !== 'all' ? 1 : 0);

  const reset = () => {
    setSearch(''); setStatus('all'); setZone('all');
    setType('all'); setManager('all'); setRental('all'); setBill('all');
    setSortBy('newest');
  };

  return {
    search, setSearch, status, setStatus, zone, setZone, type, setType,
    manager, setManager, rental, setRental, bill, setBill, sortBy, setSortBy, view, setView,
    perPage, setPerPage, page, setPage, totalPages,
    filtered, paged, statusCounts, zoneOptions, activeCount, reset,
    total: items.length,
  };
};
