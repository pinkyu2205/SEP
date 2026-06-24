import { useMemo, useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  MapPin,
  Search,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Hammer,
  Clock,
  XCircle,
  Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { KpiCard, SectionShell } from './shared';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse } from '../../types/api.types';
import { PropertyFormModal } from './buildings/PropertyFormModal';

const statusBadge: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-slate-100 text-slate-700' },
  UNDER_RENOVATION: { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' },
  PENDING_HOST_REVIEW: { label: 'Chờ Host duyệt', cls: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: 'Đang kinh doanh', cls: 'bg-emerald-100 text-emerald-800' },
  RENTED: { label: 'Đã cho thuê', cls: 'bg-blue-100 text-blue-800' },
  DISABLED: { label: 'Đã vô hiệu', cls: 'bg-rose-100 text-rose-800' },
  // Legacy
  MAINTENANCE: { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' },
  INACTIVE: { label: 'Ngừng hoạt động', cls: 'bg-rose-100 text-rose-800' },
};

export const BuildingRoomMonitoring = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [districtFilter, setDistrictFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Navigation
  const navigate = useNavigate();

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyResponse | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const propsData = await propertyService.getProperties(0, 100);
      setProperties(propsData.content);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa Tòa nhà này?')) return;
    try {
      await propertyService.deleteProperty(id);
      fetchData();
    } catch (err) {
      alert('Lỗi khi xóa tòa nhà');
    }
  };

  const handleCompleteRenovation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Xác nhận cải tạo đã hoàn tất?')) return;
    try {
      await propertyService.completeRenovation(id);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi hoàn tất cải tạo');
    }
  };

  const handleDisable = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn vô hiệu hóa Tòa nhà này?')) return;
    try {
      await propertyService.disableProperty(id);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi khi vô hiệu hóa');
    }
  };

  // Derived data
  const uniqueDistricts = Array.from(new Set(properties.map(p => p.zoneName).filter(Boolean))).sort();

  // Aggregate KPI
  const kpi = properties.reduce((acc, curr) => ({
    totalProperties: acc.totalProperties + 1,
    totalRooms: acc.totalRooms + (curr.totalRooms || 0),
    active: acc.active + (curr.status === 'ACTIVE' ? 1 : 0),
    draft: acc.draft + (curr.status === 'DRAFT' ? 1 : 0),
    pendingReview: acc.pendingReview + (curr.status === 'PENDING_HOST_REVIEW' ? 1 : 0),
    underRenovation: acc.underRenovation + (curr.status === 'UNDER_RENOVATION' ? 1 : 0),
  }), { totalProperties: 0, totalRooms: 0, active: 0, draft: 0, pendingReview: 0, underRenovation: 0 });

  const filteredBuildings = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return properties.filter(b => {
      const matchDistrict = districtFilter === 'all' || b.zoneName === districtFilter;
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchDistrict && matchStatus && matchSearch;
    });
  }, [properties, districtFilter, statusFilter, search]);

  const renderActionButton = (building: PropertyResponse) => {
    switch (building.status) {
      case 'DRAFT':
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/buildings/configuration/${building.id}`); }}
            className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors rounded-xl font-bold text-sm flex justify-center items-center gap-2">
            Tiếp tục Cấu hình <TrendingUp className="w-4 h-4" />
          </button>
        );
      case 'UNDER_RENOVATION':
        return (
          <button onClick={(e) => handleCompleteRenovation(building.id, e)}
            className="w-full py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition-colors rounded-xl font-bold text-sm flex justify-center items-center gap-2">
            <Hammer className="w-4 h-4" /> Hoàn tất Cải tạo
          </button>
        );
      case 'PENDING_HOST_REVIEW':
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/host/review/${building.id}`); }}
            className="w-full py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-colors rounded-xl font-bold text-sm flex justify-center items-center gap-2">
            <Eye className="w-4 h-4" /> Xem tóm tắt & Duyệt giá
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <SectionShell
        title="Quản lý Tòa nhà & Phòng"
        subtitle="Giám sát toàn bộ tòa nhà, tình trạng và quy trình onboarding trên toàn hệ thống"
        icon={Building2}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Dashboard Tổng quan</h3>
          <button onClick={() => { setSelectedProperty(null); setIsFormOpen(true); }} className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5">
            <Plus className="h-5 w-5" /> Thêm Tòa nhà
          </button>
        </div>

        {/* KPI summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard title="Tổng tòa nhà" value={String(kpi.totalProperties)} icon={Building2} color="bg-blue-50 text-blue-700" />
          <KpiCard title="Tổng phòng" value={String(kpi.totalRooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
          <KpiCard title="Đang kinh doanh" value={String(kpi.active)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
          <KpiCard title="Đang nháp" value={String(kpi.draft)} icon={TrendingUp} color="bg-slate-50 text-slate-700" />
          <KpiCard title="Chờ Host duyệt" value={String(kpi.pendingReview)} icon={Clock} color="bg-blue-50 text-blue-700" />
          <KpiCard title="Đang cải tạo" value={String(kpi.underRenovation)} icon={Hammer} color="bg-amber-50 text-amber-700" />
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9"
              placeholder="Tìm theo tên tòa nhà, địa chỉ..."
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
            <option value="all">Tất cả trạng thái</option>
            <option value="DRAFT">Nháp</option>
            <option value="UNDER_RENOVATION">Đang cải tạo</option>
            <option value="PENDING_HOST_REVIEW">Chờ Host duyệt</option>
            <option value="ACTIVE">Đang kinh doanh</option>
            <option value="RENTED">Đã cho thuê</option>
            <option value="DISABLED">Đã vô hiệu</option>
          </select>
          <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)} className="input-field w-44">
            <option value="all">Tất cả khu vực</option>
            {uniqueDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Building cards */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {filteredBuildings.map(building => {
              const badge = statusBadge[building.status] || statusBadge.DRAFT;
              const canDelete = building.status === 'DRAFT' || building.status === 'DISABLED';

              return (
                <div
                  key={building.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md relative group"
                >
                  {/* Action buttons (hover) */}
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex gap-1.5 transition-opacity bg-white/80 p-1 rounded-lg backdrop-blur-sm z-10">
                    {building.status === 'DRAFT' && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/buildings/configuration/${building.id}`); }} title="Cấu hình" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {building.status !== 'ACTIVE' && building.status !== 'RENTED' && building.status !== 'DISABLED' && (
                      <button onClick={(e) => handleDisable(building.id, e)} title="Vô hiệu hóa" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={(e) => handleDelete(building.id, e)} title="Xóa" className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 pr-16">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-slate-950 leading-tight">{building.propertyName}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{building.fullAddress || building.shortAddress}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
                  </div>

                  {/* Tags */}
                  <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
                    {building.zoneName && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{building.zoneName}</span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-emerald-600">
                      {building.wholeHouse === null ? 'Chưa chọn loại' : building.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                    </span>
                    {building.areaSize && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{building.areaSize} m²</span>
                      </>
                    )}
                    {(building.totalFloor ?? building.floorCount) ? (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{building.totalFloor ?? building.floorCount} tầng</span>
                      </>
                    ) : null}
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-blue-50 py-2.5 text-blue-700">
                      <p className="font-black text-base leading-tight">{building.totalRooms || 0}</p>
                      <p className="mt-0.5">Tổng phòng</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 py-2.5 text-emerald-700">
                      <p className="font-black text-base leading-tight">{building.price ? Number(building.price).toLocaleString('vi-VN') : '—'}</p>
                      <p className="mt-0.5">Giá thuê</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-2.5 text-amber-700">
                      <p className="font-black text-base leading-tight">
                        {building.renovationCompleted === false && building.hasRenovation ? 'Chưa xong' : building.renovationCompleted ? 'Đã xong' : '—'}
                      </p>
                      <p className="mt-0.5">Cải tạo</p>
                    </div>
                  </div>

                  {/* Status-based Action */}
                  {renderActionButton(building) && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      {renderActionButton(building)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredBuildings.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">Không tìm thấy tòa nhà phù hợp bộ lọc.</p>
          </div>
        )}
      </SectionShell>

      {isFormOpen && (
        <PropertyFormModal
          initialData={selectedProperty}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            setIsFormOpen(false);
            fetchData();
          }}
        />
      )}
    </>
  );
};
