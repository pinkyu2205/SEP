import { MaskedField } from '@/components/MaskedField';
import { Overlay } from '@/components/Overlay';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { uploadToCloudinary } from '@/services/upload.service';
import toast from 'react-hot-toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PiggyBank, Download, ShieldCheck, RotateCcw, AlertTriangle, RefreshCw,
  Building2, ArrowDownUp, FileText,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import { hostService, type DepositItem, type HostContractDto } from '@/services/host.service';
import { exportToExcel } from '@/utils/exportExcel';
import {
  ChipFilter, FilterBar, Pagination, SearchBox, SelectFilter, TableState,
  cmpIsoDesc, fmtDate, matchVi, pageSlice,
} from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Sổ cọc — 100% API thật, KHÔNG mock.
//
// Nguồn chính: GET /host/contracts (hợp đồng khách thuê). Tiền cọc nằm ngay trên
// hợp đồng nên nguồn này cho đủ mã HĐ, ngày bắt đầu/kết thúc và cả HĐ đã thanh lý.
// Nguồn dự phòng: GET /host/finance/deposits — endpoint cọc chuyên biệt, nhưng BE
// hiện chỉ duyệt hợp đồng ACTIVE nên không thấy khoản đã hoàn / HĐ hết hạn; chỉ
// dùng khi /host/contracts không trả được dữ liệu.
//
// CẬP NHẬT 17/08/2026 — BE đã sửa, ĐỔI NGUỒN CHÍNH sang /host/finance/deposits.
//
// Trước đây trang này tự suy trạng thái cọc từ trạng thái HỢP ĐỒNG (TERMINATED →
// "Đã hoàn", còn lại → "Đang giữ") vì BE cũng làm đúng như vậy. Suy kiểu đó sai ở
// hai đầu: khoản CHƯA THU BAO GIỜ mà HĐ đã thanh lý thì thành "Đã hoàn" (không thể
// hoàn thứ chưa thu), còn khoản chưa thu của HĐ đang chạy thì thành "Đang giữ" và
// bị cộng vào tổng đang giữ — tổng phồng lên nhiều lần.
//
// BE giờ có `DepositLedgerStatusResolver`: xét `paymentStatus` trước (chưa PAID →
// NOT_COLLECTED), rồi mới tới quyết toán trả phòng thật (`refundPaidAt`, khấu trừ)
// — và `/host/finance/deposits` đã duyệt TOÀN BỘ hợp đồng (không còn chỉ ACTIVE),
// trả kèm contractId/contractCode/endDate. Vì vậy endpoint đó nay là nguồn CHÍNH;
// /host/contracts chỉ còn là dự phòng khi endpoint kia lỗi.
// ══════════════════════════════════════════════════════════════════════════════

type DepositStatus = 'NOT_COLLECTED' | 'HELD' | 'REFUNDED' | 'FORFEITED';

const STATUS_META: Record<DepositStatus, { label: string; color: string; dot: string }> = {
  // Chưa thu: KHÔNG nằm trong tổng đang giữ — đây là khoản còn phải đi thu, không
  // phải khoản đang nắm của khách.
  NOT_COLLECTED: { label: 'Chưa thu', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  HELD: { label: 'Đang giữ', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  REFUNDED: { label: 'Đã hoàn', color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  FORFEITED: { label: 'Tịch thu', color: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
};

interface DepositRow {
  key: string;
  code: string;
  tenantName: string;
  tenantPhone?: string;
  propertyName: string;
  roomCode: string;
  amount: number;
  /** Ngày bắt đầu giữ cọc — ưu tiên ngày nhận phòng, thiếu thì lấy ngày hiệu lực HĐ. */
  heldSince: string;
  endDate?: string;
  status: DepositStatus;
  /** HĐ đã hết hạn nhưng cọc vẫn đang giữ → cần tất toán ở luồng trả phòng. */
  needsSettlement: boolean;
  /** Cần để gọi endpoint hoàn cọc. Nguồn dự phòng (suy từ HĐ) không có → không hoàn được. */
  contractId?: number;
  /**
   * Trạng thái HỢP ĐỒNG — mốc duy nhất cho biết thủ tục trả phòng đã xong hay chưa.
   * `TERMINATED` = quản lý đã bấm "Hoàn tất trả phòng" sau khi khách đồng ý bảng quyết
   * toán, tức cả hai phía đã chốt. Chỉ lúc đó mới được đánh dấu hoàn cọc.
   */
  contractStatus?: HostContractDto['status'];
}

const contractToRow = (c: HostContractDto): DepositRow | null => {
  const amount = c.deposit ?? 0;
  if (amount <= 0) return null;
  if (c.status === 'PENDING' || c.status === 'DRAFT') return null;
  return {
    key: c.id,
    code: c.code,
    // HĐ đã thanh lý đôi khi BE không trả kèm hồ sơ khách → tránh ô tên trống trơn.
    tenantName: c.lesseeName?.trim() || '(chưa có tên khách)',
    tenantPhone: c.tenantPhone,
    propertyName: c.propertyName,
    roomCode: c.roomCode ?? 'NGUYEN_CAN',
    amount,
    heldSince: c.moveInDate ?? c.startDate,
    endDate: c.endDate,
    status: c.status === 'TERMINATED' ? 'REFUNDED' : 'HELD',
    needsSettlement: c.status === 'EXPIRED',
    contractStatus: c.status,
  };
};

/** Nguồn CHÍNH — trạng thái do BE quyết (DepositLedgerStatusResolver). */
const depositItemToRow = (
  d: DepositItem,
  i: number,
  /** contractId → trạng thái HĐ; `/host/finance/deposits` không trả trường này. */
  contractStatuses: Map<string, HostContractDto['status']>,
): DepositRow => {
  // Status lạ (BE thêm giá trị mới) thì để nguyên chuỗi thay vì im lặng quy về HELD —
  // quy về HELD là cách khoản 'chưa thu' từng bị đếm vào tổng đang giữ.
  const status = (STATUS_META[d.status as DepositStatus]
    ? d.status
    : 'NOT_COLLECTED') as DepositStatus;
  return {
    key: d.contractId != null ? `c${d.contractId}` : `dep-${i}`,
    code: d.contractCode ?? '—',
    tenantName: d.tenantName?.trim() || '(chưa có tên khách)',
    propertyName: d.propertyName,
    roomCode: d.roomCode ?? 'NGUYEN_CAN',
    amount: d.amount,
    heldSince: d.heldSince,
    endDate: d.endDate,
    status,
    // Cần tất toán = ĐÃ thu, HĐ đã qua ngày kết thúc mà cọc vẫn đang giữ.
    needsSettlement: status === 'HELD' && !!d.endDate && d.endDate < todayIso(),
    contractId: d.contractId,
    contractStatus: d.contractId != null ? contractStatuses.get(String(d.contractId)) : undefined,
  };
};

const todayIso = (): string => new Date().toLocaleDateString('en-CA');

/**
 * Vì sao CHƯA được đánh dấu hoàn cọc — trả `null` nghĩa là hoàn được.
 *
 * Cọc chỉ trả lại khi **cả quản lý lẫn khách đã chốt xong thủ tục trả phòng**: khách
 * đồng ý bảng quyết toán → quản lý bấm "Hoàn tất trả phòng" → BE thanh lý hợp đồng
 * (`TERMINATED`). Trước mốc đó, khoản cọc vẫn đang bảo đảm cho hợp đồng đang chạy —
 * hoàn cho người còn đang ở là mất tiền thật, không phải lỗi hiển thị.
 *
 * `EXPIRED` (hết hạn nhưng chưa thanh lý) CŨNG chưa được: chưa có biên bản kiểm tra
 * phòng thì chưa biết trừ hư hỏng bao nhiêu.
 */
const refundBlockReason = (r: DepositRow): string | null => {
  if (r.contractId == null) {
    return 'Khoản này thiếu mã hợp đồng (dữ liệu dự phòng) nên chưa ghi nhận được.';
  }
  if (r.contractStatus === 'TERMINATED') return null;
  if (r.contractStatus === 'EXPIRED') {
    return 'Hợp đồng đã hết hạn nhưng chưa thanh lý — chờ quản lý kiểm tra phòng và quyết toán xong.';
  }
  return 'Chờ quản lý và khách hoàn tất thủ tục trả phòng (khách đồng ý quyết toán, quản lý thanh lý hợp đồng).';
};

type StatusKey = 'all' | DepositStatus;

type SortKey = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | 'ending-soon';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Mới nhất (giữ cọc gần đây)' },
  { key: 'ending-soon', label: 'Hợp đồng sắp kết thúc' },
  { key: 'amount-desc', label: 'Tiền cọc cao → thấp' },
  { key: 'amount-asc', label: 'Tiền cọc thấp → cao' },
  { key: 'oldest', label: 'Cũ nhất' },
];

export const DepositLedger = () => {
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [property, setProperty] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  /** Khoản đang mở hộp thoại "Đánh dấu đã hoàn cọc" — null là đóng. */
  const [refunding, setRefunding] = useState<DepositRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    /**
     * Hai nguồn, gọi song song:
     *  • `/host/finance/deposits` — nguồn CHÍNH, trạng thái cọc do BE xét.
     *  • `/host/contracts`        — lấy TRẠNG THÁI HỢP ĐỒNG, thứ endpoint cọc không trả.
     *
     * Cần trạng thái HĐ để biết thủ tục trả phòng đã xong chưa: nút "Đánh dấu đã hoàn"
     * chỉ được mở khi HĐ đã `TERMINATED`. Thiếu nó thì nút sáng cho cả khách đang thuê
     * bình thường — hoàn cọc cho người còn đang ở là sai nghiệp vụ nặng.
     * (Danh sách HĐ cũng là nguồn DỰ PHÒNG khi endpoint cọc lỗi, nên gọi luôn một thể.)
     */
    const [res, contractPage] = await Promise.all([
      hostService.getDeposits().catch(() => null),
      hostService.listContracts({ size: 500 }).catch(() => null),
    ]);
    const contracts = contractPage?.content ?? [];
    const contractStatuses = new Map(contracts.map(c => [String(c.id), c.status]));

    const items = (res?.items ?? []).map((d, i) => depositItemToRow(d, i, contractStatuses));

    if (items.length) {
      setRows(items);
    } else {
      // Dự phòng khi endpoint cọc lỗi: suy từ hợp đồng. Kém chính xác (không biết
      // đã thu chưa) nên chỉ dùng khi không còn gì khác.
      setRows(contracts
        .map(contractToRow)
        .filter((r): r is DepositRow => r !== null));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * Cọc onboard về dưới dạng hoá đơn `invoiceType = OTHER` (theo doc WebSocket của BE),
   * nhưng vẫn nạp lại với mọi loại: hoá đơn nào PAID cũng có thể đổi trạng thái sổ cọc.
   */
  // Nạp lại theo cả 3 lớp (WS · poll dự phòng · quay lại tab) — xem useBillingRealtime.
  useBillingRealtime({ onRefresh: load });

  const stats = useMemo(() => {
    const held = rows.filter(r => r.status === 'HELD');
    return {
      totalHeld: held.reduce((s, r) => s + r.amount, 0),
      heldCount: held.length,
      refundedAmount: rows.filter(r => r.status === 'REFUNDED').reduce((s, r) => s + r.amount, 0),
      refundedCount: rows.filter(r => r.status === 'REFUNDED').length,
      needSettlement: rows.filter(r => r.needsSettlement).length,
    };
  }, [rows]);

  const statusCounts = useMemo(() => ({
    all: rows.length,
    NOT_COLLECTED: rows.filter(r => r.status === 'NOT_COLLECTED').length,
    HELD: rows.filter(r => r.status === 'HELD').length,
    REFUNDED: rows.filter(r => r.status === 'REFUNDED').length,
    FORFEITED: rows.filter(r => r.status === 'FORFEITED').length,
  }), [rows]);

  const propertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả bất động sản' },
    ...[...new Set(rows.map(r => r.propertyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter(r =>
      (status === 'all' || r.status === status) &&
      (property === 'all' || r.propertyName === property) &&
      matchVi(q, r.tenantName, r.propertyName, r.roomCode, r.code, r.tenantPhone));

    const sorted = [...list];
    switch (sort) {
      case 'newest': sorted.sort((a, b) => cmpIsoDesc(a.heldSince, b.heldSince)); break;
      case 'oldest': sorted.sort((a, b) => cmpIsoDesc(b.heldSince, a.heldSince)); break;
      case 'amount-desc': sorted.sort((a, b) => b.amount - a.amount); break;
      case 'amount-asc': sorted.sort((a, b) => a.amount - b.amount); break;
      // Không có ngày kết thúc (HĐ vô thời hạn) → đẩy xuống cuối.
      case 'ending-soon': sorted.sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999')); break;
    }

    /**
     * ĐANG GIỮ luôn lên đầu, bất kể đang sắp theo kiểu gì.
     *
     * Đây mới là tiền host thật sự đang nắm và sẽ phải trả lại — cũng là nhóm duy nhất
     * có việc để làm (đánh dấu đã hoàn). Thực tế sổ có 65 khoản thì 64 khoản "Chưa thu",
     * xếp lẫn lộn là 1 khoản Đang giữ trôi mất tăm giữa danh sách, phải bấm chip lọc mới
     * thấy. Sắp xếp người dùng chọn vẫn giữ nguyên — chỉ áp trong từng nhóm.
     */
    const groupRank = (s: DepositStatus) => (s === 'HELD' ? 0 : 1);
    return sorted.sort((a, b) => groupRank(a.status) - groupRank(b.status));
  }, [rows, status, property, q, sort]);

  const filteredAmount = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);
  const paged = pageSlice(filtered, page, perPage);

  const activeFilters = (q ? 1 : 0) + (status !== 'all' ? 1 : 0) + (property !== 'all' ? 1 : 0);
  const resetFilters = () => { setQ(''); setStatus('all'); setProperty('all'); setPage(1); };
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const handleExport = () => {
    exportToExcel('SoCoc_HoangBinhLand', [{
      name: 'Sổ cọc',
      rows: filtered.map(r => ({
        'Mã hợp đồng': r.code, 'Khách thuê': r.tenantName, 'Số điện thoại': r.tenantPhone ?? '',
        'Bất động sản': r.propertyName,
        'Phòng': r.roomCode === 'NGUYEN_CAN' ? 'Nguyên căn' : r.roomCode,
        'Tiền cọc (₫)': r.amount, 'Giữ từ': fmtDate(r.heldSince), 'Kết thúc HĐ': fmtDate(r.endDate),
        'Trạng thái': STATUS_META[r.status].label,
        'Cần tất toán': r.needsSettlement ? 'Có' : '',
      })),
    }]);
  };

  const kpis = [
    { label: 'Tổng cọc đang giữ', value: formatCurrency(stats.totalHeld), sub: 'Khoản phải trả lại khách', icon: PiggyBank, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500' },
    { label: 'Số khoản đang giữ', value: String(stats.heldCount), sub: `trên tổng ${rows.length} khoản trong sổ`, icon: ShieldCheck, bg: 'bg-blue-50', color: 'text-blue-600', border: 'border-l-blue-500' },
    { label: 'Đã hoàn', value: formatCurrency(stats.refundedAmount), sub: `${stats.refundedCount} khoản đã tất toán`, icon: RotateCcw, bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-l-emerald-500' },
    { label: 'Cần tất toán', value: String(stats.needSettlement), sub: 'HĐ hết hạn nhưng còn giữ cọc', icon: AlertTriangle, bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-l-amber-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sổ cọc</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tiền cọc đang giữ của khách thuê — khoản phải hoàn khi kết thúc hợp đồng (không phải doanh thu)
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

      {/* Bảng + bộ lọc */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <FileText className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Danh sách cọc theo hợp đồng</h2>
            <p className="text-xs text-slate-500">{filtered.length} khoản · tổng {formatCurrency(filteredAmount)}</p>
          </div>
        </div>

        <FilterBar activeCount={activeFilters} onReset={resetFilters}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchBox
              value={q}
              onChange={onFilter(setQ)}
              placeholder="Tìm theo khách thuê, mã hợp đồng, bất động sản, phòng, SĐT... (không cần dấu)"
              className="flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SelectFilter value={property} onChange={onFilter(setProperty)} options={propertyOptions} icon={Building2} title="Lọc theo bất động sản" />
              <SelectFilter value={sort} onChange={setSort} options={SORT_OPTIONS} icon={ArrowDownUp} title="Sắp xếp" widthClass="w-[218px]" />
            </div>
          </div>
          <ChipFilter
            value={status}
            onChange={onFilter(setStatus)}
            options={[
              { key: 'all', label: 'Tất cả', count: statusCounts.all },
              { key: 'NOT_COLLECTED', label: 'Chưa thu', count: statusCounts.NOT_COLLECTED },
              { key: 'HELD', label: 'Đang giữ', count: statusCounts.HELD },
              { key: 'REFUNDED', label: 'Đã hoàn', count: statusCounts.REFUNDED },
              { key: 'FORFEITED', label: 'Tịch thu', count: statusCounts.FORFEITED },
            ]}
          />
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Khách thuê</th>
                <th className="px-5 py-3.5">Bất động sản / Phòng</th>
                <th className="px-5 py-3.5 text-right">Tiền cọc</th>
                <th className="px-5 py-3.5">Giữ từ</th>
                <th className="px-5 py-3.5">Kết thúc HĐ</th>
                <th className="px-5 py-3.5">Trạng thái</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.key} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{r.tenantName}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-400">{r.code}{r.tenantPhone && <> · <MaskedField value={r.tenantPhone} emptyText="" className="text-xs text-slate-400" /></>}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{r.propertyName}</p>
                      <p className="text-xs text-slate-400">{r.roomCode === 'NGUYEN_CAN' ? 'Thuê nguyên căn' : `Phòng ${r.roomCode}`}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(r.amount)}</td>
                    <td className="px-5 py-3.5 text-sm tabular-nums text-slate-600">{fmtDate(r.heldSince)}</td>
                    <td className="px-5 py-3.5 text-sm tabular-nums text-slate-600">{fmtDate(r.endDate)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                        </span>
                        {r.needsSettlement && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            cần tất toán
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {/* Chỉ khoản ĐANG GIỮ mới có gì để hoàn: chưa thu thì không có tiền,
                          đã hoàn / tịch thu thì đã chốt. */}
                      {r.status === 'HELD' && (() => {
                        const blocked = refundBlockReason(r);
                        return (
                          <button
                            onClick={() => setRefunding(r)}
                            disabled={!!blocked}
                            title={blocked ?? 'Ghi nhận đã chuyển cọc lại cho khách'}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              blocked
                                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                          >
                            Đánh dấu đã hoàn
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <TableState colSpan={7} loading={loading} filtered={activeFilters > 0}
                  empty="Chưa có khoản cọc nào — cọc được ghi nhận khi hợp đồng khách thuê có hiệu lực." />
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} perPage={perPage} total={filtered.length}
          onPage={setPage} onPerPage={setPerPage} unit="khoản cọc" />
      </div>

      {refunding && (
        <RefundDialog
          row={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => { setRefunding(null); load(); }}
        />
      )}
    </div>
  );
};

/**
 * Hộp thoại ghi nhận đã hoàn cọc cho khách.
 *
 * Việc chuyển tiền diễn ra NGOÀI app (chuyển khoản tay); ở đây chỉ lưu chứng từ và mốc
 * thời gian — giống hệt cách bước này từng chạy bên app quản lý trước 18/08/2026.
 *
 * Ảnh biên lai bắt buộc khi chuyển khoản: đây là bằng chứng duy nhất khi khách nói chưa
 * nhận được tiền, mà cọc thì thường là khoản lớn nhất trong cả hợp đồng.
 */
const RefundDialog = ({ row, onClose, onDone }: {
  row: DepositRow; onClose: () => void; onDone: () => void;
}) => {
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [proofUrl, setProofUrl] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Lỗi "BE chưa có endpoint" — hiện nguyên khối thay vì toast, vì nó không tự hết. */
  const [notReady, setNotReady] = useState(false);

  const pickProof = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      setProofUrl(await uploadToCloudinary(file, 'image'));
    } catch {
      toast.error('Không tải được ảnh biên lai.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (row.contractId == null) {
      return toast.error('Khoản này thiếu mã hợp đồng nên chưa ghi nhận được.');
    }
    if (method === 'BANK_TRANSFER' && !proofUrl) {
      return toast.error('Tải ảnh biên lai chuyển khoản để khách đối chiếu khi cần.');
    }
    setBusy(true);
    try {
      await hostService.markDepositRefunded(row.contractId, {
        method, paidAt, proofUrl: proofUrl || undefined, note: note.trim() || undefined,
      });
      toast.success('Đã ghi nhận hoàn cọc.');
      onDone();
    } catch (e: unknown) {
      // 404 = BE chưa triển khai endpoint · 403 = chưa mở quyền cho host.
      // Hai cái này KHÔNG phải lỗi thao tác, nói thẳng để khỏi bấm lại vô ích.
      const st = (e as { response?: { status?: number } })?.response?.status;
      if (st === 404 || st === 403 || st === 501) setNotReady(true);
      else toast.error('Không ghi nhận được khoản hoàn cọc.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-bold text-slate-900">Đánh dấu đã hoàn cọc</h3>
          <p className="mt-1 text-sm text-slate-500">
            {row.tenantName} · {row.propertyName}
            {row.roomCode !== 'NGUYEN_CAN' && ` · Phòng ${row.roomCode}`}
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Số tiền cọc <span className="font-bold text-slate-900">{formatCurrency(row.amount)}</span>
            {' '}— tiền chuyển ngoài app, ở đây chỉ lưu chứng từ.
          </p>

          {notReady ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-800">Backend chưa mở chức năng này</p>
              <p className="mt-1 text-sm text-amber-700">
                Endpoint <code className="rounded bg-amber-100 px-1">POST /api/v1/host/finance/deposits/{'{contractId}'}/refund</code>
                {' '}chưa có (hoặc chưa mở quyền cho Host). Trước đây bước này nằm ở app quản lý, nay đã gỡ
                vì quản lý không được thấy tiền cọc — nên tạm thời chưa ai ghi nhận được.
                Báo đội backend theo doc <em>BE-BUG-checkout-disputed…</em> phần 2.
              </p>
              <button onClick={onClose}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                Đã hiểu
              </button>
            </div>
          ) : (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700">Hình thức</label>
              <div className="mt-1.5 flex gap-2">
                {([['BANK_TRANSFER', '🏦 Chuyển khoản'], ['CASH', '💵 Tiền mặt']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setMethod(k)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      method === k
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">Ngày chuyển</label>
              <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Ảnh biên lai {method === 'BANK_TRANSFER' ? '(bắt buộc)' : '(tuỳ chọn)'}
              </label>
              {proofUrl && <img src={proofUrl} alt="Biên lai" className="mt-1.5 max-h-40 rounded-lg border border-slate-200" />}
              <input type="file" accept="image/*" disabled={uploading}
                onChange={e => pickProof(e.target.files?.[0])}
                className="mt-1.5 w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" />
              {uploading && <p className="mt-1 text-xs text-slate-400">Đang tải ảnh...</p>}

              <label className="mt-4 block text-sm font-medium text-slate-700">Ghi chú (tuỳ chọn)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Vd: đã trừ tiền điện kỳ cuối theo biên bản" />

              <div className="mt-5 flex gap-2">
                <button onClick={onClose} disabled={busy}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Huỷ
                </button>
                <button onClick={submit} disabled={busy || uploading}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy ? 'Đang lưu...' : '✓ Đã hoàn cọc'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
};
