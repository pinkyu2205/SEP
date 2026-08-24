/**
 * ĐỐI CHIẾU ẢNH HOÁ ĐƠN VỚI CĂN NHÀ ĐANG CHỌN — chặn nhầm nhà ngay lúc phát hành.
 *
 * ─── Vấn đề ──────────────────────────────────────────────────────────────────
 * Trang phát hành hoá đơn điện/nước có hai ô độc lập nhau: một ô CHỌN NHÀ, một ô TẢI
 * ẢNH hoá đơn. Không có gì ràng hai ô đó với nhau. Chọn nhầm nhà trong danh sách vài
 * chục căn là chuyện xảy ra được, và với NHÀ NGUYÊN CĂN thì hoá đơn đi thẳng tới khách
 * ngay trong cùng thao tác — khách nhận hoá đơn tiền điện của một căn nhà khác.
 *
 * Tờ hoá đơn EVN/nước LUÔN in địa chỉ và mã khách hàng. OCR đã đọc cả tờ giấy ra
 * `rawText` để lấy tổng kWh rồi, nên phần kiểm tra này gần như miễn phí: chỉ là so
 * địa chỉ căn nhà đang chọn với chữ trên tờ giấy.
 *
 * ─── Vì sao CẢNH BÁO chứ không CHẶN ──────────────────────────────────────────
 * OCR tiếng Việt trên ảnh chụp bằng điện thoại sai rất nhiều: mất dấu, nhoè số, cắt
 * mất góc giấy. Chặn cứng theo kết quả OCR thì sẽ có ngày admin cầm đúng tờ hoá đơn
 * đúng căn nhà mà hệ thống không cho phát hành, và không có đường nào đi tiếp.
 *
 * Nên đây là CHẶN MỀM: nói rõ nghi ngờ, bắt nhìn lại, nhưng vẫn cho qua. Lớp hậu kiểm
 * là quyền khiếu nại của khách (`pages/admin/UtilityDisputes.tsx`) — hai lớp bù cho
 * nhau, không thay nhau: lớp này bắt phần lớn lỗi ngay tại nguồn với chi phí bằng 0,
 * lớp kia bắt phần lọt lưới.
 *
 * ─── Vì sao không dùng mã khách hàng ─────────────────────────────────────────
 * So mã khách hàng EVN sẽ chắc chắn hơn địa chỉ nhiều, nhưng hệ thống HIỆN CHƯA lưu
 * mã khách hàng của từng căn nhà ở đâu cả (không có field nào trong `PropertyResponse`).
 * Thêm được field đó thì nên chuyển sang so mã — xem phần "Bước sau" trong
 * doc-be/BE-NEED-khieu-nai-hoa-don-dien-nuoc-2026-08-24.md.
 */

// Dải dấu thanh Unicode mà NFD tách ra khỏi nguyên âm — viết bằng escape ASCII để dấu
// tổ hợp không nằm trần trong source (giống `evnInvoiceParser.ts`).
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt — nhiều engine OCR trả tiếng Việt mất dấu, chữ số thì không đổi. */
const normalize = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Từ hành chính có mặt ở MỌI địa chỉ nên không phân biệt được căn nào với căn nào.
 * Đếm chúng vào thì hai địa chỉ khác hẳn nhau vẫn "khớp 80%".
 */
const STOP_WORDS = new Set([
  'so', 'duong', 'pho', 'ngo', 'hem', 'ngach', 'to', 'khu', 'kp', 'ap', 'thon', 'xom',
  'phuong', 'p', 'quan', 'q', 'huyen', 'thi', 'tran', 'xa', 'tinh',
  'thanh', 'tp', 'tphcm', 'hcm', 'ha', 'noi', 'viet', 'nam', 'nha', 'can', 'ho',
  'dia', 'chi', 'khach', 'hang', 'ten', 'cong', 'ty',
]);

export type BillMatchVerdict =
  /** Không đủ chữ để kiểm (OCR hỏng / chưa có ảnh) — im lặng, đừng doạ người dùng. */
  | 'unknown'
  /** Địa chỉ căn nhà xuất hiện trên tờ hoá đơn — yên tâm. */
  | 'match'
  /** Có tên đường nhưng KHÔNG thấy số nhà — đáng liếc lại, chưa đáng báo động. */
  | 'weak'
  /** Không thấy dấu vết nào của căn nhà này trên tờ hoá đơn — rất có thể nhầm nhà. */
  | 'mismatch';

export interface BillMatchResult {
  verdict: BillMatchVerdict;
  /** Số nhà tìm trong ảnh (nếu tách được từ địa chỉ). */
  houseNumber?: string;
  /** Các từ đặc trưng của địa chỉ tìm thấy trên ảnh. */
  matchedTokens: string[];
  /** Các từ đặc trưng KHÔNG tìm thấy. */
  missingTokens: string[];
  /** Câu hiện cho admin — null nghĩa là không cần nói gì. */
  message: string | null;
}

/**
 * Tách "số nhà" — cụm số đứng đầu địa chỉ, chấp nhận cả dạng 12/3A hay 128B.
 *
 * Số nhà là tín hiệu mạnh nhất trong một địa chỉ: hai căn cùng đường thì chỉ khác nhau
 * ở đúng con số này, mà OCR đọc chữ số lại chính xác hơn đọc chữ cái nhiều.
 */
const extractHouseNumber = (addr: string): string | undefined =>
  normalize(addr).match(/^(\d+(?:\/\d+)*[a-z]?)\b/)?.[1];

/** Các từ đủ đặc trưng để nhận ra căn nhà — bỏ từ hành chính và từ quá ngắn. */
const signalTokens = (addr: string): string[] => {
  const seen = new Set<string>();
  return normalize(addr)
    .split(' ')
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
    .filter(t => (seen.has(t) ? false : (seen.add(t), true)));
};

/**
 * @param rawText  Chữ OCR đọc được từ ảnh hoá đơn.
 * @param address  Địa chỉ căn nhà đang chọn (`fullAddress` ?? `shortAddress`).
 */
export const matchBillToProperty = (
  rawText: string | undefined | null,
  address: string | undefined | null,
): BillMatchResult => {
  const empty: BillMatchResult = {
    verdict: 'unknown', matchedTokens: [], missingTokens: [], message: null,
  };

  // OCR trả quá ít chữ thì không kết luận được gì. Ngưỡng 40 ký tự: một tờ hoá đơn đọc
  // được tử tế luôn dài hơn thế nhiều; ngắn hơn nghĩa là OCR hỏng chứ không phải hoá
  // đơn sai — và báo động lúc đó chỉ dạy admin bỏ qua cảnh báo.
  const text = normalize(rawText ?? '');
  if (!address?.trim() || text.length < 40) return empty;

  const tokens = signalTokens(address);
  const house = extractHouseNumber(address);
  /*
   * Không tách được từ đặc trưng nào thì KHÔNG kết luận, kể cả khi có số nhà.
   * Địa chỉ bình thường luôn có tên đường; không có nghĩa là dữ liệu địa chỉ của căn
   * nhà quá sơ sài — lỗi ở dữ liệu chứ không phải ở tờ hoá đơn. Riêng số nhà thì quá
   * yếu để đứng một mình: một dãy số 2–3 chữ số gần như chắc chắn xuất hiện đâu đó
   * trên tờ hoá đơn (mã, số tiền, chỉ số), báo động theo nó chỉ tạo nhiễu.
   */
  if (!tokens.length) return empty;

  const matched = tokens.filter(t => text.includes(t));
  const missing = tokens.filter(t => !text.includes(t));
  // `\b` không dùng được ở đây vì "12" nằm trong "128" cũng khớp. Bọc bằng ranh giới
  // không-phải-chữ-số để "12" không ăn theo "128" hay "312".
  // Không cần escape: `extractHouseNumber` chỉ trả chữ số, dấu `/` và một chữ cái —
  // không ký tự nào trong đó có nghĩa đặc biệt với regex.
  const houseFound = !!house && new RegExp(`(^|[^0-9])${house}([^0-9]|$)`).test(text);

  const strong = matched.length > 0;

  if (houseFound && strong) {
    return {
      verdict: 'match', houseNumber: house, matchedTokens: matched, missingTokens: missing,
      message: null,
    };
  }

  if (strong) {
    return {
      verdict: 'weak', houseNumber: house, matchedTokens: matched, missingTokens: missing,
      message: house
        ? `Ảnh có tên đường khớp (${matched.join(', ')}) nhưng KHÔNG thấy số nhà “${house}”. `
          + 'Kiểm lại xem có phải hoá đơn của căn bên cạnh không.'
        : `Ảnh có ${matched.join(', ')} nhưng không đủ để chắc là đúng căn này.`,
    };
  }

  return {
    verdict: 'mismatch', houseNumber: house, matchedTokens: [], missingTokens: missing,
    message: 'Không tìm thấy địa chỉ của căn nhà đang chọn trên ảnh hoá đơn. '
      + 'Rất có thể bạn chọn nhầm nhà, hoặc tải nhầm ảnh — kiểm lại trước khi phát hành.',
  };
};
