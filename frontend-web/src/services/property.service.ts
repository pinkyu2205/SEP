import api from './api';
import type {
  PropertyDraftRequest,
  PropertyResponse,
  PropertyCreateRequest,
  Page,
  ManifestRequest,
  ManifestItemResponse,
  InboundContractRequest,
  InboundContractResponse,
  OnboardingOptionsRequest,
  StructureUpdateRequest,
  RenovationLineRequest,
  RenovationLineResponse,
  RenovationScheduleRequest,
  AddRoomRequest,
  RoomResponse,
  EquipmentAssignRequest,
  EquipmentAssignmentResponse,
  PricingResponse,
  CalculatePricingRequest,
  PricingCalculationResponse,
  PricingReconciliationResponse,
  OnboardingSummaryResponse,
  HostConfirmRequest,
  HostConfirmResponse,
  PropertyActivationResponse,
  PropertyPurgeResponse,
  PriceHistoryItem,
  HandoverEquipmentResponse,
  OperationalEquipmentResponse,
} from '@/types/api.types';

const BASE = '/api/v1/properties';

export const propertyService = {
  // =========================================================================
  // CRUD cơ bản
  // =========================================================================

  /** POST /properties/draft — Tạo nháp property (Inbound v2) */
  createDraft: (data: PropertyDraftRequest): Promise<PropertyResponse> => {
    return api.post(`${BASE}/draft`, data);
  },

  /** POST /properties — Legacy: Tạo property kiểu cũ */
  createProperty: (data: PropertyCreateRequest): Promise<PropertyResponse> => {
    return api.post(BASE, data);
  },

  /** GET /properties/{id} */
  getPropertyById: (id: number): Promise<PropertyResponse> => {
    return api.get(`${BASE}/${id}`);
  },

  /** GET /properties — Phân trang. Cần LẤY HẾT thì dùng `getAllProperties()`. */
  getProperties: (page: number = 0, size: number = 10): Promise<Page<PropertyResponse>> => {
    return api.get(BASE, { params: { page, size } });
  },

  /**
   * TẤT CẢ bất động sản — tự lật hết trang, không cắt cụt.
   *
   * ─── Vì sao cần (30/08/2026) ─────────────────────────────────────────────
   * Trước đây mỗi màn tự gọi `getProperties(0, N)` với N mỗi nơi một kiểu: 100 ở
   * trang Bất động sản và Quản lý vận hành, 200 ở Hợp đồng / Khách thuê / Tài chính /
   * Báo cáo / Khu vực, 500 ở Bảng điều hành admin / Lương quản lý / Cấu hình giá.
   *
   * Con số N là một PHỎNG ĐOÁN về việc hệ thống sẽ có bao nhiêu nhà, và phỏng đoán đó
   * không có gì bảo vệ: vượt ngưỡng thì danh sách thiếu nhà mà màn hình vẫn vẽ bình
   * thường, không cảnh báo, không dấu hiệu. Tệ hơn là mỗi trang đoán một số khác nhau
   * nên cùng một căn có thể "tồn tại" ở trang này và "không tồn tại" ở trang kia —
   * đúng loại lỗi vừa làm hỏng lối đi giữa Khách thuê và Hợp đồng (xem
   * `hostService.listAllContracts`).
   *
   * Giống `listAllContracts`: lấy trang đầu để biết tổng số trang, phần còn lại gọi
   * song song, chặn ở `MAX_PAGES` phòng khi BE trả `totalPages` sai.
   */
  getAllProperties: async (): Promise<PropertyResponse[]> => {
    const MAX_PAGES = 10;
    const SIZE = 500;

    const first = await propertyService.getProperties(0, SIZE);
    const out = [...(first.content ?? [])];
    const pages = Math.min(first.totalPages ?? 1, MAX_PAGES);
    if (pages <= 1) return out;

    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        propertyService.getProperties(i + 1, SIZE)
          .then((r) => r.content ?? [])
          // Hỏng một trang thì thiếu phần đó còn hơn hỏng cả màn hình.
          .catch(() => [] as PropertyResponse[]),
      ),
    );
    rest.forEach((chunk) => out.push(...chunk));
    return out;
  },

  /** PUT /properties/{id} — Cập nhật thông tin cơ bản */
  updateProperty: (id: number, data: PropertyCreateRequest | PropertyDraftRequest): Promise<PropertyResponse> => {
    return api.put(`${BASE}/${id}`, data);
  },

  /**
   * DELETE /properties/{id} — xóa cứng căn nhà + toàn bộ dữ liệu con (BE bulk delete). Trả 204.
   * `silent`: tắt toast lỗi của interceptor — dùng khi xóa hàng loạt để tự tổng hợp kết quả.
   */
  deleteProperty: (id: number, opts?: { silent?: boolean }): Promise<void> => {
    return api.delete(`${BASE}/${id}`, opts?.silent ? ({ skipErrorToast: true } as never) : undefined);
  },

  /** DELETE /properties/{id}/purge — như deleteProperty nhưng trả số bản ghi đã xóa (ADMIN). */
  purgeProperty: (id: number): Promise<PropertyPurgeResponse> => {
    return api.delete(`${BASE}/${id}/purge`);
  },

  // =========================================================================
  // Bước 1B — Equipment Manifest
  // =========================================================================

  /** PUT /properties/{id}/equipment-manifest — Ghi đè manifest (gửi full list) */
  putManifest: (id: number, data: ManifestRequest): Promise<ManifestItemResponse[]> => {
    return api.put(`${BASE}/${id}/equipment-manifest`, data);
  },

  /** GET /properties/{id}/equipment-manifest */
  getManifest: (id: number): Promise<ManifestItemResponse[]> => {
    return api.get(`${BASE}/${id}/equipment-manifest`);
  },

  // =========================================================================
  // Bước 1C — Inbound Contract
  // =========================================================================

  /** POST /properties/{id}/inbound-contract */
  createInboundContract: (id: number, data: InboundContractRequest): Promise<InboundContractResponse> => {
    return api.post(`${BASE}/${id}/inbound-contract`, data);
  },

  /** GET /properties/{id}/inbound-contract */
  getInboundContract: (id: number): Promise<InboundContractResponse> => {
    return api.get(`${BASE}/${id}/inbound-contract`);
  },

  // =========================================================================
  // Bước 2A — Onboarding Options
  // =========================================================================

  /** POST /properties/{id}/onboarding-options */
  setOnboardingOptions: (id: number, data: OnboardingOptionsRequest): Promise<PropertyResponse> => {
    return api.post(`${BASE}/${id}/onboarding-options`, data);
  },

  // =========================================================================
  // Bước 2B — Cập nhật cấu trúc
  // =========================================================================

  /** PUT /properties/{id}/structure */
  updateStructure: (id: number, data: StructureUpdateRequest): Promise<PropertyResponse> => {
    return api.put(`${BASE}/${id}/structure`, data);
  },

  // =========================================================================
  // Bước 2C — Renovation Lines & Schedule
  // =========================================================================

  /** POST /properties/{id}/renovation-lines — Thêm 1 dòng */
  addRenovationLine: (id: number, data: RenovationLineRequest): Promise<RenovationLineResponse> => {
    return api.post(`${BASE}/${id}/renovation-lines`, data);
  },

  /** GET /properties/{id}/renovation-lines */
  getRenovationLines: (id: number): Promise<RenovationLineResponse[]> => {
    return api.get(`${BASE}/${id}/renovation-lines`);
  },

  /** PUT /properties/{id}/renovation-schedule */
  setRenovationSchedule: (id: number, data: RenovationScheduleRequest): Promise<void> => {
    return api.put(`${BASE}/${id}/renovation-schedule`, data);
  },

  // =========================================================================
  // Bước 2D — Rooms (chia phòng)
  // =========================================================================

  /** POST /properties/{id}/rooms */
  addRoom: (id: number, data: AddRoomRequest): Promise<RoomResponse> => {
    return api.post(`${BASE}/${id}/rooms`, data);
  },

  /** GET /properties/{id}/rooms */
  getRooms: (id: number): Promise<RoomResponse[]> => {
    return api.get(`${BASE}/${id}/rooms`);
  },

  /** GET /properties/{id}/rooms/{roomId} */
  getRoomById: (id: number, roomId: number): Promise<RoomResponse> => {
    return api.get(`${BASE}/${id}/rooms/${roomId}`);
  },

  /** PATCH /properties/{id}/rooms/{roomId}/status */
  updateRoomStatus: (id: number, roomId: number, status: string): Promise<RoomResponse> => {
    return api.patch(`${BASE}/${id}/rooms/${roomId}/status`, { status });
  },

  /** PUT /properties/{id}/rooms/{roomId} — sửa thông tin phòng (chờ BE, xem doc/NOTE-CHO-TEAM-BE.md mục 11) */
  updateRoom: (id: number, roomId: number, data: Partial<AddRoomRequest>): Promise<RoomResponse> => {
    return api.put(`${BASE}/${id}/rooms/${roomId}`, data);
  },

  // =========================================================================
  // GIÁ THUÊ — niêm yết / đang áp dụng / lịch sử
  //
  // Mô hình: `listedPrice` là giá Host duyệt (giá bán), `appliedPrice` là giá hợp đồng
  // đang chạy. Khách trả phòng xong thì applied quay về listed. Đơn vị nào ĐANG CÓ KHÁCH
  // thì BE khoá giá (`priceLocked = true`) — gọi PATCH sẽ bị từ chối.
  //
  // Dùng endpoint RIÊNG cho giá, KHÔNG dùng `PUT rooms/{roomId}`: ràng buộc "chỉ sửa
  // phòng lúc onboarding" của endpoint kia vẫn đúng cho các field cấu trúc.
  // =========================================================================

  /** PATCH /properties/{id}/rooms/{roomId}/price — đổi giá niêm yết của MỘT phòng. */
  updateRoomPrice: (id: number, roomId: number, price: number, reason: string): Promise<RoomResponse> => {
    return api.patch(`${BASE}/${id}/rooms/${roomId}/price`, { price, reason });
  },

  /** PATCH /properties/{id}/price — đổi giá niêm yết của nhà NGUYÊN CĂN. */
  updatePropertyPrice: (id: number, price: number, reason: string): Promise<PropertyResponse> => {
    return api.patch(`${BASE}/${id}/price`, { price, reason });
  },

  /** GET /properties/{id}/price-history — lịch sử đổi giá của nhà + mọi phòng bên trong. */
  getPriceHistory: (id: number): Promise<PriceHistoryItem[]> => {
    return api.get(`${BASE}/${id}/price-history`);
  },

  /** DELETE /properties/{id}/rooms/{roomId} — xoá phòng (chờ BE, xem doc/NOTE-CHO-TEAM-BE.md mục 11) */
  deleteRoom: (id: number, roomId: number): Promise<void> => {
    return api.delete(`${BASE}/${id}/rooms/${roomId}`);
  },

  // =========================================================================
  // Bước 2E — Equipment Assignment
  // =========================================================================

  /** POST /properties/{id}/equipments/assign */
  assignEquipment: (id: number, data: EquipmentAssignRequest): Promise<EquipmentAssignmentResponse> => {
    return api.post(`${BASE}/${id}/equipments/assign`, data);
  },

  /** GET /properties/{id}/equipments */
  getAssignedEquipments: (id: number): Promise<EquipmentAssignmentResponse[]> => {
    return api.get(`${BASE}/${id}/equipments`);
  },

  /** DELETE /properties/{id}/equipments/{equipmentId} — Xoá 1 lượt gán thiết bị */
  unassignEquipment: (id: number, equipmentId: number): Promise<void> => {
    return api.delete(`${BASE}/${id}/equipments/${equipmentId}`);
  },

  // =========================================================================
  // Bước 3 — Depreciation & Submit to Host
  // =========================================================================

  /** POST /properties/{id}/depreciation/calculate — Preview giá */
  calculateDepreciation: (id: number): Promise<PricingResponse> => {
    return api.post(`${BASE}/${id}/depreciation/calculate`, {});
  },

  /** GET /properties/{id}/depreciation */
  getDepreciation: (id: number): Promise<PricingResponse> => {
    return api.get(`${BASE}/${id}/depreciation`);
  },

  // ── Định giá mô hình mới (FORWARD/REVERSE) — /properties/{id}/pricing/* ──

  /** POST /properties/{id}/pricing/calculate — Tính giá theo lợi nhuận (FORWARD) hoặc ROI (REVERSE) */
  calculatePricing: (id: number, data: CalculatePricingRequest): Promise<PricingCalculationResponse> => {
    return api.post(`${BASE}/${id}/pricing/calculate`, data);
  },

  /** GET /properties/{id}/pricing — Lấy kết quả tính giá đã lưu (404 nếu chưa tính lần nào) */
  getPricing: (id: number): Promise<PricingCalculationResponse> => {
    return api.get(`${BASE}/${id}/pricing`);
  },

  /** GET /properties/{id}/pricing/reconciliation — Đối soát doanh thu/lợi nhuận thực tế theo tháng */
  reconcilePricing: (
    id: number,
    params: { month: string; oOperation?: number; pDesired?: number; vRate?: number },
  ): Promise<PricingReconciliationResponse> => {
    return api.get(`${BASE}/${id}/pricing/reconciliation`, { params });
  },

  /** GET /properties/{id}/handover-equipments — TB chủ nhà bàn giao (đợt 1, chỉ hiển thị) */
  getHandoverEquipments: (id: number): Promise<HandoverEquipmentResponse[]> => {
    return api.get(`${BASE}/${id}/handover-equipments`);
  },

  /** GET /properties/{id}/equipments — TB vận hành (đã gán phòng/khu vực, có version cải tạo + bảo hành) */
  getEquipments: (id: number): Promise<OperationalEquipmentResponse[]> => {
    return api.get(`${BASE}/${id}/equipments`);
  },

  /** POST /properties/{id}/submit-to-host — Admin gửi cho Host */
  submitToHost: (id: number): Promise<OnboardingSummaryResponse> => {
    return api.post(`${BASE}/${id}/submit-to-host`);
  },

  // =========================================================================
  // Bước 3B — Hoàn tất Cải tạo
  // =========================================================================

  /** POST /properties/{id}/renovation/complete */
  completeRenovation: (id: number): Promise<PropertyResponse> => {
    return api.post(`${BASE}/${id}/renovation/complete`);
  },

  /** POST /properties/{id}/renovation/start — Bắt đầu cải tạo lại từ trạng thái ACTIVE */
  startRenovation: (id: number): Promise<PropertyResponse> => {
    return api.post(`${BASE}/${id}/renovation/start`);
  },

  /** GET /properties/{id}/renovation/sessions — Lịch sử cải tạo nhóm theo đợt (BE mục 10) */
  getRenovationSessions: (id: number): Promise<import('@/types/api.types').RenovationSession[]> => {
    return api.get(`${BASE}/${id}/renovation/sessions`);
  },

  // =========================================================================
  // Bước 4 — Host Confirm
  // =========================================================================

  /** GET /properties/{id}/onboarding-summary — Tổng hợp cho Host xem */
  getOnboardingSummary: (id: number): Promise<OnboardingSummaryResponse> => {
    return api.get(`${BASE}/${id}/onboarding-summary`);
  },

  /** POST /properties/{id}/host-confirm */
  hostConfirm: (id: number, data: HostConfirmRequest): Promise<HostConfirmResponse> => {
    return api.post(`${BASE}/${id}/host-confirm`, data);
  },

  /** GET /api/v1/user/managers — danh sách operation managers */
  getManagers: (): Promise<{ id: string; fullName: string; username: string }[]> => {
    return api.get('/api/v1/user/managers');
  },

  // =========================================================================
  // Gán quản lý vận hành
  // =========================================================================

  /**
   * PATCH /properties/{id}/operation-manager
   *
   * ⚠️ CHỈ gọi từ màn "Khu vực & Quản lý" (`pages/zones/ZoneOverview.tsx`), nơi nó chạy
   * theo lô cho cả một quận. Quản lý vận hành được phân công theo KHU VỰC — một quận một
   * người — nên đừng thêm lại nút gán/đổi cho từng nhà. (Khi BE làm xong API gán theo lô
   * ở doc/BE-NEED-zone-manager-assignment-2026-08-14.md thì thay vòng lặp bằng API đó.)
   */
  assignOperationManager: (id: number, operationManagerId: string): Promise<PropertyActivationResponse> => {
    return api.patch(`${BASE}/${id}/operation-manager`, { operationManagerId });
  },

  // =========================================================================
  // Vô hiệu hóa
  // =========================================================================

  /** POST /properties/{id}/disable — `silent` tắt toast lỗi khi chạy hàng loạt. */
  disableProperty: (id: number, opts?: { silent?: boolean }): Promise<PropertyResponse> => {
    return api.post(`${BASE}/${id}/disable`, undefined, opts?.silent ? ({ skipErrorToast: true } as never) : undefined);
  },

  /**
   * POST /properties/{id}/enable — Kích hoạt lại tòa nhà từ trạng thái DISABLED.
   * ⚠️ BE CHƯA CÓ endpoint này (xem doc/BE-import-excel-status-constraint.md).
   */
  enableProperty: (id: number): Promise<PropertyResponse> => {
    return api.post(`${BASE}/${id}/enable`);
  },
};
