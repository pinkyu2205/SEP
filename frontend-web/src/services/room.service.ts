import api from './api';
import type { AddRoomRequest, RoomResponse } from '../types/api.types';

export const roomService = {
  /** POST /api/v1/properties/{propertyId}/rooms — Thêm phòng (chỉ wholeHouse=false) */
  addRoom: (propertyId: number, data: AddRoomRequest): Promise<RoomResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/rooms`, data);
  },

  /** GET /api/v1/properties/{propertyId}/rooms — Danh sách phòng của 1 tòa */
  getRoomsByProperty: (propertyId: number): Promise<RoomResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/rooms`);
  },

  /** GET /api/v1/properties/{propertyId}/rooms/{roomId} — Chi tiết 1 phòng */
  getRoomById: (propertyId: number, roomId: number): Promise<RoomResponse> => {
    return api.get(`/api/v1/properties/${propertyId}/rooms/${roomId}`);
  },
};
