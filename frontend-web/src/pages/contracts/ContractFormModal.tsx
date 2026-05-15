import { useState, useEffect } from 'react';
import { X, CalendarClock } from 'lucide-react';
import type { Contract } from '../../types';
import { MOCK_USERS, MOCK_PROPERTIES } from '../../utils/mockData';

interface Props {
  contract: Contract | null;
  mode: 'create' | 'extend';
  onSave: (data: Partial<Contract>) => void;
  onClose: () => void;
}

export const ContractFormModal = ({ contract, mode, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    lesseeId: '',
    propertyId: '',
    roomId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    depositAmount: 0,
    rentAmount: 0,
    notes: '',
  });

  const eligibleUsers = MOCK_USERS;
  const selectedProperty = MOCK_PROPERTIES.find(p => p.id === form.propertyId);
  const availableRooms = selectedProperty?.rooms.filter(r => r.status === 'available' || r.id === form.roomId) || [];

  useEffect(() => {
    if (contract) {
      setForm({
        lesseeId: contract.lesseeId,
        propertyId: contract.propertyId,
        roomId: contract.roomId || '',
        startDate: contract.startDate,
        endDate: contract.endDate,
        depositAmount: contract.depositAmount,
        rentAmount: contract.rentAmount,
        notes: contract.notes || '',
      });
    }
  }, [contract]);

  // Handle auto-fill rent and deposit when a room is selected
  useEffect(() => {
    if (mode === 'create' && form.roomId && selectedProperty) {
      const room = selectedProperty.rooms.find(r => r.id === form.roomId);
      if (room) {
        setForm(prev => ({
          ...prev,
          depositAmount: room.deposit,
          rentAmount: room.rentPrice
        }));
      }
    }
  }, [form.roomId, selectedProperty, mode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as any;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
      ...(name === 'propertyId' ? { roomId: '' } : {}),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Fill in display names
    const lessee = MOCK_USERS.find(u => u.id === form.lesseeId);
    const pName = MOCK_PROPERTIES.find(p => p.id === form.propertyId)?.name || '';
    const rCode = availableRooms.find(r => r.id === form.roomId)?.code || '';

    onSave({
      ...form,
      lessorId: 'host',
      lessorName: 'UrbanNest Host',
      lesseeId: form.lesseeId,
      lesseeName: lessee?.fullName || '',
      lesseeCccd: lessee?.cccd,
      lesseePhone: lessee?.phone,
      propertyName: pName,
      roomCode: rCode || undefined,
      equipmentList: [],
    });
  };

  const isExtension = mode === 'extend';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            {isExtension && <CalendarClock className="w-5 h-5 text-primary-600" />}
            {isExtension ? `Gia hạn Hợp đồng ${contract?.code}` : 'Tạo Hợp đồng mới'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Thông tin Bên thuê & Nhà */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Bên thuê <span className="text-rose-500">*</span></label>
              <select name="lesseeId" value={form.lesseeId} onChange={handleChange} className="input-field" required disabled={isExtension}>
                <option value="">-- Chọn người thuê --</option>
                {eligibleUsers.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.phone}) - {u.role === 'manager' ? 'Manager' : 'Tenant'}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nhà <span className="text-rose-500">*</span></label>
                <select name="propertyId" value={form.propertyId} onChange={handleChange} className="input-field" required disabled={isExtension}>
                  <option value="">-- Chọn nhà --</option>
                  {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Phòng (nếu có)</label>
                <select name="roomId" value={form.roomId} onChange={handleChange} className="input-field" disabled={isExtension || !form.propertyId}>
                  <option value="">-- Chọn phòng --</option>
                  {availableRooms.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Thời hạn */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày bắt đầu <span className="text-rose-500">*</span></label>
              <input type="date" name="startDate" value={form.startDate} onChange={handleChange} className="input-field bg-slate-50" required disabled={isExtension} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày kết thúc <span className="text-rose-500">*</span></label>
              <input type="date" name="endDate" value={form.endDate} onChange={handleChange} className="input-field" required min={isExtension ? contract?.endDate : form.startDate} />
            </div>
          </div>

          {/* Tài chính */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tiền cọc (₫) <span className="text-rose-500">*</span></label>
              <input type="number" name="depositAmount" value={form.depositAmount} onChange={handleChange} className="input-field bg-slate-50" required min={0} step={100000} disabled={isExtension} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Giá thuê (₫/tháng) <span className="text-rose-500">*</span></label>
              <input type="number" name="rentAmount" value={form.rentAmount} onChange={handleChange} className="input-field bg-slate-50" required min={0} step={100000} disabled={isExtension} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ghi chú thêm</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} className="input-field" rows={2} placeholder={isExtension ? "Ghi chú gia hạn hợp đồng..." : "Các thoả thuận khác..."} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary">
              {isExtension ? 'Xác nhận gia hạn' : 'Tạo hợp đồng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
