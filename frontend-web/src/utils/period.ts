/**
 * Helper kỳ (YYYY-MM), ngày và định dạng số — dùng chung cho các màn báo cáo/tài
 * chính của cả Host lẫn Admin. Thuần tuý, không phụ thuộc React.
 */
import { serverNow, currentMonthIso } from '@/utils/serverTime';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const ymOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

/**
 * Tháng vận hành hiện tại THẬT của hệ thống (BE mặc định về tháng này khi thiếu param).
 *
 * ⚠️ Đây là hằng số tính MỘT LẦN lúc nạp module — thời điểm đó chưa có response API nào
 * nên chưa biết giờ server, đành lấy giờ máy. Chấp nhận được vì nó chỉ chính xác tới
 * THÁNG: máy phải sai cả tuần mới ra sai tháng.
 * Chỗ nào cần đúng tới NGÀY thì dùng `currentMonthIso()`/`todayIso()` của
 * @/utils/serverTime, đừng suy từ hằng này.
 */
export const CURRENT_MONTH = ymOf(new Date());

/** Như `CURRENT_MONTH` nhưng đọc tại thời điểm gọi, theo giờ server. */
export const currentMonth = (): string => currentMonthIso();

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
};

/** "2026-08" → "Tháng 8/2026" */
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `Tháng ${Number(m)}/${y}`;
};

/** "2026-08" → "Th8/26" */
export const monthShort = (ym: string) => {
  const [y, m] = ym.split('-');
  return `Th${Number(m)}/${y.slice(2)}`;
};

/** ISO date/datetime → "dd/mm/yyyy" */
export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return d ? `${d}/${m}/${y}` : iso;
};

/** ISO datetime → "dd/mm/yyyy · hh:mm" */
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const [date, time] = iso.split('T');
  return `${fmtDate(date)}${time ? ` · ${time.slice(0, 5)}` : ''}`;
};

/** Rút gọn tiền cho trục biểu đồ: 12_000_000 → "12tr" */
export const fmtMillion = (v: number) => `${(v / 1_000_000).toFixed(0)}tr`;

/** Số ngày từ `iso` tới hôm nay (âm = còn ở tương lai). */
export const daysSince = (iso?: string | null): number => {
  if (!iso) return 0;
  const d = new Date(`${iso.split('T')[0]}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const today = serverNow();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
};

/** So sánh chuỗi ngày ISO giảm dần — an toàn khi thiếu giá trị. */
export const cmpIsoDesc = (a?: string | null, b?: string | null) => (b ?? '').localeCompare(a ?? '');

/** Chia an toàn ra %: không có mẫu số thì trả null để UI hiện "—" thay vì NaN. */
export const safePct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
