/**
 * Chu kỳ TIỀN PHÒNG TỰ ĐỘNG — nguồn sự thật duy nhất cho manager + tenant.
 *
 * Chính sách (chốt 04/08/2026, bổ sung kỳ đầu/kỳ cuối 05/08/2026):
 *   • KỲ ĐẦU (khách vào giữa tháng): hoá đơn tính từ NGÀY NHẬN PHÒNG đến hết tháng,
 *                             phát hành + thu ngay lúc nhận phòng. Từ tháng sau mới
 *                             theo chu kỳ ngày 1–5 như bình thường.
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
 * ⚠️ BE CHƯA khớp chính sách này (đọc lại code 07/08/2026 — BillingCronServiceImpl):
 *   - generateMonthlyRentInvoices: 00:05 ngày 1, dueDate = ngày 5  → ĐÚNG.
 *   - remindUpcomingRentOn28th   : 00:10 ngày 28                   → ĐÚNG.
 *   - runDailySweep (08:00 mỗi ngày) thì KHÔNG nhắc mỗi ngày: chỉ bắn khi còn
 *     đúng 2 ngày tới hạn, đúng ngày tới hạn, và ngày quá hạn đầu tiên (đánh dấu
 *     OVERDUE). Sau đó im lặng tới ĐÚNG ngày quá hạn thứ 10 mới báo quản lý +
 *     host và set contract.terminationProposed = true.
 *
 * ĐÃ CHỐT 07/08/2026 — phương án A: BE sửa cron cho khớp mốc 1–5–7–8 bên dưới,
 * FE GIỮ NGUYÊN các con số này. Tức file này là NGUỒN SỰ THẬT, phần lệch là bug
 * của BE chứ không phải của FE — KHÔNG sửa RENT_CYCLE cho vừa BE.
 * Spec bàn giao: docs/BE-HANDOFF-rent-reminder-schedule-2026-08-07.md.
 * Kỳ đầu (nhận phòng giữa tháng) chạy mốc riêng — xem FIRST_RENT_CYCLE cuối file
 * và docs/BE-HANDOFF-first-cycle-reminder-2026-08-07.md.
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
/** Câu giải thích 2 kỳ lẻ (vào/ra giữa tháng) — dùng ở màn tiền phòng & trả phòng. */
export const RENT_PARTIAL_CYCLE_NOTE =
  'Vào giữa tháng: hoá đơn kỳ đầu tính từ ngày nhận phòng đến hết tháng, thu ngay lúc nhận phòng. ' +
  'Trả phòng giữa tháng: hoá đơn kỳ cuối tính từ ngày 1 đến ngày quản lý duyệt rời phòng, gửi khách ngay khi duyệt.';

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

// ══════════════════════════════════════════════════════════════════════════
// KỲ ĐẦU — hoá đơn ĐẦU TIÊN ngay sau khi khách nhận phòng
// ══════════════════════════════════════════════════════════════════════════
/**
 * Khách vào giữa tháng thì hoá đơn kỳ đầu KHÔNG chạy theo lịch ngày 1–5–7–8 của
 * các tháng sau: lúc đó khách vừa nhận phòng, chưa quen app, và tiền kỳ đầu là
 * khoản chốt niềm tin đầu tiên. Chính sách riêng (chốt 07/08/2026):
 *
 *   • Phát hành ngay lúc nhận phòng (BE: generateProratedRentForNewContract).
 *   • D+1, D+2, D+3 : nhắc MỖI NGÀY 1 lần — push điện thoại + thông báo trong app
 *                     mỗi lần khách mở/đăng nhập app.
 *   • Hết D+3 chưa thanh toán → báo quản lý; từ lúc này quản lý ĐƯỢC QUYỀN chấm
 *                     dứt hợp đồng (app không tự cắt).
 *   • Vẫn KHÔNG tính phí phạt trả chậm.
 *
 * ⚠️ Phần push + báo quản lý là việc của BE — hiện BE chưa làm (vẫn dùng mốc 10
 * ngày dùng chung). FE tự lo phần hiển thị + nhắc trong app. Chi tiết bàn giao:
 * docs/BE-HANDOFF-first-cycle-reminder-2026-08-07.md.
 */
export const FIRST_RENT_CYCLE = {
  /** Số ngày nhắc liên tục sau ngày nhận phòng (D+1 → D+3), mỗi ngày 1 tin. */
  reminderDays: 3,
  /** Quá bấy nhiêu ngày kể từ ngày phát hành mà chưa trả → báo quản lý. */
  graceDays: 3,
} as const;

export const FIRST_RENT_CYCLE_NOTE =
  `Hoá đơn đầu tiên được phát hành ngay khi nhận phòng. Khách có ${FIRST_RENT_CYCLE.graceDays} ngày để thanh toán ` +
  `và được nhắc mỗi ngày. Quá ${FIRST_RENT_CYCLE.graceDays} ngày mà chưa thanh toán thì quản lý được báo và ` +
  `có quyền chấm dứt hợp đồng.`;

/** Lấy phần ngày "YYYY-MM-DD" của một chuỗi ISO (có thể kèm giờ). */
const dateOnly = (iso?: string): string => (iso || '').slice(0, 10);

/** "YYYY-MM-DD" + n ngày -> "YYYY-MM-DD". Chuỗi rỗng/hỏng trả về ''. */
export const addDays = (iso: string, n: number): string => {
  const [y, m, d] = dateOnly(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/** Số ngày đã trôi qua kể từ `iso` (âm nếu `iso` ở tương lai). */
export const daysSince = (iso: string, now: Date = new Date()): number => {
  const [y, m, d] = dateOnly(iso).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const from = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - from.getTime()) / 86_400_000);
};

/** Hình dạng tối thiểu để nhận diện hoá đơn kỳ đầu — khớp cả SharedBill lẫn DTO của BE. */
export interface RentCycleInvoiceLike {
  invoiceType?: string;
  type?: string;
  month?: number;
  year?: number;
  dueDate?: string;
  createdAt?: string;
  /** BE sẽ trả FIRST | REGULAR | LAST — xem doc handoff. Chưa có thì FE tự suy ra. */
  cycleType?: string;
}

/**
 * Hoá đơn này có phải hoá đơn TIỀN PHÒNG KỲ ĐẦU (ngay sau khi nhận phòng) không.
 *
 * Thứ tự tin cậy:
 *   1. `cycleType` của BE — chuẩn nhất, dùng ngay khi BE trả về.
 *   2. `contractStartDate` — kỳ hoá đơn trùng tháng nhận phòng VÀ nhận phòng sau ngày 1.
 *   3. Suy ra từ khoảng cách phát hành → hạn. Kỳ đầu phát hành lúc nhận phòng nên hạn
 *      cách ngày tạo tối đa `graceDays` (BE hiện đặt bằng 0, sau khi sửa sẽ là 3), còn
 *      hoá đơn tháng thường luôn phát hành ngày 1 / hạn ngày 5 → cách 4 ngày. Nhờ vậy
 *      nhận diện đúng cả trước lẫn sau khi BE sửa `dueDate`.
 */
export const isFirstRentCycleInvoice = (
  inv: RentCycleInvoiceLike | null | undefined,
  contractStartDate?: string,
): boolean => {
  if (!inv) return false;
  const type = (inv.invoiceType || inv.type || '').toLowerCase();
  if (type !== 'rent') return false;

  const cycleType = (inv.cycleType || '').toUpperCase();
  if (cycleType) return cycleType === 'FIRST';

  const start = dateOnly(contractStartDate);
  if (start) {
    const [sy, sm, sd] = start.split('-').map(Number);
    if (!sy || !sm || !sd) return false;
    return sd > 1 && inv.year === sy && inv.month === sm;
  }

  const created = dateOnly(inv.createdAt);
  const due = dateOnly(inv.dueDate);
  if (!created || !due) return false;
  const gap = daysSince(created, new Date(`${due}T00:00:00`));
  return gap >= 0 && gap <= FIRST_RENT_CYCLE.graceDays;
};

/** Ngày phát hành kỳ đầu = ngày nhận phòng (dùng createdAt, fallback dueDate). */
export const firstCycleIssuedOn = (inv: RentCycleInvoiceLike): string =>
  dateOnly(inv.createdAt) || dateOnly(inv.dueDate);

/** Hạn thật của kỳ đầu = ngày nhận phòng + graceDays. */
export const firstCycleDeadline = (inv: RentCycleInvoiceLike): string =>
  addDays(firstCycleIssuedOn(inv), FIRST_RENT_CYCLE.graceDays);

/** Còn bao nhiêu ngày trong thời hạn kỳ đầu (0 = hết hạn hôm nay hoặc đã qua). */
export const firstCycleDaysLeft = (
  inv: RentCycleInvoiceLike,
  now: Date = new Date(),
): number => {
  const left = FIRST_RENT_CYCLE.graceDays - daysSince(firstCycleIssuedOn(inv), now);
  return left > 0 ? left : 0;
};

export type FirstCycleStage =
  | 'reminding'   // còn trong 3 ngày — nhắc mỗi ngày
  | 'expired';    // quá 3 ngày — đã báo quản lý, được quyền chấm dứt HĐ

export const firstCycleStage = (
  inv: RentCycleInvoiceLike,
  now: Date = new Date(),
): FirstCycleStage =>
  daysSince(firstCycleIssuedOn(inv), now) > FIRST_RENT_CYCLE.graceDays ? 'expired' : 'reminding';

/**
 * Câu cảnh báo cho khách thuê về hoá đơn kỳ đầu chưa thanh toán.
 * Gom về một chỗ để Home / danh sách / chi tiết hoá đơn nói y hệt nhau.
 */
export const firstCycleTenantWarning = (
  inv: RentCycleInvoiceLike,
  now: Date = new Date(),
): string => {
  if (firstCycleStage(inv, now) === 'expired') {
    return `Đã quá ${FIRST_RENT_CYCLE.graceDays} ngày kể từ ngày nhận phòng — quản lý đã được thông báo và ` +
      `được quyền chấm dứt hợp đồng. Vui lòng thanh toán ngay.`;
  }
  const left = firstCycleDaysLeft(inv, now);
  return `Hoá đơn đầu tiên — còn ${left} ngày để thanh toán (hạn ${dayLabel(firstCycleDeadline(inv))}). ` +
    `Quá hạn thì quản lý được quyền chấm dứt hợp đồng.`;
};

/**
 * Hoá đơn kỳ đầu đã đủ điều kiện để quản lý chấm dứt hợp đồng chưa
 * (chưa thanh toán VÀ đã quá `graceDays` ngày kể từ ngày nhận phòng).
 */
export const canTerminateForUnpaidFirstRent = (
  inv: RentCycleInvoiceLike & { status?: string },
  now: Date = new Date(),
): boolean => {
  const st = (inv.status || '').toUpperCase();
  if (st === 'PAID' || st === 'CANCELLED') return false;
  return firstCycleStage(inv, now) === 'expired';
};
