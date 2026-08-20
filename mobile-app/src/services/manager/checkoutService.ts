import realApiClient from '@/services/core/realApiClient';
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
 * ĐÃ CÓ ĐỦ trên BE (verify 05/08/2026): list · get · approve · reject · complete ·
 * inspection · settlement · settlement/submit · refund · createForTenant.
 *
 * BE tự bắn thông báo + push cho phía còn lại ở mọi bước (CHECKOUT_* ) — FE KHÔNG
 * tự sinh thông báo nữa, tránh khách/quản lý nhận 2 lần.
 */

export interface SaveInspectionBody {
  photos?: string[];                  // URL Cloudinary — FE upload trước rồi gửi URL
  roomConditionNote?: string;
  electricityFinalReading?: number;   // chốt chỉ số cuối kỳ, tránh mất tiền điện những ngày cuối
  waterFinalReading?: number;
  /** Ảnh mặt đồng hồ lúc chốt số — bằng chứng khi khách thắc mắc (BE có 05/08/2026). */
  electricMeterImageUrl?: string;
  waterMeterImageUrl?: string;
  /**
   * Đơn giá quản lý nhập tay trên biên bản (BE nhận từ 20/08/2026).
   *
   * BE lấy đơn giá theo 4 tầng: (1) số gửi ở đây → (2) đơn giá kỳ gần nhất của chính hợp
   * đồng → (3) đơn giá đăng ký của nhà → (4) không có gì thì báo lỗi chặn.
   *
   * Khách trả phòng ngay THÁNG ĐẦU thì tầng 2 chưa có hoá đơn nào, và nhà chưa chắc đã
   * nhập đơn giá (tầng 3) — nên tầng 1 là đường duy nhất. Không gửi lên là BE chặn với
   * "Nhà ... chưa có đơn giá điện", dù quản lý đã gõ số trên màn hình.
   */
  electricityUnitPrice?: number;
  waterUnitPrice?: number;
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
    return data;
  },

  reject: async (id: number, reason: string): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/reject`,
      { reason },
    );
    return data;
  },

  /**
   * Manager mở hồ sơ trả phòng THAY khách — dùng khi khách bỏ đi không báo hoặc HĐ
   * hết hạn không gia hạn. BE đã có từ 05/08/2026 (POST /api/v1/checkout-requests,
   * chỉ MANAGER/ADMIN gọi được).
   */
  createForTenant: async (body: {
    contractId: number;
    expectedMoveOutDate: string;
    reason: string;
  }): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>('/api/v1/checkout-requests', body);
    return data;
  },

  // ===== Biên bản kiểm tra phòng =====

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
    return data;
  },

  // ===== Quyết toán =====

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
    return data;
  },

  /** Ghi nhận đã hoàn cọc — app chỉ lưu chứng từ, tiền chuyển tay ngoài hệ thống. */
  refund: async (id: number, body: RefundBody): Promise<CheckoutRequestDto> => {
    const { data } = await realApiClient.post<CheckoutRequestDto>(
      `/api/v1/checkout-requests/${id}/refund`, body,
    );
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
    return data;
  },
};
