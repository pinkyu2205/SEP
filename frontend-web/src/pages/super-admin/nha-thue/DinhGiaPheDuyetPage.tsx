import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BadgeDollarSign, Building2, CheckCircle2,
  Clock, Hammer, MapPin, Search, TrendingUp,
} from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import type { PropertyResponse } from '../../../types/api.types';
import { StepSubmitToHost } from '../properties/wizard/StepSubmitToHost';
import { KpiCard } from '../shared';

const statusBadge: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Nháp', cls: 'bg-slate-100 text-slate-700' },
  UNDER_RENOVATION: { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' },
  PENDING_HOST_REVIEW: { label: 'Chờ Host duyệt', cls: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: 'Đang kinh doanh', cls: 'bg-emerald-100 text-emerald-800' },
  DISABLED: { label: 'Đã vô hiệu', cls: 'bg-rose-100 text-rose-800' },
};

export const DinhGiaPheDuyetPage = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<PropertyResponse | null>(null);
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);

  useEffect(() => {
    if (id && buildings.length > 0) {
      const found = buildings.find(p => p.id === Number(id));
      if (found) setSelected(found);
      else propertyService.getPropertyById(Number(id)).then(setSelected).catch(console.error);
    }
  }, [id, buildings]);

  const kpi = useMemo(() => buildings.reduce(
    (acc, b) => ({
      total: acc.total + 1,
      ready: acc.ready + (b.status === 'DRAFT' && b.wholeHouse !== null ? 1 : 0),
      pending: acc.pending + (b.status === 'PENDING_HOST_REVIEW' ? 1 : 0),
      active: acc.active + (b.status === 'ACTIVE' ? 1 : 0),
    }),
    { total: 0, ready: 0, pending: 0, active: 0 }
  ), [buildings]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return buildings.filter(b => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchStatus && matchSearch;
    });
  }, [buildings, statusFilter, search]);

  const backToList = () => {
    setSelected(null);
    if (id) navigate('/admin/buildings/pricing-approval', { replace: true });
    fetchList();
  };

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết định giá
  // ═══════════════════════════════════════════════════════════════════
  if (selected) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">Định giá & Phê duyệt</h1>
          <p className="text-slate-500 mt-1 font-medium">
            {selected.propertyName} · {selected.fullAddress || selected.shortAddress}
          </p>
        </div>
        <StepSubmitToHost
          property={selected}
          onBack={backToList}
          onSuccess={backToList}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Định giá & Phê duyệt</h1>
        <p className="text-slate-500 mt-1 text-sm font-medium">
          Tính toán giá thuê, nhập tỷ lệ dự phòng và gửi Host phê duyệt
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng tòa nhà" value={String(kpi.total)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Sẵn sàng định giá" value={String(kpi.ready)} icon={BadgeDollarSign} color="bg-indigo-50 text-indigo-700" />
        <KpiCard title="Chờ Host duyệt" value={String(kpi.pending)} icon={Clock} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Đang kinh doanh" value={String(kpi.active)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" placeholder="Tìm theo tên, địa chỉ..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp (DRAFT)</option>
          <option value="UNDER_RENOVATION">Đang cải tạo</option>
          <option value="PENDING_HOST_REVIEW">Chờ Host duyệt</option>
          <option value="ACTIVE">Đang kinh doanh</option>
          <option value="DISABLED">Đã vô hiệu</option>
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-semibold">Không tìm thấy tòa nhà phù hợp.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {filtered.map(b => {
            const badge = statusBadge[b.status] ?? statusBadge.DRAFT;
            const isReady = b.status === 'DRAFT' && b.wholeHouse !== null;
            return (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 leading-tight">{b.propertyName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{b.fullAddress || b.shortAddress}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {b.zoneName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{b.zoneName}</span>
                  )}
                  <span className="font-bold text-emerald-600">
                    {b.wholeHouse === null ? 'Chưa chọn loại hình' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                  {b.areaSize ? <span className="text-slate-500">{b.areaSize} m²</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-blue-50 py-2 text-blue-700">
                    <p className="font-black text-base leading-tight">{b.totalRooms || 0}</p>
                    <p className="mt-0.5">Tổng phòng</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-2 text-emerald-700">
                    <p className="font-black text-sm leading-tight">
                      {b.price ? Number(b.price).toLocaleString('vi-VN') : '—'}
                    </p>
                    <p className="mt-0.5">Giá thuê</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 py-2 text-indigo-700">
                    <p className="font-black text-base leading-tight">{b.totalFloor ?? b.floorCount ?? '—'}</p>
                    <p className="mt-0.5">Số tầng</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  {isReady && (
                    <button onClick={() => setSelected(b)}
                      className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <BadgeDollarSign className="w-4 h-4" /> Định giá ngay →
                    </button>
                  )}
                  {b.status === 'DRAFT' && b.wholeHouse === null && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-slate-500 bg-slate-100 rounded-xl flex items-center justify-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> Cần cấu hình trước ở Module 2
                    </div>
                  )}
                  {b.status === 'UNDER_RENOVATION' && (
                    <button onClick={() => setSelected(b)}
                      className="w-full py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <Hammer className="w-4 h-4" /> Xem định giá & hoàn tất
                    </button>
                  )}
                  {b.status === 'PENDING_HOST_REVIEW' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Đang chờ Host phê duyệt
                    </div>
                  )}
                  {b.status === 'ACTIVE' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đang kinh doanh
                    </div>
                  )}
                  {b.status === 'DISABLED' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-slate-500 bg-slate-100 rounded-xl">
                      Đã vô hiệu hóa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
