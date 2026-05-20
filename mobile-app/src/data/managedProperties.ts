// Shared mock data + priority helpers for the manager's building portfolio.
// Used by the dashboard overview (ManagerHomeScreen) and the BuildingDetailScreen.

export interface ManagedProperty {
  id: string;
  name: string;
  address: string;
  district: string;
  totalFloors: number;
  totalRooms: number;
  occupied: number;
  available: number;
  maintenance: number;
  monthlyLeaseCost: number;
  electricityRate: number;
  waterRate: number;
  serviceCharge: number;
  hostName: string;
  hasMaintenanceIssues: boolean;
  maintenanceCount: number;
  hasUnpaidInvoices: boolean;
  unpaidCount: number;
  missingUtility: boolean;
  hasExpiringContracts: boolean;
  expiringContractCount: number;
}

export const MANAGED_PROPERTIES: ManagedProperty[] = [
  {
    id: 'prop-1',
    name: 'Nhà Nguyễn Trãi',
    address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
    district: 'Quận 5',
    totalFloors: 3,
    totalRooms: 8,
    occupied: 5,
    available: 2,
    maintenance: 1,
    monthlyLeaseCost: 25000000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceCharge: 100000,
    hostName: 'Nguyễn Văn Host',
    hasMaintenanceIssues: true,
    maintenanceCount: 2,
    hasUnpaidInvoices: true,
    unpaidCount: 1,
    missingUtility: false,
    hasExpiringContracts: true,
    expiringContractCount: 1,
  },
  {
    id: 'prop-3',
    name: 'Nhà Cách Mạng Tháng 8',
    address: '789 CMT8, Quận 10, TP.HCM',
    district: 'Quận 10',
    totalFloors: 2,
    totalRooms: 4,
    occupied: 3,
    available: 1,
    maintenance: 0,
    monthlyLeaseCost: 18000000,
    electricityRate: 3500,
    waterRate: 15000,
    serviceCharge: 80000,
    hostName: 'Trần Văn Host',
    hasMaintenanceIssues: false,
    maintenanceCount: 0,
    hasUnpaidInvoices: false,
    unpaidCount: 0,
    missingUtility: true,
    hasExpiringContracts: false,
    expiringContractCount: 0,
  },
];

export const getPropertyById = (id: string): ManagedProperty | undefined =>
  MANAGED_PROPERTIES.find(p => p.id === id);

// Operational priority — lower = more urgent (drives sorting + highlight).
// 0 urgent maintenance · 1 overdue invoices · 2 missing utility readings · 3 long vacancy · 4 normal
export const getPropPriority = (prop: ManagedProperty): number => {
  if (prop.hasMaintenanceIssues) return 0;
  if (prop.hasUnpaidInvoices) return 1;
  if (prop.missingUtility) return 2;
  if (prop.available > 1) return 3;
  return 4;
};

export type PrioritySeverity = 'critical' | 'warning' | 'normal';

// Visual treatment for a building's left-border / dot. Critical = red, warning = amber, normal = none.
export const getPriorityMeta = (prop: ManagedProperty): { severity: PrioritySeverity; color: string | null } => {
  const level = getPropPriority(prop);
  if (level <= 1) return { severity: 'critical', color: '#EF4444' };
  if (level <= 3) return { severity: 'warning', color: '#F59E0B' };
  return { severity: 'normal', color: null };
};

// Number of distinct operational issues attached to a building.
export const getIssueCount = (prop: ManagedProperty): number =>
  [prop.hasMaintenanceIssues, prop.hasUnpaidInvoices, prop.missingUtility, prop.hasExpiringContracts]
    .filter(Boolean).length;

// Lightweight one-line health summary shown on the dashboard card.
export const getHealthSummary = (
  prop: ManagedProperty,
): { label: string; color: string } => {
  const { severity } = getPriorityMeta(prop);
  if (severity === 'critical') return { label: `⚠️ ${getIssueCount(prop)} vấn đề cần xử lý`, color: '#EF4444' };
  if (severity === 'warning') return { label: '🟡 Cần chú ý', color: '#D97706' };
  return { label: '✅ Hoạt động ổn định', color: '#16A34A' };
};

// Full building health status used inside the detail hero.
export const getBuildingHealth = (
  prop: ManagedProperty,
): { label: string; color: string; bg: string } => {
  const { severity } = getPriorityMeta(prop);
  if (severity === 'critical') return { label: '🔴 Nhiều vấn đề cần xử lý', color: '#EF4444', bg: '#FEE2E2' };
  if (severity === 'warning') return { label: '🟡 Cần chú ý', color: '#D97706', bg: '#FEF3C7' };
  return { label: '🟢 Hoạt động ổn định', color: '#16A34A', bg: '#F0FDF4' };
};

// ===================== PER-BUILDING OPERATIONAL DATA =====================
export type RoomStatus = 'occupied' | 'available' | 'maintenance';
export interface BuildingRoom {
  id: string; code: string; floor: number; status: RoomStatus;
  tenantName?: string; rentPrice: number; area: number;
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';
export interface BuildingInvoice {
  id: string; room: string; tenant: string; period: string;
  amount: number; status: InvoiceStatus; daysOverdue?: number;
}

export type MaintenanceStatus = 'pending' | 'in_progress' | 'done';
export interface BuildingMaintenance {
  id: string; room: string; title: string; urgency: 'urgent' | 'normal';
  status: MaintenanceStatus; reportedDate: string; cost?: number;
}

export type ContractStatus = 'active' | 'pending' | 'expiring';
export interface BuildingContract {
  id: string; room: string; tenant: string; startDate: string; endDate: string;
  status: ContractStatus; monthlyRent: number;
}

export type PaymentRisk = 'low' | 'medium' | 'high';
export interface BuildingTenantInfo {
  id: string; name: string; room: string; phone: string;
  paymentRisk: PaymentRisk; moveInDate: string;
}

export type ReadingStatus = 'done' | 'missing';
export interface BuildingUtilityReading {
  id: string; room: string; tenant: string; status: ReadingStatus;
  lastReadingDate: string; elecPrev: number; waterPrev: number;
}

export interface BuildingOperations {
  rooms: BuildingRoom[];
  invoices: BuildingInvoice[];
  maintenance: BuildingMaintenance[];
  contracts: BuildingContract[];
  tenants: BuildingTenantInfo[];
  utility: BuildingUtilityReading[];
}

const BUILDING_DATA: Record<string, BuildingOperations> = {
  'prop-1': {
    rooms: [
      { id: 'r1-101', code: 'P101', floor: 1, status: 'occupied', tenantName: 'Trần Văn A', rentPrice: 3500000, area: 20 },
      { id: 'r1-102', code: 'P102', floor: 1, status: 'occupied', tenantName: 'Lê Thị B', rentPrice: 3200000, area: 18 },
      { id: 'r1-103', code: 'P103', floor: 1, status: 'available', rentPrice: 3300000, area: 18 },
      { id: 'r1-201', code: 'P201', floor: 2, status: 'maintenance', rentPrice: 3800000, area: 22 },
      { id: 'r1-202', code: 'P202', floor: 2, status: 'occupied', tenantName: 'Phạm Văn C', rentPrice: 3600000, area: 20 },
      { id: 'r1-301', code: 'P301', floor: 3, status: 'occupied', tenantName: 'Ngô Thị D', rentPrice: 3500000, area: 20 },
      { id: 'r1-302', code: 'P302', floor: 3, status: 'occupied', tenantName: 'Vũ Thị E', rentPrice: 3500000, area: 20 },
      { id: 'r1-303', code: 'P303', floor: 3, status: 'available', rentPrice: 3400000, area: 19 },
    ],
    invoices: [
      { id: 'iv1-1', room: 'P101', tenant: 'Trần Văn A', period: '05/2026', amount: 4200000, status: 'overdue', daysOverdue: 8 },
      { id: 'iv1-2', room: 'P102', tenant: 'Lê Thị B', period: '05/2026', amount: 3800000, status: 'unpaid' },
      { id: 'iv1-3', room: 'P302', tenant: 'Vũ Thị E', period: '05/2026', amount: 3900000, status: 'unpaid' },
      { id: 'iv1-4', room: 'P202', tenant: 'Phạm Văn C', period: '05/2026', amount: 3600000, status: 'paid' },
      { id: 'iv1-5', room: 'P301', tenant: 'Ngô Thị D', period: '05/2026', amount: 4000000, status: 'paid' },
    ],
    maintenance: [
      { id: 'mt1-1', room: 'P201', title: 'Hỏng máy lạnh', urgency: 'urgent', status: 'in_progress', reportedDate: '2026-05-18', cost: 850000 },
      { id: 'mt1-2', room: 'P102', title: 'Rò rỉ nước nhà tắm', urgency: 'normal', status: 'pending', reportedDate: '2026-05-19' },
    ],
    contracts: [
      { id: 'ct1-1', room: 'P301', tenant: 'Ngô Thị D', startDate: '2025-06-15', endDate: '2026-06-15', status: 'expiring', monthlyRent: 3500000 },
      { id: 'ct1-2', room: 'P101', tenant: 'Trần Văn A', startDate: '2025-09-01', endDate: '2026-09-01', status: 'active', monthlyRent: 3500000 },
      { id: 'ct1-3', room: 'P102', tenant: 'Lê Thị B', startDate: '2025-10-01', endDate: '2026-10-01', status: 'active', monthlyRent: 3200000 },
      { id: 'ct1-4', room: 'P202', tenant: 'Phạm Văn C', startDate: '2026-01-01', endDate: '2027-01-01', status: 'active', monthlyRent: 3600000 },
      { id: 'ct1-5', room: 'P302', tenant: 'Vũ Thị E', startDate: '2026-02-01', endDate: '2027-02-01', status: 'active', monthlyRent: 3500000 },
    ],
    tenants: [
      { id: 'tn1-1', name: 'Trần Văn A', room: 'P101', phone: '0901 234 567', paymentRisk: 'high', moveInDate: '2025-09-01' },
      { id: 'tn1-2', name: 'Lê Thị B', room: 'P102', phone: '0902 345 678', paymentRisk: 'medium', moveInDate: '2025-10-01' },
      { id: 'tn1-3', name: 'Phạm Văn C', room: 'P202', phone: '0903 456 789', paymentRisk: 'low', moveInDate: '2026-01-01' },
      { id: 'tn1-4', name: 'Ngô Thị D', room: 'P301', phone: '0904 567 890', paymentRisk: 'low', moveInDate: '2025-06-15' },
      { id: 'tn1-5', name: 'Vũ Thị E', room: 'P302', phone: '0905 678 901', paymentRisk: 'medium', moveInDate: '2026-02-01' },
    ],
    utility: [
      { id: 'ut1-1', room: 'P101', tenant: 'Trần Văn A', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 1240, waterPrev: 85 },
      { id: 'ut1-2', room: 'P102', tenant: 'Lê Thị B', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 980, waterPrev: 64 },
      { id: 'ut1-3', room: 'P202', tenant: 'Phạm Văn C', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 1105, waterPrev: 72 },
      { id: 'ut1-4', room: 'P301', tenant: 'Ngô Thị D', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 1320, waterPrev: 91 },
      { id: 'ut1-5', room: 'P302', tenant: 'Vũ Thị E', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 1010, waterPrev: 68 },
    ],
  },
  'prop-3': {
    rooms: [
      { id: 'r3-101', code: 'P101', floor: 1, status: 'occupied', tenantName: 'Bùi Văn H', rentPrice: 4000000, area: 25 },
      { id: 'r3-102', code: 'P102', floor: 1, status: 'available', rentPrice: 3600000, area: 22 },
      { id: 'r3-201', code: 'P201', floor: 2, status: 'occupied', tenantName: 'Đỗ Thị K', rentPrice: 3800000, area: 23 },
      { id: 'r3-202', code: 'P202', floor: 2, status: 'occupied', tenantName: 'Hoàng Văn L', rentPrice: 3700000, area: 22 },
    ],
    invoices: [
      { id: 'iv3-1', room: 'P101', tenant: 'Bùi Văn H', period: '05/2026', amount: 4000000, status: 'paid' },
      { id: 'iv3-2', room: 'P201', tenant: 'Đỗ Thị K', period: '05/2026', amount: 3800000, status: 'paid' },
      { id: 'iv3-3', room: 'P202', tenant: 'Hoàng Văn L', period: '05/2026', amount: 3700000, status: 'unpaid' },
    ],
    maintenance: [],
    contracts: [
      { id: 'ct3-1', room: 'P101', tenant: 'Bùi Văn H', startDate: '2025-11-01', endDate: '2026-11-01', status: 'active', monthlyRent: 4000000 },
      { id: 'ct3-2', room: 'P201', tenant: 'Đỗ Thị K', startDate: '2026-01-15', endDate: '2027-01-15', status: 'active', monthlyRent: 3800000 },
      { id: 'ct3-3', room: 'P202', tenant: 'Hoàng Văn L', startDate: '2026-03-01', endDate: '2027-03-01', status: 'active', monthlyRent: 3700000 },
    ],
    tenants: [
      { id: 'tn3-1', name: 'Bùi Văn H', room: 'P101', phone: '0906 789 012', paymentRisk: 'low', moveInDate: '2025-11-01' },
      { id: 'tn3-2', name: 'Đỗ Thị K', room: 'P201', phone: '0907 890 123', paymentRisk: 'low', moveInDate: '2026-01-15' },
      { id: 'tn3-3', name: 'Hoàng Văn L', room: 'P202', phone: '0908 901 234', paymentRisk: 'medium', moveInDate: '2026-03-01' },
    ],
    utility: [
      { id: 'ut3-1', room: 'P101', tenant: 'Bùi Văn H', status: 'missing', lastReadingDate: '2026-04-30', elecPrev: 1450, waterPrev: 102 },
      { id: 'ut3-2', room: 'P201', tenant: 'Đỗ Thị K', status: 'missing', lastReadingDate: '2026-04-30', elecPrev: 1180, waterPrev: 77 },
      { id: 'ut3-3', room: 'P202', tenant: 'Hoàng Văn L', status: 'done', lastReadingDate: '2026-05-01', elecPrev: 1290, waterPrev: 88 },
    ],
  },
};

const EMPTY_OPERATIONS: BuildingOperations = {
  rooms: [], invoices: [], maintenance: [], contracts: [], tenants: [], utility: [],
};

export const getBuildingOps = (id: string): BuildingOperations =>
  BUILDING_DATA[id] || EMPTY_OPERATIONS;
