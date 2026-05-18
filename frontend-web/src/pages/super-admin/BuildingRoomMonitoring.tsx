import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, CreditCard, DoorOpen, Wrench, X } from 'lucide-react';
import { PLATFORM_BUILDINGS, PLATFORM_CONTRACTS, PLATFORM_EQUIPMENT_ROWS, PLATFORM_HOSTS } from '../../utils/superAdminMockData';
import { KpiCard, SectionShell, formatShortVnd, formatVnd } from './shared';

type BuildingRow = (typeof PLATFORM_BUILDINGS)[number];

export const BuildingRoomMonitoring = () => {
  const [hostFilter, setHostFilter] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingRow | null>(null);

  const uniqueHosts = PLATFORM_HOSTS.map(host => host.businessName);
  const allRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.totalRooms, 0);
  const occupiedRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.occupiedRooms, 0);
  const maintenanceRooms = PLATFORM_BUILDINGS.reduce((sum, building) => sum + building.maintenanceRooms, 0);

  const filteredBuildings = useMemo(() => {
    return PLATFORM_BUILDINGS.filter(building => hostFilter === 'all' || building.hostName === hostFilter);
  }, [hostFilter]);

  return (
    <>
      <SectionShell
        title="Building & Room Monitoring"
        subtitle="Xem tất cả buildings, rooms, managers, tenants, contracts và equipment trên toàn nền tảng"
        icon={Building2}
        action={
          <select value={hostFilter} onChange={event => setHostFilter(event.target.value)} className="input-field w-56">
            <option value="all">Tất cả Host</option>
            {uniqueHosts.map(hostName => <option key={hostName} value={hostName}>{hostName}</option>)}
          </select>
        }
      >
        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-blue-50 p-4 text-blue-800"><p className="text-2xl font-black">{allRooms}</p><p className="text-xs font-bold">Total Rooms</p></div>
          <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800"><p className="text-2xl font-black">{occupiedRooms}</p><p className="text-xs font-bold">Occupied</p></div>
          <div className="rounded-xl bg-slate-50 p-4 text-slate-800"><p className="text-2xl font-black">{allRooms - occupiedRooms - maintenanceRooms}</p><p className="text-xs font-bold">Available</p></div>
          <div className="rounded-xl bg-amber-50 p-4 text-amber-800"><p className="text-2xl font-black">{maintenanceRooms}</p><p className="text-xs font-bold">Maintenance</p></div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {filteredBuildings.map(building => {
            const available = building.totalRooms - building.occupiedRooms - building.maintenanceRooms;
            const rate = Math.round((building.occupiedRooms / building.totalRooms) * 100);
            return (
              <button
                key={building.id}
                onClick={() => setSelectedBuilding(building)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-950">{building.buildingName}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">{building.address}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{building.hostName} · {building.managerName}</p>
                  </div>
                  <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-black text-cyan-800">{rate}%</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${rate}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 py-2 text-emerald-700"><p className="font-black">{building.occupiedRooms}</p><p>Occupied</p></div>
                  <div className="rounded-lg bg-slate-50 py-2 text-slate-700"><p className="font-black">{available}</p><p>Available</p></div>
                  <div className="rounded-lg bg-amber-50 py-2 text-amber-700"><p className="font-black">{building.maintenanceRooms}</p><p>Maintain</p></div>
                </div>
                <p className="mt-4 text-sm font-bold text-emerald-700">{formatVnd(building.monthlyRevenue)}/tháng</p>
              </button>
            );
          })}
        </div>
      </SectionShell>

      {selectedBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Đóng modal" className="absolute inset-0 bg-slate-950/50" onClick={() => setSelectedBuilding(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-black text-slate-950">{selectedBuilding.buildingName}</h3>
                <p className="text-sm text-slate-500">{selectedBuilding.address}</p>
              </div>
              <button onClick={() => setSelectedBuilding(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <KpiCard title="Rooms" value={String(selectedBuilding.totalRooms)} icon={DoorOpen} color="bg-blue-50 text-blue-700" />
                <KpiCard title="Occupied" value={String(selectedBuilding.occupiedRooms)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
                <KpiCard title="Maintenance" value={String(selectedBuilding.maintenanceRooms)} icon={Wrench} color="bg-amber-50 text-amber-700" />
                <KpiCard title="Revenue" value={formatShortVnd(selectedBuilding.monthlyRevenue)} icon={CreditCard} color="bg-cyan-50 text-cyan-700" />
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900">Thông tin giám sát</p>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <p><span className="font-semibold text-slate-500">Host:</span> {selectedBuilding.hostName}</p>
                  <p><span className="font-semibold text-slate-500">Manager:</span> {selectedBuilding.managerName}</p>
                  <p><span className="font-semibold text-slate-500">Contracts:</span> {PLATFORM_CONTRACTS.filter(c => c.buildingName === selectedBuilding.buildingName).length}</p>
                  <p><span className="font-semibold text-slate-500">Equipment:</span> {PLATFORM_EQUIPMENT_ROWS.filter(e => e.buildingName === selectedBuilding.buildingName).length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
