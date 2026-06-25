import { useEffect, useMemo, useState } from 'react';
import {
  Search, Wrench, CheckCircle, Clock, AlertTriangle,
  DollarSign, Eye, X, Calendar, User, Building2,
  FileText, Info, MapPin, Loader2, Package,
} from 'lucide-react';
import { maintenanceService } from '../../services/maintenance.service';
import { propertyService } from '../../services/property.service';
import { equipmentService } from '../../services/equipment.service';
import type {
  MaintenanceRequestResponse,
  MaintenanceDashboardResponse,
  EquipmentMaintenanceHistoryResponse,
  PropertyResponse,
} from '../../types/api.types';
import {
  formatCurrency,
  maintenanceReqPriorityMap,
  maintenanceReqStatusMap,
  maintenanceCategoryMap,
  normalizeMaintenanceStatus,
} from '../../utils';

const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ── Modal chi tiết ────────────────────────────────────────────────────────────
const DetailModal = ({ request, onClose }: { request: MaintenanceRequestResponse; onClose: () => void }) => {
  const status = normalizeMaintenanceStatus(request.status);
  const pBadge = maintenanceReqPriorityMap[request.priority] ?? maintenanceReqPriorityMap.LOW;
  const sBadge = maintenanceReqStatusMap[status];
  const [history, setHistory] = useState<EquipmentMaintenanceHistoryResponse[]>([]);

  useEffect(() => {
    if (!request.equipmentId) return;
    equipmentService.getMaintenanceHistory(request.equipmentId)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [request.equipmentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{request.requestCode}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${pBadge.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`} />{pBadge.label}
              </span>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${sBadge.color}`}>
                {sBadge.label}
              </span>
              <span className="text-xs text-slate-500">{maintenanceCategoryMap[request.category] ?? request.category}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug">
              {request.equipmentName ?? request.roomName}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mô tả */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mô tả sự cố</p>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
              {request.description}
            </p>
          </div>

          {/* Ảnh */}
          {request.images?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hình ảnh</p>
              <div className="flex gap-2 flex-wrap">
                {request.images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`img-${i}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Thông tin chính */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Vị trí
              </p>
              <p className="font-semibold text-slate-900 text-sm">{request.propertyName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{request.roomName}</p>
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
              <p className="font-semibold text-slate-900 text-sm">{request.tenantName}</p>
              {request.tenantPhone && <p className="text-xs text-slate-500 mt-0.5">{request.tenantPhone}</p>}
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Thời gian
              </p>
              <p className="text-sm text-slate-900">Tạo: <strong>{fmtDate(request.createdAt)}</strong></p>
              {request.scheduledDate && <p className="text-xs text-slate-500 mt-0.5">Hẹn: {fmtDate(request.scheduledDate)}</p>}
              {request.resolvedAt && <p className="text-xs text-emerald-700 mt-0.5">Xong: {fmtDate(request.resolvedAt)}</p>}
            </div>
          </div>

          {/* Chi phí + ghi chú xử lý */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Chi phí sửa chữa
              </p>
              <p className="text-lg font-bold text-emerald-700">
                {request.repairCost != null ? formatCurrency(request.repairCost) : 'Chưa có'}
              </p>
            </div>
            {request.costPaidBy && (
              <p className="text-xs text-emerald-800 mt-1.5">
                Bên chi trả:{' '}
                <strong>{request.costPaidBy === 'HOST' ? '🏠 Chủ nhà (tính vào chi phí)' : '👤 Khách thuê'}</strong>
              </p>
            )}
            {request.resolutionNote && (
              <p className="text-sm text-emerald-900 mt-2 leading-relaxed">{request.resolutionNote}</p>
            )}
          </div>

          {/* Timeline */}
          {request.timeline?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Diễn biến xử lý</p>
              <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                {request.timeline.map((t, i) => {
                  const ns = maintenanceReqStatusMap[normalizeMaintenanceStatus(t.newStatus)];
                  return (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ns.color}`}>{ns.label}</span>
                        <span className="text-[11px] text-slate-400">{fmtDate(t.changedAt)}</span>
                      </div>
                      {t.note && <p className="text-xs text-slate-600 mt-0.5">{t.note}</p>}
                      {t.changedByName && <p className="text-[10px] text-slate-400 mt-0.5">bởi {t.changedByName}</p>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Lịch sử bảo trì thiết bị */}
          {request.equipmentId && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Lịch sử bảo trì thiết bị: {request.equipmentName}
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Chưa có lịch sử trước đó.</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <span className="text-slate-600">{fmtDate(h.maintenanceDate)} · <span className="font-mono">{h.requestCode}</span> {h.note ? `· ${h.note}` : ''}</span>
                      <span className="font-semibold text-slate-800">{h.repairCost != null ? formatCurrency(h.repairCost) : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ghi chú vai trò */}
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              <strong>Chế độ giám sát:</strong> tiếp nhận, xử lý và hoàn tất yêu cầu được thực hiện bởi
              <strong> Quản lý vận hành</strong> trên ứng dụng mobile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Component chính ───────────────────────────────────────────────────────────
export const MaintenanceList = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<MaintenanceRequestResponse[]>([]);
  const [dashboard, setDashboard] = useState<MaintenanceDashboardResponse | null>(null);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [selected, setSelected] = useState<MaintenanceRequestResponse | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      maintenanceService.getRequests({}, 0, 200).catch(() => ({ content: [] as MaintenanceRequestResponse[] })),
      maintenanceService.getDashboard().catch(() => null),
      propertyService.getProperties(0, 200).catch(() => ({ content: [] as PropertyResponse[] })),
    ]).then(([reqPage, dash, propPage]) => {
      if (cancelled) return;
      setRequests((reqPage as { content: MaintenanceRequestResponse[] }).content ?? []);
      setDashboard(dash as MaintenanceDashboardResponse | null);
      setProperties((propPage as { content: PropertyResponse[] }).content ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    if (dashboard) return dashboard;
    // fallback: tính từ list nếu BE chưa có dashboard endpoint
    const norm = (r: MaintenanceRequestResponse) => normalizeMaintenanceStatus(r.status);
    return {
      total: requests.length,
      pending: requests.filter(r => norm(r) === 'PENDING').length,
      inProgress: requests.filter(r => norm(r) === 'IN_PROGRESS').length,
      resolved: requests.filter(r => norm(r) === 'RESOLVED').length,
      cancelled: requests.filter(r => norm(r) === 'CANCELLED').length,
      totalRepairCost: requests.reduce((s, r) => s + (r.repairCost ?? 0), 0),
    } as MaintenanceDashboardResponse;
  }, [dashboard, requests]);

  const filtered = useMemo(() => requests.filter(r => {
    const kw = searchTerm.toLowerCase();
    const matchSearch = !kw ||
      r.requestCode.toLowerCase().includes(kw) ||
      r.description.toLowerCase().includes(kw) ||
      r.propertyName.toLowerCase().includes(kw) ||
      (r.tenantName ?? '').toLowerCase().includes(kw);
    const matchProperty = filterProperty === 'all' || String(r.propertyId) === filterProperty;
    const matchPriority = filterPriority === 'all' || r.priority === filterPriority;
    const matchStatus = filterStatus === 'all' || normalizeMaintenanceStatus(r.status) === filterStatus;
    const matchCategory = filterCategory === 'all' || r.category === filterCategory;
    return matchSearch && matchProperty && matchPriority && matchStatus && matchCategory;
  }), [requests, searchTerm, filterProperty, filterPriority, filterStatus, filterCategory]);

  const hasFilters = filterProperty !== 'all' || filterPriority !== 'all' || filterStatus !== 'all' || filterCategory !== 'all' || searchTerm;

  const kpis = [
    { label: 'Chờ xử lý', value: stats.pending, icon: AlertTriangle, bg: 'bg-rose-50', iconColor: 'text-rose-600', border: 'border-l-rose-500', text: 'text-rose-700' },
    { label: 'Đang xử lý', value: stats.inProgress, icon: Clock, bg: 'bg-blue-50', iconColor: 'text-blue-600', border: 'border-l-blue-500', text: 'text-blue-700' },
    { label: 'Đã hoàn thành', value: stats.resolved, icon: CheckCircle, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', border: 'border-l-emerald-500', text: 'text-emerald-700' },
    { label: 'Đã hủy', value: stats.cancelled, icon: X, bg: 'bg-slate-50', iconColor: 'text-slate-500', border: 'border-l-slate-300', text: 'text-slate-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-primary-600 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Giám sát bảo trì</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">Theo dõi yêu cầu bảo trì & chi phí sửa chữa trên toàn bộ bất động sản</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-xl flex-shrink-0">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-800 leading-tight">Chế độ giám sát</p>
            <p className="text-[10px] text-blue-600 leading-tight">Chỉ xem — Quản lý vận hành xử lý</p>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(s => (
          <div key={s.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${s.border} p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</p>
              </div>
              <div className={`${s.bg} p-3 rounded-xl`}><s.icon className={`w-5 h-5 ${s.iconColor}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Tổng chi phí */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
        <div className="p-3 bg-emerald-50 rounded-xl"><DollarSign className="w-5 h-5 text-emerald-600" /></div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng chi phí sửa chữa</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">{formatCurrency(stats.totalRepairCost)}</p>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Tìm theo mã, mô tả, nhà, người báo..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} className="input-field pl-9 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} className="input-field text-sm min-w-[140px]">
              <option value="all">Tất cả nhà</option>
              {properties.map(p => <option key={p.id} value={String(p.id)}>{p.propertyName}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field text-sm min-w-[130px]">
              <option value="all">Tất cả loại</option>
              {Object.entries(maintenanceCategoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input-field text-sm min-w-[130px]">
              <option value="all">Tất cả mức độ</option>
              {Object.entries(maintenanceReqPriorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm min-w-[150px]">
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(maintenanceReqStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">Hiển thị <strong className="text-slate-800">{filtered.length}</strong> / {requests.length} yêu cầu</p>
          {hasFilters && (
            <button onClick={() => { setFilterProperty('all'); setFilterPriority('all'); setFilterStatus('all'); setFilterCategory('all'); setSearchTerm(''); }}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold">Xóa bộ lọc</button>
          )}
        </div>
      </div>

      {/* Bảng */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200 text-xs tracking-wide">
              <tr>
                <th className="px-5 py-3.5">Yêu cầu</th>
                <th className="px-5 py-3.5">Vị trí</th>
                <th className="px-5 py-3.5">Loại</th>
                <th className="px-5 py-3.5">Mức độ</th>
                <th className="px-5 py-3.5">Trạng thái</th>
                <th className="px-5 py-3.5">Người báo</th>
                <th className="px-5 py-3.5">Ngày tạo</th>
                <th className="px-5 py-3.5 text-right">Chi phí</th>
                <th className="px-5 py-3.5 text-center">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="px-6 py-16 text-center">
                  <Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && filtered.map(req => {
                const status = normalizeMaintenanceStatus(req.status);
                const pBadge = maintenanceReqPriorityMap[req.priority] ?? maintenanceReqPriorityMap.LOW;
                const sBadge = maintenanceReqStatusMap[status];
                return (
                  <tr key={req.id} className="transition-colors hover:bg-slate-50/80 cursor-pointer" onClick={() => setSelected(req)}>
                    <td className="px-5 py-4">
                      <p className="font-mono text-[10px] text-slate-400">{req.requestCode}</p>
                      <p className="font-semibold text-slate-900 mt-0.5 leading-snug line-clamp-2 max-w-[220px]">
                        {req.equipmentName ?? req.description}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-slate-900 text-xs">{req.propertyName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{req.roomName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">{maintenanceCategoryMap[req.category] ?? req.category}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${pBadge.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pBadge.dot}`} />{pBadge.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${sBadge.color}`}>{sBadge.label}</span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-700">{req.tenantName}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">{fmtDate(req.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      {req.repairCost != null
                        ? <p className="font-semibold text-slate-900 text-sm">{formatCurrency(req.repairCost)}</p>
                        : <p className="text-slate-400 text-xs">—</p>}
                    </td>
                    <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setSelected(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Xem
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
                      <Wrench className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Không có yêu cầu bảo trì nào</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <DetailModal request={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};
