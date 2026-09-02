/**
 * Thời hạn hợp đồng thuê với CHỦ NHÀ GỐC (inbound contract) — quy về một trạng
 * thái duy nhất để cả thẻ, bảng và trang chi tiết nói cùng một ngôn ngữ.
 *
 * ─── Vì sao đưa lên danh sách ──────────────────────────────────────────────
 * Việc của module "Khởi tạo nhà" là dựng hồ sơ nhà + ĐÍNH HỢP ĐỒNG ĐẦU VÀO.
 * Nhưng danh sách trước đây chỉ hiện phòng / tầng / diện tích — toàn số liệu
 * vật lý, không nói gì về phần việc thật. Nhìn vào không phân biệt được căn đã
 * có hợp đồng chủ nhà với căn còn thiếu, mà thiếu hợp đồng thì mọi bước sau
 * (duyệt giá, ký HĐ khách thuê) đều tắc.
 *
 * Ngày hết hạn còn quan trọng hơn một bậc: HĐ khách thuê KHÔNG được vượt quá
 * ngày này (xem `DraftContractFormModal.contractEndMax`). Một căn còn 2 tháng
 * là hợp đồng thuê nữa là hết hạn — phải biết TRƯỚC khi nhận khách mới, không
 * phải lúc form báo lỗi.
 *
 * Không tốn thêm request nào: `leaseStartDate` / `leaseEndDate` đã nằm sẵn
 * trong `PropertyResponse` của `GET /properties` (PropertyServiceImpl
 * `mapToResponse` đọc `inboundContractRepository`).
 */
import type { PropertyResponse } from '@/types/api.types';
import { daysSince, fmtDate } from '@/utils/period';

/** Dưới ngưỡng này coi là "sắp hết hạn" — đủ sớm để kịp thương lượng gia hạn. */
export const LEASE_ENDING_SOON_DAYS = 90;

export type LeaseHealth = 'missing' | 'expired' | 'ending' | 'ok';

export interface LeaseTerm {
  health: LeaseHealth;
  /** Số ngày còn lại tới ngày kết thúc; âm = đã quá hạn; null = chưa có HĐ. */
  daysLeft: number | null;
  /** "01/01/2026 → 31/12/2028", hoặc "—" khi chưa có HĐ. */
  range: string;
  /** Câu ngắn cạnh khoảng ngày: "còn 2 năm 4 tháng" / "Quá hạn 12 ngày". */
  label: string;
  /** Class màu cho chip `label`. */
  cls: string;
}

/** 88 ngày → "còn 2 tháng"; 900 ngày → "còn 2 năm 5 tháng". */
const humanLeft = (days: number): string => {
  if (days < 45) return `còn ${days} ngày`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `còn ${months} tháng`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `còn ${years} năm ${rest} tháng` : `còn ${years} năm`;
};

export const leaseTerm = (b: PropertyResponse): LeaseTerm => {
  if (!b.leaseEndDate) {
    return {
      health: 'missing',
      daysLeft: null,
      range: '—',
      label: 'Chưa có HĐ chủ nhà',
      cls: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  // `daysSince` âm khi ngày còn ở tương lai → đảo dấu thành "số ngày còn lại".
  const daysLeft = -daysSince(b.leaseEndDate);
  const range = `${fmtDate(b.leaseStartDate)} → ${fmtDate(b.leaseEndDate)}`;

  if (daysLeft < 0) {
    return {
      health: 'expired',
      daysLeft,
      range,
      label: `Quá hạn ${Math.abs(daysLeft)} ngày`,
      cls: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  if (daysLeft <= LEASE_ENDING_SOON_DAYS) {
    return {
      health: 'ending',
      daysLeft,
      range,
      label: daysLeft === 0 ? 'Hết hạn hôm nay' : `còn ${daysLeft} ngày`,
      cls: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    health: 'ok',
    daysLeft,
    range,
    label: humanLeft(daysLeft),
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
};

/** Căn cần người khởi tạo động vào: thiếu HĐ, HĐ quá hạn hoặc sắp hết hạn. */
export const leaseNeedsAttention = (b: PropertyResponse): boolean =>
  leaseTerm(b).health !== 'ok';
