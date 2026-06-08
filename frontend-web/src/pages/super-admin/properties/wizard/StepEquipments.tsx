import { useState, useEffect } from 'react';
import { Plus, PackageSearch, ArrowRight, ArrowLeft } from 'lucide-react';
import type { PropertyResponse, EquipmentResponse, AddEquipmentRequest, RoomResponse } from '../../../../types/api.types';
import { equipmentService } from '../../../../services/equipment.service';
import { roomService } from '../../../../services/room.service';

interface StepEquipmentsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

export const StepEquipments = ({ property, onNext, onBack }: StepEquipmentsProps) => {
  const [equipments, setEquipments] = useState<EquipmentResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [formData, setFormData] = useState<AddEquipmentRequest>({
    name: '',
    source: 'INITIAL_HANDOVER',
    status: 'GOOD',
    roomId: undefined,
  });

  useEffect(() => {
    fetchEquipments();
    if (!property.wholeHouse) {
      fetchRooms();
    }
  }, [property.id]);

  const fetchEquipments = async () => {
    setLoading(true);
    try {
      const data = await equipmentService.getEquipmentsByProperty(property.id);
      setEquipments(data);
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
    if (!formData.name) return;

    try {
      await equipmentService.addEquipment(property.id, formData);
      setFormData({ name: '', source: 'INITIAL_HANDOVER', status: 'GOOD', roomId: undefined });
      setIsAdding(false);
      fetchEquipments();
    } catch (err) {
      console.error(err);
      alert('Lỗi khi thêm thiết bị');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Danh sách thiết bị bàn giao</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Ghi nhận tài sản sẵn có hoặc thiết bị mới mua sắm cho tòa nhà/phòng trọ.
          </p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="btn-primary rounded-xl px-4 py-2 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Thêm thiết bị
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6">
          <h4 className="font-bold text-slate-800 mb-4">Khai báo thiết bị</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Tên thiết bị *</span>
              <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder="VD: Điều hòa Daikin 9000BTU" />
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
              <span className="mb-1 block text-sm font-bold text-slate-700">Nguồn gốc</span>
              <select value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value as any })} className="input-field">
                <option value="INITIAL_HANDOVER">Chủ nhà bàn giao</option>
                <option value="PURCHASED">Tự mua sắm thêm</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Trạng thái</span>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="input-field">
                <option value="NEW">Mới 100%</option>
                <option value="GOOD">Đang sử dụng tốt</option>
                <option value="DAMAGED">Có trầy xước/cũ</option>
                <option value="BROKEN">Hư hỏng</option>
              </select>
            </label>

            {formData.source === 'PURCHASED' && (
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-bold text-slate-700">Giá mua (VNĐ)</span>
                <input type="number" required value={formData.purchasePrice || ''} onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })} className="input-field" placeholder="Nhập giá mua để tính khấu hao" />
              </label>
            )}
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200">Hủy</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700">Lưu thiết bị</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-400">Đang tải danh sách thiết bị...</div>
      ) : equipments.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl mb-8">
          <PackageSearch className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Chưa có thiết bị nào được ghi nhận.</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {equipments.map((eq) => {
            const room = rooms.find(r => r.id === eq.roomId);
            return (
              <div key={eq.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition">
                <div className="flex items-start gap-4">
                  <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500"></div>
                  <div>
                    <p className="font-bold text-slate-900">{eq.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vị trí: {room ? `Phòng ${room.roomNumber}` : 'Chung'} · {eq.source === 'INITIAL_HANDOVER' ? 'Chủ nhà giao' : `Mua thêm (${eq.purchasePrice?.toLocaleString()}đ)`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${eq.status === 'NEW' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{eq.status}</span>
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
