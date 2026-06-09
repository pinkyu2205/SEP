import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, User, Plus, Edit2, Trash2,
  DoorOpen, Users, Ruler, Zap, Droplets, Wrench,
} from 'lucide-react';
import type { Room, RoomStatus } from '../../types';
import { MOCK_PROPERTIES } from '../../utils/mockData';
import { formatCurrency, roomStatusMap } from '../../utils';
import { RoomFormModal } from './RoomFormModal';

export const PropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const property = MOCK_PROPERTIES.find((p) => p.id === id);

  const [rooms, setRooms] = useState<Room[]>(property?.rooms || []);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [filterStatus, setFilterStatus] = useState<RoomStatus | 'all'>('all');
  const [filterFloor, setFilterFloor] = useState<number | 'all'>('all');

  if (!property) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Không tìm thấy thông tin căn nhà này.</p>
        <button onClick={() => navigate('/host/properties')} className="btn-primary mt-4">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  // Lấy danh sách tầng duy nhất
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  // Lọc phòng
  const filteredRooms = rooms.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterFloor !== 'all' && r.floor !== filterFloor) return false;
    return true;
  });

  const handleSaveRoom = (data: Partial<Room>) => {
    if (editingRoom) {
      setRooms((prev) => prev.map((r) => (r.id === editingRoom.id ? { ...r, ...data } : r)));
    } else {
      const newRoom: Room = {
        id: `r-${Date.now()}`,
        code: data.code || '',
        floor: data.floor || 1,
        area: data.area || 0,
        maxOccupants: data.maxOccupants || 1,
        rentPrice: data.rentPrice || 0,
        deposit: data.deposit || 0,
        electricityRate: data.electricityRate || 3500,
        waterRate: data.waterRate || 15000,
        serviceCharge: data.serviceCharge || 100000,
        status: 'available',
      };
      setRooms((prev) => [...prev, newRoom]);
    }
    setShowRoomModal(false);
    setEditingRoom(null);
  };

  const handleDeleteRoom = (roomId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa phòng này?')) {
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    }
  };

  // Thống kê
  const occupied = rooms.filter((r) => r.status === 'occupied').length;
  const available = rooms.filter((r) => r.status === 'available').length;
  const maintenance = rooms.filter((r) => r.status === 'maintenance').length;

  return (
    <div className="space-y-6">
      {/* Back + Property Info Header */}
      <div>
        <button
          onClick={() => navigate('/host/properties')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </button>

        <div className="card p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-50 rounded-xl">
                <Building2 className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{property.name}</h1>
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4" />
                  {property.address}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" /> {property.managerName || 'Chưa có Manager'}
              </span>
              <span className="flex items-center gap-1.5">
                <DoorOpen className="w-4 h-4" /> {property.totalRooms} phòng (dự kiến)
              </span>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Tổng phòng</p>
              <p className="text-xl font-bold text-slate-900">{rooms.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Đang thuê</p>
              <p className="text-xl font-bold text-blue-600">{occupied}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Phòng trống</p>
              <p className="text-xl font-bold text-emerald-600">{available}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Bảo trì</p>
              <p className="text-xl font-bold text-amber-600">{maintenance}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tiền thuê gốc</p>
              <p className="text-xl font-bold text-rose-600">{formatCurrency(property.monthlyLeaseCost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Filter: Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as RoomStatus | 'all')}
            className="input-field w-auto text-sm"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="available">Trống</option>
            <option value="occupied">Đang thuê</option>
            <option value="maintenance">Bảo trì</option>
          </select>

          {/* Filter: Floor */}
          <select
            value={filterFloor}
            onChange={(e) => {
              const val = e.target.value;
              setFilterFloor(val === 'all' ? 'all' : Number(val));
            }}
            className="input-field w-auto text-sm"
          >
            <option value="all">Tất cả tầng</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                Tầng {f}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setEditingRoom(null);
            setShowRoomModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm phòng mới
        </button>
      </div>

      {/* ==================== ROOM GRID VIEW ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.map((room) => {
          const statusInfo = roomStatusMap[room.status];
          return (
            <div
              key={room.id}
              className="card p-4 hover:shadow-md transition-shadow duration-200 relative group"
            >
              {/* Status Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-primary-500" />
                  {room.code}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                  {statusInfo.label}
                </span>
              </div>

              {/* Room Info */}
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-slate-400" /> Diện tích
                  </span>
                  <span className="font-medium text-slate-900">{room.area} m²</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" /> Sức chứa
                  </span>
                  <span className="font-medium text-slate-900">{room.maxOccupants} người</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-slate-400" /> Điện
                  </span>
                  <span className="font-medium text-slate-900">{formatCurrency(room.electricityRate)}/kWh</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-slate-400" /> Nước
                  </span>
                  <span className="font-medium text-slate-900">{formatCurrency(room.waterRate)}/m³</span>
                </div>
              </div>

              {/* Price */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Giá thuê</p>
                <p className="text-lg font-bold text-primary-600">{formatCurrency(room.rentPrice)}</p>
              </div>

              {/* Tenant name (if occupied) */}
              {room.status === 'occupied' && room.tenantName && (
                <div className="mt-2 px-2.5 py-1.5 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {room.tenantName}
                  </p>
                </div>
              )}

              {/* Maintenance badge */}
              {room.status === 'maintenance' && (
                <div className="mt-2 px-2.5 py-1.5 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5" />
                    Đang bảo trì
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditingRoom(room);
                    setShowRoomModal(true);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRooms.length === 0 && (
        <div className="text-center py-16">
          <DoorOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Chưa có phòng nào. Hãy thêm phòng mới!</p>
        </div>
      )}

      {/* Room Modal */}
      {showRoomModal && (
        <RoomFormModal
          room={editingRoom}
          totalFloors={property.totalFloors}
          onSave={handleSaveRoom}
          onClose={() => {
            setShowRoomModal(false);
            setEditingRoom(null);
          }}
        />
      )}
    </div>
  );
};
