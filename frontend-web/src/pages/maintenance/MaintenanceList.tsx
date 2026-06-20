import { useState } from 'react';
import {
  Search, Wrench, CheckCircle, Clock, AlertTriangle,
  DollarSign, Eye, X, Calendar, User, Building2,
  FileText, TrendingUp, Info, ShieldAlert, MapPin,
} from 'lucide-react';
import type { MaintenanceRequest } from '../../types';
import { MOCK_MAINTENANCE_REQUESTS, MOCK_PROPERTIES, MOCK_USERS } from '../../utils/mockData';
import { formatCurrency, maintenancePriorityMap, maintenanceStatusMap } from '../../utils';

// Tính số ngày đã mở từ ngày báo cáo
const daysSince = (dateStr: string): number => {
  const reported = new Date(dateStr);
  const today = new Date('2026-05-15');
  return Math.floor((today.getTime() - reported.getTime()) / 86_400_000);
};

const isOverdue = (req: MaintenanceRequest): boolean => {
  if (req.status === 'resolved' || req.status === 'cancelled') return false;
  const days = daysSince(req.reportedAt);
  if (req.priority === 'critical') return days > 1;
  if (req.priority === 'high')     return days > 3;
  if (req.priority === 'medium')   return days > 7;
  return days > 14;
};

const SLAThreshold: Record<string, number> = {
  critical: 1, high: 3, medium: 7, low: 14,
};

// ── Modal chi tiết ────────────────────────────────────────────────────────────
interface DetailModalProps {
  request: MaintenanceRequest;
  onClose: () => void;
}

const DetailModal = ({ request, onClose }: DetailModalProps) => {
  const pBadge = maintenancePriorityMap[request.priority];
  const sBadge = maintenanceStatusMap[request.status];
  const days = daysSince(request.reportedAt);
  const overdue = isOverdue(request);
  const sla = SLAThreshold[request.priority];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{request.code}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${pBadge.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`} />{pBadge.label}
              </span>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${sBadge.color}`}>
                {sBadge.label}
              </span>
              {overdue && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                  <AlertTriangle className="w-3 h-3" /> Trễ SLA
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">{request.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cảnh báo trễ hạn */}
          {overdue && (
            <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-rose-800">Yêu cầu đã vượt SLA</p>
                <p className="text-xs text-rose-700 mt-0.5">
                  Đã mở <strong>{days} ngày</strong> — mức độ <strong>{pBadge.label}</strong> cần xử lý trong <strong>{sla} ngày</strong>.
                  Đề nghị quản lý vận hành phụ trách báo cáo tiến độ ngay.
                </p>
              </div>
            </div>
          )}

          {/* Mô tả */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mô tả sự cố</p>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
              {request.description}
            </p>
          </div>

          {/* Thông tin chính */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Vị trí
              </p>
              <p className="font-semibold text-slate-900 text-sm">{request.propertyName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {request.roomCode ? `Phòng ${request.roomCode}` : 'Khu vực chung'}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Quản lý phụ trách
              </p>
              <p className="font-semibold text-slate-900 text-sm">
                {request.assignedManagerName ?? <span className="text-slate-400 italic">Chưa phân công</span>}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Người báo cáo
              </p>
              <p className="font-semibold text-slate-900 text-sm">{request.reportedBy}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Thời gian
              </p>
              <p className="text-sm text-slate-900">Báo cáo: <strong>{request.reportedAt}</strong></p>
              {request.resolvedAt && (
                <p className="text-xs text-emerald-700 mt-0.5">Hoàn thành: <strong>{request.resolvedAt}</strong></p>
              )}
            </div>
          </div>

          {/* Chi phí */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Theo dõi chi phí
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-4 border ${request.estimatedCost !== undefined ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-xs font-medium text-slate-500 mb-1">Chi phí ước tính</p>
                <p className={`text-lg font-bold ${request.estimatedCost !== undefined ? 'text-amber-700' : 'text-slate-400'}`}>
                  {request.estimatedCost !== undefined ? formatCurrency(request.estimatedCost) : 'Chưa có'}
                </p>
              </div>
              <div className={`rounded-xl p-4 border ${request.actualCost !== undefined ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-xs font-medium text-slate-500 mb-1">Chi phí thực tế</p>
                <p className={`text-lg font-bold ${request.actualCost !== undefined ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {request.actualCost !== undefined ? formatCurrency(request.actualCost) : 'Chưa có'}
                </p>
              </div>
            </div>
          </div>

          {/* Tiến trình / SLA */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Tiến trình SLA
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-500">Đã mở: <strong className={overdue ? 'text-rose-600' : 'text-slate-900'}>{days} ngày</strong></span>
                <span className="text-slate-500">SLA: <strong>{sla} ngày</strong></span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${overdue ? 'bg-rose-500' : days / sla > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (days / sla) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {request.status === 'resolved'
                  ? `Đã hoàn thành bởi ${request.assignedManagerName ?? 'quản lý'}`
                  : overdue
                  ? `Vượt SLA ${days - sla} ngày — cần đôn đốc quản lý vận hành xử lý ngay`
                  : `Còn ${Math.max(0, sla - days)} ngày trong hạn SLA`
                }
              </p>
            </div>
          </div>

          {/* Ghi chú vai trò */}
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <strong>Vai trò Host:</strong> Bạn đang xem dưới góc độ giám sát.
              Việc xử lý, cập nhật trạng thái và hoàn thành yêu cầu thuộc về <strong>Quản lý vận hành</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Component chính ───────────────────────────────────────────────────────────
export const MaintenanceList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterManager, setFilterManager] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);

  const requests = MOCK_MAINTENANCE_REQUESTS;
  const managers = MOCK_USERS.filter(u => u.role === 'manager');

  const openCount       = requests.filter(r => r.status === 'open').length;
  const inProgressCount = requests.filter(r => r.status === 'in_progress').length;
  const resolvedCount   = requests.filter(r => r.status === 'resolved').length;
  const overdueCount    = requests.filter(r => isOverdue(r)).length;

  const totalEstimated = requests
    .filter(r => r.estimatedCost !== undefined)
    .reduce((s, r) => s + (r.estimatedCost ?? 0), 0);

  const totalActual = requests
    .filter(r => r.actualCost !== undefined)
    .reduce((s, r) => s + (r.actualCost ?? 0), 0);

  const filtered = requests.filter(r => {
    const matchSearch =
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.propertyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.assignedManagerName ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchProperty = filterProperty === 'all' || r.propertyId === filterProperty;
    const matchManager  = filterManager  === 'all' || r.assignedManagerId === filterManager;
    const matchPriority = filterPriority === 'all' || r.priority === filterPriority;
    const matchStatus   = filterStatus   === 'all' || r.status === filterStatus;
    return matchSearch && matchProperty && matchManager && matchPriority && matchStatus;
  });

  // Sắp xếp: critical/overdue trước, rồi theo mức độ ưu tiên
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...filtered].sort((a, b) => {
    const aOv = isOverdue(a) ? -1 : 0;
    const bOv = isOverdue(b) ? -1 : 0;
    if (aOv !== bOv) return aOv - bOv;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return (
    <div className="space-y-6">

      {/* ── Tiêu đề trang ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-primary-600 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Giám sát bảo trì</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">
            Theo dõi tình trạng xử lý bảo trì trên toàn bộ bất động sản Hoàng Bình Land
          </p>
        </div>

        {/* Badge vai trò Host */}
        <div className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-xl flex-shrink-0">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-800 leading-tight">Chế độ giám sát</p>
            <p className="text-[10px] text-blue-600 leading-tight">Host chỉ xem — Quản lý vận hành xử lý</p>
          </div>
        </div>
      </div>

      {/* ── KPI tổng quan ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Chờ xử lý',
            value: openCount,
            icon: AlertTriangle,
            bg: 'bg-rose-50', iconColor: 'text-rose-600',
            border: 'border-l-rose-500', text: 'text-rose-700',
            sub: `${requests.filter(r => r.status === 'open' && r.priority === 'critical').length} khẩn cấp`,
          },
          {
            label: 'Đang xử lý',
            value: inProgressCount,
            icon: Clock,
            bg: 'bg-blue-50', iconColor: 'text-blue-600',
            border: 'border-l-blue-500', text: 'text-blue-700',
            sub: 'Quản lý đang tiến hành',
          },
          {
            label: 'Đã hoàn thành',
            value: resolvedCount,
            icon: CheckCircle,
            bg: 'bg-emerald-50', iconColor: 'text-emerald-600',
            border: 'border-l-emerald-500', text: 'text-emerald-700',
            sub: totalActual > 0 ? `Chi phí: ${(totalActual / 1_000_000).toFixed(1)}M₫` : 'Trong tháng này',
          },
          {
            label: 'Vượt SLA',
            value: overdueCount,
            icon: ShieldAlert,
            bg: 'bg-rose-50', iconColor: 'text-rose-600',
            border: overdueCount > 0 ? 'border-l-rose-600' : 'border-l-slate-300',
            text: overdueCount > 0 ? 'text-rose-700' : 'text-slate-500',
            sub: overdueCount > 0 ? 'Cần đôn đốc xử lý ngay' : 'Trong hạn SLA',
          },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${s.border} p-5 hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</p>
                <p className="text-[11px] text-slate-400 mt-1">{s.sub}</p>
              </div>
              <div className={`${s.bg} p-3 rounded-xl`}>
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tổng quan chi phí ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl">
            <DollarSign className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng chi phí ước tính</p>
            <p className="text-xl font-bold text-amber-700 mt-0.5">{formatCurrency(totalEstimated)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Trên {requests.filter(r => r.estimatedCost !== undefined).length} yêu cầu</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chi phí thực tế đã phát sinh</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{totalActual > 0 ? formatCurrency(totalActual) : '—'}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {resolvedCount > 0 ? `Từ ${resolvedCount} yêu cầu đã hoàn thành` : 'Chưa có yêu cầu hoàn thành'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bộ lọc ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã, tiêu đề, nhà, quản lý..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <select
              value={filterProperty}
              onChange={e => setFilterProperty(e.target.value)}
              className="input-field text-sm min-w-[140px]"
            >
              <option value="all">Tất cả nhà</option>
              {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={filterManager}
              onChange={e => setFilterManager(e.target.value)}
              className="input-field text-sm min-w-[160px]"
            >
              <option value="all">Tất cả quản lý</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="input-field text-sm min-w-[130px]"
            >
              <option value="all">Tất cả mức độ</option>
              <option value="critical">Khẩn cấp</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input-field text-sm min-w-[150px]"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="open">Chờ xử lý</option>
              <option value="in_progress">Đang xử lý</option>
              <option value="resolved">Đã hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>
        </div>

        {/* Kết quả lọc */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Hiển thị <strong className="text-slate-800">{sorted.length}</strong> / {requests.length} yêu cầu
            {overdueCount > 0 && (
              <span className="ml-2 text-rose-600 font-semibold">· {overdueCount} vượt SLA</span>
            )}
          </p>
          {(filterProperty !== 'all' || filterManager !== 'all' || filterPriority !== 'all' || filterStatus !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setFilterProperty('all');
                setFilterManager('all');
                setFilterPriority('all');
                setFilterStatus('all');
                setSearchTerm('');
              }}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* ── Bảng giám sát ── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200 text-xs tracking-wide">
              <tr>
                <th className="px-5 py-3.5">Yêu cầu bảo trì</th>
                <th className="px-5 py-3.5">Vị trí</th>
                <th className="px-5 py-3.5">Mức độ</th>
                <th className="px-5 py-3.5">Trạng thái</th>
                <th className="px-5 py-3.5">Quản lý phụ trách</th>
                <th className="px-5 py-3.5">Ngày mở / SLA</th>
                <th className="px-5 py-3.5 text-right">Chi phí ước tính</th>
                <th className="px-5 py-3.5 text-center">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map(req => {
                const pBadge = maintenancePriorityMap[req.priority];
                const sBadge = maintenanceStatusMap[req.status];
                const days   = daysSince(req.reportedAt);
                const over   = isOverdue(req);
                const sla    = SLAThreshold[req.priority];

                return (
                  <tr
                    key={req.id}
                    className={`transition-colors hover:bg-slate-50/80 cursor-pointer ${over ? 'bg-rose-50/20' : ''}`}
                    onClick={() => setSelectedRequest(req)}
                  >
                    {/* Yêu cầu */}
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        {over && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-slate-400">{req.code}</p>
                          <p className="font-semibold text-slate-900 mt-0.5 leading-snug line-clamp-2 max-w-[220px]">{req.title}</p>
                        </div>
                      </div>
                    </td>

                    {/* Vị trí */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-slate-900 text-xs">{req.propertyName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {req.roomCode ? `Phòng ${req.roomCode}` : 'Khu vực chung'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Mức độ */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${pBadge.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`} />{pBadge.label}
                      </span>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${sBadge.color}`}>
                        {sBadge.label}
                      </span>
                    </td>

                    {/* Quản lý */}
                    <td className="px-5 py-4">
                      {req.assignedManagerName ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-[10px] font-bold flex-shrink-0">
                            {req.assignedManagerName.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-slate-900">{req.assignedManagerName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Chưa phân công</span>
                      )}
                    </td>

                    {/* Ngày mở / SLA */}
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{req.reportedAt}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-16 bg-slate-200 rounded-full h-1.5 flex-shrink-0">
                            <div
                              className={`h-1.5 rounded-full ${over ? 'bg-rose-500' : days / sla > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, (days / sla) * 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-semibold ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                            {over ? `+${days - sla}N` : `${days}/${sla}N`}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Chi phí */}
                    <td className="px-5 py-4 text-right">
                      {req.estimatedCost !== undefined ? (
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{formatCurrency(req.estimatedCost)}</p>
                          {req.actualCost !== undefined && (
                            <p className="text-[10px] text-emerald-600 mt-0.5">
                              Thực tế: {formatCurrency(req.actualCost)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-xs">—</p>
                      )}
                    </td>

                    {/* Xem chi tiết */}
                    <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                        title="Xem chi tiết giám sát"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Xem
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
                        <Wrench className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">Không tìm thấy yêu cầu bảo trì nào</p>
                      <p className="text-xs text-slate-400">Thử điều chỉnh bộ lọc để xem kết quả khác</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal chi tiết ── */}
      {selectedRequest && (
        <DetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}
    </div>
  );
};
