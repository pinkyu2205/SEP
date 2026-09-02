import { evnBillService } from './evnBill.service';
import { waterBillService } from './waterBill.service';
import { meterReadingService } from './meterReading.service';
import { tenantService } from './tenant.service';
import type { TenantContractResponse } from '@/types/api.types';

/**
 * KỲ NÀY LÀ KỲ ĐẦU HAY KỲ TIẾP THEO — và chỉ số nào là mốc đúng để bắt đầu tính.
 *
 * ─── Vì sao phải phân biệt ───────────────────────────────────────────────────
 * Hai kỳ này cần hai thứ khác hẳn nhau, và trước đây màn phát hành đối xử với chúng
 * y như nhau:
 *
 *  • KỲ ĐẦU (khách vừa đón vào) — chưa có chốt kỳ trước để nối. Mốc đúng để tính tiền
 *    là chỉ số ĐỒNG HỒ LÚC ĐÓN KHÁCH, mà giấy điện/nước thì ghi trọn tháng, tức thường
 *    bắt đầu sớm hơn ngày khách dọn tới. Admin cần nhìn thấy CẢ HAI (số trên giấy a → b
 *    và số lúc đón khách) mới biết khách đang bị tính dư bao nhiêu.
 *
 *  • KỲ THỨ 2 TRỞ ĐI — đã có chốt kỳ trước. Lúc này chỉ có đúng MỘT ràng buộc, và nó
 *    tuyệt đối: chỉ số mới của kỳ trước PHẢI bằng chỉ số cũ của kỳ này. Lệch một đơn vị
 *    nghĩa là phần chênh giữa hai mốc không nằm trên hoá đơn nào cả — không ai đòi được,
 *    cũng không ai truy ra được. Nên lệch thì CHẶN, không phát hành.
 *
 * ─── Vì sao không hỏi thẳng máy chủ một câu ─────────────────────────────────
 * `GET /properties/{id}/meter-readings/latest` có ba tầng lui: bản ghi công tơ → chỉ số
 * mới của hoá đơn gần nhất → chỉ số lúc đón khách. Cả ba tầng đều trả về cùng một hình
 * dạng, và hai tầng sau đều để `period`/`recordedAt` rỗng — nên nhìn kết quả KHÔNG biết
 * con số đang cầm là "chốt kỳ trước" hay "mốc đón khách". Đoán bằng cách so giá trị thì
 * sai đúng vào ca kỳ đầu (hai số bằng nhau).
 *
 * Nên hỏi thêm lịch sử hoá đơn của chính căn đó: có hoá đơn nào phát hành SAU ngày đón
 * khách chưa. Có = kỳ 2 trở đi. Không = kỳ đầu. Câu trả lời này không dựa vào con số nào
 * nên không có ca biên.
 */

export type UtilityApiType = 'ELECTRIC' | 'WATER';

/** Một mốc chỉ số, kèm chỗ nó tới từ đâu để màn hình nói được với admin. */
export interface ReadingMark {
  reading: number;
  /** Kỳ (`yyyy-MM`) hoặc ngày ISO — tuỳ nguồn. Rỗng khi máy chủ không kèm mốc thời gian. */
  at?: string;
  imageUrl?: string;
}

export interface UtilityCycle {
  /** Kỳ ĐẦU TIÊN khách đang thuê phải trả — chưa có hoá đơn nào sau ngày đón khách. */
  firstPeriod: boolean;
  /**
   * Chỉ số chốt của kỳ liền trước. `null` ở kỳ đầu (không có gì để nối).
   * Đây là con số mà chỉ số cũ trên giấy kỳ này phải khớp.
   */
  prevClose: ReadingMark | null;
  /** Chỉ số đọc lúc đón khách. `null` khi hợp đồng không ghi (HĐ cũ). */
  handover: ReadingMark | null;
  /** Ngày khách bắt đầu thuê (ISO) — để giải thích vì sao coi đây là kỳ đầu. */
  moveInAt?: string;
  /** Không tra được (nhà chưa có khách, hoặc mọi lệnh gọi đều hỏng). */
  unknown?: boolean;
}

const listBills = (type: UtilityApiType, propertyId: number) =>
  type === 'ELECTRIC'
    ? evnBillService.list({ propertyId })
    : waterBillService.list({ propertyId });

/** `yyyy-MM` → số thứ tự tháng, để so hai kỳ mà không phải dựng Date. */
const monthIndex = (year: number, month: number) => year * 12 + month;

/**
 * Hợp đồng đang hiệu lực của CẢ CĂN (không gắn phòng).
 *
 * Ưu tiên hợp đồng nguyên căn; không có thì lấy hợp đồng ACTIVE bất kỳ — cùng thứ tự
 * mà `EvnBillPublishing` đang dùng, giữ nguyên để hai màn không cho ra kết quả khác nhau.
 */
const activeWholeHouseContract = (
  contracts: TenantContractResponse[],
): TenantContractResponse | undefined =>
  contracts.find(c => c.status === 'ACTIVE' && !c.roomId)
  ?? contracts.find(c => c.status === 'ACTIVE');

/**
 * Tra bối cảnh chỉ số của một căn NGUYÊN CĂN cho kỳ sắp phát hành.
 *
 * `month`/`year` là kỳ đang làm — phải loại chính nó ra khỏi lịch sử, nếu không thì bản
 * nháp/bản đã phát hành của chính kỳ này lại bị đếm là "kỳ trước".
 *
 * Mọi lệnh gọi đều nuốt lỗi: không tra được thì trả `unknown` để màn hình hạ xuống mức
 * "không kiểm tra được" chứ không chặn admin làm việc bằng một lỗi mạng.
 */
export const loadUtilityCycle = async (
  propertyId: number,
  type: UtilityApiType,
  month: number,
  year: number,
): Promise<UtilityCycle> => {
  const [bills, contracts, latest] = await Promise.all([
    listBills(type, propertyId).catch(() => []),
    tenantService.listByProperty(propertyId, { silent: true }).catch(() => []),
    meterReadingService.latestForProperty(propertyId, type),
  ]);

  const contract = activeWholeHouseContract(contracts);
  if (!contract) return { firstPeriod: false, prevClose: null, handover: null, unknown: true };

  const handoverValue = type === 'ELECTRIC'
    ? contract.initialElectricReading
    : contract.initialWaterReading;
  const handover: ReadingMark | null = Number.isFinite(Number(handoverValue))
    ? {
        reading: Number(handoverValue),
        at: (type === 'ELECTRIC' ? contract.electricMeterCapturedAt : contract.waterMeterCapturedAt)
          || contract.startDate,
        imageUrl: type === 'ELECTRIC' ? contract.electricMeterImageUrl : contract.waterMeterImageUrl,
      }
    : null;

  // Tháng khách dọn vào — hoá đơn của chính tháng đó vẫn tính là kỳ đầu của khách.
  const moveIn = contract.startDate ? new Date(contract.startDate) : null;
  const moveInIdx = moveIn && !Number.isNaN(moveIn.getTime())
    ? monthIndex(moveIn.getFullYear(), moveIn.getMonth() + 1)
    : null;
  const thisIdx = monthIndex(year, month);

  const priorBills = bills.filter(b => {
    if (b.status === 'REVOKED') return false;
    const idx = monthIndex(b.year, b.month);
    if (idx >= thisIdx) return false;               // chính kỳ này, hoặc kỳ sau
    return moveInIdx == null || idx >= moveInIdx;   // hoá đơn của khách TRƯỚC thì không tính
  });

  const firstPeriod = priorBills.length === 0;

  return {
    firstPeriod,
    prevClose: firstPeriod || !latest || !Number.isFinite(Number(latest.reading))
      ? null
      : { reading: Math.round(Number(latest.reading)), at: latest.period || latest.recordedAt, imageUrl: latest.imageUrl },
    handover,
    moveInAt: contract.startDate,
  };
};

/** Chỉ số cũ trên giấy có nối liền sổ hệ thống không. `null` = không có gì để nói. */
export interface ContinuityGap {
  expected: number;
  found: number;
  /** `found − expected`. Dương = giấy bắt đầu cao hơn (mất phần tiêu thụ ở giữa). */
  diff: number;
}

/**
 * So chỉ số cũ trên giấy với chốt kỳ trước.
 *
 * `paperPrev` để `null` (chưa đọc/chưa nhập) thì KHÔNG coi là khớp — trả `null` và để
 * màn hình xử theo kiểu "chưa đối chiếu được", vì không có số thì không có gì để so.
 */
export const continuityGap = (
  cycle: UtilityCycle | null | undefined,
  paperPrev: number | null,
): ContinuityGap | null => {
  const expected = cycle?.prevClose?.reading;
  if (!Number.isFinite(Number(expected))) return null;
  if (paperPrev == null || !Number.isFinite(paperPrev)) return null;
  const exp = Number(expected);
  return paperPrev === exp ? null : { expected: exp, found: paperPrev, diff: paperPrev - exp };
};

export type FirstPeriodNote =
  /** Quãng trước ngày khách dọn tới — công ty chịu, khách không trả. */
  | { kind: 'pre-move-in'; amount: number; handover: number }
  /** Chỉ số đầu kỳ trên giấy đọc sai — chênh với mốc đón khách nhiều hơn cả kỳ tiêu thụ. */
  | { kind: 'bad-prev'; handover: number };

/**
 * Ở KỲ ĐẦU, so chỉ số đầu kỳ trên giấy với mốc đồng hồ lúc đón khách.
 *
 * Giấy điện/nước tính TRỌN THÁNG, còn khách có thể dọn vào ngày 15 — nên mốc đón khách
 * cao hơn đầu kỳ trên giấy là chuyện BÌNH THƯỜNG, và phần chênh đó là của công ty.
 *
 * Nhưng phần chênh không thể lớn hơn tổng tiêu thụ cả kỳ: không ai dùng nhiều điện trong
 * nửa tháng đầu hơn cả tháng cộng lại. Vượt qua ngưỡng đó thì không phải "khách dọn vào
 * giữa kỳ" mà là ĐỌC SAI chỉ số đầu kỳ — đúng ca `findReadingTriple` trả về `1` cho căn có
 * chỉ số thật 18.610. Phân biệt hai ca này quan trọng: một bên là thông tin, một bên là
 * lỗi phải sửa, mà nếu gộp làm một thì màn hình báo "18.609 kWh tiêu thụ trước khi khách
 * dọn vào" — một câu vô nghĩa mà admin không biết phải làm gì với nó.
 */
export const firstPeriodNote = (
  cycle: UtilityCycle | null | undefined,
  paperPrev: number | null,
  consumption: number,
): FirstPeriodNote | null => {
  const h = cycle?.handover?.reading;
  if (!cycle?.firstPeriod || !Number.isFinite(Number(h))) return null;
  if (paperPrev == null || !Number.isFinite(paperPrev)) return null;
  const handover = Math.round(Number(h));
  const diff = handover - paperPrev;
  if (diff <= 0) return null;
  if (consumption > 0 && diff > consumption) return { kind: 'bad-prev', handover };
  return { kind: 'pre-move-in', amount: diff, handover };
};
