import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Wrench, X, Download, ChevronLeft, ChevronRight,
  Clock, User, MapPin, Wallet, History,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { maintenanceService } from '@/services/maintenance.service';
import { useMaintenanceRealtime } from '@/hooks/useMaintenanceRealtime';
import { serverNow } from '@/utils/serverTime';
import type { MaintenanceRequestResponse, MaintenancePhotoHistoryEntry } from '@/types/api.types';
import {
  SectionShell,
  StatusPill,
  RealtimeBadge,
  formatVnd,
  maintenanceStatusMap,
} from './shared';

const norm = (s?: string) => (s ?? '').toLowerCase();
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Thứ tự chip trạng thái — theo đúng luồng xử lý, không theo alphabet. */
const STATUS_ORDER = [
  'OPEN', 'IN_REPAIR', 'TENANT_FAULT', 'PENDING_TENANT_REPAIR',
  'OUTSTANDING_DAMAGE', 'CLOSED', 'CANCELLED',
];

/** Giờ SERVER — chỉ là gợi ý mức độ khẩn, lệch vài phút không sao. */
const waitingDays = (iso?: string): number | null => {
  if (!iso) return null;
  const ms = serverNow().getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

/** Nhóm ảnh theo vòng đời — dùng chung cho photoHistory (đủ mọi vòng) và fallback
 * snapshot vòng hiện tại khi phiếu cũ chưa có photoHistory. */
const PHOTO_GROUPS: { type: MaintenancePhotoHistoryEntry['type']; label: string }[] = [
  { type: 'BEFORE', label: 'Ảnh hiện trạng' },
  { type: 'FAULT_EVIDENCE', label: 'Bằng chứng lỗi do khách' },
  { type: 'SELF_REPAIR', label: 'Khách tự sửa' },
  { type: 'AFTER', label: 'Sau sửa chữa' },
  { type: 'INVOICE', label: 'Hoá đơn' },
];

export const MaintenanceEquipmentMonitoring = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<MaintenanceRequestResponse[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [detail, setDetail] = useState<MaintenanceRequestResponse | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return maintenanceService.getRequests({}, 0, 200)
      .then(page => setRequests(page.content ?? []))
      .catch(() => setLoadError('Không tải được danh sách — kiểm tra kết nối máy chủ.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: BE ship 03/09/2026 (docs/maintenance-realtime-socket-spec.md bên repo BE).
  const { connected: liveOn } = useMaintenanceRealtime({ onRefresh: load });

  const propertyOptions = useMemo(() => {
    const set = new Set<string>();
    requests.forEach(r => { if (r.propertyName) set.add(r.propertyName); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [requests]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    requests.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [requests]);

  const matchesSearch = useCallback((r: MaintenanceRequestResponse) => {
    if (!search.trim()) return true;
    const kw = norm(search);
    return norm(r.requestCode).includes(kw)
      || norm(r.tenantName).includes(kw)
      || norm(r.tenantPhone).includes(kw)
      || norm(r.propertyName).includes(kw)
      || norm(r.roomName).includes(kw)
      || norm(r.equipmentName).includes(kw)
      || norm(r.description).includes(kw)
      || norm(r.assignedManagerName).includes(kw);
  }, [search]);

  const filtered = useMemo(() => requests
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => propertyFilter === 'all' || r.propertyName === propertyFilter)
    .filter(matchesSearch)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
  [requests, statusFilter, propertyFilter, matchesSearch]);

  const hasActiveFilter = search.trim() !== '' || statusFilter !== 'all' || propertyFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setPropertyFilter('all'); };

  // Xuất đúng danh sách ĐANG HIỂN THỊ (đã áp tìm kiếm/lọc nhà/lọc trạng thái) — WYSIWYG,
  // cùng quy ước với trang "Báo lỗi do khách".
  const exportCsv = () => {
    const cols = [
      'Mã phiếu', 'Nhà', 'Phòng', 'Khách thuê', 'SĐT', 'Thiết bị', 'Manager phụ trách',
      'Trạng thái', 'Chi phí', 'Ngày tạo', 'Ngày cập nhật',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      cols.map(esc).join(','),
      ...filtered.map(r => [
        r.requestCode, r.propertyName, r.roomName, r.tenantName, r.tenantPhone,
        r.equipmentName, r.assignedManagerName,
        (maintenanceStatusMap[r.status] ?? maintenanceStatusMap.OPEN).label,
        r.invoiceAmount != null ? r.invoiceAmount : '',
        fmtDate(r.createdAt), fmtDate(r.updatedAt),
      ].map(esc).join(',')),
    ];
    // BOM đầu file để Excel nhận đúng UTF-8, không thì tiếng Việt có dấu ra ký tự lạ.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-bao-tri-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionShell
      title="Maintenance & Equipment Monitoring"
      subtitle="Theo dõi yêu cầu bảo trì, tiến độ xử lý, danh mục thiết bị và QR code"
      icon={Wrench}
      action={(
        <div className="flex items-center gap-3">
          <RealtimeBadge connected={liveOn} />
          {filtered.length > 0 && (
            <button onClick={exportCsv}
              title="Xuất CSV danh sách đang hiển thị (đã áp tìm kiếm/lọc)"
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              <Download className="h-4 w-4" /> Xuất CSV
            </button>
          )}
        </div>
      )}
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="space-y-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="font-bold text-slate-900">Maintenance requests</h3>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm mã phiếu, tên/SĐT khách, thiết bị, nhà, phòng, manager…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {propertyOptions.length > 1 && (
                <select
                  value={propertyFilter}
                  onChange={e => setPropertyFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 sm:min-w-[180px]"
                >
                  <option value="all">Tất cả nhà</option>
                  {propertyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => setStatusFilter('all')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  statusFilter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                Tất cả {requests.length}
              </button>
              {STATUS_ORDER.filter(st => (statusCounts[st] ?? 0) > 0).map(st => {
                const meta = maintenanceStatusMap[st];
                const active = statusFilter === st;
                return (
                  <button key={st} onClick={() => setStatusFilter(st)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active ? meta.color + ' ring-1 ring-inset ring-current' : 'border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                    {meta.label} {statusCounts[st]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Property / Room</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-300" />
                  </td></tr>
                )}
                {!loading && loadError && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-rose-600">
                    {loadError}
                  </td></tr>
                )}
                {!loading && !loadError && filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    {requests.length === 0 ? 'Chưa có yêu cầu bảo trì nào.' : (
                      <>
                        Không có yêu cầu nào khớp bộ lọc.{' '}
                        {hasActiveFilter && (
                          <button onClick={clearFilters} className="font-semibold text-primary-600 hover:underline">Bỏ lọc</button>
                        )}
                      </>
                    )}
                  </td></tr>
                )}
                {!loading && !loadError && filtered.map(request => {
                  const s = maintenanceStatusMap[request.status] ?? maintenanceStatusMap.OPEN;
                  // "Chờ lâu": phiếu OPEN chưa được manager duyệt (category null cho tới
                  // lúc duyệt — xem TicketDetailScreen mobile) tính từ lúc tạo.
                  const openWaitDays = request.status === 'OPEN' ? waitingDays(request.createdAt) : null;
                  return (
                    <tr key={request.id} onClick={() => setDetail(request)}
                      className="cursor-pointer transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900">{request.requestCode}</p>
                          {openWaitDays !== null && openWaitDays >= 1 && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              openWaitDays >= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              Chờ {openWaitDays} ngày
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs text-slate-500">{request.equipmentName ?? request.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{request.propertyName}</p>
                        <p className="text-xs text-slate-500">{request.roomName}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{request.assignedManagerName ?? 'Chưa gán'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{request.invoiceAmount != null ? formatVnd(request.invoiceAmount) : 'N/A'}</td>
                      <td className="px-4 py-3"><StatusPill label={s.label} color={s.color} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {detail && <DetailDrawer request={detail} onClose={() => setDetail(null)} />}
    </SectionShell>
  );
};

/** Phóng to ảnh — mượt hơn mở tab mới khi cần xem kỹ/lướt qua nhiều ảnh. */
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
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-4" onClick={onClose}>
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
        <img src={images[index]} alt={`ảnh ${index + 1}/${images.length}`}
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

/** Chi tiết đầy đủ 1 phiếu — mô tả, ảnh mọi vòng, timeline. Dữ liệu lấy thẳng từ dòng
 * đã tải (GET /api/v1/maintenance trả full DTO, không thiếu field nào so với
 * GET /{id}) — không cần gọi API riêng, mở tức thì. */
const DetailDrawer = ({ request: r, onClose }: { request: MaintenanceRequestResponse; onClose: () => void }) => {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const s = maintenanceStatusMap[r.status] ?? maintenanceStatusMap.OPEN;

  // photoHistory có mọi vòng (kể cả vòng cũ nếu phiếu nối tiếp) — ưu tiên dùng; phiếu
  // cũ chưa có field này thì rơi về snapshot vòng hiện tại từng field riêng lẻ.
  const photoGroups = PHOTO_GROUPS.map(g => {
    if (r.photoHistory && r.photoHistory.length > 0) {
      return { ...g, urls: r.photoHistory.filter(p => p.type === g.type).map(p => p.url) };
    }
    const fallback: Record<string, string[] | undefined> = {
      BEFORE: r.beforeImages?.length ? r.beforeImages : r.images,
      FAULT_EVIDENCE: r.faultEvidenceImages,
      SELF_REPAIR: r.selfRepairImages,
      AFTER: r.afterImages,
      INVOICE: r.invoiceImages,
    };
    return { ...g, urls: fallback[g.type] ?? [] };
  }).filter(g => g.urls.length > 0);

  const timeline = [...(r.timeline ?? [])].sort((a, b) => a.changedAt.localeCompare(b.changedAt));

  const Row = ({ icon: Icon, label, value }: { icon: typeof User; label: string; value?: string | null }) => (
    !value ? null : (
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-sm text-slate-800">{value}</p>
        </div>
      </div>
    )
  );

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/40" onClick={onClose}>
        <div onClick={e => e.stopPropagation()}
          className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
          <div className="shrink-0 border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{r.requestCode}</h3>
                  <StatusPill label={s.label} color={s.color} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{r.title || r.equipmentName || 'Yêu cầu sửa chữa'}</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row icon={MapPin} label="Nhà / Phòng" value={`${r.propertyName}${r.roomName ? ` · ${r.roomName}` : ''}`} />
              <Row icon={User} label="Khách thuê" value={`${r.tenantName}${r.tenantPhone ? ` · ${r.tenantPhone}` : ''}`} />
              <Row icon={User} label="Manager phụ trách" value={r.assignedManagerName ?? 'Chưa gán'} />
              <Row icon={Clock} label="Ngày tạo" value={fmtDate(r.createdAt)} />
              {r.resolvedAt && <Row icon={Clock} label="Hoàn thành" value={fmtDate(r.resolvedAt)} />}
              {r.equipmentName && <Row icon={Wrench} label="Thiết bị" value={r.equipmentName} />}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Mô tả</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {r.description || '(không có mô tả)'}
              </p>
            </div>

            {r.faultReason && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Lỗi do khách</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">{r.faultReason}</p>
                {r.adminReviewedAt && (
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    {r.adminApproved ? '✅ Đã duyệt' : '❌ Không duyệt'} bởi {r.adminReviewedByName ?? 'admin'} lúc {fmtDate(r.adminReviewedAt)}
                    {r.adminReviewNote ? ` — "${r.adminReviewNote}"` : ''}
                  </p>
                )}
              </div>
            )}

            {(r.invoiceAmount != null || r.repairDescription || r.resolutionNote) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Wallet className="h-3.5 w-3.5" /> Chi phí / Kết quả xử lý
                </p>
                {r.invoiceAmount != null && (
                  <p className="mt-2 text-lg font-bold text-slate-900">{formatVnd(r.invoiceAmount)}</p>
                )}
                {r.repairDescription && <p className="mt-1 text-sm text-slate-700">{r.repairDescription}</p>}
                {r.resolutionNote && <p className="mt-1 text-sm text-slate-500">{r.resolutionNote}</p>}
              </div>
            )}

            {photoGroups.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ảnh (mọi vòng)</p>
                <div className="mt-2 space-y-3">
                  {photoGroups.map(g => (
                    <div key={g.type}>
                      <p className="mb-1.5 text-xs font-semibold text-slate-600">{g.label} ({g.urls.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {g.urls.map((url, i) => (
                          <button key={i} type="button" onClick={() => setLightbox({ images: g.urls, index: i })}>
                            <img src={url} alt={`${g.label} ${i + 1}`}
                              className="h-16 w-16 rounded-lg border border-slate-200 object-cover transition hover:opacity-80" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timeline.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <History className="h-3.5 w-3.5" /> Tiến trình xử lý
                </p>
                <div className="mt-3 space-y-0">
                  {timeline.map((t, i) => {
                    const ns = maintenanceStatusMap[t.newStatus] ?? maintenanceStatusMap.OPEN;
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ns.color.split(' ')[0]}`} />
                          {i !== timeline.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-semibold text-slate-800">{ns.label}</p>
                          {t.note && <p className="mt-0.5 text-sm text-slate-600">{t.note}</p>}
                          <p className="mt-0.5 text-xs text-slate-400">
                            {t.changedByName ?? 'Hệ thống'} · {fmtDate(t.changedAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
