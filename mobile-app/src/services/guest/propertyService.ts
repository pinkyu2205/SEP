import realApiClient from '@/services/core/realApiClient';
import {
  City,
  Ward,
  PropertyListing,
  PropertyRoom,
  SearchFilters,
  SearchResult,
  NearbyRequest,
} from '@/types';

/**
 * Guest property service nối backend Spring THẬT — mirror của
 * `frontend-web/src/services/propertyService.ts` (trang guest web).
 *
 * Quy ước giống web:
 *  - Chỉ hiển thị property `status === 'ACTIVE'` đã được gán operation manager.
 *  - Nhà nguyên căn: giá & diện tích của cả căn.
 *  - Nhà chia phòng: lấy theo PHÒNG (min/max giá phòng), diện tích theo phòng đại diện.
 *
 * BE (20/06/2026) đã mở endpoint public GET-only `/api/v1/public/properties/**`
 * (SecurityConfig permitAll cho GET) → khách CHƯA đăng nhập vẫn xem được danh sách.
 * `realApiClient` vẫn tự gắn Bearer nếu có token (không bắt buộc với endpoint này).
 * DTO `GuestPropertyResponse` trả thêm lat/long, amenities, giá điện/nước, cọc, phí
 * dịch vụ, `rentalAvailable` (các field này có thể null khi OM chưa nhập).
 * Xem doc BE-multipart-public-guest-api-2026-06-20.md.
 */

const PUBLIC_BASE = '/api/v1/public/properties';

// ─── Hợp đồng response BE (subset, khớp web api.types.ts) ─────────────────────
interface ApiPropertyResponse {
  id: number;
  propertyName: string;
  shortAddress: string;
  fullAddress?: string;
  descriptions?: string;
  zoneId: string;
  zoneName: string;
  areaSize?: number;
  wholeHouse: boolean | null;
  totalRooms?: number;
  status: string;
  price?: number;
  operationManagerId?: string;
  operationManagerName?: string;
  imageUrls?: string[];
  // GuestPropertyResponse — field mới cho guest (có thể null khi OM chưa nhập)
  latitude?: number | null;
  longitude?: number | null;
  amenities?: string[];
  electricityUnitPrice?: number | null;
  waterUnitPrice?: number | null;
  depositMonths?: number | null;
  serviceFee?: number | null;
  rentalAvailable?: boolean;
}

interface ApiRoomResponse {
  id: number;
  roomNumber: string;
  price?: number;
  deposit?: number;
  area?: number;
  structureDescription?: string;
  imageUrls?: string;
  status: string; // DRAFT | AVAILABLE | RENTED | MAINTENANCE
}

interface SpringPage<T> {
  content: T[];
}

// Toạ độ mặc định (trung tâm TP.HCM) vì BE list DTO chưa trả lat/long.
const HCM_CENTER = { latitude: 10.7769, longitude: 106.7009 };
const CITY_ID = 'hcm';
const CITY_NAME = 'TP. Hồ Chí Minh';

const isRoomAvailable = (status?: string) => (status ?? '').toUpperCase() === 'AVAILABLE';

const mapRoom = (r: ApiRoomResponse): PropertyRoom => ({
  id: String(r.id),
  name: r.roomNumber,
  floor: 0, // BE chưa trả tầng ở DTO này
  area: r.area ?? 0,
  price: r.price ?? 0,
  status: isRoomAvailable(r.status) ? 'available' : 'occupied',
  photos: r.imageUrls ? [r.imageUrls] : [],
  equipments: [],
  description: r.structureDescription,
});

/** Lấy phòng của 1 property (chỉ cho nhà chia phòng). Lỗi → []. */
async function fetchRooms(propertyId: number): Promise<ApiRoomResponse[]> {
  try {
    const { data } = await realApiClient.get<ApiRoomResponse[]>(`${PUBLIC_BASE}/${propertyId}/rooms`);
    return data ?? [];
  } catch {
    return [];
  }
}

/**
 * Tính giá / diện tích / số phòng trống cho hiển thị công khai.
 * - Nhà nguyên căn: cả căn.
 * - Nhà chia phòng: min/max giá phòng có giá; diện tích theo phòng giá cao nhất.
 */
function resolvePricing(p: ApiPropertyResponse, rooms: ApiRoomResponse[]) {
  if (p.wholeHouse !== false) {
    const price = p.price ?? 0;
    // Nhà nguyên căn: còn trống khi BE báo rentalAvailable (chưa có HĐ tenant active).
    const vacant = p.rentalAvailable ?? p.status === 'ACTIVE';
    return {
      priceFrom: price,
      priceTo: price,
      area: p.areaSize ?? 0,
      availableRooms: vacant ? 1 : 0,
    };
  }

  const priced = rooms.filter(r => (r.price ?? 0) > 0);
  const availableRooms = rooms.filter(r => isRoomAvailable(r.status)).length;

  if (priced.length > 0) {
    const prices = priced.map(r => r.price ?? 0);
    const rep = priced.reduce((a, b) => ((b.price ?? 0) > (a.price ?? 0) ? b : a));
    return {
      priceFrom: Math.min(...prices),
      priceTo: Math.max(...prices),
      area: rep.area ?? p.areaSize ?? 0,
      availableRooms,
    };
  }

  const withArea = rooms.find(r => (r.area ?? 0) > 0);
  const price = p.price ?? 0;
  return { priceFrom: price, priceTo: price, area: withArea?.area ?? p.areaSize ?? 0, availableRooms };
}

function mapToListing(p: ApiPropertyResponse, rooms: ApiRoomResponse[]): PropertyListing {
  const isWholeHouse = p.wholeHouse === true;
  const pricing = resolvePricing(p, rooms);

  return {
    id: String(p.id),
    name: p.propertyName,
    address: p.fullAddress || p.shortAddress,
    city: CITY_NAME,
    ward: p.zoneName,
    cityId: CITY_ID,
    wardId: p.zoneId,
    photos: p.imageUrls ?? [],
    priceFrom: pricing.priceFrom,
    priceTo: pricing.priceTo,
    totalRooms: p.totalRooms ?? rooms.length,
    availableRooms: pricing.availableRooms,
    area: pricing.area,
    propertyType: isWholeHouse ? 'whole_house' : 'apartment',
    amenities: p.amenities ?? [],
    houseEquipments: [],
    electricityRate: p.electricityUnitPrice ?? 0,
    waterRate: p.waterUnitPrice ?? 0,
    depositMonths: p.depositMonths ?? 0,
    serviceFee: p.serviceFee ?? 0,
    description: p.descriptions || '',
    // Toạ độ thật từ BE nếu có; fallback trung tâm TP.HCM khi OM chưa nhập.
    latitude: p.latitude ?? HCM_CENTER.latitude,
    longitude: p.longitude ?? HCM_CENTER.longitude,
    rooms: rooms.map(mapRoom),
    hostName: p.operationManagerName,
    createdAt: new Date().toISOString(),
  };
}

/** Lấy toàn bộ property ACTIVE đã gán manager, đã map sang PropertyListing. */
async function fetchActiveProperties(): Promise<PropertyListing[]> {
  try {
    const { data } = await realApiClient.get<SpringPage<ApiPropertyResponse>>(PUBLIC_BASE, {
      params: { page: 0, size: 200 },
    });
    // BE đã lọc sẵn ACTIVE + đã gán manager ở server, không cần lọc lại phía FE.
    const list = data.content ?? [];
    // Nhà chia phòng cần fetch phòng để tính giá; nhà nguyên căn thì không.
    return Promise.all(
      list.map(async p => mapToListing(p, p.wholeHouse === false ? await fetchRooms(p.id) : [])),
    );
  } catch {
    return [];
  }
}

function applyFilters(all: PropertyListing[], filters: SearchFilters): SearchResult {
  const {
    keyword, propertyType, cityId, wardIds, priceMin, priceMax,
    areaMin, areaMax, sortBy = 'newest', page = 1, limit = 20,
  } = filters;

  let result = [...all];

  if (keyword) {
    const kw = keyword.toLowerCase().trim();
    result = result.filter(
      p => p.name.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw),
    );
  }
  if (propertyType) result = result.filter(p => p.propertyType === propertyType);
  if (cityId) result = result.filter(p => p.cityId === cityId);
  if (wardIds?.length) result = result.filter(p => wardIds.includes(p.wardId));
  if (priceMin) result = result.filter(p => p.priceTo >= priceMin);
  if (priceMax) result = result.filter(p => p.priceFrom <= priceMax);
  if (areaMin) result = result.filter(p => p.area >= areaMin);
  if (areaMax) result = result.filter(p => p.area <= areaMax);
  // Bỏ qua lọc theo amenities: BE list DTO chưa trả tiện ích.

  result.sort((a, b) => {
    switch (sortBy) {
      case 'price_asc': return a.priceFrom - b.priceFrom;
      case 'price_desc': return b.priceFrom - a.priceFrom;
      case 'nearest': // chưa có toạ độ thật từ BE → coi như newest
      case 'newest':
      default: return b.id.localeCompare(a.id);
    }
  });

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const properties = result.slice((page - 1) * limit, page * limit);

  return { properties, total, page, totalPages };
}

export const guestPropertyService = {
  async getFeaturedProperties(limit = 6): Promise<PropertyListing[]> {
    const all = await fetchActiveProperties();
    return all.slice(0, limit);
  },

  async searchProperties(filters: SearchFilters): Promise<SearchResult> {
    const all = await fetchActiveProperties();
    return applyFilters(all, filters);
  },

  async getNearbyProperties(req: NearbyRequest): Promise<PropertyListing[]> {
    // BE chưa trả toạ độ → tạm trả các căn nổi bật theo limit.
    const all = await fetchActiveProperties();
    return all.slice(0, req.limit ?? 10);
  },

  async getPropertyDetail(id: string): Promise<PropertyListing | null> {
    try {
      // BE trả 404 nếu không thoả ACTIVE + đã gán manager → catch xuống null.
      const { data: p } = await realApiClient.get<ApiPropertyResponse>(`${PUBLIC_BASE}/${id}`);
      const rooms = p.wholeHouse === false ? await fetchRooms(p.id) : [];
      return mapToListing(p, rooms);
    } catch {
      return null;
    }
  },

  async getSimilarProperties(propertyId: string, limit = 3): Promise<PropertyListing[]> {
    const current = await this.getPropertyDetail(propertyId);
    if (!current) return [];
    const all = await fetchActiveProperties();
    return all
      .filter(p => p.id !== propertyId && p.propertyType === current.propertyType)
      .slice(0, limit);
  },

  // ─── Khu vực: suy ra từ dữ liệu thật để search theo phường/khu vực nhất quán ──
  async getCities(): Promise<City[]> {
    const all = await fetchActiveProperties();
    const availableRooms = all.reduce((sum, p) => sum + (p.availableRooms || 0), 0);
    return [{ id: CITY_ID, name: CITY_NAME, availableRooms }];
  },

  async getWards(cityId: string): Promise<Ward[]> {
    const all = await fetchActiveProperties();
    const byZone = new Map<string, Ward>();
    for (const p of all) {
      if (p.cityId !== cityId) continue;
      const existing = byZone.get(p.wardId);
      if (existing) existing.availableRooms += p.availableRooms || 0;
      else byZone.set(p.wardId, { id: p.wardId, cityId, name: p.ward, availableRooms: p.availableRooms || 0 });
    }
    return Array.from(byZone.values());
  },
};
