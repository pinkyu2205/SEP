/**
 * Chu kỳ TIỀN PHÒNG TỰ ĐỘNG — nguồn sự thật duy nhất cho manager + tenant.
 *
 * Chính sách (chốt 04/08/2026):
 *   • Ngày 28 (tháng trước) : nhắc khách chuẩn bị — ngày 1 tới hạn đóng tiền phòng.
 *   • Ngày 1                : hệ thống TỰ phát hành hoá đơn tiền phòng cho MỌI hợp
 *                             đồng ACTIVE và báo khách. Manager KHÔNG gửi tay nữa.
 *   • Ngày 1 → 5            : ngày nào cũng nhắc nếu khách chưa thanh toán.
 *   • Ngày 5                : HẠN CUỐI.
 *   • Ngày 7                : nhắc lần cuối nếu vẫn chưa thanh toán.
 *   • Từ ngày 8             : quản lý ĐƯỢC QUYỀN chấm dứt hợp đồng vì không thanh
 *                             toán (app không tự cắt — người quản lý bấm và chịu
 *                             trách nhiệm).
 *   • KHÔNG tính phí phạt trả chậm.
 *   • Điện/nước KHÔNG nằm trong chu kỳ này: manager vẫn ghi chỉ số & gửi tay, nhưng
 *     gửi xong khách vẫn nhận thông báo ngay (services/shared/billingNotifier).
 *
 * Job phát hành + nhắc nợ đúng ra phải chạy ở BE. BE chưa có nên app tự làm tạm
 * (services/manager/rentAutoBilling + services/shared/billingNotifier) — xem
 * docs/BE-NEED-rent-auto-cycle-2026-08-04.md.
 */

export const RENT_CYCLE = {
  /** Ngày hệ thống tự phát hành hoá đơn tiền phòng. */
  issueDay: 1,
  /** Hạn nộp trong tháng. */
  dueDay: 5,
  /** Ngày nhắc trước (ở tháng liền trước kỳ thu). */
  preNoticeDay: 28,
  /** Ngày nhắc lần cuối sau khi đã quá hạn. */
  finalReminderDay: 7,
  /** Từ ngày này manager được quyền chấm dứt hợp đồng vì không thanh toán. */
  terminationFromDay: 8,
} as const;

/** Quá hạn bao nhiêu ngày thì manager được quyền chấm dứt HĐ (ngày 8 − hạn ngày 5). */
export const RENT_TERMINATION_AFTER_DAYS =
  RENT_CYCLE.terminationFromDay - RENT_CYCLE.dueDay;

/** Các mốc trong chu kỳ — dùng vẽ dải "lịch nhắc" cho manager xem. */
export const RENT_REMINDER_STEPS: ReadonlyArray<{ day: string; label: string }> = [
  { day: `${RENT_CYCLE.preNoticeDay}`, label: 'Nhắc trước: ngày 1 tới hạn' },
  { day: `${RENT_CYCLE.issueDay}`, label: 'Tự phát hành hoá đơn + báo khách' },
  { day: `${RENT_CYCLE.issueDay + 1}–${RENT_CYCLE.dueDay - 1}`, label: 'Nhắc mỗi ngày' },
  { day: `${RENT_CYCLE.dueDay}`, label: 'Hạn cuối thanh toán' },
  { day: `${RENT_CYCLE.finalReminderDay}`, label: 'Nhắc lần cuối' },
  { day: `${RENT_CYCLE.terminationFromDay}+`, label: 'Được quyền chấm dứt HĐ' },
];

/** Câu mô tả chính sách, dùng chung cho các banner để không mỗi màn viết một kiểu. */
export const RENT_POLICY_SHORT =
  `Tự phát hành ngày ${RENT_CYCLE.issueDay} · hạn nộp ngày ${RENT_CYCLE.dueDay}`;
export const RENT_POLICY_FULL =
  `Hệ thống tự phát hành hoá đơn tiền phòng ngày ${RENT_CYCLE.issueDay} hằng tháng, hạn nộp ngày ${RENT_CYCLE.dueDay} — quản lý không cần gửi tay. ` +
  `Khách được nhắc từ ngày ${RENT_CYCLE.preNoticeDay} tháng trước, mỗi ngày trong kỳ ${RENT_CYCLE.issueDay}–${RENT_CYCLE.dueDay}, và nhắc lần cuối ngày ${RENT_CYCLE.finalReminderDay}. ` +
  `Trả trễ KHÔNG bị phạt tiền, nhưng từ ngày ${RENT_CYCLE.terminationFromDay} mà vẫn chưa thanh toán thì quản lý được quyền chấm dứt hợp đồng.`;

/**
 * Nhịp app kiểm tra hoá đơn mới / mốc nhắc nợ (useBillingWatcher).
 * 3 phút: quản lý gửi hoá đơn điện–nước xong thì khách thấy thông báo gần như ngay,
 * mà vẫn nhẹ vì mỗi lần chỉ là 1 request danh sách hoá đơn.
 */
export const BILLING_POLL_MS = 180_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM" */
export const toMonthKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** "YYYY-MM" + delta tháng -> "YYYY-MM" */
export const shiftMonthKey = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
};

/** "2026-08" -> "2026-08-01" (ngày phát hành). */
export const rentIssueDate = (month: string) => `${month}-${pad(RENT_CYCLE.issueDay)}`;
/** "2026-08" -> "2026-08-05" (hạn nộp). */
export const rentDueDate = (month: string) => `${month}-${pad(RENT_CYCLE.dueDay)}`;

/** "2026-08" -> "Tháng 08/2026" */
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-');
  return `Tháng ${m}/${y}`;
};

/** "2026-08-05" -> "05/08/2026" */
export const dayLabel = (iso: string) => (iso || '').split('-').reverse().join('/');

/**
 * Kỳ thu mà hôm nay đang nhắc tới.
 * Ngày 28 là nhắc TRƯỚC cho kỳ THÁNG SAU; các mốc còn lại thuộc kỳ tháng hiện tại.
 */
export const rentNoticeMonth = (now: Date = new Date()): string =>
  now.getDate() === RENT_CYCLE.preNoticeDay
    ? shiftMonthKey(toMonthKey(now), 1)
    : toMonthKey(now);

/** Kỳ mà hệ thống phải phát hành hoá đơn tính tới hôm nay (từ ngày 1 là kỳ tháng này). */
export const rentBillingMonth = (now: Date = new Date()): string => toMonthKey(now);

export type RentNoticeStage =
  | 'PRE_NOTICE'     // ngày 28: nhắc trước
  | 'ISSUED'         // ngày 1: đã có hoá đơn
  | 'DUE_SOON'       // ngày 2–4: nhắc mỗi ngày
  | 'DUE_TODAY'      // ngày 5: hạn cuối
  | 'FINAL_WARNING'; // ngày 7: nhắc lần cuối

/** Hôm nay rơi vào mốc nhắc nào (null = hôm nay không nhắc gì). */
export const rentNoticeStageOf = (now: Date = new Date()): RentNoticeStage | null => {
  const d = now.getDate();
  if (d === RENT_CYCLE.preNoticeDay) return 'PRE_NOTICE';
  if (d === RENT_CYCLE.issueDay) return 'ISSUED';
  if (d > RENT_CYCLE.issueDay && d < RENT_CYCLE.dueDay) return 'DUE_SOON';
  if (d === RENT_CYCLE.dueDay) return 'DUE_TODAY';
  if (d === RENT_CYCLE.finalReminderDay) return 'FINAL_WARNING';
  return null;
};

/** Số ngày đã quá hạn (0 nếu chưa tới hạn). dueDate: "YYYY-MM-DD". */
export const daysOverdue = (dueDate: string, now: Date = new Date()): number => {
  if (!dueDate) return 0;
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const due = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
};

export type RentOverdueStage = 'none' | 'overdue' | 'final' | 'termination';

/** Mức leo thang theo số ngày quá hạn. */
export const overdueStage = (days: number): RentOverdueStage => {
  if (days <= 0) return 'none';
  if (days >= RENT_TERMINATION_AFTER_DAYS) return 'termination';
  // Quá hạn nhưng chưa tới ngày nhắc cuối (ngày 7 = quá hạn 2 ngày).
  return days >= RENT_CYCLE.finalReminderDay - RENT_CYCLE.dueDay ? 'final' : 'overdue';
};

/**
 * Hoá đơn tiền phòng này đã đủ điều kiện để manager chấm dứt hợp đồng chưa.
 * Điều kiện: chưa thanh toán VÀ đã qua ngày nhắc cuối (quá hạn ≥ 3 ngày = từ ngày 8).
 */
export const canTerminateForUnpaidRent = (
  dueDate: string | undefined,
  status: string | undefined,
  now: Date = new Date(),
): boolean => {
  const st = (status || '').toUpperCase();
  if (st === 'PAID' || st === 'CANCELLED') return false;
  return daysOverdue(dueDate || '', now) >= RENT_TERMINATION_AFTER_DAYS;
};
