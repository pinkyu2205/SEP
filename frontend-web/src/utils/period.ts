/**
 * Helper kỳ (YYYY-MM), ngày và định dạng số — dùng chung cho các màn báo cáo/tài
 * chính của cả Host lẫn Admin. Thuần tuý, không phụ thuộc React.
 */
import { serverNow, currentMonthIso } from '@/utils/serverTime';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const ymOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

/**
 * Tháng vận hành hiện tại theo GIỜ SERVER, đọc tại THỜI ĐIỂM GỌI.
 *
 * Đây là thứ BE dùng làm mặc định khi thiếu param `month`, nên FE phải hỏi đúng kỳ đó.
 * Chưa đồng bộ được giờ server thì tự rơi về giờ máy — không bao giờ ném lỗi.
 *
 * ─── Đừng thay bằng một hằng số (bài học 30/08/2026) ─────────────────────────
 * Ở đây từng có `export const CURRENT_MONTH = ymOf(new Date())` và hơn 40 nơi dùng nó.
 * Lập luận biện hộ khi đó là "chỉ chính xác tới THÁNG, máy phải sai cả tuần mới ra sai
 * tháng" — sai ở chỗ coi lệch đồng hồ là chuyện hiếm. Máy thật gặp ngoài đời lệch tới
 * HAI THÁNG (máy tháng 8, server tháng 10), và hậu quả là:
 *   • mọi trang gọi API kèm hằng đó đều xin số liệu SAI KỲ — bảng điều hành, báo cáo,
 *     công nợ vẽ tháng 8 trong khi hệ thống đã sang tháng 10, không báo gì;
 *   • `MonthPicker` lấy nó làm trần nên khoá luôn nút "kỳ sau" — host lùi về tháng
 *     trước rồi không quay lại được.
 *
 * Hằng số còn hỏng thêm một kiểu nữa kể cả khi đồng hồ máy đúng: nó tính MỘT LẦN lúc
 * nạp module, nên tab mở qua đêm giao tháng vẫn đứng ở tháng cũ cho tới khi F5.
 */
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
