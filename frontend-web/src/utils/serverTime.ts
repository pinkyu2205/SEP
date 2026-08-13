/**
 * GIỜ CỦA SERVER — nguồn thời gian dùng cho mọi tính toán hạn/chu kỳ.
 *
 * Bản song sinh của `mobile-app/src/utils/serverTime.ts`; sửa bên nào thì sửa cả hai,
 * nếu không web và app nói hai kiểu với cùng một người dùng.
 *
 * Vì sao cần: trước đây toàn app gọi `new Date()`, tức tin đồng hồ MÁY người dùng,
 * trong khi trạng thái thật của hoá đơn do cron trên VPS quyết định.
 *
 * Cách lấy giờ server mà KHÔNG cần BE thêm endpoint: mọi response HTTP đều có sẵn
 * header `Date` do server sinh ra. Response interceptor ở `services/api.ts` gọi
 * `syncServerTimeFromHeader()` mỗi lần có response, ta giữ độ lệch so với đồng hồ máy
 * rồi cộng bù mỗi lần cần "bây giờ".
 *
 * ⚠️ TRÊN TRÌNH DUYỆT header `Date` KHÔNG nằm trong CORS safelist:
 *   • Dev (proxy /api của Vite) → same-origin, đọc được.
 *   • Prod (VITE_API_URL trỏ thẳng domain BE) → cross-origin, KHÔNG đọc được cho tới
 *     khi BE thêm `Access-Control-Expose-Headers: Date`.
 * Xem doc/BE-gio-server-2026-08-13.md. Chưa đồng bộ được thì `offsetMs = 0`, tức chạy
 * y hệt lúc trước (giờ máy) — không bao giờ được phép làm app đứng hay báo lỗi.
 *
 * Độ chính xác: header `Date` chỉ tới giây và không trừ độ trễ mạng. Thừa đủ cho mọi
 * thứ trong app này vì tất cả đều tính theo NGÀY.
 */

/** Server − máy, tính bằng ms. 0 = chưa đồng bộ được, dùng thẳng giờ máy. */
let offsetMs = 0;
let synced = false;

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Đọc HTTP-date ("Wed, 13 Aug 2026 10:20:31 GMT") → epoch ms, NaN nếu không hiểu. */
const parseHttpDate = (raw: string): number => {
  const viaBuiltin = Date.parse(raw);
  if (!Number.isNaN(viaBuiltin)) return viaBuiltin;

  const m = /^[A-Za-z]{3},\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*GMT$/.exec(raw.trim());
  if (!m) return NaN;
  const month = MONTHS[m[2]];
  if (month == null) return NaN;
  return Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
};

/**
 * Cập nhật độ lệch từ header `Date` của một response. Gọi ở response interceptor.
 * Nhận cả `undefined`/chuỗi rác — tự bỏ qua, không ném lỗi.
 */
export const syncServerTimeFromHeader = (raw: unknown): void => {
  if (typeof raw !== 'string' || !raw) return;
  const serverMs = parseHttpDate(raw);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
  synced = true;
};

/** "Bây giờ" theo giờ server. Chưa đồng bộ được thì rơi về giờ máy. */
export const serverNow = (): Date => new Date(Date.now() + offsetMs);

/** Đã bắt được giờ server lần nào chưa. */
export const isServerTimeSynced = (): boolean => synced;

/** Độ lệch máy so với server, ms. */
export const serverTimeOffsetMs = (): number => offsetMs;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Hôm nay theo giờ server, dạng "YYYY-MM-DD".
 *
 * KHÔNG dùng `toISOString().slice(0, 10)`: hàm đó trả ngày theo UTC, nên ở VN (UTC+7)
 * mọi thời điểm trước 07:00 sáng đều ra NGÀY HÔM TRƯỚC.
 */
export const todayIso = (now: Date = serverNow()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** Tháng này theo giờ server, dạng "YYYY-MM". */
export const currentMonthIso = (now: Date = serverNow()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** Mốc thời gian đầy đủ theo giờ server (ISO-8601). */
export const nowIso = (): string => serverNow().toISOString();
