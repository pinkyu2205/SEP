import { useState, useEffect } from 'react';
import { X, MapPin, Building, Layers, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import type { PropertyDraftRequest, PropertyResponse, ZoneResponse } from '../../../types/api.types';
import { propertyService } from '../../../services/property.service';
import { zoneService } from '../../../services/zone.service';
import { uploadToCloudinary } from '../../../services/upload.service';

interface PropertyFormModalProps {
  initialData?: PropertyResponse | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PropertyFormModal = ({ initialData, onClose, onSuccess }: PropertyFormModalProps) => {
  const isUpdate = !!initialData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Hàm lấy userId từ JWT token
  const getUserIdFromToken = (): number => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return 1;
      const base64Payload = token.split('.')[1];
      const payloadStr = atob(base64Payload);
      const payload = JSON.parse(payloadStr);
      // Nếu userId trong JWT là UUID (chuỗi), ép kiểu sang số sẽ bị NaN, lúc này fallback về 1
      const id = Number(payload.userId);
      return isNaN(id) ? 1 : id;
    } catch (e) {
      return 1;
    }
  };
  
  const [formData, setFormData] = useState<PropertyDraftRequest>({
    propertyName: initialData?.propertyName || '',
    address: initialData?.shortAddress || '',
    descriptions: initialData?.descriptions || '',
    zoneId: initialData?.zoneId || '',
    areaSize: initialData?.areaSize || 0,
    floorCount: initialData?.floorCount || 1,
    roomsPerFloor: initialData?.roomsPerFloor || 1,
    createdBy: getUserIdFromToken(), 
    imageUrls: [],
  });

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const rootZones = await zoneService.getRootZones();
        setZones(rootZones);
      } catch (err) {
        console.error('Failed to fetch zones', err);
      }
    };
    fetchZones();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const totalRooms = (formData.floorCount || 1) * (formData.roomsPerFloor || 1);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      const newUrls = [...(formData.imageUrls || [])];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadToCloudinary(files[i]);
        newUrls.push(url);
      }
      setFormData(prev => ({ ...prev, imageUrls: newUrls }));
    } catch (err) {
      alert('Lỗi tải ảnh lên');
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newUrls = [...(formData.imageUrls || [])];
    newUrls.splice(index, 1);
    setFormData(prev => ({ ...prev, imageUrls: newUrls }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Đảm bảo descriptions không bị rỗng (để vượt qua @NotBlank của BE)
      const payload = {
        ...formData,
        descriptions: (formData.descriptions || '').trim() === '' ? 'Không có mô tả' : formData.descriptions
      };

      if (isUpdate) {
        await propertyService.updateProperty(initialData.id, payload);
      } else {
        await propertyService.createDraft(payload);
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
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="text-xl font-black text-slate-900">{isUpdate ? 'Chỉnh sửa Tòa nhà' : 'Tạo Tòa nhà nháp (DRAFT)'}</h2>
            <p className="text-sm font-semibold text-slate-500">Khởi tạo thông tin cơ bản trước khi cấu hình chi tiết</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="property-form" onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Building className="h-5 w-5 text-indigo-500" /> Thông tin cơ bản
            </h3>
            
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên tòa nhà / Căn nhà *</span>
              <input required name="propertyName" value={formData.propertyName} onChange={handleChange} className="input-field" placeholder="Ví dụ: UrbanNest Quận 1" />
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
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Diện tích (m²)</span>
              <input type="number" name="areaSize" value={formData.areaSize} onChange={handleChange} className="input-field" placeholder="Ví dụ: 120" />
            </label>

            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 pt-2">
              <Layers className="h-5 w-5 text-indigo-500" /> Cấu trúc nhà
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Số tầng</span>
                <input type="number" min={1} name="floorCount" value={formData.floorCount} onChange={handleChange} className="input-field" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Phòng/tầng</span>
                <input type="number" min={1} name="roomsPerFloor" value={formData.roomsPerFloor} onChange={handleChange} className="input-field" />
              </label>
            </div>

            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-center">
              <p className="text-sm font-semibold text-indigo-700">Tổng phòng dự kiến</p>
              <p className="text-2xl font-black text-indigo-900">{totalRooms}</p>
              <p className="text-xs text-indigo-600 mt-1">= {formData.floorCount || 1} tầng × {formData.roomsPerFloor || 1} phòng/tầng</p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Mô tả</span>
              <textarea name="descriptions" value={formData.descriptions} onChange={handleChange} className="input-field min-h-[80px]" placeholder="Tiện ích, lưu ý..." />
            </label>

            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 pt-2">
              <ImageIcon className="h-5 w-5 text-indigo-500" /> Hình ảnh Tòa nhà
            </h3>
            
            <div className="block">
              <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-700 p-4 rounded-xl text-sm font-semibold flex flex-col items-center justify-center border-2 border-dashed border-slate-300 transition">
                <Upload className="w-6 h-6 mb-2 text-slate-400" /> 
                {isUploading ? 'Đang tải lên...' : 'Bấm để chọn ảnh (Có thể chọn nhiều)'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={isUploading} />
              </label>

              {(formData.imageUrls && formData.imageUrls.length > 0) && (
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {formData.imageUrls.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={url} alt={`img-${idx}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <button type="button" onClick={() => removeImage(idx)} className="p-1.5 bg-white text-rose-500 rounded-full hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
