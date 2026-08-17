import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import {
  CreditCard, Receipt, Wallet, Clock, AlertTriangle, ChevronDown, Download, RefreshCw,
  Building2, ArrowDownUp, Layers, Lock, PiggyBank, ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import { exportToExcel } from '@/utils/exportExcel';
import {
  adminService,
  type AdminInvoiceRow, type AdminInvoiceStatus, type AdminInvoiceType, type AdminPaymentRow,
} from '@/services/admin.service';
import { hostService } from '@/services/host.service';
import { RealtimeBadge } from '@/pages/admin/shared';
import {
  CURRENT_MONTH, ChipFilter, FilterBar, Pagination, SearchBox, SelectFilter, TableState,
  cmpIsoDesc, fmtDate, fmtDateTime, matchVi, monthLabel, pageSlice, shiftMonth,
} from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Hoá đơn & Thanh toán (Host) — bản cho Host của màn admin BillingPaymentMonitoring.
//
// ⚠ Nguồn dữ liệu phụ thuộc quyền BE, trang tự dò và báo rõ đang ở chế độ nào:
//
//  A. ĐẦY ĐỦ  — `GET /api/v1/manager/invoices` + `/api/v1/manager/payments`
//     Hoá đơn THẬT trong bảng `tenant_invoice`: có mã hoá đơn, đủ loại (tiền phòng,
//     điện, nước, dịch vụ, bảo trì), ngày phát hành, hạn thu thật và các giao dịch
//     khách đã báo. Đây là nguồn admin đang dùng.
//     Hiện 2 endpoint này là `@PreAuthorize("hasAnyRole('MANAGER','ADMIN')")` nên
//     Host gọi bị 403 — xem docs/BE-NEED-host-billing-2026-08-09.md.
//
//  B. RÚT GỌN — `GET /api/v1/host/invoices?month=` (fallback khi A trả 403)
//     BE dựng hoá đơn tiền phòng on-the-fly từ hợp đồng ACTIVE của đúng 1 kỳ:
//     không có mã hoá đơn thật, không có điện/nước/dịch vụ, không có giao dịch.
//
// Khi BE mở quyền cho ROLE_OWNER, trang tự chuyển sang chế độ A, không cần sửa FE.
// ══════════════════════════════════════════════════════════════════════════════

const TYPE_META: Record<AdminInvoiceType, { label: string; color: string }> = {
  RENT: { label: 'Tiền phòng', color: 'bg-violet-100 text-violet-700' },
  ELECTRICITY: { label: 'Tiền điện', color: 'bg-amber-100 text-amber-700' },
  WATER: { label: 'Tiền nước', color: 'bg-sky-100 text-sky-700' },
  SERVICE: { label: 'Dịch vụ', color: 'bg-teal-100 text-teal-700' },
  MAINTENANCE: { label: 'Phí bảo trì', color: 'bg-rose-100 text-rose-700' },
  OTHER: { label: 'Khác', color: 'bg-slate-100 text-slate-600' },
};

const STATUS_META: Record<AdminInvoiceStatus, { label: string; color: string; dot: string }> = {
  PENDING: { label: 'Chờ thanh toán', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  PAID: { label: 'Đã thanh toán', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  OVERDUE: { label: 'Quá hạn', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  PARTIAL: { label: 'Thanh toán 1 phần', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  CANCELLED: { label: 'Đã huỷ', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

const PAYMENT_STATUS_META: Record<AdminPaymentRow['status'], { label: string; color: string }> = {
  PENDING_VERIFY: { label: 'Chờ đối soát', color: 'bg-amber-100 text-amber-700' },
  VERIFIED: { label: 'Đã xác nhận', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Bị từ chối', color: 'bg-rose-100 text-rose-700' },
};

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR / VietQR', PAYOS: 'PayOS', BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt', EWALLET: 'Ví điện tử',
};

/** 1 dòng hoá đơn đã chuẩn hoá — dùng chung cho cả 2 chế độ nguồn dữ liệu. */
interface BillingRow {
  key: string;
  code: string;
  type: AdminInvoiceType;
  propertyName: string;
  roomNumber?: string;
  tenantName: string;
  periodLabel: string;
  amount: number;
  status: AdminInvoiceStatus;
  dueDate?: string;
  createdAt?: string;
  /** `HD-ONBOARD-*` — vỏ bọc gộp cọc + tiền nhà kỳ đầu, KHÔNG cộng vào tổng. */
  isOnboardEnvelope?: boolean;
  /** Tiền nhà kỳ đầu, thu chung lần với cọc — vẫn là doanh thu thật, vẫn cộng. */
  collectedAtOnboard?: boolean;
  collectedInInvoiceCode?: string;
}

const fromAdminRow = (r: AdminInvoiceRow): BillingRow => ({
  key: String(r.id),
  code: r.code,
  type: r.type,
  propertyName: r.propertyName,
  roomNumber: r.roomNumber,
  tenantName: r.tenantName,
  periodLabel: r.periodLabel,
  amount: r.amount,
  status: r.status,
  dueDate: r.dueDate,
  createdAt: r.createdAt,
  isOnboardEnvelope: r.isOnboardEnvelope,
  collectedAtOnboard: r.collectedAtOnboard,
  collectedInInvoiceCode: r.collectedInInvoiceCode,
});

/**
 * Cộng tiền, BỎ QUA vỏ bọc `HD-ONBOARD-*`.
 *
 * Khách nhận phòng chuyển MỘT lần gồm tiền cọc (giữ hộ, hoàn lại khi trả phòng — không
 * phải doanh thu) và tiền nhà chu kỳ đầu (doanh thu, đã có hoá đơn `HD-RENT-*` riêng).
 * Cộng cả vỏ bọc là vừa tính trùng tiền nhà vừa coi tiền cọc là doanh thu.
 */
const sumMoney = (list: BillingRow[]) =>
  list.reduce((s, r) => (r.isOnboardEnvelope ? s : s + r.amount), 0);

type StatusKey = 'all' | AdminInvoiceStatus;
type TypeKey = 'all' | AdminInvoiceType;
type SortKey = 'newest' | 'oldest' | 'due-asc' | 'amount-desc' | 'amount-asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Mới phát hành nhất' },
  { key: 'due-asc', label: 'Hạn thu gần nhất' },
  { key: 'amount-desc', label: 'Số tiền cao → thấp' },
  { key: 'amount-asc', label: 'Số tiền thấp → cao' },
  { key: 'oldest', label: 'Cũ nhất' },
];

/** 12 kỳ gần nhất, mới nhất trước. */
const PERIODS = Array.from({ length: 12 }, (_, i) => shiftMonth(CURRENT_MONTH, -i));

/**
 * Dò quyền đúng MỘT lần mỗi phiên (single-flight, nhớ cả kết quả âm).
 * Interceptor api.ts tự thử lại GET 403 một lần, cộng StrictMode nhân đôi effect →
 * nếu mỗi lần đổi bộ lọc đều dò lại thì console ngập 403 vô ích.
 */
let accessProbe: Promise<boolean> | null = null;
const probeFullAccess = (): Promise<boolean> => {
  accessProbe ??= adminService.listInvoices({}).then(() => true).catch(() => false);
  return accessProbe;
};

export const BillingPayments = () => {
  /** Đã dò được quyền chưa, và đang ở chế độ nào. */
  const [fullAccess, setFullAccess] = useState<boolean | null>(null);
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  /** '' = mọi kỳ (chỉ dùng được ở chế độ đầy đủ — BE host bắt buộc 1 kỳ). */
  const [period, setPeriod] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [typeFilter, setTypeFilter] = useState<TypeKey>('all');
  const [property, setProperty] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setOpenKey(null);

    // Nguồn đầy đủ nếu BE cho phép; 403 = chưa mở quyền cho Host → rơi xuống fallback.
    const canUseReal = await probeFullAccess();
    setFullAccess(canUseReal);

    if (canUseReal) {
      const [real, claims] = await Promise.all([
        adminService.listInvoices({
          period: period || undefined,
          type: typeFilter === 'all' ? undefined : typeFilter,
        }).catch(() => [] as AdminInvoiceRow[]),
        adminService.listPayments().catch(() => [] as AdminPaymentRow[]),
      ]);
      setRows(real.map(fromAdminRow));
      setPayments(claims);
      setLoading(false);
      return;
    }
    setPayments([]);

    // Fallback: hoá đơn tiền phòng suy từ hợp đồng, mỗi lần đúng 1 kỳ.
    const ym = period || CURRENT_MONTH;
    const page0 = await hostService.getInvoices({ month: ym, size: 500 }).catch(() => null);
    setRows((page0?.content ?? []).map(i => ({
      key: i.id,
      code: i.id,
      type: 'RENT' as AdminInvoiceType,
      propertyName: i.propertyName,
      roomNumber: i.roomCode,
      tenantName: i.tenantName?.trim() || '(chưa có tên khách)',
      periodLabel: `Tiền nhà ${monthLabel(ym).toLowerCase()}`,
      amount: i.amount,
      // BE host trả UNPAID; quy về PENDING cho khớp enum hoá đơn thật.
      status: (i.status === 'UNPAID' ? 'PENDING' : i.status) as AdminInvoiceStatus,
      dueDate: i.dueDate,
    })));
    setLoading(false);
  }, [period, typeFilter]);

  useEffect(() => { load(); }, [load]);

  /**
   * Khách thanh toán → BE bắn `INVOICE_PAID` qua WebSocket → nạp lại danh sách.
   * Refetch chứ không vá dòng tại chỗ: payload cố tình KHÔNG có số tiền, mà bảng này
   * hiện tiền; vá bằng dữ liệu thiếu sẽ ra bảng nửa cũ nửa mới. Refetch cũng lo luôn
   * trường hợp hoá đơn vừa PAID không nằm trong bộ lọc đang xem.
   */
  const { connected: liveOn } = useBillingRealtime({
    onRefresh: load,
    onEvent: (event) => {
      if (event.event !== 'INVOICE_PAID') return;
      const who = [event.tenantName, event.roomNumber].filter(Boolean).join(' · ');
      toast.success(who ? `Vừa thanh toán: ${who}` : 'Có hoá đơn vừa được thanh toán');
    },
  });
  // Đổi bộ lọc client thì về trang 1.
  useEffect(() => { setPage(1); setOpenKey(null); }, [q, status, property, sort, perPage]);

  /** Giao dịch của 1 hoá đơn — khớp theo mã hoá đơn (chỉ có ở chế độ đầy đủ). */
  const paymentsOf = useMemo(() => {
    const map = new Map<string, AdminPaymentRow[]>();
    for (const p of payments) {
      if (!p.invoiceCode) continue;
      map.set(p.invoiceCode, [...(map.get(p.invoiceCode) ?? []), p]);
    }
    return map;
  }, [payments]);

  const propertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả bất động sản' },
    ...[...new Set(rows.map(r => r.propertyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [rows]);

  const statusCounts = useMemo(() => {
    const base = rows.filter(r => property === 'all' || r.propertyName === property);
    return {
      all: base.length,
      PAID: base.filter(r => r.status === 'PAID').length,
      PENDING: base.filter(r => r.status === 'PENDING').length,
      PARTIAL: base.filter(r => r.status === 'PARTIAL').length,
      OVERDUE: base.filter(r => r.status === 'OVERDUE').length,
      CANCELLED: base.filter(r => r.status === 'CANCELLED').length,
    };
  }, [rows, property]);

  const filtered = useMemo(() => {
    const list = rows.filter(r =>
      (status === 'all' || r.status === status) &&
      (property === 'all' || r.propertyName === property) &&
      matchVi(q, r.code, r.propertyName, r.roomNumber, r.tenantName, r.periodLabel));

    const sorted = [...list];
    switch (sort) {
      // Không có createdAt (chế độ rút gọn) thì lấy hạn thu làm mốc thời gian.
      case 'newest': sorted.sort((a, b) => cmpIsoDesc(a.createdAt ?? a.dueDate, b.createdAt ?? b.dueDate)); break;
      case 'oldest': sorted.sort((a, b) => cmpIsoDesc(b.createdAt ?? b.dueDate, a.createdAt ?? a.dueDate)); break;
      case 'due-asc': sorted.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')); break;
      case 'amount-desc': sorted.sort((a, b) => b.amount - a.amount); break;
      case 'amount-asc': sorted.sort((a, b) => a.amount - b.amount); break;
    }
    return sorted;
  }, [rows, status, property, q, sort]);

  const paged = pageSlice(filtered, page, perPage);

  const stats = useMemo(() => {
    const scoped = rows.filter(r => property === 'all' || r.propertyName === property);
    const paid = scoped.filter(r => r.status === 'PAID');
    const pending = scoped.filter(r => r.status === 'PENDING' || r.status === 'PARTIAL');
    const overdue = scoped.filter(r => r.status === 'OVERDUE');
    return {
      total: scoped.length, totalAmt: sumMoney(scoped),
      paid: paid.length, paidAmt: sumMoney(paid),
      pending: pending.length, pendingAmt: sumMoney(pending),
      overdue: overdue.length, overdueAmt: sumMoney(overdue),
    };
  }, [rows, property]);

  const activeFilters = (q ? 1 : 0) + (status !== 'all' ? 1 : 0) + (property !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);
  const resetFilters = () => { setQ(''); setStatus('all'); setProperty('all'); setTypeFilter('all'); setPage(1); };
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };
  const toggleStatus = (s: AdminInvoiceStatus) => { setStatus(prev => (prev === s ? 'all' : s)); setPage(1); };

  const handleExport = () => {
    exportToExcel(`HoaDonThanhToan_HoangBinhLand${period ? `_${period}` : ''}`, [{
      name: 'Hoá đơn',
      rows: filtered.map(r => ({
        'Mã hóa đơn': r.code, 'Loại': TYPE_META[r.type].label, 'Kỳ thanh toán': r.periodLabel,
        'Bất động sản': r.propertyName,
        'Phòng': r.roomNumber && r.roomNumber !== 'NGUYEN_CAN' ? r.roomNumber : 'Nguyên căn',
        'Khách thuê': r.tenantName, 'Số tiền (₫)': r.amount,
        'Ngày phát hành': fmtDate(r.createdAt), 'Hạn thu': fmtDate(r.dueDate),
        'Trạng thái': STATUS_META[r.status].label,
        // Cột này để người mở file Excel không cộng nhầm cột "Số tiền": dòng vỏ bọc
        // HD-ONBOARD chứa cả tiền cọc (phải trả lại khách) lẫn tiền nhà đã có dòng riêng.
        'Ghi chú đối soát': r.isOnboardEnvelope
          ? 'Khoản gộp (cọc + tiền nhà kỳ đầu) — KHÔNG cộng vào tổng, xem 2 dòng thành phần'
          : r.collectedAtOnboard
            ? `Thu chung với tiền cọc trong ${r.collectedInInvoiceCode}` : '',
      })),
    }]);
  };

  const kpis = [
    { label: 'Tổng hoá đơn', value: String(stats.total), sub: formatCurrency(stats.totalAmt), icon: Receipt, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500', key: null },
    { label: 'Đã thanh toán', value: String(stats.paid), sub: formatCurrency(stats.paidAmt), icon: Wallet, bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-l-emerald-500', key: 'PAID' as const },
    { label: 'Chờ thu', value: String(stats.pending), sub: formatCurrency(stats.pendingAmt), icon: Clock, bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-l-amber-500', key: 'PENDING' as const },
    { label: 'Quá hạn', value: String(stats.overdue), sub: formatCurrency(stats.overdueAmt), icon: AlertTriangle, bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500', key: 'OVERDUE' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-xl bg-indigo-50 p-2.5"><CreditCard className="h-5 w-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hoá đơn & Thanh toán</h1>
            <p className="mt-1 text-sm text-slate-500">
              {fullAccess
                ? 'Toàn bộ hoá đơn thật của hệ thống (tiền phòng, điện, nước, dịch vụ, bảo trì) — mới phát hành nằm trên đầu'
                : `Hoá đơn tiền phòng ${monthLabel(period || CURRENT_MONTH).toLowerCase()} — suy từ hợp đồng đang hiệu lực`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Nói rõ trang đang cập nhật bằng lớp nào — xem RealtimeBadge. */}
          <RealtimeBadge connected={liveOn} />
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setPage(1); }}
            className="w-44 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          >
            {/* Chế độ rút gọn: BE host bắt buộc đúng 1 kỳ nên không có "tất cả". */}
            {fullAccess !== false && <option value="">Tất cả các kỳ</option>}
            {PERIODS.map(p => <option key={p} value={p}>{monthLabel(p)}</option>)}
          </select>
          <button onClick={load} disabled={loading} title="Tải lại dữ liệu"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Báo rõ đang thiếu gì khi BE chưa mở quyền — tránh Host tưởng hệ thống chỉ có bấy nhiêu hoá đơn */}
      {fullAccess === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2"><Lock className="h-5 w-5 text-amber-600" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">Đang xem bản rút gọn — backend chưa mở quyền hoá đơn cho Host</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Bảng hoá đơn thật (<code className="rounded bg-amber-100 px-1">/api/v1/manager/invoices</code>) hiện chỉ cho
                vai trò MANAGER và ADMIN, Host gọi bị 403. Vì vậy màn này tạm dựng hoá đơn tiền phòng từ hợp đồng đang hiệu
                lực của một kỳ: <b>chưa có mã hoá đơn thật, chưa có hoá đơn điện / nước / dịch vụ / bảo trì và chưa có lịch
                sử giao dịch khách đã báo</b>. Khi backend cho ROLE_OWNER vào, màn này tự hiện đầy đủ.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Link to="/host/receivables"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
                  Công nợ phải thu <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link to="/host/deposits"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
                  <PiggyBank className="h-3.5 w-3.5" /> Sổ cọc
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI — bấm để lọc nhanh theo trạng thái */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => {
          const active = k.key !== null && status === k.key;
          return (
            <button
              key={k.label}
              onClick={() => k.key && toggleStatus(k.key)}
              disabled={k.key === null}
              className={`rounded-xl border border-l-4 bg-white p-5 text-left shadow-sm transition ${k.border} ${
                active ? 'border-slate-300 ring-2 ring-indigo-200' : 'border-slate-100'
              } ${k.key ? 'hover:shadow-md' : 'cursor-default'}`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k.label}</p>
                  <p className={`mt-1 text-xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{k.sub}</p>
                </div>
                <div className={`${k.bg} ml-2 flex-shrink-0 rounded-xl p-3`}><k.icon className={`h-5 w-5 ${k.color}`} /></div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bảng hoá đơn */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Receipt className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Danh sách hoá đơn</h2>
            <p className="text-xs text-slate-500">
              {filtered.length} hoá đơn · tổng {formatCurrency(sumMoney(filtered))}
              {fullAccess && ' · bấm vào dòng để xem giao dịch khách đã báo'}
            </p>
          </div>
        </div>

        <FilterBar activeCount={activeFilters} onReset={resetFilters}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox value={q} onChange={onFilter(setQ)} className="flex-1"
              placeholder="Tìm mã hóa đơn, bất động sản, phòng, khách thuê, kỳ thu... (không cần dấu)" />
            <div className="flex flex-wrap items-center gap-2">
              {/* Lọc theo loại chỉ có nghĩa khi có hoá đơn thật — bản rút gọn chỉ có tiền phòng. */}
              {fullAccess && (
                <SelectFilter value={typeFilter} onChange={onFilter(setTypeFilter)} icon={Layers} title="Lọc theo loại hoá đơn"
                  options={[
                    { key: 'all' as TypeKey, label: 'Mọi loại hoá đơn' },
                    ...(Object.keys(TYPE_META) as AdminInvoiceType[]).map(t => ({ key: t as TypeKey, label: TYPE_META[t].label })),
                  ]} />
              )}
              <SelectFilter value={property} onChange={onFilter(setProperty)} options={propertyOptions} icon={Building2} title="Lọc theo bất động sản" />
              <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[200px]" />
            </div>
          </div>
          <ChipFilter
            value={status}
            onChange={onFilter(setStatus)}
            options={[
              { key: 'all' as StatusKey, label: 'Tất cả', count: statusCounts.all },
              { key: 'OVERDUE' as StatusKey, label: 'Quá hạn', count: statusCounts.OVERDUE },
              { key: 'PENDING' as StatusKey, label: 'Chờ thanh toán', count: statusCounts.PENDING },
              ...(fullAccess ? [{ key: 'PARTIAL' as StatusKey, label: 'Trả 1 phần', count: statusCounts.PARTIAL }] : []),
              { key: 'PAID' as StatusKey, label: 'Đã thanh toán', count: statusCounts.PAID },
              ...(fullAccess ? [{ key: 'CANCELLED' as StatusKey, label: 'Đã huỷ', count: statusCounts.CANCELLED }] : []),
            ]}
          />
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Mã hoá đơn</th>
                <th className="px-4 py-3.5">Kỳ thanh toán</th>
                <th className="px-4 py-3.5">Bất động sản / Phòng</th>
                <th className="px-4 py-3.5">Khách thuê</th>
                <th className="px-4 py-3.5 text-right">Số tiền</th>
                <th className="px-4 py-3.5">Phát hành</th>
                <th className="px-4 py-3.5">Hạn thu</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                {fullAccess && <th className="w-10 px-2 py-3.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(r => {
                const type = TYPE_META[r.type];
                const st = STATUS_META[r.status];
                const claims = paymentsOf.get(r.code) ?? [];
                const open = openKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr
                      onClick={() => fullAccess && setOpenKey(open ? null : r.key)}
                      className={`transition-colors ${fullAccess ? 'cursor-pointer' : ''} hover:bg-slate-50 ${open ? 'bg-slate-50' : ''}`}
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-700">{r.code}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${type.color}`}>{type.label}</span>
                        {r.isOnboardEnvelope && (
                          <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                            Khoản gộp — không tính vào tổng
                          </span>
                        )}
                        {r.collectedAtOnboard && (
                          <span className="ml-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Thu cùng cọc lúc nhận phòng
                          </span>
                        )}
                        <p className="mt-1 text-xs text-slate-500">{r.periodLabel}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-900">{r.propertyName}</p>
                        <p className="text-xs text-slate-400">
                          {r.roomNumber && r.roomNumber !== 'NGUYEN_CAN' && r.roomNumber !== r.propertyName
                            ? `Phòng ${r.roomNumber}` : 'Nguyên căn'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{r.tenantName}</td>
                      {/* Vỏ bọc thanh toán làm mờ: hai phần của nó đã được tính ở hoá đơn
                          tiền nhà và sổ cọc, nên nó không nằm trong tổng. */}
                      <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                        r.isOnboardEnvelope ? 'text-slate-400' : 'text-slate-900'}`}>
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-xs tabular-nums text-slate-500">{fmtDate(r.createdAt)}</td>
                      <td className={`px-4 py-3.5 text-xs tabular-nums ${r.status === 'OVERDUE' ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                        {fmtDate(r.dueDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${st.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                        </span>
                      </td>
                      {fullAccess && (
                        <td className="px-2 py-3.5 text-slate-400">
                          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </td>
                      )}
                    </tr>

                    {open && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="px-5 pb-4 pt-1">
                          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Hoá đơn này thu cho khoảng nào</p>
                              <dl className="mt-2 space-y-1.5 text-sm">
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Kỳ thanh toán</dt><dd className="font-semibold text-slate-800">{r.periodLabel}</dd></div>
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Loại khoản thu</dt><dd className="font-semibold text-slate-800">{type.label}</dd></div>
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Ngày phát hành</dt><dd className="font-semibold text-slate-800">{fmtDateTime(r.createdAt)}</dd></div>
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-500">Hạn thu</dt>
                                  <dd className={`font-semibold ${r.status === 'OVERDUE' ? 'text-rose-600' : 'text-slate-800'}`}>{fmtDate(r.dueDate)}</dd>
                                </div>
                                <div className="flex justify-between gap-4 border-t border-slate-100 pt-1.5">
                                  <dt className="text-slate-500">Tổng phải thu</dt>
                                  <dd className="font-black text-slate-950">{formatCurrency(r.amount)}</dd>
                                </div>
                              </dl>

                              {r.collectedAtOnboard && (
                                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
                                  Tiền nhà chu kỳ đầu, khách trả <b>chung một lần với tiền cọc</b> lúc nhận phòng
                                  (mã gộp {r.collectedInInvoiceCode}) nên hoá đơn này không có giao dịch riêng.
                                  Đây là <b>doanh thu thật</b> và đã được tính vào tổng phía trên.
                                </p>
                              )}
                              {r.isOnboardEnvelope && (
                                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                                  Đây là <b>khoản thu gộp</b> lúc nhận phòng, không phải một khoản thu riêng:
                                  <br />• <b>Tiền cọc</b> — giữ hộ, hoàn lại khi khách trả phòng. Không phải doanh thu.
                                  <br />• <b>Tiền nhà chu kỳ đầu</b> — đã có hoá đơn riêng <b>HD-RENT-…</b> cùng kỳ.
                                  <br />Hai phần đã được tính ở đúng chỗ, nên dòng này <b>không cộng vào tổng</b>.
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Giao dịch khách đã báo ({claims.length})</p>
                              {claims.length === 0 ? (
                                <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                                  Chưa có giao dịch nào cho hoá đơn này.
                                </p>
                              ) : (
                                <ul className="mt-2 space-y-2">
                                  {claims.map(c => (
                                    <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-slate-900">{formatCurrency(c.amount)}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PAYMENT_STATUS_META[c.status].color}`}>
                                          {PAYMENT_STATUS_META[c.status].label}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {c.method ? (METHOD_LABEL[c.method.toUpperCase()] ?? c.method) : 'Không rõ hình thức'}
                                        {' · báo lúc '}{fmtDateTime(c.createdAt)}
                                        {c.verifiedAt ? ` · xác nhận ${fmtDateTime(c.verifiedAt)}` : ''}
                                      </p>
                                      {c.transferContent && (
                                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{c.transferContent}</p>
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
              {paged.length === 0 && (
                <TableState colSpan={fullAccess ? 9 : 8} loading={loading} filtered={activeFilters > 0}
                  empty="Chưa có hoá đơn nào trong kỳ này." />
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
