export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';

export interface RoomRequest {
  roomNumber: string;
  price: number;
  deposit: number;
  area: number;
}

export interface RoomResponse {
  id: string;
  roomNumber: string;
  price: number;
  deposit: number;
  area: number;
  status: RoomStatus;
  imageUrls: string;
}

export interface PropertyRequest {
  title: string;
  description: string;
  address: string;
  wholeHouse: boolean;
  electricityPrice: number;
  waterPrice: number;
  imageUrls: string;
  zoneId: string;
  authorizedOwnerName: string;
  defaultPrice?: number;
  defaultDeposit?: number;
  defaultArea?: number;
  rooms: RoomRequest[];
}

export interface PropertyResponse {
  id: string;
  title: string;
  description: string;
  address: string;
  isWholeHouse: boolean; // Note: mapped as isWholeHouse in backend response
  totalRooms: number;
  electricityPrice: number;
  waterPrice: number;
  imageUrls: string;
  zoneId: string;
  zoneFullName: string;
  ownerId: string;
  rooms: RoomResponse[];
}

export interface ZoneSummaryProjection {
  zoneId: string;
  zoneFullName: string;
  totalProperties: number;
  totalRooms: number;
  totalAvailableRooms: number;
  totalOccupiedRooms: number;
  totalMaintenanceRooms: number;
}
