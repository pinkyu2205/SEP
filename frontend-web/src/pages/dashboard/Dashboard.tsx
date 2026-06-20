import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, TrendingDown, Home, Wallet, FileText,
  Wrench, UserCog, AlertTriangle, CheckCircle, XCircle,
  ArrowRight, Download, DollarSign, Clock, Activity,
  Building2, Users, ShieldCheck, BarChart3,
} from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import type { Contract } from '../../types';
import {
  MOCK_PROPERTIES, MOCK_USERS, ALL_CONTRACTS,
  MOCK_MAINTENANCE_REQUESTS, MOCK_NOTIFICATIONS,
} from '../../utils/mockData';
import { formatCurrency, maintenancePriorityMap, maintenanceStatusMap, notificationTypeConfig } from '../../utils';

// ── Dữ liệu tài chính ────────────────────────────────────────────────────────
const CASH_FLOW_DATA = [
  { month: 'Th12/2025', revenue: 110000000, expense: 45000000 },
  { month: 'Th1/2026',  revenue: 115000000, expense: 48000000 },
  { month: 'Th2/2026',  revenue: 112000000, expense: 52000000 },
  { month: 'Th3/2026',  revenue: 122000000, expense: 45000000 },
  { month: 'Th4/2026',  revenue: 125000000, expense: 47000000 },
  { month: 'Th5/2026',  revenue: 128000000, expense: 46000000 },
].map(d => ({ ...d, loiNhuan: d.revenue - d.expense }));

const EXPENSE_PIE_DATA = [
  { name: 'Chi phí thuê nhà', value: 78000000, color: '#6366F1' },
  { name: 'Bảo trì',          value: 8000000,  color: '#F59E0B' },
  { name: 'Thiết bị',         value: 5000000,  color: '#06B6D4' },
  { name: 'Quản lý',          value: 3000000,  color: '#8B5CF6' },
  { name: 'Điện nước',        value: 2000000,  color: '#10B981' },
];

const OCCUPANCY_TREND = [
  { month: 'Th12/2025', lapDay: 82, mucTieu: 90 },
  { month: 'Th1/2026',  lapDay: 85, mucTieu: 90 },
  { month: 'Th2/2026',  lapDay: 83, mucTieu: 90 },
  { month: 'Th3/2026',  lapDay: 88, mucTieu: 90 },
  { month: 'Th4/2026',  lapDay: 89, mucTieu: 90 },
  { month: 'Th5/2026',  lapDay: 89, mucTieu: 90 },
];

const fmtM = (v: number) => `${(v / 1_000_000).toFixed(0)}M`;

// ── Components nội bộ ─────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  borderColor: string;
  trend?: string;
  trendUp?: boolean;
  extra?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

const KpiCard = ({ title, value, icon: Icon, iconBg, iconColor, borderColor, trend, trendUp, extra, badge, badgeColor }: KpiCardProps) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-100 p-5 border-l-4 ${borderColor} hover:shadow-md transition-shadow`}>
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          {badge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        <p className="text-2xl font-bold text-slate-900 mt-1.5 truncate">{value}</p>
        {trend && (
          <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend} so với tháng trước
          </p>
        )}
        {extra}
      </div>
      <div className={`${iconBg} rounded-xl p-3 flex-shrink-0 ml-3`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
    </div>
  </div>
);

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}

const SectionHeader = ({ title, subtitle, action, icon: Icon }: SectionHeaderProps) => (
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="p-2 bg-primary-50 rounded-lg">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

// ── Dashboard chính ────────────────────────────────────────────────────────────
export const Dashboard = () => {
  const currentMonth = CASH_FLOW_DATA[CASH_FLOW_DATA.length - 1];

  const allRooms = MOCK_PROPERTIES.flatMap(p => p.rooms);
  const occupiedRooms = allRooms.filter(r => r.status === 'occupied').length;
  const vacantRooms = allRooms.filter(r => r.status === 'available').length;
  const maintenanceRooms = allRooms.filter(r => r.status === 'maintenance').length;
  const occupancyRate = allRooms.length > 0 ? Math.round((occupiedRooms / allRooms.length) * 100) : 0;
  const activeManagers = MOCK_USERS.filter(u => u.role === 'manager' && u.status === 'active').length;
  const maintenancePending = MOCK_MAINTENANCE_REQUESTS.filter(m => m.status === 'open' || m.status === 'in_progress').length;

  const today = new Date('2026-05-15');
  const expiringHouses = ALL_CONTRACTS.filter(c => {
    if (c.type !== 'admin_manager' || c.status === 'terminated') return false;
    const diff = (new Date(c.endDate).getTime() - today.getTime()) / 86400000;
    return diff <= 60 && diff >= 0;
  }).length;

  const initialPending = ALL_CONTRACTS.filter(c => c.status === 'pending_approval');
  const [pendingContracts, setPendingContracts] = useState<Contract[]>(initialPending);
  const [approvalModal, setApprovalModal] = useState<{ contract: Contract; action: 'approve' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [alerts, setAlerts] = useState(MOCK_NOTIFICATIONS.filter(n => !n.isRead));

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const recentMaintenance = [...MOCK_MAINTENANCE_REQUESTS]
    .filter(m => m.status === 'open' || m.status === 'in_progress')
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, 5);

  const handleApprovalAction = () => {
    if (!approvalModal) return;
    setPendingContracts(prev => prev.filter(c => c.id !== approvalModal.contract.id));
    setApprovalModal(null);
    setRejectReason('');
  };

  const totalEstimatedCost = MOCK_MAINTENANCE_REQUESTS
    .filter(m => m.status === 'open' || m.status === 'in_progress')
    .reduce((sum, m) => sum + (m.estimatedCost || 0), 0);

  return (
    <div className="space-y-7">
      {/* ── Tiêu đề trang ─── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-primary-600 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Trang tổng quan</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">
            Bảng điều hành vận hành bất động sản Hoàng Bình Land — Tháng 5/2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Hệ thống đang hoạt động</span>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Xuất báo cáo
          </button>
        </div>
      </div>

      {/* ── 8 Thẻ KPI ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Doanh thu tháng này"
          value={formatCurrency(currentMonth.revenue)}
          icon={TrendingUp}
          iconBg="bg-emerald-50" iconColor="text-emerald-600" borderColor="border-l-emerald-500"
          trend="+2.4%" trendUp
        />
        <KpiCard
          title="Tổng chi phí"
          value={formatCurrency(currentMonth.expense)}
          icon={TrendingDown}
          iconBg="bg-rose-50" iconColor="text-rose-600" borderColor="border-l-rose-500"
          trend="-2.1%" trendUp={false}
        />
        <KpiCard
          title="Lợi nhuận ròng"
          value={formatCurrency(currentMonth.loiNhuan)}
          icon={Wallet}
          iconBg="bg-emerald-50" iconColor="text-emerald-700" borderColor="border-l-emerald-700"
          trend="+5.6%" trendUp
        />
        <KpiCard
          title="Tỷ lệ lấp đầy"
          value={`${occupancyRate}%`}
          icon={Home}
          iconBg="bg-blue-50" iconColor="text-blue-600" borderColor="border-l-blue-500"
          extra={
            <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
            </div>
          }
        />
        <KpiCard
          title="Hợp đồng chờ duyệt"
          value={String(pendingContracts.length)}
          icon={FileText}
          iconBg="bg-amber-50" iconColor="text-amber-600" borderColor="border-l-amber-500"
          badge={pendingContracts.length > 0 ? 'Cần xử lý' : undefined}
          badgeColor="bg-amber-100 text-amber-700"
        />
        <KpiCard
          title="Yêu cầu bảo trì chờ xử lý"
          value={String(maintenancePending)}
          icon={Wrench}
          iconBg="bg-rose-50" iconColor="text-rose-600" borderColor="border-l-rose-500"
          extra={
            <p className="text-xs text-slate-400 mt-1">Chi phí ước tính: {fmtM(totalEstimatedCost)}₫</p>
          }
        />
        <KpiCard
          title="Quản lý vận hành"
          value={String(activeManagers)}
          icon={UserCog}
          iconBg="bg-violet-50" iconColor="text-violet-600" borderColor="border-l-violet-500"
          badge="Đang hoạt động" badgeColor="bg-emerald-100 text-emerald-700"
        />
        <KpiCard
          title="Hợp đồng nhà sắp hết hạn"
          value={String(expiringHouses)}
          icon={AlertTriangle}
          iconBg="bg-amber-50" iconColor="text-amber-600" borderColor="border-l-amber-400"
          badge={expiringHouses > 0 ? '≤ 60 ngày' : undefined}
          badgeColor="bg-amber-100 text-amber-700"
        />
      </div>

      {/* ── Phần A: Tổng quan tài chính ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader
            title="Tổng quan tài chính"
            subtitle="Dòng tiền 6 tháng gần nhất"
            icon={BarChart3}
            action={
              <button className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                <Download className="w-3 h-3" /> Xuất Excel
              </button>
            }
          />
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={CASH_FLOW_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} />
              <RechartsTooltip
                formatter={(v: any, name: any) => [formatCurrency(v), name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Doanh thu" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Chi phí" fill="#F43F5E" radius={[3, 3, 0, 0]} />
              <Line dataKey="loiNhuan" name="Lợi nhuận" stroke="#6366F1" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col">
          <SectionHeader title="Cơ cấu chi phí" subtitle="Tháng 5/2026" icon={DollarSign} />
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={EXPENSE_PIE_DATA} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                {EXPENSE_PIE_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <RechartsTooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2 flex-1">
            {EXPENSE_PIE_DATA.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-semibold text-slate-900">{fmtM(item.value)}₫</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Phần B: Tổng quan vận hành bất động sản ─── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeader
          title="Tổng quan vận hành bất động sản"
          subtitle={`${MOCK_PROPERTIES.length} bất động sản · ${allRooms.length} phòng`}
          icon={Building2}
          action={
            <Link to="/host/properties" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              Xem tất cả <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Tổng bất động sản', value: MOCK_PROPERTIES.length, color: 'text-slate-900', bg: 'bg-slate-50', border: 'border-slate-200' },
            { label: 'Phòng đang thuê',   value: occupiedRooms,          color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
            { label: 'Phòng còn trống',   value: vacantRooms,            color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            { label: 'Đang bảo trì',      value: maintenanceRooms,       color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MOCK_PROPERTIES.map(prop => {
            const total = prop.rooms.length;
            const occ = prop.rooms.filter(r => r.status === 'occupied').length;
            const maint = prop.rooms.filter(r => r.status === 'maintenance').length;
            const avail = total - occ - maint;
            const rate = total > 0 ? Math.round((occ / total) * 100) : 0;
            const monthlyRev = prop.rooms.filter(r => r.status === 'occupied').reduce((s, r) => s + r.rentPrice, 0);
            return (
              <Link
                key={prop.id}
                to={`/host/properties/${prop.id}`}
                className="block border border-slate-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm group-hover:text-primary-600 transition-colors">{prop.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{prop.address}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-2 ${rate >= 85 ? 'bg-emerald-100 text-emerald-700' : rate >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {rate}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full transition-all ${rate >= 85 ? 'bg-emerald-500' : rate >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs mb-3">
                  <div className="bg-blue-50 rounded-lg py-1.5">
                    <p className="font-bold text-blue-700">{occ}</p>
                    <p className="text-slate-400 text-[10px]">Đang thuê</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg py-1.5">
                    <p className="font-bold text-emerald-700">{avail}</p>
                    <p className="text-slate-400 text-[10px]">Còn trống</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg py-1.5">
                    <p className="font-bold text-amber-700">{maint}</p>
                    <p className="text-slate-400 text-[10px]">Bảo trì</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">Doanh thu/tháng</span>
                  <span className="font-bold text-emerald-700">{fmtM(monthlyRev)}₫</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Xu hướng lấp đầy ─── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeader
          title="Xu hướng tỷ lệ lấp đầy"
          subtitle="Tỷ lệ thực tế so với mục tiêu 90% — 6 tháng"
          icon={Activity}
          action={
            <Link to="/host/reports" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              Báo cáo chi tiết <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={OCCUPANCY_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="occupancyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" width={40} />
            <RechartsTooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Area dataKey="lapDay" name="Thực tế" stroke="#6366F1" strokeWidth={2} fill="url(#occupancyGrad)" dot={{ fill: '#6366F1', r: 3 }} />
            <Line dataKey="mucTieu" name="Mục tiêu" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Phần C+D: Phê duyệt hợp đồng & Bảo trì ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Phần C: Quy trình phê duyệt hợp đồng */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader
            title="Phê duyệt hợp đồng"
            subtitle={`${pendingContracts.length} hợp đồng đang chờ chữ ký Host`}
            icon={ShieldCheck}
            action={
              <Link to="/host/contracts" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                Tất cả <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          {pendingContracts.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">Không có hợp đồng chờ phê duyệt</p>
              <p className="text-xs text-slate-400 mt-1">Tất cả hợp đồng đã được xử lý</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingContracts.map(c => (
                <div key={c.id} className="border border-amber-100 bg-gradient-to-r from-amber-50/60 to-orange-50/30 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">{c.code}</span>
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Chờ duyệt</span>
                      </div>
                      <p className="font-bold text-slate-900 text-sm">{c.lesseeName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{c.propertyName} · Phòng {c.roomCode}</p>
                      <p className="text-xs text-slate-500">Quản lý: {c.lessorName} · {formatCurrency(c.rentAmount)}/tháng</p>
                      <p className="text-xs text-slate-400 mt-0.5">Bắt đầu: {c.startDate}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setApprovalModal({ contract: c, action: 'approve' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Phê duyệt
                      </button>
                      <button
                        onClick={() => setApprovalModal({ contract: c, action: 'reject' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-300 text-rose-600 text-xs font-semibold rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Từ chối
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Phần D: Yêu cầu bảo trì đang mở */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader
            title="Giám sát bảo trì"
            subtitle={`${maintenancePending} sự cố đang mở / đang xử lý (ưu tiên giảm dần)`}
            icon={Wrench}
            action={
              <Link to="/host/maintenance" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                Giám sát <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="space-y-2.5">
            {recentMaintenance.map(req => {
              const pBadge = maintenancePriorityMap[req.priority];
              const sBadge = maintenanceStatusMap[req.status];
              return (
                <div key={req.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${req.priority === 'critical' ? 'bg-rose-50/60 border-rose-100' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${pBadge.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`} />{pBadge.label}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sBadge.color}`}>{sBadge.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 line-clamp-1">{req.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {req.propertyName}{req.roomCode ? ` · Phòng ${req.roomCode}` : ''} · {req.assignedManagerName}
                    </p>
                  </div>
                  {req.estimatedCost !== undefined && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-slate-700">{formatCurrency(req.estimatedCost)}</p>
                      <p className="text-[10px] text-slate-400">Ước tính</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Phần E: Cảnh báo & Thông báo ─── */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionHeader
            title="Cảnh báo & Thông báo"
            subtitle={`${alerts.length} cảnh báo chưa đọc cần xử lý`}
            icon={AlertTriangle}
            action={
              <Link to="/host/notifications" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                Tất cả <ArrowRight className="w-3 h-3" />
              </Link>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts.slice(0, 6).map(n => {
              const cfg = notificationTypeConfig[n.type];
              return (
                <div key={n.id} className={`flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 ${cfg.bgColor} hover:shadow-sm transition-shadow`}>
                  <div className="p-2 rounded-lg bg-white shadow-sm flex-shrink-0">
                    {n.type === 'approval_needed'   && <FileText   className={`w-4 h-4 ${cfg.textColor}`} />}
                    {n.type === 'contract_expiry'   && <Clock      className={`w-4 h-4 ${cfg.textColor}`} />}
                    {n.type === 'maintenance_delay' && <Wrench     className={`w-4 h-4 ${cfg.textColor}`} />}
                    {n.type === 'unpaid_invoice'    && <DollarSign className={`w-4 h-4 ${cfg.textColor}`} />}
                    {n.type === 'occupancy_alert'   && <Home       className={`w-4 h-4 ${cfg.textColor}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${cfg.textColor}`}>{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                  <button
                    onClick={() => setAlerts(prev => prev.filter(a => a.id !== n.id))}
                    className="text-slate-300 hover:text-slate-500 flex-shrink-0 transition-colors"
                    title="Bỏ qua"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Phần F: Tổng quan quản lý vận hành ─── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <SectionHeader
          title="Tổng quan quản lý vận hành"
          subtitle={`${activeManagers} quản lý đang hoạt động · ${MOCK_PROPERTIES.length} bất động sản được phân công`}
          icon={Users}
          action={
            <Link to="/host/operations-managers" className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 px-3 py-1.5 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              Tất cả <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MOCK_USERS.filter(u => u.role === 'manager').map(mgr => {
            const assignedProps = MOCK_PROPERTIES.filter(p => p.managerId === mgr.id);
            const activeTenants = assignedProps.flatMap(p => p.rooms.filter(r => r.status === 'occupied')).length;
            const openMaint = MOCK_MAINTENANCE_REQUESTS.filter(m => m.assignedManagerId === mgr.id && (m.status === 'open' || m.status === 'in_progress')).length;
            const initials = mgr.fullName.split(' ').slice(-2).map(n => n[0]).join('').toUpperCase();
            return (
              <div key={mgr.id} className="border border-slate-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-sm truncate">{mgr.fullName}</p>
                    <p className="text-xs text-slate-400 truncate">{mgr.email || mgr.phone}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0 border border-emerald-200">
                    Đang HĐ
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                    <p className="font-bold text-slate-900 text-base">{assignedProps.length}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Bất động sản</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                    <p className="font-bold text-blue-700 text-base">{activeTenants}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Khách thuê</p>
                  </div>
                  <div className={`${openMaint > 0 ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'} rounded-lg p-2.5`}>
                    <p className={`font-bold text-base ${openMaint > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{openMaint}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Sự cố mở</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal phê duyệt hợp đồng ─── */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setApprovalModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-5">
              {approvalModal.action === 'approve' ? (
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
              ) : (
                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {approvalModal.action === 'approve' ? 'Phê duyệt hợp đồng' : 'Từ chối hợp đồng'}
                </h3>
                <p className="text-xs text-slate-400">
                  {approvalModal.action === 'approve' ? 'Hợp đồng sẽ có hiệu lực ngay sau khi phê duyệt' : 'Quản lý sẽ được thông báo về lý do từ chối'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
              <p className="font-mono text-xs text-slate-400 mb-1">{approvalModal.contract.code}</p>
              <p className="font-bold text-slate-900">{approvalModal.contract.lesseeName}</p>
              <p className="text-sm text-slate-500 mt-0.5">{approvalModal.contract.propertyName} · Phòng {approvalModal.contract.roomCode}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span>Giá thuê: <strong className="text-slate-900">{formatCurrency(approvalModal.contract.rentAmount)}/tháng</strong></span>
                <span>Từ: <strong className="text-slate-900">{approvalModal.contract.startDate}</strong></span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Gửi bởi: {approvalModal.contract.lessorName}</p>
            </div>

            {approvalModal.action === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lý do từ chối <span className="text-rose-500">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối để thông báo cho quản lý vận hành..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setApprovalModal(null)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleApprovalAction}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors shadow-sm ${approvalModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {approvalModal.action === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
