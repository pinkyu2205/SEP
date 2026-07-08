import { useEffect, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { maintenanceService } from '@/services/maintenance.service';
import type { MaintenanceRequestResponse } from '@/types/api.types';
import { normalizeMaintenanceStatus } from '@/utils';
import { PLATFORM_EQUIPMENT_ROWS } from '@/utils/adminMockData';
import {
  SectionShell,
  StatusPill,
  equipmentStatusMap,
  formatVnd,
  maintenanceStatusMap,
} from './shared';

// BE trả PENDING/IN_PROGRESS/RESOLVED/CANCELLED → key của maintenanceStatusMap.
const statusKey = (s: string): string => {
  const n = normalizeMaintenanceStatus(s);
  return n === 'PENDING' ? 'open' : n.toLowerCase();
};

export const MaintenanceEquipmentMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<MaintenanceRequestResponse[]>([]);

  useEffect(() => {
    let cancelled = false;
    maintenanceService.getRequests({}, 0, 100)
      .then(page => { if (!cancelled) setRequests(page.content ?? []); })
      .catch(() => { if (!cancelled) setRequests([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
                  <th className="px-4 py-3">Property / Room</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-300" />
                  </td></tr>
                )}
                {!loading && requests.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    Chưa có yêu cầu bảo trì nào.
                  </td></tr>
                )}
                {!loading && requests.map(request => {
                  const s = maintenanceStatusMap[statusKey(request.status)] ?? maintenanceStatusMap.open;
                  return (
                    <tr key={request.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{request.requestCode}</p>
                        <p className="line-clamp-1 text-xs text-slate-500">{request.equipmentName ?? request.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{request.propertyName}</p>
                        <p className="text-xs text-slate-500">{request.roomName}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{request.assignedManagerName ?? 'Chưa gán'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{request.repairCost != null ? formatVnd(request.repairCost) : 'N/A'}</td>
                      <td className="px-4 py-3"><StatusPill label={s.label} color={s.color} /></td>
                    </tr>
                  );
                })}
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
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{item.buildingName}</p><p className="text-xs text-slate-500">{item.roomCode}</p></td>
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
