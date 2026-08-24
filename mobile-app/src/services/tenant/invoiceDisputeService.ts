import realApiClient from '@/services/core/realApiClient';
import type {
  InvoiceDispute, InvoiceDisputeReason,
} from '@/types/invoiceDispute';

/**
 * KHÁCH THUÊ KHIẾU NẠI HOÁ ĐƠN ĐIỆN / NƯỚC.
 *
 * Lấy người gửi từ JWT — KHÔNG truyền tenantId từ client. BE phải tự kiểm hoá đơn có
 * thuộc hợp đồng của người đang đăng nhập không, nếu không ai cũng khiếu nại hộ được.
 *
 * ⚠️ BE CHƯA CÓ các endpoint dưới đây (24/08/2026) — FE gọi sẵn theo hợp đồng kỳ vọng,
 * đúng cách `billingService.ts` và `evnBill.service.ts` đang làm. Xem
 * doc-be/BE-NEED-khieu-nai-hoa-don-dien-nuoc-2026-08-24.md.
 *
 * Nền tảng đã có sẵn, không phải dựng từ đầu:
 *   • Ảnh bằng chứng — BE đã BẮT BUỘC có ảnh công tơ mới cho phát hành hoá đơn
 *     (422 `METER_PHOTO_REQUIRED`, commit 731acad). Nghĩa là mọi hoá đơn điện/nước
 *     đều đã có ảnh trong DB; việc còn thiếu chỉ là TRẢ nó về cho khách thuê.
 *   • Mẫu luồng khiếu nại — `checkout-requests/{id}/settlement/dispute` +
 *     `resolve-refund-dispute` đã chạy; luồng này chỉ là bản sao cho hoá đơn.
 */

const BASE = '/api/v1/tenant/me/invoices';

export interface CreateDisputeBody {
  reason: InvoiceDisputeReason;
  note: string;
  /** URL Cloudinary — FE upload trước rồi gửi URL, giống `checkoutService`. */
  photos?: string[];
}

export const tenantInvoiceDisputeService = {
  /**
   * POST /api/v1/tenant/me/invoices/{id}/dispute
   *
   * BE phải làm 3 việc trong cùng transaction, thiếu việc nào cũng hỏng ý nghĩa:
   *   1. Ghi khiếu nại, gắn vào hoá đơn.
   *   2. **DỪNG ĐỒNG HỒ QUÁ HẠN** — không chuyển PENDING → OVERDUE, không cộng
   *      `lateFee` trong lúc đang tra soát. Khách đi hỏi mà bị phạt thì lần sau
   *      không ai hỏi nữa, và cái sai của admin thành cái nợ của khách.
   *   3. Thông báo ADMIN (người phân xử) + QUẢN LÝ nhà đó (người cần biết để chuẩn bị
   *      giải trình / đi chụp lại đồng hồ).
   *
   * Trả về hoá đơn kèm `dispute` đã tạo để màn hình vẽ lại ngay, không phải nạp lại.
   */
  create: async (
    invoiceId: number | string,
    body: CreateDisputeBody,
  ): Promise<InvoiceDispute> => {
    const { data } = await realApiClient.post<InvoiceDispute>(
      `${BASE}/${invoiceId}/dispute`, body,
    );
    return data;
  },

  /**
   * POST /api/v1/tenant/me/invoices/{id}/dispute/withdraw
   *
   * Khách xem kỹ lại ảnh rồi thấy mình nhầm. Phải có đường này, không thì khách đành
   * ngồi đợi admin bác một việc mà chính họ biết là không có gì — và hạn thanh toán
   * cứ treo ở đó.
   *
   * Rút xong: hạn thanh toán chạy lại, cộng thêm `DISPUTE_REJECT_GRACE_DAYS` ngày.
   */
  withdraw: async (invoiceId: number | string): Promise<InvoiceDispute> => {
    const { data } = await realApiClient.post<InvoiceDispute>(
      `${BASE}/${invoiceId}/dispute/withdraw`,
    );
    return data;
  },
};
