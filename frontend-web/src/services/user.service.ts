import api from './api';
import type { UserResponse, CreateUserRequest, UserStatus } from '@/types/api.types';

export const userService = {
  // 1. Lấy danh sách users
  getAllUsers: (): Promise<UserResponse[]> => {
    return api.get('/api/v1/user');
  },

  // 2. Lấy chi tiết user bằng ID
  getUserById: (id: string): Promise<UserResponse> => {
    return api.get(`/api/v1/user/${id}`);
  },

  /**
   * 3. Admin tạo tài khoản — POST /api/v1/user (chỉ ROLE_ADMIN).
   *
   * TRƯỚC ĐÂY gọi `/api/v1/auth/register` vì tưởng endpoint này chưa có. Verify lại với BE
   * 15/08/2026: endpoint ĐÃ CÓ và chạy đúng (tạo được ROLE_OWNER, trả 200).
   *
   * KHÔNG quay lại `/auth/register`: đó là endpoint `permitAll` — ai biết đường dẫn cũng tự
   * tạo được tài khoản. BE nay đã siết nó chỉ cho đăng ký ROLE_TENANT, nên gọi vào đó để tạo
   * host/manager/admin sẽ bị từ chối ("Chỉ được phép đăng ký tài khoản khách thuê").
   *
   * ⚠️ Cần BE trên VPS cập nhật bản mới; bản cũ chưa có endpoint này sẽ trả 403.
   */
  createUser: (data: CreateUserRequest): Promise<UserResponse> => {
    return api.post('/api/v1/user', data);
  },

  // 4. Chỉnh sửa User (cập nhật data khác nếu backend yêu cầu)
  updateUser: (id: string, data: any): Promise<UserResponse> => {
    return api.put(`/api/v1/user/${id}`, data);
  },

  // 5. Đổi trạng thái User
  changeStatus: (id: string, status: UserStatus): Promise<UserResponse> => {
    // Backend API: PATCH /api/v1/user/{id}/status?status=ACTIVE
    return api.patch(`/api/v1/user/${id}/status`, null, {
      params: { status }
    });
  }
};
