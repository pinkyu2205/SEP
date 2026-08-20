/**
 * Các thành phần hiển thị danh sách tòa nhà — dùng chung cho 2 module
 * "Khởi tạo nhà" và "Cấu hình khai thác".
 *
 *  - BuildingFilterBar : thanh công cụ (tìm kiếm, chip trạng thái, bộ lọc nâng cao)
 *  - ResultBar         : dòng "Hiển thị x–y trên z" + sắp xếp + số dòng mỗi trang
 *  - BuildingTable     : chế độ xem bảng (gọn, dễ so sánh nhiều nhà một lúc)
 *
 * State & hằng số nằm ở ./buildingFilterState (giữ file này chỉ export component
 * để React Fast Refresh hoạt động).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownUp, LayoutGrid, MapPin, RotateCcw, Search, SlidersHorizontal,
  Table2, UserRound, X,
} from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import {
  GRID_SIZES, TABLE_SIZES, SORT_LABEL, TYPE_LABEL, RENO_LABEL, MANAGER_LABEL,
  type BuildingFilters, type StatusOption, type SortKey,
  type TypeFilter, type RenovationFilter, type ManagerFilter,
} from './buildingFilterState';

// ─── Select nhỏ có nhãn nổi ──────────────────────────────────────────────────
const FilterSelect = ({ label, value, onChange, children }: {
  label: string; value: string; onChange: (v: string) => void; children: ReactNode;
}) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
    >
      {children}
    </select>
  </label>
);

// ─── Chip lọc đang áp dụng ───────────────────────────────────────────────────
const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1.5 text-xs font-bold text-indigo-700">
    {label}
    <button onClick={onClear} className="rounded-full p-0.5 transition hover:bg-indigo-200" title="Bỏ lọc này">
      <X className="h-3 w-3" />
    </button>
  </span>
);

/**
 * Thanh công cụ: ô tìm kiếm + chip trạng thái + bộ lọc nâng cao (đóng/mở) +
 * chuyển đổi lưới/bảng.
 */
export const BuildingFilterBar = ({ f, statusOptions, action, hiddenFilters = [] }: {
  f: BuildingFilters;
  statusOptions: StatusOption[];
  /** nút hành động chính hiển thị bên phải ô tìm kiếm (VD: Nhập từ Excel) */
  action?: ReactNode;
  /** ẩn bộ lọc không thuộc phạm vi module (VD: "Khởi tạo nhà" không quan tâm cải tạo) */
  hiddenFilters?: Array<'zone' | 'type' | 'renovation' | 'manager'>;
}) => {
  const [open, setOpen] = useState(false);
  const show = (k: 'zone' | 'type' | 'renovation' | 'manager') => !hiddenFilters.includes(k);

  // Chỉ hiện chip trạng thái có dữ liệu (hoặc đang được chọn) để tránh rối mắt.
  const visibleStatuses = statusOptions.filter(
    s => (f.statusCounts[s.value] ?? 0) > 0 || f.status === s.value
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Hàng 1: tìm kiếm · bộ lọc · kiểu xem */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={f.search}
            onChange={e => f.setSearch(e.target.value)}
            placeholder="Tìm theo tên tòa nhà, địa chỉ, khu vực, quản lý... (không cần dấu)"
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
          <button
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition ${
              open || f.activeCount > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Bộ lọc
            {f.activeCount > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                {f.activeCount}
              </span>
            )}
          </button>

          {/* Lưới / Bảng */}
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

      {/* Hàng 2: chip trạng thái nhanh */}
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleStatuses.map(s => {
          const active = f.status === s.value;
          const count = f.statusCounts[s.value] ?? 0;
          return (
            <button key={s.value} onClick={() => f.setStatus(s.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? (s.cls ?? 'border-indigo-600 bg-indigo-600 text-white')
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              {s.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hàng 3: bộ lọc nâng cao */}
      {open && (
        <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {show('zone') && (
            <FilterSelect label="Khu vực" value={f.zone} onChange={v => f.setZone(v)}>
              <option value="all">Tất cả khu vực</option>
              {f.zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
            </FilterSelect>
          )}

          {show('type') && (
            <FilterSelect label="Loại hình" value={f.type} onChange={v => f.setType(v as TypeFilter)}>
              {(Object.keys(TYPE_LABEL) as TypeFilter[]).map(k => (
                <option key={k} value={k}>{TYPE_LABEL[k]}</option>
              ))}
            </FilterSelect>
          )}

          {show('renovation') && (
            <FilterSelect label="Cải tạo" value={f.renovation} onChange={v => f.setRenovation(v as RenovationFilter)}>
              {(Object.keys(RENO_LABEL) as RenovationFilter[]).map(k => (
                <option key={k} value={k}>{RENO_LABEL[k]}</option>
              ))}
            </FilterSelect>
          )}

          {show('manager') && (
            <FilterSelect label="Quản lý vận hành" value={f.manager} onChange={v => f.setManager(v as ManagerFilter)}>
              {(Object.keys(MANAGER_LABEL) as ManagerFilter[]).map(k => (
                <option key={k} value={k}>{MANAGER_LABEL[k]}</option>
              ))}
            </FilterSelect>
          )}
        </div>
      )}

      {/* Hàng 4: chip đang lọc + xóa lọc */}
      {f.activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đang lọc</span>
          {f.search.trim() && <ActiveChip label={`Từ khóa: "${f.search.trim()}"`} onClear={() => f.setSearch('')} />}
          {f.status !== 'all' && (
            <ActiveChip
              label={statusOptions.find(s => s.value === f.status)?.label ?? f.status}
              onClear={() => f.setStatus('all')}
            />
          )}
          {f.zone !== 'all' && <ActiveChip label={f.zone} onClear={() => f.setZone('all')} />}
          {f.type !== 'all' && <ActiveChip label={TYPE_LABEL[f.type]} onClear={() => f.setType('all')} />}
          {f.renovation !== 'all' && <ActiveChip label={RENO_LABEL[f.renovation]} onClear={() => f.setRenovation('all')} />}
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

// ─── Dòng kết quả: "Hiển thị 1–9 trên 69" + sắp xếp + số dòng/trang ─────────
export const ResultBar = ({ f, noun = 'tòa nhà' }: { f: BuildingFilters; noun?: string }) => {
  const from = f.filtered.length === 0 ? 0 : (f.page - 1) * f.perPage + 1;
  const to = Math.min(f.page * f.perPage, f.filtered.length);
  const sizes = f.view === 'table' ? TABLE_SIZES : GRID_SIZES;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-sm text-slate-500">
        Hiển thị <span className="font-bold text-slate-800">{from}–{to}</span> trên{' '}
        <span className="font-bold text-slate-800">{f.filtered.length}</span> {noun}
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

// ─── Chế độ xem bảng ────────────────────────────────────────────────────────
export const BuildingTable = ({
  rows, getBadge, onRowClick, renderActions, showRenovation = true, showManager = true,
  selectedIds, onToggleRow, onToggleAll,
}: {
  rows: PropertyResponse[];
  getBadge: (b: PropertyResponse) => { label: string; cls: string } | null;
  onRowClick?: (b: PropertyResponse) => void;
  renderActions?: (b: PropertyResponse) => ReactNode;
  /** cột/chip thuộc bước vận hành — ẩn ở module chỉ lo khởi tạo */
  showRenovation?: boolean;
  showManager?: boolean;
  /** truyền cả 3 prop dưới để bật cột tick chọn hàng loạt */
  selectedIds?: Set<number>;
  onToggleRow?: (id: number) => void;
  onToggleAll?: (checked: boolean) => void;
}) => {
  const selectable = !!selectedIds && !!onToggleRow && !!onToggleAll;
  const allOnPage = selectable && rows.length > 0 && rows.every(r => selectedIds!.has(r.id));

  return (
  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
    <table className={`w-full text-sm ${showManager ? 'min-w-[900px]' : 'min-w-[780px]'}`}>
      <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
        <tr>
          {selectable && (
            <th className="w-10 px-4 py-3">
              <input type="checkbox" checked={allOnPage} onChange={e => onToggleAll!(e.target.checked)}
                title="Chọn tất cả trong trang"
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            </th>
          )}
          <th className="px-4 py-3">Tòa nhà</th>
          <th className="px-4 py-3">Khu vực</th>
          <th className="px-4 py-3">Loại hình</th>
          <th className="px-4 py-3 text-center">Phòng</th>
          <th className="px-4 py-3 text-center">Tầng</th>
          <th className="px-4 py-3 text-center">Diện tích</th>
          {showManager && <th className="px-4 py-3">Quản lý</th>}
          <th className="px-4 py-3">Trạng thái</th>
          {renderActions && <th className="px-4 py-3 text-right">Hành động</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(b => {
          const badge = getBadge(b);
          const reno = b.renovationCompleted ? 'done' : b.hasRenovation ? 'in_progress' : 'none';
          const checked = !!selectedIds?.has(b.id);
          return (
            <tr key={b.id}
              onClick={() => onRowClick?.(b)}
              className={`transition ${checked ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/40'} ${onRowClick ? 'cursor-pointer' : ''}`}>
              {selectable && (
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => onToggleRow!(b.id)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                </td>
              )}
              <td className="px-4 py-3">
                <p className="font-bold text-slate-900 line-clamp-1">{b.propertyName}</p>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="line-clamp-1">{b.fullAddress || b.shortAddress || '—'}</span>
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {b.zoneName || '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">
                    {b.wholeHouse === null ? 'Chưa chọn' : b.wholeHouse ? 'Nguyên căn' : 'Phòng trọ'}
                  </span>
                  {showRenovation && reno !== 'none' && (
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                      reno === 'done'
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {reno === 'done' ? 'Đã cải tạo' : 'Đang cải tạo'}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-center font-bold text-slate-700">{b.totalRooms || 0}</td>
              <td className="px-4 py-3 text-center font-bold text-slate-700">{b.totalFloor ?? b.floorCount ?? '—'}</td>
              <td className="px-4 py-3 text-center text-slate-600">{b.areaSize ? `${b.areaSize} m²` : '—'}</td>
              {showManager && (
                <td className="px-4 py-3">
                  {b.operationManagerName ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <UserRound className="h-3.5 w-3.5 text-slate-400" />
                      <span className="line-clamp-1">{b.operationManagerName}</span>
                    </span>
                  ) : <span className="text-xs text-slate-300">Chưa gán</span>}
                </td>
              )}
              <td className="px-4 py-3">
                {badge
                  ? <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-black ${badge.cls}`}>{badge.label}</span>
                  : <span className="text-xs text-slate-300">—</span>}
              </td>
              {renderActions && (
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">{renderActions(b)}</div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  );
};

// ─── Thanh hành động hàng loạt (nổi ở đáy màn hình khi có mục được chọn) ─────
export const BulkActionBar = ({ count, onClear, children }: {
  count: number;
  onClear: () => void;
  /** các nút hành động (Vô hiệu hóa / Xóa ...) */
  children: ReactNode;
}) => {
  if (count === 0) return null;
  return (
    <>
      {/* Chừa chỗ ở cuối trang: thanh này `fixed` nên neo theo viewport và sẽ ĐÈ lên phần
          cuối nội dung — hay gặp nhất là nút chuyển trang, bấm không được. Ô trống này nằm
          trong luồng, đẩy nội dung lên vừa đủ để không có gì bị khuất.
          Component được đặt SAU phân trang trong JSX nên ô trống rơi đúng chỗ cần. */}
      <div aria-hidden className="h-24" />
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white shadow-2xl">
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-black text-slate-900">
            {count}
          </span>
          tòa nhà đã chọn
        </span>
        <span className="h-5 w-px bg-slate-700" />
        {children}
        <button onClick={onClear}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white" title="Bỏ chọn tất cả">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
    </>
  );
};
