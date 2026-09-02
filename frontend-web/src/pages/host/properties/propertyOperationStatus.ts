/**
 * TÌNH TRẠNG KHAI THÁC & THU TIỀN CỦA TỪNG CĂN — cho màn "Bất động sản" của Host.
 *
 * ─── Vì sao cần ──────────────────────────────────────────────────────────────
 * Trước 30/08/2026 màn này chỉ trả lời được "nhà có tồn tại và đã duyệt giá chưa".
 * Badge trên card là `PropertyStatus` — VÒNG ĐỜI HỒ SƠ nhà, không phải trạng thái
 * cho thuê. Nên 51 căn đều hiện "Hoạt động" giống hệt nhau: host không phân biệt
 * được căn đang có khách với căn để không, và hoàn toàn không thấy tháng này khách
 * đã trả tiền chưa.
 *
 * ⚠️ Đừng dùng `PropertyStatus.RENTED` để suy ra "đang cho thuê": KHÔNG chỗ nào
 * trong BE gán trạng thái đó (xem `services/useOccupiedProperties.ts`). Nhãn
 * "Đã cho thuê" trong STATUS_BADGE là nhánh chết, giữ lại chỉ để không vỡ nếu BE
 * sau này có gán.
 *
 * ─── Hai nguồn sự thật, hai cách lấy khác nhau ───────────────────────────────
 *   • NHÀ CHIA PHÒNG — BE đã tính sẵn `roomCount / availableRooms / rentedRooms /
 *     maintenanceRooms / notOpenedRooms` trong CHÍNH response danh sách nhà
 *     (`PropertyOccupancyAssembler`, gộp 2 query nên không N+1). KHÔNG tốn request
 *     nào thêm.
 *   • NHÀ NGUYÊN CĂN — `roomCount = 0` nên không có tín hiệu nào trong danh sách nhà.
 *     Bắt buộc phải đi qua hợp đồng: `GET /host/contracts` một lần cho cả danh mục.
 *
 * Phần suy diễn dùng lại `occupancyFromProperty` của `services/propertyOccupancy`
 * thay vì cộng trừ lại — nó đã xử lý đúng các bẫy (phòng bị hợp đồng nháp giữ chỗ,
 * `priceLocked` bật cả với HĐ đã hết hạn, `currentTenant` luôn rỗng).
 */
import { useCallback, useEffect, useState } from 'react';
import { adminService, type AdminInvoiceRow, type AdminInvoiceType } from '@/services/admin.service';
import { canUseFullInvoices } from '@/services/invoiceAccess';
import { hostService, type HostContractDto } from '@/services/host.service';
import {
  normalizeRoomNumber, occupancyFromProperty, type PropertyOccupancy,
} from '@/services/propertyOccupancy.service';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';

// ─── Khai thác ──────────────────────────────────────────────────────────────

/**
 * Trạng thái khai thác — trả lời "căn này đang ra tiền chưa".
 *
 * Tách `SETUP` khỏi `VACANT` là có chủ đích: cả hai đều "không có khách" nhưng việc
 * host cần làm khác hẳn nhau. `VACANT` = giục quản lý đi tìm khách. `SETUP` = phòng
 * chưa tạo hoặc còn kẹt trạng thái, tìm được khách cũng không xếp vào đâu được.
 * Gộp làm một là đẩy host đi làm nhầm việc.
 */
export type RentalState = 'RENTED' | 'PARTIAL' | 'INCOMING' | 'VACANT' | 'SETUP' | 'UNKNOWN';

export const RENTAL_META: Record<RentalState, { label: string; cls: string; dot: string }> = {
  RENTED:   { label: 'Đang cho thuê',    cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  PARTIAL:  { label: 'Còn phòng trống',  cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  INCOMING: { label: 'Chờ đón khách',    cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  VACANT:   { label: 'Đang để trống',    cls: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
  SETUP:    { label: 'Chưa mở cho thuê', cls: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400' },
  UNKNOWN:  { label: 'Chưa rõ',          cls: 'bg-slate-100 text-slate-400',     dot: 'bg-slate-300' },
};

const rentalStateOf = (occ: PropertyOccupancy): RentalState => {
  if (!occ.loaded) return 'UNKNOWN';

  if (occ.wholeHouse) {
    if (occ.rented > 0) return 'RENTED';
    if (occ.heldByDraft > 0) return 'INCOMING';
    return 'VACANT';
  }

  // Chưa tạo phòng nào, hoặc tạo rồi nhưng không phòng nào đang mở cho thuê.
  if (occ.roomCount === 0) return 'SETUP';
  if (occ.rented === 0 && occ.heldByDraft === 0 && occ.available === 0) return 'SETUP';

  if (occ.rented > 0) return occ.available > 0 ? 'PARTIAL' : 'RENTED';
  if (occ.heldByDraft > 0) return 'INCOMING';
  return 'VACANT';
};

// ─── Thu tiền ───────────────────────────────────────────────────────────────

/**
 * Kết quả thu tiền của MỘT căn trong MỘT kỳ.
 *
 * `outstanding` là con số CHÍNH XÁC, không phải ước lượng: nghiệp vụ chỉ có hai kết
 * cục — khách trả đủ 100%, hoặc không trả và hợp đồng bị chấm dứt. Không có thu một
 * phần. `TenantInvoiceStatus.PARTIAL` tồn tại trong enum của BE nhưng KHÔNG chỗ nào
 * gán (chỉ xuất hiện trong danh sách trạng thái đem đi truy vấn ở
 * `BillingCronServiceImpl`), nên mọi hoá đơn chưa thu đều còn nguyên số tiền.
 *
 * Vẫn xếp `PARTIAL` vào nhóm chưa thu để phòng khi BE đổi ý — chưa trả đủ thì vẫn là
 * chưa thu, gộp vào đó không bao giờ sai.
 */
export interface BillSummary {
  total: number;
  paid: number;
  /** Chưa trả nhưng chưa quá hạn. */
  pending: number;
  overdue: number;
  outstanding: number;
}

export type BillState = 'CLEAR' | 'PENDING' | 'OVERDUE' | 'NONE';

export const billStateOf = (b: BillSummary): BillState => {
  if (b.total === 0) return 'NONE';
  if (b.overdue > 0) return 'OVERDUE';
  if (b.pending > 0) return 'PENDING';
  return 'CLEAR';
};

/** `cls` cho khối có nền (card), `text` cho ô trong bảng (không nền). */
export const BILL_META: Record<BillState, { cls: string; dot: string; text: string }> = {
  CLEAR:   { cls: 'border-emerald-200 bg-emerald-50/70 text-emerald-700', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  PENDING: { cls: 'border-amber-200 bg-amber-50/70 text-amber-700',       dot: 'bg-amber-500',   text: 'text-amber-700' },
  OVERDUE: { cls: 'border-rose-200 bg-rose-50/70 text-rose-700',          dot: 'bg-rose-500',    text: 'text-rose-700' },
  NONE:    { cls: 'border-slate-200 bg-slate-50 text-slate-400',          dot: 'bg-slate-300',   text: 'text-slate-400' },
};

const EMPTY_BILLS: BillSummary = { total: 0, paid: 0, pending: 0, overdue: 0, outstanding: 0 };

/**
 * Nguồn hoá đơn đang dùng — quyết định câu chữ trên UI.
 *
 *   `full`      `GET /manager/invoices` — hoá đơn THẬT: tiền phòng, điện, nước, dịch
 *               vụ, bảo trì; có `propertyId` nên ghép vào nhà chắc chắn đúng.
 *   `rent-only` `GET /host/invoices?month=` — BE dựng on-the-fly từ hợp đồng ACTIVE,
 *               CHỈ tiền phòng. Ở chế độ này KHÔNG được nói "đã thu đủ": khách có thể
 *               đang nợ tiền điện mà màn hình vẫn xanh.
 *   `none`      cả hai đều hỏng → im lặng, không vẽ gì.
 */
export type BillSource = 'full' | 'rent-only' | 'none';

/**
 * Cộng một hoá đơn vào bảng tổng của căn.
 *
 * BỎ `HD-ONBOARD-*` (`isOnboardEnvelope`): đó là VỎ BỌC gộp tiền cọc + tiền nhà kỳ đầu,
 * hai phần đã được ghi ở nơi khác. Cộng vào là vừa tính trùng tiền nhà vừa coi tiền cọc
 * là doanh thu — xem chú thích dài ở `admin.service.ts`.
 * BỎ luôn `CANCELLED`: hoá đơn đã huỷ không còn là khoản phải thu.
 */
const addInvoice = (acc: BillSummary, status: string, amount: number, isEnvelope?: boolean) => {
  if (isEnvelope || status === 'CANCELLED') return;
  acc.total += 1;
  if (status === 'PAID') { acc.paid += 1; return; }
  if (status === 'OVERDUE') acc.overdue += 1;
  else acc.pending += 1;
  acc.outstanding += amount;
};

// ─── Kết quả cho một căn ────────────────────────────────────────────────────

export interface PropertyOperationStatus {
  occ: PropertyOccupancy;
  rental: RentalState;
  bills: BillSummary;
  billState: BillState;
  /** Nguyên căn đang có khách: hạn hợp đồng, để host thấy khi nào phải tìm khách mới. */
  contractEndDate?: string;
  tenantName?: string;

  /**
   * TIỀN THUÊ THẬT — tổng `rentAmount` của mọi hợp đồng ACTIVE của căn này.
   *
   * ─── Vì sao không đọc `appliedPrice` của nhà ────────────────────────────────
   * Mô hình giá của BE có hai số: `listedPrice` (giá Host duyệt — GIÁ CHÀO) và
   * `appliedPrice` (giá hợp đồng đang chạy). Nhưng `appliedPrice` chỉ có ý nghĩa với
   * nhà NGUYÊN CĂN; nhà chia phòng thì giá nằm ở từng phòng, mỗi phòng một khách một
   * giá, không có con số nào ở cấp toà nhà nói được "căn này đang thu bao nhiêu".
   *
   * Hợp đồng thì trả lời được cả hai loại: cộng `rentAmount` các HĐ ACTIVE là ra đúng
   * số tiền căn đó đẻ ra mỗi tháng. Và danh sách hợp đồng đã tải sẵn cho phần khai
   * thác nên KHÔNG tốn thêm request nào.
   *
   * 0 = không có hợp đồng nào đang chạy → nơi hiển thị phải quay về giá niêm yết và
   * nói rõ đó là giá chào, đừng hiện 0 đ.
   */
  activeRent: number;
  /** Số hợp đồng đang chạy — để nói "đang thu từ 3 phòng". */
  activeContracts: number;
}

export interface HostPropertyStatusResult {
  status: Map<number, PropertyOperationStatus>;
  billSource: BillSource;
  /** Đang nạp hợp đồng/hoá đơn — danh sách nhà đã hiện rồi, phần này về sau. */
  loading: boolean;
  reload: () => void;
}

/**
 * Ghép danh sách nhà với hợp đồng + hoá đơn của một kỳ.
 *
 * Nhà đã có sẵn ở nơi gọi nên hook KHÔNG gọi lại API nhà — chỉ thêm hợp đồng + hoá đơn
 * cho toàn bộ danh mục, không phụ thuộc số căn.
 */
export const useHostPropertyStatus = (
  properties: PropertyResponse[],
  period: string,
): HostPropertyStatusResult => {
  const [contracts, setContracts] = useState<HostContractDto[] | null>(null);
  const [invoices, setInvoices] = useState<AdminInvoiceRow[] | null>(null);
  /** Hoá đơn chế độ rút gọn: chỉ có TÊN nhà nên phải khớp bằng tên. */
  const [rentByName, setRentByName] = useState<Map<string, BillSummary> | null>(null);
  const [billSource, setBillSource] = useState<BillSource>('none');
  const [loadingBills, setLoadingBills] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<Map<number, PropertyOperationStatus>>(new Map());

  const reload = useCallback(() => setNonce(n => n + 1), []);

  // ── Hợp đồng: chỉ để biết NGUYÊN CĂN có khách chưa; không phụ thuộc kỳ ──
  useEffect(() => {
    let cancelled = false;
    setContracts(null);
    hostService.listAllContracts()
      .then(list => { if (!cancelled) setContracts(list); })
      // Hỏng thì coi như không có HĐ nào: nguyên căn hiện "đang để trống". Thà thiếu
      // còn hơn dựng trạng thái từ dữ liệu không lấy được.
      .catch(() => { if (!cancelled) setContracts([]); });
    return () => { cancelled = true; };
  }, [nonce]);

  // ── Hoá đơn theo kỳ ──
  useEffect(() => {
    let cancelled = false;
    setLoadingBills(true);

    (async () => {
      const full = await canUseFullInvoices();
      if (cancelled) return;

      if (full) {
        const rows = await adminService.listInvoices({ period }).catch(() => [] as AdminInvoiceRow[]);
        if (cancelled) return;
        setInvoices(rows);
        setRentByName(null);
        setBillSource('full');
        setLoadingBills(false);
        return;
      }

      // Rút gọn: BE host bắt buộc đúng 1 kỳ và không trả propertyId.
      const page = await hostService.getInvoices({ month: period, size: 500 }).catch(() => null);
      if (cancelled) return;
      if (!page) {
        setInvoices(null); setRentByName(null); setBillSource('none'); setLoadingBills(false);
        return;
      }
      const byName = new Map<string, BillSummary>();
      for (const inv of page.content ?? []) {
        const key = normalizeVi(inv.propertyName ?? '');
        if (!key) continue;
        const acc = byName.get(key) ?? { ...EMPTY_BILLS };
        // BE host trả UNPAID; quy về PENDING cho khớp enum hoá đơn thật.
        addInvoice(acc, inv.status === 'UNPAID' ? 'PENDING' : inv.status, inv.amount);
        byName.set(key, acc);
      }
      setInvoices(null);
      setRentByName(byName);
      setBillSource('rent-only');
      setLoadingBills(false);
    })();

    return () => { cancelled = true; };
  }, [period, nonce]);

  useEffect(() => {
    /*
      Nguyên căn: bằng chứng "đang có khách" chỉ đến từ hợp đồng ACTIVE của chính nó.

      Gom theo `propertyId` là chính; khi HĐ thiếu id thì lùi về khớp TÊN nhà. Chỗ dự
      phòng này đáng có vì hỏng ở đây hỏng lặng lẽ và lệch đúng về phía nguy hiểm: một
      căn đang cho thuê sẽ hiện "Đang để trống", host tin là căn đó không ra tiền và đi
      giục quản lý tìm khách cho căn đã có người ở.
    */
    const idByName = new Map<string, number>();
    for (const p of properties) idByName.set(normalizeVi(p.propertyName), p.id);
    const resolveId = (c: HostContractDto): number | undefined =>
      c.propertyId ?? idByName.get(normalizeVi(c.propertyName ?? ''));

    const rentedWholeHouse = new Set<number>();
    const draftWholeHouse = new Set<number>();
    const activeByProperty = new Map<number, HostContractDto>();
    /** id nhà → [tổng rentAmount đang chạy, số hợp đồng]. Xem `activeRent`. */
    const rentByProperty = new Map<number, { sum: number; count: number }>();
    for (const c of contracts ?? []) {
      const pid = resolveId(c);
      if (pid == null) continue;
      if (c.status === 'ACTIVE') {
        rentedWholeHouse.add(pid);
        // Nguyên căn chỉ có một HĐ; nhà chia phòng thì giữ HĐ đầu tiên gặp — phần tên
        // khách/hạn HĐ bên dưới chỉ dùng cho nguyên căn nên không ảnh hưởng.
        if (!activeByProperty.has(pid)) activeByProperty.set(pid, c);
        const acc = rentByProperty.get(pid) ?? { sum: 0, count: 0 };
        acc.sum += Number(c.rentAmount) || 0;
        acc.count += 1;
        rentByProperty.set(pid, acc);
      } else if (c.status === 'DRAFT' || c.status === 'PENDING') {
        draftWholeHouse.add(pid);
      }
    }

    const billsById = new Map<number, BillSummary>();
    for (const inv of invoices ?? []) {
      if (inv.propertyId == null) continue;
      const acc = billsById.get(inv.propertyId) ?? { ...EMPTY_BILLS };
      addInvoice(acc, inv.status, inv.amount, inv.isOnboardEnvelope);
      billsById.set(inv.propertyId, acc);
    }

    const next = new Map<number, PropertyOperationStatus>();
    for (const p of properties) {
      const occ = occupancyFromProperty(p, {
        draftWholeHouse: draftWholeHouse.has(p.id),
        occupiedWholeHouse: rentedWholeHouse.has(p.id),
      });
      const bills =
        billsById.get(p.id)
        ?? rentByName?.get(normalizeVi(p.propertyName))
        ?? EMPTY_BILLS;
      const active = occ.wholeHouse ? activeByProperty.get(p.id) : undefined;
      const rent = rentByProperty.get(p.id);

      next.set(p.id, {
        occ,
        rental: rentalStateOf(occ),
        bills,
        billState: billStateOf(bills),
        contractEndDate: active?.endDate,
        tenantName: active?.lesseeName ?? undefined,
        activeRent: rent?.sum ?? 0,
        activeContracts: rent?.count ?? 0,
      });
    }
    setStatus(next);
  }, [properties, contracts, invoices, rentByName]);

  return { status, billSource, loading: loadingBills || contracts === null, reload };
};

// ─── Thu tiền của MỘT căn, bóc tới từng phòng ───────────────────────────────

/**
 * Hoá đơn một kỳ của một căn, tách theo phòng — dùng ở màn chi tiết nhà.
 *
 * Danh sách chỉ trả lời được "còn 2 hoá đơn chưa thu"; muốn đi đòi thì phải biết
 * PHÒNG NÀO. Đây là phần bóc đó.
 */
export interface PropertyBillBreakdown {
  source: BillSource;
  /** Khoá = số phòng đã chuẩn hoá (`normalizeRoomNumber`) — "P.101" và "101" cùng một chỗ. */
  byRoom: Map<string, BillSummary>;
  /** Hoá đơn không gắn phòng nào: nhà nguyên căn, hoặc khoản thu cấp toà nhà. */
  house: BillSummary;
  /** Tách theo LOẠI khoản thu — "2/3 đã thu" không nói được thiếu tiền điện hay tiền nhà. */
  byType: Map<AdminInvoiceType, BillSummary>;
  /** Từng hoá đơn một, để host mở ra xem đích xác đang chờ khoản nào. */
  lines: BillLine[];
  total: BillSummary;
}

/**
 * Một hoá đơn cụ thể trong kỳ.
 *
 * Có danh sách này thì host trả lời được câu "thiếu cái gì" chứ không chỉ "thiếu mấy
 * cái" — hai hoá đơn cùng số lượng nhưng một cái là tiền nhà 5 triệu, một cái là tiền
 * nước 200 nghìn thì mức độ phải đi đòi khác hẳn nhau.
 */
export interface BillLine {
  id: string;
  code: string;
  type: AdminInvoiceType;
  roomNumber?: string;
  tenantName?: string;
  amount: number;
  status: string;
  dueDate?: string;
  /**
   * `HD-ONBOARD-*` — vỏ bọc gộp cọc + tiền nhà kỳ đầu. VẪN liệt kê để host không
   * thấy hụt một dòng so với sổ hoá đơn, nhưng KHÔNG cộng vào tổng (xem `addInvoice`).
   */
  envelope?: boolean;
}

/** Thứ tự + nhãn của các loại khoản thu, dùng chung mọi nơi hiển thị. */
export const INVOICE_TYPE_META: Record<AdminInvoiceType, { label: string; icon: string }> = {
  RENT:        { label: 'Tiền nhà',    icon: '🏠' },
  ELECTRICITY: { label: 'Tiền điện',   icon: '⚡' },
  WATER:       { label: 'Tiền nước',   icon: '💧' },
  SERVICE:     { label: 'Phí dịch vụ', icon: '🧾' },
  MAINTENANCE: { label: 'Bảo trì',     icon: '🔧' },
  OTHER:       { label: 'Khoản khác',  icon: '📄' },
};

export const INVOICE_TYPE_ORDER: AdminInvoiceType[] =
  ['RENT', 'ELECTRICITY', 'WATER', 'SERVICE', 'MAINTENANCE', 'OTHER'];

const EMPTY_BREAKDOWN: PropertyBillBreakdown = {
  source: 'none', byRoom: new Map(), house: EMPTY_BILLS,
  byType: new Map(), lines: [], total: EMPTY_BILLS,
};

/**
 * Hoá đơn của một căn trong một kỳ.
 *
 * `propertyName` chỉ dùng ở chế độ rút gọn — endpoint `/host/invoices` không trả
 * `propertyId` nên phải khớp bằng tên.
 */
export const loadPropertyBills = async (
  propertyId: number,
  propertyName: string,
  period: string,
): Promise<PropertyBillBreakdown> => {
  const bump = (map: Map<string, BillSummary>, key: string) => {
    const cur = map.get(key) ?? { ...EMPTY_BILLS };
    map.set(key, cur);
    return cur;
  };

  const byRoom = new Map<string, BillSummary>();
  const byType = new Map<AdminInvoiceType, BillSummary>();
  const house: BillSummary = { ...EMPTY_BILLS };
  const total: BillSummary = { ...EMPTY_BILLS };
  const lines: BillLine[] = [];

  if (await canUseFullInvoices()) {
    const rows = await adminService.listInvoices({ period }).catch(() => [] as AdminInvoiceRow[]);
    for (const r of rows) {
      if (r.propertyId !== propertyId) continue;
      const key = normalizeRoomNumber(r.roomNumber);
      addInvoice(key ? bump(byRoom, key) : house, r.status, r.amount, r.isOnboardEnvelope);
      addInvoice(bumpType(byType, r.type), r.status, r.amount, r.isOnboardEnvelope);
      addInvoice(total, r.status, r.amount, r.isOnboardEnvelope);
      lines.push({
        id: String(r.id), code: r.code, type: r.type,
        roomNumber: r.roomNumber, tenantName: r.tenantName,
        amount: r.amount, status: r.status, dueDate: r.dueDate,
        envelope: r.isOnboardEnvelope,
      });
    }
    return { source: 'full', byRoom, byType, house, lines: sortLines(lines), total };
  }

  const page = await hostService.getInvoices({ month: period, size: 500 }).catch(() => null);
  if (!page) return EMPTY_BREAKDOWN;

  const wanted = normalizeVi(propertyName);
  for (const inv of page.content ?? []) {
    if (normalizeVi(inv.propertyName ?? '') !== wanted) continue;
    // BE host trả UNPAID; quy về PENDING cho khớp enum hoá đơn thật.
    const status = inv.status === 'UNPAID' ? 'PENDING' : inv.status;
    const key = normalizeRoomNumber(inv.roomCode);
    addInvoice(key ? bump(byRoom, key) : house, status, inv.amount);
    // `/host/invoices` dựng từ hợp đồng ACTIVE nên mọi dòng đều là tiền nhà —
    // endpoint này không có trường `type` để đọc.
    addInvoice(bumpType(byType, 'RENT'), status, inv.amount);
    addInvoice(total, status, inv.amount);
    lines.push({
      id: inv.id, code: inv.id, type: 'RENT',
      roomNumber: inv.roomCode, tenantName: inv.tenantName,
      amount: inv.amount, status, dueDate: inv.dueDate,
    });
  }
  return { source: 'rent-only', byRoom, byType, house, lines: sortLines(lines), total };
};

const bumpType = (map: Map<AdminInvoiceType, BillSummary>, t: AdminInvoiceType) => {
  const cur = map.get(t) ?? { ...EMPTY_BILLS };
  map.set(t, cur);
  return cur;
};

/** Chưa thu lên trước (host cần đòi), rồi theo thứ tự loại cố định cho dễ quét mắt. */
const sortLines = (lines: BillLine[]): BillLine[] =>
  [...lines].sort((a, b) => {
    const rank = (l: BillLine) => (l.status === 'OVERDUE' ? 0 : l.status === 'PAID' ? 2 : 1);
    return rank(a) - rank(b)
      || INVOICE_TYPE_ORDER.indexOf(a.type) - INVOICE_TYPE_ORDER.indexOf(b.type)
      || (a.roomNumber ?? '').localeCompare(b.roomNumber ?? '', 'vi');
  });

/*
 * Ở đây từng có `occupancyText()` — gộp tình trạng khai thác thành một câu chữ. Bỏ vì
 * không nơi nào gọi: chỗ hiển thị đều cần từng phần rời (badge màu, thanh tỉ lệ, con số
 * tách riêng) chứ không phải một chuỗi dựng sẵn. Cần lại thì lấy từ `RENTAL_META` và
 * `PropertyOperationStatus.occ`.
 */
