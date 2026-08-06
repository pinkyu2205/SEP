import type { TenantContractResponse } from '@/services/tenant/tenantService';

/**
 * Suy trạng thái hiển thị của HỢP ĐỒNG KHÁCH THUÊ từ dữ liệu BE.
 *
 * BE trả 2 trường rời nhau: `status` (vòng đời HĐ) và `priceApprovalStatus` (luồng
 * gửi Host duyệt giá). Gộp lại thành 1 trạng thái duy nhất để UI khỏi phải nhớ luật.
 * Dùng chung cho màn Hợp đồng tổng và màn Hợp đồng theo nhà — 1 nguồn sự thật.
 */
export type ContractUiStatus =
  | 'pending_approval'   // chờ Host duyệt giá
  | 'rejected'           // Host từ chối giá
  | 'waiting_deposit'    // đã tạo/duyệt giá, chờ thu cọc + OTP để kích hoạt
  | 'active'             // đang thuê
  | 'expiring_soon'      // đang thuê, còn ≤30 ngày
  | 'expired'            // hết hạn, chưa thanh lý
  | 'terminated';        // đã thanh lý / trả phòng xong

/** Còn bao nhiêu ngày tới `iso` (âm = đã qua). null nếu không có ngày. */
export const daysUntil = (iso?: string): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

/** Ngưỡng cảnh báo "sắp hết hạn" — dùng chung cho mọi màn. */
export const EXPIRING_SOON_DAYS = 30;

export const mapContractStatus = (c: TenantContractResponse): ContractUiStatus => {
  const pa = (c.priceApprovalStatus || '').toUpperCase();
  if (pa === 'PENDING_PRICE_APPROVAL') return 'pending_approval';
  if (pa === 'PRICE_REJECTED') return 'rejected';
  if (pa === 'APPROVED_AWAITING_DEPOSIT') return 'waiting_deposit';

  const s = (c.status || '').toUpperCase();
  if (s === 'TERMINATED' || s === 'CANCELLED') return 'terminated';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'ACTIVE') {
    const d = daysUntil(c.endDate);
    return d != null && d >= 0 && d <= EXPIRING_SOON_DAYS ? 'expiring_soon' : 'active';
  }
  return 'waiting_deposit';   // PENDING / DRAFT: đã lập HĐ nhưng chưa có hiệu lực
};

export interface ContractStatusMeta {
  label: string;
  /** Câu giải thích ngắn cho quản lý biết đang phải làm gì. */
  hint: string;
  color: string;
  bg: string;
  icon: string;
}

export const CONTRACT_STATUS_META: Record<ContractUiStatus, ContractStatusMeta> = {
  pending_approval: { label: 'Chờ duyệt giá', hint: 'Đang chờ chủ nhà duyệt giá thuê', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  rejected:         { label: 'Bị từ chối giá', hint: 'Chủ nhà không đồng ý giá, cần chỉnh lại', color: '#EF4444', bg: '#FEF2F2', icon: '❌' },
  waiting_deposit:  { label: 'Chờ nhận phòng', hint: 'Chờ khách đóng cọc và xác nhận OTP', color: '#3B82F6', bg: '#EFF6FF', icon: '🕗' },
  active:           { label: 'Đang thuê',      hint: 'Hợp đồng đang có hiệu lực', color: '#10B981', bg: '#F0FDF4', icon: '🟢' },
  expiring_soon:    { label: 'Sắp hết hạn',    hint: 'Liên hệ khách để gia hạn hoặc chuẩn bị trả phòng', color: '#F97316', bg: '#FFF7ED', icon: '⏰' },
  expired:          { label: 'Đã hết hạn',     hint: 'Hết hạn nhưng chưa thanh lý', color: '#EF4444', bg: '#FEF2F2', icon: '🚫' },
  terminated:       { label: 'Đã kết thúc',    hint: 'Khách đã trả phòng, hợp đồng đã thanh lý', color: '#94A3B8', bg: '#F8FAFC', icon: '🔒' },
};

/** Nhóm gọn để đếm/lọc: đang thuê · cần để ý · đã xong. */
export const isLivingStatus = (s: ContractUiStatus) => s === 'active' || s === 'expiring_soon';
export const isEndedStatus = (s: ContractUiStatus) => s === 'expired' || s === 'terminated';

/**
 * Hợp đồng ĐÃ ĐÓNG HỒ SƠ — khách trả phòng xong, đã thanh lý. Các màn vận hành
 * (Hợp đồng theo nhà, Khách thuê) ẩn hẳn nhóm này cho gọn, chỉ hiển thị người đang thuê.
 *
 * EXPIRED cố tình KHÔNG nằm ở đây: hết hạn nhưng chưa làm thủ tục trả phòng thì khách
 * vẫn đang ở, quản lý vẫn phải thấy để gia hạn hoặc hẹn ngày trả phòng.
 * Nhận status THÔ của BE (TenantContractResponse.status).
 */
const CLOSED_RAW_STATUSES = ['TERMINATED', 'CANCELLED', 'CANCELED', 'ENDED', 'MOVED_OUT', 'CLOSED'];

export const isClosedContract = (rawStatus?: string): boolean =>
  CLOSED_RAW_STATUSES.includes((rawStatus || '').toUpperCase());
