import { City, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '../types';

export const CITIES: City[] = [
  { id: 'hcm', name: 'TP. Hồ Chí Minh', availableRooms: 180 },
];

// Keep backward compatibility
export const DISTRICTS = CITIES;

export const WARDS: Record<string, Ward[]> = {
  'hcm': [
    { id: 'hcm-tp', cityId: 'hcm', name: 'Phường Tân Phú (Quận 7)', availableRooms: 12 },
    { id: 'hcm-bt', cityId: 'hcm', name: 'Phường Bình Thuận (Quận 7)', availableRooms: 8 },
    { id: 'hcm-pm', cityId: 'hcm', name: 'Phường Phú Mỹ (Quận 7)', availableRooms: 15 },
    { id: 'hcm-p25', cityId: 'hcm', name: 'Phường 25 (Bình Thạnh)', availableRooms: 21 },
    { id: 'hcm-p13', cityId: 'hcm', name: 'Phường 13 (Bình Thạnh)', availableRooms: 9 },
    { id: 'hcm-lc', cityId: 'hcm', name: 'Phường Linh Chiểu (Thủ Đức)', availableRooms: 12 },
    { id: 'hcm-lt', cityId: 'hcm', name: 'Phường Linh Trung (Thủ Đức)', availableRooms: 15 },
    { id: 'hcm-bn', cityId: 'hcm', name: 'Phường Bến Nghé (Quận 1)', availableRooms: 5 },
    { id: 'hcm-dk', cityId: 'hcm', name: 'Phường Đa Kao (Quận 1)', availableRooms: 6 },
    { id: 'hcm-tb', cityId: 'hcm', name: 'Phường 2 (Tân Bình)', availableRooms: 10 },
  ],
};

export const MOCK_PROPERTIES: PropertyListing[] = [
  {
    id: 'prop-1',
    name: 'Phòng trọ Minh Phát',
    address: '12 Nguyễn Thị Thập',
    city: 'TP. Hồ Chí Minh',
    ward: 'Phường Tân Phú (Quận 7)',
    cityId: 'hcm',
    wardId: 'hcm-tp',
    photos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400'],
    priceFrom: 3500000,
    priceTo: 4500000,
    totalRooms: 10,
    availableRooms: 2,
    area: 25,
    propertyType: 'apartment',
    amenities: ['Máy lạnh', 'Wifi', 'Máy giặt', 'Giữ xe', 'Bảo vệ'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 100000,
    paymentNote: 'Trả đầu tháng',
    description: 'Căn hộ dịch vụ cao cấp nằm ngay trung tâm Quận 7, cách Lotte Mart chỉ 5 phút đi bộ. Hệ thống an ninh 24/7 với camera giám sát toàn tòa nhà, giúp bạn yên tâm sinh hoạt mỗi ngày. Không gian thoáng mát, thiết kế hiện đại với ban công nhìn ra đường chính.',
    latitude: 10.7402,
    longitude: 106.7153,
    rooms: [
      {
        id: 'r-1-1',
        name: 'Căn hộ 101',
        floor: 1,
        area: 25,
        price: 3500000,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400',
          'https://images.unsplash.com/photo-1502672260266-1c15a82230b5?w=400',
        ],
        equipments: ['Máy lạnh Daikin 1HP', 'Giường gỗ 1m6', 'Tủ quần áo 2 cánh', 'Bàn làm việc', 'Ghế xoay', 'Kệ giày'],
        description: 'Căn hộ tầng trệt rộng rãi, phù hợp cho 1-2 người. Cửa sổ lớn đón nắng tự nhiên, sàn gạch men sạch sẽ.'
      },
      {
        id: 'r-1-2',
        name: 'Căn hộ 201',
        floor: 2,
        area: 30,
        price: 4500000,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400',
        ],
        equipments: ['Máy lạnh Daikin 1.5HP', 'Giường gỗ 1m8', 'Tủ lạnh mini 90L', 'Tủ quần áo 3 cánh', 'Bàn làm việc', 'Bếp điện từ', 'Kệ bếp'],
        description: 'Căn hộ góc tầng 2, 2 mặt thoáng, có bếp riêng. Diện tích rộng rãi cho cặp đôi hoặc nhóm bạn nhỏ.'
      }
    ],
    hostName: 'Chú Bình',
    hostPhone: '0901234567',
    createdAt: '2026-05-10T08:00:00Z'
  },
  {
    id: 'prop-2',
    name: 'Phòng trọ Sunrise',
    address: '45 Lê Văn Lương',
    city: 'TP. Hồ Chí Minh',
    ward: 'Phường Bình Thuận (Quận 7)',
    cityId: 'hcm',
    wardId: 'hcm-bt',
    photos: ['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400'],
    priceFrom: 2000000,
    priceTo: 2800000,
    totalRooms: 15,
    availableRooms: 3,
    area: 15,
    propertyType: 'apartment',
    amenities: ['Máy lạnh', 'Wifi', 'Giữ xe', 'Ban công'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 50000,
    paymentNote: 'Trả đầu tháng',
    description: 'Căn hộ dịch vụ tiện nghi giá rẻ, phù hợp cho sinh viên và người đi làm. Khu vực yên tĩnh, gần chợ và trạm xe buýt, thuận tiện di chuyển đến các quận trung tâm.',
    latitude: 10.7420,
    longitude: 106.7100,
    rooms: [
      {
        id: 'r-2-1',
        name: 'Căn hộ 101',
        floor: 1,
        area: 15,
        price: 2000000,
        status: 'available',
        photos: ['https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400'],
        equipments: ['Máy lạnh', 'Giường đơn 1m2', 'Tủ nhỏ', 'Quạt trần'],
        description: 'Căn hộ nhỏ gọn tầng trệt, lý tưởng cho 1 người. Giờ giấc tự do, ra vào bằng thẻ từ.'
      },
      {
        id: 'r-2-2',
        name: 'Căn hộ 102',
        floor: 1,
        area: 15,
        price: 2000000,
        status: 'available',
        photos: ['https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400'],
        equipments: ['Máy lạnh', 'Giường đơn 1m2', 'Tủ nhỏ', 'Quạt trần'],
        description: 'Căn hộ đối diện Căn hộ 101, cùng tầng trệt, thiết kế tương tự.'
      },
      {
        id: 'r-2-3',
        name: 'Căn hộ 205',
        floor: 2,
        area: 20,
        price: 2800000,
        status: 'available',
        photos: ['https://images.unsplash.com/photo-1502672260266-1c15a82230b5?w=400'],
        equipments: ['Máy lạnh', 'Giường đôi 1m6', 'Tủ quần áo', 'Bàn làm việc', 'Ban công riêng'],
        description: 'Căn hộ rộng hơn ở tầng 2, có ban công riêng nhìn ra khu dân cư yên tĩnh.'
      }
    ],
    hostName: 'Cô Lan',
    hostPhone: '0987654321',
    createdAt: '2026-05-15T09:30:00Z'
  },
  {
    id: 'prop-3',
    name: 'Phòng trọ Sinh viên HUTECH',
    address: '150 Điện Biên Phủ',
    city: 'TP. Hồ Chí Minh',
    ward: 'Phường 25 (Bình Thạnh)',
    cityId: 'hcm',
    wardId: 'hcm-p25',
    photos: ['https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400'],
    priceFrom: 3000000,
    priceTo: 4000000,
    totalRooms: 20,
    availableRooms: 2,
    area: 20,
    propertyType: 'apartment',
    amenities: ['Wifi', 'Giữ xe', 'Gác lửng', 'Bếp riêng'],
    electricityRate: 3800,
    waterRate: 18000,
    depositMonths: 1,
    serviceFee: 150000,
    paymentNote: 'Trả đầu tháng',
    description: 'Tọa lạc ngay ngã tư Hàng Xanh, vị trí đắc địa cho sinh viên các trường Đại học Bách Khoa, HUTECH, Ngoại Thương. Căn hộ thiết kế gác lửng thông minh, tối ưu diện tích sử dụng.',
    latitude: 10.8010,
    longitude: 106.7120,
    rooms: [
      {
        id: 'r-3-1',
        name: 'Căn hộ 101',
        floor: 1,
        area: 20,
        price: 3000000,
        status: 'available',
        photos: ['https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400'],
        equipments: ['Gác lửng gỗ', 'Bếp gas mini', 'Kệ bếp', 'Quạt trần'],
        description: 'Căn hộ có gác lửng rộng, bếp riêng tiện nấu ăn. Phù hợp sinh viên cần không gian học tập riêng tư.'
      },
      {
        id: 'r-3-2',
        name: 'Căn hộ 102',
        floor: 1,
        area: 25,
        price: 4000000,
        status: 'available',
        photos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400'],
        equipments: ['Gác lửng gỗ', 'Máy lạnh', 'Bếp gas mini', 'Tủ lạnh mini', 'Giường đôi'],
        description: 'Căn hộ rộng nhất tầng 1, có đầy đủ tiện nghi, gác lửng cao thoáng.'
      }
    ],
    createdAt: '2026-05-18T10:00:00Z'
  },
  {
    id: 'prop-4',
    name: 'Căn hộ mini Pearl Complex',
    address: '22 Võ Văn Ngân',
    city: 'TP. Hồ Chí Minh',
    ward: 'Phường Linh Chiểu (Thủ Đức)',
    cityId: 'hcm',
    wardId: 'hcm-lc',
    photos: ['https://images.unsplash.com/photo-1502672260266-1c15a82230b5?w=400'],
    priceFrom: 4500000,
    priceTo: 6000000,
    totalRooms: 12,
    availableRooms: 3,
    area: 35,
    propertyType: 'whole_house',
    amenities: ['Máy lạnh', 'Wifi', 'Máy giặt', 'Giữ xe', 'Bảo vệ', 'Bếp riêng', 'Ban công'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 200000,
    paymentNote: 'Trả đầu tháng',
    description: 'Tổ hợp căn hộ mini cao cấp tại trung tâm Thủ Đức, đầy đủ nội thất sang trọng. Giờ giấc tự do, hệ thống an ninh đa lớp với vân tay và thẻ từ. Gần các trường Đại học lớn, siêu thị và bệnh viện.',
    latitude: 10.8500,
    longitude: 106.7550,
    rooms: [
      {
        id: 'r-4-1',
        name: 'Căn hộ 201',
        floor: 2,
        area: 35,
        price: 4500000,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1502672260266-1c15a82230b5?w=400',
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400',
        ],
        equipments: ['Máy lạnh Daikin Inverter 1.5HP', 'Giường gỗ sồi 1m6', 'Tủ quần áo 3 cánh', 'Tủ lạnh Samsung 150L', 'Bếp từ đôi', 'Máy hút mùi', 'Bàn ăn 4 người'],
        description: 'Căn hộ full nội thất cao cấp tầng 2, phòng bếp riêng biệt với hệ thống tủ bếp hiện đại. View nhìn ra công viên nội khu.'
      },
      {
        id: 'r-4-2',
        name: 'Căn hộ 401',
        floor: 4,
        area: 40,
        price: 6000000,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400',
        ],
        equipments: ['Máy lạnh Daikin Inverter 2HP', 'Giường gỗ sồi 1m8', 'Nệm Everon cao cấp', 'Tủ quần áo 4 cánh gương', 'Tủ lạnh Samsung 200L', 'Bếp từ đôi', 'Máy hút mùi', 'Máy giặt riêng', 'Bàn ăn 4 người', 'Sofa da 2 chỗ'],
        description: 'Penthouse tầng 4 view panorama, diện tích lớn nhất tòa nhà. Nội thất cao cấp toàn bộ, có cả máy giặt riêng và sofa phòng khách nhỏ.'
      },
      {
        id: 'r-4-3',
        name: 'Căn hộ 301',
        floor: 3,
        area: 35,
        price: 5000000,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400',
        ],
        equipments: ['Máy lạnh 1.5HP', 'Giường gỗ 1m6', 'Tủ quần áo 2 cánh', 'Tủ lạnh 120L', 'Bếp điện từ', 'Bàn làm việc'],
        description: 'Căn hộ tầng 3 view hông, yên tĩnh, phù hợp cho người làm việc tại nhà.'
      }
    ],
    hostName: 'Anh Tuấn',
    hostPhone: '0912345678',
    createdAt: '2026-05-20T14:00:00Z'
  },
  {
    id: 'prop-5',
    name: 'Nhà nguyên căn Villa Xanh',
    address: '88 Phạm Văn Đồng',
    city: 'TP. Hồ Chí Minh',
    ward: 'Phường Linh Trung (Thủ Đức)',
    cityId: 'hcm',
    wardId: 'hcm-lt',
    photos: [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400',
    ],
    priceFrom: 15000000,
    priceTo: 15000000,
    totalRooms: 4,
    availableRooms: 1,
    area: 120,
    propertyType: 'whole_house',
    amenities: ['Wifi', 'Giữ xe ô tô', 'Sân vườn', 'Camera an ninh'],
    houseEquipments: [
      'Sofa da phòng khách 5 chỗ',
      'TV Samsung 55 inch',
      'Tủ lạnh Side-by-side LG 600L',
      'Hệ thống tủ bếp gỗ tự nhiên',
      'Bếp gas âm Bosch',
      'Máy hút mùi Bosch',
      'Máy giặt LG 9kg',
      'Máy nước nóng năng lượng mặt trời',
      'Bàn ăn gỗ 6 người',
      'Kệ giày lớn',
    ],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 0,
    paymentNote: 'Trả đầu tháng',
    description: 'Nhà nguyên căn 1 trệt 1 lầu thiết kế hiện đại, nằm trong khu dân cư yên tĩnh gần Đại học Nông Lâm. Sân vườn rộng trồng cây xanh, chỗ đậu ô tô riêng. Rất phù hợp cho gia đình hoặc nhóm bạn 4-6 người muốn không gian sống rộng rãi, thoáng mát.',
    latitude: 10.8600,
    longitude: 106.7600,
    rooms: [
      {
        id: 'r-5-1',
        name: 'Phòng ngủ Master (Tầng 1)',
        floor: 1,
        area: 25,
        price: 0,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400',
        ],
        equipments: ['Máy lạnh Daikin 1.5HP', 'Giường King-size gỗ sồi', 'Nệm Dunlopillo cao cấp', 'Tủ quần áo âm tường 4 cánh', 'Bàn trang điểm', 'Nhà vệ sinh riêng có bồn tắm'],
        description: 'Phòng ngủ chính tầng trệt, rộng rãi và sang trọng. Có nhà vệ sinh riêng với bồn tắm đứng kính cường lực và vòi sen nóng lạnh.'
      },
      {
        id: 'r-5-2',
        name: 'Phòng ngủ 2 (Tầng 2)',
        floor: 2,
        area: 18,
        price: 0,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400',
        ],
        equipments: ['Máy lạnh 1HP', 'Giường đôi 1m6', 'Tủ quần áo 2 cánh'],
        description: 'Phòng ngủ thứ hai ở tầng trên, có máy lạnh và nội thất cơ bản.'
      },
      {
        id: 'r-5-3',
        name: 'Phòng ngủ 3 (Tầng 2)',
        floor: 2,
        area: 15,
        price: 0,
        status: 'available',
        photos: [
          'https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400',
        ],
        equipments: ['Máy lạnh 1HP'],
        description: 'Phòng ngủ nhỏ tầng 2, hiện chỉ có máy lạnh. Phù hợp làm phòng ngủ trẻ em hoặc phòng làm việc.'
      },
      {
        id: 'r-5-4',
        name: 'Phòng ngủ 4 (Tầng 2)',
        floor: 2,
        area: 12,
        price: 0,
        status: 'available',
        photos: [],
        equipments: [],
        description: 'Phòng trống hoàn toàn, không có nội thất. Có thể bố trí theo ý muốn của khách thuê.'
      }
    ],
    hostName: 'Chị Hương',
    hostPhone: '0933456789',
    createdAt: '2026-05-22T10:00:00Z'
  }
];

export const getDistrictById = (id: string): City | undefined => {
  return CITIES.find(d => d.id === id);
};

export const getCityById = (id: string): City | undefined => {
  return CITIES.find(c => c.id === id);
};

export const getWardsByDistrict = (districtId: string): Ward[] => {
  return WARDS[districtId] || [];
};

export const getWardsByCity = (cityId: string): Ward[] => {
  return WARDS[cityId] || [];
};

export const searchProperties = (filters: SearchFilters): SearchResult => {
  let filtered = [...MOCK_PROPERTIES];

  if (filters.propertyType) {
    filtered = filtered.filter(p => p.propertyType === filters.propertyType);
  }

  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw));
  }
  
  if (filters.cityId) {
    filtered = filtered.filter(p => p.cityId === filters.cityId);
  }
  
  if (filters.wardIds && filters.wardIds.length > 0) {
    filtered = filtered.filter(p => filters.wardIds!.includes(p.wardId));
  }
  
  if (filters.priceMin !== undefined) {
    filtered = filtered.filter(p => p.priceTo >= filters.priceMin!);
  }
  
  if (filters.priceMax !== undefined) {
    filtered = filtered.filter(p => p.priceFrom <= filters.priceMax!);
  }
  
  if (filters.areaMin !== undefined) {
    filtered = filtered.filter(p => p.area >= filters.areaMin!);
  }
  
  if (filters.areaMax !== undefined) {
    filtered = filtered.filter(p => p.area <= filters.areaMax!);
  }
  
  if (filters.amenities && filters.amenities.length > 0) {
    filtered = filtered.filter(p => filters.amenities!.every(a => p.amenities.includes(a)));
  }

  if (filters.sortBy) {
    switch (filters.sortBy) {
      case 'price_asc':
        filtered.sort((a, b) => a.priceFrom - b.priceFrom);
        break;
      case 'price_desc':
        filtered.sort((a, b) => b.priceFrom - a.priceFrom);
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'nearest':
        if (filters.latitude && filters.longitude) {
           filtered.sort((a, b) => {
             const distA = getDistance(filters.latitude!, filters.longitude!, a.latitude, a.longitude);
             const distB = getDistance(filters.latitude!, filters.longitude!, b.latitude, b.longitude);
             return distA - distB;
           });
        }
        break;
    }
  }

  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const start = (page - 1) * limit;
  const end = start + limit;
  
  const paginated = filtered.slice(start, end);

  return {
    properties: paginated,
    total: filtered.length,
    page,
    totalPages: Math.ceil(filtered.length / limit)
  };
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180); 
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c;
  return d;
};

export const getNearbyProperties = (req: NearbyRequest): PropertyListing[] => {
  let filtered = [...MOCK_PROPERTIES];
  filtered = filtered.filter(p => {
    const dist = getDistance(req.latitude, req.longitude, p.latitude, p.longitude);
    return dist <= req.radiusKm;
  });
  
  filtered.sort((a, b) => {
    const distA = getDistance(req.latitude, req.longitude, a.latitude, a.longitude);
    const distB = getDistance(req.latitude, req.longitude, b.latitude, b.longitude);
    return distA - distB;
  });
  
  if (req.limit) {
    filtered = filtered.slice(0, req.limit);
  }
  return filtered;
};

export const getFeaturedProperties = (): PropertyListing[] => {
  return [...MOCK_PROPERTIES].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
};

export const getSimilarProperties = (propertyId: string, limit: number = 3): PropertyListing[] => {
  const target = MOCK_PROPERTIES.find(p => p.id === propertyId);
  if (!target) return [];
  
  return MOCK_PROPERTIES
    .filter(p => p.id !== propertyId)
    .filter(p => p.cityId === target.cityId || Math.abs(p.priceFrom - target.priceFrom) < 3000000)
    .slice(0, limit);
};
