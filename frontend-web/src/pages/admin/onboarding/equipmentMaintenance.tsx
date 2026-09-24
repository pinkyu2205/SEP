import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Download, Loader2, UserCog, Wrench, X } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import api from '@/services/api';
import { Overlay } from '@/components/Overlay';
import type { OperationalEquipmentResponse } from '@/types/api.types';

/**
 * LỊCH SỬ BẢO TRÌ THEO THIẾT BỊ — dùng chung cho tab Thiết bị và hộp chi tiết phòng.
 *
 * Nguồn: `GET /api/v1/maintenance?propertyId=` (admin — một lần cả nhà) hoặc
 * `GET /api/v1/equipment/{id}/maintenance-tickets` (mọi vai, kể cả host — theo từng món).
 * KHÔNG dùng `/maintenance-history`: server trả `[]` dù có phiếu. Cả hai nguồn trả
 * `MaintenanceRequestResponse` → dùng kiểu gọn riêng ở đây, chỉ lấy trường cần hiện.
 */
export interface EquipmentTicket {
  id: number;
  requestCode?: string | null;
  title?: string | null;
  status: string;
  createdAt?: string | null;
  resolvedAt?: string | null;
  assignedManagerName?: string | null;
  tenantName?: string | null;
  repairDescription?: string | null;
  resolutionNote?: string | null;
  /** Chi phí sửa theo hoá đơn nhà cung cấp — tiền CÔNG TY chi ra. */
  invoiceAmount?: number | null;
  invoiceVendor?: string | null;
  repairAppointmentAt?: string | null;
  /** Hoá đơn THU KHÁCH khi lỗi do khách (luồng B) — có trạng thái thanh toán. */
  issuedInvoice?: {
    code?: string | null;
    status?: string | null;
    grandTotal?: number | null;
    totalAmount?: number | null;
    paidAt?: string | null;
    dueDate?: string | null;
  } | null;
  /** Khách từ chối trả, công ty trả hộ. */
  companyAbsorbedFault?: boolean | null;
  equipmentId?: number | null;
}

/**
 * Nguồn dữ liệu lịch sử đã lấy được:
 *   'list'    — danh sách phiếu theo nhà (`GET /maintenance?propertyId=`) — ĐẦY ĐỦ. Admin/manager.
 *   'history' — tra theo từng thiết bị mà CÓ MÓN LỖI → danh sách có thể thiếu, không được
 *               kết luận "chưa từng bảo trì". Tra đủ không lỗi thì vẫn tính là 'list'.
 *               (Host không gọi được `/maintenance` — 403 — nên luôn đi đường theo thiết bị,
 *               qua `/equipment/{id}/maintenance-tickets`, endpoint này host đọc được.)
 */
export type TicketSource = 'list' | 'history';

/** Trạng thái thanh toán hoá đơn thu khách. */
const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  PAID:      { label: 'Đã thanh toán',   cls: 'bg-emerald-100 text-emerald-700' },
  PENDING:   { label: 'Chưa thanh toán', cls: 'bg-amber-100 text-amber-700' },
  UNPAID:    { label: 'Chưa thanh toán', cls: 'bg-amber-100 text-amber-700' },
  OVERDUE:   { label: 'Quá hạn',         cls: 'bg-rose-100 text-rose-700' },
  CANCELLED: { label: 'Đã huỷ',          cls: 'bg-slate-100 text-slate-500' },
};

/** Hoá đơn thu khách của phiếu còn chưa trả không — để gắn cờ ngay trên dòng thiết bị. */
export const hasUnpaidCharge = (t: EquipmentTicket) => {
  const s = (t.issuedInvoice?.status ?? '').toUpperCase();
  return !!t.issuedInvoice && s !== 'PAID' && s !== 'CANCELLED';
};

/** Phiếu còn đang xử lý = thiết bị ĐANG bảo trì. */
const CLOSED = new Set(['CLOSED', 'CANCELLED']);
export const isOpenTicket = (t: EquipmentTicket) => !CLOSED.has(t.status);

export const TICKET_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN:                  { label: 'Chờ quản lý xem',  cls: 'bg-amber-100 text-amber-700' },
  REPAIR_SCHEDULED:      { label: 'Đã hẹn lịch sửa',  cls: 'bg-sky-100 text-sky-700' },
  IN_REPAIR:             { label: 'Đang sửa',         cls: 'bg-sky-100 text-sky-700' },
  TENANT_FAULT:          { label: 'Lỗi do khách',     cls: 'bg-rose-100 text-rose-700' },
  PENDING_TENANT_REPAIR: { label: 'Khách tự sửa',     cls: 'bg-violet-100 text-violet-700' },
  OUTSTANDING_DAMAGE:    { label: 'Chờ trừ cọc',      cls: 'bg-rose-100 text-rose-700' },
  CLOSED:                { label: 'Đã xong',          cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:             { label: 'Đã huỷ',           cls: 'bg-slate-100 text-slate-500' },
};

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ';

/** Tối đa ngần này thiết bị được tra lịch sử — nhà vài trăm món thì chỉ tra đồ đang dùng. */
const MAX_LOOKUPS = 200;
/** Số request song song — đủ nhanh mà không dội cả trăm request cùng lúc vào máy chủ. */
const CONCURRENCY = 6;

/**
 * Tra phiếu bảo trì cho danh sách thiết bị. Lỗi từng món thì bỏ qua món đó (coi như
 * chưa rõ), không làm hỏng cả bảng. `loaded=false` trong lúc đang tra.
 */
export const useEquipmentTickets = (items: OperationalEquipmentResponse[] | null) => {
  const [tickets, setTickets] = useState<Map<number, EquipmentTicket[]>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<TicketSource>('history');
  const key = (items ?? []).map(e => e.id).join(',');

  useEffect(() => {
    if (!items) return;
    let cancelled = false;
    setLoaded(false);
    const out = new Map<number, EquipmentTicket[]>();
    const propertyId = items[0]?.propertyId;

    // 1) Đường ĐẦY ĐỦ: mọi phiếu của nhà một lần, gom theo thiết bị. Chạy được với admin.
    const viaList = async (): Promise<boolean> => {
      if (propertyId == null) return false;
      try {
        const page = await api.get<unknown, { content?: EquipmentTicket[] }>(
          '/api/v1/maintenance',
          { params: { propertyId, page: 0, size: 500 }, skipErrorToast: true } as never,
        );
        for (const t of page?.content ?? []) {
          if (t.equipmentId == null) continue;
          out.set(t.equipmentId, [...(out.get(t.equipmentId) ?? []), t]);
        }
        out.forEach(arr => arr.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')));
        return true;
      } catch {
        return false; // 403 với host → rơi xuống đường theo thiết bị
      }
    };

    const ids = items.filter(e => e.currentEffective).map(e => e.id).slice(0, MAX_LOOKUPS);
    let cursor = 0;
    let failed = 0;
    const worker = async () => {
      while (cursor < ids.length && !cancelled) {
        const id = ids[cursor++];
        try {
          /*
           * `/maintenance-tickets` — KHÔNG phải `/maintenance-history`. Đo 03/10/2026: bản
           * history trả `[]` dù có phiếu; bản tickets trả đủ phiếu (kèm issuedInvoice) và mở
           * cho cả OWNER (host 200) — đúng endpoint app manager đang dùng.
           */
          const rows = await api.get<unknown, EquipmentTicket[]>(
            `/api/v1/equipment/${id}/maintenance-tickets`,
            { skipErrorToast: true } as never,
          );
          out.set(id, Array.isArray(rows) ? rows : []);
        } catch { failed += 1; }
      }
    };
    (async () => {
      const full = await viaList();
      if (!full) await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (cancelled) return;
      // Tra từng món qua /maintenance-tickets cũng ĐẦY ĐỦ — chỉ coi là thiếu khi có món lỗi.
      setSource(full || failed === 0 ? 'list' : 'history');
      setTickets(out);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const openOf = (eqId: number) => (tickets.get(eqId) ?? []).find(isOpenTicket) ?? null;
  return { tickets, loaded, openOf, source };
};

/** Thiết bị đang bảo trì: có phiếu còn mở, hoặc BE đã đặt status MAINTENANCE. */
export const isUnderMaintenance = (
  eq: OperationalEquipmentResponse,
  openOf: (id: number) => EquipmentTicket | null,
) => eq.status === 'MAINTENANCE' || !!openOf(eq.id);

/** Số lần đã sửa xong (phiếu CLOSED). */
export const repairedCount = (list: EquipmentTicket[] | undefined) =>
  (list ?? []).filter(t => t.status === 'CLOSED').length;

/** Nhãn "Đang bảo trì · <bước>" đặt cạnh tên thiết bị. */
export const MaintenancePill = ({ ticket }: { ticket: EquipmentTicket | null }) => {
  const st = ticket ? TICKET_STATUS[ticket.status] : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
      <Wrench className="h-3 w-3" /> Đang bảo trì{st ? ` · ${st.label}` : ''}
    </span>
  );
};

/** Dòng thời gian các lần bảo trì của MỘT thiết bị — mới nhất trên cùng. */
export const TicketTimeline = ({ list, loading, source = 'list' }: {
  list: EquipmentTicket[]; loading?: boolean; source?: TicketSource;
}) => {
  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải lịch sử…
      </p>
    );
  }
  if (list.length === 0) {
    // Nguồn theo thiết bị hiện trả rỗng cả khi có phiếu — nói thật, đừng nói "chưa từng".
    return source === 'list'
      ? <p className="text-xs italic text-slate-400">Chưa từng bảo trì.</p>
      : <p className="text-xs italic text-amber-600">Chưa lấy được lịch sử bảo trì — máy chủ chưa mở dữ liệu này cho tài khoản chủ nhà.</p>;
  }
  return (
    <ol className="relative space-y-2.5 border-l-2 border-slate-200 pl-4">
      {list.map(t => {
        const st = TICKET_STATUS[t.status] ?? { label: t.status, cls: 'bg-slate-100 text-slate-600' };
        const cost = t.invoiceAmount != null ? Number(t.invoiceAmount) : 0;
        return (
          <li key={t.id} className="relative">
            <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${
              isOpenTicket(t) ? 'bg-sky-500' : 'bg-slate-300'}`} />
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-800">{t.title || 'Yêu cầu bảo trì'}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
              {t.requestCode && <span className="text-[10px] text-slate-400">{t.requestCode}</span>}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {fmtDate(t.createdAt)}{t.resolvedAt ? ` → ${fmtDate(t.resolvedAt)}` : ''}
              </span>
              {t.assignedManagerName && (
                <span className="flex items-center gap-1"><UserCog className="h-3 w-3" />{t.assignedManagerName}</span>
              )}
            </p>
            {/* Tiền: ai trả, trả chưa — thứ host cần biết nhất sau "đã sửa xong chưa" */}
            {(cost > 0 || t.issuedInvoice) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                {cost > 0 && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                    Chi phí sửa {fmtVND(cost)}{t.invoiceVendor ? ` · ${t.invoiceVendor}` : ''}
                    {t.issuedInvoice ? '' : ' · công ty trả'}
                  </span>
                )}
                {t.issuedInvoice && (() => {
                  const s = (t.issuedInvoice.status ?? '').toUpperCase();
                  const meta = PAY_STATUS[s] ?? { label: s || 'Chưa rõ', cls: 'bg-slate-100 text-slate-500' };
                  const amt = Number(t.issuedInvoice.grandTotal ?? t.issuedInvoice.totalAmount ?? 0);
                  return (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 ring-1 ring-slate-200">
                      Thu khách {amt > 0 ? fmtVND(amt) : ''}{t.issuedInvoice.code ? ` (${t.issuedInvoice.code})` : ''}
                      <span className={`rounded-full px-1.5 font-bold ${meta.cls}`}>{meta.label}</span>
                      {s === 'PAID' && t.issuedInvoice.paidAt && <span className="text-slate-400">{fmtDate(t.issuedInvoice.paidAt)}</span>}
                    </span>
                  );
                })()}
                {t.companyAbsorbedFault && (
                  <span className="rounded-md bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-600">Khách không trả — công ty chịu</span>
                )}
              </div>
            )}
            {(t.repairDescription || t.resolutionNote) && (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{t.repairDescription || t.resolutionNote}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
};

// ── Mã QR của một thiết bị ───────────────────────────────────────────────────
/**
 * Cùng định dạng với trang Danh mục thiết bị (EquipmentCatalogPage.qrPayload): mã
 * `qrCode` BE cấp nếu có, không thì `EQ-{id}` — id là khoá chính nên không bao giờ trùng.
 * Giữ y hệt để tem in ở đâu thì app khách quét cũng mở đúng màn báo bảo trì.
 */
export const equipQrCode = (eq: OperationalEquipmentResponse & { qrCode?: string | null }) =>
  eq.qrCode || `EQ-${eq.id}`;

const qrPayloadOf = (eq: OperationalEquipmentResponse & { qrCode?: string | null }) =>
  `slms://maintenance/new?equipmentId=${eq.id}`
  + `&qr=${encodeURIComponent(equipQrCode(eq))}`
  + `&roomId=${eq.roomId ?? ''}`
  + `&name=${encodeURIComponent(eq.catalogName ?? '')}`
  + `&cat=${encodeURIComponent(eq.catalogName ?? '')}`;

export const EquipmentQrModal = ({ eq, place, onClose }: {
  eq: OperationalEquipmentResponse; place: string; onClose: () => void;
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const code = equipQrCode(eq);
  const download = () => {
    const canvas = wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${code}-${eq.catalogName}.png`;
    a.click();
  };
  return (
    <Overlay>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
        <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">{eq.catalogName}</p>
              <p className="text-xs text-slate-500">{place} · <span className="font-mono font-semibold">{code}</span></p>
            </div>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex justify-center rounded-xl bg-slate-50 py-5">
            <QRCodeSVG value={qrPayloadOf(eq)} size={200} level="M" />
          </div>
          <div ref={wrapRef} className="hidden"><QRCodeCanvas value={qrPayloadOf(eq)} size={512} level="M" /></div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Khách quét mã bằng app để báo bảo trì thiết bị này.</p>
          <button onClick={download}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            <Download className="h-4 w-4" /> Tải tem PNG
          </button>
        </div>
      </div>
    </Overlay>
  );
};

/** "v2" → "Đợt 2": BE ghi số thứ tự đợt cải tạo đã mua thiết bị này. */
export const versionText = (label?: string | null) => {
  const n = label?.replace(/^v/i, '');
  return n ? `Đợt ${n}` : '';
};
