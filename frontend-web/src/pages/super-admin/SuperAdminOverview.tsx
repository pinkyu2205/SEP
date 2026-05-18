import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  DoorOpen,
  Download,
  ServerCog,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AUDIT_LOGS,
  PLATFORM_ACTIVITY_CHART,
  PLATFORM_BILLS,
  PLATFORM_BUILDINGS,
  PLATFORM_HOSTS,
  PLATFORM_MAINTENANCE_REQUESTS,
  PLATFORM_OCCUPANCY_CHART,
  PLATFORM_REVENUE_CHART,
  PLATFORM_USER_GROWTH_CHART,
} from '../../utils/superAdminMockData';
import { KpiCard, formatShortVnd, formatVnd, moneyTooltip } from './shared';

export const SuperAdminOverview = () => {
  const allRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.totalRooms, 0);
  const occupiedRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.occupiedRooms, 0);
  const maintenanceRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.maintenanceRooms, 0);
  const occupancyRate = allRooms > 0 ? Math.round((occupiedRooms / allRooms) * 100) : 0;
  const currentRevenue = PLATFORM_REVENUE_CHART[PLATFORM_REVENUE_CHART.length - 1].revenue;
  const unpaidBills = PLATFORM_BILLS.filter(bill => bill.status !== 'paid');
  const openMaintenance = PLATFORM_MAINTENANCE_REQUESTS.filter(req => req.status !== 'resolved');
  const revenuePie = [
    { name: 'Đã thu', value: PLATFORM_REVENUE_CHART.at(-1)?.paid ?? 0, color: '#10b981' },
    { name: 'Chưa thu', value: PLATFORM_REVENUE_CHART.at(-1)?.unpaid ?? 0, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              Super Admin web-only access
            </div>
            <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">
              Quản trị toàn hệ thống RoomRent
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Theo dõi Hosts, Managers, Tenants, buildings, rooms, billing, contracts, bảo trì, thiết bị, audit logs và cấu hình nền tảng từ một dashboard web duy nhất.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/super-admin/users" className="btn-primary flex items-center gap-2">
              <Users className="h-4 w-4" />
              Tạo tài khoản
            </Link>
            <Link to="/super-admin/hosts" className="btn-secondary flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Duyệt Host mới
            </Link>
            <Link to="/super-admin/settings" className="btn-secondary flex items-center gap-2">
              <ServerCog className="h-4 w-4" />
              Cấu hình hệ thống
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <KpiCard title="Total Hosts" value={String(PLATFORM_HOSTS.length)} icon={ShieldCheck} color="bg-cyan-50 text-cyan-700" helper={`${PLATFORM_HOSTS.filter(h => h.status === 'pending_approval').length} chờ duyệt`} />
          <KpiCard title="Total Managers" value="38" icon={UserCog} color="bg-indigo-50 text-indigo-700" helper="Toàn bộ Host" />
          <KpiCard title="Total Tenants" value="135" icon={Users} color="bg-emerald-50 text-emerald-700" helper="Bao gồm tenant app" />
          <KpiCard title="Total Buildings" value={String(PLATFORM_BUILDINGS.length)} icon={Building2} color="bg-blue-50 text-blue-700" helper={`${allRooms} rooms`} />
          <KpiCard title="Occupancy Rate" value={`${occupancyRate}%`} icon={DoorOpen} color="bg-amber-50 text-amber-700" helper={`${occupiedRooms}/${allRooms} phòng đang thuê`} />
          <KpiCard title="Total Revenue" value={formatShortVnd(currentRevenue)} icon={TrendingUp} color="bg-emerald-50 text-emerald-700" helper="Tháng 05/2026" />
          <KpiCard title="Unpaid Bills" value={String(unpaidBills.length)} icon={CreditCard} color="bg-rose-50 text-rose-700" helper={formatVnd(unpaidBills.reduce((sum, bill) => sum + bill.amount, 0))} />
          <KpiCard title="Maintenance Requests" value={String(openMaintenance.length)} icon={Wrench} color="bg-orange-50 text-orange-700" helper={`${maintenanceRooms} phòng bảo trì`} />
          <KpiCard title="Security Alerts" value={String(AUDIT_LOGS.filter(log => log.severity !== 'normal').length)} icon={AlertTriangle} color="bg-slate-100 text-slate-800" helper="Audit cần xem xét" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-slate-950">Revenue analytics</h2>
              <p className="text-sm text-slate-500">Doanh thu, đã thu và chưa thu theo tháng</p>
            </div>
            <Download className="h-4 w-4 text-slate-400" />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={PLATFORM_REVENUE_CHART}>
              <defs>
                <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={formatShortVnd} tick={{ fontSize: 11, fill: '#64748b' }} width={45} />
              <RechartsTooltip formatter={moneyTooltip} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="revenue" name="Tổng doanh thu" type="monotone" stroke="#0891b2" strokeWidth={2.5} fill="url(#revenueFill)" />
              <Line dataKey="paid" name="Đã thu" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line dataKey="unpaid" name="Chưa thu" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-extrabold text-slate-950">Occupancy rate</h2>
            <p className="mb-4 text-sm text-slate-500">Tỷ lệ lấp đầy toàn nền tảng</p>
            <ResponsiveContainer width="100%" height={205}>
              <LineChart data={PLATFORM_OCCUPANCY_CHART}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis domain={[60, 100]} unit="%" tick={{ fontSize: 10, fill: '#64748b' }} width={35} />
                <RechartsTooltip formatter={(value: unknown) => `${value}%`} />
                <Line dataKey="occupancy" name="Lấp đầy" stroke="#4f46e5" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-extrabold text-slate-950">Payment split</h2>
            <p className="mb-4 text-sm text-slate-500">Đã thu và chưa thu tháng hiện tại</p>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={revenuePie} dataKey="value" innerRadius={42} outerRadius={65} paddingAngle={3}>
                  {revenuePie.map(item => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <RechartsTooltip formatter={moneyTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-2">
              {revenuePie.map(item => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                  <span className="font-bold text-slate-900">{formatShortVnd(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">User growth</h2>
          <p className="mb-4 text-sm text-slate-500">Hosts, Managers và Tenants theo tháng</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={PLATFORM_USER_GROWTH_CHART}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={35} />
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="hosts" name="Hosts" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="managers" name="Managers" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tenants" name="Tenants" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">System activities</h2>
          <p className="mb-4 text-sm text-slate-500">Login, contracts, payments và maintenance</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={PLATFORM_ACTIVITY_CHART}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={35} />
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="logins" name="Logins" fill="#0f172a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="payments" name="Payments" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="contracts" name="Contracts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="maintenance" name="Maintenance" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};
