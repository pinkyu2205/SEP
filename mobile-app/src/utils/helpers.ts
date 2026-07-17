/**
 * Utility functions cho ứng dụng.
 */

/**
 * Format số tiền VND
 * @example formatCurrency(1500000) => "1.500.000 đ"
 */
export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('vi-VN') + ' đ';
};

/**
 * Format ngày tháng Việt Nam
 * @example formatDate('2026-04-29T10:00:00Z') => "29/04/2026"
 */
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/**
 * Format ngày tháng đầy đủ với giờ
 * @example formatDateTime('2026-04-29T10:00:00Z') => "29/04/2026, 17:00"
 */
export const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Lấy text hiển thị cho trạng thái hóa đơn
 */
export const getInvoiceStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'Chờ thanh toán',
    paid: 'Đã thanh toán',
    overdue: 'Quá hạn',
  };
  return labels[status] || status;
};

/**
 * Lấy text hiển thị cho trạng thái sửa chữa
 */
export const getMaintenanceStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'Chờ xử lý',
    in_progress: 'Đang xử lý',
    resolved: 'Đã giải quyết',
  };
  return labels[status] || status;
};

/**
 * Lấy text hiển thị cho loại sửa chữa
 */
export const getMaintenanceCategoryLabel = (category?: string): string => {
  const labels: Record<string, string> = {
    electrical: 'Điện',
    plumbing: 'Nước',
    furniture: 'Nội thất',
    appliance: 'Trang thiết bị',
    structural: 'Kết cấu / công trình',
    other: 'Khác',
  };
  // category null khi ticket PENDING (manager gán lúc duyệt)
  return category ? (labels[category] || category) : 'Chưa phân loại';
};

/**
 * Rút gọn text dài
 * @example truncateText("Hello World", 5) => "Hello..."
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Lấy tháng/năm hiện tại theo chuỗi
 * @example getCurrentMonthYear() => "Tháng 04/2026"
 */
export const getCurrentMonthYear = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `Tháng ${month}/${now.getFullYear()}`;
};

export const getContractStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    draft: 'Bản nháp',
    waiting_sign: 'Chờ ký',
    active: 'Đang hiệu lực',
    expiring_soon: 'Sắp hết hạn',
    expired: 'Đã hết hạn',
    terminated: 'Đã chấm dứt',
  };
  return labels[status] || status;
};

export const getContractStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    draft: '#94A3B8',
    waiting_sign: '#F59E0B',
    active: '#10B981',
    expiring_soon: '#EF4444',
    expired: '#6B7280',
    terminated: '#EF4444',
  };
  return colors[status] || '#94A3B8';
};

export const getMaintenancePriorityLabel = (priority?: string): string => {
  const labels: Record<string, string> = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
  };
  // priority null khi manager chưa gán lúc duyệt (optional theo flow 17/07 chiều)
  return priority ? (labels[priority] || priority) : '—';
};

export const getMaintenancePriorityColor = (priority?: string): string => {
  const colors: Record<string, string> = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    urgent: '#7C3AED',
  };
  return priority ? (colors[priority] || '#94A3B8') : '#94A3B8';
};

// ===== Real API enums (UPPERCASE, theo Maintenance_BE_Contract.md) =====

/** Map mọi trạng thái BE (kể cả ASSIGNED/WAITING_PARTS) về 4 trạng thái spec */
export const normalizeReqStatus = (
  s: string | undefined,
): 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED' => {
  switch ((s ?? '').toUpperCase()) {
    case 'PENDING':
    case 'OPEN':
      return 'PENDING';
    case 'ASSIGNED':
    case 'ACCEPTED':
    case 'IN_PROGRESS':
    case 'WAITING_PARTS':
      return 'IN_PROGRESS';
    case 'RESOLVED':
    case 'DONE':
    case 'COMPLETED':
      return 'RESOLVED';
    case 'CANCELLED':
    case 'CANCELED':
    case 'REJECTED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
};

export const getReqStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    IN_PROGRESS: 'Đang xử lý',
    RESOLVED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
  };
  return labels[normalizeReqStatus(status)];
};

export const getReqStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    PENDING: '#EF4444',
    IN_PROGRESS: '#3B82F6',
    RESOLVED: '#10B981',
    CANCELLED: '#94A3B8',
  };
  return colors[normalizeReqStatus(status)];
};

export const getReqPriorityLabel = (priority: string): string => {
  const labels: Record<string, string> = {
    LOW: 'Thấp',
    MEDIUM: 'Trung bình',
    HIGH: 'Cao',
    URGENT: 'Khẩn cấp',
  };
  return labels[(priority ?? '').toUpperCase()] || priority;
};

export const getReqPriorityColor = (priority: string): string => {
  const colors: Record<string, string> = {
    LOW: '#10B981',
    MEDIUM: '#F59E0B',
    HIGH: '#EF4444',
    URGENT: '#7C3AED',
  };
  return colors[(priority ?? '').toUpperCase()] || '#94A3B8';
};

export const getReqCategoryLabel = (category?: string | null): string => {
  const labels: Record<string, string> = {
    ELECTRICAL: 'Điện',
    PLUMBING: 'Nước',
    FURNITURE: 'Nội thất',
    APPLIANCE: 'Trang thiết bị',
    STRUCTURAL: 'Kết cấu / công trình',
    OTHER: 'Khác',
  };
  return category ? (labels[category.toUpperCase()] || category) : 'Chưa phân loại';
};

export const getEquipmentLifecycleLabel = (status: string): string => {
  const labels: Record<string, string> = {
    NEW: 'Mới lắp đặt',
    GOOD: 'Hoạt động tốt',
    DAMAGED: 'Hỏng hóc',
    MAINTENANCE: 'Đang bảo trì',
    BROKEN: 'Đang hỏng',
    DISPOSED: 'Đã thanh lý',
  };
  return labels[(status ?? '').toUpperCase()] || status;
};

export const getEquipmentLifecycleColor = (status: string): { bg: string; text: string } => {
  const colors: Record<string, { bg: string; text: string }> = {
    NEW:         { bg: '#EFF6FF', text: '#2563EB' },
    GOOD:        { bg: '#F0FDF4', text: '#10B981' },
    DAMAGED:     { bg: '#FEF2F2', text: '#EF4444' },
    MAINTENANCE: { bg: '#FFFBEB', text: '#F59E0B' },
    BROKEN:      { bg: '#FEF2F2', text: '#EF4444' },
    DISPOSED:    { bg: '#F1F5F9', text: '#64748B' },
  };
  return colors[(status ?? '').toUpperCase()] || colors.GOOD;
};

/** Thiết bị cần chú ý (hiện trong ô "Cần kiểm tra" của danh sách thiết bị phòng). */
export const equipmentNeedsAttention = (status: string): boolean =>
  ['DAMAGED', 'MAINTENANCE', 'BROKEN'].includes((status ?? '').toUpperCase());

export const getHouseAreaLabel = (area?: string): string => {
  const labels: Record<string, string> = {
    LIVING_ROOM: 'Phòng khách',
    BEDROOM: 'Phòng ngủ',
    KITCHEN: 'Nhà bếp',
    BATHROOM: 'Nhà vệ sinh',
    BALCONY: 'Ban công',
    GARAGE: 'Nhà xe',
    OTHER: 'Khác',
  };
  return labels[(area ?? '').toUpperCase()] || 'Khác';
};

/**
 * Đoán loại sự cố (cho form báo hỏng) từ tên thiết bị thật (catalogName của BE,
 * vd "Điều hòa", "Vòi sen + bồn cầu") — BE không lưu category dạng phân loại sẵn.
 */
export const guessEquipmentCategory = (
  equipmentName: string,
): 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other' => {
  const n = (equipmentName ?? '').toLowerCase();
  if (/vòi|bồn|ống nước|nóng lạnh|bơm nước/.test(n)) return 'plumbing';
  if (/đèn|ổ cắm|ổ điện|dây điện|công tắc/.test(n)) return 'electrical';
  if (/tủ|giường|bàn|ghế|kệ|sofa|rèm/.test(n)) return 'furniture';
  if (/điều hòa|quạt|tivi|tv|máy giặt|tủ lạnh|máy nước/.test(n)) return 'appliance';
  return 'other';
};

export const getNotificationTypeEmoji = (type: string): string => {
  const map: Record<string, string> = {
    new_bill: '📄',
    bill_overdue: '⚠️',
    payment_success: '✅',
    payment_failed: '❌',
    payment_pending_verify: '🕐',
    contract_expiring: '📋',
    contract_expired: '📋',
    maintenance_new: '🔧',
    maintenance_accepted: '🔧',
    maintenance_resolved: '✅',
    equipment_damaged: '⚙️',
    meter_reading_due: '📊',
    tenant_onboarded: '🏠',
    system: '🔔',
  };
  return map[type] || '🔔';
};

export const getDaysUntil = (dateStr: string): number => {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return formatDate(dateStr);
};
