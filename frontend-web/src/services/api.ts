import axios from 'axios';
import toast from 'react-hot-toast';

// Local dev: để trống, dùng proxy /api của Vite (xem vite.config.ts).
// Trên Vercel: set VITE_API_URL trỏ thẳng vào domain backend tương ứng (prod/dev).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  // Render free tier sleep sau ~15 phút không traffic, request đầu dậy lại có thể mất 30-60s.
  timeout: 90000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Lấy token từ nơi bạn lưu (VD: localStorage hoặc sessionStorage)
    // Hiện tại WebAuthContext đang dùng mock user. Sau này khi làm API Login thật, 
    // bạn lưu token vào localStorage và lấy ra ở đây.
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Khi request dùng responseType: 'blob' (vd tải PDF), axios trả error.response.data
// là Blob thay vì JSON — message/error khi đó luôn undefined và rơi về generic
// "Request failed with status code xxx". Đọc thử nội dung blob (thường là JSON lỗi
// BE) trước khi build message hiển thị.
async function resolveErrorMessage(error: {
  response?: { data?: unknown };
  message?: string;
}): Promise<string> {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || text || error.message || 'Lỗi kết nối đến máy chủ';
    } catch {
      // Blob không phải JSON đọc được (vd đúng là file PDF hỏng) — dùng message mặc định.
    }
  }
  // BE trả lỗi chuẩn dùng field `error`; một số handler (Map-based) chỉ có `message` — ưu tiên error trước.
  const json = data as { message?: string; error?: string; code?: string } | undefined;
  // Ngoại lệ: body 403 của `AccessDeniedException` có `error: "Forbidden"` (chữ máy) và
  // `message` mới là câu tiếng Việt giải thích thiếu quyền gì. Giữ thứ tự ưu tiên cũ ở
  // đây sẽ hiện đúng chữ "Forbidden" cho người dùng.
  if (json?.code === 'FORBIDDEN') {
    return json.message || json.error || 'Bạn không có quyền thực hiện thao tác này';
  }
  return json?.error || json?.message || error.message || 'Lỗi kết nối đến máy chủ';
}

/**
 * Phân biệt hai loại 403 — từ BE commit `94f4dd9` (13/08/2026) mọi `AccessDeniedException`
 * đều kèm `code: "FORBIDDEN"`.
 *
 *  • CÓ code  → thiếu quyền thật (vd manager mở nhà không thuộc mình quản lý).
 *               Thử lại vô ích, và nuốt im lặng thì người dùng thấy màn trắng không lý do.
 *  • KHÔNG có → 403 thoáng qua lúc backend cold-start, đúng ca mà cơ chế retry bên dưới
 *               sinh ra để xử lý.
 *
 * Trước 13/08/2026 lỗi phân quyền của BE trả 422 nên vẫn có toast; sau khi BE đổi sang
 * 403 cho đúng chuẩn thì nó rơi trọn vào nhánh "im lặng" bên dưới và biến mất.
 */
function isPermissionDenied(status: number | undefined, data: unknown): boolean {
  if (status !== 403 || !data || typeof data !== 'object') return false;
  return (data as { code?: string }).code === 'FORBIDDEN';
}

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error.response?.status;
    const config = error.config as
      | { method?: string; _authRetried?: boolean; skipErrorToast?: boolean }
      | undefined;

    // BE free-tier hay "cold start" (sleep sau ~15p không traffic): vài giây đầu app
    // vừa dậy, JWT filter/DB pool chưa ổn định khiến request GET có token hợp lệ vẫn
    // rớt 401/403 thoáng qua. Thử lại đúng 1 lần cho GET trước khi coi là lỗi thật —
    // tránh hiện "danh sách trống" oan trong lúc chờ backend dậy hẳn.
    const permissionDenied = isPermissionDenied(status, error.response?.data);

    if (
      (status === 401 || (status === 403 && !permissionDenied)) &&
      config &&
      config.method?.toLowerCase() === 'get' &&
      !config._authRetried
    ) {
      config._authRetried = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return api(config);
    }

    const message = await resolveErrorMessage(error);

    // Cho phép call chủ động tắt toast lỗi (truyền config { skipErrorToast: true })
    const skip = config?.skipErrorToast;
    // 401/403/404 vẫn im lặng như cũ (màn tự xử lý), TRỪ 403 thiếu quyền thật — cái đó
    // không báo thì người dùng chỉ thấy danh sách trống và không hiểu vì sao.
    const silent = status === 401 || status === 404 || (status === 403 && !permissionDenied);
    if (!silent && !skip) {
      toast.error(message);
    }

    if (status === 401) {
      // Xử lý logic đăng xuất khi hết hạn token (sẽ làm sau)
      console.warn('Unauthorized. Need to login again.');
    }

    return Promise.reject(error);
  }
);

export default api;
