import { useEffect, useMemo, useState } from 'react';
import {
  Search, FileText, User, DoorOpen, Calendar, ShieldAlert, BadgeCheck,
  Building2, X, Package, Loader2, RefreshCw, CheckCircle2, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hostService } from '@/services/host.service';
import type { HostContractDto, MasterLease } from '@/services/host.service';
import { propertyService } from '@/services/property.service';
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
      const [contractPage, leaseList, propPage] = await Promise.all([
        hostService.listContracts({ page: 0, size: 200 }),
        hostService.listMasterLeases().catch(() => [] as MasterLease[]),
        propertyService.getProperties(0, 200).catch(() => null),
      ]);
      setContracts(contractPage.content ?? []);
      setLeases(leaseList);
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Giá thuê/tháng', value: formatCurrency(selectedContract.rentAmount) },
                  { label: 'Tiền cọc', value: selectedContract.deposit != null ? formatCurrency(selectedContract.deposit) : '—' },
                  { label: 'Bắt đầu', value: selectedContract.startDate || selectedContract.moveInDate || '—' },
                  { label: 'Kết thúc', value: selectedContract.endDate || '—' },
                ].map((item) => (
                  <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
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
