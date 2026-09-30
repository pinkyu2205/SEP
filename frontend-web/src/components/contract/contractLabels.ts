/**
 * Nhãn + helper dùng chung cho MỌI màn hợp đồng thuê — cổng Admin
 * (`pages/admin/ContractMonitoring.tsx`) lẫn cổng Host (`pages/host/contracts/ContractList.tsx`)
 * và drawer chi tiết dùng chung ([[ContractDetailDrawer]]).
 *
 * Tách ra đây để hai cổng KHÔNG lệch nhau: cùng một trạng thái phải ra cùng một chữ,
 * cùng một màu. Trước đây mỗi trang tự khai một bảng map nên "TERMINATED" chỗ thì
 * "Đã chấm dứt", chỗ lại "Đã thanh lý" — cùng dữ liệu mà đọc ra hai nghĩa khác nhau.
 */
import { serverNow } from '@/utils/serverTime';

export interface Badge {
  label: string;
  color: string;
  dot: string;
}

/**
 * ContractStatus của BE: DRAFT | AWAITING_ONBOARD | AWAITING_PAYMENT | AWAITING_CONFIRM |
 * PENDING | ACTIVE | EXPIRED | TERMINATED.
 *
 * Pipeline đón khách (BE 24/09/2026) — nhãn khớp `ContractStatus.displayLabelVi()` của BE, màu
 * theo gợi ý handoff: xám · xanh dương · cam · tím · xanh lá. `PENDING` chỉ còn cho HĐ inbound.
 */
export const CONTRACT_STATUS: Record<string, Badge> = {
  DRAFT: { label: 'Chờ đến ngày đón', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  AWAITING_ONBOARD: { label: 'Chờ onboard', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  AWAITING_CONFIRM: { label: 'Chờ xác nhận hợp đồng', color: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  PENDING: { label: 'Chờ xử lý', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  ACTIVE: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export const statusMeta = (status?: string): Badge =>
  CONTRACT_STATUS[status ?? ''] ?? { label: status || '—', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

/** 4 bước đón khách trước ACTIVE — khớp `ContractStatus.onboardInProgress()` = alias `status=RECEPTION`. */
export const ONBOARD_STATUSES = ['DRAFT', 'AWAITING_ONBOARD', 'AWAITING_PAYMENT', 'AWAITING_CONFIRM'] as const;

/** Chưa ACTIVE: 4 bước đón khách + `PENDING` cũ (dữ liệu inbound/legacy) — khách chưa dọn vào ở. */
export const isNotYetActive = (status?: string): boolean =>
  isOnboardStatus(status) || status === 'PENDING';

export const isOnboardStatus = (status?: string): boolean =>
  (ONBOARD_STATUSES as readonly string[]).includes(status ?? '');

/** Còn sửa được hiện trạng/chỉ số — BE `isCaptureEditable()` (PUT sang AWAITING_PAYMENT là bị từ chối). */
export const isCaptureStage = (status?: string): boolean =>
  status === 'DRAFT' || status === 'AWAITING_ONBOARD';

/** Nhãn hiển thị: ưu tiên `statusLabel` BE sinh sẵn, thiếu (HostContractDto) thì tự map. */
export const contractStatusLabel = (c: { status?: string; statusLabel?: string | null }): string =>
  c.statusLabel || statusMeta(c.status).label;

/**
 * Nhóm trạng thái dùng cho thẻ số liệu/bộ lọc — một thẻ đếm nhiều trạng thái thì lọc theo nhóm,
 * lọc một trạng thái thì số trên thẻ và số ra bảng lệch nhau.
 *   PRE_ONBOARD — chưa đón: DRAFT + AWAITING_ONBOARD
 *   PRE_ACTIVE  — đã đón, chưa kích hoạt: AWAITING_PAYMENT + AWAITING_CONFIRM + PENDING
 */
export const STATUS_GROUPS: Record<string, string[]> = {
  PRE_ONBOARD: ['DRAFT', 'AWAITING_ONBOARD'],
  PRE_ACTIVE: ['AWAITING_PAYMENT', 'AWAITING_CONFIRM', 'PENDING'],
};

export const matchesStatusFilter = (status: string | undefined, filter: string): boolean =>
  filter === 'all' || (STATUS_GROUPS[filter] ? STATUS_GROUPS[filter].includes(status ?? '') : status === filter);

/** Trạng thái thu tiền của hợp đồng (paymentStatus — cọc + tháng đầu lúc đón khách). */
export const PAYMENT_STATUS: Record<string, Badge> = {
  PENDING: { label: 'Chờ thu tiền', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  PAID: { label: 'Đã thu đủ', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  FAILED: { label: 'Thu thất bại', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  CANCELLED: { label: 'Đã huỷ', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

// KHÔNG có bảng map "duyệt giá" ở đây: hệ thống đã bỏ hẳn luồng manager gửi Host duyệt
// giá / phê duyệt hợp đồng. Host chỉ còn XEM hợp đồng, không ra quyết định trên web.

// Đồng bộ với mobile-app/src/utils/helpers.ts getContractTerminationTypeLabel().
const TERMINATION_TYPE_LABEL: Record<string, string> = {
  EARLY_MOVE_OUT: 'Trả phòng sớm',
  VIOLATION: 'Vi phạm hợp đồng',
  MUTUAL_AGREEMENT: 'Hai bên thỏa thuận',
  NO_SHOW: 'Không đến nhận nhà (tự động hủy)',
  OTHER: 'Khác',
};

export const terminationTypeLabel = (type?: string): string =>
  type ? TERMINATION_TYPE_LABEL[type] ?? 'Khác' : 'Khác';

/**
 * Điều khoản tăng giá theo năm (`rentEscalationType`).
 *
 * ⚠️ Thiếu một giá trị là UI in thẳng tên enum ra cho người dùng đọc — đúng chuyện đã
 * xảy ra với `ANNUAL_CALENDAR` (mặc định của hệ thống, nên là loại gặp nhiều nhất).
 * Thêm giá trị mới ở BE thì thêm luôn vào đây.
 *
 * Hai loại tăng theo % khác nhau ở MỐC ÁP GIÁ, không phải ở công thức — nói rõ mốc
 * trong nhãn, vì đó mới là thứ khách hỏi:
 *   ANNUAL_CALENDAR — 01/01 mỗi năm dương lịch (mặc định)
 *   PERCENT         — năm kỷ niệm hợp đồng: tháng 13, 25… tính từ ngày vào ở (legacy)
 */
export const ESCALATION_LABEL: Record<string, string> = {
  NONE: 'Không tăng giá',
  ANNUAL_CALENDAR: 'Tăng mỗi đầu năm (01/01)',
  PERCENT: 'Tăng theo năm hợp đồng',
  SCHEDULE: 'Tăng theo lịch thoả thuận',
};

/** Tình trạng nội thất bàn giao (ContractAvailableEquipmentItem.condition). */
export const EQUIPMENT_CONDITION: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Mới', color: 'bg-emerald-50 text-emerald-700' },
  GOOD: { label: 'Tốt', color: 'bg-teal-50 text-teal-700' },
  DAMAGED: { label: 'Hư hại', color: 'bg-amber-50 text-amber-700' },
  BROKEN: { label: 'Hỏng', color: 'bg-rose-50 text-rose-700' },
};

// ─── Ngày tháng ──────────────────────────────────────────────────────────────

/** "2026-08-17" → "17/08/2026". Nhận cả chuỗi ISO datetime (chỉ lấy phần ngày). */
export const fmtDate = (value?: string | null): string => {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
};

/** "17/08/2026 20:41" — cho mốc có giờ (chấm dứt, ký, chụp ảnh đồng hồ). */
export const fmtDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fmtDate(value);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** "2 năm" / "1 năm 6 tháng" / "8 tháng" từ khoảng bắt đầu → kết thúc. */
export const termLabel = (c: { startDate?: string; moveInDate?: string; endDate?: string }): string => {
  const from = c.startDate || c.moveInDate;
  if (!from || !c.endDate) return '—';
  const a = new Date(from.slice(0, 10));
  const b = new Date(c.endDate.slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—';
  const months = Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000));
  if (months <= 0) return '—';
  if (months < 12) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} năm` : `${years} năm ${rest} tháng`;
};

/** Số ngày còn lại tới ngày kết thúc (âm = đã quá hạn), null nếu không có endDate. */
export const daysLeft = (endDate?: string): number | null => {
  if (!endDate) return null;
  const end = new Date(endDate.slice(0, 10));
  if (Number.isNaN(end.getTime())) return null;
  // Giờ SERVER: "còn mấy ngày tới hạn" phải khớp với cron trên VPS — nó mới là thứ
  // thật sự chuyển hợp đồng sang hết hạn. Đồng hồ máy lệch một ngày là nhãn "sắp hết
  // hạn" bật/tắt sai một ngày so với trạng thái thật.
  const today = serverNow();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
};

/**
 * Ngưỡng "sắp hết hạn" — 60 ngày. Đủ sớm để còn kịp chốt gia hạn hoặc tìm khách mới
 * trước khi phòng trống; ngắn hơn thì biết tin lúc đã muộn.
 */
export const EXPIRING_WINDOW_DAYS = 60;

export const isExpiringSoon = (c: { status?: string; endDate?: string }): boolean => {
  if (c.status !== 'ACTIVE') return false;
  const d = daysLeft(c.endDate);
  return d != null && d >= 0 && d <= EXPIRING_WINDOW_DAYS;
};

/** "= 2 tháng tiền nhà" — đọc ra số tháng cọc khi BE không trả depositMonths. */
export const depositMonthsLabel = (c: { rentAmount?: number; deposit?: number; depositMonths?: number }): string => {
  if (c.depositMonths) return `= ${c.depositMonths} tháng tiền nhà`;
  if (!c.deposit || !c.rentAmount) return '';
  const months = c.deposit / c.rentAmount;
  return Number.isInteger(months) && months > 0 ? `= ${months} tháng tiền nhà` : '';
};

/**
 * `equipmentSnapshot` có 2 đời format: JSON `{handoverDate, items:[...]}` (HĐ cũ do
 * mobile tự build) và text BE sinh "Giường (Tốt) x1, Tủ lạnh (Mới) x1" — parse phòng
 * thủ cả hai, format nào không nhận ra thì trả về từng dòng nguyên văn.
 */
export const snapshotToLines = (snapshot?: string): string[] => {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (Array.isArray(items)) {
      return items.map((it: { name?: string; quantity?: number; category?: string }) =>
        `${it.name ?? 'Thiết bị'}${(it.quantity ?? 1) > 1 ? ` x${it.quantity}` : ''}${it.category ? ` — ${it.category}` : ''}`);
    }
  } catch { /* không phải JSON → là text BE sinh */ }
  return snapshot
    .split(/\r?\n/)
    .flatMap((line) => line.split(/,\s+(?=[^\d])/))
    .map((s) => s.trim())
    .filter(Boolean);
};

// ─── Bộ lọc & sắp xếp của bảng theo dõi ──────────────────────────────────────

export type StatusFilter = 'all' | keyof typeof CONTRACT_STATUS;

/**
 * Hợp đồng đã kết thúc là **hồ sơ lưu trữ**, không phải việc đang phải làm — nhưng khác
 * với khách thuê cũ, nó vẫn phải tra cứu được bất cứ lúc nào (đối soát, tranh chấp,
 * quyết toán cọc). Nên chọn cách "mặc định ẩn + có chỗ mở ra ngay cạnh", chứ không giấu
 * hẳn vào một tab tách biệt.
 *
 * Hôm nay hồ sơ đã kết thúc mới chiếm ~17% danh sách; sau vài năm vận hành nó sẽ là phần
 * lớn nhất và nhấn chìm mấy hợp đồng đang chạy nếu cứ trộn chung.
 */
/** 3 nhóm nền, dùng ở màn host — nơi chưa tách được "huỷ trước khi nhận nhà". */
export type BaseContractScope = 'active' | 'ended' | 'all';
export type ContractScope = BaseContractScope | 'aborted';

const ENDED_STATUSES = new Set(['TERMINATED', 'EXPIRED']);

export const isEndedContract = (status?: string): boolean => ENDED_STATUSES.has(status ?? '');

/**
 * HỢP ĐỒNG CHƯA TỪNG VẬN HÀNH — ký/nhập rồi huỷ trước khi đón khách.
 *
 * "Huỷ trước khi nhận nhà" KHÁC hẳn "đã kết thúc": một cái chưa từng bắt đầu, một cái
 * chạy xong rồi dừng. Gộp chung là thẻ số liệu nói dối — bảng import 17 hợp đồng test rồi
 * huỷ sạch sẽ hiện thành "17 hợp đồng, 100% đã chấm dứt", đọc ra như toàn bộ khách bỏ đi.
 *
 * Nhận diện KHÔNG cần BE thêm field, dựa vào 2 dấu vết chỉ sinh ra lúc ĐÓN KHÁCH:
 *   • `paymentStatus` — thu cọc là bước đầu tiên của việc đón khách.
 *   • mốc chụp công tơ điện/nước — bắt buộc phải có mới bàn giao được phòng.
 * Không có cả ba thì chưa hề có ai dọn vào ở, dù hợp đồng đã ký trên giấy.
 *
 * Cố tình đòi ĐỦ cả ba: chỉ cần một dấu vết tồn tại là đã có giao dịch thật với khách,
 * hợp đồng đó phải nằm ở "Đã kết thúc" để còn đối soát tiền, không được lùa sang đây.
 */
export const isNeverOnboarded = (c: {
  status?: string;
  paymentStatus?: string;
  electricMeterCapturedAt?: string;
  waterMeterCapturedAt?: string;
}): boolean =>
  isEndedContract(c.status)
  && c.paymentStatus !== 'PAID'
  && !c.electricMeterCapturedAt
  && !c.waterMeterCapturedAt;

/**
 * Nhãn TRẠNG THÁI THU TIỀN đã đối chiếu với trạng thái hợp đồng.
 *
 * BE giữ nguyên `paymentStatus = PENDING` khi thanh lý hợp đồng chưa thu cọc, nên hợp đồng
 * đã chết vẫn đeo nhãn "Chờ thu tiền". Đặt cạnh nhãn "Đã chấm dứt" trên cùng một dòng thì
 * hai chữ đá nhau, và người đọc hiểu thành "còn phải đi đòi khách 30 triệu" trong khi hợp
 * đồng đã chấm dứt, không còn ai để thu.
 *
 * Đây là vá ở lớp hiển thị — dữ liệu BE không sửa được từ FE. Khi nào BE set `CANCELLED`
 * lúc thanh lý (xem doc-be/BE-BUG-coc-hop-dong-da-thanh-ly-va-khong-xoa-duoc-nha-2026-08-26.md)
 * thì nhánh này thành thừa và bỏ đi được.
 */
export const paymentMeta = (c: { status?: string; paymentStatus?: string }): Badge | undefined => {
  if (!c.paymentStatus) return undefined;
  if (c.paymentStatus === 'PENDING' && isEndedContract(c.status)) {
    return {
      label: 'Không thu — HĐ đã chấm dứt',
      color: 'bg-slate-100 text-slate-600',
      dot: 'bg-slate-400',
    };
  }
  return PAYMENT_STATUS[c.paymentStatus];
};

export const SCOPE_OPTIONS: { key: BaseContractScope; label: string }[] = [
  { key: 'active', label: 'Đang theo dõi' },
  { key: 'ended', label: 'Đã kết thúc' },
  { key: 'all', label: 'Tất cả' },
];

/**
 * Bản 4 nhóm cho màn admin — nơi có đủ dữ liệu để tách "huỷ trước khi nhận nhà".
 * Màn host vẫn dùng `SCOPE_OPTIONS` 3 nhóm (`HostContractDto` không mang mốc công tơ).
 */
export const SCOPE_OPTIONS_WITH_ABORTED: { key: ContractScope; label: string }[] = [
  { key: 'active', label: 'Đang theo dõi' },
  { key: 'ended', label: 'Đã kết thúc' },
  { key: 'aborted', label: 'Huỷ trước khi nhận nhà' },
  { key: 'all', label: 'Tất cả' },
];

/**
 * Lọc theo TRẠNG THÁI. `aborted` và `ended` cùng dải trạng thái (TERMINATED/EXPIRED) —
 * tách hai nhóm đó cần cả object hợp đồng nên làm ở `inScopeContract`, không làm ở đây.
 */
export const inScope = (status: string | undefined, scope: ContractScope): boolean =>
  scope === 'all' ? true
    : scope === 'ended' || scope === 'aborted' ? isEndedContract(status)
      : !isEndedContract(status);

/** Lọc theo nhóm khi có đủ object hợp đồng — tách được `ended` với `aborted`. */
export const inScopeContract = (
  c: Parameters<typeof isNeverOnboarded>[0],
  scope: ContractScope,
): boolean => {
  if (!inScope(c.status, scope)) return false;
  if (scope === 'aborted') return isNeverOnboarded(c);
  if (scope === 'ended') return !isNeverOnboarded(c);
  return true;
};

/** Trạng thái được phép chọn trong ô lọc, theo nhóm đang xem — tránh chọn ra kết quả rỗng. */
export const statusesInScope = (scope: ContractScope): string[] =>
  Object.keys(CONTRACT_STATUS).filter((s) => inScope(s, scope));

export type SortKey = 'newest' | 'oldest' | 'ending_soon' | 'rent_desc' | 'rent_asc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Mới tạo trước' },
  { key: 'oldest', label: 'Cũ nhất trước' },
  { key: 'ending_soon', label: 'Sắp hết hạn trước' },
  { key: 'rent_desc', label: 'Giá thuê cao → thấp' },
  { key: 'rent_asc', label: 'Giá thuê thấp → cao' },
];

/**
 * Không có `createdAt` riêng nên dùng `id` làm mốc thời gian tạo (BE tăng dần).
 * `id` là number ở `/tenant-contracts` nhưng là string ở `/host/contracts` — ép số
 * ngay trong hàm để hai cổng dùng chung được một bộ so sánh.
 */
export const sortContracts = <T extends { id: number | string; rentAmount?: number; endDate?: string }>(
  list: T[],
  key: SortKey,
): T[] => {
  const seq = (c: T) => Number(c.id) || 0;
  const sorted = [...list];
  switch (key) {
    case 'oldest':
      return sorted.sort((a, b) => seq(a) - seq(b));
    case 'rent_desc':
      return sorted.sort((a, b) => (b.rentAmount ?? 0) - (a.rentAmount ?? 0));
    case 'rent_asc':
      return sorted.sort((a, b) => (a.rentAmount ?? 0) - (b.rentAmount ?? 0));
    case 'ending_soon':
      // HĐ không có ngày kết thúc luôn nằm cuối, không chen vào giữa danh sách.
      return sorted.sort((a, b) => {
        const x = a.endDate ?? '9999-12-31';
        const y = b.endDate ?? '9999-12-31';
        return x === y ? seq(b) - seq(a) : x < y ? -1 : 1;
      });
    default:
      return sorted.sort((a, b) => seq(b) - seq(a));
  }
};
