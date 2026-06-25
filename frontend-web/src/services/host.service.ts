import api from './api';
import type { Page } from '../types/api.types';
import type { Expense, ExpenseCategory } from '../utils/expenseStore';

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
  amount: number; heldSince: string; status: 'HELD' | 'REFUNDED' | 'FORFEITED';
}
export interface DepositsResponse { totalHeld: number; items: DepositItem[]; }

export interface MasterLease {
  id: string; propertyId: string; ownerName: string; ownerPhone?: string;
  monthlyRent: number; deposit: number; paymentDay: number;
  startDate: string; endDate: string; escalationPct?: number;
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
  id: string; code: string; lesseeName: string; propertyName: string;
  roomCode?: string; lessorName?: string; rentAmount: number;
  startDate: string; endDate?: string;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
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
  getInvoices: (params: { month?: string; status?: string; page?: number; size?: number } = {}): Promise<Page<InvoiceDto>> =>
    api.get('/api/v1/host/invoices', { params }),

  // Expenses (CRUD) — map category 2 chiều, trả/nhận kiểu FE (chữ thường)
  listExpenses: async (params: { propertyId?: string; category?: ExpenseCategory; month?: string; page?: number; size?: number } = {}): Promise<Expense[]> => {
    const query = { ...params, category: params.category ? CATEGORY_TO_API[params.category] : undefined };
    const res = await api.get<unknown, Page<ExpenseDto> | ExpenseDto[]>(EXPENSES, { params: query });
    const list = Array.isArray(res) ? res : res.content;
    return list.map(dtoToExpense);
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
  listContracts: (params: { status?: string; page?: number; size?: number } = {}): Promise<Page<HostContractDto>> =>
    api.get(CONTRACTS, { params }),
  approveContract: (id: string): Promise<HostContractDto> => api.put(`${CONTRACTS}/${id}/approve`),
  rejectContract: (id: string, reason: string): Promise<HostContractDto> =>
    api.put(`${CONTRACTS}/${id}/reject`, { reason }),

  // Notifications
  listNotifications: (params: { unreadOnly?: boolean; page?: number; size?: number } = {}): Promise<Page<HostNotificationDto>> =>
    api.get(NOTIFICATIONS, { params }),
  markNotificationRead: (id: string): Promise<void> => api.put(`${NOTIFICATIONS}/${id}/read`),
  markAllNotificationsRead: (): Promise<void> => api.put(`${NOTIFICATIONS}/read-all`),
  /** Số thông báo chưa đọc (cho badge sidebar/header). */
  getUnreadCount: async (): Promise<number> => {
    const page = await api.get<unknown, Page<HostNotificationDto>>(NOTIFICATIONS, {
      params: { unreadOnly: true, page: 0, size: 1 },
    });
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
