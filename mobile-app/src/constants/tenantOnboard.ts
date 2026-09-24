/**
 * PIPELINE ĐÓN KHÁCH (hợp đồng tenant) — BE 24/09/2026 (commit 09b35cd/4fa44c6/7e7af84).
 *
 * Trước đây `PENDING` gộp cả "chờ chụp / chờ trả tiền / chờ OTP". Nay tách:
 *
 *   DRAFT → AWAITING_ONBOARD → AWAITING_PAYMENT → AWAITING_CONFIRM → ACTIVE
 *   (chờ tới  (manager chụp      (đã chụp, tạo QR     (đã trả tiền,     (đủ 2 OTP)
 *    ngày đón)  hiện trạng+chỉ số) thu cọc + kỳ đầu)    chờ dual OTP)
 *
 * `PENDING` chỉ còn cho hợp đồng inbound (master lease) — tenant onboard KHÔNG bao giờ set.
 * Doc BE: docs/FE-handoff-tenant-onboard-status-2026-09-24.md, BE-TRA-LOI-tenant-onboard-status-2026-09-24.md.
 */
export type OnboardStatus = 'DRAFT' | 'AWAITING_ONBOARD' | 'AWAITING_PAYMENT' | 'AWAITING_CONFIRM';

/** Khớp `ContractStatus.onboardInProgress()` bên BE (= alias `status=RECEPTION`). */
export const ONBOARD_STATUSES: OnboardStatus[] = [
  'DRAFT', 'AWAITING_ONBOARD', 'AWAITING_PAYMENT', 'AWAITING_CONFIRM',
];

/** Khớp `application.yaml` (`contract.max-early-move-in-days` / `contract.no-show-grace-days`). */
export const ONBOARD_EARLY_DAYS = 3;
export const ONBOARD_NO_SHOW_GRACE_DAYS = 3;

const norm = (s?: string | null) => (s || '').toUpperCase();

export const isOnboardStatus = (s?: string | null): s is OnboardStatus =>
  ONBOARD_STATUSES.includes(norm(s) as OnboardStatus);

/** Còn ở bước sửa được hiện trạng/chỉ số — BE `isCaptureEditable()`. */
export const isCaptureStage = (s?: string | null): boolean =>
  norm(s) === 'DRAFT' || norm(s) === 'AWAITING_ONBOARD';

/** Việc của manager còn ở khâu ĐÓN (chưa thu tiền): DRAFT hoặc AWAITING_ONBOARD. */
export const isPreCollectStatus = (s?: string | null): boolean =>
  norm(s) === 'DRAFT' || norm(s) === 'AWAITING_ONBOARD' || norm(s) === 'AWAITING_PAYMENT';

export const ONBOARD_STATUS_META: Record<OnboardStatus, { label: string; short: string; color: string; bg: string }> = {
  DRAFT:            { label: 'Chờ đến ngày đón',       short: 'Chờ đến ngày', color: '#64748B', bg: '#F1F5F9' },
  AWAITING_ONBOARD: { label: 'Chờ onboard',            short: 'Chờ đón',      color: '#2563EB', bg: '#EFF6FF' },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán',         short: 'Chờ thanh toán', color: '#D97706', bg: '#FFFBEB' },
  AWAITING_CONFIRM: { label: 'Chờ xác nhận hợp đồng',  short: 'Chờ xác nhận', color: '#7C3AED', bg: '#F5F3FF' },
};

/** Ngày đón theo đúng BE: `expectedReceptionDate ?? moveInDate` (thiếu cả hai mới lùi về startDate). */
export const onboardDueDate = (c: {
  expectedReceptionDate?: string | null; moveInDate?: string | null; startDate?: string | null;
}): string | null => {
  const raw = c.expectedReceptionDate || c.moveInDate || c.startDate;
  return raw ? String(raw).slice(0, 10) : null;
};

/** Cộng ngày cho chuỗi `yyyy-MM-dd` bằng UTC (tránh lệch múi giờ, xem serverTime.ts). */
export const shiftIsoDate = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export interface ReceptionWindow {
  /** Ngày đón dùng để tính (null = hồ sơ thiếu ngày, coi như không chặn). */
  due: string | null;
  /** Chưa tới cửa sổ đón: hôm nay < ngày đón − ONBOARD_EARLY_DAYS. */
  tooEarly: boolean;
  /** Ngày sớm nhất được chụp/thu cọc (null khi thiếu ngày đón). */
  earliest: string | null;
  /** Đã quá grace: hôm nay ≥ ngày đón + ONBOARD_NO_SHOW_GRACE_DAYS → BE từ chối tạo QR & cron hủy. */
  pastGrace: boolean;
  /** Ngày bị tự hủy nếu chưa trả tiền (ngày đón + grace). */
  cancelOn: string | null;
}

/**
 * Cửa sổ đón khách theo BE 24/09/2026 (đón sớm ≤ 3 ngày; trễ < 3 ngày vẫn thu được;
 * ≥ 3 ngày mà chưa PAID thì BE hủy no-show). BE vẫn là nguồn chốt — FE chỉ dùng để ẩn/khoá
 * nút và giải thích lý do thay vì để người dùng bấm rồi nhận lỗi.
 */
export const receptionWindow = (
  c: { expectedReceptionDate?: string | null; moveInDate?: string | null; startDate?: string | null },
  today: string,
): ReceptionWindow => {
  const due = onboardDueDate(c);
  if (!due) return { due: null, tooEarly: false, earliest: null, pastGrace: false, cancelOn: null };
  const earliest = shiftIsoDate(due, -ONBOARD_EARLY_DAYS);
  const cancelOn = shiftIsoDate(due, ONBOARD_NO_SHOW_GRACE_DAYS);
  return { due, tooEarly: today < earliest, earliest, pastGrace: today >= cancelOn, cancelOn };
};
