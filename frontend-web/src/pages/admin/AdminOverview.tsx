import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CreditCard, ServerCog, ShieldCheck, TrendingUp, Users, Wrench, UserCog,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, PieChart, Pie, Cell,
} from 'recharts';
import { adminService, type AdminInvoiceRow, type AdminHost } from '@/services/admin.service';
import { propertyService } from '@/services/property.service';
import { userService } from '@/services/user.service';
import { maintenanceService } from '@/services/maintenance.service';
import type { PropertyResponse, UserResponse, MaintenanceDashboardResponse } from '@/types/api.types';
import { KpiCard, formatShortVnd, formatVnd } from './shared';

// =============================================================================
// Dashboard Admin — 100% API thật, KHÔNG mock fallback.
// Nguồn: adminService (invoices/hosts) · propertyService (toà nhà/phòng)
//        · userService (người dùng theo role) · maintenanceService (bảo trì).
// Khi BE chưa trả dữ liệu → hiển thị '—' / trạng thái trống trung thực.
// =============================================================================

// Khớp enum TenantInvoiceStatus của BE (nguồn: GET /api/v1/manager/invoices).
const STATUS_COLOR: Record<string, string> = {
  PAID: '#10b981', PENDING: '#f59e0b', OVERDUE: '#f43f5e', PARTIAL: '#3b82f6', CANCELLED: '#94a3b8',
};
const STATUS_LABEL: Record<string, string> = {
  PAID: 'Đã thu', PENDING: 'Chưa thu', OVERDUE: 'Quá hạn', PARTIAL: 'Thu 1 phần', CANCELLED: 'Đã huỷ',
};

// Tooltip gọn (chữ ink token, chấm màu theo series)
const MiniTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-xl">
      {label && <p className="text-xs font-bold text-slate-700 mb-1">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.color || p.fill }} />{p.name}</span>
          <span className="font-semibold tabular-nums text-slate-800">{typeof p.value === 'number' && p.value >= 1000 ? formatVnd(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

const EmptyChart = ({ note }: { note: string }) => (
  <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">{note}</div>
);

const EMPTY_MTN: MaintenanceDashboardResponse = { total: 0, pending: 0, inProgress: 0, resolved: 0, cancelled: 0, totalRepairCost: 0 };

export const SuperAdminOverview = () => {
  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [hosts, setHosts] = useState<AdminHost[] | null>(null);
  const [properties, setProperties] = useState<PropertyResponse[] | null>(null);
  const [users, setUsers] = useState<UserResponse[] | null>(null);
  const [mtn, setMtn] = useState<MaintenanceDashboardResponse | null>(null);

  useEffect(() => {
    let active = true;
    // Lấy TOÀN BỘ hóa đơn thật của hệ thống (không lọc tháng).
    adminService.listInvoices({}).then(rows => { if (active && Array.isArray(rows)) setInvoices(rows); }).catch(() => {});
    adminService.getHosts().then(rows => { if (active && Array.isArray(rows)) setHosts(rows); }).catch(() => {});
    propertyService.getProperties(0, 500).then(res => { if (active && res?.content) setProperties(res.content); }).catch(() => {});
    userService.getAllUsers().then(rows => { if (active && Array.isArray(rows)) setUsers(rows); }).catch(() => {});
    maintenanceService.getDashboard().then(res => { if (active && res) setMtn(res); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // ── Suy số liệu từ hóa đơn thật ──
  const revenuePaid = useMemo(() => invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0), [invoices]);
  const unpaid = useMemo(
    () => invoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE' || i.status === 'PARTIAL'),
    [invoices],
  );
  const unpaidAmount = useMemo(() => unpaid.reduce((s, i) => s + i.amount, 0), [unpaid]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.status, (m.get(i.status) ?? 0) + i.amount);
    return [...m.entries()].map(([status, value]) => ({ name: STATUS_LABEL[status] ?? status, value, color: STATUS_COLOR[status] ?? '#94a3b8' })).filter(x => x.value > 0);
  }, [invoices]);

  // Hoá đơn thật không mang thông tin host (ManagerInvoiceResponse chỉ có property),
  // nên gom theo TOÀ NHÀ — xem docs/BE-NEED-admin-billing-fields-2026-08-07.md.
  const byProperty = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.propertyName, (m.get(i.propertyName) ?? 0) + i.amount);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [invoices]);

  const userComp = useMemo(() => {
    const c = { hosts: 0, managers: 0, tenants: 0 };
    for (const u of users ?? []) {
      if (u.role === 'ROLE_OWNER') c.hosts++;
      else if (u.role === 'ROLE_MANAGER') c.managers++;
      else if (u.role === 'ROLE_TENANT') c.tenants++;
    }
    return c;
  }, [users]);
  const userPie = [
    { name: 'Hosts', value: userComp.hosts, color: '#06b6d4' },
    { name: 'Managers', value: userComp.managers, color: '#6366f1' },
    { name: 'Tenants', value: userComp.tenants, color: '#10b981' },
  ].filter(x => x.value > 0);

  const m = mtn ?? EMPTY_MTN;
  const mtnBars = [
    { name: 'Chờ xử lý', value: m.pending, color: '#f59e0b' },
    { name: 'Đang xử lý', value: m.inProgress, color: '#3b82f6' },
    { name: 'Đã xong', value: m.resolved, color: '#10b981' },
    { name: 'Đã huỷ', value: m.cancelled, color: '#94a3b8' },
  ];

  const hostsCount = hosts ? String(hosts.length) : users ? String(userComp.hosts) : '—';
  const buildingCount = properties ? String(properties.length) : '—';
  const roomCount = properties ? properties.reduce((s, p) => s + (p.totalRooms ?? 0), 0) : 0;
  const totalUsers = users ? String(userComp.hosts + userComp.managers + userComp.tenants) : '—';
  const mtnTotal = mtn ? String(m.total) : '—';
  const mtnOpen = m.pending + m.inProgress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin web-only access
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-950 md:text-3xl">Quản trị toàn hệ thống Hoàng Bình Land</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Giám sát Hosts, người dùng, toà nhà, hóa đơn & bảo trì toàn nền tảng — dữ liệu trực tiếp từ hệ thống.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/users" className="btn-primary flex items-center gap-2"><Users className="h-4 w-4" /> Tạo tài khoản</Link>
          <Link to="/admin/settings" className="btn-secondary flex items-center gap-2"><ServerCog className="h-4 w-4" /> Cấu hình hệ thống</Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Total Hosts" value={hostsCount} icon={ShieldCheck} color="bg-cyan-50 text-cyan-700" helper="Chủ nhà" />
        <KpiCard title="Toà nhà" value={buildingCount} icon={Building2} color="bg-blue-50 text-blue-700" helper={`${roomCount} phòng`} />
        <KpiCard title="Doanh thu đã thu" value={formatShortVnd(revenuePaid)} icon={TrendingUp} color="bg-emerald-50 text-emerald-700" helper="Tổng đã thu" />
        <KpiCard title="Hóa đơn chưa thu" value={String(unpaid.length)} icon={CreditCard} color="bg-rose-50 text-rose-700" helper={formatVnd(unpaidAmount)} />
        <KpiCard title="Người dùng" value={totalUsers} icon={UserCog} color="bg-violet-50 text-violet-700" helper={`${userComp.managers} QL · ${userComp.tenants} khách`} />
        <KpiCard title="Yêu cầu bảo trì" value={mtnTotal} icon={Wrench} color="bg-orange-50 text-orange-700" helper={`${mtnOpen} đang xử lý`} />
      </div>

      {/* Charts hàng 1 */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Doanh thu theo Host */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">Doanh thu theo toà nhà</h2>
          <p className="mb-4 text-sm text-slate-500">Tổng hóa đơn của từng toà nhà — toàn hệ thống</p>
          {byProperty.length === 0 ? (
            <EmptyChart note="Chưa có hóa đơn nào trong hệ thống" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byProperty} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <defs><linearGradient id="gHost" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0891b2" /><stop offset="100%" stopColor="#22d3ee" /></linearGradient></defs>
                <CartesianGrid horizontal={false} strokeDasharray="4 4" stroke="#eef2f7" />
                <XAxis type="number" tickFormatter={formatShortVnd} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <RechartsTooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(6,182,212,0.06)' }} />
                <Bar dataKey="value" name="Doanh thu" fill="url(#gHost)" radius={[0, 6, 6, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cơ cấu thu / chưa thu */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">Cơ cấu hóa đơn</h2>
          <p className="mb-4 text-sm text-slate-500">Đã thu · chưa thu · quá hạn — toàn hệ thống</p>
          {byStatus.length === 0 ? (
            <EmptyChart note="Chưa có hóa đơn nào trong hệ thống" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={byStatus} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {byStatus.map(e => <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <RechartsTooltip content={<MiniTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2.5">
                {byStatus.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                    <span className="font-bold text-slate-900 tabular-nums">{formatShortVnd(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts hàng 2 */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Cơ cấu người dùng */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">Cơ cấu người dùng</h2>
          <p className="mb-4 text-sm text-slate-500">Hosts · Managers · Tenants toàn hệ thống</p>
          {userPie.length === 0 ? (
            <EmptyChart note="Chưa tải được danh sách người dùng" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={userPie} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {userPie.map(e => <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <RechartsTooltip content={<MiniTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2.5">
                {userPie.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                    <span className="font-bold text-slate-900 tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bảo trì theo trạng thái */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">Bảo trì theo trạng thái</h2>
          <p className="mb-4 text-sm text-slate-500">{m.total} yêu cầu toàn nền tảng</p>
          {mtn === null ? (
            <EmptyChart note="Chưa tải được dữ liệu bảo trì" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mtnBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#eef2f7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} width={28} />
                <RechartsTooltip content={<MiniTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                <Bar dataKey="value" name="Số lượng" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {mtnBars.map(e => <Cell key={e.name} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Hóa đơn cần thu */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-slate-950">Hóa đơn cần thu</h2>
            <p className="text-sm text-slate-500">{unpaid.length} hóa đơn chưa thu / quá hạn · tổng {formatVnd(unpaidAmount)}</p>
          </div>
          <Link to="/admin/billing" className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 px-3 py-1.5 bg-cyan-50 rounded-lg">Xem tất cả</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Mã hoá đơn</th>
                <th className="px-5 py-3">Toà nhà / Khách</th>
                <th className="px-5 py-3 text-right">Số tiền</th>
                <th className="px-5 py-3">Hạn TT</th>
                <th className="px-5 py-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unpaid.slice(0, 8).map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900">{inv.code}</td>
                  <td className="px-5 py-3"><p className="text-slate-900">{inv.propertyName}</p><p className="text-xs text-slate-400">{inv.tenantName}</p></td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatVnd(inv.amount)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{inv.dueDate ? inv.dueDate.split('-').reverse().join('/') : '—'}</td>
                  <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: `${STATUS_COLOR[inv.status]}1a`, color: STATUS_COLOR[inv.status] }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[inv.status] }} />{STATUS_LABEL[inv.status]}</span></td>
                </tr>
              ))}
              {unpaid.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">Không có hóa đơn cần thu.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
