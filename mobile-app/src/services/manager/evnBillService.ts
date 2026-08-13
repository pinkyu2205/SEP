import realApiClient from '@/services/core/realApiClient';

/**
 * HOÁ ĐƠN ĐIỆN EVN do ADMIN phát hành — phần manager chỉ ĐỌC.
 *
 * Chốt 13/08/2026: manager KHÔNG còn tự chụp/nhập hoá đơn EVN nữa. Admin tải hoá đơn
 * trên web (trang `/admin/evn-bills`), hệ thống tính đơn giá = tổng tiền ÷ tổng kWh rồi
 * đẩy xuống. Manager mở tab Điện là thấy sẵn số liệu của kỳ và không sửa được — nhờ vậy
 * mọi phòng trong cùng một nhà chắc chắn tính theo cùng một đơn giá.
 *
 * Việc còn lại của manager:
 *   • nhà nguyên căn → bấm gửi thẳng cho khách, tiền = đúng tổng hoá đơn EVN
 *   • nhà theo phòng → chụp đồng hồ từng phòng, ghi chỉ số, nhân với `unitPrice`
 *
 * ⚠️ BE CHƯA CÓ endpoint này — FE gọi sẵn theo hợp đồng kỳ vọng (giống rent-invoices).
 * Xem doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md.
 */

/** Bản hoá đơn EVN của 1 nhà trong 1 kỳ, đúng shape admin phát hành. */
export interface EvnBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  /** Chuỗi hiển thị nguyên văn trên hoá đơn khách nhận, vd "01/08 – 31/08/2026". */
  billingPeriod: string;
  month: number;
  year: number;
  totalKwh: number;
  totalAmount: number;
  /** BE tính sẵn. Thiếu thì FE tự suy bằng `evnUnitPrice` bên dưới. */
  unitPrice?: number;
  /** Ảnh hoá đơn gốc — manager mở ra đối chiếu khi khách thắc mắc. */
  imageUrl?: string | null;
  status?: 'PUBLISHED' | 'REVOKED';
  createdAt?: string;
}

/** Đơn giá 1 kWh = tổng tiền ÷ tổng kWh (EVN bậc thang, hoá đơn không in đơn giá). */
export const evnUnitPrice = (bill: Pick<EvnBill, 'totalAmount' | 'totalKwh' | 'unitPrice'>): number =>
  bill.unitPrice ?? (bill.totalKwh > 0 ? Math.round(bill.totalAmount / bill.totalKwh) : 0);

export const managerEvnBillService = {
  /**
   * Hoá đơn EVN admin đã phát hành cho 1 nhà trong 1 kỳ.
   * Trả `null` khi admin chưa đẩy — màn hình phải hiện trạng thái CHỜ chứ không mở form
   * nhập tay, vì cho manager nhập lại chính là thứ thay đổi này loại bỏ.
   */
  getForPeriod: async (
    propertyId: number,
    month: number,
    year: number,
  ): Promise<EvnBill | null> => {
    const { data } = await realApiClient.get<{ items?: EvnBill[] } | EvnBill[]>(
      '/api/v1/manager/evn-bills',
      { params: { propertyId, month, year } },
    );
    const items = Array.isArray(data) ? data : data?.items ?? [];
    // Bản bị admin thu hồi coi như không có — manager không được tính theo đơn giá đã huỷ.
    return items.find((b) => b.status !== 'REVOKED') ?? null;
  },
};
