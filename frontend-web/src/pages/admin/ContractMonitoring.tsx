import { useEffect, useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import type { PropertyResponse, TenantContractResponse } from '@/types/api.types';
import { tenantService } from '@/services/tenant.service';
import { propertyService } from '@/services/property.service';
import { formatCurrency } from '@/utils';
import { SectionShell, StatusPill } from './shared';

const CONTRACT_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  PENDING: { label: 'Chờ kích hoạt', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  ACTIVE: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

// Đồng bộ với mobile-app/src/utils/helpers.ts getContractTerminationTypeLabel().
const TERMINATION_TYPE_LABEL: Record<string, string> = {
  EARLY_MOVE_OUT: 'Trả phòng sớm',
  VIOLATION: 'Vi phạm hợp đồng',
  MUTUAL_AGREEMENT: 'Hai bên thỏa thuận',
  NO_SHOW: 'Không đến nhận nhà (tự động hủy)',
  OTHER: 'Khác',
};
const terminationTypeLabel = (type?: string) => (type ? TERMINATION_TYPE_LABEL[type] ?? 'Khác' : 'Khác');

type StatusFilter = 'all' | keyof typeof CONTRACT_STATUS;

/**
 * "Đón khách" hợp đồng thuê (tenant-contract) — TOÀN BỘ trạng thái, mọi nhà (admin
 * xem hết, khác trang host/contracts/ContractList.tsx chỉ scope theo host đăng nhập).
 * Trước đây trang này 100% mock (PLATFORM_CONTRACTS) — đã thay bằng dữ liệu thật
 * qua GET /tenant-contracts (tenantService.listByStatus, không ép status=DRAFT).
 */
export const ContractMonitoring = () => {
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [properties, setProperties] = useState<Record<number, PropertyResponse>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await tenantService.listByStatus().catch(() => [] as TenantContractResponse[]);
        setContracts(Array.isArray(list) ? list : []);

        const uniquePropertyIds = [...new Set(list.map((c) => c.propertyId).filter(Boolean))];
        if (uniquePropertyIds.length > 0) {
          const fetched = await Promise.all(
            uniquePropertyIds.map((id) => propertyService.getPropertyById(id).catch(() => null)),
          );
          const map: Record<number, PropertyResponse> = {};
          fetched.forEach((p) => { if (p) map[p.id] = p; });
          setProperties(map);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = contracts;
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.tenantFullName?.toLowerCase().includes(q) ||
          c.tenantPhone?.toLowerCase().includes(q) ||
          c.contractCode?.toLowerCase().includes(q),
      );
    }
    // Mới nhất trước — không có createdAt riêng, dùng id (tăng dần theo thời gian tạo).
    return [...list].sort((a, b) => b.id - a.id);
  }, [contracts, statusFilter, search]);

  return (
    <SectionShell
      title="Theo dõi hợp đồng thuê"
      subtitle="Toàn bộ hợp đồng tenant (mọi nhà, mọi trạng thái) — bao gồm hợp đồng bị tự động hủy do khách không đến nhận nhà (NO_SHOW)."
      icon={FileText}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên khách / SĐT / mã HĐ..."
              className="input-field w-64 pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input-field w-48"
          >
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(CONTRACT_STATUS).map(([status, cfg]) => (
              <option key={status} value={status}>{cfg.label}</option>
            ))}
          </select>
        </div>
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Không có hợp đồng nào khớp bộ lọc.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">Mã HĐ</th>
                <th className="px-4 py-3">Khách thuê</th>
                <th className="px-4 py-3">Bất động sản</th>
                <th className="px-4 py-3">Thời hạn</th>
                <th className="px-4 py-3">Giá thuê</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Chấm dứt / Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const property = properties[c.propertyId];
                const cfg = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.DRAFT;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">{c.contractCode}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{c.tenantFullName || '—'}</p>
                      <p className="text-xs text-slate-500">{c.tenantPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{property?.propertyName ?? `Nhà #${c.propertyId}`}</p>
                      <p className="text-xs text-slate-500">{c.roomNumber ? `Phòng ${c.roomNumber}` : 'Nguyên căn'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.moveInDate || '—'} → {c.endDate || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatCurrency(c.rentAmount)}</td>
                    <td className="px-4 py-3"><StatusPill label={cfg.label} color={cfg.color} dot={cfg.dot} /></td>
                    <td className="px-4 py-3 text-xs">
                      {c.status === 'TERMINATED' ? (
                        <>
                          <p className={`font-semibold ${c.terminationType === 'NO_SHOW' ? 'text-rose-600' : 'text-slate-700'}`}>
                            {terminationTypeLabel(c.terminationType)}
                          </p>
                          {c.terminatedAt && <p className="text-slate-400">{c.terminatedAt.slice(0, 10)}</p>}
                          {c.terminationReason && <p className="mt-0.5 text-slate-500">{c.terminationReason}</p>}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
};
