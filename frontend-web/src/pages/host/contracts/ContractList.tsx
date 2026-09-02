import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Archive, Building2, CalendarClock, ChevronRight, ClipboardList, FileText, Handshake, Loader2,
  PiggyBank, RefreshCw, Search, ShieldAlert, Users, Wallet, X,
} from 'lucide-react';
import { hostService } from '@/services/host.service';
import type { DepositItem, HostContractDto, MasterLease } from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import { MaskedField } from '@/components/MaskedField';
import { formatCurrency } from '@/utils';
import { EmptyState, Pagination, StatCard } from '@/pages/admin/shared';
import { ContractDetailDrawer, type ContractDetailSeed } from '@/components/contract/ContractDetailDrawer';
import {
  CONTRACT_STATUS, EXPIRING_WINDOW_DAYS, SCOPE_OPTIONS, SORT_OPTIONS, daysLeft, fmtDate,
  inScope, isEndedContract, isExpiringSoon, sortContracts, statusMeta, statusesInScope,
  type ContractScope, type SortKey, type StatusFilter,
} from '@/components/contract/contractLabels';
import { MASTER_LEASE_STATUS, MasterLeaseDetailDrawer, leaseStatusMeta } from './MasterLeaseDetailDrawer';

/**
 * HỢP ĐỒNG (Host) — hai loại hợp đồng ở hai đầu của cùng một căn nhà, nên tách hai tab:
 *
 *   • Quản lý ↔ Khách thuê   — hợp đồng công ty cho khách thuê (nguồn THU)
 *   • Host ↔ Chủ nhà          — master lease, công ty thuê lại nhà của chủ (nguồn CHI)
 *
 * Bố cục cố ý GIỐNG trang `admin/ContractMonitoring.tsx`: cùng thẻ số liệu bấm-để-lọc,
 * cùng bộ lọc, cùng bảng, và bấm một dòng là mở cùng một drawer chi tiết
 * ([[ContractDetailDrawer]]) — hai cổng nhìn cùng dữ liệu thì không nên bắt người dùng
 * học hai giao diện.
 *
 * ⚠️ KHÔNG có duyệt giá / phê duyệt hợp đồng ở đây. Hệ thống đã bỏ hẳn luồng manager gửi
 * Host duyệt (quyết định nghiệp vụ), nên trang này là màn XEM thuần — đừng dựng lại nút
 * Duyệt/Từ chối khi thêm tính năng mới.
 *
 * ⚠️ Dữ liệu lấy từ `/host/contracts` (KHÔNG dùng `/properties/{id}/tenant-contracts` —
 * host là ROLE_OWNER, endpoint đó 403). Bản host trả về là bản RÚT GỌN: thiếu biên bản
 * bàn giao, người ở cùng, ghi chú... Drawer tự thử nạp thêm qua `/tenant-contracts/{id}`
 * và nói rõ khi máy chủ chưa mở quyền, thay vì hiện trống trơn như thể chưa ai làm.
 */

const PAGE_SIZE = 10;

type ActiveTab = 'tenant_contract' | 'master_lease';

const TABS = [
  { key: 'tenant_contract' as const, label: 'Quản lý ↔ Khách thuê', icon: Users },
  { key: 'master_lease' as const, label: 'Host ↔ Chủ nhà (master lease)', icon: Handshake },
];

const DEPOSIT_STATUS: Record<string, { label: string; pill: string; box: string }> = {
  NOT_COLLECTED: { label: 'Chưa thu', pill: 'bg-amber-100 text-amber-700', box: 'border-amber-200 bg-amber-50/50' },
  HELD: { label: 'Đang giữ', pill: 'bg-cyan-100 text-cyan-700', box: 'border-cyan-200 bg-cyan-50/50' },
  REFUNDED: { label: 'Đã hoàn khách', pill: 'bg-emerald-100 text-emerald-700', box: 'border-emerald-200 bg-emerald-50/50' },
  FORFEITED: { label: 'Đã khấu trừ', pill: 'bg-rose-100 text-rose-700', box: 'border-rose-200 bg-rose-50/50' },
};

/** Máy chủ chưa cho ROLE_OWNER đọc `/tenant-contracts/{id}` — nói cho Host biết vì sao thiếu. */
const HOST_BLOCKED_NOTE =
  'Máy chủ chưa mở quyền cho vai Chủ nhà đọc hồ sơ đầy đủ, nên phần biên bản bàn giao, '
  + 'người ở cùng và ghi chú tạm thời chưa hiện. Những mục này sẽ tự có khi backend bổ sung quyền.';

/** `/host/contracts` trả bản rút gọn — nắn về đúng hình dạng drawer cần để vẽ ngay. */
const toDetailSeed = (c: HostContractDto): ContractDetailSeed => ({
  id: Number(c.id),
  propertyId: c.propertyId,
  roomNumber: c.roomCode,
  tenantFullName: c.lesseeName ?? undefined,
  tenantPhone: c.tenantPhone,
  tenantCccd: c.tenantCccd,
  contractCode: c.code,
  rentAmount: c.rentAmount,
  deposit: c.deposit,
  moveInDate: c.moveInDate,
  startDate: c.startDate,
  endDate: c.endDate,
  status: c.status,
  equipmentSnapshot: c.equipmentSnapshot,
});

/** Nhãn đếm ngược ở cột thời hạn — chỉ có nghĩa với HĐ đang chạy. */
const RemainingChip = ({ status, endDate }: { status?: string; endDate?: string }) => {
  if (status !== 'ACTIVE') return null;
  const left = daysLeft(endDate);
  if (left == null) return null;
  const cls = left < 0
    ? 'bg-rose-100 text-rose-700'
    : left <= EXPIRING_WINDOW_DAYS ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
  return (
    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${cls}`}>
      {left < 0 ? `Quá hạn ${-left} ngày` : `Còn ${left} ngày`}
    </span>
  );
};

export const ContractList = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tenant_contract');

  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [leases, setLeases] = useState<MasterLease[]>([]);
  const [properties, setProperties] = useState<Record<string, PropertyResponse>>({});
  /** Tiền cọc đang giữ, ghép vào hợp đồng theo contractId khi mở chi tiết. */
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  /** Nhóm đang xem — mặc định ẩn hợp đồng đã kết thúc, xem `ContractScope`. */
  const [scope, setScope] = useState<ContractScope>('active');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);

  const [selectedContract, setSelectedContract] = useState<HostContractDto | null>(null);
  const [selectedLease, setSelectedLease] = useState<MasterLease | null>(null);

  /**
   * `?contract=<mã HĐ>` — mở sẵn đúng hồ sơ khi đi từ nơi khác sang.
   *
   * Dùng ở dòng thời gian thuê của một khách (`TenantTimelineDrawer`): ở đó host đọc
   * được mã hợp đồng nhưng muốn xem bản scan / biên bản thiết bị / sổ cọc thì phải
   * sang trang này. Không có tham số này thì họ phải tự gõ lại mã vừa đọc vào ô tìm
   * kiếm — mã hiện ra mà không bấm được chính là ngõ cụt.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCode = searchParams.get('contract');

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [contractList, leaseList, propPage, depositRes] = await Promise.all([
        hostService.listAllContracts(),
        hostService.listMasterLeases().catch(() => [] as MasterLease[]),
        propertyService.getAllProperties().catch(() => null),
        hostService.getDeposits().catch(() => null),
      ]);
      setContracts(contractList);
      setLeases(leaseList);
      setDeposits(depositRes?.items ?? []);
      // Giữ nguyên bản ghi Property (không chỉ tên) — drawer cần địa chỉ, khu vực,
      // quy mô và quản lý vận hành để nói được căn này nằm ở đâu, ai đang trông.
      if (propPage) {
        setProperties(Object.fromEntries(propPage.map((p) => [String(p.id), p])));
      }
    } catch {
      setLoadError(true); /* interceptor đã toast */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  /*
    Bung drawer cho `?contract=` sau khi danh sách đã về.

    Xoá tham số ngay sau khi mở: để lại thì đóng drawer xong effect chạy lại và mở lại
    ngay — host bấm X mà cửa sổ không chịu đóng.

    Không tìm thấy mã thì NÓI RÕ thay vì im lặng. `listContracts` chỉ lấy 200 bản ghi
    đầu, nên hợp đồng cũ hoàn toàn có thể nằm ngoài; im lặng thì host bấm "Xem hợp đồng
    đầy đủ" xong thấy trang hợp đồng bình thường và tưởng mình bấm hụt.
  */
  useEffect(() => {
    if (!deepLinkCode || loading) return;
    const found = contracts.find((c) => c.code === deepLinkCode);
    if (found) setSelectedContract(found);
    else toast.error(`Không tìm thấy hợp đồng ${deepLinkCode} trong danh sách đang tải.`);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('contract');
      return next;
    }, { replace: true });
  }, [deepLinkCode, loading, contracts, setSearchParams]);

  // Đổi tab hay đổi bộ lọc mà vẫn đứng ở trang 5 thì thấy bảng trống — luôn về trang đầu.
  useEffect(() => {
    setPage(1);
  }, [activeTab, scope, search, statusFilter, propertyFilter, expiringOnly, sort]);

  // Đổi nhóm/tab mà giữ lại trạng thái không thuộc nhóm đó thì bảng rỗng oan.
  useEffect(() => {
    if (statusFilter !== 'all' && !inScope(statusFilter, scope)) setStatusFilter('all');
  }, [scope, statusFilter]);

  const propertyOf = (id?: number | string) => (id == null ? undefined : properties[String(id)]);
  const houseNameOf = (c: HostContractDto) =>
    c.propertyName || propertyOf(c.propertyId)?.propertyName || `BĐS #${c.propertyId ?? '—'}`;

  /** Danh sách nhà cho ô lọc — chỉ những căn thực sự có hợp đồng. */
  const propertyOptions = useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach((c) => {
      if (c.propertyId == null) return;
      map.set(String(c.propertyId), houseNameOf(c));
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, properties]);

  const stats = useMemo(() => {
    const by = (s: string) => contracts.filter((c) => c.status === s).length;
    const active = contracts.filter((c) => c.status === 'ACTIVE');
    return {
      total: contracts.length,
      active: active.length,
      draft: by('DRAFT'),
      pending: by('PENDING'),
      expiring: contracts.filter(isExpiringSoon).length,
      ended: by('TERMINATED') + by('EXPIRED'),
      activeRent: active.reduce((sum, c) => sum + (c.rentAmount ?? 0), 0),
    };
  }, [contracts]);

  /** Điều kiện lọc KHÔNG tính nhóm — dùng lại để đếm kết quả nằm ở nhóm khác. */
  const matchesContract = (c: HostContractDto) => {
    const q = search.trim().toLowerCase();
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (expiringOnly && !isExpiringSoon(c)) return false;
    if (propertyFilter !== 'all' && String(c.propertyId) !== propertyFilter) return false;
    if (!q) return true;
    const p = propertyOf(c.propertyId);
    return [c.code, c.lesseeName, c.tenantPhone, c.tenantCccd, c.roomCode, c.propertyName, p?.zoneName]
      .some((v) => v?.toLowerCase().includes(q));
  };

  const matchesLease = (l: MasterLease) => {
    const q = search.trim().toLowerCase();
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (propertyFilter !== 'all' && String(l.propertyId) !== propertyFilter) return false;
    if (!q) return true;
    return [l.ownerName, l.contractCode, propertyOf(l.propertyId)?.propertyName]
      .some((v) => v?.toLowerCase().includes(q));
  };

  const filteredContracts = useMemo(
    () => sortContracts(contracts.filter((c) => inScope(c.status, scope) && matchesContract(c)), sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contracts, properties, scope, search, statusFilter, propertyFilter, expiringOnly, sort],
  );

  const filteredLeases = useMemo(
    () => leases.filter((l) => inScope(l.status, scope) && matchesLease(l)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leases, properties, scope, search, statusFilter, propertyFilter],
  );

  /**
   * Kết quả khớp bộ lọc nhưng nằm NGOÀI nhóm đang xem. Thiếu con số này thì tìm mã một
   * hợp đồng đã chấm dứt sẽ ra bảng trống mà không hiểu vì sao.
   */
  const hiddenByScope = useMemo(() => {
    if (scope === 'all') return 0;
    return activeTab === 'tenant_contract'
      ? contracts.filter((c) => !inScope(c.status, scope) && matchesContract(c)).length
      : leases.filter((l) => !inScope(l.status, scope) && matchesLease(l)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, contracts, leases, properties, scope, search, statusFilter, propertyFilter, expiringOnly]);

  const scopeCounts = useMemo(() => {
    const src: { status: string }[] = activeTab === 'tenant_contract' ? contracts : leases;
    return {
      active: src.filter((x) => !isEndedContract(x.status)).length,
      ended: src.filter((x) => isEndedContract(x.status)).length,
      all: src.length,
    };
  }, [activeTab, contracts, leases]);

  const leaseStats = useMemo(() => {
    const running = leases.filter((l) => l.status === 'ACTIVE' || l.status === 'EXPIRING');
    return {
      total: leases.length,
      running: running.length,
      expiring: leases.filter((l) => l.status === 'EXPIRING').length,
      monthlyCost: running.reduce((sum, l) => sum + (l.monthlyRent ?? 0), 0),
    };
  }, [leases]);

  const rows: (HostContractDto | MasterLease)[] =
    activeTab === 'tenant_contract' ? filteredContracts : filteredLeases;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageContracts = filteredContracts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageLeases = filteredLeases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterActive =
    statusFilter !== 'all' || expiringOnly || propertyFilter !== 'all' || !!search.trim();

  const resetFilters = () => {
    setStatusFilter('all');
    setExpiringOnly(false);
    setPropertyFilter('all');
    setSearch('');
  };

  /** Thẻ số liệu bấm lần nữa là bỏ lọc — tránh phải đi tìm nút reset. */
  const toggleStatus = (s: StatusFilter) => {
    setExpiringOnly(false);
    // Chọn một trạng thái thì tự nhảy sang đúng nhóm chứa nó, không bắt bấm hai lần.
    setScope(isEndedContract(s) ? 'ended' : 'active');
    setStatusFilter((prev) => (prev === s ? 'all' : s));
  };

  /** Khoản cọc gắn với hợp đồng đang mở — hiện thêm trong drawer. */
  const depositCardFor = (c: HostContractDto) => {
    const dep = deposits.find((d) => d.contractId === Number(c.id));
    if (!dep) return null;
    const meta = DEPOSIT_STATUS[dep.status] ?? DEPOSIT_STATUS.HELD;
    return (
      <div className={`rounded-2xl border p-4 ${meta.box}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <PiggyBank className="h-3.5 w-3.5" /> Tiền cọc thu lúc đón khách
            </p>
            <p className="mt-1.5 text-lg font-black text-slate-900">{formatCurrency(dep.amount)}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {dep.heldSince ? `Giữ từ ${fmtDate(dep.heldSince)}` : 'Chưa ghi nhận ngày thu'} · tiền giữ hộ, hoàn khi khách trả phòng
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${meta.pill}`}>{meta.label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Tiêu đề ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hợp đồng</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hợp đồng cho khách thuê (nguồn thu) và master lease ký với chủ nhà (nguồn chi) —
            bấm một dòng để xem toàn bộ chi tiết.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex shrink-0 items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
              activeTab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {t.key === 'tenant_contract' ? contracts.length : leases.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Thẻ số liệu: bấm để lọc nhanh ──────────────────────────────────── */}
      {activeTab === 'tenant_contract' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Tổng hợp đồng" value={stats.total} icon={ClipboardList} tone="slate"
            helper={`${stats.active} đang chạy`} />
          <StatCard title="Đang hiệu lực" value={stats.active} icon={Users} tone="emerald"
            helper={`${formatCurrency(stats.activeRent)}/tháng`}
            progress={stats.total ? stats.active / stats.total : 0}
            active={statusFilter === 'ACTIVE' && !expiringOnly} onClick={() => toggleStatus('ACTIVE')} />
          <StatCard title="Chờ đón khách" value={stats.draft} icon={FileText} tone="indigo"
            helper="Đã lập hồ sơ, chưa giao phòng"
            progress={stats.total ? stats.draft / stats.total : 0}
            active={statusFilter === 'DRAFT' && !expiringOnly} onClick={() => toggleStatus('DRAFT')} />
          <StatCard title="Chờ kích hoạt" value={stats.pending} icon={Wallet} tone="amber"
            helper="Đã giao phòng, chờ thu tiền"
            progress={stats.total ? stats.pending / stats.total : 0}
            active={statusFilter === 'PENDING' && !expiringOnly} onClick={() => toggleStatus('PENDING')} />
          <StatCard title={`Sắp hết hạn ≤${EXPIRING_WINDOW_DAYS}n`} value={stats.expiring} icon={CalendarClock} tone="rose"
            helper="Cần chốt gia hạn sớm"
            progress={stats.active ? stats.expiring / stats.active : 0}
            active={expiringOnly} onClick={() => { setStatusFilter('all'); setExpiringOnly((v) => !v); }} />
          {/* Thẻ này đếm cả TERMINATED lẫn EXPIRED nên phải chuyển NHÓM, không lọc theo
              một trạng thái — lọc 'TERMINATED' thì số hiện và số ra bảng lệch nhau. */}
          <StatCard title="Đã kết thúc" value={stats.ended} icon={Archive} tone="violet"
            helper="Chấm dứt + hết hạn · xem ở nhóm riêng"
            progress={stats.total ? stats.ended / stats.total : 0}
            active={scope === 'ended'}
            onClick={() => { setScope('ended'); setStatusFilter('all'); setExpiringOnly(false); }} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Tổng master lease" value={leaseStats.total} icon={Handshake} tone="slate"
            helper={`${leaseStats.running} còn hiệu lực`} />
          <StatCard title="Đang hiệu lực" value={leaseStats.running} icon={Building2} tone="emerald"
            progress={leaseStats.total ? leaseStats.running / leaseStats.total : 0}
            active={statusFilter === 'ACTIVE'} onClick={() => toggleStatus('ACTIVE')} />
          <StatCard title="Sắp hết hạn" value={leaseStats.expiring} icon={CalendarClock} tone="amber"
            helper="Cần đàm phán gia hạn"
            progress={leaseStats.total ? leaseStats.expiring / leaseStats.total : 0}
            active={statusFilter === 'EXPIRING'} onClick={() => toggleStatus('EXPIRING' as StatusFilter)} />
          <StatCard title="Tiền thuê phải trả" value={formatCurrency(leaseStats.monthlyCost)} icon={Wallet} tone="rose"
            helper="Mỗi tháng, cho các HĐ còn hiệu lực" />
        </div>
      )}

      {/* ── Nhóm hồ sơ: đang theo dõi / đã kết thúc ────────────────────────── */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {SCOPE_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition ${
              scope === s.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {s.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
              scope === s.key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
            }`}>{scopeCounts[s.key]}</span>
          </button>
        ))}
      </div>

      {/* ── Bộ lọc ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'tenant_contract'
              ? 'Tìm mã HĐ, tên khách, SĐT, CCCD, toà nhà, phòng...'
              : 'Tìm tên chủ nhà, SĐT, bất động sản...'}
            className="input-field pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={expiringOnly ? 'expiring' : statusFilter}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'expiring') { setStatusFilter('all'); setExpiringOnly(true); return; }
            setExpiringOnly(false);
            setStatusFilter(v as StatusFilter);
          }}
          className="input-field"
        >
          <option value="all">Tất cả trạng thái</option>
          {activeTab === 'tenant_contract' ? (
            <>
              {statusesInScope(scope).map((s) => (
                <option key={s} value={s}>{CONTRACT_STATUS[s].label}</option>
              ))}
              {scope !== 'ended' && (
                <option value="expiring">Sắp hết hạn (≤{EXPIRING_WINDOW_DAYS} ngày)</option>
              )}
            </>
          ) : (
            Object.entries(MASTER_LEASE_STATUS)
              .filter(([s]) => inScope(s, scope))
              .map(([s, cfg]) => <option key={s} value={s}>{cfg.label}</option>)
          )}
        </select>

        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="input-field">
          <option value="all">Tất cả bất động sản</option>
          {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {activeTab === 'tenant_contract' ? (
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input-field">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : (
          <div className="hidden xl:block" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          Hiển thị <b className="text-slate-800">{Math.min(PAGE_SIZE, Math.max(0, rows.length - (page - 1) * PAGE_SIZE))}</b> / {rows.length}
          {activeTab === 'tenant_contract' ? ' hợp đồng khách thuê' : ' master lease'}
        </span>
        {filterActive && (
          <button onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 transition hover:bg-slate-200">
            <X className="h-3 w-3" /> Xoá bộ lọc
          </button>
        )}
        {/* Kết quả nằm ngoài nhóm đang xem — không nói ra thì tìm mã HĐ đã chấm dứt sẽ
            ra bảng trống mà không hiểu vì sao. */}
        {hiddenByScope > 0 && (
          <button
            onClick={() => setScope('all')}
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700 transition hover:bg-amber-200"
          >
            <Archive className="h-3 w-3" />
            Còn {hiddenByScope} kết quả ở nhóm {scope === 'active' ? 'đã kết thúc' : 'đang theo dõi'} — xem tất cả
          </button>
        )}
      </div>

      {/* ── Bảng ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="card flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải hợp đồng...
        </div>
      ) : loadError ? (
        <div className="card flex flex-col items-center gap-3 py-14 text-center">
          <ShieldAlert className="h-10 w-10 text-rose-400" />
          <p className="text-sm text-slate-500">Không tải được danh sách hợp đồng.</p>
          <button onClick={load} className="btn-primary">Thử lại</button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState text={
          filterActive
            ? 'Không có hợp đồng nào khớp bộ lọc. Thử xoá bớt điều kiện lọc.'
            : activeTab === 'tenant_contract'
              ? 'Chưa có hợp đồng khách thuê nào.'
              : 'Chưa có master lease nào.'
        } />
      ) : activeTab === 'tenant_contract' ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Mã HĐ</th>
                  <th className="px-4 py-3">Khách thuê</th>
                  <th className="px-4 py-3">Bất động sản</th>
                  <th className="px-4 py-3">Thời hạn</th>
                  <th className="px-4 py-3 text-right">Giá thuê / Cọc</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageContracts.map((c) => {
                  const cfg = statusMeta(c.status);
                  const property = propertyOf(c.propertyId);
                  const expiring = isExpiringSoon(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedContract(c)}
                      title="Bấm để xem chi tiết hợp đồng"
                      className={`cursor-pointer transition hover:bg-indigo-50/40 ${expiring ? 'bg-amber-50/40' : ''}`}
                    >
                      {/* Không in `lessorName`: BE gán nó = propertyName chứ không phải tên
                          bên cho thuê, hiện ra chỉ lặp lại tên nhà ở cột bên cạnh. */}
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs font-bold text-slate-800">{c.code}</p>
                      </td>

                      {/* Tên trống có HAI nguyên nhân khác hẳn nhau, dán chung một nhãn là
                          nói sai: HĐ chưa kích hoạt thì khách chưa có tài khoản (BE chưa
                          trả `draftTenantName`), HĐ đã kết thúc thì BE gỡ hẳn liên kết. */}
                      <td className="px-4 py-3 align-top">
                        <p className={`font-semibold ${c.lesseeName ? 'text-slate-800' : 'italic text-slate-400'}`}>
                          {c.lesseeName
                            || (isEndedContract(c.status) ? 'Đã gỡ liên kết khách' : 'Khách chưa có tài khoản')}
                        </p>
                        <MaskedField value={c.tenantPhone} emptyText="" className="text-xs text-slate-500" />
                      </td>

                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">{houseNameOf(c)}</p>
                        <p className="text-xs text-slate-500">
                          {c.roomCode ? `Phòng ${c.roomCode}` : 'Nguyên căn'}
                          {property?.zoneName ? ` · ${property.zoneName}` : ''}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        <p className="font-semibold tabular-nums">{fmtDate(c.startDate || c.moveInDate)}</p>
                        <p className="tabular-nums text-slate-400">→ {fmtDate(c.endDate)}</p>
                        <RemainingChip status={c.status} endDate={c.endDate} />
                      </td>

                      <td className="px-4 py-3 align-top text-right">
                        <p className="font-bold tabular-nums text-slate-800">{formatCurrency(c.rentAmount)}</p>
                        <p className="text-xs tabular-nums text-slate-400">
                          Cọc {c.deposit ? formatCurrency(c.deposit) : '—'}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cfg.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                        {/* `/host/contracts` không trả lý do chấm dứt — nó nằm trong
                            drawer chi tiết, nên ở bảng chỉ hiện trạng thái. */}
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
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Bất động sản</th>
                  <th className="px-4 py-3">Chủ nhà</th>
                  <th className="px-4 py-3 text-right">Thuê vào / tháng</th>
                  <th className="px-4 py-3 text-right">Cho thuê ra</th>
                  <th className="px-4 py-3">Thời hạn</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageLeases.map((l) => {
                  const cfg = leaseStatusMeta(l.status);
                  const property = propertyOf(l.propertyId);
                  // Doanh thu cho thuê ra của chính căn này — con số Host cần nhất.
                  const running = contracts.filter(
                    (c) => String(c.propertyId) === String(l.propertyId) && c.status === 'ACTIVE',
                  );
                  const revenue = running.reduce((sum, c) => sum + (c.rentAmount ?? 0), 0);
                  const margin = revenue - (l.monthlyRent ?? 0);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedLease(l)}
                      title="Bấm để xem chi tiết master lease"
                      className="cursor-pointer transition hover:bg-cyan-50/40"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">
                          {property?.propertyName ?? `BĐS #${l.propertyId}`}
                        </p>
                        {property?.zoneName && <p className="text-xs text-slate-500">{property.zoneName}</p>}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">{l.ownerName || '—'}</p>
                        {l.contractCode && (
                          <p className="font-mono text-[11px] text-slate-400">{l.contractCode}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top text-right">
                        <p className="font-bold tabular-nums text-slate-800">{formatCurrency(l.monthlyRent ?? 0)}</p>
                      </td>

                      <td className="px-4 py-3 align-top text-right">
                        <p className="font-bold tabular-nums text-slate-800">{formatCurrency(revenue)}</p>
                        <p className={`text-xs font-bold tabular-nums ${margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {margin >= 0 ? '+' : '−'}{formatCurrency(Math.abs(margin))}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        <p className="font-semibold tabular-nums">{fmtDate(l.startDate)}</p>
                        <p className="tabular-nums text-slate-400">→ {fmtDate(l.endDate)}</p>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cfg.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
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
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {selectedContract && (
        <ContractDetailDrawer
          contract={toDetailSeed(selectedContract)}
          property={propertyOf(selectedContract.propertyId)}
          propertyName={houseNameOf(selectedContract)}
          blockedNote={HOST_BLOCKED_NOTE}
          extra={depositCardFor(selectedContract)}
          onClose={() => setSelectedContract(null)}
        />
      )}

      {selectedLease && (
        <MasterLeaseDetailDrawer
          lease={selectedLease}
          property={propertyOf(selectedLease.propertyId)}
          tenantContracts={contracts.filter((c) => String(c.propertyId) === String(selectedLease.propertyId))}
          onClose={() => setSelectedLease(null)}
        />
      )}
    </div>
  );
};
