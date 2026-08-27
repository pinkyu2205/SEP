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

/** Kết quả OCR thô mà parser nhận vào. */
export interface EvnOcrInput {
  rawText?: string;
  numbers?: string[];
}

export interface ParsedEvnInvoice {
  totalKwh: string;
  totalAmount: string;
  billingPeriod: string;
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
