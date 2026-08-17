/**
 * QUYỀN XEM SỐ TIỀN CỦA MANAGER — chốt 07/08/2026.
 *
 * Manager KHÔNG được biết app thu của khách bao nhiêu tiền thuê/cọc một tháng.
 * Việc của manager với tiền phòng chỉ còn là: khách ĐÃ hay CHƯA thanh toán hoá đơn
 * tiền phòng của kỳ đó. Vì vậy mọi màn quản lý chỉ hiện SỐ ĐẾM và TRẠNG THÁI, không
 * hiện số tiền, không hiện tổng phải thu, không hiện % theo tiền.
 *
 * ─── RÀ SOÁT TOÀN BỘ 13/08/2026 ────────────────────────────────────────────────
 * Chốt lại: manager KHÔNG được thấy tiền cọc và tiền nhà/phòng ở BẤT KỲ đâu. Đã ẩn ở:
 *   • RoomManageScreen        — chip giá/cọc trên thẻ phòng, panel nhà nguyên căn,
 *                               bảng "Thông tin phòng (chỉ đọc)"
 *   • BuildingListScreen      — dòng "Giá thuê: x/tháng" trên thẻ nhà
 *   • TenantContractDetailScreen — "Tiền thuê hàng tháng", "Tiền đặt cọc"
 *   • WholeHouseDetailScreen  — ô hero "Giá thuê/tháng", "Giá thuê", "Tiền cọc"
 *   • PaymentHistoryScreen    — số tiền cọc trong Thu & Đối soát
 * (TenantInvoicesScreen và RentInvoiceScreen vốn đã ẩn sẵn từ 07/08.)
 *
 * VẪN HIỆN (không nằm trong phạm vi ẩn):
 *   • Tiền điện/nước — manager tự ghi chỉ số rồi phát hành hoá đơn, không thấy thành
 *     tiền thì không làm được việc. Giữ cả ĐƠN GIÁ điện/nước trên thẻ phòng vì lý do đó.
 *   • Phí dịch vụ — manager cũng là người phát hành.
 *   • Chi phí bảo trì, giá thiết bị — đó là khoản manager duyệt chi.
 *   • **Số tiền trong luồng THU HỘ** (17/08/2026) — `POST /manager/invoices/{id}/payment-qr`
 *     trả `amount` không mask, và `CollectPaymentSheet` hiện số đó to ở giữa màn.
 *     Cố ý: quản lý là người bấm chuyển đúng số đó (khách trả tiền mặt) hoặc đọc số
 *     cho người trả hộ. Ẩn số ở đây là hỏng chức năng chứ không phải bảo mật.
 *     Bù lại, mỗi lần mở luồng này đều phải có passcode admin và đều vào
 *     `invoice_unlock_log` — kiểm soát bằng dấu vết, không bằng cách che số.
 *
 * ⚠️ CÒN 2 MÀN CHƯA ẨN vì ẩn là HỎNG chức năng, đang chờ chốt hướng xử lý:
 *   • ResumeContractScreen — hai ô NHẬP giá thuê + cọc ở `RejectedPanel` (khi Host từ
 *     chối giá, manager sửa rồi gửi lại). Phần còn lại của màn đã bỏ hết số tiền.
 *     ⚠️ Hai ô này từng gửi cọc = 0 âm thầm: BE mask về `null`, `String(null)` ra
 *     `"null"` (truthy) → parse ra 0. Đã sửa 13/08/2026 — khởi tạo rỗng + chặn chưa nhập.
 *   • CheckoutSettlementScreen — "Tiền cọc còn lại", cần để tất toán trả phòng.
 * Muốn ẩn nốt thì phải chuyển các số này sang cho admin quyết, manager chỉ xem trạng thái.
 *
 * (Màn đón khách cũ đã xoá hẳn 17/08/2026 — luồng đón khách gom về
 * ResumeContractScreen, nên màn đó không còn nằm trong danh sách này.)
 *
 * ─── THÔNG TIN CÁ NHÂN CỦA KHÁCH (13/08/2026) ─────────────────────────────────
 * SỐ ĐIỆN THOẠI và CCCD của khách thuê cũng ẩn với manager — họ không cần đọc để vận
 * hành. Đã ẩn ở: BuildingContractScreen (cả danh sách lẫn chi tiết), BuildingDetail,
 * TenantListScreen, CheckoutRequestsScreen, PaymentHistoryScreen.
 * Nút "Gọi khách" VẪN gọi được — nó mở app điện thoại với số lấy từ dữ liệu chứ không
 * hiện số ra màn hình; nhánh lỗi cũng đã bỏ việc in số vào alert.
 *
 * CHỈNH 17/08/2026 — hiện 3 SỐ CUỐI, không cho bấm xem đủ.
 * Ẩn sạch số hoá ra bất tiện: quản lý không đối chiếu được người vừa gọi cho mình là
 * khách nào, và hai khách trùng tên trong cùng một nhà thì không phân biệt nổi. Ba số
 * cuối đủ để đối chiếu mà vẫn không đọc ra được số đầy đủ, nên KHÔNG kèm nút xem đủ
 * (khác màn của host/admin — hai role đó được xem trọn số, bấm để mở).
 * Dùng `maskTenantPhone`/`maskTenantCccd` bên dưới, đừng gọi `maskMiddle` trực tiếp
 * ở màn manager nữa — mỗi màn tự chọn head/tail là lại lệch nhau như trước.
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

/**
 * Chuỗi thay cho SỐ TIỀN bị ẩn, dùng ở mọi màn manager thay vì mỗi nơi chế một kiểu
 * ("•••", "---", "Ẩn", bỏ trống...). Có một hằng thì sau này đổi cách hiển thị chỉ
 * sửa một chỗ, và grep ra được ngay còn sót màn nào chưa ẩn.
 */
export const HIDDEN_AMOUNT = '•••';

/** Dùng cho ô thông tin có nhãn (InfoRow/InfoLine) — nói rõ hơn dấu chấm. */
export const HIDDEN_AMOUNT_TEXT = 'Hệ thống thu';

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

/** Số ký tự cuối còn để lộ trên màn manager. */
const PII_VISIBLE_TAIL = 3;

/**
 * Che phần đầu, giữ 3 ký tự cuối: `0932892123` → `•••••••123`.
 *
 * Số dấu chấm bám theo độ dài thật để không gợi ý sai độ dài số. Chuỗi quá ngắn
 * (≤3 ký tự) thì không che — che nữa là mất luôn 3 số cuối, thành ô trống vô nghĩa.
 */
const maskTail = (value?: string | null): string => {
  const v = (value ?? '').trim();
  if (!v) return '';
  if (v.length <= PII_VISIBLE_TAIL) return v;
  return '•'.repeat(v.length - PII_VISIBLE_TAIL) + v.slice(-PII_VISIBLE_TAIL);
};

/** SĐT khách hiển thị cho quản lý — 3 số cuối. Rỗng → '—'. */
export const maskTenantPhone = (phone?: string | null): string => maskTail(phone) || '—';

/** CCCD/MST khách hiển thị cho quản lý — 3 số cuối. Rỗng → 'Chưa có'. */
export const maskTenantCccd = (cccd?: string | null): string => maskTail(cccd) || 'Chưa có';
