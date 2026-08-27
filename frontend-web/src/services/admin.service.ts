import api from './api';
import type { Page } from '@/types/api.types';

// =============================================================================
// Admin (System Admin) service — giám sát tài chính toàn hệ thống.
//
// Nguồn dữ liệu (BE commit a52c370, verify 08/08/2026):
//   • Hoá đơn   `GET /api/v1/manager/invoices`  — ManagerBillingController cho phép
//     cả ROLE_ADMIN; admin gọi thì managerFilter = null nên nhận hoá đơn TOÀN hệ
//     thống, đã `ORDER BY i.createdAt DESC` sẵn (mới nhất lên đầu, FE không sort lại).
//     Admin nhận đủ số tiền; manager bị BE null `amount`/`totalAmount`/`lateFee`
//     với hoá đơn RENT — xem mobile-app/src/constants/managerVisibility.ts.
//   • Giao dịch `GET /api/v1/manager/payments`  — ghép với hoá đơn theo `invoiceCode`.
//   • Tiền cọc  `GET /api/v1/admin/deposits`    — cọc nằm trên hợp đồng, không có
//     trong bảng hoá đơn.
//   • Host      `GET /api/v1/admin/hosts`       — chỉ để đếm ở Bảng điều hành.
//
// `GET /api/v1/admin/invoices` đã bị BE XOÁ HẲN (a52c370) vì nó dựng "hoá đơn ảo"
// từ hợp đồng chứ không đọc bảng hoá đơn thật. Đừng gọi lại.
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
  /** Hợp đồng phát sinh hoá đơn — dùng để lọc hoá đơn của MỘT hợp đồng. */
  contractId?: number | null;
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
  /** FIRST | REGULAR | LAST — chu kỳ của hoá đơn tiền nhà. */
  cycleType?: string | null;
  /**
   * BE bật cờ này cho CẢ HAI hoá đơn của một lần thu lúc nhận phòng:
   * `HD-ONBOARD-*` (nơi tiền thật sự chuyển) và `HD-RENT-*` chu kỳ đầu
   * (bản ghi kế toán cho phần tiền nhà đã nằm trong hoá đơn kia).
   * Xem `ManagerBillingServiceImpl`: note bắt đầu `ONBOARD|` hoặc chứa `onboardPaid=true`.
   */
  onboardPaid?: boolean | null;
}

/** Hoá đơn thu gộp lúc nhận phòng — nơi tiền THẬT SỰ chuyển. */
const isOnboardCode = (code?: string | null): boolean =>
  !!code && code.startsWith('HD-ONBOARD-');

/** 1 dòng hoá đơn đã chuẩn hoá cho UI admin. */
export interface AdminInvoiceRow {
  id: number;
  code: string;
  type: AdminInvoiceType;
  /** Hợp đồng phát sinh hoá đơn — lọc hoá đơn theo hợp đồng ở màn chi tiết HĐ. */
  contractId?: number;
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
  /**
   * `HD-ONBOARD-*` — **VỎ BỌC THANH TOÁN**, không phải một khoản thu riêng.
   *
   * Lúc đón khách, khách chuyển MỘT lần gồm hai thứ bản chất khác hẳn nhau:
   *   • tiền cọc          9.500.000  → khoản GIỮ HỘ, hoàn lại khi trả phòng (công nợ)
   *   • tiền nhà kỳ đầu   5.209.677  → doanh thu thật
   *   ────────────────────────────
   *   HD-ONBOARD-1       14.709.677  ← chỉ là tổng của hai dòng trên
   *
   * Hai phần đó đã được ghi ở nơi khác: tiền nhà ở `HD-RENT-*` chu kỳ đầu, tiền cọc ở
   * sổ cọc (tab "Tiền cọc"). Nên dòng này **KHÔNG được cộng vào tổng hoá đơn** — cộng
   * vào là vừa tính trùng tiền nhà, vừa tính tiền cọc thành doanh thu trong khi đó là
   * tiền sẽ phải trả lại khách.
   */
  isOnboardEnvelope: boolean;
  /**
   * Hoá đơn tiền nhà chu kỳ đầu, đã thu chung một lần với tiền cọc lúc nhận phòng.
   * **Vẫn là doanh thu thật và vẫn cộng vào tổng** — cờ này chỉ để hiện nhãn giải thích
   * vì sao hoá đơn không có giao dịch riêng.
   */
  collectedAtOnboard: boolean;
  /** Mã hoá đơn gộp đã thu khoản này (chỉ có khi `collectedAtOnboard`). */
  collectedInInvoiceCode?: string;
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
  const isOnboardEnvelope = isOnboardCode(d.code);
  // `onboardPaid` bật ở cả hai hoá đơn của một lần thu; cái KHÔNG phải vỏ bọc chính là
  // hoá đơn tiền nhà chu kỳ đầu — nó là doanh thu thật, vẫn cộng vào tổng.
  const collectedAtOnboard = !!d.onboardPaid && !isOnboardEnvelope;
  return {
    contractId: d.contractId ?? undefined,
    isOnboardEnvelope,
    collectedAtOnboard,
    // Mã vỏ bọc suy từ contractId trong mã tiền nhà: HD-RENT-{contractId}-{kỳ}.
    collectedInInvoiceCode: collectedAtOnboard
      ? `HD-ONBOARD-${(d.code || '').split('-')[2] ?? ''}`
      : undefined,
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
 * Nguồn: `GET /api/v1/admin/deposits` — `AdminBillingController`, chỉ ADMIN. BE đã
 * phân trang và sort sẵn `COALESCE(paidAt, depositCashManagerConfirmedAt) DESC` nên
 * FE không sắp lại. Khác bản `/manager/deposits`, DTO của admin CÓ `deposit` và
 * `rentAmount` — admin được xem tiền, manager thì không.
 */

/** Khớp `PaymentStatus` của BE — trạng thái thu CỌC của hợp đồng. */
export type AdminDepositStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';

/** Khớp `AdminDepositDto` của BE. */
interface AdminDepositDto {
  contractId: number;
  contractCode?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  deposit?: number | string | null;
  depositMonths?: number | null;
  rentAmount?: number | string | null;
  paymentStatus?: string | null;
  /** BE suy ra: có payosOrderCode → "PAYOS", có xác nhận tiền mặt → "CASH", còn lại null. */
  depositMethod?: string | null;
  depositPaidAt?: string | null;
  contractStatus?: string | null;   // DRAFT | PENDING | ACTIVE | EXPIRED | TERMINATED
  moveInDate?: string | null;
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
}

const DEPOSIT_STATUSES: AdminDepositStatus[] = ['PENDING', 'PAID', 'FAILED', 'CANCELLED'];

/** Hợp đồng đã kết thúc — không còn thu cọc được nữa. Xem `listDeposits`. */
const DEAD_CONTRACT_STATUSES = new Set(['TERMINATED', 'EXPIRED', 'CANCELLED']);

const depositToRow = (d: AdminDepositDto): AdminDepositRow => {
  const status = (d.paymentStatus || '').toUpperCase() as AdminDepositStatus;
  return {
    contractId: d.contractId,
    contractCode: d.contractCode ?? `HĐ #${d.contractId}`,
    propertyName: d.propertyName ?? '—',
    roomNumber: d.roomNumber ?? undefined,
    tenantName: d.tenantName ?? '—',
    tenantPhone: d.tenantPhone ?? undefined,
    amount: Number(d.deposit) || 0,
    depositMonths: d.depositMonths ?? undefined,
    rentAmount: Number(d.rentAmount) || 0,
    status: DEPOSIT_STATUSES.includes(status) ? status : 'PENDING',
    method: d.depositMethod ?? undefined,
    paidAt: d.depositPaidAt ?? undefined,
    contractStatus: (d.contractStatus || '').toUpperCase(),
    moveInDate: d.moveInDate ?? undefined,
  };
};

// ── Host (giữ nguyên — dùng cho thẻ đếm ở Bảng điều hành) ─────────────────────
/** Khớp `AdminHostDto` của BE ({ id, name }) — user có role OWNER. */
// ── Mốc thu tiền (billing_config) ────────────────────────────────────────────
/**
 * Ba số này KHÔNG độc lập — xem `ContractBillingCalendar` phía BE:
 *
 *   mốc          = ngày trong tháng của `startDate` từng hợp đồng
 *   phát hoá đơn = mốc − reminderLeadDays        ← ĐỒNG THỜI là hạn chụp công tơ
 *   nhắc chụp    = hạn chụp − meterReminderLeadDays
 *   hạn trả tiền = mốc + graceDays
 *
 * Nên đổi `reminderLeadDays` là dời cả ngày phát hoá đơn LẪN deadline chụp ảnh công
 * tơ của toàn bộ quản lý. UI phải cho xem trước dòng thời gian, đừng để admin gõ mù.
 */
export interface BillingConfig {
  /** Số ngày trước mốc bắt đầu nhắc + phát hành hoá đơn. BE: 0–14. */
  reminderLeadDays: number;
  /** Số ngày ân hạn sau mốc; quá là OVERDUE. BE: 0–14. */
  graceDays: number;
  /** Nhắc quản lý đi chụp công tơ trước hạn chụp bao nhiêu ngày. BE: 0–7. */
  meterReminderLeadDays: number;
  updatedAt?: string;
}

export type BillingConfigInput = Omit<BillingConfig, 'updatedAt'>;

/** Khớp `@Min`/`@Max` của `UpdateBillingConfigRequest` — chặn ở FE trước khi gọi API. */
export const BILLING_CONFIG_LIMITS = {
  reminderLeadDays: { min: 0, max: 14 },
  graceDays: { min: 0, max: 14 },
  meterReminderLeadDays: { min: 0, max: 7 },
} as const;

export interface AdminHost {
  id: string;
  name: string;
}

/**
 * ─── MỞ KHOÁ THU HỘ (17/08/2026) ─────────────────────────────────────────────
 *
 * Quản lý không được tự tạo giao dịch trên hoá đơn của khách. Nhưng có hai ca thật
 * buộc phải làm thế: khách trả TIỀN MẶT tại phòng, và khách nhờ NGƯỜI KHÁC trả hộ.
 * Cửa đó mở tự do thì quản lý ghi nhận thu bừa được, nên mỗi lần phải xin admin một
 * mã 6 số dùng một lần, gắn cứng đúng 1 hoá đơn + 1 mục đích.
 *
 * Admin phát mã ở đây rồi đọc cho quản lý qua điện thoại. Mọi lần quản lý nhập mã —
 * đúng hay sai — đều vào log để admin soát lại.
 */
export type InvoiceUnlockPurpose = 'CASH_COLLECT' | 'PROXY_PAY';

export interface InvoiceUnlockPasscode {
  id: number;
  /** 6 chữ số. Chỉ đọc cho quản lý qua điện thoại, đừng gửi qua chat nhóm. */
  passcode: string;
  invoiceId: number;
  purpose: InvoiceUnlockPurpose;
  note?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
  /** Còn dùng được không (chưa dùng + chưa hết hạn) — BE tự tính. */
  usable: boolean;
  message?: string | null;
}

export interface InvoiceUnlockLog {
  id: number;
  managerId: string;
  managerName?: string | null;
  invoiceId: number;
  invoiceCode?: string | null;
  purpose: InvoiceUnlockPurpose;
  adminName?: string | null;
  /** false = nhập sai mã. Nhiều dòng false liên tiếp là dấu hiệu cần để ý. */
  success: boolean;
  /** QR_CREATED khi đã tạo được mã QR. */
  paymentResult?: string | null;
  createdAt: string;
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
   * Tiền cọc của mọi hợp đồng, mới thu trước (BE sort sẵn).
   *
   * BE `findAdminDeposits` trả về MỌI hợp đồng, chỉ lọc theo `paymentStatus` — không hề
   * lọc theo trạng thái hợp đồng. Nên phải chặn 2 nhóm ở đây:
   *
   *  • **DRAFT** — hồ sơ chưa thành hợp đồng, chưa phát sinh nghĩa vụ thu cọc.
   *  • **Hợp đồng đã chết mà cọc CHƯA từng thu** — hợp đồng thanh lý / hết hạn / bị huỷ
   *    thì không còn ai để thu cọc nữa, nhưng BE vẫn trả `paymentStatus = PENDING` nên
   *    nó nằm mãi trong hàng "Chưa thu cọc" và cộng vào tổng tiền phải thu. Với dữ liệu
   *    import/test thì toàn bộ danh sách là loại này — admin đọc ra con số nợ hoàn toàn
   *    sai (xem doc-be/BE-BUG-coc-hop-dong-da-thanh-ly-2026-08-26.md).
   *
   * Hợp đồng đã chết nhưng ĐÃ thu cọc thì GIỮ LẠI: đó là lịch sử, và là khoản còn phải
   * hoàn cho khách — bỏ đi là mất dấu tiền thật.
   */
  listDeposits: async (status?: AdminDepositStatus): Promise<AdminDepositRow[]> => {
    const res = await api.get<unknown, Page<AdminDepositDto> | AdminDepositDto[]>(
      `${ADMIN}/deposits`,
      { params: { status, size: 500 }, skipErrorToast: true } as object,
    );
    const list = Array.isArray(res) ? res : res?.content ?? [];
    return list
      .map(depositToRow)
      .filter(r => r.contractStatus !== 'DRAFT')
      .filter(r => !(DEAD_CONTRACT_STATUSES.has(r.contractStatus) && r.status !== 'PAID'));
  },

  /** Danh sách host (user role OWNER) — chỉ để đếm ở Bảng điều hành. */
  getHosts: async (): Promise<AdminHost[]> => {
    const res = await api.get<unknown, AdminHost[]>(
      `${ADMIN}/hosts`, { skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res : [];
  },

  /**
   * Phát mã mở khoá cho MỘT hoá đơn. `ttlMinutes` để trống = 15 phút (BE clamp 1..60).
   * BE trả 429 khi admin phát quá 20 mã/giờ.
   */
  generateUnlockPasscode: async (payload: {
    invoiceId: number; purpose: InvoiceUnlockPurpose;
    ttlMinutes?: number; note?: string;
  }): Promise<InvoiceUnlockPasscode> => {
    return await api.post<unknown, InvoiceUnlockPasscode>(
      `${ADMIN}/invoice-unlock/passcodes`, payload,
    );
  },

  /** `activeOnly` = chỉ mã còn dùng được. */
  listUnlockPasscodes: async (activeOnly = false): Promise<InvoiceUnlockPasscode[]> => {
    const res = await api.get<unknown, InvoiceUnlockPasscode[]>(
      `${ADMIN}/invoice-unlock/passcodes`,
      { params: { activeOnly }, skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res : [];
  },

  /** Nhật ký mở khoá — gồm cả lần nhập SAI mã. */
  listUnlockLogs: async (): Promise<InvoiceUnlockLog[]> => {
    const res = await api.get<unknown, InvoiceUnlockLog[]>(
      `${ADMIN}/invoice-unlock/logs`, { skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res : [];
  },

  /**
   * Mốc thu tiền toàn hệ thống. Lưu DB (bảng `billing_config`, một dòng id=1) nên
   * sửa xong có hiệu lực ngay, không cần restart BE.
   *
   * Không bao giờ 404: `BillingConfigServiceImpl.current()` tự tạo bản mặc định khi
   * bảng rỗng, và migration đã seed sẵn (3 / 2 / 1).
   */
  getBillingConfig: async (): Promise<BillingConfig> => {
    return await api.get<unknown, BillingConfig>(`${ADMIN}/billing-config`);
  },

  /**
   * `meterReminderLeadDays` optional phía BE, nhưng FE luôn gửi đủ 3 số để tránh
   * chuyện bỏ trống rồi BE giữ giá trị cũ trong khi UI hiện giá trị mới.
   */
  updateBillingConfig: async (payload: BillingConfigInput): Promise<BillingConfig> => {
    return await api.put<unknown, BillingConfig>(`${ADMIN}/billing-config`, payload);
  },
};
