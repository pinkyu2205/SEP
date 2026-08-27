import realApiClient from '@/services/core/realApiClient';
import type { SharedBill, BillStatus, InvoiceType, BillPaymentMethod } from '@/types/bill';
import type { PaymentBreakdown } from '@/services/tenant/tenantService';

/**
 * Hoá đơn & thanh toán của CHÍNH tenant đang đăng nhập (nối backend Spring THẬT).
 * Lấy user từ JWT — KHÔNG truyền id từ client.
 *
 * ⚠️ BE CHƯA có các endpoint này (2026-06-29) — FE gọi sẵn theo hợp đồng kỳ vọng,
 * xem doc/BE-TODO-tenant-portal-2026-06-29.md. Khi BE làm xong là chạy ngay, không sửa FE.
 */

export type TenantInvoiceType = 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'MAINTENANCE' | 'OTHER';
export type TenantInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'CANCELLED';

export interface TenantInvoiceItem {
  label: string;
  amount: number;
}

export interface TenantInvoice {
  id: number;
  code: string;
  type: TenantInvoiceType;
  propertyName: string;
  roomNumber?: string | null;
  month: number;
  year: number;
  billingPeriod?: string;
  items?: TenantInvoiceItem[];
  totalAmount: number;
  lateFee?: number;
  grandTotal: number;
  status: TenantInvoiceStatus;
  dueDate: string;
  createdAt: string;
  /**
   * FIRST | REGULAR | LAST do BE gắn. FE chỉ ĐỌC để hiển thị nếu cần, KHÔNG còn nhánh
   * xử lý riêng cho FIRST: tiền kỳ đầu nay thu chung với tiền cọc ở mã QR lúc đón khách
   * (BE 609de59/276b613, 12/08/2026) nên không có hoá đơn kỳ đầu chờ thanh toán.
   */
  cycleType?: string;
  /**
   * Cách tính khoản này, BE dựng sẵn từ 10/08/2026 (`PaymentBreakdownResponse`).
   * Quan trọng nhất với khoản thu lúc nhận phòng: nó mang công thức chia tiền nhà theo
   * số ngày ở để khách tự đối chiếu, thay vì thấy một con số lẻ không hiểu ở đâu ra.
   */
  paymentBreakdown?: PaymentBreakdown;
  paidAt?: string;
  paymentMethod?: string;
  transactionId?: string;
  // điện/nước
  kwhUsed?: number;
  electricityRate?: number;
  m3Used?: number;
  waterRate?: number;
  // PayOS (khi tạo thanh toán)
  payosCheckoutUrl?: string;
  payosQrCode?: string;
  payosOrderCode?: number;
}

export interface TenantPayment {
  id: number;
  invoiceId: number;
  invoiceCode: string;
  invoiceType: TenantInvoiceType;
  amount: number;
  method: string;       // QR | BANK_TRANSFER | CASH | EWALLET | OTHER
  paidAt: string;
  transactionId?: string;
  propertyName?: string;
  roomNumber?: string | null;
}

interface SpringPage<T> { content: T[]; }
const unwrap = <T,>(data: SpringPage<T> | T[] | null | undefined): T[] =>
  Array.isArray(data) ? data : data?.content ?? [];

const BASE = '/api/v1/tenant/me';

export const realTenantBillingService = {
  // GET /api/v1/tenant/me/invoices?status=&type=
  listInvoices: async (params?: { status?: string; type?: string }): Promise<TenantInvoice[]> => {
    const { data } = await realApiClient.get<SpringPage<TenantInvoice> | TenantInvoice[]>(
      `${BASE}/invoices`, { params },
    );
    return unwrap(data);
  },

  // GET /api/v1/tenant/me/invoices/{id}
  getInvoice: async (id: number | string): Promise<TenantInvoice> => {
    const { data } = await realApiClient.get<TenantInvoice>(`${BASE}/invoices/${id}`);
    return data;
  },

  // POST /api/v1/tenant/me/invoices/{id}/payment -> tạo link/QR PayOS cho hoá đơn
  payInvoice: async (id: number | string): Promise<TenantInvoice> => {
    const { data } = await realApiClient.post<TenantInvoice>(`${BASE}/invoices/${id}/payment`);
    return data;
  },

  // POST /api/v1/tenant/me/invoices/{id}/payment/check -> đồng bộ trạng thái thanh toán
  checkInvoicePayment: async (id: number | string): Promise<TenantInvoice> => {
    const { data } = await realApiClient.post<TenantInvoice>(`${BASE}/invoices/${id}/payment/check`);
    return data;
  },

  // GET /api/v1/tenant/me/payments -> lịch sử thanh toán
  listPayments: async (): Promise<TenantPayment[]> => {
    const { data } = await realApiClient.get<SpringPage<TenantPayment> | TenantPayment[]>(
      `${BASE}/payments`,
    );
    return unwrap(data);
  },

  // GET /api/v1/tenant/me/pending-charges -> khoản chờ thu (phí bảo trì khách làm hư
  // đã nghiệm thu nhưng chưa phát hành hóa đơn). status: PENDING | INVOICED.
  listPendingCharges: async (): Promise<Array<{
    id: number; tenantContractId: number; invoiceId?: number | null;
    amount: number; category: string; note?: string; status: string; createdAt: string;
  }>> => {
    const { data } = await realApiClient.get(`${BASE}/pending-charges`);
    return Array.isArray(data) ? data : [];
  },
};

// ===== Mappers: TenantInvoice (BE) -> SharedBill (shape UI đang dùng) =====
const TYPE_MAP: Record<TenantInvoiceType, InvoiceType> = {
  RENT: 'rent', SERVICE: 'rent', OTHER: 'rent', ELECTRICITY: 'electricity', WATER: 'water',
  MAINTENANCE: 'maintenance',
};

/**
 * Hoá đơn thu lúc nhận phòng nhận diện theo MÃ, không theo `type`.
 *
 * BE đổi `type` của nó từ `RENT` sang `OTHER` ngày 10/08/2026, nên đi theo `type` thì
 * hoá đơn cũ và mới rơi vào hai nhãn khác nhau. `OTHER` cũng còn dùng cho khoản khác
 * nên không thể quy hết `OTHER` thành tiền cọc. Mã `HD-ONBOARD-{contractId}` thì cả
 * hai đời đều giống nhau.
 */
const isOnboardCode = (code?: string) => !!code && code.startsWith('HD-ONBOARD-');
const STATUS_MAP: Record<TenantInvoiceStatus, BillStatus> = {
  PENDING: 'pending', PAID: 'paid', OVERDUE: 'overdue', PARTIAL: 'partial', CANCELLED: 'cancelled',
};
const METHOD_MAP: Record<string, BillPaymentMethod> = {
  QR: 'qr', BANK_TRANSFER: 'bank_transfer', CASH: 'cash', EWALLET: 'ewallet', OTHER: 'other',
};

/**
 * Phương thức thanh toán để hiển thị.
 *
 * BE đã sửa 13/08/2026 (`PaymentMethods.toPublic`, commit 898f96c): PayOS → `QR`, tiền
 * mặt → `CASH`, claim chuyển khoản → `BANK_TRANSFER`. Bản ghi MỚI về đúng ngay.
 *
 * NHƯNG `toPublic` chỉ viết lại đúng chuỗi `PAYOS`; bản ghi CŨ lưu thẳng `OTHER` thì đi
 * qua nguyên vẹn và ra màn hình thành chữ "Khác" — khách đọc xong không biết đã trả bằng
 * gì. Nên vẫn phải che cho dữ liệu cũ: hoá đơn onboard mà BE không nói rõ phương thức
 * thì chắc chắn là QR PayOS, vì đó là đường thu tiền DUY NHẤT lúc đón khách.
 *
 * Chỉ che khi thiếu/`OTHER`. BE ghi rõ `CASH`/`QR`/`BANK_TRANSFER` thì tôn trọng dữ liệu.
 * Khi nào BE backfill xong mấy dòng `OTHER` cũ thì xoá hàm này đi được.
 *
 * ⚠️ `type = OTHER` là LOẠI hoá đơn onboard, KHÔNG phải phương thức. Đừng bind `type`
 * vào chỗ "đã trả bằng gì" — đó là lỗi cũ.
 */
const resolveMethod = (inv: TenantInvoice): BillPaymentMethod | undefined => {
  const mapped = inv.paymentMethod ? METHOD_MAP[inv.paymentMethod] ?? 'other' : undefined;
  if (isOnboardCode(inv.code) && (mapped === undefined || mapped === 'other')) {
    return 'qr';
  }
  return mapped;
};

/** Trường tiền của BE có thể null/thiếu → về 0 thay vì để null lọt xuống màn hình. */
const money = (v: number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const toSharedBill = (inv: TenantInvoice): SharedBill => ({
  id: String(inv.id),
  code: inv.code,
  invoiceType: isOnboardCode(inv.code) ? 'deposit' : (TYPE_MAP[inv.type] ?? 'rent'),
  roomId: '',
  roomName: inv.roomNumber ? `Phòng ${inv.roomNumber}` : 'Nhà nguyên căn',
  propertyId: '',
  propertyName: inv.propertyName,
  tenantId: '',
  tenantName: '',
  tenantPhone: '',
  month: inv.month,
  year: inv.year,
  // Ép mọi trường TIỀN về số ngay tại cửa ngõ. `inv.items ?? []` cũ chỉ chắn được mảng
  // null, không chắn được phần tử có `amount: null` — mà BE trả đúng như vậy, làm màn
  // Lịch sử hoá đơn ngã trắng ở `formatCurrency(li.amount)` (13/08/2026).
  // Khai báo kiểu là `number` nhưng dữ liệu thật không đảm bảo, nên đừng tin kiểu.
  items: (inv.items ?? []).map(li => ({ ...li, amount: money(li.amount) })),
  totalAmount: money(inv.totalAmount),
  lateFee: money(inv.lateFee),
  grandTotal: money(inv.grandTotal),
  status: STATUS_MAP[inv.status] ?? 'pending',
  dueDate: inv.dueDate,
  createdAt: inv.createdAt,
  cycleType: inv.cycleType,
  paymentBreakdown: inv.paymentBreakdown,
  paidAt: inv.paidAt,
  paymentMethod: resolveMethod(inv),
  transactionId: inv.transactionId,
  kwhUsed: inv.kwhUsed,
  electricityRate: inv.electricityRate,
  m3Used: inv.m3Used,
  waterRate: inv.waterRate,
  billingPeriod: inv.billingPeriod,
  payosOrderCode: inv.payosOrderCode,
  payosCheckoutUrl: inv.payosCheckoutUrl,
  payosQrCode: inv.payosQrCode,
});
