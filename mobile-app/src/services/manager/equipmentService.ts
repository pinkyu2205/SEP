import realApiClient from '@/services/core/realApiClient';
import type {
  EquipmentDto,
  EquipmentLifecycleStatus,
  EquipmentMaintenanceHistoryDto,
  MaintenanceRequestDto,
} from '@/types';

/**
 * Equipment service (real backend).
 *
 * ⚠ Đường dẫn ở đây đã được đối chiếu trực tiếp với source BE
 * (EquipmentController, GlobalEquipmentController, EquipmentQrController) ngày 21/09/2026.
 * MaintenanceEquipmentController (các route `/feature` / `-feature`) đã bị BE xoá ở commit
 * f6e693d — gọi vào các route đó là 404. Nhóm không gắn property giờ nằm ở
 * GlobalEquipmentController: GET /equipment/{id}, PATCH /equipment/{id}/status,
 * GET /equipment/{id}/maintenance-history. BE không còn endpoint sửa thông tin thiết bị lẻ
 * hay lọc thiết bị theo phòng (dùng `getByProperty` rồi lọc theo `roomId` ở FE).
 */

/** Body của POST /properties/{id}/equipments — khớp CreateAddedEquipmentRequest của BE. */
export interface CreateEquipmentBody {
  equipmentName: string; // bắt buộc
  category: string; // bắt buộc
  cost?: number;
  roomId?: number; // bỏ trống = gắn thẳng vào nhà (nguyên căn / khu vực chung)
}

export const realEquipmentService = {
  /** Thiết bị theo property */
  getByProperty: async (propertyId: number): Promise<EquipmentDto[]> => {
    const { data } = await realApiClient.get<EquipmentDto[]>(
      `/api/v1/properties/${propertyId}/equipments`,
    );
    return data;
  },

  /** GET /api/v1/equipment/{id} — chi tiết + khấu hao / bảo hành còn lại. */
  getById: async (id: number): Promise<EquipmentDto> => {
    const { data } = await realApiClient.get<EquipmentDto>(`/api/v1/equipment/${id}`);
    return data;
  },

  /** Thêm thiết bị lắp thêm vào property/phòng */
  create: async (propertyId: number, body: CreateEquipmentBody): Promise<EquipmentDto> => {
    const { data } = await realApiClient.post<EquipmentDto>(
      `/api/v1/properties/${propertyId}/equipments`,
      body,
    );
    return data;
  },

  /** PATCH /api/v1/equipment/{id}/status — đổi tình trạng thiết bị (MANAGER/ADMIN). */
  updateStatus: async (
    id: number,
    status: EquipmentLifecycleStatus,
  ): Promise<EquipmentDto> => {
    const { data } = await realApiClient.patch<EquipmentDto>(
      `/api/v1/equipment/${id}/status`,
      { status },
    );
    return data;
  },

  /**
   * Bật/tắt hiện diện thiết bị trong phòng (trục độc lập với status vật lý).
   * ACTIVE = đang lắp · DISABLED = đã gỡ. Chỉ cho thao tác thủ công — luồng đón khách
   * không còn khái niệm "khách từ chối thiết bị" (BE tự gắn toàn bộ nội thất ACTIVE
   * vào HĐ, xem FE-contract-equipment-auto.md). (Endpoint BE đang bổ sung.)
   */
  setOperationalStatus: async (
    id: number,
    operationalStatus: 'ACTIVE' | 'DISABLED',
    reason?: string,
  ): Promise<EquipmentDto> => {
    const { data } = await realApiClient.patch<EquipmentDto>(
      `/api/v1/equipments/${id}/operational-status`,
      { operationalStatus, reason },
    );
    return data;
  },

  /**
   * Các PHIẾU BẢO TRÌ gắn với 1 thiết bị, mới nhất trước — dùng cho "Lịch sử bảo trì" ở màn
   * Thiết bị và đếm số lần hỏng ở TicketDetailScreen.
   *
   * BE 21/09/2026 (commit b270c35): danh sách phiếu chuyển sang
   * `GET /equipment/{id}/maintenance-tickets` (`List<MaintenanceRequestResponse>`); route
   * `/maintenance-history` giờ trả bản ghi lịch sử (xem `getMaintenanceRecords`). Trước đó
   * `/maintenance-history` trả phiếu, nên tên hàm giữ nguyên để các màn cũ không phải đổi.
   */
  getMaintenanceHistory: async (id: number): Promise<MaintenanceRequestDto[]> => {
    const { data } = await realApiClient.get<MaintenanceRequestDto[]>(
      `/api/v1/equipment/${id}/maintenance-tickets`,
    );
    return data;
  },

  /**
   * GET /api/v1/equipment/{id}/maintenance-history — bản ghi lịch sử bảo trì
   * (`EquipmentMaintenanceHistoryResponse`: ngày, chi phí, ghi chú, `photoUrls` ảnh
   * trước/sau/hoá đơn của từng lần).
   */
  getMaintenanceRecords: async (id: number): Promise<EquipmentMaintenanceHistoryDto[]> => {
    const { data } = await realApiClient.get<EquipmentMaintenanceHistoryDto[]>(
      `/api/v1/equipment/${id}/maintenance-history`,
    );
    return data;
  },
};
