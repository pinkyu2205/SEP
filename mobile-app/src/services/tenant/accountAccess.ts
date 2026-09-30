import { realTenantSelfService, type MyContractListItem } from '@/services/tenant/selfService';
import { contractConfirmService } from '@/services/shared/contractConfirmService';

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
 * Số ngày khách còn xem được app sau khi xác nhận đã nhận đủ tiền cọc.
 *
 * Vì sao KHÔNG khoá ngay lúc bấm xác nhận: nếu bấm nút = mất quyền vào app thì ta tạo ra một
 * cái bẫy — người đã nhận đủ tiền vẫn cố tình không bấm để giữ quyền xem, hồ sơ treo mãi;
 * còn người bấm rồi thì mất luôn bảng quyết toán và ảnh biên lai. Bỏ hình phạt đi thì nút
 * mới được bấm thật lòng.
 */
export const TENANT_READ_ONLY_DAYS = 15;

/** Ba mức quyền, tăng dần độ hạn chế. */
export type TenantAccessMode =
  /** Đang thuê, hoặc đã trả phòng nhưng chưa nhận xong tiền cọc — dùng bình thường. */
  | 'FULL'
  /** Đã nhận đủ cọc, còn trong hạn xem lại chứng từ — ẩn mọi nút thao tác. */
  | 'READ_ONLY'
  /** Hết hạn xem lại — chặn từ cổng đăng nhập. */
  | 'ENDED';

export interface TenantAccess {
  mode: TenantAccessMode;
  /** Còn bao nhiêu ngày nữa hết quyền xem — chỉ có nghĩa khi mode = READ_ONLY. */
  daysLeft?: number;
}

/**
 * Hợp đồng nào đang chờ chính khách này xác nhận — **suy tạm từ danh sách**.
 *
 * Chỉ dùng làm phương án dự phòng khi `GET /pending-confirm` hỏng; đường chính là gọi
 * thẳng endpoint đó (xem `findPendingConfirmContractId`). Nhận diện theo `PENDING` vì
 * tài khoản khách chỉ được tạo SAU khi tiền vào — khách đăng nhập được mà còn hợp đồng
 * PENDING thì đúng là đang chờ xác nhận.
 *
 * KHÔNG loại hợp đồng khách đã nhập mã: xác nhận xong mà quản lý chưa nhập thì khách
 * vẫn phải ở lại màn chờ. BE cũng làm đúng vậy — `findPendingConfirmForTenant` chỉ lọc
 * `PENDING && PAID`, không xét mốc OTP của khách.
 */
const isAwaitingTenantConfirm = (c: MyContractListItem): boolean => {
  // BE 24/09/2026: "đã trả tiền, chờ dual OTP" là AWAITING_CONFIRM (trước là PENDING + PAID).
  if (c.status !== 'AWAITING_CONFIRM' && c.status !== 'PENDING') return false;
  if (c.paymentStatus && c.paymentStatus !== 'PAID') return false;
  return true;
};

const daysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
};

/**
 * Quyết định quyền vào app.
 *
 * ĐỔI MỐC KHOÁ (20/08/2026). Trước đây chỉ xét trạng thái hợp đồng: hết hợp đồng là chặn
 * ngay. Nhưng quyền vào app chính là đòn bẩy duy nhất của khách — cắt đúng lúc khách cần
 * xác nhận hoặc khiếu nại tiền cọc là cắt sai thời điểm, và làm vô hiệu luôn cả cơ chế đối
 * chứng (nút "đã nhận đủ" / "chưa nhận được tiền").
 *
 * Nguyên tắc: TÁCH quyền vào app khỏi trạng thái tiền. Mốc khoá là khách đã xác nhận nhận
 * đủ cọc, không phải hợp đồng đã thanh lý.
 *
 * Luôn "mở cửa" khi không chắc (lỗi mạng, BE trả rỗng, chưa có hợp đồng nào, hoặc BE chưa
 * trả `refundConfirmedAt`): thà cho vào nhầm còn hơn nhốt khách đang thuê ở ngoài.
 */
export async function getTenantAccess(): Promise<TenantAccess> {
  try {
    const contracts = await realTenantSelfService.getMyContracts();
    if (!contracts.length) return { mode: 'FULL' };
    if (!contracts.every((c) => isEnded(c.status))) return { mode: 'FULL' };

    // Mọi hợp đồng đã thanh lý. Giờ mới xét tới tiền cọc.
    // Lấy mốc xác nhận MUỘN NHẤT: khách từng thuê nhiều nơi thì tính theo lần gần nhất.
    const confirmedDays = contracts
      .map((c) => daysSince(c.refundConfirmedAt))
      .filter((d): d is number => d !== null);

    // Chưa xác nhận nhận cọc (hoặc BE chưa trả field) → còn việc phải làm, giữ nguyên quyền.
    if (!confirmedDays.length) return { mode: 'FULL' };

    const since = Math.min(...confirmedDays);
    if (since >= TENANT_READ_ONLY_DAYS) return { mode: 'ENDED' };
    return { mode: 'READ_ONLY', daysLeft: TENANT_READ_ONLY_DAYS - since };
  } catch {
    return { mode: 'FULL' };
  }
}

/** Chặn ngay tại cổng đăng nhập — chỉ chặn khi đã hết cả hạn xem lại. */
export async function isTenantAccountEnded(): Promise<boolean> {
  return (await getTenantAccess()).mode === 'ENDED';
}

/**
 * Hợp đồng đang chờ khách xác nhận, `null` nếu không có.
 *
 * Hỏi thẳng `GET /api/v1/tenant/me/contracts/pending-confirm` — BE lọc bằng đúng điều
 * kiện của nó (`PENDING && PAID`), khỏi phải đoán lại ở FE rồi lệch khi BE đổi luật.
 * Endpoint hỏng thì lùi về suy từ danh sách hợp đồng.
 *
 * Lỗi cả hai đường → trả `null` (cho vào app). Cùng nguyên tắc với `getTenantAccess`:
 * một lần rớt mạng không được phép nhốt khách trong màn xác nhận.
 */
export async function findPendingConfirmContractId(): Promise<number | null> {
  try {
    const c = await contractConfirmService.getPendingConfirm();
    return c?.id ?? null;
  } catch {
    try {
      const contracts = await realTenantSelfService.getMyContracts();
      return contracts.find(isAwaitingTenantConfirm)?.id ?? null;
    } catch {
      return null;
    }
  }
}
