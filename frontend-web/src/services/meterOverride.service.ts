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
  /** Mã cấp cho yêu cầu nào (null = mã rời, cấp qua điện thoại). BE chưa trả. */
  requestId?: number | null;
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
  /**
   * Tạo mã ĐỂ TRẢ LỜI một yêu cầu cụ thể — BE gắn mã với yêu cầu và đổi yêu cầu sang
   * ISSUED. Bỏ trống = tạo mã rời như trước (manager gọi điện, không gửi yêu cầu).
   */
  requestId?: number;
}

/**
 * ─── YÊU CẦU XIN MÃ (24/09/2026 — BE CHƯA LÀM) ───────────────────────────────
 * Trước đây manager chỉ gọi điện xin mã, nên admin không biết AI xin, cho ĐỒNG HỒ nào,
 * ở NHÀ/PHÒNG nào — chỉ còn ô ghi chú tự gõ. Giờ manager bấm "Gửi yêu cầu" trên app,
 * admin thấy danh sách chờ (kèm số trên sidebar) rồi tạo mã gắn đúng yêu cầu đó.
 *
 * Endpoint BE chưa có → 404. Trang admin coi 404 là "chưa hỗ trợ" và ẩn khối yêu cầu,
 * luồng gọi điện cũ vẫn chạy nguyên. Xem doc-be/BE-YEUCAU-yeu-cau-xin-ma-dong-ho-2026-09-24.md
 */
export type MeterOverrideRequestStatus = 'PENDING' | 'ISSUED' | 'REJECTED' | 'CANCELLED';

/** Manager xin mã ở màn nào — cùng một đồng hồ nhưng rủi ro khác nhau. */
export type MeterOverridePurpose = 'ONBOARDING' | 'RESUME_CONTRACT' | 'MONTHLY_READING';

export const PURPOSE_LABEL: Record<MeterOverridePurpose, string> = {
  ONBOARDING: 'Đón khách mới',
  RESUME_CONTRACT: 'Hoàn tất hợp đồng chờ đón',
  MONTHLY_READING: 'Chốt số hằng tháng',
};

export interface MeterOverrideRequest {
  id: number;
  managerId: string;
  managerName: string;
  managerPhone?: string | null;
  meterKind: string;              // ELEC | WATER
  purpose?: MeterOverridePurpose | null;
  contractId?: number | null;
  contractCode?: string | null;
  propertyId?: number | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantName?: string | null;
  /** Lý do không chụp được ảnh — bắt buộc phía app. */
  reason: string;
  status: MeterOverrideRequestStatus;
  createdAt: string;
  /** Mã đã cấp cho yêu cầu này (khi ISSUED). */
  passcodeId?: number | null;
  handledAt?: string | null;
  handledByName?: string | null;
  rejectReason?: string | null;
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

  /** Yêu cầu xin mã của manager. 404 = BE chưa làm — nơi gọi tự xử. */
  listRequests: async (status?: MeterOverrideRequestStatus): Promise<MeterOverrideRequest[]> => {
    const rows = await api.get<unknown, MeterOverrideRequest[]>(
      `${ADMIN}/meter-override/requests`,
      { params: status ? { status } : {} },
    );
    return Array.isArray(rows) ? rows : [];
  },

  /** Từ chối — lý do bắt buộc, manager đọc được trên app. */
  rejectRequest: (id: number, reason: string): Promise<MeterOverrideRequest> =>
    api.post(`${ADMIN}/meter-override/requests/${id}/reject`, { reason: reason.trim() }),
};

/** Lỗi 404 = endpoint chưa có trên BE (không phải lỗi mạng). */
export const isNotFound = (e: unknown) =>
  (e as { response?: { status?: number } })?.response?.status === 404;
