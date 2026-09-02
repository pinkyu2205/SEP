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
  /** BE trả sẵn — dùng để ghép hoá đơn về đúng hợp đồng (một phòng qua nhiều đời khách). */
  contractId?: number | null;
  month: number;
  year: number;
  /**
   * Tổng phải thu. BE MASK về `null` cho tài khoản MANAGER với hoá đơn tiền nhà
   * (`ManagerBillingServiceImpl`: `if (!isAdmin && type == RENT) setAmount(null)`).
   * Kiểu để `number` cho tương thích code cũ — nơi hiển thị phải tự chặn null, đừng
   * `fmt(amount)` thẳng vì `formatCurrency(null)` ra "0 đ", đọc thành thu 0 đồng.
   */
  amount: number;
  status: ManagerInvoiceStatus;
  dueDate: string;
  createdAt: string;
  // BE trả sẵn 3 field này khi hoá đơn đã thu. Từ 17/08/2026 sổ thu thật đã có endpoint
  // riêng (`listPaymentHistory`) nên đây chỉ còn là lưới an toàn cho hoá đơn không có
  // dòng nào trong `tenant_payments` — xem `fromPaidInvoice` ở PaymentHistoryScreen.
  paidAt?: string | null;
  paymentMethod?: string | null;
  transactionId?: string | null;
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
  /** Lúc hệ thống chuyển hoá đơn cho khách. */
  sentAt?: string | null;
  /**
   * Khách đã MỞ thông báo hoá đơn này chưa (BE 30/08/2026).
   *
   * `null` = KHÔNG BIẾT, không phải "chưa xem". BE suy từ cờ `read` của bản ghi thông báo
   * tra theo `dedupeKey = utility-invoice:{id}:created`; hoá đơn phát hành TRƯỚC khi BE
   * đặt khoá đó thì tra ra rỗng. Nơi hiển thị phải để "—" cho nhóm này, đừng gộp vào
   * "chưa xem" — báo sai là quản lý đi đôi co với khách bằng dữ liệu không có thật.
   */
  tenantViewed?: boolean | null;
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

/**
 * LỊCH SỬ THU THẬT — `tenant_payments`, không phải hàng chờ đối soát.
 *
 * BE mở endpoint này 17/08/2026 (doc/BE-NEED-manager-xem-lich-su-thu-tien). Khác
 * `/manager/payments` ở chỗ đó là bảng `tenant_payment_claims` — khách TỰ KHAI đã
 * chuyển, chờ manager duyệt; khách trả PayOS thành công thì webhook ghi thẳng
 * `tenant_payments` và KHÔNG sinh claim nào, nên càng trôi chảy màn đối soát càng trống.
 *
 * ⚠️ `amount` = null với hoá đơn tiền nhà / onboard (BE mask cho MANAGER, xem
 * @/constants/managerVisibility). Đừng bù 0 — "0 đ" đọc thành thu không đồng nào.
 */
export interface ManagerPaymentHistoryEntry {
  id: number;
  invoiceId: number;
  invoiceCode: string;
  /** RENT | ELECTRICITY | WATER | SERVICE | OTHER — BE trả sẵn, khỏi đoán theo mã. */
  invoiceType?: string | null;
  contractId?: number | null;
  tenantName?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  amount?: number | null;
  method?: string | null;
  paidAt?: string | null;
  transactionId?: string | null;
}

/** Mã QR do quản lý xin để nộp thay khách (tiền mặt / trả hộ). */
export interface ManagerPaymentQr {
  /** Số tiền phải chuyển — KHÔNG mask, xem chú thích ở `createPaymentQr`. */
  amount: number;
  /** Chuỗi EMVCo để vẽ QR (react-native-qrcode-svg). */
  qrCode: string;
  checkoutUrl?: string | null;
  orderCode?: number | null;
  /** Hạn của QR (BE: billing.manager-payment-qr.ttl-minutes, mặc định 15 phút). */
  expiresAt: string;
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

  /**
   * GET /api/v1/manager/invoices?period=&status=&type=&size=
   *
   * ⚠️ `size` BẮT BUỘC phải truyền. Endpoint trả `Page` của Spring, không truyền size là
   * dính mặc định **20 bản ghi**. Mọi màn dùng hàm này đều lọc lại phía client (theo nhà,
   * theo kỳ, theo khách) nên bị cắt ở 20 là mất dữ liệu một cách im lặng: mở "Hoá đơn tiền
   * nhà" của một nhà mà 20 hoá đơn đầu thuộc nhà khác thì màn hiện "Chưa có hóa đơn tiền
   * nhà" — trong khi hoá đơn có thật (gặp 18/08/2026 với nhà nguyên căn MTX#01).
   * Cùng lý do với `listPaymentHistory` bên dưới. Muốn lọc theo nhà ở BE thì cần endpoint
   * nhận `propertyId` — hiện chưa có.
   */
  listInvoices: async (params?: {
    period?: string; status?: string; type?: string; page?: number; size?: number;
  }): Promise<ManagerInvoice[]> => {
    const { data } = await realApiClient.get<SpringPage<ManagerInvoice> | ManagerInvoice[]>(
      '/api/v1/manager/invoices', { params: { size: 500, ...params } },
    );
    return unwrap(data);
  },

  // GET /api/v1/manager/payments?status=  (giao dịch thanh toán: chờ xác nhận / đã xác nhận)
  // `size` vì cùng lý do với listInvoices — mặc định 20 là cắt mất giao dịch cũ.
  listPayments: async (params?: { status?: string; page?: number; size?: number }): Promise<ManagerPayment[]> => {
    const { data } = await realApiClient.get<SpringPage<ManagerPayment> | ManagerPayment[]>(
      '/api/v1/manager/payments', { params: { size: 500, ...params } },
    );
    return unwrap(data);
  },

  /**
   * GET /api/v1/manager/payments/history — dòng tiền đã thu, mới nhất trước.
   * `size` để rộng vì màn Thu & Đối soát dựng dòng thời gian, không phân trang.
   */
  listPaymentHistory: async (params?: {
    propertyId?: number; contractId?: number;
    from?: string; to?: string; page?: number; size?: number;
  }): Promise<ManagerPaymentHistoryEntry[]> => {
    const { data } = await realApiClient.get<
      SpringPage<ManagerPaymentHistoryEntry> | ManagerPaymentHistoryEntry[]
    >('/api/v1/manager/payments/history', { params: { size: 200, ...params } });
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

  /**
   * POST /api/v1/manager/invoices/{id}/payment-qr — xin mã QR để NỘP THAY khách.
   *
   * Cần `unlockToken` lấy từ `managerInvoiceUnlockService.verifyPasscode` (mã của admin).
   * `payerName` BẮT BUỘC khi `purpose = PROXY_PAY`: người trả hộ phải có tên trong sổ,
   * không thì sau này không ai biết tiền vào từ đâu.
   *
   * ⚠️ `amount` trả về là số tiền THẬT của hoá đơn, KHÔNG mask — khác quy tắc ẩn tiền
   * ở @/constants/managerVisibility. Cố ý: quản lý là người bấm chuyển đúng số đó
   * (tiền mặt) hoặc đọc số cho người trả hộ. Không thấy số thì không làm được việc.
   */
  createPaymentQr: async (
    invoiceId: number | string,
    body: {
      unlockToken: string; purpose: 'CASH_COLLECT' | 'PROXY_PAY';
      payerName?: string; payerPhone?: string;
    },
  ): Promise<ManagerPaymentQr> => {
    const { data } = await realApiClient.post<ManagerPaymentQr>(
      `/api/v1/manager/invoices/${invoiceId}/payment-qr`, body,
    );
    return data;
  },

  /**
   * `markInvoicePaid` đã XOÁ 17/08/2026 — `POST /manager/invoices/{id}/mark-paid` KHÔNG
   * tồn tại trên BE (kiểm tra `ManagerBillingController`), mọi lần gọi đều 404. Nó từng
   * là chỗ "quản lý tự khai đã thu", nay thay bằng luồng thu hộ có passcode admin +
   * QR thật: `createPaymentQr` ở trên.
   */

};

// ─── Helper hiển thị hoá đơn — DÙNG CHUNG cho mọi màn của quản lý ────────────
//
// Đặt cạnh kiểu dữ liệu chứ không để mỗi màn tự chế: hai màn "Nhà nguyên căn" và
// "Sổ hoá đơn của khách" từng cùng in ra "0đ" và cùng gọi sai tên hoá đơn đón
// khách, vì mỗi bên tự viết lại một bản. Sửa một chỗ thì cả hai cùng đúng.

/**
 * Hoá đơn lúc đón khách là một PHONG BÌ gộp (tiền cọc + tiền nhà chu kỳ đầu),
 * không phải hoá đơn tiền nhà thường. Không tách ra thì màn hình ghi "Tiền nhà ·
 * T08" y hệt hoá đơn tháng 8 thật — đọc thành thu hai lần trong một tháng.
 */
export const isOnboardEnvelope = (inv: Pick<ManagerInvoice, 'code'>): boolean =>
  (inv.code || '').includes('ONBOARD');

/** Nhãn + icon theo loại, đã tách riêng hoá đơn đón khách. */
export const invoiceKind = (
  inv: Pick<ManagerInvoice, 'code' | 'type'>,
): { icon: string; label: string } => {
  if (isOnboardEnvelope(inv)) return { icon: '🔑', label: 'Cọc + tiền nhà kỳ đầu' };
  switch (inv.type) {
    case 'RENT':        return { icon: '🏠', label: 'Tiền nhà' };
    case 'ELECTRICITY': return { icon: '⚡', label: 'Tiền điện' };
    case 'WATER':       return { icon: '💧', label: 'Tiền nước' };
    case 'SERVICE':     return { icon: '🧾', label: 'Phí dịch vụ' };
    default:            return { icon: '📄', label: 'Khoản khác' };
  }
};

/**
 * Số tiền để hiển thị, hoặc `null` khi BỊ ẨN với quản lý.
 *
 * BE mask `amount` về `null` cho hoá đơn tiền nhà (`ManagerBillingServiceImpl`:
 * `if (!isAdmin && type == RENT) setAmount(null)`). Đưa thẳng vào một hàm format
 * kiểu `(n || 0).toLocaleString()` là in ra **"0đ"** — đọc thành "hoá đơn không
 * đồng", sai hẳn nghĩa và tệ hơn việc không hiện gì. Gọi hàm này rồi tự xử lý
 * nhánh `null` (xem `HIDDEN_AMOUNT_TEXT`).
 */
export const invoiceAmountText = (inv: Pick<ManagerInvoice, 'amount'>): string | null => {
  const v = inv.amount as number | null | undefined;
  return v == null ? null : v.toLocaleString('vi-VN') + 'đ';
};
