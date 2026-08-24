/**
 * KHIẾU NẠI HOÁ ĐƠN ĐIỆN / NƯỚC — kiểu dùng chung cho app khách thuê.
 *
 * ─── Vì sao có ───────────────────────────────────────────────────────────────
 * Hoá đơn điện/nước là loại hoá đơn DUY NHẤT khách không tự kiểm chứng được bằng
 * hợp đồng: tiền nhà thì có số trong hợp đồng để đối chiếu, còn tiền điện phụ thuộc
 * vào một tờ giấy EVN do admin tải lên (nguyên căn) hoặc một con số do quản lý đọc
 * từ mặt đồng hồ (chia phòng). Khách chỉ nhận được kết quả cuối cùng.
 *
 * Hai kiểu sai có thật:
 *   • Nguyên căn — admin chọn nhầm nhà lúc phát hành, khách nhận hoá đơn EVN của
 *     căn khác. Nhìn ảnh hoá đơn gốc là thấy ngay sai địa chỉ.
 *   • Chia phòng — quản lý đọc nhầm mặt đồng hồ (7 thành 1, thiếu/thừa một chữ số).
 *     Nhìn ảnh đồng hồ là đối chiếu được với chỉ số đã ghi.
 *
 * Nên trình tự đúng là: BÀY BẰNG CHỨNG ra trước (ảnh + chỉ số cũ/mới), rồi mới mở
 * đường khiếu nại. Không có ảnh thì khách chỉ khiếu nại theo cảm tính ("sao tháng
 * này cao thế"), người xử lý cũng không có gì để đối chứng.
 *
 * ─── Ai phân xử ──────────────────────────────────────────────────────────────
 * ADMIN, không phải quản lý — cùng lý do với `pages/admin/RefundDisputes.tsx` bên
 * web: khiếu nại chỉ số là lời tố NHẮM VÀO người đã đọc đồng hồ (quản lý). Để quản
 * lý tự bác lời tố nhắm vào mình thì cơ chế đối chứng mất sạch ý nghĩa. Admin cũng
 * là vai duy nhất huỷ được hoá đơn đã phát hành (xem `constants/utilityCycle.ts`
 * → `alreadySentReason`), tức là vai duy nhất thi hành được kết luận "khách đúng".
 */

/** Lý do khiếu nại — chọn từ danh sách để người xử lý biết ngay phải kiểm cái gì. */
export type InvoiceDisputeReason =
  /** Hoá đơn của nhà/phòng khác — địa chỉ, mã khách hàng trên ảnh không phải của tôi. */
  | 'WRONG_PROPERTY'
  /** Chỉ số trên ảnh không khớp với chỉ số đã dùng để tính tiền. */
  | 'WRONG_READING'
  /** Không có ảnh, hoặc ảnh mờ/không đọc được số. */
  | 'NO_EVIDENCE'
  /** Sai kỳ — kỳ này tôi chưa ở, hoặc kỳ này tôi đã trả rồi. */
  | 'WRONG_PERIOD'
  | 'OTHER';

/**
 * Mỗi lý do kèm một câu gợi ý viết gì.
 *
 * Có placeholder riêng cho từng lý do vì lời khai chung chung ("tiền cao quá") không
 * dùng được: admin cầm nó lên không biết phải mở ảnh nào ra đối chiếu.
 */
export const DISPUTE_REASONS: Array<{
  code: InvoiceDisputeReason;
  icon: string;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    code: 'WRONG_PROPERTY',
    icon: '🏠',
    label: 'Không phải hoá đơn của nhà tôi',
    hint: 'Địa chỉ hoặc mã khách hàng in trên ảnh hoá đơn không phải nơi tôi đang thuê.',
    placeholder: 'VD: Ảnh hoá đơn ghi địa chỉ 45 Lê Lợi, nhưng tôi thuê ở 128 Trần Hưng Đạo.',
  },
  {
    code: 'WRONG_READING',
    icon: '🔢',
    label: 'Chỉ số không khớp với ảnh',
    hint: 'Số trên mặt đồng hồ trong ảnh khác với chỉ số hệ thống dùng để tính tiền.',
    placeholder: 'VD: Ảnh đồng hồ đọc được 1250 nhưng hoá đơn ghi chỉ số mới là 1750.',
  },
  {
    code: 'NO_EVIDENCE',
    icon: '📷',
    label: 'Không có ảnh / ảnh không đọc được',
    hint: 'Hoá đơn không đính ảnh, hoặc ảnh quá mờ để kiểm chứng.',
    placeholder: 'VD: Hoá đơn không có ảnh đồng hồ nên tôi không kiểm tra được chỉ số.',
  },
  {
    code: 'WRONG_PERIOD',
    icon: '📅',
    label: 'Sai kỳ tính tiền',
    hint: 'Kỳ này tôi chưa dọn vào, đã dọn đi, hoặc đã trả tiền kỳ này rồi.',
    placeholder: 'VD: Tôi nhận phòng ngày 20/08 nhưng hoá đơn tính từ 01/08.',
  },
  {
    code: 'OTHER',
    icon: '✏️',
    label: 'Lý do khác',
    hint: 'Mô tả cụ thể điểm bạn thấy chưa đúng.',
    placeholder: 'VD: Số tiền không bằng số kWh nhân đơn giá ghi trên hoá đơn.',
  },
];

export const disputeReasonLabel = (code?: InvoiceDisputeReason | null): string =>
  DISPUTE_REASONS.find(r => r.code === code)?.label ?? 'Lý do khác';

export type InvoiceDisputeStatus =
  /** Khách đã gửi, admin chưa kết luận. */
  | 'OPEN'
  /** Admin công nhận khách đúng — hoá đơn bị huỷ, sẽ phát hành lại bản đúng. */
  | 'ACCEPTED'
  /** Admin bác — hoá đơn giữ nguyên, kèm căn cứ. */
  | 'REJECTED'
  /** Khách tự rút lại (đã xem kỹ ảnh và thấy mình nhầm). */
  | 'WITHDRAWN';

export interface InvoiceDispute {
  id: number;
  invoiceId: number;
  status: InvoiceDisputeStatus;
  reason: InvoiceDisputeReason;
  /** Lời khách viết. */
  note?: string | null;
  /** Ảnh khách chụp để đối chứng (vd chụp lại mặt đồng hồ). */
  photos?: string[];
  createdAt: string;
  /** Kết luận của admin — có khi status ≠ OPEN. */
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  /** Căn cứ kết luận, hiện thẳng cho khách đọc. */
  resolutionNote?: string | null;
  /** Hoá đơn phát hành lại sau khi chấp nhận khiếu nại (nếu đã có). */
  replacementInvoiceCode?: string | null;
}

/** Đang treo — chưa ai kết luận. Đây là trạng thái khoá mọi nút gửi khiếu nại mới. */
export const isDisputeOpen = (d?: InvoiceDispute | null): boolean => d?.status === 'OPEN';

/** BE bắt tối thiểu 10 ký tự, giống khiếu nại hoàn cọc — cho khách thấy trước khi bấm gửi. */
export const DISPUTE_MIN_NOTE = 10;
export const DISPUTE_MAX_NOTE = 500;
export const DISPUTE_MAX_PHOTOS = 3;

/**
 * Số ngày gia hạn sau khi khiếu nại BỊ BÁC.
 *
 * Trong lúc tra soát, hạn thanh toán ngừng chạy (xem `dispute` trong luồng BE). Bác
 * xong mà cho hạn cũ có hiệu lực lại ngay thì khách có thể thành quá hạn tại chính
 * thời điểm nhận tin — bị phạt vì đã đi hỏi. Cho thêm vài ngày để trả.
 */
export const DISPUTE_REJECT_GRACE_DAYS = 3;

/**
 * Hoá đơn này có mở đường khiếu nại không.
 *
 * CHỈ điện/nước: các loại khác (tiền nhà, cọc, bảo trì) đã có đường phản hồi riêng —
 * tiền nhà đối chiếu hợp đồng, bảo trì có bước Đồng ý/Khiếu nại trên phiếu, cọc có
 * luồng quyết toán. Thêm nút ở đây chỉ làm khách gửi nhầm cửa.
 *
 * Hoá đơn ĐÃ HUỶ thì thôi — không còn gì để cãi. Hoá đơn ĐÃ TRẢ thì VẪN cho khiếu
 * nại: sai vẫn là sai, và cách bù là hoàn/trừ vào kỳ sau. Chặn ở đây hoá ra dạy khách
 * đừng trả tiền trước khi soi kỹ.
 *
 * ─── Mỗi hoá đơn chỉ khiếu nại được MỘT LẦN ──────────────────────────────────
 * Khiếu nại làm hạn thanh toán ngừng chạy. Cho gửi lại sau khi bị bác thì có một
 * đường né tiền vô hạn: gửi → bị bác → gửi tiếp → lại dừng hạn. Nên `REJECTED` cũng
 * khoá nút luôn; muốn cãi tiếp thì liên hệ trực tiếp, không đi qua cơ chế tự động.
 *
 * `WITHDRAWN` thì KHÔNG khoá: khách tự xem lại ảnh rồi rút vì thấy mình nhầm là hành
 * vi trung thực, không có lý do gì để phạt bằng cách tước quyền khiếu nại. Rút xong
 * mà phát hiện thêm chuyện khác thì vẫn phải gửi lại được.
 */
export const canDisputeInvoice = (
  invoiceType: string,
  status: string,
  existing?: InvoiceDispute | null,
): boolean =>
  (invoiceType === 'electricity' || invoiceType === 'water')
  && status !== 'cancelled'
  && (!existing || existing.status === 'WITHDRAWN');
