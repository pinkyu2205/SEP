import { useState, useEffect } from 'react';
import { MapPin, Building, ArrowRight } from 'lucide-react';
import type { PropertyCreateRequest, PropertyResponse, ZoneResponse } from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { zoneService } from '../../../../services/zone.service';
import { userService } from '../../../../services/user.service';
import type { UserResponse } from '../../../../types/api.types';

interface StepPropertyInfoProps {
  property: PropertyResponse | null;
  onSaved: (property: PropertyResponse) => void;
}

export const StepPropertyInfo = ({ property, onSaved }: StepPropertyInfoProps) => {
  const isUpdate = !!property;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [managers, setManagers] = useState<UserResponse[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  
  const [formData, setFormData] = useState<PropertyCreateRequest>({
    propertyName: property?.propertyName || '',
    address: property?.shortAddress || '',
    descriptions: property?.descriptions || '',
    zoneId: property?.zoneId || '',
    wholeHouse: property?.wholeHouse || false,
    areaSize: property?.areaSize || 0,
    totalRooms: property?.totalRooms || 0,
    managedBy: 1, // Mặc định để pass NOT NULL backend
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rootZones, allUsers] = await Promise.all([
          zoneService.getRootZones(),
          userService.getAllUsers()
        ]);
        setZones(rootZones);
        const mgrs = allUsers.filter(u => u.role === 'ROLE_MANAGER' && u.status === 'ACTIVE');
        setManagers(mgrs);
        if (mgrs.length > 0) {
          setSelectedManagerId(mgrs[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch data', err);
      }
    };
    fetchData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Vì backend requires managedBy as Long, ta hash id (UUID) thành 1 số dương để pass qua validation
      const hashCode = (s: string) => Math.abs(s.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)) || 1;
      
      const payload = {
        ...formData,
        managedBy: selectedManagerId ? hashCode(selectedManagerId) : 1
      };

      let savedProperty: PropertyResponse;
      if (isUpdate && property) {
        savedProperty = await propertyService.updateProperty(property.id, payload);
      } else {
        savedProperty = await propertyService.createProperty(payload);
      }
      onSaved(savedProperty);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi lưu thông tin tòa nhà.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">Thông tin cơ bản</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Khởi tạo tòa nhà / nhà nguyên căn mới để hệ thống theo dõi
        </p>
      </div>

      <form id="property-info-form" onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 border-b border-slate-100 pb-2">
              <Building className="h-5 w-5 text-indigo-500" /> Nhận diện
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
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Quản lý bởi (ROLE_MANAGER) *</span>
              <select required value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)} className="input-field">
                <option value="">-- Chọn Quản lý --</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.username} ({m.phoneNumber})</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 border-b border-slate-100 pb-2">
              <Building className="h-5 w-5 text-indigo-500" /> Cấu trúc nhà
            </h3>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 transition-colors hover:bg-indigo-50">
              <div className="pt-1">
                <input type="checkbox" name="wholeHouse" checked={formData.wholeHouse} onChange={handleChange} className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600" />
              </div>
              <div>
                <p className="font-bold text-indigo-900">Nhà nguyên căn</p>
                <p className="text-xs text-indigo-700 mt-1">Áp dụng một mức giá chung cho toàn bộ nhà (không chia phòng trọ)</p>
              </div>
            </label>

            {!formData.wholeHouse ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tổng số phòng dự kiến</span>
                <input type="number" name="totalRooms" value={formData.totalRooms} onChange={handleChange} className="input-field" placeholder="Ví dụ: 10" />
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Diện tích sử dụng (m2)</span>
                <input type="number" name="areaSize" value={formData.areaSize} onChange={handleChange} className="input-field" placeholder="Ví dụ: 100" />
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Mô tả thêm</span>
              <textarea name="descriptions" value={formData.descriptions} onChange={handleChange} className="input-field min-h-[100px]" placeholder="Tiện ích, lưu ý..." />
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t border-slate-100 mt-8">
          <button type="submit" disabled={loading} className="btn-primary rounded-xl px-8 py-3 flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
            {loading ? 'Đang lưu...' : (isUpdate ? 'Lưu & Tiếp tục' : 'Tạo mới & Tiếp tục')}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};
