import { useEffect, useMemo, useState } from 'react';
import { PiggyBank, Download, ShieldCheck, RotateCcw, Ban } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { hostService, type DepositItem, type HostContractDto } from '@/services/host.service';
import { exportToExcel } from '@/utils/exportExcel';

type DepositStatus = 'HELD' | 'REFUNDED' | 'FORFEITED';

const STATUS_META: Record<DepositStatus, { label: string; color: string; dot: string }> = {
  HELD:      { label: 'Đang giữ',   color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  REFUNDED:  { label: 'Đã hoàn',    color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  FORFEITED: { label: 'Tịch thu',   color: 'bg-rose-50 text-rose-700',     dot: 'bg-rose-500' },
};

// Suy sổ cọc từ hợp đồng khách thuê THẬT (deposit nằm trong HĐ) — dùng khi
// endpoint cọc chuyên biệt của BE chưa trả dữ liệu.
const contractToDeposit = (c: HostContractDto): DepositItem | null => {
  const amount = c.deposit ?? 0;
  if (amount <= 0 || c.status === 'PENDING') return null; // chưa duyệt → cọc chưa giữ
  return {
    tenantName: c.lesseeName,
    propertyName: c.propertyName,
    roomCode: c.roomCode ?? '—',
    amount,
    heldSince: c.moveInDate ?? c.startDate,
    status: c.status === 'ACTIVE' ? 'HELD' : 'REFUNDED', // hết hạn / chấm dứt → đã hoàn
  };
};

const FILTERS: { key: 'all' | DepositStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'HELD', label: 'Đang giữ' },
  { key: 'REFUNDED', label: 'Đã hoàn' },
  { key: 'FORFEITED', label: 'Tịch thu' },
];

export const DepositLedger = () => {
  // 100% API thật — không mock; chưa có dữ liệu → danh sách trống.
  const [items, setItems] = useState<DepositItem[]>([]);
  const [filter, setFilter] = useState<'all' | DepositStatus>('all');

  useEffect(() => {
    let active = true;
    (async () => {
      // 1) Endpoint cọc chuyên biệt (khi BE làm xong sẽ ưu tiên dùng).
      try {
        const res = await hostService.getDeposits();
        if (active && res?.items?.length) { setItems(res.items); return; }
      } catch { /* thử nguồn tiếp theo */ }
      // 2) Suy từ hợp đồng khách thuê THẬT (/host/contracts) — data thật đang có.
      try {
        const page = await hostService.listContracts({ size: 500 });
        const derived = (page?.content ?? []).map(contractToDeposit).filter((d): d is DepositItem => d !== null);
        if (active && derived.length) { setItems(derived); return; }
      } catch { /* BE chưa có dữ liệu → giữ danh sách trống */ }
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const held = items.filter(d => d.status === 'HELD');
    return {
      totalHeld: held.reduce((s, d) => s + d.amount, 0),
      heldCount: held.length,
      refunded: items.filter(d => d.status === 'REFUNDED').length,
      forfeited: items.filter(d => d.status === 'FORFEITED').length,
    };
  }, [items]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter(d => d.status === filter)),
    [items, filter],
  );

  const handleExport = () => {
    exportToExcel('SoCoc_HoangBinhLand', [{
      name: 'Sổ cọc',
      rows: items.map(d => ({
        'Khách thuê': d.tenantName, 'Bất động sản': d.propertyName, 'Phòng': d.roomCode,
        'Tiền cọc (₫)': d.amount, 'Giữ từ': d.heldSince, 'Trạng thái': STATUS_META[d.status as DepositStatus]?.label ?? d.status,
      })),
    }]);
  };

  const kpis = [
    { label: 'Tổng cọc đang giữ', value: formatCurrency(stats.totalHeld), icon: PiggyBank, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500' },
    { label: 'Số khoản đang giữ', value: String(stats.heldCount), icon: ShieldCheck, bg: 'bg-blue-50', color: 'text-blue-600', border: 'border-l-blue-500' },
    { label: 'Đã hoàn', value: String(stats.refunded), icon: RotateCcw, bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-l-emerald-500' },
    { label: 'Tịch thu', value: String(stats.forfeited), icon: Ban, bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sổ cọc</h1>
          <p className="text-sm text-slate-500 mt-1">Tiền cọc đang giữ của khách thuê — khoản phải hoàn khi kết thúc hợp đồng (không phải doanh thu)</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
      </div>

      {/* Lưu ý liability */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        ⓘ Tiền cọc là <span className="font-semibold">khoản phải trả</span>, không tính vào lợi nhuận. Khi khách trả phòng, cọc sẽ được tất toán (trừ nợ phòng / chi phí sửa do khách làm hư) ở luồng checkout.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${k.border} p-5`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className={`text-xl font-bold mt-1 ${k.color} truncate`}>{k.value}</p>
              </div>
              <div className={`${k.bg} p-3 rounded-xl flex-shrink-0 ml-2`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bảng + filter */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Danh sách cọc ({filtered.length})</h2>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Khách thuê</th>
                <th className="px-5 py-3.5">Bất động sản / Phòng</th>
                <th className="px-5 py-3.5 text-right">Tiền cọc</th>
                <th className="px-5 py-3.5">Giữ từ</th>
                <th className="px-5 py-3.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d, i) => {
                const meta = STATUS_META[d.status as DepositStatus] ?? STATUS_META.HELD;
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{d.tenantName}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{d.propertyName}</p>
                      <p className="text-xs text-slate-400">Phòng {d.roomCode}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900 tabular-nums">{formatCurrency(d.amount)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{d.heldSince}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">Không có khoản cọc nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
