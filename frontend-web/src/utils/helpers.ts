// Các hàm tiện ích thuần (pure) dùng chung toàn app.

/**
 * Bỏ dấu tiếng Việt + hạ chữ thường để tìm kiếm gõ không dấu:
 * "thu duc" khớp "Thủ Đức", "nguyen can" khớp "Nguyên căn".
 */
export const normalizeVi = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

/** Định dạng giá tiền VND, ví dụ 5000000 -> "5.000.000 đ" */
export const formatPrice = (value: number): string =>
  new Intl.NumberFormat('vi-VN').format(value) + ' đ';

/**
 * Rút gọn giá thuê theo tháng, ví dụ "5.000.000 đ/tháng".
 *
 * KHÔNG có giá thì nói "Giá liên hệ", đừng in "0 đ/tháng".
 *
 * Vì sao (10/09/2026): trang công khai đang hiện "0 đ/tháng" trên mọi nhà chia phòng, vì
 * nhà loại đó không có giá ở mức nhà — giá nằm ở từng phòng, mà endpoint phòng công khai
 * hiện trả mảng rỗng. "0 đ/tháng" là một lời khẳng định SAI (nhà không hề miễn phí) và còn
 * lọt được vào bộ lọc "giá tối thiểu"; "Giá liên hệ" nói đúng thứ đang có: chưa biết giá.
 *
 * Đây là lớp che phía hiển thị, không phải bản vá gốc — nguồn giá thật vẫn phải do BE trả
 * về, xem doc-be/BE-YEUCAU-public-rooms-va-cho-trong-2026-09-10.md.
 */
export const formatMonthlyPrice = (value: number): string =>
  value > 0 ? `${formatPrice(value)}/tháng` : 'Giá liên hệ';

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
