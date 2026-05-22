import publicApiClient from './publicApiClient';
import { District, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '../types';
import { 
  DISTRICTS, 
  getWardsByDistrict, 
  searchProperties as mockSearch,
  getNearbyProperties as mockNearby,
  MOCK_PROPERTIES,
  getFeaturedProperties as mockFeatured
} from '../data/locationData';

const USE_MOCK = true;

class SearchService {
  async getDistricts(): Promise<District[]> {
    if (USE_MOCK) {
      return Promise.resolve(DISTRICTS);
    }
    const response = await publicApiClient.get('/districts');
    return response.data;
  }

  async getWards(districtId: string): Promise<Ward[]> {
    if (USE_MOCK) {
      return Promise.resolve(getWardsByDistrict(districtId));
    }
    const response = await publicApiClient.get(`/districts/${districtId}/wards`);
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
}

export const searchService = new SearchService();
