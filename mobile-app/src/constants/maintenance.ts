/**
 * Cấu hình dùng chung cho luồng Bảo trì (tenant + manager).
 *
 * Nguồn sự thật duy nhất cho trạng thái / mức ưu tiên / loại sự cố, tránh mỗi
 * màn hình tự định nghĩa lại (lệch màu, lệch nhãn).
 *
 * FLOW MỚI 17/07 (FE-maintenance-flow — sửa ngoài hệ thống, không lịch hẹn/chi phí):
 *   pending → approved → waiting_confirm → closed
 *   nhánh phụ: rejected (tenant từ chối, manager review-reject), cancelled.
 *   Chi phí/khấu hao/penalty nằm ở luồng hóa đơn SAU khi closed.
 *
 * Map BE enum ↔ FE key: xem BE_STATUS_MAP trong services/shared/maintenanceMappers.
 */

export type MaintenanceStatusKey =
  | 'pending'          // chờ manager duyệt
  | 'approved'         // đã duyệt, chờ thợ ngoài sửa
  | 'waiting_confirm'  // manager báo xong, chờ tenant xác nhận
  | 'rejected'         // tenant từ chối kèm lý do + ảnh
  | 'closed'           // kết thúc
  | 'cancelled';

export type MaintenancePriorityKey = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceCategoryKey = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'structural' | 'other';

/** Happy-path tuyến tính để vẽ thanh tiến độ. */
export const MAINTENANCE_STATUS_FLOW: MaintenanceStatusKey[] = [
  'pending', 'approved', 'waiting_confirm', 'closed',
];

export interface StatusMeta {
  /** nhãn ngắn */
  label: string;
  /** màu nhấn (text + dot) */
  color: string;
  /** nền nhạt cho badge */
  bg: string;
  /** emoji/icon */
  icon: string;
  /** vị trí trong STATUS_FLOW; trạng thái phụ = -1 */
  step: number;
}

export const MAINTENANCE_STATUS_META: Record<MaintenanceStatusKey, StatusMeta> = {
  pending:         { label: 'Chờ duyệt',       color: '#F59E0B', bg: '#FFFBEB', icon: '⏳', step: 0 },
  approved:        { label: 'Đang sửa chữa',   color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧', step: 1 },
  waiting_confirm: { label: 'Chờ nghiệm thu',  color: '#14B8A6', bg: '#F0FDFA', icon: '🛠', step: 2 },
  rejected:        { label: 'Khách từ chối',   color: '#EF4444', bg: '#FEF2F2', icon: '↩️', step: -1 },
  closed:          { label: 'Hoàn tất',        color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 3 },
  cancelled:       { label: 'Đã hủy',          color: '#6B7280', bg: '#F3F4F6', icon: '✕',  step: -1 },
};

export interface PriorityMeta {
  label: string;
  color: string;
  bg: string;
}

export const MAINTENANCE_PRIORITY_META: Record<MaintenancePriorityKey, PriorityMeta> = {
  urgent: { label: 'Khẩn cấp',   color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: 'Cao',        color: '#F97316', bg: '#FFF7ED' },
  medium: { label: 'Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: 'Thấp',       color: '#10B981', bg: '#F0FDF4' },
};

export const MAINTENANCE_CATEGORY_EMOJI: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', structural: '🧱', other: '🔧',
};

export const MAINTENANCE_CATEGORY_LABEL: Record<string, string> = {
  electrical: 'Điện', plumbing: 'Nước', furniture: 'Nội thất', appliance: 'Trang thiết bị',
  structural: 'Kết cấu / công trình', other: 'Khác',
};

/** Bước kế tiếp trong luồng xử lý (happy path). */
export const MAINTENANCE_NEXT_STATUS: Record<MaintenanceStatusKey, MaintenanceStatusKey | null> = {
  pending:         'approved',        // manager duyệt
  approved:        'waiting_confirm', // manager báo sửa xong (kèm ảnh AFTER)
  waiting_confirm: 'closed',          // tenant confirm / auto-confirm 3 ngày
  rejected:        'approved',        // manager chấp nhận sửa lại (review-reject approve=true)
  closed:          null,
  cancelled:       null,
};

/** Số ngày chờ tenant phản hồi trước khi hệ thống tự đóng (BE maintenance.auto-confirm-days). */
export const MAINTENANCE_AUTO_CONFIRM_DAYS = 3;

/**
 * SLA mục tiêu hoàn tất (ngày) theo mức ưu tiên. Dùng để cảnh báo quá hạn động
 * thay cho ngưỡng cố định 3 ngày.
 */
export const MAINTENANCE_SLA_DAYS: Record<MaintenancePriorityKey, number> = {
  urgent: 1,
  high:   2,
  medium: 4,
  low:    7,
};

/** Số lần sửa của 1 thiết bị mà vượt qua thì khuyến nghị thay mới. */
export const EQUIPMENT_REPLACE_SUGGEST_COUNT = 3;
