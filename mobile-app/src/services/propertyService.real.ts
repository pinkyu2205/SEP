import realApiClient from './realApiClient';

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
}

export interface ApiRoom {
  id: number;
  roomNumber: string;
  price?: number;
  deposit?: number;
  area?: number;
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

  getRooms: async (propertyId: number): Promise<ApiRoom[]> => {
    const { data } = await realApiClient.get<ApiRoom[]>(`/api/v1/properties/${propertyId}/rooms`);
    return data ?? [];
  },
};
