import { useState, useEffect, useCallback } from 'react';
import { Search, Building2, UserPlus, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '../../services/property.service';
import { hostService, type HostContractDto } from '../../services/host.service';
import type { PropertyResponse, RoomResponse, ContractStatus } from '../../types/api.types';
import { TenantFormModal } from './TenantFormModal';

const statusMap: Record<ContractStatus, { label: string; color: string; dot: string }> = {
  ACTIVE:     { label: 'Đang hiệu lực', color: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  PENDING:    { label: 'Chờ xác nhận',  color: 'bg-amber-50 text-amber-600',    dot: 'bg-amber-500' },
  EXPIRED:    { label: 'Đã hết hạn',    color: 'bg-red-50 text-red-600',        dot: 'bg-red-500' },
  TERMINATED: { label: 'Đã chấm dứt',   color: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-400' },
};

export const TenantList = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Host xem hợp đồng qua endpoint host (/api/v1/host/contracts). Endpoint manager
  // /properties/{id}/tenant-contracts chỉ cho MANAGER/ADMIN -> host (OWNER) bị 403.
  // (Xem doc/BE-FIXES-host-web-2026-06-29.md — chờ BE thêm propertyId + SĐT/CCCD/cọc/ngày vào ở.)
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);

  const selectedProperty = properties.find((p) => p.id === selectedId) || null;

  // Load danh sách property 1 lần
  useEffect(() => {
    propertyService
      .getProperties(0, 200)
      .then((page) => {
        setProperties(page.content);
        if (page.content.length > 0) setSelectedId(page.content[0].id);
      })
      .catch(() => toast.error('Không tải được danh sách bất động sản'));
  }, []);

  // Toàn bộ hợp đồng của host (endpoint host trả tất cả, lọc theo BĐS ở client)
  const loadContracts = useCallback(() => {
    setLoading(true);
    hostService
      .listContracts({ size: 500 })
      .then((page) => setContracts(page.content))
      .catch(() => toast.error('Không tải được dữ liệu hợp đồng'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Phòng của BĐS đang chọn (cho modal "Thêm khách thuê")
  useEffect(() => {
    if (selectedId == null) {
      setRooms([]);
      return;
    }
    propertyService
      .getRooms(selectedId)
      .then(setRooms)
      .catch(() => setRooms([]));
  }, [selectedId]);

  // Phòng còn trống để gán khách
  const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE');

  // Endpoint host chưa có propertyId -> lọc theo tên BĐS đang chọn.
  const propContracts = selectedProperty
    ? contracts.filter((c) => c.propertyName === selectedProperty.propertyName)
    : contracts;

  const filtered = propContracts.filter(
    (c) =>
      c.lesseeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.roomCode ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const activeCount = propContracts.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khách thuê & Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            {selectedProperty
              ? `${propContracts.length} hợp đồng · ${activeCount} đang hiệu lực`
              : 'Chọn bất động sản để xem khách thuê'}
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
          disabled={!selectedProperty}
          onClick={() => setShowModal(true)}
        >
          <UserPlus className="w-4 h-4" /> Thêm khách thuê
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="input-field pl-10 bg-white appearance-none"
          >
            {properties.length === 0 && <option value="">Không có bất động sản</option>}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.propertyName} {p.wholeHouse ? '(nguyên căn)' : '(chia phòng)'}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên, phòng, mã HĐ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10 bg-white"
          />
        </div>
      </div>

      {/* Bảng hợp đồng */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Chưa có khách thuê nào cho bất động sản này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Mã HĐ</th>
                  <th className="px-4 py-3">Khách thuê</th>
                  <th className="px-4 py-3">Phòng</th>
                  <th className="px-4 py-3">Giá thuê</th>
                  <th className="px-4 py-3">Bắt đầu</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const st = statusMap[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{c.lesseeName}</td>
                      <td className="px-4 py-3">{c.roomCode ?? 'Nguyên căn'}</td>
                      <td className="px-4 py-3 text-primary-600 font-medium">{c.rentAmount.toLocaleString('vi-VN')}đ</td>
                      <td className="px-4 py-3 text-slate-500">{c.startDate}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && selectedProperty && (
        <TenantFormModal
          propertyId={selectedProperty.id}
          propertyName={selectedProperty.propertyName}
          wholeHouse={selectedProperty.wholeHouse === true}
          rooms={availableRooms}
          onSuccess={() => loadContracts()}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
