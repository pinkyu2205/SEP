import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Search, Loader2, AlertCircle } from 'lucide-react';
import type { PlatformBillStatus } from '../../types';
import { adminService, type AdminInvoiceRow, type AdminHost } from '../../services/admin.service';
import { SectionShell, StatusPill, billStatusMap, formatVnd } from './shared';

// Trạng thái hóa đơn ảo (từ hợp đồng thuê): chỉ PAID / UNPAID / OVERDUE.
const STATUS_OPTIONS: PlatformBillStatus[] = ['paid', 'unpaid', 'overdue'];

// 12 tháng gần nhất tính từ hiện tại, dạng YYYY-MM.
const buildMonths = (): string[] => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return `Tháng ${mm}/${y}`;
};

export const BillingPaymentMonitoring = () => {
  const months = useMemo(buildMonths, []);
  const [month, setMonth] = useState(months[0]);
  const [hostFilter, setHostFilter] = useState('all');
  const [billStatusFilter, setBillStatusFilter] = useState<'all' | PlatformBillStatus>('all');
  const [billSearch, setBillSearch] = useState('');

  const [bills, setBills] = useState<AdminInvoiceRow[]>([]);
  const [hosts, setHosts] = useState<AdminHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Danh sách host cho dropdown (lấy 1 lần).
  useEffect(() => {
    adminService.getHosts().then(setHosts).catch(() => setHosts([]));
  }, []);

  // Hóa đơn toàn hệ thống theo tháng (lọc server-side theo kỳ).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    adminService.listInvoices({ month })
      .then(list => { if (active) setBills(list); })
      .catch(() => { if (active) { setBills([]); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  const filteredBills = useMemo(() => {
    const keyword = billSearch.trim().toLowerCase();
    return bills.filter(bill => {
      const matchesHost = hostFilter === 'all' || bill.hostId === hostFilter || bill.hostName === hostFilter;
      const matchesStatus = billStatusFilter === 'all' || bill.status === billStatusFilter;
      const matchesSearch = !keyword || [bill.id, bill.hostName, bill.buildingName, bill.tenantName, bill.roomCode]
        .some(value => value?.toLowerCase().includes(keyword));
      return matchesHost && matchesStatus && matchesSearch;
    });
  }, [bills, billSearch, billStatusFilter, hostFilter]);

  return (
    <SectionShell
      title="Billing & Payment Monitoring"
      subtitle="Toàn bộ hóa đơn tiền thuê của mọi host trong hệ thống — lọc theo tháng, host, trạng thái (paid / unpaid / overdue)"
      icon={CreditCard}
      action={
        <select value={month} onChange={e => setMonth(e.target.value)} className="input-field w-44">
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      }
    >
      {error && !loading && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Không tải được hóa đơn từ máy chủ. Kiểm tra lại kết nối hoặc quyền truy cập (yêu cầu vai trò ADMIN).</span>
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={billSearch} onChange={e => setBillSearch(e.target.value)} className="input-field pl-9"
            placeholder="Tìm mã HĐ, host, tòa nhà, khách thuê..." />
        </div>
        <select value={hostFilter} onChange={e => setHostFilter(e.target.value)} className="input-field">
          <option value="all">Tất cả Host</option>
          {hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={billStatusFilter} onChange={e => setBillStatusFilter(e.target.value as 'all' | PlatformBillStatus)} className="input-field">
          <option value="all">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{billStatusMap[s].label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Mã hóa đơn</th>
              <th className="px-4 py-3">Host / Tòa nhà</th>
              <th className="px-4 py-3">Khách thuê</th>
              <th className="px-4 py-3 text-right">Số tiền</th>
              <th className="px-4 py-3">Hạn thu</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Đang tải hóa đơn...
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                  {billSearch ? `Không tìm thấy kết quả cho "${billSearch}"` : 'Không có hóa đơn nào trong kỳ này.'}
                </td>
              </tr>
            ) : filteredBills.map(bill => (
              <tr key={bill.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{bill.id}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{bill.hostName}</p>
                  <p className="text-xs text-slate-500">
                    {bill.buildingName}{bill.roomCode && bill.roomCode !== 'NGUYEN_CAN' ? ` · Phòng ${bill.roomCode}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700">{bill.tenantName}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-950">{formatVnd(bill.amount)}</td>
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
