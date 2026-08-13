import realApiClient from '@/services/core/realApiClient';

/**
 * DANH SÁCH CÔNG TƠ CÒN THIẾU ẢNH TRONG KỲ (BE commit 731acad, 13/08/2026).
 *
 * Vì sao có màn này: từ 13/08/2026 BE **chặn** phát hành hoá đơn điện/nước khi kỳ đó
 * chưa có ảnh công tơ — trả 422 `METER_PHOTO_REQUIRED`. Cron hằng ngày cũng bắn
 * `METER_READING_DUE` nhắc manager đi chụp, nhưng thông báo chỉ nêu **một** nhà và mỗi
 * manager chỉ nhận **một** thông báo/ngày. Không có danh sách này thì manager quản
 * nhiều nhà phải tự đi dò từng phòng, rồi tới cuối kỳ mới phát hiện bị chặn hoá đơn.
 *
 * Đường lùi khi thật sự không chụp được (công tơ hỏng, không vào được phòng): xin mã
 * admin — xem `meterOverrideService`, gửi kèm `overrideToken` lúc tạo hoá đơn.
 */

export interface PendingMeterReadingItem {
  propertyId: number;
  propertyName: string;
  /** null = nhà nguyên căn (không chia phòng). */
  roomId: number | null;
  roomNumber: string | null;
  contractId: number | null;
  /** BE trả 'ELECTRICITY' | 'WATER' (đã map từ enum nội bộ ELECTRIC). */
  utilityType: 'ELECTRICITY' | 'WATER' | string;
  /** Kỳ dạng `yyyy-MM`. */
  period: string;
  /** Ngày trong tháng làm mốc thu tiền của HĐ (ngày hiệu lực). */
  billingDay: number;
  /** Hạn phải có ảnh — cũng là ngày BE phát hành hoá đơn REGULAR. */
  meterDueDate: string;
  /** true = đã ghi chỉ số nhưng THIẾU ẢNH; false = chưa ghi gì. */
  hasReading: boolean;
  /** Luôn false — BE chỉ trả về dòng còn thiếu ảnh. */
  hasPhoto: boolean;
}

export const meterReadingService = {
  /**
   * @param period `yyyy-MM`; bỏ trống → BE lấy tháng hiện tại theo Asia/Ho_Chi_Minh.
   *
   * ADMIN thấy mọi hợp đồng ACTIVE; MANAGER chỉ thấy nhà mình là `operationManagerId`
   * — FE không phải lọc lại.
   *
   * Mỗi hợp đồng thiếu ảnh trả **2 dòng** (điện + nước) nếu cả hai đều chưa có.
   */
  listPending: async (period?: string): Promise<PendingMeterReadingItem[]> => {
    const { data } = await realApiClient.get<PendingMeterReadingItem[]>(
      '/api/v1/manager/meter-readings/pending',
      { params: period ? { period } : undefined },
    );
    return data ?? [];
  },
};
