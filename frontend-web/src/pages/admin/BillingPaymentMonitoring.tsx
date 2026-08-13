import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CreditCard, Search, Loader2, AlertCircle, ChevronDown, Receipt, Wallet,
  Clock, AlertTriangle, PiggyBank,
} from 'lucide-react';
import {
  adminService,
  type AdminInvoiceRow, type AdminInvoiceStatus, type AdminInvoiceType, type AdminPaymentRow,
  type AdminDepositRow, type AdminDepositStatus,
} from '@/services/admin.service';
import toast from 'react-hot-toast';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { SectionShell, StatusPill, StatCard, Pagination, PAGE_SIZE, formatVnd } from './shared';

/**
 * Giám sát hoá đơn & thanh toán toàn hệ thống (admin).
 *
 * Dữ liệu là hoá đơn THẬT trong bảng `tenant_invoice` — cùng nguồn mà app khách
 * thuê và app quản lý đang dùng — lấy qua `GET /api/v1/manager/invoices` (admin gọi
 * được, và được trả về của mọi nhà). BE đã sort `createdAt DESC` nên hoá đơn mới
 * nhất luôn nằm trên đầu; FE KHÔNG sort lại để khỏi lệch với thứ tự BE trả.
 *
 * Trước đây màn này gọi `/api/v1/admin/invoices` — endpoint dựng hoá đơn ảo từ hợp
 * đồng (không có mã hoá đơn, không có điện/nước, hạn thu bịa). Xem chú thích đầu
 * services/admin.service.ts.
 */

// ── Nhãn khớp enum thật của BE ───────────────────────────────────────────────
const TYPE_META: Record<AdminInvoiceType, { label: string; color: string }> = {
  RENT:        { label: 'Tiền phòng', color: 'bg-violet-100 text-violet-700' },
  ELECTRICITY: { label: 'Tiền điện',  color: 'bg-amber-100 text-amber-700' },
  WATER:       { label: 'Tiền nước',  color: 'bg-sky-100 text-sky-700' },
  SERVICE:     { label: 'Dịch vụ',    color: 'bg-teal-100 text-teal-700' },
  MAINTENANCE: { label: 'Phí bảo trì', color: 'bg-rose-100 text-rose-700' },
  OTHER:       { label: 'Khác',       color: 'bg-slate-100 text-slate-600' },
};

const STATUS_META: Record<AdminInvoiceStatus, { label: string; color: string }> = {
  PENDING:   { label: 'Chờ thanh toán',   color: 'bg-amber-100 text-amber-700' },
  PAID:      { label: 'Đã thanh toán',    color: 'bg-emerald-100 text-emerald-700' },
  OVERDUE:   { label: 'Quá hạn',          color: 'bg-rose-100 text-rose-700' },
  PARTIAL:   { label: 'Thanh toán 1 phần', color: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'Đã huỷ',           color: 'bg-slate-100 text-slate-600' },
};

const PAYMENT_STATUS_META: Record<AdminPaymentRow['status'], { label: string; color: string }> = {
  PENDING_VERIFY: { label: 'Chờ đối soát', color: 'bg-amber-100 text-amber-700' },
  VERIFIED:       { label: 'Đã xác nhận',  color: 'bg-emerald-100 text-emerald-700' },
  REJECTED:       { label: 'Bị từ chối',   color: 'bg-rose-100 text-rose-700' },
};

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR / VietQR',
  PAYOS: 'PayOS',
  BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  EWALLET: 'Ví điện tử',
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

// ── Định dạng ────────────────────────────────────────────────────────────────
/** "2026-08-05" -> "05/08/2026" */
const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
/** ISO datetime -> "05/08/2026 08:00" */
const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const [date, time] = iso.split('T');
  return `${date.split('-').reverse().join('/')}${time ? ` ${time.slice(0, 5)}` : ''}`;
};

// 12 kỳ gần nhất, dạng YYYY-MM.
const buildPeriods = (): string[] => {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
const periodLabel = (p: string) => {
  const [y, m] = p.split('-');
  return `Tháng ${m}/${y}`;
};

type Tab = 'invoices' | 'deposits';

export const BillingPaymentMonitoring = () => {
  const periods = useMemo(buildPeriods, []);
  const [tab, setTab] = useState<Tab>('invoices');
  /** '' = mọi kỳ (không truyền `period` cho BE). */
  const [period, setPeriod] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AdminInvoiceType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminInvoiceStatus>('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  const [invoices, setInvoices] = useState<AdminInvoiceRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [deposits, setDeposits] = useState<AdminDepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositsLoading, setDepositsLoading] = useState(true);
  const [error, setError] = useState(false);
  /** Tăng lên để buộc nạp lại danh sách (dùng cho event realtime). */
  const [reloadKey, setReloadKey] = useState(0);

  // Kỳ + loại + trạng thái lọc phía server (BE nhận đúng 3 tham số này).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    adminService.listInvoices({
      period: period || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then(rows => { if (active) setInvoices(rows); })
      .catch(() => { if (active) { setInvoices([]); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, typeFilter, statusFilter, reloadKey]);

  // Giao dịch thanh toán + tiền cọc — không phụ thuộc bộ lọc hoá đơn, chỉ nạp lại khi
  // có event realtime.
  useEffect(() => {
    adminService.listPayments().then(setPayments).catch(() => setPayments([]));
    adminService.listDeposits()
      .then(setDeposits)
      .catch(() => setDeposits([]))
      .finally(() => setDepositsLoading(false));
  }, [reloadKey]);

  /**
   * Khách thanh toán → BE bắn `INVOICE_PAID` qua WebSocket → nạp lại danh sách.
   *
   * Refetch thay vì tự sửa dòng tại chỗ: payload cố tình KHÔNG có số tiền, mà bảng này
   * hiện tiền — vá dòng bằng dữ liệu thiếu sẽ ra bảng nửa cũ nửa mới. Refetch cũng lo
   * luôn trường hợp hoá đơn vừa PAID không nằm trong bộ lọc đang xem.
   */
  useBillingRealtime((event) => {
    if (event.event !== 'INVOICE_PAID') return;
    setReloadKey(k => k + 1);
    const who = [event.tenantName, event.roomNumber].filter(Boolean).join(' · ');
    toast.success(who ? `Vừa thanh toán: ${who}` : 'Có hoá đơn vừa được thanh toán');
  });

  // Đổi bộ lọc/tab thì về trang 1 và đóng dòng đang mở.
  useEffect(() => { setPage(1); setOpenId(null); },
    [tab, period, typeFilter, statusFilter, propertyFilter, search]);

  /** Giao dịch của 1 hoá đơn — khớp theo mã hoá đơn (ManagerPaymentResponse.invoiceCode). */
  const paymentsOf = useMemo(() => {
    const map = new Map<string, AdminPaymentRow[]>();
    for (const p of payments) {
      if (!p.invoiceCode) continue;
      const list = map.get(p.invoiceCode) ?? [];
      list.push(p);
      map.set(p.invoiceCode, list);
    }
    return map;
  }, [payments]);

  // Danh sách toà nhà suy từ chính dữ liệu đang hiện (hoá đơn + hợp đồng có cọc) —
  // không cần gọi thêm API và không bao giờ lệch với bảng. Lọc theo TÊN vì phía cọc
  // (TenantContractResponse) chỉ có propertyName, không có propertyId.
  const properties = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) set.add(i.propertyName);
    for (const d of deposits) set.add(d.propertyName);
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [invoices, deposits]);

  // Lọc phần còn lại phía client (toà nhà + từ khoá).
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return invoices.filter(i => {
      if (propertyFilter !== 'all' && i.propertyName !== propertyFilter) return false;
      if (!kw) return true;
      return [i.code, i.propertyName, i.roomNumber, i.tenantName, i.periodLabel]
        .some(v => v?.toLowerCase().includes(kw));
    });
  }, [invoices, propertyFilter, search]);

  const stats = useMemo(() => {
    const sum = (rows: AdminInvoiceRow[]) => rows.reduce((s, i) => s + i.amount, 0);
    const paid = filtered.filter(i => i.status === 'PAID');
    const pending = filtered.filter(i => i.status === 'PENDING' || i.status === 'PARTIAL');
    const overdue = filtered.filter(i => i.status === 'OVERDUE');
    return {
      total: filtered.length, totalAmt: sum(filtered),
      paid: paid.length, paidAmt: sum(paid),
      pending: pending.length, pendingAmt: sum(pending),
      overdue: overdue.length, overdueAmt: sum(overdue),
    };
  }, [filtered]);

  // ── Tiền cọc: lọc theo từ khoá + toà nhà, đã sort mới-trước ở service ──
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

  // Hoá đơn: BE đã trả mới nhất trước — chỉ cắt trang, KHÔNG sort lại.
  // Cọc: BE `findAll()` không sort nên service đã tự xếp theo ngày thu cọc giảm dần.
  const rows = tab === 'invoices' ? filtered : filteredDeposits;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageDeposits = filteredDeposits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleStatus = (s: AdminInvoiceStatus) =>
    setStatusFilter(prev => (prev === s ? 'all' : s));

  return (
    <SectionShell
      title="Hoá đơn & Thanh toán"
      subtitle={tab === 'invoices'
        ? 'Toàn bộ hoá đơn thật của hệ thống (tiền phòng, điện, nước, dịch vụ, bảo trì) — mới phát hành nằm trên đầu'
        : 'Tiền cọc thu theo hợp đồng, không phải hoá đơn — mới thu nằm trên đầu'}
      icon={CreditCard}
      action={tab === 'invoices' ? (
        <select value={period} onChange={e => setPeriod(e.target.value)} className="input-field w-44">
          <option value="">Tất cả các kỳ</option>
          {periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
      ) : undefined}
    >
      {/* Cọc nằm trên hợp đồng (TenantContract.deposit), hoá đơn nằm ở bảng riêng —
          2 dòng tiền khác nhau nên tách tab thay vì trộn chung một bảng. */}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
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

      {error && !loading && tab === 'invoices' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Không tải được hoá đơn từ máy chủ. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò ADMIN).</span>
        </div>
      )}

      {/* Thẻ số liệu — bấm để lọc nhanh theo trạng thái */}
      {tab === 'invoices' ? (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Tổng hoá đơn" value={stats.total} icon={Receipt} tone="indigo"
          helper={formatVnd(stats.totalAmt)} />
        <StatCard title="Đã thanh toán" value={stats.paid} icon={Wallet} tone="emerald"
          helper={formatVnd(stats.paidAmt)}
          progress={stats.total ? stats.paid / stats.total : 0}
          active={statusFilter === 'PAID'} onClick={() => toggleStatus('PAID')} />
        <StatCard title="Chờ thu" value={stats.pending} icon={Clock} tone="amber"
          helper={formatVnd(stats.pendingAmt)}
          progress={stats.total ? stats.pending / stats.total : 0}
          active={statusFilter === 'PENDING'} onClick={() => toggleStatus('PENDING')} />
        <StatCard title="Quá hạn" value={stats.overdue} icon={AlertTriangle} tone="rose"
          helper={formatVnd(stats.overdueAmt)}
          progress={stats.total ? stats.overdue / stats.total : 0}
          active={statusFilter === 'OVERDUE'} onClick={() => toggleStatus('OVERDUE')} />
      </div>
      ) : (
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
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9"
            placeholder={tab === 'invoices'
              ? 'Tìm mã hoá đơn, toà nhà, phòng, khách thuê...'
              : 'Tìm mã hợp đồng, toà nhà, phòng, khách thuê, SĐT...'} />
        </div>
        {tab === 'invoices' && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            className="input-field">
            <option value="all">Tất cả loại hoá đơn</option>
            {(Object.keys(TYPE_META) as AdminInvoiceType[]).map(t => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>
        )}
        <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="input-field">
          <option value="all">Tất cả toà nhà</option>
          {properties.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {tab === 'invoices' ? (
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Mã hoá đơn</th>
              <th className="px-4 py-3">Kỳ thanh toán</th>
              <th className="px-4 py-3">Toà nhà / Phòng</th>
              <th className="px-4 py-3">Khách thuê</th>
              <th className="px-4 py-3 text-right">Số tiền</th>
              <th className="px-4 py-3">Phát hành</th>
              <th className="px-4 py-3">Hạn thu</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-slate-400">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Đang tải hoá đơn...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-slate-500">
                  {search ? `Không tìm thấy kết quả cho "${search}"` : 'Không có hoá đơn nào khớp bộ lọc.'}
                </td>
              </tr>
            ) : pageRows.map(inv => {
              const type = TYPE_META[inv.type];
              const status = STATUS_META[inv.status];
              const claims = paymentsOf.get(inv.code) ?? [];
              const open = openId === inv.id;

              return (
                <Fragment key={inv.id}>
                  <tr onClick={() => setOpenId(open ? null : inv.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${open ? 'bg-slate-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{inv.code}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${type.color}`}>
                        {type.label}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{inv.periodLabel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{inv.propertyName}</p>
                      <p className="text-xs text-slate-500">
                        {inv.roomNumber && inv.roomNumber !== inv.propertyName
                          ? `Phòng ${inv.roomNumber}` : 'Nguyên căn'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{inv.tenantName}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-950">{formatVnd(inv.amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(inv.createdAt)}</td>
                    <td className={`px-4 py-3 text-xs ${inv.status === 'OVERDUE' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3"><StatusPill label={status.label} color={status.color} /></td>
                    <td className="px-2 py-3 text-slate-400">
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>

                  {/* Chi tiết: kỳ này thu cho khoảng nào + các giao dịch đã ghi nhận */}
                  {open && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={9} className="px-4 pb-4 pt-1">
                        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                              Hoá đơn này thu cho khoảng nào
                            </p>
                            <dl className="mt-2 space-y-1.5 text-sm">
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">Kỳ thanh toán</dt>
                                <dd className="font-semibold text-slate-800">{inv.periodLabel}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">Loại khoản thu</dt>
                                <dd className="font-semibold text-slate-800">{type.label}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">Ngày phát hành</dt>
                                <dd className="font-semibold text-slate-800">{fmtDateTime(inv.createdAt)}</dd>
                              </div>
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-500">Hạn thu</dt>
                                <dd className={`font-semibold ${inv.status === 'OVERDUE' ? 'text-rose-600' : 'text-slate-800'}`}>
                                  {fmtDate(inv.dueDate)}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-4 border-t border-slate-100 pt-1.5">
                                <dt className="text-slate-500">Tổng phải thu</dt>
                                <dd className="font-black text-slate-950">{formatVnd(inv.amount)}</dd>
                              </div>
                            </dl>
                          </div>

                          <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                              Giao dịch khách đã báo ({claims.length})
                            </p>
                            {claims.length === 0 ? (
                              <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                                Chưa có giao dịch nào cho hoá đơn này.
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {claims.map(c => (
                                  <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-slate-900">{formatVnd(c.amount)}</span>
                                      <StatusPill label={PAYMENT_STATUS_META[c.status].label}
                                        color={PAYMENT_STATUS_META[c.status].color} />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {c.method ? (METHOD_LABEL[c.method.toUpperCase()] ?? c.method) : 'Không rõ hình thức'}
                                      {' · báo lúc '}{fmtDateTime(c.createdAt)}
                                      {c.verifiedAt ? ` · xác nhận ${fmtDateTime(c.verifiedAt)}` : ''}
                                    </p>
                                    {c.transferContent && (
                                      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                                        {c.transferContent}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
      /* ── Tiền cọc ───────────────────────────────────────────────────────── */
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
                    {d.tenantPhone && <p className="text-xs text-slate-400">{d.tenantPhone}</p>}
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
      )}

      {!(tab === 'invoices' ? loading : depositsLoading) && rows.length > 0 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </SectionShell>
  );
};
