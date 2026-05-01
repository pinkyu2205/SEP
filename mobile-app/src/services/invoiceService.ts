import apiClient from './apiClient';
import { API_CONFIG } from '../constants/api';
import { Invoice, ApiResponse, PaginatedResponse } from '../types';

/**
 * Invoice Service - Quản lý hóa đơn.
 */

export const invoiceService = {
  /**
   * Lấy danh sách hóa đơn
   */
  getInvoices: async (page = 1, pageSize = 10): Promise<PaginatedResponse<Invoice>> => {
    const { data } = await apiClient.get<PaginatedResponse<Invoice>>(
      API_CONFIG.ENDPOINTS.INVOICES,
      { params: { page, pageSize } }
    );
    return data;
  },

  /**
   * Lấy chi tiết hóa đơn
   */
  getInvoiceDetail: async (id: string): Promise<Invoice> => {
    const { data } = await apiClient.get<ApiResponse<Invoice>>(
      API_CONFIG.ENDPOINTS.INVOICE_DETAIL(id)
    );
    return data.data;
  },

  /**
   * Thanh toán hóa đơn (lấy thông tin QR code)
   */
  payInvoice: async (id: string): Promise<{ qrCodeUrl: string; bankInfo: Record<string, string> }> => {
    const { data } = await apiClient.post<ApiResponse<{ qrCodeUrl: string; bankInfo: Record<string, string> }>>(
      API_CONFIG.ENDPOINTS.INVOICE_PAY(id)
    );
    return data.data;
  },
};
