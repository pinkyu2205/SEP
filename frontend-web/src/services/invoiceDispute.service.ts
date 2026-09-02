import api from './api';

/**
 * ADMIN PHÂN XỬ KHIẾU NẠI HOÁ ĐƠN ĐIỆN / NƯỚC.
 *
 * ─── Vì sao ADMIN chứ không phải quản lý ─────────────────────────────────────
 * Cùng lý do với `RefundDisputes` (khiếu nại hoàn cọc): khiếu nại chỉ số là lời tố
 * NHẮM VÀO chính người đã đọc đồng hồ — quản lý. Để quản lý tự bác lời tố nhắm vào
 * mình thì cơ chế đối chứng mất sạch ý nghĩa.
 *
 * Còn một lý do thực tế nữa: admin là vai DUY NHẤT huỷ được hoá đơn đã phát hành
 * (xem `mobile-app/src/constants/utilityCycle.ts` → `alreadySentReason`: "nếu số liệu
 * sai, nhờ admin huỷ hoá đơn cũ trước"). Cho quản lý quyền kết luận "khách đúng" mà
 * không có quyền thi hành kết luận đó thì khiếu nại vẫn treo nguyên.
 *
 * ─── Hai kiểu sai mà luồng này bắt ───────────────────────────────────────────
 *  • Nguyên căn  — admin chọn nhầm nhà lúc phát hành: khách nhận hoá đơn EVN của căn
 *    khác. `pages/admin/EvnBillPublishing.tsx` đã cảnh báo trước lúc gửi (đối chiếu
 *    địa chỉ trên ảnh OCR với địa chỉ nhà — xem `utils/billPropertyMatch.ts`), nhưng
 *    cảnh báo là CHẶN MỀM: admin bỏ qua được, nên vẫn cần đường hậu kiểm này.
 *  • Chia phòng  — quản lý đọc nhầm mặt đồng hồ (thiếu/thừa một chữ số).
 *
 * ⚠️ BE CHƯA CÓ các endpoint dưới đây (24/08/2026) — FE gọi sẵn theo hợp đồng kỳ vọng.
 * Xem doc-be/BE-NEED-khieu-nai-hoa-don-dien-nuoc-2026-08-24.md.
 *
 * ⚠️ `api` trả THẲNG body (interceptor trong api.ts đã `return response.data`) — đừng
 * destructure `{ data }`, làm vậy là bóc hai lớp rồi nhận `undefined`.
 */

const BASE = '/api/v1/admin/invoice-disputes';

export type InvoiceDisputeReason =
  | 'WRONG_PROPERTY' | 'WRONG_READING' | 'NO_EVIDENCE' | 'WRONG_PERIOD' | 'OTHER';

export type InvoiceDisputeStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

/** Nhãn tiếng Việt — phải khớp `mobile-app/src/types/invoiceDispute.ts`, sửa thì sửa cả hai. */
export const REASON_LABEL: Record<InvoiceDisputeReason, string> = {
  WRONG_PROPERTY: 'Không phải hoá đơn của nhà tôi',
  WRONG_READING: 'Chỉ số không khớp với ảnh',
  NO_EVIDENCE: 'Không có ảnh / ảnh không đọc được',
  WRONG_PERIOD: 'Sai kỳ tính tiền',
  OTHER: 'Lý do khác',
};

/** Việc admin phải làm đầu tiên với mỗi lý do — hiện thẳng trên thẻ để khỏi phải đoán. */
export const REASON_CHECK: Record<InvoiceDisputeReason, string> = {
  WRONG_PROPERTY: 'Soi ĐỊA CHỈ và mã khách hàng trên ảnh hoá đơn gốc, so với địa chỉ căn nhà.',
  WRONG_READING: 'Phóng to ảnh đồng hồ, đọc lại con số và so với chỉ số cuối kỳ đã ghi.',
  NO_EVIDENCE: 'Kiểm hoá đơn có ảnh không. Không có thì yêu cầu quản lý chụp bổ sung.',
  WRONG_PERIOD: 'Đối chiếu kỳ hoá đơn với ngày bắt đầu / kết thúc hợp đồng của khách.',
  OTHER: 'Đọc mô tả của khách rồi đối chiếu với ảnh và số liệu bên dưới.',
};

/**
 * Một khiếu nại kèm ĐỦ dữ liệu để phân xử ngay trên thẻ.
 *
 * Cố ý gộp hết vào một DTO thay vì bắt FE gọi thêm API lấy hoá đơn / lấy ảnh: admin
 * phải so ảnh của quản lý với ảnh của khách và hai con số chỉ số CÙNG LÚC. Bắt mở
 * ba màn khác nhau để ghép lại thì thực tế sẽ không ai đối chiếu, chỉ bấm bừa.
 */
export interface AdminInvoiceDispute {
  id: number;
  status: InvoiceDisputeStatus;
  reason: InvoiceDisputeReason;
  note?: string | null;
  /** Ảnh KHÁCH chụp để đối chứng. */
  photos?: string[];
  createdAt: string;

  // ── Hoá đơn bị khiếu nại ──
  invoiceId: number;
  invoiceCode: string;
  /** ELECTRICITY | WATER. */
  invoiceType: string;
  billingPeriod?: string | null;
  amount: number;
  /** Trạng thái hoá đơn lúc lấy danh sách — đã trả rồi thì cách bù khác (hoàn/trừ kỳ sau). */
  invoiceStatus?: string;

  // ── Nhà & khách ──
  propertyId: number;
  propertyName: string;
  propertyAddress?: string | null;
  /** true = nguyên căn → nghi ngờ admin phát hành nhầm nhà. */
  wholeHouse?: boolean;
  roomNumber?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  /** Quản lý phụ trách — người đã đọc đồng hồ, tức bên bị tố với nhà chia phòng. */
  managerName?: string | null;

  // ── Bằng chứng phía hệ thống ──
  prevReading?: number | null;
  newReading?: number | null;
  consumption?: number | null;
  unitPrice?: number | null;
  /** Ảnh đồng hồ (chia phòng) hoặc ảnh hoá đơn EVN gốc (nguyên căn). */
  meterImageUrl?: string | null;
  meterCapturedAt?: string | null;
  /** Ảnh hoá đơn tổng của cả nhà — chỉ có với nhà chia phòng. */
  utilityBillImageUrl?: string | null;
  billingAddress?: string | null;
  customerCode?: string | null;

  // ── Kết luận ──
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  resolutionNote?: string | null;
  replacementInvoiceCode?: string | null;
}

/**
 * `ACCEPTED` — khách đúng. BE **SỬA hoá đơn tại chỗ**, giữ nguyên mã (BE 01/09/2026).
 *
 * Trước đó BE huỷ hoá đơn rồi chờ admin phát hành một bản khác — khách có hai mã cho
 * một kỳ, và admin quên bước phát hành lại thì kỳ đó không còn hoá đơn nào.
 *
 * `REJECTED` — hoá đơn đúng. BE cho hạn thanh toán chạy lại, cộng thêm 3 ngày
 * (`DISPUTE_REJECT_GRACE_DAYS`) — khách không được phạt vì đã đi hỏi.
 */
export type InvoiceDisputeOutcome = 'ACCEPTED' | 'REJECTED';

/**
 * Số liệu đúng admin nhập khi kết luận ACCEPTED.
 *
 * ⚠️ BE chỉ áp dụng khi có ĐỦ `correctedNewReading` **và** `correctedUnitPrice`
 * (`InvoiceDisputeServiceImpl` ≈ dòng 167) — gửi thiếu một cái là nó bỏ qua lặng lẽ,
 * khiếu nại vẫn ACCEPTED mà số tiền không đổi. Nên FE gửi cả cụm hoặc không gửi gì.
 *
 * Không có `amount`: BE tự tính `(new − prev) × unitPrice`. Cho gõ tay thành tiền là mở
 * đường cho con số không khớp với chỉ số ngay cạnh nó — đúng loại mâu thuẫn mà khiếu
 * nại này sinh ra để sửa.
 */
export interface DisputeCorrection {
  correctedPrevReading: number;
  correctedNewReading: number;
  correctedUnitPrice: number;
}

export const invoiceDisputeService = {
  /**
   * GET /api/v1/admin/invoice-disputes
   *
   * Lấy TẤT CẢ rồi lọc ở FE (giống `RefundDisputes`): số khiếu nại hoá đơn trong một
   * hệ thống cỡ này đếm trên đầu ngón tay, và trang cần đếm cả tab "đã xử lý" để admin
   * tra lại lịch sử. Có nhiều thì thêm `?status=` sau.
   */
  list: async (): Promise<AdminInvoiceDispute[]> => {
    const data = await api.get<AdminInvoiceDispute[], AdminInvoiceDispute[]>(BASE);
    return data ?? [];
  },

  /**
   * POST /api/v1/admin/invoice-disputes/{id}/resolve
   *
   * `note` BẮT BUỘC và được gửi thẳng cho khách đọc — đây là quyết định về tiền của
   * người khác, phải giải trình được. Cùng quy ước với `checkoutAdmin.resolveDispute`.
   */
  resolve: (
    id: number,
    body: { outcome: InvoiceDisputeOutcome; note: string } & Partial<DisputeCorrection>,
  ): Promise<AdminInvoiceDispute> =>
    api.post(`${BASE}/${id}/resolve`, body),
};
