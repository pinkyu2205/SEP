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
const ELEC_HINTS = [
  'kwh', 'kw h', 'k wh', 'imp/kwh', 'imp / kwh', 'wh', 'kw',
  'cong to', 'côngtơ', 'công tơ', 'congto', 'dien nang', 'điện năng', 'dien tu',
  '50hz', '60hz', '220v', '230v', '110v', ' v ', ' a)', '(a)', 'ampe',
  'emic', 'vinasino', 'gelex', 'elster', 'landis', 'hexing', 'genius', 'star',
  '1 pha', '3 pha', 'one phase', 'three phase', 'kwh meter', 'watt',
];

const WATER_HINTS = [
  'm3', 'm³', 'm 3', 'x0.0001', 'x 0.0001',
  'nuoc', 'nước', 'water', 'water meter', 'dong ho nuoc', 'đồng hồ nước',
  'q3', 'qn', 'qmax', 'dn15', 'dn20', 'dn25', 'dn 15', 'dn 20',
  'asahi', 'unik', 'zenner', 'sensus', 'itron', 'komax', 'flodis', 'multi jet',
  'l/h', 'lit', 'lít',
];

/** Dấu hiệu chung của một thiết bị đo (không phân biệt điện/nước). */
const DEVICE_HINTS = [
  'no.', 'no ', 'serial', 's/n', 'model', 'type', 'made in', 'vietnam', 'viet nam',
  'class', 'cap chinh xac', 'cấp chính xác', 'iso', 'tcvn', 'qcvn', 'kiem dinh', 'kiểm định',
];

const LABEL: Record<MeterKind, string> = { elec: 'điện', water: 'nước' };

const countDigits = (s: string) => (s.match(/\d/g) ?? []).length;

/**
 * Kiểm ảnh đồng hồ dựa trên kết quả OCR.
 * @param kind loại đồng hồ đang chụp
 * @param ocr  kết quả từ /api/v1/ocr/meter
 */
export function validateMeterPhoto(kind: MeterKind, ocr: MeterOcrLike | null | undefined): MeterPhotoCheck {
  const text = (ocr?.rawText || '').toLowerCase();
  const numbers = ocr?.numbers ?? [];
  const reading = (ocr?.reading || '').replace(/[^\d]/g, '');

  const own = kind === 'elec' ? ELEC_HINTS : WATER_HINTS;
  const other = kind === 'elec' ? WATER_HINTS : ELEC_HINTS;
  const hasOwn = own.some(k => text.includes(k));
  const hasOther = other.some(k => text.includes(k));
  const hasDevice = DEVICE_HINTS.some(k => text.includes(k));

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
  if (hasOther && !hasOwn) {
    return {
      ok: false,
      confidence: 'low',
      reason: `Ảnh này trông là đồng hồ ${LABEL[kind === 'elec' ? 'water' : 'elec']}, không phải đồng hồ ${LABEL[kind]}. `
        + 'Kiểm tra lại xem có chụp nhầm ô không.',
    };
  }

  // 3. Có đơn vị/hãng đúng loại → chắc chắn là mặt đồng hồ.
  if (hasOwn) return { ok: true, reading, confidence: 'high' };

  // 4. Không có đơn vị nhưng có serial/model/nhãn kỹ thuật + nhiều chữ số → tạm chấp nhận,
  //    nhắc người dùng đối chiếu (một số đồng hồ cũ mờ chữ, OCR chỉ bắt được nhãn).
  if (hasDevice && countDigits(text) >= 4) {
    return { ok: true, reading, confidence: 'low' };
  }

  // 5. Chỉ có mấy con số trơ trọi = số viết tay/gõ trên giấy, màn hình... → TỪ CHỐI.
  return {
    ok: false,
    confidence: 'low',
    reason: `Ảnh chỉ có con số, không thấy dấu hiệu của mặt đồng hồ ${LABEL[kind]} `
      + `(đơn vị ${kind === 'elec' ? 'kWh' : 'm³'}, tên hãng, số serial...). `
      + 'Số ghi ra giấy hoặc chụp màn hình đều không được chấp nhận — chụp thẳng vào đồng hồ thật.',
  };
}
