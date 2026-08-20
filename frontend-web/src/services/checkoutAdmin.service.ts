import api from './api';

/**
 * Admin xử lý khiếu nại hoàn cọc + cấn trừ cọc bắt buộc.
 *
 * Vì sao ADMIN chứ không phải host: cả hai thao tác đều nhắm vào chính host —
 * bác khiếu nại là bác lời tố "chưa nhận được tiền" của khách nhắm vào host, còn cấn trừ cọc
 * thì host là bên hưởng lợi. Không để một bên tự phân xử việc của mình.
 * BE gác bằng `@PreAuthorize("hasRole('ADMIN')")`.
 */

/** Một khoản phí cuối kỳ trong bảng quyết toán. */
export interface CheckoutChargeItem {
  id: number;
  code?: string;
  /** ELECTRICITY | WATER | COMPENSATION | ... */
  type?: string;
  amount: number;
}

export interface CheckoutSettlement {
  finalCharges?: CheckoutChargeItem[];
  chargesTotal?: number;
  chargesPaid?: number;
  chargesSettled?: boolean;
  depositAmount?: number;
  refundDueDate?: string;
  /** Host ghi nhận đã chuyển lúc nào. */
  refundPaidAt?: string;
  refundProofUrl?: string;
  /** Khách xác nhận đã nhận đủ. */
  refundConfirmedAt?: string;
  /** Khách báo chưa nhận được tiền. */
  refundDisputedAt?: string;
  refundDisputeReason?: string;
  /**
   * Admin đã kết luận khiếu nại lúc nào. BE CỐ Ý không xoá `refundDisputedAt` (giữ lịch sử
   * đã từng tranh chấp), nên phải dựa vào cờ này để biết khiếu nại còn mở hay đã đóng.
   */
  refundDisputeResolvedAt?: string;
  /** RETRANSFERRED = đã chuyển lại · REJECTED = bác khiếu nại. */
  refundDisputeOutcome?: DisputeOutcome;
}

export interface AdminCheckoutRequest {
  id: number;
  contractId: number;
  contractCode?: string;
  propertyName?: string;
  roomNumber?: string;
  tenantFullName?: string;
  tenantPhone?: string;
  status: string;
  expectedMoveOutDate?: string;
  /** Tài khoản khách khai khi gửi yêu cầu — để đối chiếu với biên lai host tải lên. */
  refundBankName?: string;
  refundBankAccount?: string;
  refundAccountHolder?: string;
  settlement?: CheckoutSettlement;
}

export type DisputeOutcome = 'RETRANSFERRED' | 'REJECTED';

export const checkoutAdminService = {
  /**
   * Toàn bộ hồ sơ trả phòng. BE chưa có bộ lọc theo khiếu nại nên lọc ở FE.
   *
   * ⚠️ `api` ở đây trả THẲNG body (interceptor trong api.ts đã `return response.data`),
   * KHÔNG phải cả axios response. Nên gọi trực tiếp, đừng destructure `{ data }` — làm vậy
   * là bóc hai lớp, nhận `undefined` rồi rơi vào `?? []` và màn hình trắng trơn như thể
   * không có dữ liệu.
   */
  list: async (): Promise<AdminCheckoutRequest[]> => {
    const data = await api.get<AdminCheckoutRequest[], AdminCheckoutRequest[]>(
      '/api/v1/checkout-requests',
    );
    return data ?? [];
  },

  /**
   * Kết luận khiếu nại.
   *
   * `RETRANSFERRED` — đã chuyển lại/chuyển bù: BE xoá cờ khiếu nại và đặt `refundPaidAt` mới,
   * hồ sơ quay về **chờ khách xác nhận**. Khách vẫn phải tự bấm xác nhận, admin không thay được.
   *
   * `REJECTED` — có sao kê chứng minh tiền đã tới đúng tài khoản. BE giữ nguyên lịch sử khiếu
   * nại (không null-hoá) và **không** tự đánh dấu khách đã nhận.
   */
  resolveDispute: (id: number, body: { outcome: DisputeOutcome; note: string }) =>
    api.post(`/api/v1/checkout-requests/${id}/resolve-refund-dispute`, body),

  /** Cấn trừ cọc vào phí cuối kỳ khi khách bỏ đi không thanh toán. BE chặn nếu chưa quá 30 ngày. */
  forceSettle: (id: number, body: { deductFromDeposit: true; reason: string }) =>
    api.post(`/api/v1/checkout-requests/${id}/force-settle`, body),
};
