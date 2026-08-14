import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, UserCog, Building2, Users, Wrench, RefreshCw, Phone, CheckCircle2,
  DoorOpen, TrendingUp, MapPin, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { groupByZone } from '@/pages/zones/zoneAssignmentState';
import { AssignmentHistoryButton } from '@/components/AssignmentHistoryPanel';
import { propertyService } from '@/services/property.service';
import { userService } from '@/services/user.service';
import { hostService, type HostContractDto, type PropertyPerformanceRow } from '@/services/host.service';
import type { PropertyResponse, UserResponse } from '@/types/api.types';
import { formatCurrency } from '@/utils';
import { currentMonthIso } from '@/utils/serverTime';

type ManagerItem = { id: string; fullName: string; username: string };

const MONTH = currentMonthIso(); // YYYY-MM

const statusCls: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:   { label: 'Hoạt động',       color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Ngừng hoạt động', color: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
  DISABLE:  { label: 'Đã vô hiệu',      color: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  PENDING:  { label: 'Chờ duyệt',       color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
};

function StatCard({ icon: Icon, label, value, tone }: {
  icon: typeof Users; label: string; value: string | number;
  tone: 'indigo' | 'emerald' | 'blue' | 'amber';
}) {
  const tones = {
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue:    'bg-blue-50 text-blue-600',
    amber:   'bg-amber-50 text-amber-600',
  };
  return (
    <div className="card flex items-center gap-3.5 p-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

// Chip chỉ số gọn nằm trên dòng quản lý (thu gọn).
function KpiChip({ icon: Icon, value, label, tone }: {
  icon: typeof Users; value: string | number; label: string;
  tone: 'indigo' | 'blue' | 'emerald' | 'amber';
}) {
  const tones = {
    indigo:  'text-indigo-600',
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
  };
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon className={`h-4 w-4 ${tones[tone]}`} />
      <span className="text-sm font-bold text-slate-800">{value}</span>
      <span className="hidden text-xs text-slate-400 sm:inline">{label}</span>
    </div>
  );
}

export const ManagerList = () => {
  const [managers, setManagers]     = useState<ManagerItem[]>([]);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [contracts, setContracts]   = useState<HostContractDto[]>([]);
  const [perf, setPerf]             = useState<PropertyPerformanceRow[]>([]);
  const [userMap, setUserMap]       = useState<Map<string, UserResponse>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [openId, setOpenId]         = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mgrs, propsRes, contractPage, perfRows] = await Promise.all([
        propertyService.getManagers(),
        propertyService.getProperties(0, 100),
        hostService.listContracts({ size: 500 }).then(p => p.content).catch(() => [] as HostContractDto[]),
        hostService.getPropertyPerformance(MONTH).catch(() => [] as PropertyPerformanceRow[]),
      ]);
      setManagers(mgrs);
      setProperties(propsRes.content);
      setContracts(contractPage);
      setPerf(perfRows);

      // Thử lấy phone/status — host có thể không có quyền, bỏ qua nếu lỗi
      try {
        const users = await userService.getAllUsers();
        const map = new Map<string, UserResponse>();
        users.filter(u => u.role === 'ROLE_MANAGER').forEach(u => map.set(u.id, u));
        setUserMap(map);
      } catch { /* ignore */ }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // propertyId -> số liệu vận hành tháng này (lấp đầy, doanh thu, bảo trì).
  const perfByProp = useMemo(() => {
    const m = new Map<number, PropertyPerformanceRow>();
    perf.forEach(r => m.set(Number(r.propertyId), r));
    return m;
  }, [perf]);

  // Khách thuê đang ở (HĐ ACTIVE) theo từng bất động sản, khớp qua propertyId/tên.
  const tenantsByProp = useMemo(() => {
    const m = new Map<number, number>();
    contracts.forEach(c => {
      if (c.status !== 'ACTIVE') return;
      const pid = c.propertyId ?? properties.find(p => p.propertyName === c.propertyName)?.id;
      if (pid != null) m.set(pid, (m.get(pid) ?? 0) + 1);
    });
    return m;
  }, [contracts, properties]);

  const filtered = managers.filter(m => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    const phone = userMap.get(m.id)?.phoneNumber;
    return (
      (m.fullName || m.username).toLowerCase().includes(kw) ||
      phone?.includes(kw) ||
      m.username.toLowerCase().includes(kw)
    );
  });

  const getAssignedProps = (mgId: string) =>
    properties.filter(p => p.operationManagerId === mgId);

  // Lấp đầy theo "đơn vị cho thuê": nhà nguyên căn = 1 đơn vị (đã thuê/còn trống),
  // nhà chia phòng = số phòng. Nhờ vậy nhà nguyên căn có khách vẫn hiện 100%.
  const propOccupancy = (p: PropertyResponse) => {
    const r        = perfByProp.get(p.id);
    const tenants  = tenantsByProp.get(p.id) ?? 0;
    const isWhole  = p.wholeHouse === true || (r?.totalRooms ?? p.totalRooms ?? 0) === 0;
    if (isWhole) {
      const rented = tenants > 0 || (r?.occupiedRooms ?? 0) > 0;
      return { isWhole: true, units: 1, occupied: rented ? 1 : 0, rate: rented ? 100 : 0 };
    }
    const units    = r?.totalRooms ?? p.totalRooms ?? 0;
    const occupied = r?.occupiedRooms ?? 0;
    return { isWhole: false, units, occupied, rate: units > 0 ? Math.round((occupied / units) * 100) : 0 };
  };

  // Gom toàn bộ số liệu của một quản lý từ danh sách nhà phụ trách.
  const summarize = (assigned: PropertyResponse[]) => {
    let units = 0, occupied = 0, tenants = 0, openMaint = 0, revenue = 0;
    assigned.forEach(p => {
      const r   = perfByProp.get(p.id);
      const occ = propOccupancy(p);
      units     += occ.units;
      occupied  += occ.occupied;
      tenants   += tenantsByProp.get(p.id) ?? 0;
      openMaint += r?.openMaintenance ?? 0;
      revenue   += r?.monthlyRevenue ?? 0;
    });
    const occRate = units > 0 ? Math.round((occupied / units) * 100) : 0;
    return { rooms: units, occupied, tenants, openMaint, revenue, occRate };
  };

  // Tổng hợp cho thẻ thống kê đầu trang
  const activeManagers = managers.filter(m => (userMap.get(m.id)?.status ?? 'ACTIVE') === 'ACTIVE').length;
  const totalTenants   = [...tenantsByProp.values()].reduce((a, b) => a + b, 0);
  const totalOpenMaint = perf.reduce((a, r) => a + (r.openMaintenance ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý vận hành</h1>
          <p className="text-sm text-slate-500 mt-1">
            {managers.length} quản lý vận hành đang giám sát các bất động sản Hoàng Bình Land
          </p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm self-start">
          <RefreshCw className="w-4 h-4" /> Làm mới
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={UserCog} label="Tổng quản lý" value={managers.length} tone="indigo" />
        <StatCard icon={CheckCircle2} label="Đang hoạt động" value={activeManagers} tone="emerald" />
        <StatCard icon={Users} label="Khách thuê đang ở" value={totalTenants} tone="blue" />
        <StatCard icon={Wrench} label="Bảo trì chờ xử lý" value={totalOpenMaint} tone="amber" />
      </div>

      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" placeholder="Tìm theo tên hoặc số điện thoại..."
          value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" />
      </div>

      {/* Danh sách quản lý — dòng gọn, bấm để mở chi tiết */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 mb-3" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-500">
          <UserCog className="w-12 h-12 text-slate-300 mb-3" />
          {search ? `Không tìm thấy kết quả cho "${search}"` : 'Chưa có quản lý nào.'}
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden p-0">
          {filtered.map(mgr => {
            const user          = userMap.get(mgr.id);
            const assignedProps = getAssignedProps(mgr.id);
            const displayName   = mgr.fullName || mgr.username;
            const statusKey     = user?.status ?? 'ACTIVE';
            const st            = statusCls[statusKey] ?? statusCls.ACTIVE;
            const phone         = user?.phoneNumber;
            const s             = summarize(assignedProps);
            // Đơn vị phân công là KHU VỰC, nhà chỉ là nội dung bên trong — gom lại để
            // màn này nói cùng ngôn ngữ với màn Khu vực & Quản lý.
            const zones         = groupByZone(assignedProps);
            const isOpen        = openId === mgr.id;

            return (
              <div key={mgr.id}>
                {/* Dòng quản lý (thu gọn) */}
                <button
                  onClick={() => setOpenId(isOpen ? null : mgr.id)}
                  className={`flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`}
                >
                  {/* Hồ sơ */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${st.dot}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                      <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-400">
                        <span>@{mgr.username}</span>
                        {phone && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{phone}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* KPI gọn */}
                  <div className="hidden items-center gap-5 md:flex">
                    <KpiChip icon={MapPin}     value={zones.length}         label="khu vực" tone="indigo" />
                    <KpiChip icon={Building2}  value={assignedProps.length} label="nhà"    tone="indigo" />
                    <KpiChip icon={Users}      value={s.tenants}            label="khách"  tone="blue" />
                    <KpiChip icon={TrendingUp} value={`${s.occRate}%`}      label="lấp đầy" tone="emerald" />
                    <KpiChip icon={Wrench}     value={s.openMaint}          label="bảo trì" tone="amber" />
                  </div>

                  {/* Số nhà (mobile) + mũi tên */}
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 md:hidden">
                      {assignedProps.length} nhà
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Chi tiết (mở rộng) */}
                {isOpen && (
                  <div className="bg-slate-50/60 px-4 pb-4 pt-3">
                    {/* Lịch sử phân công — để trên đầu, mở ra cửa sổ riêng */}
                    <div className="mb-3">
                      <AssignmentHistoryButton
                        subjectName={displayName}
                        extraNote="Lưu ý khi đánh giá: người vừa nhận khu vực vài ngày vẫn bị chấm doanh thu cả tháng."
                      />
                    </div>

                    {/* Tổng quan + doanh thu */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5 ring-1 ring-slate-100">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 md:hidden">
                        <DoorOpen className="h-3.5 w-3.5" /> {s.occupied}/{s.rooms} phòng · {s.tenants} khách · {s.openMaint} bảo trì
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        Doanh thu tháng {MONTH.slice(5)}/{MONTH.slice(0, 4)}
                      </span>
                      <span className="text-sm font-bold text-emerald-600">{formatCurrency(s.revenue)}</span>
                    </div>

                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Khu vực phụ trách ({zones.length})
                      </p>
                      <Link to="/host/zones" className="text-xs font-bold text-indigo-600 hover:underline">
                        Đổi phân công →
                      </Link>
                    </div>

                    {zones.length > 0 ? (
                      <div className="space-y-3">
                        {zones.map(z => (
                          <div key={z.zoneId}>
                            {/* Đầu mục khu vực — đơn vị phân công thật sự, nhà chỉ là nội dung bên trong */}
                            <div className="mb-1.5 flex flex-wrap items-center gap-2 px-1">
                              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                                {z.zoneName}
                              </p>
                              <span className="text-xs font-medium text-slate-400">
                                {z.properties.length} nhà · {z.units} đơn vị
                              </span>
                            </div>

                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                              {z.properties.map(p => {
                          const r        = perfByProp.get(p.id);
                          const occ      = propOccupancy(p);
                          const occRate  = occ.rate;
                          const open     = r?.openMaintenance ?? 0;
                          return (
                            <div key={p.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                                    {p.propertyName}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {p.shortAddress || p.fullAddress || '—'}
                                  </p>
                                </div>
                                {open > 0 && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">
                                    <AlertTriangle className="h-3 w-3" />{open}
                                  </span>
                                )}
                              </div>

                              {/* Thanh lấp đầy phòng */}
                              <div className="mt-2.5 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={`h-full rounded-full ${occRate >= 80 ? 'bg-emerald-500' : occRate >= 50 ? 'bg-amber-500' : 'bg-rose-400'}`}
                                    style={{ width: `${occRate}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-xs font-medium text-slate-500">
                                  {occ.isWhole
                                    ? (occ.occupied ? 'Đã cho thuê' : 'Còn trống')
                                    : `${occ.occupied}/${occ.units} · ${occRate}%`}
                                </span>
                              </div>

                              {r && r.monthlyRevenue > 0 && (
                                <p className="mt-1.5 text-xs text-slate-400">
                                  Doanh thu: <span className="font-semibold text-slate-600">{formatCurrency(r.monthlyRevenue)}</span>
                                </p>
                              )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
                        <MapPin className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
                        <p className="text-xs italic text-slate-400">
                          Chưa phụ trách khu vực nào — gán tại màn Khu vực &amp; Quản lý.
                        </p>
                      </div>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
