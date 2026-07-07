import api from './api';
import type { Page } from '@/types/api.types';
import type { PlatformBillStatus } from '@/types';

// =============================================================================
// Admin (System Admin) service — các API giám sát toàn hệ thống.
// BE: AdminBillingController — GET /api/v1/admin/invoices, GET /api/v1/admin/hosts
// (đã khớp doc BE-NEED-admin-invoices: bỏ paymentMethod, status chỉ PAID/UNPAID/OVERDUE).
// =============================================================================

const ADMIN = '/api/v1/admin';

// DTO 1 hóa đơn (ảo, tính theo hợp đồng thuê/tháng) — khớp AdminInvoiceDto của BE.
export interface AdminInvoiceDto {
  id: string;
  hostId?: string;
  hostName: string;
  buildingName: string;
  tenantName: string;
  roomCode?: string;
  amount: number;
  dueDate: string;                  // YYYY-MM-DD
  status: string;                   // PAID | UNPAID | OVERDUE
}

// Host cho dropdown lọc — khớp AdminHostDto của BE ({ id, name }).
export interface AdminHost {
  id: string;
  name: string;
}

// 1 dòng hóa đơn đã chuẩn hoá cho UI (status chữ thường như PlatformBillStatus).
export interface AdminInvoiceRow {
  id: string;
  hostId?: string;
  hostName: string;
  buildingName: string;
  roomCode?: string;
  tenantName: string;
  amount: number;
  dueDate: string;                  // YYYY-MM-DD
  status: PlatformBillStatus;
}

export interface AdminInvoiceQuery {
  month?: string;                   // YYYY-MM
  hostId?: string;
  status?: PlatformBillStatus;      // FE gửi chữ thường, map sang UPPER cho BE
  keyword?: string;
  page?: number;
  size?: number;
}

// BE trả status UPPER → FE dùng chữ thường (khớp billStatusMap).
const STATUS_FROM_API: Record<string, PlatformBillStatus> = {
  PAID: 'paid', UNPAID: 'unpaid', OVERDUE: 'overdue', PENDING: 'pending',
};
const STATUS_TO_API: Record<PlatformBillStatus, string> = {
  paid: 'PAID', unpaid: 'UNPAID', overdue: 'OVERDUE', pending: 'PENDING',
};

const dtoToRow = (d: AdminInvoiceDto): AdminInvoiceRow => ({
  id: d.id,
  hostId: d.hostId,
  hostName: d.hostName,
  buildingName: d.buildingName,
  roomCode: d.roomCode,
  tenantName: d.tenantName,
  amount: Number(d.amount) || 0,
  dueDate: d.dueDate,
  status: STATUS_FROM_API[d.status] ?? 'unpaid',
});

export const adminService = {
  /**
   * Lấy toàn bộ hóa đơn của mọi host trong hệ thống (read-only).
   * Lọc month/host/status/keyword phía server; trả list đã chuẩn hoá cho UI.
   */
  listInvoices: async (params: AdminInvoiceQuery = {}): Promise<AdminInvoiceRow[]> => {
    const query = {
      ...params,
      status: params.status ? STATUS_TO_API[params.status] : undefined,
      size: params.size ?? 500,
    };
    const res = await api.get<unknown, Page<AdminInvoiceDto> | AdminInvoiceDto[]>(
      `${ADMIN}/invoices`, { params: query, skipErrorToast: true } as object,
    );
    const list = Array.isArray(res) ? res : res.content;
    return list.map(dtoToRow);
  },

  /** Danh sách host (User role OWNER) để đổ vào dropdown lọc. */
  getHosts: async (): Promise<AdminHost[]> => {
    const res = await api.get<unknown, AdminHost[]>(
      `${ADMIN}/hosts`, { skipErrorToast: true } as object,
    );
    return Array.isArray(res) ? res : [];
  },
};
