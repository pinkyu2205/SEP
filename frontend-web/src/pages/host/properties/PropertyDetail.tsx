import { useWebAuth } from '@/auth/WebAuthContext';
import { MaskedField } from '@/components/MaskedField';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, DoorOpen, Users, Ruler,
  Zap, RefreshCw, Home, UserCog, X, CheckCircle2,
  Wrench, CircleCheck, Layers, BadgeDollarSign, Wallet, Phone, CalendarClock, UserRound,
  Package, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, Search, Lock, Pencil, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '@/services/property.service';
import { tenantService } from '@/services/tenant.service';
import { hostService, type HostContractDto } from '@/services/host.service';
import type {
  PropertyResponse, RoomResponse, TenantContractResponse, ContractStatus,
} from '@/types/api.types';
import {
  EquipmentAlertStrip, OperationalEquipmentPanel, RoomEquipmentSection,
} from '@/pages/admin/onboarding/OperationalEquipmentPanel';
import { PropertyMap } from '@/components/PropertyMap';
import {
  WholeHousePriceActions, AllRoomsPriceHistoryButton, RoomPriceModal, RoomPriceHistoryModal,
} from './PriceManagerPanel';
import { formatCurrency } from '@/utils';
import { normalizeVi } from '@/utils/helpers';
import { MonthPicker, useServerPeriod } from '../shared';
import { currentMonth, monthLabel } from '@/utils/period';
import { normalizeRoomNumber } from '@/services/propertyOccupancy.service';
import { adminService, type AdminInvoiceRow } from '@/services/admin.service';
import { canUseFullInvoices } from '@/services/invoiceAccess';
import {
  INVOICE_TYPE_META, groupOnboardPayments, loadPropertyBills, type PropertyBillBreakdown,
} from './propertyOperationStatus';
import {
  BillLines, PropertyStatusPanel, RoomBillChip, WholeHouseBillLine, billHeading,
} from './PropertyStatusPanel';

// ─── Tab của màn chi tiết ────────────────────────────────────────────────────
// Tài chính & hợp đồng chủ nhà đã có trang riêng ở sidebar (Quản lý tài chính /
// Quản lý hợp đồng) nên không lặp lại ở đây.
type DetailTab = 'overview' | 'units' | 'equipment';

/** Kiểu sắp xếp danh sách phòng. */
type RoomSort = 'number' | 'number_desc' | 'price_desc' | 'price_asc' | 'area_desc';

const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof Home }[] = [
  { key: 'overview',  label: 'Tổng quan', icon: MapPin },
  { key: 'units',     label: 'Phòng',     icon: DoorOpen },
  { key: 'equipment', label: 'Thiết bị',  icon: Package },
];

/**
 * Host portal: endpoint /properties/{id}/tenant-contracts chỉ cho MANAGER/ADMIN (host bị 403),
 * nên host lấy HĐ qua /host/contracts. Map về TenantContractResponse để dùng chung với phần
 * hiển thị khách thuê (modal phòng, card nhà nguyên căn). roomId suy ra từ roomCode ↔ roomNumber.
 */
const hostContractToTenant = (hc: HostContractDto, rooms: RoomResponse[]): TenantContractResponse => {
  const room = hc.roomCode ? rooms.find(r => r.roomNumber === hc.roomCode) : undefined;
  return {
    id: Number(hc.id),
    propertyId: hc.propertyId ?? 0,
    roomId: room?.id,
    roomNumber: hc.roomCode,
    tenantUserId: '',
    // HĐ đã chấm dứt bị BE gỡ liên kết khách nên lesseeName về null.
    tenantFullName: hc.lesseeName ?? '',
    tenantPhone: hc.tenantPhone ?? '',
    tenantCccd: hc.tenantCccd,
    contractCode: hc.code,
    rentAmount: Number(hc.rentAmount) || 0,
    deposit: Number(hc.deposit) || 0,
    moveInDate: hc.moveInDate ?? hc.startDate,
    startDate: hc.startDate,
    endDate: hc.endDate,
    status: hc.status as ContractStatus,
    equipmentSnapshot: hc.equipmentSnapshot,
  };
};

/** dd/MM/yyyy hoặc '—' */
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/**
 * Diện tích gọn: BE chia đều diện tích sàn cho số phòng nên hay ra số lẻ dài
 * (45.55555555555556) — làm tròn 1 chữ số thập phân, bỏ ",0" nếu tròn.
 */
const fmtArea = (n?: number | null): string => {
  if (n == null) return '—';
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1).replace('.', ',')} m²`;
};


const roomStatusMap: Record<string, { label: string; cls: string; dot: string; border: string }> = {
  AVAILABLE:   { label: 'Phòng trống',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200 hover:border-emerald-400' },
  RENTED:      { label: 'Đang thuê',     cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500',    border: 'border-blue-200 hover:border-blue-400' },
  MAINTENANCE: { label: 'Bảo trì',       cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   border: 'border-amber-200 hover:border-amber-400' },
  // "Nháp" đọc lên như bản nháp có thể bỏ, trong khi thực chất phòng đã tạo xong và chỉ
  // còn chờ bật cho thuê — cùng lý do đã đổi nhãn DRAFT của hợp đồng thành "Chờ đón khách".
  // Gọi đúng tên thì host biết mình phải làm gì; gọi là "Nháp" thì không ai đụng tới,
  // nhà đứng ở trạng thái hoạt động mà admin không xếp được khách nào vào.
  DRAFT:       { label: 'Chưa mở cho thuê', cls: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400',   border: 'border-amber-200 hover:border-amber-300' },
  // Chỉ dùng khi đang xem một THÁNG ĐÃ QUA mà phòng không có hợp đồng nào nằm trong tháng đó.
  // Không gọi "Phòng trống": lúc đó phòng có thể chưa mở, đang cải tạo… — chỉ biết chắc là chưa có khách.
  PAST_EMPTY:  { label: 'Chưa có khách', cls: 'bg-slate-100 text-slate-500',    dot: 'bg-slate-300',   border: 'border-slate-200 hover:border-slate-300' },
  /**
   * Phòng chưa có khách ở nhưng ĐÃ có hồ sơ đón khách (HĐ DRAFT "chờ đón" hoặc PENDING "đã chốt,
   * chưa dọn vào"). BE vẫn để phòng AVAILABLE nên trước đây thẻ ghi "Phòng trống" — ngoài danh
   * sách nhà thì báo "1 chờ đón" mà vào đây không biết là phòng nào. Cùng màu tím với danh sách.
   */
  INCOMING:    { label: 'Chờ đón khách', cls: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500',  border: 'border-violet-200 hover:border-violet-400' },
};

/** Hồ sơ đón khách của phòng: HĐ chờ đón (DRAFT) hoặc đã chốt chưa dọn vào (PENDING). */
const isIncomingContract = (c: TenantContractResponse) => c.status === 'DRAFT' || c.status === 'PENDING';

/**
 * Hợp đồng có khách ở trong tháng `ym` ("YYYY-MM") không: đã vào ở trước hoặc trong tháng đó, và
 * chưa hết hạn trước tháng đó. Hợp đồng nháp / chờ ký không tính.
 *
 * Giới hạn: HĐ chấm dứt sớm vẫn tính tới `endDate` gốc — `/host/contracts` không trả ngày chấm dứt.
 */
const contractCoversMonth = (c: TenantContractResponse, ym: string): boolean => {
  if (c.status === 'DRAFT' || c.status === 'PENDING') return false;
  const start = (c.moveInDate || c.startDate || '').slice(0, 7);
  if (!start || start > ym) return false;
  const end = (c.endDate || '').slice(0, 7);
  return !end || end >= ym;
};

const propertyStatusLabel: Record<string, { label: string; cls: string }> = {
  ACTIVE:                    { label: 'Đang hoạt động',    cls: 'bg-emerald-500 text-white' },
  RENTED:                    { label: 'Đã cho thuê',       cls: 'bg-blue-500 text-white' },
  PENDING_HOST_REVIEW:       { label: 'Chờ phê duyệt',     cls: 'bg-amber-400 text-white' },
  PENDING_OPERATION_MANAGER: { label: 'Chờ gán quản lý',   cls: 'bg-violet-500 text-white' },
  DRAFT:                     { label: 'Nháp',               cls: 'bg-slate-400 text-white' },
  UNDER_RENOVATION:          { label: 'Đang cải tạo',       cls: 'bg-blue-500 text-white' },
  DISABLED:                  { label: 'Đã vô hiệu',         cls: 'bg-rose-500 text-white' },
};

// ─── Xem ảnh phóng to (ESC đóng, ← → chuyển ảnh) ─────────────────────────────
function ImageLightbox({ urls, index, onIndexChange, onClose }: {
  urls: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % urls.length);
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + urls.length) % urls.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, urls.length, onClose, onIndexChange]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4" onClick={onClose}>
      <button onClick={onClose} title="Đóng (Esc)"
        className="absolute right-4 top-4 rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>

      {urls.length > 1 && (
        <>
          <button title="Ảnh trước (←)"
            onClick={e => { e.stopPropagation(); onIndexChange((index - 1 + urls.length) % urls.length); }}
            className="absolute left-4 rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button title="Ảnh sau (→)"
            onClick={e => { e.stopPropagation(); onIndexChange((index + 1) % urls.length); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl bg-white/10 p-2.5 text-white transition hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div className="flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        <img src={urls[index]} alt={`Ảnh ${index + 1}`}
          className="max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">
            {index + 1} / {urls.length}
          </span>
          <a href={urls[index]} target="_blank" rel="noreferrer"
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/20">
            Mở ảnh gốc
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Room Status Modal ───────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'AVAILABLE',   label: 'Phòng trống', desc: 'Sẵn sàng cho thuê',       icon: <CircleCheck className="w-5 h-5 text-emerald-500" />, activeCls: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' },
  { value: 'MAINTENANCE', label: 'Bảo trì',     desc: 'Đang sửa chữa / bảo trì', icon: <Wrench className="w-5 h-5 text-amber-500" />,       activeCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' },
];

// ─── Room Detail Modal — xem đầy đủ thông tin phòng + đổi trạng thái ──────────
function InfoCell({ icon: Icon, label, value, highlight, className }: { icon: typeof Ruler; label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`rounded-xl bg-slate-50 px-4 py-3 ${className ?? ''}`}>
      <p className="text-xs text-slate-400 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
      <p className={`mt-0.5 font-bold ${highlight ? 'text-indigo-600 text-base' : 'text-slate-800 text-sm'}`}>{value}</p>
    </div>
  );
}


/** Trạng thái hoá đơn → nhãn + màu, dùng trong lịch sử hoá đơn của phòng. */
const INV_STATUS_META: Record<string, { label: string; cls: string }> = {
  PAID:      { label: 'Đã thu',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PENDING:   { label: 'Chờ thu',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PARTIAL:   { label: 'Thu một phần', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  OVERDUE:   { label: 'Quá hạn',      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Đã huỷ',       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/**
 * Mọi hoá đơn (mọi kỳ) của một nhà.
 *
 * Gọi `listInvoices({})` không kèm `period` để lấy trọn lịch sử, rồi lọc tại máy theo nhà.
 * Chỉ gọi khi thật sự cần (mở phòng ra xem, hoặc nhà nguyên căn đang có khách): đây là dữ
 * liệu nặng.
 */
function usePropertyInvoices(propertyId: number, enabled: boolean) {
  const [rows, setRows] = useState<AdminInvoiceRow[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      if (!(await canUseFullInvoices())) { if (active) setDenied(true); return; }
      const all = await adminService.listInvoices({}).catch(() => [] as AdminInvoiceRow[]);
      if (active) setRows(all.filter(r => r.propertyId === propertyId));
    })();
    return () => { active = false; };
  }, [propertyId, enabled]);

  return { rows, denied };
}

type DepositState = 'paid' | 'unpaid' | 'unknown';

/**
 * Cọc của một hợp đồng đã thu chưa.
 *
 * `/host/contracts` KHÔNG trả trạng thái thanh toán (`paymentStatus` luôn trống ở màn host), nên
 * trước đây ô cọc luôn báo "Chưa thu cọc" dù khách đã trả. Cọc thu cùng tiền nhà kỳ đầu qua phiếu
 * gộp `HD-ONBOARD-{id hợp đồng}` → phiếu đó đã thu là cọc đã thu. Không tìm thấy phiếu (không có
 * quyền xem hoá đơn, dữ liệu cũ) thì trả `unknown` — thà không nói còn hơn nói sai.
 */
const depositStateOf = (contract: TenantContractResponse, rows: AdminInvoiceRow[] | null): DepositState => {
  const ps = (contract.paymentStatus || '').toUpperCase();
  if (ps === 'PAID') return 'paid';
  if (!rows) return 'unknown';
  const envelope = rows.find(r => r.isOnboardEnvelope
    && (r.contractId === contract.id || r.code === `HD-ONBOARD-${contract.id}`));
  if (!envelope) return 'unknown';
  return envelope.status === 'PAID' ? 'paid' : 'unpaid';
};

const DepositStateText = ({ state }: { state: DepositState }) => (
  state === 'unknown' ? null : (
    <p className={`text-[11px] font-bold ${state === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
      {state === 'paid' ? '✓ Đã thu cọc' : 'Chưa thu cọc'}
    </p>
  )
);

/**
 * Lịch sử hoá đơn của MỘT phòng — mọi kỳ, không chỉ kỳ đang xem. Dữ liệu do modal nạp một lần
 * (`usePropertyInvoices`) và dùng chung với ô trạng thái cọc.
 */
function RoomInvoiceHistory({ allRows, denied, roomNumber }: {
  allRows: AdminInvoiceRow[] | null;
  denied: boolean;
  roomNumber: string;
}) {
  /** Tháng đang mở — mặc định gập hết, bấm tháng nào mở tháng đó. */
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const toggleMonth = (k: string) => setOpenMonths(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const rows = useMemo(() => {
    if (!allRows) return null;
    const want = normalizeRoomNumber(roomNumber);
    return allRows
      .filter(r => normalizeRoomNumber(r.roomNumber) === want)
      .sort((a, b) => (b.periodKey ?? '').localeCompare(a.periodKey ?? ''));
  }, [allRows, roomNumber]);

  if (denied) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
        Máy chủ chưa mở quyền xem hoá đơn điện, nước, dịch vụ cho chủ nhà — chưa liệt kê được
        lịch sử hoá đơn của phòng.
      </p>
    );
  }
  if (rows == null) {
    return <p className="px-1 text-xs text-slate-400">Đang tải lịch sử hoá đơn…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
        Phòng này chưa phát sinh hoá đơn nào.
      </p>
    );
  }

  // Gom theo kỳ: host đọc hoá đơn theo tháng, không theo dòng rời rạc.
  const byPeriod = new Map<string, AdminInvoiceRow[]>();
  for (const r of rows) {
    const k = r.periodKey ?? '—';
    const bucket = byPeriod.get(k);
    if (bucket) bucket.push(r); else byPeriod.set(k, [r]);
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {[...byPeriod.entries()].map(([key, list]) => {
        const monthOpen = openMonths.has(key);
        const entries = groupOnboardPayments(list, r => r.isOnboardEnvelope, r => r.collectedInInvoiceCode);
        /** Tiền khách THỰC trả trong kỳ: phiếu gộp tính trọn (đã gồm tiền nhà kỳ đầu), không cộng lại dòng con. */
        const paidCash = entries.reduce((s, e) => {
          const r = e.kind === 'onboard' ? e.payment.envelope : e.item;
          return r.status === 'PAID' ? s + r.amount : s;
        }, 0);
        const unpaidRows = entries
          .map(e => (e.kind === 'onboard' ? e.payment.envelope : e.item))
          .filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED');
        const unpaidSum = unpaidRows.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={key}>
            <button type="button" onClick={() => toggleMonth(key)} aria-expanded={monthOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50">
              <p className="flex items-center gap-1.5 text-xs font-black text-slate-600">
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition ${monthOpen ? 'rotate-180' : '-rotate-90'}`} />
                {key === '—' ? 'Không rõ kỳ' : `Tháng ${Number(key.slice(5))}/${key.slice(0, 4)}`}
                <span className="font-semibold text-slate-400">· {entries.length} hoá đơn</span>
              </p>
              <p className={`text-right text-[11px] font-bold ${unpaidRows.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {paidCash > 0 && <>Đã thu {formatCurrency(paidCash)}</>}
                {unpaidRows.length > 0
                  ? <>{paidCash > 0 && ' · '}còn {formatCurrency(unpaidSum)} chưa thu</>
                  : paidCash > 0 ? ' · đủ' : 'Đã thu đủ'}
              </p>
            </button>
            {monthOpen && (
            <div className="mx-3 mb-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {entries.map(e => {
                if (e.kind === 'onboard') {
                  const { envelope, rents, deposit } = e.payment;
                  const st = INV_STATUS_META[envelope.status] ?? INV_STATUS_META.PENDING;
                  return (
                    <div key={envelope.id} className="px-3 py-2">
                      {/* MỘT lần khách trả lúc nhận phòng — tách rõ bên trong gồm những gì. */}
                      <div className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-center leading-none">🧾</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800">Thanh toán lúc nhận phòng</p>
                          <p className="truncate font-mono text-[11px] text-slate-400">{envelope.code} · khách trả một lần</p>
                        </div>
                        <span className="shrink-0 text-xs font-black tabular-nums text-slate-900">{formatCurrency(envelope.amount)}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-black ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="ml-6 mt-1.5 space-y-1 border-l-2 border-slate-100 pl-3">
                        {deposit != null ? (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-600">💰 Tiền cọc <span className="text-slate-400">· hoàn lại khi trả phòng</span></span>
                            <span className="font-bold tabular-nums text-slate-700">{formatCurrency(deposit)}</span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500">Gồm tiền cọc + tiền nhà kỳ đầu</p>
                        )}
                        {rents.map(r => (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate text-slate-600">
                              🏠 Tiền nhà kỳ đầu <span className="font-mono text-slate-400">· {r.code}</span>
                            </span>
                            <span className="font-bold tabular-nums text-slate-700">{formatCurrency(r.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                const r = e.item;
                const meta = INVOICE_TYPE_META[r.type] ?? INVOICE_TYPE_META.OTHER;
                const st = INV_STATUS_META[r.status] ?? INV_STATUS_META.PENDING;
                return (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-4 shrink-0 text-center leading-none">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800">{r.isOnboardEnvelope ? 'Cọc + tiền nhà kỳ đầu' : meta.label}</p>
                      <p className="truncate font-mono text-[11px] text-slate-400">{r.code}</p>
                      {r.collectedAtOnboard && (
                        <p className="text-[11px] font-semibold text-emerald-700">Đã thu cùng cọc lúc nhận phòng, không thu thêm</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-black tabular-nums text-slate-900">{formatCurrency(r.amount)}</span>
                    <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-black ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoomDetailModal({
  room, tenant, incoming, pastTenants, propertyId, canChange, onClose, onConfirmStatus,
}: {
  room: RoomResponse;
  tenant: TenantContractResponse | null;
  /** Hồ sơ khách SẮP dọn vào (chờ đón / đã chốt) — chỉ khi phòng chưa có khách ở. */
  incoming: TenantContractResponse | null;
  /** Hợp đồng ĐÃ kết thúc của chính phòng này — các đời khách trước. */
  pastTenants: TenantContractResponse[];
  propertyId: number;
  canChange: boolean;
  onClose: () => void;
  onConfirmStatus: (roomId: number, status: string) => Promise<void>;
}) {
  /** BE đẩy CẢ PHÒNG sang MAINTENANCE khi có phiếu sửa mở (MaintenanceServiceImpl.markRoomMaintenance). */
  const fixing = room.status === 'MAINTENANCE';
  const st = (incoming && !tenant ? roomStatusMap.INCOMING
    : fixing && tenant ? roomStatusMap.RENTED
      : roomStatusMap[room.status]) ?? roomStatusMap.DRAFT;
  const [selected, setSelected] = useState<string>(room.status);
  const [saving, setSaving] = useState(false);
  const dirty = selected !== room.status;
  // Nạp một lần, dùng chung cho lịch sử hoá đơn và ô trạng thái cọc.
  const { rows: invoiceRows, denied: invoicesDenied } = usePropertyInvoices(propertyId, true);
  const depositState = tenant ? depositStateOf(tenant, invoiceRows) : 'unknown';

  // ESC để đóng (không đóng khi đang lưu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    await onConfirmStatus(room.id, selected);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0"><DoorOpen className="w-5 h-5 text-indigo-500" /></div>
            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">Phòng {room.roomNumber}</h2>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                </span>
                {fixing && tenant && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
                    <Wrench className="h-3 w-3" /> Đang sửa thiết bị
                  </span>
                )}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Ảnh phòng — chỉ render khi thực sự có URL (tránh ảnh lỗi hiện chữ alt) */}
          {typeof room.imageUrls === 'string' && room.imageUrls.trim() !== '' && (
            <img src={room.imageUrls} alt={`Phòng ${room.roomNumber}`}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              className="h-44 w-full rounded-xl border border-slate-100 object-cover" />
          )}

          {/* Thông tin phòng */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell icon={Ruler} label="Diện tích" value={fmtArea(room.area)} />
            <InfoCell icon={Users} label="Sức chứa" value={room.maxOccupants != null ? `${room.maxOccupants} người` : '—'} />
            <InfoCell icon={BadgeDollarSign} label="Giá thuê / tháng" value={room.price != null ? formatCurrency(room.price) : '—'} highlight />
            <InfoCell icon={Wallet} label="Tiền cọc" value={room.deposit != null ? formatCurrency(room.deposit) : (tenant?.deposit ? formatCurrency(tenant.deposit) : '—')} />
            <InfoCell icon={Zap} label="Đơn giá điện & nước" value="Theo giá nhà nước hằng tháng" className="col-span-2" />
          </div>

          {room.structureDescription && (
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="mb-1 text-xs text-slate-400">Mô tả / cấu trúc</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{room.structureDescription}</p>
            </div>
          )}

          {/* Khách thuê */}
          {tenant && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5" /> Khách thuê hiện tại</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">{tenant.tenantFullName.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{tenant.tenantFullName}</p>
                  <MaskedField value={tenant.tenantPhone} icon={Phone} emptyText="" className="text-sm text-slate-500" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {/* CCCD — host được xem đủ (bấm mắt), trước đây khối này bỏ hẳn nên
                    muốn đối chiếu giấy tờ phải sang màn Hợp đồng tìm lại. */}
                <div className="col-span-2 rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">CCCD / MST</p>
                  <MaskedField value={tenant.tenantCccd} emptyText="Chưa có"
                    className="text-sm font-bold text-slate-800" />
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">Giá thuê</p>
                  <p className="font-bold text-slate-800">{formatCurrency(tenant.rentAmount)}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Wallet className="w-3 h-3" /> Tiền cọc</p>
                  <p className="font-bold text-slate-800">{tenant.deposit ? formatCurrency(tenant.deposit) : '—'}</p>
                  <DepositStateText state={depositState} />
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Kỳ hạn</p>
                  <p className="font-bold text-slate-800 text-xs mt-0.5">{fmtDate(tenant.startDate)} → {tenant.endDate ? fmtDate(tenant.endDate) : 'Không thời hạn'}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">Ngày vào ở</p>
                  <p className="font-bold text-slate-800 text-xs mt-0.5">
                    {fmtDate(tenant.moveInDate || tenant.startDate)}
                  </p>
                </div>
                {tenant.contractCode && (
                  <div className="col-span-2 rounded-lg bg-white/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Mã hợp đồng</p>
                    <p className="font-bold text-slate-800 text-xs mt-0.5">{tenant.contractCode}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Thiết bị trong phòng — kèm trạng thái bảo trì, lịch sử và mã QR từng món,
              để host xem phòng nào thì thấy luôn đồ của phòng đó, khỏi sang tab Thiết bị lọc lại. */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Package className="h-4 w-4 text-slate-400" /> Thiết bị trong phòng
            </p>
            <RoomEquipmentSection propertyId={propertyId} roomId={room.id} roomLabel={`Phòng ${room.roomNumber}`}
              roomUnderMaintenance={room.status === 'MAINTENANCE'} />
          </div>

          {/* Khách sắp dọn vào — hồ sơ đón khách đang giữ phòng này */}
          {incoming && !tenant && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                <CalendarClock className="h-3.5 w-3.5" />
                {incoming.status === 'DRAFT' ? 'Khách chờ đón vào ở' : 'Khách đã chốt, chưa dọn vào'}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">
                  {(incoming.tenantFullName || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{incoming.tenantFullName || '(chưa có tên)'}</p>
                  <MaskedField value={incoming.tenantPhone} icon={Phone} emptyText="" className="text-sm text-slate-500" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">Dự kiến vào ở</p>
                  <p className="mt-0.5 text-xs font-bold text-slate-800">{fmtDate(incoming.moveInDate || incoming.startDate)}</p>
                </div>
                <div className="rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-xs text-slate-400">Giá thuê</p>
                  <p className="font-bold text-slate-800">{formatCurrency(incoming.rentAmount)}</p>
                </div>
                {incoming.contractCode && (
                  <div className="col-span-2 rounded-lg bg-white/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Mã hợp đồng</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-800">{incoming.contractCode}</p>
                  </div>
                )}
              </div>
              <p className="mt-2.5 text-[11px] text-violet-700">
                Phòng đã có người giữ chỗ — không xếp thêm khách khác vào phòng này.
              </p>
            </div>
          )}

          {/* Các đời khách trước của CHÍNH phòng này.
              Cùng một phòng qua nhiều đời khách, mà trước đây modal chỉ biết đến hợp
              đồng ACTIVE — phòng vừa trả là sạch trơn, không còn dấu vết ai từng ở. */}
          {pastTenants.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <History className="h-4 w-4 text-slate-400" /> Khách đã ở ({pastTenants.length})
              </p>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {pastTenants.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      {c.tenantFullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{c.tenantFullName}</p>
                      <p className="truncate text-xs text-slate-400">
                        {fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : '—'}
                        {c.contractCode && ` · ${c.contractCode}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                      {c.status === 'EXPIRED' ? 'Hết hạn' : c.status === 'TERMINATED' ? 'Đã thanh lý' : c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lịch sử hoá đơn của phòng — mọi kỳ */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Wallet className="h-4 w-4 text-slate-400" /> Hoá đơn của phòng
            </p>
            <RoomInvoiceHistory allRows={invoiceRows} denied={invoicesDenied} roomNumber={room.roomNumber} />
          </div>

          {/* Đổi trạng thái */}
          {canChange ? (
            <div>
              <p className="text-sm font-bold text-slate-800 mb-2">Đổi trạng thái phòng</p>
              <div className="space-y-2">
                {STATUS_OPTIONS.map(opt => {
                  const isActive = selected === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setSelected(opt.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${isActive ? opt.activeCls : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                      {opt.icon}
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.desc}</p>
                      </div>
                      {isActive && <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <button onClick={handleSave} disabled={!dirty || saving}
                className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {saving ? 'Đang lưu...' : 'Lưu trạng thái'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
              {tenant || room.status === 'RENTED'
                ? 'Phòng đang có khách ở — trạng thái tự cập nhật theo hợp đồng.'
                : room.status === 'MAINTENANCE'
                  ? 'Phòng đang có phiếu sửa chữa — hệ thống tự trả về "Phòng trống" khi quản lý đóng phiếu.'
                  : incoming
                    ? 'Phòng đã có khách chờ đón — trạng thái tự cập nhật khi khách nhận phòng.'
                    : 'Trạng thái phòng do quản lý vận hành cập nhật khi cần (khoá phòng, sửa chữa…).'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export const PropertyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useWebAuth();

  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [roomSearch, setRoomSearch] = useState('');
  const [roomSort, setRoomSort] = useState<RoomSort>('number');
  const [selectedRoom, setSelectedRoom] = useState<RoomResponse | null>(null);
  /** Phòng đang mở hộp đổi giá (tab Phòng). */
  const [priceRoom, setPriceRoom] = useState<RoomResponse | null>(null);
  /** Phòng đang mở lịch sử giá riêng. */
  const [historyRoom, setHistoryRoom] = useState<RoomResponse | null>(null);
  // Chia nội dung thành tab thay vì cuộn 1 trang rất dài.
  const [tab, setTab] = useState<DetailTab>('overview');
  // Index ảnh đang xem phóng to trong thư viện ảnh tòa nhà (null = đóng).
  const [lightbox, setLightbox] = useState<number | null>(null);
  /**
   * Kỳ đang xem. Đổi kỳ thì đổi CẢ hoá đơn lẫn khách thuê / trạng thái phòng trong kỳ đó.
   *
   * Trước đây kỳ chỉ đổi phần hoá đơn, còn khách thuê luôn là "hiện tại": lùi về tháng 3/2025 vẫn
   * thấy 5 phòng "Đang thuê" dù hợp đồng mới bắt đầu 01/09/2026 — đọc như có khách từ năm ngoái.
   */
  const [period, setPeriod] = useServerPeriod();
  /** Kỳ hiện tại (hoặc tương lai) → dùng trạng thái sống của phòng; kỳ đã qua → suy từ hợp đồng. */
  const isNowPeriod = period >= currentMonth();
  /** Khách ở trong kỳ đang xem — `roomId` bỏ trống = nhà nguyên căn (mọi hợp đồng của nhà). */
  const tenantInPeriod = (roomId?: number): TenantContractResponse | null => {
    const mine = contracts.filter(c => roomId == null || c.roomId === roomId);
    if (isNowPeriod) return mine.find(c => c.status === 'ACTIVE') ?? null;
    return mine
      .filter(c => contractCoversMonth(c, period))
      .sort((a, b) => (b.moveInDate || b.startDate || '').localeCompare(a.moveInDate || a.startDate || ''))[0] ?? null;
  };
  /** Phòng đang có khách ở (HĐ ACTIVE) — dùng để tách "đang sửa có khách" khỏi "bảo trì bỏ trống". */
  const hasTenantNow = (roomId: number) => contracts.some(c => c.roomId === roomId && c.status === 'ACTIVE');
  /** Hồ sơ đón khách đang giữ phòng (chỉ có nghĩa ở kỳ hiện tại / tương lai). */
  const incomingFor = (roomId: number): TenantContractResponse | null =>
    contracts.find(c => c.roomId === roomId && isIncomingContract(c)) ?? null;
  /** Trạng thái hiển thị của phòng theo kỳ đang xem. */
  const roomStatusInPeriod = (room: RoomResponse): string => {
    if (!isNowPeriod) return tenantInPeriod(room.id) ? 'RENTED' : 'PAST_EMPTY';
    // Chưa có khách ở mà đã có hồ sơ đón → "Chờ đón khách", thắng status AVAILABLE/DRAFT của phòng.
    /*
     * BE đặt CẢ PHÒNG = MAINTENANCE khi có phiếu sửa thiết bị mở, kể cả lúc khách vẫn đang ở.
     * Hiện "Bảo trì" cho phòng có người là sai: đọc như phòng trống để sửa, và phòng rớt khỏi
     * số "Đang thuê". Có khách thì nhãn chính là "Đang thuê", việc sửa thành nhãn phụ trên thẻ.
     */
    if (room.status === 'MAINTENANCE' && hasTenantNow(room.id)) return 'RENTED';
    if (room.status !== 'RENTED' && incomingFor(room.id)) return 'INCOMING';
    return room.status;
  };
  const [bills, setBills] = useState<PropertyBillBreakdown | null>(null);
  const [billsLoading, setBillsLoading] = useState(true);
  /** Lưới phòng chỉ hiện phòng còn hoá đơn chưa trả trong kỳ. */
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [prop, roomList, mgrs, hostContracts] = await Promise.all([
        propertyService.getPropertyById(Number(id)),
        propertyService.getRooms(Number(id)),
        propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
        // Host xem HĐ khách thuê qua /host/contracts (endpoint /properties/.../tenant-contracts chỉ cho MANAGER/ADMIN).
        hostService.listAllContracts({ propertyId: Number(id) }).catch(() => null),
      ]);

      // Host dùng /host/contracts; nếu trống (vd manager/admin xem) thì fallback endpoint manager.
      let contractList: TenantContractResponse[];
      if (hostContracts && hostContracts.length) {
        contractList = hostContracts.map(hc => hostContractToTenant(hc, roomList));
      } else {
        contractList = await tenantService.listByProperty(Number(id), { silent: true }).catch(() => [] as TenantContractResponse[]);
      }
      // Patch tên manager nếu BE chưa trả (mục 6 NOTE-CHO-TEAM-BE.md)
      if (prop.operationManagerId && !prop.operationManagerName) {
        const mgr = mgrs.find(m => m.id === prop.operationManagerId);
        if (mgr) prop.operationManagerName = mgr.fullName || mgr.username;
      }
      setProperty(prop);
      setRooms(roomList);
      setContracts(contractList ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  /**
   * Hoá đơn của kỳ đang chọn.
   *
   * Chờ có `property` mới gọi: chế độ rút gọn (`/host/invoices`) không trả `propertyId`
   * nên phải khớp bằng TÊN nhà — gọi trước khi biết tên thì lọc ra rỗng.
   */
  useEffect(() => {
    if (!id || !property) return;
    let cancelled = false;
    setBillsLoading(true);
    loadPropertyBills(Number(id), property.propertyName, period)
      .then(res => { if (!cancelled) setBills(res); })
      .catch(() => { if (!cancelled) setBills(null); })
      .finally(() => { if (!cancelled) setBillsLoading(false); });
    return () => { cancelled = true; };
  }, [id, property, period]);

  const handleUpdateRoomStatus = async (roomId: number, status: string) => {
    if (!id) return;
    try {
      await propertyService.updateRoomStatus(Number(id), roomId, status);
      toast.success('Cập nhật trạng thái phòng thành công!');
      setSelectedRoom(null);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: status as RoomResponse['status'] } : r));
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Cập nhật thất bại, vui lòng thử lại.');
    }
  };

  /** Phòng còn hoá đơn chưa trả trong kỳ — khoá là số phòng đã chuẩn hoá. */
  const unpaidRoomKeys = useMemo(() => {
    const set = new Set<string>();
    bills?.byRoom.forEach((b, key) => { if (b.pending + b.overdue > 0) set.add(key); });
    return set;
  }, [bills]);
  const unpaidRoomCount = unpaidRoomKeys.size;

  // Lọc theo trạng thái + công nợ + tìm theo số phòng / tên khách + sắp xếp.
  const filteredRooms = useMemo(() => {
    const kw = normalizeVi(roomSearch.trim());
    const list = rooms.filter(r => {
      // Kỳ đã qua không có chip "Bảo trì" — lỡ đang chọn thì bỏ qua thay vì ra lưới rỗng.
      if (filterStatus !== 'all' && !(filterStatus === 'MAINTENANCE' && !isNowPeriod)) {
        const s = roomStatusInPeriod(r);
        // Kỳ đã qua: chip "Phòng trống" gom luôn các phòng chưa có khách trong kỳ.
        if (!(s === filterStatus || (filterStatus === 'AVAILABLE' && s === 'PAST_EMPTY'))) return false;
      }
      if (onlyUnpaid && !unpaidRoomKeys.has(normalizeRoomNumber(r.roomNumber))) return false;
      if (kw) {
        const tenant = tenantInPeriod(r.id) ?? (isNowPeriod ? incomingFor(r.id) : null);
        const hay = [r.roomNumber, r.structureDescription, tenant?.tenantFullName, tenant?.tenantPhone]
          .filter(Boolean).map(v => normalizeVi(String(v))).join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      switch (roomSort) {
        case 'number_desc': return b.roomNumber.localeCompare(a.roomNumber, 'vi', { numeric: true });
        case 'price_desc':  return (b.price ?? 0) - (a.price ?? 0);
        case 'price_asc':   return (a.price ?? 0) - (b.price ?? 0);
        case 'area_desc':   return (b.area ?? 0) - (a.area ?? 0);
        default:            return a.roomNumber.localeCompare(b.roomNumber, 'vi', { numeric: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, contracts, filterStatus, roomSearch, roomSort, onlyUnpaid, unpaidRoomKeys, period]);

  // Nhà nguyên căn đang có khách: cần mọi hoá đơn (mọi kỳ) để biết cọc đã thu chưa — phiếu gộp cọc
  // nằm ở kỳ nhận nhà, không phải kỳ đang xem. Nhà chia phòng thì modal phòng tự nạp.
  const hasWholeHouseTenant = property?.wholeHouse === true && contracts.some(c => c.status === 'ACTIVE');
  const { rows: houseInvoiceRows } = usePropertyInvoices(Number(id), hasWholeHouseTenant);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 mb-4" />
          <p className="text-sm text-slate-400 font-medium">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Không tìm thấy thông tin căn nhà này.</p>
        <button onClick={() => navigate('/host/properties')} className="mt-4 px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Quay lại danh sách</button>
      </div>
    );
  }

  /** Phòng chưa có khách ở nhưng đã có hồ sơ đón khách — tính riêng, KHÔNG phải phòng trống. */
  // Phòng MAINTENANCE mà có khách ở vẫn là "Đang thuê" — xem `roomStatusInPeriod`.
  const occupiedFixing = (r: RoomResponse) => r.status === 'MAINTENANCE' && hasTenantNow(r.id);
  const incoming    = rooms.filter(r => r.status !== 'RENTED' && !occupiedFixing(r) && incomingFor(r.id)).length;
  const available   = rooms.filter(r => r.status === 'AVAILABLE' && !incomingFor(r.id)).length;
  const rented      = rooms.filter(r => r.status === 'RENTED' || occupiedFixing(r)).length;
  const maintenance = rooms.filter(r => r.status === 'MAINTENANCE' && !occupiedFixing(r) && !incomingFor(r.id)).length;
  // Phòng đã tạo nhưng chưa mở cho thuê — phần dư, để thanh tỉ lệ cộng đủ 100%.
  const notReady    = rooms.length - available - rented - maintenance - incoming;
  const propStatus  = propertyStatusLabel[property.status] ?? propertyStatusLabel.DRAFT;

  // Tách UI theo loại hình: nhà nguyên căn vs nhà chia phòng
  const isWholeHouse = property.wholeHouse === true;
  const activeContract = contracts.find(c => c.status === 'ACTIVE') ?? null;

  // Dải chỉ số trong hero — khác nhau theo loại hình
  const heroStats: { label: string; value: string | number; icon: typeof DoorOpen; color: string; bg: string }[] = isWholeHouse
    ? [
        { label: 'Diện tích',  value: fmtArea(property.areaSize), icon: Ruler,      color: 'text-indigo-500',  bg: 'bg-indigo-50' },
        { label: 'Số tầng',    value: property.totalFloor ?? property.floorCount ?? '—',   icon: Layers,     color: 'text-slate-600',   bg: 'bg-slate-50' },
        { label: 'Số phòng',   value: property.totalRooms || '—',                          icon: DoorOpen,   color: 'text-violet-600',  bg: 'bg-violet-50' },
        (() => {
          // "Còn trống" chỉ khi không ai ở VÀ không có hồ sơ chờ đón — trước đây căn đã có
          // khách chốt ngày vào vẫn hiện "Còn trống".
          const incomingC = !activeContract ? contracts.find(isIncomingContract) : undefined;
          return activeContract
            ? { label: 'Cho thuê', value: 'Đang thuê', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' }
            : incomingC
              ? { label: 'Cho thuê', value: 'Chờ đón khách', icon: CalendarClock, color: 'text-violet-600', bg: 'bg-violet-50' }
              : { label: 'Cho thuê', value: 'Còn trống', icon: CircleCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' };
        })(),
      ]
    : [
        { label: 'Tổng phòng',  value: rooms.length, icon: DoorOpen,    color: 'text-indigo-500',  bg: 'bg-indigo-50' },
        { label: 'Phòng trống', value: available,    icon: CircleCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ...(incoming > 0
          ? [{ label: 'Chờ đón khách', value: incoming, icon: CalendarClock, color: 'text-violet-600', bg: 'bg-violet-50' }]
          : []),
        { label: 'Đang thuê',   value: rented,       icon: Users,       color: 'text-blue-600',    bg: 'bg-blue-50' },
        { label: 'Bảo trì',     value: maintenance,  icon: Wrench,      color: 'text-amber-600',   bg: 'bg-amber-50' },
        { label: 'Số tầng',     value: property.totalFloor ?? property.floorCount ?? '—', icon: Layers, color: 'text-slate-600', bg: 'bg-slate-50' },
      ];

  // Đếm theo KỲ ĐANG XEM. Kỳ đã qua chỉ biết chắc có khách hay không (không có lịch sử bảo trì /
  // mở phòng), nên gom thành 2 nhóm và ẩn chip "Bảo trì".
  const rentedInPeriod = isNowPeriod ? rented : rooms.filter(r => tenantInPeriod(r.id)).length;
  const periodCounts = isNowPeriod
    ? { total: rooms.length, rented, available, maintenance, notReady }
    : { total: rooms.length, rented: rentedInPeriod, available: rooms.length - rentedInPeriod, maintenance: 0, notReady: 0 };
  const houseTenant = tenantInPeriod();
  /** Nguyên căn: hồ sơ đón khách đang giữ căn (chưa có ai ở). */
  const houseIncoming = isWholeHouse && isNowPeriod && !houseTenant
    ? contracts.find(isIncomingContract) ?? null
    : null;
  /** Nguyên căn: các đời khách đã ở — cùng kiểu mục "Khách đã ở" trong hộp phòng. */
  const housePast = isWholeHouse
    ? contracts
      .filter(c => c.status === 'EXPIRED' || c.status === 'TERMINATED')
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
    : [];

  const FILTER_TABS = [
    { value: 'all',         label: 'Tất cả',    count: rooms.length },
    { value: 'AVAILABLE',   label: isNowPeriod ? 'Phòng trống' : 'Chưa có khách', count: periodCounts.available },
    ...(isNowPeriod && incoming > 0 ? [{ value: 'INCOMING', label: 'Chờ đón khách', count: incoming }] : []),
    { value: 'RENTED',      label: 'Đang thuê',   count: periodCounts.rented },
    ...(isNowPeriod ? [{ value: 'MAINTENANCE', label: 'Bảo trì', count: maintenance }] : []),
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Back */}
      <button onClick={() => navigate('/host/properties')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors font-medium">
        <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
      </button>

      {/* ── Header hồ sơ ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black leading-tight text-slate-900">{property.propertyName}</h1>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${propStatus.cls}`}>
                  {propStatus.label}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {property.fullAddress || property.shortAddress}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                {property.zoneName && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{property.zoneName}</span>
                )}
                <span className={`rounded-full px-2 py-0.5 font-bold ${
                  isWholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {isWholeHouse ? 'Nhà nguyên căn' : 'Nhà chia phòng'}
                </span>
                {/* Quản lý đến từ KHU VỰC của nhà, không gán riêng lẻ được nữa —
                    chip dẫn thẳng sang màn Khu vực để xem/đổi cho cả vùng. */}
                <Link
                  to="/host/zones"
                  title={`Quản lý được phân công theo khu vực${property.zoneName ? ` ${property.zoneName}` : ''} — bấm để xem hoặc đổi cho cả khu vực`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition hover:ring-1 hover:ring-indigo-300 ${
                    property.operationManagerId ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <UserCog className="h-3 w-3" />
                  {property.operationManagerId
                    ? `Quản lý: ${property.operationManagerName || 'Đã gán'}`
                    : 'Khu vực chưa có quản lý'}
                </Link>
              </div>
            </div>
          </div>

          {/* Hành động — KHÔNG còn gán quản lý cho từng nhà: quản lý theo khu vực. */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/host/zones"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <MapPin className="h-4 w-4" />
              Quản lý theo khu vực
            </Link>
            <button onClick={fetchData} title="Tải lại dữ liệu"
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Thông số nhanh */}
        <div className={`grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 sm:divide-y-0 ${
          isWholeHouse ? 'sm:grid-cols-4' : heroStats.length >= 6 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'
        }`}>
          {heroStats.map(s => (
            <div key={s.label} className="flex items-center gap-3 px-5 py-3.5">
              <div className={`shrink-0 rounded-lg p-2 ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black leading-tight text-slate-900">{s.value}</p>
                <p className="text-[11px] font-semibold text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/70 px-3 py-2">
          {DETAIL_TABS.map(t => {
            const Icon = t.icon;
            const activeTab = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                  activeTab
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                }`}>
                <Icon className="h-4 w-4" />
                {t.key === 'units' ? (isWholeHouse ? 'Đơn vị cho thuê' : 'Phòng') : t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/*
        ═══════════ Tình trạng nhà: có khách chưa · thu tiền tới đâu ═══════════
        Đặt NGAY ĐẦU tab Tổng quan, trước cả ảnh: đây là hai câu host mở màn chi tiết
        ra để hỏi. Trước 30/08/2026 cả trang không trả lời được câu nào trong hai câu.
      */}
      {tab === 'overview' && (
        <PropertyStatusPanel
          isWholeHouse={isWholeHouse}
          counts={periodCounts}
          tenantName={houseTenant?.tenantFullName}
          contractEnd={houseTenant?.endDate ? fmtDate(houseTenant.endDate) : undefined}
          pastPeriod={!isNowPeriod}
          bills={bills}
          period={period}
          onPeriodChange={setPeriod}
          loading={billsLoading}
        />
      )}
      {tab === 'overview' && (
        <EquipmentAlertStrip propertyId={Number(id)} onOpenEquipment={() => setTab('equipment')} />
      )}

      {/* ═══════════ Vị trí trên bản đồ (cả 2 loại hình) ═══════════ */}
      {/* ═══════════ Hình ảnh tòa nhà ═══════════ */}
      {tab === 'overview' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <ImageIcon className="h-5 w-5 text-indigo-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Hình ảnh tòa nhà</h2>
            {(property.imageUrls?.length ?? 0) > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                {property.imageUrls!.length}
              </span>
            )}
          </div>

          {(property.imageUrls?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">Tòa nhà này chưa có hình ảnh</p>
              <p className="mt-1 text-xs text-slate-400">Ảnh được tải lên ở bước khởi tạo nhà.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {property.imageUrls!.map((url, i) => (
                <button key={i} onClick={() => setLightbox(i)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200">
                  <img src={url} alt={`Ảnh ${i + 1}`}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-xs font-bold text-white opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                    Xem ảnh lớn
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'overview' && (property.fullAddress || property.shortAddress) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-rose-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Vị trí</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <PropertyMap address={property.fullAddress || property.shortAddress} height={200} />
            </div>
            <div className="flex flex-col justify-center gap-3.5">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Địa chỉ</p>
                <p className="font-semibold text-slate-800 leading-snug">{property.fullAddress || property.shortAddress}</p>
              </div>
              {property.zoneName && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Khu vực</p>
                  <p className="font-semibold text-slate-800">{property.zoneName}</p>
                </div>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.fullAddress || property.shortAddress || '')}`}
                target="_blank" rel="noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 transition"
              >
                <MapPin className="h-4 w-4" /> Mở trên Google Maps
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ NHÀ NGUYÊN CĂN — căn nhà là 1 đơn vị cho thuê ═══════════ */}
      {tab === 'units' && isWholeHouse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Thông tin cho thuê */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Home className="w-5 h-5 text-indigo-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Thông tin cho thuê</h2>
            </div>
            <div className="space-y-2.5">
              {/* Giá thuê: đọc `appliedPrice` (số đang thu) chứ không phải `price` cũ,
                  và có sẵn nút đổi giá / lịch sử ngay tại đây — cùng kiểu với thẻ phòng
                  của nhà chia phòng, thay vì một thẻ giá riêng ở tab Tổng quan. */}
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-slate-500"><BadgeDollarSign className="w-4 h-4" /> Giá thuê / tháng</span>
                  <span className="font-extrabold text-indigo-600 text-lg">
                    {(property.appliedPrice ?? property.price) != null
                      ? formatCurrency((property.appliedPrice ?? property.price)!)
                      : '—'}
                  </span>
                </div>
                {(() => {
                  const listed = property.listedPrice ?? property.price;
                  const applied = property.appliedPrice ?? property.price;
                  return listed != null && applied != null && listed !== applied ? (
                    <p className="mt-1 text-right text-xs text-slate-400">
                      niêm yết {formatCurrency(listed)} · quay lại khi khách trả phòng
                    </p>
                  ) : null;
                })()}
                <div className="mt-2">
                  <WholeHousePriceActions property={property} onChanged={fetchData} />
                </div>
              </div>
              {/* Nhà nguyên căn không lưu cọc ở cấp nhà (`property.deposit` trống) — cọc nằm trong hợp đồng.
                  Đang có khách thì hiện cọc của hợp đồng đó thay vì "—". */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Wallet className="w-4 h-4" /> Tiền cọc</span>
                <span className="text-right">
                  <span className="block font-bold text-slate-800">
                    {activeContract?.deposit
                      ? formatCurrency(activeContract.deposit)
                      : property.deposit != null ? formatCurrency(property.deposit) : '—'}
                  </span>
                  {activeContract?.deposit ? (
                    <span className="block text-[11px] text-slate-400">theo hợp đồng đang thuê</span>
                  ) : null}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Ruler className="w-4 h-4" /> Diện tích</span>
                <span className="font-bold text-slate-800">{fmtArea(property.areaSize)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-500"><Building2 className="w-4 h-4" /> Loại hình</span>
                <span className="font-bold text-slate-800">Nhà nguyên căn</span>
              </div>
            </div>
          </div>

          {/* Khách thuê — theo KỲ ĐANG XEM (kỳ hiện tại = khách đang ở; tháng đã qua = khách ở trong tháng đó) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <UserRound className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {isNowPeriod ? 'Khách thuê hiện tại' : `Khách thuê ${monthLabel(period).toLowerCase()}`}
              </h2>
              {/*
                Ô chọn kỳ đặt ở ĐẦU thẻ, không nằm trong phần có khách: tháng không có khách thì thẻ
                rỗng, ô chọn mà nằm trong phần đó là mất luôn đường quay lại tháng khác.
                State dùng chung với tab Tổng quan — hai tab không hiện cùng lúc.
              */}
              <div className="ml-auto">
                <MonthPicker value={period} onChange={setPeriod} />
              </div>
            </div>
            {houseTenant ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">
                    {houseTenant.tenantFullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{houseTenant.tenantFullName}</p>
                    <MaskedField value={houseTenant.tenantPhone} icon={Phone} emptyText="" className="text-sm text-slate-500" />
                  </div>
                  <span className={`ml-auto shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                    houseTenant.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {houseTenant.status === 'ACTIVE' ? 'Đang thuê' : 'Đã trả nhà'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><BadgeDollarSign className="w-3 h-3" /> Giá thuê</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(houseTenant.rentAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Wallet className="w-3 h-3" /> Tiền cọc</p>
                    <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(houseTenant.deposit)}</p>
                    <DepositStateText state={depositStateOf(houseTenant, houseInvoiceRows)} />
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 col-span-2">
                    <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Kỳ hạn hợp đồng</p>
                    <p className="font-bold text-slate-800 mt-0.5">{fmtDate(houseTenant.startDate)} → {houseTenant.endDate ? fmtDate(houseTenant.endDate) : 'Không thời hạn'}</p>
                  </div>
                </div>

                {/* Khách này kỳ này trả tới đâu — cùng dữ liệu với khối ở tab Tổng quan. */}
                <div>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {billHeading(bills?.source, period)}
                  </p>
                  {billsLoading ? (
                    <p className="text-sm text-slate-400">Đang tải…</p>
                  ) : (bills?.total.total ?? 0) === 0 ? (
                    <p className="text-sm text-slate-400">Kỳ này chưa phát sinh hoá đơn nào.</p>
                  ) : (
                    <>
                      <WholeHouseBillLine bills={bills!} />
                      {/* Từng hoá đơn một — giống modal phòng của nhà chia phòng: biết đích xác khoản nào
                          đã trả, khoản nào còn nợ, chứ không chỉ "1/2 đã thu". */}
                      {bills!.lines.length > 0 && <BillLines lines={bills!.lines} showWhere={false} />}
                    </>
                  )}
                </div>
              </div>
            ) : houseIncoming ? (
              /* Có hồ sơ đón khách — căn KHÔNG trống dù chưa ai dọn vào */
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-700">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {houseIncoming.status === 'DRAFT' ? 'Khách chờ đón vào ở' : 'Khách đã chốt, chưa dọn vào'}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">
                    {(houseIncoming.tenantFullName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{houseIncoming.tenantFullName || '(chưa có tên)'}</p>
                    <MaskedField value={houseIncoming.tenantPhone} icon={Phone} emptyText="" className="text-sm text-slate-500" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-white/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Dự kiến vào ở</p>
                    <p className="mt-0.5 font-bold text-slate-800">{fmtDate(houseIncoming.moveInDate || houseIncoming.startDate)}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Giá thuê</p>
                    <p className="mt-0.5 font-bold text-slate-800">{formatCurrency(houseIncoming.rentAmount)}</p>
                  </div>
                  {houseIncoming.contractCode && (
                    <div className="col-span-2 rounded-lg bg-white/70 px-3 py-2">
                      <p className="text-xs text-slate-400">Mã hợp đồng</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-800">{houseIncoming.contractCode}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : isNowPeriod ? (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <CircleCheck className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="font-bold text-slate-700">Căn nhà đang trống</p>
                <p className="text-sm text-slate-400 mt-1">Chưa có khách thuê. Onboard khách ở mục “Khách thuê”.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <p className="font-bold text-slate-500">{monthLabel(period)} chưa có khách thuê</p>
                <p className="mt-1 text-sm text-slate-400">Không có hợp đồng thuê nào nằm trong tháng này.</p>
              </div>
            )}

            {/* Các đời khách trước của căn — trước đây nguyên căn không có mục này */}
            {housePast.length > 0 && (
              <details className="mt-4 rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-slate-700">
                  <History className="h-4 w-4 text-slate-400" /> Khách đã ở ({housePast.length})
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {housePast.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {(c.tenantFullName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{c.tenantFullName || '(chưa có tên)'}</p>
                        <p className="truncate text-xs text-slate-400">
                          {fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : '—'}{c.contractCode && ` · ${c.contractCode}`}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                        {c.status === 'EXPIRED' ? 'Hết hạn' : 'Đã thanh lý'}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ NHÀ CHIA PHÒNG — grid phòng + filter ═══════════ */}
      {tab === 'units' && !isWholeHouse && (
        <>
      {/* Thanh công cụ: chip trạng thái · tìm phòng · sắp xếp */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map(t => (
            <button key={t.value} onClick={() => setFilterStatus(t.value)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                filterStatus === t.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}>
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                filterStatus === t.value ? 'bg-white/25' : 'bg-white text-slate-500'
              }`}>{t.count}</span>
            </button>
          ))}
          {/*
            Lọc theo TIỀN, tách khỏi dãy chip trạng thái phòng bên trái: hai thứ khác
            nhóm hẳn nhau (phòng đang ở tình trạng gì · phòng đã trả tiền chưa) và
            được phép bật cùng lúc. Chỉ hiện khi có phòng còn nợ — không có ai nợ thì
            nút này không lọc được gì.
          */}
          {unpaidRoomCount > 0 && (
            <button onClick={() => setOnlyUnpaid(v => !v)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                onlyUnpaid ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
              }`}>
              Còn nợ tiền
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                onlyUnpaid ? 'bg-white/25' : 'bg-white text-rose-500'
              }`}>{unpaidRoomCount}</span>
            </button>
          )}
        </div>

        <div className="relative ml-auto min-w-[150px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={roomSearch} onChange={e => setRoomSearch(e.target.value)}
            placeholder="Tìm số phòng, khách thuê..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
          {roomSearch && (
            <button onClick={() => setRoomSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <select value={roomSort} onChange={e => setRoomSort(e.target.value as RoomSort)}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
          <option value="number">Số phòng ↑</option>
          <option value="number_desc">Số phòng ↓</option>
          <option value="price_desc">Giá cao nhất</option>
          <option value="price_asc">Giá thấp nhất</option>
          <option value="area_desc">Diện tích lớn nhất</option>
        </select>

        {/* Lịch sử giá TOÀN NHÀ — từng phòng đã có nút riêng trên thẻ, nút này để xem
            tổng hợp mọi phòng khi cần rà lại cả nhà. */}
        <AllRoomsPriceHistoryButton property={property} />

        {/*
          Ô chọn kỳ lặp lại từ tab Tổng quan (chung state). Chip hoá đơn nằm trên từng
          thẻ phòng ngay dưới đây, nên bắt host quay về tab kia chỉ để đổi tháng là
          bắt đi đường vòng. Hai tab không hiện cùng lúc nên không sợ đọc nhầm thành
          hai giá trị khác nhau.
        */}
        <MonthPicker value={period} onChange={setPeriod} />
      </div>

      {/*
        Tổng của cả nhà, đặt ngay trên lưới phòng: chip trên từng thẻ chỉ nói chuyện
        một phòng, muốn biết "cả nhà tháng này thu tới đâu" mà không có dòng này thì
        phải tự cộng nhẩm qua vài chục thẻ.
      */}
      {!billsLoading && bills && bills.source !== 'none' && bills.total.total > 0 && (
        <p className="px-1 text-xs font-semibold text-slate-500">
          {billHeading(bills.source, period)}:{' '}
          <b className="text-slate-700">{bills.total.paid}/{bills.total.total}</b> đã thu
          {unpaidRoomCount > 0 && (
            <span className="text-rose-600">
              {' '}· {unpaidRoomCount} phòng còn nợ {formatCurrency(bills.total.outstanding)}
            </span>
          )}
        </p>
      )}

      {/* Room Grid */}
      {filteredRooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <DoorOpen className="mx-auto mb-3 h-12 w-12 text-slate-200" />
          <p className="font-medium text-slate-400">
            {roomSearch || filterStatus !== 'all' || onlyUnpaid
              ? 'Không có phòng nào khớp bộ lọc.'
              : 'Không có phòng nào.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRooms.map(room => {
            const st = roomStatusMap[roomStatusInPeriod(room)] ?? roomStatusMap.DRAFT;
            const tenant = tenantInPeriod(room.id);
            const coming = !tenant && isNowPeriod ? incomingFor(room.id) : null;
            return (
              <button key={room.id} onClick={() => setSelectedRoom(room)}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all hover:shadow-md ${st.border}`}>
                {/* Dải màu trạng thái */}
                <span className={`absolute inset-x-0 top-0 h-1 ${st.dot}`} />

                <div className="flex flex-1 flex-col gap-3 p-4 pt-5">
                  {/* ── Định danh: số phòng + tầng · trạng thái ── */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xl font-black leading-none text-slate-900">{room.roomNumber}</p>
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        {room.floor != null ? `Tầng ${room.floor}` : 'Chưa rõ tầng'}
                      </p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      {isNowPeriod && room.status === 'MAINTENANCE' && tenant && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700"
                          title="Có thiết bị trong phòng đang được sửa — khách vẫn ở bình thường">
                          <Wrench className="h-3 w-3" /> Đang sửa thiết bị
                        </span>
                      )}
                    </span>
                  </div>

                  {/* ── Thông số: mỗi ô một số, không nhồi một dòng chữ ── */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <Ruler className="h-3 w-3" /> Diện tích
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-slate-800">{fmtArea(room.area)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <Users className="h-3 w-3" /> Sức chứa
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-slate-800">
                        {room.maxOccupants != null ? `${room.maxOccupants} người` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* ── Khách thuê (nếu có) hoặc mô tả cấu trúc ── */}
                  {tenant ? (
                    <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-2.5 py-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {tenant.tenantFullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold leading-tight text-slate-800">{tenant.tenantFullName}</p>
                        <MaskedField value={tenant.tenantPhone} emptyText="" className="text-[11px] text-slate-500" />
                      </div>
                    </div>
                  ) : coming ? (
                    <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-2.5 py-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                        {(coming.tenantFullName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold leading-tight text-slate-800">{coming.tenantFullName || '(chưa có tên)'}</p>
                        <p className="text-[11px] font-semibold text-violet-700">
                          {coming.status === 'DRAFT' ? 'Chờ đón' : 'Đã chốt'} · vào ở {fmtDate(coming.moveInDate || coming.startDate)}
                        </p>
                      </div>
                    </div>
                  ) : !isNowPeriod ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-2.5 py-2 text-center text-xs text-slate-400">
                      {monthLabel(period)} chưa có khách thuê
                    </p>
                  ) : room.structureDescription ? (
                    <p className="line-clamp-2 text-xs text-slate-400">{room.structureDescription}</p>
                  ) : null}

                  {/* Kỳ này phòng này trả chưa — im lặng nếu phòng không có hoá đơn nào. */}
                  <RoomBillChip bills={bills} roomNumber={room.roomNumber} />

                  {/*
                    ── Giá: nhãn trên, số dưới ──
                    Bản trước nhét nhãn "GIÁ THUÊ" và số tiền vào cùng một dòng, số dài
                    (10.945.000 đ) chiếm gần hết chỗ nên nhìn chật. Tách hai dòng thì số
                    tiền đứng riêng, đọc lướt cũng thấy ngay.
                    `applied` là số đang thu; khác `listed` thì ghi thêm dòng niêm yết.
                  */}
                  {(() => {
                    // Tháng đã qua: không hiện giá đang niêm yết / nút đổi giá (đó là chuyện của HÔM NAY).
                    // Có khách trong tháng thì hiện đúng giá trong hợp đồng của họ; không có khách thì để trống.
                    if (!isNowPeriod) {
                      return tenant ? (
                        <div className="mt-auto border-t border-slate-100 pt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Giá thuê theo hợp đồng</p>
                          <p className="mt-0.5 text-lg font-black leading-none text-slate-700">{formatCurrency(tenant.rentAmount)}</p>
                        </div>
                      ) : null;
                    }
                    const listed = room.listedPrice ?? room.price;
                    const applied = room.appliedPrice ?? room.price;
                    const differs = listed != null && applied != null && listed !== applied;
                    return (
                      <div className="mt-auto border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Giá thuê / tháng</p>
                        <p className="mt-0.5 text-lg font-black leading-none text-indigo-600">
                          {applied != null ? formatCurrency(applied) : <span className="text-sm text-slate-300">Chưa định giá</span>}
                        </p>
                        {differs && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            niêm yết {formatCurrency(listed!)} · quay lại khi khách trả phòng
                          </p>
                        )}

                        <div
                          className="mt-2.5 flex items-center gap-1.5"
                          // Thẻ phòng là <button> mở chi tiết — chặn nổi bọt để bấm nút giá
                          // không mở luôn modal phòng.
                          onClick={(e) => { e.stopPropagation(); }}
                        >
                          {room.priceLocked ? (
                            <span
                              title={room.currentTenant ? `Đang cho ${room.currentTenant} thuê` : 'Đang có khách thuê'}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-2 text-[11px] font-bold text-slate-500"
                            >
                              <Lock className="h-3 w-3" /> Khoá giá
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPriceRoom(room)}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-2 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
                            >
                              <Pencil className="h-3 w-3" /> Đổi giá
                            </button>
                          )}

                          {/* Lịch sử của RIÊNG phòng này — xem được cả khi đang khoá giá,
                              vì lúc đó mới hay cần tra "giá này từ đâu ra". */}
                          <button
                            type="button"
                            title={`Lịch sử giá phòng ${room.roomNumber}`}
                            onClick={() => setHistoryRoom(room)}
                            className="flex h-[30px] w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </button>
            );
          })}
        </div>
      )}

        </>
      )}


      {/* ═══════════ Thiết bị vận hành (nguồn, tình trạng, giá, bảo hành/hạn dùng) ═══════════ */}
      {tab === 'equipment' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50">
              <Package className="h-5 w-5 text-violet-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Thiết bị vận hành</h2>
          </div>
          <OperationalEquipmentPanel propertyId={Number(id)} />
        </div>
      )}

      {/* Trạng thái rỗng cho tab không có dữ liệu — tránh màn hình trắng trơn */}
      {tab === 'overview' && !(property.fullAddress || property.shortAddress) && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="font-semibold text-slate-500">Tòa nhà chưa có địa chỉ để hiển thị bản đồ</p>
        </div>
      )}

      {selectedRoom && (
        <RoomDetailModal
          room={selectedRoom}
          tenant={contracts.find(c => c.roomId === selectedRoom.id && c.status === 'ACTIVE') ?? null}
          incoming={incomingFor(selectedRoom.id)}
          pastTenants={contracts
            .filter(c => c.roomId === selectedRoom.id && c.status !== 'ACTIVE'
              && c.status !== 'DRAFT' && c.status !== 'PENDING')
            .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))}
          propertyId={property.id}
          /*
            BE chỉ cho MANAGER/ADMIN đổi trạng thái phòng (RoomController.updateRoomStatus) — host
            bấm Lưu là 403 "Access Denied". Và phòng có khách / có phiếu sửa / có khách chờ đón thì
            trạng thái do hệ thống tự quản: đổi tay thành "Phòng trống" là sai dữ liệu.
          */
          canChange={
            user?.role === 'admin'
            && ['DRAFT', 'ACTIVE'].includes(property.status)
            && selectedRoom.status !== 'RENTED'
            && selectedRoom.status !== 'MAINTENANCE'
            && !hasTenantNow(selectedRoom.id)
            && !incomingFor(selectedRoom.id)
          }
          onClose={() => setSelectedRoom(null)}
          onConfirmStatus={handleUpdateRoomStatus}
        />
      )}

      {priceRoom && (
        <RoomPriceModal
          propertyId={property.id}
          room={priceRoom}
          onClose={() => setPriceRoom(null)}
          onChanged={fetchData}
        />
      )}

      {historyRoom && (
        <RoomPriceHistoryModal
          propertyId={property.id}
          room={historyRoom}
          onClose={() => setHistoryRoom(null)}
        />
      )}

      {lightbox !== null && property.imageUrls?.[lightbox] && (
        <ImageLightbox
          urls={property.imageUrls}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};
