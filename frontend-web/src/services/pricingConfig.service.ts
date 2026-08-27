import api from './api';
import type { PricingMode } from '@/types/api.types';

/**
 * CẤU HÌNH DUYỆT GIÁ DÙNG CHUNG CHO MỌI CĂN NHÀ.
 *
 * Trước đây Host phải nhập lại 4 con số mục tiêu (lãi/ROI, chi phí vận hành, biên trống
 * phòng) ở TỪNG màn duyệt giá. Nhập tay lặp lại trên hàng chục căn thì kiểu gì cũng lệch,
 * mà lệch ở đây nghĩa là hai căn giống hệt nhau lại ra hai mức giá khác nhau — không giải
 * thích được với ai.
 *
 * Nay chốt một lần ở trang cấu hình, mọi màn duyệt giá đọc xuống dùng. Muốn đổi thì về
 * đúng một chỗ mà đổi.
 *
 * ─── Về chỗ lưu ────────────────────────────────────────────────────────────────
 * BE CHƯA có endpoint này (26/08/2026). FE gọi sẵn theo hợp đồng kỳ vọng, gọi hỏng thì
 * rơi về `localStorage` để trang vẫn dùng được ngay, kèm cờ `source` để màn hình nói thật
 * là cấu hình đang nằm ở máy này chứ không phải trên máy chủ.
 *
 * ⚠️ `local` KHÔNG phải trạng thái chấp nhận được lâu dài: cấu hình chỉ sống trên một trình
 * duyệt, đổi máy là mất, và người khác mở lên thấy số khác. Xem
 * doc-be/BE-NEED-cau-hinh-duyet-gia-2026-08-26.md. BE làm xong là tự chạy, không phải sửa FE.
 */

export interface PricingConfig {
  /** FORWARD = chốt tiền lãi/tháng · REVERSE = chốt % sinh lời/năm. */
  mode: PricingMode;
  /** FORWARD: tiền lãi ròng muốn thu mỗi tháng (VND). */
  pDesired: number;
  /** REVERSE: tỷ lệ sinh lời mong muốn mỗi năm (%). */
  roiExpected: number;
  /** Chi phí vận hành cố định mỗi tháng, KHÔNG gồm lương quản lý (VND). */
  oOperation: number;
  /**
   * Lương của TỪNG quản lý vận hành: `{ [userId]: lương mỗi tháng }`.
   *
   * Cố ý không dùng một con số "lương quản lý" chung: mỗi người một mức lương và một số nhà
   * phụ trách khác nhau. Gộp thành số bình quân thì căn do người lương cao phụ trách và căn
   * do người lương thấp phụ trách lại gánh cùng một mức chi phí — sai ở cả hai phía.
   *
   * Khoá là `userId` chứ không phải tên: người có thể đổi tên, và tên trùng nhau được.
   * Quản lý bị xoá thì khoá thừa nằm lại vô hại, `managerPayroll()` bỏ qua khoá không
   * khớp ai.
   *
   * Sửa ở màn **Lương quản lý** (`/host/manager-salaries`), không sửa ở trang cấu hình giá.
   */
  managerSalaries: Record<string, number>;

  /**
   * Tỷ lệ tăng giá thuê mỗi năm dương lịch (%). Mặc định 5.
   *
   * Áp cho CẢ khách đang thuê, mốc 01/01 — nhưng chỉ hợp lệ khi điều khoản này nằm sẵn
   * trong hợp đồng khách ký. Xem `contractEscalationSchedule()`.
   */
  annualIncreasePct: number;

  /**
   * Thuê chưa đủ bấy nhiêu tháng tính tới 01/01 thì **HOÃN** kỳ tăng đó sang năm sau.
   * Mặc định 6.
   *
   * Đây là quy tắc quyết định AI ĐƯỢC MIỄN kỳ tăng. Chặn tình huống khó chịu nhất: khách ký
   * 15/12 giá 10tr, mới ở 17 ngày đã bị báo lên 10,5tr — nhìn như bị gài, và là lý do mất
   * khách ngay sau khi vừa ký. Để 0 nếu muốn tăng đồng loạt không chừa ai.
   *
   * Mốc chốt suy ra từ con số này: để 6 thì ai ký từ **02/07** trở đi được hoãn kỳ 01/01
   * kế tiếp; để 3 thì mốc thành 02/10.
   */
  escalationGraceMonths: number;

  /**
   * Bắt đầu báo GIÁ NĂM SAU cho khách mới, tính bằng số tháng trước 01/01. Mặc định 2
   * (tức là từ 01/11).
   *
   * ⚠️ Việc KHÁC hẳn `escalationGraceMonths`, đừng gộp hai cái làm một:
   *   • `escalationGraceMonths` — ai được **miễn** kỳ tăng 01/01.
   *   • `newYearPriceLeadMonths` — quản lý phải **báo giá nào** cho khách đang thương lượng.
   *
   * Bám đúng cách quản lý làm thật: cuối năm đi chốt giá là báo luôn mức của năm sau, vì
   * hợp đồng sẽ chạy gần trọn năm đó. Đưa vào cấu hình để hệ thống tự đưa số cho quản lý,
   * thay vì mỗi người tự nhẩm một kiểu — hai phòng giống nhau ra hai giá thì không giải
   * thích được với khách, mà nhẩm sai thì hợp đồng đã ký không sửa được.
   */
  newYearPriceLeadMonths: number;
  /** Biên dự phòng trống phòng (%). */
  vRatePct: number;
  /**
   * Số tháng cuối kỳ master lease KHÔNG tính doanh thu (cửa sổ bàn giao).
   *
   * ⚠️ BE đang chốt cứng 1 tháng ở `InboundLeaseRules.HANDOVER_BUFFER_MONTHS` và tự tính
   * `revenueMonths` — mẫu số chia vốn. FE gửi số này lên nhưng BE CHƯA nhận, nên tới khi
   * BE sửa thì đổi ở đây chưa ăn thua. Màn cấu hình phải nói rõ điều đó, đừng để Host
   * chỉnh xong tưởng đã có hiệu lực.
   */
  handoverBufferMonths: number;
}

/** Mức tăng giá mặc định mỗi năm (%). Host sửa được ở trang cấu hình. */
export const DEFAULT_ANNUAL_INCREASE_PCT = 5;

/** Thuê chưa đủ bấy nhiêu tháng tính tới 01/01 thì hoãn kỳ tăng đó. */
export const DEFAULT_ESCALATION_GRACE_MONTHS = 6;

/** Bắt đầu báo giá năm sau trước 01/01 bấy nhiêu tháng (2 = từ 01/11). */
export const DEFAULT_NEW_YEAR_LEAD_MONTHS = 2;

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  mode: 'FORWARD',
  pDesired: 0,
  roiExpected: 0,
  oOperation: 0,
  managerSalaries: {},
  annualIncreasePct: DEFAULT_ANNUAL_INCREASE_PCT,
  escalationGraceMonths: DEFAULT_ESCALATION_GRACE_MONTHS,
  newYearPriceLeadMonths: DEFAULT_NEW_YEAR_LEAD_MONTHS,
  vRatePct: 10,
  handoverBufferMonths: 1,
};

/** Cấu hình đang đọc được từ đâu — màn hình dùng để cảnh báo khi chưa lên máy chủ. */
export type PricingConfigSource = 'server' | 'local' | 'default';

export interface LoadedPricingConfig {
  config: PricingConfig;
  source: PricingConfigSource;
}

const STORAGE_KEY = 'hbl.pricingConfig';
const ENDPOINT = '/api/v1/admin/pricing-config';

/** Ép mọi field về đúng kiểu + giá trị hợp lệ. Dữ liệu cũ/thiếu field không được làm vỡ trang. */
const normalize = (raw: Partial<PricingConfig> | null | undefined): PricingConfig => {
  const num = (v: unknown, fallback: number, min = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min ? n : fallback;
  };
  return {
    mode: raw?.mode === 'REVERSE' ? 'REVERSE' : 'FORWARD',
    pDesired: num(raw?.pDesired, 0),
    roiExpected: num(raw?.roiExpected, 0),
    oOperation: num(raw?.oOperation, 0),
    managerSalaries: Object.fromEntries(
      Object.entries(raw?.managerSalaries ?? {})
        .map(([id, v]) => [id, num(v, 0)] as const)
        .filter(([, v]) => v > 0),   // lương 0 = chưa nhập, đừng lưu rác
    ),
    annualIncreasePct: Math.min(100, num(raw?.annualIncreasePct, DEFAULT_ANNUAL_INCREASE_PCT)),
    escalationGraceMonths: Math.min(24, Math.round(num(raw?.escalationGraceMonths, DEFAULT_ESCALATION_GRACE_MONTHS))),
    newYearPriceLeadMonths: Math.min(11, Math.round(num(raw?.newYearPriceLeadMonths, DEFAULT_NEW_YEAR_LEAD_MONTHS))),
    vRatePct: Math.min(99, num(raw?.vRatePct, 10)),
    handoverBufferMonths: Math.max(0, Math.round(num(raw?.handoverBufferMonths, 1))),
  };
};

const readLocal = (): PricingConfig | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;   // localStorage bị chặn (chế độ riêng tư) — coi như chưa có cấu hình
  }
};

const writeLocal = (config: PricingConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* hết dung lượng / bị chặn — không được làm hỏng luồng lưu */ }
};

export const pricingConfigService = {
  /**
   * Đọc cấu hình. Ưu tiên máy chủ; máy chủ chưa có endpoint hoặc chưa ai lưu thì lấy bản
   * ở máy; không có nữa thì trả mặc định.
   */
  load: async (): Promise<LoadedPricingConfig> => {
    try {
      const res = await api.get<unknown, Partial<PricingConfig> | null>(
        ENDPOINT, { skipErrorToast: true } as object,
      );
      if (res) return { config: normalize(res), source: 'server' };
    } catch { /* 404 = BE chưa làm endpoint; các lỗi khác cũng rơi về bản ở máy */ }

    const local = readLocal();
    return local
      ? { config: local, source: 'local' }
      : { config: DEFAULT_PRICING_CONFIG, source: 'default' };
  },

  /**
   * Lưu cấu hình. LUÔN ghi xuống máy trước rồi mới gọi máy chủ — máy chủ hỏng thì Host
   * vẫn giữ được thứ vừa nhập, không mất công gõ lại.
   * Trả về nơi thực sự lưu được để màn hình báo đúng sự thật.
   */
  save: async (config: PricingConfig): Promise<PricingConfigSource> => {
    const clean = normalize(config);
    writeLocal(clean);
    try {
      await api.put(ENDPOINT, clean, { skipErrorToast: true } as object);
      return 'server';
    } catch {
      return 'local';
    }
  },
};

// ─── Suy ra từ cấu hình ──────────────────────────────────────────────────────

/**
 * Đủ dùng để suy quản lý từ khu vực — tập con của `ZoneAssignment`
 * (`GET /api/v1/zones/assignments`).
 */
export interface ZoneManagerLink {
  zoneId: string;
  zoneName?: string;
  managerId: string;
  managerFullName: string;
}

/**
 * Quản lý đang phụ trách khu vực này.
 *
 * ⚠️ PHẢI tra qua KHU VỰC, không được tra qua `property.operationManagerId`.
 *
 * Quy trình của hệ thống: Host duyệt giá xong thì nhà MỚI tự nhận quản lý của khu vực nó
 * nằm trong. Nghĩa là ngay lúc đang duyệt giá — đúng lúc cần biết chi phí lương để tính
 * giá — thì `operationManagerId` vẫn còn trống. Bám vào nó thì căn nào cũng rơi vào nhánh
 * "chưa gán quản lý" và lấy mức bình quân, tức là con số lương gần như không bao giờ đúng.
 *
 * Bảng phân công khu vực thì đã có sẵn người từ trước, nên tra ra được ngay.
 */
export const managerOfZone = (
  assignments: ZoneManagerLink[],
  zoneId?: string | null,
): ZoneManagerLink | undefined =>
  zoneId ? assignments.find((a) => a.zoneId === zoneId) : undefined;

/**
 * Đếm số nhà mỗi quản lý phụ trách, suy từ KHU VỰC của từng căn.
 *
 * Đếm theo khu vực chứ không theo `operationManagerId` vì lý do trên: nhà chờ duyệt giá
 * chưa mang id quản lý nào, nhưng nó vẫn nằm trong khu vực và người đó vẫn sẽ phải coi nó.
 * Bỏ qua thì mẫu số bị thiếu, lương chia ra cao hơn thực tế và giá thuê bị đẩy lên.
 */
export const propertyCountByManager = (
  assignments: ZoneManagerLink[],
  properties: { zoneId?: string | number | null }[],
): Record<string, number> => {
  const zoneToManager = new Map(assignments.map((a) => [String(a.zoneId), a.managerId]));
  const count: Record<string, number> = {};
  properties.forEach((p) => {
    const managerId = p.zoneId != null ? zoneToManager.get(String(p.zoneId)) : undefined;
    if (managerId) count[managerId] = (count[managerId] ?? 0) + 1;
  });
  return count;
};

/**
 * Trong số nhà đếm được, bao nhiêu căn CHƯA được Host duyệt giá.
 *
 * Cần tách ra để nói đúng chữ: nhà chờ duyệt thì quản lý **chưa thực sự coi** nó — chưa
 * bàn giao, chưa có khách. Gộp chung rồi ghi "đang coi 2 nhà" là sai sự thật, và mâu thuẫn
 * ngay với màn Khu vực (màn đó đọc `property.operationManagerId`, nhà chưa duyệt thì trống
 * nên hiện "Chưa gán").
 *
 * Vẫn tính chúng vào MẪU SỐ chia lương — người đó sẽ phải coi chúng, bỏ ra khỏi mẫu số thì
 * lương chia ra cao hơn thực tế. Chỉ là phải gọi đúng tên trên màn hình.
 */
export const pendingCountByManager = <P extends { zoneId?: string | number | null }>(
  assignments: ZoneManagerLink[],
  properties: P[],
  isApproved: (p: P) => boolean,
): Record<string, number> => {
  const zoneToManager = new Map(assignments.map((a) => [String(a.zoneId), a.managerId]));
  const count: Record<string, number> = {};
  properties.forEach((p) => {
    if (isApproved(p)) return;
    const managerId = p.zoneId != null ? zoneToManager.get(String(p.zoneId)) : undefined;
    if (managerId) count[managerId] = (count[managerId] ?? 0) + 1;
  });
  return count;
};

/** Một quản lý kèm lương và số nhà đang phụ trách. */
export interface ManagerPayroll {
  managerId: string;
  fullName: string;
  salary: number;
  /** Số nhà người này đang phụ trách — **mẫu số chia lương**. */
  propertyCount: number;
}

/** Ghép danh sách quản lý thật + lương đã cấu hình + số nhà đang phụ trách. */
export const managerPayroll = (
  c: PricingConfig,
  managers: { id: string; fullName: string }[],
  propertyCountOf: (managerId: string) => number,
): ManagerPayroll[] =>
  managers.map((m) => ({
    managerId: m.id,
    fullName: m.fullName,
    salary: c.managerSalaries[m.id] ?? 0,
    propertyCount: propertyCountOf(m.id),
  }));

/**
 * Lương phân bổ cho MỘT nhà = lương ÷ số nhà người đó đang phụ trách.
 *
 * Thu hồi đủ 100% quỹ lương ở mọi thời điểm: coi 1 nhà thì nhà đó gánh trọn, coi 5 nhà thì
 * mỗi nhà gánh 1/5. Không có khoản nào rơi ra ngoài, không phải đoán trước tháng này sẽ
 * nhận được bao nhiêu nhà — điều mà Host không quyết định được vì nhà do admin gửi sang.
 *
 * ⚠️ ĐÁNH ĐỔI ĐÃ BIẾT, đừng coi là bug: giá chốt lúc duyệt thì đóng băng, còn mẫu số này
 * đổi mỗi lần khu vực nhận thêm nhà. Nên căn duyệt sớm gánh nhiều hơn căn duyệt muộn —
 * quản lý coi 1 nhà thì căn đó gánh trọn lương, tới căn thứ 5 chỉ còn 1/5. Hệ quả là hai
 * căn giống hệt nhau có thể khác giá vì thứ tự duyệt, và tổng thu hồi vượt quỹ lương khi
 * số nhà tăng. `driftOf()` bày phần vượt đó ra để Host thấy mà cân lại giá nếu muốn.
 */
export const costPerPropertyOf = (m: ManagerPayroll): number =>
  m.propertyCount > 0 ? Math.round(m.salary / m.propertyCount) : 0;

/**
 * Mức lương quản lý bình quân trên mỗi nhà — dùng khi khu vực của căn đang xét CHƯA có ai.
 *
 * Tổng quỹ lương ÷ tổng số nhà, chứ không lấy trung bình cộng của từng mức phân bổ: người
 * coi 10 nhà phải có trọng số gấp 10 lần người coi 1 nhà.
 */
export const blendedManagerCost = (rows: ManagerPayroll[]): number => {
  const active = rows.filter((m) => m.salary > 0 && m.propertyCount > 0);
  if (!active.length) return 0;
  const totalSalary = active.reduce((s, m) => s + m.salary, 0);
  const totalProps = active.reduce((s, m) => s + m.propertyCount, 0);
  return Math.round(totalSalary / totalProps);
};

/**
 * Chi phí lương quản lý gánh cho MỘT căn cụ thể, tra theo KHU VỰC của căn đó.
 *
 * Ưu tiên đúng người đang phụ trách khu vực. Khu vực chưa có ai — hoặc người đó chưa được
 * nhập lương — thì rơi về mức bình quân, vì bỏ qua hoàn toàn sẽ định giá thấp hơn chi phí
 * thật; thà ước lượng còn hơn tính là 0.
 */
export const managerCostForProperty = (
  rows: ManagerPayroll[],
  assignments: ZoneManagerLink[],
  zoneId?: string | number | null,
): number => {
  const link = managerOfZone(assignments, zoneId == null ? null : String(zoneId));
  const own = link ? rows.find((m) => m.managerId === link.managerId) : undefined;
  const cost = own ? costPerPropertyOf(own) : 0;
  return cost > 0 ? cost : blendedManagerCost(rows);
};

/**
 * Tổng chi phí vận hành mỗi tháng gửi lên BE = chi phí khác + lương quản lý của căn này.
 *
 * BE chỉ có một ô `oOperation`, không biết tới lương quản lý. Tách ra ở FE là để Host nhìn
 * thấy tiền đi đâu; tới lúc gửi thì cộng lại thành một con số BE hiểu được.
 */
export const totalOpex = (c: PricingConfig, managerCost: number): number =>
  Math.round(c.oOperation) + Math.round(managerCost);

// ─── Tăng giá niêm yết theo năm ──────────────────────────────────────────────

/**
 * Ngày bắt đầu báo giá của năm `year` cho khách mới.
 * `leadMonths = 2` → 01/11 của năm trước. `0` → đúng 01/01.
 */
export const newYearPriceFrom = (year: number, leadMonths: number): Date =>
  new Date(year - 1, 12 - Math.max(0, leadMonths), 1);

/**
 * Hợp đồng ký ngày này đã mang GIÁ CỦA NĂM NÀO.
 *
 * Ký từ mốc `newYearPriceFrom` trở đi thì quản lý đã báo khách giá năm sau, nên hợp đồng
 * mang sẵn giá năm sau.
 */
export const priceYearOf = (signDate: Date, leadMonths: number): number => {
  const y = signDate.getFullYear();
  return signDate >= newYearPriceFrom(y + 1, leadMonths) ? y + 1 : y;
};

/**
 * Giá niêm yết mà quản lý phải báo cho khách ký vào ngày này.
 *
 * @param base      giá lúc duyệt
 * @param baseYear  năm duyệt giá
 */
export const quotedPriceOn = (
  base: number, pct: number, baseYear: number, signDate: Date, leadMonths: number,
): number => {
  const steps = Math.max(0, priceYearOf(signDate, leadMonths) - baseYear);
  return steps && pct > 0 ? Math.round(base * Math.pow(1 + pct / 100, steps)) : Math.round(base);
};

/** Số tháng (có phần lẻ) giữa hai mốc — để xét đã thuê đủ thời gian ân hạn chưa. */
const monthsBetween = (from: Date, to: Date): number =>
  (to.getFullYear() - from.getFullYear()) * 12
  + (to.getMonth() - from.getMonth())
  + (to.getDate() - from.getDate()) / 30;

export interface EscalationStep {
  /** Kỳ tăng: 01/01 của năm này. */
  year: number;
  /** Giá áp dụng từ 01/01 năm đó. */
  price: number;
  /** Kỳ này có tăng không. */
  applied: boolean;
  /** Số tháng đã thuê tính tới 01/01 năm đó. */
  monthsRented: number;
  /** Vì sao không tăng (chỉ có khi `applied = false`). */
  skipReason?: string;
}

/**
 * LỊCH TĂNG GIÁ của MỘT hợp đồng — áp cho cả khách đang thuê.
 *
 * Quy tắc (chốt 26/08/2026):
 *
 *   • Mốc tăng: **01/01 hằng năm**, đồng loạt — một bảng giá chung cho cả hệ thống.
 *   • **Ân hạn**: tính tới 01/01 mà thuê chưa đủ `graceMonths` tháng thì **hoãn kỳ đó** sang
 *     01/01 năm sau. Khách ký 15/12 không bị tăng sau 17 ngày.
 *   • Lãi kép, chỉ nhân trên những kỳ thật sự tăng. Kỳ bị hoãn là bỏ hẳn, không nợ rồi trả
 *     bù năm sau.
 *
 * Ân hạn cũng tự che luôn nhóm khách cuối năm đã được quản lý báo sẵn giá năm sau (xem
 * `newYearPriceLeadMonths`): họ ký tháng 11–12 nên chắc chắn chưa đủ 6 tháng vào 01/01, kỳ
 * đó bị hoãn, không có chuyện bị tăng hai lần.
 *
 * ⚠️ ĐIỀU KIỆN PHÁP LÝ: chỉ tăng được nếu điều khoản này đã ghi trong hợp đồng khách ký.
 * Hợp đồng chỉ ghi "10.000.000 đ/tháng" rồi sau đó báo tăng là sửa hợp đồng đơn phương,
 * khách có quyền từ chối. Mẫu hợp đồng phải in rõ mức tăng và mốc tăng.
 *
 * ⚠️ Khách bị tăng thì **phải được báo trước** — xem doc BE, không được lặng lẽ đổi số tiền
 * trên hoá đơn tháng 1.
 */
export const contractEscalationSchedule = (
  startDate: Date,
  base: number,
  pct: number,
  graceMonths: number,
  years = 3,
): EscalationStep[] => {
  const steps: EscalationStep[] = [];
  let price = Math.round(base);
  for (let i = 1; i <= years; i++) {
    const mark = new Date(startDate.getFullYear() + i, 0, 1); // 01/01
    const monthsRented = monthsBetween(startDate, mark);
    const enoughTenure = monthsRented >= graceMonths;
    const applied = pct > 0 && enoughTenure;
    if (applied) price = Math.round(price * (1 + pct / 100));
    steps.push({
      year: mark.getFullYear(),
      price,
      applied,
      monthsRented,
      skipReason: !enoughTenure
        ? `mới thuê ${monthsRented.toFixed(1)} tháng`
        : (pct <= 0 ? 'không tăng giá' : undefined),
    });
  }
  return steps;
};
