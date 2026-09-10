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

/**
 * KỲ ĐANG LÀM của điện/nước = **THÁNG TRƯỚC**, không phải tháng dương lịch hiện tại.
 *
 * Hai loại tiền trong hệ thống chạy ngược chiều nhau:
 *   • Tiền nhà/phòng **trả trước** — tháng 9 khách đóng là đóng cho tháng 9.
 *   • Điện/nước **trả sau** — tháng 9 khách đóng là đóng cho tháng 8, vì phải hết
 *     tháng 8 công tơ mới chốt được và nhà cung cấp mới ra giấy.
 *
 * BUG 02/09/2026 — vì sao phải sửa: web admin đã chuyển sang phát hành theo kỳ trả sau
 * (`arrearsPeriod`), trong khi hàm này vẫn trả tháng dương lịch. Hai đầu nhìn hai kỳ
 * khác nhau: admin phát hành xong kỳ 8/2026 và bắn thông báo "HÔM NAY phải chụp công
 * tơ", quản lý bấm vào thì màn hình đi hỏi kỳ 9/2026 → không thấy gì, hiện đúng câu
 * "Admin chưa tải hoá đơn điện kỳ 9/2026 của nhà này lên hệ thống". Việc thì có thật,
 * mà cả hai bên đều tin là mình đúng.
 *
 * Đây là nguồn sự thật của app quản lý cho kỳ điện/nước — đổi ở đây là đổi cho mọi màn.
 */
export const currentPeriod = (now: Date = serverNow()) => {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
};

/** Cùng kỳ đó ở dạng `yyyy-MM` — dạng BE nhận cho các API ghi chỉ số. */
export const currentPeriodIso = (now: Date = serverNow()): string => {
  const { month, year } = currentPeriod(now);
  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * CHUẨN HOÁ mọi kiểu chuỗi kỳ về `yyyy-MM` — dạng DUY NHẤT máy chủ hiểu.
 *
 * BUG 02/09/2026 — vì sao cần: thông báo của BE gắn kèm `params.period` lấy thẳng từ
 * `bill.getBillingPeriod()`, tức chuỗi HIỂN THỊ cho người đọc (`"01/08 – 31/08/2026"`).
 * Màn hình nhận deep-link đem nguyên chuỗi đó gọi API. `ContractBillingCalendar
 * .parsePeriod` chỉ nhận `yyyy-MM`, `MM/yyyy` hoặc `yyyy/M`, gặp chuỗi kia thì trả rỗng
 * và **lặng lẽ rơi về `YearMonth.now()`** — hỏi kỳ tháng 9 trong khi thông báo nói về
 * tháng 8. Danh sách rỗng, màn hình khoe "Đã chụp đủ" đúng lúc vừa báo phải đi chụp.
 *
 * Lấy tháng ở mốc ĐẦU kỳ, không phải cuối: chu kỳ chốt số thật của EVN vắt qua hai
 * tháng (`07/08/2026 – 06/09/2026`) nhưng admin lưu bản ghi vào tháng 8 — mốc đầu mới
 * là cái khớp với `bill.month`. Năm thì lấy ở mốc cuối, vì đầu kỳ hay được lược năm.
 */
export const toPeriodKey = (raw?: string | null, now: Date = serverNow()): string => {
  const s = (raw ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  const monthOnly = s.match(/^tháng\s*(\d{1,2})\s*\/\s*(\d{4})$/i);
  if (monthOnly) return `${monthOnly[2]}-${monthOnly[1].padStart(2, '0')}`;

  // Mốc đầu kỳ có thể lược năm ("01/08 – 31/08/2026") → mượn năm của mốc cuối.
  const start = s.match(/(\d{1,2})\/(\d{1,2})/);
  const year = s.match(/\d{4}/g)?.slice(-1)[0];
  if (start && year) return `${year}-${start[2].padStart(2, '0')}`;

  return currentPeriodIso(now);
};

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

/**
 * ─── CHỐT SỐ ĐIỆN VÀO NGÀY CUỐI THÁNG (10/09/2026) ────────────────────────────
 *
 * Luồng điện đổi chiều: trước đây admin phát hành hoá đơn EVN xong mới tới lượt quản lý
 * đi chụp đồng hồ, nên ngày chụp là ngày giấy về — rơi vào giữa tháng sau, mỗi nhà một
 * ngày, và chỉ số đọc được đã trôi qua kỳ mất mấy hôm.
 *
 * Nay ngược lại: **quản lý chụp trước, admin phát hành sau**. Hạn chụp là NGÀY CUỐI CÙNG
 * của tháng — cùng một mốc cho mọi nhà, và đúng lúc công tơ khép kỳ. Chỉ số chốt xong nằm
 * chờ, KHÔNG gửi cho khách. Khi admin đẩy hoá đơn EVN của kỳ đó lên, máy chủ tự nhân đơn
 * giá rồi phát hành thẳng cho khách thuê.
 *
 * Nước GIỮ NGUYÊN luồng cũ (admin phát hành → quản lý ghi số → gửi từng phòng).
 */

/** Ngày cuối cùng của tháng chứa `d`. */
const lastDayOfMonth = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Hôm nay có phải ngày cuối tháng — ngày bắt buộc đi chụp đồng hồ điện. */
export const isMeterReadingDay = (now: Date = serverNow()): boolean =>
  now.getDate() === lastDayOfMonth(now);

/**
 * KỲ ĐANG CHỐT SỐ — lệch với `currentPeriod` đúng MỘT ngày trong tháng.
 *
 * Ngày cuối tháng 9 quản lý đi chụp là chốt cho kỳ **tháng 9**; nhưng bước sang tháng 10
 * thì việc còn dang dở vẫn là kỳ tháng 9, tức tháng TRƯỚC — đúng thứ `currentPeriod` trả
 * về. Nên chỉ riêng ngày cuối tháng là lấy tháng hiện tại, còn lại rơi về tháng trước.
 *
 * Không gộp vào `currentPeriod` vì hai hàm trả lời hai câu khác nhau: `currentPeriod` là
 * "kỳ nào đang được TÍNH TIỀN" (điện/nước trả sau → luôn tháng trước), còn hàm này là
 * "kỳ nào đang được ĐỌC ĐỒNG HỒ". Nhập một là ngày cuối tháng hai bên lệch nhau.
 */
export const meterReadingPeriod = (now: Date = serverNow()) => {
  const base = isMeterReadingDay(now)
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { month: base.getMonth() + 1, year: base.getFullYear() };
};

/** Cùng kỳ đó ở dạng `yyyy-MM` — dạng DUY NHẤT các API ghi chỉ số nhận. */
export const meterReadingPeriodIso = (now: Date = serverNow()): string => {
  const { month, year } = meterReadingPeriod(now);
  return `${year}-${String(month).padStart(2, '0')}`;
};

/** Hạn chụp của kỳ đang chốt = ngày cuối tháng của kỳ đó, dạng `yyyy-MM-dd`. */
export const meterReadingDeadline = (now: Date = serverNow()): string => {
  const { month, year } = meterReadingPeriod(now);
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

/** Câu luật hiện dưới thanh bước của tab Điện — thay `UTILITY_WINDOW_TEXT` (chỉ đúng cho nước). */
export const METER_READING_RULE_TEXT =
  'Chốt số vào ngày cuối tháng · hoá đơn tự phát hành khi admin đẩy hoá đơn EVN';
