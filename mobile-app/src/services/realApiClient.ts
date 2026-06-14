import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../constants/api';

/**
 * Axios client trỏ tới backend Spring THẬT (REAL_BASE_URL).
 * Dùng cho các luồng đã nối API thật (hiện tại: manager onboarding khách thuê).
 * Hợp đồng response của backend là DTO phẳng (không bọc { data }).
 * Tự gắn Bearer token từ AsyncStorage 'accessToken'.
 */
// Trên web: gọi cùng origin (rỗng) để đi qua dev proxy của Metro (metro.config.js)
// -> tránh CORS. Trên native: gọi thẳng backend thật.
const realApiClient: AxiosInstance = axios.create({
  baseURL: Platform.OS === 'web' ? '' : API_CONFIG.REAL_BASE_URL,
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
