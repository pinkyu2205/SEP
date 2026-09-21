import realApiClient from '@/services/core/realApiClient';
import type { EquipmentDto, EquipmentMaintenanceHistoryDto } from '@/types';

/**
 * Thiết bị của tenant đang đăng nhập (đúng phòng/HĐ ACTIVE của họ) — dùng cho màn
 * "Thiết bị phòng" + quét QR + form báo hỏng. BE tự suy phòng từ HĐ, không truyền roomId.
 */
export const realTenantEquipmentService = {
  /**
   * GET /tenant/me/equipments — toàn bộ thiết bị thuộc phòng/HĐ ACTIVE hiện tại.
   * contractId: bắt buộc nếu account có ≥2 HĐ ACTIVE, giống rule handover.
   */
  getMyEquipments: async (contractId?: number): Promise<EquipmentDto[]> => {
    const { data } = await realApiClient.get<EquipmentDto[]>('/api/v1/tenant/me/equipments', {
      params: contractId != null ? { contractId } : undefined,
    });
    return data;
  },

  /**
   * GET /equipments/by-qr/{qrCode} — dùng khi quét QR dán trên thiết bị.
   * BE tự chặn 422 nếu thiết bị không thuộc HĐ ACTIVE của tenant.
   */
  getByQrCode: async (qrCode: string): Promise<EquipmentDto> => {
    const { data } = await realApiClient.get<EquipmentDto>(
      `/api/v1/equipments/by-qr/${encodeURIComponent(qrCode)}`,
    );
    return data;
  },

  /**
   * GET /tenant/me/equipments/{id} — chi tiết 1 thiết bị của tenant, kèm số lần bảo trì,
   * ngày mua, bảo hành còn lại và khấu hao còn lại (BE 21/09/2026). BE tự chặn nếu thiết bị
   * không thuộc phòng/HĐ của tenant.
   */
  getMyEquipmentById: async (id: number): Promise<EquipmentDto> => {
    const { data } = await realApiClient.get<EquipmentDto>(`/api/v1/tenant/me/equipments/${id}`);
    return data;
  },

  /**
   * GET /tenant/me/equipments/{id}/maintenance-history — các lần bảo trì của thiết bị, có
   * `photoUrls` (ảnh trước / sau / hoá đơn của từng lần).
   */
  getMyEquipmentHistory: async (id: number): Promise<EquipmentMaintenanceHistoryDto[]> => {
    const { data } = await realApiClient.get<EquipmentMaintenanceHistoryDto[]>(
      `/api/v1/tenant/me/equipments/${id}/maintenance-history`,
    );
    return data;
  },

  getMaintenanceHistory: async (id: number): Promise<EquipmentMaintenanceHistoryDto[]> => {
    const { data } = await realApiClient.get<EquipmentMaintenanceHistoryDto[]>(
      `/api/v1/equipment/${id}/maintenance-history`,
    );
    return data;
  },
};
