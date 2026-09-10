/**
 * Đọc best-effort HOÁ ĐƠN TIỀN NƯỚC từ kết quả OCR (`POST /api/v1/ocr/evn-bill`).
 *
 * Vì sao KHÔNG dùng chung `parseEvnInvoice`: hai tờ hoá đơn khác hẳn nhau. EVN in
 * "Số lượng kWh" + "Tổng cộng tiền thanh toán"; hoá đơn nước in "Số Lượng Tiêu Thụ (m3)",
 * "Cộng tiền hàng", "Thuế Suất 5%", "Phí BVMT ... 10%", "Tổng tiền thanh toán". Ném tờ
 * nước vào parser EVN thì hoặc không ra gì, hoặc ra SỐ SAI rồi tự điền vào form — nguy
 * hơn để trống, vì admin dễ bấm gửi luôn.
 *
 * ⚠️ Điểm chết người: hoá đơn nước có HAI con số tiền.
 *   • "Cộng tiền hàng"        = tiền nước trước thuế   (vd 116.000)
 *   • "Tổng tiền thanh toán"  = đã gồm VAT + phí BVMT  (vd 133.400)
 * Phải lấy số THỨ HAI. Lấy nhầm số đầu là thu thiếu ~15%, chủ nhà tự bù phần chênh.
 *
 * Kết quả LUÔN cần admin soát lại — BE chỉ trả rawText + danh sách số, không có parser
 * hoá đơn riêng.
 */
import { findReadingTriple } from '@/utils/meterReadingExtract';

export interface WaterOcrInput {
  rawText?: string;
  numbers?: string[];
}

export interface ParsedWaterInvoice {
  /** Tổng m³ tiêu thụ trong kỳ. */
  totalQuantity?: number;
  /** TỔNG TIỀN THANH TOÁN (đã gồm thuế + phí). */
  totalAmount?: number;
  /** Kỳ in trên giấy, vd "07/12/2024 – 06/01/2025". */
  billingPeriod?: string;
  /** Chỉ số đồng hồ đọc được — chỉ nhà nguyên căn mới cần. */
  prevReading?: number;
  newReading?: number;
  /**
   * SỐ DANH BỘ in trên hoá đơn nước — bản song sinh của mã khách hàng EVN.
   *
   * Cùng mục đích: một khoá chính xác nối tờ giấy với căn nhà, thay cho việc so địa chỉ
   * bằng chữ. Xem chú thích dài ở `customerCode` trong `evnInvoiceParser`.
   *
   * Khác một điểm về hình dạng: danh bộ là TOÀN SỐ, không có tiền tố chữ như mã EVN. Nên
   * ở đây bắt buộc phải có nhãn "danh bộ" đứng trước — dò tự do thì mã số thuế, số điện
   * thoại, số tài khoản đều lọt hết.
   */
  customerCode?: string;
}

/** Bỏ dấu tiếng Việt + thường hoá để dò nhãn không phụ thuộc cách gõ dấu của OCR. */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** "133.400" / "133,400" / "133 400" → 133400. Trả NaN nếu không phải số. */
const toNumber = (raw: string): number => {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : NaN;
};

/**
 * Số tiền đứng SAU một nhãn trên cùng dòng (hoặc dòng kế tiếp).
 * Hoá đơn in dạng bảng nên OCR hay tách nhãn và số thành 2 dòng.
 */
const amountAfterLabel = (
  lines: string[],
  labelPattern: RegExp,
  /**
   * `small` = chấp nhận số 1–2 chữ số. Cần cho ô m³: một hộ dùng 4 m³/tháng là bình
   * thường, mà regex tiền đòi tối thiểu 3 ký tự nên bỏ qua mất — đúng ca "Số Lượng Tiêu
   * Thụ (m3) = 4" không đọc được. Với TIỀN thì giữ ngưỡng 3 ký tự để khỏi vơ nhầm số
   * thứ tự dòng (1, 2, 3…) trong bảng.
   */
  opts?: { small?: boolean },
): number | undefined => {
  // Bỏ token đơn vị trước khi dò số, nếu không "(m3)" bị đọc thành số 3.
  const strip = (l: string) => l.replace(/\(?\s*m\s*[3³]\s*\)?/gi, ' ');
  const numRe = opts?.small ? /\d[\d.,]*/g : /\d[\d.,\s]{2,}/g;
  for (let i = 0; i < lines.length; i++) {
    if (!labelPattern.test(norm(lines[i]))) continue;
    // Ưu tiên số nằm ngay trên dòng nhãn, sau đó mới nhìn xuống 3 dòng dưới: hoá đơn in
    // dạng bảng nên OCR hay tách nhãn ("Số Lượng Tiêu Thụ"), đơn vị ("(m3)") và giá trị
    // ("4") thành ba dòng liên tiếp.
    for (const candidate of [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]]) {
      if (!candidate) continue;
      const matches = strip(candidate).match(numRe);
      if (!matches) continue;
      const n = toNumber(matches[matches.length - 1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
};

/** m³ một kỳ của một hộ/căn — quá ngưỡng này là OCR bắt nhầm ô tiền. */
const MAX_PLAUSIBLE_M3 = 9999;

export const parseWaterInvoice = (ocr: WaterOcrInput): ParsedWaterInvoice => {
  const raw = ocr?.rawText ?? '';
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedWaterInvoice = {};

  // ── Tổng tiền: BẮT BUỘC là "tổng tiền thanh toán", không phải "cộng tiền hàng" ──
  out.totalAmount = amountAfterLabel(lines, /tong tien thanh toan|tong cong tien thanh toan/);
  // Không thấy nhãn tổng → thử cộng tay: tiền hàng + thuế + phí BVMT. Vẫn an toàn hơn
  // lấy đại "cộng tiền hàng" vì đó chắc chắn là số THIẾU.
  if (!out.totalAmount) {
    const goods = amountAfterLabel(lines, /cong tien hang/);
    const vat = amountAfterLabel(lines, /thue suat|tien thue/);
    const env = amountAfterLabel(lines, /bvmt|bao ve moi truong/);
    if (goods) out.totalAmount = goods + (vat ?? 0) + (env ?? 0);
  }

  /*
    ── Số danh bộ ────────────────────────────────────────────────────────────
    BẮT BUỘC có nhãn đứng trước, không dò tự do — xem chú thích ở `customerCode`.
    Nhãn viết mỗi nơi một kiểu: "Danh bộ", "Danh bạ", "Mã KH", "Mã khách hàng".
  */
  const codeLine = lines.find((l) => /danh b[oa]|ma kh\b|ma khach hang/.test(norm(l)));
  if (codeLine) {
    const m = norm(codeLine).match(/(?:danh b[oa]|ma kh|ma khach hang)[^0-9a-z]*([0-9][\d\s.-]{6,18})/);
    const digits = m?.[1].replace(/[^0-9]/g, '');
    if (digits && digits.length >= 7) out.customerCode = digits;
  }

  // ── Số m³ tiêu thụ ──
  out.totalQuantity = amountAfterLabel(lines, /so luong tieu thu/, { small: true });
  if (!out.totalQuantity) {
    // Dự phòng: hiệu hai chỉ số "Số Đọc Tháng Này" − "Số Đọc Tháng Trước".
    const now = amountAfterLabel(lines, /so doc thang nay/, { small: true });
    const prev = amountAfterLabel(lines, /so doc thang truoc/, { small: true });
    if (now != null && prev != null && now >= prev) out.totalQuantity = now - prev;
  }
  // m³ quá lớn gần như chắc chắn là OCR bắt nhầm ô tiền. Thà bỏ trống để admin gõ.
  if (out.totalQuantity != null && out.totalQuantity > MAX_PLAUSIBLE_M3) delete out.totalQuantity;

  /**
   * Chỉ số đồng hồ + kiểm chéo m³.
   *
   * Giấy nước thật (Thủ Đức) viết `CS Mới: 4936  CS cũ: 3458  Tiêu thụ: 1478 m3` —
   * KHÔNG khớp nhãn nào ở trên (`so luong tieu thu`, `so doc thang nay/truoc`) nên
   * parser cũ trả về rỗng hoàn toàn, admin phải gõ tay cả 3 ô. `findReadingTriple` bắt
   * bộ ba tự khớp phép trừ nên đọc được bất kể nhãn viết tắt kiểu gì và cột nào in trước.
   */
  // Đưa số m³ đọc từ nhãn vào làm ràng buộc, giống bên điện: bộ ba phải trừ ra đúng con
  // số đó thì mới nhận. Chưa đọc được m³ thì bỏ trống và hàm quay về chấm điểm như cũ.
  const triple = findReadingTriple(raw, MAX_PLAUSIBLE_M3, out.totalQuantity);
  if (triple) {
    out.prevReading = triple.prevReading;
    out.newReading = triple.newReading;
    out.totalQuantity = triple.consumption;
  }

  // ── Kỳ: "Thời gian sử dụng: 07/12/2024 - 06/01/2025" ──
  const periodLine = lines.find((l) => /thoi gian su dung|tu ngay/.test(norm(l)));
  const dates = (periodLine ?? raw).match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  if (dates && dates.length >= 2) {
    out.billingPeriod = `${dates[0]} – ${dates[1]}`;
  }

  return out;
};
