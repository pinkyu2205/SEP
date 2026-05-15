import { useState } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, AlertCircle, Download,
  CheckCircle, Clock, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../utils';

// ── Dữ liệu mock ──────────────────────────────────────────────────────────────
const MONTHS = ['Th12/25', 'Th1/26', 'Th2/26', 'Th3/26', 'Th4/26', 'Th5/26'];

const CASH_FLOW_DATA = [
  { month: 'Th12/25', revenue: 110_000_000, expense: 45_000_000 },
  { month: 'Th1/26',  revenue: 115_000_000, expense: 48_000_000 },
  { month: 'Th2/26',  revenue: 112_000_000, expense: 52_000_000 },
  { month: 'Th3/26',  revenue: 118_000_000, expense: 49_000_000 },
  { month: 'Th4/26',  revenue: 125_000_000, expense: 53_000_000 },
  { month: 'Th5/26',  revenue: 130_000_000, expense: 55_000_000 },
];

const EXPENSE_BREAKDOWN = [
  { name: 'Chi phí thuê nhà', value: 28_000_000, color: '#6366f1' },
  { name: 'Bảo trì',          value: 12_000_000, color: '#f59e0b' },
  { name: 'Thiết bị',         value:  7_500_000, color: '#06b6d4' },
  { name: 'Quản lý',          value:  5_000_000, color: '#10b981' },
  { name: 'Điện nước',        value:  2_500_000, color: '#f43f5e' },
];

const PROPERTY_REVENUE: { propertyId: string; name: string; monthly: number[] }[] = [
  { propertyId: 'prop-1', name: 'Nhà A - Quận 1',     monthly: [18_000_000, 18_500_000, 17_800_000, 19_200_000, 20_000_000, 21_000_000] },
  { propertyId: 'prop-2', name: 'Nhà B - Quận 3',     monthly: [22_000_000, 23_500_000, 22_500_000, 24_000_000, 25_000_000, 26_000_000] },
  { propertyId: 'prop-3', name: 'Nhà C - Bình Thạnh', monthly: [15_000_000, 15_500_000, 15_200_000, 16_000_000, 16_500_000, 17_000_000] },
  { propertyId: 'prop-4', name: 'Nhà D - Phú Nhuận',  monthly: [28_000_000, 29_000_000, 28_500_000, 30_000_000, 31_000_000, 32_000_000] },
  { propertyId: 'prop-5', name: 'Nhà E - Gò Vấp',     monthly: [12_000_000, 12_500_000, 12_000_000, 13_000_000, 13_500_000, 14_000_000] },
];

type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';
interface Invoice {
  id: string; tenant: string; room: string; property: string;
  amount: number; dueDate: string; status: InvoiceStatus;
}

const INVOICES: Invoice[] = [
  { id: 'HD-2026-001', tenant: 'Lê Thị B',      room: 'P102', property: 'Nhà A', amount: 5_500_000, dueDate: '2026-05-10', status: 'paid' },
  { id: 'HD-2026-002', tenant: 'Trần Văn C',     room: 'P201', property: 'Nhà B', amount: 7_000_000, dueDate: '2026-05-10', status: 'paid' },
  { id: 'HD-2026-003', tenant: 'Phạm Thị D',     room: 'P301', property: 'Nhà C', amount: 4_800_000, dueDate: '2026-05-12', status: 'overdue' },
  { id: 'HD-2026-004', tenant: 'Hoàng Văn E',    room: 'P103', property: 'Nhà A', amount: 5_500_000, dueDate: '2026-05-15', status: 'unpaid' },
  { id: 'HD-2026-005', tenant: 'Nguyễn Thị F',   room: 'P202', property: 'Nhà B', amount: 7_200_000, dueDate: '2026-05-15', status: 'unpaid' },
  { id: 'HD-2026-006', tenant: 'Vũ Đức G',       room: 'P401', property: 'Nhà D', amount: 8_000_000, dueDate: '2026-05-08', status: 'overdue' },
  { id: 'HD-2026-007', tenant: 'Bùi Thị H',      room: 'P402', property: 'Nhà D', amount: 8_200_000, dueDate: '2026-05-10', status: 'paid' },
  { id: 'HD-2026-008', tenant: 'Đặng Văn I',     room: 'P501', property: 'Nhà E', amount: 4_200_000, dueDate: '2026-05-13', status: 'overdue' },
  { id: 'HD-2026-009', tenant: 'Lý Thị K',       room: 'P302', property: 'Nhà C', amount: 5_000_000, dueDate: '2026-05-15', status: 'unpaid' },
  { id: 'HD-2026-010', tenant: 'Trương Văn L',   room: 'P203', property: 'Nhà B', amount: 7_000_000, dueDate: '2026-05-14', status: 'paid' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtM = (v: number) => `${(v / 1_000_000).toFixed(0)}tr`;

const invoiceStatusMap: Record<InvoiceStatus, { label: string; color: string; icon: React.ElementType }> = {
  paid:    { label: 'Đã thanh toán', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  unpaid:  { label: 'Chưa thanh toán', color: 'bg-amber-50 text-amber-700',  icon: Clock },
  overdue: { label: 'Quá hạn',        color: 'bg-rose-50 text-rose-700',     icon: XCircle },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────
export const FinancialManagement = () => {
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | InvoiceStatus>('all');

  const currentMonth = CASH_FLOW_DATA[CASH_FLOW_DATA.length - 1];
  const totalRevenue = currentMonth.revenue;
  const totalExpenses = currentMonth.expense;
  const netProfit = totalRevenue - totalExpenses;
  const outstandingInvoices = INVOICES.filter(i => i.status !== 'paid');
  const outstandingAmount = outstandingInvoices.reduce((s, i) => s + i.amount, 0);

  const filteredInvoices = invoiceFilter === 'all' ? INVOICES : INVOICES.filter(i => i.status === invoiceFilter);

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Tài chính</h1>
          <p className="text-sm text-slate-500 mt-1">Doanh thu, chi phí và theo dõi hóa đơn trên tất cả bất động sản UrbanNest</p>
        </div>
        <button
          onClick={() => alert('Đang xuất file Excel... (mô phỏng)')}
          className="btn-primary flex items-center gap-2"
        >
          <Download className="w-5 h-5" />
          Xuất Excel
        </button>
      </div>

      {/* Thẻ KPI tổng quan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Tổng doanh thu (Th5)',
            value: formatCurrency(totalRevenue),
            icon: TrendingUp,
            bg: 'bg-emerald-50', iconColor: 'text-emerald-600',
            border: 'border-l-emerald-500', text: 'text-emerald-700',
            sub: '+4% so với Th4',
          },
          {
            label: 'Tổng chi phí (Th5)',
            value: formatCurrency(totalExpenses),
            icon: TrendingDown,
            bg: 'bg-rose-50', iconColor: 'text-rose-600',
            border: 'border-l-rose-500', text: 'text-rose-700',
            sub: '+3.8% so với Th4',
          },
          {
            label: 'Lợi nhuận ròng (Th5)',
            value: formatCurrency(netProfit),
            icon: Wallet,
            bg: 'bg-indigo-50', iconColor: 'text-indigo-600',
            border: 'border-l-indigo-500', text: 'text-indigo-700',
            sub: '+4.4% so với Th4',
          },
          {
            label: 'Hóa đơn chưa thu',
            value: formatCurrency(outstandingAmount),
            icon: AlertCircle,
            bg: 'bg-amber-50', iconColor: 'text-amber-600',
            border: 'border-l-amber-500', text: 'text-amber-700',
            sub: `${outstandingInvoices.length} hóa đơn`,
          },
        ].map(card => (
          <div key={card.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${card.border} p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.label}</p>
                <p className={`text-xl font-bold mt-1 ${card.text}`}>{card.value}</p>
                <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
              </div>
              <div className={`${card.bg} p-3 rounded-xl`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Biểu đồ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dòng tiền */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Dòng tiền — 6 tháng gần đây</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={CASH_FLOW_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Doanh thu" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Chi phí"   fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cơ cấu chi phí */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Cơ cấu chi phí (Th5)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={EXPENSE_BREAKDOWN}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                dataKey="value"
                paddingAngle={3}
              >
                {EXPENSE_BREAKDOWN.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1.5">
            {EXPENSE_BREAKDOWN.map(e => (
              <div key={e.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                  <span className="text-slate-600">{e.name}</span>
                </span>
                <span className="font-medium text-slate-800">{formatCurrency(e.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Doanh thu theo bất động sản */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Doanh thu theo Bất động sản</h2>
          <p className="text-xs text-slate-500 mt-0.5">Phân tích 6 tháng theo từng nhà</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Bất động sản</th>
                {MONTHS.map(m => <th key={m} className="px-4 py-3.5 text-right">{m}</th>)}
                <th className="px-5 py-3.5 text-right">Tổng cộng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PROPERTY_REVENUE.map(row => {
                const total = row.monthly.reduce((s, v) => s + v, 0);
                return (
                  <tr key={row.propertyId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{row.name}</td>
                    {row.monthly.map((v, i) => (
                      <td key={i} className="px-4 py-3.5 text-right tabular-nums text-slate-700">
                        {fmtM(v)}đ
                      </td>
                    ))}
                    <td className="px-5 py-3.5 text-right font-semibold text-indigo-700 tabular-nums">
                      {fmtM(total)}đ
                    </td>
                  </tr>
                );
              })}
              {/* Hàng tổng */}
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className="px-5 py-3.5">Tất cả</td>
                {MONTHS.map((_, i) => {
                  const colTotal = PROPERTY_REVENUE.reduce((s, r) => s + r.monthly[i], 0);
                  return (
                    <td key={i} className="px-4 py-3.5 text-right tabular-nums text-emerald-700">
                      {fmtM(colTotal)}đ
                    </td>
                  );
                })}
                <td className="px-5 py-3.5 text-right text-emerald-700 tabular-nums">
                  {fmtM(PROPERTY_REVENUE.reduce((s, r) => s + r.monthly.reduce((a, b) => a + b, 0), 0))}đ
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Hóa đơn */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Hóa đơn — Tháng 5/2026</h2>
            <p className="text-xs text-slate-500 mt-0.5">{outstandingInvoices.length} hóa đơn cần xử lý</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all', label: 'Tất cả' },
              { key: 'paid', label: 'Đã thu' },
              { key: 'unpaid', label: 'Chưa thu' },
              { key: 'overdue', label: 'Quá hạn' },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setInvoiceFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  invoiceFilter === f.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
                {f.key !== 'all' && (
                  <span className="ml-1 opacity-75">({INVOICES.filter(i => i.status === f.key).length})</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Mã hóa đơn</th>
                <th className="px-5 py-3.5">Khách thuê</th>
                <th className="px-5 py-3.5">Phòng / Nhà</th>
                <th className="px-5 py-3.5 text-right">Số tiền</th>
                <th className="px-5 py-3.5">Hạn thanh toán</th>
                <th className="px-5 py-3.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map(inv => {
                const st = invoiceStatusMap[inv.status];
                const Icon = st.icon;
                return (
                  <tr key={inv.id} className={`transition-colors hover:bg-slate-50/80 ${inv.status === 'overdue' ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {inv.id}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{inv.tenant}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{inv.room}</p>
                      <p className="text-xs text-slate-400">{inv.property}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{inv.dueDate}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>
                        <Icon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">
                    Không có hóa đơn nào phù hợp bộ lọc đã chọn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
