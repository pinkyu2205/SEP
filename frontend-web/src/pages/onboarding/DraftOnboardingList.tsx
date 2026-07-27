import { useEffect, useMemo, useState } from 'react';
import {
  FilePlus, FileSpreadsheet, RefreshCw, Trash2, Building2, Phone, CalendarClock,
  CheckCircle2, FileDown, Pencil, Search, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PropertyResponse, TenantContractResponse } from '../../types/api.types';
import { tenantService } from '../../services/tenant.service';
import { propertyService } from '../../services/property.service';
import { formatCurrency } from '../../utils';
import { openContractBlob } from '../../utils/contractFile';
import { DraftContractFormModal } from './DraftContractFormModal';
import { DraftContractImportModal } from './DraftContractImportModal';

// Che bớt SĐT khách khi hiện danh sách (tránh lộ lọt PII lúc lướt/chụp màn hình) —
// giữ 3 số đầu + 2 số cuối, admin bấm icon mắt để xem đầy đủ khi cần liên hệ.
const maskPhone = (phone?: string | null): string => {
  if (!phone) return '—';
  const digits = phone.trim();
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 3)}•••${digits.slice(-2)}`;
};

/**
 * Trang "Đón khách — Hợp đồng nháp" (admin).
 * Liệt kê các hợp đồng ở trạng thái DRAFT, nhóm theo nhà; tạo mới; hủy.
 * Quản lý phụ trách hợp đồng LUÔN = quản lý vận hành của nhà (operationManagerId,
 * BE tự gán) — không còn thao tác gán/đổi quản lý riêng cho từng hợp đồng ở đây.
 */
export const DraftOnboardingList = () => {
  const [drafts, setDrafts] = useState<TenantContractResponse[]>([]);
  const [properties, setProperties] = useState<Record<number, PropertyResponse>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<TenantContractResponse | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  // Filter theo "Đã gán/Chưa gán" cũ đã bỏ (mô hình mới luôn tự gán quản lý khi
  // tạo) — thay bằng filter theo trạng thái FILE hợp đồng (liên quan trực tiếp tới
  // auto-print lúc import: lọc ra dòng lỗi chưa có file để xử lý tay) + sort theo
  // ngày đón khách/thứ tự tạo.
  const [fileFilter, setFileFilter] = useState<'all' | 'has_file' | 'no_file'>('all');
  const [sortBy, setSortBy] = useState<'created_desc' | 'reception_asc'>('created_desc');
  const [revealedPhones, setRevealedPhones] = useState<Set<number>>(new Set());
  const togglePhoneReveal = (id: number) =>
    setRevealedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fetchData = async () => {
    setLoading(true);
    try {
      const list = await tenantService.listDrafts().catch(() => [] as TenantContractResponse[]);
      const safeList = Array.isArray(list) ? list : [];
      setDrafts(safeList);

      // Nạp thông tin nhà (tên, quản lý vận hành) cho các property xuất hiện
      // trong danh sách nháp — dùng để nhóm + hiển thị.
      const uniquePropertyIds = [...new Set(safeList.map((d) => d.propertyId).filter(Boolean))];
      const missingIds = uniquePropertyIds.filter((id) => !properties[id]);
      if (missingIds.length > 0) {
        const fetched = await Promise.all(
          missingIds.map((id) => propertyService.getPropertyById(id).catch(() => null)),
        );
        setProperties((prev) => {
          const next = { ...prev };
          fetched.forEach((p) => { if (p) next[p.id] = p; });
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const viewContract = async (d: TenantContractResponse) => {
    setViewingId(d.id);
    try {
      const blob = await tenantService.viewContractDocument(d.id);
      // PDF (file mới) preview tab mới; DOCX (HĐ cũ) tải về — theo Content-Type.
      openContractBlob(blob, d.contractCode);
    } catch {
      toast.error('Không tải được file hợp đồng.');
    } finally {
      setViewingId(null);
    }
  };

  const cancelDraft = async (d: TenantContractResponse) => {
    if (!window.confirm(`Hủy hợp đồng nháp ${d.contractCode || d.tenantFullName}?`)) return;
    try {
      await tenantService.cancel(d.id);
      toast.success('Đã hủy hợp đồng nháp.');
      fetchData();
    } catch {
      /* interceptor toast */
    }
  };

  // ─── Lọc + sort + nhóm theo nhà ───────────────────────────────────────────
  const filteredDrafts = useMemo(() => {
    let list = drafts;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.tenantFullName?.toLowerCase().includes(q) ||
          d.tenantPhone?.toLowerCase().includes(q) ||
          d.contractCode?.toLowerCase().includes(q),
      );
    }
    if (fileFilter === 'has_file') list = list.filter((d) => !!d.contractFileAvailable);
    if (fileFilter === 'no_file') list = list.filter((d) => !d.contractFileAvailable);

    const sorted = [...list];
    if (sortBy === 'reception_asc') {
      // Chưa có ngày dự kiến thì xếp cuối — không phải giá trị "gần nhất" hợp lệ.
      sorted.sort((a, b) => {
        if (!a.expectedReceptionDate && !b.expectedReceptionDate) return b.id - a.id;
        if (!a.expectedReceptionDate) return 1;
        if (!b.expectedReceptionDate) return -1;
        return a.expectedReceptionDate.localeCompare(b.expectedReceptionDate);
      });
    } else {
      // id lớn hơn = tạo sau (không có field createdAt riêng) → mới tạo trước.
      sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [drafts, search, fileFilter, sortBy]);

  const groups = useMemo(() => {
    const map = new Map<number, TenantContractResponse[]>();
    filteredDrafts.forEach((d) => {
      const key = d.propertyId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return [...map.entries()]
      .map(([propertyId, items]) => ({ propertyId, property: properties[propertyId], items }))
      .sort((a, b) => (a.property?.propertyName || '').localeCompare(b.property?.propertyName || '', 'vi'));
  }, [filteredDrafts, properties]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đón khách — Hợp đồng nháp</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tạo hợp đồng nháp sau khi khách xem nhà — quản lý vận hành của nhà sẽ tự động phụ trách đón khách & thu cọc.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Excel
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <FilePlus className="h-4 w-4" /> Tạo hợp đồng nháp
          </button>
        </div>
      </div>

      {/* Search + Sort + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên khách / SĐT / mã hợp đồng..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none"
        >
          <option value="created_desc">Sắp xếp: Mới tạo trước</option>
          <option value="reception_asc">Sắp xếp: Ngày đón khách gần nhất</option>
        </select>
        <select
          value={fileFilter}
          onChange={(e) => setFileFilter(e.target.value as typeof fileFilter)}
          className="rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none"
        >
          <option value="all">Lọc file: Tất cả</option>
          <option value="has_file">Đã có file</option>
          <option value="no_file">Chưa có file</option>
        </select>
      </div>

      {/* List — nhóm theo nhà */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <FilePlus className="mb-3 h-12 w-12 text-slate-300" />
          <p className="font-medium">Chưa có hợp đồng nháp nào.</p>
          <p className="mt-1 text-sm text-slate-400">Bấm "Tạo hợp đồng nháp" để bắt đầu đón khách.</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Search className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium">Không khớp kết quả.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {groups.map(({ propertyId, property, items }) => (
            <div key={propertyId} className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Group header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {property?.propertyName || `Nhà #${propertyId}`}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {property?.shortAddress} · {items.length} hợp đồng nháp
                    {property?.operationManagerName ? ` · Quản lý: ${property.operationManagerName}` : ''}
                  </p>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {items.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{d.tenantFullName || 'Khách chưa đặt tên'}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                            <Phone className="h-3 w-3" />
                            {revealedPhones.has(d.id) ? (d.tenantPhone || '—') : maskPhone(d.tenantPhone)}
                            {d.tenantPhone && (
                              <button
                                type="button"
                                onClick={() => togglePhoneReveal(d.id)}
                                title={revealedPhones.has(d.id) ? 'Ẩn số điện thoại' : 'Hiện số điện thoại'}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {revealedPhones.has(d.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </button>
                            )}
                            {d.contractCode && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{d.contractCode}</span>}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Nháp</span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                        <p className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                          {d.roomNumber ? `Phòng ${d.roomNumber}` : 'Nguyên căn'} · {formatCurrency(d.rentAmount)}/tháng · cọc {formatCurrency(d.deposit)}
                        </p>
                        {d.expectedReceptionDate && (
                          <p className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Dự kiến đón: {d.expectedReceptionDate}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5">
                          {d.assignedManagerName ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              Quản lý phụ trách: {d.assignedManagerName}
                            </>
                          ) : (
                            <span className="italic text-amber-600">Chưa có quản lý phụ trách</span>
                          )}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => setEditing(d)}
                          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Sửa
                        </button>
                        {d.contractFileAvailable && (
                          <button
                            onClick={() => viewContract(d)}
                            disabled={viewingId === d.id}
                            className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
                          >
                            <FileDown className="h-3.5 w-3.5" /> {viewingId === d.id ? 'Đang tải...' : 'File HĐ'}
                          </button>
                        )}
                        <button
                          onClick={() => cancelDraft(d)}
                          className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Hủy
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <DraftContractFormModal onClose={() => setShowCreate(false)} onSuccess={fetchData} />
      )}
      {showImport && (
        <DraftContractImportModal onClose={() => setShowImport(false)} onImported={fetchData} />
      )}

      {editing && (
        <DraftContractFormModal editContract={editing} onClose={() => setEditing(null)} onSuccess={fetchData} />
      )}
    </div>
  );
};
