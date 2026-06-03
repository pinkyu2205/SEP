import api from './api';
import type {
  RoomRequest,
  RoomResponse,
  Page,
} from '../types/api.types';

export const roomService = {
  /**
   * POST /api/v1/rooms/property/{propertyId}
   * Thêm phòng lẻ vào một tòa nhà có sẵn
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  addRoom: (propertyId: string, data: RoomRequest): Promise<RoomResponse> => {
    return api.post(`/api/v1/rooms/property/${propertyId}`, data);
  },

  /**
   * GET /api/v1/rooms/property/{propertyId}
   * Lấy tất cả phòng của 1 tòa nhà (phân trang)
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  getRoomsByProperty: (propertyId: string, page: number = 0, size: number = 100): Promise<Page<RoomResponse>> => {
    return api.get(`/api/v1/rooms/property/${propertyId}`, { params: { page, size } });
  },

  /**
   * GET /api/v1/rooms/{id}
   * Xem chi tiết thông tin một phòng
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  getRoomDetail: (id: string): Promise<RoomResponse> => {
    return api.get(`/api/v1/rooms/${id}`);
  },

  /**
   * PUT /api/v1/rooms/{id}
   * Cập nhật thông tin phòng (giá, cọc, diện tích, mã phòng)
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  updateRoom: (id: string, data: RoomRequest): Promise<RoomResponse> => {
    return api.put(`/api/v1/rooms/${id}`, data);
  },

  /**
   * DELETE /api/v1/rooms/{id}
   * Xóa phòng khỏi hệ thống
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  deleteRoom: (id: string): Promise<void> => {
    return api.delete(`/api/v1/rooms/${id}`);
  },
};
