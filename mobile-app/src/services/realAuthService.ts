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
  // BE serialize field Java `isFirstLogin` (boolean) thành key JSON `firstLogin`
  // (Jackson bỏ tiền tố "is" khi tên field đã bắt đầu bằng "is") — đã verify bằng login thật.
  firstLogin?: boolean; // true = khách vừa được cấp tài khoản, bắt buộc đổi mật khẩu lần đầu
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
  // BE yêu cầu đủ 3 field: oldPassword, newPassword, confirmPassword.
  changePassword: async (
    oldPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> => {
    await realApiClient.post('/api/v1/auth/change-password', {
      oldPassword,
      newPassword,
      confirmPassword,
    });
  },

  logout: async (): Promise<void> => {
    await AsyncStorage.removeItem('accessToken');
  },
};
