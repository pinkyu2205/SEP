import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, Search,
  RefreshCw, Home, User, DoorOpen, Layers,
  AlertCircle, ArrowRight, ChevronRight, Bell,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import type { PropertyResponse } from '../../types/api.types';

const statusBadge: Record<string, { label: string; cls: string; dot: string }> = {
  PENDING_HOST_REVIEW:      { label: 'Chờ phê duyệt',    cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  PENDING_OPERATION_MANAGER:{ label: 'Chờ gán quản lý',  cls: 'bg-violet-100 text-violet-700',   dot: 'bg-violet-500' },
  ACTIVE:                   { label: 'Hoạt động',        cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  RENTED:                   { label: 'Đã cho thuê',      cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  UNDER_RENOVATION:         { label: 'Đang cải tạo',     cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  RENOVATION_COMPLETED:     { label: 'Đã cải tạo xong',  cls: 'bg-teal-100 text-teal-700',       dot: 'bg-teal-500' },
  DRAFT:                    { label: 'Nháp',              cls: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  DISABLED:                 { label: 'Vô hiệu',           cls: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
};

/**
 * Nhà đã được Host duyệt thành công (chỉ những căn này mới hiện ở màn Bất động sản của Host).
 * - ACTIVE / PENDING_OPERATION_MANAGER: chắc chắn đã qua host-confirm.
 * - UNDER_RENOVATION / DISABLED: chỉ tính nếu đã từng được duyệt (đã có giá thuê hoặc đã gán quản lý)
 *   → loại các căn admin đang onboarding (cải tạo lần đầu / nháp bị vô hiệu) chưa gửi Host.
 * Ẩn hẳn: DRAFT, RENOVATION_COMPLETED (admin chưa "Định giá & gửi Host"), PENDING_HOST_REVIEW (đang chờ duyệt).
 */
export const isHostApproved = (p: PropertyResponse): boolean => {
  if (p.status === 'ACTIVE' || p.status === 'RENTED' || p.status === 'PENDING_OPERATION_MANAGER') return true;
  if (p.status === 'UNDER_RENOVATION' || p.status === 'DISABLED') {
    return (p.price ?? 0) > 0 || !!p.operationManagerId;
  }
  return false;
};

// Tile KPI tổng quan theo loại hình
function KpiTile({ icon: Icon, label, value, color, bg }: { icon: typeof Building2; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className={`text-xl font-extrabold leading-tight ${color}`}>{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

const PAGE_SIZE = 6;

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
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {p.wholeHouse !== null && (
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                p.wholeHouse ? 'text-emerald-700 bg-emerald-50' : 'text-blue-700 bg-blue-50'
              }`}>
                <Home className="w-3 h-3" />
                {p.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
              </span>
            )}
            {p.zoneName && (
              <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                {p.zoneName}
              </span>
            )}
          </div>
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
            ) : p.operationManagerId ? (
              <span className="font-semibold text-slate-500 truncate">Đã gán quản lý</span>
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
// 1 dòng trong dropdown chờ phê duyệt (kiểu list thông báo, gọn)
function PendingRow({ p, onClick }: { p: PropertyResponse; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/70 transition">
      <div className="h-10 w-12 rounded-lg overflow-hidden bg-amber-50 shrink-0 flex items-center justify-center">
        {p.imageUrls?.length ? (
          <img src={p.imageUrls[0]} alt={p.propertyName} className="h-full w-full object-cover" />
        ) : (
          <Building2 className="w-4 h-4 text-amber-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 truncate text-sm group-hover:text-amber-700 transition">{p.propertyName}</p>
        <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" />{p.fullAddress || p.shortAddress}
        </p>
      </div>
      <span className="flex items-center gap-1 text-xs font-bold text-amber-600 shrink-0">
        Phê duyệt <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </button>
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
  const [typeFilter, setTypeFilter] = useState<'all' | 'whole' | 'room'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const [res, mgrs] = await Promise.all([
        propertyService.getProperties(0, 100),
        propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      ]);
      // Patch operationManagerName nếu BE chưa trả (mục 6 NOTE-CHO-TEAM-BE.md)
      const mgrsMap = new Map(mgrs.map(m => [m.id, m.fullName || m.username]));
      const content = res.content.map(p =>
        p.operationManagerId && !p.operationManagerName
          ? { ...p, operationManagerName: mgrsMap.get(p.operationManagerId) }
          : p
      );
      setProperties(content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  const pending = useMemo(() => properties.filter(p => p.status === 'PENDING_HOST_REVIEW'), [properties]);
  // Chỉ hiện nhà Host đã duyệt thành công — xem isHostApproved().
  const active  = useMemo(() => properties.filter(isHostApproved), [properties]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return active.filter(p => {
      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'whole' && p.wholeHouse === true) ||
        (typeFilter === 'room' && p.wholeHouse === false);
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchSearch = !kw ||
        [p.propertyName, p.shortAddress, p.fullAddress, p.zoneName].some(v => v?.toLowerCase().includes(kw));
      return matchType && matchStatus && matchSearch;
    });
  }, [active, typeFilter, statusFilter, search]);

  useEffect(() => { setPage(0); }, [search, typeFilter, statusFilter]);

  // Thống kê theo loại hình
  const wholeCount = useMemo(() => active.filter(p => p.wholeHouse === true).length, [active]);
  const roomCount  = useMemo(() => active.filter(p => p.wholeHouse === false).length, [active]);
  const noMgrCount = useMemo(() => active.filter(p => !p.operationManagerId).length, [active]);
  const TYPE_TABS = [
    { value: 'all' as const,   label: 'Tất cả',         count: active.length },
    { value: 'whole' as const, label: 'Nhà nguyên căn', count: wholeCount },
    { value: 'room' as const,  label: 'Nhà chia phòng', count: roomCount },
  ];
  const isFiltering = !!search || typeFilter !== 'all' || statusFilter !== 'all';
  const resetFilters = () => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); };

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
          <div className="relative">
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

            {showPending && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowPending(false)} />
                <div className="absolute right-0 top-full mt-2 w-[400px] max-w-[88vw] rounded-2xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-800">Hồ sơ chờ phê duyệt</p>
                    <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{pending.length}</span>
                  </div>
                  {pending.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400 font-medium">Không có hồ sơ nào chờ phê duyệt.</p>
                    </div>
                  ) : (
                    <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                      {pending.map(p => (
                        <PendingRow key={p.id} p={p} onClick={() => { setShowPending(false); navigate(`/host/review/${p.id}`); }} />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={fetchProperties}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm">
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>
        </div>
      </div>

      {/* KPI tổng quan theo loại hình */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Building2} label="Tổng tòa nhà"     value={active.length} color="text-indigo-600"  bg="bg-indigo-50" />
        <KpiTile icon={Home}      label="Nhà nguyên căn"   value={wholeCount}    color="text-emerald-600" bg="bg-emerald-50" />
        <KpiTile icon={DoorOpen}  label="Nhà chia phòng"   value={roomCount}     color="text-blue-600"    bg="bg-blue-50" />
        <KpiTile icon={AlertCircle} label="Chưa có quản lý" value={noMgrCount}   color="text-rose-600"    bg="bg-rose-50" />
      </div>


      {/* ── Active section ── */}
      <div className="space-y-4">
        {/* Bộ điều khiển: tab loại hình · lọc trạng thái · tìm kiếm */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-full overflow-x-auto lg:w-fit">
            {TYPE_TABS.map(tab => (
              <button key={tab.value} onClick={() => setTypeFilter(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  typeFilter === tab.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  typeFilter === tab.value ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="all">Mọi trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="RENTED">Đã cho thuê</option>
              <option value="PENDING_OPERATION_MANAGER">Chờ gán quản lý</option>
              <option value="UNDER_RENOVATION">Đang cải tạo</option>
              <option value="DISABLED">Vô hiệu</option>
            </select>
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                placeholder="Tìm theo tên hoặc địa chỉ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition"
              />
            </div>
          </div>
        </div>
        {isFiltering && (
          <p className="text-sm text-slate-400 font-medium">{filtered.length} kết quả phù hợp</p>
        )}

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
              {isFiltering ? 'Không có tòa nhà phù hợp bộ lọc.' : 'Chưa có tòa nhà nào đang quản lý.'}
            </p>
            {isFiltering && (
              <button onClick={resetFilters} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline">
                Bỏ bộ lọc
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
