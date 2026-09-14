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

/**
 * Số đứng NGAY SAU một nhãn cụ thể, trên cùng một dòng chữ phẳng.
 *
 * Vì sao không dùng `amountAfterLabel` cho chỉ số:
 *
 *  1. **Hàm kia lấy số CUỐI dòng.** Giấy nước hay in cả ba nhãn trên một hàng —
 *     `CHỈ SỐ MỚI: 3   CHỈ SỐ CŨ: 0   TIÊU THỤ (m3): 3` — nên "số cuối dòng" trả về cùng
 *     một giá trị cho cả ba nhãn.
 *  2. **Hàm kia loại số 0** (`n > 0`). Đồng hồ mới lắp có chỉ số cũ đúng bằng 0, và đó là
 *     giá trị hợp lệ chứ không phải "không đọc được".
 *
 * Đơn vị `m³` bị gỡ trước khi dò: để nguyên thì nhãn `tiêu thụ (m3)` có chữ số 3 nằm ngay
 * sau nhãn, và hàm này vớ đúng con 3 đó thay vì giá trị thật.
 */
const numberAfterLabel = (flat: string, label: string): number | undefined => {
  // `(?:…)` bọc nhãn là BẮT BUỘC: nhãn truyền vào có dấu `|`, không bọc thì phép hoặc ăn
  // ra ngoài và `chi so moi|cs moi|so doc thang nay[^0-9]{0,12}(\d…)` chỉ gắn phần bắt số
  // vào nhánh CUỐI — hai nhánh đầu khớp xong trả về nhóm 1 rỗng.
  const m = flat.match(new RegExp(`(?:${label})[^0-9]{0,12}(\\d[\\d.,]*)`));
  if (!m?.[1]) return undefined;
  const n = toNumber(m[1]);
  return Number.isFinite(n) ? n : undefined;
};

export const parseWaterInvoice = (ocr: WaterOcrInput): ParsedWaterInvoice => {
  const raw = ocr?.rawText ?? '';
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedWaterInvoice = {};

  // ── Tổng tiền: BẮT BUỘC là "tổng tiền thanh toán", không phải "cộng tiền hàng" ──
  /*
    `.{0,8}` giữa "tong" và "tien" là để ôm các biến thể thật của tờ giấy:
    "Tổng tiền thanh toán", "Tổng cộng tiền thanh toán", và "Tổng SỐ tiền thanh toán".
    Bản trước liệt kê cứng hai cách đầu nên tờ nào viết "Tổng số tiền thanh toán" là ô tổng
    tiền bỏ trống — mà đó là cách viết của mẫu hoá đơn nước đang dùng.
  */
  out.totalAmount = amountAfterLabel(lines, /tong.{0,8}tien thanh toan/);
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
  /*
    `sdb` là nhãn THẬT của Tổng công ty Cấp nước Sài Gòn, và là nhãn hay gặp nhất — tờ giấy
    in `SDB: 1512 284 3356`, không hề có chữ "danh bộ" nào. Thiếu nó là parser bỏ trắng ô
    số danh bộ trên đúng loại hoá đơn phổ biến nhất.

    Chữ số in thành từng nhóm cách nhau bằng khoảng trắng; phần `[\d\s.-]` ôm hết rồi
    `replace` bỏ mọi thứ không phải số, nên `1512 284 3356` về đúng `151228433356`.

    KHÔNG khớp được với hai nhãn nằm ngay cạnh trên cùng tờ giấy: `SỐ ĐỊNH DANH` (không có
    chữ "b" sau "danh") và `MLT: TA4.1301.7750` (giá trị bắt đầu bằng chữ, mà mẫu bắt buộc
    ký tự đầu là chữ số).
  */
  const codeLine = lines.find((l) => /\bsdb\b|danh b[oa]|ma kh\b|ma khach hang/.test(norm(l)));
  if (codeLine) {
    const m = norm(codeLine).match(/(?:\bsdb\b|danh b[oa]|ma kh|ma khach hang)[^0-9a-z]*([0-9][\d\s.-]{6,18})/);
    const digits = m?.[1].replace(/[^0-9]/g, '');
    if (digits && digits.length >= 7) out.customerCode = digits;
  }

  // ── Số m³ tiêu thụ ──
  // Ba cách viết đã gặp trên giấy thật: "Số Lượng Tiêu Thụ", "Lượng nước tiêu thụ (m³)",
  // và "TIÊU THỤ (m3)". Nhãn cuối trần trụi nhất nên để sau cùng.
  out.totalQuantity = amountAfterLabel(
    lines, /so luong tieu thu|luong nuoc tieu thu|tieu thu/, { small: true },
  );
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
  /*
    ĐƯỜNG 1 — ĐỌC THEO NHÃN. Ưu tiên tuyệt đối khi tờ giấy có in nhãn.

    Giấy nước thường in thẳng `CHỈ SỐ MỚI: 3   CHỈ SỐ CŨ: 0`. Đọc đúng nhãn thì chính xác
    tuyệt đối và — quan trọng hơn — xử lý được ĐỒNG HỒ MỚI LẮP, loại có chỉ số cũ bằng 0.

    Cách dò bộ ba ở đường 2 không bao giờ đọc nổi ca đó: nó bỏ qua số 0 khi gom token, và
    còn đòi tiêu thụ phải nhỏ hơn chỉ số cũ — với `3 − 0 = 3` thì điều kiện đó vô nghĩa.
    Nhà mới bàn giao đồng hồ là ca thường gặp, không phải ngoại lệ hiếm.
  */
  const flatForReadings = norm(raw.replace(/\s+/g, ' ')).replace(/\(?\s*m\s*[3³]\s*\)?/g, ' ');
  const labelNew = numberAfterLabel(flatForReadings, 'chi so moi|cs moi|so doc thang nay');
  const labelPrev = numberAfterLabel(flatForReadings, 'chi so cu|cs cu|so doc thang truoc');

  if (labelNew != null && labelPrev != null && labelNew >= labelPrev) {
    out.prevReading = labelPrev;
    out.newReading = labelNew;
    /*
      Hiệu hai chỉ số là con số ĐÁNG TIN NHẤT cho lượng tiêu thụ — nó tự chứng minh bằng
      phép trừ. Chỉ giữ số đọc từ nhãn `tiêu thụ` khi nó khớp; lệch thì tin phép trừ, vì
      nhãn `tiêu thụ` hay đứng cạnh cột "dịch vụ thoát nước" có cùng con số và dễ vớ nhầm.
    */
    const diff = labelNew - labelPrev;
    if (diff > 0 && diff <= MAX_PLAUSIBLE_M3) out.totalQuantity = diff;
  } else {
    // ĐƯỜNG 2 — dò bộ ba tự khớp phép trừ, cho tờ giấy không in nhãn. Đưa số m³ đọc từ
    // nhãn vào làm ràng buộc, giống bên điện.
    const triple = findReadingTriple(raw, MAX_PLAUSIBLE_M3, out.totalQuantity);
    if (triple) {
      out.prevReading = triple.prevReading;
      out.newReading = triple.newReading;
      out.totalQuantity = triple.consumption;
    }
  }

  // ── Kỳ: "Thời gian sử dụng: 07/12/2024 - 06/01/2025" ──
  const periodLine = lines.find((l) => /thoi gian su dung|tu ngay/.test(norm(l)));
  const dates = (periodLine ?? raw).match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  if (dates && dates.length >= 2) {
    out.billingPeriod = `${dates[0]} – ${dates[1]}`;
  }

  return out;
};
