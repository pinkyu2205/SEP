import AsyncStorage from '@react-native-async-storage/async-storage';
import realApiClient from './realApiClient';

/**
 * Auth service nối backend Spring THẬT.
 * Login bằng username (vd manager "long2"), trả { token, username, role }.
 */
export interface RealAuthResponse {
  token: string;
  username: string;
  role: string; // ROLE_MANAGER | ROLE_ADMIN | ROLE_TENANT | ROLE_OWNER
  isFirstLogin?: boolean; // true = khách vừa được cấp tài khoản, bắt buộc đổi mật khẩu lần đầu
}

export const realAuthService = {
  login: async (username: string, password: string): Promise<RealAuthResponse> => {
    const { data } = await realApiClient.post<RealAuthResponse>('/api/v1/auth/login', {
      username,
      password,
    });
    await AsyncStorage.setItem('accessToken', data.token);
    return data;
  },

  // Đổi mật khẩu (bắt buộc lần đầu đăng nhập). BE set is_first_login=false sau khi đổi.
  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await realApiClient.post('/api/v1/auth/change-password', { oldPassword, newPassword });
  },

  logout: async (): Promise<void> => {
    await AsyncStorage.removeItem('accessToken');
  },
};
