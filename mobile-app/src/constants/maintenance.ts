/**
 * Cấu hình dùng chung cho luồng Bảo trì (tenant + manager).
 *
 * Nguồn sự thật duy nhất cho trạng thái / mức ưu tiên / loại sự cố, tránh mỗi
 * màn hình tự định nghĩa lại (lệch màu, lệch nhãn).
 *
 * LUỒNG CẢI THIỆN (rich state machine — BE đã hỗ trợ ĐỦ các trạng thái này):
 *   pending → acknowledged → scheduled → in_progress → done → confirmed
 *   nhánh phụ: on_hold (chờ phụ tùng), pending_approval (chờ duyệt chi phí),
 *              reopened (khách từ chối nghiệm thu), cancelled.
 *
 * Map BE enum ↔ FE key: xem BE_STATUS_MAP trong services/shared/maintenanceMappers.
 */

export type MaintenanceStatusKey =
  | 'pending'
  | 'acknowledged'
  | 'scheduled'
  | 'in_progress'
  | 'on_hold'
  | 'pending_approval'
  | 'done'
  | 'confirmed'
  | 'reopened'   // tenant từ chối nghiệm thu → mở lại
  | 'resolved'   // legacy / terminal đường real-API
  | 'cancelled';

export type MaintenancePriorityKey = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceCategoryKey = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';

/** Happy-path tuyến tính để vẽ thanh tiến độ. */
export const MAINTENANCE_STATUS_FLOW: MaintenanceStatusKey[] = [
  'pending', 'acknowledged', 'scheduled', 'in_progress', 'done', 'confirmed',
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
  pending:          { label: 'Chờ tiếp nhận',  color: '#F59E0B', bg: '#FFFBEB', icon: '⏳', step: 0 },
  acknowledged:     { label: 'Đã tiếp nhận',   color: '#3B82F6', bg: '#EFF6FF', icon: '📋', step: 1 },
  scheduled:        { label: 'Đã hẹn lịch',    color: '#0891B2', bg: '#ECFEFF', icon: '📅', step: 2 },
  in_progress:      { label: 'Đang xử lý',     color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧', step: 3 },
  on_hold:          { label: 'Tạm dừng',       color: '#64748B', bg: '#F1F5F9', icon: '⏸', step: -1 },
  pending_approval: { label: 'Chờ duyệt chi',  color: '#EA580C', bg: '#FFF7ED', icon: '🧾', step: -1 },
  done:             { label: 'Chờ nghiệm thu', color: '#14B8A6', bg: '#F0FDFA', icon: '🛠', step: 4 },
  confirmed:        { label: 'Hoàn tất',       color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 5 },
  reopened:         { label: 'Mở lại',         color: '#EF4444', bg: '#FEF2F2', icon: '↩️', step: -1 },
  resolved:         { label: 'Hoàn tất',       color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 5 },
  cancelled:        { label: 'Đã hủy',         color: '#6B7280', bg: '#F3F4F6', icon: '✕',  step: -1 },
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
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

export const MAINTENANCE_CATEGORY_LABEL: Record<string, string> = {
  electrical: 'Điện', plumbing: 'Nước', furniture: 'Nội thất', appliance: 'Thiết bị', other: 'Khác',
};

/** Bước kế tiếp trong luồng xử lý của manager (happy path). */
export const MAINTENANCE_NEXT_STATUS: Record<MaintenanceStatusKey, MaintenanceStatusKey | null> = {
  pending:          'acknowledged',
  acknowledged:     'scheduled',
  scheduled:        'in_progress',
  in_progress:      'done',        // có thể chen pending_approval nếu vượt ngưỡng
  on_hold:          'in_progress', // resume
  pending_approval: 'done',        // sau khi admin duyệt
  done:             'confirmed',   // tenant nghiệm thu
  confirmed:        null,
  reopened:         'acknowledged', // xử lý lại từ đầu
  resolved:         null,
  cancelled:        null,
};

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

/** Ngưỡng chi phí cần Admin duyệt trước khi đóng ticket (đồng). */
export const MAINTENANCE_COST_APPROVAL_THRESHOLD = 2_000_000;

/** Thư mục kỹ thuật viên / nhà thầu để manager chọn thay vì gõ tay. */
export interface Technician {
  id: string;
  name: string;
  phone: string;
  /** chuyên môn ưu tiên gợi ý theo loại sự cố */
  skills: MaintenanceCategoryKey[];
}

export const MAINTENANCE_TECHNICIANS: Technician[] = [
  { id: 'tech-1', name: 'Thợ điện Nguyễn Quốc', phone: '0909123456', skills: ['electrical'] },
  { id: 'tech-2', name: 'Thợ nước Trần Bình',   phone: '0908123456', skills: ['plumbing'] },
  { id: 'tech-3', name: 'Thợ mộc Lê Hùng',      phone: '0907123456', skills: ['furniture'] },
  { id: 'tech-4', name: 'KTV điện lạnh Phạm Tú', phone: '0906123456', skills: ['appliance'] },
  { id: 'tech-5', name: 'Thợ tổng hợp Võ Nam',  phone: '0905123456', skills: ['electrical', 'plumbing', 'furniture', 'appliance', 'other'] },
];

/** Số lần sửa của 1 thiết bị mà vượt qua thì khuyến nghị thay mới. */
export const EQUIPMENT_REPLACE_SUGGEST_COUNT = 3;
