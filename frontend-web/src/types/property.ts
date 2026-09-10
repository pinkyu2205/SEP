// Kiểu dữ liệu bất động sản cho Public Website (khách thuê / người tìm phòng).
// Tách riêng khỏi các kiểu Admin (property.type.ts) để Public & Dashboard tiến hoá độc lập.

/** Loại hình cho thuê */
export type PropertyType = 'ROOM' | 'WHOLE_HOUSE';

/** Trạng thái cho thuê hiển thị công khai */
export type PropertyStatus = 'AVAILABLE' | 'RENTED';

/** Tiện ích của bất động sản */
export type Amenity =
  | 'WIFI'
  | 'AIR_CONDITIONER'
  | 'CAMERA'
  | 'PARKING'
  | 'KITCHEN'
  | 'WASHING_MACHINE'
  | 'BALCONY'
  | 'ELEVATOR'
  | 'SECURITY_24H';

/** Bất động sản hiển thị trên Public Website */
export interface PublicProperty {
  id: string;
  title: string;
  /** Mô tả ngắn cho card */
  summary: string;
  /** Mô tả chi tiết cho trang detail */
  description: string;
  address: string;
  /** Quận/Huyện - dùng cho filter */
  district: string;
  /** Giá thuê theo tháng (VND) */
  price: number;
  /** Diện tích (m2) */
  area: number;
  type: PropertyType;
  status: PropertyStatus;
  /** Danh sách ảnh (ảnh đầu là ảnh đại diện) */
  images: string[];
  amenities: Amenity[];
  /** Tên thiết bị/tiện ích thực tế từ BE (đã là tên tiếng Việt hiển thị được). */
  rawAmenities?: string[];
  bedrooms?: number;
  bathrooms?: number;
  /** Toạ độ để vẽ bản đồ (nếu BE đã có). */
  latitude?: number | null;
  longitude?: number | null;
  /** Đơn giá điện (VND/kWh). */
  electricityUnitPrice?: number | null;
  /** Đơn giá nước (VND/m³). */
  waterUnitPrice?: number | null;
  /** Số tháng đặt cọc. */
  depositMonths?: number | null;
  /** Phí dịch vụ mỗi tháng (VND). */
  serviceFee?: number | null;
  /**
   * ─── CHỖ CÒN TRỐNG (10/09/2026) ────────────────────────────────────────────
   * Nhà chia phòng: số phòng đang còn trống / tổng số phòng đã mở cho thuê.
   * Nhà nguyên căn: 1/1 khi còn trống, 0/1 khi đã có khách.
   *
   * Trang công khai chỉ liệt kê nhà CÒN CHỖ, nên hai số này còn để nói với khách là còn
   * mấy phòng — "còn 1/4 phòng" và "còn 4/4 phòng" là hai mức độ khẩn cấp khác hẳn nhau.
   * `undefined` = không tra được danh sách phòng (lỗi mạng), khi đó đừng hiện gì cả thay
   * vì hiện số 0 gây hiểu là hết chỗ.
   */
  availableRooms?: number;
  totalRooms?: number;
  /** Hiển thị ở mục "nổi bật" trên trang chủ */
  featured?: boolean;
  createdAt: string;
}

/** Tuỳ chọn sắp xếp danh sách */
export type PropertySort = 'newest' | 'price_asc' | 'price_desc' | 'area_desc';

/** Bộ lọc tìm kiếm bất động sản công khai */
export interface PropertyFilter {
  keyword?: string;
  district?: string;
  type?: PropertyType | '';
  /** Mức giá tối thiểu (VND/tháng) */
  minPrice?: number;
  /** Mức giá tối đa (VND/tháng) */
  maxPrice?: number;
  /** Diện tích tối thiểu (m2) */
  minArea?: number;
  /** Số phòng ngủ tối thiểu */
  bedrooms?: number;
  /** Tiện ích bắt buộc có (lọc AND) */
  amenities?: Amenity[];
  /** Sắp xếp kết quả */
  sort?: PropertySort;
  page?: number;
  pageSize?: number;
}
