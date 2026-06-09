import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PropertyResponse } from '../../types/api.types';
import { adminOnboardingDraftService } from '../../services/admin-onboarding-draft.service';
import { propertyService } from '../../services/property.service';
import { KpiCard, SectionShell } from './shared';

const statusBadge: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-slate-100 text-slate-700' },
  ACTIVE: { label: 'Available', cls: 'bg-emerald-100 text-emerald-800' },
  MAINTENANCE: { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' },
  INACTIVE: { label: 'Ngừng hoạt động', cls: 'bg-rose-100 text-rose-800' },
};

const money = (value?: number) =>
  value ? new Intl.NumberFormat('vi-VN').format(value) : 'Chưa có';

export const BuildingRoomMonitoring = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [districtFilter, setDistrictFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await propertyService.getProperties(0, 100);
      setProperties(data.content);
    } catch (err) {
      console.error('Failed to fetch properties', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa căn nhà này?')) return;

    try {
      await propertyService.deleteProperty(id);
      fetchData();
    } catch {
      alert('Lỗi khi xóa căn nhà.');
    }
  };

  const uniqueDistricts = Array.from(new Set(properties.map(item => item.zoneName).filter(Boolean))).sort();

  const kpi = properties.reduce((acc, curr) => {
    const availability = adminOnboardingDraftService.getAvailability(curr);
    return {
      totalProperties: acc.totalProperties + 1,
      totalRooms: acc.totalRooms + (curr.totalRooms || 0),
      available: acc.available + (curr.status === 'ACTIVE' || availability.available ? 1 : 0),
      draft: acc.draft + (curr.status === 'DRAFT' && !availability.available ? 1 : 0),
    };
  }, { totalProperties: 0, totalRooms: 0, available: 0, draft: 0 });

  const filteredBuildings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return properties.filter(building => {
      const availability = adminOnboardingDraftService.getAvailability(building);
      const effectiveStatus = availability.available ? 'ACTIVE' : building.status;
      const matchDistrict = districtFilter === 'all' || building.zoneName === districtFilter;
      const matchStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
      const matchSearch = !keyword || [building.propertyName, building.shortAddress, building.fullAddress, building.zoneName]
        .some(value => value?.toLowerCase().includes(keyword));
      return matchDistrict && matchStatus && matchSearch;
    });
  }, [districtFilter, properties, search, statusFilter]);

  return (
    <SectionShell
      title="Quản lý nhà thuê của Admin"
      subtitle="Admin nhập hợp đồng gốc, cấu hình cải tạo, duyệt available rồi chuyển căn nhà sang Host vận hành."
      icon={Building2}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900">Dashboard tổng quan</h3>
          <p className="mt-1 text-sm text-slate-500">Role Admin chỉ xử lý onboarding nhà thuê. Host, Manager và Tenant dùng luồng riêng.</p>
        </div>
        <button onClick={() => navigate('/super-admin/properties/onboarding/new')} className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-2.5">
          <Plus className="h-5 w-5" /> Thêm nhà thuê
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng căn nhà" value={String(kpi.totalProperties)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Tổng phòng khai báo" value={String(kpi.totalRooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
        <KpiCard title="Available cho Host" value={String(kpi.available)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
        <KpiCard title="Đang nhập" value={String(kpi.draft)} icon={TrendingUp} color="bg-slate-50 text-slate-700" />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="input-field pl-9"
            placeholder="Tìm theo tên căn nhà, địa chỉ..."
          />
        </div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="input-field lg:w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="ACTIVE">Available</option>
          <option value="MAINTENANCE">Đang cải tạo</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
        <select value={districtFilter} onChange={event => setDistrictFilter(event.target.value)} className="input-field lg:w-52">
          <option value="all">Tất cả khu vực</option>
          {uniqueDistricts.map(district => <option key={district} value={district}>{district}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {filteredBuildings.map(building => {
            const availability = adminOnboardingDraftService.getAvailability(building);
            const effectiveStatus = availability.available ? 'ACTIVE' : building.status;
            const badge = statusBadge[effectiveStatus] || statusBadge.DRAFT;

            return (
              <article
                key={building.id}
                className="group relative rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md"
              >
                <div className="absolute right-3 top-3 z-10 flex gap-2 rounded-lg bg-white/90 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <button onClick={() => navigate(`/super-admin/properties/onboarding/${building.id}`)} className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50" title="Tiếp tục quy trình Admin">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={event => handleDelete(building.id, event)} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50" title="Xóa căn nhà">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3 pr-16">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold leading-tight text-slate-950">{building.propertyName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{building.fullAddress || building.shortAddress}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {building.zoneName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{building.zoneName}</span>
                  )}
                  <span className="text-slate-400">·</span>
                  <span className="font-bold text-emerald-600">
                    {availability.rentalMode === 'by_room' ? 'Cho thuê theo phòng' : 'Nhà nguyên căn'}
                  </span>
                  {building.areaSize && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{building.areaSize} m2</span>
                    </>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-blue-50 py-2.5 text-blue-700">
                    <p className="text-base font-black leading-tight">{building.totalRooms || 0}</p>
                    <p className="mt-0.5">Số phòng</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2.5 text-emerald-700">
                    <p className="truncate text-base font-black leading-tight">{money(building.price)}</p>
                    <p className="mt-0.5">Giá thuê</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2.5 text-amber-700">
                    <p className="truncate text-base font-black leading-tight">{money(building.deposit)}</p>
                    <p className="mt-0.5">Tiền cọc</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <button
                    onClick={() => navigate(`/super-admin/properties/onboarding/${building.id}`)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 py-2.5 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-600 hover:text-white"
                  >
                    {effectiveStatus === 'ACTIVE' ? 'Xem cấu hình Admin' : 'Tiếp tục nhập & duyệt'}
                    <TrendingUp className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && filteredBuildings.length === 0 && (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm font-semibold">Không tìm thấy căn nhà phù hợp bộ lọc.</p>
        </div>
      )}
    </SectionShell>
  );
};
