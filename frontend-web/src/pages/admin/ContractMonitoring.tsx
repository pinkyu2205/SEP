import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { PLATFORM_CONTRACTS, PLATFORM_HOSTS } from '@/utils/adminMockData';
import type { PlatformContractStatus } from '@/utils/adminMockData';
import { SectionShell, StatusPill, contractStatusMap } from './shared';

const ownerByBusiness = Object.fromEntries(PLATFORM_HOSTS.map(h => [h.businessName, h.ownerName]));

export const ContractMonitoring = () => {
  const [contractStatusFilter, setContractStatusFilter] = useState<'all' | PlatformContractStatus>('all');

  const filteredContracts = useMemo(() => {
    return PLATFORM_CONTRACTS.filter(contract =>
      contractStatusFilter === 'all' || contract.status === contractStatusFilter
    );
  }, [contractStatusFilter]);

  return (
    <SectionShell
      title="Contract Monitoring"
      subtitle="Theo dõi tất cả hợp đồng, người tạo, trạng thái và lịch sử phê duyệt"
      icon={FileText}
      action={
        <select value={contractStatusFilter} onChange={event => setContractStatusFilter(event.target.value as 'all' | PlatformContractStatus)} className="input-field w-48">
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(contractStatusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
        </select>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Host / Building</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Approval history</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredContracts.map(contract => (
              <tr key={contract.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-mono text-xs font-bold text-slate-800">{contract.code}</p><p className="text-xs text-slate-500">{contract.contractType}</p></td>
                <td className="px-4 py-3"><p className="font-bold text-slate-900">{ownerByBusiness[contract.hostName] ?? contract.hostName}</p><p className="text-xs text-slate-500">{contract.buildingName}</p></td>
                <td className="px-4 py-3"><p className="font-semibold text-slate-800">{contract.creatorName}</p><p className="text-xs text-slate-500">{contract.creatorRole}</p></td>
                <td className="px-4 py-3 text-slate-700">{contract.tenantOrManager}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{contract.approvalHistory}</td>
                <td className="px-4 py-3"><StatusPill label={contractStatusMap[contract.status].label} color={contractStatusMap[contract.status].color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
};
