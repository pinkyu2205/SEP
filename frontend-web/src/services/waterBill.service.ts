import api from '@/services/api';

/**
 * HOÁ ĐƠN NƯỚC do ADMIN phát hành — bản song sinh của `evnBill.service.ts`.
 *
 * Cùng mô hình với điện (chốt 13/08/2026, mở rộng sang nước 14/08/2026): admin tải hoá
 * đơn nước của cả nhà, hệ thống suy đơn giá m³, manager chỉ ĐỌC rồi ghi chỉ số từng
 * phòng. Trước đó manager tự khai đơn giá nước trong app — đó là thứ thay đổi này bỏ đi.
 *
 * ⚠️ BE CHƯA CÓ ENDPOINT (14/08/2026) — xem doc/BE-NEED-water-bill-admin-2026-08-14.md.
 * FE dựng sẵn theo contract mirror của EVN để BE ship phát là chạy.
 *
 * Đường dẫn gom vào ĐÚNG MỘT hằng `BASE` bên dưới: BE có thể chọn gộp
 * (`/admin/utility-bills?type=WATER`) hoặc tách (`/admin/water-bills`) — đổi một dòng là
 * xong, không phải đi sửa rải rác.
 */

const ADMIN = '/api/v1/admin';
const MANAGER = '/api/v1/manager';

/** Đổi đúng 2 hằng này nếu BE chọn tách riêng `water-bills` thay vì gộp `utility-bills`. */
const BASE = `${ADMIN}/utility-bills`;
const MANAGER_BASE = `${MANAGER}/utility-bills`;
/** BE phân biệt điện/nước bằng field này. Tách endpoint riêng thì bỏ đi. */
const TYPE = 'WATER' as const;

/** Hoá đơn nước admin đã phát hành cho 1 nhà trong 1 kỳ. */
export interface WaterBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  /** Chuỗi hiển thị, vd "01/09 – 30/09/2026". Là khoá kỳ mà manager đối chiếu. */
  billingPeriod: string;
  month: number;
  year: number;
  /** Tổng m³ của cả nhà trong kỳ. */
  totalQuantity: number;
  totalAmount: number;
  /**
   * BE tự tính = totalAmount / totalQuantity. PHẢI là số CHƯA làm tròn — xem ghi chú
   * ở `waterUnitPrice` bên dưới.
   */
  unitPrice?: number;
  imageUrl?: string | null;
  status?: 'PUBLISHED' | 'REVOKED';
  /** Tiến độ ghi chỉ số từng phòng — xem chú thích cùng tên ở `evnBill.service.ts`. */
  roomsTotal?: number;
  roomsDone?: number;
  readingDeadline?: string | null;
  overdue?: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface CreateWaterBillInput {
  propertyId: number;
  billingPeriod: string;
  month: number;
  year: number;
  totalQuantity: number;
  totalAmount: number;
  imageUrl?: string;
  /** Chỉ số đồng hồ CŨ / MỚI — chỉ có nghĩa với nhà nguyên căn. Xem CreateEvnBillInput. */
  prevReading?: number;
  newReading?: number;
  /**
   * SỐ DANH BỘ in trên tờ giấy, sau khi admin đã soát lại (BE 618f9dd + 3e8202f).
   * Bắt buộc khi căn nhà đã lưu mã — xem chú thích cùng tên ở `CreateEvnBillInput`.
   */
  customerCode?: string;
  ocrConfirmed?: boolean;
}

/** Bóc danh sách khỏi mọi dạng bọc BE có thể trả — cùng lý do đã gặp ở evnBill.service. */
const unwrapList = <T,>(d: unknown): T[] => {
  if (Array.isArray(d)) return d as T[];
  const o = d as { items?: T[]; content?: T[]; data?: T[] } | null | undefined;
  return o?.items ?? o?.content ?? o?.data ?? [];
};

/**
 * ⚠️ `api` đã bóc `.data` ở response interceptor nên các hàm dưới trả THẲNG payload.
 */
export const waterBillService = {
  /**
   * OCR ảnh hoá đơn nước. Dùng chung endpoint với EVN: BE chỉ trả rawText + danh sách số,
   * không hiểu biết gì riêng về hoá đơn điện, nên parser nước tái sử dụng được.
   */
  /*
    GỬI KÈM `type: 'WATER'` — máy chủ nhận tham số này từ BE be11f58.

    Bỏ trống thì máy chủ mặc định ELECTRIC và đi dò mã khách hàng EVN trên một tờ giấy nước.
    Không có mã nào để tìm, nên nó chỉ tốn công và có nguy cơ vớ nhầm một dãy số khác trên
    giấy rồi trả về như thể đó là mã thật.
  */
  ocr: (imageUrl: string): Promise<{ rawText?: string; numbers?: string[] }> =>
    api.post('/api/v1/ocr/evn-bill', { imageUrl, type: 'WATER' }),

  create: (input: CreateWaterBillInput): Promise<WaterBill> =>
    api.post<unknown, WaterBill>(BASE, { ...input, type: TYPE }),

  list: async (params: { propertyId?: number; month?: number; year?: number }): Promise<WaterBill[]> => {
    const raw = await api.get<unknown, unknown>(BASE, { params: { ...params, type: TYPE } });
    return unwrapList<WaterBill>(raw);
  },

  /** Manager chỉ đọc — hoá đơn nước của 1 nhà trong 1 kỳ. */
  getForPeriod: async (
    propertyId: number, month: number, year: number,
  ): Promise<WaterBill | null> => {
    const raw = await api.get<unknown, unknown>(MANAGER_BASE, {
      params: { propertyId, month, year, type: TYPE },
    });
    const rows = unwrapList<WaterBill>(raw);
    return rows.find((b) => b.status !== 'REVOKED') ?? rows[0] ?? null;
  },

  revoke: (id: number): Promise<void> => api.delete<unknown, void>(`${BASE}/${id}`),
};

/**
 * Đơn giá 1 m³ = tổng tiền ÷ tổng m³.
 *
 * KHÔNG làm tròn ở đây. `UtilityInvoiceServiceImpl.validateInvoiceAmounts` của BE ép
 * `tiêu thụ × đơn giá == thành tiền`; đưa số đã làm tròn vào là tích lệch vài đồng và bị
 * chặn "Thành tiền không khớp" — đúng lỗi đã dính bên điện (199 kWh × 2.008đ = 399.592 ≠
 * 399.585). Chỗ HIỂN THỊ tự làm tròn khi in ra, còn số đem đi tính thì giữ nguyên.
 */
export const waterUnitPrice = (totalAmount: number, totalQuantity: number): number =>
  totalQuantity > 0 ? totalAmount / totalQuantity : 0;
