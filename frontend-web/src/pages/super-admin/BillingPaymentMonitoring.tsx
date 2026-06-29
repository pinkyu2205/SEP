import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Download, Search, Loader2, Info } from 'lucide-react';
import type { PlatformBill, PlatformBillStatus } from '../../types';
import { PLATFORM_BILLS, PLATFORM_HOSTS } from '../../utils/superAdminMockData';
import { adminService } from '../../services/admin.service';
import { SectionShell, StatusPill, billStatusMap, formatVnd } from './shared';

// Map businessName -> ownerName (chỉ áp dụng cho dữ liệu mock; data thật BE đã trả tên host).
const ownerByBusiness = Object.fromEntries(PLATFORM_HOSTS.map(h => [h.businessName, h.ownerName]));

export const BillingPaymentMonitoring = () => {
  const [hostFilter, setHostFilter] = useState('all');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | PlatformBillStatus>('all');
  const [billSearch, setBillSearch] = useState('');
  const [month, setMonth] = useState('2026-05');

  const [bills, setBills] = useState<PlatformBill[]>(PLATFORM_BILLS);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(true);

  // Tải hóa đơn toàn hệ thống từ BE; lọc theo tháng phía server.
  // BE chưa có endpoint → fallback dữ liệu demo để trang vẫn dùng được.
  useEffect(() => {
    let active = true;
    setLoading(true);
    adminService.listInvoices({ month })
      .then(list => {
        if (!active) return;
        setBills(list);
        setUsingMock(false);
      })
      .catch(() => {
        if (!active) return;
        setBills(PLATFORM_BILLS);
        setUsingMock(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  // Danh sách host cho dropdown — lấy từ chính dữ liệu đang hiển thị.
  const uniqueHosts = useMemo(
    () => Array.from(new Set(bills.map(b => b.hostName))),
    [bills],
  );

  const filteredBills = useMemo(() => {
    const keyword = billSearch.trim().toLowerCase();
    return bills.filter(bill => {
      const matchesHost = hostFilter === 'all' || bill.hostName === hostFilter;
      const matchesStatus = billStatusFilter === 'all' || bill.status === billStatusFilter;
      const matchesSearch = !keyword || [bill.id, bill.hostName, bill.buildingName, bill.tenantName]
        .some(value => value.toLowerCase().includes(keyword));
      return matchesHost && matchesStatus && matchesSearch;
    });
  }, [bills, billSearch, billStatusFilter, hostFilter]);

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
      {usingMock && !loading && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Đang hiển thị <b>dữ liệu demo</b> — API <code>/api/v1/admin/invoices</code> chưa sẵn sàng.
            Khi BE bật endpoint, trang tự động hiển thị hóa đơn thật của toàn hệ thống.
          </span>
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={billSearch} onChange={event => setBillSearch(event.target.value)} className="input-field pl-9" placeholder="Tìm invoice, tenant, building..." />
        </div>
        <select value={hostFilter} onChange={event => setHostFilter(event.target.value)} className="input-field">
          <option value="all">Tất cả Host</option>
          {uniqueHosts.map(hostName => <option key={hostName} value={hostName}>{ownerByBusiness[hostName] ?? hostName}</option>)}
        </select>
        <select value={billStatusFilter} onChange={event => setBillStatusFilter(event.target.value as 'all' | PlatformBillStatus)} className="input-field">
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(billStatusMap).map(([status, cfg]) => <option key={status} value={status}>{cfg.label}</option>)}
        </select>
        <select value={month} onChange={event => setMonth(event.target.value)} className="input-field">
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
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Đang tải hóa đơn...
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-slate-500">
                  {billSearch ? `Không tìm thấy kết quả cho "${billSearch}"` : 'Không có hóa đơn nào trong kỳ này.'}
                </td>
              </tr>
            ) : filteredBills.map(bill => (
              <tr key={bill.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{bill.id}</td>
                <td className="px-4 py-3"><p className="font-bold text-slate-900">{ownerByBusiness[bill.hostName] ?? bill.hostName}</p><p className="text-xs text-slate-500">{bill.buildingName}</p></td>
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
