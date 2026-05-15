export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('vi-VN') + ' ₫';
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

export const notificationTypeConfig = {
  contract_expiry:   { label: 'Hợp đồng hết hạn',   bgColor: 'bg-amber-50',  textColor: 'text-amber-600' },
  unpaid_invoice:    { label: 'Hóa đơn chưa thu',   bgColor: 'bg-rose-50',   textColor: 'text-rose-600' },
  maintenance_delay: { label: 'Bảo trì trễ hạn',    bgColor: 'bg-orange-50', textColor: 'text-orange-600' },
  occupancy_alert:   { label: 'Cảnh báo phòng trống', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  approval_needed:   { label: 'Chờ phê duyệt',      bgColor: 'bg-indigo-50', textColor: 'text-indigo-600' },
};
