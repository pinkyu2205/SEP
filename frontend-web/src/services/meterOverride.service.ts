import api from './api';

/**
 * MÃ NHẬP TAY CHỈ SỐ ĐỒNG HỒ — phần của Admin.
 *
 * Vì sao có: toàn bộ cơ chế bắt manager chụp ảnh đồng hồ tồn tại để chặn việc bịa chỉ
 * số điện/nước. Nhưng có những lúc thật sự không chụp được (đồng hồ trong hộp khoá của
 * chủ nhà, mặt số mờ, mất điện) — mentor 07/08/2026 ý 5 yêu cầu phải có đường lùi mà
 * không phá cơ chế.
 *
 * Đường lùi đó là: admin tạo mã 6 số → đọc cho manager → manager nhập một lần → được
 * gõ tay chỉ số, kèm lý do bắt buộc, và BE ghi vết lại.
 *
 * BE `MeterOverrideController` (commit b3be95c, 10/08/2026):
 *   • POST /api/v1/admin/meter-override/passcodes   — tạo mã (ROLE_ADMIN)
 *   • GET  /api/v1/admin/meter-override/passcodes   — danh sách mã (ROLE_ADMIN)
 *   • GET  /api/v1/admin/meter-overrides            — nhật ký đã dùng (ROLE_ADMIN)
 *
 * Hai lớp mã, đừng lẫn:
 *   1. `code` 6 số ở đây      — admin tạo, TTL ~10', CHẾT ngay khi manager verify
 *   2. `overrideToken` (UUID) — BE cấp sau verify, TTL ~15', chết khi submit chỉ số
 * Trang admin chỉ chạm lớp 1.
 */

const ADMIN = '/api/v1/admin';

export interface MeterOverridePasscode {
  id: number;
  /** 6 chữ số. Admin đọc chuỗi này cho manager. */
  code: string;
  createdBy: string;
  note?: string | null;
  /** ISO-8601. Quá mốc này mã tự hỏng, không cần thu hồi. */
  expiresAt: string;
  /** Có giá trị = đã có người dùng, mã chết. */
  usedAt?: string | null;
  usedBy?: string | null;
  createdAt: string;
  /** BE tự tính: chưa dùng VÀ chưa hết hạn. */
  usable: boolean;
  /** Câu mô tả sẵn của BE: "Còn hiệu lực" | "Đã dùng" | "Hết hạn". */
  message?: string | null;
}

/** Một lần manager thật sự gõ tay chỉ số — bằng chứng cho admin soi lại. */
export interface MeterOverrideLog {
  id: number;
  managerId: string;
  managerName: string;
  /** null khi mã được xin lúc hợp đồng chưa kịp tạo (giữa luồng đón khách). */
  contractId?: number | null;
  meterKind: string;           // ELEC | WATER
  enteredValue?: number | null;
  reason: string;
  createdAt: string;
}

export interface GeneratePasscodeInput {
  /** 1–60. Bỏ trống → BE dùng mặc định 10 phút. */
  ttlMinutes?: number;
  /** Ghi chú nội bộ, ví dụ "Manager An — đón khách P.302". */
  note?: string;
}

/**
 * ⚠️ `api` đã bóc sẵn `.data` trong response interceptor (`api.ts`), nên hàm trả về
 * THẲNG payload chứ không phải `AxiosResponse`. Viết `const { data } = await api.get(...)`
 * là bóc hai lần → luôn `undefined`, và vì request vẫn 200 nên màn hình chỉ hiện trống
 * chứ không báo lỗi gì. Tham số generic thứ hai của axios chính là kiểu sau khi bóc.
 */
export const meterOverrideService = {
  generate: (input: GeneratePasscodeInput = {}): Promise<MeterOverridePasscode> =>
    api.post<unknown, MeterOverridePasscode>(`${ADMIN}/meter-override/passcodes`, input),

  /** `activeOnly` = chỉ mã chưa dùng và chưa hết hạn. */
  listPasscodes: async (activeOnly = false): Promise<MeterOverridePasscode[]> => {
    const rows = await api.get<unknown, MeterOverridePasscode[]>(
      `${ADMIN}/meter-override/passcodes`,
      { params: { activeOnly } },
    );
    return rows ?? [];
  },

  listLogs: async (): Promise<MeterOverrideLog[]> => {
    const rows = await api.get<unknown, MeterOverrideLog[]>(`${ADMIN}/meter-overrides`);
    return rows ?? [];
  },
};
