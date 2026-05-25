import { useState, useEffect } from 'react';
import { Equipment } from '../types';

export const MOCK_EQUIPMENT_DB: Record<string, Equipment> = {
  'EQ-101-AC': {
    id: 'eq1', assetId: 'EQ-101-AC', name: 'Điều hòa Daikin 9000BTU',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện lạnh', qrCode: 'EQ-101-AC',
    status: 'active', brand: 'Daikin', model: 'FTKA25UAVMV',
    serialNumber: 'SN-EQ101AC-EQ1',
    purchasePrice: 8500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-03-18',
    maintenanceHistory: [
      { id: 'mh1', date: '2026-03-18', type: 'maintenance', description: 'Vệ sinh lưới lọc, kiểm tra gas', cost: 250000, performedBy: 'Kỹ thuật viên Daikin' },
      { id: 'mh2', date: '2025-09-10', type: 'maintenance', description: 'Bơm gas, kiểm tra định kỳ', cost: 350000, performedBy: 'Kỹ thuật viên Daikin' },
    ],
    images: [],
    notes: 'Sử dụng chế độ Eco để tiết kiệm điện. Nhiệt độ khuyến nghị 26-28°C.',
  },
  'EQ-101-WM': {
    id: 'eq2', assetId: 'EQ-101-WM', name: 'Máy giặt Toshiba 8kg',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện lạnh', qrCode: 'EQ-101-WM',
    status: 'active', brand: 'Toshiba', model: 'TW-BH85S2V',
    serialNumber: 'SN-EQ101WM-EQ2',
    purchasePrice: 4500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: '2025-12-01',
    maintenanceHistory: [],
    images: [],
    notes: 'Không giặt quá 8kg. Vệ sinh lưới lọc mỗi tháng.',
  },
  'EQ-101-WH': {
    id: 'eq7', assetId: 'EQ-101-WH', name: 'Máy nước nóng Ariston 20L',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện', qrCode: 'EQ-101-WH',
    status: 'active', brand: 'Ariston', model: 'AN2 20 2.5 FE',
    serialNumber: 'SN-EQ101WH-EQ7',
    purchasePrice: 2800000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Không bật máy khi không có nước. Kiểm tra van an toàn định kỳ 6 tháng/lần.',
  },
  'EQ-101-RF': {
    id: 'eq8', assetId: 'EQ-101-RF', name: 'Tủ lạnh Samsung 180L',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện lạnh', qrCode: 'EQ-101-RF',
    status: 'active', brand: 'Samsung', model: 'RT18M300BGS',
    serialNumber: 'SN-EQ101RF-EQ8',
    purchasePrice: 5200000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: '2025-11-20',
    maintenanceHistory: [
      { id: 'mh7', date: '2025-11-20', type: 'maintenance', description: 'Vệ sinh dàn lạnh, kiểm tra nhiệt độ', cost: 150000, performedBy: 'Thợ kỹ thuật nội bộ' },
    ],
    images: [],
    notes: 'Đặt nhiệt độ tủ lạnh 2-5°C, ngăn đá -18°C. Không để thức ăn nóng vào tủ.',
  },
  'EQ-101-TV': {
    id: 'eq9', assetId: 'EQ-101-TV', name: 'Tivi LG 43 inch Smart TV',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện tử', qrCode: 'EQ-101-TV',
    status: 'active', brand: 'LG', model: '43LM5500PTA',
    serialNumber: 'SN-EQ101TV-EQ9',
    purchasePrice: 7900000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Mật khẩu WiFi: NhaTro2025. Không tự ý tháo lắp thiết bị kết nối.',
  },
  'EQ-101-BED': {
    id: 'eq10', assetId: 'EQ-101-BED', name: 'Giường ngủ 1m6 có tủ đầu giường',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Nội thất', qrCode: 'EQ-101-BED',
    status: 'active', brand: 'Nội địa', model: 'Giường gỗ MDF',
    serialNumber: undefined,
    purchasePrice: 3500000, purchaseDate: '2025-01-05',
    installationDate: '2025-01-10',
    warrantyExpiry: undefined,
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Không đặt vật nặng lên đầu giường. Báo ngay nếu phát hiện mối mọt.',
  },
  'EQ-101-DESK': {
    id: 'eq11', assetId: 'EQ-101-DESK', name: 'Bàn học + ghế văn phòng',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Nội thất', qrCode: 'EQ-101-DESK',
    status: 'needs_check', brand: 'Nội địa', model: 'Bàn gỗ công nghiệp',
    serialNumber: undefined,
    purchasePrice: 1800000, purchaseDate: '2025-01-05',
    installationDate: '2025-01-10',
    warrantyExpiry: undefined,
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Ghế hiện bị lỏng bánh xe. Đã thông báo quản lý, chờ xử lý.',
  },
  'EQ-101-WC': {
    id: 'eq12', assetId: 'EQ-101-WC', name: 'Vòi sen + bồn cầu',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Vệ sinh', qrCode: 'EQ-101-WC',
    status: 'active', brand: 'Inax', model: 'Mixed',
    serialNumber: undefined,
    purchasePrice: 4200000, purchaseDate: '2025-01-05',
    installationDate: '2025-01-10',
    warrantyExpiry: undefined,
    lastMaintenanceAt: '2026-01-05',
    maintenanceHistory: [
      { id: 'mh8', date: '2026-01-05', type: 'maintenance', description: 'Vệ sinh bồn cầu, thay gioăng vòi sen', cost: 120000, performedBy: 'Thợ kỹ thuật nội bộ' },
    ],
    images: [],
    notes: 'Không đổ chất tẩy mạnh vào bồn cầu. Dùng nước xả chuyên dụng.',
  },
  'EQ-102-AC': {
    id: 'eq3', assetId: 'EQ-102-AC', name: 'Điều hòa Panasonic 9000BTU',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r2', roomName: 'Phòng P102',
    category: 'Điện lạnh', qrCode: 'EQ-102-AC',
    status: 'repairing', brand: 'Panasonic', model: 'CU/CS-PU9WKH-8',
    serialNumber: 'SN-EQ102AC-EQ3',
    purchasePrice: 8200000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-04-28',
    maintenanceHistory: [
      { id: 'mh3', date: '2026-04-28', type: 'repair', description: 'Báo lỗi E4 — thợ đang kiểm tra board mạch', cost: 500000, performedBy: 'Trung tâm bảo hành Panasonic' },
    ],
    images: [],
    notes: 'Đang trong quá trình sửa chữa. Liên hệ quản lý nếu cần hỗ trợ.',
  },
  'EQ-103-FR': {
    id: 'eq4', assetId: 'EQ-103-FR', name: 'Tủ lạnh Aqua 130L',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r3', roomName: 'Phòng P103',
    category: 'Điện lạnh', qrCode: 'EQ-103-FR',
    status: 'damaged', brand: 'Aqua', model: 'AQR-T150FA',
    serialNumber: 'SN-EQ103FR-EQ4',
    purchasePrice: 3200000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Thiết bị đang hỏng — không làm lạnh. Đã báo cáo quản lý.',
  },
  'EQ-C-WM01': {
    id: 'eq5', assetId: 'EQ-C-WM01', name: 'Máy giặt chung khu A',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: undefined, roomName: 'Khu vực chung',
    category: 'Điện lạnh', qrCode: 'EQ-C-WM01',
    status: 'active', brand: 'Samsung', model: 'WW10T534DAW',
    serialNumber: 'SN-EQCWM01-EQ5',
    purchasePrice: 7500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-02-01',
    maintenanceHistory: [],
    images: [],
    notes: 'Máy giặt dùng chung. Vui lòng không giặt đồ quá 10kg mỗi lần.',
  },
  'EQ-201-AC': {
    id: 'eq6', assetId: 'EQ-201-AC', name: 'Điều hòa Casper 9000BTU',
    houseId: 'prop-2', houseName: 'Nhà Lê Văn Sỹ',
    roomId: 'r7', roomName: 'Phòng P201',
    category: 'Điện lạnh', qrCode: 'EQ-201-AC',
    status: 'active', brand: 'Casper', model: 'IC-09TL32',
    serialNumber: 'SN-EQ201AC-EQ6',
    purchasePrice: 5500000, purchaseDate: '2025-10-15',
    installationDate: '2025-10-20',
    warrantyExpiry: '2028-10-20',
    lastMaintenanceAt: '2026-01-15',
    maintenanceHistory: [],
    images: [],
    notes: 'Nhiệt độ khuyến nghị 26-28°C. Tắt khi ra ngoài quá 30 phút.',
  },
};

// Map roomId → list of asset IDs in that room
const ROOM_EQUIPMENT_MAP: Record<string, string[]> = {
  'r1': ['EQ-101-AC', 'EQ-101-WM', 'EQ-101-WH', 'EQ-101-RF', 'EQ-101-TV', 'EQ-101-BED', 'EQ-101-DESK', 'EQ-101-WC'],
  'r2': ['EQ-102-AC'],
  'r3': ['EQ-103-FR'],
  'r7': ['EQ-201-AC'],
};

const _listeners = new Set<() => void>();
const _notify = () => _listeners.forEach(fn => fn());

export const equipmentStore = {
  getAll: () => Object.values(MOCK_EQUIPMENT_DB),
  getByAssetId: (assetId: string): Equipment | null => MOCK_EQUIPMENT_DB[assetId] ?? null,
  getRoomEquipment: (roomId: string): Equipment[] => {
    const codes = ROOM_EQUIPMENT_MAP[roomId] ?? [];
    return codes.map(c => MOCK_EQUIPMENT_DB[c]).filter(Boolean) as Equipment[];
  },
};

export const useRoomEquipment = (roomId: string): Equipment[] => {
  const [items, setItems] = useState<Equipment[]>(() => equipmentStore.getRoomEquipment(roomId));
  useEffect(() => {
    const update = () => setItems(equipmentStore.getRoomEquipment(roomId));
    _listeners.add(update);
    return () => { _listeners.delete(update); };
  }, [roomId]);
  return items;
};
