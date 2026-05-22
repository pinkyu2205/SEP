import { District, Ward, PropertyListing, SearchFilters, SearchResult, NearbyRequest } from '../types';

export const DISTRICTS: District[] = [
  { id: 'q1', name: 'Quận 1', availableRooms: 15 },
  { id: 'q3', name: 'Quận 3', availableRooms: 22 },
  { id: 'q5', name: 'Quận 5', availableRooms: 18 },
  { id: 'q7', name: 'Quận 7', availableRooms: 45 },
  { id: 'q8', name: 'Quận 8', availableRooms: 30 },
  { id: 'qbt', name: 'Quận Bình Thạnh', availableRooms: 62 },
  { id: 'qgv', name: 'Quận Gò Vấp', availableRooms: 51 },
  { id: 'qtd', name: 'TP. Thủ Đức', availableRooms: 38 },
  { id: 'qpn', name: 'Quận Phú Nhuận', availableRooms: 25 },
  { id: 'qtb', name: 'Quận Tân Bình', availableRooms: 40 },
];

export const WARDS: Record<string, Ward[]> = {
  'q1': [
    { id: 'q1-bn', districtId: 'q1', name: 'Phường Bến Nghé', availableRooms: 5 },
    { id: 'q1-bt', districtId: 'q1', name: 'Phường Bến Thành', availableRooms: 4 },
    { id: 'q1-dn', districtId: 'q1', name: 'Phường Đa Kao', availableRooms: 6 },
  ],
  'q7': [
    { id: 'q7-tp', districtId: 'q7', name: 'Phường Tân Phú', availableRooms: 12 },
    { id: 'q7-bt', districtId: 'q7', name: 'Phường Bình Thuận', availableRooms: 8 },
    { id: 'q7-pm', districtId: 'q7', name: 'Phường Phú Mỹ', availableRooms: 15 },
    { id: 'q7-tk', districtId: 'q7', name: 'Phường Tân Kiểng', availableRooms: 6 },
    { id: 'q7-tq', districtId: 'q7', name: 'Phường Tân Quy', availableRooms: 4 },
  ],
  'qbt': [
    { id: 'qbt-p1', districtId: 'qbt', name: 'Phường 1', availableRooms: 10 },
    { id: 'qbt-p2', districtId: 'qbt', name: 'Phường 2', availableRooms: 8 },
    { id: 'qbt-p11', districtId: 'qbt', name: 'Phường 11', availableRooms: 14 },
    { id: 'qbt-p13', districtId: 'qbt', name: 'Phường 13', availableRooms: 9 },
    { id: 'qbt-p25', districtId: 'qbt', name: 'Phường 25', availableRooms: 21 },
  ],
  'qtd': [
    { id: 'qtd-lqd', districtId: 'qtd', name: 'Phường Linh Chiểu', availableRooms: 12 },
    { id: 'qtd-lt', districtId: 'qtd', name: 'Phường Linh Trung', availableRooms: 15 },
    { id: 'qtd-hp', districtId: 'qtd', name: 'Phường Hiệp Bình Phước', availableRooms: 11 },
  ]
};

export const MOCK_PROPERTIES: PropertyListing[] = [
  {
    id: 'prop-1',
    name: 'Nhà trọ Minh Phát',
    address: '12 Nguyễn Thị Thập',
    district: 'Quận 7',
    ward: 'Phường Tân Phú',
    districtId: 'q7',
    wardId: 'q7-tp',
    photos: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400'],
    priceFrom: 3500000,
    priceTo: 4500000,
    totalRooms: 10,
    availableRooms: 2,
    area: 25,
    amenities: ['Máy lạnh', 'Wifi', 'Máy giặt', 'Giữ xe', 'Bảo vệ'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 100000,
    description: 'Nhà trọ sạch sẽ, an ninh 24/7, gần Lotte Mart Quận 7, thuận tiện di chuyển.',
    latitude: 10.7402,
    longitude: 106.7153,
    rooms: [
      { id: 'r-1-1', name: 'Phòng 101', floor: 1, area: 25, price: 3500000, status: 'available' },
      { id: 'r-1-2', name: 'Phòng 201', floor: 2, area: 30, price: 4500000, status: 'available' }
    ],
    hostName: 'Chú Bình',
    hostPhone: '0901234567',
    createdAt: '2026-05-10T08:00:00Z'
  },
  {
    id: 'prop-2',
    name: 'KTX Sunrise',
    address: '45 Lê Văn Lương',
    district: 'Quận 7',
    ward: 'Phường Bình Thuận',
    districtId: 'q7',
    wardId: 'q7-bt',
    photos: ['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400'],
    priceFrom: 2000000,
    priceTo: 2800000,
    totalRooms: 15,
    availableRooms: 5,
    area: 15,
    amenities: ['Máy lạnh', 'Wifi', 'Giữ xe', 'Ban công'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 1,
    serviceFee: 50000,
    description: 'KTX cao cấp, sạch sẽ, bao điện nước (phụ thu máy lạnh).',
    latitude: 10.7420,
    longitude: 106.7100,
    rooms: [
      { id: 'r-2-1', name: 'Giường 1 - P101', floor: 1, area: 15, price: 2000000, status: 'available' },
      { id: 'r-2-2', name: 'Giường 2 - P101', floor: 1, area: 15, price: 2000000, status: 'available' },
      { id: 'r-2-3', name: 'Phòng 205 (Trống)', floor: 2, area: 20, price: 2800000, status: 'available' }
    ],
    hostName: 'Cô Lan',
    hostPhone: '0987654321',
    createdAt: '2026-05-15T09:30:00Z'
  },
  {
    id: 'prop-3',
    name: 'Phòng trọ Sinh viên HUTECH',
    address: '150 Điện Biên Phủ',
    district: 'Quận Bình Thạnh',
    ward: 'Phường 25',
    districtId: 'qbt',
    wardId: 'qbt-p25',
    photos: ['https://images.unsplash.com/photo-1598928506311-c55dd1f6874e?w=400'],
    priceFrom: 3000000,
    priceTo: 4000000,
    totalRooms: 20,
    availableRooms: 8,
    area: 20,
    amenities: ['Wifi', 'Giữ xe', 'Gác lửng', 'Bếp riêng'],
    electricityRate: 3800,
    waterRate: 18000,
    depositMonths: 2,
    serviceFee: 150000,
    description: 'Ngay ngã tư Hàng Xanh, tiện đi lại các trường Đại học.',
    latitude: 10.8010,
    longitude: 106.7120,
    rooms: [
      { id: 'r-3-1', name: 'P.101', floor: 1, area: 20, price: 3000000, status: 'available' },
      { id: 'r-3-2', name: 'P.102', floor: 1, area: 25, price: 4000000, status: 'available' }
    ],
    createdAt: '2026-05-18T10:00:00Z'
  },
  {
    id: 'prop-4',
    name: 'Căn hộ mini Pearl',
    address: '22 Võ Văn Ngân',
    district: 'TP. Thủ Đức',
    ward: 'Phường Linh Chiểu',
    districtId: 'qtd',
    wardId: 'qtd-lqd',
    photos: ['https://images.unsplash.com/photo-1502672260266-1c15a82230b5?w=400'],
    priceFrom: 4500000,
    priceTo: 6000000,
    totalRooms: 12,
    availableRooms: 3,
    area: 35,
    amenities: ['Máy lạnh', 'Wifi', 'Máy giặt', 'Giữ xe', 'Bảo vệ', 'Bếp riêng', 'Ban công'],
    electricityRate: 3500,
    waterRate: 15000,
    depositMonths: 2,
    serviceFee: 200000,
    description: 'Căn hộ mini đầy đủ nội thất, giờ giấc tự do, an ninh.',
    latitude: 10.8500,
    longitude: 106.7550,
    rooms: [
      { id: 'r-4-1', name: 'CH 201', floor: 2, area: 35, price: 4500000, status: 'available' },
      { id: 'r-4-2', name: 'CH 401', floor: 4, area: 40, price: 6000000, status: 'available' }
    ],
    createdAt: '2026-05-20T14:00:00Z'
  }
];

export const getDistrictById = (id: string): District | undefined => {
  return DISTRICTS.find(d => d.id === id);
};

export const getWardsByDistrict = (districtId: string): Ward[] => {
  return WARDS[districtId] || [];
};

export const searchProperties = (filters: SearchFilters): SearchResult => {
  let filtered = [...MOCK_PROPERTIES];

  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(kw) || p.address.toLowerCase().includes(kw));
  }
  
  if (filters.districtId) {
    filtered = filtered.filter(p => p.districtId === filters.districtId);
  }
  
  if (filters.wardIds && filters.wardIds.length > 0) {
    filtered = filtered.filter(p => filters.wardIds!.includes(p.wardId));
  }
  
  if (filters.priceMin !== undefined) {
    filtered = filtered.filter(p => p.priceTo >= filters.priceMin!); // Include properties where at least one room fits
  }
  
  if (filters.priceMax !== undefined) {
    filtered = filtered.filter(p => p.priceFrom <= filters.priceMax!); // Include properties where at least one room fits
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
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180); 
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
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
