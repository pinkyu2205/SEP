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
 * ─── CHỐT SỐ ĐIỆN: NGÀY NÀO TRONG THÁNG CŨNG ĐƯỢC (03/10/2026) ─────────────────
 *
 * Luồng vẫn là **quản lý chụp trước, admin phát hành sau**: chỉ số chốt xong nằm chờ, KHÔNG
 * gửi cho khách; admin đẩy hoá đơn EVN của kỳ đó lên thì máy chủ tự nhân đơn giá và phát
 * hành thẳng cho khách thuê.
 *
 * Bỏ mốc "ngày cuối tháng" (có từ 10/09/2026): BE commit 303ca9d (02/10/2026) gỡ hẳn việc
 * điện cuối tháng khỏi danh sách việc lẫn cron nhắc — điện giờ chạy như nước, việc chỉ hiện
 * khi admin đã đẩy giấy mà còn phòng thiếu số. Quy tắc user chốt 03/10/2026:
 *
 *     CHỤP TRONG THÁNG M LÀ CHỐT CHO HOÁ ĐƠN THÁNG M − 1.
 *     (ngày 03/10 chụp công tơ → đó là hoá đơn tháng 9)
 *
 * Trước đây riêng ngày cuối tháng được tính là kỳ của chính tháng đó — mẹo để "khép kỳ"
 * đúng hạn cũ. Hết hạn cố định thì mẹo đó chỉ còn làm ngày 31 đột ngột đổi sang kỳ khác.
 */

/**
 * KỲ ĐANG CHỐT SỐ ĐIỆN = tháng trước tháng hiện tại — trùng `currentPeriod`.
 *
 * Giữ tên riêng vì hai câu hỏi khác nhau ("kỳ đang ĐỌC ĐỒNG HỒ" vs "kỳ đang TÍNH TIỀN"),
 * chỉ là nay chúng có cùng câu trả lời. Muốn đổi quy tắc chụp thì đổi ở đây.
 */
export const meterReadingPeriod = (now: Date = serverNow()) => currentPeriod(now);

/** Cùng kỳ đó ở dạng `yyyy-MM` — dạng DUY NHẤT các API ghi chỉ số nhận. */
export const meterReadingPeriodIso = (now: Date = serverNow()): string => {
  const { month, year } = meterReadingPeriod(now);
  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * Ngày cuối của kỳ đang chốt, `yyyy-MM-dd`. KHÔNG phải hạn chụp — chỉ để biết hợp đồng nào
 * thuộc kỳ: khách dọn vào sau ngày này thì chưa có số của kỳ đó (máy chủ chặn bằng
 * `CONTRACT_NOT_IN_PERIOD`).
 */
export const meterReadingPeriodEnd = (now: Date = serverNow()): string => {
  const { month, year } = meterReadingPeriod(now);
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

/** Câu luật dưới thanh bước của tab Điện — nói rõ số chụp hôm nay thuộc hoá đơn tháng nào. */
export const meterReadingRuleText = (now: Date = serverNow()): string => {
  const { month } = meterReadingPeriod(now);
  return `Chụp ngày nào trong tháng ${now.getMonth() + 1} cũng được — số chốt cho hoá đơn tháng ${month}`
    + ' · tự phát hành khi admin đẩy hoá đơn EVN';
};

/**
 * Câu luật hiện dưới thanh bước của tab NƯỚC (10/09/2026).
 *
 * Nước KHÔNG có mốc cố định như điện: người ghi nước bên công ty nước báo riêng cho quản
 * lý hôm nay xuống nhà nào, ngày đó mỗi tháng một khác. Nên câu này nói mốc là "hôm người
 * ghi nước xuống" chứ không nêu ngày — nêu một ngày cụ thể là hứa sai.
 */
export const WATER_READING_RULE_TEXT =
  'Chốt số đúng hôm người ghi nước xuống · hoá đơn tự phát hành khi admin đẩy hoá đơn nước';
