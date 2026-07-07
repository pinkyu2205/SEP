import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Manager } from '@/types';
import { MOCK_PROPERTIES } from '@/utils/mockData';

interface Props {
  manager: Manager | null;
  onSave: (data: Partial<Manager>) => void;
  onClose: () => void;
}

export const ManagerFormModal = ({ manager, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    status: 'active' as 'active' | 'inactive' | 'on_leave',
    assignedPropertyIds: [] as string[],
  });

  useEffect(() => {
    if (manager) {
      setForm({
        fullName: manager.fullName,
        phone: manager.phone,
        email: manager.email || '',
        status: manager.status,
        assignedPropertyIds: manager.assignedPropertyIds,
      });
    }
  }, [manager]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (propertyId: string) => {
    setForm((prev) => {
      const current = prev.assignedPropertyIds;
      const updated = current.includes(propertyId)
        ? current.filter(id => id !== propertyId)
        : [...current, propertyId];
      return { ...prev, assignedPropertyIds: updated };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {manager ? 'Chỉnh sửa Quản lý' : 'Thêm Quản lý mới'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Họ và tên <span className="text-rose-500">*</span>
              </label>
              <input type="text" name="fullName" value={form.fullName} onChange={handleChange} className="input-field" required placeholder="VD: Nguyễn Văn A" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Số điện thoại <span className="text-rose-500">*</span>
              </label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="input-field" required placeholder="SĐT đăng nhập App" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Trạng thái
              </label>
              <select name="status" value={form.status} onChange={handleChange} className="input-field">
                <option value="active">Hoạt động</option>
                <option value="inactive">Ngừng hoạt động</option>
                <option value="on_leave">Tạm nghỉ phép</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email (Tuỳ chọn)
            </label>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="input-field" placeholder="email@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Phân công quản lý nhà
            </label>
            <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
              {MOCK_PROPERTIES.map(prop => (
                <label key={prop.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={form.assignedPropertyIds.includes(prop.id)}
                    onChange={() => handleCheckboxChange(prop.id)}
                    className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-700 font-medium">{prop.name}</span>
                </label>
              ))}
              {MOCK_PROPERTIES.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-2">Chưa có nhà nào trong hệ thống.</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary">
              {manager ? 'Cập nhật' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
