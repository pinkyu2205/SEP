/**
 * QUY TẮC GỬI HOÁ ĐƠN ĐIỆN/NƯỚC — nguồn sự thật duy nhất cho màn ghi chỉ số & gửi hoá đơn.
 *
 * ─── Lịch sử ───────────────────────────────────────────────────────────────────
 * Chốt 03/08/2026: manager chỉ được ghi chỉ số và gửi hoá đơn trong **ngày 1 → 10**
 * hằng tháng; ngoài khoảng đó nút gửi bị khoá. Mục đích là ép mọi nhà chốt cùng một kỳ.
 *
 * GỠ 13/08/2026: cửa sổ ngày 1–10 bị BỎ HẲN. Thực tế hoá đơn EVN về rải rác giữa tháng,
 * khách dọn vào/dọn ra bất kỳ ngày nào, nên cái khung 10 ngày chỉ làm manager kẹt chứ
 * không làm số liệu sạch hơn. Giờ **ngày nào trong tháng cũng gửi được**.
 *
 * ─── Thứ THAY THẾ nó ───────────────────────────────────────────────────────────
 * Bỏ khoá theo NGÀY thì phải có khoá theo SỐ LẦN, nếu không manager bấm gửi mười lần là
 * khách nhận mười hoá đơn cùng kỳ. Quy tắc mới:
 *
 *     MỖI KHÁCH THUÊ CHỈ NHẬN ĐÚNG 1 HOÁ ĐƠN ĐIỆN VÀ 1 HOÁ ĐƠN NƯỚC TRONG 1 KỲ.
 *
 * Đã gửi rồi thì nút khoá lại cho tới kỳ sau — bất kể hoá đơn đó khách đã trả tiền hay
 * chưa. (Khoá cũ chỉ chặn khi khách đã trả ĐỦ, nên trước lúc khách trả tiền manager vẫn
 * gửi trùng được — đó chính là lỗ hổng spam.)
 *
 * ⚠️ BE đang chặn ĐỘC LẬP bằng `UtilityInvoiceServiceImpl.validateBillingPeriodLock`
 * (ném 409 UTILITY_WINDOW_CLOSED khi qua ngày 10). Mở phía FE KHÔNG gỡ được rào đó —
 * BE phải bỏ theo, xem doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md mục "Mở khoá ngày 10".
 */

import { serverNow } from '@/utils/serverTime';

/** Kỳ hoá đơn hiện tại (tháng dương lịch) — đơn vị để đếm "đã gửi 1 lần chưa". */
export const currentPeriod = (now: Date = serverNow()) => ({
  month: now.getMonth() + 1,
  year: now.getFullYear(),
});

/**
 * Còn gửi được hoá đơn điện/nước không.
 *
 * Giữ lại hàm này (thay vì xoá mọi lời gọi) vì màn hình cần một chỗ duy nhất để hỏi
 * "được gửi không" — nếu sau này có ràng buộc thời gian khác thì sửa ở đây.
 * Hiện tại: LUÔN mở, mọi ngày trong tháng.
 */
export const isUtilityWindowOpen = (_now: Date = serverNow()) => true;

export const UTILITY_WINDOW_TEXT = 'Gửi được mọi ngày trong tháng · mỗi khách 1 hoá đơn/kỳ';

/**
 * Câu giải thích khi KHÔNG gửi được (null = gửi được).
 * Sau 13/08/2026 không còn lý do nào theo ngày nữa → luôn null. Lý do duy nhất còn lại
 * là "kỳ này đã gửi rồi", và câu đó do `alreadySentReason` bên dưới lo.
 */
export const utilityWindowReason = (_now: Date = serverNow()): string | null => null;

/** Câu chặn khi khách đã nhận hoá đơn loại này trong kỳ. */
export const alreadySentReason = (
  type: 'ELECTRICITY' | 'WATER',
  target: string,
  now: Date = serverNow(),
): string => {
  const { month, year } = currentPeriod(now);
  const label = type === 'ELECTRICITY' ? 'điện' : 'nước';
  return `${target} đã nhận hoá đơn ${label} của kỳ ${month}/${year}.\n\n`
    + `Mỗi khách chỉ nhận 1 hoá đơn ${label} mỗi kỳ để tránh gửi trùng. `
    + 'Nút sẽ mở lại vào kỳ sau. Nếu số liệu sai, nhờ admin huỷ hoá đơn cũ trước.';
};
