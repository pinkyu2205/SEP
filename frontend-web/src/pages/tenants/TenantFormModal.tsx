import { useState } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import type { RoomResponse, OnboardTenantRequest } from '../../types/api.types';
import { tenantService } from '../../services/tenant.service';

interface Props {
  propertyId: number;
  propertyName: string;
  wholeHouse: boolean;
  rooms: RoomResponse[];          // danh sách phòng còn trống (AVAILABLE)
  onSuccess: () => void;
  onClose: () => void;
}

export const TenantFormModal = ({ propertyId, propertyName, wholeHouse, rooms, onSuccess, onClose }: Props) => {
  const [form, setForm] = useState({
    fullName: '',
    phoneNumber: '',
    cccd: '',
    roomId: '',
    moveInDate: new Date().toISOString().split('T')[0],
    endDate: '',
    rentAmount: '',
    deposit: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Khi chọn phòng, tự điền giá thuê/cọc gợi ý từ phòng đó
  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const roomId = e.target.value;
    const room = rooms.find((r) => String(r.id) === roomId);
    setForm((prev) => ({
      ...prev,
      roomId,
      rentAmount: room?.price != null ? String(room.price) : prev.rentAmount,
      deposit: room?.deposit != null ? String(room.deposit) : prev.deposit,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wholeHouse && !form.roomId) {
      toast.error('Vui lòng chọn phòng cho khách thuê');
      return;
    }

    const payload: OnboardTenantRequest = {
      fullName: form.fullName.trim(),
      cccd: form.cccd.trim(),
      phoneNumber: form.phoneNumber.trim(),
      moveInDate: form.moveInDate,
      rentAmount: Number(form.rentAmount),
      deposit: Number(form.deposit),
      endDate: form.endDate || undefined,
    };

    setSubmitting(true);
    try {
      if (wholeHouse) {
        await tenantService.onboardWholeHouseTenant(propertyId, payload);
      } else {
        await tenantService.onboardRoomTenant(propertyId, Number(form.roomId), payload);
      }
      toast.success('Đã thêm khách thuê & tạo hợp đồng');
      onSuccess();
      onClose();
    } catch {
      // Lỗi nghiệp vụ (422/4xx) đã được interceptor toast — giữ modal để người dùng sửa lại
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Thêm khách thuê mới</h2>
            <p className="text-xs text-slate-500 mt-0.5">{propertyName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800 text-sm">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <p>
              Hệ thống sẽ tự động tạo tài khoản khách thuê (đăng nhập <strong>t&lt;SĐT&gt;</strong> / mật khẩu mặc định <strong>123456</strong>).
            </p>
          </div>

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
              <input type="tel" name="phoneNumber" value={form.phoneNumber} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                CCCD <span className="text-rose-500">*</span>
              </label>
              <input type="text" name="cccd" value={form.cccd} onChange={handleChange} className="input-field" required />
            </div>
          </div>

          {/* Phòng (chỉ với nhà chia phòng) */}
          {!wholeHouse && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Phòng <span className="text-rose-500">*</span>
              </label>
              <select name="roomId" value={form.roomId} onChange={handleRoomChange} className="input-field" required>
                <option value="">Chọn phòng trống...</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                    {r.price != null ? ` — ${r.price.toLocaleString('vi-VN')}đ` : ''}
                  </option>
                ))}
              </select>
              {rooms.length === 0 && (
                <p className="text-xs text-rose-500 mt-1">Tòa này không còn phòng trống.</p>
              )}
            </div>
          )}

          {/* Giá thuê & cọc */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Giá thuê (đ/tháng) <span className="text-rose-500">*</span>
              </label>
              <input type="number" name="rentAmount" value={form.rentAmount} onChange={handleChange} className="input-field" min="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tiền cọc (đ) <span className="text-rose-500">*</span>
              </label>
              <input type="number" name="deposit" value={form.deposit} onChange={handleChange} className="input-field" min="0" required />
            </div>
          </div>

          {/* Thời hạn */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Ngày vào ở <span className="text-rose-500">*</span>
              </label>
              <input type="date" name="moveInDate" value={form.moveInDate} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ngày kết thúc (tuỳ chọn)</label>
              <input type="date" name="endDate" value={form.endDate} onChange={handleChange} className="input-field" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Đang xử lý...' : 'Thêm khách thuê'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
