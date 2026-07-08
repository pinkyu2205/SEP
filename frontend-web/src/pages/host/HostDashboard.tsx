import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, TrendingDown, Home, Wallet, FileText,
  Wrench, UserCog, AlertTriangle, ArrowRight, Download,
  DollarSign, Building2, Users, BarChart3, Activity, Tag, Receipt,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { formatCurrency } from '@/utils';
import {
  hostService,
  type DashboardSummary, type PropertyPerformanceRow, type ManagerPerformanceRow,
  type FinancialSummaryRow, type HostNotificationDto,
} from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';

// =============================================================================
// Dashboard Host — 100% API thật, KHÔNG mock fallback.
// Thông số & thẻ nhà chỉ tính các nhà Host ĐÃ DUYỆT GIÁ; nhà chưa duyệt chỉ
// xuất hiện ở banner/KPI "Nhà chờ duyệt giá". BE chưa có dữ liệu → hiện 0/trống.
// =============================================================================

// Tháng vận hành = tháng hiện tại THẬT của hệ thống.
const NOW = new Date();
const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTH = `${NOW.getFullYear()}-${pad2(NOW.getMonth() + 1)}`;
const MONTH_LABEL = `Tháng ${NOW.getMonth() + 1}/${NOW.getFullYear()}`;
const monthsAgo = (k: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - k, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const fmtM = (v: number) => `${(v / 1_000_000).toFixed(0)}M`;
const ymLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Th${Number(m)}/${y.slice(2)}`; };

type ChartPoint = { label: string; revenue: number; expense: number; loiNhuan: number; lapDay: number };
type Fin = { revenue: number; leaseCost: number; otherExpense: number; totalExpense: number; net: number };

// Nhà "đã duyệt giá" — mirror isHostApproved() ở PropertyList.
const isApproved = (status: string, price: number, hasManager: boolean) => {
  if (status === 'ACTIVE' || status === 'RENTED' || status === 'PENDING_OPERATION_MANAGER') return true;
  if (status === 'UNDER_RENOVATION' || status === 'DISABLED') return price > 0 || hasManager;
  return false;
};

// ── Components nội bộ ─────────────────────────────────────────────────────────
interface KpiCardProps { title: string; value: string; icon: LucideIcon; iconBg: string; iconColor: string; borderColor: string; trend?: string; trendUp?: boolean; extra?: React.ReactNode; badge?: string; badgeColor?: string; }
const KpiCard = ({ title, value, icon: Icon, iconBg, iconColor, borderColor, trend, trendUp, extra, badge, badgeColor }: KpiCardProps) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-100 p-5 border-l-4 ${borderColor} hover:shadow-md transition-shadow`}>
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
        </div>
        <p className="text-2xl font-bold text-slate-900 mt-1.5 truncate">{value}</p>
        {trend && (
          <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{trend} so với tháng trước
          </p>
        )}
        {extra}
      </div>
      <div className={`${iconBg} rounded-xl p-3 flex-shrink-0 ml-3`}><Icon className={`w-5 h-5 ${iconColor}`} /></div>
    </div>
  </div>
);

interface SectionHeaderProps { title: string; subtitle?: string; action?: React.ReactNode; icon?: LucideIcon; }
const SectionHeader = ({ title, subtitle, action, icon: Icon }: SectionHeaderProps) => (
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-3">
      {Icon && <div className="p-2 bg-primary-50 rounded-lg"><Icon className="w-4 h-4 text-primary-600" /></div>}
      <div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

// Tooltip tài chính (crosshair + màu theo series, chữ dùng ink token)
const FinTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rank: Record<string, number> = { 'Doanh thu': 0, 'Chi phí': 1, 'Lợi nhuận': 2 };
  const items = [...payload].sort((a, b) => (rank[a.name] ?? 9) - (rank[b.name] ?? 9));
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2.5 shadow-xl">
      <p className="text-xs font-bold text-slate-700 mb-1.5">{label}</p>
      <div className="space-y-1">
        {items.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />{p.name}</span>
            <span className="font-semibold tabular-nums" style={{ color: p.color || p.stroke }}>{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Dashboard chính ────────────────────────────────────────────────────────────
export const Dashboard = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [propPerf, setPropPerf] = useState<PropertyPerformanceRow[]>([]);
  const [mgrPerf, setMgrPerf] = useState<ManagerPerformanceRow[]>([]);
  const [apiProps, setApiProps] = useState<PropertyResponse[]>([]);
  const [pnlById, setPnlById] = useState<Record<string, Fin>>({});
  const [alerts, setAlerts] = useState<HostNotificationDto[]>([]);

  useEffect(() => {
    let active = true;
    hostService.getDashboardSummary(MONTH).then(res => { if (active && res?.finance) setSummary(res); }).catch(() => {});
    hostService.getFinancialSummary(monthsAgo(5), MONTH).then((rows: FinancialSummaryRow[]) => {
      if (active && Array.isArray(rows)) setChart(rows.map(r => ({ label: ymLabel(r.month), revenue: r.revenue, expense: r.expense, loiNhuan: r.netProfit, lapDay: r.occupancyRate })));
    }).catch(() => {});
    hostService.getPropertyPerformance(MONTH).then(rows => { if (active && Array.isArray(rows)) setPropPerf(rows); }).catch(() => {});
    hostService.getManagerPerformance(MONTH).then(rows => { if (active && Array.isArray(rows)) setMgrPerf(rows); }).catch(() => {});
    propertyService.getProperties(0, 200).then(res => { if (active && res?.content) setApiProps(res.content); }).catch(() => {});
    hostService.getPropertyPnl(MONTH).then(res => {
      if (!active || !res?.rows) return;
      const m: Record<string, Fin> = {};
      for (const r of res.rows) { const totalExpense = r.totalExpense ?? r.leaseCost + r.otherExpense; m[r.propertyId] = { revenue: r.revenue, leaseCost: r.leaseCost, otherExpense: r.otherExpense, totalExpense, net: r.net }; }
      setPnlById(m);
    }).catch(() => {});
    hostService.listNotifications({ unreadOnly: true, size: 6 }).then(page => { if (active && page?.content) setAlerts(page.content); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Nhà chờ Host duyệt giá (chỉ để nhắc — KHÔNG tính vào thông số).
  const pending = useMemo(() => apiProps.filter(p => p.status === 'PENDING_HOST_REVIEW'), [apiProps]);

  // Nhà ĐÃ DUYỆT GIÁ — nguồn duy nhất cho mọi thông số.
  const approvedProps = useMemo(() => apiProps.filter(p => isApproved(p.status, p.price ?? 0, !!p.operationManagerId)), [apiProps]);
  const perfById = useMemo(() => Object.fromEntries(propPerf.map(r => [String(r.propertyId), r])), [propPerf]);

  // Thẻ nhà: join danh sách nhà đã duyệt với performance (nếu BE có).
  const cards = useMemo<PropertyPerformanceRow[]>(() => approvedProps.map(p => {
    const perf = perfById[String(p.id)];
    if (perf) return perf;
    const fin = pnlById[String(p.id)];
    return {
      propertyId: String(p.id), propertyName: p.propertyName,
      address: p.fullAddress || p.shortAddress || '',
      occupancyRate: 0, occupiedRooms: 0, totalRooms: p.totalRooms ?? 0,
      monthlyRevenue: fin?.revenue ?? 0, openMaintenance: 0,
    };
  }), [approvedProps, perfById, pnlById]);

  // Tổng hợp thông số CHỈ trên nhà đã duyệt giá.
  const agg = useMemo(() => {
    const totalRooms = cards.reduce((s, c) => s + c.totalRooms, 0);
    const occupied = cards.reduce((s, c) => s + c.occupiedRooms, 0);
    const openMaintenance = cards.reduce((s, c) => s + c.openMaintenance, 0);
    const fin = cards.reduce((a, c) => { const p = pnlById[String(c.propertyId)]; return { revenue: a.revenue + (p?.revenue ?? 0), expense: a.expense + (p?.totalExpense ?? 0), lease: a.lease + (p?.leaseCost ?? 0), other: a.other + (p?.otherExpense ?? 0) }; }, { revenue: 0, expense: 0, lease: 0, other: 0 });
    return { count: cards.length, totalRooms, occupied, vacant: Math.max(0, totalRooms - occupied), openMaintenance, revenue: fin.revenue, expense: fin.expense, net: fin.revenue - fin.expense, lease: fin.lease, other: fin.other, occupancyRate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 };
  }, [cards, pnlById]);

  // Biểu đồ: tháng hiện tại = số nhà đã duyệt (khớp KPI); các tháng trước = sổ dòng tiền.
  const chartAdj = useMemo<ChartPoint[]>(() => {
    const lbl = ymLabel(MONTH);
    const cur: ChartPoint = { label: lbl, revenue: agg.revenue, expense: agg.expense, loiNhuan: agg.net, lapDay: agg.occupancyRate };
    let found = false;
    const out = chart.map(c => (c.label === lbl ? (found = true, cur) : c));
    if (!found) out.push(cur);
    return out;
  }, [chart, agg]);

  // Cơ cấu chi phí: nhà đã duyệt (thuê căn + chi phí khác).
  const pieData = useMemo(() => (
    [{ name: 'Thuê nhà nguyên căn', value: agg.lease, color: '#6366F1' }, { name: 'Chi phí khác', value: agg.other, color: '#F59E0B' }].filter(x => x.value > 0)
  ), [agg]);

  const activeManagers = mgrPerf.length || (summary?.counts.activeManagers ?? 0);
  const outstandingAmount = summary?.counts.outstandingAmount ?? 0;
  const outstandingInvoices = summary?.counts.outstandingInvoices ?? 0;

  const kpis: KpiCardProps[] = useMemo(() => [
    { title: 'Doanh thu tháng này', value: formatCurrency(agg.revenue), icon: TrendingUp, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', borderColor: 'border-l-emerald-500' },
    { title: 'Tổng chi phí', value: formatCurrency(agg.expense), icon: TrendingDown, iconBg: 'bg-rose-50', iconColor: 'text-rose-600', borderColor: 'border-l-rose-500' },
    { title: 'Lợi nhuận ròng', value: formatCurrency(agg.net), icon: Wallet, iconBg: 'bg-emerald-50', iconColor: agg.net >= 0 ? 'text-emerald-700' : 'text-rose-600', borderColor: agg.net >= 0 ? 'border-l-emerald-700' : 'border-l-rose-500' },
    { title: 'Tỷ lệ lấp đầy', value: `${agg.occupancyRate}%`, icon: Home, iconBg: 'bg-blue-50', iconColor: 'text-blue-600', borderColor: 'border-l-blue-500', extra: <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${agg.occupancyRate}%` }} /></div> },
    { title: 'Nhà chờ duyệt giá', value: String(pending.length), icon: Tag, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', borderColor: 'border-l-amber-500', badge: pending.length > 0 ? 'Cần duyệt' : undefined, badgeColor: 'bg-amber-100 text-amber-700' },
    { title: 'Bảo trì chờ xử lý', value: String(agg.openMaintenance), icon: Wrench, iconBg: 'bg-rose-50', iconColor: 'text-rose-600', borderColor: 'border-l-rose-500' },
    { title: 'Quản lý vận hành', value: String(activeManagers), icon: UserCog, iconBg: 'bg-violet-50', iconColor: 'text-violet-600', borderColor: 'border-l-violet-500', badge: 'Đang hoạt động', badgeColor: 'bg-emerald-100 text-emerald-700' },
    { title: 'Hóa đơn chưa thu', value: formatCurrency(outstandingAmount), icon: Receipt, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', borderColor: 'border-l-amber-400', extra: <p className="text-xs text-slate-400 mt-1">{outstandingInvoices} hóa đơn</p> },
  ], [agg, pending.length, activeManagers, outstandingAmount, outstandingInvoices]);

  return (
    <div className="space-y-7">
      {/* Tiêu đề */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-primary-600 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Trang tổng quan</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">Bảng điều hành vận hành bất động sản Hoàng Bình Land — {MONTH_LABEL}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Hệ thống đang hoạt động</span>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Xuất báo cáo
          </button>
        </div>
      </div>

      {/* ★ Banner: Nhà chờ Host duyệt giá (gọn — 1 hàng dù 100 nhà) */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="bg-amber-100 p-2.5 rounded-xl flex-shrink-0"><Tag className="w-5 h-5 text-amber-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">{pending.length} toà nhà đang chờ bạn duyệt giá</p>
              <p className="text-xs text-amber-700 mt-0.5 truncate">
                {pending.slice(0, 3).map(p => p.propertyName).join(', ')}
                {pending.length > 3 ? ` … và ${pending.length - 3} nhà khác` : ''}
                {' — đã cấu hình khai thác xong, chờ Host duyệt giá để đưa vào vận hành.'}
              </p>
            </div>
            <Link to="/host/properties" className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm">
              Xem & duyệt tất cả <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => <KpiCard key={k.title} {...k} />)}
      </div>

      {/* Tài chính */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader title="Tổng quan tài chính" subtitle={`Dòng tiền 6 tháng gần nhất · ${MONTH_LABEL}: nhà đã duyệt giá`} icon={BarChart3}
            action={<Link to="/host/financial" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Chi tiết <ArrowRight className="w-3 h-3" /></Link>} />
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chartAdj} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.5} /></linearGradient>
                <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F43F5E" stopOpacity={0.95} /><stop offset="100%" stopColor="#F43F5E" stopOpacity={0.5} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
              <YAxis tickFormatter={fmtM} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={44} />
              <RechartsTooltip content={<FinTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="revenue" name="Doanh thu" fill="url(#gRev)" radius={[5, 5, 0, 0]} maxBarSize={30} />
              <Bar dataKey="expense" name="Chi phí" fill="url(#gExp)" radius={[5, 5, 0, 0]} maxBarSize={30} />
              <Line type="monotone" dataKey="loiNhuan" name="Lợi nhuận" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', stroke: '#6366F1', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#6366F1', stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col">
          <SectionHeader title="Cơ cấu chi phí" subtitle={`${MONTH_LABEL} · nhà đã duyệt giá`} icon={DollarSign} />
          {pieData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 py-10">Chưa có chi phí</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2 flex-1">
                {pieData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />{item.name}</span>
                    <span className="font-semibold text-slate-900">{fmtM(item.value)}₫</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Xu hướng lấp đầy */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeader title="Xu hướng tỷ lệ lấp đầy" subtitle="Tỷ lệ lấp đầy 6 tháng gần nhất" icon={Activity}
          action={<Link to="/host/reports" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Báo cáo <ArrowRight className="w-3 h-3" /></Link>} />
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartAdj} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs><linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} /><stop offset="95%" stopColor="#6366F1" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" width={40} />
            <RechartsTooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Area dataKey="lapDay" name="Lấp đầy thực tế" stroke="#6366F1" strokeWidth={2} fill="url(#occGrad)" dot={{ fill: '#6366F1', r: 3 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Vận hành bất động sản — chỉ nhà đã duyệt giá */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeader title="Tổng quan vận hành bất động sản" subtitle={`${agg.count} nhà đã duyệt giá · ${agg.totalRooms} phòng`} icon={Building2}
          action={<Link to="/host/properties" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Xem tất cả <ArrowRight className="w-3 h-3" /></Link>} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Nhà đã duyệt giá', value: agg.count, color: 'text-slate-900', bg: 'bg-slate-50', border: 'border-slate-200' },
            { label: 'Phòng đang thuê', value: agg.occupied, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
            { label: 'Phòng còn trống', value: agg.vacant, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Sự cố bảo trì', value: agg.openMaintenance, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
        {cards.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Chưa có nhà nào được duyệt giá.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map(prop => {
              const rate = prop.occupancyRate;
              const avail = Math.max(0, prop.totalRooms - prop.occupiedRooms - prop.openMaintenance);
              return (
                <Link key={prop.propertyId} to={`/host/properties/${prop.propertyId}`} className="block border border-slate-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm group-hover:text-primary-600 transition-colors">{prop.propertyName}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{prop.address}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-2 ${rate >= 85 ? 'bg-emerald-100 text-emerald-700' : rate >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{rate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3"><div className={`h-1.5 rounded-full transition-all ${rate >= 85 ? 'bg-emerald-500' : rate >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${rate}%` }} /></div>
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs mb-3">
                    <div className="bg-blue-50 rounded-lg py-1.5"><p className="font-bold text-blue-700">{prop.occupiedRooms}</p><p className="text-slate-400 text-[10px]">Đang thuê</p></div>
                    <div className="bg-emerald-50 rounded-lg py-1.5"><p className="font-bold text-emerald-700">{avail}</p><p className="text-slate-400 text-[10px]">Còn trống</p></div>
                    <div className="bg-amber-50 rounded-lg py-1.5"><p className="font-bold text-amber-700">{prop.openMaintenance}</p><p className="text-slate-400 text-[10px]">Bảo trì</p></div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Doanh thu/tháng</span>
                    <span className="font-bold text-emerald-700">{fmtM(prop.monthlyRevenue)}₫</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Quản lý vận hành (khi API có dữ liệu) */}
      {mgrPerf.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader title="Tổng quan quản lý vận hành" subtitle={`${mgrPerf.length} quản lý đang hoạt động`} icon={Users}
            action={<Link to="/host/operations-managers" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Tất cả <ArrowRight className="w-3 h-3" /></Link>} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mgrPerf.map(mgr => {
              const initials = (mgr.managerName || '?').split(' ').slice(-2).map(n => n[0]).join('').toUpperCase();
              return (
                <div key={mgr.managerId} className="border border-slate-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">{initials}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm truncate">{mgr.managerName}</p>
                      <p className="text-xs text-slate-400 truncate">{mgr.phone} · Lấp đầy {mgr.occupancyRate}%</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0 border border-emerald-200">Đang HĐ</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5"><p className="font-bold text-slate-900 text-base">{mgr.propertyCount}</p><p className="text-slate-400 text-[10px] mt-0.5">Bất động sản</p></div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5"><p className="font-bold text-blue-700 text-base">{mgr.activeTenants}</p><p className="text-slate-400 text-[10px] mt-0.5">Khách thuê</p></div>
                    <div className={`${mgr.openMaintenance > 0 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'} rounded-lg p-2.5`}><p className={`font-bold text-base ${mgr.openMaintenance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{mgr.openMaintenance}</p><p className="text-slate-400 text-[10px] mt-0.5">Sự cố mở</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cảnh báo & Thông báo (API thật) */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader title="Cảnh báo & Thông báo" subtitle={`${alerts.length} thông báo chưa đọc`} icon={AlertTriangle}
            action={<Link to="/host/notifications" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">Tất cả <ArrowRight className="w-3 h-3" /></Link>} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.map(n => (
              <div key={n.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 bg-slate-50 hover:shadow-sm transition-shadow">
                <div className="p-2 rounded-lg bg-white shadow-sm flex-shrink-0"><FileText className="w-4 h-4 text-primary-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
