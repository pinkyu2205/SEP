import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Building, Building2, CheckCircle2, Clock, DoorOpen,
  Hammer, Image as ImageIcon, Layers, MapPin, Plus, Search,
  TrendingUp, Trash2, Upload, XCircle,
} from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import { zoneService } from '../../../services/zone.service';
import { uploadToCloudinary } from '../../../services/upload.service';
import type { PropertyDraftRequest, PropertyResponse, ZoneResponse } from '../../../types/api.types';
import { StepPropertyInfo } from '../properties/wizard/StepPropertyInfo';
import { KpiCard } from '../shared';

const statusBadge: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-slate-100 text-slate-700' },
  UNDER_RENOVATION: { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' },
  PENDING_HOST_REVIEW: { label: 'Chờ Host duyệt', cls: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: 'Đang kinh doanh', cls: 'bg-emerald-100 text-emerald-800' },
  DISABLED: { label: 'Đã vô hiệu', cls: 'bg-rose-100 text-rose-800' },
};

const getUserIdFromToken = (): number => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return 1;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const id = Number(payload.userId);
    return isNaN(id) ? 1 : id;
  } catch { return 1; }
};

const emptyForm = (): PropertyDraftRequest => ({
  propertyName: '', address: '', descriptions: '', zoneId: '',
  areaSize: 0, floorCount: 1, roomsPerFloor: 1,
  createdBy: getUserIdFromToken(), imageUrls: [],
});

// ─── View states ───────────────────────────────────────────────────────────────
type View = 'list' | 'create-form' | 'step-info' | 'detail';

export const TaoDraftPage = () => {
  // ─── view & selected ──────────────────────────────────────────────
  const [view, setView] = useState<View>('list');
  const [newProperty, setNewProperty] = useState<PropertyResponse | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<PropertyResponse | null>(null);

  // ─── building list ────────────────────────────────────────────────
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ─── create form ──────────────────────────────────────────────────
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [parentZoneId, setParentZoneId] = useState('');
  const [childZones, setChildZones] = useState<ZoneResponse[]>([]);
  const [childZonesLoading, setChildZonesLoading] = useState(false);
  const [totalRoomsInput, setTotalRoomsInput] = useState(1);
  const [formData, setFormData] = useState<PropertyDraftRequest>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fetchBuildings = async () => {
    setListLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) { console.error(e); }
    finally { setListLoading(false); }
  };

  useEffect(() => {
    fetchBuildings();
    zoneService.getRootZones().then(setZones).catch(console.error);
  }, []);

  const kpi = useMemo(() => buildings.reduce(
    (acc, b) => ({
      total: acc.total + 1,
      draft: acc.draft + (b.status === 'DRAFT' ? 1 : 0),
      active: acc.active + (b.status === 'ACTIVE' ? 1 : 0),
      rooms: acc.rooms + (b.totalRooms || 0),
    }),
    { total: 0, draft: 0, active: 0, rooms: 0 }
  ), [buildings]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return buildings.filter(b => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchStatus && matchSearch;
    });
  }, [buildings, statusFilter, search]);

  // ─── form handlers ────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleParentZoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value;
    setParentZoneId(pid);
    setFormData(prev => ({ ...prev, zoneId: '' }));
    setChildZones([]);
    if (!pid) return;
    setChildZonesLoading(true);
    try {
      const children = await zoneService.getChildrenZones(pid);
      setChildZones(children);
    } catch { console.error('Lỗi tải khu vực cấp 2'); }
    finally { setChildZonesLoading(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setIsUploading(true);
    try {
      const urls = [...(formData.imageUrls || [])];
      for (let i = 0; i < files.length; i++) urls.push(await uploadToCloudinary(files[i]));
      setFormData(prev => ({ ...prev, imageUrls: urls }));
    } catch { alert('Lỗi tải ảnh'); }
    finally { setIsUploading(false); }
  };

  const removeImage = (idx: number) => {
    const urls = [...(formData.imageUrls || [])];
    urls.splice(idx, 1);
    setFormData(prev => ({ ...prev, imageUrls: urls }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        descriptions: (formData.descriptions || '').trim() || 'Không có mô tả',
        roomsPerFloor: Math.max(1, Math.round(totalRoomsInput / (formData.floorCount || 1))),
      };
      const created = await propertyService.createDraft(payload);
      setNewProperty(created);
      setView('step-info');
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.message || 'Có lỗi xảy ra');
    } finally { setSubmitting(false); }
  };

  const handleDeleteBuilding = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Xác nhận xóa tòa nhà?')) return;
    try { await propertyService.deleteProperty(id); fetchBuildings(); }
    catch { alert('Lỗi khi xóa'); }
  };

  const handleCompleteRenovation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Xác nhận cải tạo hoàn tất?')) return;
    try { await propertyService.completeRenovation(id); fetchBuildings(); }
    catch (err: any) { alert(err.response?.data?.message || 'Lỗi'); }
  };

  const backToList = () => {
    setView('list');
    setNewProperty(null);
    setSelectedBuilding(null);
    setFormData(emptyForm());
    setFormError('');
    setParentZoneId('');
    setChildZones([]);
    setTotalRoomsInput(1);
    fetchBuildings();
  };

  const openDetail = (b: PropertyResponse) => {
    setSelectedBuilding(b);
    setView('detail');
  };


  // ═══════════════════════════════════════════════════════════════════
  // VIEW: StepPropertyInfo (hợp đồng + thiết bị) sau khi tạo draft
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'step-info' && newProperty) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700 mb-3">
            ✓ Draft đã tạo thành công
          </span>
          <h1 className="text-2xl font-black text-slate-900">Bước tiếp theo — Hợp đồng & Khai báo thiết bị</h1>
          <p className="text-slate-500 mt-1 font-medium">{newProperty.propertyName} · Trạng thái: DRAFT</p>
        </div>
        <StepPropertyInfo
          property={newProperty}
          onNext={backToList}
          nextLabel="Xác nhận & Quay về danh sách"
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'detail' && selectedBuilding) {
    const badge = statusBadge[selectedBuilding.status] ?? statusBadge.DRAFT;
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{selectedBuilding.propertyName}</h1>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{selectedBuilding.fullAddress || selectedBuilding.shortAddress}</span>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-blue-50 p-4 text-center">
            <p className="text-xl font-black text-blue-700">{selectedBuilding.totalRooms || 0}</p>
            <p className="mt-0.5 text-xs font-semibold text-blue-600">Tổng phòng</p>
          </div>
          <div className="rounded-xl bg-indigo-50 p-4 text-center">
            <p className="text-xl font-black text-indigo-700">{selectedBuilding.floorCount || '—'}</p>
            <p className="mt-0.5 text-xs font-semibold text-indigo-600">Số tầng</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-xl font-black text-slate-700">{selectedBuilding.areaSize ? `${selectedBuilding.areaSize} m²` : '—'}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Diện tích</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4 text-center">
            <p className="text-xl font-black text-emerald-700">
              {selectedBuilding.price ? Number(selectedBuilding.price).toLocaleString('vi-VN') : '—'}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-emerald-600">Giá thuê</p>
          </div>
        </div>

        {/* Ảnh tòa nhà */}
        {(selectedBuilding.imageUrls?.length ?? 0) > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Hình ảnh tòa nhà</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {selectedBuilding.imageUrls!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="group aspect-square overflow-hidden rounded-xl border border-slate-200 block">
                  <img src={url} alt={`Ảnh ${i + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition duration-200" />
                </a>
              ))}
            </div>
          </div>
        )}

        <StepPropertyInfo property={selectedBuilding} onNext={backToList} nextLabel="Xác nhận & Quay về danh sách" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Form tạo mới
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'create-form') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Back */}
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Bước 1 / 3 — Khởi tạo hồ sơ</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Khởi tạo tòa nhà mới</h1>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
            Điền thông tin định danh và cấu trúc vật lý của tòa nhà. Hợp đồng đầu vào và
            khai báo thiết bị sẽ được bổ sung ngay sau khi hồ sơ được tạo.
          </p>
        </div>

        {formError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="space-y-5">
          {/* ── Section 1: Định danh ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <Building className="h-4 w-4 text-indigo-500" /> Thông tin định danh
            </h3>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tên tòa nhà <span className="text-rose-500">*</span>
                </span>
                <input required name="propertyName" value={formData.propertyName} onChange={handleChange}
                  className="input-field" placeholder="VD: UrbanNest Quận 3 — tên nội bộ để nhận diện" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">
                  Địa chỉ <span className="text-rose-500">*</span>
                </span>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required name="address" value={formData.address} onChange={handleChange}
                    className="input-field pl-9"
                    placeholder="Số nhà, tên đường" />
                </div>
                <p className="mt-1 text-xs text-slate-400">Nhập đủ để hệ thống có thể định vị và hiển thị đúng trên bản đồ</p>
              </label>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">
                      Khu vực cấp 1 <span className="text-rose-500">*</span>
                    </span>
                    <select value={parentZoneId} onChange={handleParentZoneChange} className="input-field">
                      <option value="">-- Chọn tỉnh / thành phố --</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">
                      Khu vực cấp 2 <span className="text-rose-500">*</span>
                    </span>
                    <select
                      required
                      name="zoneId"
                      value={formData.zoneId}
                      onChange={handleChange}
                      disabled={!parentZoneId || childZonesLoading}
                      className="input-field disabled:opacity-50"
                    >
                      <option value="">
                        {childZonesLoading ? 'Đang tải...' : parentZoneId ? '-- Chọn quận / huyện --' : '-- Chọn cấp 1 trước --'}
                      </option>
                      {childZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>
                </div>

                {formData.zoneId && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {childZones.find(z => z.id === formData.zoneId)?.fullName ?? childZones.find(z => z.id === formData.zoneId)?.name}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tổng diện tích sàn (m²)</span>
                <input type="number" min={0} name="areaSize" value={formData.areaSize} onChange={handleChange}
                  className="input-field" placeholder="VD: 250" />
                <p className="mt-1 text-xs text-slate-400">Dùng để tính khấu hao & định giá</p>
              </label>
            </div>
          </div>

          {/* ── Section 2: Cấu trúc vật lý ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <Layers className="h-4 w-4 text-indigo-500" /> Cấu trúc vật lý
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Số tầng</span>
                <input type="number" min={1} name="floorCount" value={formData.floorCount}
                  onChange={handleChange} className="input-field" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tổng phòng</span>
                <input type="number" min={1} value={totalRoomsInput}
                  onChange={e => setTotalRoomsInput(Math.max(1, Number(e.target.value)))}
                  className="input-field" placeholder="VD: 12" />
                <p className="mt-1 text-xs text-slate-400">Xác nhận lại chính xác ở Bước 2</p>
              </label>
            </div>
          </div>

          {/* ── Section 3: Ghi chú nội bộ ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <ImageIcon className="h-4 w-4 text-indigo-500" /> Ghi chú & Hình ảnh
            </h3>

            <label className="block mb-4">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Ghi chú nội bộ</span>
              <textarea name="descriptions" value={formData.descriptions} onChange={handleChange}
                className="input-field min-h-[90px]"
                placeholder="Tiện ích nổi bật, tình trạng hiện tại, lưu ý đặc biệt cho đội vận hành..." />
              <p className="mt-1 text-xs text-slate-400">Chỉ hiển thị nội bộ — không công khai cho khách thuê</p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Ảnh tòa nhà</span>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-indigo-300 hover:bg-indigo-50/50 transition">
                <Upload className="h-7 w-7 text-slate-300" />
                <span className="text-sm font-semibold text-slate-500">
                  {isUploading ? 'Đang tải lên...' : 'Bấm để chọn ảnh hoặc kéo thả vào đây'}
                </span>
                <span className="text-xs text-slate-400">PNG, JPG — dùng cho hồ sơ nội bộ</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={isUploading} />
              </label>
              {(formData.imageUrls?.length ?? 0) > 0 && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {formData.imageUrls!.map((url, idx) => (
                    <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                        <button type="button" onClick={() => removeImage(idx)}
                          className="rounded-full bg-white p-1.5 text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </label>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={backToList}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button type="submit" disabled={submitting || isUploading}
              className="btn-primary flex items-center gap-2 rounded-xl px-8 py-2.5 text-sm shadow-lg shadow-indigo-500/20 disabled:opacity-50 font-bold">
              {submitting ? 'Đang khởi tạo...' : <><Plus className="h-4 w-4" /> Khởi tạo tòa nhà</>}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà (màn hình chính)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Khởi tạo tòa nhà</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Quản lý toàn bộ tòa nhà trong hệ thống</p>
        </div>
        <button onClick={() => setView('create-form')}
          className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5">
          <Plus className="h-5 w-5" /> Khởi tạo mới
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng tòa nhà" value={String(kpi.total)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Tổng phòng" value={String(kpi.rooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
        <KpiCard title="Đang nháp" value={String(kpi.draft)} icon={TrendingUp} color="bg-slate-50 text-slate-700" />
        <KpiCard title="Đang kinh doanh" value={String(kpi.active)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" placeholder="Tìm theo tên, địa chỉ..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp (DRAFT)</option>
          <option value="UNDER_RENOVATION">Đang cải tạo</option>
          <option value="PENDING_HOST_REVIEW">Chờ Host duyệt</option>
          <option value="ACTIVE">Đang kinh doanh</option>
          <option value="DISABLED">Đã vô hiệu</option>
        </select>
      </div>

      {listLoading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-semibold">Chưa có tòa nhà nào. Hãy tạo draft đầu tiên.</p>
          <button onClick={() => setView('create-form')}
            className="mt-4 btn-primary rounded-xl px-5 py-2.5 text-sm">
            Khởi tạo tòa nhà đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {filtered.map(b => {
            const badge = statusBadge[b.status] ?? statusBadge.DRAFT;
            const canDelete = b.status === 'DRAFT' || b.status === 'DISABLED';
            return (
              <div key={b.id} onClick={() => openDetail(b)} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300 hover:shadow-md transition relative group">
                <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity bg-white/80 p-1 rounded-lg backdrop-blur-sm z-10">
                  {b.status !== 'ACTIVE' && b.status !== 'DISABLED' && (
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!window.confirm('Vô hiệu hóa tòa nhà này?')) return;
                      try { await propertyService.disableProperty(b.id); fetchBuildings(); }
                      catch { alert('Lỗi'); }
                    }} title="Vô hiệu hóa" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={(e) => handleDeleteBuilding(b.id, e)} title="Xóa"
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3 pr-14">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 leading-tight">{b.propertyName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{b.fullAddress || b.shortAddress}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {b.zoneName && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{b.zoneName}</span>}
                  <span className="font-bold text-emerald-600">
                    {b.wholeHouse === null ? 'Chưa chọn loại' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                  {b.areaSize ? <span className="text-slate-500">{b.areaSize} m²</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-blue-50 py-2 text-blue-700">
                    <p className="font-black text-base leading-tight">{b.totalRooms || 0}</p>
                    <p className="mt-0.5">Tổng phòng</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2 text-emerald-700">
                    <p className="font-black text-sm leading-tight">{b.price ? Number(b.price).toLocaleString('vi-VN') : '—'}</p>
                    <p className="mt-0.5">Giá thuê</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2 text-amber-700">
                    <p className="font-black text-base leading-tight">
                      {b.renovationCompleted ? 'Xong' : b.hasRenovation ? 'Chưa xong' : '—'}
                    </p>
                    <p className="mt-0.5">Cải tạo</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  {b.status === 'UNDER_RENOVATION' && (
                    <button onClick={(e) => handleCompleteRenovation(b.id, e)}
                      className="w-full py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <Hammer className="w-4 h-4" /> Hoàn tất Cải tạo
                    </button>
                  )}
                  {b.status === 'PENDING_HOST_REVIEW' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Đang chờ Host phê duyệt
                    </div>
                  )}
                  {b.status === 'ACTIVE' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đang kinh doanh
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
