import { realTenantSelfService } from '@/services/tenant/selfService';

/**
 * Chặn khách thuê ĐÃ TRẢ PHÒNG XONG quay lại app.
 *
 * Khi quản lý bấm "Hoàn tất trả phòng", BE chỉ chạy được tới bước thanh lý hợp đồng
 * (TenantCheckoutServiceImpl.completeRequest → terminateActiveContract) — tài khoản
 * khách vẫn ACTIVE và vẫn đăng nhập được. Vì vậy app tự khoá dựa trên hợp đồng:
 * hết hợp đồng còn hiệu lực = hết quyền vào app.
 *
 * ⚠️ Đây là chốt phía CLIENT: token cũ vẫn gọi API được cho tới khi BE khoá thật
 * (xem docs/BE-YEUCAU-khoa-tai-khoan-tra-phong-2026-08-05.md).
 */

/** Hợp đồng đã đóng hẳn — khách không còn thuê nữa. */
const ENDED_CONTRACT_STATUSES = ['TERMINATED', 'CANCELLED', 'CANCELED', 'CLOSED'];

/**
 * EXPIRED cố tình KHÔNG nằm trong danh sách trên: hợp đồng hết hạn nhưng chưa làm thủ
 * tục trả phòng thì khách vẫn đang ở, vẫn phải vào app để xem hoá đơn và gửi yêu cầu
 * trả phòng (BE cũng cho complete từ hợp đồng EXPIRED).
 */
const isEnded = (status?: string) => ENDED_CONTRACT_STATUSES.includes((status || '').toUpperCase());

export const TENANT_ACCOUNT_ENDED_TITLE = 'Tài khoản đã ngừng hoạt động';
export const TENANT_ACCOUNT_ENDED_MESSAGE =
  'Bạn đã hoàn tất thủ tục trả phòng và thanh toán hoá đơn cuối cùng, hợp đồng thuê đã kết thúc '
  + 'nên tài khoản này không còn sử dụng được.\n\n'
  + 'Nếu bạn thuê phòng mới tại Hoàng Bình Land, quản lý sẽ mở lại tài khoản bằng chính số điện '
  + 'thoại này. Cảm ơn bạn đã đồng hành cùng chúng tôi!';

/** Ném ra khi chặn ngay tại cổng đăng nhập — LoginScreen bắt để hiện đúng thông báo. */
export class TenantAccountEndedError extends Error {
  /** Dùng thay instanceof cho chắc (bundler có thể tách module). */
  readonly accountEnded = true;

  constructor(message: string = TENANT_ACCOUNT_ENDED_MESSAGE) {
    super(message);
    this.name = 'TenantAccountEndedError';
  }
}

export const isAccountEndedError = (e: any): boolean => !!e?.accountEnded;

/**
 * true = mọi hợp đồng của khách đều đã thanh lý → không cho vào app nữa.
 *
 * Luôn "mở cửa" khi không chắc (lỗi mạng, BE trả rỗng, chưa có hợp đồng nào): thà cho
 * vào nhầm còn hơn nhốt khách đang thuê ở ngoài chỉ vì rớt mạng.
 */
export async function isTenantAccountEnded(): Promise<boolean> {
  try {
    const contracts = await realTenantSelfService.getMyContracts();
    if (!contracts.length) return false;
    return contracts.every((c) => isEnded(c.status));
  } catch {
    return false;
  }
}
