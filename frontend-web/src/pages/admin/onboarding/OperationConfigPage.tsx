import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, CheckCircle2, Clock, FileSpreadsheet, Hammer,
  Package, Search, Settings2, Wrench, History, RefreshCw,
  AlertTriangle, DoorOpen, Users, ChevronDown, ChevronRight, X,
  Eye, Home, Layers, Ruler,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse, RenovationLineResponse, RenovationSession, RoomResponse, RoomStatus } from '@/types/api.types';
import { KpiCard, BuildingCard, Pagination } from '@/pages/admin/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RenovationImportPanel } from './RenovationImportPanel';
import { HandoverEquipmentSection } from './HandoverEquipmentSection';
import { OperationalEquipmentPanel } from './OperationalEquipmentPanel';
import { SupplementImportPanel } from './SupplementImportPanel';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

/** Convert flat lines to a single fallback session when BE doesn't have sessions API */
const flatToSessions = (lines: RenovationLineResponse[]): RenovationSession[] => [
  { sessionNumber: 1, startDate: undefined, endDate: undefined, totalCost: lines.reduce((s, l) => s + l.cost, 0), lines },
];

const AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách', KITCHEN: 'Bếp', BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công', GARAGE: 'Nhà để xe', OTHER: 'Khu vực chung',
};
const equipLoc = (e: { roomNumber?: string | null; houseArea?: string | null }): string =>
  e.roomNumber ? `Phòng ${e.roomNumber}` : e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : 'Toàn nhà';

const SessionAccordion = ({ session, defaultOpen = true }: { session: RenovationSession; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const dateLabel = session.startDate
    ? new Date(session.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const inProgress = session.status === 'IN_PROGRESS' || (!session.status && !session.endDate);
  const disabled = session.status === 'DISABLED';
  const equipments = session.equipments ?? [];

  return (
    <div className={`rounded-2xl border overflow-hidden ${disabled ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-6 py-4 bg-slate-50 border-b border-slate-100 text-left hover:bg-slate-100 transition"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        <Hammer className="h-4 w-4 text-amber-600 shrink-0" />
        <span className={`font-bold ${disabled ? 'line-through text-slate-400' : 'text-slate-800'}`}>
          Cải tạo {session.versionLabel ?? `lần ${session.sessionNumber}`}
        </span>
        {dateLabel && <span className="text-xs text-slate-400 font-medium">— {dateLabel}</span>}
        {inProgress && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Đang thi công</span>}
        {session.status === 'ACTIVE' && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Đang hiệu lực</span>}
        {disabled && <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">Đợt cũ</span>}
        <span className="ml-auto text-xs font-semibold text-slate-400">{session.lines.length} hạng mục{equipments.length ? ` · ${equipments.length} TB` : ''}</span>
        <span className="font-black text-amber-700 text-sm ml-3 shrink-0">{formatVND(session.totalCost)}</span>
      </button>
      {open && (
        <div className="p-5 space-y-4">
          {/* Hạng mục cải tạo */}
          {session.lines.length > 0 ? (
            <div className="space-y-2">
              {session.lines.map((line, i) => (
                <div key={line.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="font-semibold text-slate-700">{line.categoryName}</span>
                    {line.note && <span className="text-slate-400 text-xs truncate">({line.note})</span>}
                  </div>
                  <span className="font-bold text-amber-600 shrink-0">{formatVND(line.cost)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
                <span className="font-bold text-amber-800">Tổng chi phí cải tạo đợt này</span>
                <span className="font-black text-amber-700">{formatVND(session.totalCost)}</span>
              </div>
            </div>
          ) : equipments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Chưa có hạng mục nào</p>
          ) : null}

          {/* Thiết bị mua đợt này */}
          {equipments.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Thiết bị mua đợt này</p>
              <div className="space-y-2">
                {equipments.map((eq) => {
                  const eqDisabled = eq.operationalStatus === 'DISABLED' || eq.currentEffective === false;
                  return (
                    <div key={eq.id} className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm">
                      <div className="min-w-0">
                        <p className={`font-semibold ${eqDisabled ? 'line-through text-slate-400' : 'text-slate-700'}`}>{eq.catalogName}</p>
                        <p className="text-xs text-slate-400">
                          {equipLoc(eq)}{eq.warrantyMonths ? ` · BH ${eq.warrantyMonths} tháng` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {eqDisabled
                          ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Đã thay thế</span>
                          : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Đang dùng</span>}
                        <span className="font-bold text-slate-600">{formatVND(eq.price)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RenovationHistoryPanel = ({ property }: { property: PropertyResponse }) => {
  const [sessions, setSessions] = useState<RenovationSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!property.hasRenovation && !property.renovationCompleted) { setLoading(false); return; }
    const load = async () => {
      try {
        const data = await propertyService.getRenovationSessions(property.id).catch(async () => {
          const lines = await propertyService.getRenovationLines(property.id);
          return flatToSessions(lines);
        });
        setSessions(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [property.id]);

  if (!property.hasRenovation && !property.renovationCompleted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <Hammer className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="font-semibold text-slate-500">Tòa nhà này không có cải tạo</p>
      </div>
    );
  }

  if (loading) return <div className="py-16 text-center text-slate-400">Đang tải...</div>;

  const grandTotal = sessions.reduce((s, sess) => s + sess.totalCost, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wide mb-1.5">Tổng chi phí tất cả đợt</p>
          <p className="text-2xl font-black text-amber-600">{formatVND(grandTotal)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Số đợt cải tạo</p>
          <p className={`text-2xl font-black ${property.renovationCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
            {sessions.length} đợt {property.renovationCompleted ? '(hoàn thành)' : '(đang thi công)'}
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Hammer className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">Chưa có hạng mục cải tạo nào được ghi nhận</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((sess, idx) => (
            <SessionAccordion key={sess.sessionNumber} session={sess} defaultOpen={idx === sessions.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const RenovateRestartPanel = ({ property, onDone }: { property: PropertyResponse; onDone: () => void }) => {
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [prevSessions, setPrevSessions] = useState<RenovationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [wholeHouseConfirmed, setWholeHouseConfirmed] = useState(false);
  // Sau khi bấm "Bắt đầu cải tạo lại" → hiện form import cải tạo bổ sung.
  const [started, setStarted] = useState(property.status === 'UNDER_RENOVATION');

  useEffect(() => {
    const load = async () => {
      try {
        const [sessions, roomList] = await Promise.all([
          propertyService.getRenovationSessions(property.id).catch(async () => {
            const lines = await propertyService.getRenovationLines(property.id);
            return flatToSessions(lines);
          }),
          property.wholeHouse === false ? propertyService.getRooms(property.id) : Promise.resolve([]),
        ]);
        setPrevSessions(sessions);
        setRooms(roomList);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [property.id]);

  const rentedRooms = rooms.filter(r => r.status === 'RENTED');
  const isOccupied = property.wholeHouse === false
    ? rentedRooms.length > 0
    : !wholeHouseConfirmed;

  const canStart = !isOccupied;

  const handleStart = async () => {
    setStarting(true);
    try {
      await propertyService.startRenovation(property.id);
      setStarted(true); // chuyển sang bước nhập cải tạo bổ sung
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không bắt đầu được cải tạo lại');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-slate-400">Đang tải dữ liệu cải tạo...</div>;

  // Đã mở đợt cải tạo mới → nhập cải tạo bổ sung từ Excel.
  if (started) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          <RefreshCw className="h-4 w-4" /> Đã mở đợt cải tạo mới. Tải file cải tạo bổ sung để hoàn tất.
        </div>
        <SupplementImportPanel onDone={onDone} />
      </div>
    );
  }

  const prevGrandTotal = prevSessions.reduce((s, sess) => s + sess.totalCost, 0);

  return (
    <div className="space-y-5">

      {/* Lịch sử cải tạo trước đó */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-1">
          <History className="h-5 w-5 text-amber-600" />
          <h3 className="font-bold text-slate-800">Lịch sử cải tạo trước đó</h3>
          {prevSessions.length > 0 && (
            <span className="ml-auto text-sm font-bold text-amber-700">{formatVND(prevGrandTotal)}</span>
          )}
        </div>
        {prevSessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">Chưa có hạng mục cải tạo nào được ghi nhận từ trước</p>
          </div>
        ) : (
          prevSessions.map(sess => (
            <SessionAccordion key={sess.sessionNumber} session={sess} defaultOpen={false} />
          ))
        )}
        {prevSessions.length > 0 && (
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Sau khi bắt đầu cải tạo lại, các hạng mục trên sẽ được giữ nguyên. Bạn có thể thêm hạng mục mới vào đợt cải tạo này.
          </p>
        )}
      </div>

      {/* Kiểm tra tình trạng phòng */}
      {property.wholeHouse === false ? (
        <section className="rounded-2xl border bg-white overflow-hidden
          border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
            <DoorOpen className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Tình trạng phòng</h3>
            <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${
              rentedRooms.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {rentedRooms.length > 0
                ? `${rentedRooms.length} phòng có khách`
                : 'Tất cả phòng trống'}
            </span>
          </div>
          <div className="p-5">
            {rentedRooms.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-800 text-sm">Không thể bắt đầu cải tạo</p>
                    <p className="text-xs text-rose-600 mt-0.5">Còn {rentedRooms.length} phòng đang có khách thuê. Phải chờ hết hợp đồng hoặc chuyển khách đi trước.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {rentedRooms.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-rose-100 bg-rose-50/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span className="font-semibold text-slate-700">{r.roomNumber}</span>
                        <span className="text-slate-400">{r.area} m²</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Có khách</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-800 text-sm">Tất cả {rooms.length} phòng đang trống</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Có thể bắt đầu cải tạo ngay.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800 text-sm">Nhà nguyên căn — xác nhận thủ công</p>
              <p className="text-xs text-slate-500 mt-1">Hệ thống không tự động kiểm tra được hợp đồng thuê nguyên căn. Admin tự xác nhận nhà đã trống trước khi tiến hành.</p>
            </div>
          </div>
          <label className="flex items-center gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wholeHouseConfirmed}
              onChange={e => setWholeHouseConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600"
            />
            <span className="text-sm font-semibold text-slate-700">Tôi xác nhận nhà hiện không có khách thuê</span>
          </label>
        </section>
      )}

      {/* Nút bắt đầu */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition shadow-sm shadow-amber-200"
        >
          <RefreshCw className={`w-4 h-4 ${starting ? 'animate-spin' : ''}`} />
          {starting ? 'Đang xử lý...' : 'Bắt đầu cải tạo lại'}
        </button>
      </div>
    </div>
  );
};

const getStatusBadge = (b: PropertyResponse): { label: string; cls: string } | null => {
  if (b.status === 'DRAFT') {
    return b.hasRenovation
      ? { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' }
      : null;
  }
  if (b.status === 'UNDER_RENOVATION') return { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' };
  if (b.status === 'RENOVATION_COMPLETED') return { label: 'Đã hoàn tất cải tạo', cls: 'bg-teal-100 text-teal-800' };
  if (b.status === 'PENDING_HOST_REVIEW') return { label: 'Đã cải tạo xong', cls: 'bg-teal-100 text-teal-800' };
  if (b.status === 'PENDING_OPERATION_MANAGER') return { label: 'Chờ gán quản lý', cls: 'bg-violet-100 text-violet-800' };
  if (b.status === 'ACTIVE') return { label: 'Đang kinh doanh', cls: 'bg-emerald-100 text-emerald-800' };
  if (b.status === 'DISABLED') return { label: 'Đã vô hiệu', cls: 'bg-rose-100 text-rose-800' };
  return null;
};

// ─── Chi tiết khai thác (read-only) — mọi cấu hình đến từ import Excel ────────
const STATUS_DESC: Record<string, string> = {
  DRAFT: 'Nhà đã khởi tạo — nhập cấu hình cải tạo từ Excel để hoàn tất khai thác.',
  UNDER_RENOVATION: 'Đang trong quá trình cải tạo.',
  RENOVATION_COMPLETED: 'Đã hoàn tất cải tạo — chờ gửi Host duyệt giá.',
  PENDING_HOST_REVIEW: 'Đã cải tạo xong — đang chờ Host phê duyệt giá.',
  PENDING_OPERATION_MANAGER: 'Host đã duyệt giá — chờ gán quản lý vận hành.',
  ACTIVE: 'Tòa nhà đang kinh doanh.',
  DISABLED: 'Tòa nhà đã bị vô hiệu hóa.',
};

const ROOM_STATUS: Record<RoomStatus, { label: string; cls: string }> = {
  DRAFT:       { label: 'Nháp',     cls: 'bg-slate-100 text-slate-600' },
  AVAILABLE:   { label: 'Trống',    cls: 'bg-emerald-100 text-emerald-700' },
  RENTED:      { label: 'Đang thuê', cls: 'bg-rose-100 text-rose-700' },
  MAINTENANCE: { label: 'Bảo trì',  cls: 'bg-amber-100 text-amber-700' },
};

const OverviewStat = ({ icon: Icon, label, value, tint }: {
  icon: typeof Home; label: string; value: string; tint: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>
      <Icon className="h-4 w-4" />
    </div>
    <p className="text-lg font-black text-slate-900 leading-tight">{value}</p>
    <p className="mt-0.5 text-xs font-semibold text-slate-400">{label}</p>
  </div>
);

const InfoRow = ({ icon: Icon, label, children }: {
  icon: typeof Home; label: string; children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 py-3">
    <span className="flex items-center gap-2 text-sm font-semibold text-slate-500">
      <Icon className="h-4 w-4 text-slate-400" /> {label}
    </span>
    <span className="text-sm font-bold text-slate-800 text-right">{children}</span>
  </div>
);

const ConfigOverview = ({ property }: { property: PropertyResponse }) => {
  const [detail, setDetail] = useState<PropertyResponse>(property);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const isPhongTro = property.wholeHouse === false;

  useEffect(() => {
    setDetail(property);
    propertyService.getPropertyById(property.id).then(setDetail).catch(() => { /* giữ dữ liệu list */ });
    if (isPhongTro) {
      setRoomsLoading(true);
      propertyService.getRooms(property.id)
        .then(setRooms).catch(() => setRooms([]))
        .finally(() => setRoomsLoading(false));
    }
  }, [property.id]);

  const badge = getStatusBadge(detail);
  const renoTotal = (detail.renovationSessions ?? []).reduce((s, sess) => s + (sess.totalCost || 0), 0);
  const typeLabel = detail.wholeHouse === null ? 'Chưa xác định' : detail.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ';

  return (
    <div className="space-y-6">
      {/* Trạng thái khai thác */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <Settings2 className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-slate-800">Trạng thái khai thác</h3>
              {badge && <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${badge.cls}`}>{badge.label}</span>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{STATUS_DESC[detail.status] ?? 'Cấu hình khai thác được nhập từ file Excel.'}</p>
          </div>
        </div>
      </div>

      {/* Thông số nhanh */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OverviewStat icon={Home}    label="Loại hình"  value={typeLabel} tint="bg-indigo-50 text-indigo-600" />
        <OverviewStat icon={Ruler}   label="Diện tích"  value={detail.areaSize ? `${detail.areaSize} m²` : '—'} tint="bg-slate-100 text-slate-600" />
        <OverviewStat icon={Layers}  label="Số tầng"    value={String(detail.totalFloor ?? detail.floorCount ?? '—')} tint="bg-blue-50 text-blue-600" />
        <OverviewStat icon={DoorOpen} label="Tổng phòng" value={String(detail.totalRooms || 0)} tint="bg-emerald-50 text-emerald-600" />
      </div>

      {/* Thông tin khai thác */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-2">
        <div className="divide-y divide-slate-100">
          <InfoRow icon={Home} label="Loại hình khai thác">{typeLabel}</InfoRow>
          <InfoRow icon={Hammer} label="Cải tạo">
            {detail.renovationCompleted
              ? <span className="text-teal-600">Có — đã hoàn tất</span>
              : detail.hasRenovation
              ? <span className="text-amber-600">Có — đang thực hiện</span>
              : <span className="text-slate-400">Không cải tạo</span>}
          </InfoRow>
          {renoTotal > 0 && (
            <InfoRow icon={Wrench} label="Tổng chi phí cải tạo">
              <span className="text-amber-700">{formatVND(renoTotal)}</span>
            </InfoRow>
          )}
        </div>
      </div>

      {/* Thiết bị chủ nhà bàn giao (nhà gốc) */}
      <HandoverEquipmentSection propertyId={property.id} />

      {/* Danh sách phòng (chỉ nhà chia phòng) */}
      {isPhongTro && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3.5">
            <DoorOpen className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Danh sách phòng</h3>
            <span className="ml-auto text-xs font-bold text-slate-400">{rooms.length} phòng</span>
          </div>
          {roomsLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Đang tải phòng...</p>
          ) : rooms.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Chưa có phòng nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-2.5">Phòng</th>
                  <th className="px-5 py-2.5">Diện tích</th>
                  <th className="px-5 py-2.5">Giá thuê</th>
                  <th className="px-5 py-2.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map(r => {
                  const st = ROOM_STATUS[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-800">{r.roomNumber}</td>
                      <td className="px-5 py-3 text-slate-600">{r.area} m²</td>
                      <td className="px-5 py-3 text-slate-600">{r.price ? formatVND(r.price) : '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export const CauHinhKhaiThacPage = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<PropertyResponse | null>(null);
  const [viewMode, setViewMode] = useState<'config' | 'equipment' | 'history' | 'renovate'>('config');
  // Mặc định xem danh sách; import cải tạo mở dạng popup khi bấm nút.
  const [importOpen, setImportOpen] = useState(false);
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [renoTarget, setRenoTarget] = useState<PropertyResponse | null>(null);
  const [completingReno, setCompletingReno] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);

  // Khoá cuộn nền khi mở popup import.
  useEffect(() => {
    if (!importOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [importOpen]);

  useEffect(() => {
    if (id && buildings.length > 0) {
      const found = buildings.find(p => p.id === Number(id));
      if (found) setSelected(found);
      else propertyService.getPropertyById(Number(id)).then(setSelected).catch(console.error);
    }
  }, [id, buildings]);

  const kpi = useMemo(() => buildings.reduce(
    (acc, b) => ({
      total: acc.total + 1,
      pending: acc.pending + (b.status === 'DRAFT' && b.wholeHouse === null ? 1 : 0),
      configured: acc.configured + (b.wholeHouse !== null ? 1 : 0),
      renovation: acc.renovation + (b.status === 'UNDER_RENOVATION' ? 1 : 0),
    }),
    { total: 0, pending: 0, configured: 0, renovation: 0 }
  ), [buildings]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return buildings.filter(b => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchStatus && matchSearch;
    });
  }, [buildings, statusFilter, search]);

  // ─── phân trang (9 / trang) ───────────────────────────────────────
  const PER_PAGE = 9;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => { setPage(1); }, [search, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const openConfig = (b: PropertyResponse) => { setSelected(b); setViewMode('config'); };
  const openHistory = (b: PropertyResponse) => { setSelected(b); setViewMode('history'); };
  const openRenovate = (b: PropertyResponse) => { setSelected(b); setViewMode('renovate'); };

  const backToList = () => {
    setSelected(null);
    setViewMode('config');
    if (id) navigate('/admin/buildings/configuration', { replace: true });
    fetchList();
  };

  const handleRenovationComplete = async () => {
    if (!renoTarget) return;
    setCompletingReno(true);
    try {
      await propertyService.completeRenovation(renoTarget.id);
      setRenoTarget(null);
      fetchList();
    } catch (err: any) {
      setRenoTarget(null);
      alert(err.response?.data?.message || 'Lỗi hoàn thành cải tạo — xem doc/NOTE-CHO-TEAM-BE.md mục 9');
    } finally {
      setCompletingReno(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết cấu hình
  // ═══════════════════════════════════════════════════════════════════
  if (selected) {
    const canShowHistory = !!(selected.hasRenovation || selected.renovationCompleted);
    const canShowRenovate = selected.status === 'ACTIVE';
    const canShowEquipment = selected.status !== 'DRAFT';
    const tabs = [
      { key: 'config' as const, label: 'Tổng quan', icon: Settings2 },
      ...(canShowEquipment ? [{ key: 'equipment' as const, label: 'Thiết bị', icon: Package }] : []),
      ...(canShowHistory ? [{ key: 'history' as const, label: 'Lịch sử cải tạo', icon: History }] : []),
      ...(canShowRenovate ? [{ key: 'renovate' as const, label: 'Cải tạo lại', icon: RefreshCw }] : []),
    ];

    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>
        <div className="mb-5">
          <h1 className="text-2xl font-black text-slate-900">{selected.propertyName}</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">
            {selected.fullAddress || selected.shortAddress}
          </p>
        </div>

        {tabs.length > 1 && (
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = viewMode === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition -mb-px ${
                    active
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {viewMode === 'config' && (
          <ConfigOverview property={selected} />
        )}
        {viewMode === 'equipment' && (
          <OperationalEquipmentPanel propertyId={selected.id} />
        )}
        {viewMode === 'history' && (
          <RenovationHistoryPanel property={selected} />
        )}
        {viewMode === 'renovate' && (
          <RenovateRestartPanel property={selected} onDone={backToList} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Cấu hình khai thác</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Cấu hình cải tạo / phòng cho từng tòa nhà, hoặc nhập hợp đồng cải tạo hàng loạt từ Excel.
          </p>
        </div>
        <button onClick={() => setImportOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition">
          <FileSpreadsheet className="h-4 w-4" /> Nhập cải tạo từ Excel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng tòa nhà" value={String(kpi.total)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Chờ cấu hình" value={String(kpi.pending)} icon={Settings2} color="bg-slate-50 text-slate-700" />
        <KpiCard title="Đã cấu hình" value={String(kpi.configured)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
        <KpiCard title="Đang cải tạo" value={String(kpi.renovation)} icon={Hammer} color="bg-amber-50 text-amber-700" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" placeholder="Tìm theo tên, địa chỉ..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="UNDER_RENOVATION">Đang cải tạo</option>
          <option value="RENOVATION_COMPLETED">Đã hoàn tất cải tạo</option>
          <option value="PENDING_HOST_REVIEW">Đã cải tạo xong</option>
          <option value="ACTIVE">Đang kinh doanh</option>
          <option value="DISABLED">Đã vô hiệu</option>
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-semibold">Không tìm thấy tòa nhà phù hợp.</p>
        </div>
      ) : (
        <>
        <div className="grid gap-4 xl:grid-cols-3">
          {paged.map(b => {
            return (
              <BuildingCard
                key={b.id}
                name={b.propertyName}
                address={b.fullAddress || b.shortAddress}
                zoneName={b.zoneName}
                typeLabel={b.wholeHouse === null ? 'Chưa chọn loại hình' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                areaSize={b.areaSize}
                totalRooms={b.totalRooms}
                floors={b.totalFloor ?? b.floorCount ?? '—'}
                renovation={b.renovationCompleted ? 'done' : b.hasRenovation ? 'in_progress' : 'none'}
                badge={getStatusBadge(b)}
                managerName={b.operationManagerName}
              >
                  {b.status === 'DRAFT' && (
                    <button onClick={() => openConfig(b)}
                      className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <Eye className="w-4 h-4" /> Xem chi tiết →
                    </button>
                  )}
                  {b.status === 'UNDER_RENOVATION' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      <button onClick={() => setRenoTarget(b)}
                        className="w-full py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Xác nhận hoàn thành cải tạo
                      </button>
                    </div>
                  )}
                  {b.status === 'RENOVATION_COMPLETED' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                  {b.status === 'PENDING_HOST_REVIEW' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      <div className="w-full py-2 text-center text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Đang chờ Host phê duyệt
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                  {b.status === 'PENDING_OPERATION_MANAGER' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      <div className="w-full py-2 text-center text-xs font-semibold text-violet-600 bg-violet-50 rounded-xl flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Host đã duyệt giá — chờ gán quản lý vận hành để kinh doanh
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                  {b.status === 'ACTIVE' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đang kinh doanh
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                      <button onClick={() => openRenovate(b)}
                        title="Mở đợt cải tạo mới & nhập file cải tạo bổ sung"
                        className="w-full py-2 bg-orange-50 text-orange-700 hover:bg-orange-500 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Cải tạo lại (nhập bổ sung)
                      </button>
                    </div>
                  )}
                  {b.status === 'DISABLED' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Eye className="w-4 h-4" /> Xem chi tiết
                      </button>
                      <div className="w-full py-2 text-center text-xs font-semibold text-slate-500 bg-slate-100 rounded-xl">
                        Đã vô hiệu hóa
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                </BuildingCard>
            );
          })}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!renoTarget}
        tone="success"
        title="Xác nhận hoàn thành cải tạo?"
        message={renoTarget && (
          <>
            Bạn chắc chắn tòa nhà <b className="text-slate-700">{renoTarget.propertyName}</b> đã cải tạo xong?
            Hệ thống sẽ chuyển tòa nhà sang trạng thái <b className="text-slate-700">Đang kinh doanh</b> và không thể hoàn tác.
          </>
        )}
        confirmText="Xác nhận hoàn thành"
        loading={completingReno}
        onConfirm={handleRenovationComplete}
        onCancel={() => setRenoTarget(null)}
      />

      {importOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop fixed → luôn phủ kín màn hình kể cả khi cuộn nội dung dài */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative flex min-h-full items-start justify-center p-4 sm:py-10"
            onClick={() => setImportOpen(false)}>
            <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-100 bg-white px-6 py-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-base font-bold text-slate-900">Nhập cải tạo từ Excel</h3>
                </div>
                <button onClick={() => setImportOpen(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">
                <RenovationImportPanel onImported={fetchList} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
