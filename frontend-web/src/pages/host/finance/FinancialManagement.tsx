import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowUpRight, Wallet, Percent, Download, Scale, Info, AlertTriangle, UserPlus,
  RefreshCw, Building2, ArrowDownUp, UserCog, Receipt, Layers,
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
import type { Expense, ExpenseCategory } from '@/types/expense';
import {
  currentMonth, ChipFilter, FilterBar, MonthPicker, Pagination, SearchBox, SelectFilter, TableState,
  fmtDateTime, fmtMillion, matchVi, monthLabel, monthShort, pageSlice, shiftMonth,
} from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Quản lý Dòng tiền — 100% API thật, KHÔNG mock fallback.
//  - Mọi khối đều bám theo KỲ đang chọn (BE nhận tham số month=YYYY-MM):
//      /host/finance/cashflow · /host/finance/property-pnl
//      /host/reports/property-performance · /host/invoices · /host/expenses
//  - Chỉ hiển thị các nhà Host ĐÃ DUYỆT GIÁ; nhà chưa gán quản lý → banner nhắc.
//  - KPI + biểu đồ (kỳ đang chọn) + bảng đối soát dùng CHUNG 1 nguồn nên luôn khớp.
//  - BE chưa có dữ liệu → hiển thị 0 / trạng thái trống trung thực.
// ══════════════════════════════════════════════════════════════════════════════

type Period = 'month' | 'quarter' | 'year';
type RawPoint = { ym: string; revenue: number; expense: number };
type Bucket = { label: string; revenue: number; expense: number; net: number };

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Tháng' }, { key: 'quarter', label: 'Quý' }, { key: 'year', label: 'Năm' },
];

// Hạng mục chi phí — nhãn + màu chỉ dùng ở màn này nên khai báo tại chỗ.
const CATEGORY_META: Record<ExpenseCategory, { label: string; color: string; dot: string }> = {
  lease: { label: 'Thuê nhà (chủ nhà)', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  maintenance: { label: 'Bảo trì', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  equipment: { label: 'Thiết bị', color: 'bg-cyan-50 text-cyan-700', dot: 'bg-cyan-500' },
  management: { label: 'Quản lý', color: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  utility: { label: 'Điện nước', color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  other: { label: 'Khác', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};
const CATEGORY_OPTIONS: { key: ExpenseCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Mọi hạng mục' },
  ...(Object.keys(CATEGORY_META) as ExpenseCategory[]).map(k => ({ key: k, label: CATEGORY_META[k].label })),
];

function aggregate(series: RawPoint[], period: Period): Bucket[] {
  if (period === 'month') {
    return series.slice(-12).map(p => ({ label: monthShort(p.ym), revenue: p.revenue, expense: p.expense, net: p.revenue - p.expense }));
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
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p: any) => (<p key={p.name} style={{ color: p.color || p.stroke }}>{p.name}: {formatCurrency(p.value)}</p>))}
    </div>
  );
};

// ── Chuẩn hoá thông tin nhà ─────────────────────────────────────────────────────
type PropInfo = { id: string; name: string; status: string; price: number; managerId?: string; managerName?: string; wholeHouse: boolean };
type Financials = { revenue: number; leaseCost: number; otherExpense: number; totalExpense: number; net: number };
type Row = PropInfo & Financials & { occupancy: number; margin: number; roi: number };

const ZERO_FIN: Financials = { revenue: 0, leaseCost: 0, otherExpense: 0, totalExpense: 0, net: 0 };

type TypeKey = 'all' | 'whole' | 'room';
type ManagerKey = 'all' | 'assigned' | 'unassigned';
type RowSortKey = 'net-desc' | 'net-asc' | 'revenue-desc' | 'expense-desc' | 'occupancy-desc' | 'name-asc';
const ROW_SORT_OPTIONS: { key: RowSortKey; label: string }[] = [
  { key: 'net-desc', label: 'Lợi nhuận cao → thấp' },
  { key: 'net-asc', label: 'Lợi nhuận thấp → cao' },
  { key: 'revenue-desc', label: 'Dòng tiền vào cao nhất' },
  { key: 'expense-desc', label: 'Dòng tiền ra cao nhất' },
  { key: 'occupancy-desc', label: 'Tỷ lệ lấp đầy cao nhất' },
  { key: 'name-asc', label: 'Tên nhà A → Z' },
];

type ExpSortKey = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';
const EXP_SORT_OPTIONS: { key: ExpSortKey; label: string }[] = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'amount-desc', label: 'Số tiền cao → thấp' },
  { key: 'amount-asc', label: 'Số tiền thấp → cao' },
  { key: 'oldest', label: 'Cũ nhất' },
];

// ── Component ────────────────────────────────────────────────────────────────────
export const FinancialManagement = () => {
  const [month, setMonth] = useState(currentMonth());
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);

  const [rawSeries, setRawSeries] = useState<RawPoint[]>([]);
  const [unpaid, setUnpaid] = useState({ count: 0, amount: 0 });
  const [apiProps, setApiProps] = useState<PropertyResponse[]>([]);
  const [apiFin, setApiFin] = useState<Record<string, Financials>>({});
  const [occMap, setOccMap] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Bộ lọc bảng đối soát
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeKey>('all');
  const [mgrFilter, setMgrFilter] = useState<ManagerKey>('all');
  const [rowSort, setRowSort] = useState<RowSortKey>('net-desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // Bộ lọc sổ chi phí
  const [expQ, setExpQ] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory | 'all'>('all');
  const [expProperty, setExpProperty] = useState('all');
  const [expSort, setExpSort] = useState<ExpSortKey>('newest');
  const [expPage, setExpPage] = useState(1);
  const [expPerPage, setExpPerPage] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    const [cashflow, invoicePage, propPage, pnl, perf, expensePage] = await Promise.all([
      // Lấy rộng 24 kỳ tính ngược từ kỳ đang chọn để dựng được Quý/Năm.
      hostService.getCashflow(shiftMonth(month, -23), month).catch(() => null),
      // size lớn: BE mặc định 20/trang — lấy trọn kỳ để tổng "chưa thu" không bị hụt.
      hostService.getInvoices({ month, size: 500 }).catch(() => null),
      propertyService.getAllProperties().catch(() => null),
      hostService.getPropertyPnl(month).catch(() => null),
      hostService.getPropertyPerformance(month).catch(() => null),
      hostService.listExpensesPage({ month, size: 500 }).catch(() => null),
    ]);

    setRawSeries((cashflow?.series ?? [])
      .map(p => ({ ym: p.month, revenue: p.revenue, expense: p.expense }))
      .sort((a, b) => a.ym.localeCompare(b.ym)));

    const open = (invoicePage?.content ?? []).filter(i => i.status !== 'PAID');
    setUnpaid({ count: open.length, amount: open.reduce((s, i) => s + i.amount, 0) });

    if (propPage) setApiProps(propPage);

    const fin: Record<string, Financials> = {};
    for (const r of pnl?.rows ?? []) {
      fin[r.propertyId] = {
        revenue: r.revenue, leaseCost: r.leaseCost, otherExpense: r.otherExpense,
        totalExpense: r.totalExpense ?? r.leaseCost + r.otherExpense, net: r.net,
      };
    }
    setApiFin(fin);
    setOccMap(Object.fromEntries((perf ?? []).map(r => [String(r.propertyId), r.occupancyRate])));
    setExpenses(expensePage?.content ?? []);
    setLoading(false);
  }, [month]);
  useEffect(() => { load(); }, [load]);

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
    return {
      ...p, ...f, occupancy,
      margin: f.revenue > 0 ? Math.round((f.net / f.revenue) * 100) : 0,
      roi: f.totalExpense > 0 ? Math.round((f.net / f.totalExpense) * 100) : 0,
    };
  }), [approved, apiFin, occMap]);

  // Tổng luôn tính trên TOÀN BỘ nhà đã duyệt giá (không phụ thuộc bộ lọc bảng).
  const totals = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, leaseCost: a.leaseCost + r.leaseCost, otherExpense: a.otherExpense + r.otherExpense,
    totalExpense: a.totalExpense + r.totalExpense, net: a.net + r.net,
  }), { ...ZERO_FIN });
  const avgOccupancy = rows.length ? Math.round(rows.reduce((s, r) => s + r.occupancy, 0) / rows.length) : 0;
  const totalRoi = totals.totalExpense > 0 ? Math.round((totals.net / totals.totalExpense) * 100) : 0;

  // ── Lọc + sắp xếp bảng đối soát ──
  const typeCounts = useMemo(() => ({
    all: rows.length,
    whole: rows.filter(r => r.wholeHouse).length,
    room: rows.filter(r => !r.wholeHouse).length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const list = rows.filter(r =>
      (typeFilter === 'all' || (typeFilter === 'whole' ? r.wholeHouse : !r.wholeHouse)) &&
      (mgrFilter === 'all' || (mgrFilter === 'assigned' ? !!r.managerId : !r.managerId)) &&
      matchVi(q, r.name, r.managerName));

    const sorted = [...list];
    switch (rowSort) {
      case 'net-desc': sorted.sort((a, b) => b.net - a.net); break;
      case 'net-asc': sorted.sort((a, b) => a.net - b.net); break;
      case 'revenue-desc': sorted.sort((a, b) => b.revenue - a.revenue); break;
      case 'expense-desc': sorted.sort((a, b) => b.totalExpense - a.totalExpense); break;
      case 'occupancy-desc': sorted.sort((a, b) => b.occupancy - a.occupancy); break;
      case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
    }
    return sorted;
  }, [rows, typeFilter, mgrFilter, q, rowSort]);

  const pagedRows = pageSlice(filteredRows, page, perPage);
  const rowFilters = (q ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (mgrFilter !== 'all' ? 1 : 0);
  const resetRowFilters = () => { setQ(''); setTypeFilter('all'); setMgrFilter('all'); setPage(1); };
  const onRowFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  // ── Lọc + sắp xếp sổ chi phí ──
  const expPropertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả bất động sản' },
    ...[...new Set(expenses.map(e => e.propertyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [expenses]);

  const filteredExpenses = useMemo(() => {
    const list = expenses.filter(e =>
      (expCategory === 'all' || e.category === expCategory) &&
      (expProperty === 'all' || e.propertyName === expProperty) &&
      matchVi(expQ, e.propertyName, e.note, CATEGORY_META[e.category]?.label));

    const sorted = [...list];
    switch (expSort) {
      case 'newest': sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')); break;
      case 'oldest': sorted.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')); break;
      case 'amount-desc': sorted.sort((a, b) => b.amount - a.amount); break;
      case 'amount-asc': sorted.sort((a, b) => a.amount - b.amount); break;
    }
    return sorted;
  }, [expenses, expCategory, expProperty, expQ, expSort]);

  const pagedExpenses = pageSlice(filteredExpenses, expPage, expPerPage);
  const expenseTotal = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);
  const expFilters = (expQ ? 1 : 0) + (expCategory !== 'all' ? 1 : 0) + (expProperty !== 'all' ? 1 : 0);
  const resetExpFilters = () => { setExpQ(''); setExpCategory('all'); setExpProperty('all'); setExpPage(1); };
  const onExpFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setExpPage(1); };

  // ── Cơ cấu dòng tiền ra: cùng nguồn với bảng ──
  const breakdown = useMemo(() => (
    [
      { name: 'Thuê nhà nguyên căn', value: totals.leaseCost, color: '#6366f1' },
      { name: 'Chi phí khác', value: totals.otherExpense, color: '#f59e0b' },
    ].filter(x => x.value > 0)
  ), [totals]);

  // ── Dòng tiền theo kỳ: kỳ đang chọn = nhà đã duyệt giá (khớp KPI + bảng);
  //    các kỳ trước lấy từ sổ dòng tiền BE. ──
  const adjustedSeries = useMemo<RawPoint[]>(() => {
    let found = false;
    const out = rawSeries.map(p => {
      if (p.ym === month) { found = true; return { ym: p.ym, revenue: totals.revenue, expense: totals.totalExpense }; }
      return p;
    });
    if (!found) out.push({ ym: month, revenue: totals.revenue, expense: totals.totalExpense });
    return out;
  }, [rawSeries, totals, month]);

  const buckets = useMemo(() => aggregate(adjustedSeries, period), [adjustedSeries, period]);
  const latest = buckets[buckets.length - 1] ?? { label: '', revenue: 0, expense: 0, net: 0 };
  const prev = buckets[buckets.length - 2];
  const periodWord = period === 'month' ? 'tháng' : period === 'quarter' ? 'quý' : 'năm';

  const handleExportExcel = () => {
    exportToExcel(`DongTien_HoangBinhLand_${month}`, [
      { name: `Dòng tiền theo ${periodWord}`, rows: buckets.map(b => ({ 'Kỳ': b.label, 'Dòng tiền vào (₫)': b.revenue, 'Dòng tiền ra (₫)': b.expense, 'Lợi nhuận ròng (₫)': b.net })) },
      {
        name: 'Đối soát theo nhà',
        rows: filteredRows.map(r => ({
          'Nhà': r.name, 'Loại': r.wholeHouse ? 'Nguyên căn' : 'Theo phòng',
          'Dòng tiền vào (₫)': r.revenue, 'Thuê căn (₫)': r.leaseCost, 'Chi phí khác (₫)': r.otherExpense,
          'Dòng tiền ra (₫)': r.totalExpense, 'Lợi nhuận ròng (₫)': r.net,
          'Lấp đầy (%)': r.occupancy, 'ROI (%)': r.roi,
          'Quản lý': r.managerName ?? (r.managerId ? 'Đã gán' : 'CHƯA GÁN'),
        })),
      },
      {
        name: 'Sổ chi phí',
        rows: filteredExpenses.map(e => ({
          'Ngày ghi nhận': fmtDateTime(e.createdAt), 'Bất động sản': e.propertyName,
          'Hạng mục': CATEGORY_META[e.category]?.label ?? e.category,
          'Số tiền (₫)': e.amount, 'Kỳ': e.month, 'Ghi chú': e.note ?? '',
        })),
      },
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Dòng tiền</h1>
          <p className="mt-1 text-sm text-slate-500">
            Đối soát dòng tiền vào/ra & lợi nhuận ròng các nhà đã duyệt giá — {monthLabel(month)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={m => { setMonth(m); setPage(1); setExpPage(1); }} />
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${period === p.key ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExportExcel} className="btn-primary flex items-center gap-2">
            <Download className="h-5 w-5" /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Banner nhắc gán quản lý */}
      {needManager.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">{needManager.length} nhà đã duyệt giá nhưng chưa gán quản lý vận hành</p>
              <p className="mt-0.5 text-xs text-amber-700">Nhà chưa có quản lý sẽ không thu được tiền phòng (dòng tiền vào = 0). Hãy gán quản lý để bắt đầu vận hành & ghi nhận doanh thu.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {needManager.map(p => (
                  <Link key={p.id} to={`/host/properties/${p.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100">
                    <UserPlus className="h-3.5 w-3.5" /> Gán quản lý · {p.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(card => (
          <div key={card.label} className={`rounded-xl border border-slate-100 border-l-4 bg-white p-5 shadow-sm ${card.border}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`mt-1 text-xl font-bold ${card.text}`}>{card.value}</p>
                {card.delta !== null && (
                  <p className={`mt-1 text-xs font-medium ${card.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {card.delta >= 0 ? '▲' : '▼'} {Math.abs(card.delta)}% so với kỳ trước
                  </p>
                )}
                <p className="mt-1 truncate text-xs text-slate-400">{card.sub}</p>
              </div>
              <div className={`${card.bg} flex-shrink-0 rounded-xl p-3`}><card.icon className={`h-5 w-5 ${card.iconColor}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Biểu đồ dòng tiền + cơ cấu dòng tiền ra */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Dòng tiền vào / ra & lợi nhuận ròng — theo {periodWord}</h2>
          <p className="mb-3 text-xs text-slate-400">{latest.label}: nhà đã duyệt giá · các kỳ trước: theo sổ dòng tiền hệ thống</p>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={buckets} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id="cfRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.5} /></linearGradient>
                <linearGradient id="cfExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0.5} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
              <YAxis tickFormatter={fmtMillion} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
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
          <h2 className="mb-1 text-base font-semibold text-slate-900">Cơ cấu dòng tiền ra</h2>
          <p className="mb-3 text-xs text-slate-400">Nhà đã duyệt giá · {monthLabel(month)}</p>
          {breakdown.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">
              {loading ? 'Đang tải…' : 'Chưa có chi phí'}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={breakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {breakdown.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {breakdown.map(e => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: e.color }} /><span className="text-slate-600">{e.name}</span></span>
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
        <div className="flex items-center gap-2 px-5 pt-5">
          <Scale className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Đối soát tự động theo từng nhà đã duyệt giá</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              So khớp dòng tiền vào (thu phòng, dịch vụ) với dòng tiền ra (thuê căn + chi phí) → lợi nhuận ròng, lấp đầy & ROI
            </p>
          </div>
        </div>

        <FilterBar activeCount={rowFilters} onReset={resetRowFilters}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={q} onChange={onRowFilter(setQ)} className="flex-1"
              placeholder="Tìm theo tên nhà hoặc tên quản lý vận hành... (không cần dấu)" />
            <div className="flex flex-wrap items-center gap-2">
              <SelectFilter value={mgrFilter} onChange={onRowFilter(setMgrFilter)} icon={UserCog} title="Lọc theo quản lý vận hành"
                options={[
                  { key: 'all', label: 'Mọi trạng thái QL' },
                  { key: 'assigned', label: 'Đã gán quản lý' },
                  { key: 'unassigned', label: 'Chưa gán quản lý' },
                ]} />
              <SelectFilter value={rowSort} onChange={setRowSort} options={ROW_SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[218px]" />
            </div>
          </div>
          <ChipFilter value={typeFilter} onChange={onRowFilter(setTypeFilter)}
            options={[
              { key: 'all', label: 'Tất cả', count: typeCounts.all },
              { key: 'whole', label: 'Nguyên căn', count: typeCounts.whole },
              { key: 'room', label: 'Theo phòng', count: typeCounts.room },
            ]} />
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
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
              {pagedRows.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    {r.name}
                    {!r.managerId && <span className="ml-2 align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">chưa gán QL</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.wholeHouse ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{r.wholeHouse ? 'Nguyên căn' : 'Theo phòng'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">{formatCurrency(r.leaseCost)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">{formatCurrency(r.otherExpense)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(r.totalExpense)}</td>
                  <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${r.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{formatCurrency(r.net)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 sm:inline-block"><span className="block h-full bg-amber-500" style={{ width: `${r.occupancy}%` }} /></span>
                      <span className="font-medium tabular-nums text-slate-700">{r.occupancy}%</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.roi >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.roi}%</span></td>
                </tr>
              ))}
              {pagedRows.length === 0 && (
                <TableState colSpan={9} loading={loading} filtered={rowFilters > 0}
                  empty="Chưa có nhà nào được Host duyệt giá." />
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-5 py-3.5" colSpan={2}>Tất cả ({rows.length} nhà đã duyệt giá)</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(totals.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.leaseCost)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(totals.otherExpense)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(totals.totalExpense)}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums ${totals.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{formatCurrency(totals.net)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{avgOccupancy}%</td>
                  <td className="px-5 py-3.5 text-right"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{totalRoi}%</span></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={perPage} total={filteredRows.length}
          onPage={setPage} onPerPage={setPerPage} unit="nhà" />

        <p className="flex items-center gap-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Dòng tổng luôn tính trên toàn bộ nhà đã duyệt giá (không đổi theo bộ lọc) nên KPI, biểu đồ và bảng luôn khớp. ROI = lợi nhuận ròng / dòng tiền ra.
        </p>
      </div>

      {/* Sổ chi phí phát sinh — nguồn: /host/expenses (BE trả mới nhất trước) */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Receipt className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Sổ chi phí phát sinh — {monthLabel(month)}</h2>
            <p className="text-xs text-slate-500">
              {filteredExpenses.length} khoản · tổng {formatCurrency(expenseTotal)} · khoản ghi nhận mới nhất nằm trên cùng
            </p>
          </div>
        </div>

        <FilterBar activeCount={expFilters} onReset={resetExpFilters}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={expQ} onChange={onExpFilter(setExpQ)} className="flex-1"
              placeholder="Tìm theo bất động sản, hạng mục, ghi chú... (không cần dấu)" />
            <div className="flex flex-wrap items-center gap-2">
              <SelectFilter value={expCategory} onChange={onExpFilter(setExpCategory)} options={CATEGORY_OPTIONS} icon={Layers} title="Lọc theo hạng mục" />
              <SelectFilter value={expProperty} onChange={onExpFilter(setExpProperty)} options={expPropertyOptions} icon={Building2} title="Lọc theo bất động sản" />
              <SelectFilter value={expSort} onChange={setExpSort} options={EXP_SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[190px]" />
            </div>
          </div>
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Ghi nhận lúc</th>
                <th className="px-5 py-3.5">Bất động sản</th>
                <th className="px-5 py-3.5">Hạng mục</th>
                <th className="px-5 py-3.5">Ghi chú</th>
                <th className="px-5 py-3.5 text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedExpenses.map(e => {
                const meta = CATEGORY_META[e.category] ?? CATEGORY_META.other;
                return (
                  <tr key={e.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5 text-sm tabular-nums text-slate-600">{fmtDateTime(e.createdAt)}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{e.propertyName}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate px-5 py-3.5 text-slate-500" title={e.note}>{e.note || '—'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-rose-600">{formatCurrency(e.amount)}</td>
                  </tr>
                );
              })}
              {pagedExpenses.length === 0 && (
                <TableState colSpan={5} loading={loading} filtered={expFilters > 0}
                  empty="Chưa ghi nhận chi phí phát sinh nào trong kỳ này." />
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={expPage} perPage={expPerPage} total={filteredExpenses.length}
          onPage={setExpPage} onPerPage={setExpPerPage} unit="khoản chi" />
      </div>
    </div>
  );
};
