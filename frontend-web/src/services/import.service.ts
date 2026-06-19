import type { BulkImportResponse, BulkImportError, PropertyPurgeResponse } from '../types/api.types';

const ENDPOINT = '/api/v1/import/onboarding-excel';

/**
 * Lỗi đã chuẩn hoá khi import Excel thất bại.
 * - `errors`  : bảng lỗi validate (HTTP 400 "Bulk import validation failed")
 * - `message` : message tổng quát (422 thiếu sheet/cột, 403, 400 runtime...)
 */
export interface BulkImportErrorResult {
  status?: number;
  message: string;
  errors: BulkImportError[];
}

/**
 * Dùng `fetch` thay vì axios instance vì:
 *  1. axios instance đặt mặc định Content-Type=application/json → sẽ JSON-hoá FormData làm hỏng file.
 *  2. fetch để trình duyệt tự set `multipart/form-data; boundary=...` chuẩn.
 *  3. Tránh timeout 10s của axios instance — import thật có thể chạy lâu.
 */
export const importService = {
  /**
   * POST /api/v1/import/onboarding-excel?dryRun=...
   * @param file   File .xlsx / .xls
   * @param dryRun true = chỉ validate (không ghi DB); false = import thật
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  async importOnboardingExcel(file: File, dryRun: boolean): Promise<BulkImportResponse> {
    const form = new FormData();
    form.append('file', file);

    const token = localStorage.getItem('access_token');

    const res = await fetch(`${ENDPOINT}?dryRun=${dryRun}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // body rỗng / không phải JSON
    }

    if (!res.ok) {
      const err: BulkImportErrorResult = {
        status: res.status,
        message:
          body?.message ||
          body?.error ||
          (res.status === 403
            ? 'Bạn không có quyền (yêu cầu vai trò ADMIN) hoặc phiên đăng nhập đã hết hạn.'
            : `Lỗi máy chủ (HTTP ${res.status})`),
        errors: Array.isArray(body?.errors) ? body.errors : [],
      };
      throw err;
    }

    return body as BulkImportResponse;
  },

  /**
   * DELETE /api/v1/import/onboarding-excel/contracts/{contractCode}
   * Rollback 1 căn vừa import theo mã hợp đồng Excel (ADMIN). Trả PropertyPurgeResponse.
   */
  async deleteImportedContract(contractCode: string): Promise<PropertyPurgeResponse> {
    const token = localStorage.getItem('access_token');
    const res = await fetch(`${ENDPOINT}/contracts/${encodeURIComponent(contractCode)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    let body: any = null;
    try { body = await res.json(); } catch { /* empty */ }

    if (!res.ok) {
      const err: BulkImportErrorResult = {
        status: res.status,
        message:
          body?.message ||
          body?.error ||
          (res.status === 403
            ? 'Bạn không có quyền (yêu cầu vai trò ADMIN).'
            : res.status === 404
            ? 'Không tìm thấy hợp đồng để xóa (có thể đã xóa trước đó).'
            : `Lỗi máy chủ (HTTP ${res.status})`),
        errors: [],
      };
      throw err;
    }

    return body as PropertyPurgeResponse;
  },
};

/** Type guard cho lỗi đã chuẩn hoá ở trên */
export const isBulkImportError = (e: unknown): e is BulkImportErrorResult =>
  typeof e === 'object' && e !== null && 'message' in e && 'errors' in e;
