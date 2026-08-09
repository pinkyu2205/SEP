import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2, CreditCard, ServerCog, ShieldCheck, TrendingUp, Users, Wrench, UserCog,
  AlertTriangle, ArrowRight, BadgeCheck, BarChart3, Clock, Download, Home, PiggyBank,
  RefreshCw, Receipt, Wallet, Tag,
} from 'lucide-react';
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, PieChart, Pie, Cell, Legend, ReferenceLine,
} from 'recharts';
import {
  adminService,
  type AdminInvoiceRow, type AdminInvoiceType, type AdminHost,
  type AdminPaymentRow, type AdminDepositRow,
} from '@/services/admin.service';
import { propertyService } from '@/services/property.service';
import { userService } from '@/services/user.service';
import { maintenanceService } from '@/services/maintenance.service';
import { hostService, type PropertyPerformanceRow } from '@/services/host.service';
import { exportToExcel } from '@/utils/exportExcel';
import {
  CURRENT_MONTH, cmpIsoDesc, daysSince, fmtDate, fmtDateTime, fmtMillion,
  monthLabel, monthShort, safePct, shiftMonth,
} from '@/utils/period';
import type { PropertyResponse, UserResponse, MaintenanceDashboardResponse } from '@/types/api.types';
import { formatShortVnd, formatVnd } from './shared';

// ══════════════════════════════════════════════════════════════════════════════
// Bảng điều khiển Admin — 100% API thật, KHÔNG mock.
//
// Nguồn:
//   /manager/invoices  → hoá đơn thật toàn hệ thống (admin gọi được, không lọc nhà)
//   /manager/payments  → giao dịch khách đã báo, dùng cho hàng "chờ đối soát"
//   /admin/deposits    → tiền cọc theo hợp đồng
//   /admin/hosts · /users · /properties · /maintenance/dashboard
//   /host/reports/property-performance → lấp đầy phòng (HostController cho cả ADMIN)
//
// Ghi chú số liệu: hoá đơn không mang thông tin Host (ManagerInvoiceResponse chỉ có
// property) nên mọi biểu đồ gom theo TOÀ NHÀ — xem
// docs/BE-NEED-admin-billing-fields-2026-08-07.md.
// ══════════════════════════════════════════════════════════════════════════════

const TREND_MONTHS = 12;

const STATUS_COLOR: Record<string, string> = {
  PAID: '#10b981', PENDING: '#f59e0b', OVERDUE: '#f43f5e', PARTIAL: '#3b82f6', CANCELLED: '#94a3b8',
};
const STATUS_LABEL: Record<string, string> = {
  PAID: 'Đã thu', PENDING: 'Chưa thu', OVERDUE: 'Quá hạn', PARTIAL: 'Thu 1 phần', CANCELLED: 'Đã huỷ',
};
const TYPE_META: Record<AdminInvoiceType, { label: string; color: string }> = {
  RENT: { label: 'Tiền phòng', color: '#8b5cf6' },
  ELECTRICITY: { label: 'Tiền điện', color: '#f59e0b' },
  WATER: { label: 'Tiền nước', color: '#0ea5e9' },
  SERVICE: { label: 'Dịch vụ', color: '#14b8a6' },
  MAINTENANCE: { label: 'Phí bảo trì', color: '#f43f5e' },
  OTHER: { label: 'Khác', color: '#94a3b8' },
};
const PAYMENT_STATUS_LABEL: Record<AdminPaymentRow['status'], string> = {
  PENDING_VERIFY: 'Chờ đối soát', VERIFIED: 'Đã xác nhận', REJECTED: 'Bị từ chối',
};
const METHOD_LABEL: Record<string, string> = {
  QR: 'QR / VietQR', PAYOS: 'PayOS', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', EWALLET: 'Ví điện tử',
};

const EMPTY_MTN: MaintenanceDashboardResponse = {
  total: 0, pending: 0, inProgress: 0, resolved: 0, cancelled: 0, totalRepairCost: 0,
};

/** Kỳ của hoá đơn: ưu tiên month/year BE ghi trên hoá đơn, thiếu thì lấy ngày phát hành. */
const periodOf = (i: AdminInvoiceRow): string | null =>
  i.periodKey ?? (i.createdAt ? i.createdAt.slice(0, 7) : null);

// ── Mảnh UI ───────────────────────────────────────────────────────────────────
type Tone = 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'blue' | 'indigo' | 'slate';
const TONE: Record<Tone, { icon: string; ring: string; bar: string; text: string }> = {
  cyan: { icon: 'bg-cyan-50 text-cyan-600', ring: 'from-cyan-500/12', bar: 'bg-cyan-500', text: 'text-cyan-700' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', ring: 'from-emerald-500/12', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', ring: 'from-amber-500/12', bar: 'bg-amber-500', text: 'text-amber-700' },
  rose: { icon: 'bg-rose-50 text-rose-600', ring: 'from-rose-500/12', bar: 'bg-rose-500', text: 'text-rose-700' },
  violet: { icon: 'bg-violet-50 text-violet-600', ring: 'from-violet-500/12', bar: 'bg-violet-500', text: 'text-violet-700' },
  blue: { icon: 'bg-blue-50 text-blue-600', ring: 'from-blue-500/12', bar: 'bg-blue-500', text: 'text-blue-700' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600', ring: 'from-indigo-500/12', bar: 'bg-indigo-500', text: 'text-indigo-700' },
  slate: { icon: 'bg-slate-100 text-slate-600', ring: 'from-slate-500/10', bar: 'bg-slate-400', text: 'text-slate-700' },
};

const MetricCard = ({
  title, value, icon: Icon, tone, helper, progress, to,
}: {
  title: string; value: string; icon: LucideIcon; tone: Tone;
  helper?: string; progress?: number | null; to?: string;
}) => {
  const t = TONE[tone];
  const pct = progress == null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span aria-hidden className={`pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${t.ring} to-transparent blur-2xl`} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</p>
        <div className={`shrink-0 rounded-xl p-2 ${t.icon}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="relative mt-2 text-2xl font-black leading-none tabular-nums text-slate-900">{value}</p>
      {pct != null && (
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all duration-500 ${t.bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {helper && <p className="relative mt-2 truncate text-xs text-slate-400">{helper}</p>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

const Panel = ({
  title, subtitle, icon: Icon, action, children, className = '',
}: {
  title: string; subtitle?: string; icon: LucideIcon;
  action?: React.ReactNode; children: React.ReactNode; className?: string;
}) => (
  <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-xl bg-cyan-50 p-2.5"><Icon className="h-5 w-5 text-cyan-700" /></div>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const PanelLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-700 transition hover:bg-cyan-100">
    {children} <ArrowRight className="h-3 w-3" />
  </Link>
);

const EmptyChart = ({ note, loading }: { note: string; loading: boolean }) => (
  <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
    {loading ? (
      <span className="inline-flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" /> Đang tải…
      </span>
    ) : note}
  </div>
);

const MiniTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
      {label && <p className="mb-1 text-xs font-bold text-slate-700">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.color || p.fill }} />{p.name}
          </span>
          <span className="font-semibold tabular-nums text-slate-800">
            {typeof p.value === 'number' && p.value >= 1000 ? formatVnd(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/** Donut + chú giải bên phải — dùng cho 3 khối cơ cấu. */
const DonutPanel = ({
  data, unit = 'money', total,
}: { data: { name: string; value: number; color: string }[]; unit?: 'money' | 'count'; total?: string }) => (
  <div className="flex flex-col items-center gap-4 sm:flex-row">
    <div className="relative w-full sm:w-[45%]">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={3}>
            {data.map(e => <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />)}
          </Pie>
          <RechartsTooltip content={<MiniTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {total && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng</span>
          <span className="text-sm font-black text-slate-900">{total}</span>
        </div>
      )}
    </div>
    <div className="w-full flex-1 space-y-2">
      {data.map(item => (
        <div key={item.name} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50">
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}
          </span>
          <span className="font-bold tabular-nums text-slate-900">
            {unit === 'money' ? formatShortVnd(item.value) : item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ── Trang ─────────────────────────────────────────────────────────────────────
export const SuperAdminOverview = () => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [deposits, setDeposits] = useState<AdminDepositRow[]>([]);
  const [hosts, setHosts] = useState<AdminHost[] | null>(null);
  const [properties, setProperties] = useState<PropertyResponse[] | null>(null);
  const [users, setUsers] = useState<UserResponse[] | null>(null);
  const [mtn, setMtn] = useState<MaintenanceDashboardResponse | null>(null);
  const [perf, setPerf] = useState<PropertyPerformanceRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [inv, pay, dep, hostList, propPage, userList, mtnRes, perfRes] = await Promise.all([
      adminService.listInvoices({}).catch(() => []),
      adminService.listPayments().catch(() => []),
      adminService.listDeposits().catch(() => []),
      adminService.getHosts().catch(() => null),
      propertyService.getProperties(0, 500).catch(() => null),
      userService.getAllUsers().catch(() => null),
      maintenanceService.getDashboard().catch(() => null),
      hostService.getPropertyPerformance(CURRENT_MONTH).catch(() => null),
    ]);
    setInvoices(inv);
    setPayments(pay);
    setDeposits(dep);
    setHosts(hostList);
    setProperties(propPage?.content ?? null);
    setUsers(userList);
    setMtn(mtnRes);
    setPerf(perfRes ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Tài chính ──
  const money = useMemo(() => {
    const paid = invoices.filter(i => i.status === 'PAID');
    const overdue = invoices.filter(i => i.status === 'OVERDUE');
    const pending = invoices.filter(i => i.status === 'PENDING' || i.status === 'PARTIAL');
    const sum = (rows: AdminInvoiceRow[]) => rows.reduce((s, i) => s + i.amount, 0);
    const paidAmt = sum(paid);
    const openAmt = sum(pending) + sum(overdue);
    return {
      paidCount: paid.length, paidAmt,
      pendingCount: pending.length, pendingAmt: sum(pending),
      overdueCount: overdue.length, overdueAmt: sum(overdue),
      openCount: pending.length + overdue.length, openAmt,
      billed: paidAmt + openAmt,
      collectRate: safePct(paidAmt, paidAmt + openAmt),
    };
  }, [invoices]);

  /** Xu hướng 12 kỳ gần nhất — gom hoá đơn theo kỳ, kỳ trống vẫn giữ cột. */
  const trend = useMemo(() => {
    const buckets = new Map<string, { paid: number; open: number }>();
    for (let i = TREND_MONTHS - 1; i >= 0; i--) buckets.set(shiftMonth(CURRENT_MONTH, -i), { paid: 0, open: 0 });
    for (const inv of invoices) {
      const ym = periodOf(inv);
      const b = ym ? buckets.get(ym) : undefined;
      if (!b) continue;
      if (inv.status === 'PAID') b.paid += inv.amount;
      else if (inv.status !== 'CANCELLED') b.open += inv.amount;
    }
    return [...buckets.entries()].map(([ym, v]) => ({
      ym, label: monthShort(ym), paid: v.paid, open: v.open,
      // Kỳ không phát hành hoá đơn nào → rate = null để recharts ngắt đường,
      // thay vì kéo đường bám đáy 0% rồi vọt lên trông như tụt dốc thật.
      rate: v.paid + v.open > 0 ? Math.round((v.paid / (v.paid + v.open)) * 100) : null,
    }));
  }, [invoices]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.status, (m.get(i.status) ?? 0) + i.amount);
    return [...m.entries()]
      .map(([status, value]) => ({ name: STATUS_LABEL[status] ?? status, value, color: STATUS_COLOR[status] ?? '#94a3b8' }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [invoices]);

  const byType = useMemo(() => {
    const m = new Map<AdminInvoiceType, number>();
    for (const i of invoices) m.set(i.type, (m.get(i.type) ?? 0) + i.amount);
    return [...m.entries()]
      .map(([type, value]) => ({ name: TYPE_META[type].label, value, color: TYPE_META[type].color }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [invoices]);

  /** Top toà nhà: tách đã thu / còn phải thu để nhìn ra nhà nào thu kém. */
  const byProperty = useMemo(() => {
    const m = new Map<string, { paid: number; open: number }>();
    for (const i of invoices) {
      const cur = m.get(i.propertyName) ?? { paid: 0, open: 0 };
      if (i.status === 'PAID') cur.paid += i.amount;
      else if (i.status !== 'CANCELLED') cur.open += i.amount;
      m.set(i.propertyName, cur);
    }
    return [...m.entries()]
      .map(([name, v]) => ({
        name,
        // Nhãn trục Y: bỏ tiền tố "Nhà nguyên căn" lặp ở mọi dòng rồi mới cắt ngắn,
        // để phần phân biệt được (tên đường + số) không bị đẩy xuống dòng 2.
        short: (() => {
          const s = name.replace(/^nhà\s+(nguyên\s+căn|trọ)\s+/i, '').trim() || name;
          return s.length > 24 ? `${s.slice(0, 23)}…` : s;
        })(),
        ...v,
        total: v.paid + v.open,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [invoices]);

  // ── Người dùng / quy mô ──
  const userComp = useMemo(() => {
    const c = { hosts: 0, managers: 0, tenants: 0 };
    for (const u of users ?? []) {
      if (u.role === 'ROLE_OWNER') c.hosts++;
      else if (u.role === 'ROLE_MANAGER') c.managers++;
      else if (u.role === 'ROLE_TENANT') c.tenants++;
    }
    return c;
  }, [users]);
  const userPie = [
    { name: 'Host (chủ nhà)', value: userComp.hosts, color: '#06b6d4' },
    { name: 'Quản lý vận hành', value: userComp.managers, color: '#6366f1' },
    { name: 'Khách thuê', value: userComp.tenants, color: '#10b981' },
  ].filter(x => x.value > 0);

  /**
   * Số phòng lấy DUY NHẤT từ /host/reports/property-performance — đây là số phòng
   * thật đang tồn tại trong bảng `room`.
   *
   * KHÔNG cộng `PropertyResponse.totalRooms`: field đó là số phòng KHAI BÁO lúc
   * nhập hồ sơ/import Excel (`Property.totalRooms`), không đồng bộ với số phòng đã
   * tạo thật, nên trộn 2 nguồn sẽ ra hai con số khác nhau cho cùng một thứ (349 vs
   * 265) và làm tỷ lệ lấp đầy sai mẫu số. Xem docs/BE-NEED-host-finance-modules.
   */
  const rooms = useMemo(() => {
    const total = perf.reduce((s, p) => s + (p.totalRooms ?? 0), 0);
    const occupied = perf.reduce((s, p) => s + (p.occupiedRooms ?? 0), 0);
    const maintenance = perf.reduce((s, p) => s + (p.openMaintenance ?? 0), 0);
    return {
      total, occupied, maintenance,
      vacant: Math.max(0, total - occupied - maintenance),
      rate: safePct(occupied, total),
    };
  }, [perf]);

  const pendingPriceReview = useMemo(
    () => (properties ?? []).filter(p => p.status === 'PENDING_HOST_REVIEW').length,
    [properties],
  );

  const m = mtn ?? EMPTY_MTN;
  const mtnBars = [
    { name: 'Chờ xử lý', value: m.pending, color: '#f59e0b' },
    { name: 'Đang xử lý', value: m.inProgress, color: '#3b82f6' },
    { name: 'Đã xong', value: m.resolved, color: '#10b981' },
    { name: 'Đã huỷ', value: m.cancelled, color: '#94a3b8' },
  ];
  const mtnOpen = m.pending + m.inProgress;

  // ── Cọc ──
  const depositStats = useMemo(() => {
    const paid = deposits.filter(d => d.status === 'PAID');
    const waiting = deposits.filter(d => d.status === 'PENDING');
    return {
      paidCount: paid.length, paidAmt: paid.reduce((s, d) => s + d.amount, 0),
      waitingCount: waiting.length, waitingAmt: waiting.reduce((s, d) => s + d.amount, 0),
    };
  }, [deposits]);

  // ── Việc cần xử lý ──
  const pendingVerify = useMemo(() => payments.filter(p => p.status === 'PENDING_VERIFY'), [payments]);
  const needAttention = [
    pendingVerify.length > 0 && { label: `${pendingVerify.length} giao dịch chờ đối soát`, to: '/admin/billing', icon: BadgeCheck, cls: 'border-blue-200 bg-blue-50 text-blue-700' },
    money.overdueCount > 0 && { label: `${money.overdueCount} hoá đơn quá hạn · ${formatShortVnd(money.overdueAmt)}`, to: '/admin/billing', icon: AlertTriangle, cls: 'border-rose-200 bg-rose-50 text-rose-700' },
    mtnOpen > 0 && { label: `${mtnOpen} yêu cầu bảo trì đang mở`, to: '/admin/maintenance', icon: Wrench, cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    pendingPriceReview > 0 && { label: `${pendingPriceReview} toà nhà chờ Host duyệt giá`, to: '/admin/buildings/configuration', icon: Tag, cls: 'border-violet-200 bg-violet-50 text-violet-700' },
    depositStats.waitingCount > 0 && { label: `${depositStats.waitingCount} hợp đồng chưa thu cọc`, to: '/admin/billing', icon: PiggyBank, cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  ].filter(Boolean) as { label: string; to: string; icon: LucideIcon; cls: string }[];

  /** Hoá đơn cần thu — quá hạn lâu nhất lên đầu, rồi tới số tiền lớn. */
  const collectQueue = useMemo(() => (
    invoices
      .filter(i => i.status === 'PENDING' || i.status === 'OVERDUE' || i.status === 'PARTIAL')
      .sort((a, b) => daysSince(b.dueDate) - daysSince(a.dueDate) || b.amount - a.amount)
      .slice(0, 8)
  ), [invoices]);

  const recentVerify = useMemo(
    () => [...pendingVerify].sort((a, b) => cmpIsoDesc(a.createdAt, b.createdAt)).slice(0, 5),
    [pendingVerify],
  );

  const handleExport = () => {
    exportToExcel(`QuanTriHeThong_HoangBinhLand_${CURRENT_MONTH}`, [
      {
        name: 'Tổng quan',
        rows: [{
          'Thời điểm': monthLabel(CURRENT_MONTH),
          'Host': hosts?.length ?? userComp.hosts, 'Quản lý vận hành': userComp.managers, 'Khách thuê': userComp.tenants,
          'Toà nhà': properties?.length ?? 0, 'Tổng phòng': rooms.total,
          'Phòng đang thuê': rooms.occupied, 'Tỷ lệ lấp đầy (%)': rooms.rate ?? '',
          'Đã thu (₫)': money.paidAmt, 'Chưa thu (₫)': money.pendingAmt, 'Quá hạn (₫)': money.overdueAmt,
          'Tỷ lệ thu hồi (%)': money.collectRate ?? '',
          'Cọc đã thu (₫)': depositStats.paidAmt, 'Giao dịch chờ đối soát': pendingVerify.length,
          'Yêu cầu bảo trì đang mở': mtnOpen,
        }],
      },
      {
        name: `Dòng tiền ${TREND_MONTHS} kỳ`,
        rows: trend.map(t => ({
          'Kỳ': monthLabel(t.ym), 'Đã thu (₫)': t.paid, 'Còn phải thu (₫)': t.open,
          // Kỳ trống không có tỷ lệ thu — để ô rỗng thay vì 0% gây hiểu nhầm.
          'Tỷ lệ thu (%)': t.rate ?? '',
        })),
      },
      {
        name: 'Theo toà nhà',
        rows: byProperty.map(p => ({
          'Toà nhà': p.name, 'Đã thu (₫)': p.paid, 'Còn phải thu (₫)': p.open, 'Tổng phát hành (₫)': p.total,
        })),
      },
      {
        name: 'Hoá đơn cần thu',
        rows: collectQueue.map(i => ({
          'Mã hoá đơn': i.code, 'Toà nhà': i.propertyName, 'Khách thuê': i.tenantName,
          'Kỳ': i.periodLabel, 'Số tiền (₫)': i.amount, 'Hạn thu': fmtDate(i.dueDate),
          'Số ngày quá hạn': Math.max(0, daysSince(i.dueDate)),
          'Trạng thái': STATUS_LABEL[i.status] ?? i.status,
        })),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              <ShieldCheck className="h-3.5 w-3.5" /> Admin web-only access
            </div>
            <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">Quản trị toàn hệ thống Hoàng Bình Land</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Giám sát Host, người dùng, toà nhà, dòng tiền & bảo trì toàn nền tảng — số liệu trực tiếp từ hệ thống,
              cập nhật tới {monthLabel(CURRENT_MONTH).toLowerCase()}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
              className="btn-secondary flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
              <Download className="h-4 w-4" /> Xuất Excel
            </button>
            <Link to="/admin/users" className="btn-primary flex items-center gap-2"><Users className="h-4 w-4" /> Tạo tài khoản</Link>
            <Link to="/admin/settings" className="btn-secondary flex items-center gap-2"><ServerCog className="h-4 w-4" /> Cấu hình</Link>
          </div>
        </div>

        {/* Việc cần xử lý */}
        {needAttention.length > 0 && (
          <div className="relative flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Cần xử lý</span>
            {needAttention.map(a => (
              <Link key={a.label} to={a.to}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:brightness-95 ${a.cls}`}>
                <a.icon className="h-3.5 w-3.5" /> {a.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* KPI tài chính */}
      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Dòng tiền toàn hệ thống</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Đã thu" value={formatVnd(money.paidAmt)} icon={TrendingUp} tone="emerald"
            helper={`${money.paidCount} hoá đơn đã thanh toán`} progress={money.billed ? money.paidAmt / money.billed : 0}
            to="/admin/billing" />
          <MetricCard title="Chưa thu" value={formatVnd(money.pendingAmt)} icon={Clock} tone="amber"
            helper={`${money.pendingCount} hoá đơn chờ khách trả`} progress={money.billed ? money.pendingAmt / money.billed : 0}
            to="/admin/billing" />
          <MetricCard title="Quá hạn" value={formatVnd(money.overdueAmt)} icon={AlertTriangle} tone="rose"
            helper={`${money.overdueCount} hoá đơn trễ hạn`} progress={money.billed ? money.overdueAmt / money.billed : 0}
            to="/admin/billing" />
          <MetricCard title="Tỷ lệ thu hồi" value={money.collectRate === null ? '—' : `${money.collectRate}%`}
            icon={Wallet} tone="cyan"
            helper={`Tổng phát hành ${formatShortVnd(money.billed)}`} progress={(money.collectRate ?? 0) / 100} />
        </div>
      </div>

      {/* KPI quy mô */}
      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Quy mô nền tảng</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Host" value={String(hosts?.length ?? userComp.hosts)} icon={ShieldCheck} tone="cyan"
            helper={`${userComp.managers} quản lý · ${userComp.tenants} khách thuê`} to="/admin/users" />
          <MetricCard title="Toà nhà" value={String(properties?.length ?? 0)} icon={Building2} tone="blue"
            helper={`${rooms.total} phòng · ${pendingPriceReview} chờ duyệt giá`} to="/admin/buildings" />
          <MetricCard title="Tỷ lệ lấp đầy" value={rooms.rate === null ? '—' : `${rooms.rate}%`} icon={Home} tone="indigo"
            helper={`${rooms.occupied}/${rooms.total} phòng — toàn hệ thống`} progress={(rooms.rate ?? 0) / 100} />
          <MetricCard title="Cọc đang giữ" value={formatVnd(depositStats.paidAmt)} icon={PiggyBank} tone="violet"
            helper={`${depositStats.paidCount} hợp đồng đã thu cọc`} to="/admin/billing" />
        </div>
      </div>

      {/* Xu hướng dòng tiền */}
      <Panel
        title={`Dòng tiền ${TREND_MONTHS} kỳ gần nhất`}
        subtitle="Đã thu và còn phải thu theo từng kỳ · đường là tỷ lệ thu hồi"
        icon={BarChart3}
        action={<PanelLink to="/admin/billing">Hoá đơn & Thanh toán</PanelLink>}
      >
        {invoices.length === 0 ? (
          <EmptyChart note="Chưa có hoá đơn nào trong hệ thống" loading={loading} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trend} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <defs>
                <linearGradient id="adPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.55} /></linearGradient>
                <linearGradient id="adOpen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
              <YAxis yAxisId="money" tickFormatter={fmtMillion} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} />
              <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#cbd5e1' }} width={40} />
              <RechartsTooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
              <ReferenceLine yAxisId="money" y={0} stroke="#cbd5e1" />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar yAxisId="money" dataKey="paid" name="Đã thu" stackId="a" fill="url(#adPaid)" radius={[0, 0, 0, 0]} maxBarSize={30} />
              <Bar yAxisId="money" dataKey="open" name="Còn phải thu" stackId="a" fill="url(#adOpen)" radius={[5, 5, 0, 0]} maxBarSize={30} />
              <Line yAxisId="rate" type="monotone" dataKey="rate" name="Tỷ lệ thu (%)" stroke="#0891b2" strokeWidth={2.5}
                connectNulls={false}
                dot={{ r: 3, fill: '#fff', stroke: '#0891b2', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Cơ cấu hoá đơn */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Cơ cấu hoá đơn theo trạng thái" subtitle="Đã thu · chưa thu · quá hạn — toàn hệ thống" icon={Receipt}>
          {byStatus.length === 0
            ? <EmptyChart note="Chưa có hoá đơn nào trong hệ thống" loading={loading} />
            : <DonutPanel data={byStatus} total={formatShortVnd(byStatus.reduce((s, x) => s + x.value, 0))} />}
        </Panel>

        <Panel title="Cơ cấu hoá đơn theo loại" subtitle="Tiền phòng · điện · nước · dịch vụ · bảo trì" icon={CreditCard}>
          {byType.length === 0
            ? <EmptyChart note="Chưa có hoá đơn nào trong hệ thống" loading={loading} />
            : <DonutPanel data={byType} total={formatShortVnd(byType.reduce((s, x) => s + x.value, 0))} />}
        </Panel>
      </div>

      {/* Toà nhà + người dùng */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Top toà nhà theo doanh thu" subtitle="Tổng hoá đơn từng toà nhà — tách đã thu / còn phải thu" icon={Building2}
          action={<PanelLink to="/admin/buildings">Toà nhà</PanelLink>}>
          {byProperty.length === 0 ? (
            <EmptyChart note="Chưa có hoá đơn nào trong hệ thống" loading={loading} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byProperty} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="4 4" stroke="#eef2f7" />
                <XAxis type="number" tickFormatter={formatShortVnd} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="short" width={172} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <RechartsTooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="paid" name="Đã thu" stackId="p" fill="#10b981" maxBarSize={22} />
                <Bar dataKey="open" name="Còn phải thu" stackId="p" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Cơ cấu người dùng" subtitle="Host · quản lý vận hành · khách thuê" icon={UserCog}
          action={<PanelLink to="/admin/users">Người dùng</PanelLink>}>
          {userPie.length === 0
            ? <EmptyChart note="Chưa tải được danh sách người dùng" loading={loading} />
            : <DonutPanel data={userPie} unit="count" total={String(userComp.hosts + userComp.managers + userComp.tenants)} />}
        </Panel>
      </div>

      {/* Bảo trì + cọc */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Bảo trì theo trạng thái" subtitle={`${m.total} yêu cầu toàn nền tảng · chi phí sửa ${formatShortVnd(m.totalRepairCost)}`} icon={Wrench}
          action={<PanelLink to="/admin/maintenance">Bảo trì</PanelLink>}>
          {mtn === null || m.total === 0 ? (
            <EmptyChart note={mtn === null ? 'Chưa tải được dữ liệu bảo trì' : 'Chưa có yêu cầu bảo trì nào trong hệ thống'} loading={loading} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mtnBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={28} />
                <RechartsTooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="value" name="Số lượng" radius={[6, 6, 0, 0]} maxBarSize={54}>
                  {mtnBars.map(e => <Cell key={e.name} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Giao dịch chờ đối soát" subtitle={`${pendingVerify.length} giao dịch khách đã báo, chờ xác nhận`} icon={BadgeCheck}
          action={<PanelLink to="/admin/billing">Đối soát</PanelLink>}>
          {recentVerify.length === 0 ? (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-sm text-slate-400">
              {loading ? 'Đang tải…' : (<><BadgeCheck className="h-8 w-8 text-emerald-300" />Không còn giao dịch nào chờ đối soát</>)}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {recentVerify.map(p => (
                <li key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="shrink-0 rounded-lg bg-blue-50 p-2"><Wallet className="h-4 w-4 text-blue-600" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{formatVnd(p.amount)}</p>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {p.tenantName} · {p.propertyName}{p.roomNumber ? ` · P.${p.roomNumber}` : ''}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {p.invoiceCode || 'Không rõ hoá đơn'} · {p.method ? (METHOD_LABEL[p.method.toUpperCase()] ?? p.method) : 'Không rõ hình thức'} · {fmtDateTime(p.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Hoá đơn cần thu */}
      <Panel title="Hoá đơn cần thu" icon={AlertTriangle}
        subtitle={`${money.openCount} hoá đơn chưa thu / quá hạn · tổng ${formatVnd(money.openAmt)} — quá hạn lâu nhất xếp trước`}
        action={<PanelLink to="/admin/billing">Xem tất cả</PanelLink>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Mã hoá đơn</th>
                <th className="px-4 py-3">Toà nhà / Khách thuê</th>
                <th className="px-4 py-3">Kỳ thu</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3">Hạn thu</th>
                <th className="px-4 py-3 text-center">Quá hạn</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {collectQueue.map(inv => {
                const late = daysSince(inv.dueDate);
                return (
                  <tr key={inv.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{inv.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{inv.propertyName}</p>
                      <p className="text-xs text-slate-400">{inv.tenantName}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{inv.periodLabel}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{formatVnd(inv.amount)}</td>
                    <td className={`px-4 py-3 text-xs tabular-nums ${inv.status === 'OVERDUE' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        late > 30 ? 'bg-rose-100 text-rose-700'
                          : late > 7 ? 'bg-orange-100 text-orange-700'
                            : late > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {late > 0 ? `${late} ngày` : 'Chưa tới hạn'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ background: `${STATUS_COLOR[inv.status]}1a`, color: STATUS_COLOR[inv.status] }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[inv.status] }} />
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {collectQueue.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                    {loading ? 'Đang tải hoá đơn…' : 'Không còn hoá đơn nào cần thu.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
