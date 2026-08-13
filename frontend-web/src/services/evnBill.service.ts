import api from './api';

/**
 * HOÁ ĐƠN ĐIỆN EVN — phần của Admin.
 *
 * Vì sao có: trước 13/08/2026 chính manager là người chụp hoá đơn EVN rồi tự nhập tổng
 * kWh / tổng tiền trên app. Hai vấn đề: (1) mỗi manager đọc một kiểu nên đơn giá điện
 * của cùng một nhà lệch nhau giữa các kỳ, (2) không ai đối chiếu được số manager nhập
 * với hoá đơn gốc. Chốt mới: ADMIN là người tải hoá đơn EVN lên, hệ thống tính đơn giá
 * (tổng tiền ÷ tổng kWh) rồi đẩy xuống cho manager dùng — manager KHÔNG sửa được số này.
 *
 * Sau khi admin phát hành:
 *   • Nhà nguyên căn  → manager bấm gửi thẳng cho khách (tiền = đúng tổng hoá đơn EVN).
 *   • Nhà theo phòng  → manager chụp đồng hồ từng phòng, ghi chỉ số, hệ thống nhân với
 *                       đơn giá admin đã chốt rồi gửi từng phòng.
 * Nước KHÔNG đổi — manager vẫn tự nhập hoá đơn nước như cũ.
 *
 * ⚠️ BE CHƯA CÓ các endpoint dưới đây — FE gọi sẵn theo hợp đồng kỳ vọng, giống cách
 * rent-invoices đang làm. Xem doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md.
 * Riêng POST /api/v1/ocr/evn-bill thì BE ĐÃ CÓ (mobile đang dùng), tái sử dụng luôn.
 */

const ADMIN = '/api/v1/admin';

/** Hoá đơn EVN admin đã phát hành cho 1 nhà trong 1 kỳ. */
export interface EvnBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  /** Chuỗi hiển thị, vd "01/08 – 31/08/2026". Là khoá kỳ mà manager đối chiếu. */
  billingPeriod: string;
  /** Tháng/năm dạng số — để BE chặn trùng kỳ và FE lọc nhanh. */
  month: number;
  year: number;
  totalKwh: number;
  totalAmount: number;
  /** BE tự tính = totalAmount / totalKwh, làm tròn. FE không gửi lên. */
  unitPrice?: number;
  /** Ảnh hoá đơn gốc trên Cloudinary — manager xem lại để đối chiếu. */
  imageUrl?: string | null;
  /** PUBLISHED = manager thấy và dùng được; REVOKED = admin đã thu hồi. */
  status?: 'PUBLISHED' | 'REVOKED';
  createdBy?: string;
  createdAt?: string;
}

export interface CreateEvnBillInput {
  propertyId: number;
  billingPeriod: string;
  month: number;
  year: number;
  totalKwh: number;
  totalAmount: number;
  imageUrl?: string;
}

/** Kết quả OCR ảnh hoá đơn EVN (BE: OcrEvnBillResponse, endpoint đã có sẵn). */
export interface OcrEvnBillResponse {
  rawText?: string;
  numbers?: string[];
  totalKwh?: number;
  totalAmount?: number;
  billingPeriod?: string;
}

/**
 * ⚠️ `api` đã bóc `.data` trong response interceptor, nên các hàm dưới trả THẲNG payload.
 * Viết `const { data } = await evnBillService.list()` là bóc hai lần → undefined.
 */
export const evnBillService = {
  /** OCR ảnh hoá đơn đã upload Cloudinary. Best-effort — admin luôn phải soát lại. */
  ocr: (imageUrl: string): Promise<OcrEvnBillResponse> =>
    api.post<unknown, OcrEvnBillResponse>('/api/v1/ocr/evn-bill', { imageUrl }),

  /**
   * Phát hành hoá đơn EVN cho 1 nhà.
   * BE phải IDEMPOTENT theo (propertyId, month, year): kỳ đó đã có bản PUBLISHED thì
   * trả 409 chứ đừng tạo thêm — hai bản cùng kỳ sẽ làm manager tính theo đơn giá khác nhau.
   */
  publish: (input: CreateEvnBillInput): Promise<EvnBill> =>
    api.post<unknown, EvnBill>(`${ADMIN}/evn-bills`, input),

  list: async (params?: { propertyId?: number; month?: number; year?: number }): Promise<EvnBill[]> => {
    const rows = await api.get<unknown, EvnBill[]>(`${ADMIN}/evn-bills`, { params });
    return rows ?? [];
  },

  /**
   * Thu hồi bản đã phát hành (admin nhập nhầm số).
   * BE nên CHẶN thu hồi khi đã có hoá đơn điện nào của kỳ đó gửi cho khách — thu hồi lúc
   * ấy chỉ tạo ra hoá đơn mồ côi tính theo đơn giá không còn tồn tại.
   */
  revoke: (id: number): Promise<void> =>
    api.delete<unknown, void>(`${ADMIN}/evn-bills/${id}`),
};

/** Đơn giá 1 kWh = tổng tiền EVN ÷ tổng kWh. EVN tính bậc thang nên không có sẵn đơn giá. */
export const evnUnitPrice = (totalAmount: number, totalKwh: number): number =>
  totalKwh > 0 ? Math.round(totalAmount / totalKwh) : 0;
