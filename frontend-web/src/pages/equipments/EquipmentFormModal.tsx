import { useState, useEffect } from 'react';
import { X, QrCode } from 'lucide-react';
import type { Equipment } from '../../types';
import { MOCK_PROPERTIES } from '../../utils/mockData';

interface Props {
  equipment: Equipment | null;
  onSave: (data: Partial<Equipment>) => void;
  onClose: () => void;
}

export const EquipmentFormModal = ({ equipment, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    name: '',
    category: 'Điện lạnh',
    propertyId: '',
    roomId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: 0,
    status: 'good' as Equipment['status'],
    notes: '',
  });

  const selectedProperty = MOCK_PROPERTIES.find(p => p.id === form.propertyId);
  const rooms = selectedProperty?.rooms || [];

  useEffect(() => {
    if (equipment) {
      setForm({
        name: equipment.name,
        category: equipment.category,
        propertyId: equipment.propertyId,
        roomId: equipment.roomId || '',
        purchaseDate: equipment.purchaseDate,
        purchasePrice: equipment.purchasePrice,
        status: equipment.status,
        notes: equipment.notes || '',
      });
    }
  }, [equipment]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as any;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
      ...(name === 'propertyId' ? { roomId: '' } : {}), // reset room khi đổi nhà
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pName = MOCK_PROPERTIES.find(p => p.id === form.propertyId)?.name || '';
    const rCode = rooms.find(r => r.id === form.roomId)?.code || '';

    onSave({
      ...form,
      propertyName: pName,
      roomCode: rCode,
      roomId: form.roomId === '' ? undefined : form.roomId, // undefined nếu dùng chung
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary-600" />
            {equipment ? 'Cập nhật Thiết bị' : 'Thêm Thiết bị mới'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tên thiết bị <span className="text-rose-500">*</span></label>
              <input type="text" name="name" value={form.name} onChange={handleChange} className="input-field" required placeholder="VD: Điều hòa Daikin 9000BTU" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phân loại <span className="text-rose-500">*</span></label>
              <select name="category" value={form.category} onChange={handleChange} className="input-field" required>
                <option value="Điện lạnh">Điện lạnh</option>
                <option value="Nội thất">Nội thất</option>
                <option value="Thiết bị vệ sinh">Thiết bị vệ sinh</option>
                <option value="Điện tử">Điện tử</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Trạng thái <span className="text-rose-500">*</span></label>
              <select name="status" value={form.status} onChange={handleChange} className="input-field" required>
                <option value="good">Hoạt động tốt</option>
                <option value="broken">Đang hỏng</option>
                <option value="maintenance">Đang sửa chữa</option>
                <option value="disposed">Đã thanh lý</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nhà <span className="text-rose-500">*</span></label>
              <select name="propertyId" value={form.propertyId} onChange={handleChange} className="input-field" required>
                <option value="">-- Chọn nhà --</option>
                {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phòng (Để trống nếu dùng chung)</label>
              <select name="roomId" value={form.roomId} onChange={handleChange} className="input-field" disabled={!form.propertyId}>
                <option value="">-- Không gian chung --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày mua <span className="text-rose-500">*</span></label>
              <input type="date" name="purchaseDate" value={form.purchaseDate} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Giá trị lúc mua (₫) <span className="text-rose-500">*</span></label>
              <input type="number" name="purchasePrice" value={form.purchasePrice} onChange={handleChange} className="input-field" required min={0} step={50000} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ghi chú</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} className="input-field" rows={2} placeholder="Tình trạng, lỗi đang gặp phải..." />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary">
              {equipment ? 'Cập nhật' : 'Thêm thiết bị'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
