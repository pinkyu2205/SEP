import type { PricingCapitalItem, PricingCapitalItemKind } from '@/types/api.types';

/**
 * Tính toán quanh `capitalItems` — danh sách khoản vốn có lịch khấu hao riêng (BE 14/09/2026).
 *
 * Quy tắc nghiệp vụ (xem doc-be/BE-YEUCAU-tinh-lai-gia-khi-cai-tao-bo-sung-2026-09-14.md):
 *   • Mỗi khoản lập MỘT lần ở đợt của nó, giữ nguyên "mỗi tháng" ở các đợt sau.
 *   • Khoản `roomId = null` là khoản chung, chia đều cho các phòng; có `roomId` là của riêng phòng đó.
 *   • `THAY_THE` phần tương đương KHÔNG thành khoản; chỉ phần đắt hơn máy cũ là `EQUIPMENT_UPGRADE`.
 *
 * "Đã khấu hao / còn lại": BE trả từ c2848dd — dùng số của BE. Chỉ khi BE cũ không trả
 * (`depreciatedAmount = null`) FE mới tự tính từ `startDate` + `months`.
 */

export const KIND_LABEL: Record<PricingCapitalItemKind, string> = {
  RENT: 'Tiền thuê trả chủ nhà',
  RENOVATION: 'Cải tạo',
  EQUIPMENT: 'Thiết bị mua mới',
  EQUIPMENT_UPGRADE: 'Nâng cấp thiết bị (phần đắt hơn máy cũ)',
};

const parseIsoDate = (iso: string): Date | null => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/**
 * Số tháng TRÒN đã qua kể từ `startDate`, đếm y hệt `ChronoUnit.MONTHS.between` của BE
 * (chưa đủ ngày trong tháng thì chưa tính tháng đó), chặn trong [0, months].
 */
export const elapsedMonths = (startDate: string, months: number, today: Date): number => {
  const start = parseIsoDate(startDate);
  if (!start) return 0;
  let diff = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) diff -= 1;
  return Math.min(Math.max(diff, 0), Math.max(months, 0));
};

export const depreciatedOf = (item: PricingCapitalItem, today: Date): number => {
  if (item.depreciatedAmount != null) return item.depreciatedAmount;
  const elapsed = elapsedMonths(item.startDate, item.months, today);
  if (elapsed >= item.months) return item.amount;
  return Math.min(item.amount, item.monthlyAmount * elapsed);
};

export const remainingOf = (item: PricingCapitalItem, today: Date): number =>
  item.depreciatedAmount != null && item.remainingAmount != null
    ? Math.max(0, item.remainingAmount)
    : Math.max(0, item.amount - depreciatedOf(item, today));

/**
 * Số tháng đã lấy lại — khớp với số tiền "đã lấy lại" đang hiện. BE đếm tháng khác FE (xem
 * `PricingCapitalItem.depreciatedAmount`), nên có số của BE thì suy ngược từ đó.
 */
export const elapsedOf = (item: PricingCapitalItem, today: Date): number =>
  item.depreciatedAmount != null && item.monthlyAmount > 0
    ? Math.min(item.months, Math.round(item.depreciatedAmount / item.monthlyAmount))
    : elapsedMonths(item.startDate, item.months, today);

export interface CapitalParts {
  rent: number;
  renovation: number;
  /** EQUIPMENT + EQUIPMENT_UPGRADE */
  equipment: number;
  total: number;
  depreciated: number;
  remaining: number;
  /** Σ monthlyAmount — phải khớp `monthlyRecovery` của BE. */
  monthly: number;
}

const emptyParts = (): CapitalParts => ({
  rent: 0, renovation: 0, equipment: 0, total: 0, depreciated: 0, remaining: 0, monthly: 0,
});

const addItem = (acc: CapitalParts, item: PricingCapitalItem, today: Date, ratio = 1): CapitalParts => {
  const amount = item.amount * ratio;
  if (item.kind === 'RENT') acc.rent += amount;
  else if (item.kind === 'RENOVATION') acc.renovation += amount;
  else acc.equipment += amount;
  acc.total += amount;
  acc.depreciated += depreciatedOf(item, today) * ratio;
  acc.remaining += remainingOf(item, today) * ratio;
  acc.monthly += item.monthlyAmount * ratio;
  return acc;
};

export const capitalParts = (items: PricingCapitalItem[], today: Date): CapitalParts =>
  items.reduce((acc, it) => addItem(acc, it, today), emptyParts());

export interface RoomCapital extends CapitalParts {
  /** Phần của phòng trong các khoản chung (đã chia đều). */
  common: CapitalParts;
  /** Khoản riêng của phòng (thiết bị lắp trong phòng). */
  own: CapitalParts;
}

/**
 * Vốn một phòng gánh = khoản chung ÷ số phòng + khoản riêng của phòng.
 * Chia đều giống `PricingCalculator.calculate` của BE (BE dồn phần lẻ làm tròn vào phòng cuối,
 * FE không làm theo — lệch vài đồng, chỉ để hiển thị).
 */
export const roomCapital = (
  items: PricingCapitalItem[], roomId: number, roomCount: number, today: Date,
): RoomCapital => {
  const n = Math.max(roomCount, 1);
  const common = items.filter((i) => i.roomId == null)
    .reduce((acc, it) => addItem(acc, it, today, 1 / n), emptyParts());
  const own = items.filter((i) => i.roomId === roomId)
    .reduce((acc, it) => addItem(acc, it, today), emptyParts());
  return {
    rent: common.rent + own.rent,
    renovation: common.renovation + own.renovation,
    equipment: common.equipment + own.equipment,
    total: common.total + own.total,
    depreciated: common.depreciated + own.depreciated,
    remaining: common.remaining + own.remaining,
    monthly: common.monthly + own.monthly,
    common,
    own,
  };
};

export interface CapitalGroup {
  startDate: string;
  items: PricingCapitalItem[];
}

/**
 * Nhóm theo ngày bắt đầu khấu hao. BE chép khoản của đợt trước sang phiên bản mới (cùng
 * `pricingVersion`) nhưng giữ nguyên `startDate`, nên ngày bắt đầu mới là thứ phân biệt được đợt.
 */
export const groupByStart = (items: PricingCapitalItem[]): CapitalGroup[] => {
  const map = new Map<string, PricingCapitalItem[]>();
  for (const it of items) {
    const key = it.startDate.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startDate, list]) => ({ startDate, items: list }));
};
