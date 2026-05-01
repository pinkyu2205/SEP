import { useState, useEffect } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import type { Tenant } from '../../types';
import { MOCK_PROPERTIES } from '../../utils/mockData';

interface Props {
  tenant: Tenant | null;
  onSave: (data: Partial<Tenant>) => void;
  onClose: () => void;
}

export const TenantFormModal = ({ tenant, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    cccd: '',
    email: '',
    propertyId: '',
    roomId: '',
    moveInDate: new Date().toISOString().split('T')[0],
  });

  // Tìm phòng tương ứng propertyId
  const selectedProperty = MOCK_PROPERTIES.find((p) => p.id === form.propertyId);
  // Chỉ lấy phòng trống
  const availableRooms = selectedProperty?.rooms.filter((r) => r.status === 'available' || r.id === form.roomId) || [];

  useEffect(() => {
    if (tenant) {
      setForm({
        fullName: tenant.fullName,
        phone: tenant.phone,
        cccd: tenant.cccd,
        email: tenant.email || '',
        propertyId: tenant.propertyId,
        roomId: tenant.roomId,
        moveInDate: tenant.moveInDate,
      });
    }
  }, [tenant]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Reset roomId nếu đổi property
      ...(name === 'propertyId' ? { roomId: '' } : {}),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Lấy tên nhà và phòng để save
    const propName = MOCK_PROPERTIES.find(p => p.id === form.propertyId)?.name || '';
    const rCode = availableRooms.find(r => r.id === form.roomId)?.code || '';

    onSave({
      ...form,
      propertyName: propName,
      roomCode: rCode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {tenant ? 'Cập nhật khách thuê' : 'Thêm khách thuê mới'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!tenant && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
              <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500" />
              <p>
                Hệ thống sẽ tự động tạo tài khoản và gửi mã <strong>OTP kích hoạt</strong> qua SMS/Zalo theo số điện thoại đăng ký bên dưới.
              </p>
            </div>
          )}

          {/* Thông tin cá nhân */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Họ và tên <span className="text-rose-500">*</span>
            </label>
            <input type="text" name="fullName" value={form.fullName} onChange={handleChange} className="input-field" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                CCCD <span className="text-rose-500">*</span>
              </label>
              <input type="text" name="cccd" value={form.cccd} onChange={handleChange} className="input-field" required />
            </div>
          </div>

          {/* Vị trí thuê (Optional) */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nhà nguyên căn (Tuỳ chọn)
              </label>
              <select name="propertyId" value={form.propertyId} onChange={handleChange} className="input-field">
                <option value="">-- Khách chờ (Chưa gán phòng) --</option>
                {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Phòng
              </label>
              <select name="roomId" value={form.roomId} onChange={handleChange} className="input-field" disabled={!form.propertyId}>
                <option value="">Chọn phòng trống...</option>
                {availableRooms.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày bắt đầu vào ở</label>
            <input type="date" name="moveInDate" value={form.moveInDate} onChange={handleChange} className="input-field" disabled={!form.propertyId} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary">
              {tenant ? 'Cập nhật' : 'Thêm khách & Gửi OTP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
