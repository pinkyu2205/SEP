/**
 * Bất động sản trong phạm vi phụ trách của Operations Manager — kiểu dữ liệu +
 * helper xếp mức ưu tiên. Dữ liệu THẬT được `services/manager/propertyService.ts`
 * dựng từ `/api/v1/properties` + `/properties/{id}/rooms` + hợp đồng khách thuê.
 *
 * Trước 15/08/2026 file này nằm ở `data/managedProperties.ts` và kèm luôn 5 căn nhà
 * viết cứng (MANAGED_PROPERTIES) + toàn bộ dữ liệu vận hành giả cho từng căn
 * (BUILDING_OPS: phòng, hoá đơn, khách thuê, chỉ số điện nước). Bốn màn đọc đống đó
 * đã bị xoá vì không màn nào điều hướng tới; phần còn lại chỉ dùng kiểu + 3 helper,
 * nên chuyển sang `types/` cho đúng chỗ.
 */

export type PropertyType = 'MULTI_ROOM' | 'WHOLE_HOUSE';
export type WholeHouseRentalStatus = 'rented' | 'vacant' | 'expiring' | 'maintenance';

export interface ManagedProperty {
  id: string;
  propertyType: PropertyType;
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
  rentalStatus?: WholeHouseRentalStatus;
  tenantName?: string;
  contractEndDate?: string;
  monthlyRent?: number;
  handoverChecklist?: { label: string; done: boolean }[];
  occupants?: { name: string; relation: string; phone?: string }[];
  wholeHouseEquipment?: { id: string; name: string; status: string; qrCode: string; handoverTracked: boolean }[];
}

/**
 * Mức ưu tiên vận hành — số nhỏ = gấp hơn (dùng để sắp xếp + tô màu).
 * 0 bảo trì gấp · 1 hoá đơn quá hạn · 2 thiếu chỉ số điện nước · 3 trống lâu · 4 bình thường
 */
export const getPropPriority = (prop: ManagedProperty): number => {
  if (prop.hasMaintenanceIssues) return 0;
  if (prop.hasUnpaidInvoices) return 1;
  if (prop.missingUtility) return 2;
  if (prop.propertyType === 'WHOLE_HOUSE' && prop.rentalStatus === 'expiring') return 2;
  if (prop.propertyType === 'WHOLE_HOUSE' && prop.rentalStatus === 'vacant') return 3;
  if (prop.available > 1) return 3;
  return 4;
};

export type PrioritySeverity = 'critical' | 'warning' | 'normal';

/** Màu viền trái / chấm của thẻ nhà. Critical = đỏ, warning = vàng, normal = không tô. */
export const getPriorityMeta = (prop: ManagedProperty): { severity: PrioritySeverity; color: string | null } => {
  const level = getPropPriority(prop);
  if (level <= 1) return { severity: 'critical', color: '#EF4444' };
  if (level <= 3) return { severity: 'warning', color: '#F59E0B' };
  return { severity: 'normal', color: null };
};

/** Số loại vấn đề đang tồn của một căn nhà. */
export const getIssueCount = (prop: ManagedProperty): number =>
  [prop.hasMaintenanceIssues, prop.hasUnpaidInvoices, prop.missingUtility, prop.hasExpiringContracts]
    .filter(Boolean).length;
