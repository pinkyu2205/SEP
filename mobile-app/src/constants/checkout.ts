/**
 * Luồng TRẢ PHÒNG (checkout) — nguồn sự thật duy nhất cho manager + tenant.
 *
 * Luồng chốt 03/08/2026 (xem docs/PLAN-checkout-flow-2026-08-03.md):
 *
 *   PENDING ──reject──► REJECTED          (tenant tự huỷ khi PENDING → CANCELLED)
 *      │ approve
 *   APPROVED         manager hẹn ngày kiểm tra
 *      │
 *   INSPECTING       chụp ảnh · đối chiếu thiết bị · chốt điện/nước · ghi hư hỏng
 *      │ manager chốt bảng tiền
 *   WAITING_TENANT   khách xem biên bản + bảng quyết toán
 *      │ đồng ý              └─ không đồng ý ─► DISPUTED ─► host xử lý ─► quay lại
 *   SETTLING         host/tài chính hoàn cọc · khách đóng thêm qua PayOS nếu còn nợ
 *                    (manager KHÔNG chuyển tiền — bỏ khỏi vai này 18/08/2026)
 *      │
 *   COMPLETED        BE terminate HĐ + giải phóng phòng/thiết bị
 *
 * Nguyên tắc:
 *   • Người đối trọng của manager là KHÁCH, không phải admin — admin không nằm trong luồng.
 *   • Số tiền quyết toán do BE tính, FE chỉ hiển thị.
 *   • **CỌC KHÔNG TRỪ NỢ.** Khách phải thanh toán ĐỦ mọi hoá đơn trước, cọc hoàn lại
 *     nguyên vẹn sau. Máy chủ chặn cứng: còn khoản nào chưa PAID thì lệnh ghi nhận hoàn
 *     cọc ném `CHARGES_NOT_SETTLED` ("Thu đủ rồi mới hoàn cọc được") — xem
 *     `CheckoutProcessServiceImpl` ≈ dòng 534.
 *     (Dòng cũ ở đây ghi "nợ hoá đơn trừ thẳng vào cọc" — đó là bản kế hoạch 03/08/2026,
 *     chính sách đã đổi sau đó mà chú thích chưa sửa theo. Sửa 02/09/2026.)
 *   • `complete` terminate hợp đồng NGAY nên chỉ mở khi đã quyết toán xong.
 */

export type CheckoutStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'INSPECTING'
  | 'WAITING_TENANT'
  | 'DISPUTED'
  | 'SETTLING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface CheckoutStatusMeta {
  label: string;
  /** Nhãn ngắn cho chip lọc/danh sách. */
  short: string;
  color: string;
  bg: string;
  /** Việc tiếp theo manager cần làm — hiện dưới thẻ để không phải đoán. */
  managerHint?: string;
  /**
   * Chuyện gì đang xảy ra, viết cho KHÁCH đọc.
   *
   * Khách không cần biết manager phải làm gì; họ cần biết **đang chờ ai** và **đã tới lượt
   * mình chưa**. Trước đây màn của khách mượn luôn `label` của trạng thái ("Đã duyệt — chờ
   * kiểm tra") — đúng nhưng không nói được điều gì sắp xảy đến với họ.
   */
  tenantHint?: string;
}

export const CHECKOUT_STATUS_META: Record<CheckoutStatus, CheckoutStatusMeta> = {
  PENDING: {
    label: 'Chờ duyệt', short: 'Chờ duyệt', color: '#D97706', bg: '#FFFBEB',
    managerHint: 'Duyệt hoặc từ chối yêu cầu của khách.',
    tenantHint: "Quản lý đang xem yêu cầu của bạn. Thường có phản hồi trong 1–2 ngày.",
  },
  APPROVED: {
    label: 'Đã duyệt — chờ kiểm tra', short: 'Đã duyệt', color: '#0891B2', bg: '#ECFEFF',
    managerHint: 'Đến ngày hẹn, tới phòng lập biên bản kiểm tra.',
    tenantHint: "Đã duyệt. Quản lý sẽ tới phòng kiểm tra vào ngày đã hẹn — bạn chưa cần làm gì thêm.",
  },
  INSPECTING: {
    label: 'Đang kiểm tra phòng', short: 'Kiểm tra', color: '#7C3AED', bg: '#F5F3FF',
    managerHint: 'Chụp ảnh, đối chiếu thiết bị, chốt điện/nước rồi gửi bảng quyết toán.',
    tenantHint: "Quản lý đang kiểm tra phòng và chốt chỉ số điện nước. Xong sẽ gửi bảng quyết toán cho bạn.",
  },
  WAITING_TENANT: {
    label: 'Chờ khách xác nhận', short: 'Chờ khách', color: '#2563EB', bg: '#EFF6FF',
    managerHint: 'Đã gửi bảng quyết toán — chờ khách đồng ý.',
    tenantHint: "Tới lượt bạn: xem bảng quyết toán rồi bấm Đồng ý, hoặc phản hồi nếu thấy chưa đúng.",
  },
  DISPUTED: {
    label: 'Khách không đồng ý', short: 'Tranh chấp', color: '#DC2626', bg: '#FEF2F2',
    managerHint: 'Khách phản đối — chủ nhà đã được báo. Sửa biên bản rồi gửi lại.',
    tenantHint: "Bạn đã phản hồi. Quản lý và chủ nhà đang xem lại và sẽ gửi bảng mới.",
  },
  SETTLING: {
    label: 'Đang quyết toán', short: 'Quyết toán', color: '#0D9488', bg: '#F0FDFA',
    // Manager KHÔNG hoàn cọc — chủ nhà/tài chính chuyển, xem CheckoutSettlementScreen.
    // Nhãn cũ ở đây ("Hoàn cọc cho khách... rồi mới hoàn tất") là sót lại từ trước
    // 18/08/2026, sai vai và mâu thuẫn với chính màn nó dẫn tới.
    managerHint: 'Chờ chủ nhà hoàn cọc — bấm hoàn tất để thanh lý hợp đồng.',
    tenantHint: "Đang hoàn tiền cọc cho bạn (hoặc chờ bạn đóng phần còn thiếu).",
  },
  COMPLETED: {
    label: 'Đã hoàn tất', short: 'Hoàn tất', color: '#059669', bg: '#ECFDF5',
    tenantHint: "Đã xong. Hợp đồng kết thúc và tiền cọc đã quyết toán.",
  },
  REJECTED: {
    label: 'Đã từ chối', short: 'Từ chối', color: '#DC2626', bg: '#FEF2F2',
    tenantHint: "Quản lý đã từ chối yêu cầu. Xem lý do rồi gửi lại nếu cần.",
  },
  CANCELLED: {
    label: 'Khách đã huỷ', short: 'Đã huỷ', color: '#64748B', bg: '#F1F5F9',
    tenantHint: "Bạn đã huỷ yêu cầu này. Có thể gửi yêu cầu mới bất cứ lúc nào.",
  },
};

export const CHECKOUT_FALLBACK_META: CheckoutStatusMeta = {
  label: 'Không rõ', short: 'Không rõ', color: '#64748B', bg: '#F1F5F9',
};

export const checkoutMeta = (status?: string): CheckoutStatusMeta =>
  CHECKOUT_STATUS_META[(status || '').toUpperCase() as CheckoutStatus] ?? CHECKOUT_FALLBACK_META;

/** Thứ tự tiến trình để vẽ thanh bước (các trạng thái phụ không nằm trong đây). */
export const CHECKOUT_FLOW: CheckoutStatus[] = [
  'PENDING', 'APPROVED', 'INSPECTING', 'WAITING_TENANT', 'SETTLING', 'COMPLETED',
];

/** Vị trí trong CHECKOUT_FLOW; trạng thái phụ (REJECTED/CANCELLED/DISPUTED) = -1. */
export const checkoutStep = (status?: string): number =>
  CHECKOUT_FLOW.indexOf((status || '').toUpperCase() as CheckoutStatus);

/** Hồ sơ đã đóng — không còn thao tác nào. */
export const isCheckoutClosed = (status?: string) =>
  ['COMPLETED', 'REJECTED', 'CANCELLED'].includes((status || '').toUpperCase());

/**
 * Số ngày khách im lặng ở WAITING_TENANT thì BE tự coi như đồng ý.
 * Không có mốc này thì hồ sơ treo vĩnh viễn, phòng không cho thuê lại được.
 * (BE nhắc khách ở ngày 3 và ngày 6 — xem doc.)
 */
export const CHECKOUT_AUTO_ACCEPT_DAYS = 7;

