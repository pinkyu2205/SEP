import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';

/**
 * TIỀN CỌC của các nhà manager đang quản.
 *
 * Cọc KHÔNG phải hoá đơn: nó là field của chính hợp đồng (`TenantContract.deposit`,
 * `paymentStatus`, `depositPaidAt`, `depositMethod`), thu 1 lần lúc đón khách. Vì vậy
 * `/api/v1/manager/invoices` và `/api/v1/manager/payments` đều KHÔNG trả về nó.
 *
 * BE chưa có endpoint "cọc của các nhà tôi quản" nên phải đi vòng: lấy danh sách nhà
 * trong phạm vi rồi hỏi hợp đồng từng nhà (N+1 lượt gọi — chấp nhận được vì mỗi manager
 * chỉ quản vài nhà). Xem docs/BE-NEED-manager-money-visibility-2026-08-07.md mục 4.
 *
 * ⚠️ KHÔNG trả số tiền cọc — manager không được thấy (xem @/constants/managerVisibility).
 */
export interface ManagerDeposit {
  contractId: number;
  contractCode: string;
  tenantName: string;
  roomNumber?: string;
  propertyName: string;
  /** PaymentStatus của BE: PENDING | PAID | FAILED | CANCELLED. */
  status: string;
  /** PAYOS | CASH | undefined (chưa thu). */
  method?: string;
  paidAt?: string;
  /** ContractStatus của BE: PENDING | ACTIVE | EXPIRED | TERMINATED. */
  contractStatus: string;
  moveInDate?: string;
}

export const managerDepositService = {
  /** Cọc của mọi hợp đồng (trừ nháp) trong phạm vi quản lý, mới thu lên đầu. */
  list: async (): Promise<ManagerDeposit[]> => {
    const props = await managerPropertyService.getScopedProperties().catch(() => []);
    const perProperty = await Promise.all(
      props.map(p =>
        realTenantService.listByProperty(p.id)
          .then(cs => cs.map((c: TenantContractResponse) => ({ c, propertyName: p.propertyName })))
          .catch(() => [] as { c: TenantContractResponse; propertyName: string }[]),
      ),
    );

    return perProperty
      .flat()
      // Hợp đồng nháp chưa phát sinh nghĩa vụ thu cọc.
      .filter(({ c }) => (c.status || '').toUpperCase() !== 'DRAFT' && (c.deposit ?? 0) > 0)
      .map(({ c, propertyName }) => ({
        contractId: c.id,
        contractCode: c.contractCode || `HĐ #${c.id}`,
        tenantName: c.tenantFullName || '—',
        roomNumber: c.roomNumber ?? undefined,
        propertyName,
        status: c.paymentStatus || 'PENDING',
        method: c.depositMethod ?? undefined,
        paidAt: c.depositPaidAt ?? undefined,
        contractStatus: (c.status || '').toUpperCase(),
        moveInDate: c.moveInDate || c.startDate || undefined,
      }))
      // Mới thu lên đầu; chưa thu (không có paidAt) xuống cuối.
      .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  },
};
