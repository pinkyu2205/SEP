// Các kiểu dùng chung cho Public Website Hoàng Bình Land

/** Trạng thái tải dữ liệu cho UI */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/** Một tuỳ chọn dropdown/filter chung */
export interface SelectOption<T = string> {
  label: string;
  value: T;
}

/** Kết quả phân trang chuẩn để dễ thay mock data bằng API thật */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Thông tin liên hệ của công ty (footer, hotline, trang liên hệ) */
export interface CompanyContact {
  hotline: string;
  zalo: string;
  email: string;
  address: string;
}
