import { useState, useEffect } from 'react';
import { Plus, Trash2, DoorOpen, ArrowRight, ArrowLeft } from 'lucide-react';
import type { PropertyResponse, RoomResponse, AddRoomRequest } from '../../../../types/api.types';
import { roomService } from '../../../../services/room.service';

interface StepRoomsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

export const StepRooms = ({ property, onNext, onBack }: StepRoomsProps) => {
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [formData, setFormData] = useState<AddRoomRequest>({
    roomNumber: '',
    area: 0,
    propertyType: 'INDIVIDUAL_ROOM',
  });

  useEffect(() => {
    fetchRooms();
  }, [property.id]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const data = await roomService.getRoomsByProperty(property.id);
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.roomNumber || formData.area <= 0) {
      alert('Vui lòng nhập tên phòng và diện tích hợp lệ');
      return;
    }

    try {
      await roomService.addRoom(property.id, formData);
      setFormData({ roomNumber: '', area: 0, propertyType: 'INDIVIDUAL_ROOM' });
      setIsAdding(false);
      fetchRooms();
    } catch (err) {
      console.error(err);
      alert('Lỗi khi thêm phòng');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Danh sách phòng</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Khai báo danh sách các phòng trọ trong tòa nhà. (Giá thuê sẽ được thiết lập sau)
          </p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="btn-primary rounded-xl px-4 py-2 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Thêm phòng
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAddRoom} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mb-6">
          <h4 className="font-bold text-slate-800 mb-4">Thêm phòng mới</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Tên/Mã phòng *</span>
              <input required value={formData.roomNumber} onChange={e => setFormData({ ...formData, roomNumber: e.target.value })} className="input-field" placeholder="VD: 101" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Diện tích (m2) *</span>
              <input required type="number" value={formData.area || ''} onChange={e => setFormData({ ...formData, area: Number(e.target.value) })} className="input-field" placeholder="VD: 20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Số người ở tối đa</span>
              <input type="number" value={formData.maxOccupants || ''} onChange={e => setFormData({ ...formData, maxOccupants: Number(e.target.value) })} className="input-field" placeholder="VD: 2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Mã đồng hồ điện</span>
              <input value={formData.electricMeterCode || ''} onChange={e => setFormData({ ...formData, electricMeterCode: e.target.value })} className="input-field" placeholder="Tùy chọn" />
            </label>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200">Hủy</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700">Thêm vào danh sách</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-400">Đang tải danh sách phòng...</div>
      ) : rooms.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl mb-8">
          <DoorOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Chưa có phòng nào. Hãy thêm phòng đầu tiên!</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                  {room.roomNumber}
                </div>
                <div>
                  <p className="font-bold text-slate-900">Phòng {room.roomNumber}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Diện tích: {room.area}m² {room.maxOccupants ? `· Tối đa ${room.maxOccupants} người` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">{room.status}</span>
                <button className="text-slate-400 hover:text-rose-500 p-2"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
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
