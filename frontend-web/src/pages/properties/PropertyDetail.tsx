import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, DoorOpen, Users, Ruler,
  Zap, Droplets, RefreshCw, Home, UserCog, X, CheckCircle2,
  Wrench, CircleCheck, CircleDot, Layers, BadgeDollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse, RoomResponse } from '../../types/api.types';
import { formatCurrency } from '../../utils';

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

function RoomStatusModal({ room, onClose, onConfirm }: { room: RoomResponse; onClose: () => void; onConfirm: (roomId: number, status: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string>(room.status);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (selected === room.status) { onClose(); return; }
    setSaving(true);
    await onConfirm(room.id, selected);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Cập nhật trạng thái</h2>
            <p className="text-sm text-slate-400 mt-0.5">Phòng <span className="font-semibold text-slate-700">{room.roomNumber}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="space-y-2.5">
          {STATUS_OPTIONS.map(opt => {
            const isActive = selected === opt.value;
            return (
              <button key={opt.value} onClick={() => setSelected(opt.value)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition ${isActive ? opt.activeCls : 'border-slate-100 bg-white hover:border-slate-200'}`}>
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
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">Huỷ</button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
            {saving ? 'Đang lưu...' : 'Xác nhận'}
          </button>
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
      const [prop, roomList] = await Promise.all([
        propertyService.getPropertyById(Number(id)),
        propertyService.getRooms(Number(id)),
      ]);
      setProperty(prop);
      setRooms(roomList);
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
      toast.error(e?.response?.data?.message || 'Cập nhật thất bại, vui lòng thử lại.');
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
  const currentManager = property.operationManagerId
    ? managers.find(m => m.id === property.operationManagerId)
    : null;

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
                      Quản lý: {currentManager?.username || 'Đã gán'}
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
              {property.status === 'PENDING_OPERATION_MANAGER' ? (
                <button onClick={openAssignModal}
                  className="flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 border border-indigo-400 px-4 py-2 text-sm font-semibold text-white transition">
                  <UserCog className="w-4 h-4" />
                  Gán quản lý
                </button>
              ) : property.operationManagerId ? (
                <div className="group relative">
                  <button disabled
                    className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white/50 cursor-not-allowed">
                    <UserCog className="w-4 h-4" />
                    Đổi quản lý
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-slate-900 text-slate-200 text-xs p-3 shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                    Tính năng đổi quản lý đang được phát triển.
                  </div>
                </div>
              ) : (
                <div className="group relative">
                  <button disabled
                    className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white/50 cursor-not-allowed">
                    <UserCog className="w-4 h-4" />
                    Gán quản lý
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-60 rounded-xl bg-slate-900 text-slate-200 text-xs p-3 shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                    Chỉ gán được khi nhà ở trạng thái "Chờ gán quản lý".
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
        <div className="bg-white px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4 border-t border-slate-100">
          {[
            { label: 'Tổng phòng',   value: rooms.length,    icon: DoorOpen,        color: 'text-indigo-500', bg: 'bg-indigo-50' },
            { label: 'Phòng trống',  value: available,        icon: CircleCheck,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Đang thuê',    value: rented,           icon: Users,           color: 'text-blue-600',   bg: 'bg-blue-50' },
            { label: 'Bảo trì',      value: maintenance,      icon: Wrench,          color: 'text-amber-600',  bg: 'bg-amber-50' },
            { label: 'Số tầng',      value: property.totalFloor ?? property.floorCount ?? '—', icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' },
          ].map(s => (
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
            return (
              <div key={room.id} onClick={() => setSelectedRoom(room)}
                className={`bg-white rounded-2xl border-2 ${st.border} p-4 cursor-pointer transition-all hover:shadow-md group`}>
                {/* Room header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <DoorOpen className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="text-base font-extrabold text-slate-900">{room.roomNumber}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  {room.area != null && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Ruler className="w-3 h-3" /> Diện tích</p>
                      <p className="font-bold text-slate-800 mt-0.5">{room.area} m²</p>
                    </div>
                  )}
                  {room.maxOccupants != null && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" /> Sức chứa</p>
                      <p className="font-bold text-slate-800 mt-0.5">{room.maxOccupants} người</p>
                    </div>
                  )}
                  {room.electricMeterCode && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Điện</p>
                      <p className="font-bold text-slate-800 mt-0.5 text-xs truncate">{room.electricMeterCode}</p>
                    </div>
                  )}
                  {room.waterMeterCode && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Droplets className="w-3 h-3" /> Nước</p>
                      <p className="font-bold text-slate-800 mt-0.5 text-xs truncate">{room.waterMeterCode}</p>
                    </div>
                  )}
                </div>

                {/* Price */}
                {room.price != null && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <BadgeDollarSign className="w-3.5 h-3.5" /> Giá thuê
                    </span>
                    <span className="font-extrabold text-indigo-600">{formatCurrency(room.price)}</span>
                  </div>
                )}

                {room.structureDescription && (
                  <p className="mt-2 text-xs text-slate-400 line-clamp-1">{room.structureDescription}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedRoom && (
        <RoomStatusModal room={selectedRoom} onClose={() => setSelectedRoom(null)} onConfirm={handleUpdateRoomStatus} />
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
