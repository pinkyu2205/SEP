import realApiClient from './realApiClient';

/**
 * Manager tạo & gửi hoá đơn cho tenant (nối backend Spring THẬT).
 * - Điện/Nước: BE đã có `POST /properties/{id}[/rooms/{roomId}]/utility-invoices`.
 * - Tiền nhà (RENT): BE CHƯA có endpoint riêng → FE gọi sẵn theo hợp đồng kỳ vọng,
 *   xem doc/BE-TODO-rent-invoice-2026-06-29.md.
 */

export interface CreateUtilityInvoiceBody {
  type: 'ELECTRICITY' | 'WATER';
  billingPeriod: string;       // "01/05 – 31/05/2026"
  prevReading: number;
  newReading: number;
  consumption: number;
  unitPrice: number;
  amount: number;
  meterImageUrl?: string;
}

export interface CreateRentInvoiceBody {
  contractId?: number;         // HĐ tenant (nếu có)
  billingMonth: string;        // "2026-06"
  amount: number;              // tiền nhà/phòng tháng này
  dueDate: string;             // yyyy-MM-dd (theo ngày bắt đầu HĐ)
  note?: string;
}

// HĐ tiền nhà đã tạo (rút gọn) — để FE biết phòng nào đã gửi trong kỳ.
export interface RentInvoiceLite {
  id?: number;
  contractId?: number;
  roomNumber?: string | null;
  billingMonth?: string;
  amount?: number;
  status?: string;
}

// ===== Đọc tổng hợp cho màn "Hóa đơn & Thanh toán" của manager =====
// ⚠️ BE CHƯA có các endpoint tổng hợp/xác nhận thanh toán này → FE gọi sẵn (xem doc).
export type ManagerInvoiceType = 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'OTHER';
export type ManagerInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL' | 'CANCELLED';

export interface ManagerInvoice {
  id: number;
  code: string;
  type: ManagerInvoiceType;
  propertyId: number;
  propertyName: string;
  roomNumber?: string | null;
  tenantName?: string;
  month: number;
  year: number;
  amount: number;          // tổng phải thu
  status: ManagerInvoiceStatus;
  dueDate: string;
  createdAt: string;
}

export type ManagerPaymentStatus = 'PENDING_VERIFY' | 'VERIFIED' | 'REJECTED';
export interface ManagerPayment {
  id: number;
  invoiceCode: string;
  tenantName: string;
  roomNumber?: string | null;
  propertyName: string;
  amount: number;
  method: string;          // QR | BANK_TRANSFER | CASH | EWALLET | OTHER
  status: ManagerPaymentStatus;
  transferContent?: string;
  createdAt: string;
  verifiedAt?: string;
}

interface SpringPage<T> { content: T[]; }
const unwrap = <T,>(d: SpringPage<T> | T[] | null | undefined): T[] =>
  Array.isArray(d) ? d : d?.content ?? [];

export const realManagerInvoiceService = {
  // ===== Điện / Nước (BE đã có) =====
  createRoomUtilityInvoice: async (propertyId: number, roomId: number, body: CreateUtilityInvoiceBody) => {
    const { data } = await realApiClient.post(
      `/api/v1/properties/${propertyId}/rooms/${roomId}/utility-invoices`, body,
    );
    return data;
  },
  createPropertyUtilityInvoice: async (propertyId: number, body: CreateUtilityInvoiceBody) => {
    const { data } = await realApiClient.post(
      `/api/v1/properties/${propertyId}/utility-invoices`, body,
    );
    return data;
  },

  // ===== Tiền nhà / phòng (BE TODO — FE gọi sẵn) =====
  createRoomRentInvoice: async (propertyId: number, roomId: number, body: CreateRentInvoiceBody) => {
    const { data } = await realApiClient.post(
      `/api/v1/properties/${propertyId}/rooms/${roomId}/rent-invoices`, body,
    );
    return data;
  },
  createPropertyRentInvoice: async (propertyId: number, body: CreateRentInvoiceBody) => {
    const { data } = await realApiClient.post(
      `/api/v1/properties/${propertyId}/rent-invoices`, body,
    );
    return data;
  },

  // GET /api/v1/properties/{propertyId}/rent-invoices?month=2026-06
  // Trả các HĐ tiền nhà ĐÃ tạo của 1 nhà trong tháng -> để biết HĐ nào đã gửi (BE TODO).
  listRentInvoices: async (propertyId: number, month: string): Promise<RentInvoiceLite[]> => {
    const { data } = await realApiClient.get<SpringPage<RentInvoiceLite> | RentInvoiceLite[]>(
      `/api/v1/properties/${propertyId}/rent-invoices`, { params: { month } },
    );
    return unwrap(data);
  },

  // ===== Tổng hợp hoá đơn của manager (BE TODO) =====
  // GET /api/v1/manager/invoices?period=&status=&type=
  listInvoices: async (params?: { period?: string; status?: string; type?: string }): Promise<ManagerInvoice[]> => {
    const { data } = await realApiClient.get<SpringPage<ManagerInvoice> | ManagerInvoice[]>(
      '/api/v1/manager/invoices', { params },
    );
    return unwrap(data);
  },

  // GET /api/v1/manager/payments?status=  (giao dịch thanh toán: chờ xác nhận / đã xác nhận)
  listPayments: async (params?: { status?: string }): Promise<ManagerPayment[]> => {
    const { data } = await realApiClient.get<SpringPage<ManagerPayment> | ManagerPayment[]>(
      '/api/v1/manager/payments', { params },
    );
    return unwrap(data);
  },

  // POST /api/v1/manager/payments/{id}/verify  — xác nhận đã nhận tiền
  verifyPayment: async (id: number | string): Promise<void> => {
    await realApiClient.post(`/api/v1/manager/payments/${id}/verify`);
  },

  // POST /api/v1/manager/payments/{id}/reject  — từ chối giao dịch
  rejectPayment: async (id: number | string, reason?: string): Promise<void> => {
    await realApiClient.post(`/api/v1/manager/payments/${id}/reject`, { reason });
  },
};
