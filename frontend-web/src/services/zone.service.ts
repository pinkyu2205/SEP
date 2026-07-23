import api from './api';
import type {
  ZoneRequest,
  ZoneResponse,
  ZoneBulkImportResponse,
  ZoneGeocodeCenterResponse,
  ZoneGeocodeBatchResponse,
  Page,
} from '@/types/api.types';

// Batch geocode chạy TUẦN TỰ phía BE (mỗi quận 1 lần gọi Goong + delay 150ms) —
// đo thực tế 19/07: 5 quận ~3s ⇒ limit mặc định 50 quận có thể mất ~30s, vượt xa
// timeout mặc định 10s của axios instance (api.ts). Luôn override timeout dài hơn
// cho riêng các call geocode, KHÔNG dùng timeout mặc định.
const GEOCODE_TIMEOUT_MS = 60_000;

export const zoneService = {
  /**
   * POST /api/v2/zones
   * Tạo mới một khu vực (Tỉnh/Quận/Phường)
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  createZone: (data: ZoneRequest): Promise<ZoneResponse> => {
    return api.post('/api/v2/zones', data);
  },

  /**
   * GET /api/v2/zones
   * Lấy tất cả khu vực (có phân trang)
   * Requires: Authenticated
   */
  getAllZones: (page: number = 0, size: number = 100): Promise<Page<ZoneResponse>> => {
    return api.get('/api/v2/zones', { params: { page, size } });
  },

  /**
   * GET /api/v2/zones/root
   * Lấy danh sách Tỉnh/Thành phố (Level 1)
   * Requires: Authenticated
   */
  getRootZones: (): Promise<ZoneResponse[]> => {
    return api.get('/api/v2/zones/root');
  },

  /**
   * GET /api/v2/zones/{parentId}/children
   * Lấy danh sách khu vực con (Tỉnh → Quận, Quận → Phường)
   * Requires: Authenticated
   */
  getChildrenZones: (parentId: string): Promise<ZoneResponse[]> => {
    return api.get(`/api/v2/zones/${parentId}/children`);
  },

  /**
   * GET /api/v2/zones/{id}
   * Lấy chi tiết 1 khu vực theo ID
   * Requires: Authenticated
   */
  getZoneById: (id: string): Promise<ZoneResponse> => {
    return api.get(`/api/v2/zones/${id}`);
  },

  /**
   * PUT /api/v2/zones/{id}
   * Cập nhật thông tin khu vực
   * Requires: ROLE_ADMIN hoặc ROLE_MANAGER
   */
  updateZone: (id: string, data: ZoneRequest): Promise<ZoneResponse> => {
    return api.put(`/api/v2/zones/${id}`, data);
  },

  /**
   * DELETE /api/v2/zones/{id}
   * Xóa khu vực
   * Requires: ROLE_ADMIN
   */
  deleteZone: (id: string): Promise<void> => {
    return api.delete(`/api/v2/zones/${id}`);
  },

  /**
   * POST /api/v1/import/zones-excel?dryRun=
   * Import hàng loạt Tỉnh/TP + Quận/Huyện từ Excel 2 sheet.
   * dryRun=true chỉ kiểm tra, không ghi DB. Requires: ROLE_ADMIN
   *
   * Lưu ý: BE hiện trả 500 thô (không phải 422 thân thiện) khi file KHÔNG PHẢI
   * Excel hợp lệ (đã verify 19/07 — NotOfficeXmlFileException lộ ra ngoài) —
   * catch ở nơi gọi phải tự hiện fallback message, đừng chỉ show error.message thô.
   */
  importZonesExcel: (file: File, dryRun: boolean): Promise<ZoneBulkImportResponse> => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/api/v1/import/zones-excel?dryRun=${dryRun}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: GEOCODE_TIMEOUT_MS,
      skipErrorToast: true, // wizard tự hiện lỗi 400/422/500 theo từng bước, tránh double toast
    } as never);
  },

  /**
   * POST /api/v2/zones/{id}/geocode-center?force=
   * Geocode tâm 1 quận/huyện qua Goong. 409 khi đã có toạ độ và force=false.
   * Requires: ROLE_ADMIN
   */
  geocodeCenter: (id: string, force = false): Promise<ZoneGeocodeCenterResponse> => {
    return api.post(
      `/api/v2/zones/${id}/geocode-center?force=${force}`,
      undefined,
      { timeout: GEOCODE_TIMEOUT_MS, skipErrorToast: true } as never,
    );
  },

  /**
   * POST /api/v2/zones/geocode-missing-centers
   * Geocode hàng loạt (mặc định chỉ quận thiếu toạ độ, hoặc force=true để ghi đè
   * cả quận đã có trong phạm vi parentId). Requires: ROLE_ADMIN
   */
  geocodeMissingCenters: (body: {
    parentId?: string | null;
    force?: boolean;
    limit?: number;
  }): Promise<ZoneGeocodeBatchResponse> => {
    return api.post('/api/v2/zones/geocode-missing-centers', body ?? {}, {
      timeout: GEOCODE_TIMEOUT_MS,
    } as never);
  },
};
