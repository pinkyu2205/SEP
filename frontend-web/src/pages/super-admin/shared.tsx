import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { PlatformAccountStatus, PlatformBillStatus, PlatformRole } from '../../types';
import type { PlatformContractStatus } from '../../utils/superAdminMockData';

export const PAGE_SIZE = 6;

export const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

export const formatShortVnd = (value: number) => `${Math.round(value / 1_000_000)}tr`;

export const moneyTooltip = (value: any) => (typeof value === 'number' ? formatVnd(value) : String(value));

export const roleConfig: Record<PlatformRole, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin', color: 'bg-slate-950 text-white' },
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
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
  helper?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
        {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
      </div>
      <div className={`rounded-xl p-2.5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

export const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
    {text}
  </div>
);
