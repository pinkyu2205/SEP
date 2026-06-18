import { useState, useEffect } from 'react';
import { Search, UserCog, Building2, Users, Wrench, RefreshCw, Phone } from 'lucide-react';
import { propertyService } from '../../services/property.service';
import { userService } from '../../services/user.service';
import type { PropertyResponse, UserResponse } from '../../types/api.types';

type ManagerItem = { id: string; fullName: string; username: string };

const statusCls: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:   { label: 'Hoạt động',       color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Ngừng hoạt động', color: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
  DISABLE:  { label: 'Đã vô hiệu',      color: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  PENDING:  { label: 'Chờ duyệt',       color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
};

export const ManagerList = () => {
  const [managers, setManagers]     = useState<ManagerItem[]>([]);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [userMap, setUserMap]       = useState<Map<string, UserResponse>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mgrs, propsRes] = await Promise.all([
        propertyService.getManagers(),
        propertyService.getProperties(0, 100),
      ]);
      setManagers(mgrs);
      setProperties(propsRes.content);

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

  const filtered = managers.filter(m => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    const user = userMap.get(m.id);
    return (
      (m.fullName || m.username).toLowerCase().includes(kw) ||
      user?.phoneNumber?.includes(kw) ||
      m.username.toLowerCase().includes(kw)
    );
  });

  const getAssignedProps = (mgId: string) =>
    properties.filter(p => p.operationManagerId === mgId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý vận hành</h1>
          <p className="text-sm text-slate-500 mt-1">
            {managers.length} quản lý vận hành đang giám sát các bất động sản UrbanNest
          </p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm self-start">
          <RefreshCw className="w-4 h-4" /> Làm mới
        </button>
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
                <th className="px-6 py-4">Khách thuê</th>
                <th className="px-6 py-4">Bảo trì chờ xử lý</th>
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
                      {user?.phoneNumber ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-900">{user.phoneNumber}</span>
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
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                              <Building2 className="w-3 h-3" />{p.propertyName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Chưa phân công</span>
                      )}
                    </td>

                    {/* Khách thuê */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 rounded-lg">
                          <Users className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="font-semibold text-slate-400">—</span>
                      </div>
                    </td>

                    {/* Bảo trì */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-slate-50 rounded-lg">
                          <Wrench className="w-4 h-4 text-slate-400" />
                        </div>
                        <span className="font-semibold text-slate-400">—</span>
                      </div>
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
