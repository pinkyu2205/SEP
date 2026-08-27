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

  /**
   * ─── HẠN MỨC TIÊU THỤ CÁC PHÒNG (BE 27/08/2026) ──────────────────────────
   *
   * Tổng tiêu thụ các phòng KHÔNG được vượt tổng trên giấy nhà nước cộng biên dự phòng.
   * Vượt là chắc chắn có phòng đọc nhầm — BE chặn bằng 422 ROOM_SUM_EXCEEDS_BILL.
   *
   * Lấy trần TỪ BE thay vì app tự nhân hệ số: biên là cấu hình phía máy chủ
   * (billing.utility.room-sum-tolerance-percent), tự nhân ở app là có ngày hai bên dùng
   * hai mức khác nhau — app báo còn dư mà bấm gửi lại bị chặn.
   */
  /** Tổng tiêu thụ các phòng ĐÃ phát hành trong kỳ. */
  roomSumQuantity?: number;
  /** Trần cho phép = tổng giấy × (1 + biên). */
  roomSumCap?: number;
  /** Đã phát hành mấy phòng / cần mấy phòng. */
  roomsBilled?: number;
  roomsExpected?: number;
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
    /**
     * ⚠️ ROUTE: `/manager/utility-bills?type=ELECTRIC`, KHÔNG phải `/manager/evn-bills`.
     *
     * BE gộp điện + nước vào một endpoint (`ManagerUtilityBillController`), phân biệt
     * bằng `type`. Route `evn-bills` chưa từng tồn tại — gọi vào đó là 404, app hiện
     * "Không tải được hoá đơn · Route không tồn tại" ở đúng bước 2 (đã gặp 18/08/2026).
     * Bên nước (`waterBillService`) đi đúng route này từ đầu nên tab Nước vẫn chạy.
     *
     * BE trả `totalQuantity` (tên dùng chung cho kWh/m³) nên phải map sang `totalKwh`.
     */
    const { data } = await realApiClient.get<{ items?: any[] } | any[]>(
      '/api/v1/manager/utility-bills',
      { params: { propertyId, month, year, type: 'ELECTRIC' } },
    );
    const rows = Array.isArray(data) ? data : data?.items ?? [];
    const items: EvnBill[] = rows.map((r) => ({
      ...r,
      totalKwh: r?.totalKwh ?? r?.totalQuantity ?? 0,
    }));
    // Bản bị admin thu hồi coi như không có — manager không được tính theo đơn giá đã huỷ.
    return items.find((b) => b.status !== 'REVOKED') ?? null;
  },
};
