import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowUpRight, Wallet, Percent, Download, Scale, Info, AlertTriangle, UserPlus,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { exportToExcel } from '@/utils/exportExcel';
import { hostService } from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';

// ══════════════════════════════════════════════════════════════════════════════
// Quản lý Dòng tiền (Cash Flow Management) — 100% API thật, KHÔNG mock fallback.
//  - Chỉ hiển thị các nhà Host ĐÃ DUYỆT GIÁ.
//  - Nhà đã duyệt giá nhưng CHƯA GÁN quản lý → banner nhắc Host.
//  - KPI + biểu đồ (tháng hiện tại) + bảng đối soát dùng CHUNG 1 nguồn nên luôn khớp.
//  - BE chưa có dữ liệu → hiển thị 0 / trạng thái trống trung thực.
// ══════════════════════════════════════════════════════════════════════════════

type Period = 'month' | 'quarter' | 'year';
type RawPoint = { ym: string; revenue: number; expense: number };
type Bucket = { label: string; revenue: number; expense: number; net: number };

// Tháng vận hành = tháng hiện tại THẬT của hệ thống.
const NOW = new Date();
const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTH = `${NOW.getFullYear()}-${pad2(NOW.getMonth() + 1)}`;
const monthsAgo = (k: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - k, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
const fmtM = (v: number) => `${(v / 1_000_000).toFixed(0)}tr`;
const ymLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Th${Number(m)}/${y.slice(2)}`; };

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Tháng' }, { key: 'quarter', label: 'Quý' }, { key: 'year', label: 'Năm' },
];

function aggregate(series: RawPoint[], period: Period): Bucket[] {
  if (period === 'month') {
    return series.slice(-12).map(p => ({ label: ymLabel(p.ym), revenue: p.revenue, expense: p.expense, net: p.revenue - p.expense }));
  }
  const map = new Map<string, Bucket>();
  for (const p of series) {
    const [y, m] = p.ym.split('-');
    const q = Math.floor((Number(m) - 1) / 3) + 1;
    const key = period === 'quarter' ? `${y}-Q${q}` : y;
    const label = period === 'quarter' ? `Q${q}/${y.slice(2)}` : y;
    const cur = map.get(key) ?? { label, revenue: 0, expense: 0, net: 0 };
    cur.revenue += p.revenue; cur.expense += p.expense; cur.net = cur.revenue - cur.expense;
    map.set(key, cur);
  }
  const arr = [...map.values()];
  return period === 'quarter' ? arr.slice(-8) : arr;
}

const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : 0);

// Nhà "đã duyệt giá" — mirror isHostApproved() ở PropertyList.
const isApproved = (status: string, price: number, hasManager: boolean) => {
  if (status === 'ACTIVE' || status === 'RENTED' || status === 'PENDING_OPERATION_MANAGER') return true;
  if (status === 'UNDER_RENOVATION' || status === 'DISABLED') return price > 0 || hasManager;
  return false;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (<p key={p.name} style={{ color: p.color || p.stroke }}>{p.name}: {formatCurrency(p.value)}</p>))}
    </div>
  );
};

// ── Chuẩn hoá thông tin nhà ─────────────────────────────────────────────────────
type PropInfo = { id: string; name: string; status: string; price: number; managerId?: string; managerName?: string; wholeHouse: boolean };
type Financials = { revenue: number; leaseCost: number; otherExpense: number; totalExpense: number; net: number };
type Row = PropInfo & Financials & { occupancy: number; margin: number; roi: number };

const ZERO_FIN: Financials = { revenue: 0, leaseCost: 0, otherExpense: 0, totalExpense: 0, net: 0 };

// ── Component ────────────────────────────────────────────────────────────────────
export const FinancialManagement = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [rawSeries, setRawSeries] = useState<RawPoint[]>([]);
  const [unpaid, setUnpaid] = useState({ count: 0, amount: 0 });
  const [apiProps, setApiProps] = useState<PropertyResponse[]>([]);
  const [apiFin, setApiFin] = useState<Record<string, Financials>>({});
  const [occMap, setOccMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    // Dòng tiền: lấy rộng 24 tháng thật để dựng được Quý/Năm.
    hostService.getCashflow(monthsAgo(23), MONTH)
      .then(res => {
        if (!active || !res?.series) return;
        setRawSeries(res.series.map(p => ({ ym: p.month, revenue: p.revenue, expense: p.expense })).sort((a, b) => a.ym.localeCompare(b.ym)));
      }).catch(() => {});
    hostService.getInvoices({})
      .then(page => {
        if (!active) return;
        const out = (page?.content ?? []).filter(i => i.status !== 'PAID');
        setUnpaid({ count: out.length, amount: out.reduce((s, i) => s + i.amount, 0) });
      }).catch(() => {});
    propertyService.getProperties(0, 200)
      .then(res => { if (active && res?.content) setApiProps(res.content); }).catch(() => {});
    hostService.getPropertyPnl(MONTH)
      .then(res => {
        if (!active || !res?.rows) return;
        const m: Record<string, Financials> = {};
        for (const r of res.rows) {
          const totalExpense = r.totalExpense ?? r.leaseCost + r.otherExpense;
          m[r.propertyId] = { revenue: r.revenue, leaseCost: r.leaseCost, otherExpense: r.otherExpense, totalExpense, net: r.net };
        }
        setApiFin(m);
      }).catch(() => {});
    hostService.getPropertyPerformance(MONTH)
      .then(rows => { if (active && rows?.length) setOccMap(Object.fromEntries(rows.map(r => [r.propertyId, r.occupancyRate]))); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // ── Danh sách nhà thật ──
  const props = useMemo<PropInfo[]>(() => apiProps.map(p => ({
    id: String(p.id), name: p.propertyName, status: p.status, price: p.price ?? 0,
    managerId: p.operationManagerId, managerName: p.operationManagerName, wholeHouse: p.wholeHouse === true,
  })), [apiProps]);

  const approved = useMemo(() => props.filter(p => isApproved(p.status, p.price, !!p.managerId)), [props]);
  const needManager = useMemo(() => approved.filter(p => !p.managerId), [approved]);

  const rows = useMemo<Row[]>(() => approved.map(p => {
    const f = apiFin[p.id] ?? ZERO_FIN;
    const occupancy = occMap[p.id] ?? 0;
    return { ...p, ...f, occupancy, margin: f.revenue > 0 ? Math.round((f.net / f.revenue) * 100) : 0, roi: f.totalExpense > 0 ? Math.round((f.net / f.totalExpense) * 100) : 0 };
  }), [approved, apiFin, occMap]);

  const totals = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, leaseCost: a.leaseCost + r.leaseCost, otherExpense: a.otherExpense + r.otherExpense,
    totalExpense: a.totalExpense + r.totalExpense, net: a.net + r.net,
  }), { ...ZERO_FIN });
  const avgOccupancy = rows.length ? Math.round(rows.reduce((s, r) => s + r.occupancy, 0) / rows.length) : 0;
  const totalRoi = totals.totalExpense > 0 ? Math.round((totals.net / totals.totalExpense) * 100) : 0;

  // ── Cơ cấu dòng tiền ra: cùng nguồn với bảng ──
  const breakdown = useMemo(() => (
    [
      { name: 'Thuê nhà nguyên căn', value: totals.leaseCost, color: '#6366f1' },
      { name: 'Chi phí khác',        value: totals.otherExpense, color: '#f59e0b' },
    ].filter(x => x.value > 0)
  ), [totals]);

  // ── Dòng tiền theo kỳ: tháng hiện tại = nhà đã duyệt giá (khớp KPI + bảng);
  //    các tháng trước lấy từ sổ dòng tiền BE. ──
  const adjustedSeries = useMemo<RawPoint[]>(() => {
    let found = false;
    const out = rawSeries.map(p => {
      if (p.ym === MONTH) { found = true; return { ym: p.ym, revenue: totals.revenue, expense: totals.totalExpense }; }
      return p;
    });
    if (!found) out.push({ ym: MONTH, revenue: totals.revenue, expense: totals.totalExpense });
    return out;
  }, [rawSeries, totals]);

  const buckets = useMemo(() => aggregate(adjustedSeries, period), [adjustedSeries, period]);
  const latest = buckets[buckets.length - 1] ?? { label: '', revenue: 0, expense: 0, net: 0 };
  const prev = buckets[buckets.length - 2];
  const periodWord = period === 'month' ? 'tháng' : period === 'quarter' ? 'quý' : 'năm';

  const handleExportExcel = () => {
    exportToExcel('DongTien_HoangBinhLand', [
      { name: `Dòng tiền theo ${periodWord}`, rows: buckets.map(b => ({ 'Kỳ': b.label, 'Dòng tiền vào (₫)': b.revenue, 'Dòng tiền ra (₫)': b.expense, 'Lợi nhuận ròng (₫)': b.net })) },
      { name: 'Đối soát theo nhà', rows: rows.map(r => ({ 'Nhà': r.name, 'Loại': r.wholeHouse ? 'Nguyên căn' : 'Theo phòng', 'Dòng tiền vào (₫)': r.revenue, 'Thuê căn (₫)': r.leaseCost, 'Chi phí khác (₫)': r.otherExpense, 'Dòng tiền ra (₫)': r.totalExpense, 'Lợi nhuận ròng (₫)': r.net, 'Lấp đầy (%)': r.occupancy, 'ROI (%)': r.roi, 'Quản lý': r.managerName ?? (r.managerId ? 'Đã gán' : 'CHƯA GÁN') })) },
    ]);
  };

  const kpis = [
    { label: 'Dòng tiền vào', value: formatCurrency(latest.revenue), icon: ArrowDownLeft, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', border: 'border-l-emerald-500', text: 'text-emerald-700', sub: `Còn ${formatCurrency(unpaid.amount)} chưa thu (${unpaid.count} HĐ)`, delta: prev ? pct(latest.revenue, prev.revenue) : null },
    { label: 'Dòng tiền ra', value: formatCurrency(latest.expense), icon: ArrowUpRight, bg: 'bg-rose-50', iconColor: 'text-rose-600', border: 'border-l-rose-500', text: 'text-rose-700', sub: 'Thuê căn + chi phí khác (nhà đã duyệt giá)', delta: prev ? pct(latest.expense, prev.expense) : null },
    { label: 'Lợi nhuận ròng', value: formatCurrency(latest.net), icon: Wallet, bg: 'bg-indigo-50', iconColor: 'text-indigo-600', border: 'border-l-indigo-500', text: latest.net >= 0 ? 'text-indigo-700' : 'text-rose-700', sub: `Biên LN ${latest.revenue > 0 ? Math.round((latest.net / latest.revenue) * 100) : 0}% · ROI ${totalRoi}%`, delta: prev ? pct(latest.net, prev.net) : null },
    { label: 'Tỷ lệ lấp đầy TB', value: `${avgOccupancy}%`, icon: Percent, bg: 'bg-amber-50', iconColor: 'text-amber-600', border: 'border-l-amber-500', text: 'text-amber-700', sub: `${rows.length} nhà đã duyệt giá`, delta: null },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề + chọn kỳ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Dòng tiền</h1>
          <p className="text-sm text-slate-500 mt-1">Đối soát dòng tiền vào/ra & lợi nhuận ròng các nhà đã duyệt giá — {latest.label}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${period === p.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={handleExportExcel} className="btn-primary flex items-center gap-2">
            <Download className="w-5 h-5" /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Banner nhắc gán quản lý */}
      {needManager.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="bg-amber-100 p-2 rounded-lg flex-shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">{needManager.length} nhà đã duyệt giá nhưng chưa gán quản lý vận hành</p>
              <p className="text-xs text-amber-700 mt-0.5">Nhà chưa có quản lý sẽ không thu được tiền phòng (dòng tiền vào = 0). Hãy gán quản lý để bắt đầu vận hành & ghi nhận doanh thu.</p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {needManager.map(p => (
                  <Link key={p.id} to={`/host/properties/${p.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors">
                    <UserPlus className="w-3.5 h-3.5" /> Gán quản lý · {p.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(card => (
          <div key={card.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${card.border} p-5`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</p>
                <p className={`text-xl font-bold mt-1 ${card.text}`}>{card.value}</p>
                {card.delta !== null && (
                  <p className={`text-xs mt-1 font-medium ${card.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{card.delta >= 0 ? '▲' : '▼'} {Math.abs(card.delta)}% so với kỳ trước</p>
                )}
                <p className="text-xs text-slate-400 mt-1 truncate">{card.sub}</p>
              </div>
              <div className={`${card.bg} p-3 rounded-xl flex-shrink-0`}><card.icon className={`w-5 h-5 ${card.iconColor}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Biểu đồ dòng tiền + cơ cấu dòng tiền ra */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Dòng tiền vào / ra & lợi nhuận ròng — theo {periodWord}</h2>
          <p className="text-xs text-slate-400 mb-3">{latest.label}: nhà đã duyệt giá · các kỳ trước: theo sổ dòng tiền hệ thống</p>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={buckets} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id="cfRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.5} /></linearGradient>
                <linearGradient id="cfExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0.5} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
              <YAxis tickFormatter={fmtM} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="revenue" name="Dòng tiền vào" fill="url(#cfRev)" radius={[5, 5, 0, 0]} maxBarSize={30} />
              <Bar dataKey="expense" name="Dòng tiền ra" fill="url(#cfExp)" radius={[5, 5, 0, 0]} maxBarSize={30} />
              <Line type="monotone" dataKey="net" name="Lợi nhuận ròng" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Cơ cấu dòng tiền ra</h2>
          <p className="text-xs text-slate-400 mb-3">Nhà đã duyệt giá · tháng hiện tại</p>
          {breakdown.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">Chưa có chi phí</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={breakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {breakdown.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {breakdown.map(e => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} /><span className="text-slate-600">{e.name}</span></span>
                    <span className="font-medium text-slate-800">{formatCurrency(e.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Đối soát theo từng nhà đã duyệt giá */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Đối soát tự động theo từng nhà đã duyệt giá</h2>
            <p className="text-xs text-slate-500 mt-0.5">Chỉ hiển thị nhà Host đã duyệt giá · so khớp dòng tiền vào (thu phòng, dịch vụ) với dòng tiền ra (thuê căn + chi phí) → lợi nhuận ròng, lấp đầy & ROI</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Nhà</th>
                <th className="px-4 py-3.5">Loại</th>
                <th className="px-4 py-3.5 text-right">Dòng tiền vào</th>
                <th className="px-4 py-3.5 text-right">Thuê căn</th>
                <th className="px-4 py-3.5 text-right">Chi phí khác</th>
                <th className="px-4 py-3.5 text-right">Dòng tiền ra</th>
                <th className="px-4 py-3.5 text-right">Lợi nhuận ròng</th>
                <th className="px-4 py-3.5 text-right">Lấp đầy</th>
                <th className="px-5 py-3.5 text-right">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    {r.name}
                    {!r.managerId && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">chưa gán QL</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.wholeHouse ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{r.wholeHouse ? 'Nguyên căn' : 'Theo phòng'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">{formatCurrency(r.leaseCost)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">{formatCurrency(r.otherExpense)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(r.totalExpense)}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${r.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{formatCurrency(r.net)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden hidden sm:inline-block"><span className="block h-full bg-amber-500" style={{ width: `${r.occupancy}%` }} /></span>
                      <span className="tabular-nums text-slate-700 font-medium">{r.occupancy}%</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.roi >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.roi}%</span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400 text-sm">Chưa có nhà nào được Host duyệt giá.</td></tr>
              )}
              {rows.length > 0 && (
                <tr className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-200">
                  <td className="px-5 py-3.5" colSpan={2}>Tất cả ({rows.length} nhà)</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(totals.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.leaseCost)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.otherExpense)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(totals.totalExpense)}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums ${totals.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{formatCurrency(totals.net)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{avgOccupancy}%</td>
                  <td className="px-5 py-3.5 text-right"><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{totalRoi}%</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-400 border-t border-slate-100 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          KPI, biểu đồ (tháng hiện tại) và bảng dùng chung số liệu nhà đã duyệt giá nên luôn khớp. ROI = lợi nhuận ròng / dòng tiền ra.
        </p>
      </div>
    </div>
  );
};
