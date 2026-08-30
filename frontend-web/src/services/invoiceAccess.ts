/**
 * QUYỀN XEM HOÁ ĐƠN ĐẦY ĐỦ — dò một lần, dùng chung toàn phiên.
 *
 * ─── Hai nguồn hoá đơn ───────────────────────────────────────────────────────
 *   ĐẦY ĐỦ  `GET /manager/invoices` — hoá đơn THẬT trong bảng `tenant_invoice`: đủ
 *           loại (tiền phòng, điện, nước, dịch vụ, bảo trì), có mã hoá đơn, có
 *           `propertyId` nên ghép vào nhà chắc chắn đúng.
 *   RÚT GỌN `GET /host/invoices?month=` — BE dựng on-the-fly từ hợp đồng ACTIVE của
 *           đúng một kỳ: CHỈ tiền phòng, không mã hoá đơn, không `propertyId`.
 *
 * Endpoint đầy đủ từng là `hasAnyRole('MANAGER','ADMIN')` nên host gọi bị 403. Nay đã
 * mở (kiểm tra 03/10/2026: host đọc được), nhưng vẫn giữ bước dò thay vì gọi thẳng —
 * quyền là thứ nằm ngoài tầm FE, đổi lúc nào không báo, và cái giá của việc dò sai chỉ
 * là hạ cấp xuống nguồn rút gọn thay vì vỡ màn hình.
 *
 * ─── Vì sao phải nằm riêng một file ──────────────────────────────────────────
 * Trước 30/08/2026 hàm này được chép nguyên si vào `finance/BillingPayments.tsx` và
 * `properties/propertyOperationStatus.ts`, mỗi bản một biến `accessProbe` riêng. Chú
 * thích ở cả hai đều ghi "dò đúng MỘT lần mỗi phiên" — đúng trong phạm vi từng file,
 * sai trên thực tế: mở trang Bất động sản rồi sang trang Hoá đơn là dò lại từ đầu.
 * Với một endpoint có thể trả 403 thì mỗi lần dò thừa là thêm một lỗi đỏ trong console.
 */
import { adminService } from './admin.service';

/**
 * Single-flight, nhớ CẢ kết quả âm (`false` cũng được cache).
 *
 * Không cache kết quả âm là hỏng đúng chỗ đau nhất: interceptor `api.ts` tự thử lại
 * GET 403 một lần, cộng StrictMode nhân đôi effect — mỗi lần đổi bộ lọc mà dò lại thì
 * console ngập 403 vô ích.
 */
let probe: Promise<boolean> | null = null;

/** `true` = dùng được `/manager/invoices`; `false` = phải lùi về `/host/invoices`. */
export const canUseFullInvoices = (): Promise<boolean> => {
  probe ??= adminService.listInvoices({}).then(() => true).catch(() => false);
  return probe;
};

/**
 * Quên kết quả đã dò — dùng khi đổi tài khoản đăng nhập.
 *
 * Quyền gắn với người dùng, mà kết quả dò lại sống ở module (tồn tại xuyên suốt phiên
 * trình duyệt). Không xoá thì đăng xuất rồi đăng nhập bằng tài khoản khác vẫn chạy
 * theo quyền của người trước.
 */
export const resetInvoiceAccessProbe = (): void => { probe = null; };
