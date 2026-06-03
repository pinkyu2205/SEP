import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Home, MapPin, DollarSign, Building } from 'lucide-react';
import type { PropertyRequest, PropertyResponse, RoomRequest, RoomResponse, ZoneResponse } from '../../../types/api.types';
import { propertyService } from '../../../services/property.service';
import { zoneService } from '../../../services/zone.service';
interface PropertyFormModalProps {
  initialData?: PropertyResponse | null;
  onClose: () => void;
  onSuccess: () => void;
}

const emptyRoom: RoomRequest = { roomNumber: '', price: 0, deposit: 0, area: 0 };

export const PropertyFormModal = ({ initialData, onClose, onSuccess }: PropertyFormModalProps) => {
  const isUpdate = !!initialData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [zones, setZones] = useState<ZoneResponse[]>([]);
  
  const [formData, setFormData] = useState<PropertyRequest>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    address: initialData?.address || '',
    wholeHouse: initialData?.isWholeHouse || false,
    electricityPrice: initialData?.electricityPrice || 0,
    waterPrice: initialData?.waterPrice || 0,
    imageUrls: initialData?.imageUrls || '',
    zoneId: initialData?.zoneId || '',
    authorizedOwnerName: 'Demo Owner', // Currently mocked
    defaultPrice: 0,
    defaultDeposit: 0,
    defaultArea: 0,
    rooms: initialData?.rooms?.map((r: RoomResponse) => ({
      roomNumber: r.roomNumber,
      price: r.price,
      deposit: r.deposit,
      area: r.area,
    })) || [],
  });

  useEffect(() => {
    // Fetch lowest level zones (Phường/Xã) or just all zones to let user select
    const fetchZones = async () => {
      try {
        const rootZones = await zoneService.getRootZones();
        // Giả sử để đơn giản, ta lấy root zones (hoặc API lấy tất cả, tuỳ thuộc Backend)
        setZones(rootZones);
      } catch (err) {
        console.error('Failed to fetch zones', err);
      }
    };
    fetchZones();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev: PropertyRequest) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? Number(value) : value
    }));
  };

  const handleRoomChange = (index: number, field: keyof RoomRequest, value: string | number) => {
    const newRooms = [...formData.rooms];
    newRooms[index] = { ...newRooms[index], [field]: typeof newRooms[index][field] === 'number' ? Number(value) : value };
    setFormData({ ...formData, rooms: newRooms });
  };

  const addRoom = () => {
    setFormData((prev: PropertyRequest) => ({ ...prev, rooms: [...prev.rooms, { ...emptyRoom }] }));
  };

  const removeRoom = (index: number) => {
    setFormData((prev: PropertyRequest) => ({ ...prev, rooms: prev.rooms.filter((_, i: number) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isUpdate) {
        await propertyService.updateProperty(initialData.id, formData);
      } else {
        await propertyService.createProperty(formData);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi lưu tòa nhà.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="text-xl font-black text-slate-900">{isUpdate ? 'Chỉnh sửa Tòa nhà' : 'Thêm Tòa nhà mới'}</h2>
            <p className="text-sm font-semibold text-slate-500">Cấu hình thông tin tòa nhà và danh sách phòng</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="property-form" onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                  <Building className="h-5 w-5 text-indigo-500" /> Thông tin cơ bản
                </h3>
                
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên tòa nhà *</span>
                  <input required name="title" value={formData.title} onChange={handleChange} className="input-field" placeholder="Ví dụ: UrbanNest Quận 1" />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Địa chỉ *</span>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input required name="address" value={formData.address} onChange={handleChange} className="input-field pl-9" placeholder="Số nhà, đường..." />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Khu vực (Zone) *</span>
                  <select required name="zoneId" value={formData.zoneId} onChange={handleChange} className="input-field">
                    <option value="">-- Chọn khu vực --</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold text-slate-700">Mô tả</span>
                  <textarea name="description" value={formData.description} onChange={handleChange} className="input-field min-h-[80px]" placeholder="Tiện ích, lưu ý..." />
                </label>
              </div>

              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                  <DollarSign className="h-5 w-5 text-emerald-500" /> Cấu hình dịch vụ
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá điện (VNĐ/kWh)</span>
                    <input required type="number" name="electricityPrice" value={formData.electricityPrice} onChange={handleChange} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá nước (VNĐ/khối)</span>
                    <input required type="number" name="waterPrice" value={formData.waterPrice} onChange={handleChange} className="input-field" />
                  </label>
                </div>

                <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 transition-colors hover:bg-indigo-50">
                  <input type="checkbox" name="wholeHouse" checked={formData.wholeHouse} onChange={handleChange} className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600" />
                  <div>
                    <p className="font-bold text-indigo-900">Cho thuê nhà nguyên căn</p>
                    <p className="text-xs text-indigo-700">Áp dụng một mức giá chung cho toàn bộ nhà</p>
                  </div>
                </label>

                {formData.wholeHouse && (
                  <div className="grid grid-cols-2 gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá thuê nguyên căn</span>
                      <input type="number" name="defaultPrice" value={formData.defaultPrice} onChange={handleChange} className="input-field" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold text-slate-700">Tiền cọc</span>
                      <input type="number" name="defaultDeposit" value={formData.defaultDeposit} onChange={handleChange} className="input-field" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                  <Home className="h-5 w-5 text-cyan-500" /> Danh sách Phòng
                </h3>
                <button type="button" onClick={addRoom} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> Thêm phòng
                </button>
              </div>

              {formData.rooms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-500">Chưa có phòng nào. Hãy thêm phòng đầu tiên.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.rooms.map((room: RoomRequest, index: number) => (
                    <div key={index} className="flex items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="flex-1">
                        <span className="mb-1 block text-xs font-bold text-slate-700">Tên/Mã phòng</span>
                        <input required value={room.roomNumber} onChange={e => handleRoomChange(index, 'roomNumber', e.target.value)} className="input-field py-2 text-sm" placeholder="P.101" />
                      </label>
                      <label className="w-32">
                        <span className="mb-1 block text-xs font-bold text-slate-700">Giá thuê (VNĐ)</span>
                        <input required type="number" value={room.price} onChange={e => handleRoomChange(index, 'price', e.target.value)} className="input-field py-2 text-sm" />
                      </label>
                      <label className="w-32">
                        <span className="mb-1 block text-xs font-bold text-slate-700">Cọc (VNĐ)</span>
                        <input required type="number" value={room.deposit} onChange={e => handleRoomChange(index, 'deposit', e.target.value)} className="input-field py-2 text-sm" />
                      </label>
                      <label className="w-24">
                        <span className="mb-1 block text-xs font-bold text-slate-700">DT (m2)</span>
                        <input required type="number" value={room.area} onChange={e => handleRoomChange(index, 'area', e.target.value)} className="input-field py-2 text-sm" />
                      </label>
                      <button type="button" onClick={() => removeRoom(index)} className="shrink-0 rounded-lg p-2.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 p-6">
          <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-100">Hủy</button>
          <button type="submit" form="property-form" disabled={loading} className="btn-primary rounded-xl px-8 py-2.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
            {loading ? 'Đang lưu...' : 'Lưu Tòa nhà'}
          </button>
        </div>
      </div>
    </div>
  );
};
