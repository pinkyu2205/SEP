import realApiClient from '@/services/core/realApiClient';
import type { SharedBill, BillStatus, InvoiceType, BillPaymentMethod } from '@/store/billsStore';

/**
 * Hoá đơn & thanh toán của CHÍNH tenant đang đăng nhập (nối backend Spring THẬT).
 * Lấy user từ JWT — KHÔNG truyền id từ client.
 *
 * ⚠️ BE CHƯA có các endpoint này (2026-06-29) — FE gọi sẵn theo hợp đồng kỳ vọng,
 * xem doc/BE-TODO-tenant-portal-2026-06-29.md. Khi BE làm xong là chạy ngay, không sửa FE.
 */

export type TenantInvoiceType = 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'OTHER';
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
};

// ===== Mappers: TenantInvoice (BE) -> SharedBill (shape UI đang dùng) =====
const TYPE_MAP: Record<TenantInvoiceType, InvoiceType> = {
  RENT: 'rent', SERVICE: 'rent', OTHER: 'rent', ELECTRICITY: 'electricity', WATER: 'water',
};
const STATUS_MAP: Record<TenantInvoiceStatus, BillStatus> = {
  PENDING: 'pending', PAID: 'paid', OVERDUE: 'overdue', PARTIAL: 'partial', CANCELLED: 'cancelled',
};
const METHOD_MAP: Record<string, BillPaymentMethod> = {
  QR: 'qr', BANK_TRANSFER: 'bank_transfer', CASH: 'cash', EWALLET: 'ewallet', OTHER: 'other',
};

export const toSharedBill = (inv: TenantInvoice): SharedBill => ({
  id: String(inv.id),
  code: inv.code,
  invoiceType: TYPE_MAP[inv.type] ?? 'rent',
  roomId: '',
  roomName: inv.roomNumber ? `Phòng ${inv.roomNumber}` : 'Nhà nguyên căn',
  propertyId: '',
  propertyName: inv.propertyName,
  tenantId: '',
  tenantName: '',
  tenantPhone: '',
  month: inv.month,
  year: inv.year,
  items: inv.items ?? [],
  totalAmount: inv.totalAmount,
  lateFee: inv.lateFee ?? 0,
  grandTotal: inv.grandTotal,
  status: STATUS_MAP[inv.status] ?? 'pending',
  dueDate: inv.dueDate,
  createdAt: inv.createdAt,
  paidAt: inv.paidAt,
  paymentMethod: inv.paymentMethod ? METHOD_MAP[inv.paymentMethod] ?? 'other' : undefined,
  transactionId: inv.transactionId,
  kwhUsed: inv.kwhUsed,
  electricityRate: inv.electricityRate,
  m3Used: inv.m3Used,
  waterRate: inv.waterRate,
  billingPeriod: inv.billingPeriod,
});
