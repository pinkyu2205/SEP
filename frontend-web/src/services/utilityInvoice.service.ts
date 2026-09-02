import api from './api';

/**
 * PHÁT HÀNH HOÁ ĐƠN TIỆN ÍCH TỚI KHÁCH THUÊ.
 *
 * ─── Vì sao web admin cần gọi cái này (17/08/2026) ────────────────────────────
 * Hoá đơn EVN/nước mà admin tải lên chỉ là **hoá đơn tổng của cả căn nhà**
 * (`UtilityBill`), chưa phải hoá đơn khách phải trả (`UtilityInvoice`). Hai loại nhà
 * xử lý khác nhau, và khác nhau vì bản chất giấy hoá đơn:
 *
 *  • **Nhà nguyên căn** — cả căn chỉ một khách thuê, mà giấy EVN đã ghi đủ chỉ số cũ,
 *    chỉ số mới và tổng tiền của chính căn đó. Không còn gì phải chia, cũng không cần
 *    ai đi đọc đồng hồ. Nên admin tải hoá đơn lên là **phát hành thẳng cho khách**;
 *    quản lý chỉ nhận thông báo để vào xem, không phải làm bước nào.
 *
 *  • **Nhà chia phòng** — giấy EVN chỉ có tổng của cả nhà, phải chia về từng phòng theo
 *    đồng hồ riêng. Việc đó cần người tới tận nơi chụp đồng hồ và ghi số, nên vẫn đi
 *    đường cũ: admin phát hành hoá đơn tổng + đơn giá → quản lý đọc từng phòng → gửi
 *    từng khách. Web admin KHÔNG gọi hàm này cho loại nhà đó.
 *
 * ⚠️ Ràng buộc của BE (`UtilityInvoiceServiceImpl.validateInvoiceAmounts`), FE phải
 * kiểm trước để không nhận lỗi 422 sau khi hoá đơn tổng đã tạo xong:
 *   • `consumption === newReading - prevReading`
 *   • `amount ≈ consumption × unitPrice` (BE cho lệch tối đa 1đ)
 *   • `newReading >= prevReading`
 */

/** ELECTRIC cho điện, WATER cho nước — khớp `UtilityTypeMapper.fromApi`. */
export type UtilityApiType = 'ELECTRIC' | 'WATER';

export interface CreateUtilityInvoiceInput {
  type: UtilityApiType;
  /** Cùng chuỗi kỳ với hoá đơn tổng — BE dùng để khoá trùng kỳ. */
  billingPeriod: string;
  prevReading: number;
  newReading: number;
  consumption: number;
  unitPrice: number;
  amount: number;
  /** Ảnh hoá đơn EVN/nước gốc — nguyên căn thì đây chính là bằng chứng chỉ số. */
  meterImageUrl?: string;
}

export interface UtilityInvoiceResult {
  id: number;
  propertyId?: number;
  roomId?: number | null;
  type?: string;
  billingPeriod?: string;
  consumption?: number;
  unitPrice?: number;
  amount?: number;
  status?: string;
  tenantName?: string;
}

export const utilityInvoiceService = {
  /**
   * POST /api/v1/properties/{propertyId}/utility-invoices
   *
   * Hoá đơn cho **cả căn** (không có phòng) → gửi tới khách đang thuê nguyên căn.
   * BE chặn gọi sai loại nhà: nhà chia phòng sẽ nhận
   * "API nguyên căn chỉ dùng cho nhà whole-house".
   */
  createForWholeHouse: (
    propertyId: number,
    input: CreateUtilityInvoiceInput,
    /**
     * Tắt toast lỗi toàn cục — dành cho màn NHẬP LÔ.
     *
     * Ở đó mỗi nhà là một dòng và dòng đó đã tự báo kết quả của chính nó. Để toast bật
     * thì phát hành 30 nhà mà lỗi 3 là ba hộp đỏ chồng lên nhau ở góc màn hình, nói lại
     * đúng thứ bảng đang nói, lại nói bằng câu thô của máy chủ ("Nhà nguyên căn đã nhận
     * hoá đơn điện của kỳ…") — nghe như hỏng trong khi việc đã xong.
     */
    opts?: { silent?: boolean },
  ): Promise<UtilityInvoiceResult> =>
    api.post(
      `/api/v1/properties/${propertyId}/utility-invoices`,
      input,
      opts?.silent ? ({ skipErrorToast: true } as object) : undefined,
    ),
};
