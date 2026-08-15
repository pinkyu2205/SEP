import { City, District, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '@/types';
import { guestPropertyService } from '@/services/guest/propertyService';

/**
 * Tra cứu nhà cho khách vãng lai — mirror trang guest của web, gọi backend Spring THẬT
 * qua `guestPropertyService`.
 *
 * Trước 15/08/2026 mỗi phương thức có thêm nhánh `if (USE_MOCK) ...` đọc
 * `data/locationData.ts` (12 căn nhà + danh sách quận/phường viết cứng). Cờ đó đã để
 * `false` từ lâu nên nhánh mock chỉ còn giữ file dữ liệu giả sống — đã xoá cả hai.
 */
class SearchService {
  async getCities(): Promise<City[]> {
    return guestPropertyService.getCities();
  }

  /** @deprecated Dùng getCities */
  async getDistricts(): Promise<District[]> {
    return this.getCities();
  }

  async getWards(cityId: string): Promise<Ward[]> {
    return guestPropertyService.getWards(cityId);
  }

  async searchProperties(filters: SearchFilters): Promise<SearchResult> {
    return guestPropertyService.searchProperties(filters);
  }

  async getNearbyProperties(req: NearbyRequest): Promise<PropertyListing[]> {
    return guestPropertyService.getNearbyProperties(req);
  }

  async getPropertyDetail(id: string): Promise<PropertyListing | null> {
    return guestPropertyService.getPropertyDetail(id);
  }

  async getFeaturedProperties(): Promise<PropertyListing[]> {
    return guestPropertyService.getFeaturedProperties();
  }

  async getSimilarProperties(propertyId: string, limit: number = 3): Promise<PropertyListing[]> {
    return guestPropertyService.getSimilarProperties(propertyId, limit);
  }
}

export const searchService = new SearchService();
