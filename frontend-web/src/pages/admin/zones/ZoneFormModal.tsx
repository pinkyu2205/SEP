import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ZoneRequest, ZoneResponse } from '@/types/api.types';

interface ZoneFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ZoneRequest) => Promise<void>;
  level: number;
  parentId: string | null;
  parentName?: string;
  /** Có giá trị → SỬA zone đã tồn tại (prefill name/description/lat/lng) thay vì tạo mới. */
  editZone?: ZoneResponse | null;
}

export const ZoneFormModal: React.FC<ZoneFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  level,
  parentId,
  parentName,
  editZone,
}) => {
  const isEdit = !!editZone;
  const [name, setName] = useState(editZone?.name ?? '');
  const [description, setDescription] = useState(editZone?.description ?? '');
  const [latitude, setLatitude] = useState(editZone?.latitude != null ? String(editZone.latitude) : '');
  const [longitude, setLongitude] = useState(editZone?.longitude != null ? String(editZone.longitude) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal component ở đây được remount mỗi lần mở (parent render {isOpen && <...>} hoặc
  // key đổi theo editZone.id) nên lazy state theo props ban đầu là đủ, không cần useEffect.

  if (!isOpen) return null;

  // BE yêu cầu lat/lng phải cùng có hoặc cùng null — chặn ngay ở FE trước khi gửi.
  const coordsMismatch = (latitude.trim() === '') !== (longitude.trim() === '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || coordsMismatch) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        level,
        parentId,
        latitude: latitude.trim() === '' ? null : Number(latitude),
        longitude: longitude.trim() === '' ? null : Number(longitude),
      });
      setName('');
      setDescription('');
      setLatitude('');
      setLongitude('');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLevelLabel = () => {
    if (level === 1) return 'Tỉnh/Thành phố';
    if (level === 2) return 'Quận/Huyện';
    if (level === 3) return 'Phường/Xã';
    return 'Khu vực';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? `Sửa ${getLevelLabel()}` : `Thêm mới ${getLevelLabel()}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {parentName && (
            <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase">Trực thuộc</span>
              <p className="text-sm font-medium text-slate-800">{parentName}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Tên {getLevelLabel()} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Nhập tên ${getLevelLabel().toLowerCase()}...`}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Mô tả (tùy chọn)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ghi chú thêm về khu vực này..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all min-h-[100px] resize-none"
              />
            </div>

            {level === 2 && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Toạ độ tâm (tùy chọn — có thể dùng nút Geocode thay vì nhập tay)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Vĩ độ (lat)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                  />
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Kinh độ (lng)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
                  />
                </div>
                {coordsMismatch && (
                  <p className="mt-1.5 text-xs text-rose-500">Điền cả vĩ độ và kinh độ, hoặc để trống cả hai.</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting || coordsMismatch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isEdit ? 'Lưu thay đổi' : 'Xác nhận thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
