import realApiClient from '@/services/core/realApiClient';

/**
 * XIN MÃ NHẬP TAY CHỈ SỐ ĐỒNG HỒ khi không chụp được ảnh.
 *
 * Vì sao phải có mã: toàn bộ cơ chế bắt chụp ảnh đồng hồ tồn tại để chặn việc bịa chỉ
 * số (xem đầu `utils/meterPhoto.ts`). Mở đường nhập tay mà không rào thì cơ chế đó vô
 * nghĩa. Nên đường lùi phải: xin mã từ admin + ghi lý do + BE lưu vết ai đã dùng.
 *
 * Luồng (BE 10/08/2026, commit b3be95c — thay cho mã cố định trong biến môi trường):
 *   0. Admin bấm tạo mã trên web → mã 6 SỐ, TTL ~10 phút, đọc cho manager qua điện thoại
 *   1. POST /manager/meter-override/verify  → nhận `overrideToken` (dùng 1 lần, TTL 15')
 *      Mã 6 số CHẾT ngay tại bước này; lần sau cần thì phải xin mã mới.
 *   2. Gửi kèm token + lý do trong request onboard / cập nhật hợp đồng nháp
 *   3. BE CHỈ tiêu thụ token khi KHÔNG có ảnh đồng hồ tương ứng — có ảnh thì bỏ qua
 *
 * Mỗi mã chỉ đổi được MỘT `overrideToken` cho MỘT loại đồng hồ. Không chụp được cả
 * điện lẫn nước thì phải xin admin hai mã.
 *
 * Admin soi lại ở GET /api/v1/admin/meter-overrides (web: Vận hành → Cấp mã đồng hồ).
 */

export type MeterOverrideKind = 'ELEC' | 'WATER';

export interface MeterOverrideVerifyResult {
  valid: boolean;
  overrideToken?: string;
  expiresAt?: string;
  message?: string;
}

export const meterOverrideService = {
  /**
   * Đổi mã 6 số admin vừa cấp lấy token dùng một lần.
   *
   * BE trả 403 khi mã sai / hết hạn / đã dùng, và **429 khi khoá 5 phút sau 5 lần sai**
   * — cả hai đều ném lỗi HTTP, KHÔNG rơi vào nhánh `valid: false`, nên nơi gọi phải bắt
   * try/catch và đọc `message` của BE để hiện đúng lý do cho người dùng.
   *
   * `contractId` để `null` khi đang đón khách mới: ở bước nhập chỉ số thì hợp đồng chưa
   * được tạo. BE nhận null từ commit b3be95c (trước đó là `@NotNull` → 400).
   */
  verify: async (
    passcode: string,
    contractId: number | null,
    meterKind: MeterOverrideKind,
  ): Promise<MeterOverrideVerifyResult> => {
    const { data } = await realApiClient.post<MeterOverrideVerifyResult>(
      '/api/v1/manager/meter-override/verify',
      { passcode, contractId, meterKind },
    );
    return data ?? { valid: false };
  },
};
