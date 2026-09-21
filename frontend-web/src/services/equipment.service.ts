import api from './api';
import type {
  AddEquipmentRequest,
  EquipmentResponse,
  MaintenanceEquipmentResponse,
  EquipmentMaintenanceHistoryResponse,
  EquipmentLifecycleStatus,
} from '@/types/api.types';

export const equipmentService = {
  /** POST /api/v1/properties/{propertyId}/equipments — Thêm thiết bị */
  addEquipment: (propertyId: number, data: AddEquipmentRequest): Promise<EquipmentResponse> => {
    return api.post(`/api/v1/properties/${propertyId}/equipments`, data);
  },

  /** GET /api/v1/properties/{propertyId}/equipments — Danh sách thiết bị (legacy type) */
  getEquipmentsByProperty: (propertyId: number): Promise<EquipmentResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/equipments`);
  },

  /** GET /api/v1/properties/{propertyId}/equipments — full DTO (cho trang QR) */
  getPropertyEquipment: (propertyId: number): Promise<MaintenanceEquipmentResponse[]> => {
    return api.get(`/api/v1/properties/${propertyId}/equipments`);
  },

  /**
   * GET /api/v1/equipments/by-qr/{qrCode} — tra cứu thiết bị theo mã QR, KHÔNG cần
   * biết trước thuộc nhà nào (`EquipmentQrController`, role ADMIN/MANAGER/TENANT).
   * Trả về `propertyId` + `roomId` để nhảy thẳng tới đúng nhà — dùng cho ô "tìm xuyên
   * hệ thống" ở trang Danh mục thiết bị khi tìm trong nhà đang chọn ra 0 kết quả.
   */
  getByQrCode: (qrCode: string): Promise<MaintenanceEquipmentResponse> => {
    return api.get(`/api/v1/equipments/by-qr/${encodeURIComponent(qrCode)}`);
  },

  // ===========================================================================
  // Lifecycle + Maintenance history — `GlobalEquipmentController` (/api/v1/equipment)
  //
  // Đã đối chiếu source BE ngày 21/09/2026. Các route cũ có hậu tố `/feature` / `-feature`
  // (MaintenanceEquipmentController) KHÔNG còn tồn tại — gọi vào sẽ 404. BE không có
  // endpoint sửa thông tin thiết bị lẻ hay lọc thiết bị theo phòng ở nhóm này: sửa
  // thiết bị đi qua `/properties/{propertyId}/equipments/...`, danh sách theo nhà dùng
  // `getPropertyEquipment` ở trên.
  // ===========================================================================

  /** GET /api/v1/equipment/{id} — chi tiết + khấu hao / bảo hành còn lại (ADMIN/MANAGER/TENANT) */
  getById: (id: number): Promise<MaintenanceEquipmentResponse> => {
    return api.get(`/api/v1/equipment/${id}`);
  },

  /** PATCH /api/v1/equipment/{id}/status — đổi lifecycle status (ADMIN/MANAGER) */
  updateLifecycleStatus: (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<MaintenanceEquipmentResponse> => {
    return api.patch(`/api/v1/equipment/${id}/status`, { status });
  },

  /**
   * GET /api/v1/equipment/{id}/maintenance-history — lịch sử bảo trì của thiết bị, có `photoUrls`
   * (BE 21/09/2026: endpoint này trả EquipmentMaintenanceHistoryResponse; danh sách phiếu bảo trì
   * chuyển sang `/maintenance-tickets`). Hậu tố `-feature` cũ không tồn tại phía BE.
   */
  getMaintenanceHistory: (id: number): Promise<EquipmentMaintenanceHistoryResponse[]> => {
    return api.get(`/api/v1/equipment/${id}/maintenance-history`);
  },
};
