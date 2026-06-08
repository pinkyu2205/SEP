import publicApiClient from './publicApiClient';
import { City, District, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '../types';
import { 
  CITIES,
  DISTRICTS,
  getWardsByCity,
  getWardsByDistrict,
  searchProperties as mockSearch,
  getNearbyProperties as mockNearby,
  MOCK_PROPERTIES,
  getFeaturedProperties as mockFeatured,
  getSimilarProperties as mockSimilar
} from '../data/locationData';

const USE_MOCK = true;

class SearchService {
  async getCities(): Promise<City[]> {
    if (USE_MOCK) {
      return Promise.resolve(CITIES);
    }
    const response = await publicApiClient.get('/cities');
    return response.data;
  }

  /** @deprecated Use getCities instead */
  async getDistricts(): Promise<District[]> {
    return this.getCities();
  }

  async getWards(cityId: string): Promise<Ward[]> {
    if (USE_MOCK) {
      return Promise.resolve(getWardsByCity(cityId));
    }
    const response = await publicApiClient.get(`/cities/${cityId}/wards`);
    return response.data;
  }

  async searchProperties(filters: SearchFilters): Promise<SearchResult> {
    if (USE_MOCK) {
      return Promise.resolve(mockSearch(filters));
    }
    const response = await publicApiClient.get('/properties/search', { params: filters });
    return response.data;
  }

  async getNearbyProperties(req: NearbyRequest): Promise<PropertyListing[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockNearby(req));
    }
    const response = await publicApiClient.get('/properties/nearby', { params: req });
    return response.data;
  }

  async getPropertyDetail(id: string): Promise<PropertyListing | null> {
    if (USE_MOCK) {
      const prop = MOCK_PROPERTIES.find(p => p.id === id);
      return Promise.resolve(prop || null);
    }
    const response = await publicApiClient.get(`/properties/${id}`);
    return response.data;
  }

  async getFeaturedProperties(): Promise<PropertyListing[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockFeatured());
    }
    const response = await publicApiClient.get('/properties/featured');
    return response.data;
  }

  async getSimilarProperties(propertyId: string, limit: number = 3): Promise<PropertyListing[]> {
    if (USE_MOCK) {
      return Promise.resolve(mockSimilar(propertyId, limit));
    }
    const response = await publicApiClient.get(`/properties/${propertyId}/similar`, { params: { limit } });
    return response.data;
  }
}

export const searchService = new SearchService();
