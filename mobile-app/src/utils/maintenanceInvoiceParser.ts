/**
 * Đọc best-effort HOÁ ĐƠN SỬA CHỮA/BẢO TRÌ (hoá đơn điện tử của bên sửa chữa, KHÔNG
 * phải hoá đơn điện/nước) từ kết quả OCR (`POST /api/v1/ocr/evn-bill`).
 *
 * Endpoint tên là "evn-bill" nhưng theo `OcrServiceImpl.readUtilityBill` (BE) chỉ là một
 * lớp GENERIC gọi OCR.space (isTable=true) rồi dò nhãn "tổng tiền"/"thanh toán"/"số
 * tiền"/"phải thu" — không có gì ràng buộc riêng cho hoá đơn EVN, tham số `billType`
 * thậm chí không được dùng trong thân hàm. Vì vậy dùng lại được cho ảnh hoá đơn sửa
 * chữa mà không cần BE thêm endpoint mới — xem `realTenantService.ocrEvnBill`.
 *
 * Cùng triết lý với `evnInvoiceParser`/`waterInvoiceParser` (web) và bản nhúng trong
 * `UtilityBillingScreen.tsx` (mobile): mọi trường đọc ra đây LUÔN là PRE-FILL — manager
 * phải xác nhận/sửa lại trước khi bấm "Báo sửa xong", không bao giờ tự gửi thẳng.
 *
 * Chỉ trích XUẤT TỔNG TIỀN — đây là trường duy nhất `TicketDetailScreen.tsx` còn ô nhập
 * tay (`invoiceAmountText`). `invoiceVendor`/`invoiceDate` đã bị khoá cứng (tự điền ngầm
 * `DEFAULT_INVOICE_VENDOR`/`today()`, xem `handleComplete`) và `invoiceNumber` không được
 * gửi lên BE ở bước complete() nữa — nên OCR các trường đó sẽ không có ô nào để đổ vào,
 * cố tình không làm để khỏi thêm state/UI không ai dùng tới (over-engineering).
 */

export interface MaintenanceOcrInput {
  rawText?: string;
  /** BE hiện KHÔNG trả field này ở `/ocr/evn-bill` — giữ optional để dự phòng/test. */
  numbers?: string[];
}

export interface ParsedMaintenanceInvoice {
  /** Tổng tiền hoá đơn, dạng chuỗi CHỈ SỐ (vd "350000") — đưa thẳng vào `formatMoneyInput`. */
  totalAmount: string;
}

// Dải dấu thanh/dấu phụ Unicode (U+0300–U+036F) mà NFD tách ra khỏi nguyên âm.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt — OCR hay trả tiếng Việt mất dấu, chữ số thì không đổi. */
const normalizeVi = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd') // đ/Đ không phải tổ hợp nên NFD không tách được
    .toLowerCase()
    .trim();

const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');

/**
 * Trần hợp lý cho MỘT hoá đơn sửa chữa/bảo trì — quá ngưỡng gần như chắc chắn là OCR
 * bắt nhầm số khác trên tờ giấy (mã hoá đơn, số điện thoại, mã số thuế...). 50 triệu
 * là mức chi cho một lần sửa/thay thiết bị trong nhà cho thuê đã rất cao; hoá đơn thật
 * lớn hơn thế nên bị từ chối để manager tự gõ tay, an toàn hơn điền nhầm một số vô lý.
 */
const MAX_PLAUSIBLE_AMOUNT = 50_000_000;

export const parseMaintenanceInvoice = (ocr: MaintenanceOcrInput): ParsedMaintenanceInvoice => {
  const flat = normalizeVi((ocr.rawText || '').replace(/\s+/g, ' '));
  const out: ParsedMaintenanceInvoice = { totalAmount: '' };
  if (!flat) return out;

  /*
    ── Tổng tiền ────────────────────────────────────────────────────────────
    Thứ tự dò đi từ nhãn RIÊNG NHẤT xuống nhãn chung nhất, giống `evnInvoiceParser`.

    "tổng cộng tiền thanh toán" là cụm chuẩn trên hoá đơn GTGT điện tử (giống hệt hoá
    đơn EVN) — ưu tiên tuyệt đối. Cố tình KHÔNG dùng "cộng tiền hàng" làm nguồn chính:
    đó là tiền hàng TRƯỚC thuế trên hoá đơn GTGT (xem cảnh báo trong `waterInvoiceParser`
    — cùng một cái bẫy) — lấy nhầm là thu thiếu phần VAT.
  */
  const amt =
    flat.match(/tong cong tien thanh toan[^\d]{0,20}([\d.,]+)/) ||
    flat.match(/tong tien thanh toan[^\d]{0,20}([\d.,]+)/) ||
    flat.match(/tong thanh toan[^\d]{0,20}([\d.,]+)/) ||
    flat.match(/tong cong[^\d]{0,20}([\d.,]+)/) ||
    flat.match(/tong tien[^\d]{0,20}([\d.,]+)/) ||
    // "Thành tiền" lặp lại ở MỖI dòng hàng hoá trên hoá đơn GTGT — nếu phải dùng nhãn
    // này thì lấy giá trị CUỐI CÙNG trong text (dòng tổng luôn nằm sau cùng), không lấy
    // giá trị đầu tiên (sẽ là một dòng hàng lẻ, sai hoàn toàn).
    lastMatch(flat, /thanh tien[^\d]{0,20}([\d.,]+)/g);

  if (amt) {
    const n = Number(onlyDigits(amt[1]));
    if (n > 0 && n <= MAX_PLAUSIBLE_AMOUNT) out.totalAmount = String(n);
  }

  // Không thấy nhãn tổng cuối → thử cộng "cộng tiền hàng" + "tiền thuế GTGT", giống
  // đường lui của `waterInvoiceParser` (an toàn hơn lấy đại "cộng tiền hàng" đơn thuần,
  // vốn chắc chắn là số THIẾU thuế).
  if (!out.totalAmount) {
    const goods = flat.match(/cong tien hang[^\d]{0,20}([\d.,]+)/);
    const vat = flat.match(/tien thue(?: gtgt)?[^\d]{0,20}([\d.,]+)/);
    if (goods) {
      const goodsN = Number(onlyDigits(goods[1]));
      const vatN = vat ? Number(onlyDigits(vat[1])) : 0;
      const sum = goodsN + vatN;
      if (goodsN > 0 && sum > 0 && sum <= MAX_PLAUSIBLE_AMOUNT) out.totalAmount = String(sum);
    }
  }

  // Vẫn không ra gì → fallback cuối: số có dấu phân cách nghìn LỚN NHẤT trong toàn văn
  // bản ("350.000"). Loại số viết liền (mã hoá đơn, số điện thoại) vì chúng không có
  // dấu chấm/phẩy ngăn cách — cùng cách EVN parser tin số "money-like" hơn số trần trụi.
  if (!out.totalAmount) {
    const moneyLike = (flat.match(/\d{1,3}(?:[.,]\d{3})+/g) || [])
      .map((n) => Number(onlyDigits(n)))
      .filter((n) => n > 0 && n <= MAX_PLAUSIBLE_AMOUNT);
    if (moneyLike.length) out.totalAmount = String(Math.max(...moneyLike));
  }

  return out;
};

/** Khớp TOÀN BỘ theo regex global rồi trả về lần khớp CUỐI CÙNG (hoặc null nếu không có). */
function lastMatch(text: string, re: RegExp): RegExpMatchArray | null {
  const all = [...text.matchAll(re)];
  return all.length ? all[all.length - 1] : null;
}
