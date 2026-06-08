import api from './api';
import type {
  PropertyCreateRequest,
  PropertyResponse,
  Page,
} from '../types/api.types';

export const propertyService = {
  /** POST /api/v1/properties — Tạo property mới (DRAFT) */
  createProperty: (data: PropertyCreateRequest): Promise<PropertyResponse> => {
    return api.post('/api/v1/properties', data);
  },

  /** GET /api/v1/properties/{id} — Chi tiết 1 property */
  getPropertyById: (id: number): Promise<PropertyResponse> => {
    return api.get(`/api/v1/properties/${id}`);
  },

  /** GET /api/v1/properties — Danh sách property phân trang */
  getProperties: (page: number = 0, size: number = 10): Promise<Page<PropertyResponse>> => {
    return api.get('/api/v1/properties', { params: { page, size } });
  },

  /** PUT /api/v1/properties/{id} — Cập nhật property */
  updateProperty: (id: number, data: PropertyCreateRequest): Promise<PropertyResponse> => {
    return api.put(`/api/v1/properties/${id}`, data);
  },

  /** DELETE /api/v1/properties/{id} — Xóa property */
  deleteProperty: (id: number): Promise<void> => {
    return api.delete(`/api/v1/properties/${id}`);
  },
};
