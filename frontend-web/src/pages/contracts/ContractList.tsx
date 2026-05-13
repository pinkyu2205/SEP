import { useState } from 'react';
import { Search, Plus, FileText, User, DoorOpen, Calendar, CalendarClock, ShieldAlert, BadgeCheck, Building2, X, Package } from 'lucide-react';
import type { Contract } from '../../types';
import { MOCK_CONTRACTS } from '../../utils/mockData';
import { formatCurrency, contractStatusMap } from '../../utils';
import { ContractFormModal } from './ContractFormModal';

// Contract Type Tab labels
const CONTRACT_TABS = [
  { key: 'admin_manager' as const, label: 'Admin ↔ Manager', icon: Building2 },
  { key: 'manager_tenant' as const, label: 'Manager ↔ Tenant', icon: User },
];

export const ContractList = () => {
  const [contracts, setContracts] = useState<Contract[]>(MOCK_CONTRACTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'admin_manager' | 'manager_tenant'>('admin_manager');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'extend'>('create');

  const tabContracts = contracts.filter(c => c.type === activeTab);
  const filtered = tabContracts.filter(c => 
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.lesseeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.propertyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = tabContracts.filter(c => c.status === 'active').length;
  const expiringCount = tabContracts.filter(c => c.status === 'expiring_soon').length;
  const totalDeposit = tabContracts.filter(c => c.status !== 'terminated').reduce((sum, c) => sum + c.depositAmount, 0);

  const handleSave = (data: Partial<Contract>) => {
    if (editingContract && modalMode === 'extend') {
      setContracts(prev => prev.map(c => c.id === editingContract.id ? { 
        ...c, 
        endDate: data.endDate || c.endDate,
        notes: data.notes || c.notes,
        status: 'active'
      } : c));
    } else {
      const newContract: Contract = {
        id: `c-${Date.now()}`,
        code: `HD-${activeTab === 'admin_manager' ? 'AM' : 'MT'}-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`,
        type: activeTab,
        lessorId: data.lessorId || '',
        lessorName: data.lessorName || '',
        lesseeId: data.lesseeId || '',
        lesseeName: data.lesseeName || '',
        lesseeCccd: data.lesseeCccd,
        lesseePhone: data.lesseePhone,
        propertyId: data.propertyId || '',
        propertyName: data.propertyName || '',
        roomId: data.roomId,
        roomCode: data.roomCode,
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        depositAmount: data.depositAmount || 0,
        rentAmount: data.rentAmount || 0,
        equipmentList: data.equipmentList || [],
        status: 'active',
        notes: data.notes || '',
        createdAt: new Date().toISOString().split('T')[0],
      };
      setContracts(prev => [newContract, ...prev]);
    }
    setShowFormModal(false);
    setEditingContract(null);
  };

  const handleTerminate = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn Thanh lý hợp đồng này?')) {
      setContracts(prev => prev.map(c => c.id === id ? { ...c, status: 'terminated' } : c));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý hợp đồng thuê nhà (Admin ↔ Manager) và thuê phòng (Manager ↔ Tenant)
          </p>
        </div>
        <button
          onClick={() => { setEditingContract(null); setModalMode('create'); setShowFormModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Tạo hợp đồng
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl max-w-md">
        {CONTRACT_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><BadgeCheck className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Đang hiệu lực</p>
            <p className="text-xl font-bold text-slate-900">{activeCount} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-rose-500">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl"><ShieldAlert className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Sắp hết hạn</p>
            <p className="text-xl font-bold text-slate-900">{expiringCount} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-indigo-500">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><FileText className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Tổng tiền cọc đang giữ</p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(totalDeposit)}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm theo mã HĐ, tên khách, nhà..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Mã Hợp đồng</th>
                <th className="px-6 py-4">{activeTab === 'admin_manager' ? 'Manager (Bên thuê)' : 'Khách thuê'}</th>
                <th className="px-6 py-4">{activeTab === 'admin_manager' ? 'Nhà cho thuê' : 'Nhà / Phòng'}</th>
                <th className="px-6 py-4">Thời hạn</th>
                <th className="px-6 py-4">Tiền cọc</th>
                <th className="px-6 py-4">Tài sản</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((contract) => {
                const statusInfo = contractStatusMap[contract.status];
                
                return (
                  <tr key={contract.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedContract(contract)}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary-600 flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> {contract.code}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Tạo: {contract.createdAt}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{contract.lesseeName}</span>
                      </div>
                      {contract.lesseePhone && <div className="text-xs text-slate-500 mt-0.5">{contract.lesseePhone}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{contract.propertyName}</div>
                      {contract.roomCode && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <DoorOpen className="w-3.5 h-3.5" /> Phòng {contract.roomCode}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{contract.startDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                        <span className="w-3.5 text-center">→</span>
                        <span className={contract.status === 'expiring_soon' ? 'text-rose-600 font-medium' : ''}>
                          {contract.endDate}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {formatCurrency(contract.depositAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        <Package className="w-3.5 h-3.5" />
                        {contract.equipmentList.length} món
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {contract.status !== 'terminated' && (
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => { setEditingContract(contract); setModalMode('extend'); setShowFormModal(true); }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 hover:bg-primary-100 rounded transition-colors flex items-center gap-1.5"
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> Gia hạn
                          </button>
                          <button 
                            onClick={() => handleTerminate(contract.id)}
                            className="px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 rounded transition-colors"
                          >
                            Thanh lý
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    Không tìm thấy hợp đồng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Detail Modal */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedContract(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                {selectedContract.code}
              </h2>
              <button onClick={() => setSelectedContract(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Contract Type Badge */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full ${
                  selectedContract.type === 'admin_manager' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {selectedContract.type === 'admin_manager' ? '📋 HĐ Thuê Nhà Gốc' : '📝 HĐ Thuê Phòng'}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${contractStatusMap[selectedContract.status].color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${contractStatusMap[selectedContract.status].dot}`} />
                  {contractStatusMap[selectedContract.status].label}
                </span>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Bên cho thuê</p>
                  <p className="font-semibold text-slate-900">{selectedContract.lessorName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Bên thuê</p>
                  <p className="font-semibold text-slate-900">{selectedContract.lesseeName}</p>
                  {selectedContract.lesseeCccd && <p className="text-xs text-slate-500 mt-1">CCCD: {selectedContract.lesseeCccd}</p>}
                  {selectedContract.lesseePhone && <p className="text-xs text-slate-500">SĐT: {selectedContract.lesseePhone}</p>}
                </div>
              </div>

              {/* Property Info */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Tài sản cho thuê</p>
                <p className="font-semibold text-slate-900">{selectedContract.propertyName}</p>
                {selectedContract.roomCode && <p className="text-sm text-slate-500 mt-0.5">Phòng {selectedContract.roomCode}</p>}
              </div>

              {/* Terms */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Tiền thuê/tháng</p>
                  <p className="text-sm font-bold text-primary-600 mt-1">{formatCurrency(selectedContract.rentAmount)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Tiền cọc</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{formatCurrency(selectedContract.depositAmount)}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Ngày bắt đầu</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{selectedContract.startDate}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Ngày kết thúc</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{selectedContract.endDate}</p>
                </div>
              </div>

              {/* Equipment List */}
              {selectedContract.equipmentList.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary-600" />
                    Danh sách Tài sản bàn giao ({selectedContract.equipmentList.length} món)
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Tên tài sản</th>
                          <th className="px-4 py-2.5 text-center">SL</th>
                          <th className="px-4 py-2.5 text-left">Tình trạng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedContract.equipmentList.map((eq) => (
                          <tr key={eq.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{eq.name}</td>
                            <td className="px-4 py-2.5 text-center">{eq.quantity}</td>
                            <td className="px-4 py-2.5 text-slate-600">{eq.condition}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedContract.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-amber-700 uppercase mb-1">Ghi chú</p>
                  <p className="text-sm text-amber-800">{selectedContract.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showFormModal && (
        <ContractFormModal
          contract={editingContract}
          mode={modalMode}
          onSave={handleSave}
          onClose={() => {
            setShowFormModal(false);
            setEditingContract(null);
          }}
        />
      )}
    </div>
  );
};
