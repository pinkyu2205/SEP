import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, DoorOpen, Users, Ruler,
  Zap, Droplets, RefreshCw, Home, UserCog, X, CheckCircle2,
  Wrench, CircleCheck, Layers, BadgeDollarSign, Wallet, Phone, CalendarClock, UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '../../services/property.service';
import { tenantService } from '../../services/tenant.service';
import type { PropertyResponse, RoomResponse, TenantContractResponse } from '../../types/api.types';
import { formatCurrency } from '../../utils';

/** dd/MM/yyyy hoặc '—' */
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const roomStatusMap: Record<string, { label: string; cls: string; dot: string; border: string }> = {
  AVAILABLE:   { label: 'Phòng trống',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200 hover:border-emerald-400' },
  RENTED:      { label: 'Đang thuê',     cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500',    border: 'border-blue-200 hover:border-blue-400' },
  MAINTENANCE: { label: 'Bảo trì',       cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   border: 'border-amber-200 hover:border-amber-400' },
  DRAFT:       { label: 'Nháp',          cls: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400',   border: 'border-slate-200 hover:border-slate-300' },
};

const propertyStatusLabel: Record<string, { label: string; cls: string }> = {
  ACTIVE:                    { label: 'Đang hoạt động',    cls: 'bg-emerald-500 text-white' },
  PENDING_HOST_REVIEW:       { label: 'Chờ phê duyệt',     cls: 'bg-amber-400 text-white' },
  PENDING_OPERATION_MANAGER: { label: 'Chờ gán quản lý',   cls: 'bg-violet-500 text-white' },
  DRAFT:                     { label: 'Nháp',               cls: 'bg-slate-400 text-white' },
  UNDER_RENOVATION:          { label: 'Đang cải tạo',       cls: 'bg-blue-500 text-white' },
  DISABLED:                  { label: 'Đã vô hiệu',         cls: 'bg-rose-500 text-white' },
};

type ManagerItem = { id: string; fullName: string; username: string };

// ─── Assign Manager Modal ───────────────────────────────────────────────────
interface AssignManagerModalProps {
  managers: ManagerItem[];
  loadingManagers: boolean;
  managersError?: string;
  currentManagerId?: string;
  isChange?: boolean;
  onClose: () => void;
  onConfirm: (managerId: string) => Promise<void>;
}

function AssignManagerModal({ managers, loadingManagers, managersError, currentManagerId, isChange, onClose, onConfirm }: AssignManagerModalProps) {
  const [selected, setSelected] = useState(() => currentManagerId || managers[0]?.id || '');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    await onConfirm(selected);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <UserCog className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{isChange ? 'Đổi quản lý vận hành' : 'Gán quản lý vận hành'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {loadingManagers ? (
          <div className="py-8 text-center text-slate-400">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500 mb-3" />
            <p className="text-sm">Đang tải danh sách quản lý...</p>
          </div>
        ) : managersError ? (
          <div className="py-8 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-rose-300" />
            <p className="text-sm font-semibold text-rose-600">{managersError}</p>
          </div>
        ) : managers.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không có quản lý vận hành nào đang hoạt động.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Chọn quản lý vận hành sẽ phụ trách bất động sản này.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {managers.map(mgr => {
                const isActive = selected === mgr.id;
                const isCurrent = mgr.id === currentManagerId;
                return (
                  <button key={mgr.id} onClick={() => setSelected(mgr.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${
                      isActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}>
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                      {mgr.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>{mgr.username}</p>
                      {mgr.fullName && <p className="text-xs text-slate-400">{mgr.fullName}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Hiện tại</span>}
                      {isActive && <CheckCircle2 className="w-5 h-5 text-indigo-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Huỷ</button>
              <button onClick={handleConfirm} disabled={!selected || saving}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                {saving ? 'Đang lưu...' : isChange ? 'Xác nhận đổi' : 'Xác nhận gán'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Room Status Modal ───────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'AVAILABLE',   label: 'Phòng trống', desc: 'Sẵn sàng cho thuê',       icon: <CircleCheck className="w-5 h-5 text-emerald-500" />, activeCls: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' },
  { value: 'MAINTENANCE', label: 'Bảo trì',     desc: 'Đang sửa chữa / bảo trì', icon: <Wrench className="w-5 h-5 text-amber-500" />,       activeCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' },
];

// ─── Room Detail Modal — xem đầy đủ thông tin phòng + đổi trạng thái ──────────
function InfoCell({ icon: Icon, label, value, highlight }: { icon: typeof Ruler; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
      <p className={`mt-0.5 font-bold ${highlight ? 'text-indigo-600 text-base' : 'text-slate-800 text-sm'}`}>{value}</p>
    </div>
  );
}

function RoomDetailModal({
  room, tenant, canChange, onClose, onConfirmStatus,
}: {
  room: RoomResponse;
  tenant: TenantContractResponse | null;
  canChange: boolean;
  onClose: () => void;
  onConfirmStatus: (roomId: number, status: string) => Promise<void>;
}) {
  const st = roomStatusMap[room.status] ?? roomStatusMap.DRAFT;
  const [selected, setSelected] = useState<string>(room.status);
  const [saving, setSaving] = useState(false);
  const dirty = selected !== room.status;

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    await onConfirmStatus(room.id, selected);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><DoorOpen className="w-5 h-5 text-indigo-500" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">Phòng {room.roomNumber}</h2>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ${st.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          {room.imageUrls && (
            <img src={room.imageUrls} alt={room.roomNumber} className="w-full h-44 object-cover rounded-xl border border-slate-100" />
          )}

          {/* Thông tin phòng */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell icon={Ruler} label="Diện tích" value={room.area != null ? `${room.area} m²` : '—'} />
            <InfoCell icon={Users} label="Sức chứa" value={room.maxOccupants != null ? `${room.maxOccupants} người` : '—'} />
            <InfoCell icon={BadgeDollarSign} label="Giá thuê / tháng" value={room.price != null ? formatCurrency(room.price) : '—'} highlight />
            <InfoCell icon={Wallet} label="Tiền cọc" value={room.deposit != null ? formatCurrency(room.deposit) : '—'} />
            <InfoCell icon={Zap} label="Mã điện" value={room.electricMeterCode || '—'} />
            <InfoCell icon={Droplets} label="Mã nước" value={room.waterMeterCode || '—'} />
          </div>

          {room.structureDescription && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-400 mb-1">Mô tả / cấu trúc</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{room.structureDescription}</p>
            </div>
          )}

          {/* Khách thuê */}
          {tenant && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5" /> Khách thuê hiện tại</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">{tenant.tenantFullName.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{tenant.tenantFullName}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" /> {tenant.tenantPhone}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">Giá thuê</p>
                  <p className="font-bold text-slate-800">{formatCurrency(tenant.rentAmount)}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Kỳ hạn</p>
                  <p className="font-bold text-slate-800 text-xs mt-0.5">{fmtDate(tenant.startDate)} → {tenant.endDate ? fmtDate(tenant.endDate) : 'Không thời hạn'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Đổi trạng thái */}
          {canChange ? (
            <div>
              <p className="text-sm font-bold text-slate-800 mb-2">Đổi trạng thái phòng</p>
              <div className="space-y-2">
                {STATUS_OPTIONS.map(opt => {
                  const isActive = selected === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setSelected(opt.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${isActive ? opt.activeCls : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                      {opt.icon}
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.desc}</p>
                      </div>
                      {isActive && <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <button onClick={handleSave} disabled={!dirty || saving}
                className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {saving ? 'Đang lưu...' : 'Lưu trạng thái'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
              {room.status === 'RENTED'
                ? 'Phòng đang cho thuê — không thể đổi trạng thái.'
                : 'Tòa nhà ở trạng thái hiện tại không cho đổi trạng thái phòng.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [managersError, setManagersError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomResponse | null>(null);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [prop, roomList, mgrs, contractList] = await Promise.all([
        propertyService.getPropertyById(Number(id)),
        propertyService.getRooms(Number(id)),
        propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
        tenantService.listByProperty(Number(id), { silent: true }).catch(() => null),
      ]);
      // Patch tên manager nếu BE chưa trả (mục 6 NOTE-CHO-TEAM-BE.md)
      if (prop.operationManagerId && !prop.operationManagerName) {
        const mgr = mgrs.find(m => m.id === prop.operationManagerId);
        if (mgr) prop.operationManagerName = mgr.fullName || mgr.username;
      }
      setManagers(mgrs);
      setProperty(prop);
      setRooms(roomList);
      setContracts(contractList ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openAssignModal = async () => {
    setShowAssignModal(true);
    setManagers([]);
    setManagersError(undefined);
    setLoadingManagers(true);
    try {
      const list = await propertyService.getManagers();
      console.log('[getManagers] result:', list);
      setManagers(list || []);
    } catch (e: any) {
      setManagersError(e?.response?.status === 403
        ? 'Tài khoản không có quyền xem danh sách quản lý.'
        : e?.response?.data?.message || 'Không tải được danh sách quản lý.');
    } finally {
      setLoadingManagers(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleUpdateRoomStatus = async (roomId: number, status: string) => {
    if (!id) return;
    try {
      await propertyService.updateRoomStatus(Number(id), roomId, status);
      toast.success('Cập nhật trạng thái phòng thành công!');
      setSelectedRoom(null);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: status as RoomResponse['status'] } : r));
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Cập nhật thất bại, vui lòng thử lại.');
    }
  };

  const handleAssignManager = async (managerId: string) => {
    if (!id) return;
    try {
      console.log('[assignManager] sending:', { propertyId: id, operationManagerId: managerId });
      await propertyService.assignOperationManager(Number(id), managerId);
      toast.success(property?.operationManagerId ? 'Đổi quản lý thành công!' : 'Gán quản lý thành công!');
      setShowAssignModal(false);
      fetchData();
    } catch (e: any) {
      const data = e?.response?.data;
      const msg = data?.message || data?.error || (typeof data === 'string' ? data : null)
        || `Lỗi ${e?.response?.status ?? ''}: Gán thất bại`;
      console.error('[assignManager] error:', data);
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 mb-4" />
          <p className="text-sm text-slate-400 font-medium">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Không tìm thấy thông tin căn nhà này.</p>
        <button onClick={() => navigate('/host/properties')} className="mt-4 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Quay lại danh sách</button>
      </div>
    );
  }

  const filteredRooms = filterStatus === 'all' ? rooms : rooms.filter(r => r.status === filterStatus);
  const available   = rooms.filter(r => r.status === 'AVAILABLE').length;
  const rented      = rooms.filter(r => r.status === 'RENTED').length;
  const maintenance = rooms.filter(r => r.status === 'MAINTENANCE').length;
  const propStatus  = propertyStatusLabel[property.status] ?? propertyStatusLabel.DRAFT;

  // Tách UI theo loại hình: nhà nguyên căn vs nhà chia phòng
  const isWholeHouse = property.wholeHouse === true;
  const activeContract = contracts.find(c => c.status === 'ACTIVE') ?? null;

  // Dải chỉ số trong hero — khác nhau theo loại hình
  const heroStats: { label: string; value: string | number; icon: typeof DoorOpen; color: string; bg: string }[] = isWholeHouse
    ? [
        { label: 'Diện tích',  value: property.areaSize ? `${property.areaSize} m²` : '—', icon: Ruler,      color: 'text-indigo-500',  bg: 'bg-indigo-50' },
        { label: 'Số tầng',    value: property.totalFloor ?? property.floorCount ?? '—',   icon: Layers,     color: 'text-slate-600',   bg: 'bg-slate-50' },
        { label: 'Số phòng',   value: property.totalRooms || '—',                          icon: DoorOpen,   color: 'text-violet-600',  bg: 'bg-violet-50' },
        { label: 'Cho thuê',   value: activeContract ? 'Đang thuê' : 'Còn trống',          icon: activeContract ? Users : CircleCheck, color: activeContract ? 'text-blue-600' : 'text-emerald-600', bg: activeContract ? 'bg-blue-50' : 'bg-emerald-50' },
      ]
    : [
        { label: 'Tổng phòng',  value: rooms.length, icon: DoorOpen,    color: 'text-indigo-500',  bg: 'bg-indigo-50' },
        { label: 'Phòng trống', value: available,    icon: CircleCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Đang thuê',   value: rented,       icon: Users,       color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Bảo trì',     value: maintenance,  icon: Wrench,      color: 'text-amber-600',   bg: 'bg-amber-50' },
        { label: 'Số tầng',     value: property.totalFloor ?? property.floorCount ?? '—', icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' },
      ];

  const FILTER_TABS = [
    { value: 'all',         label: 'Tất cả',    count: rooms.length },
    { value: 'AVAILABLE',   label: 'Phòng trống', count: available },
    { value: 'RENTED',      label: 'Đang thuê',   count: rented },
    { value: 'MAINTENANCE', label: 'Bảo trì',     count: maintenance },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Back */}
      <button onClick={() => navigate('/host/properties')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium">
        <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
      </button>

      {/* Hero Card */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200">
        {/* Top banner */}
        <div className="bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-6 py-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-xl shrink-0">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-extrabold text-white leading-tight">{property.propertyName}</h1>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${propStatus.cls}`}>
                    {propStatus.label}
                  </span>
                </div>
                <p className="text-indigo-100 text-sm flex items-center gap-1 mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {property.fullAddress || property.shortAddress}
                </p>
                {property.zoneName && (
                  <p className="text-indigo-200 text-xs mt-0.5">{property.zoneName}</p>
                )}
                <div className="mt-2.5">
                  {property.operationManagerId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/20 text-white px-2.5 py-1 rounded-full">
                      <UserCog className="w-3.5 h-3.5" />
                      Quản lý: {property.operationManagerName || 'Đã gán'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 text-indigo-100 px-2.5 py-1 rounded-full">
                      <UserCog className="w-3.5 h-3.5" /> Chưa có quản lý
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {(['ACTIVE', 'PENDING_OPERATION_MANAGER', 'PENDING_HOST_REVIEW'].includes(property.status)) ? (
                <button onClick={openAssignModal}
                  className="flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 px-4 py-2 text-sm font-semibold text-white transition">
                  <UserCog className="w-4 h-4" />
                  {property.operationManagerId ? 'Đổi quản lý' : 'Gán quản lý'}
                </button>
              ) : (
                <div className="group relative">
                  <button disabled
                    className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white/50 cursor-not-allowed">
                    <UserCog className="w-4 h-4" />
                    {property.operationManagerId ? 'Đổi quản lý' : 'Gán quản lý'}
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-slate-900 text-slate-200 text-xs p-3 shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                    Không thể thay đổi quản lý ở trạng thái hiện tại.
                  </div>
                </div>
              )}
              <button onClick={fetchData}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white transition">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className={`bg-white px-6 py-4 grid grid-cols-2 gap-4 border-t border-slate-100 ${isWholeHouse ? 'sm:grid-cols-4' : 'sm:grid-cols-5'}`}>
          {heroStats.map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg} shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <p className={`text-lg font-extrabold leading-tight ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ NHÀ NGUYÊN CĂN — căn nhà là 1 đơn vị cho thuê ═══════════ */}
      {isWholeHouse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Thông tin cho thuê */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Home className="w-5 h-5 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Thông tin cho thuê</h2>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><BadgeDollarSign className="w-4 h-4" /> Giá thuê / tháng</span>
                <span className="font-extrabold text-indigo-600 text-lg">{property.price != null ? formatCurrency(property.price) : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Wallet className="w-4 h-4" /> Tiền cọc</span>
                <span className="font-bold text-slate-800">{property.deposit != null ? formatCurrency(property.deposit) : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Ruler className="w-4 h-4" /> Diện tích</span>
                <span className="font-bold text-slate-800">{property.areaSize ? `${property.areaSize} m²` : '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Building2 className="w-4 h-4" /> Loại hình</span>
                <span className="font-bold text-slate-800">Nhà nguyên căn</span>
              </div>
            </div>
          </div>

          {/* Khách thuê hiện tại */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <UserRound className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Khách thuê hiện tại</h2>
            </div>
            {activeContract ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">
                    {activeContract.tenantFullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{activeContract.tenantFullName}</p>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" /> {activeContract.tenantPhone}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs font-bold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Đang thuê</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><BadgeDollarSign className="w-3 h-3" /> Giá thuê</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(activeContract.rentAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Wallet className="w-3 h-3" /> Tiền cọc</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(activeContract.deposit)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 col-span-2">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Kỳ hạn hợp đồng</p>
                    <p className="font-bold text-slate-800 mt-0.5">{fmtDate(activeContract.startDate)} → {activeContract.endDate ? fmtDate(activeContract.endDate) : 'Không thời hạn'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <CircleCheck className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="font-bold text-slate-700">Căn nhà đang trống</p>
                <p className="text-sm text-slate-400 mt-1">Chưa có khách thuê. Onboard khách ở mục “Khách thuê”.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ NHÀ CHIA PHÒNG — grid phòng + filter ═══════════ */}
      {!isWholeHouse && (
        <>
      {/* Filter tabs + room count */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {FILTER_TABS.map(tab => (
          <button key={tab.value} onClick={() => setFilterStatus(tab.value)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
              filterStatus === tab.value
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}>
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              filterStatus === tab.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Room Grid */}
      {filteredRooms.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <DoorOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Không có phòng nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map(room => {
            const st = roomStatusMap[room.status] ?? roomStatusMap.DRAFT;
            const tenant = contracts.find(c => c.roomId === room.id && c.status === 'ACTIVE') ?? null;
            return (
              <div key={room.id} onClick={() => setSelectedRoom(room)}
                className={`relative overflow-hidden bg-white rounded-2xl border ${st.border} cursor-pointer hover:shadow-md transition-all group`}>
                {/* Dải màu trạng thái */}
                <span className={`absolute inset-x-0 top-0 h-1 ${st.dot}`} />

                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <DoorOpen className="w-4 h-4 text-indigo-500" />
                      </div>
                      <span className="text-lg font-black text-slate-900">{room.roomNumber}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </div>

                  {/* Thông tin dạng chip */}
                  <div className="flex flex-wrap gap-1.5">
                    {room.area != null && (
                      <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-lg"><Ruler className="w-3 h-3 text-slate-400" /> {room.area} m²</span>
                    )}
                    {room.maxOccupants != null && (
                      <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-lg"><Users className="w-3 h-3 text-slate-400" /> {room.maxOccupants} người</span>
                    )}
                    {room.electricMeterCode && (
                      <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-lg"><Zap className="w-3 h-3 text-amber-400" /> {room.electricMeterCode}</span>
                    )}
                    {room.waterMeterCode && (
                      <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-lg"><Droplets className="w-3 h-3 text-blue-400" /> {room.waterMeterCode}</span>
                    )}
                  </div>

                  {/* Khách thuê (nếu phòng đang thuê & lấy được hợp đồng) */}
                  {tenant && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                        {tenant.tenantFullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate leading-tight">{tenant.tenantFullName}</p>
                        <p className="text-xs text-slate-500 truncate">{tenant.tenantPhone}</p>
                      </div>
                    </div>
                  )}

                  {/* Giá */}
                  {room.price != null && (
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                      <span className="flex items-center gap-1 text-xs text-slate-400"><BadgeDollarSign className="w-3.5 h-3.5" /> Giá thuê</span>
                      <span className="font-black text-indigo-600">{formatCurrency(room.price)}</span>
                    </div>
                  )}

                  <p className="mt-2 text-center text-[11px] font-semibold text-slate-300 group-hover:text-indigo-500 transition">Bấm để xem chi tiết →</p>
                  {room.structureDescription && (
                    <p className="mt-2 text-xs text-slate-400 line-clamp-1">{room.structureDescription}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

        </>
      )}

      {selectedRoom && (
        <RoomDetailModal
          room={selectedRoom}
          tenant={contracts.find(c => c.roomId === selectedRoom.id && c.status === 'ACTIVE') ?? null}
          canChange={['DRAFT', 'ACTIVE'].includes(property.status) && selectedRoom.status !== 'RENTED'}
          onClose={() => setSelectedRoom(null)}
          onConfirmStatus={handleUpdateRoomStatus}
        />
      )}

      {showAssignModal && (
        <AssignManagerModal
          managers={managers}
          loadingManagers={loadingManagers}
          managersError={managersError}
          currentManagerId={property.operationManagerId}
          isChange={!!property.operationManagerId}
          onClose={() => setShowAssignModal(false)}
          onConfirm={handleAssignManager}
        />
      )}
    </div>
  );
};
