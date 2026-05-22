export type InspectionType = 'check_in' | 'check_out';
export type InspectionStatus = 'draft' | 'completed' | 'tenant_confirmed' | 'disputed';

export interface RoomInspection {
  id: string;
  contractId: string;
  tenantId: string;
  tenantName: string;
  propertyId: string;
  propertyName: string;
  roomId?: string;
  roomCode?: string;
  inspectionType: InspectionType;
  images: string[];
  notes?: string;
  damageNotes?: string;
  depositDeductionNotes?: string;
  depositDeductionAmount?: number;
  createdBy: string;
  createdAt: string;
  status: InspectionStatus;
  timeline: Array<{ label: string; at: string; by: string }>;
}

const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/1200`;

export const ROOM_INSPECTIONS: RoomInspection[] = [
  {
    id: 'insp-ct1-2-in',
    contractId: 'ct1-2',
    tenantId: 'tn1-1',
    tenantName: 'Trần Văn A',
    propertyId: 'prop-1',
    propertyName: 'Nhà Nguyễn Trãi',
    roomId: 'r1-101',
    roomCode: 'P101',
    inspectionType: 'check_in',
    images: ['p101-wall-in', 'p101-door-in', 'p101-meter-in', 'p101-bath-in'].map(img),
    notes: 'Phòng sạch, tường có một vết xước nhỏ cạnh cửa sổ. Đồng hồ điện/nước đã chốt trước bàn giao.',
    createdBy: 'Manager A',
    createdAt: '2025-09-01',
    status: 'tenant_confirmed',
    timeline: [
      { label: 'Tạo biên bản check-in', at: '2025-09-01 09:10', by: 'Manager A' },
      { label: 'Khách thuê xác nhận OTP', at: '2025-09-01 09:24', by: 'Trần Văn A' },
    ],
  },
  {
    id: 'insp-ct1-1-in',
    contractId: 'ct1-1',
    tenantId: 'tn1-4',
    tenantName: 'Ngô Thị D',
    propertyId: 'prop-1',
    propertyName: 'Nhà Nguyễn Trãi',
    roomId: 'r1-301',
    roomCode: 'P301',
    inspectionType: 'check_in',
    images: ['p301-in-1', 'p301-in-2', 'p301-in-3'].map(img),
    notes: 'Bàn giao đủ chìa khóa, máy lạnh hoạt động bình thường, sàn sạch.',
    createdBy: 'Manager A',
    createdAt: '2025-06-15',
    status: 'completed',
    timeline: [
      { label: 'Tạo biên bản check-in', at: '2025-06-15 14:00', by: 'Manager A' },
    ],
  },
  {
    id: 'insp-ct1-1-out',
    contractId: 'ct1-1',
    tenantId: 'tn1-4',
    tenantName: 'Ngô Thị D',
    propertyId: 'prop-1',
    propertyName: 'Nhà Nguyễn Trãi',
    roomId: 'r1-301',
    roomCode: 'P301',
    inspectionType: 'check_out',
    images: ['p301-out-1', 'p301-out-2'].map(img),
    notes: 'Khách bàn giao phòng đúng ngày, đã thu hồi chìa khóa.',
    damageNotes: 'Trầy sơn khu vực đầu giường, rèm cửa bị rách nhẹ.',
    depositDeductionNotes: 'Khấu trừ sơn vá tường và thay rèm.',
    depositDeductionAmount: 500000,
    createdBy: 'Manager A',
    createdAt: '2026-06-15',
    status: 'completed',
    timeline: [
      { label: 'Tạo biên bản check-out', at: '2026-06-15 10:30', by: 'Manager A' },
      { label: 'Ghi nhận khấu trừ cọc', at: '2026-06-15 10:45', by: 'Manager A' },
    ],
  },
  {
    id: 'insp-ct3-1-in',
    contractId: 'ct3-1',
    tenantId: 'tn3-1',
    tenantName: 'Bùi Văn H',
    propertyId: 'prop-3',
    propertyName: 'Nhà Cách Mạng Tháng 8',
    roomId: 'r3-101',
    roomCode: 'P101',
    inspectionType: 'check_in',
    images: ['cmt8-p101-in-1', 'cmt8-p101-in-2'].map(img),
    notes: 'Hiện trạng tốt, nội thất cơ bản đầy đủ.',
    createdBy: 'Manager B',
    createdAt: '2025-11-01',
    status: 'tenant_confirmed',
    timeline: [
      { label: 'Tạo biên bản check-in', at: '2025-11-01 08:45', by: 'Manager B' },
    ],
  },
  {
    id: 'insp-house-1-in',
    contractId: 'HD-NVC-2026',
    tenantId: 'wh-1',
    tenantName: 'Gia đình anh Minh',
    propertyId: 'house-1',
    propertyName: 'Nhà Nguyễn Văn Cừ',
    inspectionType: 'check_in',
    images: ['nvc-living-in', 'nvc-kitchen-in', 'nvc-meter-in'].map(img),
    notes: 'Bàn giao nhà nguyên căn, đã chốt đồng hồ tổng và ghi nhận thiết bị gắn tường.',
    createdBy: 'Manager A',
    createdAt: '2026-01-01',
    status: 'tenant_confirmed',
    timeline: [
      { label: 'Tạo biên bản check-in', at: '2026-01-01 09:00', by: 'Manager A' },
      { label: 'Khách thuê chính xác nhận', at: '2026-01-01 09:18', by: 'Anh Minh' },
    ],
  },
];

export const getInspectionsByContractId = (contractId: string): RoomInspection[] =>
  ROOM_INSPECTIONS.filter(inspection => inspection.contractId === contractId);

export const getInspectionById = (id: string): RoomInspection | undefined =>
  ROOM_INSPECTIONS.find(inspection => inspection.id === id);

export const getInspectionsByRoom = (propertyId: string, roomCode?: string): RoomInspection[] =>
  ROOM_INSPECTIONS.filter(inspection =>
    inspection.propertyId === propertyId && (!roomCode || inspection.roomCode === roomCode)
  );

export const getSiblingInspection = (inspection: RoomInspection): RoomInspection | undefined =>
  ROOM_INSPECTIONS.find(item =>
    item.contractId === inspection.contractId && item.inspectionType !== inspection.inspectionType
  );

export const getInspectionTypeLabel = (type: InspectionType) =>
  type === 'check_in' ? 'Check-in' : 'Check-out';

export const getInspectionStatusLabel = (status: InspectionStatus) => {
  if (status === 'tenant_confirmed') return 'Khách đã xác nhận';
  if (status === 'completed') return 'Hoàn tất';
  if (status === 'disputed') return 'Có tranh chấp';
  return 'Nháp';
};
