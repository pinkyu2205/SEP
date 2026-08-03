/**
 * Đọc lỗi từ API thành câu người dùng hiểu được.
 *
 * Ba loại rác hay lọt ra màn hình nếu đọc `err.message` một cách ngây thơ:
 *   1. Stack/SQL của Hibernate: "could not execute statement [ERROR: ... violates
 *      check constraint ...]" — lộ tên bảng, manager không hiểu gì.
 *   2. Câu mặc định của axios: "Request failed with status code 400" — không nói
 *      được lý do, người dùng chỉ biết là hỏng.
 *   3. Body lỗi nằm ở field khác `message` (error / detail / errors[]) nên bị bỏ sót
 *      dù BE có gửi lý do tử tế.
 *
 * Hàm này ưu tiên câu BE viết cho người dùng, còn lại thì đổi sang câu theo mã lỗi.
 * Nguyên văn LUÔN được log ra console để dev còn debug.
 */

/** Dấu hiệu message là lỗi kỹ thuật, không phải câu viết cho người dùng. */
const TECHNICAL_HINTS = [
  'could not execute statement',
  'constraint',
  'sqlstate',
  'violates',
  'exception',
  'stacktrace',
  'org.hibernate',
  'org.springframework',
  'java.lang',
  'nullpointer',
  'error:',
  'select ',
  'insert into',
  'update ',
];

/** Câu axios tự sinh — có cũng như không, phải bỏ để rơi xuống nhánh theo mã lỗi. */
const isAxiosGeneric = (msg: string) =>
  /^request failed with status code \d+$/i.test(msg.trim())
  || /^network error$/i.test(msg.trim())
  || /^timeout of \d+ms exceeded$/i.test(msg.trim());

const looksTechnical = (msg: string) => {
  const m = msg.toLowerCase();
  return msg.length > 180 || TECHNICAL_HINTS.some(k => m.includes(k));
};

/** Gom mọi chỗ BE hay nhét lý do lỗi vào. */
const pickServerMessage = (data: any): string | undefined => {
  if (!data) return undefined;
  if (typeof data === 'string') return data.trim() || undefined;
  const direct = data.message || data.error || data.detail || data.title;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  // Lỗi validate của Spring: { errors: [{ field, defaultMessage }] }
  if (Array.isArray(data.errors) && data.errors.length) {
    const parts = data.errors
      .map((e: any) => e?.defaultMessage || e?.message || (typeof e === 'string' ? e : ''))
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  return undefined;
};

export function readApiError(err: any, fallback: string): string {
  const status: number | undefined = err?.response?.status;
  const data = err?.response?.data;
  const serverMsg = pickServerMessage(data);
  const rawMsg = serverMsg || err?.message;

  // Luôn log đầy đủ — kể cả khi hiện câu thân thiện — để còn tra được nguyên nhân.
  if (status || rawMsg) {
    console.warn('[API error]', status ?? '-', err?.config?.method?.toUpperCase() ?? '', err?.config?.url ?? '', data ?? rawMsg);
  }

  if (serverMsg && !looksTechnical(serverMsg) && !isAxiosGeneric(serverMsg)) {
    return serverMsg;
  }

  if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
    return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  if (err?.code === 'ECONNABORTED') {
    return 'Máy chủ phản hồi quá lâu. Thử lại sau ít phút.';
  }

  switch (status) {
    case 400:
      return `${fallback}\n\nMáy chủ từ chối dữ liệu gửi lên (400) nhưng không nói rõ lý do. Có thể tính năng này backend chưa làm xong — báo đội backend kèm thao tác vừa thực hiện.`;
    case 401:
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 404:
      return `${fallback}\n\nBackend chưa có API cho thao tác này (404).`;
    case 409:
      return fallback;
    case 422:
      return `${fallback}\n\nDữ liệu không hợp lệ — kiểm tra lại các ô đã nhập.`;
    default:
      if (status && status >= 500) {
        return `${fallback}\n\nMáy chủ gặp sự cố xử lý (${status}). Báo đội kỹ thuật và thử lại sau.`;
      }
      return fallback;
  }
}
