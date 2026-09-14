import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building2, CheckCircle2, Clock, FileSpreadsheet, Hammer,
  Package, Settings2, History, RefreshCw,
  AlertTriangle, DoorOpen, Users, ChevronDown, ChevronRight, X,
  Eye, Home, Layers, Ruler, XCircle, MapPin, UserRound, Search, Hash,
  type LucideIcon,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse, RenovationLineResponse, RenovationSession, RoomResponse, RoomStatus } from '@/types/api.types';
import { StatCard, PageHero, BuildingCard, Pagination } from '@/pages/admin/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RenovationImportPanel } from './RenovationImportPanel';
import { HandoverEquipmentSection } from './HandoverEquipmentSection';
import { OperationalEquipmentPanel } from './OperationalEquipmentPanel';
import { SupplementImportPanel } from './SupplementImportPanel';
import { BuildingFilterBar, ResultBar, BuildingTable } from './BuildingFilters';
import { useBuildingFilters, ONBOARDING_STEPS, type StatusOption } from './buildingFilterState';

// Chip lọc nhanh theo trạng thái khai thác.
const CONFIG_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all',                       label: 'Tất cả',              cls: 'border-slate-900 bg-slate-900 text-white' },
  { value: 'DRAFT',                     label: 'Chờ cấu hình',        cls: 'border-slate-600 bg-slate-600 text-white' },
  { value: 'UNDER_RENOVATION',          label: 'Đang cải tạo',        cls: 'border-amber-500 bg-amber-500 text-white' },
  { value: 'RENOVATION_COMPLETED',      label: 'Đã hoàn tất cải tạo', cls: 'border-teal-600 bg-teal-600 text-white' },
  { value: 'PENDING_HOST_REVIEW',       label: 'Chờ Host duyệt giá',  cls: 'border-blue-600 bg-blue-600 text-white' },
  { value: 'PENDING_OPERATION_MANAGER', label: 'Chờ gán quản lý',     cls: 'border-violet-600 bg-violet-600 text-white' },
  { value: 'ACTIVE',                    label: 'Đang kinh doanh',     cls: 'border-emerald-600 bg-emerald-600 text-white' },
  { value: 'DISABLED',                  label: 'Đã vô hiệu',          cls: 'border-rose-600 bg-rose-600 text-white' },
];

// Dòng gợi ý trạng thái hiển thị trên thẻ — thay cho các khối nút xếp chồng.
const CARD_HINT: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  DRAFT:                     { label: 'Chờ nhập cấu hình khai thác',            cls: 'bg-slate-100 text-slate-500',   icon: Settings2 },
  UNDER_RENOVATION:          { label: 'Đang thi công cải tạo',                  cls: 'bg-amber-50 text-amber-700',    icon: Hammer },
  RENOVATION_COMPLETED:      { label: 'Đã cải tạo xong — chờ gửi Host duyệt giá', cls: 'bg-teal-50 text-teal-700',    icon: CheckCircle2 },
  PENDING_HOST_REVIEW:       { label: 'Đang chờ Host phê duyệt giá',            cls: 'bg-blue-50 text-blue-600',      icon: Clock },
  PENDING_OPERATION_MANAGER: { label: 'Đã duyệt giá — chờ gán quản lý vận hành', cls: 'bg-violet-50 text-violet-600', icon: CheckCircle2 },
  ACTIVE:                    { label: 'Đang kinh doanh',                        cls: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
  DISABLED:                  { label: 'Đã vô hiệu hóa',                         cls: 'bg-slate-100 text-slate-500',   icon: XCircle },
};

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

const RenovateRestartPanel = ({ property, onDone, onPropertyChanged }: {
  property: PropertyResponse;
  onDone: () => void;
  /** báo lên màn chi tiết khi trạng thái tòa nhà đổi (mở đợt cải tạo) để header/tab khớp lại */
  onPropertyChanged?: (p: PropertyResponse) => void;
}) => {
  // `current` = bản mới nhất của tòa nhà: startRenovation trả về property đã đổi trạng thái,
  // dùng nó thay vì prop cũ để mọi cờ bên dưới không bị stale sau khi mở đợt cải tạo.
  const [current, setCurrent] = useState<PropertyResponse>(property);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [prevSessions, setPrevSessions] = useState<RenovationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  // Vừa bấm "Bắt đầu cải tạo lại" trong phiên này (danh sách session chưa kịp tải lại).
  const [justStarted, setJustStarted] = useState(false);
  useEffect(() => {
    setCurrent(property);
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

  // Đợt cải tạo đang mở (chưa có ngày kết thúc). sessionNumber ≥ 2 = đợt BỔ SUNG,
  // = 1 là đợt cải tạo đầu của quy trình tiếp nhận (phải nhập bằng renovation-excel, không
  // phải renovation-supplement-excel — BE validate đúng theo số hiệu đợt này).
  const openSession = prevSessions.find(s => !s.endDate);
  const underRenovation = current.status === 'UNDER_RENOVATION';
  const inSupplementSession = justStarted || (underRenovation && (openSession?.sessionNumber ?? 0) >= 2);
  const inInitialSession = underRenovation && !inSupplementSession;

  /**
   * Mọi loại hình đều được cải tạo bổ sung KỂ CẢ khi khách đang thuê & đang ở
   * → FE không chặn nữa, để BE là nơi quyết định duy nhất.
   *
   * - Nhà nguyên căn: BE không kiểm tra khách thuê ở `renovation/start` → chạy được ngay.
   * - Nhà chia phòng: BE còn chặn (PropertyOnboardingServiceImpl.startRenovation() throw
   *   "Còn N phòng đang có khách thuê — không thể cải tạo"). FE vẫn cho bấm và hiển thị
   *   nguyên message của BE; khi BE gỡ ràng buộc thì chạy được luôn, không cần sửa FE.
   *   Yêu cầu đã ghi ở docs/BE-REQUEST-renovation-with-tenants-2026-07-30.md
   */
  const hasTenants = rentedRooms.length > 0;

  // Nhà khai báo "không cải tạo" từng bị khoá nút ở đây (BE không bật `hasRenovation`, rồi tạo
  // đợt số 1 nên file bổ sung bị từ chối). BE đã sửa cả hai (7614c9f, 14/09/2026): bật cờ và
  // đánh số đợt ≥ 2 — mọi loại nhà mở được đợt bổ sung.

  const handleStart = async () => {
    setStarting(true);
    try {
      const updated = await propertyService.startRenovation(current.id);
      setCurrent(updated);   // trạng thái mới từ BE — tránh dùng dữ liệu cũ của danh sách
      onPropertyChanged?.(updated);
      setJustStarted(true);  // → chuyển sang bước nhập cải tạo bổ sung
    } catch (err: any) {
      // Interceptor đã toast message của BE cho 4xx/5xx — chỉ bổ sung khi không có message
      if (!err?.response?.data?.message && !err?.response?.data?.error) {
        toast.error('Không bắt đầu được cải tạo lại');
      }
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-slate-400">Đang tải dữ liệu cải tạo...</div>;

  // Nhà đang ở ĐỢT CẢI TẠO ĐẦU của quy trình tiếp nhận (session 1) — không phải cải tạo bổ sung.
  // File bổ sung sẽ bị BE từ chối ("dùng renovation-excel"), nên hướng dẫn đúng chỗ thay vì mở form sai.
  if (inInitialSession) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Hammer className="mx-auto mb-3 h-10 w-10 text-amber-400" />
        <p className="font-bold text-slate-800">Tòa nhà đang ở đợt cải tạo đầu tiên</p>
        <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-slate-500">
          Đây là đợt cải tạo thuộc quy trình tiếp nhận, chưa phải cải tạo bổ sung. Hãy dùng
          <b className="text-slate-700"> “Nhập cải tạo từ Excel”</b> ở màn danh sách để hoàn tất,
          hoặc bấm <b className="text-slate-700">“Xác nhận hoàn thành cải tạo”</b> nếu đã xong.
          Cải tạo bổ sung chỉ mở được sau khi tòa nhà đã đi vào kinh doanh.
        </p>
      </div>
    );
  }

  // Đang ở đợt cải tạo bổ sung (session ≥ 2) → nhập file cải tạo bổ sung từ Excel.
  if (inSupplementSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          <RefreshCw className="h-4 w-4" /> Đã mở đợt cải tạo mới. Tải file cải tạo bổ sung để hoàn tất.
        </div>
        <SupplementImportPanel property={current} onDone={onDone} />
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
      {current.wholeHouse === false ? (
        <section className="rounded-2xl border bg-white overflow-hidden
          border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
            <DoorOpen className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Tình trạng phòng</h3>
            <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${
              hasTenants ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {hasTenants ? `${rentedRooms.length} phòng có khách` : 'Tất cả phòng trống'}
            </span>
          </div>
          <div className="p-5">
            {hasTenants ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-900 text-sm">Còn {rentedRooms.length} phòng đang có khách ở</p>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                      Vẫn có thể mở đợt cải tạo bổ sung — hãy báo trước cho khách thuê.
                      Nếu máy chủ báo lỗi <i>“không thể cải tạo”</i> nghĩa là backend chưa gỡ ràng buộc cũ
                      (đã gửi yêu cầu cho team BE).
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {rentedRooms.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-amber-100 bg-amber-50/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-semibold text-slate-700">{r.roomNumber}</span>
                        <span className="text-slate-400">{r.area} m²</span>
                      </div>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Có khách</span>
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
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900 text-sm">Nhà nguyên căn — cải tạo được cả khi đang có khách thuê</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Bấm bắt đầu sẽ mở đợt cải tạo mới ngay, kể cả khi khách vẫn đang ở. Sau khi nhập file
                cải tạo bổ sung, tòa nhà chuyển sang <b>chờ Host duyệt lại giá</b> — hãy báo trước cho
                khách thuê và đội vận hành.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Nút bắt đầu */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleStart}
          disabled={starting}
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

// ─── Tiến trình đưa nhà vào khai thác ───────────────────────────────────────
const FLOW_STEPS = [
  { key: 'draft',    label: 'Khởi tạo hồ sơ',    desc: 'Hợp đồng đầu vào & thiết bị bàn giao' },
  { key: 'reno',     label: 'Cải tạo',           desc: 'Nhập hạng mục & thiết bị mua mới' },
  { key: 'price',    label: 'Host duyệt giá',    desc: 'Chốt giá thuê trước khi mở bán' },
  { key: 'manager',  label: 'Gán quản lý',       desc: 'Chỉ định quản lý vận hành' },
  { key: 'active',   label: 'Kinh doanh',        desc: 'Sẵn sàng đón khách thuê' },
];

/** Bước hiện tại theo status BE (index trong FLOW_STEPS). */
const FLOW_INDEX: Record<string, number> = {
  DRAFT: 0,
  UNDER_RENOVATION: 1,
  RENOVATION_COMPLETED: 2,
  PENDING_HOST_REVIEW: 2,
  PENDING_OPERATION_MANAGER: 3,
  ACTIVE: 4,
  DISABLED: 4,
};

const WorkflowTimeline = ({ property }: { property: PropertyResponse }) => {
  const current = FLOW_INDEX[property.status] ?? 0;
  const done = property.status === 'ACTIVE';
  const disabled = property.status === 'DISABLED';
  const noReno = property.hasRenovation === false && !property.renovationCompleted;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Tiến trình khai thác</h3>
      <ol className="space-y-0">
        {FLOW_STEPS.map((s, i) => {
          const isDone = i < current || (done && i <= current);
          const isCurrent = i === current && !done;
          const skipped = s.key === 'reno' && noReno;
          const last = i === FLOW_STEPS.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {/* đường nối */}
              {!last && (
                <span className={`absolute left-[11px] top-6 h-full w-0.5 ${isDone ? 'bg-emerald-200' : 'bg-slate-100'}`} />
              )}
              <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black ${
                skipped ? 'border-slate-200 bg-slate-50 text-slate-300'
                : isDone ? 'border-emerald-500 bg-emerald-500 text-white'
                : isCurrent ? 'border-indigo-500 bg-white text-indigo-600 ring-4 ring-indigo-100'
                : 'border-slate-200 bg-white text-slate-300'
              }`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm font-bold ${
                  skipped ? 'text-slate-300 line-through'
                  : isCurrent ? 'text-indigo-700'
                  : isDone ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {s.label}
                  {isCurrent && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-600">Hiện tại</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{skipped ? 'Nhà không cải tạo' : s.desc}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {disabled && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">
          <XCircle className="h-3.5 w-3.5 shrink-0" /> Tòa nhà đã bị vô hiệu hóa
        </div>
      )}
    </div>
  );
};

// ─── Các mảnh dùng lại trong màn chi tiết ───────────────────────────────────
const SideCard = ({ title, icon: Icon, children }: {
  title: string; icon: LucideIcon; children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
      <Icon className="h-3.5 w-3.5" /> {title}
    </h3>
    {children}
  </div>
);

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-bold text-slate-800">{children}</span>
  </div>
);

const QuickStat = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-base font-black leading-tight text-slate-900">{value}</p>
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
    </div>
  </div>
);

/**
 * SỬA MÃ KHÁCH HÀNG ĐIỆN / SỐ DANH BỘ NƯỚC của căn nhà đã tồn tại.
 *
 * ─── Vì sao nằm ở màn CẤU HÌNH KHAI THÁC, không phải màn Khởi tạo nhà ────────
 * Màn khởi tạo là dữ liệu đổ từ file Excel tiếp nhận nhà — sửa tay ở đó là sửa ngược một
 * bản ghi vừa được import, dễ thành hai nguồn sự thật. Tới màn này thì nhà đã tồn tại và
 * đang vận hành, sửa một trường của nó là việc chính đáng.
 *
 * ─── Vì sao phải sửa được ────────────────────────────────────────────────────
 * Máy chủ CHẶN phát hành hoá đơn khi mã trên tờ giấy lệch mã đã lưu. Sai một ký tự trong
 * file Excel là khoá luôn việc thu tiền của căn đó, và trước 11/09/2026 không có đường nào
 * chữa qua giao diện — import lại thì bị bỏ qua vì trùng nhà, còn lại đúng một cách là mở
 * database chạy SQL tay.
 *
 * Dùng endpoint riêng `PATCH .../utility-customer-codes` chứ không phải `updateProperty`:
 * cái kia đòi gửi lại cả hồ sơ nhà, tức mở đường ghi đè nhầm trường không liên quan chỉ để
 * sửa một chuỗi. Máy chủ tự chuẩn hoá (bỏ dấu cách/gạch, hạ chữ thường) nên gõ kiểu nào
 * cũng được.
 */
const UtilityCodeCard = ({ detail, onSaved }: {
  detail: PropertyResponse;
  onSaved: (next: PropertyResponse) => void;
}) => {
  const [elec, setElec] = useState(detail.electricityCustomerCode ?? '');
  const [water, setWater] = useState(detail.waterCustomerCode ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Nhà đổi (chuyển sang căn khác trong danh sách) thì ô phải theo — nếu không nó giữ
  // nguyên mã của căn trước và người dùng tưởng căn này đã có mã.
  useEffect(() => {
    setElec(detail.electricityCustomerCode ?? '');
    setWater(detail.waterCustomerCode ?? '');
    setSaved(false);
    setError('');
  }, [detail.id, detail.electricityCustomerCode, detail.waterCustomerCode]);

  const dirty = elec.trim() !== (detail.electricityCustomerCode ?? '')
    || water.trim() !== (detail.waterCustomerCode ?? '');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const next = await propertyService.updateUtilityCustomerCodes(detail.id, {
        electricityCustomerCode: elec.trim(),
        waterCustomerCode: water.trim(),
      });
      onSaved(next);
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Không lưu được mã.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideCard title="Mã khách hàng" icon={Hash}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">Mã khách hàng điện</span>
          <input
            value={elec}
            onChange={(e) => { setElec(e.target.value); setSaved(false); }}
            placeholder="VD: PE05000222239"
            className="input-field py-1.5 font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">Số danh bộ nước</span>
          <input
            value={water}
            onChange={(e) => { setWater(e.target.value); setSaved(false); }}
            placeholder="VD: 1512 284 3356"
            className="input-field py-1.5 font-mono text-sm"
          />
        </label>

        {/* Nói rõ hậu quả của ô trống. Thiếu mã KHÔNG chặn gì cả — nó chỉ lặng lẽ tắt việc
            đối chiếu, tức mất cái chốt bắt hoá đơn gắn nhầm nhà mà không ai hay. */}
        {(!elec.trim() || !water.trim()) && (
          <p className="text-xs leading-relaxed text-amber-600">
            {!elec.trim() && !water.trim()
              ? 'Chưa có mã nào — hoá đơn điện và nước đều không được đối chiếu khi phát hành.'
              : !elec.trim()
                ? 'Chưa có mã điện — hoá đơn điện sẽ không được đối chiếu.'
                : 'Chưa có số danh bộ — hoá đơn nước sẽ không được đối chiếu.'}
          </p>
        )}

        {!!error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn-primary flex-1 py-1.5 text-sm disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu mã'}
          </button>
          {saved && !dirty && (
            <span className="text-xs font-bold text-emerald-600">Đã lưu</span>
          )}
        </div>
      </div>
    </SideCard>
  );
};

const ConfigOverview = ({ property }: { property: PropertyResponse }) => {
  const [detail, setDetail] = useState<PropertyResponse>(property);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomFilter, setRoomFilter] = useState<RoomStatus | 'all'>('all');
  const [roomSearch, setRoomSearch] = useState('');

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

  const renoTotal = (detail.renovationSessions ?? []).reduce((s, sess) => s + (sess.totalCost || 0), 0);
  const typeLabel = detail.wholeHouse === null ? 'Chưa xác định' : detail.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ';

  // Thống kê phòng: số lượng theo trạng thái + doanh thu tiềm năng.
  const roomStats = useMemo(() => {
    const by: Record<string, number> = {};
    let revenue = 0;
    rooms.forEach(r => {
      by[r.status] = (by[r.status] ?? 0) + 1;
      revenue += r.price || 0;
    });
    return { by, revenue, rented: by.RENTED ?? 0 };
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    const kw = roomSearch.trim().toLowerCase();
    return rooms.filter(r =>
      (roomFilter === 'all' || r.status === roomFilter) &&
      (!kw || r.roomNumber.toLowerCase().includes(kw))
    );
  }, [rooms, roomFilter, roomSearch]);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* ══ Cột chính ══ */}
      <div className="space-y-5 lg:col-span-2">
        {/* Thông số nhanh */}
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0">
          <QuickStat icon={Home}     label="Loại hình"  value={typeLabel} />
          <QuickStat icon={Ruler}    label="Diện tích"  value={detail.areaSize ? `${detail.areaSize} m²` : '—'} />
          <QuickStat icon={Layers}   label="Số tầng"    value={String(detail.totalFloor ?? detail.floorCount ?? '—')} />
          <QuickStat icon={DoorOpen} label="Tổng phòng" value={String(detail.totalRooms || 0)} />
        </div>

        {/* Danh sách phòng (chỉ nhà chia phòng) */}
        {isPhongTro && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
              <DoorOpen className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-black text-slate-800">Danh sách phòng</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{rooms.length}</span>
              {rooms.length > 0 && (
                <div className="relative ml-auto">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input value={roomSearch} onChange={e => setRoomSearch(e.target.value)}
                    placeholder="Tìm số phòng..."
                    className="w-40 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
              )}
            </div>

            {/* Chip lọc theo trạng thái phòng */}
            {rooms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5">
                <button onClick={() => setRoomFilter('all')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    roomFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'
                  }`}>
                  Tất cả {rooms.length}
                </button>
                {(Object.keys(ROOM_STATUS) as RoomStatus[]).filter(k => roomStats.by[k]).map(k => (
                  <button key={k} onClick={() => setRoomFilter(k)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      roomFilter === k ? 'bg-slate-900 text-white' : `${ROOM_STATUS[k].cls} hover:opacity-80`
                    }`}>
                    {ROOM_STATUS[k].label} {roomStats.by[k]}
                  </button>
                ))}
                {roomStats.revenue > 0 && (
                  <span className="ml-auto text-[11px] font-bold text-slate-400">
                    Tổng giá niêm yết: <span className="text-emerald-600">{formatVND(roomStats.revenue)}</span>/tháng
                  </span>
                )}
              </div>
            )}

            {roomsLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">Đang tải phòng...</p>
            ) : rooms.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Chưa có phòng nào.</p>
            ) : visibleRooms.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Không có phòng khớp bộ lọc.</p>
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
                  {visibleRooms.map(r => {
                    const st = ROOM_STATUS[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-600' };
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-slate-50/40">
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

        {/* Thiết bị chủ nhà bàn giao (nhà gốc) */}
        <HandoverEquipmentSection propertyId={property.id} />
      </div>

      {/* ══ Cột phụ ══ */}
      <div className="space-y-5">
        <WorkflowTimeline property={detail} />

        {/* Trạng thái hiện tại — mô tả bước đang ở */}
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-sm font-semibold leading-relaxed text-indigo-900">
            {STATUS_DESC[detail.status] ?? 'Cấu hình khai thác được nhập từ file Excel.'}
          </p>
        </div>

        <SideCard title="Cải tạo" icon={Hammer}>
          <div className="divide-y divide-slate-100">
            <InfoRow label="Tình trạng">
              {detail.renovationCompleted
                ? <span className="text-teal-600">Đã hoàn tất</span>
                : detail.hasRenovation
                ? <span className="text-amber-600">Đang thực hiện</span>
                : <span className="text-slate-400">Không cải tạo</span>}
            </InfoRow>
            <InfoRow label="Số đợt">{detail.renovationSessions?.length ?? 0} đợt</InfoRow>
            <InfoRow label="Tổng chi phí">
              {renoTotal > 0 ? <span className="text-amber-700">{formatVND(renoTotal)}</span> : '—'}
            </InfoRow>
          </div>
        </SideCard>

        <UtilityCodeCard detail={detail} onSaved={setDetail} />

        <SideCard title="Vận hành" icon={UserRound}>
          <div className="divide-y divide-slate-100">
            <InfoRow label="Quản lý vận hành">
              {detail.operationManagerName ?? <span className="text-slate-300">Chưa gán</span>}
            </InfoRow>
            <InfoRow label="Khu vực">{detail.zoneName || '—'}</InfoRow>
            {isPhongTro && (
              <InfoRow label="Phòng đang thuê">
                <span className={roomStats.rented > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {roomStats.rented}/{rooms.length}
                </span>
              </InfoRow>
            )}
          </div>
        </SideCard>

      </div>
    </div>
  );
};

/**
 * Khu hành động dưới thẻ tòa nhà — bố cục thống nhất cho mọi trạng thái:
 * 1 dòng gợi ý trạng thái · 1 nút chính · các nút phụ dạng icon.
 */
const CardFooter = ({ b, onDetail, onHistory, onRenovate, onComplete }: {
  b: PropertyResponse;
  onDetail: () => void;
  onHistory: () => void;
  onRenovate: () => void;
  onComplete: () => void;
}) => {
  const hint = CARD_HINT[b.status];
  const HintIcon = hint?.icon;
  const hasHistory = !!(b.hasRenovation || b.renovationCompleted);
  const iconBtn = 'shrink-0 rounded-xl border p-2.5 transition';

  return (
    // chặn nổi bọt để nút trong footer không kích hoạt onClick của cả thẻ
    <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
      {hint && (
        <div className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold ${hint.cls}`}>
          {HintIcon && <HintIcon className="h-3.5 w-3.5 shrink-0" />} {hint.label}
        </div>
      )}

      {b.status === 'UNDER_RENOVATION' && (
        <button onClick={onComplete}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-600 hover:text-white">
          <CheckCircle2 className="h-4 w-4" /> Xác nhận hoàn thành cải tạo
        </button>
      )}

      <div className="flex gap-2">
        <button onClick={onDetail}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-50 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-600 hover:text-white">
          <Eye className="h-4 w-4" /> Xem chi tiết
        </button>
        {hasHistory && (
          <button onClick={onHistory} title="Lịch sử cải tạo"
            className={`${iconBtn} border-amber-200 text-amber-600 hover:bg-amber-500 hover:text-white`}>
            <History className="h-4 w-4" />
          </button>
        )}
        {b.status === 'ACTIVE' && (
          <button onClick={onRenovate} title="Cải tạo lại — mở đợt mới & nhập file bổ sung"
            className={`${iconBtn} border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-white`}>
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
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
  const [renoTarget, setRenoTarget] = useState<PropertyResponse | null>(null);
  const [completingReno, setCompletingReno] = useState(false);
  /** Nhà đang ở đợt cải tạo BỔ SUNG (đợt ≥ 2, chưa đóng) — hoàn tất xong phải gửi Host duyệt lại giá. */
  const [renoSupplement, setRenoSupplement] = useState(false);

  /**
   * Mở hộp xác nhận hoàn thành cải tạo. Tra đợt đang mở để biết đây có phải đợt bổ sung không:
   * BE `completeRenovation` với đợt bổ sung chỉ đưa nhà về RENOVATION_COMPLETED mà KHÔNG gửi Host,
   * và màn này không có nút gửi Host — không xử lý thì nhà kẹt ở đó.
   */
  const askCompleteRenovation = (b: PropertyResponse) => {
    setRenoTarget(b);
    setRenoSupplement(false);
    if (b.status !== 'UNDER_RENOVATION') return;
    propertyService.getRenovationSessions(b.id)
      .then((sessions) => setRenoSupplement(sessions.some((s) => !s.endDate && s.sessionNumber >= 2)))
      .catch(() => { /* không tra được thì dùng lời nhắc chung */ });
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getAllProperties();
      setBuildings(res);
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

  const f = useBuildingFilters(buildings, { storageKey: 'config-list' });

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
    const targetId = renoTarget.id;
    setCompletingReno(true);
    try {
      const updated = await propertyService.completeRenovation(targetId);
      // Đợt bổ sung (hoặc lắp thiết bị xong) → BE dừng ở RENOVATION_COMPLETED. Gửi Host luôn,
      // giống import file bổ sung, để nhà không nằm kẹt ở trạng thái không có nút đi tiếp.
      if (updated?.status === 'RENOVATION_COMPLETED') {
        try {
          await propertyService.submitToHost(targetId);
          toast.success('Đã hoàn tất cải tạo và gửi Host duyệt lại giá');
        } catch (submitErr: any) {
          if (!submitErr?.response?.data?.message && !submitErr?.response?.data?.error) {
            toast.error('Đã hoàn tất cải tạo nhưng chưa gửi được Host duyệt giá');
          }
        }
      }
      setRenoTarget(null);
      fetchList();
      // Đang mở màn chi tiết của chính nhà vừa xác nhận → nạp lại để badge/tiến trình đổi ngay.
      if (selected?.id === targetId) {
        propertyService.getPropertyById(targetId).then(setSelected).catch(() => { /* giữ dữ liệu cũ */ });
      }
    } catch (err: any) {
      setRenoTarget(null);
      const msg: string = err?.response?.data?.message || err?.response?.data?.error || '';
      // BE throw "Tòa nhà không có cải tạo" khi has_renovation = false — xem
      // docs/BE-BUG-start-renovation-no-renovation-flag-2026-07-30.md
      if (/không có cải tạo/i.test(msg)) {
        toast.error('Máy chủ báo tòa nhà "không có cải tạo" nên không xác nhận hoàn thành được. Cần team BE bật cờ has_renovation cho căn này.', { duration: 8000 });
      } else if (!msg) {
        toast.error('Không xác nhận hoàn thành cải tạo được');
      }
      // còn lại: interceptor đã toast nguyên văn message của BE
    } finally {
      setCompletingReno(false);
    }
  };

  const renoConfirmDialog = (
    <ConfirmDialog
      open={!!renoTarget}
      tone="success"
      title="Xác nhận hoàn thành cải tạo?"
      message={renoTarget && (
        <>
          Bạn chắc chắn tòa nhà <b className="text-slate-700">{renoTarget.propertyName}</b> đã cải tạo xong?{' '}
          {renoSupplement ? (
            <>
              Đây là <b className="text-slate-700">đợt cải tạo bổ sung</b>: hệ thống sẽ tính lại giá và{' '}
              <b className="text-slate-700">gửi Host duyệt lại</b>. Khách đang ở giữ nguyên giá trong hợp đồng.
              Nếu đợt này có hạng mục cải tạo hoặc thiết bị, hãy nhập file bổ sung ở tab “Cải tạo lại” thay vì bấm ở đây.
            </>
          ) : (
            <>Hệ thống sẽ chuyển tòa nhà sang bước tiếp theo và không thể hoàn tác.</>
          )}
        </>
      )}
      confirmText="Xác nhận hoàn thành"
      loading={completingReno}
      onConfirm={handleRenovationComplete}
      onCancel={() => setRenoTarget(null)}
    />
  );

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết cấu hình
  // ═══════════════════════════════════════════════════════════════════
  if (selected) {
    const canShowHistory = !!(selected.hasRenovation || selected.renovationCompleted);
    // UNDER_RENOVATION cũng phải hiện tab này: đã bấm "Bắt đầu cải tạo lại" mà thoát ra
    // giữa chừng thì cần quay lại đúng form nhập file cải tạo bổ sung để làm tiếp.
    const canShowRenovate = selected.status === 'ACTIVE' || selected.status === 'UNDER_RENOVATION';
    const canShowEquipment = selected.status !== 'DRAFT';
    const tabs = [
      { key: 'config' as const, label: 'Tổng quan', icon: Settings2 },
      ...(canShowEquipment ? [{ key: 'equipment' as const, label: 'Thiết bị', icon: Package }] : []),
      ...(canShowHistory ? [{ key: 'history' as const, label: 'Lịch sử cải tạo', icon: History }] : []),
      ...(canShowRenovate ? [{ key: 'renovate' as const, label: 'Cải tạo lại', icon: RefreshCw }] : []),
    ];

    const badge = getStatusBadge(selected);
    const reno = selected.renovationCompleted ? 'done' : selected.hasRenovation ? 'in_progress' : 'none';

    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <button onClick={backToList}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        {/* ── Header tòa nhà ── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black leading-tight text-slate-900">{selected.propertyName}</h1>
                  {badge && <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badge.cls}`}>{badge.label}</span>}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {selected.fullAddress || selected.shortAddress}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  {selected.zoneName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{selected.zoneName}</span>
                  )}
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600">
                    {selected.wholeHouse === null ? 'Chưa chọn loại hình' : selected.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                  {reno !== 'none' && (
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${
                      reno === 'done' ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}>
                      {reno === 'done' ? 'Đã cải tạo' : 'Đang cải tạo'}
                    </span>
                  )}
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    <UserRound className="h-3 w-3" />
                    {selected.operationManagerName ?? 'Chưa gán quản lý'}
                  </span>
                </div>
              </div>
            </div>

            {/* Hành động chính theo trạng thái */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {selected.status === 'UNDER_RENOVATION' && (
                <button onClick={() => askCompleteRenovation(selected)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-500/25 transition hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Xác nhận hoàn thành cải tạo
                </button>
              )}
              {selected.status === 'ACTIVE' && (
                <button onClick={() => setViewMode('renovate')}
                  className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100">
                  <RefreshCw className="h-4 w-4" /> Cải tạo lại
                </button>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          {tabs.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/70 px-3 py-2">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const active = viewMode === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setViewMode(tab.key)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                      active
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

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
          <RenovateRestartPanel property={selected} onDone={backToList} onPropertyChanged={setSelected} />
        )}

        {renoConfirmDialog}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Quy trình tiếp nhận nhà"
        title="Cấu hình khai thác"
        subtitle="Cấu hình cải tạo / phòng và theo dõi tiến độ đưa từng tòa nhà vào kinh doanh"
        icon={Settings2}
        steps={ONBOARDING_STEPS.map(s => ({ ...s, current: s.to === '/admin/buildings/configuration' }))}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng tòa nhà" value={kpi.total} icon={Building2} tone="blue"
          helper="Toàn bộ hồ sơ đã tiếp nhận"
          onClick={() => f.setStatus('all')} active={f.status === 'all'} />
        <StatCard title="Chờ cấu hình" value={kpi.pending} icon={Settings2} tone="slate"
          helper="chưa chọn loại hình" progress={kpi.total ? kpi.pending / kpi.total : 0}
          onClick={() => f.setStatus('DRAFT')} active={f.status === 'DRAFT'} />
        <StatCard title="Đã cấu hình" value={kpi.configured} icon={CheckCircle2} tone="emerald"
          helper="đã xác định loại hình" progress={kpi.total ? kpi.configured / kpi.total : 0} />
        <StatCard title="Đang cải tạo" value={kpi.renovation} icon={Hammer} tone="amber"
          helper="cần xác nhận hoàn thành" progress={kpi.total ? kpi.renovation / kpi.total : 0}
          onClick={() => f.setStatus('UNDER_RENOVATION')} active={f.status === 'UNDER_RENOVATION'} />
      </div>

      <BuildingFilterBar
        f={f}
        statusOptions={CONFIG_STATUS_OPTIONS}
        action={
          <button onClick={() => setImportOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100">
            <FileSpreadsheet className="h-4 w-4" /> Nhập cải tạo từ Excel
          </button>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : f.filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400">
          <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm font-semibold text-slate-500">Không tìm thấy tòa nhà phù hợp.</p>
          {f.activeCount > 0 && (
            <button onClick={f.reset}
              className="mx-auto mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
        <ResultBar f={f} />

        {f.view === 'table' ? (
          <BuildingTable
            rows={f.paged}
            getBadge={getStatusBadge}
            onRowClick={openConfig}
            renderActions={(b) => (
              <>
                <button onClick={() => openConfig(b)} title="Xem chi tiết cấu hình"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600">
                  <Eye className="h-4 w-4" />
                </button>
                {b.status === 'UNDER_RENOVATION' && (
                  <button onClick={() => askCompleteRenovation(b)} title="Xác nhận hoàn thành cải tạo"
                    className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}
                {(b.hasRenovation || b.renovationCompleted) && (
                  <button onClick={() => openHistory(b)} title="Lịch sử cải tạo"
                    className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50">
                    <History className="h-4 w-4" />
                  </button>
                )}
                {b.status === 'ACTIVE' && (
                  <button onClick={() => openRenovate(b)} title="Cải tạo lại (nhập bổ sung)"
                    className="rounded-md p-1.5 text-orange-600 hover:bg-orange-50">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          />
        ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {f.paged.map(b => {
            return (
              <BuildingCard
                key={b.id}
                onClick={() => openConfig(b)}
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
                  <CardFooter
                    b={b}
                    onDetail={() => openConfig(b)}
                    onHistory={() => openHistory(b)}
                    onRenovate={() => openRenovate(b)}
                    onComplete={() => askCompleteRenovation(b)}
                  />
                </BuildingCard>
            );
          })}
        </div>
        )}

        <Pagination page={f.page} totalPages={f.totalPages} onChange={f.setPage} />
        </>
      )}

      {renoConfirmDialog}

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
