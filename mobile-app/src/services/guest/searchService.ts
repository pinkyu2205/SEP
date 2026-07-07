import { City, District, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '@/types';
import { guestPropertyService } from '@/services/guest/propertyService';
import {
  CITIES,
  getWardsByCity,
  searchProperties as mockSearch,
  getNearbyProperties as mockNearby,
  MOCK_PROPERTIES,
  getFeaturedProperties as mockFeatured,
  getSimilarProperties as mockSimilar
} from '@/data/locationData';

/**
 * Đặt `true` để dùng dữ liệu mock (locationData), `false` để gọi backend Spring THẬT
 * qua `guestPropertyService` — mirror trang guest của web (xem service đó).
 */
const USE_MOCK = false;

class SearchService {
  async getCities(): Promise<City[]> {
    if (USE_MOCK) return CITIES;
    return guestPropertyService.getCities();
  }

  /** @deprecated Use getCities instead */
  async getDistricts(): Promise<District[]> {
    return this.getCities();
  }

  async getWards(cityId: string): Promise<Ward[]> {
    if (USE_MOCK) return getWardsByCity(cityId);
    return guestPropertyService.getWards(cityId);
  }

  async searchProperties(filters: SearchFilters): Promise<SearchResult> {
    if (USE_MOCK) return mockSearch(filters);
    return guestPropertyService.searchProperties(filters);
  }

  async getNearbyProperties(req: NearbyRequest): Promise<PropertyListing[]> {
    if (USE_MOCK) return mockNearby(req);
    return guestPropertyService.getNearbyProperties(req);
  }

  async getPropertyDetail(id: string): Promise<PropertyListing | null> {
    if (USE_MOCK) return MOCK_PROPERTIES.find(p => p.id === id) || null;
    return guestPropertyService.getPropertyDetail(id);
  }

  async getFeaturedProperties(): Promise<PropertyListing[]> {
    if (USE_MOCK) return mockFeatured();
    return guestPropertyService.getFeaturedProperties();
  }

  async getSimilarProperties(propertyId: string, limit: number = 3): Promise<PropertyListing[]> {
    if (USE_MOCK) return mockSimilar(propertyId, limit);
    return guestPropertyService.getSimilarProperties(propertyId, limit);
  }
}

export const searchService = new SearchService();
