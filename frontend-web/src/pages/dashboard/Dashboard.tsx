import React from 'react';
import { TrendingUp, TrendingDown, Home, DollarSign, Wallet, FileText } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Line
} from 'recharts';

// --- MOCK DATA ---
const CASH_FLOW_DATA = [
  { month: 'T11/2025', revenue: 110000000, expense: 45000000 },
  { month: 'T12/2025', revenue: 115000000, expense: 48000000 },
  { month: 'T01/2026', revenue: 112000000, expense: 46000000 },
  { month: 'T02/2026', revenue: 118000000, expense: 52000000 }, // Sửa chữa nhiều
  { month: 'T03/2026', revenue: 122000000, expense: 45000000 },
  { month: 'T04/2026', revenue: 125000000, expense: 45000000 },
].map(item => ({
  ...item,
  netProfit: item.revenue - item.expense
}));

const OCCUPANCY_DATA = [
  { name: 'Đang thuê', value: 92, color: '#10B981' }, // Green
  { name: 'Phòng trống', value: 5, color: '#94A3B8' }, // Gray
  { name: 'Bảo trì', value: 3, color: '#F59E0B' }, // Amber
];

const EXPENSES_LIST = [
  { id: 'EXP-001', date: '28/04/2026', category: 'Tiền thuê nhà gốc', property: 'Nhà Trọ Sunrise', amount: 35000000, status: 'Đã thanh toán' },
  { id: 'EXP-002', date: '25/04/2026', category: 'Sửa chữa bảo trì', property: 'Nhà Trọ Sunrise (P.102)', amount: 1500000, status: 'Đã thanh toán' },
  { id: 'EXP-003', date: '20/04/2026', category: 'Tiền thuê nhà gốc', property: 'Nhà Trọ Moonlight', amount: 8000000, status: 'Đã thanh toán' },
  { id: 'EXP-004', date: '15/04/2026', category: 'Mua sắm thiết bị', property: 'Nhà Trọ Moonlight (P.201)', amount: 500000, status: 'Đã thanh toán' },
];

const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

// --- COMPONENTS ---
const StatCard = ({ title, value, icon: Icon, trend, trendUp, colorClass, bgClass }: any) => (
  <div className="card p-6 border-l-4" style={{ borderColor: trendUp ? '#10B981' : (trendUp === false ? '#EF4444' : '#3B82F6') }}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${bgClass} ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
    {trend && (
      <div className="mt-4 flex items-center text-sm">
        <span className={`font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trend}
        </span>
        <span className="text-slate-500 ml-2">so với tháng trước</span>
      </div>
    )}
  </div>
);

export const Dashboard = () => {
  const currentMonth = CASH_FLOW_DATA[CASH_FLOW_DATA.length - 1];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo Dòng tiền</h1>
          <p className="text-slate-500 mt-1">Tổng quan tài chính hệ thống tháng 04/2026</p>
        </div>
        <button className="btn-primary">
          Tải báo cáo Excel
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Lợi Nhuận Ròng" 
          value={formatCurrency(currentMonth.netProfit)} 
          icon={Wallet} 
          trend="+5.2%" trendUp={true} 
          bgClass="bg-blue-100" colorClass="text-blue-600"
        />
        <StatCard 
          title="Tổng Thu (Revenue)" 
          value={formatCurrency(currentMonth.revenue)} 
          icon={TrendingUp} 
          trend="+2.4%" trendUp={true} 
          bgClass="bg-emerald-100" colorClass="text-emerald-600"
        />
        <StatCard 
          title="Tổng Chi (Expenses)" 
          value={formatCurrency(currentMonth.expense)} 
          icon={TrendingDown} 
          trend="0.0%" trendUp={false} 
          bgClass="bg-rose-100" colorClass="text-rose-600"
        />
        <StatCard 
          title="Tỉ lệ lấp đầy" 
          value="92%" 
          icon={Home} 
          trend="+2.1%" trendUp={true} 
          bgClass="bg-indigo-100" colorClass="text-indigo-600"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Bar Chart - Cash Flow */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Biểu đồ Thu - Chi 6 tháng gần nhất</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CASH_FLOW_DATA} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#64748B'}} dy={10} />
                <YAxis 
                  axisLine={false} tickLine={false} tick={{fill: '#64748B'}}
                  tickFormatter={(val) => `${val / 1000000}Tr`} 
                />
                <RechartsTooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{fill: '#F1F5F9'}}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="revenue" name="Tổng Thu" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="expense" name="Tổng Chi" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Occupancy */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Tỷ lệ lấp đầy hiện tại</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={OCCUPANCY_DATA}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {OCCUPANCY_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Custom Legend */}
          <div className="mt-4 space-y-3">
            {OCCUPANCY_DATA.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Danh sách Chi phí (Expenses)</h2>
          <button className="btn-secondary text-sm">
            + Thêm chi phí mới
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Mã GD</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Ngày</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Hạng mục</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Bất động sản</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Số tiền</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXPENSES_LIST.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {exp.id}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.date}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{exp.category}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.property}</td>
                  <td className="px-6 py-4 text-sm font-bold text-rose-600 text-right">
                    -{formatCurrency(exp.amount)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">
                      {exp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
