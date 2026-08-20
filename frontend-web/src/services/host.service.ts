import api from './api';
import type { Page } from '@/types/api.types';
import type { Expense, ExpenseCategory } from '@/types/expense';

// =============================================================================
// Host Portal service — nối API BE (/api/v1/host).
// Mỗi hàm trả về Promise<dữ liệu>; api interceptor đã bóc `response.data`.
// =============================================================================

const DASHBOARD = '/api/v1/host/dashboard';
const FINANCE = '/api/v1/host/finance';
const EXPENSES = '/api/v1/host/expenses';
const LEASES = '/api/v1/host/master-leases';
const REPORTS = '/api/v1/host/reports';
const CONTRACTS = '/api/v1/host/contracts';
const NOTIFICATIONS = '/api/v1/host/notifications';

// ── Mapper category: FE dùng chữ thường, BE dùng UPPER ───────────────────────
const CATEGORY_TO_API: Record<ExpenseCategory, string> = {
  lease: 'LEASE', maintenance: 'MAINTENANCE', equipment: 'EQUIPMENT',
  management: 'MANAGEMENT', utility: 'UTILITY', other: 'OTHER',
};
const CATEGORY_FROM_API: Record<string, ExpenseCategory> = {
  LEASE: 'lease', MAINTENANCE: 'maintenance', EQUIPMENT: 'equipment',
  MANAGEMENT: 'management', UTILITY: 'utility', OTHER: 'other',
};

// ── DTO ──────────────────────────────────────────────────────────────────────
export interface DashboardSummary {
  month: string;
  finance: { revenue: number; expense: number; netProfit: number;
    revenueChangePct?: number; expenseChangePct?: number; netProfitChangePct?: number };
  occupancy: { totalRooms: number; occupiedRooms: number; vacantRooms: number;
    maintenanceRooms: number; occupancyRate: number };
  counts: { pendingContracts: number; openMaintenance: number; activeManagers: number;
    expiringMasterLeases: number; outstandingInvoices: number; outstandingAmount: number };
}

export interface CashflowPoint { month: string; revenue: number; expense: number; }
export interface ExpenseBreakdownItem { category: string; amount: number; }

export interface PropertyPnlRow {
  propertyId: string; propertyName: string;
  revenue: number; leaseCost: number; otherExpense: number;
  totalExpense?: number; net: number; marginPct?: number;
}
export interface PropertyPnlResponse {
  month: string;
  rows: PropertyPnlRow[];
  totals?: { revenue: number; leaseCost: number; otherExpense: number; totalExpense: number; net: number; marginPct?: number };
}

export interface InvoiceDto {
  id: string; tenantName: string; roomCode: string; propertyName: string;
  amount: number; dueDate: string; status: 'PAID' | 'UNPAID' | 'OVERDUE';
}

export interface ReceivablesAging {
  buckets: { label: string; amount: number; count: number }[];
  topDebtors: { tenantName: string; propertyName: string; roomCode: string; amount: number; overdueDays: number }[];
}

export interface DepositItem {
  tenantName: string; propertyName: string; roomCode: string;
  amount: number; heldSince: string;
  /**
   * Trạng thái cọc do BE xét (DepositLedgerStatusResolver, 17/08/2026):
   * NOT_COLLECTED chưa thu · HELD đang giữ · REFUNDED đã hoàn · FORFEITED khấu trừ.
   * NOT_COLLECTED KHÔNG nằm trong `totalHeld`.
   */
  status: 'NOT_COLLECTED' | 'HELD' | 'REFUNDED' | 'FORFEITED';
  /** BE có trả — dùng để ghép khoản cọc vào đúng hợp đồng ở màn chi tiết HĐ. */
  contractId?: number; contractCode?: string; endDate?: string;
  /**
   * Hồ sơ trả phòng của HĐ này — `null` nghĩa là khách vẫn đang ở bình thường.
   *
   * Đây là tín hiệu phân biệt hai tình huống rất khác nhau: cọc của khách ĐANG THUÊ
   * (không được đụng) và cọc của khách ĐANG TRẢ PHÒNG (chờ hoàn).
   */
  checkoutRequestId?: number;
  /** Số cọc sẽ hoàn theo bảng quyết toán. Null = chưa có bảng quyết toán. */
  refundAmount?: number;
  refundedAt?: string;
  /**
   * Tài khoản khách yêu cầu hoàn cọc về (BE tách khỏi free-text `note` — 20/08/2026).
   * Hợp đồng cũ không có, phần này để trống và host vẫn đọc ghi chú như trước.
   */
  refundBankName?: string;
  refundBankAccount?: string;
  refundAccountHolder?: string;
  /** Khách đã trả hết phí cuối kỳ chưa — cọc chỉ được hoàn sau khi trả đủ. */
  chargesSettled?: boolean;
  /**
   * Ghi chú của phiếu trả phòng — phương án DỰ PHÒNG cho phiếu tạo trước 20/08/2026,
   * khi TK hoàn cọc còn nằm lẫn trong free-text vì BE chưa có field riêng.
   *
   * Chỉ hiện nguyên văn cho host đọc, KHÔNG parse ngược: bóc chuỗi tự do rồi bày ra như
   * số tài khoản đã xác thực thì nguy hiểm hơn là để host tự đọc.
   */
  checkoutNote?: string;
  /**
   * Khách đã xác nhận nhận đủ chưa (BE thêm 20/08/2026).
   *
   * `refundedAt` là lời của HOST, `refundConfirmedAt` là lời của KHÁCH. Chỉ có cái đầu thì
   * khoản đó CHƯA xong — không được gộp vào tổng đã hoàn.
   */
  refundConfirmedAt?: string;
  /** Khách báo chưa nhận được tiền — hồ sơ đang tranh chấp, chờ admin xử lý. */
  refundDisputedAt?: string;
  refundDisputeReason?: string;
  /** Admin đã kết luận khiếu nại chưa — BE giữ nguyên `refundDisputedAt` nên cần cờ này. */
  refundDisputeResolvedAt?: string;
  refundDisputeOutcome?: string;
  /** Còn nợ bao nhiêu — để hiện lý do khoá nút thay vì chỉ khoá. */
  outstandingAmount?: number;
}
export interface DepositsResponse { totalHeld: number; items: DepositItem[]; }

/**
 * Master lease (Host thuê lại nhà của chủ nhà gốc) — `GET /host/master-leases`.
 *
 * ⚠️ BE đã BỎ 4 field `ownerPhone` / `deposit` / `paymentDay` / `escalationPct` (19/08/2026):
 * chúng từng được hard-code 0/1/null chứ không đọc từ DB, vì entity `InboundContract` không
 * có mấy cột đó. Trả hằng số ra ngoài nguy hiểm hơn là không trả — `deposit: 0` khiến người
 * đọc tin là "đã xác nhận không có cọc". Đừng thêm lại nếu chưa có cột thật.
 *
 * Đổi lại BE mở thêm `contractCode`, `contractScanUrl`, `totalRentAmount` — đều là dữ liệu thật.
 */
export interface MasterLease {
  id: string;
  propertyId: string;
  ownerName: string;
  /** Mã HĐ để đối chiếu với hợp đồng giấy. */
  contractCode?: string;
  /** File scan hợp đồng gốc ký với chủ nhà. */
  contractScanUrl?: string;
  /** BE tính = totalRentAmount ÷ số tháng. */
  monthlyRent: number;
  /** Tổng tiền thuê cả kỳ — dùng số này thay vì nhân ngược monthlyRent (tránh sai số làm tròn). */
  totalRentAmount?: number;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'TERMINATED';
}

// ── Reports ──────────────────────────────────────────────────────────────────
export interface FinancialSummaryRow {
  month: string; revenue: number; expense: number; netProfit: number;
  marginPct: number; occupancyRate: number;
}
export interface ManagerPerformanceRow {
  managerId: string; managerName: string; phone: string;
  propertyCount: number; activeTenants: number; occupancyRate: number;
  resolvedMaintenance: number; openMaintenance: number;
}
export interface PropertyPerformanceRow {
  propertyId: string; propertyName: string; address: string;
  occupancyRate: number; occupiedRooms: number; totalRooms: number;
  monthlyRevenue: number; openMaintenance: number;
}

// ── Contracts ────────────────────────────────────────────────────────────────
export interface HostContractDto {
  id: string; propertyId?: number; code: string;
  // BE (HostPortalServiceImpl.toContractDto) chỉ lấy tên từ tenant.user, KHÔNG fallback
  // sang draftTenantName — HĐ đã chấm dứt bị gỡ tenant_user_id nên trả về null.
  lesseeName: string | null; tenantPhone?: string; tenantCccd?: string;
  propertyName: string;
  roomCode?: string; lessorName?: string;
  rentAmount: number; deposit?: number;
  moveInDate?: string; startDate: string; endDate?: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'DRAFT';
  // Trạng thái duyệt giá (Case 2 — manager gửi Host duyệt). Optional: đã đề nghị BE
  // expose trong API-ProcessGaps-BE-TODO.md; chưa có thì FE fallback theo status PENDING.
  priceApprovalStatus?: 'PENDING_PRICE_APPROVAL' | 'APPROVED_AWAITING_DEPOSIT' | 'PRICE_REJECTED';
  priceRejectReason?: string;
  // Biên bản bàn giao thiết bị — HĐ cũ là JSON string, HĐ mới là text BE sinh
  // ("Giường (Tốt) x1, ..."); FE parse phòng thủ cả 2 (snapshotToLines).
  equipmentSnapshot?: string;
}

// ── Notifications ────────────────────────────────────────────────────────────
export interface HostNotificationDto {
  id: string; type: string; title: string; message: string;
  isRead: boolean; priority?: string; createdAt: string;
}

// raw expense từ BE (category UPPER)
interface ExpenseDto {
  id: string; propertyId: string; propertyName: string;
  category: string; amount: number; month: string; note?: string; createdAt: string;
}
const dtoToExpense = (d: ExpenseDto): Expense => ({
  ...d, category: CATEGORY_FROM_API[d.category] ?? 'other',
});

// ── Service ──────────────────────────────────────────────────────────────────
export const hostService = {
  // Dashboard
  getDashboardSummary: (month: string): Promise<DashboardSummary> =>
    api.get(`${DASHBOARD}/summary`, { params: { month } }),

  // Finance
  getCashflow: (from: string, to: string): Promise<{ series: CashflowPoint[] }> =>
    api.get(`${FINANCE}/cashflow`, { params: { from, to } }),
  getExpenseBreakdown: (month: string): Promise<{ month: string; breakdown: ExpenseBreakdownItem[] }> =>
    api.get(`${FINANCE}/expense-breakdown`, { params: { month } }),
  getPropertyPnl: (month: string): Promise<PropertyPnlResponse> =>
    api.get(`${FINANCE}/property-pnl`, { params: { month } }),
  getReceivablesAging: (): Promise<ReceivablesAging> =>
    api.get(`${FINANCE}/receivables-aging`),
  getDeposits: (status?: string): Promise<DepositsResponse> =>
    api.get(`${FINANCE}/deposits`, { params: status ? { status } : {} }),

  /**
   * Đánh dấu ĐÃ HOÀN CỌC cho khách — host là người chuyển tiền từ 18/08/2026.
   *
   * ⚠️ BE CHƯA CÓ ENDPOINT NÀY. Từ 18/08/2026 app quản lý bỏ bước "Ghi nhận hoàn cọc"
   * (form đó buộc phải hiện tiền cọc — thứ manager không được biết, xem
   * `mobile-app/src/constants/managerVisibility.ts`), nên không còn ai gọi
   * `POST /api/v1/checkout-requests/{id}/refund` nữa và cọc nằm mãi ở "Đang giữ".
   *
   * Không tái dùng được endpoint cũ vì nó nhận **checkoutRequestId**, mà sổ cọc chỉ có
   * `contractId` — host cũng không có endpoint nào liệt kê checkout-request để tra ra id
   * (và endpoint kia là `hasAnyRole('MANAGER','ADMIN')` nên host gọi cũng 403).
   *
   * Vì vậy gọi theo endpoint ĐỀ NGHỊ trong
   * `BE-BUG-checkout-disputed-khong-sua-duoc-bien-ban-2026-08-18.md` phần 2. Chừng nào
   * BE chưa làm thì trả 404/403 — màn Sổ cọc bắt lỗi đó và nói rõ, xem `DepositLedger`.
   */
  markDepositRefunded: (contractId: number, body: {
    method: 'BANK_TRANSFER' | 'CASH';
    paidAt: string;        // yyyy-MM-dd
    proofUrl?: string;
    note?: string;
  }): Promise<void> =>
    api.post(`${FINANCE}/deposits/${contractId}/refund`, body),
  getInvoices: (params: { month?: string; status?: string; page?: number; size?: number } = {}): Promise<Page<InvoiceDto>> =>
    api.get('/api/v1/host/invoices', { params }),

  // Expenses (CRUD) — map category 2 chiều, trả/nhận kiểu FE (chữ thường)
  listExpenses: async (params: { propertyId?: string; category?: ExpenseCategory; month?: string; page?: number; size?: number } = {}): Promise<Expense[]> => {
    const query = { ...params, category: params.category ? CATEGORY_TO_API[params.category] : undefined };
    const res = await api.get<unknown, Page<ExpenseDto> | ExpenseDto[]>(EXPENSES, { params: query });
    const list = Array.isArray(res) ? res : res.content;
    return list.map(dtoToExpense);
  },
  /**
   * Như listExpenses nhưng giữ nguyên thông tin phân trang (totalElements) —
   * cần cho sổ chi phí ở trang Quản lý tài chính. BE đã ORDER BY createdAt DESC
   * nên trang 0 luôn là các khoản mới nhất.
   */
  listExpensesPage: async (params: { propertyId?: string; category?: ExpenseCategory; month?: string; page?: number; size?: number } = {}): Promise<Page<Expense>> => {
    const query = { ...params, category: params.category ? CATEGORY_TO_API[params.category] : undefined };
    const res = await api.get<unknown, Page<ExpenseDto> | ExpenseDto[]>(EXPENSES, { params: query });
    if (Array.isArray(res)) {
      const content = res.map(dtoToExpense);
      return { content, totalElements: content.length, totalPages: 1, number: 0, size: content.length } as Page<Expense>;
    }
    return { ...res, content: (res.content ?? []).map(dtoToExpense) };
  },
  createExpense: async (input: Omit<Expense, 'id' | 'createdAt' | 'propertyName'> & { propertyName?: string }): Promise<Expense> => {
    const body = { ...input, category: CATEGORY_TO_API[input.category] };
    const res = await api.post<unknown, ExpenseDto>(EXPENSES, body);
    return dtoToExpense(res);
  },
  updateExpense: async (id: string, input: Partial<Omit<Expense, 'id' | 'createdAt'>>): Promise<Expense> => {
    const body = { ...input, category: input.category ? CATEGORY_TO_API[input.category] : undefined };
    const res = await api.put<unknown, ExpenseDto>(`${EXPENSES}/${id}`, body);
    return dtoToExpense(res);
  },
  deleteExpense: (id: string): Promise<void> => api.delete(`${EXPENSES}/${id}`),

  // Reports
  getFinancialSummary: (from: string, to: string): Promise<FinancialSummaryRow[]> =>
    api.get(`${REPORTS}/financial-summary`, { params: { from, to } }),
  getManagerPerformance: (month: string): Promise<ManagerPerformanceRow[]> =>
    api.get(`${REPORTS}/manager-performance`, { params: { month } }),
  getPropertyPerformance: (month: string): Promise<PropertyPerformanceRow[]> =>
    api.get(`${REPORTS}/property-performance`, { params: { month } }),

  // Contracts (host duyệt HĐ tenant)
  listContracts: (params: { propertyId?: number; status?: string; page?: number; size?: number } = {}): Promise<Page<HostContractDto>> =>
    api.get(CONTRACTS, { params }),
  approveContract: (id: string): Promise<HostContractDto> => api.put(`${CONTRACTS}/${id}/approve`),
  rejectContract: (id: string, reason: string): Promise<HostContractDto> =>
    api.put(`${CONTRACTS}/${id}/reject`, { reason }),

  // Notifications
  listNotifications: (params: { unreadOnly?: boolean; page?: number; size?: number } = {}): Promise<Page<HostNotificationDto>> =>
    api.get(NOTIFICATIONS, { params }),
  markNotificationRead: (id: string): Promise<void> => api.put(`${NOTIFICATIONS}/${id}/read`),
  markAllNotificationsRead: (): Promise<void> => api.put(`${NOTIFICATIONS}/read-all`),
  /**
   * Số thông báo chưa đọc (cho badge sidebar/header).
   * skipErrorToast: badge là thông tin phụ chạy nền — BE lỗi thì giữ số cũ,
   * không bắn toast đỏ che màn hình (xem docs/BE-HANDOFF-host-notifications-500).
   */
  getUnreadCount: async (): Promise<number> => {
    const page = await api.get<unknown, Page<HostNotificationDto>>(NOTIFICATIONS, {
      params: { unreadOnly: true, page: 0, size: 1 },
      skipErrorToast: true,
    } as never);
    return page?.totalElements ?? 0;
  },

  // Master Lease
  listMasterLeases: (params: { status?: string; propertyId?: string } = {}): Promise<MasterLease[]> =>
    api.get(LEASES, { params }),
  getMasterLease: (id: string): Promise<MasterLease> => api.get(`${LEASES}/${id}`),
  createMasterLease: (input: Omit<MasterLease, 'id' | 'status'>): Promise<MasterLease> =>
    api.post(LEASES, input),
  updateMasterLease: (id: string, input: Partial<MasterLease>): Promise<MasterLease> =>
    api.put(`${LEASES}/${id}`, input),
  terminateMasterLease: (id: string): Promise<MasterLease> => api.post(`${LEASES}/${id}/terminate`),
};
