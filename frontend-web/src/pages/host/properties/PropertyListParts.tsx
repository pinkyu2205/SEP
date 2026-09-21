/**
 * Các thành phần hiển thị của màn "Bất động sản" (Host).
 *
 *  - StatTile            : thẻ số liệu, bấm để lọc nhanh
 *  - PendingApprovalPanel: khối nổi bật liệt kê hồ sơ đang chờ Host phê duyệt
 *  - PropertyCard        : thẻ tòa nhà (khai thác + thu tiền + giá + quản lý).
 *                          KHÔNG có ảnh — xem chú thích hàng badge bên trong.
 *  - PropertyTable       : chế độ xem bảng, dễ so sánh nhiều căn một lúc
 *  - ListPagination      : phân trang có rút gọn
 *
 * State/bộ lọc nằm ở ./propertyListState (giữ file này chỉ export component để
 * React Fast Refresh hoạt động).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, ArrowDownUp, ArrowRight, Building2, ChevronLeft, ChevronRight, DoorOpen,
  Hammer, Home, KeyRound, Layers, LayoutGrid, MapPin, Receipt, RotateCcw, Ruler, Search, SlidersHorizontal,
  Table2, User, Wallet, X, type LucideIcon,
} from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import { propertyService } from '@/services/property.service';
import { normalizeVi } from '@/utils/helpers';
import {
  STATUS_BADGE, HOST_STATUS_CHIPS, SORT_LABEL, TYPE_LABEL, MANAGER_LABEL,
  RENTAL_FILTER_LABEL, BILL_FILTER_LABEL,
  GRID_SIZES, TABLE_SIZES, typeLabel, formatVnd, formatRoomPriceTop,
  type PropertyListFilters, type SortKey, type TypeFilter, type ManagerFilter,
  type RentalFilter, type BillFilter, type RoomPriceRange,
} from './propertyListState';
import {
  RENTAL_META, BILL_META,
  type BillSource, type PropertyOperationStatus,
} from './propertyOperationStatus';

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
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p>
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
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
            Đang lọc
          </span>
        ) : (
          <>
            {pct != null && <span className={`text-[13px] font-black tabular-nums ${t.text}`}>{pct}%</span>}
            {helper && <span className="truncate text-[13px] text-slate-500">{helper}</span>}
          </>
        )}
      </div>
    </Tag>
  );
};

// ─── Hồ sơ chờ Host phê duyệt ───────────────────────────────────────────────
/**
 * Hồ sơ chờ duyệt giá có HAI loại, việc Host phải làm khác hẳn nhau:
 *
 *  - NHÀ MỚI (chỉ có đợt cải tạo 1, hoặc không cải tạo): chưa từng cho thuê. Host đọc toàn bộ
 *    tiền bỏ ra, đặt mục tiêu lãi, chốt giá rồi KÍCH HOẠT cho nhà nhận khách.
 *  - CẢI TẠO BỔ SUNG (có đợt ≥ 2): nhà đang cho thuê, giá cũ đã duyệt. Host chỉ xem đợt vừa làm
 *    thêm gì và chốt GIÁ NIÊM YẾT MỚI — khách đang ở giữ nguyên giá hợp đồng.
 *
 * Trộn chung một danh sách thì Host không biết bấm vào sẽ gặp màn nào, cũng không ưu tiên được
 * (nhà đang có khách mà treo duyệt lại giá lâu thì phòng trống vẫn niêm yết giá cũ).
 *
 * Phân loại bằng đúng quy tắc màn /host/review/:id dùng để chọn giao diện
 * (`sessions.some(s => s.sessionNumber >= 2)`), nên bấm vào cột nào là ra đúng màn cột đó.
 */
export type PendingKind = 'fresh' | 'repricing';

/** Số đợt cải tạo lớn nhất của mỗi hồ sơ chờ duyệt; `undefined` = đang tải. */
const usePendingSessions = (items: PropertyResponse[]) => {
  const [maxSession, setMaxSession] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const idsKey = items.map(p => p.id).join(',');

  useEffect(() => {
    if (items.length === 0) return;
    let alive = true;
    setLoading(true);
    // Danh sách bất động sản không kèm đợt cải tạo — phải hỏi riêng từng hồ sơ. Số hồ sơ chờ
    // duyệt thường chỉ vài cái nên gọi song song là đủ nhanh.
    Promise.allSettled(items.map(p => propertyService.getRenovationSessions(p.id)))
      .then(results => {
        if (!alive) return;
        const next: Record<number, number> = {};
        results.forEach((r, i) => {
          next[items[i].id] = r.status === 'fulfilled'
            ? Math.max(0, ...r.value.map(s => s.sessionNumber ?? 0))
            : 0; // hỏi lỗi thì coi như nhà mới — màn duyệt giá tự chọn lại cho đúng khi mở
        });
        setMaxSession(next);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const kindOf = (p: PropertyResponse): PendingKind => ((maxSession[p.id] ?? 0) >= 2 ? 'repricing' : 'fresh');
  return { maxSession, loading, kindOf };
};

const KIND_META: Record<PendingKind, {
  title: string; desc: string; icon: LucideIcon; head: string; count: string; hover: string; action: string;
}> = {
  fresh: {
    title: 'Nhà mới — duyệt giá lần đầu',
    desc: 'Chưa từng cho thuê. Duyệt xong nhà được kích hoạt và bắt đầu nhận khách.',
    icon: Home,
    head: 'border-amber-200 bg-amber-50',
    count: 'bg-amber-500 text-white',
    hover: 'hover:bg-amber-50 group-hover:text-amber-700',
    action: 'text-amber-600',
  },
  repricing: {
    title: 'Cải tạo bổ sung — duyệt lại giá',
    desc: 'Nhà đang cho thuê vừa cải tạo thêm. Chốt giá niêm yết mới; khách đang ở giữ giá hợp đồng.',
    icon: Hammer,
    head: 'border-indigo-200 bg-indigo-50',
    count: 'bg-indigo-600 text-white',
    hover: 'hover:bg-indigo-50 group-hover:text-indigo-700',
    action: 'text-indigo-600',
  },
};

/** 1 dòng hồ sơ chờ duyệt. */
const PendingRow = ({ p, kind, session, onOpen }: {
  p: PropertyResponse;
  kind: PendingKind;
  session?: number;
  onOpen: () => void;
}) => {
  const meta = KIND_META[kind];
  return (
    <button onClick={onOpen}
      className={`group flex w-full min-w-0 items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left transition ${meta.hover.split(' ')[0]}`}>
      <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
        {p.imageUrls?.length
          ? <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
          : <Building2 className="h-4 w-4 text-slate-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1.5 text-sm font-bold text-slate-800 transition ${meta.hover.split(' ')[1]}`}>
          <span className="truncate">{p.propertyName}</span>
          {kind === 'repricing' && session != null && session >= 2 && (
            <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">
              Đợt {session}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{p.fullAddress || p.shortAddress}</span>
        </p>
      </div>
      <span className={`flex shrink-0 items-center gap-0.5 text-xs font-bold ${meta.action}`}>
        Duyệt <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
};

/** Một cột trong popup — mỗi loại hồ sơ một cột, cuộn riêng. */
const PendingColumn = ({ kind, rows, total, loading, maxSession, onOpen }: {
  kind: PendingKind;
  rows: PropertyResponse[];
  total: number;
  loading: boolean;
  maxSession: Record<number, number>;
  onOpen: (p: PropertyResponse) => void;
}) => {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200">
      <div className={`border-b px-4 py-3 ${meta.head}`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-600" />
          <h4 className="flex-1 text-sm font-black text-slate-800">{meta.title}</h4>
          <span className={`min-w-[1.75rem] rounded-full px-2 py-0.5 text-center text-xs font-black ${meta.count}`}>
            {loading ? '…' : total}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{meta.desc}</p>
      </div>
      <div className="min-h-[8rem] flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <p className="py-10 text-center text-xs text-slate-400">Đang phân loại hồ sơ…</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">
            {total === 0 ? 'Không có hồ sơ nào' : 'Không có hồ sơ nào khớp từ khóa'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(p => (
              <PendingRow key={p.id} p={p} kind={kind} session={maxSession[p.id]} onOpen={() => onOpen(p)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/**
 * Popup đầy đủ: hai cột "Nhà mới" và "Cải tạo bổ sung", tìm kiếm áp cho cả hai. Mỗi cột cuộn
 * riêng nên chịu được vài trăm hồ sơ mà popup không dài ra.
 */
const PendingApprovalModal = ({ items, sessions, onOpen, onClose }: {
  items: PropertyResponse[];
  sessions: ReturnType<typeof usePendingSessions>;
  onOpen: (p: PropertyResponse) => void;
  onClose: () => void;
}) => {
  const [q, setQ] = useState('');
  const { loading, kindOf, maxSession } = sessions;

  const filtered = useMemo(() => {
    const kw = normalizeVi(q.trim());
    if (!kw) return items;
    return items.filter(p =>
      [p.propertyName, p.fullAddress, p.shortAddress, p.zoneName]
        .filter(Boolean).map(v => normalizeVi(String(v))).join(' ').includes(kw)
    );
  }, [items, q]);

  const fresh = items.filter(p => kindOf(p) === 'fresh');
  const repricing = items.filter(p => kindOf(p) === 'repricing');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-white">
            {items.length}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-900">Hồ sơ chờ bạn phê duyệt giá</h3>
            <p className="text-xs text-slate-500">
              {loading
                ? 'Bấm vào một hồ sơ để xem và duyệt'
                : <>{fresh.length} nhà mới · {repricing.length} cải tạo bổ sung — bấm vào một hồ sơ để xem và duyệt</>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tìm kiếm */}
        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="Tìm theo tên tòa nhà, địa chỉ, khu vực... (không cần dấu)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100" />
            {q && (
              <button onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Hai cột */}
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2 md:overflow-hidden">
          <PendingColumn kind="fresh" total={fresh.length} loading={loading} maxSession={maxSession}
            rows={filtered.filter(p => kindOf(p) === 'fresh')} onOpen={onOpen} />
          <PendingColumn kind="repricing" total={repricing.length} loading={loading} maxSession={maxSession}
            rows={filtered.filter(p => kindOf(p) === 'repricing')} onOpen={onOpen} />
        </div>

        {/* Chân */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="text-xs text-slate-500">
            {q
              ? <>Khớp <b className="text-slate-800">{filtered.length}</b> / {items.length} hồ sơ</>
              : <>Tổng <b className="text-slate-800">{items.length}</b> hồ sơ chờ duyệt</>}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Dải nhắc việc gọn 1 dòng: số lượng theo từng loại + tên vài hồ sơ đầu, bấm vào mở popup hai
 * cột. Chiều cao không đổi dù có 10 hay 1000 hồ sơ.
 */
export const PendingApprovalPanel = ({ items, onOpen }: {
  items: PropertyResponse[];
  onOpen: (p: PropertyResponse) => void;
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const sessions = usePendingSessions(items);
  if (items.length === 0) return null;

  const repricingCount = sessions.loading ? 0 : items.filter(p => sessions.kindOf(p) === 'repricing').length;
  const freshCount = items.length - repricingCount;
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
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-tight text-amber-900">
            {items.length} hồ sơ đang chờ bạn phê duyệt giá
            {!sessions.loading && (
              <span className="flex items-center gap-1.5">
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">{freshCount} nhà mới</span>
                {repricingCount > 0 && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white">{repricingCount} cải tạo bổ sung</span>
                )}
              </span>
            )}
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
          sessions={sessions}
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
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-black leading-none text-white">
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
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${
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
          <FilterSelect label="Tình trạng khai thác" value={f.rental} onChange={v => f.setRental(v as RentalFilter)}>
            {(Object.keys(RENTAL_FILTER_LABEL) as RentalFilter[]).map(k => (
              <option key={k} value={k}>{RENTAL_FILTER_LABEL[k]}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Thu tiền kỳ này" value={f.bill} onChange={v => f.setBill(v as BillFilter)}>
            {(Object.keys(BILL_FILTER_LABEL) as BillFilter[]).map(k => (
              <option key={k} value={k}>{BILL_FILTER_LABEL[k]}</option>
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
          {f.rental !== 'all' && <ActiveChip label={RENTAL_FILTER_LABEL[f.rental]} onClear={() => f.setRental('all')} />}
          {f.bill !== 'all' && <ActiveChip label={BILL_FILTER_LABEL[f.bill]} onClear={() => f.setBill('all')} />}
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
// ─── Tình trạng khai thác & thu tiền ────────────────────────────────────────

/**
 * "12.400.000" → "12,4tr" — đủ để host biết nợ nhiều hay ít mà không chiếm cả dòng.
 *
 * Khác `fmtMillion` ở @/utils/period ("12tr", làm tròn về triệu, không có tỷ/nghìn):
 * hàm kia dùng cho trục biểu đồ, nơi nhãn phải cực ngắn và sai số không quan trọng.
 * Ở đây là SỐ TIỀN NỢ nên phải giữ một chữ số thập phân. Đừng gộp hai hàm làm một.
 */
const shortVnd = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}tr`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
};

export const RentalBadge = ({ op, className = '' }: {
  op?: PropertyOperationStatus;
  className?: string;
}) => {
  if (!op || op.rental === 'UNKNOWN') return null;
  const m = RENTAL_META[op.rental];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m.cls} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

/**
 * Thanh tỉ lệ phòng của nhà CHIA PHÒNG.
 *
 * Vẽ theo tỉ lệ chứ không viết thành câu: một dòng chữ liệt kê 5 con số bắt host tự
 * cộng nhẩm mới biết còn bao nhiêu chỗ — cùng lý do `propertyOccupancy.service` đã bỏ
 * hàm `occupancySummary()` cũ. Chỉ chú thích những nhóm KHÁC 0 để card không rối.
 */
const OccupancyBar = ({ op }: { op: PropertyOperationStatus }) => {
  const { occ } = op;
  if (occ.roomCount === 0) return null;
  const seg = [
    { n: occ.rented,      cls: 'bg-emerald-500', label: 'có khách' },
    { n: occ.heldByDraft, cls: 'bg-violet-500',  label: 'chờ đón' },
    { n: occ.available,   cls: 'bg-slate-300',   label: 'trống' },
    { n: occ.maintenance, cls: 'bg-amber-500',   label: 'bảo trì' },
    { n: occ.notReady,    cls: 'bg-slate-200',   label: 'chưa mở' },
  ].filter(s => s.n > 0);

  return (
    <div>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-slate-100">
        {seg.map(s => (
          <div key={s.label} className={s.cls} style={{ width: `${(s.n / occ.roomCount) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-500">
        {seg.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${s.cls}`} />
            {s.n} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * Dòng "Khai thác" — trả lời "căn này đang ra tiền chưa".
 *
 * Nguyên căn không có phòng để vẽ thanh tỉ lệ, nên nói bằng chữ + hạn hợp đồng: với
 * loại này thứ host cần biết tiếp theo là bao giờ khách đi để còn tìm khách mới.
 */
const OccupancyRow = ({ op }: { op?: PropertyOperationStatus }) => {
  if (!op || op.rental === 'UNKNOWN') return null;

  return (
    <CardRow icon={KeyRound} label="Khai thác">
      {op.occ.wholeHouse ? (
        <span className="text-[13px] font-semibold text-slate-700">
          {op.rental === 'RENTED' ? (
            <>
              {op.tenantName ? <b className="text-slate-900">{op.tenantName}</b> : 'Đang có khách ở'}
              {op.contractEndDate && (
                <span className="block text-xs font-semibold text-slate-500">
                  HĐ đến {op.contractEndDate.split('T')[0].split('-').reverse().join('/')}
                </span>
              )}
            </>
          ) : op.rental === 'INCOMING' ? 'Đã có hồ sơ chờ đón khách'
            : 'Chưa có khách nào'}
        </span>
      ) : op.occ.roomCount === 0 ? (
        <span className="text-[13px] font-semibold text-slate-400">Chưa tạo phòng</span>
      ) : (
        <span className="block w-[150px]">
          <span className="block text-[13px] font-black tabular-nums text-slate-800">
            {op.occ.rented}/{op.occ.roomCount} phòng có khách
          </span>
          <OccupancyBar op={op} />
        </span>
      )}
    </CardRow>
  );
};

/**
 * Dòng "Hoá đơn kỳ này" — khách đã trả chưa.
 *
 * ⚠️ Ở chế độ `rent-only` (BE chặn host ở `/manager/invoices`) dữ liệu CHỈ có tiền
 * phòng. Tuyệt đối không viết "đã thu đủ" trong trường hợp đó: khách đang nợ tiền
 * điện mà màn hình báo xanh thì tệ hơn hẳn việc không hiện gì. Nên chữ đổi thành
 * "đã thu đủ tiền phòng" và có ghi chú nguồn.
 */
const BillRow = ({ op, source }: { op?: PropertyOperationStatus; source: BillSource }) => {
  if (!op || source === 'none') return null;
  const { bills } = op;
  const m = BILL_META[op.billState];
  const unpaid = bills.pending + bills.overdue;
  const rentOnly = source === 'rent-only';
  const tone = op.billState === 'OVERDUE' ? 'rose'
    : op.billState === 'PENDING' ? 'amber'
      : op.billState === 'CLEAR' ? 'emerald' : 'plain';

  return (
    <CardRow icon={Receipt} label={rentOnly ? 'Tiền phòng' : 'Hoá đơn'} tone={tone}>
      {bills.total === 0 ? (
        <span className="text-[13px] font-semibold text-slate-400">Kỳ này chưa có hoá đơn</span>
      ) : unpaid === 0 ? (
        <span className={`text-[13px] font-black ${m.text}`}>
          Đã thu đủ {bills.paid}/{bills.total}
          {rentOnly && <span className="block text-xs font-semibold text-slate-500">chỉ tính tiền phòng</span>}
        </span>
      ) : (
        <span className={`text-[13px] font-black ${m.text}`}>
          {bills.paid}/{bills.total} đã thu
          <span className="block text-xs font-bold">
            còn {shortVnd(bills.outstanding)}
            {bills.overdue > 0 && ` · ${bills.overdue} quá hạn`}
          </span>
        </span>
      )}
    </CardRow>
  );
};

/**
 * Cảnh báo dữ liệu hoá đơn đang thiếu — hiện MỘT lần ở đầu trang, không lặp mỗi card.
 *
 * Im lặng trong lúc còn tải: `billSource` khởi tạo là `'none'`, nên không chặn thì mỗi
 * lần vào trang đều nháy lên câu "chưa lấy được dữ liệu" rồi mới tự biến mất.
 */
export const BillSourceNote = ({ source, loading }: { source: BillSource; loading: boolean }) => {
  if (loading || source === 'full') return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {source === 'rent-only' ? (
        <span>
          Cột hoá đơn hiện <b>chỉ tính tiền phòng</b>. Tiền điện, nước và dịch vụ chưa
          đếm được vì máy chủ chưa mở quyền xem hoá đơn đầy đủ cho chủ nhà — một căn báo
          &quot;đã thu đủ&quot; vẫn có thể đang nợ tiền điện.
        </span>
      ) : (
        <span>Chưa lấy được dữ liệu hoá đơn của kỳ này, phần thu tiền tạm ẩn.</span>
      )}
    </div>
  );
};

/**
 * Giá thuê — phân biệt rõ TIỀN ĐANG THU với GIÁ CHÀO.
 *
 * ─── Vì sao phải tách (30/08/2026) ───────────────────────────────────────────
 * Card cũ đọc `p.price` (giá niêm yết) và gọi nó là "Giá thuê"; màn chi tiết đọc
 * `appliedPrice` (giá hợp đồng đang chạy) và cũng gọi là "Giá thuê". Cùng một nhãn,
 * hai con số khác nhau ở hai màn — host không biết tin số nào.
 *
 * Nay: căn có khách thì hiện TIỀN THẬT lấy từ hợp đồng (`activeRent`), căn trống thì
 * hiện giá niêm yết và nói rõ đó là giá chào. Khác nhau thì ghi thêm dòng niêm yết để
 * host thấy được chênh lệch (vd đã tăng giá hàng năm).
 *
 * Dùng `activeRent` từ hợp đồng chứ không phải `appliedPrice` của nhà: nhà chia phòng
 * không có con số nào ở cấp toà nhà nói được "căn này đang thu bao nhiêu" — mỗi phòng
 * một khách một giá. Hợp đồng trả lời được cả hai loại. Xem chú thích `activeRent`.
 */
/** Một dòng trong bảng thông tin của card: icon + nhãn bên trái, nội dung bên phải. */
const CardRow = ({ icon: Icon, label, tone = 'plain', children }: {
  icon: LucideIcon;
  label: string;
  /** Nền nhạt để dòng quan trọng nổi lên khỏi các dòng còn lại. */
  tone?: 'plain' | 'emerald' | 'indigo' | 'amber' | 'rose';
  children: ReactNode;
}) => {
  const bg = {
    plain: 'bg-white', emerald: 'bg-emerald-50/70', indigo: 'bg-indigo-50/60',
    amber: 'bg-amber-50/70', rose: 'bg-rose-50/70',
  }[tone];
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 ${bg}`}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" />{label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
};

const PriceRow = ({ p, roomPrice, op }: {
  p: PropertyResponse;
  roomPrice?: RoomPriceRange | null;
  op?: PropertyOperationStatus;
}) => {
  const listed = p.price ?? null;
  const earning = (op?.activeRent ?? 0) > 0 ? op!.activeRent : null;
  // Chỉ nhắc giá niêm yết khi nó THỰC SỰ khác tiền đang thu — bằng nhau mà vẫn ghi
  // hai dòng thì card dài ra vì một thông tin không nói thêm được gì.
  const showListed = earning != null && listed != null && listed !== earning;

  return (
    <CardRow icon={Wallet} label={earning != null ? 'Đang thu' : 'Giá chào'}
      tone={earning != null ? 'emerald' : 'indigo'}>
      <span className={`text-[15px] font-black ${earning != null ? 'text-emerald-700' : 'text-indigo-700'}`}>
        {earning != null ? (
          <>
            {formatVnd(earning)}
            {op!.activeContracts > 1 && (
              <span className="block text-xs font-semibold text-emerald-600">
                từ {op!.activeContracts} hợp đồng
              </span>
            )}
          </>
        ) : listed != null ? (
          formatVnd(listed)
        ) : roomPrice ? (
          <>
            {formatRoomPriceTop(roomPrice)}
            <span className="block text-xs font-semibold text-indigo-500">
              cao nhất trong {roomPrice.rooms} phòng
            </span>
          </>
        ) : (
          <span className="text-[13px] font-semibold text-slate-400">Chưa định giá</span>
        )}
      </span>
      {showListed && (
        <span className="block text-xs font-semibold text-slate-500">
          niêm yết {formatVnd(listed!)}
        </span>
      )}
    </CardRow>
  );
};

export const PropertyCard = ({ p, roomPrice, op, billSource, onClick }: {
  p: PropertyResponse;
  /** Khoảng giá suy từ phòng — chỉ có với nhà chia phòng chưa đặt giá ở cấp toà nhà. */
  roomPrice?: RoomPriceRange | null;
  /** Tình trạng khai thác & thu tiền; `undefined` khi chưa nạp xong → card im lặng. */
  op?: PropertyOperationStatus;
  billSource: BillSource;
  onClick: () => void;
}) => {
  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.DRAFT;
  const noManager = !p.operationManagerId;

  return (
    <div onClick={onClick}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:border-indigo-300 hover:shadow-lg">

      {/*
        ── Nội dung ──
        Trước 30/08/2026 ba khối Giá / Khai thác / Hoá đơn là ba hộp có viền riêng, xếp
        cách nhau `gap-3`. Mỗi hộp tự có padding + viền nên giữa chúng luôn có ba lớp
        khoảng trắng chồng lên nhau — card trông rời rạc và loãng, mà chữ thì chỉ
        10–11px nên phần "có nội dung" lại càng ít.

        Nay gộp thành MỘT bảng liền chia dòng bằng `divide-y`: nhãn trái, số phải. Cùng
        lượng thông tin nhưng ngắn hơn hẳn, và mắt có một cột số thẳng hàng để quét dọc.
      */}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="min-w-0">
          {/*
            Hàng badge, thay cho khối ảnh đã bỏ.

            Ảnh trên card không giúp host quyết định gì — muốn xem nhà thì bấm vào chi
            tiết, mà phần lớn nhà lại chưa có ảnh nên chỗ đó chỉ là một mảng trống cao
            160px đẩy mọi thông tin thật xuống dưới. Ba badge trước đây nổi trên ảnh
            nay xếp thành một hàng ở đây: cùng thông tin, tốn một dòng thay vì cả khối.

            Badge khai thác đứng TÁCH khỏi badge trạng thái bằng dấu chấm phân cách vì
            hai thứ trả lời hai câu khác nhau ("hồ sơ xong chưa" và "có khách chưa"),
            dính liền nhau dễ bị đọc thành một.
          */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />{badge.label}
            </span>
            <RentalBadge op={op} />
            {noManager && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-1 text-xs font-bold text-white">
                <AlertCircle className="h-3.5 w-3.5" /> Chưa có QL
              </span>
            )}
          </div>
          <h3 className="truncate text-[17px] font-extrabold leading-tight text-slate-900 transition group-hover:text-indigo-700">
            {p.propertyName}
          </h3>
          <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />{p.fullAddress || p.shortAddress}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
            {p.wholeHouse !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                p.wholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              }`}>
                <Home className="h-3.5 w-3.5" />{typeLabel(p)}
              </span>
            )}
            {p.zoneName && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{p.zoneName}</span>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          <PriceRow p={p} roomPrice={roomPrice} op={op} />
          <OccupancyRow op={op} />
          <BillRow op={op} source={billSource} />
        </div>

        {/*
          Quy mô nhà gộp thành MỘT dòng thay cho lưới 3 ô như trước: số phòng thật đã
          nằm ở dòng Khai thác bên trên, để nguyên lưới cũ là hiện hai con số phòng
          cạnh nhau (khai báo và đếm thật) mà không nói rõ cái nào là cái nào.
        */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1"><DoorOpen className="h-3.5 w-3.5 text-slate-400" />{p.totalRooms || 0} phòng</span>
          <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-slate-400" />{p.totalFloor ?? p.floorCount ?? '—'} tầng</span>
          <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5 text-slate-400" />{p.areaSize ? `${p.areaSize}m²` : '—'}</span>
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            {p.operationManagerName ? (
              <span className="truncate font-semibold text-slate-600">{p.operationManagerName}</span>
            ) : p.operationManagerId ? (
              <span className="truncate font-semibold text-slate-500">Đã gán quản lý</span>
            ) : (
              <span className="font-semibold text-rose-500">Chưa có quản lý</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-indigo-600">
            Chi tiết <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Chế độ xem bảng ────────────────────────────────────────────────────────
/** Ô "Khai thác" trong bảng — bản một dòng của `OccupancyBlock`. */
const OccupancyCell = ({ op }: { op?: PropertyOperationStatus }) => {
  if (!op || op.rental === 'UNKNOWN') return <span className="text-[13px] text-slate-300">—</span>;
  return (
    <div className="w-[180px] space-y-1">
      <RentalBadge op={op} />
      {!op.occ.wholeHouse && op.occ.roomCount > 0 && (
        <p className="whitespace-nowrap text-xs font-bold tabular-nums text-slate-500">
          {op.occ.rented}/{op.occ.roomCount} phòng có khách
          {op.occ.available > 0 && <span className="font-semibold text-slate-400"> · {op.occ.available} trống</span>}
        </p>
      )}
    </div>
  );
};

/** Ô "Thu tiền kỳ này" trong bảng. Xem chú thích `BillLine` về chế độ rent-only. */
const BillCell = ({ op, source }: { op?: PropertyOperationStatus; source: BillSource }) => {
  if (!op || source === 'none') return <span className="text-[13px] text-slate-300">—</span>;
  const { bills } = op;
  const m = BILL_META[op.billState];
  const unpaid = bills.pending + bills.overdue;

  if (bills.total === 0) {
    return <span className="whitespace-nowrap text-[13px] text-slate-300">Chưa có hoá đơn</span>;
  }
  return (
    <div className="w-[170px]">
      <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-black tabular-nums">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
        <span className={m.text}>{bills.paid}/{bills.total} đã thu</span>
      </p>
      {unpaid > 0 && (
        <p className="mt-0.5 whitespace-nowrap text-xs font-bold text-slate-500">
          còn {formatVnd(bills.outstanding)}
          {bills.overdue > 0 && <span className="text-rose-600"> · {bills.overdue} quá hạn</span>}
        </p>
      )}
    </div>
  );
};

/** Bản một ô của `PriceBlock` cho chế độ bảng — xem chú thích ở đó. */
const PriceCell = ({ p, roomPrice, op }: {
  p: PropertyResponse;
  roomPrice?: RoomPriceRange | null;
  op?: PropertyOperationStatus;
}) => {
  const listed = p.price ?? null;
  const earning = (op?.activeRent ?? 0) > 0 ? op!.activeRent : null;

  if (earning != null) {
    return (
      <>
        <span className="whitespace-nowrap font-black text-emerald-700">{formatVnd(earning)}</span>
        <span className="block whitespace-nowrap text-[11px] font-semibold text-emerald-500">
          đang thu{op!.activeContracts > 1 && ` · ${op!.activeContracts} HĐ`}
        </span>
        {listed != null && listed !== earning && (
          <span className="block whitespace-nowrap text-[11px] font-semibold text-slate-400">
            niêm yết {formatVnd(listed)}
          </span>
        )}
      </>
    );
  }

  if (listed != null) {
    return (
      <>
        <span className="whitespace-nowrap font-black text-indigo-700">{formatVnd(listed)}</span>
        <span className="block text-[11px] font-semibold text-indigo-400">giá chào</span>
      </>
    );
  }

  if (roomPrice) {
    return (
      <>
        <span className="whitespace-nowrap font-black text-indigo-700">{formatRoomPriceTop(roomPrice)}</span>
        <span className="block whitespace-nowrap text-[11px] font-semibold text-indigo-400">
          giá chào · cao nhất {roomPrice.rooms} phòng
        </span>
      </>
    );
  }

  return <span className="text-[13px] text-slate-300">Chưa định giá</span>;
};

export const PropertyTable = ({ rows, roomPrices = {}, opStatus, billSource, onRowClick }: {
  rows: PropertyResponse[];
  /** id nhà → khoảng giá suy từ phòng (nhà chia phòng chưa đặt giá ở cấp toà nhà). */
  roomPrices?: Record<number, RoomPriceRange | null>;
  opStatus: Map<number, PropertyOperationStatus>;
  billSource: BillSource;
  onRowClick: (p: PropertyResponse) => void;
}) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
    {/*
      Rộng tối thiểu tăng theo 2 cột mới. Để hẹp thì trình duyệt bóp chữ xuống dòng —
      "Nguyên căn" vỡ làm hai, số tiền tách chữ "đ" xuống dòng riêng, đọc rất khó.
      Thà cuộn ngang còn hơn.
    */}
    <table className="w-full min-w-[1320px] text-sm">
      <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-widest text-slate-400">
        <tr>
          <th className="px-4 py-3">Tòa nhà</th>
          <th className="px-4 py-3">Khu vực</th>
          <th className="px-4 py-3">Loại hình</th>
          <th className="px-4 py-3">Khai thác</th>
          <th className="px-4 py-3">{billSource === 'rent-only' ? 'Tiền phòng kỳ này' : 'Hoá đơn kỳ này'}</th>
          <th className="px-4 py-3 text-right">Giá thuê</th>
          <th className="px-4 py-3">Quản lý vận hành</th>
          <th className="px-4 py-3">Trạng thái</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(p => {
          const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.DRAFT;
          const op = opStatus.get(p.id);
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
                <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {p.zoneName || '—'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${
                  p.wholeHouse === null ? 'bg-slate-100 text-slate-500'
                    : p.wholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {typeLabel(p)}
                </span>
              </td>
              <td className="px-4 py-3"><OccupancyCell op={op} /></td>
              <td className="px-4 py-3"><BillCell op={op} source={billSource} /></td>
              <td className="px-4 py-3 text-right">
                <PriceCell p={p} roomPrice={roomPrices[p.id]} op={op} />
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
