import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '@/services/core/apiClient';
import { API_CONFIG } from '@/constants/api';
import { LoginRequest, LoginResponse, User, ApiResponse } from '@/types';

/**
 * Auth Service - Xử lý đăng nhập, đăng xuất, lấy thông tin người dùng.
 */

export const authService = {
  /**
   * Đăng nhập
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
      API_CONFIG.ENDPOINTS.LOGIN,
      credentials
    );

    // Lưu token vào AsyncStorage
    await AsyncStorage.setItem('accessToken', data.data.accessToken);
    await AsyncStorage.setItem('refreshToken', data.data.refreshToken);
    await AsyncStorage.setItem('user', JSON.stringify(data.data.user));

    return data.data;
  },

  /**
   * Đăng xuất
   */
  logout: async (): Promise<void> => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('user');
  },

  /**
   * Lấy thông tin user đã lưu (offline)
   */
  getStoredUser: async (): Promise<User | null> => {
    const userStr = await AsyncStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr) as User;
    }
    return null;
  },

  /**
   * Lấy profile từ API (online)
   */
  getProfile: async (): Promise<User> => {
    const { data } = await apiClient.get<ApiResponse<User>>(
      API_CONFIG.ENDPOINTS.PROFILE
    );
    // Cập nhật cache local
    await AsyncStorage.setItem('user', JSON.stringify(data.data));
    return data.data;
  },

  /**
   * Kiểm tra đã đăng nhập chưa
   */
  isAuthenticated: async (): Promise<boolean> => {
    const token = await AsyncStorage.getItem('accessToken');
    return !!token;
  },
};
