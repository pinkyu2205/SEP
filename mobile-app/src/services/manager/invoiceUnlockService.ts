import realApiClient from '@/services/core/realApiClient';

/**
 * MỞ KHOÁ THU TIỀN HỘ KHÁCH — passcode của admin.
 *
 * Vì sao phải có bước này: hai luồng dưới đây đều là quản lý **đứng ra chuyển tiền thay
 * khách**, tức tự tay tạo giao dịch trên hoá đơn của người khác. Không ai kiểm thì đó là
 * cửa để quản lý tự ghi nhận thu bừa. Nên mỗi lần làm phải xin admin một mã dùng một lần,
 * và mọi lần mở khoá đều vào `invoice_unlock_log` để admin soát lại.
 *
 * Luồng: quản lý gọi điện xin mã → admin phát mã theo ĐÚNG hoá đơn + ĐÚNG mục đích →
 * quản lý nhập mã (`verifyPasscode`) lấy `unlockToken` (hạn 15') → dùng token đó xin mã QR
 * (`createPaymentQr` trong invoiceService).
 *
 * Giới hạn BE đang áp (khớp lời cảnh báo trên UI):
 *   • Mã 6 chữ số, hạn mặc định 15 phút, dùng MỘT lần, gắn cứng 1 hoá đơn + 1 mục đích.
 *   • Nhập sai 3 lần trên cùng hoá đơn → khoá 15 phút (BE trả 429).
 *   • Admin phát tối đa 20 mã/giờ.
 */

/** CASH_COLLECT = khách trả tiền mặt, quản lý nộp lại. PROXY_PAY = người khác trả hộ. */
export type InvoiceUnlockPurpose = 'CASH_COLLECT' | 'PROXY_PAY';

export interface InvoiceUnlockVerifyResult {
  valid: boolean;
  /** Token dùng để xin QR. Chỉ có khi `valid`. */
  unlockToken?: string;
  /** Hạn của token (không phải hạn của QR). */
  expiresAt?: string;
  message?: string;
}

/**
 * Lỗi có câu chữ của BE để hiện thẳng cho quản lý.
 * BE trả 403 (mã sai/hết hạn) và 429 (nhập sai quá nhiều) đều kèm `message` tiếng Việt —
 * đừng thay bằng câu chung, vì hai ca đó cần hành động khác nhau (xin mã mới vs chờ hết khoá).
 */
const readErr = (e: any, fallback: string): string =>
  e?.response?.data?.message || e?.message || fallback;

export const managerInvoiceUnlockService = {
  /**
   * POST /api/v1/manager/invoice-unlock/verify
   * Trả `{ valid: false, message }` thay vì ném lỗi — màn nhập mã cần hiện câu của BE
   * ngay dưới ô nhập, không phải một alert chặn ngang.
   */
  verifyPasscode: async (
    invoiceId: number,
    passcode: string,
  ): Promise<InvoiceUnlockVerifyResult> => {
    try {
      const { data } = await realApiClient.post<InvoiceUnlockVerifyResult>(
        '/api/v1/manager/invoice-unlock/verify',
        { invoiceId, passcode: passcode.trim() },
      );
      return data;
    } catch (e: any) {
      return {
        valid: false,
        message: readErr(e, 'Mã không đúng hoặc đã hết hạn. Liên hệ admin để lấy mã mới.'),
      };
    }
  },
};
