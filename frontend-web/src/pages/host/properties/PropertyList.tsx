import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Building2, DoorOpen, Home, RefreshCw, Wallet,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import {
  usePropertyListFilters, isHostApproved, formatVnd,
} from './propertyListState';
import {
  StatTile, PendingApprovalPanel, FilterToolbar, ResultBar,
  PropertyCard, PropertyTable, ListPagination,
} from './PropertyListParts';

export const PropertyList = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchProperties = async () => {
    setLoading(true);
    setLoadError(false);
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
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  // Hồ sơ chờ duyệt: mới nhận được lên đầu. BE không trả createdAt nên dùng id
  // (auto-increment) — id lớn hơn = admin gửi sang sau.
  const pending = useMemo(
    () => properties.filter(p => p.status === 'PENDING_HOST_REVIEW').sort((a, b) => b.id - a.id),
    [properties],
  );
  // Chỉ hiện nhà Host đã duyệt thành công — xem isHostApproved().
  const active = useMemo(() => properties.filter(isHostApproved), [properties]);

  const f = usePropertyListFilters(active);

  // Số liệu tổng quan
  const kpi = useMemo(() => active.reduce(
    (acc, p) => ({
      total: acc.total + 1,
      whole: acc.whole + (p.wholeHouse === true ? 1 : 0),
      room: acc.room + (p.wholeHouse === false ? 1 : 0),
      noMgr: acc.noMgr + (p.operationManagerId ? 0 : 1),
      rooms: acc.rooms + (p.totalRooms || 0),
      revenue: acc.revenue + (p.price ?? 0),
    }),
    { total: 0, whole: 0, room: 0, noMgr: 0, rooms: 0, revenue: 0 }
  ), [active]);

  // BE list không trả imageUrls → lấy thêm ảnh cho các căn đang hiển thị.
  const fetchedImagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const all = [...pending, ...f.paged];
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
  }, [f.paged, pending]);

  return (
    <div className="space-y-5 pb-6">
      {/* ── Tiêu đề ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-500">Vận hành</p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight text-slate-900">Bất động sản</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {kpi.total} tòa nhà đang quản lý · {kpi.rooms} phòng
              {kpi.revenue > 0 && <> · tổng giá niêm yết <b className="text-slate-700">{formatVnd(kpi.revenue)}</b>/tháng</>}
            </p>
          </div>
        </div>
        <button onClick={fetchProperties} disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* ── Hồ sơ chờ phê duyệt ── */}
      <PendingApprovalPanel items={pending} onOpen={p => navigate(`/host/review/${p.id}`)} />

      {/* ── Số liệu: bấm để lọc nhanh ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Building2} label="Tổng tòa nhà" value={kpi.total} tone="indigo"
          helper="đã được bạn duyệt giá"
          onClick={() => { f.reset(); }} active={f.activeCount === 0} />
        <StatTile icon={Home} label="Nhà nguyên căn" value={kpi.whole} tone="emerald"
          helper="trên tổng số nhà" progress={kpi.total ? kpi.whole / kpi.total : 0}
          onClick={() => f.setType(f.type === 'whole' ? 'all' : 'whole')} active={f.type === 'whole'} />
        <StatTile icon={DoorOpen} label="Nhà chia phòng" value={kpi.room} tone="blue"
          helper="trên tổng số nhà" progress={kpi.total ? kpi.room / kpi.total : 0}
          onClick={() => f.setType(f.type === 'room' ? 'all' : 'room')} active={f.type === 'room'} />
        <StatTile icon={AlertCircle} label="Chưa có quản lý" value={kpi.noMgr} tone="rose"
          helper="cần gán quản lý vận hành" progress={kpi.total ? kpi.noMgr / kpi.total : 0}
          onClick={() => f.setManager(f.manager === 'unassigned' ? 'all' : 'unassigned')}
          active={f.manager === 'unassigned'} />
      </div>

      {/* ── Tìm kiếm & bộ lọc ── */}
      <FilterToolbar f={f} />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm font-medium text-slate-400">Đang tải dữ liệu...</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-white py-20 text-center">
          <div className="mb-4 rounded-2xl bg-rose-50 p-5">
            <AlertCircle className="h-10 w-10 text-rose-300" />
          </div>
          <p className="font-semibold text-rose-500">Không tải được danh sách tòa nhà. Máy chủ có thể đang khởi động lại.</p>
          <button onClick={fetchProperties}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700">
            Thử lại
          </button>
        </div>
      ) : f.filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <div className="mb-4 rounded-2xl bg-slate-50 p-5">
            {f.activeCount > 0
              ? <Wallet className="h-10 w-10 text-slate-200" />
              : <Home className="h-10 w-10 text-slate-200" />}
          </div>
          <p className="font-semibold text-slate-500">
            {f.activeCount > 0 ? 'Không có tòa nhà nào khớp bộ lọc.' : 'Chưa có tòa nhà nào đang quản lý.'}
          </p>
          {f.activeCount > 0 && (
            <button onClick={f.reset}
              className="mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <ResultBar f={f} />

          {f.view === 'table' ? (
            <PropertyTable rows={f.paged} onRowClick={p => navigate(`/host/properties/${p.id}`)} />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {f.paged.map(p => (
                <PropertyCard key={p.id} p={p} onClick={() => navigate(`/host/properties/${p.id}`)} />
              ))}
            </div>
          )}

          <ListPagination page={f.page} totalPages={f.totalPages} onChange={f.setPage} />
        </>
      )}
    </div>
  );
};
