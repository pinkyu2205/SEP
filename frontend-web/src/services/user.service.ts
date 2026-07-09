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

  // 3. Tạo mới User
  // BE hiện CHƯA có endpoint admin tạo user: POST /api/v1/user trả 403.
  // Dùng tạm /api/v1/auth/register (permitAll, tạo được mọi role) để admin tạo account ngay trên web,
  // khỏi phải mở Postman. Khi BE làm endpoint admin-gated (chỉ ROLE_ADMIN) thì đổi lại đây.
  // Xem doc/BE-admin-create-user.md.
  createUser: (data: CreateUserRequest): Promise<UserResponse> => {
    return api.post('/api/v1/auth/register', data);
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
