import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, DoorOpen, Users, Ruler,
  Zap, Droplets, RefreshCw, Home, UserCog, X, CheckCircle2,
  Wrench, CircleCheck, CircleDot,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '../../services/property.service';
import { userService } from '../../services/user.service';
import type { PropertyResponse, RoomResponse, UserResponse } from '../../types/api.types';
import { formatCurrency } from '../../utils';

const roomStatusMap: Record<string, { label: string; cls: string; dot: string }> = {
  AVAILABLE:   { label: 'Phòng trống',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  RENTED:      { label: 'Đang thuê',     cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  MAINTENANCE: { label: 'Bảo trì',       cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  DRAFT:       { label: 'Nháp',          cls: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
};

const propertyStatusLabel: Record<string, { label: string; cls: string }> = {
  ACTIVE:              { label: 'Đang hoạt động', cls: 'bg-emerald-100 text-emerald-700' },
  PENDING_HOST_REVIEW: { label: 'Chờ phê duyệt',  cls: 'bg-amber-100 text-amber-700' },
  DRAFT:               { label: 'Nháp',            cls: 'bg-slate-100 text-slate-500' },
  UNDER_RENOVATION:    { label: 'Đang cải tạo',    cls: 'bg-blue-100 text-blue-700' },
  DISABLED:            { label: 'Đã vô hiệu',      cls: 'bg-rose-100 text-rose-700' },
};

// Convert UUID string → number (same approach as HostPropertyReview)
const hashUUID = (s: string) =>
  Math.abs(s.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0));

// ─── Assign Manager Modal ───────────────────────────────────────────────────
interface AssignManagerModalProps {
  managers: UserResponse[];
  loadingManagers: boolean;
  managersError?: string;
  currentManagerId?: number;
  onClose: () => void;
  onConfirm: (managerId: string) => Promise<void>;
}

function AssignManagerModal({ managers, loadingManagers, managersError, currentManagerId, onClose, onConfirm }: AssignManagerModalProps) {
  const [selected, setSelected] = useState(() => managers[0]?.id ?? '');
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
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-50 rounded-xl">
              <UserCog className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Gán quản lý vận hành</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {loadingManagers ? (
          <div className="py-8 text-center text-slate-400">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary-500 mb-3" />
            <p className="text-sm">Đang tải danh sách quản lý...</p>
          </div>
        ) : managersError ? (
          <div className="py-8 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-rose-300" />
            <p className="text-sm font-semibold text-rose-600">{managersError}</p>
            <p className="text-xs text-slate-400 mt-1">Liên hệ Admin để được hỗ trợ gán quản lý.</p>
          </div>
        ) : managers.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không có quản lý vận hành nào đang hoạt động.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-4">
              Chọn quản lý vận hành sẽ phụ trách bất động sản này.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {managers.map(mgr => {
                const isActive = selected === mgr.id;
                const isCurrent = currentManagerId !== undefined && hashUUID(mgr.id) === currentManagerId;
                return (
                  <button
                    key={mgr.id}
                    onClick={() => setSelected(mgr.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${
                      isActive
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                      {mgr.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isActive ? 'text-primary-700' : 'text-slate-800'}`}>
                        {mgr.username}
                      </p>
                      {mgr.phoneNumber && (
                        <p className="text-xs text-slate-400">{mgr.phoneNumber}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          Hiện tại
                        </span>
                      )}
                      {isActive && (
                        <CheckCircle2 className="w-5 h-5 text-primary-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Huỷ
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selected || saving}
                className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition"
              >
                {saving ? 'Đang lưu...' : 'Xác nhận gán'}
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
  {
    value: 'AVAILABLE',
    label: 'Phòng trống',
    desc: 'Phòng sẵn sàng cho thuê',
    icon: <CircleCheck className="w-5 h-5 text-emerald-500" />,
    cls: 'border-emerald-300 bg-emerald-50',
    activeCls: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300',
  },
  {
    value: 'MAINTENANCE',
    label: 'Bảo trì',
    desc: 'Phòng đang được sửa chữa / bảo trì',
    icon: <Wrench className="w-5 h-5 text-amber-500" />,
    cls: 'border-amber-200 bg-amber-50',
    activeCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-300',
  },
  {
    value: 'RENTED',
    label: 'Đang thuê',
    desc: 'Phòng đã có khách đang thuê',
    icon: <CircleDot className="w-5 h-5 text-blue-500" />,
    cls: 'border-blue-200 bg-blue-50',
    activeCls: 'border-blue-400 bg-blue-50 ring-2 ring-blue-300',
  },
];

interface RoomStatusModalProps {
  room: RoomResponse;
  onClose: () => void;
  onConfirm: (roomId: number, status: string) => Promise<void>;
}

function RoomStatusModal({ room, onClose, onConfirm }: RoomStatusModalProps) {
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
            <h2 className="text-lg font-bold text-slate-900">Cập nhật trạng thái phòng</h2>
            <p className="text-sm text-slate-400 mt-0.5">Phòng <span className="font-semibold text-slate-600">{room.roomNumber}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-2.5">
          {STATUS_OPTIONS.map(opt => {
            const isActive = selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition ${isActive ? opt.activeCls : 'border-slate-100 bg-white hover:border-slate-200'}`}
              >
                {opt.icon}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                  <p className="text-xs text-slate-400">{opt.desc}</p>
                </div>
                {isActive && <CheckCircle2 className="w-5 h-5 text-primary-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Huỷ
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition"
          >
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
  const [managers, setManagers] = useState<UserResponse[]>([]);
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
    if (managers.length > 0 || managersError) return;
    setLoadingManagers(true);
    setManagersError(undefined);
    try {
      const allUsers = await userService.getAllUsers();
      setManagers((allUsers || []).filter(u => u.role === 'ROLE_MANAGER' && u.status === 'ACTIVE'));
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403) {
        setManagersError('Tài khoản này không có quyền xem danh sách quản lý vận hành.');
      } else {
        setManagersError(e?.response?.data?.message || 'Không tải được danh sách quản lý.');
      }
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
      // Cập nhật local state ngay, không cần reload toàn trang
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: status as RoomResponse['status'] } : r));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Cập nhật thất bại, vui lòng thử lại.');
    }
  };

  const handleAssignManager = async (managerId: string) => {
    if (!id) return;
    try {
      await propertyService.assignOperationManager(Number(id), hashUUID(managerId));
      toast.success('Gán quản lý vận hành thành công!');
      setShowAssignModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gán thất bại, vui lòng thử lại.');
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-400">Đang tải dữ liệu...</div>;
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Không tìm thấy thông tin căn nhà này.</p>
        <button onClick={() => navigate('/host/properties')} className="btn-primary mt-4">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const filteredRooms = filterStatus === 'all'
    ? rooms
    : rooms.filter(r => r.status === filterStatus);

  const available   = rooms.filter(r => r.status === 'AVAILABLE').length;
  const rented      = rooms.filter(r => r.status === 'RENTED').length;
  const maintenance = rooms.filter(r => r.status === 'MAINTENANCE').length;

  const propStatus = propertyStatusLabel[property.status] ?? propertyStatusLabel.DRAFT;

  // Find current manager name from managers list
  const currentManager = property.operationManagerId
    ? managers.find(m => hashUUID(m.id) === property.operationManagerId)
    : null;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/host/properties')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại danh sách
      </button>

      {/* Property Info Card */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary-50 rounded-xl shrink-0">
              <Building2 className="w-8 h-8 text-primary-600" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">{property.propertyName}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${propStatus.cls}`}>
                  {propStatus.label}
                </span>
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                <MapPin className="w-4 h-4 shrink-0" />
                {property.fullAddress || property.shortAddress}
              </p>
              {property.zoneName && (
                <p className="text-xs text-slate-400 mt-0.5">{property.zoneName}</p>
              )}

              {/* Current manager info */}
              <div className="flex items-center gap-2 mt-3">
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                  currentManager
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  <UserCog className="w-3.5 h-3.5" />
                  {currentManager
                    ? `Quản lý: ${currentManager.username}`
                    : 'Chưa có quản lý vận hành'}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openAssignModal}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition"
            >
              <UserCog className="w-4 h-4" />
              {currentManager ? 'Đổi quản lý' : 'Gán quản lý'}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Tổng phòng</p>
            <p className="text-xl font-bold text-slate-900">{rooms.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Phòng trống</p>
            <p className="text-xl font-bold text-emerald-600">{available}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Đang thuê</p>
            <p className="text-xl font-bold text-blue-600">{rented}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Bảo trì</p>
            <p className="text-xl font-bold text-amber-600">{maintenance}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Số tầng</p>
            <p className="text-xl font-bold text-slate-900">{property.floorCount ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input-field w-auto text-sm"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="AVAILABLE">Phòng trống</option>
          <option value="RENTED">Đang thuê</option>
          <option value="MAINTENANCE">Bảo trì</option>
          <option value="DRAFT">Nháp</option>
        </select>
        <span className="text-sm text-slate-500">{filteredRooms.length} phòng</span>
      </div>

      {/* Room Grid */}
      {filteredRooms.length === 0 ? (
        <div className="text-center py-16">
          <DoorOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Chưa có phòng nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map(room => {
            const st = roomStatusMap[room.status] ?? roomStatusMap.DRAFT;
            return (
              <div
                key={room.id}
                className="card p-4 hover:shadow-md hover:border-primary-200 transition cursor-pointer group"
                onClick={() => setSelectedRoom(room)}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <DoorOpen className="w-5 h-5 text-primary-500" />
                    {room.roomNumber}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls} group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-primary-300 transition`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>

                {/* Info */}
                <div className="space-y-2 text-sm text-slate-600">
                  {room.area != null && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Ruler className="w-4 h-4 text-slate-400" /> Diện tích
                      </span>
                      <span className="font-medium text-slate-900">{room.area} m²</span>
                    </div>
                  )}
                  {room.maxOccupants != null && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-slate-400" /> Sức chứa
                      </span>
                      <span className="font-medium text-slate-900">{room.maxOccupants} người</span>
                    </div>
                  )}
                  {room.electricMeterCode && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-slate-400" /> Đồng hồ điện
                      </span>
                      <span className="font-medium text-slate-900 text-xs">{room.electricMeterCode}</span>
                    </div>
                  )}
                  {room.waterMeterCode && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Droplets className="w-4 h-4 text-slate-400" /> Đồng hồ nước
                      </span>
                      <span className="font-medium text-slate-900 text-xs">{room.waterMeterCode}</span>
                    </div>
                  )}
                </div>

                {/* Price */}
                {room.price != null && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-500">Giá thuê</p>
                    <p className="text-lg font-bold text-primary-600">{formatCurrency(room.price)}</p>
                    {room.deposit != null && (
                      <p className="text-xs text-slate-400 mt-0.5">Đặt cọc: {formatCurrency(room.deposit)}</p>
                    )}
                  </div>
                )}

                {room.structureDescription && (
                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">{room.structureDescription}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Manager Modal */}
      {selectedRoom && (
        <RoomStatusModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onConfirm={handleUpdateRoomStatus}
        />
      )}

      {showAssignModal && (
        <AssignManagerModal
          managers={managers}
          loadingManagers={loadingManagers}
          managersError={managersError}
          currentManagerId={property.operationManagerId}
          onClose={() => setShowAssignModal(false)}
          onConfirm={handleAssignManager}
        />
      )}
    </div>
  );
};
