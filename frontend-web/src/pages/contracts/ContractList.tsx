import { useState } from 'react';
import { Search, Plus, FileText, User, DoorOpen, Calendar, CalendarClock, ShieldAlert, BadgeCheck } from 'lucide-react';
import type { Contract } from '../../types';
import { MOCK_CONTRACTS } from '../../utils/mockData';
import { formatCurrency, contractStatusMap } from '../../utils';
import { ContractFormModal } from './ContractFormModal';

export const ContractList = () => {
  const [contracts, setContracts] = useState<Contract[]>(MOCK_CONTRACTS);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'extend'>('create');

  const filtered = contracts.filter(c => 
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.propertyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount = contracts.filter(c => c.status === 'active').length;
  const expiringCount = contracts.filter(c => c.status === 'expiring_soon').length;
  const totalDeposit = contracts.filter(c => c.status !== 'terminated').reduce((sum, c) => sum + c.depositAmount, 0);

  const handleSave = (data: Partial<Contract>) => {
    if (editingContract && modalMode === 'extend') {
      // Gia hạn
      setContracts(prev => prev.map(c => c.id === editingContract.id ? { 
        ...c, 
        endDate: data.endDate || c.endDate,
        notes: data.notes || c.notes,
        status: 'active' // Trở lại active sau khi gia hạn
      } : c));
    } else {
      // Tạo mới
      const newContract: Contract = {
        id: `c-${Date.now()}`,
        code: `HD-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`,
        tenantId: data.tenantId || '',
        tenantName: data.tenantName || '',
        propertyId: data.propertyId || '',
        propertyName: data.propertyName || '',
        roomId: data.roomId || '',
        roomCode: data.roomCode || '',
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        depositAmount: data.depositAmount || 0,
        rentAmount: data.rentAmount || 0,
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
    if (window.confirm('Bạn có chắc chắn muốn Thanh lý hợp đồng này? Thao tác này sẽ hoàn cọc và chuyển phòng về trạng thái trống.')) {
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
            Quản lý và gia hạn các hợp đồng thuê phòng
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
      <div className="flex flex-col sm:flex-row gap-4">
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
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Mã Hợp đồng</th>
                <th className="px-6 py-4">Khách thuê</th>
                <th className="px-6 py-4">Nhà / Phòng</th>
                <th className="px-6 py-4">Thời hạn</th>
                <th className="px-6 py-4">Tiền cọc</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((contract) => {
                const statusInfo = contractStatusMap[contract.status];
                
                return (
                  <tr key={contract.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-primary-600 flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> {contract.code}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Tạo: {contract.createdAt}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{contract.tenantName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{contract.propertyName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <DoorOpen className="w-3.5 h-3.5" /> Phòng {contract.roomCode}
                      </div>
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
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {contract.status !== 'terminated' && (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => { setEditingContract(contract); setModalMode('extend'); setShowFormModal(true); }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 hover:bg-primary-100 rounded transition-colors flex items-center gap-1.5"
                            title="Gia hạn hợp đồng"
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
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    Không tìm thấy hợp đồng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
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
