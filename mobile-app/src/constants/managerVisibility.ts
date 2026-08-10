/**
 * QUYỀN XEM SỐ TIỀN CỦA MANAGER — chốt 07/08/2026.
 *
 * Manager KHÔNG được biết app thu của khách bao nhiêu tiền thuê/cọc một tháng.
 * Việc của manager với tiền phòng chỉ còn là: khách ĐÃ hay CHƯA thanh toán hoá đơn
 * tiền phòng của kỳ đó. Vì vậy mọi màn quản lý chỉ hiện SỐ ĐẾM và TRẠNG THÁI, không
 * hiện số tiền, không hiện tổng phải thu, không hiện % theo tiền.
 *
 * VẪN HIỆN (không nằm trong phạm vi ẩn):
 *   • Tiền điện/nước — manager tự ghi chỉ số rồi phát hành hoá đơn, không thấy thành
 *     tiền thì không làm được việc.
 *   • Chi phí bảo trì, giá thiết bị, quyết toán trả phòng — đó là khoản manager duyệt chi.
 *
 * Đây là quy tắc HIỂN THỊ ở FE. BE vẫn trả `amount` trong ManagerInvoiceResponse và
 * `rentAmount`/`deposit` trong TenantContractResponse — muốn chặn tận gốc thì BE phải
 * bỏ field theo role, xem docs/BE-NEED-hide-rent-amount-from-manager-2026-08-07.md.
 */

/** Câu giải thích dùng chung khi cần nói cho manager biết vì sao không thấy số tiền. */
export const RENT_AMOUNT_HIDDEN_NOTE =
  'Số tiền thuê do hệ thống quản lý và thu trực tiếp của khách. Bạn chỉ cần theo dõi khách đã thanh toán hay chưa.';

/** Nhãn ngắn gắn cạnh các khối thống kê tiền phòng. */
export const RENT_AMOUNT_HIDDEN_SHORT = 'Không hiển thị số tiền thuê';
