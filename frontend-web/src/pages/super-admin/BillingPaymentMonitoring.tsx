import { useMemo, useState } from 'react';
import { CreditCard, Download, Search } from 'lucide-react';
import type { PlatformBillStatus } from '../../types';
import { PLATFORM_BILLS, PLATFORM_HOSTS } from '../../utils/superAdminMockData';
import { SectionShell, StatusPill, billStatusMap, formatVnd } from './shared';

export const BillingPaymentMonitoring = () => {
  const [hostFilter, setHostFilter] = useState('all');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | PlatformBillStatus>('all');
  const [billSearch, setBillSearch] = useState('');

  const uniqueHosts = PLATFORM_HOSTS.map(host => host.businessName);

  const filteredBills = useMemo(() => {
    const keyword = billSearch.trim().toLowerCase();
    return PLATFORM_BILLS.filter(bill => {
      const matchesHost = hostFilter === 'all' || bill.hostName === hostFilter;
      const matchesStatus = billStatusFilter === 'all' || bill.status === billStatusFilter;
      const matchesSearch = !keyword || [bill.id, bill.hostName, bill.buildingName, bill.tenantName]
        .some(value => value.toLowerCase().includes(keyword));
      return matchesHost && matchesStatus && matchesSearch;
    });
  }, [billSearch, billStatusFilter, hostFilter]);

  return (
    <SectionShell
      title="Billing & Payment Monitoring"
      subtitle="Theo dõi hóa đơn paid, unpaid, overdue, pending và lọc theo tháng, năm, Host, building, trạng thái"
      icon={CreditCard}
      action={
        <button className="btn-secondary flex items-center gap-2">
          <Download className="h-4 w-4" />
          Xuất báo cáo
        </button>
      }
    >
      <div className="mb-4 grid gap-3 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={billSearch} onChange={event => setBillSearch(event.target.value)} className="input-field pl-9" placeholder="Tìm invoice, tenant, building..." />
        </div>
        <select value={hostFilter} onChange={event => setHostFilter(event.target.value)} className="input-field">
          <option value="all">Tất cả Host</option>
          {uniqueHosts.map(hostName => <option key={hostName} value={hostName}>{hostName}</option>)}
        </select>
        <select value={billStatusFilter} onChange={event => setBillStatusFilter(event.target.value as 'all' | PlatformBillStatus)} className="input-field">
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(billStatusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
        </select>
        <select className="input-field" defaultValue="2026-05">
          <option value="2026-05">Tháng 05/2026</option>
          <option value="2026-04">Tháng 04/2026</option>
          <option value="2026-03">Tháng 03/2026</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Host / Building</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredBills.map(bill => (
              <tr key={bill.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{bill.id}</td>
                <td className="px-4 py-3"><p className="font-bold text-slate-900">{bill.hostName}</p><p className="text-xs text-slate-500">{bill.buildingName}</p></td>
                <td className="px-4 py-3 text-slate-700">{bill.tenantName}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-950">{formatVnd(bill.amount)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{bill.paymentMethod}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{bill.dueDate}</td>
                <td className="px-4 py-3"><StatusPill label={billStatusMap[bill.status].label} color={billStatusMap[bill.status].color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
};
