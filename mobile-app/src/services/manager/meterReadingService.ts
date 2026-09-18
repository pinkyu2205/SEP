import realApiClient from '@/services/core/realApiClient';
import { meterReadingPeriodIso } from '@/constants';
import { serverNow } from '@/utils/serverTime';

/**
 * DANH SÁCH CÔNG TƠ CÒN THIẾU ẢNH TRONG KỲ (BE commit 731acad, 13/08/2026).
 *
 * Vì sao có màn này: từ 13/08/2026 BE **chặn** phát hành hoá đơn điện/nước khi kỳ đó
 * chưa có ảnh công tơ — trả 422 `METER_PHOTO_REQUIRED`. Cron cũng bắn `METER_READING_DUE`
 * nhắc manager đi chụp, nhưng thông báo chỉ nêu **một** nhà và mỗi manager chỉ nhận
 * **một** thông báo/ngày. Không có danh sách này thì manager quản nhiều nhà phải tự đi
 * dò từng phòng, rồi tới cuối kỳ mới phát hiện bị chặn hoá đơn.
 *
 * Từ 10/09/2026 mốc của ĐIỆN là NGÀY CUỐI THÁNG: `meterDueDate` của dòng điện là ngày
 * cuối tháng của kỳ, không còn là ngày admin phát hành hoá đơn EVN. Nước giữ nguyên.
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

  /**
   * MỌI việc còn tồn, không phụ thuộc vào một kỳ duy nhất.
   *
   * Vì sao không hỏi đúng một kỳ: hai loại đồng hồ chạy theo hai lịch khác nhau kể từ
   * 10/09/2026.
   *
   *  • ĐIỆN đi theo kỳ chốt số — bình thường là THÁNG TRƯỚC, riêng ngày cuối tháng là
   *    tháng hiện tại (`meterReadingPeriodIso`). CHỈ kỳ đó, không lấy kỳ chưa tới hạn.
   *  • NƯỚC đi theo hoá đơn admin vừa phát hành, tức thường rơi vào THÁNG DƯƠNG LỊCH
   *    hiện tại, và tới hạn ngay lúc phát hành.
   *
   * Hỏi mỗi kỳ chốt số thì mất sạch việc nước của tháng này; hỏi mỗi tháng hiện tại thì
   * mất việc điện còn nợ của tháng trước. Cả hai đều là im lặng bỏ sót — màn hình khoe
   * "đã chụp đủ" trong khi vẫn còn phòng chưa ai đụng tới. Nên hỏi cả hai, rồi lọc.
   *
   * Máy chủ lọc theo quyền sẵn, và ngày cuối tháng hai kỳ trùng nhau nên chỉ còn một
   * lời gọi. Lỗi một kỳ không làm hỏng kỳ kia.
   */
  listAllPending: async (): Promise<PendingMeterReadingItem[]> => {
    const now = serverNow();
    const readingPeriod = meterReadingPeriodIso(now);
    const calendarPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (readingPeriod === calendarPeriod) {
      // Ngày cuối tháng: hai kỳ là một, hỏi một lần là đủ.
      return meterReadingService.listPending(readingPeriod).catch(() => []);
    }

    const [readingRows, calendarRows] = await Promise.all([
      meterReadingService.listPending(readingPeriod).catch(() => [] as PendingMeterReadingItem[]),
      meterReadingService.listPending(calendarPeriod).catch(() => [] as PendingMeterReadingItem[]),
    ]);

    /*
      KỲ DƯƠNG LỊCH CHỈ LẤY DÒNG NƯỚC, BỎ HẾT DÒNG ĐIỆN.

      Máy chủ trả dòng điện cho BẤT KỲ kỳ nào được hỏi, kể cả kỳ chưa tới hạn. Hỏi tháng
      dương lịch vào ngày 10 là lôi về việc của kỳ sẽ chốt vào ngày 30 — còn hai mươi ngày
      nữa mới tới hạn, và cron cũng chưa hề nhắc.

      Hậu quả thấy được (10/09/2026): quản lý vừa chốt xong phòng 103 cho kỳ tháng 8, hoá
      đơn đã gửi và khách đã trả tiền, mà màn "Cần chụp công tơ" vẫn liệt kê đủ 4 phòng —
      vì đó là 4 dòng của tháng 9. Hai màn nói về hai kỳ khác nhau nên không đời nào khớp.

      Nước thì ngược lại, PHẢI lấy: nó chạy theo hoá đơn admin vừa phát hành, hạn là chính
      ngày phát hành, nên việc nước của tháng này đã tới hạn ngay lúc nó xuất hiện.
    */
    const waterOnly = calendarRows.filter(r => r.utilityType !== 'ELECTRICITY');

    // Khoá gộp phải có CẢ `period`: cùng một phòng có thể còn nợ điện kỳ trước và nước kỳ
    // này cùng lúc — đó là hai việc, không phải một dòng trùng.
    const seen = new Set<string>();
    const merged: PendingMeterReadingItem[] = [];
    for (const rows of [readingRows, waterOnly]) {
      for (const r of rows) {
        const key = `${r.propertyId}-${r.roomId ?? 'whole'}-${r.utilityType}-${r.period}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
    }
    return merged;
  },
};

/**
 * ─── CHỐT CHỈ SỐ TRƯỚC, PHÁT HÀNH SAU (10/09/2026) ────────────────────────────
 *
 * Điện đổi luồng: quản lý đi chụp đồng hồ vào NGÀY CUỐI THÁNG và **lưu chỉ số lại**, chưa
 * gửi gì cho khách. Tới khi admin đẩy hoá đơn EVN của kỳ đó lên, máy chủ lấy chỉ số đã
 * chốt nhân đơn giá rồi tự phát hành thẳng cho khách thuê, đồng thời báo cho cả quản lý
 * lẫn khách. Xem `meterReadingPeriod` trong `constants/utilityCycle`.
 *
 * Vì sao tách khỏi `createRoomUtilityInvoice`: hàm kia PHÁT HÀNH — tạo ra tiền phải trả và
 * bắn thông báo cho khách. Chỉ số chốt lúc cuối tháng thì chưa tính ra tiền được (chưa có
 * đơn giá của kỳ), nên phải là một bản ghi riêng, sửa được cho tới lúc phát hành.
 *
 * BE đã ship 10/09/2026 (commit c36de01) đúng contract này. Một hành vi phải nhớ: nếu chỉ
 * số được chốt SAU khi admin đã đẩy hoá đơn EVN thì máy chủ phát hành NGAY trong chính lệnh
 * lưu — đọc `invoiceId` trong phản hồi để biết, đừng mặc định là "đang chờ".
 * Xem doc-be/BE-YEUCAU-chot-chi-so-dien-cuoi-thang-2026-09-10.md.
 */

export type MeterReadingUtility = 'ELECTRICITY' | 'WATER';

/** Chỉ số cũ lấy ở đâu ra — hiện nguyên văn cho quản lý đối chiếu, khỏi phải đoán. */
export type SavedPrevSource = 'LAST_INVOICE' | 'LAST_READING' | 'HANDOVER';

/**
 * Một dòng = một phòng đang có hợp đồng ACTIVE trong kỳ.
 *
 * BE trả về ĐỦ MỌI PHÒNG, kể cả phòng chưa chốt (`newReading = null`) — app không phải
 * ghép chéo giữa danh sách phòng và danh sách bản ghi rồi tự đoán phòng nào còn thiếu.
 */
export interface SavedMeterReading {
  /** null = nhà nguyên căn (không chia phòng). */
  roomId: number | null;
  roomNumber: string | null;
  contractId: number | null;
  tenantName?: string | null;
  prevReading: number;
  prevSource?: SavedPrevSource;
  /** null = chưa chốt số kỳ này. */
  newReading: number | null;
  meterImageUrl?: string | null;
  /** Lúc quản lý bấm lưu. */
  capturedAt?: string | null;
  /**
   * Hoá đơn máy chủ đã tự phát hành từ chỉ số này (null = chưa, admin chưa đẩy hoá đơn EVN).
   * CÓ id nghĩa là chỉ số đã thành tiền trong tay khách — khoá sửa từ đây.
   */
  invoiceId?: number | null;
  invoiceStatus?: string | null;
}

export interface SaveMeterReadingBody {
  propertyId: number;
  /** null = nhà nguyên căn. */
  roomId: number | null;
  /** Kỳ `yyyy-MM` — xem `meterReadingPeriodIso`. */
  period: string;
  utilityType: MeterReadingUtility;
  prevReading: number;
  newReading: number;
  /** Ảnh mặt đồng hồ đã upload Cloudinary. Thiếu ảnh thì phải kèm `overrideToken`. */
  meterImageUrl?: string | null;
  /** Đường lùi khi không chụp được — xem `meterOverrideService`. */
  overrideToken?: string;
  overrideReason?: string;
}

export const savedMeterReadingService = {
  /** Chỉ số đã chốt của một nhà trong một kỳ. Trả về mọi phòng, chưa chốt thì `newReading = null`. */
  listForPeriod: async (
    propertyId: number,
    period: string,
    utilityType: MeterReadingUtility = 'ELECTRICITY',
  ): Promise<SavedMeterReading[]> => {
    const { data } = await realApiClient.get<{ items?: SavedMeterReading[] } | SavedMeterReading[]>(
      '/api/v1/manager/meter-readings',
      { params: { propertyId, period, utilityType } },
    );
    return Array.isArray(data) ? data : data?.items ?? [];
  },

  /**
   * Lưu (hoặc GHI ĐÈ) chỉ số đã chốt của một phòng.
   *
   * Ghi đè có chủ đích: quản lý gõ nhầm một chữ số thì phải sửa được, và sửa chỉ số chưa
   * phát hành không đụng tới ai. BE khoá lại ngay khi đã sinh hoá đơn từ bản ghi này —
   * sửa sau lưng khách là chuyện khác hẳn, phải đi đường khiếu nại.
   */
  save: async (body: SaveMeterReadingBody): Promise<SavedMeterReading> => {
    const { data } = await realApiClient.post<SavedMeterReading>(
      '/api/v1/manager/meter-readings', body,
    );
    return data;
  },
};
