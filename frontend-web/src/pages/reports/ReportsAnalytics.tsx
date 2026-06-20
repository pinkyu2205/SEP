import { Download, TrendingUp, BarChart3, Users, Building2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { MOCK_PROPERTIES, MOCK_USERS, MOCK_MAINTENANCE_REQUESTS, ALL_CONTRACTS } from '../../utils/mockData';
import { formatCurrency } from '../../utils';

// ── Dữ liệu mock ──────────────────────────────────────────────────────────────
const FINANCIAL_SUMMARY = [
  { month: 'Th12/25', doanhThu: 110_000_000, chiPhi: 45_000_000, loiNhuan: 65_000_000, tyLePhong: 82 },
  { month: 'Th1/26',  doanhThu: 115_000_000, chiPhi: 48_000_000, loiNhuan: 67_000_000, tyLePhong: 85 },
  { month: 'Th2/26',  doanhThu: 112_000_000, chiPhi: 52_000_000, loiNhuan: 60_000_000, tyLePhong: 83 },
  { month: 'Th3/26',  doanhThu: 118_000_000, chiPhi: 49_000_000, loiNhuan: 69_000_000, tyLePhong: 87 },
  { month: 'Th4/26',  doanhThu: 125_000_000, chiPhi: 53_000_000, loiNhuan: 72_000_000, tyLePhong: 90 },
  { month: 'Th5/26',  doanhThu: 130_000_000, chiPhi: 55_000_000, loiNhuan: 75_000_000, tyLePhong: 92 },
];

const OCCUPANCY_TREND = FINANCIAL_SUMMARY.map(r => ({
  month: r.month,
  'Thực tế (%)': r.tyLePhong,
  'Mục tiêu (%)': 95,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtM = (v: number) => `${(v / 1_000_000).toFixed(0)}tr`;


// ── Component ─────────────────────────────────────────────────────────────────
export const ReportsAnalytics = () => {
  const allRooms = MOCK_PROPERTIES.flatMap(p => p.rooms);
  const occupiedRooms = allRooms.filter(r => r.status === 'occupied').length;
  const totalRooms = allRooms.length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const managers = MOCK_USERS.filter(u => u.role === 'manager');

  const managerPerformance = managers.map(m => {
    const assignedProps = MOCK_PROPERTIES.filter(p => p.managerId === m.id);
    const activeTenants = assignedProps.flatMap(p => p.rooms.filter(r => r.status === 'occupied')).length;
    const resolvedMaintenance = MOCK_MAINTENANCE_REQUESTS.filter(
      r => r.assignedManagerId === m.id && r.status === 'resolved'
    ).length;
    const openMaintenance = MOCK_MAINTENANCE_REQUESTS.filter(
      r => r.assignedManagerId === m.id && (r.status === 'open' || r.status === 'in_progress')
    ).length;
    const activeContracts = ALL_CONTRACTS.filter(
      c => c.type === 'admin_manager' && c.lesseeId === m.id && c.status === 'active'
    ).length;
    const propCount = assignedProps.length;
    const propOccupancy = propCount > 0
      ? Math.round(
          assignedProps.flatMap(p => p.rooms).filter(r => r.status === 'occupied').length /
          Math.max(assignedProps.flatMap(p => p.rooms).length, 1) * 100
        )
      : 0;

    return { manager: m, propCount, activeTenants, resolvedMaintenance, openMaintenance, activeContracts, propOccupancy };
  });

  const totalRevenue6M = FINANCIAL_SUMMARY.reduce((s, r) => s + r.doanhThu, 0);
  const totalExpenses6M = FINANCIAL_SUMMARY.reduce((s, r) => s + r.chiPhi, 0);
  const totalProfit6M = FINANCIAL_SUMMARY.reduce((s, r) => s + r.loiNhuan, 0);

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo & Phân tích</h1>
          <p className="text-sm text-slate-500 mt-1">Tổng quan hiệu suất hoạt động và tài chính của Hoàng Bình Land</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => alert('Xuất PDF... (mô phỏng)')}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Xuất PDF
          </button>
          <button
            onClick={() => alert('Xuất Excel... (mô phỏng)')}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Tóm tắt tài chính 6 tháng */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Báo cáo Tài chính — 6 tháng gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Tháng</th>
                <th className="px-5 py-3.5 text-right">Doanh thu</th>
                <th className="px-5 py-3.5 text-right">Chi phí</th>
                <th className="px-5 py-3.5 text-right">Lợi nhuận</th>
                <th className="px-5 py-3.5 text-right">Tỷ suất LN</th>
                <th className="px-5 py-3.5 text-right">Tỷ lệ lấp đầy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FINANCIAL_SUMMARY.map((row, i) => {
                const margin = Math.round((row.loiNhuan / row.doanhThu) * 100);
                const isLast = i === FINANCIAL_SUMMARY.length - 1;
                return (
                  <tr key={row.month} className={`hover:bg-slate-50 transition-colors ${isLast ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {row.month}
                      {isLast && <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Hiện tại</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-700 tabular-nums">{fmtM(row.doanhThu)}đ</td>
                    <td className="px-5 py-3.5 text-right text-rose-600 tabular-nums">{fmtM(row.chiPhi)}đ</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-indigo-700 tabular-nums">{fmtM(row.loiNhuan)}đ</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        margin >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {margin}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-indigo-500 rounded-full h-1.5" style={{ width: `${row.tyLePhong}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-700 tabular-nums">{row.tyLePhong}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Tổng cộng */}
              <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                <td className="px-5 py-3.5 text-slate-900">Tổng 6 tháng</td>
                <td className="px-5 py-3.5 text-right text-emerald-700 tabular-nums">{fmtM(totalRevenue6M)}đ</td>
                <td className="px-5 py-3.5 text-right text-rose-600 tabular-nums">{fmtM(totalExpenses6M)}đ</td>
                <td className="px-5 py-3.5 text-right text-indigo-700 tabular-nums">{fmtM(totalProfit6M)}đ</td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {Math.round((totalProfit6M / totalRevenue6M) * 100)}%
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right text-slate-500 text-xs">
                  TB: {Math.round(FINANCIAL_SUMMARY.reduce((s, r) => s + r.tyLePhong, 0) / FINANCIAL_SUMMARY.length)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Biểu đồ xu hướng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Xu hướng lấp đầy phòng */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Xu hướng lấp đầy phòng</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={OCCUPANCY_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis domain={[70, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => `${v}%`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={95} stroke="#f43f5e" strokeDasharray="4 4" />
              <Line
                type="monotone" dataKey="Thực tế (%)"
                stroke="#6366f1" strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }}
              />
              <Line
                type="monotone" dataKey="Mục tiêu (%)"
                stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Tỷ lệ lấp đầy hiện tại: <span className="font-semibold text-indigo-700">{occupancyRate}%</span>
            {' '}({occupiedRooms}/{totalRooms} phòng)
          </p>
        </div>

        {/* Lợi nhuận theo tháng */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">Lợi nhuận ròng theo tháng</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={FINANCIAL_SUMMARY}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
              <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="loiNhuan" name="Lợi nhuận" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hiệu suất quản lý */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Hiệu suất Quản lý vận hành</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Tên quản lý</th>
                <th className="px-5 py-3.5 text-center">Số nhà</th>
                <th className="px-5 py-3.5 text-center">Khách thuê</th>
                <th className="px-5 py-3.5 text-center">Tỷ lệ lấp đầy</th>
                <th className="px-5 py-3.5 text-center">Bảo trì đã xử lý</th>
                <th className="px-5 py-3.5 text-center">Đang chờ xử lý</th>
                <th className="px-5 py-3.5 text-center">Hiệu suất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {managerPerformance.length > 0 ? managerPerformance.map(({ manager, propCount, activeTenants, resolvedMaintenance, openMaintenance, propOccupancy }) => {
                const score = Math.min(100, Math.round(propOccupancy * 0.6 + (resolvedMaintenance > 0 ? 30 : 0) + (openMaintenance === 0 ? 10 : 0)));
                const scoreColor = score >= 80 ? 'text-emerald-700 bg-emerald-50' : score >= 60 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50';
                return (
                  <tr key={manager.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {manager.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{manager.fullName}</p>
                          <p className="text-xs text-slate-400">{manager.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center font-semibold text-slate-900">{propCount}</td>
                    <td className="px-5 py-3.5 text-center font-semibold text-blue-700">{activeTenants}</td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-indigo-500 rounded-full h-1.5" style={{ width: `${propOccupancy}%` }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums">{propOccupancy}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="font-semibold text-emerald-700">{resolvedMaintenance}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`font-semibold ${openMaintenance > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {openMaintenance}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${scoreColor}`}>
                        {score}/100
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">
                    Chưa có dữ liệu quản lý.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hiệu suất từng bất động sản */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-900">Hiệu suất theo Bất động sản</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {MOCK_PROPERTIES.map(prop => {
            const occupied = prop.rooms.filter(r => r.status === 'occupied').length;
            const available = prop.rooms.filter(r => r.status === 'available').length;
            const maintenance = prop.rooms.filter(r => r.status === 'maintenance').length;
            const total = prop.rooms.length;
            const occ = total > 0 ? Math.round((occupied / total) * 100) : 0;
            const monthlyRev = prop.rooms.filter(r => r.status === 'occupied').reduce((s, r) => s + r.rentPrice, 0);
            const openMR = MOCK_MAINTENANCE_REQUESTS.filter(
              r => r.propertyId === prop.id && (r.status === 'open' || r.status === 'in_progress')
            ).length;

            return (
              <div key={prop.id} className="card p-5 space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{prop.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{prop.address}</p>
                </div>

                {/* Tỷ lệ lấp đầy */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Lấp đầy</span>
                    <span className="font-semibold text-indigo-700">{occ}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-indigo-500 rounded-full h-2 transition-all" style={{ width: `${occ}%` }} />
                  </div>
                </div>

                {/* Thống kê phòng */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <p className="font-bold text-emerald-700">{occupied}</p>
                    <p className="text-emerald-600">Đang thuê</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="font-bold text-slate-700">{available}</p>
                    <p className="text-slate-500">Trống</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2">
                    <p className="font-bold text-amber-700">{maintenance}</p>
                    <p className="text-amber-600">Bảo trì</p>
                  </div>
                </div>

                {/* Doanh thu & Bảo trì */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <p className="text-slate-500">Doanh thu/tháng</p>
                    <p className="font-semibold text-emerald-700">{formatCurrency(monthlyRev)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500">Bảo trì chờ xử lý</p>
                    <p className={`font-semibold ${openMR > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {openMR} yêu cầu
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
