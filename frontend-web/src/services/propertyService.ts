// Service cung cấp dữ liệu bất động sản cho Public Website.
// Gọi real API, chỉ hiển thị property ACTIVE đã được gán operation manager.

import api from './api';
import type { Paginated } from '../types/common';
import type { PropertyFilter, PublicProperty } from '../types/property';
import type { PropertyResponse, RoomResponse } from '../types/api.types';
import { PROPERTIES_PER_PAGE } from '../utils/constants';

function mapToPublicProperty(p: PropertyResponse, resolvedPrice: number): PublicProperty {
  const isWholeHouse = p.wholeHouse === true;
  const summary = p.descriptions
    ? p.descriptions.slice(0, 120) + (p.descriptions.length > 120 ? '…' : '')
    : `${isWholeHouse ? 'Nhà nguyên căn' : 'Phòng cho thuê'} tại ${p.shortAddress}`;

  return {
    id: String(p.id),
    title: p.propertyName,
    summary,
    description: p.descriptions || '',
    address: p.fullAddress || p.shortAddress,
    district: p.zoneName,
    price: resolvedPrice,
    area: p.areaSize ?? 0,
    type: isWholeHouse ? 'WHOLE_HOUSE' : 'ROOM',
    status: 'AVAILABLE',
    images: p.imageUrls ?? [],
    amenities: [],
    bedrooms: isWholeHouse ? (p.totalRooms || undefined) : undefined,
    featured: false,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

async function resolvePrice(p: PropertyResponse): Promise<number> {
  // Nhà nguyên căn → lấy property.price
  if (p.wholeHouse !== false) return p.price ?? 0;

  // Nhà chia phòng → lấy giá cao nhất trong các phòng
  try {
    const rooms: RoomResponse[] = await api.get(`/api/v1/properties/${p.id}/rooms`);
    const prices = rooms.map(r => r.price ?? 0).filter(v => v > 0);
    return prices.length > 0 ? Math.max(...prices) : (p.price ?? 0);
  } catch {
    return p.price ?? 0;
  }
}

async function fetchActiveProperties(): Promise<PublicProperty[]> {
  try {
    const res: { content: PropertyResponse[] } = await api.get('/api/v1/properties', {
      params: { page: 0, size: 200 },
    });
    const active = res.content.filter(p => p.status === 'ACTIVE' && p.operationManagerId != null);
    return Promise.all(active.map(async p => mapToPublicProperty(p, await resolvePrice(p))));
  } catch {
    return [];
  }
}

function applyFiltersAndSort(
  all: PublicProperty[],
  filter: PropertyFilter,
): Paginated<PublicProperty> {
  const {
    keyword, district, type, minPrice, maxPrice, minArea, bedrooms, amenities,
    sort = 'newest', page = 1, pageSize = PROPERTIES_PER_PAGE,
  } = filter;

  let result = [...all];

  if (keyword) {
    const kw = keyword.toLowerCase().trim();
    result = result.filter(
      p => p.title.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw),
    );
  }
  if (district) result = result.filter(p => p.district === district);
  if (type) result = result.filter(p => p.type === type);
  if (minPrice) result = result.filter(p => p.price >= minPrice);
  if (maxPrice) result = result.filter(p => p.price <= maxPrice);
  if (minArea) result = result.filter(p => p.area >= minArea);
  if (bedrooms) result = result.filter(p => (p.bedrooms ?? 0) >= bedrooms);
  if (amenities?.length) {
    result = result.filter(p => amenities.every(a => p.amenities.includes(a)));
  }

  result.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return a.price - b.price;
      case 'price_desc': return b.price - a.price;
      case 'area_desc': return b.area - a.area;
      case 'newest':
      default: return b.id.localeCompare(a.id);
    }
  });

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = result.slice((page - 1) * pageSize, page * pageSize);

  return { items, page, pageSize, total, totalPages };
}

export async function getProperties(filter: PropertyFilter = {}): Promise<Paginated<PublicProperty>> {
  const all = await fetchActiveProperties();
  return applyFiltersAndSort(all, filter);
}

export async function getFeaturedProperties(limit = 6): Promise<PublicProperty[]> {
  const all = await fetchActiveProperties();
  return all.slice(0, limit);
}

export async function getPropertyById(id: string): Promise<PublicProperty | null> {
  try {
    const p: PropertyResponse = await api.get(`/api/v1/properties/${id}`);
    if (p.status !== 'ACTIVE' || p.operationManagerId == null) return null;
    return mapToPublicProperty(p, await resolvePrice(p));
  } catch {
    return null;
  }
}

export async function getRelatedProperties(id: string, limit = 3): Promise<PublicProperty[]> {
  const current = await getPropertyById(id);
  if (!current) return [];
  const all = await fetchActiveProperties();
  return all.filter(p => p.id !== id && p.type === current.type).slice(0, limit);
}

export async function getCompanyStats(): Promise<{
  totalProperties: number;
  totalTenants: number;
  totalBuildings: number;
  satisfactionRate: number;
}> {
  return {
    totalProperties: 320,
    totalTenants: 1850,
    totalBuildings: 45,
    satisfactionRate: 98,
  };
}
