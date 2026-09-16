import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Search, Wrench, X, Download, ChevronLeft, ChevronRight, RefreshCw,
  Clock, User, MapPin, Wallet, History, AlertTriangle, Gavel, PackageSearch,
  Hammer, CheckCircle2, Inbox, Phone, ArrowDownUp, ClipboardList, Link2,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { maintenanceService } from '@/services/maintenance.service';
import { useMaintenanceRealtime } from '@/hooks/useMaintenanceRealtime';
import { serverNow } from '@/utils/serverTime';
import {
  maintenanceReqStatusMap, maintenanceReqPriorityMap, maintenanceCategoryMap, maintenanceBillingHintMap,
} from '@/utils';
import type { MaintenanceRequestResponse, MaintenancePhotoHistoryEntry } from '@/types/api.types';
import { PageHero, StatCard, RealtimeBadge, Pagination, formatVnd } from './shared';

// ══════════════════════════════════════════════════════════════════════════════
// Bảo trì & thiết bị (Admin) — redesign 16/09/2026.
//
// Bản cũ đặt bảng trong `grid xl:grid-cols-2` nhưng chỉ có MỘT thẻ con, nên bảng
// bị ép vào nửa trái màn hình: cột "Trạng thái" — thứ admin nhìn đầu tiên — nằm
// ngoài vùng thấy được, phải cuộn ngang mới đọc nổi. Nửa phải bỏ trống.
//
// Ba thay đổi chính:
//  1. Bảng chiếm trọn bề ngang; dưới md đổi sang danh sách thẻ (bảng 7 cột không
//     đọc được trên điện thoại).
//  2. Gom việc theo NHÓM VIỆC chứ không theo enum: "Cần xử lý / Đang sửa / Lỗi do
//     khách / Đã xong". Admin hỏi "còn việc gì phải làm", không hỏi "phiếu nào
//     đang ở trạng thái OUTSTANDING_DAMAGE".
//  3. Sắp xếp mặc định = ưu tiên xử lý (phiếu chưa xong, khẩn trước, chờ lâu
//     trước) thay vì mới nhất trước — phiếu tồn đọng lâu nhất mới là phiếu dễ bị
//     bỏ quên nhất.
//
// Trang vẫn CHỈ GIÁM SÁT: mọi thao tác xử lý nằm ở app quản lý; việc phân xử lỗi
// do khách ở /admin/maintenance/fault-review (có liên kết sẵn ở đầu trang).
// ══════════════════════════════════════════════════════════════════════════════

const norm = (s?: string) => (s ?? '').toLowerCase();

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "3 ngày trước" — cột thời gian trong bảng cần đọc lướt, không cần giờ/phút. */
const fmtAgo = (iso?: string) => {
  if (!iso) return '—';
  const ms = serverNow().getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

/** Giờ SERVER — chỉ là gợi ý mức độ khẩn, lệch vài phút không sao. */
const waitingDays = (iso?: string): number | null => {
  if (!iso) return null;
  const ms = serverNow().getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

/** Phiếu còn phải theo dõi (chưa đóng, chưa huỷ). */
const isOpenWork = (r: MaintenanceRequestResponse) => r.status !== 'CLOSED' && r.status !== 'CANCELLED';

/** Tồn đọng: phiếu chờ kiểm tra từ 3 ngày trở lên — mốc cảnh báo đỏ của trang. */
const STALE_DAYS = 3;
const isStale = (r: MaintenanceRequestResponse) =>
  r.status === 'OPEN' && (waitingDays(r.createdAt) ?? 0) >= STALE_DAYS;

/**
 * Nhóm việc. `statuses` rỗng = tất cả. Thứ tự tab theo thứ tự việc phải làm,
 * không theo alphabet.
 */
const BUCKETS = [
  { key: 'need', label: 'Cần xử lý', statuses: ['OPEN'] },
  { key: 'doing', label: 'Đang sửa', statuses: ['IN_REPAIR'] },
  { key: 'tenant', label: 'Lỗi do khách', statuses: ['TENANT_FAULT', 'PENDING_TENANT_REPAIR', 'OUTSTANDING_DAMAGE'] },
  { key: 'done', label: 'Đã xong', statuses: ['CLOSED', 'CANCELLED'] },
  { key: 'all', label: 'Tất cả', statuses: [] },
] as const;

type BucketKey = typeof BUCKETS[number]['key'];

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const SORTS = [
  { key: 'urgent', label: 'Ưu tiên xử lý' },
  { key: 'newest', label: 'Mới nhất' },
  { key: 'cost', label: 'Chi phí cao nhất' },
] as const;
type SortKey = typeof SORTS[number]['key'];

/** Mỗi lần gọi BE lấy bấy nhiêu phiếu; còn nữa thì có nút "Tải thêm". */
const FETCH_SIZE = 200;
/** Số dòng mỗi trang trong bảng. */
const ROWS_PER_PAGE = 12;

/** Nhóm ảnh theo vòng đời — dùng chung cho photoHistory (đủ mọi vòng) và fallback
 * snapshot vòng hiện tại khi phiếu cũ chưa có photoHistory. */
const PHOTO_GROUPS: { type: MaintenancePhotoHistoryEntry['type']; label: string }[] = [
  { type: 'BEFORE', label: 'Ảnh hiện trạng' },
  { type: 'FAULT_EVIDENCE', label: 'Bằng chứng lỗi do khách' },
  { type: 'SELF_REPAIR', label: 'Khách tự sửa' },
  { type: 'AFTER', label: 'Sau sửa chữa' },
  { type: 'INVOICE', label: 'Hoá đơn' },
];

// ─── Mảnh dùng lại trong bảng & thẻ ─────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const s = maintenanceReqStatusMap[status] ?? maintenanceReqStatusMap.OPEN;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
};

const PriorityBadge = ({ priority }: { priority?: string | null }) => {
  const p = priority ? maintenanceReqPriorityMap[priority] : null;
  if (!p) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${p.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label}
    </span>
  );
};

/** Nhãn "chờ N ngày" — chỉ hiện với phiếu chưa ai đụng tới (OPEN). */
const WaitBadge = ({ request }: { request: MaintenanceRequestResponse }) => {
  if (request.status !== 'OPEN') return null;
  const days = waitingDays(request.createdAt);
  if (days === null || days < 1) return null;
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
      days >= STALE_DAYS ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
      Chờ {days} ngày
    </span>
  );
};

export const MaintenanceEquipmentMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<MaintenanceRequestResponse[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [nextPage, setNextPage] = useState(1);

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<BucketKey>('need');
  const [statusFilter, setStatusFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('urgent');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MaintenanceRequestResponse | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return maintenanceService.getRequests({}, 0, FETCH_SIZE)
      .then(res => {
        setRequests(res.content ?? []);
        setServerTotal(res.totalElements ?? (res.content?.length ?? 0));
        setNextPage(1);
      })
      .catch(() => setLoadError('Không tải được danh sách — kiểm tra kết nối máy chủ.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: BE ship 03/09/2026 (docs/maintenance-realtime-socket-spec.md bên repo BE).
  const { connected: liveOn } = useMaintenanceRealtime({ onRefresh: load });

  /** Hệ thống nhiều hơn FETCH_SIZE phiếu thì tải tiếp — trước đây cắt im lặng ở 200. */
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await maintenanceService.getRequests({}, nextPage, FETCH_SIZE);
      setRequests(prev => [...prev, ...(res.content ?? [])]);
      setNextPage(p => p + 1);
    } catch {
      setLoadError('Không tải thêm được — thử lại sau.');
    } finally {
      setLoadingMore(false);
    }
  };

  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    requests.forEach(r => { if (r.propertyName) set.add(r.propertyName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [requests]);

  const kpi = useMemo(() => {
    const open = requests.filter(r => r.status === 'OPEN');
    const tenantFault = requests.filter(r =>
      ['TENANT_FAULT', 'PENDING_TENANT_REPAIR', 'OUTSTANDING_DAMAGE'].includes(r.status));
    const closed = requests.filter(r => r.status === 'CLOSED');
    return {
      total: requests.length,
      open: open.length,
      stale: open.filter(isStale).length,
      inRepair: requests.filter(r => r.status === 'IN_REPAIR').length,
      tenantFault: tenantFault.length,
      pendingReview: tenantFault.filter(r => r.status === 'TENANT_FAULT' && !r.adminReviewedAt).length,
      closed: closed.length,
      cost: closed.reduce((sum, r) => sum + (r.invoiceAmount ?? 0), 0),
    };
  }, [requests]);

  /** Số phiếu từng nhóm — hiện ngay trên tab để biết chỗ nào đang ùn. */
  const bucketCounts = useMemo(() => {
    const c = {} as Record<BucketKey, number>;
    BUCKETS.forEach(b => {
      c[b.key] = b.statuses.length === 0
        ? requests.length
        : requests.filter(r => (b.statuses as readonly string[]).includes(r.status)).length;
    });
    return c;
  }, [requests]);

  const matchesSearch = useCallback((r: MaintenanceRequestResponse) => {
    if (!search.trim()) return true;
    const kw = norm(search);
    return norm(r.requestCode).includes(kw)
      || norm(r.tenantName).includes(kw)
      || norm(r.tenantPhone).includes(kw)
      || norm(r.propertyName).includes(kw)
      || norm(r.roomName).includes(kw)
      || norm(r.equipmentName).includes(kw)
      || norm(r.description).includes(kw)
      || norm(r.assignedManagerName).includes(kw);
  }, [search]);

  const activeBucket = BUCKETS.find(b => b.key === bucket)!;

  /** Chip trạng thái chỉ hiện những trạng thái CÓ TRONG nhóm đang mở. */
  const statusChips = useMemo(() => {
    const inBucket = activeBucket.statuses.length === 0
      ? Object.keys(maintenanceReqStatusMap)
      : [...activeBucket.statuses];
    const counts: Record<string, number> = {};
    requests.forEach(r => {
      if (inBucket.includes(r.status)) counts[r.status] = (counts[r.status] ?? 0) + 1;
    });
    return inBucket.filter(st => (counts[st] ?? 0) > 0).map(st => ({ status: st, count: counts[st] }));
  }, [activeBucket, requests]);

  const filtered = useMemo(() => {
    const rows = requests
      .filter(r => activeBucket.statuses.length === 0 || (activeBucket.statuses as readonly string[]).includes(r.status))
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => propertyFilter === 'all' || r.propertyName === propertyFilter)
      .filter(matchesSearch);

    const byNewest = (a: MaintenanceRequestResponse, b: MaintenanceRequestResponse) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

    if (sort === 'newest') return rows.sort(byNewest);
    if (sort === 'cost') return rows.sort((a, b) => (b.invoiceAmount ?? 0) - (a.invoiceAmount ?? 0));

    // "Ưu tiên xử lý": việc chưa xong lên trước, rồi tới mức ưu tiên, rồi phiếu chờ lâu nhất.
    return rows.sort((a, b) => {
      const openDiff = Number(isOpenWork(b)) - Number(isOpenWork(a));
      if (openDiff !== 0) return openDiff;
      const pa = PRIORITY_RANK[a.priority ?? ''] ?? 9;
      const pb = PRIORITY_RANK[b.priority ?? ''] ?? 9;
      if (pa !== pb) return pa - pb;
      if (isOpenWork(a)) return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      return byNewest(a, b);
    });
  }, [requests, activeBucket, statusFilter, propertyFilter, matchesSearch, sort]);

  // Đổi bộ lọc thì về trang 1 — nếu không, đang ở trang 5 mà lọc còn 3 dòng sẽ ra bảng trắng.
  useEffect(() => { setPage(1); }, [bucket, statusFilter, propertyFilter, search, sort]);
  useEffect(() => { setStatusFilter('all'); }, [bucket]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const pageRows = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const hasActiveFilter = search.trim() !== '' || statusFilter !== 'all' || propertyFilter !== 'all' || bucket !== 'all';
  const clearFilters = () => {
    setSearch(''); setStatusFilter('all'); setPropertyFilter('all'); setBucket('all');
  };

  // Xuất đúng danh sách ĐANG HIỂN THỊ (đã áp tìm kiếm/lọc) — WYSIWYG, cùng quy ước
  // với trang "Báo lỗi do khách".
  const exportCsv = () => {
    const cols = [
      'Mã phiếu', 'Nhà', 'Phòng', 'Khách thuê', 'SĐT', 'Thiết bị', 'Phân loại', 'Mức ưu tiên',
      'Quản lý phụ trách', 'Trạng thái', 'Chi phí', 'Ngày tạo', 'Ngày cập nhật',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      cols.map(esc).join(','),
      ...filtered.map(r => [
        r.requestCode, r.propertyName, r.roomName, r.tenantName, r.tenantPhone, r.equipmentName,
        r.category ? maintenanceCategoryMap[r.category] ?? r.category : '',
        r.priority ? maintenanceReqPriorityMap[r.priority]?.label ?? r.priority : '',
        r.assignedManagerName,
        (maintenanceReqStatusMap[r.status] ?? maintenanceReqStatusMap.OPEN).label,
        r.invoiceAmount != null ? r.invoiceAmount : '',
        fmtDate(r.createdAt), fmtDate(r.updatedAt),
      ].map(esc).join(',')),
    ];
    // BOM đầu file để Excel nhận đúng UTF-8, không thì tiếng Việt có dấu ra ký tự lạ.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-bao-tri-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const linkBtn = 'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition';

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Vận hành"
        title="Bảo trì & thiết bị"
        subtitle="Theo dõi yêu cầu sửa chữa của khách, tiến độ xử lý của quản lý và chi phí từng phiếu."
        icon={Wrench}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <RealtimeBadge connected={liveOn} />
            <Link to="/admin/maintenance/fault-review"
              className={`${linkBtn} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}>
              <Gavel className="h-4 w-4" /> Báo lỗi do khách
              {kpi.pendingReview > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {kpi.pendingReview}
                </span>
              )}
            </Link>
            <Link to="/admin/equipments"
              className={`${linkBtn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>
              <PackageSearch className="h-4 w-4" /> Danh mục thiết bị
            </Link>
            <button onClick={load} disabled={loading}
              title="Tải lại danh sách"
              className={`${linkBtn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50`}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </button>
            <button onClick={exportCsv} disabled={filtered.length === 0}
              title="Xuất CSV danh sách đang hiển thị (đã áp tìm kiếm/lọc)"
              className={`${linkBtn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40`}>
              <Download className="h-4 w-4" /> Xuất CSV
            </button>
          </div>
        )}
      />

      {/* Thẻ số liệu bấm được = lọc nhanh, đỡ phải đi tìm chip tương ứng bên dưới. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Tổng phiếu" value={kpi.total} icon={ClipboardList} tone="slate"
          helper={serverTotal > requests.length ? `đã tải ${requests.length}/${serverTotal}` : 'toàn bộ phiếu đã tải'}
          onClick={() => setBucket('all')} active={bucket === 'all'} />
        <StatCard title="Cần xử lý" value={kpi.open} icon={Inbox} tone={kpi.stale > 0 ? 'rose' : 'amber'}
          helper={kpi.stale > 0 ? `${kpi.stale} phiếu chờ quá ${STALE_DAYS} ngày` : 'chưa ai nhận kiểm tra'}
          progress={kpi.total ? kpi.open / kpi.total : 0}
          onClick={() => setBucket('need')} active={bucket === 'need'} />
        <StatCard title="Đang sửa" value={kpi.inRepair} icon={Hammer} tone="violet"
          helper="quản lý đang xử lý" progress={kpi.total ? kpi.inRepair / kpi.total : 0}
          onClick={() => setBucket('doing')} active={bucket === 'doing'} />
        <StatCard title="Lỗi do khách" value={kpi.tenantFault} icon={AlertTriangle} tone="rose"
          helper={kpi.pendingReview > 0 ? `${kpi.pendingReview} phiếu chờ admin phân xử` : 'gồm cả chờ trừ cọc'}
          progress={kpi.total ? kpi.tenantFault / kpi.total : 0}
          onClick={() => setBucket('tenant')} active={bucket === 'tenant'} />
        <StatCard title="Hoàn tất" value={kpi.closed} icon={CheckCircle2} tone="emerald"
          helper={kpi.cost > 0 ? `chi phí ${formatVnd(kpi.cost)}` : 'chưa ghi nhận chi phí'}
          progress={kpi.total ? kpi.closed / kpi.total : 0}
          onClick={() => setBucket('done')} active={bucket === 'done'} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* ─── Thanh công cụ ─────────────────────────────────────────────── */}
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {BUCKETS.map(b => (
              <button key={b.key} onClick={() => setBucket(b.key)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  bucket === b.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
                {b.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-black ${
                  bucket === b.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {bucketCounts[b.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm mã phiếu, tên/SĐT khách, thiết bị, nhà, phòng, quản lý…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              {search && (
                <button onClick={() => setSearch('')} title="Xoá từ khoá"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {propertyOptions.length > 1 && (
              <select
                value={propertyFilter}
                onChange={e => setPropertyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 lg:min-w-[200px]"
              >
                <option value="all">Tất cả nhà ({propertyOptions.length})</option>
                {propertyOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            <div className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                title="Thứ tự sắp xếp"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 lg:w-[190px]"
              >
                {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {statusChips.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => setStatusFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  statusFilter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>
                Mọi trạng thái
              </button>
              {statusChips.map(({ status, count }) => {
                const meta = maintenanceReqStatusMap[status];
                const active = statusFilter === status;
                return (
                  <button key={status} onClick={() => setStatusFilter(active ? 'all' : status)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                      active ? meta.color + ' ring-2 ring-slate-900/10' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label} {count}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
            <p>
              Hiển thị <span className="text-slate-900">{filtered.length}</span> phiếu
              {hasActiveFilter && <> · <button onClick={clearFilters} className="font-bold text-indigo-600 hover:underline">bỏ mọi bộ lọc</button></>}
            </p>
            {serverTotal > requests.length && (
              <button onClick={loadMore} disabled={loadingMore}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Tải thêm ({serverTotal - requests.length} phiếu nữa)
              </button>
            )}
          </div>
        </div>

        {/* ─── Trạng thái tải / lỗi / rỗng ────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-semibold">Đang tải danh sách phiếu…</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertTriangle className="h-7 w-7 text-rose-400" />
            <p className="text-sm font-semibold text-rose-600">{loadError}</p>
            <button onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              Thử lại
            </button>
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <div className="rounded-2xl bg-slate-50 p-3"><Inbox className="h-6 w-6 text-slate-300" /></div>
            <p className="text-sm font-bold text-slate-600">
              {requests.length === 0 ? 'Chưa có yêu cầu bảo trì nào' : 'Không có phiếu nào khớp bộ lọc'}
            </p>
            <p className="max-w-sm text-xs text-slate-400">
              {requests.length === 0
                ? 'Khách thuê gửi yêu cầu từ app, phiếu sẽ hiện ở đây ngay khi được tạo.'
                : 'Thử bỏ bớt điều kiện lọc hoặc đổi sang nhóm việc khác.'}
            </p>
            {requests.length > 0 && hasActiveFilter && (
              <button onClick={clearFilters} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50">
                Bỏ mọi bộ lọc
              </button>
            )}
          </div>
        )}

        {/* ─── Bảng (md trở lên) ──────────────────────────────────────────── */}
        {!loading && !loadError && filtered.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Phiếu</th>
                    <th className="px-4 py-3">Nhà · Phòng</th>
                    <th className="px-4 py-3">Khách thuê</th>
                    <th className="px-4 py-3">Quản lý</th>
                    <th className="px-4 py-3 text-right">Chi phí</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map(r => (
                    <tr key={r.id} onClick={() => setDetail(r)}
                      className="cursor-pointer transition hover:bg-indigo-50/40">
                      <td className={`px-4 py-3 border-l-4 ${
                        isStale(r) ? 'border-rose-500' : r.status === 'OPEN' ? 'border-amber-300' : 'border-transparent'}`}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-900">{r.requestCode}</span>
                          <PriorityBadge priority={r.priority} />
                          <WaitBadge request={r} />
                          {r.previousRequestId && (
                            <span title="Phiếu nối tiếp từ một phiếu đã đóng"
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              <Link2 className="h-3 w-3" /> nối tiếp
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-slate-600">{r.equipmentName ?? r.title ?? r.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{r.propertyName}</p>
                        <p className="text-xs text-slate-500">{r.roomName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700">{r.tenantName}</p>
                        {r.tenantPhone && <p className="text-xs text-slate-500">{r.tenantPhone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {r.assignedManagerName
                          ? <span className="text-slate-600">{r.assignedManagerName}</span>
                          : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">Chưa gán</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">
                        {r.invoiceAmount != null ? formatVnd(r.invoiceAmount) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500" title={fmtDate(r.updatedAt ?? r.createdAt)}>
                        {fmtAgo(r.updatedAt ?? r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─── Thẻ (dưới md) — bảng 7 cột không đọc nổi trên điện thoại ── */}
            <div className="divide-y divide-slate-100 md:hidden">
              {pageRows.map(r => (
                <button key={r.id} onClick={() => setDetail(r)}
                  className={`w-full border-l-4 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    isStale(r) ? 'border-rose-500' : r.status === 'OPEN' ? 'border-amber-300' : 'border-transparent'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">{r.requestCode}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">
                    {r.equipmentName ?? r.title ?? r.description}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={r.priority} />
                    <WaitBadge request={r} />
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                    <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{r.propertyName} · {r.roomName}</p>
                    <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" />{r.tenantName}{r.tenantPhone ? ` · ${r.tenantPhone}` : ''}</p>
                    <p className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" />
                      {r.invoiceAmount != null ? formatVnd(r.invoiceAmount) : 'Chưa có chi phí'}
                      <span className="text-slate-300">·</span>
                      {fmtAgo(r.updatedAt ?? r.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-slate-100 px-4 py-3">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </section>

      {detail && <DetailDrawer request={detail} onClose={() => setDetail(null)} />}
    </div>
  );
};

/** Phóng to ảnh — mượt hơn mở tab mới khi cần xem kỹ/lướt qua nhiều ảnh. */
const Lightbox = ({ images, index, onClose, onChange }: {
  images: string[]; index: number; onClose: () => void; onChange: (i: number) => void;
}) => {
  const go = useCallback((delta: number) => {
    onChange((index + delta + images.length) % images.length);
  }, [index, images.length, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && images.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && images.length > 1) go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, images.length]);

  return (
    <Overlay>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4" onClick={onClose}>
        <button onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
        {images.length > 1 && (
          <>
            <button onClick={e => { e.stopPropagation(); go(-1); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 sm:left-5">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={e => { e.stopPropagation(); go(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20 sm:right-5">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
        <img src={images[index]} alt={`ảnh ${index + 1}/${images.length}`}
          onClick={e => e.stopPropagation()}
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" />
        {images.length > 1 && (
          <p className="absolute bottom-5 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
            {index + 1} / {images.length}
          </p>
        )}
      </div>
    </Overlay>
  );
};

/** Chi tiết đầy đủ 1 phiếu — mô tả, ảnh mọi vòng, timeline. Dữ liệu lấy thẳng từ dòng
 * đã tải (GET /api/v1/maintenance trả full DTO, không thiếu field nào so với
 * GET /{id}) — không cần gọi API riêng, mở tức thì. */
const DetailDrawer = ({ request: r, onClose }: { request: MaintenanceRequestResponse; onClose: () => void }) => {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Esc để đóng — ngăn kéo dài thao tác chuột chỉ để thoát khỏi panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  // photoHistory có mọi vòng (kể cả vòng cũ nếu phiếu nối tiếp) — ưu tiên dùng; phiếu
  // cũ chưa có field này thì rơi về snapshot vòng hiện tại từng field riêng lẻ.
  const photoGroups = PHOTO_GROUPS.map(g => {
    if (r.photoHistory && r.photoHistory.length > 0) {
      return { ...g, urls: r.photoHistory.filter(p => p.type === g.type).map(p => p.url) };
    }
    const fallback: Record<string, string[] | undefined> = {
      BEFORE: r.beforeImages?.length ? r.beforeImages : r.images,
      FAULT_EVIDENCE: r.faultEvidenceImages,
      SELF_REPAIR: r.selfRepairImages,
      AFTER: r.afterImages,
      INVOICE: r.invoiceImages,
    };
    return { ...g, urls: fallback[g.type] ?? [] };
  }).filter(g => g.urls.length > 0);

  const timeline = [...(r.timeline ?? [])].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const billingHint = r.billingHint ? maintenanceBillingHintMap[r.billingHint] : '';

  const Row = ({ icon: Icon, label, value }: { icon: typeof User; label: string; value?: string | null }) => (
    !value ? null : (
      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-sm font-semibold text-slate-800">{value}</p>
        </div>
      </div>
    )
  );

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose}>
        <div onClick={e => e.stopPropagation()}
          className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
          {/* Header dính — mã phiếu + trạng thái luôn thấy khi cuộn dài. */}
          <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-black text-slate-900">{r.requestCode}</span>
                  <StatusBadge status={r.status} />
                  <PriorityBadge priority={r.priority} />
                  <WaitBadge request={r} />
                </div>
                <h3 className="mt-1.5 text-lg font-bold leading-snug text-slate-900">
                  {r.title || r.equipmentName || 'Yêu cầu sửa chữa'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {r.category ? maintenanceCategoryMap[r.category] ?? r.category : 'Chưa phân loại'}
                  {' · '}Tạo {fmtDate(r.createdAt)}
                </p>
              </div>
              <button onClick={onClose} title="Đóng (Esc)"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Row icon={MapPin} label="Nhà / Phòng" value={`${r.propertyName}${r.roomName ? ` · ${r.roomName}` : ''}`} />
              <Row icon={Phone} label="Khách thuê" value={`${r.tenantName}${r.tenantPhone ? ` · ${r.tenantPhone}` : ''}`} />
              <Row icon={User} label="Quản lý phụ trách" value={r.assignedManagerName ?? 'Chưa gán'} />
              {r.equipmentName && <Row icon={Wrench} label="Thiết bị" value={r.equipmentName} />}
              {r.selfRepairDeadline && <Row icon={Clock} label="Hạn khách tự sửa" value={fmtDate(r.selfRepairDeadline)} />}
              {r.resolvedAt && <Row icon={CheckCircle2} label="Hoàn thành" value={fmtDate(r.resolvedAt)} />}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Mô tả sự cố</p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                {r.description || '(không có mô tả)'}
              </p>
            </div>

            {r.faultReason && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Lỗi do khách
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">{r.faultReason}</p>
                {r.estimatedDamageAmount != null && (
                  <p className="mt-2 text-sm font-bold text-rose-800">
                    Ước tính thiệt hại: {formatVnd(r.estimatedDamageAmount)}
                  </p>
                )}
                {r.adminReviewedAt ? (
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    {r.adminApproved ? '✅ Đã duyệt' : '❌ Không duyệt'} bởi {r.adminReviewedByName ?? 'admin'} lúc {fmtDate(r.adminReviewedAt)}
                    {r.adminReviewNote ? ` — "${r.adminReviewNote}"` : ''}
                  </p>
                ) : (
                  <Link to="/admin/maintenance/fault-review"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700">
                    <Gavel className="h-3.5 w-3.5" /> Sang trang phân xử
                  </Link>
                )}
              </div>
            )}

            {(r.invoiceAmount != null || r.repairDescription || r.resolutionNote || billingHint) && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Wallet className="h-3.5 w-3.5" /> Chi phí / Kết quả xử lý
                </p>
                {r.invoiceAmount != null && (
                  <p className="mt-2 text-2xl font-black text-slate-900">{formatVnd(r.invoiceAmount)}</p>
                )}
                {billingHint && <p className="mt-1 text-xs font-semibold text-indigo-600">{billingHint}</p>}
                {r.repairDescription && <p className="mt-2 text-sm text-slate-700">{r.repairDescription}</p>}
                {r.resolutionNote && <p className="mt-1 text-sm text-slate-500">{r.resolutionNote}</p>}
              </div>
            )}

            {photoGroups.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ảnh (mọi vòng xử lý)</p>
                <div className="mt-2 space-y-3">
                  {photoGroups.map(g => (
                    <div key={g.type}>
                      <p className="mb-1.5 text-xs font-semibold text-slate-600">{g.label} ({g.urls.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {g.urls.map((url, i) => (
                          <button key={i} type="button" onClick={() => setLightbox({ images: g.urls, index: i })}>
                            <img src={url} alt={`${g.label} ${i + 1}`}
                              className="h-16 w-16 rounded-lg border border-slate-200 object-cover transition hover:opacity-80" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timeline.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <History className="h-3.5 w-3.5" /> Tiến trình xử lý
                </p>
                <div className="mt-3">
                  {timeline.map((t, i) => {
                    const ns = maintenanceReqStatusMap[t.newStatus] ?? maintenanceReqStatusMap.OPEN;
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ns.dot}`} />
                          {i !== timeline.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-bold text-slate-800">{ns.label}</p>
                          {t.note && <p className="mt-0.5 text-sm text-slate-600">{t.note}</p>}
                          <p className="mt-0.5 text-xs text-slate-400">
                            {t.changedByName ?? 'Hệ thống'} · {fmtDate(t.changedAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onChange={i => setLightbox(l => (l ? { ...l, index: i } : l))}
        />
      )}
    </Overlay>
  );
};
