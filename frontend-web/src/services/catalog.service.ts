import api from './api';
import type { EquipmentCatalogItem, RenovationCategory } from '../types/api.types';

export const catalogService = {
  /** GET /api/v1/equipment-catalog — Danh mục thiết bị */
  getEquipmentCatalog: (): Promise<EquipmentCatalogItem[]> => {
    return api.get('/api/v1/equipment-catalog');
  },

  /** GET /api/v1/renovation-categories — Danh mục hạng mục cải tạo */
  getRenovationCategories: (): Promise<RenovationCategory[]> => {
    return api.get('/api/v1/renovation-categories');
  },
};
