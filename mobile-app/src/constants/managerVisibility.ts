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
 * TIỀN CỌC — ĐÃ ẨN LẠI 13/08/2026.
 * Lịch sử: ẩn từ 07/08 → mở lại 10/08 (để manager đối soát khách chuyển đủ cọc chưa)
 * → nay ẩn lại. Manager vẫn thấy DÒNG giao dịch cọc và trạng thái "Đã thu cọc /
 * Chưa thu cọc", chỉ không thấy SỐ TIỀN — vẫn đủ để đối soát ai đã chuyển, ai chưa.
 * Vì không hiện số nữa nên màn Thu & Đối soát cũng THÔI gọi
 * `GET /api/v1/tenant-contracts/{id}` cho từng dòng cọc (trước đây gọi chỉ để lấy
 * `deposit`) — bớt hẳn một loạt request mỗi lần cuộn danh sách.
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

/**
 * Giải thích riêng cho tiền cọc (ẩn lại 13/08/2026).
 * Khác câu của tiền thuê ở chỗ nói rõ manager VẪN đối soát được bằng trạng thái —
 * nếu chỉ dùng chung câu "số tiền thuê do hệ thống quản lý" thì đọc vào không hiểu
 * mình còn làm được gì với dòng cọc đó.
 */
export const DEPOSIT_AMOUNT_HIDDEN_NOTE =
  'Số tiền cọc do hệ thống quản lý. Bạn vẫn đối soát được bằng trạng thái đã thu / chưa thu cọc ở trên.';
