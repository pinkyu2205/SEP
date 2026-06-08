import { useState, useEffect } from 'react';
import { Plus, Hammer, ArrowRight, ArrowLeft } from 'lucide-react';
import type { PropertyResponse, RenovationResponse, AddRenovationRequest, RoomResponse } from '../../../../types/api.types';
import { renovationService } from '../../../../services/renovation.service';
import { roomService } from '../../../../services/room.service';

interface StepRenovationsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

export const StepRenovations = ({ property, onNext, onBack }: StepRenovationsProps) => {
  const [renovations, setRenovations] = useState<RenovationResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [formData, setFormData] = useState<AddRenovationRequest>({
    description: '',
    cost: 0,
    completed: true,
    roomId: undefined,
  });

  useEffect(() => {
    fetchRenovations();
    if (!property.wholeHouse) {
      fetchRooms();
    }
  }, [property.id]);

  const fetchRenovations = async () => {
    setLoading(true);
    try {
      const data = await renovationService.getRenovationsByProperty(property.id);
      setRenovations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const data = await roomService.getRoomsByProperty(property.id);
      setRooms(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description) return;

    try {
      await renovationService.addRenovation(property.id, formData);
      setFormData({ description: '', cost: 0, completed: true, roomId: undefined });
      setIsAdding(false);
      fetchRenovations();
    } catch (err) {
      console.error(err);
      alert('Lỗi khi thêm hạng mục cải tạo');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Chi phí cải tạo</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Ghi nhận chi phí sơn sửa, thi công lại tòa nhà (nếu có) để hệ thống phân bổ khấu hao.
          </p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="btn-primary rounded-xl px-4 py-2 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Thêm hạng mục
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6">
          <h4 className="font-bold text-slate-800 mb-4">Khai báo chi phí</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-bold text-slate-700">Hạng mục thi công *</span>
              <input required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-field" placeholder="VD: Sơn lại toàn bộ tầng 1" />
            </label>

            {!property.wholeHouse && (
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">Vị trí</span>
                <select value={formData.roomId || ''} onChange={e => setFormData({ ...formData, roomId: e.target.value ? Number(e.target.value) : undefined })} className="input-field">
                  <option value="">Sử dụng chung (Tòa nhà)</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>Phòng {r.roomNumber}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Chi phí (VNĐ) *</span>
              <input type="number" required value={formData.cost || ''} onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} className="input-field" placeholder="VD: 5000000" />
            </label>

            <label className="flex cursor-pointer items-center gap-3 pt-6">
              <input type="checkbox" checked={formData.completed} onChange={e => setFormData({ ...formData, completed: e.target.checked })} className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600" />
              <span className="font-bold text-slate-700">Đã hoàn thành thi công</span>
            </label>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200">Hủy</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700">Lưu thông tin</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-400">Đang tải danh sách...</div>
      ) : renovations.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl mb-8">
          <Hammer className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Không có hạng mục cải tạo nào.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {renovations.map((ren) => {
            const room = rooms.find(r => r.id === ren.roomId);
            return (
              <div key={ren.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition">
                <div className="flex items-start gap-4">
                  <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500"></div>
                  <div>
                    <p className="font-bold text-slate-900">{ren.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vị trí: {room ? `Phòng ${room.roomNumber}` : 'Chung'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-black text-indigo-700">{ren.cost?.toLocaleString()} VNĐ</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ren.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {ren.completed ? 'Đã hoàn thành' : 'Đang thi công'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-6 border-t border-slate-100">
        <button type="button" onClick={onBack} className="rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Quay lại
        </button>
        <button type="button" onClick={onNext} className="btn-primary rounded-xl px-8 py-3 flex items-center gap-2 shadow-lg shadow-indigo-500/20">
          Tiếp tục <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
