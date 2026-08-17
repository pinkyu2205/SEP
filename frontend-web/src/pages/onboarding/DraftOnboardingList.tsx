import { useEffect, useMemo, useState } from 'react';
import {
  FilePlus, FileSpreadsheet, RefreshCw, Trash2, Phone, CalendarClock,
  FileDown, Pencil, Search, Eye, EyeOff, Users, AlertTriangle,
  CalendarDays, FileWarning, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PropertyResponse, TenantContractResponse } from '../../types/api.types';
import { tenantService } from '../../services/tenant.service';
import { propertyService } from '../../services/property.service';
import { formatCurrency } from '../../utils';
import { normalizeVi } from '../../utils/helpers';
import { todayIso } from '../../utils/serverTime';
import { fmtDate } from '../../utils/period';
import { openContractBlob } from '../../utils/contractFile';
import { StatCard, Pagination } from '../admin/shared';
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
 * 20 dòng/trang. KHÔNG dùng `PAGE_SIZE` (=6) của các trang admin khác: ở đó mỗi bản ghi
 * là một thẻ lớn, còn đây là bảng dòng mảnh — 6 dòng/trang thì 80 hồ sơ thành 14 trang,
 * bấm số trang nhiều hơn là đọc dữ liệu.
 */
const ROWS_PER_PAGE = 20;

/** So khớp không dấu trên nhiều trường — gõ "quan" ra "Nguyễn Minh Quân". */
const matchVi = (term: string, ...fields: (string | number | null | undefined)[]): boolean => {
  const t = normalizeVi(term.trim());
  if (!t) return true;
  return fields.some((f) => f != null && normalizeVi(String(f)).includes(t));
};

/**
 * Cộng ngày vào chuỗi 'yyyy-MM-dd' (so sánh chuỗi được vì cùng định dạng).
 *
 * Ghép tay từ getFullYear/getMonth/getDate chứ KHÔNG `toISOString().slice(0,10)`:
 * hàm đó trả ngày theo UTC, mà `new Date('2026-08-17T00:00:00')` là nửa đêm GIỜ ĐỊA
 * PHƯƠNG — ở VN (UTC+7) quy sang UTC là 17:00 ngày hôm trước, nên kết quả lùi mất
 * một ngày. Xem cảnh báo tương tự ở mobile-app/src/utils/serverTime.ts.
 */
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Số ngày đã trễ so với ngày dự kiến đón (>0 = quá hạn). */
const overdueDays = (iso: string, today: string): number =>
  Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);

type ScheduleFilter = 'all' | 'overdue' | 'today' | 'week' | 'no_date';
type FileFilter = 'all' | 'has_file' | 'no_file';
type SortKey = 'created_desc' | 'reception_asc';

const SCHEDULE_OPTIONS: { key: ScheduleFilter; label: string }[] = [
  { key: 'all', label: 'Lịch đón: Tất cả' },
  { key: 'overdue', label: 'Quá hạn đón' },
  { key: 'today', label: 'Đón hôm nay' },
  { key: 'week', label: 'Trong 7 ngày tới' },
  { key: 'no_date', label: 'Chưa đặt ngày đón' },
];

/**
 * Trang "Hồ sơ đón khách" (admin).
 *
 * Liệt kê hợp đồng khách thuê đang ở trạng thái DRAFT — tức hồ sơ đã lập sau khi khách
 * xem nhà, đang chờ quản lý tới đón khách + thu cọc để chuyển sang ACTIVE.
 *
 * Tên cũ của trang là "Hợp đồng nháp" — đó là tên trạng thái trong DB (`status = DRAFT`),
 * đọc lên nghe như bản nháp có thể bỏ, trong khi thực chất đây là việc đang chờ làm.
 *
 * Quản lý phụ trách hợp đồng LUÔN = quản lý vận hành của nhà (operationManagerId, BE tự
 * gán) — không có thao tác gán/đổi quản lý riêng cho từng hồ sơ ở đây.
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
  const [propertyFilter, setPropertyFilter] = useState<'all' | number>('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [fileFilter, setFileFilter] = useState<FileFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('created_desc');

  const [revealedPhones, setRevealedPhones] = useState<Set<number>>(new Set());
  const togglePhoneReveal = (id: number) =>
    setRevealedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const today = todayIso();
  const weekEnd = addDays(today, 7);

  const fetchData = async () => {
    setLoading(true);
    try {
      const list = await tenantService.listDrafts().catch(() => [] as TenantContractResponse[]);
      const safeList = Array.isArray(list) ? list : [];
      setDrafts(safeList);

      // Nạp thông tin nhà (tên, quản lý vận hành) cho các property xuất hiện
      // trong danh sách — dùng để nhóm + lọc + hiển thị.
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
    if (!window.confirm(`Huỷ hồ sơ đón khách của ${d.tenantFullName || d.contractCode}?`)) return;
    try {
      await tenantService.cancel(d.id);
      toast.success('Đã huỷ hồ sơ đón khách.');
      fetchData();
    } catch {
      /* interceptor toast */
    }
  };

  // ─── Thống kê: tính trên TOÀN BỘ hồ sơ, không đổi theo bộ lọc ──────────────
  const stats = useMemo(() => {
    const withDate = drafts.filter((d) => !!d.expectedReceptionDate);
    return {
      total: drafts.length,
      overdue: withDate.filter((d) => d.expectedReceptionDate! < today).length,
      today: withDate.filter((d) => d.expectedReceptionDate === today).length,
      week: withDate.filter((d) => d.expectedReceptionDate! > today && d.expectedReceptionDate! <= weekEnd).length,
      noFile: drafts.filter((d) => !d.contractFileAvailable).length,
    };
  }, [drafts, today, weekEnd]);

  // Danh sách nhà / quản lý dựng từ chính dữ liệu — không hiện lựa chọn rỗng.
  const propertyOptions = useMemo(() => {
    const ids = [...new Set(drafts.map((d) => d.propertyId))];
    return ids
      .map((id) => ({ id, name: properties[id]?.propertyName || `Nhà #${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [drafts, properties]);

  const managerOptions = useMemo(
    () => [...new Set(drafts.map((d) => d.assignedManagerName).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'vi')),
    [drafts],
  );

  const filteredDrafts = useMemo(() => {
    let list = drafts;

    if (search.trim()) {
      list = list.filter((d) => matchVi(
        search,
        d.tenantFullName, d.tenantPhone, d.contractCode, d.roomNumber,
        properties[d.propertyId]?.propertyName, d.assignedManagerName,
      ));
    }
    if (propertyFilter !== 'all') list = list.filter((d) => d.propertyId === propertyFilter);
    if (managerFilter !== 'all') list = list.filter((d) => d.assignedManagerName === managerFilter);

    if (scheduleFilter === 'overdue') list = list.filter((d) => d.expectedReceptionDate && d.expectedReceptionDate < today);
    if (scheduleFilter === 'today') list = list.filter((d) => d.expectedReceptionDate === today);
    if (scheduleFilter === 'week') list = list.filter((d) => d.expectedReceptionDate && d.expectedReceptionDate > today && d.expectedReceptionDate <= weekEnd);
    if (scheduleFilter === 'no_date') list = list.filter((d) => !d.expectedReceptionDate);

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
  }, [drafts, properties, search, propertyFilter, managerFilter, scheduleFilter, fileFilter, sortBy, today, weekEnd]);

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

  const hasFilter = !!search.trim() || propertyFilter !== 'all' || managerFilter !== 'all'
    || scheduleFilter !== 'all' || fileFilter !== 'all';

  /**
   * PHÂN TRANG — trước đây trang này đổ HẾT (80 hồ sơ, 50 nhà) vào một lưới masonry:
   * mỗi nhà là một thẻ riêng có header 2 dòng, mà phần lớn nhà chỉ có 1 hồ sơ, nên một
   * hồ sơ chiếm 5 dòng. Cuộn mãi không hết và không có cách nào nhảy tới cuối danh sách.
   * Nay là bảng, mỗi hồ sơ 1 dòng, cắt trang 20 dòng.
   */
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredDrafts.length / ROWS_PER_PAGE));
  // Đổi lọc/sắp xếp thì về trang 1, không thì đang ở trang 4 mà lọc còn 2 trang là màn trắng.
  useEffect(() => { setPage(1); },
    [search, propertyFilter, managerFilter, scheduleFilter, fileFilter, sortBy]);
  const pageStart = (page - 1) * ROWS_PER_PAGE;
  const pageItems = filteredDrafts.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const clearFilters = () => {
    setSearch(''); setPropertyFilter('all'); setManagerFilter('all');
    setScheduleFilter('all'); setFileFilter('all');
  };

  /** Bấm thẻ thống kê = bật/tắt đúng bộ lọc đó, đồng thời gỡ các lọc lịch khác. */
  const toggleSchedule = (key: ScheduleFilter) =>
    setScheduleFilter((cur) => (cur === key ? 'all' : key));

  const selectCls = 'rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hồ sơ đón khách</h1>
          <p className="mt-1 text-sm text-slate-500">
            Khách đã xem nhà và chốt thuê — đang chờ quản lý tới đón khách &amp; thu cọc.
            Quản lý vận hành của nhà tự động phụ trách.
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
            <FilePlus className="h-4 w-4" /> Tạo hồ sơ
          </button>
        </div>
      </div>

      {/* Thống kê — bấm vào để lọc nhanh. "Quá hạn đón" là ô đáng nhìn nhất:
          đã qua ngày hẹn mà hồ sơ vẫn chưa đón được khách. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          title="Tổng hồ sơ" value={stats.total} icon={Users} tone="indigo"
          helper="đang chờ đón khách"
        />
        <StatCard
          title="Quá hạn đón" value={stats.overdue} icon={AlertTriangle} tone="rose"
          helper="đã qua ngày hẹn"
          onClick={() => toggleSchedule('overdue')} active={scheduleFilter === 'overdue'}
        />
        <StatCard
          title="Đón hôm nay" value={stats.today} icon={CalendarClock} tone="amber"
          onClick={() => toggleSchedule('today')} active={scheduleFilter === 'today'}
        />
        <StatCard
          title="Trong 7 ngày" value={stats.week} icon={CalendarDays} tone="blue"
          onClick={() => toggleSchedule('week')} active={scheduleFilter === 'week'}
        />
        <StatCard
          title="Chưa có file HĐ" value={stats.noFile} icon={FileWarning} tone="violet"
          helper="cần tạo lại file"
          onClick={() => setFileFilter((f) => (f === 'no_file' ? 'all' : 'no_file'))}
          active={fileFilter === 'no_file'}
        />
      </div>

      {/* Tìm kiếm + bộ lọc */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên khách, SĐT, mã HĐ, tên nhà, số phòng, quản lý... (không cần dấu)"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <select
            value={String(propertyFilter)}
            onChange={(e) => setPropertyFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className={selectCls}
          >
            <option value="all">Nhà: Tất cả</option>
            {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className={selectCls}>
            <option value="all">Quản lý: Tất cả</option>
            {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value as ScheduleFilter)}
            className={selectCls}
          >
            {SCHEDULE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value as FileFilter)} className={selectCls}>
            <option value="all">File HĐ: Tất cả</option>
            <option value="has_file">Đã có file</option>
            <option value="no_file">Chưa có file</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={selectCls}>
            <option value="created_desc">Sắp xếp: Mới tạo trước</option>
            <option value="reception_asc">Sắp xếp: Ngày đón gần nhất</option>
          </select>

          <div className="flex flex-1 items-center justify-end gap-3">
            <span className="text-xs text-slate-500">
              {filteredDrafts.length}/{drafts.length} hồ sơ
              {groups.length > 0 && ` · ${groups.length} nhà`}
            </span>
            {hasFilter && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" /> Xoá lọc
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Danh sách — nhóm theo nhà */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <FilePlus className="mb-3 h-12 w-12 text-slate-300" />
          <p className="font-medium">Chưa có hồ sơ đón khách nào.</p>
          <p className="mt-1 text-sm text-slate-400">Bấm "Tạo hồ sơ" hoặc import Excel để bắt đầu.</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <Search className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium">Không có hồ sơ nào khớp bộ lọc.</p>
          <button onClick={clearFilters} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline">
            Xoá lọc
          </button>
        </div>
      ) : (
        /* BẢNG thay cho lưới thẻ theo nhà.

           Vì sao đổi: gom theo nhà chỉ đáng khi mỗi nhóm có nhiều hồ sơ, mà thực tế 50 nhà /
           80 hồ sơ — gần như nhà nào cũng đúng 1 hồ sơ. Mỗi thẻ nhà lại có header 2 dòng cộng
           dòng hồ sơ 3 dòng, thành ra 1 hồ sơ chiếm 5 dòng và trang dài vô tận. Nay tên nhà
           là MỘT CỘT, mỗi hồ sơ 1 dòng, quét mắt theo cột nào cũng được. */
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Khách thuê</th>
                  <th className="px-4 py-2.5 font-bold">Nhà · phòng</th>
                  <th className="px-4 py-2.5 font-bold">Quản lý</th>
                  <th className="px-4 py-2.5 text-right font-bold">Giá thuê · cọc</th>
                  <th className="px-4 py-2.5 font-bold">Ngày đón</th>
                  <th className="px-4 py-2.5 font-bold">Hợp đồng</th>
                  <th className="px-4 py-2.5 text-right font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((d) => {
                  const late = d.expectedReceptionDate && d.expectedReceptionDate < today
                    ? overdueDays(d.expectedReceptionDate, today) : 0;
                  const isToday = d.expectedReceptionDate === today;
                  const property = properties[d.propertyId];
                  return (
                    /* Vạch màu bên trái: quét một lượt là thấy dòng nào gấp. */
                    <tr
                      key={d.id}
                      className={`border-l-[3px] transition-colors hover:bg-slate-50/60 ${
                        late > 0 ? 'border-l-rose-500' : isToday ? 'border-l-amber-400' : 'border-l-transparent'
                      }`}
                    >
                      {/* Khách + SĐT (che, bấm mắt để xem đủ) */}
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-slate-900">
                          {d.tenantFullName || 'Khách chưa đặt tên'}
                        </p>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Phone className="h-3 w-3" />
                          {revealedPhones.has(d.id) ? (d.tenantPhone || '—') : maskPhone(d.tenantPhone)}
                          {d.tenantPhone && (
                            <button
                              type="button"
                              onClick={() => togglePhoneReveal(d.id)}
                              title={revealedPhones.has(d.id) ? 'Ẩn số điện thoại' : 'Hiện số điện thoại'}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {revealedPhones.has(d.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          )}
                        </span>
                      </td>

                      {/* Nhà · phòng — thay cho header nhóm cũ */}
                      <td className="max-w-[240px] px-4 py-2.5">
                        <p className="truncate font-semibold text-slate-700">
                          {property?.propertyName || `Nhà #${d.propertyId}`}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {d.roomNumber ? `Phòng ${d.roomNumber}` : 'Nguyên căn'}
                          {property?.shortAddress ? ` · ${property.shortAddress}` : ''}
                        </p>
                      </td>

                      <td className="max-w-[150px] px-4 py-2.5">
                        {d.assignedManagerName || property?.operationManagerName ? (
                          <span className="block truncate text-xs text-slate-600">
                            {d.assignedManagerName || property?.operationManagerName}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">Chưa có</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <p className="font-semibold text-slate-800">{formatCurrency(d.rentAmount)}</p>
                        <p className="text-[11px] text-slate-400">cọc {formatCurrency(d.deposit)}</p>
                      </td>

                      {/* Ngày đón + nhãn trễ hạn */}
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {d.expectedReceptionDate ? (
                          <>
                            <span className={`flex items-center gap-1 font-semibold ${
                              late > 0 ? 'text-rose-600' : isToday ? 'text-amber-600' : 'text-slate-700'
                            }`}>
                              <CalendarClock className="h-3.5 w-3.5" />
                              {fmtDate(d.expectedReceptionDate)}
                            </span>
                            {late > 0 ? (
                              <span className="text-[11px] font-bold text-rose-600">Quá hạn {late} ngày</span>
                            ) : isToday ? (
                              <span className="text-[11px] font-bold text-amber-600">Đón hôm nay</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">Chưa đặt ngày</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5">
                        {d.contractCode && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {d.contractCode}
                          </span>
                        )}
                        {!d.contractFileAvailable && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-violet-600">
                            <FileWarning className="h-3 w-3" /> Chưa có file
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <button
                          onClick={() => setEditing(d)} title="Sửa hồ sơ"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => viewContract(d)}
                          disabled={!d.contractFileAvailable || viewingId === d.id}
                          title={d.contractFileAvailable ? 'Mở file hợp đồng' : 'Chưa có file hợp đồng'}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <FileDown className={`h-3.5 w-3.5 ${viewingId === d.id ? 'animate-pulse' : ''}`} />
                        </button>
                        <button
                          onClick={() => cancelDraft(d)} title="Huỷ hồ sơ"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phân trang — nói rõ đang xem dòng nào trên tổng bao nhiêu, không chỉ số trang. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              Hiện <b className="text-slate-700">{pageStart + 1}–{pageStart + pageItems.length}</b>
              {' / '}<b className="text-slate-700">{filteredDrafts.length}</b> hồ sơ
              {filteredDrafts.length !== drafts.length ? ` (đã lọc từ ${drafts.length})` : ''}
            </p>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
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
