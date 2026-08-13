/**
 * Chu kỳ TIỀN PHÒNG TỰ ĐỘNG — nguồn sự thật duy nhất cho manager + tenant.
 *
 * Chính sách (chốt 04/08/2026, bổ sung kỳ đầu/kỳ cuối 05/08/2026):
 *   • KỲ ĐẦU (khách vào giữa tháng): tiền từ NGÀY NHẬN PHÒNG đến hết tháng nằm NGAY
 *                             TRONG mã QR lúc đón khách, thu chung một lần với tiền
 *                             cọc (BE 609de59/276b613, 12/08/2026) — khách rời quầy
 *                             là đã trả xong. Từ tháng sau mới theo chu kỳ ngày 1–5.
 *                             Vì vậy KHÔNG có hoá đơn kỳ đầu chờ thanh toán, và cũng
 *                             không còn mốc nhắc/quá hạn riêng cho kỳ đầu.
 *   • KỲ CUỐI (trả phòng giữa tháng): hoá đơn tính từ ngày 1 đến NGÀY MANAGER DUYỆT
 *                             rời phòng, phát hành ngay lúc duyệt; khách trả phần còn
 *                             lại (chênh lệch vào bảng quyết toán).
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
 *     gửi xong BE bắn thông báo cho khách ngay.
 *
 * ✅ BE ĐÃ KHỚP chính sách này (verify 08/08/2026 — BE commit a52c370):
 *   - generateMonthlyRentInvoices : 00:05 ngày 1, dueDate = ngày 5
 *   - remindUpcomingRentOn28th    : 00:10 ngày 28
 *   - runDailySweep (08:00 mỗi ngày): nhắc mỗi ngày 2–4, hạn ngày 5, nhắc lần cuối
 *     ngày 7, và từ ngày 8 (`overdueDays >= termination-after-days`) thì báo quản lý
 *     + host rồi set contract.terminationProposed = true.
 *   - Các mốc nằm ở application.yaml: billing.rent.{due-day, final-reminder-day,
 *     termination-after-days} — đúng bằng các số trong RENT_CYCLE bên dưới.
 *
 * File này là NGUỒN SỰ THẬT phía FE. Đổi số ở đây thì phải đổi cả application.yaml
 * của BE, nếu không hai bên nói hai kiểu với cùng một người dùng.
 *
 * Kỳ đầu chỉ còn là CÁCH CHIA TIỀN theo số ngày ở (partialRentCycle) để giải thích con
 * số lẻ cho khách, không còn là một kỳ thu riêng.
 */

import { serverNow } from '@/utils/serverTime';

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
/** Câu giải thích 2 kỳ lẻ (vào/ra giữa tháng) — dùng ở màn tiền phòng & trả phòng. */
export const RENT_PARTIAL_CYCLE_NOTE =
  'Vào giữa tháng: tiền kỳ đầu tính từ ngày nhận phòng đến hết tháng và đã nằm trong mã QR ' +
  'lúc đón khách (thu chung một lần với tiền cọc) — không có hoá đơn riêng phải đòi sau. ' +
  'Trả phòng giữa tháng: hoá đơn kỳ cuối tính từ ngày 1 đến ngày quản lý duyệt rời phòng, gửi khách ngay khi duyệt.';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM" */
export const toMonthKey = (d: Date = serverNow()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

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
export const rentNoticeMonth = (now: Date = serverNow()): string =>
  now.getDate() === RENT_CYCLE.preNoticeDay
    ? shiftMonthKey(toMonthKey(now), 1)
    : toMonthKey(now);

/** Kỳ mà hệ thống phải phát hành hoá đơn tính tới hôm nay (từ ngày 1 là kỳ tháng này). */
export const rentBillingMonth = (now: Date = serverNow()): string => toMonthKey(now);

/** Số ngày của kỳ "YYYY-MM". */
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y && m ? new Date(y, m, 0).getDate() : 30;
};

/** Ngày (số) của "YYYY-MM-DD" nếu nó nằm trong tháng `month`, ngược lại null. */
const dayWithinMonth = (month: string, iso?: string): number | null => {
  if (!iso || !iso.startsWith(month)) return null;
  const d = Number(iso.slice(8, 10));
  return Number.isFinite(d) && d > 0 ? d : null;
};

export interface PartialRentCycle {
  /** 'first' = khách vào giữa tháng · 'last' = trả phòng giữa tháng. */
  kind: 'first' | 'last';
  fromDay: number;
  toDay: number;
  days: number;
  /** Tiền ước tính theo ngày — số CHÍNH THỨC do BE tính, đây chỉ để đối chiếu. */
  amount: number;
  label: string;
}

/**
 * Kỳ tính tiền lẻ của một hợp đồng trong tháng `month` (null = trọn tháng).
 *
 * • Khách nhận phòng giữa tháng  → tính từ ngày nhận đến hết tháng.
 * • Trả phòng giữa tháng         → tính từ ngày 1 đến ngày rời phòng (ngày quản lý duyệt).
 * Công thức khớp BE: tiền tháng ÷ số ngày trong tháng × số ngày ở (làm tròn).
 */
export const partialRentCycle = (
  month: string,
  rentAmount: number,
  startDate?: string,
  endDate?: string,
): PartialRentCycle | null => {
  const total = daysInMonth(month);
  const startDay = dayWithinMonth(month, startDate);
  const endDay = dayWithinMonth(month, endDate);
  const [, mm] = month.split('-');

  // Trả phòng giữa tháng được ưu tiên: đó là kỳ cuối, quyết định số tiền phải thu.
  if (endDay != null && endDay < total) {
    const days = endDay;
    return {
      kind: 'last', fromDay: 1, toDay: endDay, days,
      amount: Math.round((rentAmount * days) / total),
      label: `Kỳ cuối · 01/${mm} → ${pad(endDay)}/${mm} (${days} ngày)`,
    };
  }
  if (startDay != null && startDay > 1) {
    const days = total - startDay + 1;
    return {
      kind: 'first', fromDay: startDay, toDay: total, days,
      amount: Math.round((rentAmount * days) / total),
      label: `Kỳ đầu · ${pad(startDay)}/${mm} → ${pad(total)}/${mm} (${days} ngày)`,
    };
  }
  return null;
};

export type RentNoticeStage =
  | 'PRE_NOTICE'     // ngày 28: nhắc trước
  | 'ISSUED'         // ngày 1: đã có hoá đơn
  | 'DUE_SOON'       // ngày 2–4: nhắc mỗi ngày
  | 'DUE_TODAY'      // ngày 5: hạn cuối
  | 'FINAL_WARNING'; // ngày 7: nhắc lần cuối

/** Hôm nay rơi vào mốc nhắc nào (null = hôm nay không nhắc gì). */
export const rentNoticeStageOf = (now: Date = serverNow()): RentNoticeStage | null => {
  const d = now.getDate();
  if (d === RENT_CYCLE.preNoticeDay) return 'PRE_NOTICE';
  if (d === RENT_CYCLE.issueDay) return 'ISSUED';
  if (d > RENT_CYCLE.issueDay && d < RENT_CYCLE.dueDay) return 'DUE_SOON';
  if (d === RENT_CYCLE.dueDay) return 'DUE_TODAY';
  if (d === RENT_CYCLE.finalReminderDay) return 'FINAL_WARNING';
  return null;
};

/** Số ngày đã quá hạn (0 nếu chưa tới hạn). dueDate: "YYYY-MM-DD". */
export const daysOverdue = (dueDate: string, now: Date = serverNow()): number => {
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
  now: Date = serverNow(),
): boolean => {
  const st = (status || '').toUpperCase();
  if (st === 'PAID' || st === 'CANCELLED') return false;
  return daysOverdue(dueDate || '', now) >= RENT_TERMINATION_AFTER_DAYS;
};

