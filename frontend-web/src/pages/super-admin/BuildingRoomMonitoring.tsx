import { useMemo, useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  MapPin,
  Search,
  TrendingUp,
  User,
  Wrench,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { KpiCard, SectionShell } from './shared';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse } from '../../types/api.types';
import { PropertyFormModal } from './buildings/PropertyFormModal';

export const BuildingRoomMonitoring = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyResponse | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [propsData] = await Promise.all([
        propertyService.getProperties(0, 100),
      ]);
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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn xóa Tòa nhà này?')) return;
    try {
      await propertyService.deleteProperty(id);
      fetchData();
    } catch (err) {
      alert('Lỗi khi xóa tòa nhà');
    }
  };

  // derived data
  const uniqueOwners = Array.from(new Set(properties.map(p => p.ownerId)));
  const uniqueDistricts = Array.from(new Set(properties.map(p => p.zoneFullName))).sort();

  // Aggregate KPI from properties directly since we have the full data
  const kpi = properties.reduce((acc, curr) => {
    const occupied = curr.rooms?.filter(r => r.status === 'RENTED').length || 0;
    const maintenance = curr.rooms?.filter(r => r.status === 'MAINTENANCE').length || 0;
    return {
      totalProperties: acc.totalProperties + 1,
      totalRooms: acc.totalRooms + curr.totalRooms,
      totalOccupied: acc.totalOccupied + occupied,
      totalMaintenance: acc.totalMaintenance + maintenance,
    };
  }, { totalProperties: 0, totalRooms: 0, totalOccupied: 0, totalMaintenance: 0 });

  const occupancyRate = kpi.totalRooms > 0 ? Math.round((kpi.totalOccupied / kpi.totalRooms) * 100) : 0;

  const occupancyColor = (rate: number) => {
    if (rate >= 80) return 'bg-emerald-500';
    if (rate >= 50) return 'bg-cyan-500';
    return 'bg-amber-400';
  };

  const occupancyBadgeColor = (rate: number) => {
    if (rate >= 80) return 'bg-emerald-100 text-emerald-800';
    if (rate >= 50) return 'bg-cyan-100 text-cyan-800';
    if (rate === 0) return 'bg-slate-100 text-slate-600';
    return 'bg-amber-100 text-amber-800';
  };

  const filteredBuildings = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return properties.filter(b => {
      const matchOwner = ownerFilter === 'all' || b.ownerId === ownerFilter;
      const matchDistrict = districtFilter === 'all' || b.zoneFullName === districtFilter;
      const matchSearch = !kw || [b.title, b.address, b.zoneFullName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchOwner && matchDistrict && matchSearch;
    });
  }, [properties, ownerFilter, districtFilter, search]);

  return (
    <>
      <SectionShell
        title="Quản lý Tòa nhà & Phòng"
        subtitle="Giám sát toàn bộ tòa nhà, tỷ lệ lấp đầy và tình trạng phòng trên toàn hệ thống"
        icon={Building2}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Dashboard Tổng quan</h3>
          <button onClick={() => { setSelectedProperty(null); setIsFormOpen(true); }} className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5">
            <Plus className="h-5 w-5" /> Thêm Tòa nhà
          </button>
        </div>

        {/* KPI summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard title="Tổng tòa nhà" value={String(kpi.totalProperties)} icon={Building2} color="bg-blue-50 text-blue-700" />
          <KpiCard title="Tổng phòng" value={String(kpi.totalRooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
          <KpiCard title="Tỷ lệ lấp đầy" value={`${occupancyRate}%`} icon={TrendingUp} color="bg-emerald-50 text-emerald-700" />
        </div>

        {/* Room status bar */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-700">Đang thuê</p>
              <p className="text-xl font-black text-emerald-900">{kpi.totalOccupied} <span className="text-sm font-semibold">phòng</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <DoorOpen className="h-5 w-5 text-slate-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-600">Trống</p>
              <p className="text-xl font-black text-slate-800">{kpi.totalRooms - kpi.totalOccupied - kpi.totalMaintenance} <span className="text-sm font-semibold">phòng</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Wrench className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-700">Bảo trì</p>
              <p className="text-xl font-black text-amber-900">{kpi.totalMaintenance} <span className="text-sm font-semibold">phòng</span></p>
            </div>
          </div>
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
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="input-field w-56">
            <option value="all">Tất cả chủ nhà</option>
            {uniqueOwners.map(id => <option key={id} value={id}>Chủ nhà ID: {id}</option>)}
          </select>
          <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)} className="input-field w-44">
            <option value="all">Tất cả khu vực</option>
            {uniqueDistricts.filter(Boolean).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Building cards */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {filteredBuildings.map(building => {
              const occupiedRooms = building.rooms?.filter(r => r.status === 'RENTED').length || 0;
              const maintenanceRooms = building.rooms?.filter(r => r.status === 'MAINTENANCE').length || 0;
              const available = building.totalRooms - occupiedRooms - maintenanceRooms;
              const rate = building.totalRooms > 0 ? Math.round((occupiedRooms / building.totalRooms) * 100) : 0;
              
              return (
                <div
                  key={building.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md relative group"
                >
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity bg-white/80 p-1 rounded-lg backdrop-blur-sm">
                    <button onClick={() => { setSelectedProperty(building); setIsFormOpen(true); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md"><Pencil className="w-4 h-4" /></button>
                    <button onClick={(e) => handleDelete(building.id, e)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  <div className="flex items-start justify-between gap-3 pr-16">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-slate-950 leading-tight">{building.title}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{building.address}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${occupancyBadgeColor(rate)}`}>{rate}%</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{building.zoneFullName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 text-emerald-600 font-bold">{building.isWholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1 truncate"><User className="h-3 w-3 shrink-0" />Chủ nhà ID: {building.ownerId}</span>
                  </div>

                  <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                    <div className={`h-1.5 rounded-full transition-all ${occupancyColor(rate)}`} style={{ width: `${rate}%` }} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-emerald-50 py-2 text-emerald-700">
                      <p className="font-black text-base leading-tight">{occupiedRooms}</p>
                      <p className="mt-0.5">Đang thuê</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-2 text-slate-600">
                      <p className="font-black text-base leading-tight">{available}</p>
                      <p className="mt-0.5">Trống</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-2 text-amber-700">
                      <p className="font-black text-base leading-tight">{maintenanceRooms}</p>
                      <p className="mt-0.5">Bảo trì</p>
                    </div>
                  </div>
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
