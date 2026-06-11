import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, Search, Clock, CheckCircle2,
  RefreshCw, Home, User, DoorOpen, Layers,
  AlertCircle, ArrowRight, ChevronRight, Bell,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse } from '../../types/api.types';

const statusBadge: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING_HOST_REVIEW: { label: 'Chờ phê duyệt', cls: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400' },
  ACTIVE:              { label: 'Hoạt động',       cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  UNDER_RENOVATION:    { label: 'Đang cải tạo',    cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  DRAFT:               { label: 'Nháp',             cls: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  DISABLED:            { label: 'Vô hiệu',          cls: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
};

const PAGE_SIZE = 9;

// ─── Active property card ────────────────────────────────────────────────────
function ActiveCard({ p, onClick }: { p: PropertyResponse; onClick: () => void }) {
  const badge = statusBadge[p.status] ?? statusBadge.DRAFT;
  return (
    <div onClick={onClick}
      className="group flex flex-col rounded-2xl border-2 border-slate-200 bg-white transition-all cursor-pointer overflow-hidden hover:border-indigo-300 hover:shadow-lg">

      {/* Image */}
      {p.imageUrls?.length ? (
        <div className="relative h-40 overflow-hidden bg-slate-100">
          <img src={p.imageUrls[0]} alt={p.propertyName}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
          {p.imageUrls.length > 1 && (
            <span className="absolute bottom-2 right-2 text-xs font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full">
              +{p.imageUrls.length - 1}
            </span>
          )}
          <span className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      ) : (
        <div className="h-40 flex flex-col items-center justify-center bg-indigo-50 border-b border-indigo-100">
          <Building2 className="w-10 h-10 text-indigo-200" />
          <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 truncate group-hover:text-indigo-700 transition text-base">
            {p.propertyName}
          </h3>
          <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {p.fullAddress || p.shortAddress}
          </p>
          {p.zoneName && (
            <span className="inline-block mt-1 text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
              {p.zoneName}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-50 py-2.5">
            <div className="flex justify-center mb-0.5"><DoorOpen className="w-3.5 h-3.5 text-indigo-400" /></div>
            <p className="font-extrabold text-slate-800 text-sm">{p.totalRooms || 0}</p>
            <p className="text-slate-400 text-[10px]">Phòng</p>
          </div>
          <div className="rounded-xl bg-slate-50 py-2.5">
            <div className="flex justify-center mb-0.5"><Layers className="w-3.5 h-3.5 text-slate-400" /></div>
            <p className="font-extrabold text-slate-800 text-sm">{p.totalFloor ?? p.floorCount ?? '—'}</p>
            <p className="text-slate-400 text-[10px]">Tầng</p>
          </div>
          <div className="rounded-xl bg-slate-50 py-2.5">
            <div className="flex justify-center mb-0.5">
              <Home className={`w-3.5 h-3.5 ${p.wholeHouse ? 'text-emerald-400' : 'text-blue-400'}`} />
            </div>
            <p className="font-extrabold text-slate-800 text-[11px] leading-tight">
              {p.wholeHouse === null ? '—' : p.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
            </p>
            <p className="text-slate-400 text-[10px]">Loại hình</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
          <div className="flex items-center gap-1.5 text-xs min-w-0 flex-1">
            <User className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            {p.operationManagerName ? (
              <span className="font-semibold text-slate-600 truncate">{p.operationManagerName}</span>
            ) : (
              <span className="font-semibold text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Chưa có quản lý
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-indigo-600 shrink-0">
            Chi tiết <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Pending row item ────────────────────────────────────────────────────────
function PendingRow({ p, onClick }: { p: PropertyResponse; onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="group flex items-center gap-4 rounded-xl border border-amber-200 bg-white hover:border-amber-400 hover:shadow-sm transition cursor-pointer px-4 py-3">
      {/* Thumbnail */}
      <div className="h-12 w-16 rounded-lg overflow-hidden bg-amber-50 shrink-0 flex items-center justify-center">
        {p.imageUrls?.length ? (
          <img src={p.imageUrls[0]} alt={p.propertyName} className="h-full w-full object-cover" />
        ) : (
          <Building2 className="w-5 h-5 text-amber-300" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900 truncate text-sm group-hover:text-amber-700 transition">{p.propertyName}</p>
        <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" />{p.fullAddress || p.shortAddress}
        </p>
      </div>

      {/* Stats chips */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
          {p.totalRooms || 0} phòng
        </span>
        <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
          {p.totalFloor ?? p.floorCount ?? '—'} tầng
        </span>
      </div>

      <span className="flex items-center gap-1 text-xs font-bold text-amber-600 shrink-0">
        Phê duyệt <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export const PropertyList = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showPending, setShowPending] = useState(false);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setProperties(res.content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  const pending = useMemo(() => properties.filter(p => p.status === 'PENDING_HOST_REVIEW'), [properties]);
  const active  = useMemo(() => properties.filter(p => p.status !== 'PENDING_HOST_REVIEW'), [properties]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return active;
    return active.filter(p =>
      [p.propertyName, p.shortAddress, p.fullAddress, p.zoneName].some(v => v?.toLowerCase().includes(kw))
    );
  }, [active, search]);

  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const fetchedImagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const all = [...pending, ...paginated];
    const needImages = all.filter(p => !p.imageUrls?.length && !fetchedImagesRef.current.has(p.id));
    if (!needImages.length) return;
    needImages.forEach(p => fetchedImagesRef.current.add(p.id));
    Promise.allSettled(
      needImages.map(p =>
        propertyService.getPropertyById(p.id)
          .then(detail => {
            if (detail.imageUrls?.length)
              setProperties(prev => prev.map(prop => prop.id === p.id ? { ...prop, imageUrls: detail.imageUrls } : prop));
          }).catch(() => {})
      )
    );
  }, [paginated, pending]);

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Bất động sản</h1>
          <p className="text-sm text-slate-400 mt-1">{active.length} tòa nhà đang quản lý</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPending(v => !v)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition shadow-sm ${
              showPending
                ? 'bg-amber-500 border-amber-500 text-white'
                : pending.length > 0
                  ? 'bg-white border-amber-300 text-amber-700 hover:bg-amber-50'
                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
            }`}>
            <Bell className="w-4 h-4" />
            Chờ phê duyệt
            <span className={`text-xs font-black w-5 h-5 rounded-full flex items-center justify-center ${
              showPending ? 'bg-white/30 text-white' : pending.length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'
            }`}>{pending.length}</span>
          </button>
          <button onClick={fetchProperties}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm">
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>
        </div>
      </div>

      {/* ── Pending section (collapsible) ── */}
      {pending.length > 0 && showPending && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="divide-y divide-amber-100 px-3 py-2 space-y-1.5">
            {pending.map(p => (
              <PendingRow key={p.id} p={p} onClick={() => navigate(`/host/review/${p.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Active section ── */}
      <div className="space-y-4">
        {/* Search + count */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="Tìm theo tên hoặc địa chỉ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition"
            />
          </div>
          {search && (
            <span className="text-sm text-slate-400 font-medium">{filtered.length} kết quả</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 mb-4" />
            <p className="text-sm font-medium text-slate-400">Đang tải dữ liệu...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 rounded-2xl bg-slate-50 mb-4">
              <Home className="w-10 h-10 text-slate-200" />
            </div>
            <p className="text-slate-500 font-semibold">
              {search ? `Không tìm thấy kết quả cho "${search}"` : 'Chưa có tòa nhà nào đang quản lý.'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline">
                Xóa tìm kiếm
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {paginated.map(p => (
                <ActiveCard key={p.id} p={p} onClick={() => navigate(`/host/properties/${p.id}`)} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition">
                  ← Trước
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className={`w-8 h-8 rounded-xl text-sm font-bold transition ${
                      i === page ? 'bg-indigo-600 text-white shadow' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {i + 1}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition">
                  Sau →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
