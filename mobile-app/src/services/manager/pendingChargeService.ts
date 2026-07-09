import realApiClient from '@/services/core/realApiClient';
import type { TenantInvoice } from '@/services/tenant/billingService';

/**
 * Khoản chờ thu của khách (tenant_pending_charges) — sinh ra khi khách nghiệm thu
 * ticket bảo trì có costPaidBy=TENANT (khách làm hư). Manager phát hành hóa đơn
 * MAINTENANCE từ các khoản này (BE commit 00e50a6, verify PASS 08/07).
 */
export interface PendingCharge {
  id: number;
  tenantContractId: number;
  invoiceId?: number | null;   // null khi PENDING; set khi đã INVOICED
  amount: number;
  category: string;            // "MAINTENANCE"
  note?: string;               // "Chi phí bảo trì ticket #15: ..." — parse #id để link ticket
  status: 'PENDING' | 'INVOICED' | string;
  createdAt: string;
}

export interface IssueInvoiceBody {
  chargeIds: number[];
  note?: string;
  dueDate?: string;            // yyyy-MM-dd, BE mặc định cuối tháng hiện tại
}

export const realPendingChargeService = {
  /** GET /api/v1/manager/pending-charges — scope theo property manager quản. */
  list: async (params?: { propertyId?: number; status?: string }): Promise<PendingCharge[]> => {
    const { data } = await realApiClient.get<PendingCharge[]>('/api/v1/manager/pending-charges', { params });
    return data ?? [];
  },

  /**
   * POST /api/v1/manager/pending-charges/issue-invoice?contractId= — gom các charge
   * PENDING thành 1 hóa đơn type MAINTENANCE. Charge đã INVOICED sẽ bị BE chặn (422).
   */
  issueInvoice: async (contractId: number, body: IssueInvoiceBody): Promise<TenantInvoice> => {
    const { data } = await realApiClient.post<TenantInvoice>(
      `/api/v1/manager/pending-charges/issue-invoice?contractId=${contractId}`,
      body,
    );
    return data;
  },
};
