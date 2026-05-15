import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, User, Plus, ChevronRight, Home, Search } from 'lucide-react';
import type { Property } from '../../types';
import { MOCK_PROPERTIES } from '../../utils/mockData';
import { formatCurrency, roomStatusMap } from '../../utils';
import { PropertyFormModal } from './PropertyFormModal';

export const PropertyList = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>(MOCK_PROPERTIES);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  const filtered = properties.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = (data: Partial<Property>) => {
    if (editingProperty) {
      // Cập nhật
      setProperties((prev) =>
        prev.map((p) => (p.id === editingProperty.id ? { ...p, ...data } : p))
      );
    } else {
      // Thêm mới
      const newProp: Property = {
        id: `prop-${Date.now()}`,
        name: data.name || '',
        address: data.address || '',
        totalFloors: data.totalFloors || 1,
        totalRooms: data.totalRooms || 4,
        monthlyLeaseCost: data.monthlyLeaseCost || 0,
        deposit: data.deposit || 0,
        rooms: [],
        createdAt: new Date().toISOString().split('T')[0],
      };
      setProperties((prev) => [...prev, newProp]);
    }
    setShowModal(false);
    setEditingProperty(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa căn nhà này? Tất cả dữ liệu phòng bên trong cũng sẽ bị xóa.')) {
      setProperties((prev) => prev.filter((p) => p.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bất động sản</h1>
          <p className="text-sm text-slate-500 mt-1">
            {properties.length} bất động sản trong danh mục UrbanNest
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProperty(null);
            setShowModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm bất động sản
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm theo tên hoặc địa chỉ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Property Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((property) => {
          const occupied = property.rooms.filter((r) => r.status === 'occupied').length;
          const available = property.rooms.filter((r) => r.status === 'available').length;
          const maintenance = property.rooms.filter((r) => r.status === 'maintenance').length;
          const totalRooms = property.rooms.length;
          const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
          const monthlyRevenue = property.rooms
            .filter((r) => r.status === 'occupied')
            .reduce((sum, r) => sum + r.rentPrice, 0);

          return (
            <div
              key={property.id}
              className="card hover:shadow-md transition-shadow duration-200 cursor-pointer group"
              onClick={() => navigate(`/properties/${property.id}`)}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary-50 rounded-xl">
                      <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
                        {property.name}
                      </h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {property.address}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 transition-colors" />
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-4">
                {/* Room Status Summary */}
                <div className="flex items-center gap-3">
                  {[
                    { count: available, ...roomStatusMap.available },
                    { count: occupied, ...roomStatusMap.occupied },
                    { count: maintenance, ...roomStatusMap.maintenance },
                  ].map((s, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.count} {s.label}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Tỷ lệ lấp đầy</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{occupancyRate}%</p>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-primary-600 rounded-full h-1.5 transition-all"
                        style={{ width: `${occupancyRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Doanh thu/tháng</p>
                    <p className="text-lg font-bold text-emerald-600 mt-0.5">
                      {formatCurrency(monthlyRevenue)}
                    </p>
                  </div>
                </div>

                {/* Manager */}
                <div className="flex items-center justify-between text-sm text-slate-500 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    {property.managerName || 'Chưa có quản lý'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Home className="w-4 h-4" />
                    {property.totalRooms} phòng (dự kiến)
                  </span>
                </div>
              </div>

              {/* Card Footer - Actions */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingProperty(property);
                    setShowModal(true);
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Chỉnh sửa
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(property.id);
                  }}
                  className="text-sm font-medium text-rose-500 hover:text-rose-600"
                >
                  Xóa
                </button>
                <span className="ml-auto text-xs text-slate-400">
                  {totalRooms} phòng · {property.totalFloors} tầng
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Không tìm thấy bất động sản nào.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PropertyFormModal
          property={editingProperty}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingProperty(null);
          }}
        />
      )}
    </div>
  );
};
