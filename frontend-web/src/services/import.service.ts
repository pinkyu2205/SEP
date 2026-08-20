import type {
  BulkImportResponse, BulkImportError, PropertyPurgeResponse, BulkImportImagesResponse,
} from '@/types/api.types';

// Base URL của backend — cùng nguồn với axios instance (services/api.ts). BẮT BUỘC dùng ở
// đây vì các hàm dưới tự gọi `fetch()` (không qua axios instance) để tránh axios ép
// Content-Type JSON làm hỏng FormData; nếu thiếu prefix này thì local dev vẫn chạy được
// (Vite proxy /api che giấu), nhưng trên Vercel prod request lại gọi vào chính domain FE
// (chỉ có SPA rewrite trả index.html) → lỗi 405 (xem vercel.json + services/api.ts).
const API_BASE = import.meta.env.VITE_API_URL || '';

const ENDPOINT = '/api/v1/import/onboarding-excel';
// Endpoint MỚI (BE đang làm — xem doc/BE-tach-import-khoi-tao-va-cai-tao.md):
//  - lease-excel:      module Khởi tạo nhà — file chỉ có hợp đồng thuê + thiết bị bàn giao (hiển thị).
//  - renovation-excel: module Cấu hình khai thác — file chỉ có cải tạo, import xong TỰ ĐỘNG gửi Host.
const LEASE_ENDPOINT = '/api/v1/import/lease-excel';
const RENOVATION_ENDPOINT = '/api/v1/import/renovation-excel';
// Cải tạo bổ sung (session v2+) — sau khi nhà ACTIVE + đã gọi renovation/start.
const RENOVATION_SUPPLEMENT_ENDPOINT = '/api/v1/import/renovation-supplement-excel';
// Hợp đồng thuê nháp (DRAFT) hàng loạt — luồng Đón khách (FE-import-tenant-draft-contracts.md).
const TENANT_DRAFT_ENDPOINT = '/api/v1/import/tenant-draft-contracts-excel';
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

/**
 * `fetch` reject = request chưa từng tới server. Trong màn import, nguyên nhân số 1
 * KHÔNG phải mất mạng mà là **file Excel đang mở trong Excel**: trình duyệt giữ tham
 * chiếu tới file trên đĩa, Excel lưu đè làm tham chiếu hỏng, đọc blob thất bại.
 * (Ca thật 16/08/2026: file khoá `~$....xlsx` sinh lúc 03:40, file bị ghi đè 03:42,
 * lỗi hiện 03:42 — cùng file đó gửi bằng curl thì BE trả 200.)
 *
 * Chrome/Edge ném `NotReadableError`/`NotFoundError`, còn mất mạng hay CORS thì ném
 * `TypeError: Failed to fetch` — tách hai nhánh để không đổ lỗi nhầm cho đường truyền.
 */
const networkFailMessage = (e: unknown): string => {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotReadableError' || name === 'NotFoundError') {
    return 'Không đọc được file — có thể bạn đang mở nó trong Excel. Hãy đóng file rồi chọn lại.';
  }
  return 'Không gửi được file lên máy chủ. Kiểm tra: (1) file có đang mở trong Excel không '
    + '— đóng lại rồi chọn lại; (2) backend đã chạy chưa; (3) kết nối mạng.';
};

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
/**
 * Upload 1 file Excel lên endpoint import + chuẩn hoá lỗi. Dùng chung cho cả
 * onboarding (legacy), lease (Khởi tạo nhà) và renovation (Cấu hình khai thác).
 * @throws BulkImportErrorResult khi HTTP != 2xx
 */
async function postExcel(
  endpoint: string,
  file: File,
  dryRun: boolean,
  /** Chỉ áp dụng cho endpoint hợp đồng nháp — bỏ qua dòng lỗi, import phần sạch. */
  skipInvalidRows?: boolean,
): Promise<BulkImportResponse> {
  const form = new FormData();
  form.append('file', file);

  const token = localStorage.getItem('access_token');

  let res: Response;
  try {
    const query = new URLSearchParams({ dryRun: String(dryRun) });
    if (skipInvalidRows) query.set('skipInvalidRows', 'true');
    res = await fetch(`${API_BASE}${endpoint}?${query}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch (e) {
    // fetch reject = CHƯA tới được server. Không gói lại thì chỗ gọi rơi vào nhánh
    // "lỗi không xác định" và người dùng không có manh mối nào để sửa.
    throw { status: 0, message: networkFailMessage(e), errors: [] } as BulkImportErrorResult;
  }

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
}

export const importService = {
  /**
   * POST /api/v1/import/onboarding-excel?dryRun=... (LEGACY — 1 file đủ 3 sheet).
   * Giữ lại để tương thích; luồng mới dùng importLeaseExcel + importRenovationExcel.
   * @param file   File .xlsx / .xls
   * @param dryRun true = chỉ validate (không ghi DB); false = import thật
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  importOnboardingExcel(file: File, dryRun: boolean): Promise<BulkImportResponse> {
    return postExcel(ENDPOINT, file, dryRun);
  },

  /**
   * POST /api/v1/import/lease-excel?dryRun=... — Module "Khởi tạo nhà".
   * File chỉ chứa hợp đồng thuê (sheet 1) + thiết bị bàn giao (sheet 3, chỉ để hiển thị).
   * Tạo toà nhà + phòng; KHÔNG cải tạo, KHÔNG gửi Host.
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  importLeaseExcel(file: File, dryRun: boolean): Promise<BulkImportResponse> {
    return postExcel(LEASE_ENDPOINT, file, dryRun);
  },

  /**
   * POST /api/v1/import/renovation-excel?dryRun=... — Module "Cấu hình khai thác".
   * File chỉ chứa hợp đồng cải tạo (sheet 2), khớp theo mã HĐ thuê của căn đã khởi tạo.
   * Import thật xong BE TỰ ĐỘNG gửi Host (property → PENDING_HOST_REVIEW).
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  importRenovationExcel(file: File, dryRun: boolean): Promise<BulkImportResponse> {
    return postExcel(RENOVATION_ENDPOINT, file, dryRun);
  },

  /**
   * POST /api/v1/import/renovation-supplement-excel?dryRun=... — Cải tạo bổ sung (session v2+).
   * Tiên quyết: nhà đã ACTIVE và đã gọi POST /properties/{id}/renovation/start (mở session mới).
   * Import xong: completeRenovation + tính lại giá + submit-to-host → PENDING_HOST_REVIEW
   * (đổi chi phí/thiết bị nên host duyệt lại giá); manifest TB mua cộng dồn.
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  importRenovationSupplementExcel(file: File, dryRun: boolean): Promise<BulkImportResponse> {
    return postExcel(RENOVATION_SUPPLEMENT_ENDPOINT, file, dryRun);
  },

  /**
   * POST /api/v1/import/tenant-draft-contracts-excel?dryRun=... — luồng "Đón khách".
   * Mỗi dòng sheet `1. Hop_Dong_Nhap_Khach` = 1 HĐ thuê nháp (DRAFT), tương đương tạo
   * tay: BE tự gắn nội thất ACTIVE, tự notify manager nếu có cột SĐT quản lý.
   * Tiên quyết: BĐS đã ACTIVE (map theo Mã HĐ inbound / Mã BĐS / Tên tòa nhà).
   * LƯU Ý: import KHÔNG sinh file PDF — HĐ tạo xong contractFileAvailable=false,
   * render + upload file làm sau (nút Sửa hoặc luồng tạo file ở danh sách nháp).
   * @throws BulkImportErrorResult khi HTTP != 2xx
   */
  importTenantDraftContractsExcel(
    file: File,
    dryRun: boolean,
    /**
     * true = BE import những dòng hợp lệ và trả kèm danh sách lỗi của các dòng bị bỏ, thay
     * vì ném lỗi chặn cả file (BE thêm 20/08/2026). Nhà host chưa duyệt nằm lẫn trong file
     * không còn kéo cả lô chết theo.
     */
    skipInvalidRows = false,
  ): Promise<BulkImportResponse> {
    return postExcel(TENANT_DRAFT_ENDPOINT, file, dryRun, skipInvalidRows);
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

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${IMAGES_ZIP_ENDPOINT}?dryRun=${dryRun}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
    } catch (e) {
      // Cùng bẫy với postExcel — file .zip đang mở/đang được ghi thì đọc blob hỏng.
      throw { status: 0, message: networkFailMessage(e), errors: [] } as BulkImportErrorResult;
    }

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
    const res = await fetch(`${API_BASE}${ENDPOINT}/contracts/${encodeURIComponent(contractCode)}`, {
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
