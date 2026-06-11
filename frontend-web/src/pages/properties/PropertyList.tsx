import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, User, Home, Search,
  Clock, CheckCircle2, ChevronRight, RefreshCw,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse } from '../../types/api.types';

const statusBadge: Record<string, { label: string; cls: string }> = {
  PENDING_HOST_REVIEW: { label: 'Chờ phê duyệt', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE:              { label: 'Đang hoạt động', cls: 'bg-emerald-100 text-emerald-800' },
  UNDER_RENOVATION:    { label: 'Đang cải tạo',   cls: 'bg-blue-100 text-blue-800' },
  DRAFT:               { label: 'Nháp',            cls: 'bg-slate-100 text-slate-600' },
  DISABLED:            { label: 'Đã vô hiệu',      cls: 'bg-rose-100 text-rose-700' },
};

const PAGE_SIZE = 6;
type Tab = 'pending' | 'active';

export const PropertyList = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [page, setPage] = useState(0);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setProperties(res.content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  const pending = useMemo(() =>
    properties.filter(p => p.status === 'PENDING_HOST_REVIEW'), [properties]);

  const active = useMemo(() =>
    properties.filter(p => p.status !== 'PENDING_HOST_REVIEW'), [properties]);

  const filtered = useMemo(() => {
    const list = tab === 'pending' ? pending : active;
    const kw = search.trim().toLowerCase();
    if (!kw) return list;
    return list.filter(p =>
      [p.propertyName, p.shortAddress, p.fullAddress, p.zoneName]
        .some(v => v?.toLowerCase().includes(kw))
    );
  }, [tab, pending, active, search]);

  // Reset về trang 0 khi đổi tab hoặc search
  useEffect(() => { setPage(0); }, [tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Lazy-load images for visible cards (list endpoint may omit imageUrls)
  const fetchedImagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const needImages = paginated.filter(
      p => !p.imageUrls?.length && !fetchedImagesRef.current.has(p.id)
    );
    if (needImages.length === 0) return;
    needImages.forEach(p => fetchedImagesRef.current.add(p.id));
    Promise.allSettled(
      needImages.map(p =>
        propertyService.getPropertyById(p.id)
          .then(detail => {
            if (detail.imageUrls?.length) {
              setProperties(prev =>
                prev.map(prop => prop.id === p.id ? { ...prop, imageUrls: detail.imageUrls } : prop)
              );
            }
          })
          .catch(() => {})
      )
    );
  }, [paginated]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bất động sản</h1>
          <p className="text-sm text-slate-500 mt-1">
            {pending.length} chờ duyệt · {active.length} đang quản lý
          </p>
        </div>
        <button onClick={fetchProperties}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className="w-4 h-4" /> Làm mới
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        <button onClick={() => setTab('pending')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
            tab === 'pending' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <Clock className="w-4 h-4" />
          Chờ phê duyệt
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-black px-2 py-0.5">
              {pending.length}
            </span>
          )}
        </button>
        <button onClick={() => setTab('active')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
            tab === 'active' ? 'bg-white shadow text-emerald-700' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <CheckCircle2 className="w-4 h-4" />
          Đang quản lý
          {active.length > 0 && (
            <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-black px-2 py-0.5">
              {active.length}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          placeholder="Tìm theo tên hoặc địa chỉ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          <Home className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">
            {tab === 'pending'
              ? 'Chưa có tòa nhà nào chờ phê duyệt.'
              : 'Chưa có tòa nhà nào đang quản lý.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {paginated.map(p => {
            const badge = statusBadge[p.status] ?? statusBadge.DRAFT;
            const isPending = p.status === 'PENDING_HOST_REVIEW';
            return (
              <div key={p.id}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-primary-300 hover:shadow-md transition cursor-pointer overflow-hidden"
                onClick={() => navigate(isPending ? `/host/review/${p.id}` : `/host/properties/${p.id}`)}>

                {/* Thumbnail ảnh */}
                {p.imageUrls && p.imageUrls.length > 0 ? (
                  <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                    <img src={p.imageUrls[0]} alt={p.propertyName}
                      className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                    {p.imageUrls.length > 1 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/50 text-white text-xs font-semibold px-2 py-0.5">
                        +{p.imageUrls.length - 1}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="h-36 w-full bg-slate-50 flex items-center justify-center border-b border-slate-100">
                    <Building2 className="w-10 h-10 text-slate-200" />
                  </div>
                )}

                {/* Top */}
                <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`shrink-0 p-2.5 rounded-xl ${isPending ? 'bg-amber-50' : 'bg-primary-50'}`}>
                      <Building2 className={`w-5 h-5 ${isPending ? 'text-amber-600' : 'text-primary-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate group-hover:text-primary-600 transition">
                        {p.propertyName}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.fullAddress || p.shortAddress}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-400 transition" />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 p-5 text-center text-xs flex-1">
                  <div className="rounded-xl bg-slate-50 py-3">
                    <p className="font-black text-lg text-slate-800 leading-tight">{p.totalRooms || 0}</p>
                    <p className="text-slate-500 mt-0.5">Tổng phòng</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 py-3">
                    <p className="font-black text-lg text-slate-800 leading-tight">{p.floorCount || '—'}</p>
                    <p className="text-slate-500 mt-0.5">Số tầng</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 py-3">
                    <p className="font-black text-sm text-slate-800 leading-tight">
                      {p.wholeHouse === null ? '—' : p.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
                    </p>
                    <p className="text-slate-500 mt-0.5">Loại hình</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      {p.zoneName || 'Chưa rõ khu vực'}
                    </span>
                    {isPending ? (
                      <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Bấm để phê duyệt
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đang hoạt động
                      </span>
                    )}
                  </div>
                  {!isPending && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {p.operationManagerName ? (
                        <span className="font-semibold text-slate-700">{p.operationManagerName}</span>
                      ) : (
                        <span className="font-semibold text-rose-500">Chưa có quản lý</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ← Trước
          </button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-8 h-8 rounded-lg text-sm font-bold transition ${
                i === page
                  ? 'bg-primary-600 text-white shadow'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  );
};
