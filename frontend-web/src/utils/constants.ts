// Hằng số dùng chung cho Public Website Hoàng Bình Land.
import type { Amenity, PropertyStatus, PropertyType, PropertySort } from '@/types/property';
import type { CompanyContact } from '@/types/common';

/** Thông tin thương hiệu & liên hệ công ty */
export const COMPANY = {
  name: 'Hoàng Bình Land',
  slogan: 'Giải pháp thuê phòng và nhà ở hiện đại',
} as const;

export const CONTACT: CompanyContact = {
  hotline: '1900 8386',
  zalo: '0901 234 567',
  email: 'lienhe@hoangbinhland.vn',
  address: '408/31 Nguyễn Thị Minh Khai, Phường Bàn Cờ, TP. Hồ Chí Minh',
};

/** Liên kết Zalo (mở chat) */
export const ZALO_LINK = 'https://zalo.me/0901234567';

/** Nhãn tiếng Việt cho loại hình cho thuê */
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  ROOM: 'Phòng cho thuê',
  WHOLE_HOUSE: 'Nhà nguyên căn',
};

/** Nhãn + màu cho trạng thái cho thuê */
export const PROPERTY_STATUS_META: Record<PropertyStatus, { label: string; className: string; dot: string }> = {
  AVAILABLE: {
    label: 'Còn trống',
    className: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  RENTED: {
    label: 'Đã thuê',
    className: 'bg-slate-100 text-slate-500',
    dot: 'bg-slate-400',
  },
};

/** Nhãn tiện ích tiếng Việt */
export const AMENITY_LABEL: Record<Amenity, string> = {
  WIFI: 'Wifi',
  AIR_CONDITIONER: 'Máy lạnh',
  CAMERA: 'Camera an ninh',
  PARKING: 'Bãi giữ xe',
  KITCHEN: 'Khu bếp',
  WASHING_MACHINE: 'Máy giặt',
  BALCONY: 'Ban công',
  ELEVATOR: 'Thang máy',
  SECURITY_24H: 'Bảo vệ 24/7',
};

/** Danh sách quận/huyện cho bộ lọc */
export const DISTRICTS: string[] = [
  'Quận 1',
  'Quận 3',
  'Quận 4',
  'Quận 7',
  'Quận Bình Thạnh',
  'Quận Gò Vấp',
  'Quận Phú Nhuận',
  'TP. Thủ Đức',
];

/** Các mốc giá cho bộ lọc (VND/tháng) */
export const PRICE_RANGES: { label: string; value: number }[] = [
  { label: 'Dưới 3 triệu', value: 3_000_000 },
  { label: 'Dưới 5 triệu', value: 5_000_000 },
  { label: 'Dưới 8 triệu', value: 8_000_000 },
  { label: 'Dưới 15 triệu', value: 15_000_000 },
  { label: 'Trên 15 triệu', value: 100_000_000 },
];

/** Các mốc diện tích tối thiểu cho bộ lọc (m²) */
export const AREA_RANGES: { label: string; value: number }[] = [
  { label: 'Từ 20 m²', value: 20 },
  { label: 'Từ 30 m²', value: 30 },
  { label: 'Từ 50 m²', value: 50 },
  { label: 'Từ 80 m²', value: 80 },
  { label: 'Từ 120 m²', value: 120 },
];

/** Tuỳ chọn số phòng ngủ tối thiểu */
export const BEDROOM_OPTIONS: { label: string; value: number }[] = [
  { label: '1+ phòng ngủ', value: 1 },
  { label: '2+ phòng ngủ', value: 2 },
  { label: '3+ phòng ngủ', value: 3 },
  { label: '4+ phòng ngủ', value: 4 },
];

/** Tuỳ chọn sắp xếp */
export const SORT_OPTIONS: { label: string; value: PropertySort }[] = [
  { label: 'Mới nhất', value: 'newest' },
  { label: 'Giá: thấp đến cao', value: 'price_asc' },
  { label: 'Giá: cao đến thấp', value: 'price_desc' },
  { label: 'Diện tích lớn nhất', value: 'area_desc' },
];

/** Bộ tuỳ chọn lọc phụ thuộc theo loại hình (cascading filter) */
export interface TypeFilterOptions {
  priceRanges: { label: string; value: number }[];
  areaRanges: { label: string; value: number }[];
  bedroomOptions: { label: string; value: number }[];
}

/** Phòng cho thuê: diện tích nhỏ, giá thấp, ít phòng ngủ */
const ROOM_FILTER_OPTIONS: TypeFilterOptions = {
  priceRanges: [
    { label: 'Dưới 2 triệu', value: 2_000_000 },
    { label: 'Dưới 3 triệu', value: 3_000_000 },
    { label: 'Dưới 5 triệu', value: 5_000_000 },
    { label: 'Dưới 8 triệu', value: 8_000_000 },
  ],
  areaRanges: [
    { label: 'Từ 15 m²', value: 15 },
    { label: 'Từ 20 m²', value: 20 },
    { label: 'Từ 25 m²', value: 25 },
    { label: 'Từ 30 m²', value: 30 },
  ],
  bedroomOptions: [
    { label: 'Studio / 1 PN', value: 1 },
    { label: '2+ phòng ngủ', value: 2 },
  ],
};

/** Nhà nguyên căn: diện tích lớn, giá cao, nhiều phòng ngủ */
const HOUSE_FILTER_OPTIONS: TypeFilterOptions = {
  priceRanges: [
    { label: 'Dưới 10 triệu', value: 10_000_000 },
    { label: 'Dưới 15 triệu', value: 15_000_000 },
    { label: 'Dưới 25 triệu', value: 25_000_000 },
    { label: 'Dưới 40 triệu', value: 40_000_000 },
    { label: 'Trên 40 triệu', value: 100_000_000 },
  ],
  areaRanges: [
    { label: 'Từ 50 m²', value: 50 },
    { label: 'Từ 80 m²', value: 80 },
    { label: 'Từ 120 m²', value: 120 },
    { label: 'Từ 200 m²', value: 200 },
  ],
  bedroomOptions: [
    { label: '2+ phòng ngủ', value: 2 },
    { label: '3+ phòng ngủ', value: 3 },
    { label: '4+ phòng ngủ', value: 4 },
    { label: '5+ phòng ngủ', value: 5 },
  ],
};

/** Mặc định khi chưa chọn loại hình: dùng dải tổng quát */
const ALL_FILTER_OPTIONS: TypeFilterOptions = {
  priceRanges: PRICE_RANGES,
  areaRanges: AREA_RANGES,
  bedroomOptions: BEDROOM_OPTIONS,
};

/** Trả về bộ tuỳ chọn lọc tương ứng loại hình đang chọn */
export const getTypeFilterOptions = (type: PropertyType | ''): TypeFilterOptions => {
  if (type === 'ROOM') return ROOM_FILTER_OPTIONS;
  if (type === 'WHOLE_HOUSE') return HOUSE_FILTER_OPTIONS;
  return ALL_FILTER_OPTIONS;
};

/** Số bất động sản mỗi trang trên trang danh sách */
export const PROPERTIES_PER_PAGE = 6;
