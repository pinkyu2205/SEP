/**
 * XÁC NHẬN HỢP ĐỒNG BẰNG HAI OTP — tầng gọi API dùng chung cho CẢ HAI app.
 *
 * Quy trình (BE triển khai 27/08/2026, commit `bd2503b add dual otp`):
 *   1. Khách chuyển khoản xong → `completeDepositPayment` gọi `getOrCreateTenant`, tạo
 *      tài khoản khách (username = SĐT, `firstLogin=true`) và gán `contract.tenant`.
 *   2. Khách đăng nhập → kích hoạt tài khoản (đặt mật khẩu mới).
 *   3. `GET /pending-confirm` trả 200 → app ép khách vào màn "Xác nhận hợp đồng".
 *   4. Khách đọc hợp đồng rồi tự bấm **Gửi OTP** — chính hành động này là bằng chứng
 *      khách đã xem và đồng ý, nên KHÔNG được gửi tự động thay khách.
 *   5. BE sinh HAI mã KHÁC `purpose` (`CONTRACT_CONFIRM_TENANT` / `_MANAGER`), cùng gửi
 *      về số override `0352393203`; log DEV có nhãn `[TENANT]` / `[MANAGER]` để phân biệt.
 *   6. Mỗi bên nhập mã của mình. Chỉ khi CẢ HAI mốc đều có thì BE mới `activateContract`.
 *
 * ⚠️ BE **không có endpoint `confirm-state`** và **không có cột `confirm_requested_at`**.
 * Nguồn sự thật về tiến độ là chính `TenantContractResponse`, qua hai mốc
 * `tenantOtpVerifiedAt` / `managerOtpVerifiedAt`. Xem `toConfirmState` bên dưới.
 *
 * Mọi đường dẫn của luồng này nằm gọn trong `PATHS` — BE đổi path thì sửa đúng một chỗ.
 */
import realApiClient from '@/services/core/realApiClient';
import type { TenantContractResponse } from '@/services/tenant/tenantService';

/** Bên nào đang bị chờ. `DONE` = hợp đồng đã có hiệu lực. */
export type ConfirmWaitingFor =
  | 'NOT_PAID'  // chưa thanh toán xong, chưa tới bước xác nhận
  | 'BOTH'      // chưa bên nào nhập mã
  | 'TENANT'    // chỉ còn chờ khách nhập
  | 'MANAGER'   // chỉ còn chờ quản lý nhập
  | 'DONE';

/**
 * Tiến độ xác nhận của một hợp đồng.
 *
 * KHÔNG chứa số tiền — quản lý cũng đọc DTO này, mà tiền đang được cố ý ẩn khỏi vai
 * quản lý. Cần tiền thì lấy từ DTO hợp đồng bên app khách.
 */
export interface ContractConfirmState {
  contractId: number;
  status?: string;
  paymentStatus?: string | null;
  tenantOtpVerified: boolean;
  tenantOtpVerifiedAt?: string | null;
  managerOtpVerified: boolean;
  managerOtpVerifiedAt?: string | null;
  activated: boolean;
  activatedAt?: string | null;
  waitingFor: ConfirmWaitingFor;
}

const PATHS = {
  /** [KHÁCH] Bấm gửi — BE sinh CẢ HAI mã. Alias `/api/v1/me/tenant-contracts/...` cũng chạy. */
  sendConfirmOtp: (id: number) => `/api/v1/tenant/me/contracts/${id}/send-confirm-otp`,
  /** [KHÁCH] Nhập mã của khách. */
  confirmAsTenant: (id: number) => `/api/v1/tenant/me/contracts/${id}/confirm-otp`,
  /** [KHÁCH] HĐ đang chờ chính khách này xác nhận — 200 kèm HĐ, hoặc 204. */
  pendingConfirm: '/api/v1/tenant/me/contracts/pending-confirm',
  /**
   * [QUẢN LÝ] Gửi lại mã CỦA QUẢN LÝ. BE giữ path `send-otp` cũ nhưng đã đổi ruột:
   * giờ chỉ sinh `CONTRACT_CONFIRM_MANAGER`, không đụng mã của khách.
   */
  resendManagerOtp: (id: number) => `/api/v1/tenant-contracts/${id}/send-otp`,
  /** Đọc lại hợp đồng để lấy tiến độ. Cả TENANT lẫn MANAGER đều gọi được. */
  contract: (id: number) => `/api/v1/tenant-contracts/${id}`,
} as const;

/**
 * Suy tiến độ từ DTO hợp đồng.
 *
 * Cả hai app dùng CHUNG hàm này thay vì mỗi bên tự đọc hai mốc rồi tự luận — hai bản
 * suy luận rời nhau kiểu gì cũng lệch ở một ca biên, và khi ấy hai màn hình đứng cạnh
 * nhau lại nói hai điều khác nhau về cùng một hợp đồng.
 *
 * ⚠️ Không phân biệt được "khách chưa bấm gửi OTP" với "đã gửi, chưa ai nhập": BE không
 * lưu mốc `confirm_requested_at`. Cả hai đều ra `BOTH`. Vì vậy UI quản lý KHÔNG được
 * nói chắc "khách chưa gửi" — chỉ nói "chưa bên nào xác nhận".
 */
export const toConfirmState = (c: TenantContractResponse): ContractConfirmState => {
  const tenantOtpVerified = !!c.tenantOtpVerifiedAt;
  const managerOtpVerified = !!c.managerOtpVerifiedAt;
  const activated = c.status === 'ACTIVE';

  let waitingFor: ConfirmWaitingFor;
  if (activated) waitingFor = 'DONE';
  else if (c.paymentStatus !== 'PAID' && !c.depositPaidAt) waitingFor = 'NOT_PAID';
  else if (tenantOtpVerified && managerOtpVerified) waitingFor = 'DONE';
  else if (tenantOtpVerified) waitingFor = 'MANAGER';
  else if (managerOtpVerified) waitingFor = 'TENANT';
  else waitingFor = 'BOTH';

  return {
    contractId: c.id,
    status: c.status,
    paymentStatus: c.paymentStatus,
    tenantOtpVerified,
    tenantOtpVerifiedAt: c.tenantOtpVerifiedAt ?? null,
    managerOtpVerified,
    managerOtpVerifiedAt: c.managerOtpVerifiedAt ?? null,
    activated,
    activatedAt: c.activatedAt ?? null,
    waitingFor,
  };
};

export const contractConfirmService = {
  /** [KHÁCH] Đồng ý hợp đồng → BE sinh và gửi hai mã. */
  sendConfirmOtp: async (contractId: number): Promise<void> => {
    await realApiClient.post(PATHS.sendConfirmOtp(contractId));
  },

  /**
   * [KHÁCH] Nhập mã của mình.
   *
   * BE trả `TenantContractResponse`: `status` vẫn `PENDING` khi quản lý chưa nhập, và
   * thành `ACTIVE` nếu khách là người nhập sau cùng.
   */
  confirmAsTenant: async (contractId: number, otp: string): Promise<ContractConfirmState> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      PATHS.confirmAsTenant(contractId),
      { otp },
    );
    return toConfirmState(data);
  },

  /** [QUẢN LÝ] Xin lại mã của mình — không đụng mã/mốc của khách. */
  resendManagerOtp: async (contractId: number): Promise<void> => {
    await realApiClient.post(PATHS.resendManagerOtp(contractId));
  },

  /**
   * [KHÁCH] Hợp đồng đang chờ chính mình xác nhận, hoặc null.
   *
   * BE trả 204 khi không có. Axios KHÔNG coi 204 là lỗi, nhưng `data` là chuỗi rỗng —
   * nên phải kiểm `data?.id` chứ không kiểm truthy, kẻo `''` lọt qua thành "có hợp đồng".
   */
  getPendingConfirm: async (): Promise<TenantContractResponse | null> => {
    const { data } = await realApiClient.get<TenantContractResponse | ''>(PATHS.pendingConfirm);
    return data && typeof data === 'object' && data.id != null ? data : null;
  },

  /** Tiến độ xác nhận. Dùng cho cả poll lẫn lần nạp đầu, ở cả hai vai. */
  getConfirmState: async (contractId: number): Promise<ContractConfirmState> => {
    const { data } = await realApiClient.get<TenantContractResponse>(PATHS.contract(contractId));
    return toConfirmState(data);
  },
};
