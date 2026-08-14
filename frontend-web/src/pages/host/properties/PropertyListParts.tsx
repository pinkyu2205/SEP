/**
 * Các thành phần hiển thị của màn "Bất động sản" (Host).
 *
 *  - StatTile            : thẻ số liệu, bấm để lọc nhanh
 *  - PendingApprovalPanel: khối nổi bật liệt kê hồ sơ đang chờ Host phê duyệt
 *  - PropertyCard        : thẻ tòa nhà (ảnh + giá thuê + quản lý)
 *  - PropertyTable       : chế độ xem bảng, dễ so sánh nhiều căn một lúc
 *  - ListPagination      : phân trang có rút gọn
 *
 * State/bộ lọc nằm ở ./propertyListState (giữ file này chỉ export component để
 * React Fast Refresh hoạt động).
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, ArrowDownUp, ArrowRight, Building2, ChevronLeft, ChevronRight, DoorOpen,
  Home, Layers, LayoutGrid, MapPin, RotateCcw, Ruler, Search, SlidersHorizontal,
  Table2, User, Wallet, X, type LucideIcon,
} from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import {
  STATUS_BADGE, HOST_STATUS_CHIPS, SORT_LABEL, TYPE_LABEL, MANAGER_LABEL,
  GRID_SIZES, TABLE_SIZES, typeLabel, formatVnd, formatRoomPriceRange,
  type PropertyListFilters, type SortKey, type TypeFilter, type ManagerFilter,
  type RoomPriceRange,
} from './propertyListState';

// ─── Thẻ số liệu ────────────────────────────────────────────────────────────
export type StatTone = 'indigo' | 'emerald' | 'blue' | 'rose' | 'amber';

const TONE: Record<StatTone, { icon: string; bar: string; text: string }> = {
  indigo:  { icon: 'bg-indigo-50 text-indigo-600',   bar: 'bg-indigo-500',  text: 'text-indigo-600' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  blue:    { icon: 'bg-blue-50 text-blue-600',       bar: 'bg-blue-500',    text: 'text-blue-600' },
  rose:    { icon: 'bg-rose-50 text-rose-600',       bar: 'bg-rose-500',    text: 'text-rose-600' },
  amber:   { icon: 'bg-amber-50 text-amber-600',     bar: 'bg-amber-500',   text: 'text-amber-600' },
};

export const StatTile = ({
  icon: Icon, label, value, tone, helper, progress, onClick, active,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone: StatTone;
  helper?: string;
  /** 0..1 — thanh tỉ trọng so với tổng */
  progress?: number;
  onClick?: () => void;
  active?: boolean;
}) => {
  const t = TONE[tone];
  const Tag = onClick ? 'button' : 'div';
  const pct = progress == null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <Tag
      onClick={onClick}
      className={`w-full rounded-2xl border bg-white p-4 text-left transition ${
        active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
      } ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <div className={`shrink-0 rounded-xl p-2 ${t.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-black leading-none tabular-nums text-slate-900">{value}</p>
      {pct != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all duration-500 ${t.bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        {active ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            Đang lọc
          </span>
        ) : (
          <>
            {pct != null && <span className={`text-xs font-black tabular-nums ${t.text}`}>{pct}%</span>}
            {helper && <span className="truncate text-xs text-slate-400">{helper}</span>}
          </>
        )}
      </div>
    </Tag>
  );
};

// ─── Hồ sơ chờ Host phê duyệt ───────────────────────────────────────────────
/** 1 dòng hồ sơ chờ duyệt — dùng cho cả dải xem nhanh và popup danh sách đầy đủ. */
const PendingRow = ({ p, onOpen }: { p: PropertyResponse; onOpen: () => void }) => (
  <button onClick={onOpen}
    className="group flex w-full min-w-0 items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-left transition hover:bg-amber-50">
    <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-50">
      {p.imageUrls?.length
        ? <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
        : <Building2 className="h-4 w-4 text-amber-300" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold text-slate-800 transition group-hover:text-amber-700">
        {p.propertyName}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{p.fullAddress || p.shortAddress}</span>
      </p>
    </div>
    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-amber-600">
      Duyệt <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </span>
  </button>
);

const PENDING_PER_PAGE = 12;

/**
 * Popup danh sách đầy đủ hồ sơ chờ duyệt — có tìm kiếm + phân trang nên chịu
 * được vài trăm hồ sơ (bung hết inline thì trang dài vô tận).
 */
const PendingApprovalModal = ({ items, onOpen, onClose }: {
  items: PropertyResponse[];
  onOpen: (p: PropertyResponse) => void;
  onClose: () => void;
}) => {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = normalizeVi(q.trim());
    if (!kw) return items;
    return items.filter(p =>
      [p.propertyName, p.fullAddress, p.shortAddress, p.zoneName]
        .filter(Boolean).map(v => normalizeVi(String(v))).join(' ').includes(kw)
    );
  }, [items, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PENDING_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PENDING_PER_PAGE, safePage * PENDING_PER_PAGE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-white">
            {items.length}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-900">Hồ sơ chờ bạn phê duyệt giá</h3>
            <p className="text-xs text-slate-500">Bấm vào một hồ sơ để xem và duyệt</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tìm kiếm */}
        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} autoFocus
              placeholder="Tìm theo tên tòa nhà, địa chỉ, khu vực... (không cần dấu)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100" />
            {q && (
              <button onClick={() => { setQ(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Danh sách */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {paged.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Không có hồ sơ nào khớp từ khóa.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {paged.map(p => <PendingRow key={p.id} p={p} onOpen={() => onOpen(p)} />)}
            </div>
          )}
        </div>

        {/* Chân: kết quả + phân trang */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-xs text-slate-500">
            Hiển thị <b className="text-slate-800">{filtered.length === 0 ? 0 : (safePage - 1) * PENDING_PER_PAGE + 1}–
            {Math.min(safePage * PENDING_PER_PAGE, filtered.length)}</b> trên{' '}
            <b className="text-slate-800">{filtered.length}</b> hồ sơ
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 text-xs font-bold text-slate-500">{safePage} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Dải nhắc việc gọn 1 dòng: số lượng + tên vài hồ sơ đầu, bấm vào mở popup có
 * tìm kiếm & phân trang. Chiều cao không đổi dù có 10 hay 1000 hồ sơ.
 */
export const PendingApprovalPanel = ({ items, onOpen }: {
  items: PropertyResponse[];
  onOpen: (p: PropertyResponse) => void;
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  if (items.length === 0) return null;

  const names = items.slice(0, 2).map(p => p.propertyName);
  const rest = items.length - names.length;

  return (
    <>
      <button onClick={() => setModalOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-100/70">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
          <AlertCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-amber-900">
            {items.length} hồ sơ đang chờ bạn phê duyệt giá
          </p>
          <p className="truncate text-xs text-amber-700/90">
            {names.join(' · ')}{rest > 0 && ` · +${rest} hồ sơ khác`}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 transition group-hover:bg-amber-50">
          Xem &amp; duyệt <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>

      {modalOpen && (
        <PendingApprovalModal
          items={items}
          onOpen={p => { setModalOpen(false); onOpen(p); }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
};

// ─── Thanh tìm kiếm & bộ lọc ────────────────────────────────────────────────
const FilterSelect = ({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: ReactNode;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
      {children}
    </select>
  </label>
);

const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1.5 text-xs font-bold text-indigo-700">
    {label}
    <button onClick={onClear} className="rounded-full p-0.5 transition hover:bg-indigo-200" title="Bỏ lọc này">
      <X className="h-3 w-3" />
    </button>
  </span>
);

export const FilterToolbar = ({ f, action }: { f: PropertyListFilters; action?: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const visibleChips = HOST_STATUS_CHIPS.filter(
    c => (f.statusCounts[c.value] ?? 0) > 0 || f.status === c.value
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Hàng 1 */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={f.search}
            onChange={e => f.setSearch(e.target.value)}
            placeholder="Tìm theo tên, địa chỉ, khu vực, quản lý... (không cần dấu)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm font-medium outline-none transition placeholder:font-normal focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          {f.search && (
            <button onClick={() => f.setSearch('')} title="Xóa từ khóa"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition ${
              open || f.activeCount > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            <SlidersHorizontal className="h-4 w-4" /> Bộ lọc
            {f.activeCount > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                {f.activeCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {([['grid', LayoutGrid, 'Xem dạng lưới'], ['table', Table2, 'Xem dạng bảng']] as const).map(([mode, Icon, title]) => (
              <button key={mode} onClick={() => f.setView(mode)} title={title}
                className={`rounded-lg p-2 transition ${
                  f.view === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          {action}
        </div>
      </div>

      {/* Hàng 2 — chip trạng thái */}
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleChips.map(c => {
          const active = f.status === c.value;
          return (
            <button key={c.value} onClick={() => f.setStatus(c.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active ? c.cls : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              {c.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'
              }`}>{f.statusCounts[c.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Hàng 3 — bộ lọc nâng cao */}
      {open && (
        <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-3">
          <FilterSelect label="Khu vực" value={f.zone} onChange={f.setZone}>
            <option value="all">Tất cả khu vực</option>
            {f.zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
          </FilterSelect>
          <FilterSelect label="Loại hình" value={f.type} onChange={v => f.setType(v as TypeFilter)}>
            {(Object.keys(TYPE_LABEL) as TypeFilter[]).map(k => (
              <option key={k} value={k}>{TYPE_LABEL[k]}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Quản lý khu vực" value={f.manager} onChange={v => f.setManager(v as ManagerFilter)}>
            {(Object.keys(MANAGER_LABEL) as ManagerFilter[]).map(k => (
              <option key={k} value={k}>{MANAGER_LABEL[k]}</option>
            ))}
          </FilterSelect>
        </div>
      )}

      {/* Hàng 4 — đang lọc */}
      {f.activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đang lọc</span>
          {f.search.trim() && <ActiveChip label={`Từ khóa: "${f.search.trim()}"`} onClear={() => f.setSearch('')} />}
          {f.status !== 'all' && (
            <ActiveChip label={HOST_STATUS_CHIPS.find(c => c.value === f.status)?.label ?? f.status}
              onClear={() => f.setStatus('all')} />
          )}
          {f.zone !== 'all' && <ActiveChip label={f.zone} onClear={() => f.setZone('all')} />}
          {f.type !== 'all' && <ActiveChip label={TYPE_LABEL[f.type]} onClear={() => f.setType('all')} />}
          {f.manager !== 'all' && <ActiveChip label={MANAGER_LABEL[f.manager]} onClear={() => f.setManager('all')} />}
          <button onClick={f.reset}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600">
            <RotateCcw className="h-3.5 w-3.5" /> Xóa tất cả bộ lọc
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Dòng kết quả ───────────────────────────────────────────────────────────
export const ResultBar = ({ f }: { f: PropertyListFilters }) => {
  const from = f.filtered.length === 0 ? 0 : (f.page - 1) * f.perPage + 1;
  const to = Math.min(f.page * f.perPage, f.filtered.length);
  const sizes = f.view === 'table' ? TABLE_SIZES : GRID_SIZES;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-sm text-slate-500">
        Hiển thị <span className="font-bold text-slate-800">{from}–{to}</span> trên{' '}
        <span className="font-bold text-slate-800">{f.filtered.length}</span> tòa nhà
        {f.filtered.length !== f.total && <span className="text-slate-400"> (tổng {f.total})</span>}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <ArrowDownUp className="h-3.5 w-3.5 text-slate-400" />
          <select value={f.sortBy} onChange={e => f.setSortBy(e.target.value as SortKey)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
            {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <select value={f.perPage} onChange={e => f.setPerPage(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
          {sizes.map(n => <option key={n} value={n}>{n} / trang</option>)}
        </select>
      </div>
    </div>
  );
};

// ─── Thẻ tòa nhà ────────────────────────────────────────────────────────────
const MiniStat = ({ icon: Icon, value, label }: { icon: LucideIcon; value: ReactNode; label: string }) => (
  <div className="py-2.5 text-center">
    <Icon className="mx-auto mb-0.5 h-3.5 w-3.5 text-slate-300" />
    <p className="text-sm font-black leading-tight text-slate-800">{value}</p>
    <p className="text-[10px] font-semibold text-slate-400">{label}</p>
  </div>
);

export const PropertyCard = ({ p, roomPrice, onClick }: {
  p: PropertyResponse;
  /** Khoảng giá suy từ phòng — chỉ có với nhà chia phòng chưa đặt giá ở cấp toà nhà. */
  roomPrice?: RoomPriceRange | null;
  onClick: () => void;
}) => {
  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.DRAFT;
  const noManager = !p.operationManagerId;

  return (
    <div onClick={onClick}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:border-indigo-300 hover:shadow-lg">

      {/* Ảnh + trạng thái */}
      <div className="relative h-40 overflow-hidden bg-slate-100">
        {p.imageUrls?.length ? (
          <img src={p.imageUrls[0]} alt={p.propertyName}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-50">
            <Building2 className="h-10 w-10 text-indigo-200" />
          </div>
        )}
        <span className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${badge.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />{badge.label}
        </span>
        {(p.imageUrls?.length ?? 0) > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white">
            +{p.imageUrls!.length - 1}
          </span>
        )}
        {noManager && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <AlertCircle className="h-3 w-3" /> Chưa có QL
          </span>
        )}
      </div>

      {/* Nội dung */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold text-slate-900 transition group-hover:text-indigo-700">
            {p.propertyName}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
            <MapPin className="h-3 w-3 shrink-0" />{p.fullAddress || p.shortAddress}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {p.wholeHouse !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                p.wholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              }`}>
                <Home className="h-3 w-3" />{typeLabel(p)}
              </span>
            )}
            {p.zoneName && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.zoneName}</span>
            )}
          </div>
        </div>

        {/* Giá thuê — thông tin host quan tâm nhất */}
        <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-500">
            <Wallet className="h-3.5 w-3.5" /> Giá thuê
          </span>
          <span className="text-right text-sm font-black text-indigo-700">
            {p.price ? (
              `${formatVnd(p.price)}/tháng`
            ) : roomPrice ? (
              <>
                {formatRoomPriceRange(roomPrice)}/tháng
                <span className="block text-[10px] font-semibold text-indigo-400">
                  theo giá {roomPrice.rooms} phòng
                </span>
              </>
            ) : (
              <span className="text-slate-400">Chưa định giá</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60">
          <MiniStat icon={DoorOpen} value={p.totalRooms || 0} label="Phòng" />
          <MiniStat icon={Layers} value={p.totalFloor ?? p.floorCount ?? '—'} label="Tầng" />
          <MiniStat icon={Ruler} value={p.areaSize ? `${p.areaSize}m²` : '—'} label="Diện tích" />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            {p.operationManagerName ? (
              <span className="truncate font-semibold text-slate-600">{p.operationManagerName}</span>
            ) : p.operationManagerId ? (
              <span className="truncate font-semibold text-slate-500">Đã gán quản lý</span>
            ) : (
              <span className="font-semibold text-rose-500">Chưa có quản lý</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-600">
            Chi tiết <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Chế độ xem bảng ────────────────────────────────────────────────────────
export const PropertyTable = ({ rows, roomPrices = {}, onRowClick }: {
  rows: PropertyResponse[];
  /** id nhà → khoảng giá suy từ phòng (nhà chia phòng chưa đặt giá ở cấp toà nhà). */
  roomPrices?: Record<number, RoomPriceRange | null>;
  onRowClick: (p: PropertyResponse) => void;
}) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    <table className="w-full min-w-[980px] text-sm">
      <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
        <tr>
          <th className="px-4 py-3">Tòa nhà</th>
          <th className="px-4 py-3">Khu vực</th>
          <th className="px-4 py-3">Loại hình</th>
          <th className="px-4 py-3 text-center">Phòng</th>
          <th className="px-4 py-3 text-center">Tầng</th>
          <th className="px-4 py-3 text-right">Giá thuê</th>
          <th className="px-4 py-3">Quản lý vận hành</th>
          <th className="px-4 py-3">Trạng thái</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(p => {
          const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.DRAFT;
          return (
            <tr key={p.id} onClick={() => onRowClick(p)}
              className="group cursor-pointer transition hover:bg-indigo-50/40">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {p.imageUrls?.length
                      ? <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                      : <Building2 className="h-4 w-4 text-slate-300" />}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-bold text-slate-900 transition group-hover:text-indigo-700">
                      {p.propertyName}
                    </p>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{p.fullAddress || p.shortAddress || '—'}</span>
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {p.zoneName || '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  p.wholeHouse === null ? 'bg-slate-100 text-slate-500'
                    : p.wholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {typeLabel(p)}
                </span>
              </td>
              <td className="px-4 py-3 text-center font-bold text-slate-700">{p.totalRooms || 0}</td>
              <td className="px-4 py-3 text-center font-bold text-slate-700">{p.totalFloor ?? p.floorCount ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                {p.price ? (
                  <span className="font-black text-indigo-700">{formatVnd(p.price)}</span>
                ) : roomPrices[p.id] ? (
                  <>
                    <span className="font-black text-indigo-700">{formatRoomPriceRange(roomPrices[p.id]!)}</span>
                    <span className="block text-[10px] font-semibold text-indigo-400">
                      theo giá {roomPrices[p.id]!.rooms} phòng
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-300">Chưa định giá</span>
                )}
              </td>
              <td className="px-4 py-3">
                {p.operationManagerName ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    <span className="line-clamp-1">{p.operationManagerName}</span>
                  </span>
                ) : p.operationManagerId ? (
                  <span className="text-xs font-semibold text-slate-500">Đã gán</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-rose-500">
                    <AlertCircle className="h-3.5 w-3.5" /> Chưa có
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />{badge.label}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <ArrowRight className="ml-auto h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ─── Phân trang ─────────────────────────────────────────────────────────────
export const ListPagination = ({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) => {
  if (totalPages <= 1) return null;
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-xl border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

  // 1 … 4 5 [6] 7 8 … 20
  const pages: (number | 'gap')[] = [];
  const push = (p: number | 'gap') => { if (pages[pages.length - 1] !== p) pages.push(p); };
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) push(p);
    else push('gap');
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) => p === 'gap' ? (
        <span key={`gap-${i}`} className="px-1 text-sm font-bold text-slate-300">…</span>
      ) : (
        <button key={p} onClick={() => onChange(p)}
          className={`${btn} ${p === page
            ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};
