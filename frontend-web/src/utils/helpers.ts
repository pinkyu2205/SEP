// Các hàm tiện ích thuần (pure) cho Public Website.

/** Định dạng giá tiền VND, ví dụ 5000000 -> "5.000.000 đ" */
export const formatPrice = (value: number): string =>
  new Intl.NumberFormat('vi-VN').format(value) + ' đ';

/** Rút gọn giá thuê theo tháng, ví dụ "5.000.000 đ/tháng" */
export const formatMonthlyPrice = (value: number): string => `${formatPrice(value)}/tháng`;

/** Định dạng diện tích, ví dụ 25 -> "25 m²" */
export const formatArea = (value: number): string => `${value} m²`;

/** Định dạng ngày theo tiếng Việt */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Tạo link gọi điện từ số hotline (bỏ khoảng trắng) */
export const telHref = (phone: string): string => `tel:${phone.replace(/\s+/g, '')}`;

/** Tạo link mailto */
export const mailHref = (email: string): string => `mailto:${email}`;
