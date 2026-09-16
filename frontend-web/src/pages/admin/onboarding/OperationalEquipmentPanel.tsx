import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, Package, Search, ShieldCheck, X,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import { CollapsibleSection } from './CollapsibleSection';
import type { OperationalEquipmentResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';

const AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách', KITCHEN: 'Bếp', BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công', GARAGE: 'Nhà để xe', OTHER: 'Khu vực chung',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Mới', GOOD: 'Tốt', DAMAGED: 'Hư hỏng nhẹ', BROKEN: 'Hỏng', MAINTENANCE: 'Bảo trì', DISPOSED: 'Đã thanh lý',
};

/** Màu badge tình trạng — BROKEN nổi bật đỏ vì đây là tín hiệu "cần thay thế" từ luồng
 * bảo trì (diagnose() đánh dấu equipmentNeedsReplacement), không phải chỉ là mô tả suông. */
const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-emerald-100 text-emerald-700',
  GOOD: 'bg-slate-100 text-slate-600',
  DAMAGED: 'bg-amber-100 text-amber-700',
  BROKEN: 'bg-rose-100 text-rose-700',
  MAINTENANCE: 'bg-sky-100 text-sky-700',
  DISPOSED: 'bg-slate-100 text-slate-400',
};

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const loc = (e: OperationalEquipmentResponse): string =>
  e.roomId != null ? `Phòng #${e.roomId}` : e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : 'Toàn nhà';

/** Text hạn sử dụng / bảo hành gọn trong 1 dòng. */
const warrantyText = (eq: OperationalEquipmentResponse): { text: string; known: boolean } => {
  const start = eq.warrantyStartDate ? formatDate(eq.warrantyStartDate) : null;
  const end = eq.warrantyEndDate ? formatDate(eq.warrantyEndDate) : null;
  if (end) {
    let text = start ? `${start} → ${end}` : `đến ${end}`;
    if (eq.warrantyMonths != null) text += ` · BH ${eq.warrantyMonths}th`;
    return { text, known: true };
  }
  if (eq.warrantyMonths != null) return { text: `BH ${eq.warrantyMonths} tháng`, known: true };
  return { text: 'chưa cập nhật', known: false };
};

type EffectFilter = 'active' | 'replaced' | 'all';
type SourceFilter = 'all' | 'PURCHASED' | 'HANDOVER';

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

/**
 * Tab "Thiết bị vận hành" — GET /properties/{id}/equipments.
 * Danh sách dạng bảng gọn + tìm kiếm / lọc / phân trang để chịu được vài trăm–nghìn thiết bị.
 */
export const OperationalEquipmentPanel = ({ propertyId, collapsible }: {
  propertyId: number;
  /** Bọc trong khối thu gọn (mặc định đóng) — dùng ở những trang dài như duyệt giá. */
  collapsible?: boolean;
}) => {
  const [items, setItems] = useState<OperationalEquipmentResponse[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [effect, setEffect] = useState<EffectFilter>('active');
  const [source, setSource] = useState<SourceFilter>('all');
  const [place, setPlace] = useState('all');
  const [status, setStatus] = useState('all');
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    propertyService.getEquipments(propertyId)
      .then(d => { if (!cancelled) setItems(d); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const all = items ?? [];
  const activeCount = useMemo(() => all.filter(e => e.currentEffective).length, [all]);
  const replacedCount = all.length - activeCount;
  // Thiết bị "Hỏng" — tín hiệu cần thay thế do luồng bảo trì đánh dấu (diagnose()).
  const brokenCount = useMemo(() => all.filter(e => e.status === 'BROKEN').length, [all]);

  // Danh sách vị trí có thật trong dữ liệu (phòng / khu vực chung / toàn nhà)
  const placeOptions = useMemo(
    () => [...new Set(all.map(loc))].sort((a, b) => a.localeCompare(b, 'vi')),
    [all],
  );

  const filtered = useMemo(() => {
    const kw = normalizeVi(search.trim());
    return all.filter(e => {
      if (effect === 'active' && !e.currentEffective) return false;
      if (effect === 'replaced' && e.currentEffective) return false;
      if (source !== 'all' && e.source !== source) return false;
      if (place !== 'all' && loc(e) !== place) return false;
      if (status !== 'all' && e.status !== status) return false;
      if (kw) {
        const hay = [e.catalogName, e.note, loc(e), STATUS_LABEL[e.status] ?? e.status]
          .filter(Boolean).map(v => normalizeVi(String(v))).join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [all, search, effect, source, place, status]);

  const totalValue = useMemo(() => filtered.reduce((s, e) => s + (e.price || 0), 0), [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { setPage(1); }, [search, effect, source, place, status, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const activeFilters = (search.trim() ? 1 : 0) + (effect !== 'active' ? 1 : 0)
    + (source !== 'all' ? 1 : 0) + (place !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0);
  const reset = () => { setSearch(''); setEffect('active'); setSource('all'); setPlace('all'); setStatus('all'); };

  /**
   * Bọc nội dung vào vỏ thu gọn khi được yêu cầu. Tóm tắt (số thiết bị + tổng giá trị) nằm
   * ngay trên tiêu đề nên đóng vẫn đọc được con số quan trọng, khỏi mở ra chỉ để đếm.
   */
  const wrap = (content: ReactNode): ReactNode => {
    if (!collapsible) return content;
    return (
      <CollapsibleSection
        icon={Package}
        title="Thiết bị vận hành"
        subtitle="Thiết bị mua mới và bàn giao đang gắn cho toà nhà"
        summary={loading ? null : (
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
              {activeCount} đang dùng
            </span>
            {brokenCount > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
                🔧 {brokenCount} cần thay thế
              </span>
            )}
            {totalValue > 0 && (
              <span className="font-bold text-indigo-700">{formatVND(totalValue)}</span>
            )}
          </span>
        )}
      >
        {content}
      </CollapsibleSection>
    );
  };

  // Ở chế độ thu gọn thì vỏ ngoài do CollapsibleSection lo, đừng vẽ thêm khung nữa.
  const shell = collapsible ? '' : 'rounded-2xl border border-slate-200 bg-white ';

  if (loading) {
    return wrap(
      <div className={`${shell}flex items-center gap-2 p-12 text-sm text-slate-400`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thiết bị...
      </div>,
    );
  }

  if (all.length === 0) {
    return wrap(
      <div className={`${shell}p-12 text-center`}>
        <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-semibold text-slate-500">Chưa có thiết bị vận hành nào</p>
        <p className="mt-1 text-sm text-slate-400">Thiết bị mua mới được thêm khi nhập cải tạo (đợt 2 / bổ sung).</p>
      </div>,
    );
  }

  const selectCls = 'rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

  return wrap(
    <div className="space-y-3">
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên thiết bị, vị trí, ghi chú... (không cần dấu)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <select value={effect} onChange={e => setEffect(e.target.value as EffectFilter)} className={selectCls}>
          <option value="active">Đang dùng ({activeCount})</option>
          {replacedCount > 0 && <option value="replaced">Đã thay thế ({replacedCount})</option>}
          <option value="all">Tất cả ({all.length})</option>
        </select>

        <select value={source} onChange={e => setSource(e.target.value as SourceFilter)} className={selectCls}>
          <option value="all">Mọi nguồn</option>
          <option value="HANDOVER">Bàn giao</option>
          <option value="PURCHASED">Mua mới</option>
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className={`${selectCls} ${status === 'BROKEN' ? 'border-rose-300 text-rose-700' : ''}`}
        >
          <option value="all">Mọi tình trạng</option>
          {brokenCount > 0 && <option value="BROKEN">🔧 Cần thay thế ({brokenCount})</option>}
          {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'BROKEN').map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {placeOptions.length > 1 && (
          <select value={place} onChange={e => setPlace(e.target.value)} className={`${selectCls} max-w-[160px]`}>
            <option value="all">Mọi vị trí</option>
            {placeOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className={selectCls}>
          {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / trang</option>)}
        </select>

        {activeFilters > 0 && (
          <button onClick={reset}
            className="rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600">
            Xóa lọc
          </button>
        )}
      </div>

      {/* Dòng kết quả */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <p className="text-slate-500">
          Hiển thị <b className="text-slate-800">{filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)}</b>
          {' '}trên <b className="text-slate-800">{filtered.length}</b> thiết bị
        </p>
        {totalValue > 0 && (
          <p className="font-bold text-slate-500">
            Tổng giá trị: <span className="text-indigo-700">{formatVND(totalValue)}</span>
          </p>
        )}
      </div>

      {/* Bảng gọn */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          Không có thiết bị nào khớp bộ lọc.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Thiết bị</th>
                <th className="px-4 py-2.5">Vị trí</th>
                <th className="px-4 py-2.5">Nguồn</th>
                <th className="px-4 py-2.5">Tình trạng</th>
                <th className="px-4 py-2.5">Hạn dùng / BH</th>
                <th className="px-4 py-2.5 text-right">Giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map(eq => {
                const off = eq.operationalStatus === 'DISABLED' || !eq.currentEffective;
                const w = warrantyText(eq);
                return (
                  <tr key={eq.id} className={`transition hover:bg-slate-50/60 ${off ? 'bg-slate-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`font-bold ${off ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {eq.catalogName}
                        </span>
                        {eq.renovationVersionLabel && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            {eq.renovationVersionLabel}
                          </span>
                        )}
                        {off && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                            Đã thay thế
                          </span>
                        )}
                      </div>
                      {eq.note && <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{eq.note}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{loc(eq)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        eq.source === 'PURCHASED' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        {eq.source === 'PURCHASED' ? 'Mua mới' : 'Bàn giao'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        STATUS_STYLE[eq.status] ?? 'bg-slate-100 text-slate-600'
                      }`}>
                        {STATUS_LABEL[eq.status] ?? eq.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`flex items-center gap-1 whitespace-nowrap text-xs ${
                        w.known ? 'text-slate-600' : 'italic text-slate-300'
                      }`}>
                        <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${w.known ? 'text-emerald-500' : 'text-slate-300'}`} />
                        {w.text}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-slate-700">
                      {formatVND(eq.price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs font-bold text-slate-500">Trang {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>,
  );
};
