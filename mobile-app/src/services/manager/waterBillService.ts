import realApiClient from '@/services/core/realApiClient';

/**
 * HOÁ ĐƠN NƯỚC do ADMIN phát hành — manager CHỈ ĐỌC.
 *
 * Bản song sinh của `evnBillService.ts`. Cùng mô hình đã áp cho điện 13/08/2026, mở sang
 * nước 14/08/2026: admin chốt hoá đơn nước của cả nhà trên web, manager chỉ đọc rồi ghi
 * chỉ số từng phòng. Trước đó manager tự khai đơn giá nước ngay trong app — không ai đối
 * chiếu được với hoá đơn giấy.
 *
 * ⚠️ BE CHƯA CÓ ENDPOINT (14/08/2026) — xem doc/BE-NEED-water-bill-admin-2026-08-14.md.
 * Đường dẫn và tên field bám đúng contract trong doc để BE ship là chạy.
 */

export interface WaterBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  /** Chuỗi kỳ hiển thị, vd "07/12/2024 – 06/01/2025". Là khoá đối chiếu với hoá đơn phòng. */
  billingPeriod: string;
  month: number;
  year: number;
  /** Tổng m³ của cả nhà trong kỳ. */
  totalQuantity: number;
  /**
   * TỔNG TIỀN THANH TOÁN — đã gồm VAT và phí bảo vệ môi trường, không phải dòng
   * "cộng tiền hàng" trên giấy. Lấy nhầm dòng kia là thu thiếu ~15%.
   */
  totalAmount: number;
  /** BE tính sẵn. Thiếu thì FE tự suy bằng `waterUnitPrice` bên dưới. */
  unitPrice?: number;
  imageUrl?: string | null;
  status?: 'PUBLISHED' | 'REVOKED';
  createdAt?: string;
  /**
   * ─── NHIỆM VỤ GHI CHỈ SỐ TRONG NGÀY (BE 17/08/2026) ────────────────────────
   *
   * Admin phát hành hoá đơn tổng là giao việc cho quản lý: đi chụp đồng hồ và ghi số
   * TỪNG PHÒNG **ngay trong ngày**, không để sang hôm sau — số đọc muộn thì lệch với kỳ
   * của hoá đơn nhà nước, tính cho khách không còn khớp.
   *
   * BE tính sẵn 4 field này nên app không phải gọi thêm API rồi tự trừ để biết còn thiếu
   * bao nhiêu phòng (và tự đoán mốc hạn — thứ không suy ra được từ dữ liệu phòng).
   */
  /** Số phòng có HĐ ACTIVE cần ghi chỉ số. Nhà nguyên căn = 0 (khách nhận hoá đơn trực tiếp). */
  roomsTotal?: number;
  /** Số phòng đã ghi xong trong kỳ này. */
  roomsDone?: number;
  /** Hạn chụp — luôn là NGÀY PHÁT HÀNH. null với nhà nguyên căn (không có việc gì để làm). */
  readingDeadline?: string | null;
  /** BE chốt: đã qua hạn mà chưa ghi đủ phòng. */
  overdue?: boolean;
}

/**
 * Đơn giá 1 m³ = tổng tiền ÷ tổng m³ — KHÔNG làm tròn.
 *
 * BE ép `tiêu thụ × đơn giá == thành tiền` (`validateInvoiceAmounts`), nên đưa số đã làm
 * tròn vào là tích lệch vài đồng và bị chặn "Thành tiền không khớp" — đúng lỗi đã dính
 * bên điện. Chỗ hiển thị tự làm tròn khi in ra.
 *
 * Số này CAO HƠN đơn giá in trên hoá đơn nước (vd 29.000đ/m³) là bình thường: giá in là
 * giá trước thuế, còn đây đã gánh VAT + phí BVMT để thu đủ tổng hoá đơn.
 */
export const waterUnitPrice = (
  bill: Pick<WaterBill, 'totalAmount' | 'totalQuantity' | 'unitPrice'>,
): number =>
  bill.unitPrice ?? (bill.totalQuantity > 0 ? bill.totalAmount / bill.totalQuantity : 0);

export const managerWaterBillService = {
  /**
   * Hoá đơn nước admin đã phát hành cho 1 nhà trong 1 kỳ.
   * Trả `null` khi admin chưa đẩy — màn hình phải hiện trạng thái CHỜ chứ không mở form
   * nhập tay, vì cho manager tự khai lại chính là thứ thay đổi này loại bỏ.
   */
  getForPeriod: async (
    propertyId: number,
    month: number,
    year: number,
  ): Promise<WaterBill | null> => {
    const { data } = await realApiClient.get<{ items?: WaterBill[] } | WaterBill[]>(
      '/api/v1/manager/utility-bills',
      { params: { propertyId, month, year, type: 'WATER' } },
    );
    const items = Array.isArray(data) ? data : data?.items ?? [];
    // Bản bị admin thu hồi coi như không có — không được tính theo đơn giá đã huỷ.
    return items.find((b) => b.status !== 'REVOKED') ?? null;
  },
};
