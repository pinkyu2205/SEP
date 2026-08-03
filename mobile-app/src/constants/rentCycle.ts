/**
 * Chu kỳ TIỀN NHÀ TỰ ĐỘNG — nguồn sự thật duy nhất cho manager + tenant.
 *
 * Chính sách (chốt 03/08/2026):
 *   • Ngày 1 hằng tháng : BE tự phát hành hoá đơn tiền nhà cho MỌI hợp đồng ACTIVE
 *                         và đẩy thông báo cho tenant. Manager KHÔNG gửi tay nữa.
 *   • Ngày 5           : hạn nộp (cố định, không còn theo ngày bắt đầu hợp đồng).
 *   • Ngày 6 trở đi    : hoá đơn chuyển QUÁ HẠN. KHÔNG tính phí phạt trả chậm.
 *   • Quá hạn 10 ngày  : báo chủ nhà + gắn cờ ĐỀ NGHỊ CHẤM DỨT HỢP ĐỒNG
 *                        (host/manager tự bấm chấm dứt — hệ thống không tự cắt).
 *   • Điện/nước KHÔNG nằm trong chu kỳ này: manager vẫn ghi chỉ số & gửi tay.
 *
 * Job phát hành + nhắc nợ chạy ở BE — xem docs/BE-HANDOFF-rent-auto-billing-2026-08-03.md.
 * FE chỉ hiển thị kết quả chu kỳ và cho phép manager GỬI TAY các hợp đồng bị sót
 * (job lỗi / HĐ mới ký), giới hạn trong cửa sổ ngày 1–5.
 */

export const RENT_CYCLE = {
  /** Ngày BE tự phát hành hoá đơn tiền nhà. */
  issueDay: 1,
  /** Hạn nộp trong tháng. */
  dueDay: 5,
  /** Quá hạn bao nhiêu ngày thì báo host + đề nghị chấm dứt HĐ. */
  terminationAlertDays: 10,
} as const;

/**
 * Lịch nhắc BE đẩy cho tenant. `offset` = số ngày so với hạn nộp (âm = trước hạn).
 * FE chỉ dùng để hiển thị cho manager biết khách đã được nhắc những mốc nào.
 */
export const RENT_REMINDERS: ReadonlyArray<{ offset: number; label: string }> = [
  { offset: -2, label: 'Nhắc trước hạn 2 ngày' },
  { offset: 0, label: 'Nhắc đúng ngày hạn nộp' },
  { offset: 1, label: 'Báo quá hạn' },
  { offset: RENT_CYCLE.terminationAlertDays - RENT_CYCLE.dueDay, label: 'Báo chủ nhà · đề nghị chấm dứt HĐ' },
];

/** Câu mô tả chính sách, dùng chung cho các banner để không mỗi màn viết một kiểu. */
export const RENT_POLICY_SHORT =
  `Tự phát hành ngày ${RENT_CYCLE.issueDay} · hạn nộp ngày ${RENT_CYCLE.dueDay}`;
export const RENT_POLICY_FULL =
  `Hệ thống tự phát hành hoá đơn tiền nhà ngày ${RENT_CYCLE.issueDay} hằng tháng, hạn nộp ngày ${RENT_CYCLE.dueDay}. ` +
  `Trả trễ KHÔNG bị phạt tiền, nhưng quá hạn ${RENT_CYCLE.terminationAlertDays} ngày sẽ báo chủ nhà và đề nghị chấm dứt hợp đồng.`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM" */
export const toMonthKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** "YYYY-MM" + delta tháng -> "YYYY-MM" */
export const shiftMonthKey = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
};

/** "2026-08" -> "2026-08-01" (ngày BE phát hành). */
export const rentIssueDate = (month: string) => `${month}-${pad(RENT_CYCLE.issueDay)}`;
/** "2026-08" -> "2026-08-05" (hạn nộp). */
export const rentDueDate = (month: string) => `${month}-${pad(RENT_CYCLE.dueDay)}`;

/** "2026-08" -> "Tháng 08/2026" */
export const monthLabel = (month: string) => {
  const [y, m] = month.split('-');
  return `Tháng ${m}/${y}`;
};

/**
 * Cửa sổ cho phép manager gửi tay: chỉ tháng hiện tại và chỉ từ ngày 1 → 5.
 * Ngoài cửa sổ, nút gửi tiền nhà bị khoá (chu kỳ đã chốt, tránh phát hành lệch kỳ).
 */
export const isIssueWindowOpen = (month: string, now: Date = new Date()) => {
  if (month !== toMonthKey(now)) return false;
  const day = now.getDate();
  return day >= RENT_CYCLE.issueDay && day <= RENT_CYCLE.dueDay;
};

/** Lý do nút bị khoá (null = đang mở). Dùng làm text phụ dưới nút cho manager hiểu. */
export const issueWindowReason = (month: string, now: Date = new Date()): string | null => {
  if (isIssueWindowOpen(month, now)) return null;
  if (month !== toMonthKey(now)) return 'Chỉ gửi tay được cho kỳ của tháng hiện tại.';
  return `Ngoài hạn gửi tay (chỉ ngày ${RENT_CYCLE.issueDay}–${RENT_CYCLE.dueDay} hằng tháng).`;
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

export type RentOverdueStage = 'none' | 'overdue' | 'termination';

/** Mức leo thang theo số ngày quá hạn. */
export const overdueStage = (days: number): RentOverdueStage => {
  if (days <= 0) return 'none';
  return days >= RENT_CYCLE.terminationAlertDays ? 'termination' : 'overdue';
};
