import { useState, useEffect, useMemo } from 'react';
import { Search, UserCog, Building2, Users, Wrench, RefreshCw, Phone, CheckCircle2 } from 'lucide-react';
import { propertyService } from '../../services/property.service';
import { userService } from '../../services/user.service';
import { hostService, type HostContractDto, type PropertyPerformanceRow } from '../../services/host.service';
import type { PropertyResponse, UserResponse } from '../../types/api.types';

type ManagerItem = { id: string; fullName: string; username: string };

const MONTH = new Date().toISOString().slice(0, 7); // YYYY-MM

const statusCls: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:   { label: 'Hoạt động',       color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Ngừng hoạt động', color: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
  DISABLE:  { label: 'Đã vô hiệu',      color: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  PENDING:  { label: 'Chờ duyệt',       color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
};

function StatCard({ icon: Icon, label, value, tone }: {
  icon: typeof Users; label: string; value: number;
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

export const ManagerList = () => {
  const [managers, setManagers]     = useState<ManagerItem[]>([]);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [contracts, setContracts]   = useState<HostContractDto[]>([]);
  const [perf, setPerf]             = useState<PropertyPerformanceRow[]>([]);
  const [userMap, setUserMap]       = useState<Map<string, UserResponse>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');

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

  // propertyId -> operationManagerId (để quy số liệu về đúng quản lý).
  const propToMgr = useMemo(() => {
    const m = new Map<number, string>();
    properties.forEach(p => { if (p.operationManagerId) m.set(p.id, p.operationManagerId); });
    return m;
  }, [properties]);

  // Khách thuê đang ở (HĐ ACTIVE) theo từng quản lý — tính trực tiếp từ contracts,
  // khớp BĐS qua operationManagerId (giống cột "Nhà phụ trách"). Không dùng
  // manager-performance vì BE đếm theo zone, lệch với cách gán nhà ở đây.
  const tenantsByMgr = useMemo(() => {
    const m = new Map<string, number>();
    contracts.forEach(c => {
      if (c.status !== 'ACTIVE') return;
      const pid = c.propertyId ?? properties.find(p => p.propertyName === c.propertyName)?.id;
      const mgrId = pid != null ? propToMgr.get(pid) : undefined;
      if (mgrId) m.set(mgrId, (m.get(mgrId) ?? 0) + 1);
    });
    return m;
  }, [contracts, properties, propToMgr]);

  // Bảo trì chờ xử lý theo từng quản lý — từ property-performance (theo propertyId).
  const maintByMgr = useMemo(() => {
    const m = new Map<string, number>();
    perf.forEach(r => {
      const mgrId = propToMgr.get(Number(r.propertyId));
      if (mgrId) m.set(mgrId, (m.get(mgrId) ?? 0) + (r.openMaintenance ?? 0));
    });
    return m;
  }, [perf, propToMgr]);

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

  // Tổng hợp cho thẻ thống kê
  const activeManagers = managers.filter(m => (userMap.get(m.id)?.status ?? 'ACTIVE') === 'ACTIVE').length;
  const totalTenants   = [...tenantsByMgr.values()].reduce((a, b) => a + b, 0);
  const totalOpenMaint = [...maintByMgr.values()].reduce((a, b) => a + b, 0);

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

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 text-xs">
              <tr>
                <th className="px-6 py-4">Quản lý</th>
                <th className="px-6 py-4">Liên hệ</th>
                <th className="px-6 py-4">Nhà phụ trách</th>
                <th className="px-6 py-4 text-center">Khách thuê</th>
                <th className="px-6 py-4 text-center">Bảo trì chờ xử lý</th>
                <th className="px-6 py-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 mb-3" />
                    <p className="text-sm text-slate-400">Đang tải...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <UserCog className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    {search ? `Không tìm thấy kết quả cho "${search}"` : 'Chưa có quản lý nào.'}
                  </td>
                </tr>
              ) : filtered.map(mgr => {
                const user        = userMap.get(mgr.id);
                const assignedProps = getAssignedProps(mgr.id);
                const displayName = mgr.fullName || mgr.username;
                const statusKey   = user?.status ?? 'ACTIVE';
                const st          = statusCls[statusKey] ?? statusCls.ACTIVE;
                const phone       = user?.phoneNumber;
                const tenants     = tenantsByMgr.get(mgr.id) ?? 0;
                const openMaint   = maintByMgr.get(mgr.id) ?? 0;

                return (
                  <tr key={mgr.id} className="hover:bg-slate-50 transition-colors">
                    {/* Tên */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{displayName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">@{mgr.username}</p>
                        </div>
                      </div>
                    </td>

                    {/* Liên hệ */}
                    <td className="px-6 py-4">
                      {phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-900">{phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 italic text-xs">Chưa có</span>
                      )}
                    </td>

                    {/* Nhà phụ trách */}
                    <td className="px-6 py-4">
                      {assignedProps.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {assignedProps.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full w-fit">
                              <Building2 className="w-3 h-3" />{p.propertyName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Chưa phân công</span>
                      )}
                    </td>

                    {/* Khách thuê */}
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[2.5rem] gap-1.5 text-sm font-bold px-2.5 py-1 rounded-lg ${tenants > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                        <Users className="w-3.5 h-3.5" />{tenants}
                      </span>
                    </td>

                    {/* Bảo trì */}
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[2.5rem] gap-1.5 text-sm font-bold px-2.5 py-1 rounded-lg ${openMaint > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                        <Wrench className="w-3.5 h-3.5" />{openMaint}
                      </span>
                    </td>

                    {/* Trạng thái */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${st.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
