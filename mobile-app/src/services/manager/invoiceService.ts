import realApiClient from '@/services/core/realApiClient';

/**
 * Manager tạo & gửi hoá đơn cho tenant (nối backend Spring THẬT).
 * - Điện/Nước: BE đã có `POST /properties/{id}[/rooms/{roomId}]/utility-invoices`.
 *   Vẫn GỬI TAY (manager ghi chỉ số rồi phát hành).
 * - Tiền nhà (RENT): TỰ ĐỘNG. BE phát hành ngày 1 hằng tháng cho mọi HĐ ACTIVE,
 *   hạn nộp ngày 5 (xem @/constants/rentCycle + docs/BE-HANDOFF-rent-auto-billing-2026-08-03.md).
 *   Các endpoint create*RentInvoice bên dưới chỉ còn dùng khi manager GỬI TAY cho
 *   HĐ bị sót, trong cửa sổ ngày 1–5 (HĐ mới ký, hoặc job BE lỗi/chưa chạy).
 *   ⚠️ BE CHƯA có các endpoint rent-invoices → FE gọi sẵn theo hợp đồng kỳ vọng.
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
  dueDate: string;             // yyyy-MM-dd (cố định ngày 5 — xem RENT_CYCLE.dueDay)
  note?: string;
}

// HĐ tiền nhà đã phát hành trong kỳ (rút gọn) — FE dùng để biết HĐ nào đã có hoá đơn,
// hoá đơn nào quá hạn, và hoá đơn nào do job tự chạy vs manager gửi tay.
export interface RentInvoiceLite {
  id?: number;
  contractId?: number;
  roomNumber?: string | null;
  billingMonth?: string;
  amount?: number;
  status?: string;             // PENDING | PAID | OVERDUE | PARTIAL | CANCELLED
  dueDate?: string;            // yyyy-MM-dd
  issuedAt?: string;           // thời điểm phát hành
  /** true = job tự động phát hành; false/undefined = manager gửi tay. */
  autoIssued?: boolean;
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

/**
 * Hoá đơn điện/nước ĐÃ phát hành (BE: GET /api/v1/manager/utility-invoices).
 * Quan trọng: có `newReading` của từng kỳ → dùng làm CHỈ SỐ CŨ cho kỳ kế tiếp
 * (kỳ 1 mới lấy mốc lúc đón khách, kỳ 2 lấy số cuối kỳ 1, kỳ 3 lấy số cuối kỳ 2...).
 */
export interface UtilityInvoiceLite {
  id: number;
  propertyId?: number;
  roomId?: number | null;
  roomNumber?: string | null;
  type?: string;              // ELECTRICITY | WATER (BE map từ UtilityType)
  billingPeriod?: string;
  prevReading?: number;
  newReading?: number;
  consumption?: number;
  amount?: number;
  status?: string;
  createdAt?: string;
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

  // ===== Tiền nhà / phòng — MANAGER GỬI TAY (BE TODO — FE gọi sẵn) =====
  // Luồng chính là job tự động ngày 1. Hai hàm dưới chỉ dùng khi manager bấm
  // "Gửi tiền nhà" cho HĐ bị sót, trong cửa sổ ngày 1–5. BE phải IDEMPOTENT theo
  // (contractId, billingMonth): đã có hoá đơn kỳ đó thì trả 409, không tạo trùng.
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

  /**
   * Hoá đơn điện/nước đã phát hành của 1 nhà.
   * Bỏ trống `period` = lấy toàn bộ lịch sử — cần thế để tìm kỳ gần nhất của mỗi phòng
   * làm chỉ số cũ cho kỳ đang chốt.
   */
  listUtilityInvoices: async (
    propertyId: number,
    params?: { period?: string; type?: 'ELECTRICITY' | 'WATER' },
  ): Promise<UtilityInvoiceLite[]> => {
    const { data } = await realApiClient.get<{ items?: UtilityInvoiceLite[] }>(
      '/api/v1/manager/utility-invoices',
      { params: { propertyId, ...params } },
    );
    return data?.items ?? [];
  },

  // GET /api/v1/properties/{propertyId}/rent-invoices?month=2026-06
  // Trả các HĐ tiền nhà ĐÃ tạo của 1 nhà trong tháng -> để biết HĐ nào đã gửi (BE TODO).
  listRentInvoices: async (propertyId: number, month: string): Promise<RentInvoiceLite[]> => {
    const { data } = await realApiClient.get<SpringPage<RentInvoiceLite> | RentInvoiceLite[]>(
      `/api/v1/properties/${propertyId}/rent-invoices`, { params: { month } },
    );
    return unwrap(data);
  },

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

  // POST /api/v1/manager/invoices/{id}/mark-paid  — manager tự ghi nhận đã thu (tiền mặt/CK tay)
  // method: CASH | BANK_TRANSFER | QR | EWALLET | OTHER. (BE TODO — FE gọi sẵn)
  markInvoicePaid: async (id: number | string, body: { method: string; note?: string }) => {
    const { data } = await realApiClient.post(`/api/v1/manager/invoices/${id}/mark-paid`, body);
    return data;
  },
};
