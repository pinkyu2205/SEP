import { useState } from 'react';
import { Search, Plus, User, Phone, CreditCard, ChevronRight, ChevronDown, DoorOpen, Building2, MapPin } from 'lucide-react';
import type { Tenant, TenantStatus } from '../../types';
import { MOCK_TENANTS, MOCK_PROPERTIES } from '../../utils/mockData';
import { tenantStatusMap } from '../../utils';
import { TenantFormModal } from './TenantFormModal';
import { TenantDetailModal } from './TenantDetailModal';

export const TenantList = () => {
  const [tenants, setTenants] = useState<Tenant[]>(MOCK_TENANTS);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tabs: 'assigned' (Khách đang thuê) | 'unassigned' (Khách chờ phòng/đã rời)
  const [activeTab, setActiveTab] = useState<'assigned' | 'unassigned'>('assigned');
  
  // Accordion state cho Tab 1
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Phân loại khách
  const assignedTenants = tenants.filter(t => t.propertyId && t.status !== 'moved_out');
  const unassignedTenants = tenants.filter(t => !t.propertyId || t.status === 'moved_out');

  // Lọc theo search term
  const filterBySearch = (t: Tenant) => 
    t.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone.includes(searchTerm) ||
    t.cccd.includes(searchTerm);

  const handleSave = (data: Partial<Tenant>) => {
    if (editingTenant) {
      setTenants((prev) => prev.map((t) => (t.id === editingTenant.id ? { ...t, ...data } : t)));
    } else {
      const newTenant: Tenant = {
        id: `t-${Date.now()}`,
        fullName: data.fullName || '',
        phone: data.phone || '',
        cccd: data.cccd || '',
        email: data.email || '',
        propertyId: data.propertyId || '',
        propertyName: data.propertyName || '',
        roomId: data.roomId || '',
        roomCode: data.roomCode || '',
        moveInDate: data.moveInDate || new Date().toISOString().split('T')[0],
        status: data.propertyId ? 'pending_activation' : 'pending_activation', // Chưa gán phòng cũng chờ
        createdAt: new Date().toISOString().split('T')[0],
      };
      setTenants((prev) => [newTenant, ...prev]);
    }
    setShowFormModal(false);
    setEditingTenant(null);
  };

  // Render Table dùng chung cho cả phần Accordion và Tab 2
  const renderTenantTable = (data: Tenant[], showPropertyCol: boolean = false) => {
    const displayData = data.filter(filterBySearch);

    if (displayData.length === 0) {
      return (
        <div className="py-8 text-center text-slate-500">
          Không có khách thuê nào phù hợp.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
            <tr>
              <th className="px-4 py-3">Khách thuê</th>
              <th className="px-4 py-3">Liên hệ</th>
              {showPropertyCol && <th className="px-4 py-3">Nhà / Phòng</th>}
              {!showPropertyCol && <th className="px-4 py-3">Phòng</th>}
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayData.map((tenant) => {
              const statusInfo = tenantStatusMap[tenant.status];
              return (
                <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{tenant.fullName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{tenant.phone}</p>
                  </td>
                  {showPropertyCol && (
                    <td className="px-4 py-3">
                      {tenant.propertyId ? (
                        <>
                          <p className="font-medium text-slate-900">{tenant.propertyName}</p>
                          <p className="text-xs text-slate-500">P.{tenant.roomCode}</p>
                        </>
                      ) : (
                        <span className="text-slate-400 italic">Chưa có</span>
                      )}
                    </td>
                  )}
                  {!showPropertyCol && (
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary-600">{tenant.roomCode}</span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedTenant(tenant); }}
                      className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Xem chi tiết"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Khách thuê</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tổng số: <span className="font-semibold text-slate-900">{tenants.length}</span> khách thuê trên toàn hệ thống
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTenant(null);
            setShowFormModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm khách mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex p-1 bg-slate-100 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('assigned')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'assigned' 
                ? 'bg-white text-primary-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Khách đang thuê ({assignedTenants.length})
          </button>
          <button
            onClick={() => setActiveTab('unassigned')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'unassigned' 
                ? 'bg-white text-primary-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Khách chờ / Đã rời ({unassignedTenants.length})
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

      {/* Main Content Area */}
      {activeTab === 'assigned' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MOCK_PROPERTIES.map((property) => {
            const tenantsInProperty = assignedTenants.filter(t => t.propertyId === property.id);
            const isExpanded = expandedProperty === property.id;
            
            // Nếu đang search và không có ai match trong nhà này, có thể ẩn card đi
            if (searchTerm && tenantsInProperty.filter(filterBySearch).length === 0) return null;

            return (
              <div 
                key={property.id} 
                className={`card transition-all duration-300 ${isExpanded ? 'lg:col-span-2 shadow-md ring-1 ring-primary-100' : 'hover:border-primary-200'}`}
              >
                {/* Card Header (Clickable) */}
                <div 
                  className={`p-5 cursor-pointer flex items-center justify-between ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                  onClick={() => setExpandedProperty(isExpanded ? null : property.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary-50 rounded-xl">
                      <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{property.name}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {property.address}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-slate-900">{tenantsInProperty.length} khách</p>
                      <p className="text-xs text-slate-500">Đang lưu trú</p>
                    </div>
                    <div className={`p-2 rounded-full transition-transform duration-200 ${isExpanded ? 'bg-primary-100 text-primary-600 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                      <ChevronDown className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Expanded Accordion Content */}
                {isExpanded && (
                  <div className="p-0 animate-in slide-in-from-top-2 duration-200">
                    {renderTenantTable(tenantsInProperty, false)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Danh sách chờ gán phòng / Đã rời</h3>
              <p className="text-sm text-slate-500 mt-1">
                Các khách hàng có tài khoản nhưng chưa (hoặc không còn) thuê phòng.
              </p>
            </div>
          </div>
          {renderTenantTable(unassignedTenants, true)}
        </div>
      )}

      {/* Modals */}
      {showFormModal && (
        <TenantFormModal
          tenant={editingTenant}
          onSave={handleSave}
          onClose={() => {
            setShowFormModal(false);
            setEditingTenant(null);
          }}
        />
      )}

      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onEdit={() => {
            setEditingTenant(selectedTenant);
            setShowFormModal(true);
            setSelectedTenant(null);
          }}
        />
      )}
    </div>
  );
};
