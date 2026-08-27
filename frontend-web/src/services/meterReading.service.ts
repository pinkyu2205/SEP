import api from './api';

/**
 * Chỉ số công tơ gần nhất của một căn nhà / phòng.
 *
 * Dùng cho màn phát hành hoá đơn điện–nước: chỉ số kỳ trước là con số admin KHÔNG được gõ
 * lại bằng tay. Gõ tay thì mỗi kỳ lệch một chút, tới lúc khách thắc mắc thì không còn dấu
 * vết nào để đối chiếu — trong khi máy chủ đã lưu sẵn con số đó từ kỳ trước.
 */
export interface MeterReadingDto {
  /** Số trên mặt đồng hồ, KHÔNG phải lượng tiêu thụ. */
  reading: number;
  /** Kỳ đã ghi, dạng `yyyy-MM`. Rỗng khi số này suy ra từ hoá đơn cũ chứ chưa từng ghi. */
  period: string;
  recordedAt: string;
  type: string;
  imageUrl?: string;
}

/** Chỉ số cũ đã quyết định xong, kèm lý do lấy từ đâu — màn hình cần nói rõ nguồn. */
export interface ResolvedPrevReading {
  reading: number;
  /** `meter` = chốt cuối kỳ trước · `handover` = chụp đồng hồ lúc đón khách. */
  source: 'meter' | 'handover';
  /** Kỳ (yyyy-MM) với `meter`, hoặc thời điểm chụp với `handover`. */
  at?: string;
}

type HandoverFields = {
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterCapturedAt?: string;
  waterMeterCapturedAt?: string;
};

/**
 * CHỌN CHỈ SỐ CŨ cho kỳ sắp phát hành.
 *
 * Vì sao không lấy thẳng chỉ số cuối kỳ trước: hoá đơn điện/nước nhà nước gửi về tính cho
 * TRỌN THÁNG, nhưng khách mới có thể dọn vào giữa tháng. Giấy EVN ghi đầu kỳ 19.000 → cuối
 * kỳ 19.500 (500 kWh cả tháng), trong khi lúc đón khách ngày 15 đồng hồ mới ở 19.200 —
 * khách chỉ được tính 19.200 → 19.500 = 300 kWh. Bắt họ trả 500 là thu tiền của quãng
 * trước khi họ dọn tới.
 *
 * Quy tắc: lấy mốc NÀO MỚI HƠN giữa "chốt cuối kỳ trước" và "chụp đồng hồ lúc đón khách".
 *   • Khách cũ, kỳ 2 trở đi → chốt kỳ trước mới hơn → dùng nó.
 *   • Khách mới dọn vào giữa kỳ → mốc đón khách mới hơn → dùng mốc đón khách.
 *
 * Không có thời điểm để so (chỉ số suy từ hoá đơn cũ nên `recordedAt` rỗng) thì lấy số
 * LỚN HƠN — công tơ chỉ chạy tiến, số lớn hơn chắc chắn là mốc sau.
 *
 * Cùng quy tắc mà `UtilityBillingScreen` (app quản lý, nhà chia phòng) đang dùng — chỉ khác
 * là bên đó tra theo từng phòng.
 */
export const resolvePrevReading = (
  latest: MeterReadingDto | null,
  contract: HandoverFields | null | undefined,
  type: 'ELECTRIC' | 'WATER',
): ResolvedPrevReading | null => {
  const handoverValue = type === 'ELECTRIC'
    ? contract?.initialElectricReading
    : contract?.initialWaterReading;
  const handoverAt = type === 'ELECTRIC'
    ? contract?.electricMeterCapturedAt
    : contract?.waterMeterCapturedAt;

  const meter = latest && Number.isFinite(Number(latest.reading))
    ? { reading: Number(latest.reading), at: latest.recordedAt || latest.period || '' }
    : null;
  const handover = Number.isFinite(Number(handoverValue))
    ? { reading: Number(handoverValue), at: handoverAt || '' }
    : null;

  if (!meter) return handover ? { ...handover, source: 'handover' } : null;
  if (!handover) return { ...meter, source: 'meter' };

  // Đủ hai thời điểm → so thẳng. Thiếu một bên → so số (công tơ chỉ tiến).
  const laterIsHandover = meter.at && handover.at
    ? new Date(handover.at).getTime() > new Date(meter.at).getTime()
    : handover.reading > meter.reading;

  return laterIsHandover
    ? { ...handover, source: 'handover' }
    : { ...meter, source: 'meter' };
};

export const meterReadingService = {
  /**
   * GET /api/v1/properties/{id}/meter-readings/latest — chỉ số gần nhất của NHÀ NGUYÊN CĂN
   * (không gắn phòng). Quyền: MANAGER + ADMIN.
   *
   * Máy chủ có đường lui sẵn: chưa có bản ghi công tơ nào thì nó lấy `newReading` của hoá
   * đơn điện/nước gần nhất — nên kỳ đầu sau khi đón khách vẫn ra số đúng.
   *
   * Trả `null` khi nhà chưa từng có chỉ số nào (nhà mới tinh) — đó là trạng thái hợp lệ,
   * không phải lỗi, nên nuốt luôn 404 thay vì bắn toast đỏ vào mặt admin.
   */
  latestForProperty: async (
    propertyId: number, type: 'ELECTRIC' | 'WATER',
  ): Promise<MeterReadingDto | null> => {
    try {
      const res = await api.get<unknown, MeterReadingDto | null>(
        `/api/v1/properties/${propertyId}/meter-readings/latest`,
        { params: { type }, skipErrorToast: true } as object,
      );
      return res && Number.isFinite(Number(res.reading)) ? res : null;
    } catch {
      return null;
    }
  },
};
