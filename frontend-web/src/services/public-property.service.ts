// Service cung cấp dữ liệu bất động sản cho Public Website.
// Gọi real API, chỉ hiển thị property ACTIVE đã được gán operation manager.

import api from './api';
import type { Paginated } from '@/types/common';
import type { PropertyFilter, PublicProperty } from '@/types/property';
import type { GuestPropertyResponse, RoomResponse } from '@/types/api.types';
import { PROPERTIES_PER_PAGE } from '@/utils/constants';
import { todayIso } from '@/utils/serverTime';

// BE (20/06/2026) mở endpoint public GET-only cho guest — không cần token.
const PUBLIC_BASE = '/api/v1/public/properties';

/**
 * Kết quả tra cứu ở mức PHÒNG cho một bất động sản.
 *
 * Gộp giá, diện tích và tình trạng còn trống vào MỘT lần gọi `/rooms`: ba thứ này đều đọc
 * từ cùng một danh sách phòng, tách ra là gọi API hai lần cho cùng một dữ liệu.
 */
interface Listing {
  price: number;
  area: number;
  /** `undefined` = không tra được danh sách phòng — xem chú thích ở `PublicProperty`. */
  availableRooms?: number;
  totalRooms?: number;
  /** Còn nhận khách được không. Trang công khai chỉ liệt kê nhà `true`. */
  hasVacancy: boolean;
}

function mapToPublicProperty(p: GuestPropertyResponse, listing: Listing): PublicProperty {
  const isWholeHouse = p.wholeHouse === true;
  const summary = p.descriptions
    ? p.descriptions.slice(0, 120) + (p.descriptions.length > 120 ? '…' : '')
    : `${isWholeHouse ? 'Nhà nguyên căn' : 'Phòng cho thuê'} tại ${p.shortAddress}`;

  return {
    id: String(p.id),
    title: p.propertyName,
    summary,
    description: p.descriptions || '',
    address: p.fullAddress || p.shortAddress,
    district: p.zoneName,
    price: listing.price,
    area: listing.area,
    type: isWholeHouse ? 'WHOLE_HOUSE' : 'ROOM',
    /*
      Trạng thái tính theo CHỖ TRỐNG THẬT, không chỉ theo cờ ở mức nhà.
      Nhà chia phòng 4 phòng thuê 3 vẫn còn nhận khách, trong khi `status` của cả nhà đã
      là RENTED và `rentalAvailable` đã false — hai cờ đó nói về toà nhà, không nói về
      phòng. Dựa vào chúng thì nhà còn phòng trống bị dán nhãn "Đã thuê".

      Hàm này CỐ Ý không tự lọc: trang chi tiết vẫn phải mở được nhà đã kín phòng (khách
      lưu link cũ), chỉ các trang DANH SÁCH mới lọc — xem `fetchListedProperties`.
    */
    status: listing.hasVacancy ? 'AVAILABLE' : 'RENTED',
    availableRooms: listing.availableRooms,
    totalRooms: listing.totalRooms,
    images: p.imageUrls ?? [],
    amenities: [],
    // Tên thiết bị thật từ BE (distinct theo property) — hiển thị trực tiếp.
    rawAmenities: p.amenities ?? [],
    bedrooms: isWholeHouse ? (p.totalRooms || undefined) : undefined,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    electricityUnitPrice: p.electricityUnitPrice ?? null,
    waterUnitPrice: p.waterUnitPrice ?? null,
    depositMonths: p.depositMonths ?? null,
    serviceFee: p.serviceFee ?? null,
    featured: false,
    createdAt: todayIso(),
  };
}

/**
 * GIÁ NIÊM YẾT của một phòng.
 *
 * `listedPrice` TRƯỚC `appliedPrice`, và `price` chỉ là đường lui cho dữ liệu cũ:
 *
 *  • `listedPrice` là giá host duyệt, cũng là giá quay về khi khách trả phòng — đúng thứ
 *    một người đang đi tìm phòng cần biết.
 *  • `appliedPrice` là giá của HỢP ĐỒNG đang chạy trong phòng đó. Rao giá này ra ngoài là
 *    công khai giá riêng của khách hiện tại, và cũng không phải giá người mới sẽ trả.
 *  • `price` đã `@deprecated` (xem `RoomResponse`) — BE không còn trả nữa.
 *
 * BUG 10/09/2026 — vì sao phải sửa: hàm cũ CHỈ đọc `r.price`. Field đó nay luôn
 * `undefined`, nên mọi phòng đều bị coi là "chưa có giá", rơi xuống nhánh cuối lấy
 * `p.price` của cả nhà — mà nhà chia phòng thì không có giá ở mức nhà. Kết quả: mọi thẻ
 * nhà theo phòng trên trang công khai đều hiện **0 đ/tháng**.
 */
const roomPrice = (r: RoomResponse): number =>
  r.listedPrice ?? r.appliedPrice ?? r.price ?? 0;

/**
 * Giá, diện tích và tình trạng còn trống để hiển thị công khai.
 *
 * - Nhà nguyên căn: giá & diện tích của cả căn; còn trống khi chưa có khách.
 * - Nhà chia phòng: lấy theo PHÒNG CÒN TRỐNG RẺ NHẤT — diện tích là diện tích PHÒNG đó,
 *   KHÔNG phải diện tích tổng toà nhà.
 *
 * Vì sao là phòng RẺ NHẤT trong số CÒN TRỐNG (trước đây là phòng đắt nhất, không quan tâm
 * trống hay không): con số trên thẻ phải là con số khách thật sự thuê được. Lấy phòng đắt
 * nhất là đuổi khách bằng một cái giá không đại diện; lấy phòng đã có người là rao một chỗ
 * không còn để bán.
 */
async function resolveListing(p: GuestPropertyResponse): Promise<Listing> {
  // Cờ ở mức NHÀ — dùng cho nguyên căn, và làm đường lui khi không tra được phòng.
  const houseVacant = p.status !== 'RENTED' && p.rentalAvailable !== false;

  if (p.wholeHouse !== false) {
    return {
      price: p.price ?? 0,
      area: p.areaSize ?? 0,
      availableRooms: houseVacant ? 1 : 0,
      totalRooms: 1,
      hasVacancy: houseVacant,
    };
  }

  try {
    // Nhận cả mảng thuần lẫn `Page` của Spring — hai kiểu này hay đổi qua lại giữa các
    // endpoint, và đọc nhầm thì `.filter` ném lỗi rồi rơi vào nhánh catch một cách im lặng.
    // (Interceptor của `api` trả thẳng `response.data`, nhưng kiểu khai báo vẫn là
    // `AxiosResponse` nên phải tự ép — xem chú thích ở `services/api.ts`.)
    const raw = await api.get(`${PUBLIC_BASE}/${p.id}/rooms`) as unknown as
      RoomResponse[] | { content?: RoomResponse[] };
    const rooms: RoomResponse[] = Array.isArray(raw) ? raw : (raw?.content ?? []);

    /*
      KHÔNG CÓ PHÒNG NÀO ≠ KÍN PHÒNG.

      Máy chủ hiện trả mảng RỖNG cho mọi nhà, kể cả nhà `totalRooms = 5` (kiểm chứng
      10/09/2026 trên `/api/v1/public/properties/{id}/rooms`). Coi mảng rỗng là "hết chỗ"
      thì mọi nhà chia phòng biến mất khỏi trang công khai vì một lỗ hổng dữ liệu, chứ
      không phải vì nhà đã kín. Không biết thì nói là không biết: rơi về cờ ở mức nhà và
      để hai con số phòng `undefined`.
    */
    if (rooms.length === 0) {
      return { price: p.price ?? 0, area: p.areaSize ?? 0, hasVacancy: houseVacant };
    }

    // DRAFT = phòng chưa mở cho thuê, MAINTENANCE = đang sửa — cả hai đều không bán được,
    // nên không tính vào chỗ trống lẫn mẫu số "tổng số phòng đang cho thuê".
    const listed = rooms.filter(r => r.status !== 'DRAFT');
    const available = listed.filter(r => r.status === 'AVAILABLE');

    const priced = available.filter(r => roomPrice(r) > 0);
    const rep = priced.length > 0
      ? priced.reduce((a, b) => (roomPrice(b) < roomPrice(a) ? b : a))
      : available[0];

    return {
      price: rep ? roomPrice(rep) : 0,
      area: rep?.area || listed.find(r => (r.area ?? 0) > 0)?.area || p.areaSize || 0,
      availableRooms: available.length,
      totalRooms: listed.length,
      hasVacancy: available.length > 0,
    };
  } catch {
    /*
      Không tra được danh sách phòng thì KHÔNG ẩn nhà đi: một lần lỗi mạng mà làm trống cả
      trang danh sách còn tệ hơn việc lỡ hiện một nhà đã kín phòng. Rơi về cờ ở mức nhà,
      đúng cách bản trước 10/09/2026 vẫn làm, và để hai con số phòng là `undefined` để thẻ
      biết đường không hiện "còn 0 phòng".
    */
    return { price: p.price ?? 0, area: p.areaSize ?? 0, hasVacancy: houseVacant };
  }
}

/**
 * Bất động sản ĐỦ ĐIỀU KIỆN LÊN TRANG CÔNG KHAI.
 *
 * Đổi tên từ `fetchActiveProperties` vì điều kiện đã khác: không còn là "đang hoạt động"
 * mà là "đang hoạt động VÀ còn chỗ nhận khách". Nhà chia phòng 4 phòng thuê hết 4, hay nhà
 * nguyên căn đã có khách, đều không lên danh sách — rao một chỗ không thuê được chỉ khiến
 * khách gọi điện rồi nghe từ chối.
 *
 * Vẫn giữ `RENTED` ở bước lọc theo `status`: với nhà chia phòng, `status` là trạng thái của
 * TOÀ NHÀ, và nó thành RENTED ngay khi có khách đầu tiên. Loại RENTED ở đây là loại nhầm
 * đúng nhóm nhà còn phòng trống. Chỗ trống có hay không do `resolveListing` chốt.
 */
async function fetchListedProperties(): Promise<PublicProperty[]> {
  try {
    const res: { content: GuestPropertyResponse[] } = await api.get(PUBLIC_BASE, {
      params: { page: 0, size: 200 },
    });
    // BE đã lọc sẵn ACTIVE/RENTED + đã gán manager ở server
    // (findByStatusInAndOperationManagerIdIsNotNull). KHÔNG lọc lại theo
    // operationManagerId ở FE: GuestPropertyResponse hiện KHÔNG trả field này
    // (PublicPropertyServiceImpl.mapToGuestResponse quên set → luôn null) nên nếu
    // lọc sẽ loại nhầm HẾT. Chỉ giữ lọc trạng thái cho chắc.
    const active = (res.content ?? []).filter(
      p => p.status === 'ACTIVE' || p.status === 'RENTED',
    );
    const mapped = await Promise.all(
      active.map(async p => mapToPublicProperty(p, await resolveListing(p))),
    );
    return mapped.filter(p => p.status === 'AVAILABLE');
  } catch {
    return [];
  }
}

function applyFiltersAndSort(
  all: PublicProperty[],
  filter: PropertyFilter,
): Paginated<PublicProperty> {
  const {
    keyword, district, type, minPrice, maxPrice, minArea, bedrooms, amenities,
    sort = 'newest', page = 1, pageSize = PROPERTIES_PER_PAGE,
  } = filter;

  let result = [...all];

  if (keyword) {
    const kw = keyword.toLowerCase().trim();
    result = result.filter(
      p => p.title.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw),
    );
  }
  if (district) result = result.filter(p => p.district === district);
  if (type) result = result.filter(p => p.type === type);
  if (minPrice) result = result.filter(p => p.price >= minPrice);
  if (maxPrice) result = result.filter(p => p.price <= maxPrice);
  if (minArea) result = result.filter(p => p.area >= minArea);
  if (bedrooms) result = result.filter(p => (p.bedrooms ?? 0) >= bedrooms);
  if (amenities?.length) {
    result = result.filter(p => amenities.every(a => p.amenities.includes(a)));
  }

  result.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return a.price - b.price;
      case 'price_desc': return b.price - a.price;
      case 'area_desc': return b.area - a.area;
      case 'newest':
      default: return b.id.localeCompare(a.id);
    }
  });

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = result.slice((page - 1) * pageSize, page * pageSize);

  return { items, page, pageSize, total, totalPages };
}

export async function getProperties(filter: PropertyFilter = {}): Promise<Paginated<PublicProperty>> {
  const all = await fetchListedProperties();
  return applyFiltersAndSort(all, filter);
}

export async function getFeaturedProperties(limit = 6): Promise<PublicProperty[]> {
  const all = await fetchListedProperties();
  return all.slice(0, limit);
}

export async function getPropertyById(id: string): Promise<PublicProperty | null> {
  try {
    // BE trả 404 nếu không thoả ACTIVE + đã gán manager → catch xuống null.
    const p: GuestPropertyResponse = await api.get(`${PUBLIC_BASE}/${id}`);
    return mapToPublicProperty(p, await resolveListing(p));
  } catch {
    return null;
  }
}

export async function getRelatedProperties(id: string, limit = 3): Promise<PublicProperty[]> {
  const current = await getPropertyById(id);
  if (!current) return [];
  const all = await fetchListedProperties();
  return all.filter(p => p.id !== id && p.type === current.type).slice(0, limit);
}

export async function getCompanyStats(): Promise<{
  totalProperties: number;
  totalTenants: number;
  totalBuildings: number;
  satisfactionRate: number;
}> {
  return {
    totalProperties: 320,
    totalTenants: 1850,
    totalBuildings: 45,
    satisfactionRate: 98,
  };
}
