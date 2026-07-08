import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Clock, Wallet, Download, Users,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { hostService, type ReceivablesAging as ReceivablesData } from '@/services/host.service';
import { exportToExcel } from '@/utils/exportExcel';

// ── Fallback offline (demo khi BE chưa bật) ──────────────────────────────────
const MOCK_DATA: ReceivablesData = {
  buckets: [
    { label: 'Chưa tới hạn',        amount: 12_000_000, count: 3 },
    { label: 'Quá hạn 1–7 ngày',    amount:  8_000_000, count: 2 },
    { label: 'Quá hạn 8–30 ngày',   amount:  4_800_000, count: 1 },
    { label: 'Quá hạn > 30 ngày',   amount:  4_200_000, count: 1 },
  ],
  topDebtors: [
    { tenantName: 'Vũ Đức G',   propertyName: 'Nhà Lê Văn Sỹ',        roomCode: 'P401', amount: 4_200_000, overdueDays: 35 },
    { tenantName: 'Phạm Thị D',  propertyName: 'Nhà Cách Mạng Tháng 8', roomCode: 'P301', amount: 4_800_000, overdueDays: 12 },
    { tenantName: 'Nguyễn Thị F', propertyName: 'Nhà Lê Văn Sỹ',       roomCode: 'P202', amount: 7_200_000, overdueDays: 5 },
    { tenantName: 'Hoàng Văn E',  propertyName: 'Nhà Nguyễn Trãi',      roomCode: 'P103', amount: 5_500_000, overdueDays: 2 },
  ],
};

// Màu theo mức độ trễ.
const BUCKET_COLOR = (label: string) =>
  label.includes('> 30') ? '#e11d48'
  : label.includes('8–30') ? '#f97316'
  : label.includes('1–7') ? '#f59e0b'
  : '#10b981';

const overdueBadge = (days: number) =>
  days > 30 ? 'bg-rose-100 text-rose-700'
  : days > 7 ? 'bg-orange-100 text-orange-700'
  : days > 0 ? 'bg-amber-100 text-amber-700'
  : 'bg-emerald-100 text-emerald-700';

export const ReceivablesAging = () => {
  const [data, setData] = useState<ReceivablesData>(MOCK_DATA);

  useEffect(() => {
    let active = true;
    hostService.getReceivablesAging()
      .then(d => { if (active && d?.buckets?.length) setData(d); })
      .catch(() => { /* offline: dùng mock */ });
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const total = data.buckets.reduce((s, b) => s + b.amount, 0);
    const overdue = data.buckets.filter(b => b.label.toLowerCase().includes('quá hạn'));
    const overdueAmount = overdue.reduce((s, b) => s + b.amount, 0);
    const overdueCount = overdue.reduce((s, b) => s + b.count, 0);
    const oldest = data.topDebtors.reduce((m, d) => Math.max(m, d.overdueDays), 0);
    return { total, overdueAmount, overdueCount, oldest };
  }, [data]);

  const sortedDebtors = useMemo(
    () => [...data.topDebtors].sort((a, b) => b.overdueDays - a.overdueDays),
    [data],
  );

  const handleExport = () => {
    exportToExcel('CongNoPhaiThu_HoangBinhLand', [
      {
        name: 'Tuổi nợ',
        rows: data.buckets.map(b => ({ 'Nhóm': b.label, 'Số tiền (₫)': b.amount, 'Số hóa đơn': b.count })),
      },
      {
        name: 'Khách nợ',
        rows: sortedDebtors.map(d => ({
          'Khách thuê': d.tenantName, 'Bất động sản': d.propertyName, 'Phòng': d.roomCode,
          'Số tiền (₫)': d.amount, 'Số ngày quá hạn': d.overdueDays,
        })),
      },
    ]);
  };

  const kpis = [
    { label: 'Tổng phải thu', value: formatCurrency(totals.total), icon: Wallet, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500' },
    { label: 'Đang quá hạn', value: formatCurrency(totals.overdueAmount), icon: AlertTriangle, bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500' },
    { label: 'Số HĐ quá hạn', value: String(totals.overdueCount), icon: Clock, bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-l-amber-500' },
    { label: 'Nợ lâu nhất', value: `${totals.oldest} ngày`, icon: Clock, bg: 'bg-orange-50', color: 'text-orange-600', border: 'border-l-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Công nợ phải thu</h1>
          <p className="text-sm text-slate-500 mt-1">Tiền khách thuê đang nợ — phân nhóm theo tuổi nợ để ưu tiên thu hồi</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
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

      {/* Phân bố tuổi nợ */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Phân bố theo tuổi nợ</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.buckets} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} />
            <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="amount" name="Số tiền" radius={[4, 4, 0, 0]}>
              {data.buckets.map((b, i) => <Cell key={i} fill={BUCKET_COLOR(b.label)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {data.buckets.map(b => (
            <div key={b.label} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BUCKET_COLOR(b.label) }} />
                <p className="text-xs text-slate-500">{b.label}</p>
              </div>
              <p className="text-sm font-bold text-slate-900 mt-1">{formatCurrency(b.amount)}</p>
              <p className="text-[11px] text-slate-400">{b.count} hóa đơn</p>
            </div>
          ))}
        </div>
      </div>

      {/* Khách nợ nhiều / lâu nhất */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Khách cần ưu tiên thu hồi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Khách thuê</th>
                <th className="px-5 py-3.5">Bất động sản / Phòng</th>
                <th className="px-5 py-3.5 text-right">Số tiền nợ</th>
                <th className="px-5 py-3.5 text-center">Quá hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDebtors.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{d.tenantName}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{d.propertyName}</p>
                    <p className="text-xs text-slate-400">Phòng {d.roomCode}</p>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-rose-600 tabular-nums">{formatCurrency(d.amount)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${overdueBadge(d.overdueDays)}`}>
                      {d.overdueDays > 0 ? `${d.overdueDays} ngày` : 'Chưa tới hạn'}
                    </span>
                  </td>
                </tr>
              ))}
              {sortedDebtors.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">Không có công nợ nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
