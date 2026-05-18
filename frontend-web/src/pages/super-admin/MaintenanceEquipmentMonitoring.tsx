import { Wrench } from 'lucide-react';
import { PLATFORM_EQUIPMENT_ROWS, PLATFORM_HOSTS, PLATFORM_MAINTENANCE_REQUESTS } from '../../utils/superAdminMockData';
import {
  SectionShell,
  StatusPill,
  equipmentStatusMap,
  formatVnd,
  maintenanceStatusMap,
} from './shared';

const ownerByBusiness = Object.fromEntries(PLATFORM_HOSTS.map(h => [h.businessName, h.ownerName]));

export const MaintenanceEquipmentMonitoring = () => {
  return (
    <SectionShell
      title="Maintenance & Equipment Monitoring"
      subtitle="Theo dõi yêu cầu bảo trì, tiến độ xử lý, danh mục thiết bị và QR code"
      icon={Wrench}
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="font-bold text-slate-900">Maintenance requests</h3>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Host / Building</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PLATFORM_MAINTENANCE_REQUESTS.map(request => (
                  <tr key={request.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-bold text-slate-900">{request.code}</p><p className="line-clamp-1 text-xs text-slate-500">{request.title}</p></td>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{ownerByBusiness[request.hostName] ?? request.hostName}</p><p className="text-xs text-slate-500">{request.propertyName} {request.roomCode ? `· ${request.roomCode}` : ''}</p></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{request.assignedManagerName ?? 'Chưa gán'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{request.estimatedCost ? formatVnd(request.estimatedCost) : 'N/A'}</td>
                    <td className="px-4 py-3"><StatusPill label={maintenanceStatusMap[request.status].label} color={maintenanceStatusMap[request.status].color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="font-bold text-slate-900">Equipment registry & QR</h3>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Equipment</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">QR payload</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PLATFORM_EQUIPMENT_ROWS.map(item => {
                  const status = equipmentStatusMap[item.status] ?? equipmentStatusMap.good;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><p className="font-bold text-slate-900">{item.name}</p><p className="font-mono text-xs text-slate-500">{item.code}</p></td>
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{ownerByBusiness[item.hostName] ?? item.hostName}</p><p className="text-xs text-slate-500">{item.buildingName} · {item.roomCode}</p></td>
                      <td className="px-4 py-3 font-mono text-xs text-cyan-700">{item.qrPayload}</td>
                      <td className="px-4 py-3"><StatusPill label={status.label} color={status.color} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionShell>
  );
};
