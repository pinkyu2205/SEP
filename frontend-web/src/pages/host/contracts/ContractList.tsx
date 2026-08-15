import { useEffect, useMemo, useState } from 'react';
import {
  Search, FileText, User, DoorOpen, Calendar, ShieldAlert, BadgeCheck,
  Building2, X, Package, Loader2, RefreshCw, CheckCircle2, XCircle, Camera,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hostService } from '@/services/host.service';
import type { HostContractDto, MasterLease, DepositItem } from '@/services/host.service';
import { propertyService } from '@/services/property.service';
import { tenantService } from '@/services/tenant.service';
import type { TenantContractResponse } from '@/types/api.types';
import { MaskedField } from '@/components/MaskedField';
import { formatCurrency } from '@/utils';

/**
 * Hợp đồng phía Host — dữ liệu thật từ /api/v1/host (hostService có sẵn
 * listContracts/approveContract/rejectContract + listMasterLeases).
 * Vai trò chính của Host ở đây: DUYỆT GIÁ hợp đồng manager gửi lên
 * (requireHostPriceApproval từ mobile) — trước đây trang này là mock 100%
 * nên HĐ chờ duyệt giá bị kẹt vĩnh viễn, xem plan cải tiến quy trình.
 * Host chỉ xem + duyệt giá; gia hạn/thanh lý là việc của quản lý vận hành.
 */

type ActiveTab = 'master_lease' | 'tenant_contract';

/** "2 năm" / "18 tháng" từ khoảng start→end; thiếu ngày thì "—". */
const termOf = (c: { startDate?: string; moveInDate?: string; endDate?: string }): string => {
  const from = c.startDate || c.moveInDate;
  if (!from || !c.endDate) return '—';
  const a = new Date(from);
  const b = new Date(c.endDate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '—';
  const months = Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000));
  if (months <= 0) return '—';
  return months % 12 === 0 ? `${months / 12} năm` : `${months} tháng`;
};

/** "20:41 15/08/2026" — mốc chụp ảnh đồng hồ. */
const fmtStamp = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const DEPOSIT_STATUS: Record<string, { label: string; pill: string; box: string }> = {
  HELD: { label: 'Đang giữ', pill: 'bg-cyan-100 text-cyan-700', box: 'border-cyan-200 bg-cyan-50/50' },
  REFUNDED: { label: 'Đã hoàn khách', pill: 'bg-emerald-100 text-emerald-700', box: 'border-emerald-200 bg-emerald-50/50' },
  FORFEITED: { label: 'Đã khấu trừ', pill: 'bg-rose-100 text-rose-700', box: 'border-rose-200 bg-rose-50/50' },
};

/** "= 1 tháng tiền nhà" — giúp đọc ra số tháng cọc mà /host/contracts không trả. */
const depositMonthsOf = (c: { rentAmount?: number; deposit?: number }): string => {
  if (!c.deposit || !c.rentAmount) return '';
  const m = c.deposit / c.rentAmount;
  return Number.isInteger(m) && m > 0 ? `= ${m} tháng tiền nhà` : '';
};

const CONTRACT_TABS = [
  { key: 'tenant_contract' as const, label: 'Quản lý ↔ Khách thuê', icon: User },
  { key: 'master_lease' as const, label: 'Host ↔ Chủ nhà (master lease)', icon: Building2 },
];

const CONTRACT_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  PENDING: { label: 'Chờ kích hoạt', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  ACTIVE: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã thanh lý', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

// Trạng thái duyệt giá (Case 2 — manager gửi Host duyệt). Field optional trên DTO,
// đã đề nghị BE expose trong API-ProcessGaps-BE-TODO.md.
const PRICE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  PENDING_PRICE_APPROVAL: { label: 'Chờ duyệt giá', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  APPROVED_AWAITING_DEPOSIT: { label: 'Đã duyệt giá — chờ cọc', color: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500' },
  PRICE_REJECTED: { label: 'Đã từ chối giá', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

const LEASE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  EXPIRING: { label: 'Sắp hết hạn', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

const FALLBACK_BADGE = { label: '—', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' };

/**
 * HĐ đang cần Host ra quyết định giá. Ưu tiên field priceApprovalStatus nếu BE trả;
 * chưa có field thì fallback status PENDING (approve nhầm HĐ không ở trạng thái chờ
 * duyệt sẽ bị BE 422 → interceptor toast, không hỏng dữ liệu).
 */
const needsPriceDecision = (c: HostContractDto): boolean =>
  c.priceApprovalStatus != null
    ? c.priceApprovalStatus === 'PENDING_PRICE_APPROVAL'
    : c.status === 'PENDING';

/**
 * equipmentSnapshot có 2 đời format: JSON {handoverDate, items:[...]} (HĐ cũ do mobile
 * tự build) và text BE sinh "Giường (Tốt) x1, Tủ lạnh (Mới) x1" — parse phòng thủ cả 2.
 */
function snapshotToLines(snapshot?: string): string[] {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (Array.isArray(items)) {
      return items.map((it: { name?: string; quantity?: number; category?: string }) =>
        `${it.name ?? 'Thiết bị'}${(it.quantity ?? 1) > 1 ? ` x${it.quantity}` : ''}${it.category ? ` — ${it.category}` : ''}`);
    }
  } catch { /* không phải JSON → text BE sinh */ }
  return snapshot.split(/\r?\n/).flatMap((line) => line.split(/,\s+(?=[^\d])/)).map((s) => s.trim()).filter(Boolean);
}

export const ContractList = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tenant_contract');
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [leases, setLeases] = useState<MasterLease[]>([]);
  const [propertyNames, setPropertyNames] = useState<Record<string, string>>({});
  /** Tiền cọc đang giữ, ghép vào hợp đồng theo contractId khi mở chi tiết. */
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  /**
   * Biên bản bàn giao lúc manager đón khách (chỉ số công tơ, ảnh đồng hồ, ảnh phòng…).
   *
   * Nằm trong `GET /api/v1/tenant-contracts/{id}` — endpoint hiện CHẶN ROLE_OWNER (403,
   * xem doc/BE-NEED-host-xem-chi-tiet-hop-dong-2026-08-16.md). FE vẫn gọi và nuốt lỗi:
   * hôm nay khối này lặng lẽ không hiện, ngày BE thêm OWNER vào @PreAuthorize là nó tự
   * hiện ra, không phải sửa lại FE. Cùng cách làm với probeFullAccess ở trang Hoá đơn.
   */
  const [handover, setHandover] = useState<TenantContractResponse | null>(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContract, setSelectedContract] = useState<HostContractDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Từ chối giá cần lý do (manager đọc để chỉnh giá gửi lại) — mở modal riêng.
  const [rejecting, setRejecting] = useState<HostContractDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [contractPage, leaseList, propPage, depositRes] = await Promise.all([
        hostService.listContracts({ page: 0, size: 200 }),
        hostService.listMasterLeases().catch(() => [] as MasterLease[]),
        propertyService.getProperties(0, 200).catch(() => null),
        hostService.getDeposits().catch(() => null),
      ]);
      setContracts(contractPage.content ?? []);
      setLeases(leaseList);
      setDeposits(depositRes?.items ?? []);
      if (propPage) {
        setPropertyNames(Object.fromEntries(propPage.content.map((p) => [String(p.id), p.propertyName])));
      }
    } catch {
      setLoadError(true); /* interceptor đã toast */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // Mở chi tiết HĐ → thử nạp biên bản bàn giao. 403 (chưa mở quyền cho Host) thì bỏ qua.
  useEffect(() => {
    if (!selectedContract) { setHandover(null); return; }
    const id = Number(selectedContract.id);
    if (!Number.isFinite(id)) { setHandover(null); return; }
    let alive = true;
    setHandover(null);
    setHandoverLoading(true);
    tenantService.getById(id)
      .then((res) => { if (alive) setHandover(res); })
      .catch(() => { /* 403 — chưa mở quyền, khối biên bản không hiện */ })
      .finally(() => { if (alive) setHandoverLoading(false); });
    return () => { alive = false; };
  }, [selectedContract]);

  const term = searchTerm.trim().toLowerCase();
  const filteredContracts = useMemo(
    () => contracts.filter((c) =>
      !term ||
      c.code?.toLowerCase().includes(term) ||
      c.lesseeName?.toLowerCase().includes(term) ||
      c.propertyName?.toLowerCase().includes(term)),
    [contracts, term],
  );
  const filteredLeases = useMemo(
    () => leases.filter((l) =>
      !term ||
      l.ownerName?.toLowerCase().includes(term) ||
      (propertyNames[String(l.propertyId)] ?? '').toLowerCase().includes(term)),
    [leases, term, propertyNames],
  );

  const pendingPriceCount = contracts.filter(needsPriceDecision).length;
  const activeCount = contracts.filter((c) => c.status === 'ACTIVE').length;

  const approve = async (c: HostContractDto) => {
    if (!window.confirm(`Duyệt giá hợp đồng ${c.code} — ${formatCurrency(c.rentAmount)}/tháng?`)) return;
    setBusyId(c.id);
    try {
      await hostService.approveContract(c.id);
      toast.success('Đã duyệt giá — quản lý sẽ tiếp tục thu cọc & kích hoạt.');
      setSelectedContract(null);
      load();
    } catch { /* interceptor đã toast */ } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) return toast.error('Nhập lý do từ chối để quản lý biết đường chỉnh giá.');
    setBusyId(rejecting.id);
    try {
      await hostService.rejectContract(rejecting.id, rejectReason.trim());
      toast.success('Đã từ chối giá — quản lý sẽ nhận thông báo để chỉnh và gửi lại.');
      setRejecting(null);
      setRejectReason('');
      setSelectedContract(null);
      load();
    } catch { /* interceptor đã toast */ } finally {
      setBusyId(null);
    }
  };

  const priceBadge = (c: HostContractDto) =>
    c.priceApprovalStatus ? PRICE_STATUS[c.priceApprovalStatus] : undefined;

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hợp đồng</h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi hợp đồng khách thuê & master lease — duyệt giá các hợp đồng quản lý gửi lên.
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><ShieldAlert className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Chờ duyệt giá</p>
            <p className="text-xl font-bold text-slate-900">{pendingPriceCount} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><BadgeCheck className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Đang hiệu lực</p>
            <p className="text-xl font-bold text-slate-900">{activeCount} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 border-l-4 border-l-slate-400">
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><FileText className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Tổng HĐ khách thuê</p>
            <p className="text-xl font-bold text-slate-900">{contracts.length} <span className="text-sm font-normal text-slate-500">hợp đồng</span></p>
          </div>
        </div>
      </div>

      {/* Tabs + Tìm kiếm */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {CONTRACT_TABS.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.key === 'tenant_contract' && pendingPriceCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingPriceCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Tìm theo mã, tên, bất động sản..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-9 text-sm" />
        </div>
      </div>

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
      ) : activeTab === 'tenant_contract' ? (
        /* ── Tab HĐ khách thuê ─────────────────────────────────────────── */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 text-xs">
                <tr>
                  <th className="px-5 py-3.5">Hợp đồng</th>
                  <th className="px-5 py-3.5">Khách thuê</th>
                  <th className="px-5 py-3.5">Nhà / Phòng</th>
                  <th className="px-5 py-3.5">Giá thuê/tháng</th>
                  <th className="px-5 py-3.5">Thời hạn</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5 text-right">Duyệt giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map((c) => {
                  const statusInfo = CONTRACT_STATUS[c.status] ?? FALLBACK_BADGE;
                  const pInfo = priceBadge(c);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelectedContract(c)}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-primary-600 flex items-center gap-1.5 text-xs font-mono">
                          <FileText className="w-3.5 h-3.5" />{c.code}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-900">{c.lesseeName}</span>
                        </div>
                        {c.tenantPhone && <div className="text-xs text-slate-400 mt-0.5">{c.tenantPhone}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{c.propertyName}</div>
                        {c.roomCode && (
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <DoorOpen className="w-3 h-3" /> Phòng {c.roomCode}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(c.rentAmount)}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.startDate || c.moveInDate || '—'}</div>
                        {c.endDate && <div className="mt-0.5">→ {c.endDate}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />{statusInfo.label}
                          </span>
                          {pInfo && (
                            <span className={`inline-flex w-fit items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${pInfo.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${pInfo.dot}`} />{pInfo.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {needsPriceDecision(c) && (
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => approve(c)} disabled={busyId === c.id}
                              className="px-2.5 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt giá
                            </button>
                            <button onClick={() => { setRejecting(c); setRejectReason(''); }} disabled={busyId === c.id}
                              className="px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
                              <XCircle className="w-3.5 h-3.5" /> Từ chối
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredContracts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      Chưa có hợp đồng khách thuê nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Tab master lease ──────────────────────────────────────────── */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-b border-slate-100 text-xs">
                <tr>
                  <th className="px-5 py-3.5">Bất động sản</th>
                  <th className="px-5 py-3.5">Chủ nhà</th>
                  <th className="px-5 py-3.5">Thuê vào/tháng</th>
                  <th className="px-5 py-3.5">Cọc</th>
                  <th className="px-5 py-3.5">Thời hạn</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeases.map((l) => {
                  const statusInfo = LEASE_STATUS[l.status] ?? FALLBACK_BADGE;
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {propertyNames[String(l.propertyId)] ?? `BĐS #${l.propertyId}`}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{l.ownerName}</div>
                        {l.ownerPhone && <div className="text-xs text-slate-400 mt-0.5">{l.ownerPhone}</div>}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(l.monthlyRent)}</td>
                      <td className="px-5 py-4">{formatCurrency(l.deposit)}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{l.startDate}</div>
                        <div className="mt-0.5">→ {l.endDate}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />{statusInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredLeases.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      Chưa có master lease nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal chi tiết HĐ khách thuê */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedContract(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />{selectedContract.code}
              </h2>
              <button onClick={() => setSelectedContract(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const s = CONTRACT_STATUS[selectedContract.status] ?? FALLBACK_BADGE;
                  const p = priceBadge(selectedContract);
                  return (
                    <>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                      </span>
                      {p && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${p.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />{p.label}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Khách thuê</p>
                  <p className="font-semibold text-slate-900">{selectedContract.lesseeName}</p>
                  {selectedContract.tenantCccd && (
                    <MaskedField
                      value={selectedContract.tenantCccd}
                      prefix="CCCD:" emptyText="" head={3} tail={3}
                      className="mt-1 text-xs text-slate-500"
                    />
                  )}
                  {selectedContract.tenantPhone && (
                    <MaskedField
                      value={selectedContract.tenantPhone}
                      prefix="SĐT:" emptyText="" head={3} tail={2}
                      className="mt-0.5 text-xs text-slate-500"
                    />
                  )}
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Bất động sản</p>
                  <p className="font-semibold text-slate-900">{selectedContract.propertyName}</p>
                  {selectedContract.roomCode && <p className="text-sm text-slate-500 mt-0.5">Phòng {selectedContract.roomCode}</p>}
                  {selectedContract.lessorName && <p className="text-xs text-slate-500 mt-1">Quản lý: {selectedContract.lessorName}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Giá thuê/tháng', value: formatCurrency(selectedContract.rentAmount) },
                  {
                    label: 'Tiền cọc',
                    value: selectedContract.deposit != null ? formatCurrency(selectedContract.deposit) : '—',
                    hint: depositMonthsOf(selectedContract),
                  },
                  { label: 'Thời hạn', value: termOf(selectedContract) },
                  // Ngày nhận phòng tách khỏi ngày bắt đầu HĐ: hai mốc này có thể lệch nhau
                  // (khách dọn vào giữa tháng), trước đây moveInDate chỉ dùng làm giá trị
                  // dự phòng cho "Bắt đầu" nên không bao giờ đọc được ngày nhận phòng thật.
                  { label: 'Nhận phòng', value: selectedContract.moveInDate || '—' },
                  { label: 'Bắt đầu', value: selectedContract.startDate || '—' },
                  { label: 'Kết thúc', value: selectedContract.endDate || '—' },
                ].map((item) => (
                  <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
                    {item.hint && <p className="text-[11px] text-slate-400 mt-0.5">{item.hint}</p>}
                  </div>
                ))}
              </div>

              {/* ── Đón khách: tiền cọc đang giữ ────────────────────────────────
                  Nguồn: /host/finance/deposits (host gọi được). Đây là khoản thu lúc
                  manager đón khách và là tiền công ty ĐANG GIỮ HỘ, sẽ hoàn khi trả phòng. */}
              {(() => {
                const cid = Number(selectedContract.id);
                const dep = deposits.find((d) => d.contractId === cid);
                if (!dep) return null;
                const meta = DEPOSIT_STATUS[dep.status] ?? DEPOSIT_STATUS.HELD;
                return (
                  <div className={`rounded-xl border p-4 ${meta.box}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase text-slate-500">Tiền cọc đã thu lúc đón khách</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(dep.amount)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Giữ từ {dep.heldSince}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${meta.pill}`}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })()}
              {/* ── Biên bản bàn giao lúc manager đón khách ──────────────────────
                  Chỉ số công tơ chốt lúc nhận phòng + ảnh mặt đồng hồ + ảnh hiện trạng
                  phòng. Ẩn hoàn toàn khi BE chưa mở quyền cho Host (403). */}
              {handoverLoading && (
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải biên bản bàn giao…
                </p>
              )}
              {handover && (() => {
                const photos = handover.roomConditionPhotos?.length
                  ? handover.roomConditionPhotos
                  : (handover.roomConditionUrls ?? []).map((url) => ({ url, capturedAt: undefined }));
                const meters = [
                  {
                    label: 'Chỉ số điện', unit: 'kWh',
                    value: handover.initialElectricReading,
                    img: handover.electricMeterImageUrl, at: handover.electricMeterCapturedAt,
                  },
                  {
                    label: 'Chỉ số nước', unit: 'm³',
                    value: handover.initialWaterReading,
                    img: handover.waterMeterImageUrl, at: handover.waterMeterCapturedAt,
                  },
                ].filter((m) => m.value != null || m.img);
                if (meters.length === 0 && photos.length === 0 && !handover.roomConditionNote) return null;
                return (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-primary-600" />
                      Biên bản bàn giao lúc đón khách
                    </h3>

                    {meters.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {meters.map((m) => (
                          <div key={m.label} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">{m.label}</p>
                            <p className="text-lg font-black text-slate-900 mt-0.5">
                              {m.value != null ? `${m.value.toLocaleString('vi-VN')} ${m.unit}` : '—'}
                            </p>
                            {m.img ? (
                              <a href={m.img} target="_blank" rel="noreferrer"
                                className="mt-2 block overflow-hidden rounded-lg border border-slate-200">
                                <img src={m.img} alt={`Ảnh ${m.label.toLowerCase()}`}
                                  className="h-28 w-full object-cover transition hover:scale-105" />
                              </a>
                            ) : (
                              <p className="mt-2 rounded-lg bg-slate-50 px-2 py-3 text-center text-xs text-slate-400">
                                Không có ảnh đồng hồ
                              </p>
                            )}
                            {m.at && <p className="mt-1 text-[11px] text-slate-400">Chụp {fmtStamp(m.at)}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {photos.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-slate-500 mb-2">
                          Ảnh hiện trạng phòng ({photos.length})
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {photos.map((p) => (
                            <a key={p.url} href={p.url} target="_blank" rel="noreferrer"
                              className="block overflow-hidden rounded-lg border border-slate-200">
                              <img src={p.url} alt="Hiện trạng phòng lúc bàn giao"
                                className="h-24 w-full object-cover transition hover:scale-105" />
                            </a>
                          ))}
                        </div>
                      </>
                    )}

                    {handover.roomConditionNote && (
                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <b>Ghi chú hiện trạng:</b> {handover.roomConditionNote}
                      </p>
                    )}
                  </div>
                );
              })()}

              {(() => {
                const lines = snapshotToLines(selectedContract.equipmentSnapshot);
                if (lines.length === 0) return null;
                return (
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary-600" />
                      Nội thất bàn giao ({lines.length} món)
                    </h3>
                    <ul className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1.5">
                      {lines.map((line, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />{line}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              {needsPriceDecision(selectedContract) && (
                <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                  <button onClick={() => { setRejecting(selectedContract); setRejectReason(''); }}
                    disabled={busyId === selectedContract.id}
                    className="btn-secondary flex items-center gap-2 !text-rose-600">
                    <XCircle className="w-4 h-4" /> Từ chối giá
                  </button>
                  <button onClick={() => approve(selectedContract)} disabled={busyId === selectedContract.id}
                    className="btn-primary flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {busyId === selectedContract.id ? 'Đang xử lý...' : 'Duyệt giá'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal từ chối giá — bắt buộc lý do để manager biết đường chỉnh */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setRejecting(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900">Từ chối giá — {rejecting.code}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Giá đề xuất: <span className="font-semibold text-slate-800">{formatCurrency(rejecting.rentAmount)}/tháng</span>.
              Lý do sẽ gửi tới quản lý để chỉnh giá và gửi duyệt lại.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="VD: Giá thấp hơn mặt bằng khu vực, đề nghị tối thiểu 8,5tr..."
              className="input-field mt-4 w-full text-sm"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setRejecting(null)} className="btn-secondary" disabled={busyId === rejecting.id}>Hủy</button>
              <button onClick={submitReject} disabled={busyId === rejecting.id} className="btn-primary !bg-rose-600 hover:!bg-rose-700">
                {busyId === rejecting.id ? 'Đang gửi...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
