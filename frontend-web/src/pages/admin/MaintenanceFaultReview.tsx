import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle, Search, X,
  ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { maintenanceService } from '@/services/maintenance.service';
import { useMaintenanceRealtime } from '@/hooks/useMaintenanceRealtime';
import { serverNow } from '@/utils/serverTime';
import type { MaintenanceRequestResponse } from '@/types/api.types';
import { RealtimeBadge } from './shared';

// ══════════════════════════════════════════════════════════════════════════════
// Báo lỗi do khách — Admin duyệt. Redesign 01/09/2026: manager chỉ gửi mô tả +
// ảnh bằng chứng qua PUT /report-fault (không còn tự chọn "Hướng xử lý" —
// faultResolutionPath luôn null cho phiếu đi đường này). Admin xem, bấm Duyệt/
// Không duyệt qua PUT /admin-review — đó là bước CUỐI CÙNG app theo dõi, việc
// sửa chữa/thu tiền tiếp theo xử lý ngoài hệ thống.
//
// Phiếu có faultResolutionPath khác null là thuộc luồng reject-fault CŨ (vẫn còn
// trên BE cho tương thích ngược) — không thuộc phạm vi trang này, lọc bỏ.
// Xem docs/BE-YEUCAU-luong-loi-do-khach-admin-duyet-2026-09-01.md.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

// Giờ SERVER, không phải giờ máy — chỉ là gợi ý mức độ khẩn (không phải hạn xử lý cứng)
// nên lệch vài phút không sao, nhưng dùng chung tiện ích đã có cho nhất quán.
const waitingDays = (iso?: string): number | null => {
  if (!iso) return null;
  const ms = serverNow().getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

const norm = (s?: string) => (s ?? '').toLowerCase();

/** Cỡ trang khi gọi BE — vừa là trang đầu vừa là bước nhảy mỗi lần "Tải thêm". */
const PAGE_SIZE = 200;

export const MaintenanceFaultReview = () => {
  const [rows, setRows] = useState<MaintenanceRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending');
  const [target, setTarget] = useState<MaintenanceRequestResponse | null>(null);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'approved' | 'rejected'>('all');
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // Trang kế tiếp cần gọi khi bấm "Tải thêm" + có còn trang nào phía sau không — trước
  // đây trang này lấy CỐ ĐỊNH 200 phiếu rồi dừng, im lặng cắt bớt nếu hệ thống có nhiều
  // hơn 200 phiếu TENANT_FAULT (kể cả các phiếu thuộc luồng reject-fault cũ, không chỉ
  // luồng report-fault này) — giờ tải thêm theo yêu cầu, không giới hạn ngầm nữa.
  const [nextPage, setNextPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await maintenanceService.getRequests({ status: 'TENANT_FAULT' }, 0, PAGE_SIZE);
      setRows(page.content ?? []);
      setNextPage(1);
      setHasMore(!page.last);
      setTotalElements(page.totalElements ?? (page.content ?? []).length);
    } catch (e: unknown) {
      const res = (e as { response?: { status?: number; data?: { message?: string } } })?.response;
      setRows([]);
      setHasMore(false);
      setLoadError(res?.status === 403
        ? 'Tài khoản này không có quyền xem báo lỗi do khách (403).'
        : res?.data?.message ?? `Không gọi được API${res?.status ? ` (lỗi ${res.status})` : ' — kiểm tra kết nối máy chủ'}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await maintenanceService.getRequests({ status: 'TENANT_FAULT' }, nextPage, PAGE_SIZE);
      setRows(prev => [...prev, ...(page.content ?? [])]);
      setNextPage(n => n + 1);
      setHasMore(!page.last);
    } catch {
      toast.error('Không tải thêm được — thử lại.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextPage]);

  useEffect(() => { load(); }, [load]);

  // Realtime: BE ship 03/09/2026 — báo mới nhất tự hiện, không cần bấm "Làm mới" nữa.
  const { connected: liveOn } = useMaintenanceRealtime({ onRefresh: load });

  // faultResolutionPath có giá trị = phiếu thuộc luồng reject-fault cũ (mobile tự xử lý,
  // không qua admin) — không hiện ở đây dù cùng status TENANT_FAULT.
  const reviewable = useMemo(() => rows.filter(r => !r.faultResolutionPath), [rows]);

  // Nhà xuất hiện trong tập đang xem — chỉ hiện dropdown lọc nhà khi có từ 2 nhà trở lên,
  // 1 nhà thì lọc không có ý nghĩa gì thêm.
  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    reviewable.forEach(r => { if (r.propertyName) set.add(r.propertyName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [reviewable]);

  const matchesSearch = useCallback((r: MaintenanceRequestResponse) => {
    if (!search.trim()) return true;
    const kw = norm(search);
    return norm(r.requestCode).includes(kw)
      || norm(r.tenantName).includes(kw)
      || norm(r.tenantPhone).includes(kw)
      || norm(r.propertyName).includes(kw)
      || norm(r.roomName).includes(kw)
      || norm(r.equipmentName).includes(kw)
      || norm(r.faultReason).includes(kw);
  }, [search]);
  const matchesProperty = useCallback(
    (r: MaintenanceRequestResponse) => propertyFilter === 'all' || r.propertyName === propertyFilter,
    [propertyFilter],
  );

  const pendingList = useMemo(
    () => reviewable.filter(r => !r.adminReviewedAt).filter(matchesSearch).filter(matchesProperty)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [reviewable, matchesSearch, matchesProperty],
  );

  // Tách riêng "base" (đã lọc tìm kiếm/nhà, CHƯA lọc theo kết luận) để đếm số Đã duyệt/
  // Không duyệt cho chip lọc — chip chỉ hiện khi tập này có CẢ HAI loại kết luận.
  const reviewedBase = useMemo(
    () => reviewable.filter(r => r.adminReviewedAt).filter(matchesSearch).filter(matchesProperty),
    [reviewable, matchesSearch, matchesProperty],
  );
  const approvedCount = useMemo(() => reviewedBase.filter(r => r.adminApproved).length, [reviewedBase]);
  const rejectedCount = useMemo(() => reviewedBase.filter(r => !r.adminApproved).length, [reviewedBase]);
  const reviewedList = useMemo(() => {
    const base = decisionFilter === 'approved' ? reviewedBase.filter(r => r.adminApproved)
      : decisionFilter === 'rejected' ? reviewedBase.filter(r => !r.adminApproved)
      : reviewedBase;
    return [...base].sort((a, b) => (b.adminReviewedAt ?? '').localeCompare(a.adminReviewedAt ?? ''));
  }, [reviewedBase, decisionFilter]);

  const list = tab === 'pending' ? pendingList : reviewedList;
  const hasActiveFilter = search.trim() !== '' || propertyFilter !== 'all';

  // Xuất đúng danh sách ĐANG HIỂN THỊ ở tab "Đã xử lý" (đã áp tìm kiếm/lọc nhà/lọc kết
  // luận) — WYSIWYG, để đối chiếu với xử lý dân sự ngoài hệ thống khi cần.
  const exportCsv = () => {
    const cols = [
      'Mã phiếu', 'Nhà', 'Phòng', 'Khách thuê', 'SĐT', 'Thiết bị', 'Mô tả lỗi',
      'Kết luận', 'Người duyệt', 'Ngày duyệt', 'Ghi chú', 'Ngày báo cáo',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      cols.map(esc).join(','),
      ...reviewedList.map(r => [
        r.requestCode, r.propertyName, r.roomName, r.tenantName, r.tenantPhone,
        r.equipmentName, r.faultReason, r.adminApproved ? 'Đã duyệt' : 'Không duyệt',
        r.adminReviewedByName, fmtDate(r.adminReviewedAt), r.adminReviewNote, fmtDate(r.createdAt),
      ].map(esc).join(',')),
    ];
    // BOM đầu file để Excel nhận đúng UTF-8, không thì tiếng Việt có dấu ra ký tự lạ.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-loi-do-khach-da-duyet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo lỗi do khách — Duyệt</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Manager báo cáo lỗi do khách gây ra kèm ảnh bằng chứng. Xem xét rồi duyệt/không
            duyệt — đây là bước cuối app theo dõi, việc sửa chữa/thu tiền xử lý ngoài hệ thống.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RealtimeBadge connected={liveOn} />
          {tab === 'reviewed' && reviewedList.length > 0 && (
            <button onClick={exportCsv}
              title="Xuất CSV danh sách đang hiển thị (đã áp tìm kiếm/lọc)"
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              <Download className="h-4 w-4" /> Xuất CSV
            </button>
          )}
          <button onClick={load}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {([
          ['pending', 'Chờ duyệt', pendingList.length],
          ['reviewed', 'Đã xử lý', reviewedBase.length],
        ] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === k ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label} <span className={tab === k ? 'text-white/70' : 'text-slate-400'}>{n}</span>
          </button>
        ))}

        {/* Chip lọc theo kết luận — chỉ hiện ở tab Đã xử lý và khi có CẢ HAI loại kết
            luận trong tập đang xem, tránh chip vô nghĩa (bấm cái nào cũng ra y hệt). */}
        {tab === 'reviewed' && approvedCount > 0 && rejectedCount > 0 && (
          <div className="ml-1 flex items-center gap-1.5 border-l border-slate-200 pl-3">
            {([
              ['all', `Tất cả ${reviewedBase.length}`],
              ['approved', `Đã duyệt ${approvedCount}`],
              ['rejected', `Không duyệt ${rejectedCount}`],
            ] as const).map(([k, label]) => (
              <button key={k} onClick={() => setDecisionFilter(k)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  decisionFilter === k ? 'bg-primary-600 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tìm kiếm + lọc theo nhà — hữu ích khi danh sách dài, admin cần tra một phiếu
          cụ thể (theo mã, tên/SĐT khách) hoặc dồn vào một nhà đang xử lý. */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo mã phiếu, tên/SĐT khách, thiết bị, nội dung mô tả…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {propertyOptions.length > 1 && (
          <select
            value={propertyFilter}
            onChange={e => setPropertyFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 sm:min-w-[200px]"
          >
            <option value="all">Tất cả nhà</option>
            {propertyOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* Còn phiếu chưa tải (vượt PAGE_SIZE) — tìm kiếm/lọc phía trên chỉ áp dụng trên
          phần ĐÃ TẢI, nên phải nói rõ ra thay vì để admin tưởng đã thấy hết. */}
      {!loading && !loadError && hasMore && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          <span>Đã tải {rows.length}/{totalElements} phiếu — tìm kiếm/lọc chỉ áp dụng trên phần đã tải.</span>
          <button onClick={loadMore} disabled={loadingMore}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50">
            {loadingMore ? 'Đang tải…' : 'Tải thêm'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : loadError ? (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 py-14 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <p className="mt-3 font-bold text-rose-800">Không tải được dữ liệu</p>
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-bold text-slate-700">
            {hasActiveFilter || decisionFilter !== 'all'
              ? 'Không có báo cáo nào khớp bộ lọc'
              : tab === 'pending' ? 'Không có báo cáo nào đang chờ duyệt' : 'Chưa duyệt phiếu nào'}
          </p>
          {(hasActiveFilter || decisionFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setPropertyFilter('all'); setDecisionFilter('all'); }}
              className="mt-3 text-sm font-semibold text-primary-600 hover:underline"
            >
              Bỏ lọc
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map(r => (
            <div key={r.id} className={`rounded-2xl border bg-white shadow-sm ${
              tab === 'pending' ? 'border-rose-200' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`h-4 w-4 shrink-0 ${tab === 'pending' ? 'text-rose-500' : 'text-slate-400'}`} />
                    <p className="font-bold text-slate-900">{r.requestCode}</p>
                    {tab === 'pending' && (() => {
                      const days = waitingDays(r.createdAt);
                      if (days === null || days < 2) return null;
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          days >= 5 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          Chờ {days} ngày
                        </span>
                      );
                    })()}
                    {tab === 'reviewed' && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.adminApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {r.adminApproved ? 'Đã duyệt' : 'Không duyệt'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {r.propertyName}{r.roomName ? ` · ${r.roomName}` : ''} · {r.tenantName}
                    {r.tenantPhone ? ` · ${r.tenantPhone}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {r.equipmentName ? `${r.equipmentName} · ` : ''}Báo cáo lúc {fmtDate(r.createdAt)}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Mô tả lỗi</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {r.faultReason || '(không có mô tả)'}
                </p>
                {(r.faultEvidenceImages?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.faultEvidenceImages!.map((url, i) => (
                      <button key={i} type="button"
                        onClick={() => setLightbox({ images: r.faultEvidenceImages!, index: i })}>
                        <img src={url} alt={`bằng chứng ${i + 1}`}
                          className="h-20 w-20 rounded-lg border border-slate-200 object-cover transition hover:opacity-80" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {tab === 'pending' ? (
                <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                  <button onClick={() => setTarget(r)}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                    Xem xét & duyệt
                  </button>
                </div>
              ) : (
                <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
                  {r.adminReviewedByName ?? 'Quản trị viên'} kết luận lúc {fmtDate(r.adminReviewedAt)}
                  {r.adminReviewNote ? ` — "${r.adminReviewNote}"` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <ReviewDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); }}
        />
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onChange={i => setLightbox(l => (l ? { ...l, index: i } : l))}
        />
      )}
    </div>
  );
};

/** Phóng to ảnh bằng chứng — mượt hơn mở tab mới khi cần xem kỹ/lướt qua nhiều ảnh. */
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4" onClick={onClose}>
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
        <img src={images[index]} alt={`bằng chứng ${index + 1}/${images.length}`}
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

const ReviewDialog = ({ row, onClose, onDone }: {
  row: MaintenanceRequestResponse; onClose: () => void; onDone: () => void;
}) => {
  const [decision, setDecision] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const images = row.faultEvidenceImages ?? [];

  const submit = async () => {
    if (decision === null) return toast.error('Chọn Duyệt hoặc Không duyệt trước.');
    setBusy(true);
    try {
      await maintenanceService.adminReviewFault(row.id, { approved: decision, note: note.trim() || undefined });
      toast.success(decision ? 'Đã duyệt báo cáo.' : 'Đã ghi nhận không duyệt.');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không ghi nhận được quyết định.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Duyệt báo lỗi do khách</h3>
            <p className="mt-1 text-sm text-slate-500">{row.requestCode} · {row.tenantName}</p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Mô tả lỗi</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">{row.faultReason}</p>
              {images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    <button key={i} type="button" onClick={() => setLightbox({ images, index: i })}>
                      <img src={url} alt={`bằng chứng ${i + 1}`}
                        className="h-16 w-16 rounded-lg border border-rose-200 object-cover transition hover:opacity-80" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button type="button" onClick={() => setDecision(true)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  decision === true ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Duyệt
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Đồng ý đây là lỗi do khách gây ra. Không đổi trạng thái phiếu, không tạo hoá đơn —
                  chỉ ghi nhận kết luận để tra cứu sau này.
                </p>
              </button>
              <button type="button" onClick={() => setDecision(false)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  decision === false ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <XCircle className="h-4 w-4 text-rose-600" /> Không duyệt
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Không đủ căn cứ xác định lỗi do khách.
                </p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Ghi chú (không bắt buộc)
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Căn cứ kết luận — lưu lại để tra cứu khi cần." />
            </div>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-slate-200 px-7 py-4">
            <button onClick={onClose} disabled={busy}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Huỷ
            </button>
            <button onClick={submit} disabled={busy || decision === null}
              className="flex-[2] rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
              {busy ? 'Đang lưu…' : 'Ghi nhận quyết định'}
            </button>
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
