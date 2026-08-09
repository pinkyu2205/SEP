import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, TrendingDown, Home, Wallet, Wrench, UserCog, AlertTriangle, ArrowRight,
  Download, RefreshCw, Building2, Users, BarChart3, Tag, Receipt, DollarSign, BellRing,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { exportToExcel } from '@/utils/exportExcel';
import {
  hostService,
  type DashboardSummary, type PropertyPerformanceRow, type ManagerPerformanceRow,
  type HostNotificationDto, type InvoiceDto,
} from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import {
  CURRENT_MONTH, daysSince, fmtMillion, monthLabel, monthShort, shiftMonth,
} from './shared';

// ══════════════════════════════════════════════════════════════════════════════
// Bảng điều hành Host — 100% API thật, KHÔNG mock, KHÔNG số bịa.
//
// Nguồn (đều nhận month=YYYY-MM, chạy theo tháng vận hành hiện tại):
//   /host/dashboard/summary · /host/finance/cashflow · /host/finance/property-pnl
//   /host/reports/property-performance · /host/reports/manager-performance
//   /host/invoices · /host/notifications · /properties
//
// Nguyên tắc số liệu: mọi thông số tài chính & vận hành chỉ tính trên nhà Host ĐÃ
// DUYỆT GIÁ, dùng chung một nguồn với trang Quản lý dòng tiền nên hai trang luôn
// khớp. Nhà chưa duyệt giá chỉ xuất hiện ở banner + thẻ "Nhà chờ duyệt giá".
//
// Cố ý KHÔNG vẽ "xu hướng lấp đầy theo tháng": BE trả tỷ lệ lấp đầy hiện tại cho
// mọi kỳ (không lưu lịch sử) nên đường đó chỉ là một đường thẳng giả xu hướng.
// ══════════════════════════════════════════════════════════════════════════════

const CHART_MONTHS = 6;
type ChartPoint = { label: string; revenue: number; expense: number; net: number };
type Fin = { revenue: number; leaseCost: number; otherExpense: number; totalExpense: number; net: number };
const ZERO_FIN: Fin = { revenue: 0, leaseCost: 0, otherExpense: 0, totalExpense: 0, net: 0 };

/** Mốc leo thang của cron BE: quá hạn từ ngần này ngày thì quản lý & Host bị báo. */
const ESCALATE_AFTER_DAYS = 3;

// Nhà "đã duyệt giá" — mirror isHostApproved() ở PropertyList.
const isApproved = (status: string, price: number, hasManager: boolean) => {
  if (status === 'ACTIVE' || status === 'RENTED' || status === 'PENDING_OPERATION_MANAGER') return true;
  if (status === 'UNDER_RENOVATION' || status === 'DISABLED') return price > 0 || hasManager;
  return false;
};

// ── Thẻ KPI ───────────────────────────────────────────────────────────────────
interface KpiProps {
  title: string; value: string; icon: LucideIcon;
  iconBg: string; iconColor: string; borderColor: string;
  /** % thay đổi so với kỳ trước; null = không đủ dữ liệu kỳ trước để so. */
  delta?: number | null;
  /** Chỉ số mà giảm mới là tốt (vd chi phí) — mũi tên theo chiều thật, màu theo tốt/xấu. */
  lowerIsBetter?: boolean;
  sub?: string; badge?: string; badgeColor?: string; to?: string;
}
const KpiCard = ({ title, value, icon: Icon, iconBg, iconColor, borderColor, delta, lowerIsBetter, sub, badge, badgeColor, to }: KpiProps) => {
  const rising = (delta ?? 0) >= 0;
  const good = lowerIsBetter ? !rising : rising;
  const body = (
    <div className={`h-full rounded-xl border border-slate-100 border-l-4 bg-white p-5 shadow-sm transition-shadow ${borderColor} ${to ? 'hover:shadow-md' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
            {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}>{badge}</span>}
          </div>
          {/* text-xl chứ không phải 2xl: ở lưới 4 cột, "567.600.000 ₫" bị cắt mất đuôi. */}
          <p className="mt-1.5 text-xl font-bold leading-tight text-slate-900">{value}</p>
          {delta !== null && delta !== undefined && (
            <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${good ? 'text-emerald-600' : 'text-rose-600'}`}>
              {rising ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta)}% so với kỳ trước
            </p>
          )}
          {sub && <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>}
        </div>
        <div className={`${iconBg} ml-3 flex-shrink-0 rounded-xl p-3`}><Icon className={`h-5 w-5 ${iconColor}`} /></div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
};

interface SectionHeaderProps { title: string; subtitle?: string; action?: React.ReactNode; icon?: LucideIcon }
const SectionHeader = ({ title, subtitle, action, icon: Icon }: SectionHeaderProps) => (
  <div className="mb-5 flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      {Icon && <div className="rounded-lg bg-primary-50 p-2"><Icon className="h-4 w-4 text-primary-600" /></div>}
      <div className="min-w-0">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const QuickLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link to={to} className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-100 hover:text-primary-700">
    {children} <ArrowRight className="h-3 w-3" />
  </Link>
);

const FinTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rank: Record<string, number> = { 'Doanh thu': 0, 'Chi phí': 1, 'Lợi nhuận': 2 };
  const items = [...payload].sort((a, b) => (rank[a.name] ?? 9) - (rank[b.name] ?? 9));
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-xs font-bold text-slate-700">{label}</p>
      <div className="space-y-1">
        {items.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke }} />{p.name}
            </span>
            <span className="font-semibold tabular-nums" style={{ color: p.color || p.stroke }}>{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [series, setSeries] = useState<ChartPoint[]>([]);
  const [propPerf, setPropPerf] = useState<PropertyPerformanceRow[]>([]);
  const [mgrPerf, setMgrPerf] = useState<ManagerPerformanceRow[]>([]);
  const [apiProps, setApiProps] = useState<PropertyResponse[]>([]);
  const [pnlById, setPnlById] = useState<Record<string, Fin>>({});
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [alerts, setAlerts] = useState<HostNotificationDto[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = shiftMonth(CURRENT_MONTH, -(CHART_MONTHS - 1));
    const [sum, cashflow, perf, mgr, propPage, pnl, invoicePage, notify] = await Promise.all([
      hostService.getDashboardSummary(CURRENT_MONTH).catch(() => null),
      hostService.getCashflow(from, CURRENT_MONTH).catch(() => null),
      hostService.getPropertyPerformance(CURRENT_MONTH).catch(() => null),
      hostService.getManagerPerformance(CURRENT_MONTH).catch(() => null),
      propertyService.getProperties(0, 200).catch(() => null),
      hostService.getPropertyPnl(CURRENT_MONTH).catch(() => null),
      // size lớn: BE mặc định 20/trang — cần trọn kỳ để đếm quá hạn cho đúng.
      hostService.getInvoices({ month: CURRENT_MONTH, size: 500 }).catch(() => null),
      hostService.listNotifications({ unreadOnly: true, size: 6 }).catch(() => null),
    ]);

    if (sum?.finance) setSummary(sum);
    setSeries((cashflow?.series ?? [])
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(p => ({ label: monthShort(p.month), revenue: p.revenue, expense: p.expense, net: p.revenue - p.expense })));
    setPropPerf(perf ?? []);
    setMgrPerf(mgr ?? []);
    setApiProps(propPage?.content ?? []);

    const map: Record<string, Fin> = {};
    for (const r of pnl?.rows ?? []) {
      map[r.propertyId] = {
        revenue: r.revenue, leaseCost: r.leaseCost, otherExpense: r.otherExpense,
        totalExpense: r.totalExpense ?? r.leaseCost + r.otherExpense, net: r.net,
      };
    }
    setPnlById(map);
    setInvoices(invoicePage?.content ?? []);
    setAlerts(notify?.content ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Nhà chờ duyệt giá / đã duyệt giá ──
  const pending = useMemo(() => apiProps.filter(p => p.status === 'PENDING_HOST_REVIEW'), [apiProps]);
  const approvedProps = useMemo(
    () => apiProps.filter(p => isApproved(p.status, p.price ?? 0, !!p.operationManagerId)),
    [apiProps],
  );
  const perfById = useMemo(() => Object.fromEntries(propPerf.map(r => [String(r.propertyId), r])), [propPerf]);

  /**
   * Thẻ nhà: join danh sách nhà đã duyệt với số liệu vận hành + tài chính.
   *
   * Số phòng CHỈ lấy từ /host/reports/property-performance (phòng thật trong bảng
   * `room`). Không lấy `PropertyResponse.totalRooms` — đó là số phòng KHAI BÁO lúc
   * nhập hồ sơ, không đồng bộ với phòng đã tạo, trộn vào sẽ cho hai con số khác
   * nhau cho cùng một thứ và làm sai mẫu số tỷ lệ lấp đầy.
   */
  const cards = useMemo<PropertyPerformanceRow[]>(() => approvedProps.map(p => {
    const perf = perfById[String(p.id)];
    if (perf) return perf;
    const fin = pnlById[String(p.id)];
    return {
      propertyId: String(p.id), propertyName: p.propertyName,
      address: p.fullAddress || p.shortAddress || '',
      occupancyRate: 0, occupiedRooms: 0, totalRooms: 0,
      monthlyRevenue: fin?.revenue ?? 0, openMaintenance: 0,
    };
  }), [approvedProps, perfById, pnlById]);

  const agg = useMemo(() => {
    const totalRooms = cards.reduce((s, c) => s + c.totalRooms, 0);
    const occupied = cards.reduce((s, c) => s + c.occupiedRooms, 0);
    const openMaintenance = cards.reduce((s, c) => s + c.openMaintenance, 0);
    const fin = cards.reduce((a, c) => {
      const p = pnlById[String(c.propertyId)] ?? ZERO_FIN;
      return {
        revenue: a.revenue + p.revenue, expense: a.expense + p.totalExpense,
        lease: a.lease + p.leaseCost, other: a.other + p.otherExpense,
      };
    }, { revenue: 0, expense: 0, lease: 0, other: 0 });
    return {
      count: cards.length, totalRooms, occupied,
      vacant: Math.max(0, totalRooms - occupied), openMaintenance,
      revenue: fin.revenue, expense: fin.expense, net: fin.revenue - fin.expense,
      lease: fin.lease, other: fin.other,
      occupancyRate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0,
    };
  }, [cards, pnlById]);

  // ── Công nợ quá hạn ──
  const overdue = useMemo(() => {
    const list = invoices.filter(i => i.status === 'OVERDUE');
    const escalated = list.filter(i => daysSince(i.dueDate) >= ESCALATE_AFTER_DAYS);
    return {
      count: list.length,
      amount: list.reduce((s, i) => s + i.amount, 0),
      escalated: escalated.length,
    };
  }, [invoices]);

  // ── Biểu đồ: kỳ hiện tại lấy theo nhà đã duyệt giá để khớp KPI ──
  const chart = useMemo<ChartPoint[]>(() => {
    const label = monthShort(CURRENT_MONTH);
    const current: ChartPoint = { label, revenue: agg.revenue, expense: agg.expense, net: agg.net };
    let found = false;
    const out = series.map(p => (p.label === label ? ((found = true), current) : p));
    if (!found) out.push(current);
    return out;
  }, [series, agg]);

  const prevPoint = chart[chart.length - 2];
  const delta = (cur: number, prev?: number) =>
    prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null;

  const pieData = useMemo(() => (
    [
      { name: 'Thuê nhà nguyên căn', value: agg.lease, color: '#6366F1' },
      { name: 'Chi phí khác', value: agg.other, color: '#F59E0B' },
    ].filter(x => x.value > 0)
  ), [agg]);

  const activeManagers = mgrPerf.length || (summary?.counts.activeManagers ?? 0);
  const outstandingAmount = summary?.counts.outstandingAmount ?? 0;
  const outstandingInvoices = summary?.counts.outstandingInvoices ?? 0;

  const revenueDelta = delta(agg.revenue, prevPoint?.revenue);
  const expenseDelta = delta(agg.expense, prevPoint?.expense);
  const netDelta = delta(agg.net, prevPoint?.net);

  const kpis: KpiProps[] = [
    {
      title: 'Doanh thu tháng này', value: formatCurrency(agg.revenue), icon: TrendingUp,
      iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', borderColor: 'border-l-emerald-500',
      delta: revenueDelta, sub: `${agg.count} nhà đã duyệt giá`, to: '/host/financial',
    },
    {
      title: 'Tổng chi phí', value: formatCurrency(agg.expense), icon: TrendingDown,
      iconBg: 'bg-rose-50', iconColor: 'text-rose-600', borderColor: 'border-l-rose-500',
      delta: expenseDelta, lowerIsBetter: true,
      sub: 'Thuê căn + chi phí ghi nhận', to: '/host/financial',
    },
    {
      title: 'Lợi nhuận ròng', value: formatCurrency(agg.net), icon: Wallet,
      iconBg: 'bg-indigo-50', iconColor: agg.net >= 0 ? 'text-indigo-600' : 'text-rose-600',
      borderColor: agg.net >= 0 ? 'border-l-indigo-500' : 'border-l-rose-500',
      delta: netDelta,
      sub: `Biên LN ${agg.revenue > 0 ? Math.round((agg.net / agg.revenue) * 100) : 0}%`, to: '/host/reports',
    },
    {
      title: 'Tỷ lệ lấp đầy', value: `${agg.occupancyRate}%`, icon: Home,
      iconBg: 'bg-blue-50', iconColor: 'text-blue-600', borderColor: 'border-l-blue-500',
      sub: `${agg.occupied}/${agg.totalRooms} phòng · đã duyệt giá`, to: '/host/properties',
    },
    {
      title: 'Nhà chờ duyệt giá', value: String(pending.length), icon: Tag,
      iconBg: 'bg-amber-50', iconColor: 'text-amber-600', borderColor: 'border-l-amber-500',
      badge: pending.length > 0 ? 'Cần duyệt' : undefined, badgeColor: 'bg-amber-100 text-amber-700',
      sub: pending.length > 0 ? 'Chờ bạn chốt giá để vận hành' : 'Không có nhà nào chờ', to: '/host/properties',
    },
    {
      title: 'Bảo trì chờ xử lý', value: String(agg.openMaintenance), icon: Wrench,
      iconBg: 'bg-rose-50', iconColor: 'text-rose-600', borderColor: 'border-l-rose-500',
      sub: 'Phòng đang bảo trì', to: '/host/maintenance',
    },
    {
      title: 'Quản lý vận hành', value: String(activeManagers), icon: UserCog,
      iconBg: 'bg-violet-50', iconColor: 'text-violet-600', borderColor: 'border-l-violet-500',
      badge: 'Đang hoạt động', badgeColor: 'bg-emerald-100 text-emerald-700',
      sub: 'Đang phụ trách vận hành', to: '/host/operations-managers',
    },
    {
      title: 'Hoá đơn chưa thu', value: formatCurrency(outstandingAmount), icon: Receipt,
      iconBg: 'bg-amber-50', iconColor: 'text-amber-600', borderColor: 'border-l-amber-400',
      sub: `${outstandingInvoices} hoá đơn`, to: '/host/receivables',
    },
  ];

  const handleExport = () => {
    exportToExcel(`BangDieuHanh_HoangBinhLand_${CURRENT_MONTH}`, [
      {
        name: 'Tổng quan',
        rows: [{
          'Kỳ': monthLabel(CURRENT_MONTH),
          'Nhà đã duyệt giá': agg.count, 'Nhà chờ duyệt giá': pending.length,
          'Tổng phòng': agg.totalRooms, 'Phòng đang thuê': agg.occupied, 'Phòng còn trống': agg.vacant,
          'Tỷ lệ lấp đầy (%)': agg.occupancyRate,
          'Doanh thu (₫)': agg.revenue, 'Chi phí (₫)': agg.expense, 'Lợi nhuận ròng (₫)': agg.net,
          'Hoá đơn chưa thu (₫)': outstandingAmount, 'Số hoá đơn chưa thu': outstandingInvoices,
          'Hoá đơn quá hạn': overdue.count,
        }],
      },
      {
        name: `Dòng tiền ${CHART_MONTHS} kỳ`,
        rows: chart.map(c => ({ 'Kỳ': c.label, 'Doanh thu (₫)': c.revenue, 'Chi phí (₫)': c.expense, 'Lợi nhuận (₫)': c.net })),
      },
      {
        name: 'Nhà đã duyệt giá',
        rows: cards.map(c => ({
          'Bất động sản': c.propertyName, 'Địa chỉ': c.address,
          'Phòng đang thuê': c.occupiedRooms, 'Tổng phòng': c.totalRooms,
          'Tỷ lệ lấp đầy (%)': Math.round(c.occupancyRate),
          'Doanh thu tháng (₫)': pnlById[String(c.propertyId)]?.revenue ?? c.monthlyRevenue,
          'Phòng bảo trì': c.openMaintenance,
        })),
      },
    ]);
  };

  const topCards = cards.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2.5">
            <div className="h-6 w-1 rounded-full bg-primary-600" />
            <h1 className="text-xl font-bold text-slate-900">Trang tổng quan</h1>
          </div>
          <p className="ml-3.5 text-sm text-slate-500">
            Bảng điều hành vận hành bất động sản Hoàng Bình Land — {monthLabel(CURRENT_MONTH)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700">Hệ thống đang hoạt động</span>
          </div>
          <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
            <Download className="h-4 w-4" /> Xuất báo cáo
          </button>
        </div>
      </div>

      {/* Việc cần Host xử lý */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-shrink-0 rounded-xl bg-amber-100 p-2.5"><Tag className="h-5 w-5 text-amber-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">{pending.length} toà nhà đang chờ bạn duyệt giá</p>
              <p className="mt-0.5 truncate text-xs text-amber-700">
                {pending.slice(0, 3).map(p => p.propertyName).join(', ')}
                {pending.length > 3 ? ` … và ${pending.length - 3} nhà khác` : ''}
                {' — đã cấu hình khai thác xong, chờ Host duyệt giá để đưa vào vận hành.'}
              </p>
            </div>
            <Link to="/host/properties"
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700">
              Xem & duyệt tất cả <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {overdue.count > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-shrink-0 rounded-xl bg-rose-100 p-2.5"><BellRing className="h-5 w-5 text-rose-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-rose-800">
                {overdue.count} hoá đơn tiền phòng quá hạn — {formatCurrency(overdue.amount)}
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                {overdue.escalated > 0
                  ? `${overdue.escalated} hoá đơn đã quá ${ESCALATE_AFTER_DAYS} ngày: quản lý vận hành đã nhận cảnh báo và hợp đồng bị gắn cờ đề nghị chấm dứt.`
                  : `Hệ thống tự nhắc khách mỗi sáng; quá ${ESCALATE_AFTER_DAYS} ngày sẽ báo quản lý vận hành và Host.`}
              </p>
            </div>
            <Link to="/host/receivables"
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-700">
              Xem công nợ <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => <KpiCard key={k.title} {...k} />)}
      </div>

      {/* Tài chính */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm lg:col-span-2">
          <SectionHeader
            title="Tổng quan tài chính"
            subtitle={`Dòng tiền ${CHART_MONTHS} kỳ gần nhất · ${monthLabel(CURRENT_MONTH)}: nhà đã duyệt giá`}
            icon={BarChart3}
            action={<QuickLink to="/host/financial">Chi tiết</QuickLink>}
          />
          {chart.length === 0 ? (
            <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">
              {loading ? 'Đang tải…' : 'Chưa có dữ liệu dòng tiền.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barGap={4}>
                <defs>
                  <linearGradient id="dbRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.5} /></linearGradient>
                  <linearGradient id="dbExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F43F5E" stopOpacity={0.95} /><stop offset="100%" stopColor="#F43F5E" stopOpacity={0.5} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
                <YAxis tickFormatter={fmtMillion} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} />
                <RechartsTooltip content={<FinTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="revenue" name="Doanh thu" fill="url(#dbRev)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                <Bar dataKey="expense" name="Chi phí" fill="url(#dbExp)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                <Line type="monotone" dataKey="net" name="Lợi nhuận" stroke="#6366F1" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#fff', stroke: '#6366F1', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <SectionHeader title="Cơ cấu chi phí" subtitle={`${monthLabel(CURRENT_MONTH)} · nhà đã duyệt giá`} icon={DollarSign} />
          {pieData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-10 text-center text-sm text-slate-400">
              {loading ? 'Đang tải…' : 'Kỳ này chưa ghi nhận chi phí nào'}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex-1 space-y-2">
                {pieData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.name}
                    </span>
                    <span className="font-semibold text-slate-900">{formatCurrency(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Vận hành bất động sản */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <SectionHeader
          title="Tổng quan vận hành bất động sản"
          subtitle={`${agg.count} nhà đã duyệt giá · ${agg.totalRooms} phòng`}
          icon={Building2}
          action={<QuickLink to="/host/properties">Xem tất cả</QuickLink>}
        />
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Nhà đã duyệt giá', value: agg.count, color: 'text-slate-900', bg: 'bg-slate-50', border: 'border-slate-200' },
            { label: 'Phòng đang thuê', value: agg.occupied, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
            { label: 'Phòng còn trống', value: agg.vacant, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Phòng đang bảo trì', value: agg.openMaintenance, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {topCards.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {loading ? 'Đang tải…' : 'Chưa có nhà nào được duyệt giá.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {topCards.map(prop => {
                const rate = Math.round(prop.occupancyRate);
                const avail = Math.max(0, prop.totalRooms - prop.occupiedRooms - prop.openMaintenance);
                const revenue = pnlById[String(prop.propertyId)]?.revenue ?? prop.monthlyRevenue;
                return (
                  <Link key={prop.propertyId} to={`/host/properties/${prop.propertyId}`}
                    className="group block rounded-xl border border-slate-100 p-4 transition-all hover:border-primary-200 hover:shadow-md">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 transition-colors group-hover:text-primary-600">{prop.propertyName}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{prop.address}</p>
                      </div>
                      <span className={`ml-2 flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                        rate >= 85 ? 'bg-emerald-100 text-emerald-700' : rate >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>{rate}%</span>
                    </div>
                    <div className="mb-3 h-1.5 w-full rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full transition-all ${
                        rate >= 85 ? 'bg-emerald-500' : rate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                      }`} style={{ width: `${rate}%` }} />
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-1.5 text-center text-xs">
                      <div className="rounded-lg bg-blue-50 py-1.5"><p className="font-bold text-blue-700">{prop.occupiedRooms}</p><p className="text-[10px] text-slate-400">Đang thuê</p></div>
                      <div className="rounded-lg bg-emerald-50 py-1.5"><p className="font-bold text-emerald-700">{avail}</p><p className="text-[10px] text-slate-400">Còn trống</p></div>
                      <div className="rounded-lg bg-amber-50 py-1.5"><p className="font-bold text-amber-700">{prop.openMaintenance}</p><p className="text-[10px] text-slate-400">Bảo trì</p></div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="text-slate-500">Doanh thu/tháng</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(revenue)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            {cards.length > topCards.length && (
              <div className="mt-4 text-center">
                <Link to="/host/properties" className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                  Xem thêm {cards.length - topCards.length} nhà khác →
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quản lý vận hành + Cảnh báo */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <SectionHeader title="Quản lý vận hành" subtitle={`${mgrPerf.length} quản lý đang hoạt động`} icon={Users}
            action={<QuickLink to="/host/operations-managers">Tất cả</QuickLink>} />
          {mgrPerf.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {loading ? 'Đang tải…' : 'Chưa có quản lý vận hành nào đang hoạt động.'}
            </div>
          ) : (
            <div className="space-y-3">
              {mgrPerf.slice(0, 4).map(mgr => {
                const initials = (mgr.managerName || '?').split(' ').slice(-2).map(n => n[0]).join('').toUpperCase();
                return (
                  <div key={mgr.managerId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-sm">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{mgr.managerName}</p>
                      <p className="truncate text-xs text-slate-400">
                        {mgr.phone || '—'} · {mgr.propertyCount} nhà · {mgr.activeTenants} hợp đồng
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{Math.round(mgr.occupancyRate)}%</p>
                      <p className="text-[10px] text-slate-400">lấp đầy</p>
                    </div>
                  </div>
                );
              })}
              {mgrPerf.length > 4 && (
                <p className="pt-1 text-center text-xs text-slate-400">… và {mgrPerf.length - 4} quản lý khác</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <SectionHeader title="Cảnh báo & Thông báo" subtitle={`${alerts.length} thông báo chưa đọc`} icon={AlertTriangle}
            action={<QuickLink to="/host/notifications">Tất cả</QuickLink>} />
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              {loading ? 'Đang tải…' : 'Không có thông báo mới.'}
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(n => (
                <div key={n.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <div className="flex-shrink-0 rounded-lg bg-white p-2 shadow-sm">
                    <AlertTriangle className={`h-4 w-4 ${n.priority === 'HIGH' ? 'text-rose-500' : 'text-primary-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
