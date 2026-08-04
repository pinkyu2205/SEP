import realApiClient from '@/services/core/realApiClient';
import { noteOwnCheckoutAction } from '@/services/shared/checkoutNotifier';
import type {
  CheckoutRequestDto, CheckoutInspectionDto, CheckoutSettlementDto, CheckoutDamageItem,
} from '@/services/tenant/selfService';

/**
 * Manager xử lý YÊU CẦU TRẢ PHÒNG của tenant — BE CheckoutRequestController
 * /api/v1/checkout-requests.
 *
 * Luồng đầy đủ (chốt 03/08/2026 — docs/PLAN-checkout-flow-2026-08-03.md):
 *   PENDING →approve→ APPROVED →saveInspection→ INSPECTING →submitSettlement→
 *   WAITING_TENANT →(khách đồng ý)→ SETTLING →refund→ complete→ COMPLETED
 *
 * ĐÃ CÓ trên BE: list · get · approve · reject · complete.
 * ⚠️ BE TODO (FE gọi sẵn): inspection · settlement · submitSettlement · refund · createForTenant.
 *
 * Mọi hàm HÀNH ĐỘNG đều gọi `noteOwnCheckoutAction` với DTO trả về: ghi nhận đây là
 * thao tác của chính manager này để vòng theo dõi (useCheckoutWatcher) không bắn
 * thông báo ngược lại cho người vừa bấm — khách thuê vẫn nhận bình thường.
 */

export interface SaveInspectionBody {
  photos?: string[];                  // URL Cloudinary — FE upload trước rồi gửi URL
  roomConditionNote?: string;
  electricityFinalReading?: number;   // chốt chỉ số cuối kỳ, tránh mất tiền điện những ngày cuối
  waterFinalReading?: number;
  /** Ảnh mặt đồng hồ lúc chốt số — bằng chứng khi khách thắc mắc số cuối (BE TODO). */
  electricMeterImageUrl?: string;
  waterMeterImageUrl?: string;
  damages?: CheckoutDamageItem[];
}

export interface RefundBody {
  amount: number;
  method: 'BANK_TRANSFER' | 'CASH';
  /** Ảnh biên lai chuyển khoản — bắt buộc khi method = BANK_TRANSFER. */
  proofUrl?: string;
  paidAt: string;                     // yyyy-MM-dd
  note?: string;
}

export const checkoutService = {
  list: async (status?: string): Promise<CheckoutRequestDto[]> => {
    const { data } = await realApiClient.get<CheckoutRequestDto[]>('/api/v1/checkout-requests', {
      params: status ? { status } : {},
    });
    return data ?? [];
  },

  get: async (id: number): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.get<CheckoutRequestDto>(`/api/v1/checkout-requests/${id}`);
    return data;
  },

  approve: async (id: number, managerNote?: string): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/approve`,
      { managerNote },
    );
    noteOwnCheckoutAction(data);
    return data;
  },

  reject: async (id: number, reason: string): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/reject`,
      { reason },
    );
    noteOwnCheckoutAction(data);
    return data;
  },

  /**
   * Manager mở hồ sơ trả phòng THAY khách — dùng khi khách bỏ đi không báo hoặc HĐ
   * hết hạn không gia hạn. Không có API này thì phòng treo mãi vì chỉ tenant tạo được.
   * (BE TODO)
   */
  createForTenant: async (body: {
    contractId: number;
    expectedMoveOutDate: string;
    reason: string;
  }): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>('/api/v1/checkout-requests', body);
    noteOwnCheckoutAction(data);
    return data;
  },

  // ===== Biên bản kiểm tra phòng (BE TODO) =====

  getInspection: async (id: number): Promise<CheckoutInspectionDto> => {
    const { data } = await realApiClient.get<CheckoutInspectionDto>(
      `/api/v1/checkout-requests/${id}/inspection`,
    );
    return data;
  },

  /** Lưu biên bản; lần đầu gọi sẽ chuyển APPROVED → INSPECTING. Sửa được khi còn INSPECTING. */
  saveInspection: async (id: number, body: SaveInspectionBody): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/inspection`, body,
    );
    noteOwnCheckoutAction(data);
    return data;
  },

  // ===== Quyết toán (BE TODO) =====

  /** BE tự tính từ cọc + hoá đơn chưa trả + hư hỏng. FE KHÔNG tự cộng trừ. */
  getSettlement: async (id: number): Promise<CheckoutSettlementDto> => {
    const { data } = await realApiClient.get<CheckoutSettlementDto>(
      `/api/v1/checkout-requests/${id}/settlement`,
    );
    return data;
  },

  /** Chốt bảng tiền gửi khách: INSPECTING → WAITING_TENANT (BE notify tenant). */
  submitSettlement: async (id: number, note?: string): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/settlement/submit`, { note },
    );
    noteOwnCheckoutAction(data);
    return data;
  },

  /** Ghi nhận đã hoàn cọc — app chỉ lưu chứng từ, tiền chuyển tay ngoài hệ thống. */
  refund: async (id: number, body: RefundBody): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/refund`, body,
    );
    noteOwnCheckoutAction(data);
    return data;
  },

  /**
   * Hoàn tất trả phòng — BE terminate HĐ + phòng về AVAILABLE + restore thiết bị.
   * ⚠️ Không đảo ngược. BE phải chặn khi chưa quyết toán xong (status != SETTLING,
   * hoặc còn tiền chưa hoàn/chưa thu) — FE cũng chỉ hiện nút ở SETTLING.
   */
  complete: async (
    id: number,
    body: { actualMoveOutDate?: string; note?: string } = {},
  ): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/complete`,
      body,
    );
    noteOwnCheckoutAction(data);
    return data;
  },
};
