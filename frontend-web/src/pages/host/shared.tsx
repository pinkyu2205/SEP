/**
 * Bộ phận dùng chung cho 3 module tài chính của Host:
 *   • Quản lý tài chính  (/host/finance)
 *   • Công nợ phải thu   (/host/receivables)
 *   • Sổ cọc             (/host/deposits)
 *
 * Mục tiêu: 3 trang cùng một bố cục lọc — thanh tìm kiếm (bỏ dấu) → chip trạng thái
 * → select thu hẹp → select sắp xếp → phân trang, và MẶC ĐỊNH luôn xếp bản ghi mới
 * nhất lên đầu để Host mở trang là thấy ngay cái vừa phát sinh.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search, X, type LucideIcon } from 'lucide-react';
import { normalizeVi } from '@/utils/helpers';
import { currentMonth, shiftMonth } from '@/utils/period';
import { isServerTimeSynced } from '@/utils/serverTime';

// Helper kỳ/ngày nằm ở @/utils/period vì Admin cũng dùng; re-export để các trang
// host chỉ cần import từ một chỗ.
export {
  currentMonth, cmpIsoDesc, daysSince, fmtDate, fmtDateTime, fmtMillion,
  monthLabel, monthShort, safePct, shiftMonth, ymOf,
} from '@/utils/period';

/** So khớp từ khoá kiểu tiếng Việt không dấu trên nhiều trường. */
export const matchVi = (term: string, ...fields: (string | number | null | undefined)[]): boolean => {
  const t = normalizeVi(term.trim());
  if (!t) return true;
  return fields.some(f => f != null && normalizeVi(String(f)).includes(t));
};

// ── Ô tìm kiếm ───────────────────────────────────────────────────────────────
export const SearchBox = ({
  value, onChange, placeholder, className = '',
}: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) => (
  <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm font-medium outline-none transition placeholder:font-normal focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
    />
    {value && (
      <button
        onClick={() => onChange('')}
        title="Xóa từ khóa"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

/**
 * Kỳ đang xem, mặc định là THÁNG HIỆN TẠI CỦA SERVER — dùng cặp với `MonthPicker`.
 *
 * ─── Vì sao không chỉ `useState(currentMonth)` ───────────────────────────────
 * Giờ server suy ra từ header `Date` của response HTTP, mà lúc component render lần
 * đầu thì thường CHƯA có response nào — `currentMonth()` khi đó rơi về đồng hồ máy.
 * Máy lệch 2 tháng là host mở trang ra đã đứng sẵn ở tháng 8 trong khi hệ thống đang
 * ở tháng 10, và không có gì báo cho họ biết.
 *
 * Nên: chờ tới lúc bắt được giờ server rồi nhảy về đúng kỳ — nhưng CHỈ khi host chưa
 * tự đổi kỳ. Họ chủ động lùi về tháng cũ để xem lại mà bị kéo về tháng hiện tại thì
 * còn khó chịu hơn hẳn.
 */
export const useServerPeriod = (): [string, (ym: string) => void] => {
  const [period, setPeriodRaw] = useState(currentMonth);
  /** Host đã tự chọn kỳ chưa — đã chọn thì không tự động kéo đi đâu nữa. */
  const touched = useRef(false);

  useEffect(() => {
    const snap = () => {
      if (touched.current) return;
      const ym = currentMonth();
      setPeriodRaw(prev => (prev === ym ? prev : ym));
    };
    if (isServerTimeSynced()) { snap(); return; }
    // Thăm dò ngắn cho tới response đầu tiên rồi dừng hẳn — không phải vòng lặp vô hạn.
    const timer = setInterval(() => {
      if (!isServerTimeSynced()) return;
      clearInterval(timer);
      snap();
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const setPeriod = (ym: string) => {
    touched.current = true;
    setPeriodRaw(ym);
  };

  return [period, setPeriod];
};

// ── Chọn kỳ (tháng) ──────────────────────────────────────────────────────────
/**
 * Trần mặc định là kỳ hiện tại theo GIỜ SERVER, đọc lại mỗi lần render.
 *
 * Trước 30/08/2026 chỗ này dùng một hằng số đọc đồng hồ MÁY (tính lúc nạp
 * module). Máy lệch chậm 2 tháng so với server là trần đứng ở tháng 8 trong khi hệ
 * thống đã sang tháng 10 — mọi kỳ từ tháng 8 trở đi đều bị coi là "đã ở kỳ mới nhất",
 * nút "kỳ sau" tắt vĩnh viễn: host lùi về tháng trước rồi KHÔNG quay lại được.
 */
export const MonthPicker = ({
  value, onChange, max = currentMonth(),
}: { value: string; onChange: (ym: string) => void; max?: string }) => {
  const atMax = value >= max;
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <button
        onClick={() => onChange(shiftMonth(value, -1))}
        title="Kỳ trước"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="month"
        value={value}
        max={max}
        onChange={e => e.target.value && onChange(e.target.value)}
        // Locale vi-VN render "Tháng Tám 2026" — cần rộng hơn mặc định để không bị cắt.
        className="w-[176px] cursor-pointer rounded-lg border-0 bg-transparent px-1 text-center text-sm font-semibold text-slate-800 outline-none"
      />
      <button
        onClick={() => !atMax && onChange(shiftMonth(value, 1))}
        disabled={atMax}
        title={atMax ? 'Đã ở kỳ mới nhất' : 'Kỳ sau'}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};

// ── Chip lọc trạng thái ──────────────────────────────────────────────────────
export interface ChipOption<T extends string> { key: T; label: string; count?: number }

export function ChipFilter<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: ChipOption<T>[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map(o => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              on ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${on ? 'bg-white/25' : 'bg-white text-slate-500'}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Select lọc / sắp xếp ─────────────────────────────────────────────────────
export function SelectFilter<T extends string>({
  value, onChange, options, icon: Icon, title, widthClass = 'w-[190px]',
}: {
  value: T; onChange: (v: T) => void; options: { key: T; label: string }[];
  icon?: LucideIcon; title?: string; widthClass?: string;
}) {
  return (
    <div className={`relative ${widthClass}`} title={title}>
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className={`w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 ${Icon ? 'pl-9' : 'pl-3'} pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100`}
      >
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
    </div>
  );
}

// ── Khung thanh lọc ──────────────────────────────────────────────────────────
export const FilterBar = ({
  children, activeCount = 0, onReset,
}: { children: ReactNode; activeCount?: number; onReset?: () => void }) => (
  <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4">
    {children}
    {activeCount > 0 && onReset && (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Đang áp dụng {activeCount} bộ lọc
        </span>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
        >
          <RotateCcw className="h-3 w-3" /> Xóa lọc
        </button>
      </div>
    )}
  </div>
);

// ── Phân trang ───────────────────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export const Pagination = ({
  page, perPage, total, onPage, onPerPage, unit = 'dòng',
}: {
  page: number; perPage: number; total: number;
  onPage: (p: number) => void; onPerPage: (n: number) => void; unit?: string;
}) => {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safe = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safe - 1) * perPage + 1;
  const to = Math.min(safe * perPage, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        Hiển thị <b className="text-slate-800 tabular-nums">{from}–{to}</b> trên{' '}
        <b className="text-slate-800 tabular-nums">{total}</b> {unit}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Mỗi trang
          <select
            value={perPage}
            onChange={e => { onPerPage(Number(e.target.value)); onPage(1); }}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
          >
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPage(Math.max(1, safe - 1))}
              disabled={safe <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs font-bold tabular-nums text-slate-500">{safe} / {totalPages}</span>
            <button
              onClick={() => onPage(Math.min(totalPages, safe + 1))}
              disabled={safe >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/** Cắt trang an toàn khi bộ lọc làm ngắn danh sách. */
export const pageSlice = <T,>(rows: T[], page: number, perPage: number): T[] => {
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const safe = Math.min(page, totalPages);
  return rows.slice((safe - 1) * perPage, safe * perPage);
};

// ── Trạng thái rỗng / đang tải trong bảng ────────────────────────────────────
export const TableState = ({
  colSpan, loading, empty, filtered,
}: { colSpan: number; loading: boolean; empty: string; filtered?: boolean }) => (
  <tr>
    <td colSpan={colSpan} className="px-5 py-12 text-center">
      {loading ? (
        <span className="inline-flex items-center gap-2 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
          Đang tải dữ liệu…
        </span>
      ) : (
        <>
          <p className="text-sm text-slate-400">{filtered ? 'Không có kết quả khớp bộ lọc.' : empty}</p>
          {filtered && <p className="mt-1 text-xs text-slate-400">Thử xóa bớt bộ lọc hoặc từ khóa tìm kiếm.</p>}
        </>
      )}
    </td>
  </tr>
);
