import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '@/constants/api';
import { clearSession, notifySessionExpired } from '@/services/core/session';

/**
 * Axios client trỏ tới backend Spring THẬT (REAL_BASE_URL).
 * Dùng cho các luồng đã nối API thật (manager onboarding, guest properties, ...).
 * Hợp đồng response của backend là DTO phẳng (không bọc { data }).
 * Tự gắn Bearer token từ AsyncStorage 'accessToken'.
 *
 * REAL_BASE_URL đã tự suy theo nền tảng (xem constants/api.ts):
 * - web: '' (đi qua dev proxy của Metro, tránh CORS)
 * - thiết bị thật / Expo Go: http://<LAN-IP-máy-dev>:8080 (CORS không áp dụng cho native)
 */
const realApiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.REAL_BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

realApiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Token hết hạn / không hợp lệ (401) → dọn phiên và đưa app về màn đăng nhập.
 * Không có bước này thì app vẫn tưởng đang đăng nhập trong khi mọi màn đều lỗi.
 *
 * Bỏ qua 2 trường hợp để không "đá" nhầm người dùng:
 *   • Chính request đăng nhập/kích hoạt (sai mật khẩu cũng trả 401).
 *   • Máy chưa có accessToken — tài khoản demo (mock) không gọi BE được, 401 là bình thường.
 * Lưu ý 403 KHÔNG tính: đó là "đăng nhập rồi nhưng không đủ quyền", màn hình tự xử lý.
 */
realApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/tenant-activate');
    if (status === 401 && !isAuthCall) {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        await clearSession();
        notifySessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

export default realApiClient;
