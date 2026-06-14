import { useState, useEffect, useCallback } from 'react';
import { Search, Building2, UserPlus, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '../../services/property.service';
import { tenantService } from '../../services/tenant.service';
import type { PropertyResponse, RoomResponse, TenantContractResponse, ContractStatus } from '../../types/api.types';
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
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
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

  // Load hợp đồng + phòng theo property đang chọn
  const loadData = useCallback((propertyId: number) => {
    setLoading(true);
    Promise.all([
      tenantService.listByProperty(propertyId),
      propertyService.getRooms(propertyId).catch(() => [] as RoomResponse[]),
    ])
      .then(([c, r]) => {
        setContracts(c);
        setRooms(r);
      })
      .catch(() => toast.error('Không tải được dữ liệu hợp đồng'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId != null) loadData(selectedId);
  }, [selectedId, loadData]);

  // Phòng còn trống để gán khách
  const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE');

  const filtered = contracts.filter(
    (c) =>
      c.tenantFullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.tenantPhone.includes(searchTerm) ||
      (c.tenantCccd ?? '').includes(searchTerm) ||
      c.contractCode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const activeCount = contracts.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khách thuê & Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            {selectedProperty
              ? `${contracts.length} hợp đồng · ${activeCount} đang hiệu lực`
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
            placeholder="Tìm theo tên, SĐT, mã HĐ..."
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
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Phòng</th>
                  <th className="px-4 py-3">Giá thuê</th>
                  <th className="px-4 py-3">Cọc</th>
                  <th className="px-4 py-3">Vào ở</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const st = statusMap[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.contractCode}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{c.tenantFullName}</td>
                      <td className="px-4 py-3">{c.tenantPhone}</td>
                      <td className="px-4 py-3">{c.roomNumber ?? 'Nguyên căn'}</td>
                      <td className="px-4 py-3 text-primary-600 font-medium">{c.rentAmount.toLocaleString('vi-VN')}đ</td>
                      <td className="px-4 py-3">{c.deposit.toLocaleString('vi-VN')}đ</td>
                      <td className="px-4 py-3 text-slate-500">{c.moveInDate}</td>
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
          onSuccess={() => loadData(selectedProperty.id)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
