import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../constants/api';

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

export default realApiClient;
