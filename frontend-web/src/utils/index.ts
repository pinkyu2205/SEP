/**
 * Tiền VND — luôn làm tròn về đồng nguyên.
 * BE trả BigDecimal có phần thập phân ở các số chia tỷ lệ (vd chi phí thuê nhà
 * phân bổ theo tháng → 107.391.304,3478…). VND không có đơn vị nhỏ hơn đồng nên
 * hiển thị phần lẻ chỉ gây nhiễu. Ép Number để chịu được cả chuỗi số BE trả về.
 */
export const formatCurrency = (amount: number): string => {
  return Math.round(Number(amount) || 0).toLocaleString('vi-VN') + ' ₫';
};
/**
 * Hiển thị số có dấu phân cách nghìn NGAY KHI GÕ ("22435000" → "22.435.000").
 *
 * Dùng cho các ô nhập số tiền / số lượng: state gốc vẫn là chuỗi CHỈ CHỮ SỐ, chỗ này chỉ
 * lo phần nhìn. Nhập "22435000" trần thì mắt không đếm nổi mấy chữ số — mà đây là ô quyết
 * định tổng tiền của cả một hoá đơn, gõ dư một số 0 là sai gấp mười lần.
 *
 * Cặp với `onlyDigits` ở chiều ngược lại (utils/evnInvoiceParser).
 */
export const groupThousands = (raw: string): string => {
  const digits = (raw || '').replace(/[^\d]/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};


export const roomStatusMap = {
  available:   { label: 'Còn trống',   color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  occupied:    { label: 'Đang thuê',   color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  maintenance: { label: 'Bảo trì',     color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
};

export const tenantStatusMap = {
  pending_activation: { label: 'Chờ kích hoạt', color: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  active:             { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  moved_out:          { label: 'Đã rời đi',      color: 'bg-slate-100 text-slate-500',    dot: 'bg-slate-400' },
};

export const managerStatusMap = {
  active:   { label: 'Hoạt động',      color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { label: 'Ngừng hoạt động', color: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-400' },
  on_leave: { label: 'Tạm nghỉ phép',  color: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
};

export const contractStatusMap = {
  pending_approval: { label: 'Chờ phê duyệt',  color: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  active:           { label: 'Đang hiệu lực',   color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  expiring_soon:    { label: 'Sắp hết hạn',     color: 'bg-rose-100 text-rose-700',      dot: 'bg-rose-500' },
  terminated:       { label: 'Đã chấm dứt',     color: 'bg-slate-100 text-slate-500',    dot: 'bg-slate-400' },
};

export const equipmentStatusMap = {
  good:        { label: 'Hoạt động tốt',  color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  broken:      { label: 'Đang hỏng',      color: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500' },
  maintenance: { label: 'Đang sửa chữa', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  disposed:    { label: 'Đã thanh lý',   color: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
};

export const maintenancePriorityMap = {
  critical: { label: 'Khẩn cấp',    color: 'bg-rose-100 text-rose-700 border border-rose-200',      dot: 'bg-rose-600' },
  high:     { label: 'Cao',         color: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  medium:   { label: 'Trung bình',  color: 'bg-amber-100 text-amber-700 border border-amber-200',    dot: 'bg-amber-500' },
  low:      { label: 'Thấp',        color: 'bg-slate-100 text-slate-600 border border-slate-200',    dot: 'bg-slate-400' },
};

export const maintenanceStatusMap = {
  open:        { label: 'Chờ xử lý',   color: 'bg-rose-50 text-rose-700' },
  in_progress: { label: 'Đang xử lý',  color: 'bg-blue-50 text-blue-700' },
  resolved:    { label: 'Đã hoàn thành', color: 'bg-emerald-50 text-emerald-700' },
  cancelled:   { label: 'Đã hủy',      color: 'bg-slate-100 text-slate-500' },
};

// =============================================================================
// Maintenance Module (real API, theo Maintenance_BE_Contract.md)
// Enum UPPERCASE khớp BE: PENDING / IN_PROGRESS / RESOLVED / CANCELLED
// =============================================================================

type Badge = { label: string; color: string; dot: string };

// Flow bảo trì mới 17/07: PENDING → APPROVED → WAITING_TENANT_CONFIRM → CLOSED
// (nhánh REJECTED/CANCELLED). Web host chỉ giám sát — gom về 4 bucket hiển thị.
/** 7 trạng thái thật (enum MaintenanceStatus bên BE) — dùng thẳng cho badge từng dòng. */
export const maintenanceReqStatusMap: Record<string, Badge> = {
  OPEN:                  { label: 'Chờ kiểm tra',  color: 'bg-amber-50 text-amber-700 border border-amber-200',   dot: 'bg-amber-500' },
  IN_REPAIR:             { label: 'Đang sửa chữa', color: 'bg-violet-50 text-violet-700 border border-violet-200', dot: 'bg-violet-500' },
  TENANT_FAULT:          { label: 'Lỗi do khách',  color: 'bg-rose-50 text-rose-700 border border-rose-200',      dot: 'bg-rose-500' },
  PENDING_TENANT_REPAIR: { label: 'Khách tự sửa',  color: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  OUTSTANDING_DAMAGE:    { label: 'Chờ trừ cọc',   color: 'bg-red-100 text-red-800 border border-red-300',        dot: 'bg-red-600' },
  WAITING_PAYMENT:       { label: 'Chờ thanh toán', color: 'bg-amber-50 text-amber-800 border border-amber-300',  dot: 'bg-amber-600' },
  CLOSED:                { label: 'Hoàn tất',      color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500' },
  CANCELLED:             { label: 'Đã hủy',        color: 'bg-slate-100 text-slate-500 border border-slate-200', dot: 'bg-slate-400' },
};

export const maintenanceReqPriorityMap: Record<string, Badge> = {
  URGENT: { label: 'Khẩn cấp',   color: 'bg-rose-100 text-rose-700 border border-rose-200',       dot: 'bg-rose-600' },
  HIGH:   { label: 'Cao',        color: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
  MEDIUM: { label: 'Trung bình', color: 'bg-amber-100 text-amber-700 border border-amber-200',    dot: 'bg-amber-500' },
  LOW:    { label: 'Thấp',       color: 'bg-slate-100 text-slate-600 border border-slate-200',    dot: 'bg-slate-400' },
};

/** Chỉ còn 4 loại — STRUCTURAL/OTHER đã bỏ khỏi redesign 2026-09. */
export const maintenanceCategoryMap: Record<string, string> = {
  APPLIANCE:  'Trang thiết bị',
  FURNITURE:  'Nội thất',
  PLUMBING:   'Nước',
  ELECTRICAL: 'Điện',
};

/** Gợi ý hiển thị khối chi phí theo MaintenanceBillingHint (BE). */
export const maintenanceBillingHintMap: Record<string, string> = {
  HOST_PAID: 'Chủ nhà chi trả — số tiền chỉ mang tính tham khảo.',
  TENANT_CHARGE_PENDING: 'Chi phí do lỗi khách — đã tạo hoá đơn cho khách.',
  DEPOSIT_DEDUCTION_PENDING: 'Sẽ trừ vào tiền cọc khi khách trả phòng.',
  NONE: '',
};

export const equipmentLifecycleMap: Record<string, Badge> = {
  GOOD:        { label: 'Hoạt động tốt', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  MAINTENANCE: { label: 'Đang bảo trì',  color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  BROKEN:      { label: 'Đang hỏng',     color: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500' },
  DISPOSED:    { label: 'Đã thanh lý',   color: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
};

/**
 * Bucket 4 khối CHỈ dùng cho KPI dashboard fallback (khớp
 * MaintenanceRequestRepository.countOpen/countInProgress/countResolved/countCancelled
 * bên BE) khi gọi GET /maintenance/dashboard lỗi phải tự tính từ list. KHÔNG dùng
 * để hiển thị badge từng dòng — badge dùng thẳng maintenanceReqStatusMap[status]
 * (7 trạng thái thật, xem enum MaintenanceStatus).
 * OUTSTANDING_DAMAGE: bucket dashboard thật của BE không đếm nó vào đâu cả — ở đây
 * gộp tạm vào IN_PROGRESS để KPI fallback không "mất" phiếu.
 */
export function normalizeMaintenanceStatus(
  s: string | undefined,
): 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED' {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN':
      return 'PENDING';
    case 'IN_REPAIR':
    case 'TENANT_FAULT':
    case 'PENDING_TENANT_REPAIR':
    case 'OUTSTANDING_DAMAGE':
    case 'WAITING_PAYMENT':
      return 'IN_PROGRESS';
    case 'CLOSED':
      return 'RESOLVED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

export const notificationTypeConfig = {
  contract_expiry:   { label: 'Hợp đồng hết hạn',   bgColor: 'bg-amber-50',  textColor: 'text-amber-600' },
  unpaid_invoice:    { label: 'Hóa đơn chưa thu',   bgColor: 'bg-rose-50',   textColor: 'text-rose-600' },
  maintenance_delay: { label: 'Bảo trì trễ hạn',    bgColor: 'bg-orange-50', textColor: 'text-orange-600' },
  occupancy_alert:   { label: 'Cảnh báo phòng trống', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  approval_needed:   { label: 'Chờ phê duyệt',      bgColor: 'bg-indigo-50', textColor: 'text-indigo-600' },
};
