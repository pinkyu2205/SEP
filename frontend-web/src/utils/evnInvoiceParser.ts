/**
 * Đọc best-effort hoá đơn EVN từ kết quả OCR (`POST /api/v1/ocr/evn-bill`).
 *
 * EVN tính điện bậc thang nên hoá đơn KHÔNG in đơn giá 1 kWh — chỉ có Tổng kWh, Tổng
 * tiền và Kỳ. Đơn giá của hệ thống = tổng tiền ÷ tổng kWh (xem `evnUnitPrice`).
 *
 * Đây là bản web của parser trong `mobile-app/src/screens/manager/UtilityBillingScreen.tsx`.
 * Từ 13/08/2026 người tải hoá đơn là ADMIN trên web, nên logic đọc phải có mặt ở đây;
 * bản mobile giữ nguyên vì màn trả phòng vẫn cần. Hai bản phải sửa cùng nhau.
 *
 * Kết quả LUÔN cần người xác nhận lại — BE chưa có parser hoá đơn riêng, `/ocr/evn-bill`
 * chỉ trả rawText + danh sách số.
 */
import { serverNow } from '@/utils/serverTime';
import { findReadingTriple } from '@/utils/meterReadingExtract';

/** Kết quả OCR thô mà parser nhận vào. */
export interface EvnOcrInput {
  rawText?: string;
  numbers?: string[];
}

export interface ParsedEvnInvoice {
  totalKwh: string;
  totalAmount: string;
  billingPeriod: string;
  /** Chỉ số công tơ đọc được — chỉ nhà nguyên căn mới cần (xem meterReadingExtract). */
  prevReading?: string;
  newReading?: string;
}

// Dải dấu thanh/dấu phụ Unicode (U+0300–U+036F) mà NFD tách ra khỏi nguyên âm.
// Viết bằng escape ASCII để dấu tổ hợp không nằm trần trong source.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt — nhiều engine OCR trả tiếng Việt mất dấu, chữ số thì không đổi. */
const normalizeVi = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd') // đ/Đ không phải tổ hợp nên NFD không tách được
    .toLowerCase()
    .trim();

export const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');

/** Ngưỡng lọc số vô lý (số bảng kê, mã số thuế, năm... hay bị OCR trộn vào cột kWh). */
const MAX_PLAUSIBLE_KWH = 100_000;

export const parseEvnInvoice = (ocr: EvnOcrInput): ParsedEvnInvoice => {
  const flat = normalizeVi((ocr.rawText || '').replace(/\s+/g, ' '));
  const out: ParsedEvnInvoice = { totalKwh: '', totalAmount: '', billingPeriod: '' };

  // ── Kỳ hoá đơn: "tu 07/04/2022 den 06/05/2022", hoặc fallback "thang 5/2022" ──
  const range = flat.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:den|-|–|~)\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (range) out.billingPeriod = `${range[1]} – ${range[2]}`;
  else {
    const m = flat.match(/thang\s*(\d{1,2})\s*\/\s*(\d{4})/);
    if (m) out.billingPeriod = `Tháng ${m[1]}/${m[2]}`;
  }

  // ── Tổng tiền: ưu tiên dòng "tổng cộng tiền thanh toán" / "total payment" ──
  const amt =
    flat.match(/tong cong tien thanh toan[^\d]*([\d.,]+)/) ||
    flat.match(/total payment[^\d]*([\d.,]+)/) ||
    flat.match(/tong cong[^\d]*([\d.,]+)/) ||
    flat.match(/cong tien hang[^\d]*([\d.,]+)/);
  if (amt) out.totalAmount = onlyDigits(amt[1]);

  if (!out.totalAmount && ocr.numbers?.length) {
    // Fallback: chỉ tin số có dấu phân cách nghìn ("399.585"). Loại được số bảng kê /
    // mã số thuế viết liền (11818865) vốn hay lớn hơn cả tổng tiền.
    const moneyLike = ocr.numbers
      .filter((n) => /\d{1,3}([.,]\d{3})+/.test(n))
      .map((n) => Number(onlyDigits(n)))
      .filter((n) => n > 0);
    if (moneyLike.length) out.totalAmount = String(Math.max(...moneyLike));
  }

  // ── Tổng kWh ──
  // Xoá ngày tháng TRƯỚC khi dò, nếu không "2022" trong "06/05/2022 kWh" bị đọc thành số
  // kWh → đơn giá sai cả chục lần. Sau đó ưu tiên "kwh <số>" (cột ĐVT rồi tới cột Số lượng).
  const noDates = flat
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
    .replace(/\d{1,2}\/\d{4}/g, ' ');
  const kwh =
    noDates.match(/kwh\s*[:\-]?\s*([\d.,]+)/) ||
    noDates.match(/([\d.,]+)\s*kwh/) ||
    noDates.match(/tieu thu[^\d]*?([\d.,]+)/);
  if (kwh) {
    const n = Number(onlyDigits(kwh[1]));
    if (n > 0 && n <= MAX_PLAUSIBLE_KWH) out.totalKwh = String(n);
  }

  /**
   * Chỉ số công tơ + kiểm chéo tổng kWh.
   *
   * Dò theo nhãn không đủ với bảng kê EVN Hà Nội: hàng dữ liệu là
   * `18006996 · 1 · 16.087 · 15.404 · 683` nên "số ngay sau nhãn (kWh)" ra MÃ CÔNG TƠ
   * 18.006.996 — quá ngưỡng nên bị loại và ô kWh bỏ TRỐNG (đã kiểm trên hoá đơn thật).
   * `findReadingTriple` tìm bộ ba tự khớp phép trừ (16.087 − 15.404 = 683) nên không bị
   * mã công tơ / hệ số nhân / tiền thuế lừa.
   */
  const triple = findReadingTriple(ocr.rawText || '', MAX_PLAUSIBLE_KWH);
  if (triple) {
    out.prevReading = String(triple.prevReading);
    out.newReading = String(triple.newReading);
    // Bộ ba đã tự chứng minh bằng phép trừ → tin nó hơn số dò theo nhãn.
    out.totalKwh = String(triple.consumption);
  }

  return out;
};

/**
 * Kỳ thanh toán trọn tháng: "01/08 – 31/08/2026".
 * offset: 0 = tháng này, -1 = tháng trước (hoá đơn EVN thường về vào đầu tháng sau).
 */
export const monthPeriod = (offset = 0, base = serverNow()) => {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `01/${mm} – ${lastDay}/${mm}/${d.getFullYear()}`;
};

/**
 * KỲ TIÊU THỤ mặc định của hoá đơn điện/nước = THÁNG TRƯỚC.
 *
 * Hai loại tiền trong hệ thống chạy ngược chiều nhau:
 *   • Tiền nhà/phòng **trả trước** — tháng 9 khách đóng là đóng cho tháng 9.
 *   • Điện/nước **trả sau**  — tháng 9 khách đóng là đóng cho tháng 8, vì phải hết tháng
 *     8 công tơ mới chốt được và nhà cung cấp mới ra giấy.
 *
 * Nên màn phát hành điện/nước mở ra giữa tháng 9 thì kỳ đang làm là **tháng 8**. Mặc định
 * vào tháng hiện tại là mời admin dán số của tháng 8 vào một bản ghi mang nhãn tháng 9:
 * `month`/`year` là khoá máy chủ chặn trùng kỳ, nên tháng 8 thật sau đó không phát hành
 * được nữa, còn hoá đơn khách nhận thì ghi sai kỳ.
 */
export const arrearsPeriod = (base = serverNow()): { month: number; year: number } => {
  const d = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
};

/**
 * Chuỗi kỳ hiển thị → `{ month, year }`, để tra lại bản ghi hoá đơn tổng của kỳ đó.
 *
 * Lấy tháng ở mốc ĐẦU kỳ: chu kỳ chốt số thật của EVN vắt qua hai tháng
 * (`07/08/2026 – 06/09/2026`) nhưng admin lưu bản ghi vào tháng 8 — mốc đầu mới là cái
 * khớp với `bill.month`. Năm lấy ở mốc cuối, vì đầu kỳ hay được lược năm.
 */
export const periodMonthYear = (raw?: string | null): { month: number; year: number } | null => {
  const s = (raw ?? '').trim();
  const monthOnly = s.match(/^tháng\s*(\d{1,2})\s*\/\s*(\d{4})$/i);
  if (monthOnly) return { month: Number(monthOnly[1]), year: Number(monthOnly[2]) };

  const start = s.match(/(\d{1,2})\/(\d{1,2})/);
  const year = s.match(/\d{4}/g)?.slice(-1)[0];
  if (!start || !year) return null;
  const month = Number(start[2]);
  return month >= 1 && month <= 12 ? { month, year: Number(year) } : null;
};

const daysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();

/**
 * KỲ HOÁ ĐƠN CÓ ĐỌC ĐƯỢC KHÔNG. Trả câu báo lỗi, hoặc `null` khi hợp lệ.
 *
 * Ô kỳ là chữ tự do vì kỳ thật của điện/nước là chu kỳ chốt số (07/08 – 06/09), không
 * trùng tháng dương lịch — nên không ép được thành hai ô ngày. Nhưng chữ tự do nghĩa là
 * gõ thừa một số cũng không ai chặn: `30/09/20226` trông gần đúng, mà đó là khoá quản lý
 * đối chiếu và khoá máy chủ chặn trùng kỳ. Sai thì phải thu hồi hoá đơn đã gửi cho khách.
 *
 * Nhận đúng ba dạng đang có thật trong hệ thống:
 *   • `01/09 – 30/09/2026`            — kỳ trọn tháng (`monthPeriod`)
 *   • `07/04/2022 – 06/05/2022`       — chu kỳ chốt số, cả hai đầu đủ năm (OCR đọc ra)
 *   • `Tháng 5/2022`                  — đường lui của parser khi giấy không in dải ngày
 */
export const periodProblem = (raw: string): string | null => {
  const s = (raw || '').trim().replace(/[–—-]/g, '–').replace(/\s+/g, ' ');
  if (!s) return 'Chưa có kỳ';

  const monthOnly = s.match(/^tháng\s*(\d{1,2})\s*\/\s*(\d{4})$/i);
  if (monthOnly) {
    return Number(monthOnly[1]) >= 1 && Number(monthOnly[1]) <= 12
      ? null : 'Tháng phải từ 1 đến 12';
  }

  const range = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*–\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!range) return 'Định dạng lạ — cần dạng "01/09 – 30/09/2026"';

  const [, d1, m1, y1, d2, m2, y2] = range;
  // Đầu kỳ được phép lược năm ("01/09 – 30/09/2026") → mượn năm của cuối kỳ.
  const start = { d: Number(d1), m: Number(m1), y: Number(y1 ?? y2) };
  const end = { d: Number(d2), m: Number(m2), y: Number(y2) };

  for (const p of [start, end]) {
    if (p.m < 1 || p.m > 12) return 'Tháng phải từ 1 đến 12';
    if (p.d < 1 || p.d > daysInMonth(p.m, p.y)) {
      return `Ngày ${p.d}/${p.m} không có thật`;
    }
  }

  const a = new Date(start.y, start.m - 1, start.d).getTime();
  const b = new Date(end.y, end.m - 1, end.d).getTime();
  if (b <= a) return 'Cuối kỳ phải sau đầu kỳ';
  // Kỳ điện/nước dài nhất cũng chỉ hơn một tháng — dài hơn nghĩa là gõ nhầm năm.
  if (b - a > 70 * 86_400_000) return 'Kỳ dài bất thường — kiểm lại năm';
  return null;
};
