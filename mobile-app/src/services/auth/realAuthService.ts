import AsyncStorage from '@react-native-async-storage/async-storage';
import realApiClient from '@/services/core/realApiClient';

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

/**
 * Kích hoạt tài khoản tenant (26/07/2026): tenant mới KHÔNG có mật khẩu mặc định
 * (BE tạo password random + isFirstLogin=true) — phải tự kích hoạt qua SĐT → OTP →
 * tự đặt mật khẩu. Xem docs/FE-tenant-account-activation.md (repo BE).
 * 3 endpoint public dưới /api/v1/auth/tenant-activate/**, không cần JWT.
 */
export type TenantActivateStatus = 'NEEDS_ACTIVATION' | 'READY_TO_LOGIN' | 'NOT_FOUND' | 'NOT_ELIGIBLE';

export interface TenantActivateCheckResponse {
  status: TenantActivateStatus;
  message: string;
  username?: string;
}

export interface TenantActivateConfirmRequest {
  phoneNumber: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
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

  tenantActivateCheck: async (phoneNumber: string): Promise<TenantActivateCheckResponse> => {
    const { data } = await realApiClient.post<TenantActivateCheckResponse>(
      '/api/v1/auth/tenant-activate/check',
      { phoneNumber },
    );
    return data;
  },

  // OTP kích hoạt hiện hardcode gửi về số override của team (0352393203), không phải
  // SĐT khách — BE vẫn nhận đúng SĐT để biết kích hoạt user nào (xem OtpDeliveryOverride).
  tenantActivateSendOtp: async (phoneNumber: string): Promise<void> => {
    await realApiClient.post('/api/v1/auth/tenant-activate/send-otp', { phoneNumber });
  },

  // Response cùng shape AuthResponse như login (token/username/role/firstLogin) — FE
  // lưu token và vào thẳng app, không bắt đăng nhập lại.
  tenantActivateConfirm: async (
    body: TenantActivateConfirmRequest,
  ): Promise<RealAuthResponse> => {
    const { data } = await realApiClient.post<RealAuthResponse>(
      '/api/v1/auth/tenant-activate/confirm',
      body,
    );
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
