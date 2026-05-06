import { useState } from 'react';
import { Search, Plus, PenTool, Printer, MapPin, Edit2, AlertCircle } from 'lucide-react';
import type { Equipment } from '../../types';
import { MOCK_EQUIPMENTS, MOCK_PROPERTIES } from '../../utils/mockData';
import { formatCurrency, equipmentStatusMap } from '../../utils';
import { EquipmentFormModal } from './EquipmentFormModal';

export const EquipmentList = () => {
  const [equipments, setEquipments] = useState<Equipment[]>(MOCK_EQUIPMENTS);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);

  // State hiển thị QR giả lập
  const [qrCodeToPrint, setQrCodeToPrint] = useState<string | null>(null);

  // Derive rooms based on selected property
  const selectedPropObj = MOCK_PROPERTIES.find(p => p.id === filterProperty);
  const availableRoomsForFilter = selectedPropObj?.rooms || [];
  const [filterRoom, setFilterRoom] = useState<string>('all');

  // Lọc dữ liệu
  const filtered = equipments.filter(eq => {
    const matchSearch = 
      eq.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      eq.code.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchProperty = filterProperty === 'all' || eq.propertyId === filterProperty;
    const matchRoom = filterRoom === 'all' || 
                      (filterRoom === 'common' ? !eq.roomId : eq.roomId === filterRoom);
    const matchStatus = filterStatus === 'all' || eq.status === filterStatus;

    return matchSearch && matchProperty && matchRoom && matchStatus;
  });

  const brokenCount = equipments.filter(eq => eq.status === 'broken' || eq.status === 'maintenance').length;
  const totalValue = equipments.filter(eq => eq.status !== 'disposed').reduce((sum, eq) => sum + eq.purchasePrice, 0);

  const handleSave = (data: Partial<Equipment>) => {
    if (editingEquipment) {
      setEquipments(prev => prev.map(eq => eq.id === editingEquipment.id ? { ...eq, ...data } : eq));
    } else {
      const newEquipment: Equipment = {
        id: `eq-${Date.now()}`,
        code: `EQ-${Date.now().toString().slice(-4)}-NEW`, // Sinh mã tạm
        name: data.name || '',
        category: data.category || '',
        propertyId: data.propertyId || '',
        propertyName: data.propertyName || '',
        roomId: data.roomId,
        roomCode: data.roomCode,
        purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
        purchasePrice: data.purchasePrice || 0,
        status: data.status || 'good',
        notes: data.notes || '',
        createdAt: new Date().toISOString().split('T')[0],
      };
      setEquipments(prev => [newEquipment, ...prev]);
    }
    setShowFormModal(false);
    setEditingEquipment(null);
  };

  const handlePrintQR = (code: string) => {
    setQrCodeToPrint(code);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Trang thiết bị</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tổng giá trị tài sản: <span className="font-semibold text-slate-900">{formatCurrency(totalValue)}</span>
          </p>
        </div>
        <button
          onClick={() => { setEditingEquipment(null); setShowFormModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm thiết bị mới
        </button>
      </div>

      {/* Cảnh báo hỏng hóc */}
      {brokenCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-rose-800">
            <AlertCircle className="w-6 h-6 text-rose-500 flex-shrink-0" />
            <div>
              <p className="font-semibold">Cảnh báo sự cố</p>
              <p className="text-sm">Đang có {brokenCount} thiết bị bị hỏng hoặc đang trong quá trình bảo trì cần chú ý.</p>
            </div>
          </div>
          <button 
            onClick={() => { setFilterStatus('broken'); setFilterProperty('all'); setFilterRoom('all'); }}
            className="px-3 py-1.5 bg-white text-rose-600 text-sm font-medium rounded border border-rose-200 hover:bg-rose-50 transition-colors"
          >
            Lọc ra
          </button>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo mã QR hoặc tên thiết bị..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-3">
          <select
            value={filterProperty}
            onChange={(e) => {
              setFilterProperty(e.target.value);
              setFilterRoom('all'); // reset room filter
            }}
            className="input-field sm:w-40"
          >
            <option value="all">Tất cả Nhà</option>
            {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select
            value={filterRoom}
            onChange={(e) => setFilterRoom(e.target.value)}
            className="input-field sm:w-40"
            disabled={filterProperty === 'all'}
          >
            <option value="all">Tất cả Phòng</option>
            <option value="common">Khu vực chung</option>
            {availableRoomsForFilter.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field sm:w-40"
          >
            <option value="all">Tất cả Trạng thái</option>
            <option value="good">Hoạt động tốt</option>
            <option value="broken">Đang hỏng</option>
            <option value="maintenance">Đang sửa chữa</option>
            <option value="disposed">Đã thanh lý</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Thiết bị</th>
                <th className="px-6 py-4">Mã QR</th>
                <th className="px-6 py-4">Vị trí</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Chi phí đầu tư</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((eq) => {
                const statusInfo = equipmentStatusMap[eq.status];
                
                return (
                  <tr key={eq.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{eq.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{eq.category}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700 text-xs tracking-wider">
                        {eq.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-900">
                        <MapPin className="w-4 h-4 text-primary-500" />
                        <span>{eq.propertyName}</span>
                      </div>
                      <div className="text-xs text-slate-500 ml-5 mt-0.5">
                        {eq.roomCode ? `Phòng ${eq.roomCode}` : 'Khu vực chung'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                      {eq.notes && (
                        <p className="text-[10px] text-slate-500 mt-1 italic line-clamp-1 max-w-[120px]" title={eq.notes}>
                          "{eq.notes}"
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {formatCurrency(eq.purchasePrice)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => handlePrintQR(eq.code)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="In mã QR"
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => { setEditingEquipment(eq); setShowFormModal(true); }}
                          className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <PenTool className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    Không tìm thấy trang thiết bị nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal QR Code giả lập để test quét */}
      {qrCodeToPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setQrCodeToPrint(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Mã QR Thiết bị</h3>
            <p className="text-slate-500 mb-6 font-mono bg-slate-100 py-1 rounded inline-block px-3">{qrCodeToPrint}</p>
            
            <div className="bg-white p-4 border-2 border-slate-200 rounded-xl inline-block mb-6">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCodeToPrint}`} 
                alt={`QR Code for ${qrCodeToPrint}`} 
                className="w-[200px] h-[200px]"
              />
            </div>
            
            <p className="text-sm text-slate-500 mb-6">Bạn có thể dùng Mobile App để quét mã QR này và kiểm tra luồng báo hỏng.</p>
            
            <button 
              onClick={() => setQrCodeToPrint(null)}
              className="btn-primary w-full"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showFormModal && (
        <EquipmentFormModal
          equipment={editingEquipment}
          onSave={handleSave}
          onClose={() => {
            setShowFormModal(false);
            setEditingEquipment(null);
          }}
        />
      )}
    </div>
  );
};
