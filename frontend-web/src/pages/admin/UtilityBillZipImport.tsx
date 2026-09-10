/**
 * NHẬP HOÁ ĐƠN ĐIỆN / NƯỚC THEO LÔ — một file .zip cho cả danh mục nhà.
 *
 * Dùng chung cho cả hai trang phát hành, chọn bằng prop `kind`. Toàn bộ khác biệt giữa
 * điện và nước nằm gọn trong bảng `KIND` bên dưới.
 *
 * ─── Vì sao có màn này ───────────────────────────────────────────────────────
 * Luồng lẻ bắt admin lặp đúng 5 thao tác cho MỖI nhà: chọn nhà → tải ảnh → chờ OCR →
 * xác nhận số → phát hành. Ba chục nhà là ba chục vòng, và giữa chừng rất dễ bỏ sót
 * một căn mà không có gì nhắc.
 *
 * ─── Vì sao KHÔNG tự phát hành ngay sau khi đọc ──────────────────────────────
 * OCR ở đây là best-effort, doc của cả hai parser đều ghi rõ "kết quả LUÔN cần người
 * xác nhận lại". Các lỗi đã gặp trên hoá đơn thật: mã công tơ 18.006.996 bị đọc thành
 * kWh, năm trong "06/05/2022" bị đọc thành kWh, mã số thuế lớn hơn cả tổng tiền; riêng
 * hoá đơn nước còn bẫy hai con số tiền — lấy nhầm "cộng tiền hàng" là thu thiếu ~15%.
 *
 * Đọc sai sản lượng là hỏng dây chuyền — đơn giá = tiền ÷ sản lượng, mà manager dựng
 * hoá đơn TỪNG PHÒNG trên đúng đơn giá đó. Làm lẻ thì admin thấy ngay; nhập lô rồi tự
 * phát hành thì sai lặng lẽ cho cả chục nhà.
 *
 * Nên màn này chia làm ba chặng rõ rệt: đối chiếu → đọc số → DUYỆT rồi mới phát hành.
 */
import { useState } from 'react';
import {
  Check, CheckCircle2, FileArchive, Loader2, RotateCcw, Upload, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadToCloudinary } from '@/services/upload.service';
import { evnBillService, evnUnitPrice } from '@/services/evnBill.service';
import { waterBillService, waterUnitPrice } from '@/services/waterBill.service';
import { utilityInvoiceService } from '@/services/utilityInvoice.service';
import { parseEvnInvoice, onlyDigits, periodProblem } from '@/utils/evnInvoiceParser';
import { parseWaterInvoice } from '@/utils/waterInvoiceParser';
import { groupThousands } from '@/utils';
import { formatCurrency } from '@/utils';
import { inspectZipBills, type ZipBillPreview } from '@/utils/zipUtilityBills';
import { loadUtilityCycle, continuityGap, firstPeriodNote, type UtilityCycle } from '@/services/utilityCycle';
import type { PropertyResponse } from '@/types/api.types';

type Stage = 'pick' | 'preview' | 'reading' | 'review';

/** Kiểu tiện ích — quyết định parser, endpoint và cách tính đơn giá. */
export type UtilityKind = 'ELECTRIC' | 'WATER';

/** Số liệu một tờ hoá đơn, đã chuẩn hoá về chuỗi chữ số để đổ thẳng vào ô nhập. */
interface ParsedBill {
  qty: string;
  amount: string;
  period: string;
  prevReading: string;
  newReading: string;
  /** Chỉ điện dùng; nước để rỗng vì máy chủ không đối chiếu mã cho hoá đơn nước. */
  customerCode: string;
}

const num = (v: number | undefined) => (v != null && v > 0 ? String(v) : '');

/**
 * Riêng CHỈ SỐ ĐỒNG HỒ thì GIỮ số 0.
 *
 * `num` ở trên coi 0 là "không có", đúng với tổng tiền và tổng m³ — nhưng sai hẳn với chỉ
 * số: đồng hồ mới lắp có chỉ số cũ đúng bằng 0, và đó là giá trị thật.
 *
 * Đã đo được hậu quả (11/09/2026): tờ giấy nước ghi `CHỈ SỐ CŨ: 0`, ô chỉ số cũ bỏ trắng,
 * dòng báo "Chưa có chỉ số cũ" và không phát hành được — trong khi tờ giấy có đủ số.
 */
const numReading = (v: number | undefined) => (v != null && v >= 0 ? String(v) : '');

/**
 * TOÀN BỘ khác biệt điện ↔ nước gom vào đây.
 *
 * Hai tờ hoá đơn khác hẳn nhau (xem đầu `waterInvoiceParser`: hoá đơn nước có HAI con số
 * tiền, lấy nhầm "cộng tiền hàng" thay vì "tổng tiền thanh toán" là thu thiếu ~15%), và
 * đơn giá nước KHÔNG được làm tròn trong khi điện thì có. Nhân đôi cả màn hình cho hai
 * kiểu là chắc chắn sẽ có ngày sửa một bên quên bên kia — nên chỉ nhân đôi đúng bảng này.
 */
const KIND: Record<UtilityKind, {
  title: string;
  /** Danh từ ngắn ghép vào câu: "hoá đơn {noun}". */
  noun: string;
  /** Slug không dấu, dùng trong tên file mẫu. */
  slug: string;
  unit: string;
  /** Khoảng đơn giá bình quân còn coi là hợp lệ — xem `isOutlier`. */
  priceFloor: number;
  priceCeil: number;
  qtyLabel: string;
  readingLabel: string;
  parse: (ocr: { rawText?: string; numbers?: string[] }) => ParsedBill;
  ocr: (url: string) => Promise<{ rawText?: string; numbers?: string[]; totalAmount?: number; billingPeriod?: string; customerCode?: string }>;
  unitPrice: (amount: number, qty: number) => number;
  publish: (input: {
    propertyId: number; billingPeriod: string; month: number; year: number;
    qty: number; amount: number; imageUrl?: string;
    prevReading?: number; newReading?: number;
    customerCode?: string; ocrConfirmed?: boolean;
  }) => Promise<{ unitPrice?: number }>;
}> = {
  ELECTRIC: {
    title: 'Hoá đơn điện từ file .zip',
    noun: 'điện',
    slug: 'dien',
    unit: 'kWh',
    // Bậc 1 khoảng 1.900đ, bậc 6 khoảng 3.300đ, cộng VAT 8%. Nới rộng hai đầu.
    priceFloor: 1_000, priceCeil: 5_000,
    qtyLabel: 'Tổng kWh',
    readingLabel: 'Chỉ số công tơ',
    parse: (ocr) => {
      const p = parseEvnInvoice(ocr);
      return {
        qty: p.totalKwh, amount: p.totalAmount, period: p.billingPeriod,
        prevReading: p.prevReading ?? '', newReading: p.newReading ?? '',
        customerCode: p.customerCode ?? '',
      };
    },
    ocr: (url) => evnBillService.ocr(url),
    unitPrice: evnUnitPrice,
    publish: ({ qty, amount, ...rest }) =>
      evnBillService.publish({ ...rest, totalKwh: qty, totalAmount: amount }),
  },
  WATER: {
    title: 'Hoá đơn nước từ file .zip',
    noun: 'nước',
    slug: 'nuoc',
    unit: 'm³',
    // Nước sinh hoạt bậc thang khoảng 6.000–16.000đ/m³ đã gồm thuế + phí BVMT.
    priceFloor: 3_000, priceCeil: 30_000,
    qtyLabel: 'Tổng m³',
    readingLabel: 'Chỉ số đồng hồ',
    parse: (ocr) => {
      const p = parseWaterInvoice(ocr);
      return {
        qty: num(p.totalQuantity), amount: num(p.totalAmount), period: p.billingPeriod ?? '',
        prevReading: numReading(p.prevReading), newReading: numReading(p.newReading),
        customerCode: p.customerCode ?? '',
      };
    },
    ocr: (url) => waterBillService.ocr(url),
    unitPrice: waterUnitPrice,
    publish: ({ qty, amount, ...rest }) =>
      waterBillService.create({ ...rest, totalQuantity: qty, totalAmount: amount }),
  },
};

/** Một nhà trong lô, kèm số liệu đọc được và kết quả phát hành. */
/**
 * ĐỐI CHIẾU MÃ KHÁCH HÀNG NGAY TRÊN DÒNG — nói trước khi admin bấm phát hành.
 *
 * Máy chủ cũng đối chiếu và chặn, nhưng nó chỉ lên tiếng SAU khi bấm. Với nhập lô ba chục
 * dòng thì đó là ba chục dòng đỏ hiện ra cùng lúc, và admin phải đọc ngược từng câu lỗi để
 * biết dòng nào cần sửa. Bày kết quả so ngay lúc đọc xong ảnh thì sai chỗ nào thấy chỗ đó,
 * sửa xong mới bấm.
 *
 * Chuẩn hoá GIỐNG HỆT máy chủ (`UtilityCustomerCodeHelper.normalize`): bỏ mọi ký tự không
 * phải chữ-số rồi hạ chữ thường. Lệch cách chuẩn hoá là màn hình khoe dấu tích xanh xong
 * máy chủ vẫn chặn — tệ hơn hẳn việc không so gì cả.
 */
/** Mã chuẩn của căn nhà theo loại hoá đơn đang nhập. */
const expectedCodeOf = (prop: PropertyResponse, kind: 'ELECTRIC' | 'WATER') =>
  kind === 'WATER' ? prop.waterCustomerCode : prop.electricityCustomerCode;

const normCode = (s?: string | null) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

type CodeMatchState = 'ok' | 'mismatch' | 'missing-paper' | 'no-expected';

interface CodeMatchResult {
  state: CodeMatchState;
  /** Mã chuẩn của căn nhà, in hoa cho dễ đọc. Rỗng khi nhà chưa khai mã. */
  expected: string;
  inputClass: string;
  note: string;
  noteClass: string;
  title: string;
}

const codeMatchOf = (paper: string, storedRaw?: string | null): CodeMatchResult => {
  const stored = normCode(storedRaw);
  const expected = stored.toUpperCase();
  const actual = normCode(paper);

  /*
    Nhà chưa khai mã: máy chủ bỏ qua đối chiếu, nên màn hình cũng không được doạ — nhưng
    PHẢI nói ra là đang không đối chiếu.

    Bản đầu để trạng thái này im lặng hoàn toàn: ô xám, không tích, không chữ. Nhìn vào
    không phân biệt được "đã kiểm và không sao" với "không kiểm gì cả", nên một mã sai
    hiển nhiên vẫn trông y như một mã đúng. Đó đúng là chỗ đã làm mất thời gian thật
    (11/09/2026): dữ liệu mã chưa nạp vào DB mà màn hình không hé một lời.
  */
  if (!stored) {
    return {
      state: 'no-expected',
      expected: '',
      inputClass: 'border-slate-200 bg-white text-slate-700 focus:border-slate-400',
      note: 'Nhà chưa khai mã — không đối chiếu được',
      noteClass: 'text-slate-400',
      title: 'Nhà này chưa khai mã khách hàng nên không có gì để đối chiếu. '
        + 'Khai mã ở hồ sơ căn nhà thì ô này mới bắt lỗi được.',
    };
  }

  if (!actual) {
    return {
      state: 'missing-paper',
      expected,
      inputClass: 'border-amber-300 bg-amber-50 text-amber-800 placeholder:text-amber-500 focus:border-amber-400',
      note: `Chưa đọc được mã — nhà này lưu ${expected}`,
      noteClass: 'text-amber-700',
      title: `Mã chuẩn của căn nhà: ${expected}. Nhập mã in trên tờ giấy để đối chiếu.`,
    };
  }

  if (actual === stored) {
    return {
      state: 'ok',
      expected,
      inputClass: 'border-emerald-300 bg-emerald-50 text-emerald-900 focus:border-emerald-500',
      note: '',
      noteClass: '',
      title: `Khớp mã chuẩn của căn nhà (${expected}).`,
    };
  }

  return {
    state: 'mismatch',
    expected,
    inputClass: 'border-rose-400 bg-rose-50 text-rose-900 focus:border-rose-500',
    note: `Sai mã — nhà này lưu ${expected}`,
    noteClass: 'font-semibold text-rose-700',
    title: `Mã trên giấy không khớp mã chuẩn của căn nhà (${expected}). `
      + 'Hoặc OCR đọc lệch, hoặc ảnh này thuộc căn nhà khác.',
  };
};

interface Row {
  property: PropertyResponse;
  folder: string;
  file: File;
  imageUrl?: string;
  /** kWh với điện, m³ với nước. */
  totalQty: string;
  totalAmount: string;
  billingPeriod: string;
  /**
   * Kỳ trên dòng này TỪ ĐÂU RA. Ba nguồn, độ tin cậy khác hẳn nhau:
   *
   * - `ocr`     — in trên chính tờ giấy. Đáng tin nhất, và là dòng DUY NHẤT đáng nhìn kỹ:
   *               kỳ EVN/nước thật là chu kỳ chốt số (vd 07/08 – 06/09) nên nó hay khác
   *               tháng dương lịch, khác một cách hợp lệ.
   * - `manual`  — admin gõ tay, đè lên hai loại kia.
   * - `default` — hệ thống ĐOÁN theo tháng đang chọn vì không đọc được gì. Đa số rơi vào
   *               đây, nên KHÔNG cảnh báo từng dòng (ba chục dòng cùng một câu thì thành
   *               nhiễu, không ai đọc) — đếm gộp một lần ở thanh kỳ chung phía trên.
   *
   * Trước đây chỉ có cờ `periodFromOcr`, và ô nhập tay cũng bật cờ đó lên — nghĩa là dòng
   * admin tự gõ bị ghi nhận là "đọc từ ảnh". Tách ba nguồn để nhãn nói đúng sự thật.
   */
  periodSource: 'ocr' | 'manual' | 'default';
  /**
   * MÃ KHÁCH HÀNG đọc từ ảnh, sửa được. Điện là mã KH của EVN, nước là số danh bộ.
   *
   * Bắt buộc gửi khi căn nhà đã lưu mã: máy chủ chặn phát hành và ném
   * CUSTOMER_CODE_REQUIRED / CUSTOMER_CODE_MISMATCH. Nhập theo lô mà thiếu ô này thì cả
   * lô hỏng cùng lúc, và admin không có chỗ nào để sửa ngoài việc quét lại từ đầu.
   *
   * CẢ HAI LOẠI đều dùng, từ BE 5c6a65c. Trước đó nước được thả (`assertCustomerCodeMatches`
   * thoát sớm khi gặp WATER), nên ô này từng chỉ hiện với điện. Gắn nhầm hoá đơn nước vào
   * nhà khác hại y hệt gắn nhầm hoá đơn điện — cả một dãy phòng bị thu sai — nên không có
   * lý do nghiệp vụ nào để nước lỏng hơn.
   */
  customerCode: string;
  /** Chỉ nhà nguyên căn mới dùng — cần để phát hành thẳng cho khách. */
  prevReading: string;
  newReading: string;
  /**
   * Chỉ số cũ lấy từ SỔ CỦA HỆ THỐNG (số chốt cuối kỳ trước), không phải từ OCR.
   *
   * Khoá lại y như luồng phát hành lẻ. Chỉ số cũ phải nối liền với kỳ trước, còn OCR
   * chỉ đọc được những gì in trên tờ giấy đang cầm — `findReadingTriple` từng trả về
   * `1` cho một căn có chỉ số thật là 18.610. Cho sửa tay thì mỗi kỳ một mốc khác nhau,
   * hoá đơn khách nhận in ra một cặp số vô nghĩa và kỳ sau kế thừa luôn cái sai đó.
   */
  prevLocked?: boolean;
  /**
   * Chỉ số cũ ĐỌC ĐƯỢC TRÊN GIẤY — giữ RIÊNG, không để `prevReading` nuốt mất.
   *
   * Từ kỳ thứ 2, `prevReading` bị ghi đè bằng chốt của sổ hệ thống. Bản trước làm đúng
   * thế rồi vứt luôn số OCR vừa đọc — nghĩa là hai con số đáng lẽ phải bằng nhau thì
   * không bao giờ được đem ra so. Giấy ghi 18.616 trong khi kỳ trước chốt 18.610 thì 6
   * đơn vị ở giữa biến mất khỏi mọi hoá đơn, và màn hình hiện y như lúc mọi thứ đều đúng.
   */
  paperPrev: string;
  /** Kỳ đầu hay kỳ tiếp, chốt kỳ trước, mốc đón khách — xem `loadUtilityCycle`. */
  cycle?: UtilityCycle;
  /** Ghi chú của bước đọc: OCR hỏng, không ra số… */
  note?: string;
  /** Kỳ này nhà đó đã có hoá đơn PUBLISHED — bỏ qua để khỏi phát hành trùng. */
  already?: boolean;
  state: 'idle' | 'publishing' | 'done' | 'error';
  error?: string;
}

/**
 * Số nhà đọc song song ở chặng OCR.
 *
 * Ba là chỗ đứng giữa: nhanh gần gấp ba so với chạy tuần tự, mà không lúc nào có quá 3
 * request bay tới dịch vụ đọc hoá đơn — thứ đã khiến bản đầu chọn chạy từng cái một.
 * Nâng nữa thì rủi ro bị chặn hoặc timeout cả loạt, mà lúc đó không phân biệt được nhà
 * nào hỏng thật với nhà nào chỉ là nạn nhân của việc bắn quá tay.
 */
const READ_CONCURRENCY = 3;

/**
 * Chạy song song CÓ GIỚI HẠN, giữ NGUYÊN thứ tự kết quả.
 *
 * Giữ thứ tự là bắt buộc: bảng duyệt phải xếp đúng như bảng đối chiếu ở bước trước, không
 * thì nhà nào đọc xong sớm lại nhảy lên đầu và admin mất dấu mình đang xem tới đâu.
 */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const isWhole = (p: PropertyResponse) => p.wholeHouse === true;

/**
 * NGUYÊN CĂN: chỉ số mới = chỉ số cũ + tổng sản lượng.
 *
 * Không phải quy ước cho tiện, mà là ràng buộc máy chủ ép: `validateInvoiceAmounts` bắt
 * `mới − cũ` phải bằng đúng sản lượng, lệch một đơn vị là `CONSUMPTION_MISMATCH`.
 *
 * BUG 01/09/2026 — vì sao phải tách ra thành hàm riêng: phép tính này trước đây chỉ nằm
 * trong `patch`, tức chỉ chạy khi admin ĐỘNG VÀO dòng đó. Dòng nào admin không sửa gì thì
 * giữ nguyên chỉ số mới OCR đọc được, mà OCR hay đọc năm "2025" thành chỉ số — ra cặp
 * `18.615 → 2.025`, mới nhỏ hơn cũ, dòng bị gắn "Thiếu dữ liệu" mà không nói vì sao. Sửa
 * bừa một ô bất kỳ (kể cả ô kỳ hoá đơn) là nó tự đúng lại — triệu chứng vô lý tới mức
 * không ai đoán được nguyên nhân. Giờ dựng dòng xong là tính luôn, không đợi ai chạm vào.
 */
const withAutoNewReading = (r: Row): Row => {
  if (!isWhole(r.property)) return r;
  const prev = Number(onlyDigits(r.prevReading));
  const qty = Number(onlyDigits(r.totalQty));
  // `onlyDigits('')` → `Number('')` → 0, vẫn là số hữu hạn. Không chặn ô rỗng ở đây thì
  // nhà chưa có chỉ số cũ sẽ nhận chỉ số mới = đúng sản lượng, trông như số thật.
  if (r.prevReading === '' || !(qty > 0) || !Number.isFinite(prev)) return r;
  return { ...r, newReading: String(prev + qty) };
};

/**
 * VÌ SAO dòng này chưa phát hành được — câu trả lời hiển thị được, `null` là sẵn sàng.
 *
 * Trước đây hàm này trả true/false và bảng in đúng một chữ "Thiếu dữ liệu" cho mọi lý do:
 * thiếu tổng tiền, kỳ sai định dạng, chỉ số mới nhỏ hơn chỉ số cũ — nhìn giống hệt nhau,
 * mà ba thứ đó sửa ở ba chỗ khác nhau. Admin đứng trước bảng ba chục dòng và không biết
 * phải chạm vào ô nào. Nói thẳng ra thì mất thêm một cột chữ, và tiết kiệm cả một vòng dò.
 */
const rowBlocker = (r: Row, unit: string, kind: 'ELECTRIC' | 'WATER'): string | null => {
  if (!(Number(onlyDigits(r.totalQty)) > 0)) return `Chưa có tổng ${unit}`;
  if (!(Number(onlyDigits(r.totalAmount)) > 0)) return 'Chưa có tổng tiền';
  /*
    Mã lệch thì CHẶN ngay tại đây, đừng để bấm rồi máy chủ mới từ chối.

    Máy chủ chặn cùng lý do, nhưng chặn sớm thì admin sửa lúc còn đang nhìn tờ giấy. Chặn
    muộn thì ba chục dòng đỏ hiện ra một lượt sau khi đã bấm, và phải đọc ngược từng câu.
    Từ 11/09/2026 xét CẢ NƯỚC: máy chủ đã bật đối chiếu số danh bộ (BE 5c6a65c), trước đó
    nó thoát sớm với loại nước nên xét ở app cũng vô nghĩa.
  */
  {
    const m = codeMatchOf(r.customerCode, expectedCodeOf(r.property, kind));
    const label = kind === 'WATER' ? 'Số danh bộ' : 'Mã KH';
    if (m.state === 'mismatch') return `${label} sai — nhà này lưu ${m.expected}`;
    if (m.state === 'missing-paper') return `Chưa có ${label.toLowerCase()}`;
  }
  // Kỳ sai định dạng cũng là chưa sẵn sàng — nó là khoá đối chiếu, không phải nhãn hiển thị.
  const period = periodProblem(r.billingPeriod);
  if (period) return `Kỳ hoá đơn: ${period}`;
  if (!isWhole(r.property)) return null;
  if (r.prevReading === '') return 'Chưa có chỉ số cũ';
  if (r.newReading === '') return 'Chưa có chỉ số mới';
  const prev = Number(onlyDigits(r.prevReading));
  const next = Number(onlyDigits(r.newReading));
  if (!(next > prev)) return 'Chỉ số mới phải lớn hơn chỉ số cũ';

  /*
   * TỪ KỲ THỨ 2: chỉ số mới của kỳ trước PHẢI bằng chỉ số cũ của kỳ này.
   *
   * Đây là ràng buộc cứng, không phải gợi ý. Hai kỳ liền nhau không nối được nghĩa là
   * phần tiêu thụ giữa hai mốc rơi ra ngoài mọi hoá đơn: không ai thu, và về sau cũng
   * không truy ngược được nó thuộc kỳ nào. Nên lệch thì CHẶN phát hành, để admin mở ảnh
   * ra soi lại — hoặc số trên giấy đọc nhầm, hoặc sổ đang sai và phải sửa trước đã.
   *
   * `prevClose` rỗng = kỳ đầu (chưa có gì để nối) hoặc không tra được — cả hai đều không
   * có cơ sở để so, nên bỏ qua chứ không chặn oan.
   */
  /*
   * KỲ ĐẦU: chỉ số đầu kỳ thấp hơn mốc đón khách nhiều hơn cả lượng tiêu thụ của kỳ là
   * chuyện không thể xảy ra ngoài đời — chỉ có thể do OCR đọc nhầm. Chặn luôn, vì nhìn
   * cặp `1 → 2.025` thì không có gì báo cho admin biết là nó sai.
   */
  if (firstPeriodNote(r.cycle, prev, Number(onlyDigits(r.totalQty)))?.kind === 'bad-prev') {
    return 'Chỉ số đầu kỳ đọc sai — thấp hơn mốc đón khách';
  }

  if (r.cycle?.prevClose) {
    if (r.paperPrev === '') return 'Nhập chỉ số cũ in trên giấy để đối chiếu với sổ';
    const gap = continuityGap(r.cycle, Number(onlyDigits(r.paperPrev)));
    if (gap) {
      return `Giấy ghi ${groupThousands(String(gap.found))}, kỳ trước chốt `
        + `${groupThousands(String(gap.expected))} — lệch ${groupThousands(String(Math.abs(gap.diff)))} ${unit}`;
    }
  }
  return null;
};

/** Dòng đã đủ dữ liệu để phát hành chưa. Dòng đã xong / đã có kỳ này thì không tính. */
const rowReady = (r: Row, unit: string, kind: 'ELECTRIC' | 'WATER'): boolean =>
  !r.already && r.state !== 'done' && rowBlocker(r, unit, kind) === null;

type FilterKey = 'all' | 'issue' | 'ready' | 'skip';

/**
 * Lọc bảng duyệt. Một lô có thể 50–100 nhà, và cái admin thật sự cần làm là tìm mấy dòng
 * CÓ VẤN ĐỀ giữa hàng chục dòng đã đúng sẵn — cuộn tay dò từng dòng thì vừa lâu vừa sót.
 */
const FILTERS: {
  key: FilterKey; label: string; on: string;
  match: (r: Row, unit: string, kind: 'ELECTRIC' | 'WATER') => boolean;
}[] = [
  { key: 'all', label: 'Tất cả', on: 'bg-slate-800 text-white', match: () => true },
  {
    key: 'issue', label: 'Cần sửa', on: 'bg-amber-500 text-white',
    match: (r, unit, kind) => !r.already && r.state !== 'done' && rowBlocker(r, unit, kind) !== null,
  },
  { key: 'ready', label: 'Sẵn sàng', on: 'bg-emerald-600 text-white', match: rowReady },
  {
    key: 'skip', label: 'Bỏ qua', on: 'bg-slate-500 text-white',
    match: r => !!r.already || r.state === 'done',
  },
];

export const UtilityBillZipImport = ({
  kind, properties, month, year, defaultPeriod, existing, onClose, onDone,
}: {
  kind: UtilityKind;
  /** Danh mục nhà để đối chiếu tên folder. */
  properties: PropertyResponse[];
  month: number;
  year: number;
  /** Kỳ mặc định điền sẵn, vd "01/08 – 31/08/2026". */
  defaultPeriod: string;
  /** Hoá đơn kỳ này đã phát hành — để đánh dấu nhà nào khỏi làm lại. */
  existing: { propertyId: number; status?: 'PUBLISHED' | 'REVOKED' }[];
  onClose: () => void;
  /** Gọi sau khi phát hành xong ít nhất một nhà, để trang cha tải lại. */
  onDone: () => void;
}) => {
  const cfg = KIND[kind];
  /** Đơn giá của dòng — dùng để soi OCR đọc lệch. */
  const rowUnitPrice = (r: Row): number =>
    cfg.unitPrice(Number(onlyDigits(r.totalAmount)), Number(onlyDigits(r.totalQty)));
  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<ZipBillPreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  /**
   * Kỳ dùng chung cho cả lô — sửa MỘT chỗ thay vì sửa từng dòng.
   *
   * Hoá đơn nước và phần lớn hoá đơn điện không in kỳ ở dạng máy đọc được, nên gần như cả
   * lô cùng rơi về kỳ đoán theo tháng. Bản đầu để mỗi dòng một ô nhập: ba chục ô giống hệt
   * nhau, kèm ba chục lần một câu cảnh báo — mà muốn đổi kỳ thật thì phải sửa đủ ba chục
   * lần, không sót cái nào, nếu không là hai kỳ khác nhau nằm lẫn trong cùng một tháng và
   * quản lý đối chiếu không ra.
   *
   * Sửa ở đây chảy xuống MỌI dòng chưa có kỳ riêng. Dòng đọc được kỳ trên giấy hoặc admin
   * đã gõ tay thì giữ nguyên — đó mới là ngoại lệ thật, không được ghi đè lặng lẽ.
   */
  const [batchPeriod, setBatchPeriod] = useState(defaultPeriod);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [busy, setBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  /**
   * Bước xác nhận trước khi phát hành.
   *
   * Phát hành là hành động MỘT CHIỀU với hàng chục nhà cùng lúc: hoá đơn tổng đã tạo thì
   * phải đi thu hồi từng cái, và với nguyên căn thì khách đã nhận hoá đơn rồi. Bấm một
   * nút mà chạy thẳng cả lô là quá dễ lỡ tay.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);

  const publishedIds = new Set(
    existing.filter(b => b.status !== 'REVOKED').map(b => b.propertyId),
  );

  // ── Chặng 1: đọc zip, đối chiếu tên folder ────────────────────────────────
  const handleZip = async (file: File) => {
    setBusy(true);
    setZipError(null);
    try {
      const p = await inspectZipBills(file, properties);
      setPreview(p);
      setStage('preview');
    } catch (e: any) {
      setZipError(e?.message || 'Không đọc được file .zip — kiểm tra lại file có hỏng không.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * ── Chặng 2: tải ảnh + OCR, chạy SONG SONG CÓ GIỚI HẠN ────────────────────
   *
   * Bản đầu chạy tuần tự hoàn toàn với lý do "OCR là dịch vụ ngoài, bắn cùng lúc dễ bị
   * chặn". Lý lẽ đó đúng với HAI CHỤC request, không đúng với ba — mà cái giá phải trả
   * là mỗi nhà hai lượt gọi mạng nối đuôi nhau, 20 nhà là 40 lượt xếp hàng.
   *
   * Nay chạy `READ_CONCURRENCY` nhà một lúc: nhanh gần gấp ba mà vẫn không có lúc nào
   * quá 3 request đang bay, nên vẫn giữ được điều đã hứa với dịch vụ OCR.
   *
   * Nhà nào KỲ NÀY ĐÃ CÓ hoá đơn thì bỏ qua hẳn cả upload lẫn OCR — trước đây vẫn tải
   * ảnh lên rồi đọc đầy đủ, xong chỉ để hiện nhãn "Kỳ này đã có" và bị loại lúc phát
   * hành. Tốn tiền Cloudinary lẫn quota OCR cho một kết quả không ai dùng.
   */
  const runReading = async () => {
    if (!preview) return;
    setStage('reading');
    setProgress({ done: 0, total: preview.matched.length });

    const readOne = async (m: ZipBillPreview['matched'][number]): Promise<Row> => {
      const base: Row = {
        property: m.property,
        folder: m.folder,
        file: m.file,
        totalQty: '', totalAmount: '', billingPeriod: batchPeriod, periodSource: 'default',
        prevReading: '', newReading: '', paperPrev: '', customerCode: '',
        already: publishedIds.has(m.property.id),
        state: 'idle',
      };
      if (base.already) {
        base.note = 'Kỳ này đã có hoá đơn — bỏ qua';
        setProgress(p => ({ ...p, done: p.done + 1 }));
        return base;
      }
      try {
        const url = await uploadToCloudinary(m.file, 'image');
        base.imageUrl = url;
        try {
          const ocr = await cfg.ocr(url);
          const parsed = cfg.parse(ocr);
          // Số của BE chỉ dùng bù ô còn trống — parser FE đọc rawText chuẩn hơn
          // (xem ghi chú ở luồng phát hành lẻ).
          base.totalQty = parsed.qty;
          base.totalAmount = parsed.amount
            || (Number(ocr?.totalAmount) > 0 ? String(ocr.totalAmount) : '');
          const readPeriod = parsed.period || ocr?.billingPeriod || '';
          base.billingPeriod = readPeriod || batchPeriod;
          base.periodSource = readPeriod ? 'ocr' : 'default';
          base.prevReading = parsed.prevReading;
          base.newReading = parsed.newReading;
          // Giữ bản gốc của giấy — `prevReading` bên dưới có thể bị sổ hệ thống ghi đè.
          base.paperPrev = parsed.prevReading;
          // Mã KH: tin số của máy chủ trước, rồi tới parser của app. Nước bỏ qua vì máy
          // chủ không đối chiếu mã cho hoá đơn nước.
          base.customerCode = (ocr as { customerCode?: string })?.customerCode
            || parsed.customerCode || '';
          if (!base.totalQty && !base.totalAmount) base.note = 'Không đọc được số — nhập tay';
        } catch {
          base.note = 'Dịch vụ đọc hoá đơn lỗi — nhập tay';
        }

        /*
         * NGUYÊN CĂN: hai kỳ, hai cách lấy chỉ số cũ — xem `loadUtilityCycle`.
         *
         *  • KỲ THỨ 2 TRỞ ĐI → lấy chốt của SỔ HỆ THỐNG và KHOÁ ô lại. Chỉ số cũ phải nối
         *    liền kỳ trước, còn OCR chỉ đọc được những gì in trên tờ giấy đang cầm
         *    (`findReadingTriple` từng trả `1` cho căn có chỉ số thật 18.610). Số của giấy
         *    không bị vứt đi mà chuyển sang `paperPrev` để đối chiếu.
         *
         *  • KỲ ĐẦU → không có gì để nối, nên đi theo giấy và MỞ ô cho sửa. Cố ý không
         *    điền mốc đón khách vào đây dù đó mới là điểm đúng để bắt đầu tính tiền: máy
         *    chủ ép `mới − cũ = sản lượng trên giấy`, điền mốc đón khách vào là hiệu ra
         *    nhỏ hơn và KHÔNG phát hành được. Phần khách bị tính dư bày ra ở cột chỉ số.
         */
        if (isWhole(m.property)) {
          const cycle = await loadUtilityCycle(m.property.id, kind, month, year)
            .catch(() => null);
          if (cycle) {
            base.cycle = cycle;
            if (cycle.prevClose) {
              base.prevReading = String(cycle.prevClose.reading);
              base.prevLocked = true;
            }
          }
        }
      } catch {
        base.note = 'Không tải được ảnh lên';
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
      // Tính chỉ số mới NGAY, đừng đợi admin chạm vào dòng — xem `withAutoNewReading`.
      return withAutoNewReading(base);
    };

    // Giữ nguyên thứ tự nhà như bảng đối chiếu, dù chúng chạy xong không theo thứ tự.
    const out = await mapWithLimit(preview.matched, READ_CONCURRENCY, readOne);
    setRows(out);
    setStage('review');
  };

  /**
   * Sửa một dòng, và tính lại chỉ số mới cho nhà nguyên căn (xem `withAutoNewReading`).
   *
   * Phải tính lại ở MỖI lần sửa, không phải điền một lần rồi thôi như luồng phát hành lẻ:
   * admin duyệt hàng chục dòng, sửa tổng kWh ở dòng thứ mười rồi quên, mà hiệu số không
   * còn khớp thì lỗi chỉ lộ ra lúc bấm phát hành cả lô.
   */
  const patch = (idx: number, next: Partial<Row>) =>
    setRows(rs => rs.map((r, i) => (i === idx ? withAutoNewReading({ ...r, ...next }) : r)));

  /**
   * Đổi kỳ chung → chảy xuống mọi dòng còn đang dùng kỳ đoán.
   *
   * Chừa lại đúng ba loại: dòng đọc được kỳ trên giấy, dòng admin đã gõ tay, và dòng đã
   * phát hành xong (`done`) hay bị bỏ qua (`already`) — sửa kỳ của chúng chẳng đổi được gì
   * ngoài việc làm sai thứ đang hiển thị.
   */
  const changeBatchPeriod = (value: string) => {
    setBatchPeriod(value);
    setRows(rs => rs.map(r =>
      r.periodSource === 'default' && !r.already && r.state !== 'done'
        ? { ...r, billingPeriod: value }
        : r));
  };

  /** Số dòng còn ăn theo kỳ chung — để nói rõ "đổi ở đây là đổi cho mấy nhà". */
  const followingBatch = rows.filter(
    r => r.periodSource === 'default' && !r.already && r.state !== 'done').length;
  const onPaperCount = rows.filter(r => r.periodSource === 'ocr').length;
  const batchIssue = periodProblem(batchPeriod);

  // ── Chặng 3: phát hành TUẦN TỰ, giữ lại dòng lỗi ──────────────────────────
  const publishAll = async () => {
    const targets = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowReady(r, cfg.unit, kind));
    if (targets.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;

    for (const { r, i } of targets) {
      patch(i, { state: 'publishing', error: undefined });
      const qty = Number(onlyDigits(r.totalQty));
      const totalAmount = Number(onlyDigits(r.totalAmount));
      const period = r.billingPeriod.trim();
      try {
        const created = await cfg.publish({
          propertyId: r.property.id,
          billingPeriod: period,
          month, year, qty, amount: totalAmount,
          imageUrl: r.imageUrl || undefined,
          prevReading: isWhole(r.property) ? Number(onlyDigits(r.prevReading)) : undefined,
          newReading: isWhole(r.property) ? Number(onlyDigits(r.newReading)) : undefined,
          // Thiếu mã là cả lô hỏng cùng lúc khi nhà đã khai mã — xem chú thích ở `Row`.
          customerCode: r.customerCode.trim() || undefined,
          ocrConfirmed: true,
        });

        /*
         * NGUYÊN CĂN — phát hành thẳng cho khách. HAI LỆNH KHÔNG NGUYÊN TỬ: hoá đơn
         * tổng đã tạo xong rồi mới gọi lệnh này. Lỗi ở đây phải nói RÕ là "tổng đã tạo,
         * chưa gửi được cho khách" — admin cần biết ĐỪNG phát hành lại nhà đó.
         */
        if (isWhole(r.property)) {
          try {
            await utilityInvoiceService.createForWholeHouse(r.property.id, {
              type: kind,
              billingPeriod: period,
              prevReading: Number(onlyDigits(r.prevReading)),
              newReading: Number(onlyDigits(r.newReading)),
              consumption: qty,
              // Ưu tiên đơn giá BE trả về: BE tính ở scale 8, FE tự chia sẽ lệch
              // và rơi vào AMOUNT_MISMATCH.
              unitPrice: created.unitPrice ?? cfg.unitPrice(totalAmount, qty),
              amount: totalAmount,
              meterImageUrl: r.imageUrl || undefined,
            }, { silent: true });
          } catch (e: any) {
            /*
             * MÃ LỖI nằm ở `data.code`, KHÔNG phải `data.error`.
             *
             * `GlobalExceptionHandler.handleBusiness` dựng `ErrorResponse` với
             * `error = ex.getMessage()` (câu tiếng Việt) và `code = ex.getCode()`. Bản
             * trước đọc `data.error` rồi đem so với 'INVOICE_ALREADY_EXISTS' — vế trái
             * luôn là một câu văn nên điều kiện KHÔNG BAO GIỜ khớp.
             *
             * Hậu quả: ca lành nhất (BE bản 2 luồng đã tự phát hành cho khách trong cùng
             * transaction, nên lệnh này thành dư) bị tính là thất bại. Bảng báo đỏ "chưa
             * gửi được cho khách", chân hộp đếm "lỗi 3", trong khi hoá đơn đã tới tay
             * khách đầy đủ — admin đọc xong tưởng hỏng, đi làm lại một việc đã xong.
             */
            const code = e?.response?.data?.code || '';
            if (code !== 'INVOICE_ALREADY_EXISTS') {
              patch(i, {
                state: 'error',
                error: 'Hoá đơn tổng ĐÃ tạo nhưng chưa gửi được cho khách — đừng phát hành lại, vào màn lẻ gửi tiếp.',
              });
              setProgress(p => ({ ...p, done: p.done + 1 }));
              continue;
            }
          }
        }

        patch(i, { state: 'done' });
        ok += 1;
      } catch (e: any) {
        // Cùng lỗi đọc nhầm trường như trên — mã ở `data.code`, không phải `data.error`.
        const errCode = e?.response?.data?.code;
        /*
          Hai lỗi mã khách hàng phải nói NGẮN và nói ĐÚNG Ô CẦN SỬA.

          Ở nhập lô, một câu dài của máy chủ nhân với ba chục dòng là không ai đọc. Mà cách
          gỡ thì chỉ có một: sửa ô mã ngay trên dòng đó rồi bấm phát hành lại — dòng đã
          thành công không bị làm lại vì `skip` chặn sẵn.
        */
        const norm = (s?: string) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const expected = norm(e?.response?.data?.details?.expectedCustomerCode);
        const msg = errCode === 'BILL_ALREADY_EXISTS'
          ? 'Kỳ này nhà đã có hoá đơn rồi'
          : errCode === 'CUSTOMER_CODE_MISMATCH'
            ? `${kind === 'WATER' ? 'Số danh bộ' : 'Mã KH'} không khớp — nhà này lưu "${expected || '—'}". Sửa ô mã rồi phát hành lại.`
            : errCode === 'CUSTOMER_CODE_REQUIRED'
              ? `Nhà này đã khai ${kind === 'WATER' ? 'số danh bộ' : 'mã KH'} — điền số trên giấy vào ô mã rồi phát hành lại.`
              : (e?.response?.data?.message || e?.message || 'Phát hành thất bại');
        patch(i, { state: 'error', error: msg });
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setBusy(false);
    if (ok > 0) {
      toast.success(`Đã phát hành hoá đơn ${cfg.noun} cho ${ok} nhà`);
      onDone();
    }
  };

  /**
   * Đơn giá có thể là giá điện/nước thật không.
   *
   * ─── Vì sao KHÔNG so nhà này với nhà khác ─────────────────────────────────
   * Bản đầu lấy trung vị đơn giá cả lô rồi báo đỏ dòng nào lệch quá 50%. Sai về bản
   * chất: điện Việt Nam tính BẬC THANG, mà con số ở đây là giá BÌNH QUÂN
   * (`tổng tiền ÷ tổng sản lượng`) — nên nó phụ thuộc vào chính lượng dùng. Nhà dùng
   * 80 kWh chỉ chạm bậc 1–2, nhà dùng 600 kWh leo tới bậc 6; bình quân chênh nhau
   * tới ~1,6 lần mà CẢ HAI ĐỀU ĐÚNG. Cách so đó báo động giả đúng vào những nhà dùng
   * nhiều hoặc dùng rất ít — và cảnh báo sai vài lần là lần sau không ai đọc nữa.
   *
   * Nay hỏi một câu khác, không dính tới nhà khác: "con số này có thể là giá điện
   * không?". Lỗi OCR thật sự gây ra đều lệch cả chục tới cả nghìn lần — đọc mã công tơ
   * 18.006.996 thành kWh làm giá tụt còn vài đồng, đọc mã số thuế thành tiền làm giá
   * vọt lên hàng chục nghìn. Khoảng hợp lệ để rộng rãi nên chênh lệch do bậc thang
   * không bao giờ chạm tới.
   *
   * ⚠️ Đây là số VIẾT CỨNG theo giá điện/nước Việt Nam hiện hành. Nhà nước tăng giá
   * nhiều đợt thì phải nới lại — nếu thấy cảnh báo này nổi lên hàng loạt trên hoá đơn
   * thật thì kiểm chỗ này trước, đừng đi sửa số liệu.
   */
  const isOutlier = (r: Row): boolean => {
    const p = rowUnitPrice(r);
    if (p <= 0) return false;
    return p < cfg.priceFloor || p > cfg.priceCeil;
  };

  const readyCount = rows.filter(r => rowReady(r, cfg.unit, kind)).length;
  const doneCount = rows.filter(r => r.state === 'done').length;
  const errCount = rows.filter(r => r.state === 'error').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:py-10">
        <div className="relative w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nhập theo lô</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-slate-950">
                <FileArchive className="h-5 w-5 text-indigo-500" /> {cfg.title}
              </h2>
            </div>
            <button onClick={onClose} disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-40">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5">
            {/* ── Chặng 1: chọn file ── */}
            {stage === 'pick' && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Mỗi nhà một folder, tên folder là <b className="text-slate-800">mã đứng đầu tên nhà</b>.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs text-slate-600">{`MTX#124/
  └ hoa-don.jpg
MTX#125/
  └ hoa-don.png`}</pre>
                </div>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-10 transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  {busy
                    ? <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                    : <Upload className="h-7 w-7 text-slate-400" />}
                  <span className="text-sm font-bold text-slate-700">
                    {busy ? 'Đang đọc file .zip…' : 'Chọn file .zip'}
                  </span>
                  <input type="file" accept=".zip" className="hidden" disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleZip(f); }} />
                </label>

                {zipError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {zipError}
                  </p>
                )}
              </>
            )}

            {/* ── Chặng 2: bảng đối chiếu ── */}
            {stage === 'preview' && preview && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Tally n={preview.matched.length} label="Nhà khớp mã" tone="emerald" />
                  <Tally n={preview.unknownFolders.length} label="Folder không khớp nhà nào" tone="amber" />
                  <Tally n={preview.ambiguous.length} label="Mã trùng — phải sửa tên nhà" tone="rose" />
                </div>

                {preview.matched.length > 0 && (
                  <ListBlock title={`Sẽ nhập cho ${preview.matched.length} nhà`}>
                    {preview.matched.map(m => (
                      <li key={m.property.id} className="flex items-center gap-2 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="font-mono text-xs text-slate-500">{m.folder}/</span>
                        <span className="truncate font-semibold text-slate-700">{m.property.propertyName}</span>
                        {publishedIds.has(m.property.id) && (
                          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                            KỲ NÀY ĐÃ CÓ
                          </span>
                        )}
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.ambiguous.length > 0 && (
                  <ListBlock title="Mã trùng — bỏ qua" tone="rose">
                    {preview.ambiguous.map(a => (
                      <li key={a.folder} className="py-1">
                        <span className="font-mono text-xs">{a.folder}/</span> khớp{' '}
                        {a.propertyNames.length} nhà: {a.propertyNames.join(' · ')}
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.unknownFolders.length > 0 && (
                  <ListBlock title="Không khớp nhà nào — bỏ qua" tone="amber">
                    {preview.unknownFolders.map(u => (
                      <li key={u.folder} className="py-1">
                        <span className="font-mono text-xs">{u.folder}/</span> ({u.imageCount} ảnh)
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.emptyFolders.length > 0 && (
                  <ListBlock title="Folder không có ảnh nào" tone="amber">
                    {preview.emptyFolders.map(f => <li key={f} className="py-1 font-mono text-xs">{f}/</li>)}
                  </ListBlock>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={() => { setStage('pick'); setPreview(null); }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
                    Chọn file khác
                  </button>
                  <button onClick={runReading} disabled={preview.matched.length === 0}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
                    Đọc số liệu {preview.matched.length} nhà →
                  </button>
                </div>
              </>
            )}

            {/* ── Chặng 3: đang đọc ── */}
            {stage === 'reading' && (
              <div className="py-14 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  Đang tải ảnh & đọc hoá đơn… {progress.done}/{progress.total}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Đọc {READ_CONCURRENCY} nhà một lượt — nhanh hơn mà dịch vụ đọc hoá đơn không quá tải.
                </p>
                <div className="mx-auto mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* ── Chặng 4: bảng duyệt ── */}
            {stage === 'review' && (
              <>
                {/*
                  THANH ĐIỀU KHIỂN CỦA CẢ LÔ — gộp kỳ chung + bộ lọc vào MỘT hàng.
                  Bản trước xếp ba khối chồng lên nhau (cảnh báo dài + kỳ chung + bảng), ăn
                  gần nửa màn hình trước khi thấy dòng đầu tiên. Với lô 50–100 nhà thì thứ
                  admin cần là vào bảng càng nhanh càng tốt và nhảy thẳng tới dòng có vấn đề.
                */}
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Kỳ cả lô
                    </span>
                    <input
                      value={batchPeriod}
                      onChange={e => changeBatchPeriod(e.target.value)}
                      placeholder="01/09 – 30/09/2026"
                      title={`Áp cho ${followingBatch} nhà không đọc được kỳ trên giấy.`
                        + (onPaperCount > 0 ? ` ${onPaperCount} nhà có kỳ in trên giấy giữ nguyên, không bị đè.` : '')}
                      className={`w-40 rounded-lg border bg-white px-2 py-1.5 text-xs font-bold tabular-nums outline-none transition focus:ring-2 ${
                        batchIssue
                          ? 'border-rose-300 text-rose-700 focus:border-rose-400 focus:ring-rose-100'
                          : 'border-slate-300 text-slate-800 focus:border-indigo-400 focus:ring-indigo-100'}`}
                    />
                    <span className="text-xs text-slate-500">
                      {batchIssue
                        ? <b className="text-rose-600">⚠ {batchIssue}</b>
                        : <>áp cho <b className="text-slate-700">{followingBatch}</b>/{rows.length} nhà</>}
                    </span>
                  </div>

                  {/* Bộ lọc — với 100 dòng, cuộn tay tìm dòng đỏ là không khả thi. */}
                  <div className="ml-auto flex items-center gap-1">
                    {FILTERS.map(f => {
                      const n = rows.filter(r => f.match(r, cfg.unit, kind)).length;
                      const on = filter === f.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => setFilter(f.key)}
                          disabled={n === 0 && !on}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-30 ${
                            on ? f.on : 'text-slate-500 hover:bg-white'}`}
                        >
                          {f.label} {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="mb-2 text-xs leading-relaxed text-slate-400">
                  Số liệu do máy đọc từ ảnh — <b className="text-slate-500">phải kiểm lại trước khi phát hành</b>.
                  Sai tổng {cfg.unit} là sai đơn giá, mà quản lý dựng hoá đơn từng phòng trên chính đơn giá đó.
                </p>

                <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[900px] text-sm">
                    {/* `sticky` là bắt buộc ở lô lớn: cuộn tới dòng thứ 60 mà mất tiêu đề thì
                        không còn biết ô số đang nhìn là tổng tiền hay chỉ số. */}
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wider text-slate-400 shadow-[0_1px_0_0_rgb(226_232_240)]">
                      <tr>
                        {/*
                          NĂM cột, không phải bảy. Bảy cột không vừa bề ngang nào cả — bản
                          trước phải hạ chữ xuống 9–10px mà vẫn tràn, cột Trạng thái nằm hẳn
                          ngoài màn hình. Hai cột bị gộp lại vì chúng không phải thông tin
                          độc lập: KỲ gần như giống nhau ở mọi dòng (đã có thanh kỳ chung ở
                          trên) nên xuống dòng phụ của cột Nhà, còn ĐƠN GIÁ là số dẫn xuất từ
                          chính ô tổng tiền nên nằm ngay dưới nó.
                        */}
                        <th className="px-4 py-2.5">Nhà · kỳ hoá đơn</th>
                        <th className="px-4 py-2.5 text-right">{cfg.qtyLabel}</th>
                        <th className="px-4 py-2.5 text-right">Tổng tiền · đơn giá</th>
                        <th className="px-4 py-2.5">
                          {cfg.readingLabel}
                          <span className="mt-0.5 block text-[10px] font-bold normal-case tracking-normal text-slate-400">
                            đầu kỳ → cuối kỳ
                          </span>
                        </th>
                        <th className="px-4 py-2.5">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Giữ chỉ số GỐC `i` qua bộ lọc — `patch(i, …)` sửa theo vị trí trong
                          `rows`, lọc xong mà đánh số lại thì mỗi lần lọc sẽ sửa nhầm dòng. */}
                      {rows.map((r, i) => ({ r, i }))
                        .filter(({ r }) => FILTERS.find(f => f.key === filter)!.match(r, cfg.unit, kind))
                        .map(({ r, i }) => {
                        const whole = isWhole(r.property);
                        const price = rowUnitPrice(r);
                        const skip = r.already || r.state === 'done';
                        const periodIssue = skip ? null : periodProblem(r.billingPeriod);
                        const blocker = skip ? null : rowBlocker(r, cfg.unit, kind);
                        return (
                          <tr key={r.property.id} className={
                            r.state === 'done' ? 'bg-emerald-50/50'
                            : r.state === 'error' ? 'bg-rose-50/50'
                            : r.already ? 'bg-slate-50' : undefined}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                {r.imageUrl && (
                                  <a href={r.imageUrl} target="_blank" rel="noreferrer" className="shrink-0"
                                    title="Mở ảnh hoá đơn gốc">
                                    <img src={r.imageUrl} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover" />
                                  </a>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-800">{r.property.propertyName}</p>
                                  {/*
                                    MÃ KHÁCH HÀNG ĐIỆN — ô sửa được, nằm ngay dưới tên nhà.

                                    Không phải để trang trí: máy chủ CHẶN phát hành khi mã lệch
                                    mã đã lưu của căn nhà. Nhập theo lô mà thiếu ô này thì cả ba
                                    chục dòng hỏng cùng lúc, và admin không có chỗ nào sửa ngoài
                                    việc bỏ hết đi quét lại từ đầu.

                                    Cả điện lẫn nước: máy chủ đối chiếu cả hai từ 11/09/2026.
                                  */}
                                  {!skip && (() => {
                                    const match = codeMatchOf(
                                      r.customerCode, expectedCodeOf(r.property, kind),
                                    );
                                    return (
                                      <>
                                        <div className="mt-0.5 flex items-center gap-1">
                                          <input
                                            value={r.customerCode}
                                            onChange={(e) => patch(i, { customerCode: e.target.value })}
                                            placeholder={match.expected
                                              || (kind === 'WATER' ? 'Số danh bộ trên giấy' : 'Mã KH trên giấy')}
                                            title={match.title}
                                            className={`w-full rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide outline-none ${match.inputClass}`}
                                          />
                                          {match.state === 'ok' && (
                                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                          )}
                                        </div>
                                        {!!match.note && (
                                          <p className={`mt-0.5 text-[10px] leading-tight ${match.noteClass}`}>
                                            {match.note}
                                          </p>
                                        )}
                                      </>
                                    );
                                  })()}
                                  <div className="flex items-center gap-1.5">
                                    {/*
                                      Kỳ nằm ở dòng phụ của cột Nhà, không chiếm cột riêng: cả
                                      lô gần như cùng một kỳ (thanh kỳ chung ở trên đã nói),
                                      nên một cột rộng lặp lại đúng chuỗi đó ba chục lần là
                                      lãng phí đúng thứ đang thiếu — bề ngang.

                                      Dòng ăn theo kỳ chung để chữ xám không viền, nhìn là biết
                                      "giống thanh trên kia". Chỉ dòng có kỳ RIÊNG mới được tô.

                                      KHÔNG dán ✓ lên chuỗi admin vừa gõ: dấu tích đọc ra là
                                      "đã kiểm, đúng rồi", trong khi cái duy nhất nó biết là ô
                                      này có kỳ riêng — gõ thừa một số thành `30/09/20226` vẫn
                                      được khen đúng. ✓ chỉ dành cho kỳ IN TRÊN GIẤY.
                                    */}
                                    <input
                                      value={r.billingPeriod}
                                      disabled={skip}
                                      placeholder="Chưa có kỳ"
                                      title={
                                        periodIssue ? `Kỳ hoá đơn: ${periodIssue}`
                                        : r.periodSource === 'ocr' ? 'Kỳ in trên tờ hoá đơn — không bị kỳ chung ghi đè'
                                        : r.periodSource === 'manual' ? 'Bạn đã tự nhập kỳ cho nhà này — không bị kỳ chung ghi đè'
                                        : 'Đang theo kỳ chung của cả lô. Gõ vào đây để đặt kỳ riêng cho nhà này.'
                                      }
                                      onChange={e => patch(i, { billingPeriod: e.target.value, periodSource: 'manual' })}
                                      className={`w-36 rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:text-slate-300 ${
                                        periodIssue ? 'border-rose-300 bg-rose-50 text-rose-700'
                                        : r.periodSource === 'default'
                                          ? 'border-transparent bg-transparent text-slate-400 hover:border-slate-200 hover:bg-white'
                                          : 'border-emerald-200 bg-emerald-50/60 text-emerald-900'}`}
                                    />
                                    {periodIssue ? (
                                      <span className="shrink-0 text-xs font-bold text-rose-600">⚠</span>
                                    ) : r.periodSource === 'ocr' ? (
                                      <span className="shrink-0 text-xs font-bold text-emerald-600" title="Kỳ in trên giấy">✓</span>
                                    ) : null}
                                  </div>
                                  <p className="truncate text-xs text-slate-400">
                                    {whole ? 'Nguyên căn' : 'Chia phòng'}
                                    {/* Tên folder — đường lần ngược về đúng file trong zip khi
                                        thấy số liệu lạ, khỏi phải mở lại cả file đi dò. */}
                                    <span className="font-mono"> · {r.folder}/</span>
                                    {r.note && <span className="text-amber-600"> · {r.note}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <NumCell value={r.totalQty} disabled={skip} width="w-24"
                                title={`Tổng ${cfg.unit} in trên giấy`}
                                onChange={v => patch(i, { totalQty: v })} />
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <NumCell value={r.totalAmount} disabled={skip} width="w-32"
                                title="Tổng tiền phải trả in trên giấy"
                                onChange={v => patch(i, { totalAmount: v })} />
                              {/* Đơn giá = tiền ÷ sản lượng, không phải số nhập — nên nằm ngay
                                  dưới ô sinh ra nó chứ không đứng thành một cột riêng. */}
                              <p
                                className={`mt-1 cursor-help whitespace-nowrap text-xs font-bold tabular-nums underline decoration-dotted underline-offset-2 ${
                                  isOutlier(r)
                                    ? 'text-rose-600 decoration-rose-300'
                                    : 'text-slate-400 decoration-slate-300'}`}
                                title={isOutlier(r)
                                  ? `Giá ${cfg.noun} thực tế nằm trong khoảng ${formatCurrency(cfg.priceFloor)} – ${formatCurrency(cfg.priceCeil)}/${cfg.unit}, con số này ra ngoài khoảng đó. Gần như chắc chắn là đọc nhầm tổng ${cfg.unit} hoặc tổng tiền.`
                                  : `Đơn giá = tổng tiền ÷ tổng ${cfg.unit}. Quản lý dựng hoá đơn từng phòng trên chính con số này.`}
                              >
                                {price > 0 ? `${formatCurrency(price)}/${cfg.unit}` : '—'}
                                {isOutlier(r) && ' ⚠'}
                                <InfoDot />
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              {whole ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    {/* Chỉ số cũ KHOÁ khi lấy được từ sổ hệ thống — xem `prevLocked`. */}
                                    <NumCell value={r.prevReading} disabled={skip || !!r.prevLocked} width="w-24"
                                      title={r.prevLocked
                                        ? `Chỉ số ĐẦU KỲ (${cfg.unit}) — lấy đúng số chốt cuối kỳ trước hệ thống đã lưu, không sửa được.`
                                        : `Chỉ số ĐẦU KỲ (${cfg.unit}) — số ghi trên mặt công tơ lúc bắt đầu kỳ này.`}
                                      onChange={v => patch(i, { prevReading: v })} />
                                    <span className="text-slate-300">→</span>
                                    {/* Chỉ số mới là số DẪN XUẤT (cũ + sản lượng), không cho gõ —
                                        xem `withAutoNewReading`. Gõ số khác máy chủ cũng từ chối. */}
                                    <NumCell value={r.newReading} disabled width="w-24"
                                      title={`Chỉ số CUỐI KỲ (${cfg.unit}) — tự tính = đầu kỳ + tổng ${cfg.unit}. Sửa ô tổng bên trái thì số này đổi theo.`}
                                      onChange={() => { /* dẫn xuất */ }} />
                                  </div>
                                  {!skip && (
                                    <ReadingContext row={r} unit={cfg.unit}
                                      onPaperPrev={v => patch(i, { paperPrev: v })} />
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">quản lý ghi từng phòng</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {r.already ? (
                                <span className="whitespace-nowrap text-xs font-bold text-slate-500">Kỳ này đã có</span>
                              ) : r.state === 'done' ? (
                                <span className="whitespace-nowrap text-xs font-bold text-emerald-600">✓ Đã phát hành</span>
                              ) : r.state === 'publishing' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                              ) : r.state === 'error' ? (
                                <span className="text-xs font-semibold text-rose-600">{r.error}</span>
                              ) : blocker ? (
                                // Nói ĐÚNG ô cần sửa, không phải "Thiếu dữ liệu" chung chung.
                                <span className="text-xs font-bold text-amber-600">{blocker}</span>
                              ) : (
                                <span className="whitespace-nowrap text-xs font-bold text-emerald-600">Sẵn sàng</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {busy
                      ? `Đang phát hành… ${progress.done}/${progress.total}`
                      : <>Sẵn sàng <b className="text-slate-800">{readyCount}</b> nhà
                          {doneCount > 0 && <> · đã xong {doneCount}</>}
                          {errCount > 0 && <span className="text-rose-600"> · lỗi {errCount}</span>}</>}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={onClose} disabled={busy}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                      Đóng
                    </button>
                    <button onClick={() => setConfirmOpen(true)} disabled={busy || readyCount === 0}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Phát hành {readyCount} nhà
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {confirmOpen && (
            <ConfirmPublish
              noun={cfg.noun}
              rows={rows.filter(r => rowReady(r, cfg.unit, kind)).map(r => ({
                name: r.property.propertyName,
                period: r.billingPeriod,
                whole: isWhole(r.property),
                outlier: isOutlier(r),
                defaultPeriod: r.periodSource === 'default',
              }))}
              skipped={rows.filter(r => !rowReady(r, cfg.unit, kind) && !r.already && r.state !== 'done').length}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={publishAll}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Xác nhận trước khi phát hành cả lô.
 *
 * Chỉ nhắc lại đúng những thứ SAI THÌ KHÓ GỠ, không kể lể lại cả bảng: nhà nào sẽ được
 * phát hành, kỳ nào, và hai loại rủi ro mà bảng trên dễ lướt qua — kỳ do hệ thống đoán,
 * và đơn giá không thể là giá điện/nước thật.
 */
const ConfirmPublish = ({ noun, rows, skipped, onCancel, onConfirm }: {
  noun: string;
  rows: { name: string; period: string; whole: boolean; outlier: boolean; defaultPeriod: boolean }[];
  /** Số nhà bị bỏ lại vì thiếu dữ liệu — nói ra để admin biết mình chưa làm hết. */
  skipped: number;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const wholeCount = rows.filter(r => r.whole).length;
  const outliers = rows.filter(r => r.outlier);
  const guessed = rows.filter(r => r.defaultPeriod);

  /**
   * Kỳ chiếm đa số — in MỘT lần ở tiêu đề, rồi từng dòng chỉ hiện kỳ khi nó khác.
   *
   * Cả lô gần như luôn cùng một kỳ, nên in kỳ ở đủ ba chục dòng là ba chục lần cùng một
   * chuỗi số: mắt lướt qua hết, và đúng một hai dòng có kỳ LỆCH — thứ duy nhất cần soi
   * trước khi phát hành — thì chìm lẫn vào giữa. Bỏ phần lặp đi thì dòng lệch tự nổi lên.
   */
  const mainPeriod = (() => {
    const tally = new Map<string, number>();
    rows.forEach(r => tally.set(r.period, (tally.get(r.period) ?? 0) + 1));
    let best = '', top = 0;
    tally.forEach((count, period) => { if (count > top) { top = count; best = period; } });
    return top > 1 ? best : '';
  })();

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/40 p-4"
      onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-black text-slate-950">
            Phát hành hoá đơn {noun} cho {rows.length} nhà?
          </h3>
          {mainPeriod && (
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-500">
              Kỳ {mainPeriod}
            </p>
          )}
        </div>

        <div className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {rows.map(r => (
              <div key={r.name} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{r.name}</span>
                {r.period !== mainPeriod && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-700">
                    {r.period || 'chưa có kỳ'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {outliers.length > 0 && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
              <b>{outliers.length} nhà có đơn giá bất thường</b> ({outliers.map(r => r.name.split(/\s+/)[0]).join(', ')}) —
              ra ngoài khoảng giá {noun} thực tế. Gần như chắc chắn là đọc nhầm tổng sản lượng hoặc
              tổng tiền, nên xem lại trước khi gửi.
            </p>
          )}

          {guessed.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <b>{guessed.length} nhà đang theo kỳ chung</b> — không đọc được kỳ in trên giấy nên
              lấy theo tháng đang chọn. Kỳ là khoá quản lý đối chiếu, sai thì phải thu hồi hoá đơn:
              nếu kỳ thật của nhà cung cấp không trùng tháng dương lịch, sửa ô kỳ chung rồi hãy gửi.
            </p>
          )}

          {wholeCount > 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <b>{wholeCount} nhà nguyên căn</b> sẽ gửi hoá đơn <b>thẳng cho khách thuê</b> ngay sau
              khi phát hành. Nhà chia phòng thì quản lý đi ghi chỉ số từng phòng.
            </p>
          )}

          {skipped > 0 && (
            <p className="text-xs text-slate-500">
              {skipped} nhà còn thiếu dữ liệu sẽ được giữ lại trong bảng, không phát hành.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            Xem lại
          </button>
          <button onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">
            Phát hành {rows.length} nhà
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Thành phần nhỏ ──────────────────────────────────────────────────────────
const Tally = ({ n, label, tone }: { n: number; label: string; tone: 'emerald' | 'amber' | 'rose' }) => {
  const cls = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${n === 0 ? 'border-slate-200 bg-slate-50 text-slate-400' : cls}`}>
      <p className="text-2xl font-black leading-none tabular-nums">{n}</p>
      <p className="mt-1 text-xs font-semibold">{label}</p>
    </div>
  );
};

const ListBlock = ({ title, tone, children }: {
  title: string; tone?: 'amber' | 'rose'; children: React.ReactNode;
}) => (
  <div className={`mt-4 rounded-xl border p-3 ${
    tone === 'rose' ? 'border-rose-200 bg-rose-50/60'
    : tone === 'amber' ? 'border-amber-200 bg-amber-50/60'
    : 'border-slate-200 bg-white'}`}>
    <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
    <ul className="max-h-52 overflow-y-auto text-xs text-slate-600">{children}</ul>
  </div>
);

/** Ô nhập số có phân cách nghìn — cùng cách gõ với màn phát hành lẻ. */
/**
 * Dòng phụ dưới cặp chỉ số — nói cho admin biết cặp số đó ĐANG DỰA VÀO ĐÂU.
 *
 * Hai kỳ cần hai thứ khác hẳn nhau, nên đây là hai giao diện chứ không phải một:
 *
 *  • KỲ ĐẦU — chưa có gì để nối, cặp số đi thẳng theo giấy. Thứ admin cần thấy là mốc
 *    ĐỒNG HỒ LÚC ĐÓN KHÁCH, vì giấy tính trọn tháng còn khách có thể dọn vào ngày 15:
 *    quãng từ đầu kỳ tới lúc đón là của công ty, không phải của khách. Không bày ra thì
 *    khách nhận hoá đơn gồm cả phần chưa ở, mà không ai trong quy trình biết.
 *
 *  • KỲ THỨ 2 TRỞ ĐI — chỉ số cũ đã khoá theo sổ, nên việc duy nhất còn lại là ĐỐI CHIẾU
 *    với con số in trên giấy. Khớp thì một dòng xanh gọn; lệch thì hiện đủ hai số và
 *    chặn phát hành ở cột trạng thái.
 *
 * Kỳ đầu thì KHÔNG hiện ô đối chiếu, đúng như quy trình: chưa có kỳ trước để mà nối.
 */
/**
 * Dấu hiệu "rê chuột vào còn nội dung".
 *
 * Bảng này đẩy phần lớn lời giải thích vào `title` để 100 dòng không thành bức tường chữ.
 * Nhưng `title` mà không có gì trên mặt chữ báo là nó tồn tại thì coi như KHÔNG tồn tại —
 * không ai đi rê chuột lên một dòng trông y hệt chữ thường. Nên chỗ nào giấu chữ, chỗ đó
 * phải đeo dấu: gạch chân chấm + con trỏ `?` (quy ước sẵn của web) và thêm ⓘ cho rõ.
 */
const InfoDot = () => (
  <span className="ml-0.5 shrink-0 select-none text-[11px] font-black text-slate-300" aria-hidden>ⓘ</span>
);

const ReadingContext = ({ row, unit, onPaperPrev }: {
  row: Row; unit: string; onPaperPrev: (v: string) => void;
}) => {
  const cycle = row.cycle;
  if (!cycle || cycle.unknown) return null;
  const n = (v: number) => groupThousands(String(v));

  // ── KỲ ĐẦU: một dòng, không có ô nhập (chưa có kỳ trước để đối chiếu) ──
  if (!cycle.prevClose) {
    const paperPrev = row.prevReading === '' ? null : Number(onlyDigits(row.prevReading));
    const note = firstPeriodNote(cycle, paperPrev, Number(onlyDigits(row.totalQty)));
    const handoverAt = cycle.handover?.at
      ? ` ngày ${cycle.handover.at.slice(0, 10).split('-').reverse().join('/')}`
      : '';
    return (
      <p
        className="cursor-help truncate text-xs underline decoration-slate-300 decoration-dotted underline-offset-2"
        title={cycle.handover
          ? `Kỳ đầu tiên của khách này. Đồng hồ lúc đón khách${handoverAt}: ${n(cycle.handover.reading)} ${unit}.`
            + (note?.kind === 'pre-move-in'
              ? ` Giấy tính trọn tháng nên ${n(note.amount)} ${unit} trước ngày khách dọn tới là chi phí công ty — máy chủ tự cắt khi lập hoá đơn cho khách.`
              : note?.kind === 'bad-prev'
              ? ` Chỉ số đầu kỳ đang nhỏ hơn mốc đón khách tới ${n(note.handover - (paperPrev ?? 0))} ${unit}, nhiều hơn cả lượng tiêu thụ của kỳ — gần như chắc chắn đọc sai, mở ảnh soi lại ô đầu kỳ.`
              : '')
          : 'Kỳ đầu tiên của khách này. Hợp đồng không ghi chỉ số đồng hồ lúc đón khách.'}
      >
        {/* ⓘ đứng NGAY SAU nhãn chứ không ở cuối dòng: cuối dòng thì `truncate` cắt mất
            đúng cái dấu hiệu, và cắt đúng lúc dòng dài — tức lúc cần nó nhất. */}
        <span className="font-black uppercase text-indigo-500">Kỳ đầu</span>
        <InfoDot />
        {cycle.handover ? (
          <>
            <span className="text-slate-400"> · đón khách </span>
            <b className="tabular-nums text-slate-600">{n(cycle.handover.reading)}</b>
            {note?.kind === 'pre-move-in' && (
              <span className="font-bold text-amber-600"> · dư {n(note.amount)}</span>
            )}
            {note?.kind === 'bad-prev' && (
              <span className="font-bold text-rose-600"> · đầu kỳ đọc sai?</span>
            )}
          </>
        ) : (
          <span className="text-slate-400"> · HĐ không ghi mốc đón khách</span>
        )}
      </p>
    );
  }

  // ── KỲ 2 TRỞ ĐI: ô đối chiếu + đúng một ký hiệu ──
  const gap = continuityGap(cycle, row.paperPrev === '' ? null : Number(onlyDigits(row.paperPrev)));
  return (
    <div
      className="flex cursor-help items-center gap-1.5 text-xs"
      title={gap
        ? `Kỳ trước chốt ${n(gap.expected)} nhưng giấy kỳ này bắt đầu từ ${n(gap.found)}. Phần ${n(Math.abs(gap.diff))} ${unit} ở giữa sẽ không nằm trên hoá đơn nào — chưa phát hành được.`
        : `Chỉ số đầu kỳ IN TRÊN GIẤY. Phải bằng đúng số chốt kỳ trước (${n(cycle.prevClose.reading)}) thì hai kỳ mới nối liền nhau.`}
    >
      <span className="shrink-0 text-slate-400 underline decoration-slate-300 decoration-dotted underline-offset-2">
        giấy:
      </span>
      <InfoDot />
      <input
        inputMode="numeric"
        value={row.paperPrev ? groupThousands(row.paperPrev) : ''}
        placeholder="—"
        onChange={e => onPaperPrev(onlyDigits(e.target.value))}
        className={`w-20 shrink-0 rounded border px-1.5 py-1 text-right text-xs font-bold tabular-nums outline-none transition focus:ring-1 ${
          gap ? 'border-rose-300 bg-rose-50 text-rose-700 focus:ring-rose-200'
            : row.paperPrev ? 'border-emerald-200 bg-emerald-50 text-emerald-800 focus:ring-emerald-200'
            : 'border-amber-300 bg-amber-50 focus:ring-amber-200'}`}
      />
      {/* Chữ giải thích nằm trong `title` và ở cột Trạng thái. Ở đây chỉ cần một ký hiệu:
          100 dòng × một câu = một bức tường chữ, và bức tường thì không ai đọc. */}
      {gap ? (
        <span className="font-bold text-rose-600">lệch {n(Math.abs(gap.diff))}</span>
      ) : row.paperPrev ? (
        <span className="font-bold text-emerald-600">✓</span>
      ) : null}
    </div>
  );
};

const NumCell = ({ value, onChange, disabled, width = 'w-28', title }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; width?: string; title?: string;
}) => (
  <input
    title={title}
    inputMode="numeric"
    value={value ? groupThousands(value) : ''}
    disabled={disabled}
    placeholder="—"
    onChange={e => onChange(onlyDigits(e.target.value))}
    className={`${width} rounded-lg border border-slate-200 px-2.5 py-2 text-right text-sm font-bold tabular-nums outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400`}
  />
);
