import api from './api';
import type { Page } from '../types/api.types';
import type { PlatformBill, PlatformBillStatus } from '../types';

// =============================================================================
// Admin (System Admin) service — các API giám sát toàn hệ thống.
// Lưu ý: endpoint /api/v1/admin/invoices CHƯA có ở BE (xem doc/BE-NEED-admin-invoices).
// FE đã nối sẵn: BE làm xong đúng contract dưới đây là trang Thanh toán chạy thật ngay.
// =============================================================================

const ADMIN = '/api/v1/admin';

// DTO 1 hóa đơn theo contract đã thống nhất với BE (status UPPER).
export interface AdminInvoiceDto {
  id: string;
  hostId?: string;
  hostName: string;
  buildingName: string;
  tenantName: string;
  amount: number;
  paymentMethod: string;            // qr | bank_transfer | card | cash ...
  dueDate: string;                  // YYYY-MM-DD
  status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'PENDING';
}

export interface AdminInvoiceQuery {
  month?: string;                   // YYYY-MM
  hostId?: string;
  status?: PlatformBillStatus;      // FE gửi chữ thường, map sang UPPER cho BE
  keyword?: string;
  page?: number;
  size?: number;
}

// BE trả status UPPER → FE dùng chữ thường (khớp PlatformBill / billStatusMap).
const STATUS_FROM_API: Record<string, PlatformBillStatus> = {
  PAID: 'paid', UNPAID: 'unpaid', OVERDUE: 'overdue', PENDING: 'pending',
};
const STATUS_TO_API: Record<PlatformBillStatus, string> = {
  paid: 'PAID', unpaid: 'UNPAID', overdue: 'OVERDUE', pending: 'PENDING',
};

// Map DTO của BE → PlatformBill mà UI trang Thanh toán đang dùng.
const dtoToBill = (d: AdminInvoiceDto): PlatformBill => ({
  id: d.id,
  hostName: d.hostName,
  buildingName: d.buildingName,
  tenantName: d.tenantName,
  amount: d.amount,
  status: STATUS_FROM_API[d.status] ?? 'unpaid',
  paymentMethod: d.paymentMethod as PlatformBill['paymentMethod'],
  issuedAt: d.dueDate,
  dueDate: d.dueDate,
});

export const adminService = {
  /**
   * Lấy toàn bộ hóa đơn của mọi host trong hệ thống (read-only).
   * Trả về mảng PlatformBill đã map sẵn cho UI. Lọc month/host/status để BE
   * thu hẹp; còn lại UI vẫn lọc thêm phía client (search, dropdown) như cũ.
   */
  listInvoices: async (params: AdminInvoiceQuery = {}): Promise<PlatformBill[]> => {
    const query = {
      ...params,
      status: params.status ? STATUS_TO_API[params.status] : undefined,
      size: params.size ?? 500,
    };
    const res = await api.get<unknown, Page<AdminInvoiceDto> | AdminInvoiceDto[]>(
      `${ADMIN}/invoices`, { params: query, skipErrorToast: true } as object,
    );
    const list = Array.isArray(res) ? res : res.content;
    return list.map(dtoToBill);
  },
};
