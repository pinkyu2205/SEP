import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Home, LayoutGrid, List, Loader2,
  Package, QrCode, Search, ShieldAlert, ShieldCheck, Wallet, Wrench, X,
} from 'lucide-react';
import {
  EquipmentQrModal, MaintenancePill, TicketTimeline, hasUnpaidCharge, isUnderMaintenance,
  repairedCount, useEquipmentTickets, versionText, type EquipmentTicket, type TicketSource,
} from './equipmentMaintenance';
import { propertyService } from '@/services/property.service';
import { CollapsibleSection } from './CollapsibleSection';
import type { OperationalEquipmentResponse, RoomResponse } from '@/types/api.types';
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

/**
 * Tên vị trí dễ đọc. Trước đây phòng hiện "Phòng #30" — đó là id nội bộ, không phải số
 * phòng (101, 201…), host đọc không ra phòng nào. Giờ tra số phòng thật; chưa tải được
 * danh sách phòng thì mới rơi về id.
 */
const locOf = (e: OperationalEquipmentResponse, roomNo: Map<number, RoomResponse>): string => {
  if (e.roomId != null) {
    const r = roomNo.get(e.roomId);
    return r ? `Phòng ${r.roomNumber}` : `Phòng #${e.roomId}`;
  }
  return e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : 'Toàn nhà';
};

/** Còn bao nhiêu ngày bảo hành — âm = đã hết. null = không rõ. */
const warrantyDaysLeft = (eq: OperationalEquipmentResponse): number | null => {
  if (!eq.warrantyEndDate) return null;
  const t = Date.parse(eq.warrantyEndDate);
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86_400_000);
};

/** Sắp hết bảo hành: còn ≤ ngần này ngày thì nhắc. */
const WARRANTY_SOON_DAYS = 30;

/** Nhãn bảo hành ngắn + màu, dùng trong chế độ xem theo vị trí. */
const warrantyBadge = (eq: OperationalEquipmentResponse): { text: string; cls: string } => {
  const d = warrantyDaysLeft(eq);
  if (d == null) {
    return eq.warrantyMonths != null
      ? { text: `BH ${eq.warrantyMonths} tháng`, cls: 'text-slate-500' }
      : { text: 'Chưa có BH', cls: 'italic text-slate-300' };
  }
  if (d < 0) return { text: 'Hết bảo hành', cls: 'font-bold text-rose-600' };
  if (d <= WARRANTY_SOON_DAYS) return { text: `BH còn ${d} ngày`, cls: 'font-bold text-amber-600' };
  return { text: `BH đến ${formatDate(eq.warrantyEndDate)}`, cls: 'text-slate-500' };
};

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

/**
 * MỘT thiết bị — dùng chung cho chế độ "theo vị trí" và hộp chi tiết phòng.
 * Có nhãn "Đang bảo trì", nút xem lịch sử bảo trì (mở ngay dưới dòng) và nút mã QR.
 */
export const EquipmentItemRow = ({ eq, place, tickets, ticketsLoaded, showVersion = true, source = 'list' }: {
  eq: OperationalEquipmentResponse;
  place: string;
  source?: TicketSource;
  /** Hiện nhãn "Đợt N" — chỉ bật khi nhà có từ 2 đợt cải tạo trở lên (1 đợt thì nhãn chỉ gây nhiễu). */
  showVersion?: boolean;
  tickets: EquipmentTicket[] | undefined;
  ticketsLoaded: boolean;
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const off = eq.operationalStatus === 'DISABLED' || !eq.currentEffective;
  const wb = warrantyBadge(eq);
  const list = tickets ?? [];
  const open = list.find(t => t.status !== 'CLOSED' && t.status !== 'CANCELLED') ?? null;
  const maint = eq.status === 'MAINTENANCE' || !!open;

  /* "Mới" là còn nguyên như lúc mua. Đã qua sửa chữa thì không còn "Mới" nữa — BE hiện
     chưa đổi status khi đóng phiếu, nên FE tự hạ xuống "Tốt · đã sửa N lần". */
  const fixed = repairedCount(list);
  const shownStatus = eq.status === 'NEW' && fixed > 0 ? 'GOOD' : eq.status;
  /* Ghi chú kiểu "Giường phòng 202" chỉ lặp lại tên + vị trí → ẩn; ghi chú thật (VD "hàng
     thanh lý còn tốt, giá…") thì hiện ĐẦY ĐỦ, xuống dòng — không cắt cụt như bản trước. */
  const noteShown = eq.note && eq.note.trim().toLowerCase() !== `${eq.catalogName} ${place}`.trim().toLowerCase()
    ? eq.note : null;

  return (
    <li className={maint ? 'bg-sky-50/50' : ''}>
      <div className="space-y-1.5 px-4 py-3 text-sm">
        {/* Hàng 1: tên + nhãn · giá · thao tác */}
        <div className="flex items-start gap-3">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className={`font-bold ${off ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{eq.catalogName}</span>
            {showVersion && eq.renovationVersionLabel && (
              <span
                title={`Mua ở đợt cải tạo thứ ${eq.renovationVersionLabel.replace(/^v/i, '')} của nhà`}
                className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
              >
                {versionText(eq.renovationVersionLabel)}
              </span>
            )}
            {off && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Đã thay thế</span>}
            {maint && !off && <MaintenancePill ticket={open} />}
            {list.some(hasUnpaidCharge) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700" title="Có hoá đơn sửa chữa thu khách chưa thanh toán — bấm Lịch sử để xem">
                HĐ sửa chưa thu
              </span>
            )}
          </p>
          <span className="shrink-0 pt-0.5 font-bold tabular-nums text-slate-800">{formatVND(eq.price)}</span>
          <span className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setShowHistory(v => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                showHistory ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>
              <Wrench className="h-3 w-3" /> Lịch sử{ticketsLoaded && list.length > 0 ? ` (${list.length})` : ''}
            </button>
            <button type="button" onClick={() => setShowQr(true)} title="Xem / tải mã QR"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-100">
              <QrCode className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        {/* Hàng 2: tình trạng · nguồn · bảo hành — cùng một hàng chữ nhỏ, không cột cố định */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[shownStatus] ?? 'bg-slate-100 text-slate-600'}`}>
            {STATUS_LABEL[shownStatus] ?? shownStatus}{fixed > 0 ? ` · đã sửa ${fixed} lần` : ''}
          </span>
          {/* Nguồn gốc lúc nhận nhà — không đổi sau sửa chữa, ghi "Nguồn:" để khỏi đọc thành tình trạng. */}
          <span className="text-slate-500" title="Nguồn gốc thiết bị lúc nhận nhà">
            Nguồn: <b className={eq.source === 'PURCHASED' ? 'text-indigo-600' : 'text-sky-600'}>
              {eq.source === 'PURCHASED' ? 'mua mới' : 'bàn giao'}
            </b>
          </span>
          <span className={`inline-flex items-center gap-1 ${wb.cls}`} title={warrantyText(eq).text}>
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> {wb.text}
          </span>
        </div>

        {/* Hàng 3: ghi chú đầy đủ */}
        {noteShown && (
          <p className="whitespace-pre-line break-words rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            {noteShown}
          </p>
        )}
      </div>
      {showHistory && (
        <div className="px-6 pb-3 pt-1">
          <TicketTimeline list={list} loading={!ticketsLoaded} source={source} />
        </div>
      )}
      {showQr && <EquipmentQrModal eq={eq} place={place} onClose={() => setShowQr(false)} />}
    </li>
  );
};

/**
 * Thiết bị của MỘT phòng — gắn vào hộp chi tiết phòng (PropertyDetail). Tự tải thiết bị của
 * nhà rồi lọc theo phòng, kèm lịch sử bảo trì từng món.
 */
export const RoomEquipmentSection = ({ propertyId, roomId, roomLabel, roomUnderMaintenance = false }: {
  propertyId: number; roomId: number; roomLabel: string;
  /** BE đặt phòng MAINTENANCE khi có phiếu sửa mở — dùng khi không đọc được phiếu (host). */
  roomUnderMaintenance?: boolean;
}) => {
  const [items, setItems] = useState<OperationalEquipmentResponse[] | null>(null);
  /** Xét trên CẢ NHÀ: nhà có ≥ 2 đợt cải tạo mới hiện nhãn "Đợt N". */
  const [multiVersion, setMultiVersion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    propertyService.getEquipments(propertyId)
      .then(d => {
        if (cancelled) return;
        setMultiVersion(new Set(d.map(e => e.renovationVersionLabel).filter(Boolean)).size > 1);
        setItems(d.filter(e => e.roomId === roomId && e.currentEffective));
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [propertyId, roomId]);
  const { tickets, loaded, openOf, source } = useEquipmentTickets(items);

  if (items === null) {
    return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải thiết bị…</p>;
  }
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">Phòng chưa có thiết bị nào.</p>;
  }
  const fixingNow = items
    .map(e => ({ e, t: openOf(e.id) }))
    .filter(x => x.t || x.e.status === 'MAINTENANCE');
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {items.map(eq => (
          <EquipmentItemRow key={eq.id} eq={eq} place={roomLabel} showVersion={multiVersion} source={source}
            tickets={tickets.get(eq.id)} ticketsLoaded={loaded} />
        ))}
      </ul>

      {/* ── Đang sửa chữa: món nào, tới bước nào, ai làm, hẹn khi nào ── */}
      {loaded && fixingNow.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-700">
            <Wrench className="h-3.5 w-3.5" /> Đang sửa chữa ({fixingNow.length})
          </p>
          <ul className="space-y-2">
            {fixingNow.map(({ e, t }) => (
              <li key={e.id} className="rounded-lg bg-white px-3 py-2 ring-1 ring-sky-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{e.catalogName}</span>
                  <MaintenancePill ticket={t} />
                  {t?.requestCode && <span className="text-[10px] text-slate-400">{t.requestCode}</span>}
                </div>
                {t && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    {t.title && <span className="font-semibold text-slate-600">{t.title}</span>}
                    {t.createdAt && <span>Báo {new Date(t.createdAt).toLocaleDateString('vi-VN')}</span>}
                    {t.repairAppointmentAt && (
                      <span className="font-semibold text-sky-700">
                        Hẹn sửa {new Date(t.repairAppointmentAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                    {t.assignedManagerName && <span>QL {t.assignedManagerName}</span>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Không đọc được phiếu (host bị chặn) nhưng phòng đang MAINTENANCE → vẫn phải báo */}
      {loaded && fixingNow.length === 0 && roomUnderMaintenance && source === 'history' && (
        <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-800">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b>Phòng đang có thiết bị được sửa chữa.</b> Máy chủ chưa cho tài khoản chủ nhà xem cụ thể là
            món nào — admin / quản lý vận hành xem được chi tiết.
          </span>
        </p>
      )}
    </div>
  );
};

/**
 * Thanh cảnh báo thiết bị cho tab Tổng quan (cả nhà nguyên căn lẫn chia phòng).
 *
 * Trả lời hai câu host hay hỏi mà trước đây phải mở từng thiết bị mới biết: "nhà này có
 * món nào đang sửa không" và "tiền sửa thu khách đã trả chưa". Không có gì thì KHÔNG hiện
 * — nhà bình thường không phải nhìn thêm một khối trống.
 */
export const EquipmentAlertStrip = ({ propertyId, onOpenEquipment }: {
  propertyId: number;
  /** Chuyển sang tab Thiết bị để xem đầy đủ. */
  onOpenEquipment?: () => void;
}) => {
  const [items, setItems] = useState<OperationalEquipmentResponse[] | null>(null);
  const [roomById, setRoomById] = useState<Map<number, RoomResponse>>(new Map());
  useEffect(() => {
    let cancelled = false;
    propertyService.getEquipments(propertyId)
      .then(d => { if (!cancelled) setItems(d.filter(e => e.currentEffective)); })
      .catch(() => { if (!cancelled) setItems([]); });
    propertyService.getRooms(propertyId)
      .then(rs => { if (!cancelled) setRoomById(new Map(rs.map(r => [r.id, r]))); })
      .catch(() => { /* bỏ qua */ });
    return () => { cancelled = true; };
  }, [propertyId]);
  const { tickets, loaded, openOf } = useEquipmentTickets(items);

  if (!items || !loaded) return null;
  const inMaint = items.filter(e => isUnderMaintenance(e, openOf));
  const unpaid = items.flatMap(e => (tickets.get(e.id) ?? []).filter(hasUnpaidCharge).map(t => ({ e, t })));
  if (inMaint.length === 0 && unpaid.length === 0) return null;

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="h-4 w-4 text-sky-600" />
        <p className="text-sm font-bold text-slate-900">
          {inMaint.length > 0 && <>{inMaint.length} thiết bị đang bảo trì</>}
          {inMaint.length > 0 && unpaid.length > 0 && ' · '}
          {unpaid.length > 0 && <span className="text-amber-700">{unpaid.length} hoá đơn sửa chưa thu</span>}
        </p>
        {onOpenEquipment && (
          <button type="button" onClick={onOpenEquipment}
            className="ml-auto rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100">
            Xem tab Thiết bị
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {inMaint.map(e => {
          const t = openOf(e.id);
          return (
            <li key={`m-${e.id}`} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800">{e.catalogName}</span>
              <span className="text-slate-500">· {locOf(e, roomById)}</span>
              <MaintenancePill ticket={t} />
              {t?.assignedManagerName && <span className="text-slate-400">QL {t.assignedManagerName}</span>}
            </li>
          );
        })}
        {unpaid.map(({ e, t }) => (
          <li key={`u-${t.id}`} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">{e.catalogName}</span>
            <span className="text-slate-500">· {locOf(e, roomById)}</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              Thu khách {formatVND(Number(t.issuedInvoice?.grandTotal ?? t.issuedInvoice?.totalAmount ?? 0))} — chưa thanh toán
            </span>
            {t.tenantName && <span className="text-slate-400">{t.tenantName}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

type EffectFilter = 'active' | 'replaced' | 'all';
type ViewMode = 'group' | 'table';
// BE trả `INITIAL_HANDOVER`, không phải `HANDOVER` — lọc theo giá trị cũ thì "Bàn giao" luôn rỗng.
type SourceFilter = 'all' | 'PURCHASED' | 'INITIAL_HANDOVER';

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
  /** Mặc định xem THEO VỊ TRÍ: host hỏi "phòng 101 có gì" chứ ít khi đọc bảng phẳng. */
  const [view, setView] = useState<ViewMode>('group');
  /** Nhóm vị trí đang mở. */
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  /** roomId → phòng, để hiện số phòng thật thay vì id. */
  const [roomById, setRoomById] = useState<Map<number, RoomResponse>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    propertyService.getEquipments(propertyId)
      .then(d => { if (!cancelled) setItems(d); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Phòng chỉ để dịch id → số phòng; lỗi thì thôi, vị trí rơi về "Phòng #id".
    propertyService.getRooms(propertyId)
      .then(rs => { if (!cancelled) setRoomById(new Map(rs.map(r => [r.id, r]))); })
      .catch(() => { /* bỏ qua */ });
    return () => { cancelled = true; };
  }, [propertyId]);

  const loc = (e: OperationalEquipmentResponse) => locOf(e, roomById);
  /** Phiếu bảo trì từng thiết bị — biết món nào ĐANG bảo trì + xem lịch sử. */
  const { tickets, loaded: ticketsLoaded, openOf, source: ticketSource } = useEquipmentTickets(items);

  const all = items ?? [];
  const activeCount = useMemo(() => all.filter(e => e.currentEffective).length, [all]);
  const replacedCount = all.length - activeCount;
  // Thiết bị "Hỏng" — tín hiệu cần thay thế do luồng bảo trì đánh dấu (diagnose()).
  const brokenCount = useMemo(() => all.filter(e => e.status === 'BROKEN').length, [all]);
  /** Nhà có từ 2 đợt cải tạo trở lên thì nhãn "Đợt N" mới phân biệt được gì. */
  const multiVersion = useMemo(
    () => new Set(all.map(e => e.renovationVersionLabel).filter(Boolean)).size > 1,
    [all],
  );
  const maintCount = useMemo(
    () => all.filter(e => e.currentEffective && isUnderMaintenance(e, openOf)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, tickets],
  );
  /** Thiết bị đang dùng mà bảo hành còn ≤ 30 ngày hoặc đã hết. */
  const warrantyAlert = useMemo(() => all.filter(e => {
    if (!e.currentEffective) return false;
    const d = warrantyDaysLeft(e);
    return d != null && d <= WARRANTY_SOON_DAYS;
  }).length, [all]);

  // Danh sách vị trí có thật trong dữ liệu (phòng / khu vực chung / toàn nhà)
  const placeOptions = useMemo(
    () => [...new Set(all.map(loc))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, roomById],
  );

  const filtered = useMemo(() => {
    const kw = normalizeVi(search.trim());
    return all.filter(e => {
      if (effect === 'active' && !e.currentEffective) return false;
      if (effect === 'replaced' && e.currentEffective) return false;
      if (source !== 'all' && e.source !== source) return false;
      if (place !== 'all' && loc(e) !== place) return false;
      if (status === 'MAINTENANCE') {
        if (!isUnderMaintenance(e, openOf)) return false;
      } else if (status !== 'all' && e.status !== status) return false;
      if (kw) {
        const hay = [e.catalogName, e.note, loc(e), STATUS_LABEL[e.status] ?? e.status]
          .filter(Boolean).map(v => normalizeVi(String(v))).join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, effect, source, place, status, roomById, tickets]);

  /**
   * Nhóm theo vị trí: phòng xếp theo số phòng tăng dần, khu vực chung / toàn nhà xuống cuối.
   * Mỗi nhóm tự tính tổng giá trị + số thiết bị cần thay để đọc được ngay trên đầu nhóm.
   */
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; floor?: number | null; isRoom: boolean; items: OperationalEquipmentResponse[] }>();
    for (const e of filtered) {
      const label = loc(e);
      const g = map.get(label) ?? {
        key: label, label, isRoom: e.roomId != null,
        floor: e.roomId != null ? roomById.get(e.roomId)?.floor : undefined, items: [],
      };
      g.items.push(e);
      map.set(label, g);
    }
    return [...map.values()].sort((a, b) =>
      (a.isRoom === b.isRoom ? 0 : a.isRoom ? -1 : 1) || a.label.localeCompare(b.label, 'vi', { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, roomById]);

  const toggleGroup = (key: string) => setOpenGroups(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const allGroupsOpen = groups.length > 0 && groups.every(g => openGroups.has(g.key));

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

  const kpis = [
    { icon: Package, label: 'Đang dùng', value: String(activeCount), cls: 'bg-violet-50 text-violet-600' },
    { icon: Wrench, label: 'Đang bảo trì', value: ticketsLoaded ? String(maintCount) : '…', cls: maintCount ? 'bg-sky-50 text-sky-600' : 'bg-slate-50 text-slate-400', onClick: maintCount ? () => setStatus('MAINTENANCE') : undefined },
    { icon: AlertTriangle, label: 'Cần thay thế', value: String(brokenCount), cls: brokenCount ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400', onClick: brokenCount ? () => setStatus('BROKEN') : undefined },
    { icon: ShieldAlert, label: 'Sắp / đã hết BH', value: String(warrantyAlert), cls: warrantyAlert ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400' },
    { icon: Wallet, label: 'Tổng giá trị', value: formatVND(all.filter(e => e.currentEffective).reduce((s, e) => s + (e.price || 0), 0)), cls: 'bg-indigo-50 text-indigo-600' },
  ];

  return wrap(
    <div className="space-y-3">
      {/* Số liệu tổng quan — đọc là biết nhà này có bao nhiêu đồ, cái nào cần xử lý */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {kpis.map(k => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            disabled={!k.onClick}
            className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left ${k.onClick ? 'transition hover:border-rose-300' : 'cursor-default'}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${k.cls}`}>
              <k.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black tabular-nums text-slate-900">{k.value}</span>
              <span className="block text-[11px] font-semibold text-slate-500">{k.label}</span>
            </span>
          </button>
        ))}
      </div>

      {ticketsLoaded && ticketSource === 'history' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Lịch sử bảo trì và trạng thái "đang bảo trì" có thể <b>chưa đầy đủ</b> với tài khoản chủ nhà — máy chủ
          chưa mở danh sách phiếu bảo trì cho vai trò này. Admin xem được đầy đủ.
        </p>
      )}

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
          <option value="INITIAL_HANDOVER">Bàn giao</option>
          <option value="PURCHASED">Mua mới</option>
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className={`${selectCls} ${status === 'BROKEN' ? 'border-rose-300 text-rose-700' : ''}`}
        >
          <option value="all">Mọi tình trạng</option>
          {maintCount > 0 && <option value="MAINTENANCE">🛠 Đang bảo trì ({maintCount})</option>}
          {brokenCount > 0 && <option value="BROKEN">🔧 Cần thay thế ({brokenCount})</option>}
          {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'BROKEN' && !(k === 'MAINTENANCE' && maintCount > 0)).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {placeOptions.length > 1 && (
          <select value={place} onChange={e => setPlace(e.target.value)} className={`${selectCls} max-w-[160px]`}>
            <option value="all">Mọi vị trí</option>
            {placeOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {view === 'table' && (
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className={selectCls}>
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / trang</option>)}
          </select>
        )}

        {/* Theo vị trí ↔ bảng */}
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
          {([['group', LayoutGrid, 'Theo vị trí'], ['table', List, 'Dạng bảng']] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} title={label}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                view === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {activeFilters > 0 && (
          <button onClick={reset}
            className="rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600">
            Xóa lọc
          </button>
        )}
      </div>

      {/* Dòng kết quả */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        {view === 'group' ? (
          <p className="flex items-center gap-2 text-slate-500">
            <b className="text-slate-800">{filtered.length}</b> thiết bị ở <b className="text-slate-800">{groups.length}</b> vị trí
            {groups.length > 1 && (
              <button type="button" onClick={() => setOpenGroups(allGroupsOpen ? new Set() : new Set(groups.map(g => g.key)))}
                className="font-bold text-indigo-600 hover:underline">
                {allGroupsOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
              </button>
            )}
          </p>
        ) : (
          <p className="text-slate-500">
            Hiển thị <b className="text-slate-800">{filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)}</b>
            {' '}trên <b className="text-slate-800">{filtered.length}</b> thiết bị
          </p>
        )}
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
      ) : view === 'group' ? (
        /* ── Theo vị trí: mỗi phòng / khu vực một khối thu gọn ── */
        <div className="space-y-2">
          {groups.map(g => {
            const open = openGroups.has(g.key);
            const value = g.items.reduce((s, e) => s + (e.price || 0), 0);
            const broken = g.items.filter(e => e.status === 'BROKEN').length;
            const inMaint = g.items.filter(e => e.currentEffective && isUnderMaintenance(e, openOf)).length;
            const warn = g.items.filter(e => { const d = warrantyDaysLeft(e); return e.currentEffective && d != null && d <= WARRANTY_SOON_DAYS; }).length;
            const Icon = g.isRoom ? DoorOpen : Home;
            return (
              <div key={g.key} className={`overflow-hidden rounded-xl border bg-white ${broken ? 'border-rose-200' : 'border-slate-200'}`}>
                <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${g.isRoom ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{g.label}</span>
                      {g.floor != null && <span className="text-xs text-slate-400">Tầng {g.floor}</span>}
                      {inMaint > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          <Wrench className="h-3 w-3" />{inMaint} đang bảo trì
                        </span>
                      )}
                      {broken > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{broken} cần thay</span>
                      )}
                      {warn > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{warn} sắp/hết BH</span>
                      )}
                    </span>
                    {/* Xem trước tên đồ khi đang gập — biết ngay phòng có gì */}
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {g.items.map(e => e.catalogName).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black tabular-nums text-slate-800">{formatVND(value)}</span>
                    <span className="block text-[11px] text-slate-400">{g.items.length} thiết bị</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
                    {g.items.map(eq => (
                      <EquipmentItemRow key={eq.id} eq={eq} place={g.label} showVersion={multiVersion} source={ticketSource}
                        tickets={tickets.get(eq.id)} ticketsLoaded={ticketsLoaded} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
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
                        {multiVersion && eq.renovationVersionLabel && (
                          <span title="Đợt cải tạo đã mua thiết bị này"
                            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            {versionText(eq.renovationVersionLabel)}
                          </span>
                        )}
                        {!off && isUnderMaintenance(eq, openOf) && <MaintenancePill ticket={openOf(eq.id)} />}
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

      {/* Phân trang — chỉ dạng bảng; theo vị trí thì đã gập theo nhóm */}
      {view === 'table' && totalPages > 1 && (
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
