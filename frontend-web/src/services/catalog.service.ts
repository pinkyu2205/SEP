import api from './api';
import type { EquipmentCatalogItem, RenovationCategory } from '../types/api.types';

export const catalogService = {
  /** GET /api/v1/equipment-catalog — Danh mục thiết bị */
  getEquipmentCatalog: (): Promise<EquipmentCatalogItem[]> => {
    return api.get('/api/v1/equipment-catalog');
  },

  /**
   * POST /api/v1/equipment-catalog — Tạo thiết bị mới trong danh mục.
   * BE cần implement endpoint này (chưa có, xem doc/NOTE-CHO-TEAM-BE.md).
   */
  createEquipmentCatalogItem: (data: { name: string; description?: string }): Promise<EquipmentCatalogItem> => {
    return api.post('/api/v1/equipment-catalog', data);
  },

  /**
   * PUT /api/v1/equipment-catalog/{id} — Cập nhật thiết bị.
   * BE cần implement endpoint này (chưa có, xem doc/NOTE-CHO-TEAM-BE.md).
   */
  updateEquipmentCatalogItem: (id: number, data: { name: string; description?: string }): Promise<EquipmentCatalogItem> => {
    return api.put(`/api/v1/equipment-catalog/${id}`, data);
  },

  /**
   * DELETE /api/v1/equipment-catalog/{id} — Xoá thiết bị khỏi danh mục.
   * BE cần implement endpoint này (chưa có, xem doc/NOTE-CHO-TEAM-BE.md).
   */
  deleteEquipmentCatalogItem: (id: number): Promise<void> => {
    return api.delete(`/api/v1/equipment-catalog/${id}`);
  },

  /** GET /api/v1/renovation-categories — Danh mục hạng mục cải tạo */
  getRenovationCategories: (): Promise<RenovationCategory[]> => {
    return api.get('/api/v1/renovation-categories');
  },
};
