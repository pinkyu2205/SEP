import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { PlatformAccountStatus } from '../../types';
import { PLATFORM_HOSTS } from '../../utils/superAdminMockData';
import { SectionShell, StatusPill, accountStatusMap, formatVnd } from './shared';

export const HostManagement = () => {
  const [hosts, setHosts] = useState(PLATFORM_HOSTS);

  const updateHostStatus = (hostId: string, status: PlatformAccountStatus) => {
    setHosts(prev => prev.map(host => host.id === hostId ? { ...host, status } : host));
  };

  return (
    <SectionShell
      title="Host/Admin System Management"
      subtitle="Phê duyệt, từ chối, tạm ngưng, khôi phục và theo dõi hiệu suất Host"
      icon={ShieldCheck}
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Host/Admin System</th>
              <th className="px-4 py-3">Quy mô</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Unpaid</th>
              <th className="px-4 py-3">Performance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {hosts.map(host => {
              const status = accountStatusMap[host.status];
              return (
                <tr key={host.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{host.ownerName}</p>
                    <p className="text-xs text-slate-500">{host.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {host.buildings} buildings · {host.rooms} rooms · {host.managers} managers · {host.tenants} tenants
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{formatVnd(host.monthlyRevenue)}</td>
                  <td className="px-4 py-3">
                    <span className={host.unpaidBills > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{host.unpaidBills}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${host.performanceScore >= 85 ? 'bg-emerald-500' : host.performanceScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${host.performanceScore}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700">{host.performanceScore || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusPill label={status.label} color={status.color} dot={status.dot} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {host.status === 'pending_approval' && (
                        <>
                          <button onClick={() => updateHostStatus(host.id, 'active')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Approve</button>
                          <button onClick={() => updateHostStatus(host.id, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Reject</button>
                        </>
                      )}
                      {host.status === 'active' && (
                        <button onClick={() => updateHostStatus(host.id, 'suspended')} className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-50">Suspend</button>
                      )}
                      {(host.status === 'suspended' || host.status === 'rejected') && (
                        <button onClick={() => updateHostStatus(host.id, 'active')} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-700">Reactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
};
