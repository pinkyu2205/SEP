import realApiClient from '@/services/core/realApiClient';

/**
 * Property service nối backend Spring THẬT (dùng cho manager onboarding).
 */
export interface ApiProperty {
  id: number;
  propertyName: string;
  shortAddress?: string;
  fullAddress?: string;
  wholeHouse: boolean | null;
  totalRooms?: number;
  price?: number;
  status: string;
  operationManagerId?: string;
  rentalAvailable?: boolean;
}

export interface ApiRoom {
  id: number;
  roomNumber: string;
  price?: number;
  deposit?: number;
  area?: number;
  maxOccupants?: number;
  status: string; // DRAFT | AVAILABLE | RENTED | MAINTENANCE
}

interface SpringPage<T> {
  content: T[];
}

export const realPropertyService = {
  getProperties: async (): Promise<ApiProperty[]> => {
    const { data } = await realApiClient.get<SpringPage<ApiProperty>>('/api/v1/properties', {
      params: { page: 0, size: 200 },
    });
    return data.content ?? [];
  },

  // BĐS còn cho thuê được (nhà nguyên căn chưa có khách / nhà chia phòng còn phòng trống)
  getRentableProperties: async (): Promise<ApiProperty[]> => {
    const { data } = await realApiClient.get<ApiProperty[]>('/api/v1/properties/rentable');
    return data ?? [];
  },

  getRooms: async (propertyId: number): Promise<ApiRoom[]> => {
    const { data } = await realApiClient.get<ApiRoom[]>(`/api/v1/properties/${propertyId}/rooms`);
    return data ?? [];
  },

  // Cập nhật trạng thái vận hành 1 phòng (manager).
  // status: DRAFT | AVAILABLE | RENTED | MAINTENANCE — khớp enum RoomStatus của BE.
  updateRoomStatus: async (propertyId: number, roomId: number, status: string): Promise<ApiRoom> => {
    const { data } = await realApiClient.patch<ApiRoom>(
      `/api/v1/properties/${propertyId}/rooms/${roomId}/status`,
      { status },
    );
    return data;
  },
};
