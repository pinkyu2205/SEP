import { useState } from 'react';
import { Search, ChevronRight, Building2, MapPin, ChevronDown, User, Phone } from 'lucide-react';
import type { AppUser } from '../../types';
import { MOCK_USERS, MOCK_CONTRACTS, MOCK_PROPERTIES } from '../../utils/mockData';

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Đang hoạt động', color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  pending_activation: { label: 'Chờ kích hoạt', color: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
  moved_out: { label: 'Đã rời', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

export const TenantList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'managers' | 'tenants'>('managers');
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const managers = MOCK_USERS.filter(u => u.role === 'manager');
  const tenants = MOCK_USERS.filter(u => u.role === 'tenant');

  const filterBySearch = (u: AppUser) =>
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone.includes(searchTerm) ||
    u.cccd.includes(searchTerm);

  // Get contracts for a manager
  const getManagerContracts = (managerId: string) =>
    MOCK_CONTRACTS.filter(c => c.type === 'admin_manager' && c.lesseeId === managerId);

  // Get tenants for a property (via manager_tenant contracts)
  const getTenantsForProperty = (propertyId: string) =>
    MOCK_CONTRACTS.filter(c => c.type === 'manager_tenant' && c.propertyId === propertyId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quản lý cho thuê</h1>
        <p className="text-sm text-slate-500 mt-1">
          {managers.length} Manager · {tenants.length} Tenant trên toàn hệ thống
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('managers')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'managers' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Manager ({managers.length})
          </button>
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'tenants' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Tenant ({tenants.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 bg-white"
          />
        </div>
      </div>

      {/* Manager Tab */}
      {activeTab === 'managers' ? (
        <div className="space-y-4">
          {managers.filter(filterBySearch).map(manager => {
            const contracts = getManagerContracts(manager.id);
            const isExpanded = expandedProperty === manager.id;

            return (
              <div key={manager.id} className={`card transition-all duration-300 ${isExpanded ? 'shadow-md ring-1 ring-primary-100' : 'hover:border-primary-200'}`}>
                <div
                  className={`p-5 cursor-pointer flex items-center justify-between ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                  onClick={() => setExpandedProperty(isExpanded ? null : manager.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg">
                      {manager.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{manager.fullName}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {manager.phone}</span>
                        <span>CCCD: {manager.cccd}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-slate-900">{contracts.length} nhà</p>
                      <p className="text-xs text-slate-500">Đang thuê</p>
                    </div>
                    <div className={`p-2 rounded-full transition-transform duration-200 ${isExpanded ? 'bg-primary-100 text-primary-600 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                      <ChevronDown className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Expanded: Show properties & tenants */}
                {isExpanded && (
                  <div className="p-5 space-y-4">
                    {contracts.map(contract => {
                      const tenantContracts = getTenantsForProperty(contract.propertyId);
                      return (
                        <div key={contract.id} className="bg-slate-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-primary-500" />
                              <span className="font-bold text-slate-900">{contract.propertyName}</span>
                            </div>
                            <span className="text-xs text-slate-500">{contract.code}</span>
                          </div>
                          <div className="text-sm text-slate-600 mb-3">
                            <p>Tiền thuê: <span className="font-semibold text-primary-600">{contract.rentAmount.toLocaleString('vi-VN')}đ/tháng</span></p>
                            <p>Thời hạn: {contract.startDate} → {contract.endDate}</p>
                            <p>Tài sản bàn giao: {contract.equipmentList.length} món</p>
                          </div>

                          {tenantContracts.length > 0 && (
                            <div className="border-t border-slate-200 pt-3">
                              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Khách thuê phòng ({tenantContracts.length})</p>
                              <div className="space-y-2">
                                {tenantContracts.map(tc => (
                                  <div key={tc.id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 text-slate-400" />
                                      <span className="font-medium text-slate-900">{tc.lesseeName}</span>
                                      <span className="text-xs text-slate-500">· {tc.roomCode}</span>
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusMap[tc.status].color}`}>
                                      {statusMap[tc.status].label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {managers.filter(filterBySearch).length === 0 && (
            <div className="text-center py-16">
              <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Không tìm thấy Manager nào.</p>
            </div>
          )}
        </div>
      ) : (
        /* Tenant Tab */
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Khách thuê</th>
                  <th className="px-4 py-3">Số điện thoại</th>
                  <th className="px-4 py-3">CCCD</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.filter(filterBySearch).map(tenant => {
                  const st = statusMap[tenant.status];
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">{tenant.fullName}</td>
                      <td className="px-4 py-3">{tenant.phone}</td>
                      <td className="px-4 py-3 text-slate-500">{tenant.cccd}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{tenant.createdAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
