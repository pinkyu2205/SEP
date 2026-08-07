import api from './api';

// =============================================================================
// Admin (System Admin) service — giám sát tài chính toàn hệ thống.
//
// ⚠️ ĐÃ BỎ `GET /api/v1/admin/invoices` (07/08/2026). Endpoint đó KHÔNG đọc bảng
// hoá đơn thật: `AdminBillingServiceImpl.buildInvoices()` tự dựng "hoá đơn ảo" từ
// các hợp đồng ACTIVE — mỗi hợp đồng 1 dòng/tháng, với:
//   • id       = "{contractId}-{yyyy-MM}"      (không phải mã hoá đơn thật)
//   • amount   = contract.rentAmount            (trọn tháng, không prorate)
//   • dueDate  = cuối tháng + 5 ngày            (hạn bịa, hoá đơn thật hạn ngày 5)
//   • status   = suy từ contract.paymentStatus  (vốn là trạng thái thu CỌC)
// Không có mã hoá đơn, không có hoá đơn điện/nước, không có kỳ thanh toán.
//
// NGUỒN THẬT: `GET /api/v1/manager/invoices` — `ManagerBillingController` cho phép
// cả `ROLE_ADMIN`; khi người gọi là admin thì `managerFilter = null`, nên
// `TenantInvoiceRepository.findForManager` trả hoá đơn của TOÀN hệ thống và đã
// `ORDER BY i.createdAt DESC` sẵn (mới nhất lên đầu — không cần FE sort lại).
// Kèm `GET /api/v1/manager/payments` để tra giao dịch đã ghi nhận của từng hoá đơn.
// =============================================================================

const MANAGER = '/api/v1/manager';
const ADMIN = '/api/v1/admin';

// ── Hoá đơn ──────────────────────────────────────────────────────────────────
/** Khớp `TenantInvoiceType` của BE. */
export type AdminInvoiceType = 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'MAINTENANCE' | 'OTHER';
/** Khớp `TenantInvoiceStatus` của BE — 5 giá trị, KHÔNG phải paid/unpaid/overdue. */
export type AdminInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'CANCELLED';

/** Khớp `ManagerInvoiceResponse` của BE, nguyên xi. */
interface ManagerInvoiceDto {
  id: number;
  code: string;
  type: string;
  propertyId: number;
  propertyName: string;
  roomNumber?: string | null;
  tenantName?: string | null;
  month?: number | null;
  year?: number | null;
  amount: number | string;
  status: string;
  dueDate?: string | null;        // YYYY-MM-DD
  createdAt?: string | null;      // ISO datetime
  /**
   * Chuỗi kỳ thanh toán do BE ghi sẵn khi tạo hoá đơn, vd "Tiền nhà tháng 08/2026"
   * hoặc "01/07 – 31/07/2026" (điện/nước). Field này CÓ trên entity `TenantInvoice`
   * nhưng `ManagerInvoiceResponse` chưa trả ra — xem
   * docs/BE-NEED-admin-billing-fields-2026-08-07.md. Đọc sẵn để BE thêm là chạy ngay.
   */
  billingPeriod?: string | null;
}

/** 1 dòng hoá đơn đã chuẩn hoá cho UI admin. */
export interface AdminInvoiceRow {
  id: number;
  code: string;
  type: AdminInvoiceType;
  propertyId: number;
  propertyName: string;
  roomNumber?: string;
  tenantName: string;
  month?: number;
  year?: number;
  /** "2026-08" — dùng để lọc/gom theo kỳ. */
  periodKey?: string;
  /** Câu mô tả kỳ này thu cho khoảng nào (ưu tiên billingPeriod của BE). */
  periodLabel: string;
  amount: number;
  status: AdminInvoiceStatus;
  dueDate?: string;
  createdAt?: string;
}

export interface AdminInvoiceQuery {
  /** "YYYY-MM" — bỏ trống = mọi kỳ. */
  period?: string;
  status?: AdminInvoiceStatus;
  type?: AdminInvoiceType;
}

const INVOICE_TYPES: AdminInvoiceType[] = ['RENT', 'ELECTRICITY', 'WATER', 'SERVICE', 'MAINTENANCE', 'OTHER'];
const INVOICE_STATUSES: AdminInvoiceStatus[] = ['PENDING', 'PAID', 'OVERDUE', 'PARTIAL', 'CANCELLED'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Tháng 08/2026" từ month/year; rỗng nếu BE không trả kỳ. */
const monthPeriod = (month?: number | null, year?: number | null): string =>
  month && year ? `Tháng ${pad2(month)}/${year}` : '';

const invoiceToRow = (d: ManagerInvoiceDto): AdminInvoiceRow => {
  const type = (d.type || '').toUpperCase() as AdminInvoiceType;
  const status = (d.status || '').toUpperCase() as AdminInvoiceStatus;
  const month = d.month ?? undefined;
  const year = d.year ?? undefined;
  return {
    id: d.id,
    code: d.code,
    type: INVOICE_TYPES.includes(type) ? type : 'OTHER',
    propertyId: d.propertyId,
    propertyName: d.propertyName ?? '—',
    roomNumber: d.roomNumber ?? undefined,
    tenantName: d.tenantName ?? '—',
    month,
    year,
    periodKey: month && year ? `${year}-${pad2(month)}` : undefined,
    periodLabel: d.billingPeriod?.trim() || monthPeriod(month, year) || 'Không rõ kỳ',
    amount: Number(d.amount) || 0,
    status: INVOICE_STATUSES.includes(status) ? status : 'PENDING',
    dueDate: d.dueDate ?? undefined,
    createdAt: d.createdAt ?? undefined,
  };
};

// ── Giao dịch thanh toán ─────────────────────────────────────────────────────
export type AdminPaymentStatus = 'PENDING_VERIFY' | 'VERIFIED' | 'REJECTED';

/** Khớp `ManagerPaymentResponse` của BE. */
interface ManagerPaymentDto {
  id: number;
  invoiceCode?: string | null;
  tenantName?: string | null;
  roomNumber?: string | null;
  propertyName?: string | null;
  amount: number | string;
  method?: string | null;
  status: string;
  transferContent?: string | null;
  createdAt?: string | null;
  verifiedAt?: string | null;
}

export interface AdminPaymentRow {
  id: number;
  invoiceCode: string;
  tenantName: string;
  roomNumber?: string;
  propertyName: string;
  amount: number;
  method?: string;
  status: AdminPaymentStatus;
  transferContent?: string;
  createdAt?: string;
  verifiedAt?: string;
}

const PAYMENT_STATUSES: AdminPaymentStatus[] = ['PENDING_VERIFY', 'VERIFIED', 'REJECTED'];

const paymentToRow = (d: ManagerPaymentDto): AdminPaymentRow => {
  const status = (d.status || '').toUpperCase() as AdminPaymentStatus;
  return {
    id: d.id,
    invoiceCode: d.invoiceCode ?? '',
    tenantName: d.tenantName ?? '—',
    roomNumber: d.roomNumber ?? undefined,
    propertyName: d.propertyName ?? '—',
    amount: Number(d.amount) || 0,
    method: d.method ?? undefined,
    status: PAYMENT_STATUSES.includes(status) ? status : 'PENDING_VERIFY',
    transferContent: d.transferContent ?? undefined,
    createdAt: d.createdAt ?? undefined,
    verifiedAt: d.verifiedAt ?? undefined,
  };
};

// ── Tiền cọc ─────────────────────────────────────────────────────────────────
/**
 * Cọc KHÔNG nằm trong bảng hoá đơn — nó là field của chính hợp đồng
 * (`TenantContract.deposit` + `paymentStatus` + `depositPaidAt` + `depositMethod`),
 * thu 1 lần lúc đón khách. Vì vậy không thể lấy qua /manager/invoices.
 *
 * Nguồn: `GET /api/v1/tenant-contracts` — `TenantContractActionController.listAll`,
 * cho phép MANAGER + ADMIN, và `getContractsByStatus(null)` gọi thẳng `findAll()`
 * nên admin nhận toàn bộ hợp đồng, không bị lọc theo người quản lý. Verify 07/08/2026.
 */

/** Khớp `PaymentStatus` của BE — trạng thái thu CỌC của hợp đồng. */
export type AdminDepositStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

/** Chỉ những field của `TenantContractResponse` mà màn tài chính cần. */
interface TenantContractDto {
  id: number;
  contractCode?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantFullName?: string | null;
  tenantPhone?: string | null;
  deposit?: number | string | null;
  depositMonths?: number | null;
  rentAmount?: number | string | null;
  paymentStatus?: string | null;
  depositPaidAt?: string | null;
  /** BE suy ra: có payosOrderCode → "PAYOS", có xác nhận tiền mặt → "CASH", còn lại null. */
  depositMethod?: string | null;
  payosOrderCode?: number | null;
  status?: string | null;          // ContractStatus: DRAFT|PENDING|ACTIVE|EXPIRED|TERMINATED
  moveInDate?: string | null;
  startDate?: string | null;
  signedAt?: string | null;
}

export interface AdminDepositRow {
  contractId: number;
  contractCode: string;
  propertyName: string;
  roomNumber?: string;
  tenantName: string;
  tenantPhone?: string;
  amount: number;
  depositMonths?: number;
  rentAmount: number;
  status: AdminDepositStatus;
  method?: string;
  paidAt?: string;
  contractStatus: string;
  /** Ngày nhận phòng — cọc phải thu xong trước mốc này. */
  moveInDate?: string;
  signedAt?: string;
  /** Mốc dùng để xếp "mới nhất trên đầu": ngày thu cọc, không có thì ngày ký/nhận phòng. */
  sortAt: string;
}

const DEPOSIT_STATUSES: AdminDepositStatus[] = ['PENDING', 'PAID', 'FAILED', 'CANCELLED'];

const contractToDepositRow = (d: TenantContractDto): AdminDepositRow => {
  const status = (d.paymentStatus || '').toUpperCase() as AdminDepositStatus;
  const paidAt = d.depositPaidAt ?? undefined;
  return {
    contractId: d.id,
    contractCode: d.contractCode ?? `HĐ #${d.id}`,
    propertyName: d.propertyName ?? '—',
    roomNumber: d.roomNumber ?? undefined,
    tenantName: d.tenantFullName ?? '—',
    tenantPhone: d.tenantPhone ?? undefined,
    amount: Number(d.deposit) || 0,
    depositMonths: d.depositMonths ?? undefined,
    rentAmount: Number(d.rentAmount) || 0,
    status: DEPOSIT_STATUSES.includes(status) ? status : 'PENDING',
    method: d.depositMethod ?? undefined,
    paidAt,
    contractStatus: (d.status || '').toUpperCase(),
    moveInDate: d.moveInDate ?? d.startDate ?? undefined,
    signedAt: d.signedAt ?? undefined,
    sortAt: paidAt ?? d.signedAt ?? d.moveInDate ?? d.startDate ?? '',
  };
};

// ── Host (giữ nguyên — dùng cho thẻ đếm ở Bảng điều hành) ─────────────────────
/** Khớp `AdminHostDto` của BE ({ id, name }) — user có role OWNER. */
export interface AdminHost {
  id: string;
  name: string;
}

export const adminService = {
  /**
   * Toàn bộ hoá đơn THẬT của hệ thống, mới nhất trước (BE sort sẵn theo createdAt DESC).
   * Lọc kỳ/trạng thái/loại phía server. Bỏ trống `period` = lấy mọi kỳ.
   *
   * ⚠️ BE ném 400 nếu `status`/`type`/`period` sai định dạng (`parseInvoiceStatus`,
   * `parseInvoiceType`, `parsePeriod`) — chỉ truyền giá trị trong union type ở trên.
   */
  listInvoices: async (params: AdminInvoiceQuery = {}): Promise<AdminInvoiceRow[]> => {
    const res = await api.get<unknown, ManagerInvoiceDto[]>(
      `${MANAGER}/invoices`,
      { params, skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res.map(invoiceToRow) : [];
  },

  /**
   * Giao dịch thanh toán khách đã báo (TenantPaymentClaim). Admin thấy của mọi nhà.
   * Dùng để hiện "đã thu bằng cách nào, lúc nào" cho từng hoá đơn.
   */
  listPayments: async (status?: AdminPaymentStatus): Promise<AdminPaymentRow[]> => {
    const res = await api.get<unknown, ManagerPaymentDto[]>(
      `${MANAGER}/payments`,
      { params: status ? { status } : {}, skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res.map(paymentToRow) : [];
  },

  /**
   * Tiền cọc của mọi hợp đồng, mới thu trước.
   *
   * ⚠️ BE trả `findAll()` KHÔNG sort, nên FE phải tự xếp — khác /manager/invoices
   * (BE đã sort sẵn). Bỏ hợp đồng nháp (DRAFT) vì chưa phát sinh nghĩa vụ thu cọc.
   */
  listDeposits: async (): Promise<AdminDepositRow[]> => {
    const res = await api.get<unknown, TenantContractDto[]>(
      '/api/v1/tenant-contracts', { skipErrorToast: true } as object,
    );
    if (!Array.isArray(res)) return [];
    return res
      .map(contractToDepositRow)
      .filter(r => r.contractStatus !== 'DRAFT' && r.amount > 0)
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  },

  /** Danh sách host (user role OWNER) — chỉ để đếm ở Bảng điều hành. */
  getHosts: async (): Promise<AdminHost[]> => {
    const res = await api.get<unknown, AdminHost[]>(
      `${ADMIN}/hosts`, { skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res : [];
  },
};
