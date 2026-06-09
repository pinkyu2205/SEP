// Service cung cấp dữ liệu bất động sản cho Public Website.
//
// Hiện dùng MOCK DATA (in-memory) nhưng API được thiết kế bất đồng bộ (Promise)
// để sau này thay bằng API thật chỉ cần đổi phần thân hàm, không phải sửa component.

import type { Paginated } from '../types/common';
import type { PropertyFilter, PublicProperty } from '../types/property';
import { PROPERTIES_PER_PAGE } from '../utils/constants';

// Ảnh minh hoạ dùng Unsplash (ổn định, không cần asset nội bộ).
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;

const MOCK_PROPERTIES: PublicProperty[] = [
  {
    id: 'p-001',
    title: 'Phòng trọ cao cấp full nội thất - Quận 7',
    summary: 'Phòng mới 100%, nội thất đầy đủ, an ninh 24/7, gần Lotte Mart.',
    description:
      'Phòng cho thuê tại trung tâm Quận 7, thiết kế hiện đại, ban công thoáng mát. Đầy đủ nội thất: giường, tủ, máy lạnh, máy giặt chung. Khu vực an ninh, có camera và bảo vệ 24/7. Thuận tiện di chuyển đến Quận 1, gần siêu thị, trường học và bệnh viện.',
    address: '45 Nguyễn Thị Thập, Phường Tân Phong, Quận 7',
    district: 'Quận 7',
    price: 4_500_000,
    area: 28,
    type: 'ROOM',
    status: 'AVAILABLE',
    images: [img('photo-1505873242700-f289a29e1e0f'), img('photo-1522708323590-d24dbb6b0267'), img('photo-1560448204-e02f11c3d0e2')],
    amenities: ['WIFI', 'AIR_CONDITIONER', 'CAMERA', 'PARKING', 'WASHING_MACHINE', 'SECURITY_24H'],
    bedrooms: 1,
    bathrooms: 1,
    featured: true,
    createdAt: '2026-05-20',
  },
  {
    id: 'p-002',
    title: 'Nhà nguyên căn 3 tầng - Bình Thạnh',
    summary: 'Nhà nguyên căn 3 tầng, 4 phòng ngủ, phù hợp gia đình hoặc ở ghép.',
    description:
      'Nhà nguyên căn 3 tầng tại Quận Bình Thạnh, diện tích sử dụng rộng rãi với 4 phòng ngủ, 3 nhà vệ sinh, khu bếp riêng và sân để xe. Nội thất cơ bản, nhà thoáng mát, hẻm xe hơi. Thích hợp cho gia đình hoặc nhóm bạn ở ghép, gần chợ và các tiện ích.',
    address: '112/5 Đinh Bộ Lĩnh, Phường 26, Quận Bình Thạnh',
    district: 'Quận Bình Thạnh',
    price: 18_000_000,
    area: 120,
    type: 'WHOLE_HOUSE',
    status: 'AVAILABLE',
    images: [img('photo-1568605114967-8130f3a36994'), img('photo-1570129477492-45c003edd2be'), img('photo-1576941089067-2de3c901e126')],
    amenities: ['WIFI', 'PARKING', 'KITCHEN', 'BALCONY', 'CAMERA'],
    bedrooms: 4,
    bathrooms: 3,
    featured: true,
    createdAt: '2026-05-18',
  },
  {
    id: 'p-003',
    title: 'Studio hiện đại gần Đại học - Thủ Đức',
    summary: 'Căn studio gọn gàng, gần làng đại học, giá sinh viên.',
    description:
      'Căn studio tại TP. Thủ Đức, thiết kế thông minh, đầy đủ ánh sáng tự nhiên. Có gác lửng, bếp mini và nhà vệ sinh riêng. Vị trí gần làng đại học, thuận tiện cho sinh viên và người đi làm. Khu vực yên tĩnh, an ninh tốt.',
    address: '88 Đường số 6, Phường Linh Trung, TP. Thủ Đức',
    district: 'TP. Thủ Đức',
    price: 3_200_000,
    area: 22,
    type: 'ROOM',
    status: 'AVAILABLE',
    images: [img('photo-1502672260266-1c1ef2d93688'), img('photo-1493809842364-78817add7ffb'), img('photo-1484154218962-a197022b5858')],
    amenities: ['WIFI', 'AIR_CONDITIONER', 'KITCHEN', 'PARKING'],
    bedrooms: 1,
    bathrooms: 1,
    featured: true,
    createdAt: '2026-05-15',
  },
  {
    id: 'p-004',
    title: 'Căn hộ dịch vụ 1 phòng ngủ - Quận 1',
    summary: 'Căn hộ dịch vụ trung tâm Quận 1, có thang máy, dọn phòng định kỳ.',
    description:
      'Căn hộ dịch vụ cao cấp tại trung tâm Quận 1, đầy đủ nội thất, có thang máy và dịch vụ dọn phòng định kỳ. View thành phố, ban công riêng. Phù hợp chuyên gia, người nước ngoài. Gần phố đi bộ Nguyễn Huệ và các trung tâm thương mại.',
    address: '20 Lý Tự Trọng, Phường Bến Nghé, Quận 1',
    district: 'Quận 1',
    price: 12_000_000,
    area: 45,
    type: 'ROOM',
    status: 'AVAILABLE',
    images: [img('photo-1545324418-cc1a3fa10c00'), img('photo-1522771739844-6a9f6d5f14af'), img('photo-1556912173-3bb406ef7e77')],
    amenities: ['WIFI', 'AIR_CONDITIONER', 'ELEVATOR', 'SECURITY_24H', 'BALCONY', 'WASHING_MACHINE'],
    bedrooms: 1,
    bathrooms: 1,
    featured: false,
    createdAt: '2026-04-30',
  },
  {
    id: 'p-005',
    title: 'Nhà nguyên căn 2 tầng - Gò Vấp',
    summary: 'Nhà nguyên căn 2 tầng, hẻm xe hơi, gần chợ Gò Vấp.',
    description:
      'Nhà nguyên căn 2 tầng tại Quận Gò Vấp, 3 phòng ngủ, 2 nhà vệ sinh, có sân thượng. Hẻm xe hơi rộng rãi, khu dân cư an ninh. Gần chợ, trường học và bệnh viện. Phù hợp gia đình hoặc kinh doanh nhỏ tại nhà.',
    address: '37/12 Quang Trung, Phường 10, Quận Gò Vấp',
    district: 'Quận Gò Vấp',
    price: 14_000_000,
    area: 90,
    type: 'WHOLE_HOUSE',
    status: 'AVAILABLE',
    images: [img('photo-1564013799919-ab600027ffc6'), img('photo-1583608205776-bfd35f0d9f83'), img('photo-1560185007-cde436f6a4d0')],
    amenities: ['WIFI', 'PARKING', 'KITCHEN', 'BALCONY'],
    bedrooms: 3,
    bathrooms: 2,
    featured: false,
    createdAt: '2026-05-10',
  },
  {
    id: 'p-006',
    title: 'Phòng trọ giá rẻ có gác - Phú Nhuận',
    summary: 'Phòng có gác lửng, giờ giấc tự do, gần trung tâm.',
    description:
      'Phòng trọ có gác lửng tại Quận Phú Nhuận, giá hợp lý, giờ giấc tự do. Có nhà vệ sinh riêng, chỗ để xe. Vị trí trung tâm, di chuyển nhanh đến Quận 1, Quận 3. Phù hợp người đi làm và sinh viên.',
    address: '210 Phan Đình Phùng, Phường 1, Quận Phú Nhuận',
    district: 'Quận Phú Nhuận',
    price: 2_800_000,
    area: 18,
    type: 'ROOM',
    status: 'AVAILABLE',
    images: [img('photo-1522202176988-66273c2fd55f'), img('photo-1598928506311-c55ded91a20c'), img('photo-1586023492125-27b2c045efd7')],
    amenities: ['WIFI', 'PARKING', 'CAMERA'],
    bedrooms: 1,
    bathrooms: 1,
    featured: false,
    createdAt: '2026-05-05',
  },
  {
    id: 'p-007',
    title: 'Căn hộ mini 2 phòng ngủ - Quận 4',
    summary: 'Căn hộ mini 2 phòng ngủ, gần cầu Kênh Tẻ, nội thất mới.',
    description:
      'Căn hộ mini 2 phòng ngủ tại Quận 4, nội thất mới hoàn toàn, có ban công thoáng. Khu vực yên tĩnh, an ninh, gần cầu Kênh Tẻ qua Quận 1 và Quận 7. Có chỗ để xe và camera giám sát.',
    address: '15 Đoàn Văn Bơ, Phường 13, Quận 4',
    district: 'Quận 4',
    price: 7_500_000,
    area: 40,
    type: 'ROOM',
    status: 'AVAILABLE',
    images: [img('photo-1554995207-c18c203602cb'), img('photo-1502005229762-cf1b2da7c5d6'), img('photo-1505691938895-1758d7feb511')],
    amenities: ['WIFI', 'AIR_CONDITIONER', 'CAMERA', 'PARKING', 'BALCONY', 'WASHING_MACHINE'],
    bedrooms: 2,
    bathrooms: 1,
    featured: true,
    createdAt: '2026-05-22',
  },
  {
    id: 'p-008',
    title: 'Nhà nguyên căn mặt tiền - Quận 3',
    summary: 'Nhà mặt tiền 4 tầng, phù hợp ở kết hợp kinh doanh.',
    description:
      'Nhà nguyên căn mặt tiền đường Quận 3, 4 tầng, vị trí đắc địa phù hợp vừa ở vừa kinh doanh. Diện tích lớn, nhiều phòng, có thang máy và sân thượng. Khu vực trung tâm, mật độ giao thông cao, thuận lợi buôn bán.',
    address: '305 Võ Văn Tần, Phường 5, Quận 3',
    district: 'Quận 3',
    price: 35_000_000,
    area: 200,
    type: 'WHOLE_HOUSE',
    status: 'AVAILABLE',
    images: [img('photo-1512917774080-9991f1c4c750'), img('photo-1605276374104-dee2a0ed3cd6'), img('photo-1600585154340-be6161a56a0c')],
    amenities: ['WIFI', 'PARKING', 'KITCHEN', 'BALCONY', 'ELEVATOR', 'CAMERA', 'SECURITY_24H'],
    bedrooms: 5,
    bathrooms: 4,
    featured: false,
    createdAt: '2026-05-12',
  },
];

/** Giả lập độ trễ mạng để UI loading hoạt động giống API thật */
const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lấy danh sách bất động sản theo bộ lọc + phân trang.
 * Khi nối API thật: thay phần lọc bên dưới bằng lời gọi `api.get('/api/v1/public/properties', { params: filter })`.
 */
export async function getProperties(filter: PropertyFilter = {}): Promise<Paginated<PublicProperty>> {
  await delay();

  const {
    keyword, district, type, minPrice, maxPrice, minArea, bedrooms, amenities, sort = 'newest',
    page = 1, pageSize = PROPERTIES_PER_PAGE,
  } = filter;

  let result = [...MOCK_PROPERTIES];

  if (keyword) {
    const kw = keyword.toLowerCase().trim();
    result = result.filter(
      (p) => p.title.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw),
    );
  }
  if (district) result = result.filter((p) => p.district === district);
  if (type) result = result.filter((p) => p.type === type);
  if (minPrice) result = result.filter((p) => p.price >= minPrice);
  if (maxPrice) result = result.filter((p) => p.price <= maxPrice);
  if (minArea) result = result.filter((p) => p.area >= minArea);
  if (bedrooms) result = result.filter((p) => (p.bedrooms ?? 0) >= bedrooms);
  if (amenities && amenities.length) {
    result = result.filter((p) => amenities.every((a) => p.amenities.includes(a)));
  }

  // Sắp xếp
  result.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return a.price - b.price;
      case 'price_desc': return b.price - a.price;
      case 'area_desc': return b.area - a.area;
      case 'newest':
      default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const items = result.slice(start, start + pageSize);

  return { items, page, pageSize, total, totalPages };
}

/** Lấy danh sách bất động sản nổi bật cho trang chủ */
export async function getFeaturedProperties(limit = 6): Promise<PublicProperty[]> {
  await delay();
  return MOCK_PROPERTIES.filter((p) => p.featured).slice(0, limit);
}

/** Lấy chi tiết một bất động sản theo id */
export async function getPropertyById(id: string): Promise<PublicProperty | null> {
  await delay();
  return MOCK_PROPERTIES.find((p) => p.id === id) ?? null;
}

/** Lấy bất động sản tương tự (cùng loại hình, khác id) */
export async function getRelatedProperties(id: string, limit = 3): Promise<PublicProperty[]> {
  await delay();
  const current = MOCK_PROPERTIES.find((p) => p.id === id);
  if (!current) return [];
  return MOCK_PROPERTIES.filter((p) => p.id !== id && p.type === current.type).slice(0, limit);
}

/** Thống kê tổng quan dùng cho mục "Giới thiệu" trên trang chủ */
export async function getCompanyStats(): Promise<{
  totalProperties: number;
  totalTenants: number;
  totalBuildings: number;
  satisfactionRate: number;
}> {
  await delay(200);
  return {
    totalProperties: 320,
    totalTenants: 1850,
    totalBuildings: 45,
    satisfactionRate: 98,
  };
}
