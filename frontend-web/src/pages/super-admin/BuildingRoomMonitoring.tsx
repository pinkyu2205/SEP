import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  DoorOpen,
  MapPin,
  Search,
  TrendingUp,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { PLATFORM_BUILDINGS, PLATFORM_CONTRACTS, PLATFORM_EQUIPMENT_ROWS, PLATFORM_HOSTS } from '../../utils/superAdminMockData';
import { KpiCard, SectionShell, StatusPill, formatShortVnd, formatVnd } from './shared';

type BuildingRow = (typeof PLATFORM_BUILDINGS)[number];

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

export const BuildingRoomMonitoring = () => {
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingRow | null>(null);

  const uniqueOwners = Array.from(new Set(PLATFORM_BUILDINGS.map(b => b.ownerName)));
  const uniqueDistricts = Array.from(new Set(PLATFORM_BUILDINGS.map(b => b.district))).sort();

  const totalRooms = PLATFORM_BUILDINGS.reduce((s, b) => s + b.totalRooms, 0);
  const totalOccupied = PLATFORM_BUILDINGS.reduce((s, b) => s + b.occupiedRooms, 0);
  const totalMaintenance = PLATFORM_BUILDINGS.reduce((s, b) => s + b.maintenanceRooms, 0);
  const totalRevenue = PLATFORM_BUILDINGS.reduce((s, b) => s + b.monthlyRevenue, 0);
  const occupancyRate = Math.round((totalOccupied / totalRooms) * 100);

  const filteredBuildings = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return PLATFORM_BUILDINGS.filter(b => {
      const matchOwner = ownerFilter === 'all' || b.ownerName === ownerFilter;
      const matchDistrict = districtFilter === 'all' || b.district === districtFilter;
      const matchSearch = !kw || [b.buildingName, b.address, b.managerName, b.ownerName, b.district]
        .some(v => v.toLowerCase().includes(kw));
      return matchOwner && matchDistrict && matchSearch;
    });
  }, [ownerFilter, districtFilter, search]);

  const selectedContracts = selectedBuilding
    ? PLATFORM_CONTRACTS.filter(c => c.buildingName === selectedBuilding.buildingName)
    : [];
  const selectedEquipment = selectedBuilding
    ? PLATFORM_EQUIPMENT_ROWS.filter(e => e.buildingName === selectedBuilding.buildingName)
    : [];

  const hostOfSelected = selectedBuilding
    ? PLATFORM_HOSTS.find(h => h.businessName === selectedBuilding.hostName)
    : null;

  return (
    <>
      <SectionShell
        title="Buildings & Rooms"
        subtitle="Giám sát toàn bộ tòa nhà, tỷ lệ lấp đầy, doanh thu và tình trạng phòng trên toàn hệ thống"
        icon={Building2}
      >
        {/* KPI summary */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Tổng tòa nhà" value={String(PLATFORM_BUILDINGS.length)} icon={Building2} color="bg-blue-50 text-blue-700" />
          <KpiCard title="Tổng phòng" value={String(totalRooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
          <KpiCard title="Tỷ lệ lấp đầy" value={`${occupancyRate}%`} icon={TrendingUp} color="bg-emerald-50 text-emerald-700" />
          <KpiCard title="Doanh thu/tháng" value={formatShortVnd(totalRevenue)} icon={CreditCard} color="bg-cyan-50 text-cyan-700" />
        </div>

        {/* Room status bar */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-700">Đang thuê</p>
              <p className="text-xl font-black text-emerald-900">{totalOccupied} <span className="text-sm font-semibold">phòng</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <DoorOpen className="h-5 w-5 text-slate-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-600">Trống</p>
              <p className="text-xl font-black text-slate-800">{totalRooms - totalOccupied - totalMaintenance} <span className="text-sm font-semibold">phòng</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Wrench className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-700">Bảo trì</p>
              <p className="text-xl font-black text-amber-900">{totalMaintenance} <span className="text-sm font-semibold">phòng</span></p>
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
              placeholder="Tìm theo tên tòa nhà, địa chỉ, quản lý..."
            />
          </div>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="input-field w-56">
            <option value="all">Tất cả chủ nhà</option>
            {uniqueOwners.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)} className="input-field w-44">
            <option value="all">Tất cả khu vực</option>
            {uniqueDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Building cards */}
        <div className="grid gap-4 xl:grid-cols-3">
          {filteredBuildings.map(building => {
            const available = building.totalRooms - building.occupiedRooms - building.maintenanceRooms;
            const rate = building.totalRooms > 0 ? Math.round((building.occupiedRooms / building.totalRooms) * 100) : 0;
            return (
              <button
                key={building.id}
                onClick={() => setSelectedBuilding(building)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 leading-tight">{building.buildingName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{building.address}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${occupancyBadgeColor(rate)}`}>{rate}%</span>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{building.district}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{building.floors} tầng</span>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{building.ownerName}</span>
                  <span className="text-slate-300">→</span>
                  <span className="text-slate-500 truncate">{building.managerName}</span>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                  <div className={`h-1.5 rounded-full transition-all ${occupancyColor(rate)}`} style={{ width: `${rate}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 py-2 text-emerald-700">
                    <p className="font-black text-base leading-tight">{building.occupiedRooms}</p>
                    <p className="mt-0.5">Đang thuê</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2 text-slate-600">
                    <p className="font-black text-base leading-tight">{available}</p>
                    <p className="mt-0.5">Trống</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2 text-amber-700">
                    <p className="font-black text-base leading-tight">{building.maintenanceRooms}</p>
                    <p className="mt-0.5">Bảo trì</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-bold text-emerald-700">{formatVnd(building.monthlyRevenue)}<span className="text-xs font-normal text-slate-500">/tháng</span></span>
                  <span className="text-xs text-slate-400">{building.tenantCount} khách thuê</span>
                </div>
              </button>
            );
          })}
        </div>

        {filteredBuildings.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">Không tìm thấy tòa nhà phù hợp bộ lọc.</p>
          </div>
        )}
      </SectionShell>

      {/* Detail modal */}
      {selectedBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50" onClick={() => setSelectedBuilding(null)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white p-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-950">{selectedBuilding.buildingName}</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{selectedBuilding.district}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {selectedBuilding.address}
                </p>
              </div>
              <button onClick={() => setSelectedBuilding(null)} className="ml-4 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {/* KPIs */}
              <div className="grid gap-3 sm:grid-cols-4">
                <KpiCard title="Tổng phòng" value={String(selectedBuilding.totalRooms)} icon={DoorOpen} color="bg-blue-50 text-blue-700" />
                <KpiCard title="Đang thuê" value={String(selectedBuilding.occupiedRooms)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
                <KpiCard title="Bảo trì" value={String(selectedBuilding.maintenanceRooms)} icon={Wrench} color="bg-amber-50 text-amber-700" />
                <KpiCard title="Doanh thu" value={formatShortVnd(selectedBuilding.monthlyRevenue)} icon={CreditCard} color="bg-cyan-50 text-cyan-700" />
              </div>

              {/* Building info */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-bold text-slate-900">Thông tin tòa nhà</p>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Chủ nhà (Host)</p>
                    <p className="font-semibold text-slate-800">{selectedBuilding.ownerName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Quản lý (Manager)</p>
                    <p className="font-semibold text-slate-800">{selectedBuilding.managerName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Khu vực</p>
                    <p className="font-semibold text-slate-800">{selectedBuilding.district}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-0.5">Số tầng</p>
                    <p className="font-semibold text-slate-800">{selectedBuilding.floors} tầng</p>
                  </div>
                </div>
              </div>

              {/* Occupancy bar */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-900">Tỷ lệ lấp đầy</p>
                  <span className="text-sm font-black text-slate-800">
                    {selectedBuilding.totalRooms > 0 ? Math.round((selectedBuilding.occupiedRooms / selectedBuilding.totalRooms) * 100) : 0}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className={`h-3 rounded-full ${occupancyColor(selectedBuilding.totalRooms > 0 ? Math.round((selectedBuilding.occupiedRooms / selectedBuilding.totalRooms) * 100) : 0)}`}
                    style={{ width: `${selectedBuilding.totalRooms > 0 ? Math.round((selectedBuilding.occupiedRooms / selectedBuilding.totalRooms) * 100) : 0}%` }}
                  />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Đang thuê: {selectedBuilding.occupiedRooms}</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />Trống: {selectedBuilding.totalRooms - selectedBuilding.occupiedRooms - selectedBuilding.maintenanceRooms}</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Bảo trì: {selectedBuilding.maintenanceRooms}</span>
                </div>
              </div>

              {/* Contracts & Equipment summary */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-indigo-500" />
                    <p className="text-sm font-bold text-slate-900">Hợp đồng</p>
                  </div>
                  <p className="text-2xl font-black text-indigo-700">{selectedContracts.length}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedContracts.filter(c => c.status === 'active').length} đang hiệu lực
                    {selectedContracts.filter(c => c.status === 'pending').length > 0 &&
                      ` · ${selectedContracts.filter(c => c.status === 'pending').length} chờ duyệt`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Wrench className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-bold text-slate-900">Thiết bị</p>
                  </div>
                  <p className="text-2xl font-black text-amber-700">{selectedEquipment.length}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedEquipment.filter(e => e.status === 'good').length} hoạt động tốt
                    {selectedEquipment.filter(e => e.status === 'maintenance').length > 0 &&
                      ` · ${selectedEquipment.filter(e => e.status === 'maintenance').length} đang bảo trì`}
                  </p>
                </div>
              </div>

              {/* Host info */}
              {hostOfSelected && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">THÔNG TIN HOST</p>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-bold text-slate-900">{hostOfSelected.ownerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{hostOfSelected.email} · {hostOfSelected.phone}</p>
                    </div>
                    <StatusPill
                      label={hostOfSelected.status === 'active' ? 'Đang hoạt động' : hostOfSelected.status === 'suspended' ? 'Tạm ngưng' : 'Chờ duyệt'}
                      color={hostOfSelected.status === 'active' ? 'bg-emerald-100 text-emerald-700' : hostOfSelected.status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}
                      dot={hostOfSelected.status === 'active' ? 'bg-emerald-500' : hostOfSelected.status === 'suspended' ? 'bg-rose-500' : 'bg-amber-500'}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
