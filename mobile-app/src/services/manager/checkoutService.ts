import realApiClient from '@/services/core/realApiClient';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';

/**
 * Manager/Admin xử lý YÊU CẦU TRẢ PHÒNG của tenant — BE CheckoutRequestController
 * /api/v1/checkout-requests. Luồng: PENDING → approve (APPROVED) / reject (REJECTED)
 * → complete (COMPLETED — BE tự terminate HĐ + giải phóng phòng/thiết bị).
 */
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

  /** Hoàn tất trả phòng — BE terminate HĐ + phòng về AVAILABLE + restore thiết bị. */
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
