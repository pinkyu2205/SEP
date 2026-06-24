import type {
  BulkImportResponse, BulkImportError, PropertyPurgeResponse, BulkImportImagesResponse,
} from '../types/api.types';

const ENDPOINT = '/api/v1/import/onboarding-excel';
const IMAGES_ZIP_ENDPOINT = '/api/v1/import/property-images-zip';

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
 * Spring trả message thô "Maximum upload size exceeded" khi file vượt
 * `spring.servlet.multipart.max-file-size` (mặc định 1MB). Dịch sang message
 * rõ ràng để người dùng biết đây là giới hạn server, không phải file sai.
 * Xem doc/NOTE-CHO-TEAM-BE.md mục #18.
 */
const isUploadSizeError = (status: number | undefined, raw: string | undefined) =>
  status === 413 || /max(imum)?\s*upload\s*size|upload size exceeded|sizelimitexceeded|filesizelimit/i.test(raw ?? '');

const UPLOAD_SIZE_MESSAGE =
  'File vượt quá giới hạn dung lượng của máy chủ (mặc định 1MB). ' +
  'Đây là cấu hình phía Backend — cần nâng spring.servlet.multipart.max-file-size/max-request-size. ' +
  'Báo team BE (xem doc/NOTE-CHO-TEAM-BE.md mục #18).';

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
      const raw = body?.message || body?.error;
      const err: BulkImportErrorResult = {
        status: res.status,
        message: isUploadSizeError(res.status, raw)
          ? UPLOAD_SIZE_MESSAGE
          : raw ||
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
   * POST /api/v1/import/property-images-zip?dryRun=...
   * Bước 2 — gắn ảnh cho các căn đã import Excel. File .zip có folder con đặt
   * tên = mã hợp đồng. dryRun=true chỉ kiểm tra (không lưu file/ghi DB).
   * Giới hạn 200MB (BE multipart). @throws BulkImportErrorResult khi HTTP != 2xx.
   */
  async importPropertyImagesZip(file: File, dryRun: boolean): Promise<BulkImportImagesResponse> {
    const form = new FormData();
    form.append('file', file);

    const token = localStorage.getItem('access_token');

    const res = await fetch(`${IMAGES_ZIP_ENDPOINT}?dryRun=${dryRun}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });

    let body: any = null;
    try { body = await res.json(); } catch { /* body rỗng / không phải JSON */ }

    if (!res.ok) {
      const raw = body?.message || body?.error;
      const err: BulkImportErrorResult = {
        status: res.status,
        message: isUploadSizeError(res.status, raw)
          ? 'File ZIP vượt giới hạn dung lượng máy chủ (tối đa 200MB). Hãy tách thành nhiều file ZIP nhỏ hơn.'
          : raw ||
            (res.status === 403
              ? 'Bạn không có quyền (yêu cầu vai trò ADMIN) hoặc phiên đăng nhập đã hết hạn.'
              : `Lỗi máy chủ (HTTP ${res.status})`),
        errors: [],
      };
      throw err;
    }

    return body as BulkImportImagesResponse;
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
