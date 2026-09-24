import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowDownUp, Building2, CalendarDays, Check, ChevronDown, Clock, Copy,
  Download, Droplets, FileText, Home, Info, Layers, Receipt, RefreshCw, Send, Wallet, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AdminInvoiceStatus, AdminInvoiceType, AdminPaymentRow } from '@/services/admin.service';
import { formatCurrency } from '@/utils';
import { exportToExcel } from '@/utils/exportExcel';
import { serverNow } from '@/utils/serverTime';
import { fmtDate, fmtDateTime, monthLabel } from '@/utils/period';
import { RealtimeBadge } from '@/pages/admin/shared';
import { ChipFilter, Pagination, SearchBox, SelectFilter, TableState, matchVi } from '@/pages/host/shared';

/**
 * BẢNG HOÁ ĐƠN DÙNG CHUNG — admin (/admin/billing) và host (/host/billing), 24/09/2026.
 *
 * Trước đây là hai file ~650 dòng chép tay của nhau và đã lệch nhau (host có chip trạng
 * thái, admin không; bộ lọc mỗi bên một kiểu). Giờ một chỗ, mỗi bên chỉ khác:
 *   • nguồn dữ liệu (trang tự tải rồi đưa `rows` vào),
 *   • phần hành động trong khung chi tiết (`renderDetailActions` — admin có phát mã thu hộ),
 *   • link sang phiếu bảo trì (`maintenancePath`).
 *
 * Những gì đã sửa so với bản cũ:
 *   • Bảng 5 cột, KHÁCH đứng đầu (người ta tìm theo khách/phòng, không theo mã). Mã hoá đơn
 *     vào khung chi tiết. Badge trạng thái không xuống dòng.
 *   • Cột "Khoản" hiện THÁNG (T10/2026) — trước hiện "Phí bảo trì" hai lần mà không thấy kỳ.
 *   • Mặc định xem kỳ hiện tại, số liệu 4 ô tính theo kỳ đang chọn (trước cộng dồn mọi tháng).
 *   • Khung chi tiết làm lại: đầu khung = loại + kỳ + số tiền + trạng thái; bên dưới là
 *     "Thông tin" và "Dòng thanh toán" dạng mốc thời gian; bỏ các dòng lặp.
 */

// ── Kiểu dữ liệu ─────────────────────────────────────────────────────────────
export interface InvoiceBoardRow {
  key: string;
  /** Id thật trong bảng hoá đơn — thiếu ở chế độ rút gọn của host. */
  id?: number;
  code: string;
  type: AdminInvoiceType;
  propertyName: string;
  roomNumber?: string;
  tenantName: string;
  month?: number;
  year?: number;
  /** Chuỗi kỳ BE ghi sẵn ("01/09 – 30/09/2026", "Phí bảo trì"…). */
  periodLabel: string;
  amount: number;
  status: AdminInvoiceStatus;
  dueDate?: string;
  createdAt?: string;
  paidAt?: string;
  paymentMethod?: string;
  transactionId?: string;
  /** `HD-ONBOARD-*` — vỏ bọc gộp cọc + tiền nhà kỳ đầu, KHÔNG cộng vào tổng. */
  isOnboardEnvelope?: boolean;
  /** Tiền nhà kỳ đầu, thu chung lần với cọc — vẫn là doanh thu thật, vẫn cộng. */
  collectedAtOnboard?: boolean;
  collectedInInvoiceCode?: string;
}

// ── Nhãn ─────────────────────────────────────────────────────────────────────
const TYPE_META: Record<AdminInvoiceType, { label: string; icon: LucideIcon; tone: string }> = {
  RENT:        { label: 'Tiền nhà',     icon: Home,     tone: 'bg-violet-50 text-violet-600' },
  ELECTRICITY: { label: 'Tiền điện',    icon: Zap,      tone: 'bg-amber-50 text-amber-600' },
  WATER:       { label: 'Tiền nước',    icon: Droplets, tone: 'bg-sky-50 text-sky-600' },
  SERVICE:     { label: 'Dịch vụ',      icon: Layers,   tone: 'bg-teal-50 text-teal-600' },
  MAINTENANCE: { label: 'Phí sửa chữa', icon: Wrench,   tone: 'bg-rose-50 text-rose-600' },
  OTHER:       { label: 'Khoản khác',   icon: FileText, tone: 'bg-slate-100 text-slate-500' },
};

const STATUS_META: Record<AdminInvoiceStatus, { label: string; pill: string; dot: string }> = {
  PENDING:   { label: 'Chờ thu',  pill: 'bg-amber-50 text-amber-700 ring-amber-200',       dot: 'bg-amber-500' },
  PAID:      { label: 'Đã thu',   pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  OVERDUE:   { label: 'Quá hạn',  pill: 'bg-rose-50 text-rose-700 ring-rose-200',          dot: 'bg-rose-500' },
  PARTIAL:   { label: 'Trả 1 phần', pill: 'bg-blue-50 text-blue-700 ring-blue-200',        dot: 'bg-blue-500' },
  CANCELLED: { label: 'Đã huỷ',   pill: 'bg-slate-100 text-slate-500 ring-slate-200',      dot: 'bg-slate-400' },
};

const CLAIM_META: Record<AdminPaymentRow['status'], { label: string; color: string }> = {
  PENDING_VERIFY: { label: 'Chờ xác nhận', color: 'text-amber-600' },
  VERIFIED:       { label: 'Đã xác nhận',  color: 'text-emerald-600' },
  REJECTED:       { label: 'Bị từ chối',   color: 'text-rose-600' },
};

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR / VietQR', PAYOS: 'PayOS', BANK_TRANSFER: 'Chuyển khoản', CASH: 'Tiền mặt', EWALLET: 'Ví điện tử',
};
const methodLabel = (m?: string) => (m ? METHOD_LABEL[m.toUpperCase()] ?? m : '');

/** Mã phí sửa chữa: HD-MAINT-{contractId}-{ts} — BE gom khoản đền bù khách làm hư. */
const typeOf = (r: InvoiceBoardRow): AdminInvoiceType =>
  r.type === 'OTHER' && r.code.toUpperCase().startsWith('HD-MAINT') ? 'MAINTENANCE' : r.type;

const roomText = (r: InvoiceBoardRow) =>
  r.roomNumber && r.roomNumber !== 'NGUYEN_CAN' && r.roomNumber !== r.propertyName
    ? `P.${r.roomNumber}` : 'Nguyên căn';

const isUtility = (t: AdminInvoiceType) => t === 'ELECTRICITY' || t === 'WATER';

/** 'T10/2026'; điện/nước ghi rõ là tháng TIÊU THỤ (trả sau — thu vào tháng kế tiếp). */
const monthText = (r: InvoiceBoardRow) =>
  r.month && r.year ? `${isUtility(r.type) ? 'tiêu thụ ' : ''}T${r.month}/${r.year}` : '';

/** Số ngày từ hôm nay (giờ server) tới `iso` — âm là đã qua. */
const daysUntil = (iso?: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const now = serverNow();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
};

/** Cộng tiền, BỎ QUA vỏ bọc `HD-ONBOARD-*` (xem chú thích ở `InvoiceBoardRow`). */
const sumMoney = (list: InvoiceBoardRow[]) =>
  list.reduce((s, r) => (r.isOnboardEnvelope ? s : s + r.amount), 0);

type StatusKey = 'all' | 'OVERDUE' | 'PENDING' | 'PAID' | 'CANCELLED';
type TypeKey = 'all' | AdminInvoiceType;
type SortKey = 'urgent' | 'newest' | 'due-asc' | 'amount-desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'urgent', label: 'Cần thu trước' },
  { key: 'newest', label: 'Mới phát hành' },
  { key: 'due-asc', label: 'Hạn thu gần nhất' },
  { key: 'amount-desc', label: 'Số tiền lớn nhất' },
];

const STATUS_RANK: Record<AdminInvoiceStatus, number> = { OVERDUE: 0, PENDING: 1, PARTIAL: 1, PAID: 2, CANCELLED: 3 };

// ── Component ────────────────────────────────────────────────────────────────
export const InvoiceBoard = ({
  rows, payments, loading, liveOn, onReload,
  period, onPeriodChange, periods, allowAllPeriods = true,
  canOpenDetail = true, renderDetailActions, maintenancePath, exportName = 'HoaDon_HoangBinhLand',
  notice,
}: {
  rows: InvoiceBoardRow[];
  payments: AdminPaymentRow[];
  loading: boolean;
  liveOn: boolean;
  onReload: () => void;
  /** 'YYYY-MM' hoặc '' (= mọi kỳ). */
  period: string;
  onPeriodChange: (p: string) => void;
  periods: string[];
  allowAllPeriods?: boolean;
  /** Chế độ rút gọn của host không có dữ liệu chi tiết → không mở khung. */
  canOpenDetail?: boolean;
  renderDetailActions?: (row: InvoiceBoardRow) => ReactNode;
  /** Link sang trang bảo trì cho hoá đơn phí sửa chữa. */
  maintenancePath?: string;
  exportName?: string;
  /** Khối thông báo riêng của từng trang (vd host đang ở chế độ rút gọn). */
  notice?: ReactNode;
}) => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [typeFilter, setTypeFilter] = useState<TypeKey>('all');
  const [property, setProperty] = useState('all');
  const [sort, setSort] = useState<SortKey>('urgent');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => { setPage(1); setOpenKey(null); }, [q, status, typeFilter, property, sort, perPage, period]);

  const paymentsOf = useMemo(() => {
    const map = new Map<string, AdminPaymentRow[]>();
    for (const p of payments) {
      if (!p.invoiceCode) continue;
      map.set(p.invoiceCode, [...(map.get(p.invoiceCode) ?? []), p]);
    }
    return map;
  }, [payments]);

  const propertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả nhà' },
    ...[...new Set(rows.map(r => r.propertyName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [rows]);

  const typeOptions = useMemo(() => {
    const present = new Set(rows.map(typeOf));
    return [
      { key: 'all' as TypeKey, label: 'Mọi loại khoản' },
      ...(Object.keys(TYPE_META) as AdminInvoiceType[])
        .filter(t => present.has(t))
        .map(t => ({ key: t as TypeKey, label: TYPE_META[t].label })),
    ];
  }, [rows]);

  /** Phạm vi của 4 ô số + chip: theo nhà + loại, KHÔNG theo trạng thái (để chip đếm đúng). */
  const scoped = useMemo(() => rows.filter(r =>
    (property === 'all' || r.propertyName === property)
    && (typeFilter === 'all' || typeOf(r) === typeFilter)
    && matchVi(q, r.code, r.propertyName, r.roomNumber, r.tenantName, r.periodLabel)), [rows, property, typeFilter, q]);

  const matchStatus = (r: InvoiceBoardRow, s: StatusKey) =>
    s === 'all' ? true
      : s === 'PENDING' ? r.status === 'PENDING' || r.status === 'PARTIAL'
        : r.status === s;

  const stats = useMemo(() => {
    const live = scoped.filter(r => r.status !== 'CANCELLED');
    const paid = live.filter(r => r.status === 'PAID');
    const pending = live.filter(r => matchStatus(r, 'PENDING'));
    const overdue = live.filter(r => r.status === 'OVERDUE');
    const totalAmt = sumMoney(live);
    return {
      totalAmt, count: live.length,
      paidAmt: sumMoney(paid), paid: paid.length,
      pendingAmt: sumMoney(pending), pending: pending.length,
      overdueAmt: sumMoney(overdue), overdue: overdue.length,
      paidPct: totalAmt ? Math.round((sumMoney(paid) / totalAmt) * 100) : 0,
    };
  }, [scoped]);

  const counts = useMemo(() => ({
    all: scoped.length,
    OVERDUE: scoped.filter(r => matchStatus(r, 'OVERDUE')).length,
    PENDING: scoped.filter(r => matchStatus(r, 'PENDING')).length,
    PAID: scoped.filter(r => matchStatus(r, 'PAID')).length,
    CANCELLED: scoped.filter(r => matchStatus(r, 'CANCELLED')).length,
  }), [scoped]);

  const filtered = useMemo(() => {
    const list = scoped.filter(r => matchStatus(r, status));
    const byNewest = (a: InvoiceBoardRow, b: InvoiceBoardRow) =>
      (b.createdAt ?? b.dueDate ?? '').localeCompare(a.createdAt ?? a.dueDate ?? '');
    switch (sort) {
      case 'urgent':
        return list.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status])
          || (a.status === 'PAID' ? byNewest(a, b) : (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')));
      case 'newest': return list.sort(byNewest);
      case 'due-asc': return list.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
      case 'amount-desc': return list.sort((a, b) => b.amount - a.amount);
    }
    return list;
  }, [scoped, status, sort]);

  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const activeFilters = (q ? 1 : 0) + (status !== 'all' ? 1 : 0) + (property !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);
  const resetFilters = () => { setQ(''); setStatus('all'); setProperty('all'); setTypeFilter('all'); };
  const periodName = period ? monthLabel(period) : 'mọi kỳ';

  const handleExport = () => {
    exportToExcel(`${exportName}${period ? `_${period}` : ''}`, [{
      name: 'Hoá đơn',
      rows: filtered.map(r => ({
        'Mã hóa đơn': r.code,
        'Loại': TYPE_META[typeOf(r)].label,
        'Kỳ': monthText(r) || r.periodLabel,
        'Kỳ tính': r.periodLabel,
        'Nhà': r.propertyName,
        'Phòng': roomText(r),
        'Khách thuê': r.tenantName,
        'Số tiền (₫)': r.amount,
        'Phát hành': fmtDate(r.createdAt),
        'Hạn thu': fmtDate(r.dueDate),
        'Đã thu lúc': r.paidAt ? fmtDateTime(r.paidAt) : '',
        'Trạng thái': STATUS_META[r.status].label,
        'Ghi chú đối soát': r.isOnboardEnvelope
          ? 'Khoản gộp (cọc + tiền nhà kỳ đầu) — KHÔNG cộng vào tổng'
          : r.collectedAtOnboard ? `Thu chung với tiền cọc trong ${r.collectedInInvoiceCode}` : '',
      })),
    }]);
  };

  const kpis: { key: StatusKey | null; label: string; value: string; sub: string; icon: LucideIcon; tone: string; bar?: number }[] = [
    { key: null, label: `Phải thu · ${periodName}`, value: formatCurrency(stats.totalAmt), sub: `${stats.count} hoá đơn`, icon: Receipt, tone: 'text-indigo-600 bg-indigo-50' },
    { key: 'PAID', label: 'Đã thu', value: formatCurrency(stats.paidAmt), sub: `${stats.paid} hoá đơn · ${stats.paidPct}%`, icon: Wallet, tone: 'text-emerald-600 bg-emerald-50', bar: stats.paidPct },
    { key: 'PENDING', label: 'Chờ thu', value: formatCurrency(stats.pendingAmt), sub: `${stats.pending} hoá đơn`, icon: Clock, tone: 'text-amber-600 bg-amber-50' },
    { key: 'OVERDUE', label: 'Quá hạn', value: formatCurrency(stats.overdueAmt), sub: `${stats.overdue} hoá đơn`, icon: AlertTriangle, tone: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Thanh kỳ + công cụ ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-3 pr-1">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400">Kỳ</span>
          <select
            value={period}
            onChange={e => onPeriodChange(e.target.value)}
            className="cursor-pointer rounded-lg bg-transparent px-2 py-1.5 text-sm font-bold text-slate-800 outline-none hover:bg-slate-50"
          >
            {allowAllPeriods && <option value="">Tất cả các kỳ</option>}
            {periods.map(p => <option key={p} value={p}>{monthLabel(p)}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <RealtimeBadge connected={liveOn} />
          <button onClick={onReload} disabled={loading} title="Tải lại"
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">
            <Download className="h-4 w-4" /> Xuất Excel
          </button>
        </div>
      </div>

      {period && (
        <p className="-mt-2 text-xs text-slate-400">
          Kỳ thu {periodName.toLowerCase()} gồm tiền nhà, phí phát sinh của tháng này và <b className="font-semibold text-slate-500">điện, nước tiêu thụ tháng trước</b> (điện nước trả sau).
        </p>
      )}

      {notice}

      {/* ── 4 ô số — theo kỳ đang chọn; bấm để lọc ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map(k => {
          const active = k.key !== null && status === k.key;
          return (
            <button
              key={k.label}
              type="button"
              disabled={k.key === null}
              onClick={() => k.key && setStatus(prev => (prev === k.key ? 'all' : k.key!))}
              className={`rounded-2xl border bg-white p-4 text-left transition ${
                active ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
              } ${k.key ? 'hover:border-slate-300 hover:shadow-sm' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-lg p-1.5 ${k.tone}`}><k.icon className="h-4 w-4" /></span>
                <span className="truncate text-xs font-semibold text-slate-500">{k.label}</span>
              </div>
              <p className="mt-2.5 truncate text-xl font-extrabold tabular-nums text-slate-900">{k.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{k.sub}</p>
              {k.bar != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${k.bar}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Danh sách ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={q} onChange={setQ} className="flex-1"
              placeholder="Tìm khách thuê, nhà, phòng, mã hoá đơn… (không cần dấu)" />
            <div className="flex flex-wrap items-center gap-2">
              <SelectFilter value={typeFilter} onChange={setTypeFilter} options={typeOptions} icon={Layers} title="Loại khoản" />
              <SelectFilter value={property} onChange={setProperty} options={propertyOptions} icon={Building2} title="Nhà" />
              <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[190px]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ChipFilter
              value={status}
              onChange={setStatus}
              options={[
                { key: 'all' as StatusKey, label: 'Tất cả', count: counts.all },
                { key: 'OVERDUE' as StatusKey, label: 'Quá hạn', count: counts.OVERDUE },
                { key: 'PENDING' as StatusKey, label: 'Chờ thu', count: counts.PENDING },
                { key: 'PAID' as StatusKey, label: 'Đã thu', count: counts.PAID },
                ...(counts.CANCELLED > 0 ? [{ key: 'CANCELLED' as StatusKey, label: 'Đã huỷ', count: counts.CANCELLED }] : []),
              ]}
            />
            {activeFilters > 0 && (
              <button onClick={resetFilters} className="text-xs font-semibold text-indigo-600 hover:underline">
                Xoá bộ lọc ({activeFilters})
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Khách · Phòng</th>
                <th className="px-4 py-3">Khoản</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3">Hạn thu</th>
                <th className="px-4 py-3">Trạng thái</th>
                {canOpenDetail && <th className="w-10 px-2 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(r => {
                const t = TYPE_META[typeOf(r)];
                const st = STATUS_META[r.status];
                const open = openKey === r.key;
                const d = daysUntil(r.dueDate);
                const dueHint =
                  r.status === 'PAID' ? (r.paidAt ? `đã thu ${fmtDate(r.paidAt).slice(0, 5)}` : '')
                    : r.status === 'CANCELLED' || d == null ? ''
                      : d < 0 ? `quá hạn ${-d} ngày`
                        : d === 0 ? 'hạn hôm nay' : `còn ${d} ngày`;
                return (
                  <Fragment key={r.key}>
                    <tr
                      onClick={() => canOpenDetail && setOpenKey(open ? null : r.key)}
                      className={`transition-colors ${canOpenDetail ? 'cursor-pointer' : ''} ${
                        open ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}
                    >
                      <td className="max-w-[260px] px-5 py-3">
                        <p className="truncate font-semibold text-slate-900" title={r.tenantName}>{r.tenantName}</p>
                        <p className="truncate text-xs text-slate-400" title={r.propertyName}>
                          {roomText(r)} · {r.propertyName}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`rounded-lg p-1.5 ${t.tone}`}><t.icon className="h-4 w-4" /></span>
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-medium text-slate-800">{t.label}</p>
                            <p className="whitespace-nowrap text-xs text-slate-400">
                              {monthText(r) || r.periodLabel}
                              {r.isOnboardEnvelope && ' · khoản gộp'}
                              {r.collectedAtOnboard && ' · thu cùng cọc'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${
                        r.isOnboardEnvelope || r.status === 'CANCELLED' ? 'text-slate-400' : 'text-slate-900'}`}>
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="tabular-nums text-slate-700">{fmtDate(r.dueDate)}</p>
                        {dueHint && (
                          <p className={`text-xs ${r.status === 'OVERDUE' ? 'font-semibold text-rose-600'
                            : r.status === 'PAID' ? 'text-emerald-600' : d != null && d <= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {dueHint}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${st.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                        </span>
                      </td>
                      {canOpenDetail && (
                        <td className="px-2 py-3 text-slate-400">
                          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180 text-indigo-500' : ''}`} />
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/70 px-5 py-4">
                          <InvoiceDetail
                            row={r}
                            claims={paymentsOf.get(r.code) ?? []}
                            maintenancePath={maintenancePath}
                            actions={renderDetailActions?.(r)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {paged.length === 0 && (
                <TableState colSpan={6} loading={loading} filtered={activeFilters > 0}
                  empty={`Chưa có hoá đơn nào ${period ? `trong ${periodName.toLowerCase()}` : ''}.`} />
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={perPage} total={filtered.length}
          onPage={setPage} onPerPage={setPerPage} unit="hoá đơn" />
      </div>
    </div>
  );
};

// ── Khung chi tiết ───────────────────────────────────────────────────────────
const InvoiceDetail = ({
  row: r, claims, maintenancePath, actions,
}: {
  row: InvoiceBoardRow;
  claims: AdminPaymentRow[];
  maintenancePath?: string;
  actions?: ReactNode;
}) => {
  const [copied, setCopied] = useState(false);
  const type = typeOf(r);
  const t = TYPE_META[type];
  const st = STATUS_META[r.status];
  const d = daysUntil(r.dueDate);
  const periodTitle = r.month && r.year ? monthLabel(`${r.year}-${String(r.month).padStart(2, '0')}`) : '';
  // Kỳ tính chỉ hiện khi nói thêm được điều gì (điện/nước: "01/09 – 30/09/2026").
  const showCalcPeriod = r.periodLabel && r.periodLabel !== periodTitle && r.periodLabel !== t.label
    && !/^Phí/i.test(r.periodLabel);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(r.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Không sao chép được mã');
    }
  };

  // Dòng thời gian thanh toán — đọc từ trên xuống là biết hoá đơn đang ở đâu.
  const steps: { icon: LucideIcon; tone: string; title: string; sub?: string }[] = [
    { icon: Send, tone: 'bg-slate-100 text-slate-500', title: 'Phát hành', sub: fmtDateTime(r.createdAt) },
    ...claims.map(c => ({
      icon: Receipt,
      tone: c.status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600' : c.status === 'REJECTED' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600',
      title: `Khách báo đã chuyển ${formatCurrency(c.amount)} · ${CLAIM_META[c.status].label}`,
      sub: [methodLabel(c.method), `báo ${fmtDateTime(c.createdAt)}`, c.verifiedAt ? `xác nhận ${fmtDateTime(c.verifiedAt)}` : '']
        .filter(Boolean).join(' · '),
    })),
    r.status === 'PAID'
      ? {
        icon: Check, tone: 'bg-emerald-50 text-emerald-600',
        title: r.collectedAtOnboard ? 'Đã thu cùng tiền cọc lúc nhận phòng' : 'Đã thu đủ',
        sub: [r.paidAt ? fmtDateTime(r.paidAt) : '', methodLabel(r.paymentMethod),
          r.collectedAtOnboard && r.collectedInInvoiceCode ? `mã gộp ${r.collectedInInvoiceCode}` : '']
          .filter(Boolean).join(' · ') || undefined,
      }
      : r.status === 'CANCELLED'
        ? { icon: Info, tone: 'bg-slate-100 text-slate-500', title: 'Đã huỷ' }
        : {
          icon: r.status === 'OVERDUE' ? AlertTriangle : Clock,
          tone: r.status === 'OVERDUE' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600',
          title: r.status === 'OVERDUE' ? `Chưa thu — quá hạn ${d != null ? -d : ''} ngày` : 'Chưa thu',
          sub: `Hạn ${fmtDate(r.dueDate)}${d != null && d >= 0 ? ` · còn ${d} ngày` : ''}`,
        },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Đầu khung: khoản gì, kỳ nào, bao nhiêu, đang ở đâu */}
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-5 py-4">
        <span className={`rounded-xl p-2.5 ${t.tone}`}><t.icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-slate-900">
            {t.label}{periodTitle ? ` · ${isUtility(type) ? 'tiêu thụ ' : ''}${periodTitle.toLowerCase()}` : ''}
          </p>
          <button type="button" onClick={copyCode} title="Sao chép mã hoá đơn"
            className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-slate-400 transition hover:text-slate-600">
            {r.code}
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-extrabold tabular-nums ${r.isOnboardEnvelope ? 'text-slate-400' : 'text-slate-900'}`}>
            {formatCurrency(r.amount)}
          </p>
          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
          </span>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Thông tin */}
        <div className="border-slate-100 px-5 py-4 md:border-r">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Thông tin</p>
          <dl className="space-y-2 text-sm">
            {[
              ['Khách thuê', r.tenantName],
              ['Nhà · phòng', `${r.propertyName} · ${roomText(r)}`],
              ...(showCalcPeriod ? [['Kỳ tính', r.periodLabel]] : []),
              ['Hạn thu', fmtDate(r.dueDate)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <dt className="w-28 shrink-0 text-slate-400">{k}</dt>
                <dd className="min-w-0 font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>

          {r.isOnboardEnvelope && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              <b>Khoản gộp lúc nhận phòng</b> = tiền cọc (giữ hộ, hoàn khi trả phòng) + tiền nhà kỳ đầu
              (đã có hoá đơn tiền nhà riêng). Hai phần đã tính đúng chỗ nên dòng này <b>không cộng vào tổng</b>.
            </p>
          )}
          {type === 'MAINTENANCE' && (
            <p className="mt-3 rounded-xl bg-rose-50/60 px-3 py-2.5 text-xs leading-relaxed text-rose-800">
              Phí sửa chữa do khách làm hư — hệ thống gom các khoản đền bù của hợp đồng thành một hoá đơn.
              {maintenancePath && (
                <> <Link to={maintenancePath} className="font-semibold underline">Xem phiếu bảo trì →</Link></>
              )}
            </p>
          )}
        </div>

        {/* Dòng thanh toán */}
        <div className="px-5 py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Dòng thanh toán</p>
          <ol className="relative space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="relative flex gap-3">
                {i < steps.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-4px)] w-px bg-slate-200" />}
                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.tone}`}>
                  <s.icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                  {s.sub && <p className="text-xs text-slate-400">{s.sub}</p>}
                </div>
              </li>
            ))}
          </ol>
          {claims.length === 0 && r.status !== 'PAID' && r.status !== 'CANCELLED' && (
            <p className="mt-3 text-xs text-slate-400">
              Khách trả qua QR/PayOS thì hệ thống tự đối soát — không cần khách báo tay.
            </p>
          )}
        </div>
      </div>

      {actions && <div className="border-t border-slate-100 px-5 py-4">{actions}</div>}
    </div>
  );
};
