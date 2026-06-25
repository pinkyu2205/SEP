import { useState } from 'react';
import {
  Search, Plus, FileText, User, DoorOpen, Calendar, CalendarClock,
  ShieldAlert, BadgeCheck, Building2, X, Package, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import type { Contract } from '../../types';
import { ALL_CONTRACTS } from '../../utils/mockData';
import { formatCurrency, contractStatusMap } from '../../utils';
import { ContractFormModal } from './ContractFormModal';
import { hostService } from '../../services/host.service';

type ActiveTab = 'pending_approval' | 'admin_manager' | 'manager_tenant';

const CONTRACT_TABS = [
  { key: 'pending_approval' as const, label: 'Chờ phê duyệt',   icon: Clock },
  { key: 'admin_manager'   as const, label: 'Host ↔ Quản lý',  icon: Building2 },
  { key: 'manager_tenant'  as const, label: 'Quản lý ↔ Thuê',  icon: User },
];

export const ContractList = () => {
  const [contracts, setContracts] = useState<Contract[]>(ALL_CONTRACTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('pending_approval');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'extend'>('create');

  const [approvalModal, setApprovalModal] = useState<{ contract: Contract; action: 'approve' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const tabContracts =
    activeTab === 'pending_approval'
      ? contracts.filter(c => c.status === 'pending_approval')
      : contracts.filter(c => c.type === activeTab);

  const filtered = tabContracts.filter(c =>
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.lesseeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.propertyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeCount   = contracts.filter(c => c.status === 'active').length;
  const expiringCount = contracts.filter(c => c.status === 'expiring_soon').length;
  const pendingCount  = contracts.filter(c => c.status === 'pending_approval').length;

  const handleSave = (data: Partial<Contract>) => {
    if (editingContract && modalMode === 'extend') {
      setContracts(prev => prev.map(c => c.id === editingContract.id ? {
        ...c, endDate: data.endDate || c.endDate, notes: data.notes || c.notes, status: 'active',
      } : c));
    } else {
      const newContract: Contract = {
        id: `c-${Date.now()}`,
        code: `HD-${activeTab === 'admin_manager' ? 'AM' : 'MT'}-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`,
        type: activeTab === 'pending_approval' ? 'manager_tenant' : activeTab,
        lessorId: data.lessorId || '', lessorName: data.lessorName || '',
        lesseeId: data.lesseeId || '', lesseeName: data.lesseeName || '',
        lesseeCccd: data.lesseeCccd, lesseePhone: data.lesseePhone,
        propertyId: data.propertyId || '', propertyName: data.propertyName || '',
        roomId: data.roomId, roomCode: data.roomCode,
        startDate: data.startDate || '', endDate: data.endDate || '',
        depositAmount: data.depositAmount || 0, rentAmount: data.rentAmount || 0,
        equipmentList: data.equipmentList || [],
        status: 'active', notes: data.notes || '',
        createdAt: new Date().toISOString().split('T')[0],
      };
      setContracts(prev => [newContract, ...prev]);
    }
    setShowFormModal(false);
    setEditingContract(null);
  };

  const handleTerminate = (id: string) => {
    if (window.confirm('Bạn có chắc muốn chấm dứt hợp đồng này?')) {
      setContracts(prev => prev.map(c => c.id === id ? { ...c, status: 'terminated' } : c));
    }
  };

  const handleApprove = () => {
    if (!approvalModal) return;
    const { contract, action } = approvalModal;
    // Optimistic + gọi API thật (fallback cục bộ nếu BE chưa sẵn sàng).
    setContracts(prev => prev.map(c =>
      c.id === contract.id ? { ...c, status: action === 'approve' ? 'active' : 'terminated' } : c
    ));
    const call = action === 'approve'
      ? hostService.approveContract(contract.id)
      : hostService.rejectContract(contract.id, rejectReason.trim());
    call.catch(() => { /* offline: đã cập nhật cục bộ */ });
    setApprovalModal(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Phê duyệt và quản lý hợp đồng giữa Host–Quản lý và Quản lý–Khách thuê
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

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><Clock className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Chờ phê duyệt</p>
            <p className="text-xl font-bold text-slate-900">{pendingCount} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
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
      </div>

      {/* Tabs + Tìm kiếm */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {CONTRACT_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.key === 'pending_approval' && pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Tìm theo mã, tên, bất động sản..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} className="input-field pl-9 text-sm" />
        </div>
      </div>

      {/* Bảng */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 text-xs">
              <tr>
                <th className="px-5 py-3.5">Hợp đồng</th>
                <th className="px-5 py-3.5">Bên thuê</th>
                <th className="px-5 py-3.5">Bên cho thuê</th>
                <th className="px-5 py-3.5">Nhà / Phòng</th>
                <th className="px-5 py-3.5">Giá thuê/tháng</th>
                <th className="px-5 py-3.5">Thời hạn</th>
                <th className="px-5 py-3.5">Trạng thái</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(contract => {
                const statusInfo = contractStatusMap[contract.status];
                const isPending = contract.status === 'pending_approval';
                return (
                  <tr key={contract.id}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${isPending ? 'bg-amber-50/30' : ''}`}
                    onClick={() => setSelectedContract(contract)}
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-primary-600 flex items-center gap-1.5 text-xs font-mono">
                        <FileText className="w-3.5 h-3.5" />{contract.code}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">Ngày tạo: {contract.createdAt}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{contract.lesseeName}</span>
                      </div>
                      {contract.lesseePhone && <div className="text-xs text-slate-400 mt-0.5">{contract.lesseePhone}</div>}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{contract.lessorName}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{contract.propertyName}</div>
                      {contract.roomCode && (
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <DoorOpen className="w-3 h-3" /> Phòng {contract.roomCode}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(contract.rentAmount)}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{contract.startDate}</div>
                      <div className="mt-0.5">→ <span className={contract.status === 'expiring_soon' ? 'text-rose-600 font-medium' : ''}>{contract.endDate}</span></div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />{statusInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        {isPending ? (
                          <>
                            <button onClick={() => setApprovalModal({ contract, action: 'approve' })}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                              <CheckCircle className="w-3.5 h-3.5" /> Duyệt
                            </button>
                            <button onClick={() => setApprovalModal({ contract, action: 'reject' })}
                              className="flex items-center gap-1 px-2.5 py-1.5 border border-rose-300 text-rose-600 text-xs font-medium rounded-lg hover:bg-rose-50 transition-colors">
                              <XCircle className="w-3.5 h-3.5" /> Từ chối
                            </button>
                          </>
                        ) : contract.status !== 'terminated' ? (
                          <>
                            <button onClick={() => { setEditingContract(contract); setModalMode('extend'); setShowFormModal(true); }}
                              className="px-2.5 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors flex items-center gap-1.5">
                              <CalendarClock className="w-3.5 h-3.5" /> Gia hạn
                            </button>
                            <button onClick={() => handleTerminate(contract.id)}
                              className="px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                              Chấm dứt
                            </button>
                          </>
                        ) : null}
                      </div>
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

      {/* Modal chi tiết hợp đồng */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedContract(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />{selectedContract.code}
              </h2>
              <button onClick={() => setSelectedContract(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full ${selectedContract.type === 'admin_manager' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {selectedContract.type === 'admin_manager' ? 'Hợp đồng Host ↔ Quản lý' : 'Hợp đồng Quản lý ↔ Khách thuê'}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${contractStatusMap[selectedContract.status].color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${contractStatusMap[selectedContract.status].dot}`} />
                  {contractStatusMap[selectedContract.status].label}
                </span>
              </div>
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
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Bất động sản</p>
                <p className="font-semibold text-slate-900">{selectedContract.propertyName}</p>
                {selectedContract.roomCode && <p className="text-sm text-slate-500 mt-0.5">Phòng {selectedContract.roomCode}</p>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Giá thuê/tháng', value: formatCurrency(selectedContract.rentAmount) },
                  { label: 'Tiền cọc', value: formatCurrency(selectedContract.depositAmount) },
                  { label: 'Ngày bắt đầu', value: selectedContract.startDate },
                  { label: 'Ngày kết thúc', value: selectedContract.endDate },
                ].map(item => (
                  <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
              {selectedContract.equipmentList.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary-600" />
                    Danh sách tài sản bàn giao ({selectedContract.equipmentList.length} món)
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-2.5 text-left">Tên thiết bị</th>
                          <th className="px-4 py-2.5 text-center">SL</th>
                          <th className="px-4 py-2.5 text-left">Tình trạng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedContract.equipmentList.map(eq => (
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

      {/* Modal phê duyệt */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setApprovalModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              {approvalModal.action === 'approve'
                ? <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
                : <div className="p-2 bg-rose-50 rounded-lg"><XCircle className="w-5 h-5 text-rose-600" /></div>
              }
              <h3 className="text-base font-bold text-slate-900">
                {approvalModal.action === 'approve' ? 'Phê duyệt hợp đồng' : 'Từ chối hợp đồng'}
              </h3>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm">
              <p className="font-mono text-xs text-slate-500 mb-1">{approvalModal.contract.code}</p>
              <p className="font-semibold text-slate-900">{approvalModal.contract.lesseeName}</p>
              <p className="text-slate-500">{approvalModal.contract.propertyName} · {approvalModal.contract.roomCode}</p>
              <p className="text-slate-500">{formatCurrency(approvalModal.contract.rentAmount)}/tháng · bắt đầu {approvalModal.contract.startDate}</p>
            </div>
            {approvalModal.action === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Lý do từ chối</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối..." rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setApprovalModal(null)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                Hủy
              </button>
              <button onClick={handleApprove}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${approvalModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {approvalModal.action === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal tạo/gia hạn */}
      {showFormModal && (
        <ContractFormModal contract={editingContract} mode={modalMode} onSave={handleSave}
          onClose={() => { setShowFormModal(false); setEditingContract(null); }} />
      )}
    </div>
  );
};
