import api from './api';
import type { AuthRequest, AuthResponse } from '@/types/api.types';

export const authService = {
  /**
   * POST /api/v1/auth/login
   * Đăng nhập bằng username + password, trả về JWT token
   */
  login: (data: AuthRequest): Promise<AuthResponse> => {
    return api.post('/api/v1/auth/login', data);
  },

  /**
   * POST /api/v1/auth/register
   * Đăng ký tài khoản mới, trả về message string
   */
  register: (data: AuthRequest): Promise<string> => {
    return api.post('/api/v1/auth/register', data);
  },
};
