import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Filter, MapPin, UserRound, type LucideIcon } from 'lucide-react';
import type { PlatformAccountStatus, PlatformBillStatus, PlatformRole } from '@/types';
import type { PlatformContractStatus } from '@/utils/adminMockData';

export const PAGE_SIZE = 6;

export const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

export const formatShortVnd = (value: number) => `${Math.round(value / 1_000_000)}tr`;

export const moneyTooltip = (value: any) => (typeof value === 'number' ? formatVnd(value) : String(value));

export const roleConfig: Record<PlatformRole, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-slate-950 text-white' },
  host: { label: 'Host/Admin System', color: 'bg-cyan-100 text-cyan-800' },
  manager: { label: 'Manager', color: 'bg-indigo-100 text-indigo-700' },
  tenant: { label: 'Tenant', color: 'bg-emerald-100 text-emerald-700' },
};

export const accountStatusMap: Record<PlatformAccountStatus, { label: string; color: string; dot: string }> = {
  pending_approval: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  active: { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { label: 'Đã vô hiệu', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  locked: { label: 'Đã khóa', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  suspended: { label: 'Tạm ngưng', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  rejected: { label: 'Đã từ chối', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

export const billStatusMap: Record<PlatformBillStatus, { label: string; color: string }> = {
  paid: { label: 'Đã thanh toán', color: 'bg-emerald-100 text-emerald-700' },
  unpaid: { label: 'Chưa thanh toán', color: 'bg-amber-100 text-amber-700' },
  overdue: { label: 'Quá hạn', color: 'bg-rose-100 text-rose-700' },
  pending: { label: 'Chờ đối soát', color: 'bg-blue-100 text-blue-700' },
};

export const contractStatusMap: Record<PlatformContractStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Expired', color: 'bg-slate-100 text-slate-600' },
  rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700' },
  terminated: { label: 'Terminated', color: 'bg-zinc-200 text-zinc-700' },
};

export const equipmentStatusMap: Record<string, { label: string; color: string }> = {
  good: { label: 'Hoạt động tốt', color: 'bg-emerald-100 text-emerald-700' },
  broken: { label: 'Đang hỏng', color: 'bg-rose-100 text-rose-700' },
  maintenance: { label: 'Đang bảo trì', color: 'bg-amber-100 text-amber-700' },
  disposed: { label: 'Đã thanh lý', color: 'bg-slate-100 text-slate-600' },
};

export const maintenanceStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: 'Pending', color: 'bg-rose-100 text-rose-700' },
  in_progress: { label: 'In progress', color: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Rejected', color: 'bg-slate-100 text-slate-600' },
};

export const auditSeverityMap = {
  normal: { label: 'Bình thường', color: 'bg-slate-100 text-slate-600' },
  warning: { label: 'Cảnh báo', color: 'bg-amber-100 text-amber-700' },
  critical: { label: 'Nghiêm trọng', color: 'bg-rose-100 text-rose-700' },
};

export const StatusPill = ({ label, color, dot }: { label: string; color: string; dot?: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
    {label}
  </span>
);

export const SectionShell = ({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-cyan-50 p-2.5">
          <Icon className="h-5 w-5 text-cyan-700" />
        </div>
        <div>
          <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

export const KpiCard = ({
  title,
  value,
  icon: Icon,
  color,
  helper,
  onClick,
  active,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
  helper?: string;
  /** Có onClick → thẻ trở thành nút lọc nhanh */
  onClick?: () => void;
  active?: boolean;
}) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
        active
          ? 'border-indigo-400 ring-2 ring-indigo-100'
          : 'border-slate-200'
      } ${onClick ? 'hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          {helper && <p className="mt-1 truncate text-xs text-slate-400">{helper}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Tag>
  );
};

// ─── Hero đầu trang + stepper quy trình ─────────────────────────────────────
export interface HeroStep {
  label: string;
  to: string;
  /** bước hiện tại */
  current?: boolean;
}

/**
 * Đầu trang cho các module thuộc một quy trình nhiều bước: tiêu đề + mô tả +
 * thanh bước (bấm để nhảy qua lại giữa các module).
 */
export const PageHero = ({
  eyebrow, title, subtitle, icon: Icon, steps = [], action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  steps?: HeroStep[];
  action?: ReactNode;
}) => (
  <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-100/50 blur-3xl" />

    <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-500">{eyebrow}</p>
          <h1 className="mt-0.5 text-2xl font-black leading-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {steps.length > 0 && (
          <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 p-1">
            {steps.map((s, i) => (
              <div key={s.to} className="flex items-center">
                {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />}
                <Link to={s.to}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    s.current
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  }`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                    s.current ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>{i + 1}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </Link>
              </div>
            ))}
          </div>
        )}
        {action}
      </div>
    </div>
  </section>
);

// ─── Thẻ số liệu (bấm được để lọc nhanh) ────────────────────────────────────
export type StatTone = 'indigo' | 'blue' | 'emerald' | 'amber' | 'slate' | 'teal' | 'violet' | 'rose';

const STAT_TONE: Record<StatTone, { bar: string; icon: string; text: string }> = {
  indigo:  { bar: 'bg-indigo-500',  icon: 'bg-indigo-50 text-indigo-600',   text: 'text-indigo-600' },
  blue:    { bar: 'bg-blue-500',    icon: 'bg-blue-50 text-blue-600',       text: 'text-blue-600' },
  emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' },
  amber:   { bar: 'bg-amber-500',   icon: 'bg-amber-50 text-amber-600',     text: 'text-amber-600' },
  slate:   { bar: 'bg-slate-400',   icon: 'bg-slate-100 text-slate-600',    text: 'text-slate-600' },
  teal:    { bar: 'bg-teal-500',    icon: 'bg-teal-50 text-teal-600',       text: 'text-teal-600' },
  violet:  { bar: 'bg-violet-500',  icon: 'bg-violet-50 text-violet-600',   text: 'text-violet-600' },
  rose:    { bar: 'bg-rose-500',    icon: 'bg-rose-50 text-rose-600',       text: 'text-rose-600' },
};

export const StatCard = ({
  title, value, icon: Icon, tone, helper, progress, onClick, active,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  tone: StatTone;
  helper?: string;
  /** 0..1 — vẽ thanh tỉ trọng so với tổng */
  progress?: number;
  /** có onClick → thẻ thành nút lọc nhanh */
  onClick?: () => void;
  active?: boolean;
}) => {
  const t = STAT_TONE[tone];
  const Tag = onClick ? 'button' : 'div';
  const pct = progress == null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <Tag
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
        active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
      } ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</p>
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
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            <Filter className="h-2.5 w-2.5" /> Đang lọc
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

export const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
    {text}
  </div>
);

// ─── Building card — thẻ toà nhà dùng chung cho Khởi tạo nhà & Cấu hình khai thác ──
export type BuildingRenovationState = 'done' | 'in_progress' | 'none';

const BUILDING_RENO_CHIP: Record<Exclude<BuildingRenovationState, 'none'>, { label: string; cls: string }> = {
  done:        { label: 'Đã cải tạo',   cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  in_progress: { label: 'Đang cải tạo', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
};

export const BuildingCard = ({
  name, address, zoneName, typeLabel, areaSize, totalRooms, floors,
  renovation = 'none', badge, managerName, overlay, onClick, children,
  selected, onSelectChange,
}: {
  name: string;
  address?: string;
  zoneName?: string;
  typeLabel: string;
  areaSize?: number;
  totalRooms: number;
  floors: number | string;
  renovation?: BuildingRenovationState;
  badge?: { label: string; cls: string } | null;
  managerName?: string;
  /** Nút hành động nổi ở góc trên (hiện khi hover) */
  overlay?: ReactNode;
  onClick?: () => void;
  /** Khu vực nút hành động dưới cùng */
  children?: ReactNode;
  /** Có onSelectChange → hiện ô tick chọn hàng loạt ở góc trên trái */
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}) => (
  <div
    onClick={onClick}
    className={`group relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
      selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-cyan-300'
    } ${onClick ? 'cursor-pointer' : ''}`}
  >
    {overlay}

    {/* Header: tên + trạng thái */}
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {onSelectChange && (
          <input
            type="checkbox"
            checked={!!selected}
            onClick={e => e.stopPropagation()}
            onChange={e => onSelectChange(e.target.checked)}
            title="Chọn để thao tác hàng loạt"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-snug text-slate-950 line-clamp-2">{name}</p>
          {address && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{address}</span>
            </div>
          )}
        </div>
      </div>
      {badge && (
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
      )}
    </div>

    {/* Meta: khu vực · loại hình · cải tạo */}
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      {zoneName && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{zoneName}</span>}
      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600">{typeLabel}</span>
      {renovation !== 'none' && (
        <span className={`rounded-full border px-2 py-0.5 font-bold ${BUILDING_RENO_CHIP[renovation].cls}`}>
          {BUILDING_RENO_CHIP[renovation].label}
        </span>
      )}
    </div>

    {/* Quản lý vận hành (nếu có) */}
    {managerName && (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <UserRound className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="truncate">Quản lý: <span className="font-semibold text-slate-700">{managerName}</span></span>
      </div>
    )}

    {/* Thông số: phòng · tầng · diện tích */}
    <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 text-center">
      <div className="py-2.5">
        <p className="text-base font-black leading-tight text-slate-900">{totalRooms || 0}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Phòng</p>
      </div>
      <div className="py-2.5">
        <p className="text-base font-black leading-tight text-slate-900">{floors || '—'}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Tầng</p>
      </div>
      <div className="py-2.5">
        <p className="text-base font-black leading-tight text-slate-900">
          {areaSize ? areaSize : '—'}<span className="text-[11px] font-bold text-slate-400">{areaSize ? ' m²' : ''}</span>
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Diện tích</p>
      </div>
    </div>

    {/* Hành động — spacer đẩy xuống đáy để footer các thẻ cùng hàng thẳng nhau
        kể cả khi tên tòa nhà dài 1 hay 2 dòng */}
    {children && (
      <>
        <div className="flex-1" />
        <div className="mt-4 border-t border-slate-100 pt-4">{children}</div>
      </>
    )}
  </div>
);

// ─── Pagination — thanh phân trang dùng chung ────────────────────────────────
export const Pagination = ({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) => {
  if (totalPages <= 1) return null;
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

  // Rút gọn khi nhiều trang: 1 … 4 5 [6] 7 8 … 20
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
