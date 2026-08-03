/**
 * Cửa sổ CHỐT SỔ ĐIỆN/NƯỚC — nguồn sự thật duy nhất cho màn ghi chỉ số & gửi hoá đơn.
 *
 * Chốt 03/08/2026: điện/nước KHÔNG tự động như tiền nhà (xem @/constants/rentCycle) —
 * manager vẫn ghi chỉ số và gửi tay, nhưng chỉ được làm trong **ngày 1 → 10** hằng tháng.
 * Ngoài khoảng đó nút gửi bị khoá để mọi nhà chốt sổ cùng một kỳ, tránh hoá đơn
 * rải rác giữa tháng làm lệch kỳ đối soát.
 *
 * ⚠️ KHÔNG áp dụng cửa sổ này cho việc chốt chỉ số lúc TRẢ PHÒNG
 * (CheckoutInspectionScreen) — khách có thể trả phòng bất kỳ ngày nào trong tháng.
 */

export const UTILITY_CYCLE = {
  /** Ngày mở chốt sổ. */
  openDay: 1,
  /** Ngày cuối còn gửi được hoá đơn điện/nước. */
  closeDay: 10,
} as const;

export const UTILITY_WINDOW_TEXT =
  `Chốt sổ điện/nước: ngày ${UTILITY_CYCLE.openDay}–${UTILITY_CYCLE.closeDay} hằng tháng`;

/** Hôm nay có nằm trong cửa sổ chốt sổ không. */
export const isUtilityWindowOpen = (now: Date = new Date()) => {
  const day = now.getDate();
  return day >= UTILITY_CYCLE.openDay && day <= UTILITY_CYCLE.closeDay;
};

/** Số ngày còn lại của cửa sổ (0 nếu đã đóng) — để nhắc manager làm sớm. */
export const utilityWindowDaysLeft = (now: Date = new Date()) =>
  isUtilityWindowOpen(now) ? UTILITY_CYCLE.closeDay - now.getDate() : 0;

/** Câu giải thích khi cửa sổ đã đóng (null = đang mở). */
export const utilityWindowReason = (now: Date = new Date()): string | null =>
  isUtilityWindowOpen(now)
    ? null
    : `Đã quá ngày ${UTILITY_CYCLE.closeDay} — kỳ này đã chốt sổ. Mở lại vào ngày ${UTILITY_CYCLE.openDay} tháng sau.`;
