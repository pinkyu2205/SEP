import { MaskedField } from '@/components/MaskedField';
import { useEffect, useMemo, useState } from 'react';
import {
  CreditCard, Search, Loader2, AlertCircle, Receipt, Clock, PiggyBank,
} from 'lucide-react';
import {
  adminService,
  type AdminInvoiceRow, type AdminPaymentRow, type AdminDepositRow, type AdminDepositStatus,
} from '@/services/admin.service';
import toast from 'react-hot-toast';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { SectionShell, StatusPill, StatCard, Pagination, PAGE_SIZE, formatVnd } from './shared';
import { InvoiceUnlockPanel } from './InvoiceUnlockPanel';
import { InvoiceBoard, type InvoiceBoardRow } from '@/components/billing/InvoiceBoard';
import { currentMonth, shiftMonth, useServerPeriod } from '@/pages/host/shared';

/**
 * Giám sát hoá đơn & thanh toán toàn hệ thống (admin).
 *
 * Tab "Hoá đơn" dùng giao diện chung với host — `components/billing/InvoiceBoard` (làm lại
 * 24/09/2026). Dữ liệu là hoá đơn THẬT trong bảng `tenant_invoice` qua
 * `GET /api/v1/manager/invoices`. Riêng admin có thêm khối phát mã thu hộ trong khung chi tiết.
 *
 * Tab "Tiền cọc" giữ riêng: cọc nằm trên hợp đồng (TenantContract.deposit), không phải hoá đơn.
 */

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR / VietQR', PAYOS: 'PayOS', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', EWALLET: 'Ví điện tử',
};

/** Khớp `PaymentStatus` của BE — trạng thái thu cọc trên hợp đồng. */
const DEPOSIT_STATUS_META: Record<AdminDepositStatus, { label: string; color: string }> = {
  PENDING:   { label: 'Chưa thu cọc', color: 'bg-amber-100 text-amber-700' },
  PAID:      { label: 'Đã thu cọc',   color: 'bg-emerald-100 text-emerald-700' },
  FAILED:    { label: 'Thu thất bại', color: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Đã huỷ',       color: 'bg-slate-100 text-slate-600' },
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ hiệu lực', ACTIVE: 'Đang thuê', EXPIRED: 'Hết hạn', TERMINATED: 'Đã thanh lý',
};

/** "2026-08-05" -> "05/08/2026" */
const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
/** ISO datetime -> "05/08/2026 08:00" */
const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const [date, time] = iso.split('T');
  return `${date.split('-').reverse().join('/')}${time ? ` ${time.slice(0, 5)}` : ''}`;
};

const fromAdminRow = (r: AdminInvoiceRow): InvoiceBoardRow => ({ ...r, key: String(r.id) });

type Tab = 'invoices' | 'deposits';

export const BillingPaymentMonitoring = () => {
  const [tab, setTab] = useState<Tab>('invoices');
  /** Mặc định kỳ hiện tại (giờ server); '' = mọi kỳ. */
  const [period, setPeriod] = useServerPeriod();
  const periods = Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth(), -i));

  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [deposits, setDeposits] = useState<AdminDepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [error, setError] = useState(false);
  /** Tăng lên để buộc nạp lại danh sách (event realtime / nút tải lại). */
  const [reloadKey, setReloadKey] = useState(0);

  // Tab tiền cọc: tìm + lọc nhà riêng.
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    adminService.listInvoicesForCollection(period || undefined)
      .then(rows => { if (active) setInvoices(rows); })
      .catch(() => { if (active) { setInvoices([]); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reloadKey]);

  // Giao dịch khách tự báo + tiền cọc — không phụ thuộc kỳ, chỉ nạp lại khi có event.
  useEffect(() => {
    adminService.listPayments().then(setPayments).catch(() => setPayments([]));
    adminService.listDeposits()
      .then(setDeposits)
      .catch(() => setDeposits([]))
      .finally(() => setDepositsLoading(false));
  }, [reloadKey]);

  /**
   * Khách thanh toán → BE bắn `INVOICE_PAID` → nạp lại. Refetch chứ không vá dòng: payload
   * cố tình không có số tiền, vá bằng dữ liệu thiếu sẽ ra bảng nửa cũ nửa mới.
   */
  const { connected: liveOn } = useBillingRealtime({
    onRefresh: () => setReloadKey(k => k + 1),
    onEvent: (event) => {
      if (event.event !== 'INVOICE_PAID') return;
      const who = [event.tenantName, event.roomNumber].filter(Boolean).join(' · ');
      toast.success(who ? `Vừa thanh toán: ${who}` : 'Có hoá đơn vừa được thanh toán');
    },
  });

  useEffect(() => { setPage(1); }, [tab, propertyFilter, search]);

  const boardRows = useMemo(() => invoices.map(fromAdminRow), [invoices]);

  // ── Tiền cọc ──
  const properties = useMemo(() => {
    const set = new Set<string>();
    for (const d of deposits) set.add(d.propertyName);
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [deposits]);

  const filteredDeposits = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return deposits.filter(d => {
      if (propertyFilter !== 'all' && d.propertyName !== propertyFilter) return false;
      if (!kw) return true;
      return [d.contractCode, d.propertyName, d.roomNumber, d.tenantName, d.tenantPhone]
        .some(v => v?.toLowerCase().includes(kw));
    });
  }, [deposits, propertyFilter, search]);

  const depositStats = useMemo(() => {
    const sum = (rows: AdminDepositRow[]) => rows.reduce((s, d) => s + d.amount, 0);
    const paid = filteredDeposits.filter(d => d.status === 'PAID');
    const pending = filteredDeposits.filter(d => d.status === 'PENDING');
    return {
      total: filteredDeposits.length, totalAmt: sum(filteredDeposits),
      paid: paid.length, paidAmt: sum(paid),
      pending: pending.length, pendingAmt: sum(pending),
    };
  }, [filteredDeposits]);

  const totalPages = Math.max(1, Math.ceil(filteredDeposits.length / PAGE_SIZE));
  const pageDeposits = filteredDeposits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <SectionShell
      title="Hoá đơn & Thanh toán"
      subtitle={tab === 'invoices'
        ? 'Mọi khoản thu của khách thuê: tiền nhà, điện, nước, dịch vụ, phí sửa chữa. Bấm một dòng để xem chi tiết.'
        : 'Tiền cọc thu theo hợp đồng, không phải hoá đơn — mới thu nằm trên đầu'}
      icon={CreditCard}
    >
      {/* Cọc nằm trên hợp đồng, hoá đơn ở bảng riêng — 2 dòng tiền khác nhau nên tách tab. */}
      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([
          { key: 'invoices', label: 'Hoá đơn', icon: Receipt, count: invoices.length },
          { key: 'deposits', label: 'Tiền cọc', icon: PiggyBank, count: deposits.length },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
              tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'invoices' ? (
        <InvoiceBoard
          rows={boardRows}
          payments={payments}
          loading={loading}
          liveOn={liveOn}
          onReload={() => setReloadKey(k => k + 1)}
          period={period}
          onPeriodChange={setPeriod}
          periods={periods}
          maintenancePath="/admin/maintenance?bucket=tenant"
          exportName="HoaDon_Admin_HoangBinhLand"
          notice={error && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Không tải được hoá đơn từ máy chủ. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò ADMIN).</span>
            </div>
          )}
          // Phát mã cho quản lý thu hộ (tiền mặt / trả hộ) — gắn đúng hoá đơn đang mở.
          renderDetailActions={r => (r.id != null ? (
            <InvoiceUnlockPanel
              invoiceId={r.id}
              invoiceCode={r.code}
              canCollect={r.status === 'PENDING' || r.status === 'OVERDUE' || r.status === 'PARTIAL'}
            />
          ) : null)}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard title="Hợp đồng có cọc" value={depositStats.total} icon={Receipt} tone="indigo"
              helper={formatVnd(depositStats.totalAmt)} />
            <StatCard title="Đã thu cọc" value={depositStats.paid} icon={PiggyBank} tone="emerald"
              helper={formatVnd(depositStats.paidAmt)}
              progress={depositStats.total ? depositStats.paid / depositStats.total : 0} />
            <StatCard title="Chưa thu cọc" value={depositStats.pending} icon={Clock} tone="amber"
              helper={formatVnd(depositStats.pendingAmt)}
              progress={depositStats.total ? depositStats.pending / depositStats.total : 0} />
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9"
                placeholder="Tìm mã hợp đồng, toà nhà, phòng, khách thuê, SĐT..." />
            </div>
            <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="input-field">
              <option value="all">Tất cả toà nhà</option>
              {properties.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Mã hợp đồng</th>
                  <th className="px-4 py-3">Toà nhà / Phòng</th>
                  <th className="px-4 py-3">Khách thuê</th>
                  <th className="px-4 py-3 text-right">Tiền cọc</th>
                  <th className="px-4 py-3">Hình thức</th>
                  <th className="px-4 py-3">Ngày thu</th>
                  <th className="px-4 py-3">Hợp đồng</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depositsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Đang tải tiền cọc...
                    </td>
                  </tr>
                ) : pageDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                      {search ? `Không tìm thấy kết quả cho "${search}"` : 'Chưa có hợp đồng nào phát sinh tiền cọc.'}
                    </td>
                  </tr>
                ) : pageDeposits.map(d => {
                  const st = DEPOSIT_STATUS_META[d.status];
                  return (
                    <tr key={d.contractId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{d.contractCode}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{d.propertyName}</p>
                        <p className="text-xs text-slate-500">
                          {d.roomNumber && d.roomNumber !== d.propertyName ? `Phòng ${d.roomNumber}` : 'Nguyên căn'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{d.tenantName}</p>
                        {d.tenantPhone && <MaskedField value={d.tenantPhone} emptyText="" className="text-xs text-slate-400" />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-slate-950">{formatVnd(d.amount)}</p>
                        {d.depositMonths ? (
                          <p className="text-xs text-slate-400">{d.depositMonths} tháng tiền phòng</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {d.method ? (METHOD_LABEL[d.method.toUpperCase()] ?? d.method) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {d.paidAt ? fmtDateTime(d.paidAt) : <span className="text-slate-400">Chưa thu</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <p>{CONTRACT_STATUS_LABEL[d.contractStatus] ?? d.contractStatus}</p>
                        {d.moveInDate && <p className="text-slate-400">Nhận phòng {fmtDate(d.moveInDate)}</p>}
                      </td>
                      <td className="px-4 py-3"><StatusPill label={st.label} color={st.color} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!depositsLoading && filteredDeposits.length > 0 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
};
