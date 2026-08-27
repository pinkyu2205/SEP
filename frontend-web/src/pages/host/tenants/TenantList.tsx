import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CalendarClock, ChevronRight, DoorOpen, FileText, History, Home, LayoutGrid,
  Loader2, RefreshCw, Search, UserRound, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '@/services/property.service';
import { hostService, type HostContractDto } from '@/services/host.service';
import type { PropertyResponse, RoomResponse } from '@/types/api.types';
import { TenantTimelineDrawer, type TenantIdentity } from '@/components/TenantContractTimeline';
import { MaskedField } from '@/components/MaskedField';
import { EXPIRING_WINDOW_DAYS, daysLeft, fmtDate, termLabel } from '@/components/contract/contractLabels';
import { EmptyState, StatCard } from '@/pages/admin/shared';
import { isHostApproved } from '@/pages/host/properties/propertyListState';
import { formatCurrency } from '@/utils';

/**
 * KHÁCH THUÊ (Host) — trang về NGƯỜI và CHỖ Ở, không phải về hợp đồng.
 *
 * Phân vai rõ với `/host/contracts` (đúng như cách menu đang chia nhóm — trang này nằm ở
 * "Vận hành", trang kia ở "Hợp đồng"):
 *
 *   • TRANG NÀY   — ai đang ở căn nào, phòng nào còn trống, khách này từng thuê những đâu.
 *                   Bấm vào một khách → **lịch sử thuê** của người đó.
 *   • /host/contracts — điều khoản, tiền, biên bản, file hợp đồng.
 *                   Bấm vào một dòng → **chi tiết hợp đồng**.
 *
 * Cố ý KHÔNG có bảng hợp đồng và KHÔNG mở drawer chi tiết hợp đồng ở đây: bản trước từng
 * làm vậy và hai trang biến thành bản sao của nhau — cùng bảng, cùng bộ lọc, cùng drawer.
 * Cần xem điều khoản thì có link sang thẳng trang hợp đồng.
 *
 * Ba tab, mỗi tab một việc:
 *   • **Đang thuê** — khách còn quan hệ thuê (đang ở + sắp dọn vào). MỘT DÒNG MỘT NGƯỜI,
 *     gom nhiều hợp đồng của cùng khách lại, không phải một dòng một hợp đồng.
 *   • **Sơ đồ phòng** — lưới phòng của căn đang chọn: phòng nào có khách, phòng nào trống,
 *     phòng nào bảo trì. Tải `GET /properties/{id}/rooms` lười (chỉ khi bật) + cache.
 *   • **Đã rời đi** — kho tra cứu khách cũ, TÁCH HẲN khỏi danh sách đang thuê.
 *
 * ⚠️ Gom theo người có giới hạn thật, trang nói rõ chứ không giấu: hợp đồng chưa kích hoạt
 * bị BE bỏ mất tên khách (`toContractDto` không fallback `draftTenantName`), còn hợp đồng
 * đã chấm dứt thì BE gỡ hẳn `tenant_user_id` nên không truy ngược về ai được nữa. Hai
 * nhóm đó không thể xếp vào người nào — xem
 * `doc-be/BE-NEED-host-xem-hop-dong-nhu-admin-2026-08-19.md`.
 */


const ROOM_STATUS: Record<string, { label: string; chip: string; ring: string }> = {
  AVAILABLE: { label: 'Còn trống', chip: 'bg-emerald-100 text-emerald-700', ring: 'border-emerald-200 bg-emerald-50/40' },
  RENTED: { label: 'Đang thuê', chip: 'bg-indigo-100 text-indigo-700', ring: 'border-indigo-200 bg-indigo-50/40' },
  MAINTENANCE: { label: 'Bảo trì', chip: 'bg-amber-100 text-amber-700', ring: 'border-amber-200 bg-amber-50/40' },
  DRAFT: { label: 'Chưa mở bán', chip: 'bg-slate-100 text-slate-600', ring: 'border-slate-200 bg-slate-50/40' },
};

/** Khớp HĐ với BĐS: ưu tiên propertyId (BE đã trả), fallback theo tên. */
const matchProperty = (c: HostContractDto, p: PropertyResponse) =>
  c.propertyId != null ? c.propertyId === p.id : c.propertyName === p.propertyName;

/** HĐ đang thật sự chiếm chỗ — nền để tính lấp đầy, không tính HĐ đã kết thúc. */
const isOccupying = (c: HostContractDto) => c.status === 'ACTIVE';

/** Một khách thuê, gom từ mọi hợp đồng ghép được về cùng người. */
interface TenantRow {
  key: string;
  name: string;
  phone?: string;
  cccd?: string;
  contracts: HostContractDto[];
  /** HĐ đang hiệu lực (nếu đang ở) — quyết định "đang ở đâu". */
  current?: HostContractDto;
  /**
   * HĐ chờ đón khách (DRAFT/PENDING) khi chưa có HĐ nào hiệu lực. Người này CHƯA rời đi —
   * họ còn chưa dọn vào. Nhập chung với khách cũ là sai hẳn nghĩa.
   */
  upcoming?: HostContractDto;
  /** HĐ mới nhất, dùng khi khách đã rời đi. */
  latest: HostContractDto;
}

/** Khách còn quan hệ thuê (đang ở hoặc sắp vào) — đối lập với khách đã rời đi. */
const isCurrentTenant = (r: TenantRow) => !!(r.current || r.upcoming);

/**
 * Gom hợp đồng về từng người. Khoá ghép ưu tiên SĐT (ổn định hơn tên); không có SĐT thì
 * dùng tên viết thường. Hợp đồng không còn cả hai thì KHÔNG ghép bừa vào ai — trả riêng
 * ở `unlinked` để trang tự giải thích.
 */
const groupByTenant = (contracts: HostContractDto[]) => {
  const map = new Map<string, TenantRow>();
  const unlinked: HostContractDto[] = [];

  for (const c of contracts) {
    const phone = c.tenantPhone?.trim();
    const name = c.lesseeName?.trim();
    const key = phone || name?.toLowerCase();
    if (!key) { unlinked.push(c); continue; }

    const row = map.get(key);
    if (row) {
      row.contracts.push(c);
      if (!row.phone && phone) row.phone = phone;
      if (!row.cccd && c.tenantCccd) row.cccd = c.tenantCccd;
      if (name && row.name === '—') row.name = name;
    } else {
      map.set(key, {
        key, name: name || '—', phone, cccd: c.tenantCccd,
        contracts: [c], latest: c,
      });
    }
  }

  for (const row of map.values()) {
    // Mới nhất lên đầu (id BE tăng dần theo thời gian tạo).
    row.contracts.sort((a, b) => Number(b.id) - Number(a.id));
    row.latest = row.contracts[0];
    row.current = row.contracts.find(isOccupying);
    row.upcoming = row.current
      ? undefined
      : row.contracts.find((c) => c.status === 'DRAFT' || c.status === 'PENDING');
  }

  return {
    rows: [...map.values()].sort((a, b) => {
      // Khách đang ở lên trước, rồi tới tên.
      const ca = a.current ? 0 : 1;
      const cb = b.current ? 0 : 1;
      return ca === cb ? a.name.localeCompare(b.name, 'vi') : ca - cb;
    }),
    unlinked,
  };
};

/**
 * Ba khu vực tách rời nhau — khách đã rời đi nằm ở TAB RIÊNG, không trộn vào danh sách
 * đang thuê. Việc đang phải làm và việc đã xong là hai loại thông tin khác nhau: trộn
 * chung thì mỗi lần mở trang lại phải mắt lướt qua một đống dòng xám không còn liên quan.
 */
type ViewTab = 'current' | 'rooms' | 'past';

export const TenantList = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null); // null = tất cả
  const [propSearch, setPropSearch] = useState('');
  const [onlyOccupied, setOnlyOccupied] = useState(false);

  const [search, setSearch] = useState('');
  /** Chỉ lọc trong tab "Đang thuê" — tab "Đã rời đi" không có khái niệm sắp hết hạn. */
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [view, setView] = useState<ViewTab>('current');

  // Sơ đồ phòng — tải lười theo từng căn, cache để bấm qua lại không gọi lại.
  const [roomsByProperty, setRoomsByProperty] = useState<Record<number, RoomResponse[]>>({});
  const [roomsLoading, setRoomsLoading] = useState(false);

  const [timelineOf, setTimelineOf] = useState<TenantIdentity | null>(null);

  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [propList, contractList] = await Promise.all([
        // Chỉ giữ nhà đã duyệt khai thác — căn còn nháp/chờ duyệt chưa thể có khách.
        propertyService.getProperties(0, 200).then((p) => p.content.filter(isHostApproved)).catch(() => {
          toast.error('Không tải được danh sách bất động sản');
          return [] as PropertyResponse[];
        }),
        hostService.listContracts({ size: 500 }).then((p) => p.content ?? []).catch(() => {
          toast.error('Không tải được dữ liệu khách thuê');
          return [] as HostContractDto[];
        }),
      ]);
      setProperties(propList);
      setContracts(contractList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sơ đồ phòng chỉ có nghĩa khi đã chọn đúng MỘT căn chia phòng.
  useEffect(() => {
    if (view === 'rooms' && (selectedId == null || selectedProperty?.wholeHouse)) setView('current');
  }, [selectedId, selectedProperty, view]);

  useEffect(() => {
    if (view !== 'rooms' || selectedId == null || roomsByProperty[selectedId]) return;
    let alive = true;
    setRoomsLoading(true);
    propertyService.getRooms(selectedId)
      .then((rooms) => { if (alive) setRoomsByProperty((prev) => ({ ...prev, [selectedId]: rooms ?? [] })); })
      .catch(() => toast.error('Không tải được danh sách phòng của căn này'))
      .finally(() => { if (alive) setRoomsLoading(false); });
    return () => { alive = false; };
  }, [view, selectedId, roomsByProperty]);

  /** Sức chứa một căn: nhà chia phòng đếm số phòng, nguyên căn tính là 1 chỗ. */
  const capacityOf = (p: PropertyResponse) => (p.wholeHouse ? 1 : Math.max(0, p.totalRooms ?? 0));

  const occupancyByProp = useMemo(() => {
    const map = new Map<number, { occupied: number; capacity: number }>();
    for (const p of properties) {
      map.set(p.id, {
        occupied: contracts.filter((c) => matchProperty(c, p) && isOccupying(c)).length,
        capacity: capacityOf(p),
      });
    }
    return map;
  }, [properties, contracts]);

  const visibleProps = useMemo(() => {
    const kw = propSearch.trim().toLowerCase();
    return properties
      .filter((p) => !kw || p.propertyName.toLowerCase().includes(kw))
      .filter((p) => !onlyOccupied || (occupancyByProp.get(p.id)?.occupied ?? 0) > 0)
      // Căn đang có khách lên trước — host quan tâm chỗ đang chạy, không phải chỗ trống.
      .sort((a, b) => {
        const oa = occupancyByProp.get(a.id)?.occupied ?? 0;
        const ob = occupancyByProp.get(b.id)?.occupied ?? 0;
        return ob === oa ? a.propertyName.localeCompare(b.propertyName, 'vi') : ob - oa;
      });
  }, [properties, propSearch, onlyOccupied, occupancyByProp]);

  /** HĐ trong phạm vi đang xem (một căn hoặc tất cả). */
  const scoped = useMemo(
    () => (selectedProperty ? contracts.filter((c) => matchProperty(c, selectedProperty)) : contracts),
    [contracts, selectedProperty],
  );

  const { rows: tenantRows, unlinked } = useMemo(() => groupByTenant(scoped), [scoped]);

  /** Hai nhóm tách rời — khách đang thuê và khách đã rời đi không bao giờ trộn chung bảng. */
  const currentRows = useMemo(() => tenantRows.filter(isCurrentTenant), [tenantRows]);
  const pastRows = useMemo(
    // Khách cũ: mới rời gần đây lên đầu — cần tra thì thường là tra người vừa đi.
    () => tenantRows.filter((r) => !isCurrentTenant(r)).sort((a, b) => Number(b.latest.id) - Number(a.latest.id)),
    [tenantRows],
  );

  const stats = useMemo(() => {
    const scopeProps = selectedProperty ? [selectedProperty] : properties;
    const capacity = scopeProps.reduce((s, p) => s + capacityOf(p), 0);
    const staying = currentRows.filter((r) => r.current);
    const expiring = staying.filter((r) => {
      const d = daysLeft(r.current?.endDate);
      return d != null && d >= 0 && d <= EXPIRING_WINDOW_DAYS;
    });
    const occupied = scoped.filter(isOccupying).length;
    return {
      staying: staying.length,
      upcoming: currentRows.filter((r) => r.upcoming).length,
      capacity,
      vacant: Math.max(0, capacity - occupied),
      expiring: expiring.length,
      past: pastRows.length,
      revenue: staying.reduce((s, r) => s + (r.current?.rentAmount ?? 0), 0),
    };
  }, [currentRows, pastRows, scoped, selectedProperty, properties]);

  /** Lọc chung cho cả hai bảng — chỉ khác nguồn hàng và điều kiện "sắp hết hạn". */
  const applyFilters = (rows: TenantRow[], withExpiring: boolean) => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (withExpiring && expiringOnly) {
        const d = daysLeft(r.current?.endDate);
        if (!r.current || d == null || d < 0 || d > EXPIRING_WINDOW_DAYS) return false;
      }
      if (!q) return true;
      return [r.name, r.phone, r.cccd, r.current?.roomCode, r.latest.roomCode, r.latest.propertyName]
        .some((v) => v?.toLowerCase().includes(q));
    });
  };

  const visibleCurrent = useMemo(
    () => applyFilters(currentRows, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRows, search, expiringOnly],
  );
  const visiblePast = useMemo(
    () => applyFilters(pastRows, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pastRows, search],
  );

  const rooms = selectedId != null ? roomsByProperty[selectedId] ?? [] : [];
  const contractOfRoom = (roomNumber: string) =>
    scoped.find((c) => c.roomCode === roomNumber && isOccupying(c));

  const openTimeline = (c: HostContractDto) =>
    setTimelineOf({ phone: c.tenantPhone, name: c.lesseeName });

  const filterActive = expiringOnly || !!search.trim();

  /** Hợp đồng chưa ghép được về người nào, tách theo lý do để giải thích đúng chỗ. */
  const unlinkedUpcoming = unlinked.filter((c) => c.status === 'DRAFT' || c.status === 'PENDING');
  const unlinkedPast = unlinked.filter((c) => c.status === 'TERMINATED' || c.status === 'EXPIRED');

  const TABS = [
    { key: 'current' as const, label: 'Đang thuê', icon: Users, count: currentRows.length },
    { key: 'rooms' as const, label: 'Sơ đồ phòng', icon: LayoutGrid, count: null },
    { key: 'past' as const, label: 'Đã rời đi', icon: History, count: pastRows.length },
  ];

  return (
    <div className="space-y-5">
      {/* ── Tiêu đề ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Khách thuê</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ai đang ở đâu, phòng nào còn trống.{' '}
            <Link to="/host/contracts" className="font-semibold text-primary-600 hover:underline">
              Xem điều khoản &amp; hồ sơ hợp đồng →
            </Link>
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex shrink-0 items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* ── Thẻ số liệu (theo phạm vi đang chọn) ───────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Khách đang ở" value={stats.staying} icon={Users} tone="emerald"
          helper={stats.upcoming > 0
            ? `${formatCurrency(stats.revenue)}/tháng · ${stats.upcoming} sắp vào`
            : `${formatCurrency(stats.revenue)}/tháng`}
          progress={stats.capacity ? stats.staying / stats.capacity : 0}
          active={view === 'current' && !expiringOnly}
          onClick={() => { setView('current'); setExpiringOnly(false); }} />
        <StatCard title="Chỗ còn trống" value={stats.vacant} icon={DoorOpen} tone="slate"
          helper={`Trên tổng ${stats.capacity} chỗ`}
          progress={stats.capacity ? stats.vacant / stats.capacity : 0} />
        <StatCard title={`Sắp hết hạn ≤${EXPIRING_WINDOW_DAYS}n`} value={stats.expiring} icon={CalendarClock} tone="rose"
          helper="Cần chốt gia hạn sớm"
          progress={stats.staying ? stats.expiring / stats.staying : 0}
          active={view === 'current' && expiringOnly}
          onClick={() => { setView('current'); setExpiringOnly((v) => !v); }} />
        <StatCard title="Khách đã rời đi" value={stats.past} icon={History} tone="violet"
          helper="Nằm ở tab riêng, tra khi cần"
          active={view === 'past'}
          onClick={() => setView('past')} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[290px_1fr]">
        {/* ── Cột trái: chọn bất động sản ─────────────────────────────────── */}
        <div className="card p-3 lg:sticky lg:top-4">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={propSearch}
              onChange={(e) => setPropSearch(e.target.value)}
              placeholder="Tìm bất động sản..."
              className="input-field py-2 pl-9 text-sm"
            />
          </div>

          <label className="mb-2 flex cursor-pointer items-center gap-2 px-1 text-xs font-semibold text-slate-500">
            <input
              type="checkbox"
              checked={onlyOccupied}
              onChange={(e) => setOnlyOccupied(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Chỉ hiện căn đang có khách
          </label>

          <div className="max-h-[58vh] space-y-1 overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedId(null)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                selectedId == null ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
              }`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                selectedId == null ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${selectedId == null ? 'text-indigo-700' : 'text-slate-700'}`}>
                  Tất cả bất động sản
                </p>
                <p className="text-[11px] text-slate-400">{properties.length} căn</p>
              </div>
            </button>

            {visibleProps.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                {onlyOccupied ? 'Không có căn nào đang có khách.' : 'Không tìm thấy bất động sản.'}
              </p>
            ) : visibleProps.map((p) => {
              const isActive = p.id === selectedId;
              const occ = occupancyByProp.get(p.id) ?? { occupied: 0, capacity: 0 };
              const pct = occ.capacity ? Math.round((occ.occupied / occ.capacity) * 100) : 0;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {p.wholeHouse ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {p.propertyName}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {p.wholeHouse ? 'Nguyên căn' : `Chia phòng · ${occ.capacity} phòng`}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-black tabular-nums ${
                      occ.occupied > 0 ? 'text-emerald-600' : 'text-slate-300'
                    }`}>
                      {occ.occupied}/{occ.capacity}
                    </span>
                  </div>
                  {/* Thanh lấp đầy — nhìn một cái là biết căn nào đang chạy hết công suất */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-indigo-400' : 'bg-transparent'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Cột phải ────────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {TABS.map((t) => {
                const disabled = t.key === 'rooms' && (selectedId == null || !!selectedProperty?.wholeHouse);
                const on = view === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => !disabled && setView(t.key)}
                    disabled={disabled}
                    title={disabled ? 'Chọn một căn chia phòng để xem sơ đồ' : undefined}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <t.icon className="h-4 w-4" />{t.label}
                    {t.count != null && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                        on ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>{t.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên khách, SĐT, CCCD, phòng..."
                className="input-field bg-white pl-9"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {view !== 'rooms' && filterActive && (
              <button onClick={() => { setExpiringOnly(false); setSearch(''); }}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200">
                <X className="h-3 w-3" /> Xoá bộ lọc
              </button>
            )}
          </div>

          {/* Hợp đồng không ghép được về người nào — giải thích đúng lý do của TỪNG tab,
              đừng để host tưởng dữ liệu bị mất. */}
          {view === 'current' && unlinkedUpcoming.length > 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
              <b className="text-slate-700">{unlinkedUpcoming.length} hợp đồng chờ đón khách</b> chưa hiện ở đây
              vì backend chưa trả tên khách cho cổng Chủ nhà. Vẫn xem được ở{' '}
              <Link to="/host/contracts" className="font-semibold text-primary-600 hover:underline">
                Quản lý hợp đồng
              </Link>.
            </p>
          )}
          {view === 'past' && unlinkedPast.length > 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
              <b className="text-slate-700">{unlinkedPast.length} hợp đồng đã kết thúc</b> không truy được về khách nào —
              backend gỡ liên kết khách khi chấm dứt hợp đồng. Bản thân hợp đồng vẫn còn ở{' '}
              <Link to="/host/contracts" className="font-semibold text-primary-600 hover:underline">
                Quản lý hợp đồng
              </Link>.
            </p>
          )}

          {loading ? (
            <div className="card flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
            </div>
          ) : view === 'rooms' ? (
            /* ── Sơ đồ phòng ──────────────────────────────────────────────── */
            roomsLoading ? (
              <div className="card flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Đang tải sơ đồ phòng...
              </div>
            ) : rooms.length === 0 ? (
              <EmptyState text="Căn này chưa khai báo phòng nào." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rooms.map((r) => {
                  const meta = ROOM_STATUS[r.status] ?? ROOM_STATUS.DRAFT;
                  const c = contractOfRoom(r.roomNumber);
                  const linked = !!(c?.tenantPhone || c?.lesseeName);
                  const left = c ? daysLeft(c.endDate) : null;
                  return (
                    <button
                      key={r.id}
                      onClick={() => c && linked && openTimeline(c)}
                      disabled={!linked}
                      title={linked ? 'Xem lịch sử thuê của khách này' : 'Phòng chưa có khách'}
                      className={`rounded-2xl border p-4 text-left transition ${meta.ring} ${
                        linked ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-base font-black text-slate-900">Phòng {r.roomNumber}</p>
                          <p className="text-[11px] text-slate-500">
                            {r.floor != null ? `Tầng ${r.floor} · ` : ''}{r.area ? `${r.area} m²` : 'Chưa có diện tích'}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-3 border-t border-white/60 pt-2.5">
                        {c ? (
                          <>
                            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                              <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className={`truncate ${c.lesseeName ? '' : 'italic text-slate-400'}`}>
                                {c.lesseeName || 'Khách chưa có tài khoản'}
                              </span>
                            </p>
                            <p className="mt-1 text-xs tabular-nums text-slate-500">
                              Ở từ {fmtDate(c.moveInDate || c.startDate)} → {fmtDate(c.endDate)}
                            </p>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="text-sm font-black tabular-nums text-slate-900">
                                {formatCurrency(c.rentAmount)}
                              </span>
                              {left != null && left >= 0 && left <= EXPIRING_WINDOW_DAYS && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                  Còn {left} ngày
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {/* Giá niêm yết giúp host biết phòng trống này đang chào bao nhiêu */}
                            {r.listedPrice
                              ? <>Chưa có khách · niêm yết <b className="text-slate-700">{formatCurrency(r.listedPrice)}</b></>
                              : 'Chưa có khách thuê'}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : view === 'past' ? (
            /* ── Kho khách đã rời đi — tách hẳn, chỉ để tra cứu ───────────── */
            visiblePast.length === 0 ? (
              <EmptyState text={
                filterActive ? 'Không có khách cũ nào khớp bộ lọc.' : 'Chưa có khách nào rời đi.'
              } />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="table-header">
                    <tr>
                      <th className="px-4 py-3">Khách cũ</th>
                      <th className="px-4 py-3">Từng ở</th>
                      <th className="px-4 py-3">Thời gian đã thuê</th>
                      <th className="px-4 py-3 text-right">Tiền phòng cũ</th>
                      <th className="px-4 py-3">Lịch sử</th>
                      <th className="w-10 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visiblePast.map((r) => (
                      <tr
                        key={r.key}
                        onClick={() => setTimelineOf({ phone: r.phone, name: r.name })}
                        title="Xem lịch sử thuê của khách này"
                        className="cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-black text-white">
                              {r.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-600">{r.name}</p>
                              <MaskedField value={r.phone} emptyText="" className="text-xs text-slate-400" />
                              {r.cccd && (
                                <MaskedField value={r.cccd} prefix="CCCD" emptyText="" head={3} tail={3}
                                  className="text-xs text-slate-400" />
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-slate-600">{r.latest.propertyName}</p>
                          <p className="text-xs text-slate-400">
                            {r.latest.roomCode ? `Phòng ${r.latest.roomCode}` : 'Nguyên căn'}
                          </p>
                        </td>

                        <td className="px-4 py-3 align-top text-xs text-slate-500">
                          <p className="tabular-nums">
                            {fmtDate(r.latest.moveInDate || r.latest.startDate)} → {fmtDate(r.latest.endDate)}
                          </p>
                          <p className="text-slate-400">{termLabel(r.latest)}</p>
                        </td>

                        <td className="px-4 py-3 align-top text-right">
                          <p className="font-semibold tabular-nums text-slate-500">{formatCurrency(r.latest.rentAmount)}</p>
                          <p className="text-xs text-slate-400">/tháng</p>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                            <FileText className="h-3 w-3" />
                            {r.contracts.length} hợp đồng
                          </span>
                        </td>

                        <td className="px-2 py-3 align-middle text-slate-300">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : visibleCurrent.length === 0 ? (
            <EmptyState text={
              filterActive
                ? 'Không có khách nào khớp bộ lọc.'
                : selectedProperty
                  ? `"${selectedProperty.propertyName}" chưa có khách nào đang thuê.`
                  : 'Chưa có khách nào đang thuê.'
            } />
          ) : (
            /* ── Đang thuê: MỘT DÒNG MỘT NGƯỜI ────────────────────────────── */
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-3">Khách thuê</th>
                    <th className="px-4 py-3">Chỗ ở</th>
                    <th className="px-4 py-3">Thời gian thuê</th>
                    <th className="px-4 py-3 text-right">Tiền phòng</th>
                    <th className="px-4 py-3">Lịch sử</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleCurrent.map((r) => {
                    // `current` = đang ở thật; `upcoming` = đã ký nhưng chưa dọn vào.
                    const c = r.current ?? r.upcoming ?? r.latest;
                    const left = r.current ? daysLeft(r.current.endDate) : null;
                    const expiring = left != null && left >= 0 && left <= EXPIRING_WINDOW_DAYS;
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setTimelineOf({ phone: r.phone, name: r.name })}
                        title="Xem lịch sử thuê của khách này"
                        className={`cursor-pointer transition hover:bg-emerald-50/40 ${expiring ? 'bg-amber-50/40' : ''}`}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2.5">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${
                              r.current ? 'bg-emerald-600' : 'bg-sky-500'
                            }`}>
                              {r.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800">{r.name}</p>
                              <MaskedField value={r.phone} emptyText="" className="text-xs text-slate-500" />
                              {r.cccd && (
                                <MaskedField value={r.cccd} prefix="CCCD" emptyText="" head={3} tail={3}
                                  className="text-xs text-slate-400" />
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-800">{c.propertyName}</p>
                          <p className="text-xs text-slate-500">
                            {c.roomCode ? `Phòng ${c.roomCode}` : 'Nguyên căn'}
                          </p>
                          {r.current ? (
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Đang ở
                            </span>
                          ) : (
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Chờ đón khách
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 align-top text-xs text-slate-600">
                          <p className="font-semibold tabular-nums">
                            {fmtDate(c.moveInDate || c.startDate)} → {fmtDate(c.endDate)}
                          </p>
                          <p className="text-slate-400">{termLabel(c)}</p>
                          {expiring && (
                            <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                              Còn {left} ngày
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 align-top text-right">
                          <p className="font-bold tabular-nums text-slate-800">{formatCurrency(c.rentAmount)}</p>
                          <p className="text-xs text-slate-400">/tháng</p>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            <FileText className="h-3 w-3" />
                            {r.contracts.length} hợp đồng
                          </span>
                        </td>

                        <td className="px-2 py-3 align-middle text-slate-300">
                          <ChevronRight className="h-4 w-4" />
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

      {/* Lịch sử thuê — gom HĐ của khách trên TẤT CẢ bất động sản, không chỉ căn đang chọn */}
      {timelineOf && (
        <TenantTimelineDrawer who={timelineOf} contracts={contracts} onClose={() => setTimelineOf(null)} />
      )}
    </div>
  );
};
