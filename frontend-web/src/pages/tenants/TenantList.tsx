import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Building2, UserPlus, User, Loader2, Home, DoorOpen, LayoutGrid } from 'lucide-react';
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

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const fmtMoney = (n?: number) => (n != null ? `${n.toLocaleString('vi-VN')}đ` : '—');

// Khớp HĐ với BĐS: ưu tiên propertyId (BE đã trả), fallback theo tên.
const matchProperty = (c: HostContractDto, p: PropertyResponse) =>
  c.propertyId != null ? c.propertyId === p.id : c.propertyName === p.propertyName;

export const TenantList = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null); // null = Tất cả
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [propSearch, setPropSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const selectedProperty = properties.find((p) => p.id === selectedId) || null;

  // Load danh sách property 1 lần
  useEffect(() => {
    propertyService
      .getProperties(0, 200)
      .then((page) => setProperties(page.content))
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

  useEffect(() => { loadContracts(); }, [loadContracts]);

  // Phòng của BĐS đang chọn (cho modal "Thêm khách thuê")
  useEffect(() => {
    if (selectedId == null) { setRooms([]); return; }
    propertyService.getRooms(selectedId).then(setRooms).catch(() => setRooms([]));
  }, [selectedId]);

  const availableRooms = rooms.filter((r) => r.status === 'AVAILABLE');

  // Số HĐ theo từng BĐS (đếm 1 lần, hiển thị badge ở danh sách nhà bên trái)
  const countByProp = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of properties) m.set(p.id, contracts.filter((c) => matchProperty(c, p)).length);
    return m;
  }, [properties, contracts]);

  // Lọc danh sách nhà bên trái theo ô tìm kiếm
  const filteredProps = useMemo(() => {
    const kw = propSearch.trim().toLowerCase();
    if (!kw) return properties;
    return properties.filter((p) => p.propertyName.toLowerCase().includes(kw));
  }, [properties, propSearch]);

  // HĐ thuộc BĐS đang chọn (hoặc tất cả)
  const propContracts = selectedProperty
    ? contracts.filter((c) => matchProperty(c, selectedProperty))
    : contracts;

  const filtered = propContracts.filter(
    (c) =>
      c.lesseeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.roomCode ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.tenantPhone ?? '').includes(searchTerm) ||
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
            {selectedProperty ? selectedProperty.propertyName : 'Tất cả bất động sản'}
            {' · '}{propContracts.length} hợp đồng · {activeCount} đang hiệu lực
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
          disabled={!selectedProperty}
          title={selectedProperty ? '' : 'Chọn một bất động sản để thêm khách thuê'}
          onClick={() => setShowModal(true)}
        >
          <UserPlus className="w-4 h-4" /> Thêm khách thuê
        </button>
      </div>

      {/* 2 cột: danh sách nhà (trái) + bảng hợp đồng (phải) */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ── Cột trái: chọn bất động sản ── */}
        <div className="card p-3 lg:sticky lg:top-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm bất động sản..."
              value={propSearch}
              onChange={(e) => setPropSearch(e.target.value)}
              className="input-field pl-9 py-2 text-sm"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-1">
            {/* Tất cả */}
            <button
              onClick={() => setSelectedId(null)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${
                selectedId == null ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedId == null ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                <LayoutGrid className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${selectedId == null ? 'text-indigo-700' : 'text-slate-700'}`}>Tất cả bất động sản</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{contracts.length}</span>
            </button>

            {filteredProps.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-6">Không tìm thấy bất động sản.</p>
            ) : filteredProps.map((p) => {
              const isActive = p.id === selectedId;
              const cnt = countByProp.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${
                    isActive ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    {p.wholeHouse ? <Home className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>{p.propertyName}</p>
                    <p className="text-[11px] text-slate-400">{p.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}</p>
                  </div>
                  <span className={`text-xs font-bold ${cnt > 0 ? 'text-slate-500' : 'text-slate-300'}`}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cột phải: hợp đồng ── */}
        <div className="space-y-4 min-w-0">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, phòng, SĐT, mã HĐ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 bg-white"
            />
          </div>

          <div className="card">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Đang tải...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">
                  {searchTerm ? `Không tìm thấy kết quả cho "${searchTerm}"` : 'Chưa có khách thuê nào.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 text-xs">
                    <tr>
                      <th className="px-4 py-3">Mã HĐ</th>
                      <th className="px-4 py-3">Khách thuê</th>
                      <th className="px-4 py-3">Phòng</th>
                      <th className="px-4 py-3">Giá thuê</th>
                      <th className="px-4 py-3">Tiền cọc</th>
                      <th className="px-4 py-3">Kỳ hạn</th>
                      <th className="px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((c) => {
                      const st = statusMap[c.status];
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.code}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{c.lesseeName}</p>
                            {c.tenantPhone && <p className="text-xs text-slate-400 mt-0.5">{c.tenantPhone}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-slate-600">
                              <DoorOpen className="w-3.5 h-3.5 text-slate-400" />
                              {c.roomCode ?? 'Nguyên căn'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-primary-600 font-medium">{fmtMoney(c.rentAmount)}</td>
                          <td className="px-4 py-3 text-slate-600">{fmtMoney(c.deposit)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : 'Không thời hạn'}
                          </td>
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
        </div>
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
