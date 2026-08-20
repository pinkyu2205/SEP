import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, CalendarClock, ChevronRight, ClipboardList, FileText,
  Loader2, RefreshCw, Search, Users, Wallet, X,
} from 'lucide-react';
import { MaskedField } from '@/components/MaskedField';
import type { PropertyResponse, TenantContractResponse } from '@/types/api.types';
import { tenantService } from '@/services/tenant.service';
import { propertyService } from '@/services/property.service';
import { formatCurrency } from '@/utils';
import { EmptyState, Pagination, SectionShell, StatCard, StatusPill } from './shared';
import { ContractDetailDrawer } from '@/components/contract/ContractDetailDrawer';
import {
  CONTRACT_STATUS, EXPIRING_WINDOW_DAYS, SCOPE_OPTIONS, SORT_OPTIONS, daysLeft, fmtDate,
  inScope, isEndedContract, isExpiringSoon, sortContracts, statusMeta, statusesInScope,
  terminationTypeLabel, type ContractScope, type SortKey, type StatusFilter,
} from '@/components/contract/contractLabels';

/**
 * THEO DÕI HỢP ĐỒNG THUÊ (Admin) — toàn bộ hợp đồng tenant của mọi nhà, mọi trạng thái
 * (khác trang host/contracts/ContractList.tsx chỉ scope theo host đăng nhập).
 * Nguồn: GET /tenant-contracts (không ép status) — không còn mock.
 *
 * Trang này để admin TRẢ LỜI NHANH ba câu, nên bố cục cũng theo đúng thứ tự đó:
 *   1. Hệ thống đang có bao nhiêu hợp đồng ở trạng thái nào  → hàng thẻ số liệu (bấm để lọc)
 *   2. Tìm đúng hợp đồng đang cần                            → ô tìm kiếm + 4 bộ lọc + sắp xếp
 *   3. Hợp đồng đó có gì trong đó                            → bấm một dòng, mở drawer chi tiết
 *
 * Thẻ "Sắp hết hạn" quan trọng nhất: hợp đồng còn ≤ 60 ngày mà không ai để ý thì tới lúc
 * biết đã là phòng trống. Bảng cũng gắn nhãn đếm ngược ngay trên cột thời hạn.
 */

const PAGE_SIZE = 10;

/** Nhãn đếm ngược ở cột thời hạn — chỉ có nghĩa với HĐ đang chạy. */
const RemainingChip = ({ contract }: { contract: TenantContractResponse }) => {
  if (contract.status !== 'ACTIVE') return null;
  const left = daysLeft(contract.endDate);
  if (left == null) return null;
  if (left < 0) {
    return <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">Quá hạn {-left} ngày</span>;
  }
  if (left <= EXPIRING_WINDOW_DAYS) {
    return <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Còn {left} ngày</span>;
  }
  return <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">Còn {left} ngày</span>;
};

export const ContractMonitoring = () => {
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [properties, setProperties] = useState<Record<number, PropertyResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  /** Nhóm đang xem — mặc định ẩn hợp đồng đã kết thúc, xem `ContractScope`. */
  const [scope, setScope] = useState<ContractScope>('active');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  /** Bộ lọc phụ không nằm trong `status`: hợp đồng sắp hết hạn. */
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<TenantContractResponse | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Tải hỏng và danh sách rỗng trông giống hệt nhau nếu nuốt lỗi — tách hẳn hai
        // trường hợp để admin không tưởng hệ thống chưa có hợp đồng nào.
        let rows: TenantContractResponse[] = [];
        try {
          const list = await tenantService.listByStatus();
          rows = Array.isArray(list) ? list : [];
        } catch {
          if (!alive) return;
          setError('Không tải được danh sách hợp đồng từ máy chủ. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò ADMIN).');
        }
        if (!alive) return;
        setContracts(rows);

        // Tên nhà/khu vực/địa chỉ nằm ở Property, hợp đồng chỉ có propertyId — nạp một
        // lần cho các id xuất hiện trong danh sách rồi tra ngược (nhà nào lỗi thì bỏ qua,
        // dòng đó tự fallback về "Nhà #id" chứ không làm hỏng cả bảng).
        const ids = [...new Set(rows.map((c) => c.propertyId).filter(Boolean))];
        if (ids.length > 0) {
          const fetched = await Promise.all(ids.map((id) => propertyService.getPropertyById(id).catch(() => null)));
          if (!alive) return;
          const map: Record<number, PropertyResponse> = {};
          fetched.forEach((p) => { if (p) map[p.id] = p; });
          setProperties(map);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  /** Danh sách nhà & khu vực cho 2 ô lọc — chỉ lấy những cái thực sự có hợp đồng. */
  const { propertyOptions, zoneOptions } = useMemo(() => {
    const props = new Map<number, string>();
    const zones = new Set<string>();
    contracts.forEach((c) => {
      const p = properties[c.propertyId];
      props.set(c.propertyId, p?.propertyName ?? `Nhà #${c.propertyId}`);
      if (p?.zoneName) zones.add(p.zoneName);
    });
    return {
      propertyOptions: [...props.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      zoneOptions: [...zones].sort((a, b) => a.localeCompare(b, 'vi')),
    };
  }, [contracts, properties]);

  const stats = useMemo(() => {
    const by = (s: string) => contracts.filter((c) => c.status === s).length;
    const active = contracts.filter((c) => c.status === 'ACTIVE');
    return {
      total: contracts.length,
      active: active.length,
      pending: by('PENDING'),
      draft: by('DRAFT'),
      expiring: contracts.filter(isExpiringSoon).length,
      terminated: by('TERMINATED') + by('EXPIRED'),
      // Doanh thu thuê đang chạy — tổng giá thuê/tháng của HĐ còn hiệu lực.
      activeRent: active.reduce((sum, c) => sum + (c.rentAmount ?? 0), 0),
    };
  }, [contracts]);

  /** Điều kiện lọc KHÔNG tính nhóm — dùng lại để đếm kết quả nằm ở nhóm khác. */
  const matchesFilters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (c: TenantContractResponse) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (expiringOnly && !isExpiringSoon(c)) return false;
      if (propertyFilter !== 'all' && String(c.propertyId) !== propertyFilter) return false;
      if (zoneFilter !== 'all' && properties[c.propertyId]?.zoneName !== zoneFilter) return false;
      if (!q) return true;
      const p = properties[c.propertyId];
      return [
        c.contractCode, c.tenantFullName, c.tenantPhone, c.tenantCccd,
        c.roomNumber, c.assignedManagerName, p?.propertyName, p?.shortAddress, p?.zoneName,
      ].some((v) => v?.toLowerCase().includes(q));
    };
  }, [properties, statusFilter, expiringOnly, propertyFilter, zoneFilter, search]);

  const filtered = useMemo(
    () => sortContracts(contracts.filter((c) => inScope(c.status, scope) && matchesFilters(c)), sort),
    [contracts, scope, matchesFilters, sort],
  );

  /**
   * Số hợp đồng khớp bộ lọc nhưng nằm NGOÀI nhóm đang xem. Không có con số này thì tìm mã
   * một hợp đồng đã chấm dứt sẽ ra bảng trống mà không hiểu vì sao — lỗi kinh điển của
   * kiểu "mặc định ẩn".
   */
  const hiddenByScope = useMemo(
    () => (scope === 'all' ? 0 : contracts.filter((c) => !inScope(c.status, scope) && matchesFilters(c)).length),
    [contracts, scope, matchesFilters],
  );

  const scopeCounts = useMemo(() => ({
    active: contracts.filter((c) => !isEndedContract(c.status)).length,
    ended: contracts.filter((c) => isEndedContract(c.status)).length,
    all: contracts.length,
  }), [contracts]);

  // Đổi bộ lọc mà vẫn đứng ở trang 5 thì thấy bảng trống — luôn về trang đầu.
  useEffect(() => {
    setPage(1);
  }, [scope, statusFilter, expiringOnly, propertyFilter, zoneFilter, search, sort]);

  // Đổi nhóm mà giữ lại trạng thái không thuộc nhóm đó thì bảng rỗng oan.
  useEffect(() => {
    if (statusFilter !== 'all' && !inScope(statusFilter, scope)) setStatusFilter('all');
  }, [scope, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const filterActive =
    statusFilter !== 'all' || expiringOnly || propertyFilter !== 'all' || zoneFilter !== 'all' || !!search.trim();

  const resetFilters = () => {
    setStatusFilter('all');
    setExpiringOnly(false);
    setPropertyFilter('all');
    setZoneFilter('all');
    setSearch('');
  };

  /** Thẻ số liệu bấm lần nữa là bỏ lọc — tránh phải đi tìm nút reset. */
  const toggleStatus = (s: StatusFilter) => {
    setExpiringOnly(false);
    // Chọn một trạng thái thì tự nhảy sang đúng nhóm chứa nó, không bắt bấm hai lần.
    setScope(isEndedContract(s) ? 'ended' : 'active');
    setStatusFilter((prev) => (prev === s ? 'all' : s));
  };

  return (
    <SectionShell
      title="Theo dõi hợp đồng thuê"
      subtitle="Toàn bộ hợp đồng khách thuê của mọi nhà, mọi trạng thái — gồm cả hợp đồng bị tự động huỷ do khách không đến nhận nhà (NO_SHOW). Bấm một dòng để xem chi tiết."
      icon={FileText}
      action={
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      }
    >
      {error && !loading && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Thẻ số liệu: bấm để lọc nhanh ─────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Tổng hợp đồng" value={stats.total} icon={ClipboardList} tone="slate"
          helper={`${stats.active} đang chạy`}
        />
        <StatCard
          title="Đang hiệu lực" value={stats.active} icon={Users} tone="emerald"
          helper={formatCurrency(stats.activeRent) + '/tháng'}
          progress={stats.total ? stats.active / stats.total : 0}
          active={statusFilter === 'ACTIVE' && !expiringOnly}
          onClick={() => toggleStatus('ACTIVE')}
        />
        <StatCard
          title="Chờ kích hoạt" value={stats.pending} icon={Wallet} tone="amber"
          helper="Đã ký, chờ thu tiền / đón khách"
          progress={stats.total ? stats.pending / stats.total : 0}
          active={statusFilter === 'PENDING' && !expiringOnly}
          onClick={() => toggleStatus('PENDING')}
        />
        <StatCard
          title="Chờ đón khách" value={stats.draft} icon={FileText} tone="indigo"
          helper="Đã lập hồ sơ, chưa giao phòng"
          progress={stats.total ? stats.draft / stats.total : 0}
          active={statusFilter === 'DRAFT' && !expiringOnly}
          onClick={() => toggleStatus('DRAFT')}
        />
        <StatCard
          title={`Sắp hết hạn ≤${EXPIRING_WINDOW_DAYS}n`} value={stats.expiring} icon={CalendarClock} tone="rose"
          helper="Cần chốt gia hạn sớm"
          progress={stats.active ? stats.expiring / stats.active : 0}
          active={expiringOnly}
          onClick={() => { setStatusFilter('all'); setExpiringOnly((v) => !v); }}
        />
        {/* Thẻ này đếm cả TERMINATED lẫn EXPIRED nên phải chuyển NHÓM, không lọc theo
            một trạng thái — lọc 'TERMINATED' thì số hiện và số ra bảng lệch nhau. */}
        <StatCard
          title="Đã kết thúc" value={stats.terminated} icon={Archive} tone="violet"
          helper="Chấm dứt + hết hạn · xem ở nhóm riêng"
          progress={stats.total ? stats.terminated / stats.total : 0}
          active={scope === 'ended'}
          onClick={() => { setScope('ended'); setStatusFilter('all'); setExpiringOnly(false); }}
        />
      </div>

      {/* ── Nhóm hồ sơ: đang theo dõi / đã kết thúc ───────────────────────── */}
      <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
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

      {/* ── Bộ lọc ────────────────────────────────────────────────────────── */}
      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã HĐ, tên khách, SĐT, CCCD, toà nhà, phòng, quản lý..."
            className="input-field pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
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
          {statusesInScope(scope).map((status) => (
            <option key={status} value={status}>{CONTRACT_STATUS[status].label}</option>
          ))}
          {scope !== 'ended' && (
            <option value="expiring">Sắp hết hạn (≤{EXPIRING_WINDOW_DAYS} ngày)</option>
          )}
        </select>

        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="input-field">
          <option value="all">Tất cả khu vực</option>
          {zoneOptions.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>

        <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="input-field">
          <option value="all">Tất cả toà nhà</option>
          {propertyOptions.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input-field">
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          Hiển thị <b className="text-slate-800">{pageRows.length}</b> / {filtered.length} hợp đồng
          {filtered.length !== contracts.length && <> (tổng {contracts.length})</>}
        </span>
        {filterActive && (
          <button onClick={resetFilters} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 transition hover:bg-slate-200">
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

      {/* ── Bảng ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="mb-3 h-7 w-7 animate-spin text-indigo-500" />
          <p className="text-sm text-slate-400">Đang tải hợp đồng...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState text={
          error
            ? 'Chưa tải được dữ liệu — bấm "Làm mới" để thử lại.'
            : contracts.length === 0
              ? 'Chưa có hợp đồng khách thuê nào trong hệ thống.'
              : 'Không có hợp đồng nào khớp bộ lọc. Thử xoá bớt điều kiện lọc.'
        } />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                {pageRows.map((c) => {
                  const property = properties[c.propertyId];
                  const cfg = statusMeta(c.status);
                  const expiring = isExpiringSoon(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(c)}
                      title="Bấm để xem chi tiết hợp đồng"
                      className={`cursor-pointer transition hover:bg-indigo-50/40 ${expiring ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs font-bold text-slate-800">{c.contractCode || `#${c.id}`}</p>
                        {c.assignedManagerName && (
                          <p className="mt-1 text-[11px] text-slate-400">QL: {c.assignedManagerName}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">{c.tenantFullName || '—'}</p>
                        <MaskedField value={c.tenantPhone} emptyText="" className="text-xs text-slate-500" />
                      </td>

                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-800">{property?.propertyName ?? `Nhà #${c.propertyId}`}</p>
                        <p className="text-xs text-slate-500">
                          {c.roomNumber ? `Phòng ${c.roomNumber}` : 'Nguyên căn'}
                          {property?.zoneName ? ` · ${property.zoneName}` : ''}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        <p className="font-semibold tabular-nums">{fmtDate(c.moveInDate)}</p>
                        <p className="tabular-nums text-slate-400">→ {fmtDate(c.endDate)}</p>
                        <RemainingChip contract={c} />
                      </td>

                      <td className="px-4 py-3 align-top text-right">
                        <p className="font-bold tabular-nums text-slate-800">{formatCurrency(c.rentAmount)}</p>
                        <p className="text-xs tabular-nums text-slate-400">
                          Cọc {c.deposit ? formatCurrency(c.deposit) : '—'}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <StatusPill label={cfg.label} color={cfg.color} dot={cfg.dot} />
                        {c.status === 'TERMINATED' && (
                          <p className={`mt-1 text-[11px] font-semibold ${c.terminationType === 'NO_SHOW' ? 'text-rose-600' : 'text-slate-500'}`}>
                            {terminationTypeLabel(c.terminationType)}
                            {c.terminatedAt && <span className="font-normal text-slate-400"> · {fmtDate(c.terminatedAt)}</span>}
                          </p>
                        )}
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

      {selected && (
        <ContractDetailDrawer
          contract={selected}
          property={properties[selected.propertyId]}
          onClose={() => setSelected(null)}
        />
      )}
    </SectionShell>
  );
};
