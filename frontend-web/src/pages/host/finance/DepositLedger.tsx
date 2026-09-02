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
import { normalizeVi } from '@/utils/helpers';
/*
  `todayIso` lấy từ @/utils/serverTime, KHÔNG tự khai bản cục bộ đọc đồng hồ máy như
  trước: ngày ở đây đi vào phiếu hoàn cọc — một mốc TIỀN BẠC, phải trùng với ngày
  server ghi nhận. Máy người dùng lệch múi giờ là sổ cọc ghi một ngày, BE ghi ngày
  khác, về sau đối chiếu không khớp.
*/
import { todayIso } from '@/utils/serverTime';
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

/** Trạng thái BE trả về. */
type DepositStatus = 'NOT_COLLECTED' | 'HELD' | 'REFUNDED' | 'FORFEITED';

/**
 * Trạng thái HIỂN THỊ — tách `REFUNDED` của BE làm ba (20/08/2026).
 *
 * BE coi là đã hoàn ngay khi host đánh dấu. Nhưng đó mới là lời của một bên: tiền có thật
 * sự tới tay khách hay không thì chỉ khách biết. Gộp khoản chưa ai xác nhận vào tổng
 * "đã hoàn" là tự làm đẹp số liệu của mình.
 */
type DisplayStatus = DepositStatus | 'REFUND_SENT' | 'REFUND_DISPUTED';

const displayStatusOf = (r: {
  status: DepositStatus; refundedAt?: string;
  refundConfirmedAt?: string; refundDisputedAt?: string; refundDisputeResolvedAt?: string;
}): DisplayStatus => {
  // Chưa thu thì mọi mốc hoàn cọc đều vô nghĩa — chốt trước.
  if (r.status === 'NOT_COLLECTED') return 'NOT_COLLECTED';

  /*
   * Suy từ DỮ LIỆU GỐC (`refundedAt`/`refundConfirmedAt`/`refundDisputedAt`), KHÔNG dựa
   * vào `status` mà BE tự suy.
   *
   * Lý do: `DepositLedgerStatusResolver` thoát sớm bằng `if (!isContractClosed(...)) return
   * HELD` nên nhánh đọc `refundPaidAt` không bao giờ chạy khi hồ sơ còn SETTLING — mà host
   * ghi nhận hoàn cọc đúng lúc đó. Kết quả: đã chuyển tiền rồi sổ vẫn hiện "Đang giữ" kèm
   * nút mời bấm lại, host bấm nữa thì ăn lỗi "đã ghi nhận trước đó".
   *
   * FE có sẵn ba mốc thô nên tự suy lấy, không phụ thuộc BE sửa xong hay chưa.
   */
  // Khiếu nại đã được admin kết luận thì KHÔNG còn là tranh chấp — quay về luồng bình thường.
  // BE cố ý giữ `refundDisputedAt` để lưu lịch sử, nên phải xét thêm cờ đã xử lý.
  if (r.refundDisputedAt && !r.refundDisputeResolvedAt && !r.refundConfirmedAt) {
    return 'REFUND_DISPUTED';
  }
  if (r.refundConfirmedAt) return 'REFUNDED';
  if (r.refundedAt) return 'REFUND_SENT';
  return r.status;
};

const STATUS_META: Record<DisplayStatus, { label: string; color: string; dot: string }> = {
  // Chưa thu: KHÔNG nằm trong tổng đang giữ — đây là khoản còn phải đi thu, không
  // phải khoản đang nắm của khách.
  NOT_COLLECTED: { label: 'Chưa thu', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  HELD: { label: 'Đang giữ', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  // Host đã chuyển nhưng khách chưa xác nhận — việc CHƯA xong, không phải "đã hoàn".
  REFUND_SENT: { label: 'Đã chuyển — chờ khách xác nhận', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  REFUND_DISPUTED: { label: 'Khách báo chưa nhận', color: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
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
  /** Tài khoản khách yêu cầu hoàn cọc về — BE tách khỏi free-text `note` (20/08/2026). */
  refundBankName?: string;
  refundBankAccount?: string;
  refundAccountHolder?: string;
  /**
   * Khách đã trả hết phí cuối kỳ chưa — cọc chỉ hoàn sau khi trả đủ.
   * `undefined` = BE chưa điền được → không kết luận là đã trả đủ.
   */
  chargesSettled?: boolean;
  outstandingAmount?: number;
  /** Có hồ sơ trả phòng chưa — phân biệt cọc của khách đang ở với khách đang trả phòng. */
  checkoutRequestId?: number;
  checkoutNote?: string;
  /** Host đã ghi nhận chuyển tiền chưa — mốc thô, không qua `status` của BE. */
  refundedAt?: string;
  /** Khách đã xác nhận nhận đủ chưa — lời của KHÁCH, đối chứng với `refundedAt` của host. */
  refundConfirmedAt?: string;
  refundDisputedAt?: string;
  refundDisputeReason?: string;
  refundDisputeResolvedAt?: string;
  /** Trạng thái để HIỂN THỊ, suy từ `status` + hai mốc trên. */
  display: DisplayStatus;
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
    // Nguồn dự phòng không có mốc xác nhận của khách nên không suy thêm được gì.
    display: c.status === 'TERMINATED' ? 'REFUNDED' : 'HELD',
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
    refundBankName: d.refundBankName,
    refundBankAccount: d.refundBankAccount,
    refundAccountHolder: d.refundAccountHolder,
    chargesSettled: d.chargesSettled,
    outstandingAmount: d.outstandingAmount,
    checkoutRequestId: d.checkoutRequestId,
    checkoutNote: d.checkoutNote,
    refundConfirmedAt: d.refundConfirmedAt,
    refundDisputedAt: d.refundDisputedAt,
    refundDisputeReason: d.refundDisputeReason,
    refundDisputeResolvedAt: d.refundDisputeResolvedAt,
    refundedAt: d.refundedAt,
    display: displayStatusOf({
      status, refundedAt: d.refundedAt,
      refundConfirmedAt: d.refundConfirmedAt, refundDisputedAt: d.refundDisputedAt,
      refundDisputeResolvedAt: d.refundDisputeResolvedAt,
    }),
  };
};


/**
 * So tên người, bỏ qua dấu và khoảng trắng thừa.
 * Dùng để cảnh báo lệch tên chủ tài khoản — so chuỗi thô sẽ báo nhầm với "Nguyễn  Văn A"
 * hay "NGUYEN VAN A".
 */
const sameName = (a: string, b: string): boolean =>
  normalizeVi(a).replace(/\s+/g, ' ').trim() === normalizeVi(b).replace(/\s+/g, ' ').trim();

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
  /*
   * ĐÃ GHI NHẬN RỒI thì chặn ngay — trước cả mọi điều kiện khác.
   *
   * BE vẫn trả `status = HELD` sau khi hoàn cọc (resolver thoát sớm khi hợp đồng chưa thanh
   * lý), nên nếu chỉ dựa vào `status` thì nút "Đánh dấu đã hoàn" còn nguyên và host bấm lại
   * nhiều lần, mỗi lần ăn một lỗi "đã ghi nhận trước đó". Chặn bằng mốc thô `refundedAt`.
   */
  if (r.refundedAt) {
    return r.refundConfirmedAt
      ? 'Đã hoàn cọc và khách đã xác nhận nhận đủ.'
      : 'Đã ghi nhận chuyển cọc, đang chờ khách xác nhận đã nhận đủ.';
  }
  /**
   * ĐANG CÓ HỒ SƠ TRẢ PHÒNG → xét theo tiến trình trả phòng, KHÔNG theo trạng thái hợp đồng.
   *
   * Mô hình chốt 20/08/2026 đảo thứ tự các bước: khách trả phí cuối kỳ → **host hoàn cọc** →
   * khách xác nhận → quản lý mới thanh lý hợp đồng. Nên lúc hoàn cọc, hợp đồng vẫn còn
   * `ACTIVE` — đòi `TERMINATED` như luật cũ là khoá đúng bước cần mở.
   *
   * Cọc vẫn là RÀNG BUỘC: `chargesSettled === false` thì chặn. `undefined` thì không chặn
   * (BE không tính được), nhưng hộp thoại có cảnh báo, và BE còn chặn lần nữa bằng
   * `CHARGES_NOT_SETTLED`.
   */
  if (r.checkoutRequestId != null) {
    if (r.chargesSettled === false) {
      const owed = r.outstandingAmount ? ` (${formatCurrency(r.outstandingAmount)})` : '';
      return `Khách còn khoản chưa thanh toán${owed}. Thu đủ rồi mới hoàn cọc được.`;
    }
    return null;
  }

  // KHÔNG có hồ sơ trả phòng → khách còn đang ở, cọc đang bảo đảm cho hợp đồng đang chạy.
  if (r.contractStatus === 'TERMINATED') return null;
  if (r.contractStatus === 'EXPIRED') {
    return 'Hợp đồng đã hết hạn nhưng chưa thanh lý — chờ quản lý kiểm tra phòng và quyết toán xong.';
  }
  return 'Khách chưa gửi yêu cầu trả phòng — cọc đang bảo đảm cho hợp đồng đang chạy.';
};

/** Bộ lọc chạy trên trạng thái HIỂN THỊ, không phải trạng thái thô của BE. */
type StatusKey = 'all' | DisplayStatus;

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
    const [res, contractList] = await Promise.all([
      hostService.getDeposits().catch(() => null),
      hostService.listAllContracts().catch(() => null),
    ]);
    const contracts = contractList ?? [];
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
    const held = rows.filter(r => r.display === 'HELD');
    return {
      totalHeld: held.reduce((s, r) => s + r.amount, 0),
      heldCount: held.length,
      // Chỉ tính khoản KHÁCH ĐÃ XÁC NHẬN. Khoản host mới chuyển mà chưa ai xác nhận là
      // việc chưa xong — cộng vào đây là tự làm đẹp số liệu của mình.
      refundedAmount: rows.filter(r => r.display === 'REFUNDED').reduce((s, r) => s + r.amount, 0),
      refundedCount: rows.filter(r => r.display === 'REFUNDED').length,
      disputedCount: rows.filter(r => r.display === 'REFUND_DISPUTED').length,
      needSettlement: rows.filter(r => r.needsSettlement).length,
    };
  }, [rows]);

  const statusCounts = useMemo(() => ({
    all: rows.length,
    NOT_COLLECTED: rows.filter(r => r.display === 'NOT_COLLECTED').length,
    HELD: rows.filter(r => r.display === 'HELD').length,
    REFUND_SENT: rows.filter(r => r.display === 'REFUND_SENT').length,
    REFUND_DISPUTED: rows.filter(r => r.display === 'REFUND_DISPUTED').length,
    REFUNDED: rows.filter(r => r.display === 'REFUNDED').length,
    FORFEITED: rows.filter(r => r.display === 'FORFEITED').length,
  }), [rows]);

  const propertyOptions = useMemo(() => [
    { key: 'all', label: 'Tất cả bất động sản' },
    ...[...new Set(rows.map(r => r.propertyName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ key: name, label: name })),
  ], [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter(r =>
      (status === 'all' || r.display === status) &&
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
    /*
     * Bổ sung 20/08/2026: KHÁCH BÁO CHƯA NHẬN chen lên trên cả nhóm Đang giữ.
     * Đó là khoản đang có người khiếu nại — việc gấp nhất trong sổ, và cũng là thứ dễ bị
     * bỏ quên nhất vì nó nằm ở cuối vòng đời, lẫn giữa đống khoản đã xong.
     */
    const groupRank = (s: DisplayStatus) => {
      if (s === 'REFUND_DISPUTED') return 0;
      if (s === 'HELD') return 1;
      if (s === 'REFUND_SENT') return 2;
      return 3;
    };
    return sorted.sort((a, b) => groupRank(a.display) - groupRank(b.display));
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
        'Trạng thái': STATUS_META[r.display].label,
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
              { key: 'REFUND_DISPUTED', label: 'Khách báo chưa nhận', count: statusCounts.REFUND_DISPUTED },
              { key: 'REFUND_SENT', label: 'Chờ khách xác nhận', count: statusCounts.REFUND_SENT },
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
                const meta = STATUS_META[r.display];
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
  /**
   * Hoàn cọc CHỈ chấp nhận chuyển khoản (chốt 20/08/2026) — không có tiền mặt.
   * Vẫn gửi field `method` lên BE vì API dùng chung với các khoản thu khác.
   */
  const METHOD = 'BANK_TRANSFER' as const;
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

  /**
   * Bước xác nhận LẦN HAI, đọc lại số tiền và người nhận (20/08/2026).
   *
   * Rủi ro thật ở đây không phải host cố tình gian lận — muốn gian thì đơn giản là không
   * chuyển, tấm ảnh chẳng ngăn được gì. Rủi ro thật là **ghi nhận nhầm dòng**: sổ cọc có
   * hàng chục khoản na ná nhau, bấm nhanh là đánh dấu nhầm khách. Nhầm rồi thì khoản kia
   * hiện "Đã hoàn" trong khi khách chưa nhận đồng nào, và không ai đi soát lại nữa.
   *
   * Nên chốt lại bằng cách bắt ĐỌC số tiền + số tài khoản một lần nữa, ngay tại nút bấm.
   * Không dùng modal thứ hai chồng lên — nó che mất chính thông tin cần đối chiếu.
   */
  const [confirming, setConfirming] = useState(false);

  /** Kiểm tra trước khi vào bước xác nhận — đừng bắt đọc kỹ rồi mới báo thiếu ảnh. */
  const askConfirm = () => {
    if (row.contractId == null) {
      return toast.error('Khoản này thiếu mã hợp đồng nên chưa ghi nhận được.');
    }
    // Bắt buộc có biên lai: đây là bằng chứng duy nhất khi khách nói chưa nhận được tiền.
    if (!proofUrl) {
      return toast.error('Tải ảnh biên lai chuyển khoản để khách đối chiếu khi cần.');
    }
    setConfirming(true);
  };

  const submit = async () => {
    if (row.contractId == null) return;
    setBusy(true);
    try {
      await hostService.markDepositRefunded(row.contractId, {
        method: METHOD, paidAt, proofUrl, note: note.trim() || undefined,
      });
      toast.success('Đã ghi nhận hoàn cọc.');
      onDone();
    } catch (e: unknown) {
      // 404 = BE chưa triển khai endpoint · 403 = chưa mở quyền cho host.
      // Hai cái này KHÔNG phải lỗi thao tác, nói thẳng để khỏi bấm lại vô ích.
      const res = (e as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
      const st = res?.status;
      if (st === 404 || st === 403 || st === 501) setNotReady(true);
      else if (res?.data?.code === 'DUPLICATE_PROOF') {
        // Ảnh biên lai này đã dùng cho một khoản cọc khác — gần như chắc chắn là chọn
        // nhầm file. Giữ hộp thoại mở để host đổi ảnh ngay, đừng bắt mở lại từ đầu.
        toast.error(res.data.message ?? 'Ảnh biên lai này đã dùng cho khoản cọc khác. Chọn đúng ảnh của lần chuyển này.',
          { duration: 8000 });
        setProofUrl('');
      } else if (res?.data?.code === 'REFUND_ALREADY_RECORDED') {
        // Không phải lỗi thao tác — khoản này đã ghi nhận rồi. Đóng hộp thoại và làm mới
        // để host thấy trạng thái đúng, thay vì đứng yên mời bấm tiếp.
        toast.success('Khoản này đã được ghi nhận hoàn cọc trước đó.');
        onDone();
      } else if (res?.data?.code === 'CHARGES_NOT_SETTLED') {
        toast.error(res.data.message ?? 'Khách còn khoản chưa thanh toán.', { duration: 8000 });
      } else toast.error(res?.data?.message ?? 'Không ghi nhận được khoản hoàn cọc.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        {/*
          Đầu và chân hộp thoại CỐ ĐỊNH, chỉ phần giữa cuộn.
          Bản cũ để cả hộp cuộn nên tiêu đề (tên khách, phòng) trôi mất khi kéo xuống — mà
          đó chính là thứ host cần thấy khi đang chuyển tiền cho ai.
        */}
        {/*
          BỐ CỤC BA TẦNG, mỗi tầng một nền riêng — thay cho một cột dài dồn cục.

          Bản cũ xếp mọi thứ chồng lên nhau bằng `mt-3`/`mt-4` rời rạc, nên khối cảnh báo
          "chưa có tài khoản" chạm thẳng vào nhãn "HÌNH THỨC" (fragment mở đầu bằng
          `grid grid-cols-2` không có margin trên). Nhìn ra là hai phần khác hẳn nhau về vai
          trò mà lại dính làm một mảng.

          Nay tách theo VIỆC host đang làm:
            1. Đầu     — chuyển cho ai (cố định, không cuộn mất)
            2. Tầng đọc — chuyển bao nhiêu, vào đâu   (nền xám, chỉ để đọc)
            3. Tầng nhập — ghi lại đã chuyển thế nào  (nền trắng, có form)
          Đường viền giữa các tầng làm việc phân tách, nên không cần đẩy khoảng cách ra xa.
        */}
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Đánh dấu đã hoàn cọc</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {row.tenantName} · {row.propertyName}
              {row.roomCode !== 'NGUYEN_CAN' && ` · Phòng ${row.roomCode}`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── Tầng 2: chỉ để đọc ─────────────────────────────────────────── */}
            <div className="space-y-4 border-b border-slate-200 bg-slate-50 px-7 py-6">
              {/* Số tiền là thông tin quan trọng nhất — cho nó cỡ chữ đúng với vai trò đó. */}
              <div className="rounded-xl bg-slate-900 px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Số tiền cọc phải chuyển
                </p>
                <p className="mt-1.5 text-3xl font-extrabold tracking-tight">{formatCurrency(row.amount)}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Tiền chuyển ngoài app — ở đây chỉ lưu chứng từ.
                </p>
              </div>

              {/*
                Số tài khoản khách, hiện ngay tại chỗ bấm xác nhận.
                Trước đây hộp thoại không nói chuyển cho ai, số nào — host phải mở chỗ khác tra
                rồi tự gõ sang app ngân hàng. Đó là nơi sinh ra chuyển nhầm số, mà cọc là khoản
                lớn nhất cả hợp đồng.
              */}
              {row.refundBankAccount ? (
                <div className="rounded-xl border border-indigo-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                    Chuyển tới tài khoản
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {[
                      { label: 'Ngân hàng', value: row.refundBankName },
                      { label: 'Số tài khoản', value: row.refundBankAccount },
                      { label: 'Chủ tài khoản', value: row.refundAccountHolder },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="flex items-center justify-between gap-3">
                        <span className="shrink-0 text-xs text-slate-500">{f.label}</span>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-mono text-sm font-bold text-slate-900">{f.value}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(f.value!);
                              toast.success(`Đã chép ${f.label.toLowerCase()}`);
                            }}
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-50"
                          >
                            Chép
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/*
                    Khách nhờ người nhà nhận hộ là chuyện có thật nên KHÔNG chặn — nhưng phải
                    là quyết định có ý thức, không phải chuyển xong mới phát hiện.
                  */}
                  {!!row.refundAccountHolder
                    && !sameName(row.refundAccountHolder, row.tenantName) && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Tên chủ tài khoản khác tên khách thuê ({row.tenantName}). Kiểm tra lại trước khi chuyển.</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Chưa có thông tin tài khoản nhận tiền
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-800">
                    {row.checkoutRequestId == null
                      ? 'Hợp đồng này chưa có hồ sơ trả phòng nên chưa có thông tin tài khoản.'
                      : row.checkoutNote
                        ? 'Phiếu trả phòng này tạo trước khi hệ thống tách riêng ô tài khoản, nên thông tin '
                          + 'nằm lẫn trong ghi chú của khách bên dưới. Đọc kỹ trước khi chuyển.'
                        : 'Khách có ghi tài khoản khi gửi phiếu trả phòng, nhưng hệ thống chưa đưa được '
                          + 'nội dung đó sang màn này. Hỏi quản lý phụ trách để lấy số tài khoản trước khi chuyển.'}
                  </p>

                  {/*
                    Ghi chú NGUYÊN VĂN của khách — chỉ dành cho phiếu cũ, khi TK còn nằm lẫn
                    trong free-text. Cố tình KHÔNG bóc tách rồi bày ra như 3 dòng đã xác thực:
                    chuỗi tự do không đảm bảo đúng khuôn, hiện giả dạng dữ liệu sạch thì host
                    tin tưởng nhầm. Để host tự đọc và tự chịu trách nhiệm đối chiếu.
                  */}
                  {!!row.checkoutNote && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Ghi chú khách gửi kèm
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700">
                        {row.checkoutNote}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* BE chưa điền `chargesSettled` nên không chặn được — nói thẳng để host tự kiểm. */}
              {row.chargesSettled === undefined && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                  Hệ thống <b>chưa kiểm tra được</b> khách đã trả hết phí cuối kỳ (điện, nước, bồi thường)
                  hay chưa. Xem lại danh sách hoá đơn của khách trước khi chuyển cọc.
                </p>
              )}
            </div>

            {/* ── Tầng 3: form nhập ──────────────────────────────────────────── */}
            {notReady ? (
              <div className="px-7 py-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-800">Backend chưa mở chức năng này</p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-700">
                    Endpoint <code className="rounded bg-amber-100 px-1">POST /api/v1/host/finance/deposits/{'{contractId}'}/refund</code>
                    {' '}chưa có (hoặc chưa mở quyền cho Host). Trước đây bước này nằm ở app quản lý, nay đã gỡ
                    vì quản lý không được thấy tiền cọc — nên tạm thời chưa ai ghi nhận được.
                    Báo đội backend theo doc <em>BE-BUG-checkout-disputed…</em> phần 2.
                  </p>
                  <button onClick={onClose}
                    className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                    Đã hiểu
                  </button>
                </div>
              </div>
            ) : (
              /*
                `space-y-6` cho cả nhóm thay vì `mt-3`/`mt-4` gắn lẻ từng khối — nhịp đều nhau
                và không còn khối nào lỡ thiếu margin như trước.
              */
              <div className="space-y-6 px-7 py-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Chứng từ chuyển tiền
                  </p>
                  {/*
                    Hoàn cọc CHỈ bằng chuyển khoản (chốt 20/08/2026) — nên đây là một dòng
                    thông tin, không phải ô chọn. Bỏ hẳn nút "Tiền mặt" thay vì để đó rồi chặn:
                    ô chọn chỉ có một đáp án đúng là bẫy, sớm muộn cũng có người bấm nhầm.
                    Cọc là khoản lớn nhất hợp đồng, buộc chuyển khoản mới có dấu vết ngân hàng.
                  */}
                  <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                    Chuyển khoản
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ngày chuyển
                  </label>
                  {/* `max` chặn ngày tương lai: đây là ghi nhận việc ĐÃ làm, không phải hẹn lịch. */}
                  <input type="date" value={paidAt} max={todayIso()}
                    onChange={e => setPaidAt(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ảnh biên lai <span className="text-rose-500">*</span>
                  </label>

                  {/* Ảnh nhỏ có nút thay/xoá, KHÔNG phải khối 200px chiếm nửa hộp thoại.
                      Đây là ảnh đính kèm, không phải nội dung chính — bấm vào xem to. */}
                  {proofUrl ? (
                    <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
                      <a href={proofUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={proofUrl} alt="Biên lai"
                          className="h-16 w-16 rounded-lg border border-slate-200 object-cover transition hover:opacity-80" />
                      </a>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-emerald-600">✓ Đã đính kèm biên lai</p>
                        <p className="mt-0.5 text-xs text-slate-400">Bấm vào ảnh để xem cỡ lớn</p>
                      </div>
                      <label className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50">
                        Đổi ảnh
                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                          onChange={e => pickProof(e.target.files?.[0])} />
                      </label>
                    </div>
                  ) : (
                    <label className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-7 transition ${
                      uploading ? 'border-slate-200 bg-slate-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40'}`}>
                      <span className="text-sm font-bold text-slate-500">
                        {uploading ? 'Đang tải ảnh…' : '📎 Chọn ảnh biên lai'}
                      </span>
                      <span className="mt-1 px-4 text-center text-xs leading-relaxed text-slate-400">
                        Bằng chứng duy nhất khi khách nói chưa nhận được tiền
                      </span>
                      <input type="file" accept="image/*" className="hidden" disabled={uploading}
                        onChange={e => pickProof(e.target.files?.[0])} />
                    </label>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ghi chú <span className="font-medium normal-case text-slate-400">(tuỳ chọn)</span>
                  </label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder="Vd: chuyển Vietcombank lúc 14:30" />
                </div>
              </div>
            )}
          </div>

          {/* Chân cố định — nút luôn thấy, không phải kéo hết form mới bấm được. */}
          {!notReady && (
            <div className="shrink-0 border-t border-slate-200">
              {confirming ? (
                /*
                  Bước xác nhận đọc lại — thay chỗ hai nút cũ chứ KHÔNG mở modal chồng lên,
                  vì modal thứ hai sẽ che mất đúng cái khối tài khoản cần đối chiếu.
                */
                <div className="bg-emerald-50 px-7 py-4">
                  <p className="text-sm leading-relaxed text-slate-700">
                    Ghi nhận đã chuyển{' '}
                    <b className="text-slate-900">{formatCurrency(row.amount)}</b>
                    {row.refundBankAccount ? (
                      <>
                        {' '}tới <b className="font-mono text-slate-900">{row.refundBankAccount}</b>
                        {row.refundAccountHolder && <> — <b className="text-slate-900">{row.refundAccountHolder}</b></>}
                      </>
                    ) : (
                      <> cho <b className="text-slate-900">{row.tenantName}</b></>
                    )}
                    ?
                  </p>
                  {/*
                    Nói thẳng rằng cú bấm này KHÔNG khép được hồ sơ. Host cần biết khách còn
                    một bước xác nhận nữa — để không coi đây là điểm kết thúc rồi bỏ mặc.
                  */}
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Khách sẽ được yêu cầu xác nhận đã nhận đủ tiền trong app.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button onClick={() => setConfirming(false)} disabled={busy}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                      Xem lại
                    </button>
                    <button onClick={submit} disabled={busy}
                      className="flex-[2] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                      {busy ? 'Đang lưu...' : 'Đúng, ghi nhận'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 px-7 py-4">
                  <button onClick={onClose} disabled={busy}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                    Huỷ
                  </button>
                  <button onClick={askConfirm} disabled={busy || uploading}
                    className="flex-[2] rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                    ✓ Xác nhận đã chuyển cọc
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
};
