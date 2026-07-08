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
