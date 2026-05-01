import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Property } from '../../types';

interface Props {
  property: Property | null; // null = tạo mới
  onSave: (data: Partial<Property>) => void;
  onClose: () => void;
}

export const PropertyFormModal = ({ property, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    name: '',
    address: '',
    totalFloors: 1,
    monthlyLeaseCost: 0,
    managerName: '',
    managerPhone: '',
  });

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name,
        address: property.address,
        totalFloors: property.totalFloors,
        monthlyLeaseCost: property.monthlyLeaseCost,
        managerName: property.managerName,
        managerPhone: property.managerPhone,
      });
    }
  }, [property]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {property ? 'Chỉnh sửa nhà' : 'Thêm nhà mới'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Tên tòa nhà <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="VD: Nhà Nguyễn Trãi"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Địa chỉ <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="VD: 123 Nguyễn Trãi, Q5, TP.HCM"
              className="input-field"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Số tầng
              </label>
              <input
                type="number"
                name="totalFloors"
                value={form.totalFloors}
                onChange={handleChange}
                min={1}
                max={20}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tiền thuê gốc (₫/tháng)
              </label>
              <input
                type="number"
                name="monthlyLeaseCost"
                value={form.monthlyLeaseCost}
                onChange={handleChange}
                min={0}
                step={100000}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Người quản lý
              </label>
              <input
                type="text"
                name="managerName"
                value={form.managerName}
                onChange={handleChange}
                placeholder="Họ tên quản lý"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                SĐT quản lý
              </label>
              <input
                type="tel"
                name="managerPhone"
                value={form.managerPhone}
                onChange={handleChange}
                placeholder="0901234567"
                className="input-field"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn-primary">
              {property ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
