/**
 * ĐỌC CHỈ SỐ CÔNG TƠ TỪ OCR — dùng chung cho hoá đơn điện EVN và hoá đơn nước.
 *
 * ─── Vì sao không dò theo nhãn rồi lấy số kế bên ─────────────────────────────
 * Hoá đơn thật đặt bẫy ở đúng chỗ đó:
 *
 *  1. **Thứ tự cột không cố định.** Bảng kê EVN Hà Nội in `CHỈ SỐ MỚI` TRƯỚC `CHỈ SỐ CŨ`;
 *     giấy nước Thủ Đức cũng `CS Mới:` trước `CS cũ:`. Parser nào giả định cũ-trước-mới là
 *     đảo ngược hai số, ra tiêu thụ âm hoặc sai hoàn toàn.
 *  2. **Nhãn viết tắt tuỳ nơi.** `CHỈ SỐ MỚI` · `CS Mới` · `Số đọc tháng này` — cùng một thứ.
 *  3. **Số rác nằm ngay cạnh nhãn.** Hàng dữ liệu EVN là
 *     `18006996 · 1 · 16.087 · 15.404 · 683` — số đầu là *số đo đếm* (mã công tơ) và số thứ
 *     hai là *hệ số nhân*. Lấy "số ngay sau nhãn (kWh)" là ra mã công tơ 18.006.996.
 *
 * ─── Cách làm ở đây: tin PHÉP TRỪ, không tin vị trí ──────────────────────────
 * Trên mọi hoá đơn tiện ích luôn đúng một hằng đẳng thức:
 *
 *     chỉ số mới − chỉ số cũ = lượng tiêu thụ
 *
 * Nên ta gom mọi số trong văn bản rồi tìm bộ ba (a, b, c) thoả `a − b = c`, có `c` cũng
 * xuất hiện trong văn bản và `c` nằm trong ngưỡng tiêu thụ hợp lý. Bộ ba nào thoả thì
 * chính nó tự chứng minh: mã công tơ, hệ số nhân, tiền, thuế đều không lọt được.
 * Kiểm chứng trên hai hoá đơn thật:
 *   • EVN:  16.087 − 15.404 = 683   ✓ (loại được mã công tơ 18006996)
 *   • Nước: 4.936 − 3.458 = 1.478   ✓ (loại được tiền nước / thuế / phí BVMT)
 *
 * Ngưỡng `maxConsumption` là chốt cuối: nó loại các bộ ba tình cờ đúng phép trừ nhưng vô
 * lý, ví dụ EVN có `2.217.974 − 2.053.680 = 164.294` (tổng − chưa thuế = thuế GTGT) và
 * nước có `1.950.920 − 975.460 = 975.460` (phí BVMT − thuế = thuế).
 */

/** Dải dấu thanh Unicode mà NFD tách ra. Viết bằng escape để dấu không nằm trần trong source. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export const normalizeForParse = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

/** Nhãn của chỉ số — dùng để ưu tiên bộ ba nằm gần chúng. */
const READING_LABELS = [
  'chi so moi', 'chi so cu', 'cs moi', 'cs cu',
  'so doc thang nay', 'so doc thang truoc',
  'tieu thu', 'dien tieu thu', 'so luong tieu thu',
];

/** Số nằm trong văn bản, kèm vị trí để xét "cùng một hàng bảng". */
interface Token { value: number; at: number }

/**
 * Bóc số khỏi văn bản, bỏ những thứ chắc chắn không phải chỉ số:
 * ngày/giờ, phần trăm, số điện thoại. Dấu `.`/`,` coi là phân cách nghìn — hoá đơn VN
 * không in phần thập phân cho chỉ số công tơ.
 */
const tokenize = (flat: string): Token[] => {
  const cleaned = flat
    // 04/08/2020, 10/02/2026
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
    .replace(/\d{1,2}\/\d{4}/g, ' ')
    // 09:35:41
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    // 8%, 5%, 10%
    .replace(/\d+\s*%/g, ' ')
    // 0902601953 · 0977 908 552 · (028) 37220191 — số điện thoại, không phải chỉ số
    .replace(/\(?0\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}/g, ' ');

  const out: Token[] = [];
  const re = /\d{1,3}(?:[.,]\d{3})+|\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const value = Number(m[0].replace(/[^\d]/g, ''));
    if (value > 0) out.push({ value, at: m.index });
  }
  return out;
};

export interface ReadingTriple {
  prevReading: number;
  newReading: number;
  consumption: number;
}

/**
 * Tìm bộ ba (chỉ số cũ, chỉ số mới, tiêu thụ) tự khớp phép trừ.
 *
 * @param rawText   văn bản OCR thô
 * @param maxConsumption  ngưỡng tiêu thụ hợp lý: điện ~100.000 kWh, nước ~10.000 m³.
 *                        Đây là thứ loại các bộ ba tình cờ đúng phép trừ (xem đầu file).
 */
export const findReadingTriple = (
  rawText: string,
  maxConsumption: number,
): ReadingTriple | null => {
  const flat = normalizeForParse((rawText || '').replace(/\s+/g, ' '));
  const tokens = tokenize(flat);
  if (tokens.length < 3) return null;

  const labelPositions = READING_LABELS
    .map((l) => flat.indexOf(l))
    .filter((i) => i >= 0);

  const nearestLabel = (at: number): number =>
    labelPositions.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...labelPositions.map((p) => Math.abs(p - at)));

  let best: { triple: ReadingTriple; score: number } | null = null;

  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (i === j) continue;
      const hi = tokens[i];
      const lo = tokens[j];
      const diff = hi.value - lo.value;
      if (diff <= 0 || diff > maxConsumption) continue;

      // `c` phải xuất hiện thật trong văn bản — đây là phần "tự chứng minh".
      const cToken = tokens.find((t) => t.value === diff && t !== hi && t !== lo);
      if (!cToken) continue;

      /**
       * Chấm điểm: gần nhãn chỉ số là mạnh nhất, rồi tới ba số nằm sát nhau (cùng một
       * hàng bảng), rồi tới chỉ số lớn — công tơ đã chạy lâu thì số lớn, còn các bộ ba
       * rác kiểu `100 − 50 = 50` (cột sản lượng bậc thang EVN) đều là số nhỏ.
       */
      const spread = Math.max(hi.at, lo.at, cToken.at) - Math.min(hi.at, lo.at, cToken.at);
      const labelDist = Math.min(nearestLabel(hi.at), nearestLabel(lo.at), nearestLabel(cToken.at));
      const score =
        (labelDist < 160 ? 1_000_000 : 0)
        + (spread < 60 ? 100_000 : 0)
        + hi.value;

      if (!best || score > best.score) {
        best = {
          score,
          triple: { prevReading: lo.value, newReading: hi.value, consumption: diff },
        };
      }
    }
  }

  return best?.triple ?? null;
};
