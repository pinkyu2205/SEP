/**
 * KIỂM ẢNH ĐỒNG HỒ ĐIỆN/NƯỚC trước khi chấp nhận.
 *
 * Vì sao cần: chỉ số điện/nước là tiền thật. Nếu chỉ cần "một ảnh có số" thì người
 * chụp có thể ghi số ra giấy rồi chụp tờ giấy — OCR vẫn đọc ra số và app vẫn nhận.
 * Hàm này soi TOÀN BỘ chữ OCR đọc được (`rawText`) để đòi hỏi ảnh phải có dấu hiệu
 * của MẶT ĐỒNG HỒ thật: đơn vị (kWh, m³), tên hãng, thông số kỹ thuật, serial...
 *
 * Không phải bộ nhận dạng ảnh — chỉ là rào chắn dựa trên chữ trong ảnh, đủ để chặn
 * kiểu gian lận "ghi số ra giấy", và luôn nói rõ lý do để người chụp chụp lại.
 */

export type MeterKind = 'elec' | 'water';

/** Kết quả kiểm tra ảnh đồng hồ. */
export interface MeterPhotoCheck {
  /** Có chấp nhận ảnh này không. */
  ok: boolean;
  /** Chỉ số đọc được (chuỗi số) — chỉ có khi ok. */
  reading?: string;
  /**
   * Các số khác OCR đọc được trên ảnh, đã xếp theo độ hợp lý giảm dần và bỏ số đã
   * chọn làm `reading`. Dùng để hiện nút cho người nhập bấm đổi nhanh khi máy chọn
   * sai — luôn có sẵn vì không heuristic nào đúng 100% với mặt đồng hồ cũ/mờ.
   */
  candidates?: string[];
  /** Lý do từ chối, hiển thị thẳng cho người dùng. */
  reason?: string;
  /**
   * 'high' = thấy đơn vị/hãng của đúng loại đồng hồ.
   * 'low'  = chỉ thấy dấu hiệu chung (serial/model) → nhận nhưng nhắc kiểm tra lại.
   */
  confidence: 'high' | 'low';
}

/** Dữ liệu OCR tối thiểu cần để kiểm (khớp OcrMeterResponse của BE). */
export interface MeterOcrLike {
  reading?: string;
  numbers?: string[];
  rawText?: string;
}

// Ghi cả dạng CÓ DẤU lẫn KHÔNG DẤU: OCR đọc mặt đồng hồ thường ra chữ không dấu,
// nhưng vài nhãn tiếng Việt vẫn có dấu. Không dùng normalize() vì Hermes cũ hay thiếu.
//
// ⚠️ Mọi gợi ý ở đây được so khớp theo RANH GIỚI TỪ (xem `hasHint`), không phải
// `includes`. Trước 08/08/2026 dùng `includes` nên gợi ý ngắn của điện — nhất là
// 'wh', 'kw', ' v ' — dính vào chữ tiếng Anh bất kỳ in trên mặt đồng hồ NƯỚC, khiến
// ảnh nước đúng bị đuổi với thông báo "đây là đồng hồ điện". Vì vậy KHÔNG thêm gợi
// ý dưới 3 ký tự vào các mảng này.
const ELEC_HINTS = [
  'kwh', 'kw h', 'k wh', 'imp/kwh', 'imp / kwh', 'kwh meter', 'watt',
  'cong to', 'côngtơ', 'công tơ', 'congto', 'dien nang', 'điện năng', 'dien tu',
  '50hz', '60hz', '220v', '230v', '110v', 'ampe',
  'emic', 'vinasino', 'gelex', 'elster', 'landis', 'hexing', 'genius',
  '1 pha', '3 pha', 'one phase', 'three phase',
  // Công tơ ĐIỆN TỬ (màn LCD) — nhãn in quanh màn hoặc chính chữ trên màn.
  'total', 'rate', 'active', 'import', 'export',
  'ddsy', 'dtsd', 'dds', 'dts', 'kwh total', 'energy',
];

const WATER_HINTS = [
  'm3', 'm³', 'm 3', 'm^3', 'x0.0001', 'x 0.0001', 'x0.001', 'x0.01',
  'nuoc', 'nước', 'water', 'water meter', 'dong ho nuoc', 'đồng hồ nước',
  'nuoc sach', 'nước sạch', 'cap nuoc', 'cấp nước',
  'q3', 'qn', 'qmax', 'dn15', 'dn20', 'dn25', 'dn 15', 'dn 20',
  'r80', 'r160', 'iso 4064', 'iso4064',
  'asahi', 'unik', 'zenner', 'sensus', 'itron', 'komax', 'flodis', 'multi jet',
  'sawaco', 'hawacom', 'viwasupco', 'hawaco',
  // 'm³' hay bị Vision đọc nhầm thành các dạng dưới đây.
  'rn3', 'rn³', 'm-3',
];

/** Dấu hiệu chung của một thiết bị đo (không phân biệt điện/nước). */
const DEVICE_HINTS = [
  'no.', 'no ', 'serial', 's/n', 'model', 'type', 'made in', 'vietnam', 'viet nam',
  'class', 'cap chinh xac', 'cấp chính xác', 'iso', 'tcvn', 'qcvn', 'kiem dinh', 'kiểm định',
];

const LABEL: Record<MeterKind, string> = { elec: 'điện', water: 'nước' };

const countDigits = (s: string) => (s.match(/\d/g) ?? []).length;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * So khớp gợi ý theo RANH GIỚI CHỮ CÁI thay vì `includes`.
 *
 * Chặn hai bên bằng "không phải a-z" chứ không dùng `\b`: nhiều gợi ý có ký tự lạ
 * (`m³`, `imp/kwh`, `x0.001`) mà `\b` xử lý sai. Cho phép CHỮ SỐ đứng sát vì OCR
 * hay dính chỉ số vào đơn vị — "00123m3" vẫn phải nhận ra 'm3'.
 */
const hasHint = (text: string, hint: string): boolean =>
  new RegExp(`(^|[^a-z])${escapeRe(hint)}([^a-z]|$)`, 'i').test(text);

const countHints = (text: string, hints: string[]): number =>
  hints.reduce((n, h) => (hasHint(text, h) ? n + 1 : n), 0);

// ── Tách phần nguyên / phần thập phân của chỉ số ─────────────────────────────
//
// Ô hiển thị công tơ gồm các chữ số PHẦN NGUYÊN (nền trắng/đen) rồi tới các chữ số
// PHẦN THẬP PHÂN (thường nền đỏ). Trước 08/08/2026 code lấy nguyên cả dãy làm chỉ
// số, nên công tơ đọc `030815` (= 3081,5 kWh) bị ghi thành 30815 — SAI GẤP 10 LẦN,
// và đó là con số dùng để tính tiền điện.
//
// KHÔNG dò được màu: pipeline là Google Vision TEXT_DETECTION, chỉ trả CHỮ, không
// trả màu pixel. Nên số chữ số thập phân phải do cấu hình từng phòng quyết định
// (BE trả trong RoomResponse.elecDecimalDigits / waterDecimalDigits), mặc định
// điện 1 số lẻ, nước 3 số lẻ.

/** Cấu hình số chữ số của một đồng hồ — khớp `RoomResponse.*Digits` của BE. */
export interface MeterDigitConfig {
  integerDigits: number;
  decimalDigits: number;
}

export const DEFAULT_DIGIT_CONFIG: Record<MeterKind, MeterDigitConfig> = {
  elec: { integerDigits: 5, decimalDigits: 1 },
  water: { integerDigits: 5, decimalDigits: 3 },
};

export interface SplitReading {
  /** Chữ số phần nguyên, giữ cả số 0 ở đầu để hiện đúng mặt đồng hồ. */
  integerPart: string;
  /** Chữ số phần thập phân (phần "màu đỏ"). Rỗng khi đồng hồ không có số lẻ. */
  decimalPart: string;
  /** Giá trị thật, còn nguyên phần lẻ — ĐÂY là số gửi lên BE. */
  value: number;
  /** Đã làm tròn theo luật mentor (chỉ để hiển thị/đối chiếu, xem `roundByMentorRule`). */
  rounded: number;
}

/**
 * Luật làm tròn mentor chốt 07/08/2026: chữ số lẻ đầu tiên **LỚN HƠN 5** mới lên 1.
 * Tức chữ số bằng 5 thì làm tròn XUỐNG — khác `Math.round` thông thường (5 lên 1).
 */
export function roundByMentorRule(integerPart: string, decimalPart: string): number {
  const base = Number(integerPart || '0');
  return base + (isAboveHalf(decimalPart) ? 1 : 0);
}

/**
 * Lõi của luật `>5`, diễn đạt lại thành "phần lẻ LỚN HƠN một nửa".
 *
 * Với đồng hồ điện (1 chữ số đỏ) hai cách nói là một: chữ số > 5 ⇔ phần lẻ > 0,5.
 * Nhưng đồng hồ nước có tới 3 chữ số đỏ, lúc đó "chỉ nhìn chữ số đầu" thành ra tuỳ
 * tiện (12,567 → nhìn số 5 → xuống, trong khi phần lẻ rõ ràng quá nửa). Dùng ngưỡng
 * nửa đơn vị thì đúng cho mọi số chữ số mà vẫn khớp tuyệt đối với luật mentor chốt.
 *
 * `EPS` chống rác dấu phẩy động của phép trừ số thực: 3090,4 − 3081,9 ra
 * 8.500000000000455, đúng ranh giới, không có epsilon là bị đẩy lên nhầm.
 */
const HALF_EPS = 1e-9;
const isAboveHalf = (decimalPart: string): boolean => {
  const d = (decimalPart || '').replace(/[^\d]/g, '');
  if (!d) return false;
  return Number(`0.${d}`) > 0.5 + HALF_EPS;
};

/**
 * Cùng luật `>5` nhưng cho một SỐ đã tính sẵn — dùng cho SỐ TIÊU THỤ (hiệu hai chỉ số).
 *
 * Vì sao cần bản số: chỉ số nay lưu cả phần lẻ, nên hiệu hai kỳ ra số thực
 * (3090,1 − 3081,9 = 8,2). Không làm tròn thì hoá đơn nhận nguyên rác dấu phẩy động
 * kiểu `8.199999999999932`.
 *
 * ⚠️ Đây là PHƯƠNG ÁN (b) ở Phần F doc PLAN: trừ trước rồi mới làm tròn. Nếu BA chốt
 * phương án (a) — làm tròn từng chỉ số rồi mới trừ — thì đổi ở chỗ GỌI hàm này, đừng
 * sửa luật bên trong (luật `>5` là của mentor, hai phương án dùng chung).
 */
export function roundConsumptionByMentorRule(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const int = Math.floor(abs);
  // Dùng chung ngưỡng nửa đơn vị với `roundByMentorRule` (xem isAboveHalf) — KHÔNG tự
  // đọc chữ số lẻ đầu tiên bằng phép trừ: 8,6 − 8 ra 0.5999999999999996 nên chữ số đó
  // bị đọc thành 5 và số tiêu thụ 8,6 kWh bị làm tròn xuống 8 thay vì lên 9.
  return sign * (int + (abs - int > 0.5 + HALF_EPS ? 1 : 0));
}

/**
 * Cắt dãy chữ số OCR đọc được thành phần nguyên / phần lẻ.
 *
 * @param raw    chuỗi OCR trả về. Nếu đã có dấu `.` (công tơ điện tử in sẵn dấu
 *               thập phân) thì TIN dấu đó, bỏ qua cấu hình — mặt số đã nói rõ rồi.
 * @param config số chữ số của đồng hồ này; thiếu thì dùng mặc định theo loại.
 */
export function splitMeterReading(
  raw: string,
  kind: MeterKind,
  config?: Partial<MeterDigitConfig> | null,
): SplitReading {
  const cfg = {
    ...DEFAULT_DIGIT_CONFIG[kind],
    ...(config ?? {}),
  };
  const decimals = Math.max(0, cfg.decimalDigits ?? 0);

  // Công tơ điện tử in sẵn dấu thập phân → mặt số đã tự khai, không cần đoán.
  const dotted = String(raw ?? '').match(/(\d+)[.,](\d+)/);
  if (dotted) {
    const integerPart = dotted[1];
    const decimalPart = dotted[2];
    return {
      integerPart,
      decimalPart,
      value: Number(`${integerPart}.${decimalPart}`),
      rounded: roundByMentorRule(integerPart, decimalPart),
    };
  }

  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) {
    return { integerPart: '', decimalPart: '', value: 0, rounded: 0 };
  }

  // Dãy ngắn hơn cả phần lẻ khai báo → mặt số này không có phần lẻ (vd công tơ 3
  // pha gián tiếp). Coi hết là phần nguyên còn hơn cắt bừa thành 0,xxx.
  if (decimals === 0 || digits.length <= decimals) {
    return {
      integerPart: digits,
      decimalPart: '',
      value: Number(digits),
      rounded: Number(digits),
    };
  }

  const integerPart = digits.slice(0, digits.length - decimals);
  const decimalPart = digits.slice(digits.length - decimals);
  return {
    integerPart,
    decimalPart,
    value: Number(`${integerPart}.${decimalPart}`),
    rounded: roundByMentorRule(integerPart, decimalPart),
  };
}

// ── Chọn đúng con số là CHỈ SỐ, không phải serial / thông số kỹ thuật ──────────
//
// BE (`OcrServiceImpl.pickBest`) đang chọn số DÀI NHẤT trong ảnh. Trên công tơ
// EMIC thực tế, serial "Số SX: 24562125" (8 chữ số) dài hơn chỉ số "030815"
// (6 chữ số) nên luôn thắng — máy điền sai số, người nhập phải sửa tay mỗi lần.
//
// Ở đây chấm điểm từng số theo NGỮ CẢNH chữ quanh nó trong rawText thay vì chỉ
// nhìn độ dài. Không thay thế được việc người nhập nhìn lại, nên hàm còn trả về
// danh sách số còn lại đã xếp hạng để UI cho bấm đổi.

/** Nhãn đứng TRƯỚC một con số cho biết đó là serial/model — chắc chắn không phải chỉ số. */
const SERIAL_LABELS = [
  'so sx', 'số sx', 'sosx', 'serial', 's/n', 'sn:', 'no.', 'no:', 'number',
  'model', 'type', 'pdm', 'cv', 'ma so', 'mã số',
];

/** Đơn vị đứng SAU một con số cho biết đó là thông số kỹ thuật, không phải chỉ số. */
const SPEC_UNITS = ['v', 'a', 'hz', 'w', '°c', 'oc', 'c', 'imp', 'vong', 'vòng', 'r/kwh'];

/** Đơn vị của chính chỉ số cần lấy. */
const READING_UNITS: Record<MeterKind, string[]> = {
  elec: ['kwh', 'kw h', 'k wh'],
  water: ['m3', 'm³', 'm 3'],
};

const digitsOnly = (s: string) => s.replace(/[^\d]/g, '');

/** 1, 10, 100, 1000, 10000… — hàng thước chia in sẵn dưới ô số, không bao giờ là chỉ số. */
const isPowerOfTen = (d: string) => /^10*$/.test(d);

/**
 * Điểm tối thiểu để DÁM tự điền vào ô chỉ số.
 * Đạt được khi ghép được số từ dòng có đơn vị (+8) hoặc số nằm ngay cạnh kWh/m³ (+5).
 * Dưới ngưỡng này coi như OCR không đọc được — để trống, bắt nhập tay.
 */
const AUTOFILL_MIN_SCORE = 6;

/** Hàng thước chia in dưới ô số công tơ — không phải chỉ số, phải loại. */
const SCALE_ROW = /10000|1000\s+100\s+10|1\/10/;

/**
 * Ghép lại chỉ số từ các chữ số RỜI trên cùng một dòng với đơn vị.
 *
 * Vì sao cần: các chữ số trong ô hiển thị nằm trong từng ô có khe hở, OCR đọc ra
 * kiểu "0 3 0 8 1 5 kWh". BE (`extractNumbers`) loại mọi cụm dưới 2 chữ số nên
 * toàn bộ chỉ số biến mất khỏi `numbers`, chỉ sót vài mẩu dính nhau ("30"). Không
 * ghép lại thì dù xếp hạng kiểu gì cũng không thể chọn ra số đúng — nó không có
 * trong danh sách.
 *
 * Quét theo DÒNG: dòng nào chứa đơn vị (kWh/m³) thì gom hết chữ số trên dòng đó;
 * nếu đơn vị đứng một mình thì lấy thêm dòng ngay trên. Bỏ dòng thước chia và
 * dòng hằng số vòng quay ("900 vòng/kWh").
 */
function reconstructFromUnitLine(text: string, kind: MeterKind): string[] {
  const out: string[] = [];
  const lines = text.split(/[\r\n]+/);
  const units = READING_UNITS[kind];

  lines.forEach((line, i) => {
    if (!units.some(u => line.includes(u))) return;
    if (/vong|vòng|imp|r\//.test(line)) return; // 900 vòng/kWh

    // Chỉ lấy phần TRƯỚC đơn vị — chỉ số luôn đứng trước đơn vị.
    let head = line;
    for (const u of units) {
      const at = head.indexOf(u);
      if (at >= 0) head = head.slice(0, at);
    }

    const push = (s: string) => {
      if (SCALE_ROW.test(s)) return;
      // Công tơ ĐIỆN TỬ in sẵn dấu thập phân ("12345.6 kWh"). Giữ nguyên dấu đó —
      // mặt số đã tự khai phần lẻ, chính xác hơn mọi cấu hình đoán bên ngoài.
      const dotted = (s.match(/\d+[.,]\d+/g) ?? [])
        .map(d => d.replace(',', '.'))
        .filter(d => digitsOnly(d).length >= 4 && digitsOnly(d).length <= 8);
      if (dotted.length) {
        // Có dấu thập phân thì KHÔNG đẩy thêm bản digits-only của cùng dòng — hai
        // biến thể cùng điểm sẽ tranh nhau, mà bản có dấu mới là bản đúng.
        out.push(...dotted);
        return;
      }
      const d = digitsOnly(s);
      if (d.length >= 4 && d.length <= 8) out.push(d);
    };

    push(head);
    // Đơn vị đứng riêng một dòng (OCR hay tách vậy) → số nằm ở dòng trên.
    if (digitsOnly(head).length === 0 && i > 0) push(lines[i - 1]);
  });

  return out;
}

/**
 * Chấm điểm một con số: càng cao càng giống chỉ số công tơ.
 * @param raw   chuỗi số như OCR trả về (có thể còn dấu chấm)
 * @param text  toàn bộ rawText đã lowercase, để soi ngữ cảnh trước/sau
 */
function scoreCandidate(raw: string, text: string, kind: MeterKind): number {
  const digits = digitsOnly(raw);
  if (!digits) return -Infinity;
  let score = 0;

  const at = text.indexOf(raw.toLowerCase());
  const before = at >= 0 ? text.slice(Math.max(0, at - 24), at) : '';
  const after = at >= 0 ? text.slice(at + raw.length, at + raw.length + 12) : '';

  // Ngay sau số là đơn vị của chỉ số (vd "030815 kWh") → dấu hiệu mạnh nhất.
  // Trừ khi phía trước là "vòng/" hoặc "imp/" — đó là hằng số vòng quay của công tơ.
  if (READING_UNITS[kind].some(u => after.replace(/[^a-z0-9³ ]/g, '').trim().startsWith(u))) {
    score += /vong|vòng|imp|r\//.test(before) ? -4 : 5;
  }

  // Phía trước là nhãn serial/model → loại thẳng.
  if (SERIAL_LABELS.some(l => before.includes(l))) score -= 6;

  // Ngay sau là đơn vị điện áp/dòng/tần số → thông số kỹ thuật in trên tem.
  const afterWord = after.trim().split(/[^a-z°³]/)[0];
  if (afterWord && SPEC_UNITS.includes(afterWord)) score -= 4;

  // Ô hiển thị chỉ số thường 4–6 chữ số (5 số đen + 1 số đỏ phần thập phân).
  const n = digits.length;
  if (n >= 4 && n <= 6) score += 2;
  else if (n === 7) score += 0;
  else if (n >= 8) score -= 3;   // serial thường dài
  else score -= 2;               // 2–3 chữ số thường là 220V, 50Hz, cấp chính xác...

  // Số mở đầu bằng 0 rất đặc trưng cho mặt số công tơ (000000 → 030815).
  if (/^0\d/.test(digits)) score += 2;

  return score;
}

/**
 * Chọn chỉ số + xếp hạng các số còn lại.
 * Nếu không có `rawText` để soi ngữ cảnh thì giữ nguyên lựa chọn của BE.
 */
function pickReading(
  kind: MeterKind,
  numbers: string[],
  beReading: string,
  text: string,
): { reading: string; candidates: string[] } {
  // Số ghép lại từ dòng có đơn vị được ưu tiên tuyệt đối: chúng đến từ đúng ô hiển
  // thị, trong khi `numbers` của BE hay chỉ còn mấy mẩu thước chia / serial.
  const rebuilt = text ? reconstructFromUnitLine(text, kind) : [];
  const uniq = Array.from(new Set([...rebuilt, ...numbers.map(digitsOnly)].filter(Boolean)))
    // Hàng thước chia (10000 1000 100 10 1) là chữ IN SẴN trên mặt đồng hồ, không bao
    // giờ là chỉ số. Bỏ hẳn thay vì chỉ trừ điểm — để chúng không lọt vào cả gợi ý.
    .filter(n => !isPowerOfTen(n));

  if (uniq.length === 0) return { reading: '', candidates: [] };
  if (!text) return { reading: beReading || uniq[0], candidates: uniq.filter(n => n !== beReading) };

  const rebuiltSet = new Set(rebuilt);
  const ranked = uniq
    .map(n => ({ n, s: scoreCandidate(n, text, kind) + (rebuiltSet.has(n) ? 8 : 0) }))
    .sort((a, b) => b.s - a.s);

  // Chỉ tự điền khi có bằng chứng thật (ghép được từ dòng có đơn vị, hoặc số đứng
  // ngay cạnh kWh/m³). Không đủ chứng cứ thì để TRỐNG cho người nhập tự gõ — điền
  // đại một số sai còn tệ hơn bỏ trống, vì người nhập dễ bấm lưu mà không soi lại.
  const best = ranked[0];
  return {
    reading: best.s >= AUTOFILL_MIN_SCORE ? best.n : '',
    candidates: (best.s >= AUTOFILL_MIN_SCORE ? ranked.slice(1) : ranked).map(r => r.n),
  };
}

/**
 * Kiểm ảnh đồng hồ dựa trên kết quả OCR.
 * @param kind loại đồng hồ đang chụp
 * @param ocr  kết quả từ /api/v1/ocr/meter
 */
export function validateMeterPhoto(kind: MeterKind, ocr: MeterOcrLike | null | undefined): MeterPhotoCheck {
  const text = (ocr?.rawText || '').toLowerCase();
  const numbers = ocr?.numbers ?? [];
  const beReading = (ocr?.reading || '').replace(/[^\d]/g, '');
  // Chọn lại theo ngữ cảnh thay vì tin số dài nhất mà BE trả về (xem pickReading).
  const { reading, candidates } = pickReading(
    kind,
    numbers.length ? numbers : (beReading ? [beReading] : []),
    beReading,
    text,
  );

  const own = kind === 'elec' ? ELEC_HINTS : WATER_HINTS;
  const other = kind === 'elec' ? WATER_HINTS : ELEC_HINTS;
  const ownHits = countHints(text, own);
  const otherHits = countHints(text, other);
  const hasOwn = ownHits > 0;
  const hasDevice = DEVICE_HINTS.some(k => hasHint(text, k));

  // 1. Không đọc được số nào → ảnh mờ / không phải mặt số.
  if (!reading && numbers.length === 0) {
    return {
      ok: false,
      confidence: 'low',
      reason: `Không đọc được chỉ số nào trên ảnh. Chụp lại thật rõ MẶT SỐ của đồng hồ ${LABEL[kind]}, `
        + 'để đủ sáng và không bị chói/nghiêng.',
    };
  }

  // 2. Rõ ràng là đồng hồ của loại KHÁC (chụp nhầm ô).
  //    Đòi ÍT NHẤT 2 gợi ý của loại kia mới dám từ chối: 1 gợi ý quá mong manh,
  //    một chữ đọc nhầm là đuổi oan ảnh đúng (xem ghi chú ở ELEC_HINTS).
  if (otherHits >= 2 && !hasOwn) {
    return {
      ok: false,
      confidence: 'low',
      reason: `Ảnh này trông là đồng hồ ${LABEL[kind === 'elec' ? 'water' : 'elec']}, không phải đồng hồ ${LABEL[kind]}. `
        + 'Kiểm tra lại xem có chụp nhầm ô không.',
    };
  }

  // 3. Có đơn vị/hãng đúng loại → chắc chắn là mặt đồng hồ.
  if (hasOwn) return { ok: true, reading, candidates, confidence: 'high' };

  // 4. Không có đơn vị nhưng có serial/model/nhãn kỹ thuật + nhiều chữ số → tạm chấp nhận,
  //    nhắc người dùng đối chiếu (một số đồng hồ cũ mờ chữ, OCR chỉ bắt được nhãn).
  if (hasDevice && countDigits(text) >= 4) {
    return { ok: true, reading, candidates, confidence: 'low' };
  }

  // 5. Không thấy nhãn nào, nhưng đọc được MỘT DÃY LIỀN 4–8 chữ số → tạm nhận, cờ 'low'.
  //
  //    Nhiều đồng hồ nước dân dụng chỉ có dãy số + ký hiệu m³ nhỏ xíu mà Vision hay
  //    bỏ sót, nên luật cũ (từ chối thẳng) đuổi oan ảnh đúng — đúng lỗi mentor nêu.
  //    Rào chống gian lận vẫn còn: số ghi tay/gõ trên giấy hiếm khi ra một dãy liền
  //    4–8 chữ số, và ảnh vẫn bị gắn cờ 'low' bắt người nhập soi lại.
  //
  //    Phải tự CHỌN LUÔN số: ở nhánh này `pickReading` cố tình trả rỗng (không đủ
  //    bằng chứng ngữ cảnh để dám tự điền), mà màn đón khách lại chặn tiếp khi
  //    `reading` rỗng — nên chỉ nới `ok` thôi thì ảnh nước vẫn không qua được.
  const isPlausibleRun = (s: string) => {
    const d = s.replace(/[^\d]/g, '');
    return d.length >= 4 && d.length <= 8;
  };
  const fallback = [reading, ...candidates].find(n => n && isPlausibleRun(n));
  if (fallback) {
    return {
      ok: true,
      reading: fallback,
      candidates: candidates.filter(n => n !== fallback),
      confidence: 'low',
    };
  }

  // 6. Chỉ có mấy con số rời rạc = số viết tay/gõ trên giấy, màn hình... → TỪ CHỐI.
  return {
    ok: false,
    confidence: 'low',
    reason: `Ảnh chỉ có con số rời rạc, không thấy dấu hiệu của mặt đồng hồ ${LABEL[kind]} `
      + `(đơn vị ${kind === 'elec' ? 'kWh' : 'm³'}, tên hãng, số serial...). `
      + 'Số ghi ra giấy hoặc chụp màn hình đều không được chấp nhận — chụp thẳng vào đồng hồ thật.',
  };
}
