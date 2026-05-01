import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Room } from '../../types';

interface Props {
  room: Room | null;
  totalFloors: number;
  onSave: (data: Partial<Room>) => void;
  onClose: () => void;
}

export const RoomFormModal = ({ room, totalFloors, onSave, onClose }: Props) => {
  const [form, setForm] = useState({
    code: '',
    floor: 1,
    area: 20,
    maxOccupants: 2,
    rentPrice: 3500000,
    deposit: 3500000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceCharge: 100000,
  });

  useEffect(() => {
    if (room) {
      setForm({
        code: room.code,
        floor: room.floor,
        area: room.area,
        maxOccupants: room.maxOccupants,
        rentPrice: room.rentPrice,
        deposit: room.deposit,
        electricityRate: room.electricityRate,
        waterRate: room.waterRate,
        serviceCharge: room.serviceCharge,
      });
    }
  }, [room]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {room ? `Chỉnh sửa phòng ${room.code}` : 'Thêm phòng mới'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Thông tin cơ bản */}
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Thông tin cơ bản
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mã phòng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="VD: P101"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tầng</label>
              <select name="floor" value={form.floor} onChange={handleChange} className="input-field">
                {Array.from({ length: totalFloors }, (_, i) => i + 1).map((f) => (
                  <option key={f} value={f}>
                    Tầng {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Diện tích (m²)
              </label>
              <input
                type="number"
                name="area"
                value={form.area}
                onChange={handleChange}
                min={5}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Sức chứa (người)
              </label>
              <input
                type="number"
                name="maxOccupants"
                value={form.maxOccupants}
                onChange={handleChange}
                min={1}
                max={10}
                className="input-field"
              />
            </div>
          </div>

          {/* Cấu hình tài chính */}
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider pt-2">
            Cấu hình tài chính
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Giá thuê (₫/tháng)
              </label>
              <input
                type="number"
                name="rentPrice"
                value={form.rentPrice}
                onChange={handleChange}
                min={0}
                step={100000}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tiền cọc (₫)
              </label>
              <input
                type="number"
                name="deposit"
                value={form.deposit}
                onChange={handleChange}
                min={0}
                step={100000}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Điện (₫/kWh)
              </label>
              <input
                type="number"
                name="electricityRate"
                value={form.electricityRate}
                onChange={handleChange}
                min={0}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nước (₫/m³)
              </label>
              <input
                type="number"
                name="waterRate"
                value={form.waterRate}
                onChange={handleChange}
                min={0}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Phí DV (₫)
              </label>
              <input
                type="number"
                name="serviceCharge"
                value={form.serviceCharge}
                onChange={handleChange}
                min={0}
                className="input-field"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">
              Hủy
            </button>
            <button type="submit" className="btn-primary">
              {room ? 'Cập nhật' : 'Tạo phòng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
