import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '',
  timeout: 10000,
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
      return parsed?.message || parsed?.error || text || error.message || 'Lỗi kết nối đến máy chủ';
    } catch {
      // Blob không phải JSON đọc được (vd đúng là file PDF hỏng) — dùng message mặc định.
    }
  }
  const json = data as { message?: string; error?: string } | undefined;
  return json?.message || json?.error || error.message || 'Lỗi kết nối đến máy chủ';
}

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const message = await resolveErrorMessage(error);

    const status = error.response?.status;
    // Cho phép call chủ động tắt toast lỗi (truyền config { skipErrorToast: true })
    const skip = (error.config as { skipErrorToast?: boolean } | undefined)?.skipErrorToast;
    if (status !== 401 && status !== 403 && status !== 404 && !skip) {
      toast.error(message);
    }

    if (error.response?.status === 401) {
      // Xử lý logic đăng xuất khi hết hạn token (sẽ làm sau)
      console.warn('Unauthorized. Need to login again.');
    }

    return Promise.reject(error);
  }
);

export default api;
