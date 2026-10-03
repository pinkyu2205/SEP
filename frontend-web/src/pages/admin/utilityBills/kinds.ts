/**
 * ĐIỆN ↔ NƯỚC: mọi chỗ khác nhau giữa hai trang phát hành gom về MỘT bảng.
 *
 * Trước 03/10/2026 hai trang là hai file song sinh (~2.100 và ~1.100 dòng), mỗi khối logic
 * đều kèm câu "sửa thì sửa cả hai" — và thực tế đã lệch nhau: trang nước thu hồi hoá đơn
 * không hỏi lại, không có bảng chỉ số từng phòng, không phân trang. Nay một trang dùng
 * chung, chỉ khác nhau ở bảng này.
 */
import { Droplets, Zap, type LucideIcon } from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import {
  evnBillService, evnUnitPrice, type EvnBill, type OcrEvnBillResponse,
} from '@/services/evnBill.service';
import { waterBillService, waterUnitPrice, type WaterBill } from '@/services/waterBill.service';
import { parseEvnInvoice, periodProblem } from '@/utils/evnInvoiceParser';
import { parseWaterInvoice } from '@/utils/waterInvoiceParser';

export type UtilityKind = 'ELECTRIC' | 'WATER';

/** Hoá đơn tổng đã phát hành — một hình dạng chung cho điện lẫn nước. */
export interface PublishedBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  billingPeriod: string;
  month: number;
  year: number;
  /** kWh với điện, m³ với nước. */
  totalQuantity: number;
  totalAmount: number;
  unitPrice?: number;
  imageUrl?: string | null;
  status?: 'PUBLISHED' | 'REVOKED';
  roomsTotal?: number;
  roomsDone?: number;
  readingDeadline?: string | null;
  overdue?: boolean;
  billedToTenantQuantity?: number | null;
  companyBornQuantity?: number | null;
  createdBy?: string;
  createdAt?: string;
}

/**
 * Những gì đọc được trên MỘT tờ hoá đơn, đã chuẩn hoá về chuỗi chữ số để đổ thẳng vào ô.
 * Chuỗi rỗng = không đọc được. Riêng chỉ số thì `'0'` là giá trị thật (đồng hồ mới lắp).
 */
export interface BillReadout {
  rawText: string;
  /**
   * Các ứng viên mã khách hàng, theo thứ tự tin cậy. Không chốt luôn một mã ở đây vì chỗ
   * này chưa biết đang đối chiếu với nhà nào — xem `pickPaperCode`.
   */
  codeCandidates: string[];
  qty: string;
  amount: string;
  period: string;
  prev: string;
  next: string;
}

export interface PublishInput {
  propertyId: number;
  billingPeriod: string;
  month: number;
  year: number;
  qty: number;
  amount: number;
  imageUrl?: string;
  prevReading?: number;
  newReading?: number;
  customerCode?: string;
  ocrConfirmed?: boolean;
}

export interface KindConfig {
  kind: UtilityKind;
  icon: LucideIcon;
  /** Danh từ ghép vào câu: "hoá đơn {noun}". */
  noun: string;
  /** Tên tờ giấy: "hoá đơn EVN" / "hoá đơn nước". */
  paperName: string;
  /** Nhãn trên menu / banner thiếu hoá đơn. */
  menuLabel: string;
  unit: string;
  qtyLabel: string;
  /** "công tơ" / "đồng hồ". */
  meterWord: string;
  /** "Mã khách hàng" (EVN) / "Số danh bộ" (nước). */
  codeLabel: string;
  codePlaceholder: string;
  /** Mã CỦA LOẠI KIA — hồ sơ nhà hiện cả hai mã, mã đang dùng nổi lên trên. */
  otherCodeLabel: string;
  /** Loại chỉ số đã chốt từng phòng, theo tên enum của API meter-readings. */
  readingType: 'ELECTRICITY' | 'WATER';
  /**
   * Khoảng đơn giá BÌNH QUÂN còn coi là thật. Điện bậc thang 1.900–3.300đ + VAT, nước
   * sinh hoạt 6.000–16.000đ đã gồm thuế phí; nới rộng hai đầu. Lỗi OCR thật sự thì lệch
   * cả chục lần (đọc mã công tơ thành kWh, mã số thuế thành tiền) nên không chạm biên này.
   * Nhà nước tăng giá nhiều đợt thì nới lại ở đây.
   */
  priceFloor: number;
  priceCeil: number;
  /** Lớp màu nhấn — viết nguyên chuỗi để Tailwind quét được. */
  accent: {
    button: string;
    soft: string;
    text: string;
    chipOn: string;
    ring: string;
  };
  storedCode: (p: PropertyResponse) => string | undefined;
  otherCode: (p: PropertyResponse) => string | undefined;
  unitPrice: (amount: number, qty: number) => number;
  read: (imageUrl: string) => Promise<BillReadout>;
  list: (params: { propertyId?: number; month?: number; year?: number }) => Promise<PublishedBill[]>;
  publish: (input: PublishInput) => Promise<PublishedBill>;
  revoke: (id: number) => Promise<void>;
}

const positive = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '';
};

/**
 * Tổng tiền do MÁY CHỦ tự dò — chỉ nhận số nguyên từ 1.000đ trở lên.
 *
 * Máy chủ đọc "481.352" thành 481,352 (coi dấu chấm phân cách nghìn là dấu thập phân —
 * `OcrServiceImpl.findLabeledNumber`), "1.052.000" thì chỉ còn 1,052. Đem số đó làm tròn
 * điền vào ô là ra một tổng tiền sai mà trông vẫn như số thật. Tiền điện/nước VNĐ luôn là
 * số nguyên và không bao giờ dưới nghìn, nên mọi số lẻ hoặc quá nhỏ đều là đọc hỏng —
 * bỏ trống cho admin gõ còn hơn.
 */
const serverAmount = (v: unknown): string => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1_000 ? String(n) : '';
};

/** Chỉ số giữ được số 0 — đồng hồ mới lắp có chỉ số cũ đúng bằng 0, đó là giá trị thật. */
const reading = (v: unknown): string => {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n)) : '';
};

/**
 * Kỳ do máy chủ tự dò chỉ dùng khi đúng định dạng: mẫu dò của nó cắt được cả nửa chuỗi
 * ngày ("07/04 - 06/05/20"), đổ thẳng vào ô thì thành một kỳ sai mà trông gần đúng.
 */
const serverPeriod = (raw?: string): string =>
  raw && !periodProblem(raw) ? raw.trim() : '';

const fromEvn = (b: EvnBill): PublishedBill => ({ ...b, totalQuantity: b.totalKwh });
const fromWater = (b: WaterBill): PublishedBill => ({ ...b });

export const KINDS: Record<UtilityKind, KindConfig> = {
  ELECTRIC: {
    kind: 'ELECTRIC',
    icon: Zap,
    noun: 'điện',
    paperName: 'hoá đơn EVN',
    menuLabel: 'điện EVN',
    unit: 'kWh',
    qtyLabel: 'Tiêu thụ',
    meterWord: 'công tơ',
    codeLabel: 'Mã khách hàng',
    codePlaceholder: 'PE05000222239',
    otherCodeLabel: 'Số danh bộ nước',
    readingType: 'ELECTRICITY',
    priceFloor: 1_000,
    priceCeil: 5_000,
    accent: {
      button: 'bg-indigo-600 hover:bg-indigo-700',
      soft: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      text: 'text-indigo-700',
      chipOn: 'bg-indigo-600 text-white',
      ring: 'focus:border-indigo-400 focus:ring-indigo-100',
    },
    storedCode: (p) => p.electricityCustomerCode,
    otherCode: (p) => p.waterCustomerCode,
    unitPrice: evnUnitPrice,
    read: async (imageUrl) => {
      const ocr: OcrEvnBillResponse = await evnBillService.ocr(imageUrl);
      const p = parseEvnInvoice(ocr);
      return {
        rawText: ocr?.rawText ?? '',
        /*
          Parser của app đứng trước: mã EVN có tiền tố chữ (`PE05000222239`), mà mẫu dò của
          máy chủ bắt buộc ký tự đầu là chữ số (để khỏi vớ nhầm `MLT: TA4…` trên giấy nước)
          — nên với giấy EVN nó hoặc không ra gì, hoặc ra một dãy số khác trên trang.
        */
        codeCandidates: [p.customerCode ?? '', ocr?.customerCode ?? ''].filter(Boolean),
        // Số lượng: chỉ tin parser của app — số của máy chủ không thấy nhãn thì lấy đại số
        // cuối cùng trên trang. Tiền của máy chủ chỉ làm đường lui, qua `serverAmount`.
        qty: p.totalKwh,
        amount: p.totalAmount || serverAmount(ocr?.totalAmount),
        period: p.billingPeriod || serverPeriod(ocr?.billingPeriod),
        prev: p.prevReading ?? '',
        next: p.newReading ?? '',
      };
    },
    list: async (params) => (await evnBillService.list(params)).map(fromEvn),
    publish: async ({ qty, amount, ...rest }) =>
      fromEvn(await evnBillService.publish({ ...rest, totalKwh: qty, totalAmount: amount })),
    revoke: (id) => evnBillService.revoke(id),
  },
  WATER: {
    kind: 'WATER',
    icon: Droplets,
    noun: 'nước',
    paperName: 'hoá đơn nước',
    menuLabel: 'nước',
    unit: 'm³',
    qtyLabel: 'Tiêu thụ',
    meterWord: 'đồng hồ',
    codeLabel: 'Số danh bộ',
    codePlaceholder: '15122843356',
    otherCodeLabel: 'Mã khách hàng điện',
    readingType: 'WATER',
    priceFloor: 3_000,
    priceCeil: 30_000,
    accent: {
      button: 'bg-sky-600 hover:bg-sky-700',
      soft: 'border-sky-200 bg-sky-50 text-sky-700',
      text: 'text-sky-700',
      chipOn: 'bg-sky-600 text-white',
      ring: 'focus:border-sky-400 focus:ring-sky-100',
    },
    storedCode: (p) => p.waterCustomerCode,
    otherCode: (p) => p.electricityCustomerCode,
    unitPrice: waterUnitPrice,
    read: async (imageUrl) => {
      const ocr = await waterBillService.ocr(imageUrl);
      const p = parseWaterInvoice(ocr);
      return {
        rawText: ocr?.rawText ?? '',
        // Danh bộ toàn số: mẫu của máy chủ hợp với loại này, nên nó đứng trước.
        codeCandidates: [ocr?.customerCode ?? '', p.customerCode ?? ''].filter(Boolean),
        qty: positive(p.totalQuantity),
        // Hoá đơn nước có HAI con số tiền — parser lấy "tổng tiền thanh toán", không lấy
        // "cộng tiền hàng" (thiếu ~15%). Máy chủ chỉ là đường lui.
        amount: positive(p.totalAmount) || serverAmount(ocr?.totalAmount),
        period: p.billingPeriod || serverPeriod(ocr?.billingPeriod),
        prev: reading(p.prevReading),
        next: reading(p.newReading),
      };
    },
    list: async (params) => (await waterBillService.list(params)).map(fromWater),
    publish: async ({ qty, amount, ...rest }) =>
      fromWater(await waterBillService.create({ ...rest, totalQuantity: qty, totalAmount: amount })),
    revoke: (id) => waterBillService.revoke(id),
  },
};
