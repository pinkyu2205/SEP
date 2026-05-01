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
export const getMaintenanceCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    electrical: 'Điện',
    plumbing: 'Nước',
    furniture: 'Nội thất',
    appliance: 'Thiết bị',
    other: 'Khác',
  };
  return labels[category] || category;
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
