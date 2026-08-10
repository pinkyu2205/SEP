import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download, RefreshCw, BarChart3, Users, Building2, TrendingUp, TrendingDown,
  Wallet, Percent, ArrowDownUp, ArrowRight, Info, UserCog,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { exportToExcel } from '@/utils/exportExcel';
import {
  hostService,
  type FinancialSummaryRow, type ManagerPerformanceRow, type PropertyPerformanceRow,
} from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import {
  CURRENT_MONTH, ChipFilter, FilterBar, Pagination, SearchBox, SelectFilter, TableState,
  fmtMillion, matchVi, monthLabel, monthShort, pageSlice, safePct, shiftMonth,
} from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Báo cáo & Phân tích (Host) — 100% API thật, KHÔNG mock.
//   • Tài chính theo kỳ  ← GET /host/reports/financial-summary?from=&to=
//   • Hiệu suất quản lý  ← GET /host/reports/manager-performance?month=
//   • Hiệu suất theo nhà ← GET /host/reports/property-performance?month=
//                        + GET /host/finance/property-pnl?month=  (doanh thu/chi phí thật)
//
// Bản cũ trộn MOCK_PROPERTIES / MOCK_USERS với API và chốt cứng khoảng
// '2025-12' → CURRENT_MONTH='2026-05' của expenseStore, nên bảng hiện sai kỳ,
// đánh dấu "Hiện tại" nhầm tháng và chia cho doanh thu 0 → NaN% / -Infinity%.
// Ở đây mọi tỷ lệ đều đi qua safePct(): doanh thu 0 thì hiện "—", không chia.
//
// ⚠ Giới hạn BE đã biết (docs/BE-NEED-host-finance-modules-2026-08-09.md):
//   - financial-summary trả `occupancyRate` là tỷ lệ lấp đầy HIỆN TẠI cho mọi kỳ
//     (không có lịch sử) → không vẽ đường xu hướng lấp đầy để khỏi bịa số.
//   - manager-performance: `resolvedMaintenance` luôn 0, `openMaintenance` thực chất
//     là SỐ PHÒNG đang ở trạng thái bảo trì → đặt tên cột đúng như vậy.
// ══════════════════════════════════════════════════════════════════════════════

const pctText = (v: number | null) => (v === null ? '—' : `${v}%`);

interface FinRow {
  ym: string;
  label: string;
  revenue: number;
  expense: number;
  net: number;
  margin: number | null;
}

interface PropRow {
  id: string;
  name: string;
  address: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  maintenanceRooms: number;
  revenue: number;
  expense: number;
  net: number;
  margin: number | null;
  approved: boolean;
}

type RangeKey = '6' | '12';
type PropSortKey = 'revenue-desc' | 'net-desc' | 'occupancy-desc' | 'occupancy-asc' | 'name-asc';
const PROP_SORT_OPTIONS: { key: PropSortKey; label: string }[] = [
  { key: 'revenue-desc', label: 'Doanh thu cao → thấp' },
  { key: 'net-desc', label: 'Lợi nhuận cao → thấp' },
  { key: 'occupancy-desc', label: 'Lấp đầy cao nhất' },
  { key: 'occupancy-asc', label: 'Lấp đầy thấp nhất' },
  { key: 'name-asc', label: 'Tên nhà A → Z' },
];

type MgrSortKey = 'occupancy-desc' | 'properties-desc' | 'tenants-desc' | 'name-asc';
const MGR_SORT_OPTIONS: { key: MgrSortKey; label: string }[] = [
  { key: 'occupancy-desc', label: 'Lấp đầy cao nhất' },
  { key: 'properties-desc', label: 'Nhiều nhà nhất' },
  { key: 'tenants-desc', label: 'Nhiều khách thuê nhất' },
  { key: 'name-asc', label: 'Tên A → Z' },
];

// Nhà "đã duyệt giá" — mirror isHostApproved() ở PropertyList.
const isApproved = (status: string, price: number, hasManager: boolean) => {
  if (status === 'ACTIVE' || status === 'RENTED' || status === 'PENDING_OPERATION_MANAGER') return true;
  if (status === 'UNDER_RENOVATION' || status === 'DISABLED') return price > 0 || hasManager;
  return false;
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || p.stroke }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
};

export const ReportsAnalytics = () => {
  const [range, setRange] = useState<RangeKey>('6');
  const [loading, setLoading] = useState(true);

  const [finRows, setFinRows] = useState<FinRow[]>([]);
  const [mgrRows, setMgrRows] = useState<ManagerPerformanceRow[]>([]);
  const [propPerf, setPropPerf] = useState<PropertyPerformanceRow[]>([]);
  const [pnl, setPnl] = useState<Record<string, { revenue: number; expense: number; net: number }>>({});
  const [apiProps, setApiProps] = useState<PropertyResponse[]>([]);

  const months = Number(range);
  const from = shiftMonth(CURRENT_MONTH, -(months - 1));

  const load = useCallback(async () => {
    setLoading(true);
    const [summary, managers, performance, pnlRes, propPage] = await Promise.all([
      hostService.getFinancialSummary(from, CURRENT_MONTH).catch(() => null),
      hostService.getManagerPerformance(CURRENT_MONTH).catch(() => null),
      hostService.getPropertyPerformance(CURRENT_MONTH).catch(() => null),
      hostService.getPropertyPnl(CURRENT_MONTH).catch(() => null),
      propertyService.getProperties(0, 200).catch(() => null),
    ]);

    setFinRows((summary ?? []).map((r: FinancialSummaryRow) => {
      const net = r.netProfit ?? r.revenue - r.expense;
      return {
        ym: r.month,
        label: monthShort(r.month),
        revenue: r.revenue,
        expense: r.expense,
        net,
        // BE đã tính marginPct, nhưng chỉ tin khi có doanh thu — tránh 0/0.
        margin: r.revenue > 0 ? Math.round(r.marginPct ?? (net / r.revenue) * 100) : null,
      };
    }));
    setMgrRows(managers ?? []);
    setPropPerf(performance ?? []);

    const map: Record<string, { revenue: number; expense: number; net: number }> = {};
    for (const r of pnlRes?.rows ?? []) {
      map[r.propertyId] = {
        revenue: r.revenue,
        expense: r.totalExpense ?? r.leaseCost + r.otherExpense,
        net: r.net,
      };
    }
    setPnl(map);
    setApiProps(propPage?.content ?? []);
    setLoading(false);
  }, [from]);
  useEffect(() => { load(); }, [load]);

  // ── Tổng hợp tài chính toàn kỳ ──
  const totals = useMemo(() => {
    const revenue = finRows.reduce((s, r) => s + r.revenue, 0);
    const expense = finRows.reduce((s, r) => s + r.expense, 0);
    const net = revenue - expense;
    const last = finRows[finRows.length - 1];
    const prev = finRows[finRows.length - 2];
    return {
      revenue, expense, net,
      margin: safePct(net, revenue),
      revenueDelta: prev && prev.revenue > 0 ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100) : null,
      netDelta: prev && prev.net !== 0 ? Math.round(((last.net - prev.net) / Math.abs(prev.net)) * 100) : null,
    };
  }, [finRows]);

  // ── Hiệu suất theo bất động sản: performance (phòng) + pnl (tiền) ──
  const approvedIds = useMemo(() => new Set(
    apiProps
      .filter(p => isApproved(p.status, p.price ?? 0, !!p.operationManagerId))
      .map(p => String(p.id)),
  ), [apiProps]);

  const propRows = useMemo<PropRow[]>(() => propPerf.map(p => {
    const id = String(p.propertyId);
    const fin = pnl[id] ?? { revenue: p.monthlyRevenue ?? 0, expense: 0, net: p.monthlyRevenue ?? 0 };
    return {
      id,
      name: p.propertyName,
      address: p.address ?? '',
      totalRooms: p.totalRooms ?? 0,
      occupiedRooms: p.occupiedRooms ?? 0,
      occupancyRate: Math.round(p.occupancyRate ?? 0),
      maintenanceRooms: p.openMaintenance ?? 0,
      revenue: fin.revenue,
      expense: fin.expense,
      net: fin.net,
      margin: safePct(fin.net, fin.revenue),
      approved: approvedIds.has(id),
    };
  }), [propPerf, pnl, approvedIds]);

  // Bộ lọc bảng nhà
  const [propQ, setPropQ] = useState('');
  const [propScope, setPropScope] = useState<'approved' | 'all'>('approved');
  const [propSort, setPropSort] = useState<PropSortKey>('revenue-desc');
  const [propPage, setPropPage] = useState(1);
  const [propPerPage, setPropPerPage] = useState(10);

  const filteredProps = useMemo(() => {
    const list = propRows.filter(r =>
      (propScope === 'all' || r.approved) &&
      matchVi(propQ, r.name, r.address));
    const sorted = [...list];
    switch (propSort) {
      case 'revenue-desc': sorted.sort((a, b) => b.revenue - a.revenue); break;
      case 'net-desc': sorted.sort((a, b) => b.net - a.net); break;
      case 'occupancy-desc': sorted.sort((a, b) => b.occupancyRate - a.occupancyRate); break;
      case 'occupancy-asc': sorted.sort((a, b) => a.occupancyRate - b.occupancyRate); break;
      case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
    }
    return sorted;
  }, [propRows, propQ, propScope, propSort]);
  const pagedProps = pageSlice(filteredProps, propPage, propPerPage);

  const roomTotals = useMemo(() => {
    const scoped = filteredProps;
    const total = scoped.reduce((s, r) => s + r.totalRooms, 0);
    const occupied = scoped.reduce((s, r) => s + r.occupiedRooms, 0);
    return { total, occupied, vacant: Math.max(0, total - occupied), rate: safePct(occupied, total) };
  }, [filteredProps]);

  // Bộ lọc bảng quản lý
  const [mgrQ, setMgrQ] = useState('');
  const [mgrSort, setMgrSort] = useState<MgrSortKey>('occupancy-desc');

  const filteredMgr = useMemo(() => {
    const list = mgrRows.filter(m => matchVi(mgrQ, m.managerName, m.phone));
    const sorted = [...list];
    switch (mgrSort) {
      case 'occupancy-desc': sorted.sort((a, b) => b.occupancyRate - a.occupancyRate); break;
      case 'properties-desc': sorted.sort((a, b) => b.propertyCount - a.propertyCount); break;
      case 'tenants-desc': sorted.sort((a, b) => b.activeTenants - a.activeTenants); break;
      case 'name-asc': sorted.sort((a, b) => (a.managerName ?? '').localeCompare(b.managerName ?? '', 'vi')); break;
    }
    return sorted;
  }, [mgrRows, mgrQ, mgrSort]);

  const handleExport = () => {
    exportToExcel(`BaoCao_HoangBinhLand_${CURRENT_MONTH}`, [
      {
        name: `Tài chính ${months} kỳ`,
        rows: finRows.map(r => ({
          'Kỳ': monthLabel(r.ym), 'Doanh thu (₫)': r.revenue, 'Chi phí (₫)': r.expense,
          'Lợi nhuận (₫)': r.net, 'Biên LN (%)': r.margin ?? '',
        })),
      },
      {
        name: 'Hiệu suất quản lý',
        rows: filteredMgr.map(m => ({
          'Quản lý': m.managerName, 'SĐT': m.phone, 'Số nhà phụ trách': m.propertyCount,
          'HĐ khách đang hiệu lực': m.activeTenants, 'Tỷ lệ lấp đầy (%)': Math.round(m.occupancyRate),
          'Phòng đang bảo trì': m.openMaintenance,
        })),
      },
      {
        name: 'Hiệu suất theo BĐS',
        rows: filteredProps.map(r => ({
          'Bất động sản': r.name, 'Địa chỉ': r.address,
          'Đã duyệt giá': r.approved ? 'Có' : 'Chưa',
          'Tổng phòng': r.totalRooms, 'Phòng đang thuê': r.occupiedRooms,
          'Phòng bảo trì': r.maintenanceRooms, 'Tỷ lệ lấp đầy (%)': r.occupancyRate,
          'Doanh thu (₫)': r.revenue, 'Chi phí (₫)': r.expense, 'Lợi nhuận (₫)': r.net,
        })),
      },
    ]);
  };

  const kpis = [
    {
      label: `Doanh thu ${months} kỳ`, value: formatCurrency(totals.revenue), icon: TrendingUp,
      bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-l-emerald-500',
      delta: totals.revenueDelta, sub: `${finRows.length} kỳ · tính tới ${monthLabel(CURRENT_MONTH).toLowerCase()}`,
    },
    {
      label: `Chi phí ${months} kỳ`, value: formatCurrency(totals.expense), icon: TrendingDown,
      bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500',
      delta: null, sub: 'Thuê nhà nguyên căn + chi phí ghi nhận',
    },
    {
      label: 'Lợi nhuận ròng', value: formatCurrency(totals.net), icon: Wallet,
      bg: 'bg-indigo-50', color: totals.net >= 0 ? 'text-indigo-600' : 'text-rose-600', border: 'border-l-indigo-500',
      delta: totals.netDelta, sub: `Biên lợi nhuận ${pctText(totals.margin)}`,
    },
    {
      label: 'Tỷ lệ lấp đầy hiện tại', value: pctText(roomTotals.rate), icon: Percent,
      bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-l-amber-500',
      delta: null, sub: `${roomTotals.occupied}/${roomTotals.total} phòng đang thuê`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo & Phân tích</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hiệu suất vận hành và tài chính Hoàng Bình Land — {monthLabel(from)} đến {monthLabel(CURRENT_MONTH)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(['6', '12'] as RangeKey[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                  range === r ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                {r} kỳ
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport} className="btn-primary flex items-center gap-2">
            <Download className="h-4 w-4" /> Xuất Excel
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border border-slate-100 border-l-4 bg-white p-5 shadow-sm ${k.border}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className={`mt-1 truncate text-xl font-bold ${k.color}`}>{k.value}</p>
                {k.delta !== null && (
                  <p className={`mt-1 text-xs font-medium ${k.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {k.delta >= 0 ? '▲' : '▼'} {Math.abs(k.delta)}% so với kỳ trước
                  </p>
                )}
                <p className="mt-1 truncate text-xs text-slate-400">{k.sub}</p>
              </div>
              <div className={`${k.bg} ml-2 flex-shrink-0 rounded-xl p-3`}><k.icon className={`h-5 w-5 ${k.color}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Biểu đồ tài chính theo kỳ */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Doanh thu · Chi phí · Lợi nhuận theo kỳ</h2>
            <p className="text-xs text-slate-400">Nguồn: báo cáo tài chính của hệ thống, {months} kỳ gần nhất</p>
          </div>
        </div>
        {finRows.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
            {loading ? 'Đang tải…' : 'Chưa có dữ liệu tài chính cho khoảng thời gian này.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={finRows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id="rpRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.95} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.5} /></linearGradient>
                <linearGradient id="rpExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0.5} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={6} />
              <YAxis tickFormatter={fmtMillion} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="revenue" name="Doanh thu" fill="url(#rpRev)" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Bar dataKey="expense" name="Chi phí" fill="url(#rpExp)" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Line type="monotone" dataKey="net" name="Lợi nhuận ròng" stroke="#6366f1" strokeWidth={2.5}
                dot={{ r: 3, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bảng tài chính theo kỳ */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-5">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Báo cáo tài chính — {months} kỳ gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Kỳ</th>
                <th className="px-5 py-3.5 text-right">Doanh thu</th>
                <th className="px-5 py-3.5 text-right">Chi phí</th>
                <th className="px-5 py-3.5 text-right">Lợi nhuận</th>
                <th className="px-5 py-3.5 text-right">Biên lợi nhuận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finRows.map(r => {
                const isCurrent = r.ym === CURRENT_MONTH;
                return (
                  <tr key={r.ym} className={`transition-colors hover:bg-slate-50 ${isCurrent ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {monthLabel(r.ym)}
                      {isCurrent && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">Kỳ hiện tại</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-emerald-700">{formatCurrency(r.revenue)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(r.expense)}</td>
                    <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${r.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                      {formatCurrency(r.net)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {r.margin === null ? (
                        <span className="text-xs text-slate-400">chưa có doanh thu</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.margin >= 50 ? 'bg-emerald-100 text-emerald-700'
                            : r.margin >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                        }`}>{r.margin}%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {finRows.length === 0 && (
                <TableState colSpan={5} loading={loading} empty="Chưa có dữ liệu tài chính." />
              )}
              {finRows.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-5 py-3.5">Tổng {finRows.length} kỳ</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(totals.revenue)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(totals.expense)}</td>
                  <td className={`px-5 py-3.5 text-right tabular-nums ${totals.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                    {formatCurrency(totals.net)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">{pctText(totals.margin)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Kỳ chưa phát sinh doanh thu thì biên lợi nhuận để trống thay vì hiển thị 0% — tránh đọc nhầm là hoà vốn.
          Hệ thống chưa lưu lịch sử tỷ lệ lấp đầy theo tháng nên báo cáo này không vẽ đường xu hướng lấp đầy.
        </p>
      </div>

      {/* Hiệu suất quản lý vận hành */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Users className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Hiệu suất quản lý vận hành</h2>
            <p className="text-xs text-slate-500">{filteredMgr.length} quản lý đang hoạt động · số liệu tại {monthLabel(CURRENT_MONTH).toLowerCase()}</p>
          </div>
        </div>
        <FilterBar>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={mgrQ} onChange={setMgrQ} className="flex-1"
              placeholder="Tìm theo tên quản lý hoặc số điện thoại... (không cần dấu)" />
            <SelectFilter value={mgrSort} onChange={setMgrSort} options={MGR_SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[210px]" />
          </div>
        </FilterBar>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Quản lý</th>
                <th className="px-5 py-3.5 text-center">Nhà phụ trách</th>
                <th className="px-5 py-3.5 text-center">HĐ đang hiệu lực</th>
                <th className="px-5 py-3.5 text-center">Tỷ lệ lấp đầy</th>
                <th className="px-5 py-3.5 text-center">Phòng đang bảo trì</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMgr.map(m => {
                const initials = (m.managerName || '?').split(' ').slice(-2).map(n => n[0]).join('').toUpperCase();
                const rate = Math.round(m.occupancyRate ?? 0);
                return (
                  <tr key={m.managerId} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{m.managerName}</p>
                          <p className="text-xs text-slate-400">{m.phone || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center font-semibold text-slate-900">{m.propertyCount}</td>
                    <td className="px-5 py-3.5 text-center font-semibold text-blue-700">{m.activeTenants}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                          <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${rate}%` }} />
                        </span>
                        <span className="text-xs font-medium tabular-nums">{rate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-semibold ${m.openMaintenance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {m.openMaintenance}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredMgr.length === 0 && (
                <TableState colSpan={5} loading={loading} filtered={!!mgrQ}
                  empty="Chưa có quản lý vận hành nào đang hoạt động." />
              )}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Cột "Phòng đang bảo trì" là số phòng đang ở trạng thái bảo trì, không phải số yêu cầu bảo trì —
          hệ thống chưa thống kê được số yêu cầu đã xử lý theo từng quản lý.
        </p>
      </div>

      {/* Hiệu suất theo bất động sản */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Building2 className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Hiệu suất theo bất động sản</h2>
            <p className="text-xs text-slate-500">
              {filteredProps.length} nhà · {roomTotals.occupied}/{roomTotals.total} phòng đang thuê · lấp đầy {pctText(roomTotals.rate)}
            </p>
          </div>
        </div>

        <FilterBar>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={propQ} onChange={v => { setPropQ(v); setPropPage(1); }} className="flex-1"
              placeholder="Tìm theo tên nhà hoặc địa chỉ... (không cần dấu)" />
            <SelectFilter value={propSort} onChange={setPropSort} options={PROP_SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[210px]" />
          </div>
          <ChipFilter
            value={propScope}
            onChange={v => { setPropScope(v); setPropPage(1); }}
            options={[
              { key: 'approved' as const, label: 'Nhà đã duyệt giá', count: propRows.filter(r => r.approved).length },
              { key: 'all' as const, label: 'Tất cả nhà', count: propRows.length },
            ]}
          />
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Bất động sản</th>
                <th className="px-4 py-3.5 text-center">Phòng</th>
                <th className="px-4 py-3.5">Lấp đầy</th>
                <th className="px-4 py-3.5 text-right">Doanh thu</th>
                <th className="px-4 py-3.5 text-right">Chi phí</th>
                <th className="px-4 py-3.5 text-right">Lợi nhuận</th>
                <th className="px-5 py-3.5 text-right">Biên LN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedProps.map(r => (
                <tr key={r.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <Link to={`/host/properties/${r.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {r.name}
                    </Link>
                    <p className="line-clamp-1 text-xs text-slate-400">{r.address || '—'}</p>
                    {!r.approved && (
                      <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        chưa duyệt giá
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <p className="font-semibold text-slate-900 tabular-nums">{r.occupiedRooms}/{r.totalRooms}</p>
                    {r.maintenanceRooms > 0 && <p className="text-[11px] text-amber-600">{r.maintenanceRooms} phòng bảo trì</p>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <span className={`block h-full rounded-full ${
                          r.occupancyRate >= 85 ? 'bg-emerald-500' : r.occupancyRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                        }`} style={{ width: `${r.occupancyRate}%` }} />
                      </span>
                      <span className="text-xs font-medium tabular-nums text-slate-700">{r.occupancyRate}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(r.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600">{formatCurrency(r.expense)}</td>
                  <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${r.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                    {formatCurrency(r.net)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {r.margin === null
                      ? <span className="text-xs text-slate-400">—</span>
                      : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.margin >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{r.margin}%</span>}
                  </td>
                </tr>
              ))}
              {pagedProps.length === 0 && (
                <TableState colSpan={7} loading={loading} filtered={!!propQ || propScope === 'approved'}
                  empty="Chưa có bất động sản nào trong hệ thống." />
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={propPage} perPage={propPerPage} total={filteredProps.length}
          onPage={setPropPage} onPerPage={setPropPerPage} unit="nhà" />
      </div>

      {/* Điều hướng nhanh */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { to: '/host/financial', label: 'Quản lý dòng tiền', desc: 'Đối soát thu chi từng nhà theo kỳ', icon: Wallet },
          { to: '/host/receivables', label: 'Công nợ phải thu', desc: 'Hoá đơn chưa thu & tuổi nợ', icon: BarChart3 },
          { to: '/host/operations-managers', label: 'Quản lý vận hành', desc: 'Hồ sơ & phân công quản lý', icon: UserCog },
        ].map(item => (
          <Link key={item.to} to={item.to}
            className="card flex items-center gap-3 p-4 transition hover:border-indigo-200 hover:shadow-md">
            <div className="flex-shrink-0 rounded-xl bg-indigo-50 p-2.5"><item.icon className="h-5 w-5 text-indigo-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="truncate text-xs text-slate-400">{item.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
};
