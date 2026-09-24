import realApiClient from '@/services/core/realApiClient';

/**
 * TIỀN CỌC của các nhà manager đang quản.
 *
 * Cọc KHÔNG phải hoá đơn: nó là field của chính hợp đồng (`TenantContract.deposit`,
 * `paymentStatus`, `depositPaidAt`, `depositMethod`), thu 1 lần lúc đón khách. Vì vậy
 * `/api/v1/manager/invoices` và `/api/v1/manager/payments` đều không trả về nó.
 *
 * BE: `GET /api/v1/manager/deposits` (ManagerBillingController, MANAGER + ADMIN) —
 * lọc sẵn `p.operationManagerId = người gọi` và sort `COALESCE(paidAt,
 * depositCashManagerConfirmedAt) DESC`, nên FE không cần lọc/sắp lại.
 *
 * DTO của BE (`ManagerDepositDto`) KHÔNG có số tiền cọc — chính sách ẩn tiền thuê
 * khỏi manager được áp ngay ở tầng BE (xem @/constants/managerVisibility).
 */
export interface ManagerDeposit {
  contractId: number;
  contractCode: string;
  tenantName: string;
  roomNumber?: string;
  propertyName: string;
  tenantPhone?: string;
  depositMonths?: number;
  /** PaymentStatus của BE: PENDING | PAID | FAILED | CANCELLED. */
  status: string;
  /** PAYOS | CASH | undefined (chưa thu). */
  method?: string;
  paidAt?: string;
  /** ContractStatus của BE: DRAFT | AWAITING_ONBOARD | AWAITING_PAYMENT | AWAITING_CONFIRM | PENDING | ACTIVE | EXPIRED | TERMINATED. */
  contractStatus: string;
  moveInDate?: string;
}

/** Khớp `ManagerDepositDto` của BE. */
interface ManagerDepositDto {
  contractId: number;
  contractCode?: string | null;
  propertyName?: string | null;
  roomNumber?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  depositMonths?: number | null;
  paymentStatus?: string | null;
  depositMethod?: string | null;
  depositPaidAt?: string | null;
  contractStatus?: string | null;
  moveInDate?: string | null;
}

interface SpringPage<T> { content: T[] }
const unwrap = <T,>(d: SpringPage<T> | T[] | null | undefined): T[] =>
  Array.isArray(d) ? d : d?.content ?? [];

const toDeposit = (d: ManagerDepositDto): ManagerDeposit => ({
  contractId: d.contractId,
  contractCode: d.contractCode || `HĐ #${d.contractId}`,
  tenantName: d.tenantName || '—',
  roomNumber: d.roomNumber ?? undefined,
  propertyName: d.propertyName || '—',
  tenantPhone: d.tenantPhone ?? undefined,
  depositMonths: d.depositMonths ?? undefined,
  status: d.paymentStatus || 'PENDING',
  method: d.depositMethod ?? undefined,
  paidAt: d.depositPaidAt ?? undefined,
  contractStatus: (d.contractStatus || '').toUpperCase(),
  moveInDate: d.moveInDate ?? undefined,
});

export const managerDepositService = {
  /**
   * Cọc của mọi hợp đồng trong phạm vi quản lý, mới thu lên đầu.
   * `size` lớn vì màn hình hiện hết trong một danh sách, không phân trang.
   */
  list: async (status?: string): Promise<ManagerDeposit[]> => {
    const { data } = await realApiClient.get<SpringPage<ManagerDepositDto> | ManagerDepositDto[]>(
      '/api/v1/manager/deposits',
      { params: { status, size: 200 } },
    );
    // Hợp đồng nháp chưa phát sinh nghĩa vụ thu cọc.
    // BE 24/09/2026: chưa tới AWAITING_PAYMENT (DRAFT, AWAITING_ONBOARD) thì chưa có nghĩa vụ thu cọc.
    return unwrap(data).map(toDeposit)
      .filter(d => d.contractStatus !== 'DRAFT' && d.contractStatus !== 'AWAITING_ONBOARD');
  },
};
