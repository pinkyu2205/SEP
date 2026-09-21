/**
 * Cấu hình dùng chung cho luồng Bảo trì (tenant + manager).
 *
 * Nguồn sự thật duy nhất cho trạng thái / mức ưu tiên / loại sự cố, tránh mỗi
 * màn hình tự định nghĩa lại (lệch màu, lệch nhãn).
 *
 * REDESIGN 01/09/2026 (BE commit 8ddbc3e/28b177b) + LỊCH HẸN/QUÉT QR 05/09/2026
 * (BE commit e0b1d2d, as-built — xem docs/maintenance-appointment-implementation-spec.md):
 *   Luồng A (hao mòn/lỗi chủ): open → [repair_scheduled →] in_repair → closed
 *   Luồng B (lỗi tenant):      open → [repair_scheduled →] tenant_fault → closed (manager sửa hộ, tự charge)
 *                              open → pending_tenant_repair → closed | outstanding_damage
 * repair_scheduled chỉ xuất hiện khi manager chọn "đặt lịch sửa sau" thay vì sửa ngay.
 * Không còn tenant confirm/reject nghiệm thu, không còn reopen cùng phiếu, không còn
 * cost-dispute trong module này (chuyển sang billingHint tự động).
 *
 * Map BE enum ↔ FE key: xem BE_STATUS_MAP trong services/shared/maintenanceMappers.
 */

export type MaintenanceStatusKey =
  | 'open'                   // chờ manager tới xem (đã có lịch hẹn)
  | 'repair_scheduled'        // đã duyệt/báo lỗi, chọn đặt lịch sửa sau thay vì sửa ngay
  | 'in_repair'                // đang sửa
  | 'tenant_fault'              // lỗi tenant, manager sẽ sửa hộ rồi charge
  | 'pending_tenant_repair'    // giao tenant tự sửa trước deadline
  | 'outstanding_damage'       // quá hạn/không đạt — chờ checkout trừ cọc
  | 'waiting_payment'          // đã sửa/bàn giao xong, chờ khách thanh toán — trả xong BE tự đóng phiếu
  | 'closed'                   // hoàn tất
  | 'cancelled';

export type MaintenancePriorityKey = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceCategoryKey = 'appliance' | 'furniture' | 'plumbing' | 'electrical';
export type MaintenanceBillingHintKey = 'host_paid' | 'tenant_charge_pending' | 'deposit_deduction_pending' | 'none';

/** Happy-path Luồng A để vẽ thanh tiến độ — Luồng B rẽ nhánh nên không nằm trong đây. */
export const MAINTENANCE_STATUS_FLOW: MaintenanceStatusKey[] = [
  'open', 'in_repair', 'closed',
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
  /** vị trí trong STATUS_FLOW (Luồng A); rẽ nhánh Luồng B hoặc trạng thái phụ = -1 */
  step: number;
}

export const MAINTENANCE_STATUS_META: Record<MaintenanceStatusKey, StatusMeta> = {
  open:                   { label: 'Chờ kiểm tra',      color: '#F59E0B', bg: '#FFFBEB', icon: '⏳', step: 0 },
  repair_scheduled:        { label: 'Đã đặt lịch sửa',   color: '#2563EB', bg: '#EFF6FF', icon: '📅', step: -1 },
  in_repair:               { label: 'Đang sửa chữa',     color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧', step: 1 },
  tenant_fault:            { label: 'Lỗi do khách',      color: '#DC2626', bg: '#FEF2F2', icon: '⚠️', step: -1 },
  pending_tenant_repair:  { label: 'Khách tự sửa',      color: '#F97316', bg: '#FFF7ED', icon: '🛠', step: -1 },
  outstanding_damage:     { label: 'Chờ trừ cọc',       color: '#B91C1C', bg: '#FEF2F2', icon: '💸', step: -1 },
  waiting_payment:         { label: 'Chờ thanh toán',    color: '#B45309', bg: '#FFFBEB', icon: '💳', step: -1 },
  closed:                 { label: 'Hoàn tất',          color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 2 },
  cancelled:              { label: 'Đã hủy',            color: '#6B7280', bg: '#F3F4F6', icon: '✕',  step: -1 },
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

/** Chỉ còn 4 loại (STRUCTURAL/OTHER đã bỏ — xem doc §3.4). */
export const MAINTENANCE_CATEGORY_EMOJI: Record<string, string> = {
  appliance: '📺', furniture: '🪑', plumbing: '🚰', electrical: '⚡',
};

export const MAINTENANCE_CATEGORY_LABEL: Record<string, string> = {
  appliance: 'Trang thiết bị', furniture: 'Nội thất', plumbing: 'Nước', electrical: 'Điện',
};

export interface BillingHintMeta {
  label: string;
  detail: string;
  color: string;
  bg: string;
}

/** Gợi ý FE render khối chi phí trên detail — xem MaintenanceBillingHint (BE). */
export const MAINTENANCE_BILLING_HINT_META: Record<MaintenanceBillingHintKey, BillingHintMeta> = {
  host_paid: {
    label: 'Chủ nhà chi trả', color: '#0369A1', bg: '#F0F9FF',
    detail: 'Số tiền dưới đây chỉ mang tính tham khảo — bạn không cần thanh toán.',
  },
  tenant_charge_pending: {
    label: 'Cần thanh toán', color: '#B45309', bg: '#FFFBEB',
    detail: 'Chi phí sửa chữa do lỗi của khách — quét mã QR bên dưới để thanh toán.',
  },
  deposit_deduction_pending: {
    label: 'Sẽ trừ vào tiền cọc', color: '#B91C1C', bg: '#FEF2F2',
    detail: 'Khoản thiệt hại này sẽ được chốt và trừ vào tiền cọc khi bạn trả phòng.',
  },
  none: { label: '', detail: '', color: '#6B7280', bg: '#F3F4F6' },
};

/** Bước kế tiếp trong Luồng A (happy path). Luồng B rẽ nhánh — không đoán trước. */
export const MAINTENANCE_NEXT_STATUS: Record<MaintenanceStatusKey, MaintenanceStatusKey | null> = {
  open:                   'in_repair',   // manager duyệt (hao mòn) — hoặc reject-fault sang Luồng B, hoặc repair_scheduled nếu đặt lịch sau
  repair_scheduled:        'in_repair',   // manager quét QR bắt đầu sửa (start-repair) — hoặc tenant_fault tuỳ flowType
  in_repair:               'closed',      // manager báo sửa xong (kèm ảnh AFTER + hoá đơn)
  tenant_fault:            'closed',      // manager sửa hộ xong (complete — tự tạo charge)
  pending_tenant_repair:  'closed',      // verify-repair accepted — hoặc outstanding_damage nếu reject/quá hạn
  outstanding_damage:     null,
  waiting_payment:         'closed',      // khách thanh toán hoá đơn bảo trì → BE tự đóng phiếu
  closed:                 null,
  cancelled:              null,
};

/**
 * SLA mục tiêu hoàn tất (ngày) theo mức ưu tiên. Dùng để cảnh báo quá hạn động
 * thay cho ngưỡng cố định.
 */
export const MAINTENANCE_SLA_DAYS: Record<MaintenancePriorityKey, number> = {
  urgent: 1,
  high:   2,
  medium: 4,
  low:    7,
};

/** Số lần sửa của 1 thiết bị mà vượt qua thì khuyến nghị thay mới. */
export const EQUIPMENT_REPLACE_SUGGEST_COUNT = 3;

/** Gợi ý FE prefill deadline tự sửa (BE config maintenance.self-repair-default-days —
 * BE KHÔNG tự áp dụng, reject-fault sẽ 422 nếu FE không tự gửi selfRepairDeadline). */
export const MAINTENANCE_SELF_REPAIR_DEFAULT_DAYS = 14;

/**
 * Lịch hẹn bảo trì (05/09/2026) — khớp đúng hằng số phía BE (`MaintenanceServiceImpl`):
 * giờ hành chính 07:00–18:00 (kể cả giờ kết thúc slot), slot cố định 30p cho lịch xem
 * (VISIT), 60p cho lịch sửa (REPAIR). Đổi 3 số này ở đây thì BE vẫn validate theo số
 * riêng của BE — chỉ để FE tô lưới giờ/tính giờ kết thúc khớp, không phải nguồn sự thật.
 */
export const MAINTENANCE_BUSINESS_START_HOUR = 7;
export const MAINTENANCE_BUSINESS_END_HOUR = 18;
export const MAINTENANCE_VISIT_SLOT_MINUTES = 30;
export const MAINTENANCE_REPAIR_SLOT_MINUTES = 60;
