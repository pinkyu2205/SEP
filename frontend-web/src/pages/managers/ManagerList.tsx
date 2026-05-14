import { useState } from 'react';
import { Search, Plus, Phone, UserCog, Mail, Edit2 } from 'lucide-react';
import type { Manager } from '../../types';
import { MOCK_MANAGERS, MOCK_PROPERTIES } from '../../utils/mockData';
import { managerStatusMap } from '../../utils';
import { ManagerFormModal } from './ManagerFormModal';

export const ManagerList = () => {
  const [managers, setManagers] = useState<Manager[]>(MOCK_MANAGERS);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);

  const filtered = managers.filter(m => 
    m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone.includes(searchTerm)
  );

  const handleSave = (data: Partial<Manager>) => {
    if (editingManager) {
      setManagers(prev => prev.map(m => m.id === editingManager.id ? { ...m, ...data } : m));
    } else {
      const newManager: Manager = {
        id: `m-${Date.now()}`,
        fullName: data.fullName || '',
        phone: data.phone || '',
        email: data.email || '',
        status: data.status || 'active',
        assignedPropertyIds: data.assignedPropertyIds || [],
        createdAt: new Date().toISOString().split('T')[0],
      };
      setManagers(prev => [newManager, ...prev]);
    }
    setShowFormModal(false);
    setEditingManager(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Danh sách khách thuê</h1>
          <p className="text-sm text-slate-500 mt-1">
            Danh sách Manager đang thuê nhà nguyên căn từ Chủ đầu tư
          </p>
        </div>
        <button
          onClick={() => { setEditingManager(null); setShowFormModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm quản lý mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Khách thuê</th>
                <th className="px-6 py-4">Liên hệ</th>
                <th className="px-6 py-4">Nhà quản lý</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((manager) => {
                const statusInfo = managerStatusMap[manager.status];
                
                // Lấy tên các nhà quản lý
                const assignedProps = manager.assignedPropertyIds
                  .map(id => MOCK_PROPERTIES.find(p => p.id === id)?.name)
                  .filter(Boolean);

                return (
                  <tr key={manager.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                          {manager.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{manager.fullName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Ngày tạo: {manager.createdAt}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium text-slate-900">{manager.phone}</span>
                      </div>
                      {manager.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{manager.email}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {assignedProps.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {assignedProps.map((name, i) => (
                            <span key={i} className="inline-flex text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Chưa phân công</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => { setEditingManager(manager); setShowFormModal(true); }}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <UserCog className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    Không tìm thấy khách thuê nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showFormModal && (
        <ManagerFormModal
          manager={editingManager}
          onSave={handleSave}
          onClose={() => {
            setShowFormModal(false);
            setEditingManager(null);
          }}
        />
      )}
    </div>
  );
};
