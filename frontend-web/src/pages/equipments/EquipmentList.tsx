import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Building2,
  CheckCircle, ChevronRight, ClipboardCheck, Copy, DollarSign,
  Download, Eye, History, Info, MapPin, Package, Plus, Printer,
  QrCode, Search, Settings2, ShieldCheck, Target, Wrench, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import type { Equipment } from '../../types';
import { MOCK_EQUIPMENTS, MOCK_MAINTENANCE_REQUESTS, MOCK_PROPERTIES } from '../../utils/mockData';
import { formatCurrency } from '../../utils';

type HealthStatus = 'excellent' | 'good' | 'warning' | 'critical';
type DetailTab = 'overview' | 'qr' | 'history' | 'lifecycle';

interface RepairRecord {
  id: string;
  date: string;
  issue: string;
  cost: number;
  status: 'completed' | 'in_progress' | 'open';
  manager: string;
}

interface AssetProfile extends Equipment {
  assetQrCode: string;
  serialNumber: string;
  qrScanUrl: string;
  qrScanCount: number;
  latestScanAt?: string;
  qrMaintenanceRequests: number;
  activeRepairStatus: 'none' | 'reported' | 'in_progress' | 'resolved';
  warrantyExpiredDate: string;
  installationLocation: string;
  operationalAgeMonths: number;
  expectedReplacementDate: string;
  lifecycleStatus: 'Early life' | 'Stable' | 'Aging' | 'Replace soon' | 'Disposed';
  lifecyclePercent: number;
  health: HealthStatus;
  healthScore: number;
  repairHistory: RepairRecord[];
  totalRepairCost: number;
  lastMaintenanceDate?: string;
  recurringIssue?: string;
  replacementAlert: boolean;
  estimatedDepreciatedValue: number;
}

const TODAY = new Date('2026-05-15');

const CATEGORY_LIFESPAN_MONTHS: Record<string, number> = {
  'Điện lạnh': 72,
  'Thiết bị vệ sinh': 60,
  'Nội thất': 84,
  'An ninh': 48,
};

const ASSET_REPAIR_HISTORY: Record<string, RepairRecord[]> = {
  eq1: [
    { id: 'rr-1', date: '2025-09-12', issue: 'Vệ sinh dàn lạnh định kỳ', cost: 250000, status: 'completed', manager: 'Nguyễn Văn Quản' },
    { id: 'rr-2', date: '2026-03-18', issue: 'Bổ sung gas làm lạnh', cost: 420000, status: 'completed', manager: 'Nguyễn Văn Quản' },
  ],
  eq2: [
    { id: 'rr-3', date: '2025-11-05', issue: 'Cân chỉnh chân máy', cost: 180000, status: 'completed', manager: 'Nguyễn Văn Quản' },
  ],
  eq3: [
    { id: 'rr-4', date: '2025-08-21', issue: 'Báo lỗi E4', cost: 500000, status: 'completed', manager: 'Nguyễn Văn Quản' },
    { id: 'rr-5', date: '2026-02-09', issue: 'Báo lỗi E4 tái diễn', cost: 650000, status: 'completed', manager: 'Nguyễn Văn Quản' },
    { id: 'rr-6', date: '2026-04-28', issue: 'Báo lỗi E4, không làm lạnh', cost: 500000, status: 'in_progress', manager: 'Nguyễn Văn Quản' },
  ],
  eq4: [
    { id: 'rr-7', date: '2025-10-14', issue: 'Thay ron cửa tủ lạnh', cost: 260000, status: 'completed', manager: 'Nguyễn Văn Quản' },
    { id: 'rr-8', date: '2026-01-22', issue: 'Không làm lạnh ổn định', cost: 700000, status: 'completed', manager: 'Nguyễn Văn Quản' },
    { id: 'rr-9', date: '2026-05-13', issue: 'Tủ lạnh ngừng hoạt động', cost: 1500000, status: 'open', manager: 'Nguyễn Văn Quản' },
  ],
  eq5: [
    { id: 'rr-10', date: '2026-02-17', issue: 'Bảo dưỡng máy giặt khu chung', cost: 300000, status: 'completed', manager: 'Nguyễn Văn Quản' },
  ],
  eq6: [
    { id: 'rr-11', date: '2026-05-05', issue: 'Máy giặt rung lắc mạnh khi vắt', cost: 400000, status: 'in_progress', manager: 'Trần Thị Quản' },
  ],
};

const REPAIR_COST_BY_MONTH = [
  { month: 'Th12', cost: 320000 },
  { month: 'Th1', cost: 700000 },
  { month: 'Th2', cost: 950000 },
  { month: 'Th3', cost: 420000 },
  { month: 'Th4', cost: 500000 },
  { month: 'Th5', cost: 1900000 },
];

const DEPRECIATION_TREND = [
  { month: 'Th12', value: 39400000 },
  { month: 'Th1', value: 38600000 },
  { month: 'Th2', value: 37800000 },
  { month: 'Th3', value: 36900000 },
  { month: 'Th4', value: 36100000 },
  { month: 'Th5', value: 35300000 },
];

const healthConfig: Record<HealthStatus, { label: string; color: string; dot: string; bar: string }> = {
  excellent: { label: 'Xuất sắc', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  good: { label: 'Tốt', color: 'bg-lime-100 text-lime-700 border-lime-200', dot: 'bg-lime-500', bar: 'bg-lime-500' },
  warning: { label: 'Cảnh báo', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500' },
  critical: { label: 'Nghiêm trọng', color: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-500' },
};

const lifecycleStatusLabel: Record<AssetProfile['lifecycleStatus'], string> = {
  'Early life': 'Giai đoạn đầu',
  Stable: 'Ổn định',
  Aging: 'Đang lão hóa',
  'Replace soon': 'Sắp thay thế',
  Disposed: 'Đã thanh lý',
};

const repairStatusLabel: Record<RepairRecord['status'], string> = {
  completed: 'Đã hoàn thành',
  in_progress: 'Đang xử lý',
  open: 'Đang mở',
};

type PreparationStatus = 'renovation' | 'configuring' | 'ready' | 'inspection' | 'operational';

interface RoomEquipmentItem {
  name: string;
  quantity: number;
  area: 'Riêng' | 'Chung';
  installed: boolean;
}

interface RoomSetupProfile {
  id: string;
  propertyId: string;
  propertyName: string;
  roomId: string;
  roomCode: string;
  floor: number;
  template: string;
  status: PreparationStatus;
  readiness: number;
  setupCost: number;
  expectedRentRange: string;
  inspectionDate: string;
  equipment: RoomEquipmentItem[];
}

interface RoomTemplate {
  name: string;
  description: string;
  equipment: string[];
  estimatedCost: number;
  expectedRentRange: string;
}

interface ProcurementItem {
  id: string;
  assetName: string;
  vendor: string;
  propertyName: string;
  roomCode?: string;
  status: 'ordered' | 'pending_installation' | 'installed' | 'warranty_active';
  cost: number;
  warrantyUntil: string;
}

interface SectionPanelProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  collapsed?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

const SectionPanel = ({ title, subtitle, icon: Icon, collapsed, onToggle, actions, children }: SectionPanelProps) => (
  <section className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 text-left min-w-0 flex-1"
      >
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        {onToggle && (
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`} />
        )}
      </button>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
    {!collapsed && <div className="p-5">{children}</div>}
  </section>
);

const preparationStatusConfig: Record<PreparationStatus, { label: string; color: string; dot: string }> = {
  renovation: { label: 'Đang cải tạo', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  configuring: { label: 'Đang cấu hình thiết bị', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  ready: { label: 'Sẵn sàng cho thuê', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  inspection: { label: 'Đang kiểm tra', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  operational: { label: 'Đang vận hành', color: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500' },
};

const procurementStatusLabel: Record<ProcurementItem['status'], string> = {
  ordered: 'Đã mua',
  pending_installation: 'Chờ lắp đặt',
  installed: 'Đã lắp đặt',
  warranty_active: 'Còn bảo hành',
};

const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    name: 'Phòng tiêu chuẩn',
    description: 'Gói thiết bị cơ bản cho phòng thuê phổ thông.',
    equipment: ['Máy lạnh', 'Giường', 'Tủ quần áo', 'Bình nước nóng'],
    estimatedCost: 16500000,
    expectedRentRange: '3.2M - 3.8M/tháng',
  },
  {
    name: 'Phòng cao cấp',
    description: 'Tăng tiện nghi và giá thuê mục tiêu cho khách dài hạn.',
    equipment: ['Máy lạnh inverter', 'Tủ lạnh', 'Giường nệm', 'Bàn làm việc', 'Tủ quần áo'],
    estimatedCost: 28500000,
    expectedRentRange: '4.5M - 5.5M/tháng',
  },
  {
    name: 'Phòng dùng chung',
    description: 'Tối ưu chi phí cho phòng có tài sản chung theo tầng.',
    equipment: ['Giường', 'Tủ quần áo', 'Quạt', 'Máy giặt chung'],
    estimatedCost: 9800000,
    expectedRentRange: '2.8M - 3.4M/tháng',
  },
  {
    name: 'Studio',
    description: 'Cấu hình gần như khép kín cho phân khúc thuê cao hơn.',
    equipment: ['Máy lạnh', 'Tủ lạnh', 'Bếp mini', 'Máy giặt', 'Bàn ăn', 'Giường nệm'],
    estimatedCost: 36000000,
    expectedRentRange: '5.8M - 7.2M/tháng',
  },
];

const ROOM_SETUP_PROFILES: RoomSetupProfile[] = [
  {
    id: 'setup-p101',
    propertyId: 'prop-1',
    propertyName: 'Nhà Nguyễn Trãi',
    roomId: 'r1',
    roomCode: 'P101',
    floor: 1,
    template: 'Phòng cao cấp',
    status: 'operational',
    readiness: 100,
    setupCost: 30200000,
    expectedRentRange: '4.5M - 5.2M/tháng',
    inspectionDate: '2026-05-01',
    equipment: [
      { name: 'Máy lạnh Daikin', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Tủ lạnh Aqua', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Giường 1m6 + nệm', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Tủ quần áo', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Máy giặt chung tầng 1', quantity: 1, area: 'Chung', installed: true },
    ],
  },
  {
    id: 'setup-p102',
    propertyId: 'prop-1',
    propertyName: 'Nhà Nguyễn Trãi',
    roomId: 'r2',
    roomCode: 'P102',
    floor: 1,
    template: 'Phòng tiêu chuẩn',
    status: 'inspection',
    readiness: 86,
    setupCost: 18800000,
    expectedRentRange: '3.4M - 3.9M/tháng',
    inspectionDate: '2026-05-18',
    equipment: [
      { name: 'Máy lạnh Panasonic', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Giường 1m4', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Tủ quần áo', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Bình nước nóng', quantity: 1, area: 'Riêng', installed: false },
    ],
  },
  {
    id: 'setup-p301',
    propertyId: 'prop-2',
    propertyName: 'Nhà Lê Văn Sỹ',
    roomId: 'r13',
    roomCode: 'P301',
    floor: 3,
    template: 'Studio',
    status: 'configuring',
    readiness: 64,
    setupCost: 24400000,
    expectedRentRange: '5.8M - 6.8M/tháng',
    inspectionDate: '2026-05-24',
    equipment: [
      { name: 'Máy lạnh Casper', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Bếp mini', quantity: 1, area: 'Riêng', installed: false },
      { name: 'Tủ lạnh', quantity: 1, area: 'Riêng', installed: false },
      { name: 'Giường nệm', quantity: 1, area: 'Riêng', installed: true },
    ],
  },
  {
    id: 'setup-p201',
    propertyId: 'prop-3',
    propertyName: 'Nhà Cách Mạng Tháng 8',
    roomId: 'r17',
    roomCode: 'P201',
    floor: 2,
    template: 'Phòng dùng chung',
    status: 'renovation',
    readiness: 42,
    setupCost: 7600000,
    expectedRentRange: '2.9M - 3.4M/tháng',
    inspectionDate: '2026-06-02',
    equipment: [
      { name: 'Giường 1m4', quantity: 1, area: 'Riêng', installed: true },
      { name: 'Tủ quần áo', quantity: 1, area: 'Riêng', installed: false },
      { name: 'Quạt treo tường', quantity: 1, area: 'Riêng', installed: false },
      { name: 'Máy giặt chung', quantity: 1, area: 'Chung', installed: true },
    ],
  },
];

const PROCUREMENT_TRACKING: ProcurementItem[] = [
  { id: 'proc-1', assetName: 'Bình nước nóng Ariston 30L', vendor: 'Điện Máy Xanh Pro', propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P102', status: 'pending_installation', cost: 2800000, warrantyUntil: '2028-05-12' },
  { id: 'proc-2', assetName: 'Bếp mini Sunhouse', vendor: 'Sunhouse Partner', propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P301', status: 'ordered', cost: 1900000, warrantyUntil: '2027-05-10' },
  { id: 'proc-3', assetName: 'Tủ lạnh Aqua 130L', vendor: 'Nguyễn Kim B2B', propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P301', status: 'pending_installation', cost: 3600000, warrantyUntil: '2028-05-15' },
  { id: 'proc-4', assetName: 'Máy lạnh Daikin 9000BTU', vendor: 'Daikin Authorized', propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P101', status: 'warranty_active', cost: 8500000, warrantyUntil: '2027-01-10' },
  { id: 'proc-5', assetName: 'Tủ quần áo 2 cánh', vendor: 'Nội thất An Phát', propertyName: 'Nhà Cách Mạng Tháng 8', roomCode: 'P201', status: 'installed', cost: 2100000, warrantyUntil: '2027-06-02' },
];

const QR_WORKFLOW_ACTIVITY: Record<string, {
  scanCount: number;
  latestScanAt?: string;
  requestCount: number;
  activeRepairStatus: AssetProfile['activeRepairStatus'];
  warrantyExpiredDate: string;
}> = {
  eq1: { scanCount: 8, latestScanAt: '2026-05-02 09:20', requestCount: 2, activeRepairStatus: 'resolved', warrantyExpiredDate: '2027-01-10' },
  eq2: { scanCount: 3, latestScanAt: '2026-04-12 18:05', requestCount: 1, activeRepairStatus: 'resolved', warrantyExpiredDate: '2027-01-10' },
  eq3: { scanCount: 14, latestScanAt: '2026-05-14 20:15', requestCount: 3, activeRepairStatus: 'in_progress', warrantyExpiredDate: '2027-01-10' },
  eq4: { scanCount: 11, latestScanAt: '2026-05-13 08:45', requestCount: 3, activeRepairStatus: 'reported', warrantyExpiredDate: '2026-12-30' },
  eq5: { scanCount: 5, latestScanAt: '2026-05-01 07:40', requestCount: 1, activeRepairStatus: 'none', warrantyExpiredDate: '2027-01-10' },
  eq6: { scanCount: 6, latestScanAt: '2026-05-05 21:30', requestCount: 1, activeRepairStatus: 'in_progress', warrantyExpiredDate: '2027-10-15' },
};

const activeRepairStatusLabel: Record<AssetProfile['activeRepairStatus'], string> = {
  none: 'Không có',
  reported: 'Đã báo hỏng',
  in_progress: 'Đang sửa chữa',
  resolved: 'Đã xử lý',
};

const getQrImageUrl = (payload: string, size = 180) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;

const monthsBetween = (from: string, to = TODAY) => {
  const d = new Date(from);
  return Math.max(0, (to.getFullYear() - d.getFullYear()) * 12 + to.getMonth() - d.getMonth());
};

const addMonths = (dateStr: string, months: number) => {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

const fmtM = (value: number) => `${(value / 1_000_000).toFixed(1)}M`;

const getAssetProfiles = (equipments: Equipment[]): AssetProfile[] => equipments.map(eq => {
  const history = ASSET_REPAIR_HISTORY[eq.id] ?? [];
  const qrActivity = QR_WORKFLOW_ACTIVITY[eq.id] ?? {
    scanCount: 0,
    requestCount: 0,
    activeRepairStatus: 'none' as const,
    warrantyExpiredDate: addMonths(eq.purchaseDate, 24),
  };
  const age = monthsBetween(eq.purchaseDate);
  const lifespan = CATEGORY_LIFESPAN_MONTHS[eq.category] ?? 60;
  const lifecyclePercent = Math.min(100, Math.round((age / lifespan) * 100));
  const totalRepairCost = history.reduce((sum, item) => sum + item.cost, 0);
  const activeRepairs = history.filter(item => item.status === 'open' || item.status === 'in_progress').length;
  const costRatio = eq.purchasePrice > 0 ? totalRepairCost / eq.purchasePrice : 0;

  let health: HealthStatus = 'excellent';
  if (eq.status === 'broken' || activeRepairs > 0 && costRatio > 0.2) health = 'critical';
  else if (eq.status === 'maintenance' || history.length >= 3 || costRatio > 0.15 || lifecyclePercent >= 80) health = 'warning';
  else if (history.length > 0 || lifecyclePercent >= 45) health = 'good';

  const healthScore = health === 'excellent' ? 96 : health === 'good' ? 82 : health === 'warning' ? 61 : 34;
  const lifecycleStatus: AssetProfile['lifecycleStatus'] =
    eq.status === 'disposed' ? 'Disposed' :
    lifecyclePercent >= 90 ? 'Replace soon' :
    lifecyclePercent >= 65 ? 'Aging' :
    lifecyclePercent >= 25 ? 'Stable' : 'Early life';

  const lastRecord = [...history].sort((a, b) => b.date.localeCompare(a.date))[0];
  const repeatedE4 = history.filter(item => item.issue.toLowerCase().includes('e4')).length >= 2;

  return {
    ...eq,
    assetQrCode: `SLMS-ASSET-${eq.code}`,
    serialNumber: `SN-${eq.code.replaceAll('-', '')}-${eq.id.toUpperCase()}`,
    qrScanUrl: `slms://tenant/maintenance-report?assetId=${eq.id}&qr=${eq.code}`,
    qrScanCount: qrActivity.scanCount,
    latestScanAt: qrActivity.latestScanAt,
    qrMaintenanceRequests: qrActivity.requestCount,
    activeRepairStatus: qrActivity.activeRepairStatus,
    warrantyExpiredDate: qrActivity.warrantyExpiredDate,
    installationLocation: `${eq.propertyName}${eq.roomCode ? ` / Phòng ${eq.roomCode}` : ' / Khu vực chung'}`,
    operationalAgeMonths: age,
    expectedReplacementDate: addMonths(eq.purchaseDate, lifespan),
    lifecycleStatus,
    lifecyclePercent,
    health,
    healthScore,
    repairHistory: history,
    totalRepairCost,
    lastMaintenanceDate: lastRecord?.date,
    recurringIssue: repeatedE4 ? 'Lỗi làm lạnh E4 tái diễn' : history.length >= 3 ? 'Tần suất sửa chữa cao' : undefined,
    replacementAlert: lifecyclePercent >= 80 || costRatio > 0.22 || eq.status === 'broken',
    estimatedDepreciatedValue: Math.max(0, Math.round(eq.purchasePrice * (1 - Math.min(0.9, age / lifespan)))),
  };
});

interface AssetSetupModalProps {
  onClose: () => void;
}

const AssetSetupModal = ({ onClose }: AssetSetupModalProps) => {
  const [step, setStep] = useState(1);
  const currentProperty = MOCK_PROPERTIES[0];
  const stepLabels = ['Thông tin tài sản', 'Tài chính', 'Gán vào phòng', 'Thiết lập vận hành'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-50 text-primary-700 border border-primary-100 rounded-full text-xs font-bold mb-2">
              <Settings2 className="w-3.5 h-3.5" />
              Quy trình Host
            </div>
            <h2 className="text-lg font-bold text-slate-900">Thiết lập tài sản mới</h2>
            <p className="text-sm text-slate-500 mt-1">
              Onboarding tài sản theo 4 bước: thông tin, tài chính, gán phòng và cấu hình vận hành ban đầu.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <div className="grid grid-cols-4 gap-2">
            {stepLabels.map((label, index) => {
              const stepNo = index + 1;
              const active = step === stepNo;
              const done = step > stepNo;
              return (
                <button
                  key={label}
                  onClick={() => setStep(stepNo)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active ? 'border-primary-300 bg-primary-50' : done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <p className={`text-[10px] font-bold uppercase ${active ? 'text-primary-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                    Bước {stepNo}
                  </p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{label}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    'Tên tài sản',
                    'Danh mục',
                    'Thương hiệu',
                    'Model',
                    'Số serial',
                    'Mã định danh QR',
                    'Vị trí lắp đặt',
                  ].map(label => (
                    <label key={label} className="block">
                      <span className="text-xs font-bold text-slate-600">{label}</span>
                      <input className="input-field mt-1.5 text-sm" placeholder={`Nhập ${label.toLowerCase()}`} />
                    </label>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">QR tự sinh</p>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 inline-block">
                    <img
                      src={getQrImageUrl('slms://tenant/maintenance-report?assetId=preview&qr=SLMS-ASSET-PREVIEW', 150)}
                      alt="QR preview"
                      className="w-[150px] h-[150px]"
                    />
                  </div>
                  <p className="font-mono text-[11px] text-slate-600 mt-3">SLMS-ASSET-AUTO</p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">Tải QR</button>
                    <button className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600">In tem</button>
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Mô tả</span>
                <textarea className="input-field mt-1.5 text-sm min-h-[84px]" placeholder="Mô tả công năng, tình trạng mua mới, thông tin bàn giao..." />
              </label>
              <div className="border border-dashed border-slate-300 bg-slate-50 rounded-xl p-5">
                <p className="text-sm font-bold text-slate-800">Ảnh tài sản</p>
                <p className="text-xs text-slate-500 mt-1">Lưu ảnh hóa đơn, ảnh thiết bị, tem bảo hành hoặc vị trí lắp đặt để phục vụ nghiệm thu.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Chi phí mua', placeholder: 'VD: 8.500.000' },
                { label: 'Ngày mua', placeholder: '2026-05-15' },
                { label: 'Hết hạn bảo hành', placeholder: '2028-05-15' },
                { label: 'Vòng đời kỳ vọng', placeholder: 'VD: 72 tháng' },
                { label: 'Nhà cung cấp', placeholder: 'Tên vendor/supplier' },
                { label: 'Phương pháp khấu hao', placeholder: 'Đường thẳng / theo vòng đời' },
              ].map(field => (
                <label key={field.label} className="block">
                  <span className="text-xs font-bold text-slate-600">{field.label}</span>
                  <input className="input-field mt-1.5 text-sm" placeholder={field.placeholder} />
                </label>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Bất động sản</span>
                <select className="input-field mt-1.5 text-sm">
                  {MOCK_PROPERTIES.map(property => <option key={property.id}>{property.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Tầng</span>
                <input className="input-field mt-1.5 text-sm" defaultValue="1" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Phòng</span>
                <select className="input-field mt-1.5 text-sm">
                  {currentProperty.rooms.map(room => <option key={room.id}>{room.code}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Khu vực</span>
                <select className="input-field mt-1.5 text-sm">
                  <option>Khu vực riêng trong phòng</option>
                  <option>Khu vực dùng chung</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Số lượng</span>
                <input className="input-field mt-1.5 text-sm" defaultValue="1" />
              </label>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 uppercase">Gợi ý cấu hình</p>
                <p className="text-sm text-blue-800 mt-1">Có thể áp dụng nhanh theo mẫu phòng tiêu chuẩn hoặc sao chép cấu hình từ phòng tương tự.</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                'Tình trạng ban đầu',
                'Chu kỳ bảo trì',
                'Lịch kiểm tra',
                'Ngưỡng thay thế',
              ].map(label => (
                <label key={label} className="block">
                  <span className="text-xs font-bold text-slate-600">{label}</span>
                  <input className="input-field mt-1.5 text-sm" placeholder={`Nhập ${label.toLowerCase()}`} />
                </label>
              ))}
              <label className="block md:col-span-2">
                <span className="text-xs font-bold text-slate-600">Ghi chú vận hành</span>
                <textarea className="input-field mt-1.5 text-sm min-h-[88px]" placeholder="Lưu ý lắp đặt, lịch kiểm tra, điểm cần theo dõi sau khi phòng vận hành..." />
              </label>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep(prev => Math.max(1, prev - 1))}
            disabled={step === 1}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
          >
            Quay lại
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Lưu nháp
            </button>
            <button
              onClick={() => step < 4 ? setStep(prev => prev + 1) : onClose()}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {step < 4 ? 'Tiếp tục' : 'Hoàn tất thiết lập'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface QrPreviewModalProps {
  asset: AssetProfile;
  onClose: () => void;
}

const QrPreviewModal = ({ asset, onClose }: QrPreviewModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl mx-4 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mb-2">
            <QrCode className="w-3.5 h-3.5" />
            QR bảo trì thiết bị
          </div>
          <h2 className="text-lg font-bold text-slate-900">{asset.name}</h2>
          <p className="text-sm text-slate-500 mt-1">{asset.installationLocation}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
          <div className="bg-white border border-slate-200 rounded-lg p-3 inline-block">
            <img
              src={getQrImageUrl(asset.qrScanUrl, 190)}
              alt={`QR ${asset.assetQrCode}`}
              className="w-[190px] h-[190px]"
            />
          </div>
          <p className="font-mono text-xs text-slate-600 mt-3">{asset.assetQrCode}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" />
              Tải QR
            </button>
            <button className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
              <Printer className="w-3.5 h-3.5" />
              In tem
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Asset ID', value: asset.id },
              { label: 'Mã QR', value: asset.assetQrCode },
              { label: 'Serial', value: asset.serialNumber },
              { label: 'Bảo trì gần nhất', value: asset.lastMaintenanceDate ?? 'Chưa có' },
              { label: 'Lượt scan', value: String(asset.qrScanCount) },
              { label: 'Báo hỏng từ QR', value: String(asset.qrMaintenanceRequests) },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</p>
                <p className="text-xs font-bold text-slate-900 mt-1 break-words">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-bold text-blue-700 uppercase">Luồng xử lý khi tenant quét QR</p>
            <p className="text-sm text-blue-800 mt-1 leading-relaxed">
              Tenant App tự điền thiết bị, phòng và vị trí; hệ thống tạo phiếu bảo trì và tự gán cho Quản lý vận hành phụ trách bất động sản.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase">URL scan</p>
            <p className="font-mono text-xs text-slate-700 mt-2 break-all">{asset.qrScanUrl}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

interface DetailModalProps {
  asset: AssetProfile;
  initialTab?: DetailTab;
  onClose: () => void;
}

const DetailModal = ({ asset, initialTab = 'overview', onClose }: DetailModalProps) => {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const health = healthConfig[asset.health];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">{asset.code}</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${health.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                {health.label}
              </span>
              {asset.replacementAlert && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Theo dõi thay thế
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900">{asset.name}</h2>
            <p className="text-sm text-slate-500 mt-1">{asset.propertyName}{asset.roomCode ? ` · Phòng ${asset.roomCode}` : ' · Khu vực chung'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-2 border-b border-slate-100">
            {[
              { id: 'overview', label: 'Xem chi tiết', icon: Eye },
              { id: 'qr', label: 'Thông tin QR', icon: QrCode },
              { id: 'history', label: 'Lịch sử bảo trì', icon: History },
              { id: 'lifecycle', label: 'Vòng đời tài sản', icon: Target },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as DetailTab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
                  tab === item.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Chi phí đầu tư', value: formatCurrency(asset.purchasePrice) },
                  { label: 'Chi phí sửa chữa', value: formatCurrency(asset.totalRepairCost) },
                  { label: 'Điểm sức khỏe', value: `${asset.healthScore}/100` },
                  { label: 'Giá trị còn lại', value: formatCurrency(asset.estimatedDepreciatedValue) },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Vị trí tài sản</p>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2 text-slate-700"><Building2 className="w-4 h-4 text-primary-500" />{asset.propertyName}</p>
                    <p className="flex items-center gap-2 text-slate-700"><MapPin className="w-4 h-4 text-primary-500" />{asset.roomCode ? `Phòng ${asset.roomCode}` : 'Khu vực chung'}</p>
                    <p className="flex items-center gap-2 text-slate-700"><Package className="w-4 h-4 text-primary-500" />{asset.category}</p>
                  </div>
                </div>
                <div className="border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Ghi chú giám sát của Host</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Màn hình này dùng để theo dõi sức khỏe tài sản, mức đầu tư và rủi ro vòng đời. Việc xử lý sửa chữa vận hành vẫn thuộc trách nhiệm của Quản lý vận hành.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'qr' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-5">
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 text-center">
                  <div className="bg-white border border-slate-200 rounded-lg p-3 inline-block">
                    <img src={getQrImageUrl(asset.qrScanUrl, 150)} alt={`QR ${asset.assetQrCode}`} className="w-[150px] h-[150px]" />
                  </div>
                  <p className="font-mono text-[11px] text-slate-600 mt-3">{asset.assetQrCode}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Asset ID', value: asset.id },
                    { label: 'Serial', value: asset.serialNumber },
                    { label: 'Vị trí lắp đặt', value: asset.installationLocation },
                    { label: 'Hết hạn bảo hành', value: asset.warrantyExpiredDate },
                    { label: 'Lượt scan QR', value: String(asset.qrScanCount) },
                    { label: 'Scan gần nhất', value: asset.latestScanAt ?? 'Chưa có' },
                    { label: 'Phiếu từ QR', value: String(asset.qrMaintenanceRequests) },
                    { label: 'Trạng thái sửa chữa', value: activeRepairStatusLabel[asset.activeRepairStatus] },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</p>
                      <p className="text-xs font-bold text-slate-900 mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold text-blue-700 uppercase">Kết nối luồng bảo trì</p>
                <p className="text-sm text-blue-800 mt-1 leading-relaxed">
                  Khi tenant quét QR, biểu mẫu báo hỏng tự điền tài sản, phòng và bất động sản; hệ thống tạo ticket và định tuyến đến Quản lý vận hành phụ trách.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 p-4">
                <p className="text-xs font-bold text-slate-500 uppercase">Scan URL</p>
                <p className="font-mono text-xs text-slate-700 mt-2 break-all">{asset.qrScanUrl}</p>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase">Tần suất sửa chữa</p>
                  <p className="text-xl font-bold text-blue-800 mt-1">{asset.repairHistory.length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-600 uppercase">Chi phí bảo trì</p>
                  <p className="text-xl font-bold text-amber-800 mt-1">{fmtM(asset.totalRepairCost)}₫</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-rose-600 uppercase">Vấn đề lặp lại</p>
                  <p className="text-sm font-bold text-rose-800 mt-1">{asset.recurringIssue ?? 'Không có'}</p>
                </div>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                {asset.repairHistory.length > 0 ? asset.repairHistory.map(record => (
                  <div key={record.id} className="p-4 border-b last:border-b-0 border-slate-100 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{record.issue}</p>
                      <p className="text-xs text-slate-500 mt-1">{record.date} · Quản lý: {record.manager}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(record.cost)}</p>
                      <p className={`text-[10px] font-bold mt-1 ${
                        record.status === 'completed' ? 'text-emerald-600' : record.status === 'in_progress' ? 'text-blue-600' : 'text-rose-600'
                      }`}>
                        {repairStatusLabel[record.status]}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-sm text-slate-500">Chưa có lịch sử sửa chữa cho tài sản này.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'lifecycle' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Ngày mua', value: asset.purchaseDate },
                  { label: 'Tuổi vận hành', value: `${asset.operationalAgeMonths} tháng` },
                  { label: 'Dự báo thay thế', value: asset.expectedReplacementDate },
                  { label: 'Trạng thái vòng đời', value: lifecycleStatusLabel[asset.lifecycleStatus] },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="border border-slate-100 rounded-xl p-5">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-slate-600">Vòng đời đã sử dụng</span>
                  <span className="font-bold text-slate-900">{asset.lifecyclePercent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${asset.lifecyclePercent >= 85 ? 'bg-rose-500' : asset.lifecyclePercent >= 65 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                    style={{ width: `${asset.lifecyclePercent}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Kế hoạch thay thế được kích hoạt dựa trên tuổi tài sản, chi phí sửa chữa tích lũy, lỗi lặp lại và hư hỏng chưa được xử lý.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const EquipmentList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterHealth, setFilterHealth] = useState<string>('all');
  const [filterLifecycle, setFilterLifecycle] = useState<string>('all');
  const [selectedAsset, setSelectedAsset] = useState<{ asset: AssetProfile; tab: DetailTab } | null>(null);
  const [qrPreviewAsset, setQrPreviewAsset] = useState<AssetProfile | null>(null);
  const [showAssetSetup, setShowAssetSetup] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    secondaryMetrics: true,
    workflow: false,
    templates: true,
    procurement: true,
    analytics: true,
    lifecycleInsights: false,
  });

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const assets = useMemo(() => getAssetProfiles(MOCK_EQUIPMENTS), []);
  const roomSetups = ROOM_SETUP_PROFILES;
  const activeAssets = assets.filter(asset => asset.status !== 'disposed');
  const totalAssetValue = activeAssets.reduce((sum, asset) => sum + asset.purchasePrice, 0);
  const roomSetupInvestment = roomSetups.reduce((sum, room) => sum + room.setupCost, 0);
  const averageReadiness = Math.round(roomSetups.reduce((sum, room) => sum + room.readiness, 0) / Math.max(1, roomSetups.length));
  const assetsUnderMaintenance = assets.filter(asset => asset.status === 'maintenance').length;
  const damagedAssets = assets.filter(asset => asset.status === 'broken').length;
  const pendingInstallationCount = PROCUREMENT_TRACKING.filter(item => item.status === 'pending_installation' || item.status === 'ordered').length;
  const procurementValue = PROCUREMENT_TRACKING.reduce((sum, item) => sum + item.cost, 0);
  const estimatedRepairCosts = MOCK_MAINTENANCE_REQUESTS
    .filter(request => request.status === 'open' || request.status === 'in_progress')
    .reduce((sum, request) => sum + (request.estimatedCost ?? 0), 0);
  const assetHealthScore = Math.round(activeAssets.reduce((sum, asset) => sum + asset.healthScore, 0) / Math.max(1, activeAssets.length));
  const replacementAlerts = assets.filter(asset => asset.replacementAlert).length;
  const totalQrScans = assets.reduce((sum, asset) => sum + asset.qrScanCount, 0);
  const qrGeneratedRequests = assets.reduce((sum, asset) => sum + asset.qrMaintenanceRequests, 0);
  const activeQrRepairCount = assets.filter(asset => asset.activeRepairStatus === 'reported' || asset.activeRepairStatus === 'in_progress').length;

  const filteredAssets = assets.filter(asset => {
    const query = searchTerm.toLowerCase();
    const matchSearch =
      asset.name.toLowerCase().includes(query) ||
      asset.code.toLowerCase().includes(query) ||
      asset.category.toLowerCase().includes(query) ||
      asset.propertyName.toLowerCase().includes(query);
    const matchProperty = filterProperty === 'all' || asset.propertyId === filterProperty;
    const matchHealth = filterHealth === 'all' || asset.health === filterHealth;
    const matchLifecycle = filterLifecycle === 'all' || asset.lifecycleStatus === filterLifecycle;
    return matchSearch && matchProperty && matchHealth && matchLifecycle;
  });

  const investmentByProperty = MOCK_PROPERTIES.map(property => ({
    name: property.name.replace('Nhà ', ''),
    value: assets.filter(asset => asset.propertyId === property.id).reduce((sum, asset) => sum + asset.purchasePrice, 0),
  }));

  const setupCostByRoom = roomSetups.map(room => ({
    room: `${room.propertyName.replace('Nhà ', '')} ${room.roomCode}`,
    cost: room.setupCost,
    readiness: room.readiness,
  }));

  const setupCostByProperty = MOCK_PROPERTIES.map(property => ({
    name: property.name.replace('Nhà ', ''),
    cost: roomSetups.filter(room => room.propertyId === property.id).reduce((sum, room) => sum + room.setupCost, 0),
  }));

  const highestCostAssets = [...assets]
    .sort((a, b) => b.totalRepairCost - a.totalRepairCost)
    .slice(0, 4);

  const categoryMix = ['Điện lạnh', 'Nội thất', 'An ninh', 'Thiết bị vệ sinh'].map((category, index) => ({
    name: category,
    value: assets.filter(asset => asset.category === category).length,
    color: ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981'][index],
  })).filter(item => item.value > 0);

  const alerts = [
    ...assets.filter(asset => asset.replacementAlert).map(asset => ({
      id: `replace-${asset.id}`,
      title: 'Cần lập kế hoạch thay thế',
      message: `${asset.name} tại ${asset.propertyName}${asset.roomCode ? ` / ${asset.roomCode}` : ''} đang có rủi ro cao về vòng đời hoặc chi phí.`,
      tone: {
        box: 'bg-amber-50 border-amber-100',
        icon: 'text-amber-600',
        title: 'text-amber-700',
      },
    })),
    ...assets.filter(asset => asset.repairHistory.length >= 3).map(asset => ({
      id: `freq-${asset.id}`,
      title: 'Tần suất sửa chữa cao',
      message: `${asset.name} có ${asset.repairHistory.length} lần sửa chữa được ghi nhận, cần đánh giá hiệu quả thay thế so với tiếp tục sửa.`,
      tone: {
        box: 'bg-orange-50 border-orange-100',
        icon: 'text-orange-600',
        title: 'text-orange-700',
      },
    })),
    ...assets.filter(asset => asset.status === 'broken').map(asset => ({
      id: `damaged-${asset.id}`,
      title: 'Tài sản hư hỏng chưa xử lý',
      message: `${asset.name} đang hư hỏng. Host cần theo dõi tiến độ xử lý của quản lý và tác động tài chính.`,
      tone: {
        box: 'bg-rose-50 border-rose-100',
        icon: 'text-rose-600',
        title: 'text-rose-700',
      },
    })),
  ].slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-primary-600 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Danh mục tài sản</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">
            Giám sát tài sản doanh nghiệp, rủi ro vòng đời và hiệu quả đầu tư dành cho Host.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAssetSetup(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thiết lập tài sản mới
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
            <Settings2 className="w-4 h-4" />
            Cấu hình phòng
          </button>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-blue-800 leading-tight">Chế độ giám sát Host</p>
              <p className="text-[10px] text-blue-600 leading-tight">Xử lý sửa chữa vận hành thuộc về Quản lý vận hành</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Tổng giá trị tài sản', value: formatCurrency(totalAssetValue), icon: DollarSign, accent: 'text-slate-900', iconColor: 'text-emerald-600' },
          { label: 'Điểm sức khỏe tài sản', value: `${assetHealthScore}/100`, icon: Activity, accent: assetHealthScore >= 80 ? 'text-emerald-700' : 'text-orange-700', iconColor: assetHealthScore >= 80 ? 'text-emerald-600' : 'text-orange-600' },
          { label: 'Đang bảo trì', value: String(assetsUnderMaintenance), icon: Wrench, accent: assetsUnderMaintenance > 0 ? 'text-blue-700' : 'text-slate-900', iconColor: 'text-blue-600' },
          { label: 'Cảnh báo thay thế', value: String(replacementAlerts), icon: Target, accent: replacementAlerts > 0 ? 'text-orange-700' : 'text-slate-900', iconColor: replacementAlerts > 0 ? 'text-orange-600' : 'text-slate-500' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{card.label}</p>
                <p className={`text-2xl font-bold mt-2 truncate ${card.accent}`}>{card.value}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionPanel
        title="Chỉ số phụ"
        subtitle="Theo dõi đầu tư setup, mua sắm chờ lắp đặt, hư hỏng và chi phí sửa ước tính"
        icon={BarChart3}
        collapsed={collapsedSections.secondaryMetrics}
        onToggle={() => toggleSection('secondaryMetrics')}
      >
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Đầu tư cấu hình phòng', value: formatCurrency(roomSetupInvestment) },
            { label: 'Sẵn sàng trung bình', value: `${averageReadiness}%` },
            { label: 'Chờ lắp đặt', value: String(pendingInstallationCount) },
            { label: 'Lượt scan QR', value: String(totalQrScans) },
            { label: 'Phiếu từ QR', value: String(qrGeneratedRequests) },
            { label: 'Đang sửa từ QR', value: String(activeQrRepairCount) },
            { label: 'Tài sản hư hỏng', value: String(damagedAssets) },
            { label: 'Chi phí sửa ước tính', value: formatCurrency(estimatedRepairCosts) },
          ].map(item => (
            <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel
        title="Quy trình tiếp nhận & cấu hình phòng"
        subtitle="Từ nhận nhà, cải tạo, thiết lập tài sản đến sẵn sàng vận hành"
        icon={ClipboardCheck}
        collapsed={collapsedSections.workflow}
        onToggle={() => toggleSection('workflow')}
        actions={
          <span className="text-xs font-semibold text-slate-500">
            Mua sắm: <span className="text-slate-900 font-bold">{formatCurrency(procurementValue)}</span>
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { title: 'Nhận bất động sản', sub: 'Host nhận nhà từ chủ sở hữu', icon: Building2 },
            { title: 'Cải tạo phòng', sub: 'Kiểm tra mặt bằng, sửa chữa ban đầu', icon: Wrench },
            { title: 'Thiết lập tài sản', sub: 'Mua sắm, QR, bảo hành, khấu hao', icon: Package },
            { title: 'Cấu hình phòng thuê', sub: 'Gán thiết bị, mẫu phòng, checklist', icon: Settings2 },
            { title: 'Sẵn sàng vận hành', sub: 'Bàn giao cho Quản lý vận hành', icon: CheckCircle },
          ].map((step, index) => (
            <div key={step.title} className="relative border border-slate-100 rounded-xl p-4 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-primary-600">
                  <step.icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Bước {index + 1}</span>
              </div>
              <p className="text-sm font-bold text-slate-900">{step.title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.sub}</p>
            </div>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel
        title="Luồng QR báo bảo trì"
        subtitle="Cầu nối Tenant App → phiếu bảo trì → Quản lý vận hành → Host giám sát"
        icon={QrCode}
        collapsed={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {assets
            .filter(asset => asset.qrMaintenanceRequests > 0 || asset.activeRepairStatus !== 'none')
            .slice(0, 4)
            .map(asset => (
              <button
                key={asset.id}
                onClick={() => setQrPreviewAsset(asset)}
                className="text-left rounded-xl border border-slate-100 bg-slate-50/70 p-4 hover:border-primary-200 hover:bg-primary-50/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
                    <QrCode className="w-3 h-3" />
                    {asset.assetQrCode.replace('SLMS-ASSET-', '')}
                  </span>
                  <span className={`text-[10px] font-bold ${
                    asset.activeRepairStatus === 'in_progress' ? 'text-blue-600' :
                    asset.activeRepairStatus === 'reported' ? 'text-orange-600' :
                    asset.activeRepairStatus === 'resolved' ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {activeRepairStatusLabel[asset.activeRepairStatus]}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-900 mt-3 line-clamp-1">{asset.name}</p>
                <p className="text-xs text-slate-500 mt-1">{asset.installationLocation}</p>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
                  <span>{asset.qrScanCount} lượt scan</span>
                  <span>{asset.qrMaintenanceRequests} phiếu</span>
                </div>
              </button>
            ))}
        </div>
      </SectionPanel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Cấu hình phòng thuê</h2>
              <p className="text-xs text-slate-400 mt-0.5">Bản đồ thiết bị, checklist lắp đặt và mức sẵn sàng từng phòng</p>
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary-50 text-primary-700 border border-primary-100 text-xs font-bold rounded-lg hover:bg-primary-100 transition-colors">
              <Copy className="w-3.5 h-3.5" />
              Nhân bản cấu hình phòng
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {roomSetups.map(room => {
              const status = preparationStatusConfig[room.status];
              const installedCount = room.equipment.filter(item => item.installed).length;
              return (
                <div key={room.id} className="border border-slate-200/70 rounded-xl p-5 hover:border-primary-200 hover:shadow-sm transition-all bg-white">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">Phòng {room.roomCode}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{room.propertyName} · Tầng {room.floor}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>

                  <div className="my-4">
                    <div className="flex items-end justify-between gap-3 mb-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Mức sẵn sàng</p>
                        <p className="text-2xl font-bold text-slate-900 mt-0.5">{room.readiness}%</p>
                      </div>
                      <p className="text-xs font-semibold text-emerald-700">{room.expectedRentRange}</p>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full">
                      <div
                        className={`h-2 rounded-full ${room.readiness >= 90 ? 'bg-emerald-500' : room.readiness >= 70 ? 'bg-blue-500' : 'bg-orange-500'}`}
                        style={{ width: `${room.readiness}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                    <div>
                      <p className="text-slate-400 font-bold uppercase text-[10px]">Mẫu</p>
                      <p className="font-semibold text-slate-800 mt-1 truncate">{room.template}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold uppercase text-[10px]">Đã lắp</p>
                      <p className="font-semibold text-slate-800 mt-1">{installedCount}/{room.equipment.length}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-bold uppercase text-[10px]">Setup</p>
                      <p className="font-semibold text-slate-800 mt-1">{formatCurrency(room.setupCost)}</p>
                    </div>
                  </div>

                  {expandedRooms[room.id] && (
                    <div className="space-y-2 pt-3 mt-3 border-t border-slate-100">
                      {room.equipment.map(item => (
                        <div key={`${room.id}-${item.name}`} className="flex items-center justify-between gap-3 text-xs">
                          <span className="flex items-center gap-2 text-slate-600">
                            <span className={`w-2 h-2 rounded-full ${item.installed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {item.quantity} {item.name}
                          </span>
                          <span className={`font-bold ${item.area === 'Chung' ? 'text-blue-600' : 'text-slate-500'}`}>{item.area}</span>
                        </div>
                      ))}
                      <div className="text-xs text-slate-500 pt-2">Lịch kiểm tra: <span className="font-semibold text-slate-700">{room.inspectionDate}</span></div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500">{installedCount} tài sản đã lắp đặt</span>
                    <button
                      onClick={() => toggleRoom(room.id)}
                      className="text-xs font-bold text-primary-600 hover:text-primary-700"
                    >
                      {expandedRooms[room.id] ? 'Thu gọn' : 'Xem thiết bị'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Mẫu cấu hình phòng</h2>
              <p className="text-xs text-slate-400 mt-0.5">Áp dụng nhanh gói thiết bị theo phân khúc thuê</p>
            </div>
            <button
              onClick={() => toggleSection('templates')}
              className="text-xs font-bold text-slate-500 hover:text-primary-600"
            >
              {collapsedSections.templates ? 'Mở' : 'Thu gọn'}
            </button>
          </div>
          {!collapsedSections.templates && <div className="space-y-3">
            {ROOM_TEMPLATES.map(template => (
              <div key={template.name} className="border border-slate-100 rounded-xl p-4 hover:border-primary-200 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{template.name}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{template.description}</p>
                  </div>
                  <button className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 border border-primary-100 hover:bg-primary-100 transition-colors">
                    Áp dụng
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-3 line-clamp-2">{template.equipment.join(' · ')}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">Chi phí ước tính</p>
                    <p className="font-bold text-slate-900 mt-0.5">{formatCurrency(template.estimatedCost)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <p className="text-emerald-600 font-bold uppercase text-[10px]">Giá thuê kỳ vọng</p>
                    <p className="font-bold text-emerald-800 mt-0.5">{template.expectedRentRange}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>}
          {collapsedSections.templates && (
            <div className="grid grid-cols-2 gap-2">
              {ROOM_TEMPLATES.map(template => (
                <div key={template.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-800">{template.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{template.expectedRentRange}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Theo dõi mua sắm & lắp đặt</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tài sản đã mua, chờ lắp đặt, đã hoàn tất và trạng thái bảo hành</p>
            </div>
            <button
              onClick={() => toggleSection('procurement')}
              className="text-xs font-bold text-slate-500 hover:text-primary-600"
            >
              {collapsedSections.procurement ? 'Mở chi tiết' : 'Thu gọn'}
            </button>
          </div>
          {!collapsedSections.procurement && <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="py-3 pr-4">Tài sản</th>
                  <th className="py-3 pr-4">Vị trí</th>
                  <th className="py-3 pr-4">Nhà cung cấp</th>
                  <th className="py-3 pr-4">Trạng thái</th>
                  <th className="py-3 pr-4 text-right">Chi phí</th>
                  <th className="py-3">Bảo hành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PROCUREMENT_TRACKING.map(item => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 font-bold text-slate-900">{item.assetName}</td>
                    <td className="py-3 pr-4 text-xs text-slate-500">{item.propertyName}{item.roomCode ? ` · ${item.roomCode}` : ''}</td>
                    <td className="py-3 pr-4 text-xs text-slate-600">{item.vendor}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        item.status === 'warranty_active' ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'installed' ? 'bg-blue-100 text-blue-700' :
                        item.status === 'pending_installation' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {procurementStatusLabel[item.status]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-bold text-slate-900">{formatCurrency(item.cost)}</td>
                    <td className="py-3 text-xs text-slate-500">{item.warrantyUntil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Phân tích đầu tư setup</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={setupCostByRoom} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="room" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
              <RechartsTooltip formatter={(value: any, name: any) => [name === 'cost' ? formatCurrency(value) : `${value}%`, name === 'cost' ? 'Chi phí setup' : 'Sẵn sàng']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="cost" name="Chi phí setup" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {setupCostByProperty.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{item.name}</span>
                <span className="font-bold text-slate-900">{formatCurrency(item.cost)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <p className="text-xs font-bold text-emerald-700 uppercase">Ước tính ROI</p>
            <p className="text-sm text-emerald-800 mt-1">Các phòng đã cấu hình đạt trung bình 18-24 tháng hoàn vốn tài sản theo giá thuê mục tiêu.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Phân tích tài chính</h2>
              <p className="text-xs text-slate-400 mt-0.5">Đầu tư theo bất động sản và chi phí sửa chữa theo tháng</p>
            </div>
            <button
              onClick={() => toggleSection('analytics')}
              className="text-xs font-bold text-slate-500 hover:text-primary-600"
            >
              {collapsedSections.analytics ? 'Mở chi tiết' : 'Thu gọn'}
            </button>
          </div>
          {!collapsedSections.analytics && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={investmentByProperty} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" name="Đầu tư" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={REPAIR_COST_BY_MONTH} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="repairCostGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area dataKey="cost" name="Chi phí sửa chữa" stroke="#f59e0b" strokeWidth={2} fill="url(#repairCostGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Cơ cấu tài sản</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tỷ trọng theo danh mục thiết bị</p>
            </div>
            <Package className="w-4 h-4 text-primary-500" />
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={categoryMix} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2}>
                {categoryMix.map(item => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {categoryMix.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-bold text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Tài sản có chi phí bảo trì cao</h2>
          <div className="space-y-3">
            {highestCostAssets.map(asset => (
              <button
                key={asset.id}
                onClick={() => setSelectedAsset({ asset, tab: 'history' })}
                className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{asset.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{asset.propertyName}{asset.roomCode ? ` · ${asset.roomCode}` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-700">{formatCurrency(asset.totalRepairCost)}</p>
                  <p className="text-[10px] text-slate-400">{asset.repairHistory.length} ghi nhận</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Xu hướng khấu hao</h2>
          <ResponsiveContainer width="100%" height={165}>
            <AreaChart data={DEPRECIATION_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="depreciationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} />
              <RechartsTooltip formatter={(value: any) => formatCurrency(value)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area dataKey="value" name="Giá trị còn lại" stroke="#06b6d4" strokeWidth={2} fill="url(#depreciationGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Cảnh báo tài sản</h2>
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className="p-3 rounded-lg border border-slate-100 bg-white">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className={`w-3.5 h-3.5 ${alert.tone.icon} flex-shrink-0 mt-0.5`} />
                  <div>
                    <p className={`text-xs font-bold ${alert.tone.title}`}>{alert.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo thiết bị, mã QR, bất động sản, danh mục..."
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <select value={filterProperty} onChange={event => setFilterProperty(event.target.value)} className="input-field text-sm min-w-[160px]">
              <option value="all">Tất cả bất động sản</option>
              {MOCK_PROPERTIES.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select value={filterHealth} onChange={event => setFilterHealth(event.target.value)} className="input-field text-sm min-w-[150px]">
              <option value="all">Tất cả sức khỏe</option>
              <option value="excellent">Xuất sắc</option>
              <option value="good">Tốt</option>
              <option value="warning">Cảnh báo</option>
              <option value="critical">Nghiêm trọng</option>
            </select>
            <select value={filterLifecycle} onChange={event => setFilterLifecycle(event.target.value)} className="input-field text-sm min-w-[160px]">
              <option value="all">Tất cả vòng đời</option>
              <option value="Early life">Giai đoạn đầu</option>
              <option value="Stable">Ổn định</option>
              <option value="Aging">Đang lão hóa</option>
              <option value="Replace soon">Sắp thay thế</option>
              <option value="Disposed">Đã thanh lý</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 uppercase font-semibold border-b border-slate-200 text-[11px] tracking-wide">
              <tr>
                <th className="px-5 py-4">Tên thiết bị</th>
                <th className="px-5 py-4">Mã QR</th>
                <th className="px-5 py-4">Vị trí</th>
                <th className="px-5 py-4">Sức khỏe</th>
                <th className="px-5 py-4">Vòng đời</th>
                <th className="px-5 py-4 text-right">Chi phí sửa</th>
                <th className="px-5 py-4">Bảo trì</th>
                <th className="px-5 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.map(asset => {
                const health = healthConfig[asset.health];
                return (
                  <tr key={asset.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-5">
                      <p className="font-bold text-slate-900 max-w-[210px] line-clamp-2">{asset.name}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{asset.category} · Mua {asset.purchaseDate}</p>
                    </td>
                    <td className="px-5 py-5">
                      <button
                        onClick={() => setQrPreviewAsset(asset)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg hover:bg-primary-50 hover:text-primary-700 transition-colors"
                        title="Xem QR"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {asset.code}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-1">{asset.qrMaintenanceRequests} phiếu từ QR</p>
                    </td>
                    <td className="px-5 py-5">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-primary-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{asset.propertyName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{asset.roomCode ? `Phòng ${asset.roomCode}` : 'Khu vực chung'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5">
                      <div className="space-y-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${health.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                          {health.label}
                        </span>
                        <div className="w-20 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${health.bar}`} style={{ width: `${asset.healthScore}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5">
                      <p className={`text-xs font-bold ${
                        asset.lifecycleStatus === 'Replace soon' ? 'text-rose-600' :
                        asset.lifecycleStatus === 'Aging' ? 'text-orange-600' :
                        asset.lifecycleStatus === 'Disposed' ? 'text-slate-400' : 'text-emerald-600'
                      }`}>
                        {lifecycleStatusLabel[asset.lifecycleStatus]}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{asset.operationalAgeMonths} tháng · đã dùng {asset.lifecyclePercent}%</p>
                    </td>
                    <td className="px-5 py-5 text-right">
                      <p className="font-bold text-slate-900">{formatCurrency(asset.totalRepairCost)}</p>
                      <p className="text-[10px] text-slate-400">{asset.repairHistory.length} ghi nhận</p>
                    </td>
                    <td className="px-5 py-5">
                      <p className="text-xs font-semibold text-slate-900">{asset.lastMaintenanceDate ?? 'Chưa có'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Thay thế: {asset.expectedReplacementDate}</p>
                      {asset.replacementAlert && <p className="text-[10px] text-amber-600 font-bold mt-0.5">Cần rà soát</p>}
                    </td>
                    <td className="px-5 py-5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedAsset({ asset, tab: 'overview' })}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Chi tiết
                        </button>
                        <button
                          onClick={() => setSelectedAsset({ asset, tab: 'history' })}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Xem lịch sử bảo trì"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setQrPreviewAsset(asset)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Xem / in QR"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedAsset({ asset, tab: 'lifecycle' })}
                          className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Xem vòng đời"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
                        <Package className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">Không có tài sản phù hợp với bộ lọc hiện tại.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <ShieldCheck className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Trách nhiệm của Host trên trang này là giám sát danh mục: theo dõi sức khỏe tài sản, rủi ro vòng đời, chi phí sửa chữa và giá trị đầu tư. Các luồng kỹ thuật, hoàn tất sửa chữa và cập nhật tình trạng thủ công không thuộc phạm vi trang này.
        </p>
      </div>

      {showAssetSetup && (
        <AssetSetupModal onClose={() => setShowAssetSetup(false)} />
      )}

      {qrPreviewAsset && (
        <QrPreviewModal asset={qrPreviewAsset} onClose={() => setQrPreviewAsset(null)} />
      )}

      {selectedAsset && (
        <DetailModal asset={selectedAsset.asset} initialTab={selectedAsset.tab} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
};
