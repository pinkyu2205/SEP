import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Clock, Wallet, Download, Receipt, RefreshCw, Building2, ArrowDownUp, Hourglass,
  BellRing, Check, ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/utils';
import { hostService, type ReceivablesAging as ReceivablesData, type InvoiceDto } from '@/services/host.service';
import { notificationService, HOST_OVERDUE_TYPES, type AppNotificationDto } from '@/services/notification.service';
import { exportToExcel } from '@/utils/exportExcel';
import {
  CURRENT_MONTH, ChipFilter, FilterBar, Pagination, SearchBox, SelectFilter, TableState,
  cmpIsoDesc, daysSince, fmtDate, fmtDateTime, fmtMillion, matchVi, monthLabel, pageSlice,
} from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Công nợ phải thu — 100% API thật, KHÔNG mock.
//   • Biểu đồ tuổi nợ  ← GET /host/finance/receivables-aging  (BE tự chia 4 nhóm)
//   • Bảng chi tiết    ← GET /host/invoices?month=…&size=…    (đủ hạn thu + trạng thái)
// BE dựng hoá đơn theo THÁNG HIỆN TẠI (buildInvoices(YearMonth.now())) và
// receivables-aging không nhận tham số month → trang này luôn là ảnh chụp kỳ hiện
// tại, cố ý KHÔNG có bộ chọn kỳ để số liệu 2 khối luôn khớp nhau.
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_AGING: ReceivablesData = { buckets: [], topDebtors: [] };

// Màu theo thứ tự nhóm BE trả về (0-30 → >90), không dò theo nhãn tiếng Việt.
const BUCKET_TONE = ['#10b981', '#f59e0b', '#f97316', '#e11d48'];
const bucketColor = (i: number) => BUCKET_TONE[Math.min(i, BUCKET_TONE.length - 1)];

// ── Trạng thái hoá đơn (khớp buildInvoices của BE) ───────────────────────────
type StatusKey = 'all' | 'UNPAID' | 'OVERDUE' | 'PAID';
const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  UNPAID: { label: 'Chưa thu', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  OVERDUE: { label: 'Quá hạn', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  PAID: { label: 'Đã thu', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

// ── Nhóm tuổi nợ tính phía FE (để lọc bảng) — cùng mốc 30/60/90 với BE ───────
type AgingKey = 'all' | 'upcoming' | 'd30' | 'd60' | 'd90' | 'd90plus';
const AGING_OPTIONS: { key: AgingKey; label: string }[] = [
  { key: 'all', label: 'Mọi tuổi nợ' },
  { key: 'upcoming', label: 'Chưa tới hạn' },
  { key: 'd30', label: 'Quá hạn 1–30 ngày' },
  { key: 'd60', label: 'Quá hạn 31–60 ngày' },
  { key: 'd90', label: 'Quá hạn 61–90 ngày' },
  { key: 'd90plus', label: 'Quá hạn > 90 ngày' },
];
const agingOf = (dueDate: string): Exclude<AgingKey, 'all'> => {
  const d = daysSince(dueDate);
  if (d <= 0) return 'upcoming';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  if (d <= 90) return 'd90';
  return 'd90plus';
};

/**
 * Mốc leo thang của BE (BillingCronServiceImpl): hoá đơn quá hạn từ ngần này ngày
 * thì cron 8h sáng bắn cảnh báo cho quản lý vận hành + toàn bộ Host và gắn cờ đề
 * nghị chấm dứt hợp đồng. Mirror `billing.rent.termination-after-days` (mặc định 3)
 * — chỉ dùng để diễn giải cho Host, không phải nguồn quyết định.
 */
const ESCALATE_AFTER_DAYS = 3;

const overdueBadge = (days: number) =>
  days > 90 ? 'bg-rose-100 text-rose-700'
    : days > 60 ? 'bg-orange-100 text-orange-700'
      : days > 30 ? 'bg-amber-100 text-amber-700'
        : days > 0 ? 'bg-yellow-100 text-yellow-700'
          : 'bg-emerald-100 text-emerald-700';

type SortKey = 'newest' | 'oldest' | 'overdue' | 'amount-desc' | 'amount-asc';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Mới nhất (hạn thu gần đây)' },
  { key: 'overdue', label: 'Quá hạn lâu nhất' },
  { key: 'amount-desc', label: 'Số tiền cao → thấp' },
  { key: 'amount-asc', label: 'Số tiền thấp → cao' },
  { key: 'oldest', label: 'Cũ nhất' },
];

export const ReceivablesAging = () => {
  const [aging, setAging] = useState<ReceivablesData>(EMPTY_AGING);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [alerts, setAlerts] = useState<AppNotificationDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Bộ lọc bảng chi tiết
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [agingFilter, setAgingFilter] = useState<AgingKey>('all');
  const [property, setProperty] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    const [agingRes, invoicePage, notifyPage] = await Promise.all([
      hostService.getReceivablesAging().catch(() => null),
      // size lớn: BE phân trang mặc định 20 → lấy trọn kỳ để tổng hợp KPI không bị hụt.
      hostService.getInvoices({ month: CURRENT_MONTH, size: 500 }).catch(() => null),
      // Cảnh báo quá hạn do cron nghiệp vụ bắn — nằm ở bảng thông báo chung.
      // BE chưa lọc được theo type nên lấy 100 cái gần nhất rồi lọc phía FE.
      notificationService.list({ size: 100 }).catch(() => null),
    ]);
    setAging(agingRes?.buckets?.length ? agingRes : EMPTY_AGING);
    setInvoices(invoicePage?.content ?? []);
    setAlerts((notifyPage?.content ?? []).filter(n => HOST_OVERDUE_TYPES.includes(n.type)));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Hoá đơn vừa PAID thì công nợ đổi ngay — nạp lại thay vì để Host thấy số cũ.
  useBillingRealtime((event) => {
    if (event.event !== 'INVOICE_PAID') return;
    load();
  });

  // ── KPI: tính từ danh sách hoá đơn (đủ kỳ) nên luôn khớp bảng bên dưới ──
  const totals = useMemo(() => {
    const open = invoices.filter(i => i.status !== 'PAID');
    const overdue = open.filter(i => i.status === 'OVERDUE');
    return {
      total: open.reduce((s, i) => s + i.amount, 0),
      openCount: open.length,
      overdueAmount: overdue.reduce((s, i) => s + i.amount, 0),
      overdueCount: overdue.length,
      oldest: open.reduce((m, i) => Math.max(m, daysSince(i.dueDate)), 0),
      collected: invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0),
    };
  }, [invoices]);

  /**
   * Nhóm đã chạm mốc leo thang — đúng nhóm mà cron BE gửi cảnh báo cho quản lý vận
   * hành + Host và gắn cờ đề nghị chấm dứt hợp đồng. Tính tại chỗ từ hoá đơn nên
   * vẫn đúng kể cả khi cron của hôm nay chưa chạy.
   */
  const escalated = useMemo(() => {
    const list = invoices.filter(i => i.status === 'OVERDUE' && daysSince(i.dueDate) >= ESCALATE_AFTER_DAYS);
    return { count: list.length, amount: list.reduce((s, i) => s + i.amount, 0) };
  }, [invoices]);

  const unreadAlerts = useMemo(() => alerts.filter(n => !n.read), [alerts]);

  const dismissAlert = async (id: number) => {
    setAlerts(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    await notificationService.markRead(id).catch(() => load());
  };

  const statusCounts = useMemo(() => ({
    all: invoices.length,
    UNPAID: invoices.filter(i => i.status === 'UNPAID').length,
    OVERDUE: invoices.filter(i => i.status === 'OVERDUE').length,
    PAID: invoices.filter(i => i.status === 'PAID').length,
  }), [invoices]);

  const propertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả bất động sản' },
    ...[...new Set(invoices.map(i => i.propertyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [invoices]);

  // ── Lọc + sắp xếp ──
  const filtered = useMemo(() => {
    const rows = invoices.filter(i =>
      (status === 'all' || i.status === status) &&
      (agingFilter === 'all' || agingOf(i.dueDate) === agingFilter) &&
      (property === 'all' || i.propertyName === property) &&
      matchVi(q, i.tenantName, i.propertyName, i.roomCode, i.id));

    const sorted = [...rows];
    switch (sort) {
      case 'newest': sorted.sort((a, b) => cmpIsoDesc(a.dueDate, b.dueDate)); break;
      case 'oldest': sorted.sort((a, b) => cmpIsoDesc(b.dueDate, a.dueDate)); break;
      case 'overdue': sorted.sort((a, b) => daysSince(b.dueDate) - daysSince(a.dueDate)); break;
      case 'amount-desc': sorted.sort((a, b) => b.amount - a.amount); break;
      case 'amount-asc': sorted.sort((a, b) => a.amount - b.amount); break;
    }
    return sorted;
  }, [invoices, status, agingFilter, property, q, sort]);

  const filteredAmount = useMemo(() => filtered.reduce((s, i) => s + i.amount, 0), [filtered]);
  const paged = pageSlice(filtered, page, perPage);

  const activeFilters = (q ? 1 : 0) + (status !== 'all' ? 1 : 0) + (agingFilter !== 'all' ? 1 : 0) + (property !== 'all' ? 1 : 0);
  const resetFilters = () => { setQ(''); setStatus('all'); setAgingFilter('all'); setProperty('all'); setPage(1); };
  // Đổi bộ lọc thì về trang 1 để không rơi vào trang trống.
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const handleExport = () => {
    exportToExcel('CongNoPhaiThu_HoangBinhLand', [
      {
        name: 'Tuổi nợ',
        rows: aging.buckets.map(b => ({ 'Nhóm': b.label, 'Số tiền (₫)': b.amount, 'Số hóa đơn': b.count })),
      },
      {
        name: 'Chi tiết công nợ',
        rows: filtered.map(i => ({
          'Mã hóa đơn': i.id, 'Khách thuê': i.tenantName, 'Bất động sản': i.propertyName, 'Phòng': i.roomCode,
          'Số tiền (₫)': i.amount, 'Hạn thanh toán': fmtDate(i.dueDate),
          'Số ngày quá hạn': Math.max(0, daysSince(i.dueDate)),
          'Trạng thái': STATUS_META[i.status]?.label ?? i.status,
        })),
      },
    ]);
  };

  const kpis = [
    { label: 'Tổng phải thu', value: formatCurrency(totals.total), sub: `${totals.openCount} hóa đơn chưa thu`, icon: Wallet, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500' },
    { label: 'Đang quá hạn', value: formatCurrency(totals.overdueAmount), sub: `${totals.overdueCount} hóa đơn trễ hạn`, icon: AlertTriangle, bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500' },
    { label: 'Đã thu trong kỳ', value: formatCurrency(totals.collected), sub: `${statusCounts.PAID} hóa đơn đã thanh toán`, icon: Receipt, bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-l-emerald-500' },
    { label: 'Nợ lâu nhất', value: totals.oldest > 0 ? `${totals.oldest} ngày` : 'Chưa có', sub: 'Tính từ hạn thanh toán', icon: Clock, bg: 'bg-orange-50', color: 'text-orange-600', border: 'border-l-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Công nợ phải thu</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tiền khách thuê đang nợ kỳ {monthLabel(CURRENT_MONTH)} — phân nhóm theo tuổi nợ để ưu tiên thu hồi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Cảnh báo quá hạn — khách không trả đúng hạn thì cron BE (8h sáng mỗi ngày)
          nhắc khách, và từ ngày thứ ESCALATE_AFTER_DAYS thì báo quản lý + Host.
          Khối này hiện lại đúng cảnh báo đó ngay tại chỗ Host đang xem công nợ. */}
      {(totals.overdueCount > 0 || unreadAlerts.length > 0) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-lg bg-rose-100 p-2"><BellRing className="h-5 w-5 text-rose-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-rose-800">
                {totals.overdueCount} hóa đơn tiền phòng đang quá hạn — {formatCurrency(totals.overdueAmount)}
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                Hệ thống tự nhắc khách thuê lúc 8h sáng mỗi ngày. Quá hạn từ {ESCALATE_AFTER_DAYS} ngày, quản lý vận hành
                và Host nhận cảnh báo, hợp đồng bị gắn cờ đề nghị chấm dứt.
                {escalated.count > 0 && (
                  <> Hiện có <b>{escalated.count} hóa đơn đã quá {ESCALATE_AFTER_DAYS} ngày</b> ({formatCurrency(escalated.amount)}).</>
                )}
              </p>

              {/* Cảnh báo THẬT do BE bắn (bảng thông báo chung) */}
              {unreadAlerts.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {unreadAlerts.slice(0, 5).map(n => (
                    <li key={n.id} className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-800">{n.title}</p>
                        <p className="text-xs text-slate-500">{n.content}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                      </div>
                      <button
                        onClick={() => dismissAlert(n.id)}
                        title="Đánh dấu đã đọc"
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {unreadAlerts.length > 5 && (
                    <li className="text-[11px] text-rose-700">… và {unreadAlerts.length - 5} cảnh báo khác</li>
                  )}
                </ul>
              )}

              {totals.overdueCount > 0 && (
                <button
                  onClick={() => { setStatus('OVERDUE'); setSort('overdue'); setPage(1); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Xem danh sách quá hạn <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl border border-slate-100 border-l-4 bg-white p-5 shadow-sm ${k.border}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className={`mt-1 truncate text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{k.sub}</p>
              </div>
              <div className={`${k.bg} ml-2 flex-shrink-0 rounded-xl p-3`}><k.icon className={`h-5 w-5 ${k.color}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Phân bố tuổi nợ (API receivables-aging) */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Hourglass className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Phân bố theo tuổi nợ</h2>
            <p className="text-xs text-slate-400">Số ngày tính từ hạn thanh toán · nguồn: API tuổi nợ của hệ thống</p>
          </div>
        </div>
        {aging.buckets.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">
            {loading ? 'Đang tải…' : 'Chưa có công nợ nào trong kỳ.'}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aging.buckets} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtMillion} tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="amount" name="Số tiền" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {aging.buckets.map((_, i) => <Cell key={i} fill={bucketColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {aging.buckets.map((b, i) => (
                <div key={b.label} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bucketColor(i) }} />
                    <p className="text-xs text-slate-500">{b.label}</p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(b.amount)}</p>
                  <p className="text-[11px] text-slate-400">{b.count} hóa đơn</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Chi tiết công nợ — tìm kiếm + lọc + sắp xếp */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Receipt className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Chi tiết công nợ theo hóa đơn</h2>
            <p className="text-xs text-slate-500">
              {filtered.length} hóa đơn · tổng {formatCurrency(filteredAmount)}
            </p>
          </div>
        </div>

        <FilterBar activeCount={activeFilters} onReset={resetFilters}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox
              value={q}
              onChange={onFilter(setQ)}
              placeholder="Tìm theo khách thuê, bất động sản, phòng, mã hóa đơn... (không cần dấu)"
              className="flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SelectFilter value={agingFilter} onChange={onFilter(setAgingFilter)} options={AGING_OPTIONS} icon={Hourglass} title="Lọc theo tuổi nợ" />
              <SelectFilter value={property} onChange={onFilter(setProperty)} options={propertyOptions} icon={Building2} title="Lọc theo bất động sản" />
              <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[218px]" />
            </div>
          </div>
          <ChipFilter
            value={status}
            onChange={onFilter(setStatus)}
            options={[
              { key: 'all', label: 'Tất cả', count: statusCounts.all },
              { key: 'OVERDUE', label: 'Quá hạn', count: statusCounts.OVERDUE },
              { key: 'UNPAID', label: 'Chưa thu', count: statusCounts.UNPAID },
              { key: 'PAID', label: 'Đã thu', count: statusCounts.PAID },
            ]}
          />
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Khách thuê</th>
                <th className="px-5 py-3.5">Bất động sản / Phòng</th>
                <th className="px-5 py-3.5 text-right">Số tiền</th>
                <th className="px-5 py-3.5">Hạn thanh toán</th>
                <th className="px-5 py-3.5 text-center">Tuổi nợ</th>
                <th className="px-5 py-3.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(i => {
                const days = daysSince(i.dueDate);
                const meta = STATUS_META[i.status] ?? STATUS_META.UNPAID;
                return (
                  <tr key={i.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{i.tenantName?.trim() || '(chưa có tên khách)'}</p>
                      <p className="text-xs text-slate-400">{i.id}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{i.propertyName}</p>
                      <p className="text-xs text-slate-400">{i.roomCode === 'NGUYEN_CAN' ? 'Thuê nguyên căn' : `Phòng ${i.roomCode}`}</p>
                    </td>
                    <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${i.status === 'PAID' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(i.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-sm tabular-nums text-slate-600">{fmtDate(i.dueDate)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overdueBadge(i.status === 'PAID' ? 0 : days)}`}>
                        {i.status === 'PAID' ? 'Đã tất toán' : days > 0 ? `${days} ngày` : `Còn ${Math.abs(days)} ngày`}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <TableState colSpan={6} loading={loading} filtered={activeFilters > 0}
                  empty="Chưa có hóa đơn nào trong kỳ này." />
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={perPage} total={filtered.length}
          onPage={setPage} onPerPage={setPerPage} unit="hóa đơn" />
      </div>
    </div>
  );
};
