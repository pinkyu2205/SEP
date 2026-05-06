/**
 * Format số tiền VNĐ
 * @example formatCurrency(3500000) => "3.500.000 ₫"
 */
export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('vi-VN') + ' ₫';
};

/**
 * Map trạng thái phòng sang tiếng Việt và màu sắc tương ứng
 */
export const roomStatusMap = {
  available: { label: 'Trống', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  occupied: { label: 'Đang thuê', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  maintenance: { label: 'Bảo trì', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
};

/**
 * Map trạng thái khách thuê sang tiếng Việt và màu sắc
 */
export const tenantStatusMap = {
  pending_activation: { label: 'Chờ kích hoạt', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  active: { label: 'Đang thuê', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  moved_out: { label: 'Đã rời', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

/**
 * Map trạng thái Quản lý
 */
export const managerStatusMap = {
  active: { label: 'Hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  inactive: { label: 'Ngừng HĐ', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

/**
 * Map trạng thái Hợp đồng
 */
export const contractStatusMap = {
  active: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  expiring_soon: { label: 'Sắp hết hạn', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  terminated: { label: 'Đã thanh lý', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

/**
 * Map trạng thái Trang thiết bị
 */
export const equipmentStatusMap = {
  good: { label: 'Hoạt động tốt', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  broken: { label: 'Đang hỏng', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  maintenance: { label: 'Đang sửa chữa', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  disposed: { label: 'Đã thanh lý', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};
