import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownWideNarrow, ArrowRight, Building2, Check, ChevronDown, DoorOpen,
  Loader2, MapPin, Phone, RefreshCw, RotateCcw, Search, ShieldCheck, UserCog, UserRound, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '@/services/property.service';
import { userService } from '@/services/user.service';
import type { PropertyResponse, UserResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import { Overlay } from '@/components/Overlay';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
import { hostService } from '@/services/host.service';
import { tenantService } from '@/services/tenant.service';
import { STATUS_BADGE, typeLabel } from '@/pages/host/properties/propertyListState';
import {
  groupByZone, isAssignable, loadByManager, previewAssign, unitsOf,
  WARN_PROPERTIES_PER_MANAGER, WARN_ROOMS_PER_MANAGER, ZONE_STATE_META,
  type ManagerLoad, type ZoneGroup, type ZoneState,
} from './zoneAssignmentState';

/**
 * Màn "Khu vực & Quản lý" — DÙNG CHUNG cho cả Admin và Host.
 *
 * Nghiệp vụ: một quận/huyện chỉ có MỘT quản lý vận hành, và gán cho khu vực nghĩa
 * là gán cho mọi nhà bên trong. Cả hai vai đều cần nhìn thấy khu vực nào đang do ai
 * phụ trách nên chỉ khác nhau ở câu chữ, không khác dữ liệu.
 */

type ManagerItem = { id: string; fullName: string; username: string };

const nameOf = (m: ManagerItem) => m.fullName || m.username;

/** Tài khoản không ở trạng thái này thì không vận hành được — cần báo động. */
const isUsableAccount = (u?: UserResponse) => !u || u.status === 'ACTIVE';

/**
 * Khu vực "có quản lý nhưng chưa đăng ký phân công".
 *
 * Nhà trong khu vực đang mang `operationManagerId` (nên FE hiển thị là đã có quản lý),
 * nhưng bảng `zone_managers` phía BE lại KHÔNG có bản ghi cho khu vực đó — thường do các
 * nhà này được gán lẻ từng căn qua `PATCH /properties/{id}/operation-manager`, đường đó
 * không ghi vào bảng phân công.
 *
 * Hệ quả người dùng gặp phải: lúc host duyệt một nhà mới, BE tra đúng bảng đó để tự gán
 * (`PropertyOnboardingServiceImpl.hostConfirm`). Không có bản ghi → nhà rơi vào
 * "Chờ gán quản lý" dù khu vực nhìn như đã có người phụ trách.
 *
 * Cách chữa: bấm "Gán quản lý" một lần — `PUT /zones/{zoneId}/manager` ghi bản ghi thật.
 */
const hasRegistryGap = (group: ZoneGroup, registered: Set<string>, known: boolean): boolean =>
  known && !!group.managerId && !registered.has(group.zoneId);

/** Hợp đồng còn hiệu lực của một nhà, tách theo trạng thái. */
type ContractLoad = { active: number; pending: number; draft: number };

/**
 * Một khách đang gắn với nhà (hợp đồng CHƯA kết thúc) — bản gọn dùng chung cho hai vai.
 * Host đọc từ `/host/contracts`, Admin từ `/tenant-contracts` (Admin không gọi được
 * endpoint của Host), hai DTO khác tên trường nên chuẩn hoá về đây.
 */
interface TenantLite {
  id: string;
  name: string;
  phone?: string;
  /** Số phòng; rỗng = thuê nguyên căn. */
  room?: string;
  status: 'ACTIVE' | 'PENDING' | 'DRAFT';
  endDate?: string;
}

const LIVE_STATUSES = new Set(['ACTIVE', 'PENDING', 'DRAFT']);

const TENANT_STATUS: Record<TenantLite['status'], { label: string; cls: string }> = {
  ACTIVE:  { label: 'Đang ở',        cls: 'bg-emerald-50 text-emerald-700' },
  PENDING: { label: 'Chưa dọn vào',  cls: 'bg-sky-50 text-sky-700' },
  DRAFT:   { label: 'Chờ đón khách', cls: 'bg-amber-50 text-amber-700' },
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

/** Số khách ĐANG Ở (ACTIVE) trong một nhóm nhà. */
const occupiedIn = (props: PropertyResponse[], tenants: Map<number, TenantLite[]>) =>
  props.reduce((s, p) => s + (tenants.get(p.id) ?? []).filter((t) => t.status === 'ACTIVE').length, 0);

/** Bán kính ảnh hưởng thật của việc gỡ quản lý khỏi một khu vực. */
interface RemovalImpact {
  /** Nhà đổi/gỡ được — số này sẽ rớt về "chờ gán quản lý". */
  assignable: PropertyResponse[];
  /** Nhà còn hợp đồng chưa kết thúc — nhà có việc dở dang gắn với người phụ trách. */
  liveProperties: PropertyResponse[];
  /** HĐ đang có khách ở. */
  active: number;
  /** HĐ đã chốt, khách chưa dọn vào — vẫn cần người phụ trách. */
  pending: number;
  /** HĐ "Chờ đón khách" — admin đã nhập, đang chờ đúng manager này đi onboard. */
  draft: number;
  /** Còn bất kỳ HĐ nào chưa kết thúc → cấm gỡ, bắt buộc đổi sang người khác. */
  blocked: boolean;
}

/**
 * Tính bán kính ảnh hưởng từ SỐ HỢP ĐỒNG THẬT, không đoán qua `property.status`.
 *
 * Nhà chia phòng đang có khách vẫn mang status `ACTIVE` (chỉ từng phòng mới `RENTED`),
 * nên lọc theo status sẽ bỏ sót đúng loại nhà đông khách nhất.
 *
 * `known = false` (chưa tải được hợp đồng) → coi như KHÔNG an toàn: không chặn cứng
 * nhưng cũng không được nói "khu vực không có khách nào".
 *
 * DRAFT cũng chặn, không chỉ ACTIVE/PENDING: HĐ "Chờ đón khách" là việc admin đã nhập và
 * giao cho đúng manager này đi onboard. Gỡ người đó thì hợp đồng vẫn còn nguyên ngày nhận
 * nhà mà không còn ai đi đón. BE cũng xoá `assignedManager` của mọi HĐ khác TERMINATED
 * (`removeAssignedManagerByZoneId`) chứ không riêng HĐ đang ở.
 */
const removalImpact = (
  group: ZoneGroup,
  load: Map<number, ContractLoad>,
  known: boolean,
): RemovalImpact => {
  const assignable = group.properties.filter(isAssignable);
  let active = 0, pending = 0, draft = 0;
  const liveProperties: PropertyResponse[] = [];

  for (const p of assignable) {
    const c = load.get(p.id);
    if (!c) continue;
    active += c.active;
    pending += c.pending;
    draft += c.draft;
    if (c.active + c.pending + c.draft > 0) liveProperties.push(p);
  }

  return {
    assignable, liveProperties, active, pending, draft,
    blocked: known && active + pending + draft > 0,
  };
};

type StateFilter = 'all' | ZoneState;
type SortKey = 'todo' | 'properties' | 'units' | 'name';

const SORT_LABEL: Record<SortKey, string> = {
  todo:       'Việc cần xử lý trước',
  properties: 'Nhiều nhà nhất',
  units:      'Nhiều đơn vị nhất',
  name:       'Tên khu vực A → Z',
};

const STATE_CHIPS: { key: StateFilter; label: string }[] = [
  { key: 'all',        label: 'Tất cả' },
  { key: 'MIXED',      label: 'Cần chốt' },
  { key: 'UNASSIGNED', label: 'Chưa gán' },
  { key: 'PARTIAL',    label: 'Còn thiếu' },
  { key: 'ASSIGNED',   label: 'Đã gán' },
];

const USER_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Đang hoạt động', cls: 'bg-emerald-100 text-emerald-700' },
  INACTIVE: { label: 'Chưa kích hoạt', cls: 'bg-slate-100 text-slate-600' },
  PENDING:  { label: 'Chờ duyệt',      cls: 'bg-amber-100 text-amber-700' },
  DISABLE:  { label: 'Vô hiệu hoá',    cls: 'bg-rose-100 text-rose-700' },
};

// ── Thẻ thống kê đầu trang ───────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, tone, active, onClick }: {
  icon: typeof MapPin; label: string; value: string | number;
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
  active?: boolean; onClick?: () => void;
}) => {
  const tones = {
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    rose:    'bg-rose-50 text-rose-600',
  };
  const rings = {
    indigo: 'ring-2 ring-indigo-500', emerald: 'ring-2 ring-emerald-500',
    amber: 'ring-2 ring-amber-500', rose: 'ring-2 ring-rose-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`card flex items-center gap-3.5 p-4 text-left transition ${
        onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
      } ${active ? rings[tone] : ''}`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{label}</p>
      </div>
    </button>
  );
};

// ── Hồ sơ quản lý đang phụ trách khu vực ─────────────────────────────────────
const ManagerCard = ({ managerId, managerName, user, load }: {
  managerId: string;
  managerName?: string;
  user?: UserResponse;
  load?: ManagerLoad;
}) => {
  // `operationManagerName` của property đôi khi rỗng — rơi về username của tài khoản.
  const display = managerName || user?.username || 'Không rõ tên';
  const st = USER_STATUS[user?.status ?? 'ACTIVE'] ?? USER_STATUS.ACTIVE;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-100">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white">
        {display.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900">{display}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-400">
          {user?.username && <span>@{user.username}</span>}
          {user?.phoneNumber && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phoneNumber}</span>
          )}
          {!user && <span className="italic">Không đọc được hồ sơ (thiếu quyền xem người dùng)</span>}
        </p>
        {load && (
          <p className="mt-1.5 text-xs font-semibold text-slate-600">
            Đang phụ trách {load.zones} khu vực · {load.properties} nhà · {load.units} đơn vị cho thuê
          </p>
        )}
      </div>
      <span className="hidden shrink-0 font-mono text-[10px] text-slate-300 sm:block">{managerId.slice(0, 8)}</span>
    </div>
  );
};

// ── Hộp chọn quản lý cho một khu vực ─────────────────────────────────────────
const AssignModal = ({
  group, allGroups, managers, userMap, loads, mgrNames, registeredManagerId, onClose, onDone,
}: {
  group: ZoneGroup;
  /** Mọi khu vực — cần để biết người được chọn đang giữ những khu vực nào khác. */
  allGroups: ZoneGroup[];
  managers: ManagerItem[];
  userMap: Map<string, UserResponse>;
  loads: Map<string, ManagerLoad>;
  mgrNames: Map<string, string>;
  /**
   * Quản lý đang đăng ký cho khu vực này theo bảng phân công (`zone_managers`) — KHÁC
   * `group.managerId`, cái đó suy từ `property.operationManagerId`.
   *
   * Cần riêng vì hai thứ lệch nhau là chuyện bình thường: nhà chờ Host duyệt giá thì chưa
   * mang id quản lý nào, nên `group.managerId` trống trong khi khu vực đã có người phụ
   * trách. Không có con số này thì không biết bấm Gán có tạo ra thay đổi gì không.
   */
  registeredManagerId?: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [picked, setPicked] = useState<string>(group.managerId ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** Lọc danh sách quản lý — chỉ dựng ô tìm khi danh sách đủ dài để phải cuộn. */
  const [mgrSearch, setMgrSearch] = useState('');
  /**
   * Có tick = "chuyển hẳn": gán sang khu vực này XONG thì gỡ người đó khỏi khu vực cũ.
   * Không tick = "kiêm nhiệm" (hành vi mặc định của hệ thống) — người đó giữ cả hai.
   *
   * Đây là chỗ hay hiểu nhầm nhất màn này: nút ghi "Đổi quản lý" nhưng thực chất chỉ đổi
   * chủ của KHU VỰC ĐANG MỞ, không hề đụng tới khu vực cũ của người được chọn.
   */
  const [alsoReleaseOldZones, setAlsoReleaseOldZones] = useState(false);
  /** Danh sách nhà bàn giao — gập mặc định, bấm "xem nhà" mới mở. */
  const [showHouses, setShowHouses] = useState(false);

  const preview = useMemo(() => (picked ? previewAssign(group, picked) : null), [group, picked]);
  const pickedManager = managers.find((m) => m.id === picked);

  /** Người đang được chọn LUÔN nằm trong danh sách, kể cả khi từ khoá không khớp —
      lọc mất họ thì dấu tick biến mất và người dùng tưởng mình chưa chọn ai. */
  const visibleManagers = useMemo(() => {
    const kw = normalizeVi(mgrSearch.trim());
    if (!kw) return managers;
    return managers.filter((m) =>
      m.id === picked
      || normalizeVi(`${nameOf(m)} ${userMap.get(m.id)?.phoneNumber ?? ''}`).includes(kw));
  }, [managers, mgrSearch, picked, userMap]);

  // Tải SAU khi gán = tải hiện tại của người được chọn + phần khu vực này chuyển sang.
  const projected = useMemo(() => {
    if (!picked || !preview) return null;
    const cur = loads.get(picked) ?? { zones: 0, properties: 0, units: 0 };
    const added = [...preview.fresh, ...preview.handover];
    return {
      properties: cur.properties + added.length,
      units: cur.units + added.reduce((s, p) => s + unitsOf(p), 0),
    };
  }, [picked, preview, loads]);

  const overloaded =
    !!projected &&
    (projected.properties > WARN_PROPERTIES_PER_MANAGER || projected.units > WARN_ROOMS_PER_MANAGER);

  const changeCount = preview ? preview.fresh.length + preview.handover.length : 0;
  const busy = progress !== null;

  /**
   * Gán được hay không KHÔNG chỉ phụ thuộc số nhà đổi được.
   *
   * Máy chủ ghi bảng phân công (`zone_managers`) TRƯỚC rồi mới áp lên từng nhà
   * (`ZoneAssignmentServiceImpl.assignManager` dòng 96-105), nên gán một khu vực chưa có
   * nhà nào đổi được vẫn có tác dụng thật: đăng ký người phụ trách để nhà tự nhận khi Host
   * duyệt giá xong.
   *
   * Trước đây nút khoá cứng theo `changeCount === 0`, nên khu vực toàn nhà chờ duyệt là
   * bấm Gán ra hộp thoại rồi kẹt luôn ở đó — không làm gì được, cũng không hiểu vì sao.
   */
  const registryChanges = !!picked && picked !== registeredManagerId;
  const canApply = !!picked && (changeCount > 0 || registryChanges);

  /** Các khu vực KHÁC mà người được chọn đang giữ — nền cho tick "chuyển hẳn". */
  const otherZonesOfPicked = useMemo(
    () => (picked ? allGroups.filter((g) => g.zoneId !== group.zoneId && g.managerId === picked) : []),
    [allGroups, group.zoneId, picked],
  );

  /** Quản lý hiện tại của khu vực này — người sắp bị thay ra. */
  const outgoingId = group.managerId;
  const outgoingZonesAfter = useMemo(
    () => (outgoingId && outgoingId !== picked
      ? allGroups.filter((g) => g.zoneId !== group.zoneId && g.managerId === outgoingId).length
      : null),
    [allGroups, group.zoneId, outgoingId, picked],
  );

  const nameById = (id?: string) =>
    (id ? (mgrNames.get(id) || managers.find((m) => m.id === id)?.username || '—') : '—');

  /**
   * MỘT lệnh cho cả khu vực. Bản trước gọi lặp `PATCH /properties/{id}/operation-manager`
   * cho từng nhà vì BE chưa có API gán theo lô — chết giữa chừng là khu vực nửa nạc nửa mỡ.
   * BE đã làm endpoint atomic (15/08/2026): đổi bảng phân công + mọi nhà + hợp đồng trong
   * một transaction, và trả về số nhà/hợp đồng đã ảnh hưởng.
   */
  const handleApply = async () => {
    // Chốt theo `canApply`, KHÔNG theo `changeCount`: gán một khu vực chưa nhà nào đổi được
    // vẫn là việc có thật (ghi bảng phân công) — xem `canApply`. Chặn theo `changeCount` thì
    // bật nút cũng vô ích, bấm vào không có gì xảy ra.
    if (!preview || !pickedManager || !canApply) return;
    const toRelease = alsoReleaseOldZones ? otherZonesOfPicked : [];
    setProgress({ done: 0, total: Math.max(1, changeCount) });
    try {
      // MỘT lệnh cho cả hai việc: gán sang khu vực này + gỡ khỏi các khu vực cũ.
      // BE chạy trong một transaction (POST /zones/manager-transfer, 19/08/2026) nên không
      // còn cảnh gán xong mà gỡ hỏng, để người đó vừa nhận chỗ mới vừa ôm chỗ cũ.
      const res = toRelease.length > 0
        ? await zoneAssignmentService.transfer(
          pickedManager.id, group.zoneId, toRelease.map((z) => z.zoneId))
        : await zoneAssignmentService.assign(group.zoneId, pickedManager.id);

      // 0 nhà đổi được là kết quả HỢP LỆ (khu vực toàn nhà chờ duyệt giá) — đừng báo
      // "— 0 nhà" nghe như thất bại, mà nói rõ điều gì sẽ xảy ra tiếp theo.
      if (res.affectedProperties === 0) {
        toast.success(
          `${group.zoneName} giờ do ${nameOf(pickedManager)} phụ trách. Nhà trong khu vực sẽ tự về tay người này khi bạn duyệt giá.`,
          { duration: 6000 },
        );
      } else {
        const parts = [`${res.affectedProperties} nhà`];
        if (res.affectedContracts > 0) parts.push(`${res.affectedContracts} hợp đồng`);
        toast.success(`Đã gán ${nameOf(pickedManager)} cho ${group.zoneName} — ${parts.join(' · ')}.`);
      }
      if (toRelease.length > 0) {
        toast.success(
          `Đã gỡ khỏi ${toRelease.map((z) => z.zoneName).join(', ')} — các khu vực này giờ chưa có quản lý.`,
        );
      }
      onDone();
    } catch (e: any) {
      const data = e?.response?.data;
      toast.error(
        data?.message || data?.error || e?.message || 'Không gán được quản lý cho khu vực.',
        { duration: 6000 },
      );
    } finally {
      setProgress(null);
    }
  };

  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gán quản lý khu vực</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-slate-950">
              <MapPin className="h-5 w-5 text-indigo-500" />
              {group.zoneName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {group.properties.length} nhà · {group.units} đơn vị — cả khu do một người phụ trách
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Khu vực đang lẫn nhiều quản lý — một dòng là đủ, chi tiết số nhà nằm ngay trong đó */}
          {group.state === 'MIXED' && (
            <p className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <span>
                <b>Đang lẫn {group.managerBreakdown.length} quản lý:</b>{' '}
                {group.managerBreakdown
                  .map((b) => `${b.managerName || mgrNames.get(b.managerId) || '—'} (${b.count})`)
                  .join(' · ')}
                {group.unassignedCount > 0 && ` · chưa gán (${group.unassignedCount})`}. Chọn một người cho cả khu.
              </span>
            </p>
          )}

          {/* ── Chọn quản lý — lưới 2 cột, mỗi ô một dòng tên + một dòng tải việc ── */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Chọn quản lý</p>
              {managers.length > 5 && (
                <div className="relative w-48">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={mgrSearch}
                    onChange={(e) => setMgrSearch(e.target.value)}
                    placeholder="Tìm quản lý..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs outline-none transition focus:border-indigo-400 focus:bg-white"
                  />
                </div>
              )}
            </div>
            {managers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Chưa có tài khoản quản lý vận hành nào.
              </p>
            ) : visibleManagers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Không có quản lý nào khớp &quot;{mgrSearch}&quot;.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleManagers.map((m) => {
                  const load = loads.get(m.id);
                  const on = picked === m.id;
                  const phone = userMap.get(m.id)?.phoneNumber;
                  /* Nhãn "Đang giữ": ô tick được đặt sẵn vào người hiện tại lúc mở hộp, không
                     có nhãn thì không biết mình đã đổi gì chưa. */
                  const current = m.id === (group.managerId ?? registeredManagerId);
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPicked(m.id)}
                      disabled={busy}
                      title={phone}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                        on ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {nameOf(m).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                          <span className="truncate">{nameOf(m)}</span>
                          {current && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                              ĐANG GIỮ
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {load ? `${load.zones} khu · ${load.properties} nhà · ${load.units} đơn vị` : 'Chưa giữ khu nào'}
                        </p>
                      </div>
                      {on && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Tóm tắt thay đổi: một khung duy nhất, đọc từ trên xuống là hiểu ──
              Hiểu nhầm lớn nhất của màn này: "Đổi" chỉ đổi chủ KHU ĐANG MỞ — khu cũ của người
              được chọn vẫn giữ nguyên (thành kiêm nhiệm). Dòng "kiêm thêm" + tick chuyển hẳn
              nằm ngay dưới tên người đó để không ai bỏ sót. */}
          {picked && preview && (
            <div className="rounded-xl border border-slate-200">
              <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                Sau khi áp dụng
              </p>

              <div className="space-y-3 px-4 py-3">
                {/* Người cũ → người mới */}
                {outgoingId !== picked ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {outgoingId && (
                      <>
                        <span className="rounded-lg bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 line-through decoration-rose-300">
                          {nameById(outgoingId)}
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </>
                    )}
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">
                      {pickedManager ? nameOf(pickedManager) : '—'}
                    </span>
                    <span className="text-xs text-slate-500">giữ {group.zoneName}</span>
                  </div>
                ) : changeCount === 0 && preview.blocked.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {pickedManager ? nameOf(pickedManager) : 'Người này'} đã giữ cả khu vực — không có gì để đổi.
                  </p>
                ) : null}

                {/* Hệ quả với từng người — mỗi ý một dòng ngắn */}
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {outgoingId && outgoingId !== picked && (
                    <li className={outgoingZonesAfter === 0 ? 'font-semibold text-amber-700' : ''}>
                      • {nameById(outgoingId)} còn <b>{outgoingZonesAfter ?? 0} khu vực</b>
                      {outgoingZonesAfter === 0 && ' — nhớ giao việc khác cho họ'}
                    </li>
                  )}
                  {otherZonesOfPicked.length > 0 && outgoingId !== picked && (
                    <li className={alsoReleaseOldZones ? 'text-slate-400' : 'text-amber-700'}>
                      • {pickedManager ? nameOf(pickedManager) : 'Người mới'}{' '}
                      {alsoReleaseOldZones
                        ? <>rời <b>{otherZonesOfPicked.map((z) => z.zoneName).join(', ')}</b></>
                        : <>kiêm thêm <b>{otherZonesOfPicked.map((z) => z.zoneName).join(', ')}</b></>}
                    </li>
                  )}
                  {preview.handover.length > 0 && (
                    <li>
                      • <b>{preview.handover.length} nhà bàn giao</b> — hợp đồng, hoá đơn, việc dở chuyển sang người mới
                      <button
                        type="button"
                        onClick={() => setShowHouses((v) => !v)}
                        className="ml-1.5 font-bold text-indigo-600 hover:underline"
                      >
                        {showHouses ? 'ẩn' : 'xem nhà'}
                      </button>
                    </li>
                  )}
                  {preview.fresh.length > 0 && (
                    <li>• <b>{preview.fresh.length} nhà</b> chưa có quản lý sẽ được gán</li>
                  )}
                  {preview.unchanged.length > 0 && (
                    <li className="text-slate-400">• {preview.unchanged.length} nhà giữ nguyên</li>
                  )}
                  {preview.blocked.length > 0 && (
                    <li className="text-slate-400" title="Chỉ đổi được khi nhà đang hoạt động, đã cho thuê hoặc chờ gán">
                      • {preview.blocked.length} nhà chưa đổi được (đang {preview.blocked.map((p) => STATUS_BADGE[p.status]?.label ?? p.status).join(', ').toLowerCase()})
                    </li>
                  )}
                  {changeCount === 0 && registryChanges && (
                    <li className="text-emerald-700">
                      • Chưa nhà nào đổi ngay — nhà sẽ tự về tay người này khi Host duyệt giá
                    </li>
                  )}
                </ul>

                {showHouses && (preview.handover.length > 0 || preview.fresh.length > 0) && (
                  <ul className="space-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {[...preview.handover, ...preview.fresh].map((p) => (
                      <li key={p.id} className="truncate">· {p.propertyName}</li>
                    ))}
                  </ul>
                )}

                {/* Tick "chuyển hẳn" — chỉ khi người được chọn đang giữ khu khác */}
                {otherZonesOfPicked.length > 0 && outgoingId !== picked && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={alsoReleaseOldZones}
                      onChange={(e) => setAlsoReleaseOldZones(e.target.checked)}
                      disabled={busy}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      <b>Chuyển hẳn</b> — gỡ khỏi {otherZonesOfPicked.map((z) => z.zoneName).join(', ')}
                      {alsoReleaseOldZones && (
                        <span className="block text-amber-700">Khu đó sẽ chưa có quản lý cho tới khi bạn gán người mới.</span>
                      )}
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Cảnh báo tải — chỉ nhắc, không chặn */}
          {overloaded && projected && (
            <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>
                Sau khi gán sẽ giữ <b>{projected.properties} nhà · {projected.units} đơn vị</b> — vượt mức
                khuyến nghị ({WARN_PROPERTIES_PER_MANAGER} nhà / {WARN_ROOMS_PER_MANAGER} đơn vị).
              </span>
            </p>
          )}
        </div>

        {/* Footer.
            Nút bấm nói VIỆC SẼ LÀM, còn lý do chưa bấm được thì nằm ở dòng chữ bên trái.
            Bản trước để nhãn nút là "Không có thay đổi" — một câu trạng thái đứng ở chỗ
            của một mệnh lệnh, đọc vào tưởng bấm để "không thay đổi gì". */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <p className={`text-xs ${canApply ? 'text-slate-400' : 'font-semibold text-slate-500'}`}>
            {busy
              ? 'Đang cập nhật cả khu vực…'
              : !picked
                ? 'Chọn một quản lý ở trên để tiếp tục.'
                : canApply
                  ? 'Một khu vực chỉ có một quản lý.'
                  : `${pickedManager ? nameOf(pickedManager) : 'Người này'} đã phụ trách khu vực này rồi — chọn người khác để đổi.`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              onClick={handleApply}
              disabled={busy || !canApply}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {changeCount > 0 ? `Áp dụng cho ${changeCount} nhà` : 'Gán phụ trách khu vực'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Overlay>
  );
};

/**
 * Hộp xác nhận GỠ quản lý khỏi khu vực.
 *
 * Cố tình dựng riêng thay vì `window.confirm`: hậu quả nặng hơn vẻ ngoài của một nút gỡ và
 * phải nói ra bằng số trước khi bấm — BE sẽ đẩy nhà từ ACTIVE về "chờ gán" và xoá người
 * phụ trách khỏi MỌI hợp đồng chưa chấm dứt, gồm cả hợp đồng đang có khách ở.
 */
const RemoveManagerModal = ({ group, mgrNames, impact, contractsKnown, registryGap, onClose, onDone, onSwitchToAssign }: {
  group: ZoneGroup;
  mgrNames: Map<string, string>;
  impact: RemovalImpact;
  contractsKnown: boolean;
  /** Khu vực chưa có bản ghi phân công ở BE → API gỡ sẽ trả 404, phải đăng ký trước. */
  registryGap: boolean;
  onClose: () => void;
  onDone: () => void;
  /** Chuyển sang hộp "Đổi quản lý" — lối đi đúng khi khu vực đang có khách thuê. */
  onSwitchToAssign: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);

  const managerName = group.managerName || mgrNames.get(group.managerId ?? '') || 'Quản lý hiện tại';
  const { assignable, liveProperties, active, pending, draft } = impact;
  /**
   * Chưa đăng ký phân công thì cũng không gỡ được: `DELETE /zones/{id}/manager` tra
   * `zone_managers` trước tiên, không có bản ghi là ném 404
   * *"Zone manager assignment not found for zone: ..."*. Chặn từ đây cho khỏi đâm vào lỗi
   * tiếng Anh khó hiểu.
   */
  const blocked = impact.blocked || registryGap;

  const handleRemove = async () => {
    setBusy(true);
    try {
      await zoneAssignmentService.remove(group.zoneId);
      toast.success(`Đã gỡ ${managerName} khỏi ${group.zoneName}. Khu vực này giờ chưa có quản lý.`);
      onDone();
    } catch (e: any) {
      const data = e?.response?.data;
      const raw = data?.message || data?.error || e?.message || '';
      // BE ném nguyên văn tiếng Anh khi bảng `zone_managers` không có bản ghi cho khu vực.
      const msg = /Zone manager assignment not found/i.test(raw)
        ? `${group.zoneName} chưa được đăng ký phân công nên không có gì để gỡ. Bấm "Gán quản lý" một lần để đăng ký trước.`
        : raw || 'Không gỡ được quản lý.';
      toast.error(msg, { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-6 py-5">
            <p className={`text-xs font-bold uppercase tracking-wide ${blocked ? 'text-slate-400' : 'text-rose-500'}`}>
              Gỡ quản lý khỏi khu vực
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-slate-950">
              <MapPin className={`h-5 w-5 ${blocked ? 'text-slate-400' : 'text-rose-500'}`} />
              {group.zoneName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Đang do <b className="text-slate-700">{managerName}</b> phụ trách
              {assignable.length > 0 && <> · {assignable.length} nhà</>}
            </p>
          </div>

          {registryGap ? (
            /* ── Chưa đăng ký phân công → API gỡ không có gì để xoá ──────── */
            <div className="space-y-3 px-6 py-5 text-sm">
              <p className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Chưa gỡ được — khu vực chưa đăng ký phân công
              </p>
              <p className="text-xs text-slate-600">
                Nhà ở đây mang tên {managerName} do gán lẻ từng căn, nên ở cấp khu vực không có gì để gỡ.
                Bấm <b>&quot;Gán quản lý&quot;</b> một lần (chọn lại chính {managerName} cũng được) rồi mới gỡ được.
              </p>
            </div>
          ) : blocked ? (
            /* ── Còn hợp đồng chưa kết thúc → không cho gỡ, chỉ đường sang "Đổi" ── */
            <div className="space-y-3 px-6 py-5">
              <p className="flex items-center gap-2 text-sm font-bold text-rose-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Không gỡ được — còn {active + pending + draft} hợp đồng
              </p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {active > 0 && <span className="rounded-lg bg-rose-50 px-2 py-1 font-semibold text-rose-700">{active} đang có khách ở</span>}
                {pending > 0 && <span className="rounded-lg bg-sky-50 px-2 py-1 font-semibold text-sky-700">{pending} chưa dọn vào</span>}
                {draft > 0 && <span className="rounded-lg bg-amber-50 px-2 py-1 font-semibold text-amber-700">{draft} chờ đón khách</span>}
              </div>
              {liveProperties.length > 0 && (
                <p className="truncate text-xs text-slate-500">
                  {liveProperties.slice(0, 3).map((p) => p.propertyName).join(' · ')}
                  {liveProperties.length > 3 && ` · +${liveProperties.length - 3} nhà`}
                </p>
              )}
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Gỡ là mọi hợp đồng trên mất người phụ trách. Hãy <b>đổi sang quản lý khác</b> — hợp đồng chuyển thẳng cho người mới.
              </p>
            </div>
          ) : (
            /* ── Không còn khách → cho gỡ, nêu đúng hệ quả ─────────────────── */
            <div className="space-y-3 px-6 py-5">
              <ul className="space-y-1.5 text-xs text-slate-600">
                {assignable.length > 0 ? (
                  <li>• <b>{assignable.length} nhà</b> về <b>chờ gán quản lý</b> cho tới khi có người mới</li>
                ) : (
                  <li>• Khu vực chưa có nhà đang khai thác — gỡ không ảnh hưởng gì</li>
                )}
                {contractsKnown && assignable.length > 0 && (
                  <li className="text-emerald-700">• Không còn hợp đồng nào — không ảnh hưởng khách thuê</li>
                )}
                <li className="text-slate-400">• Đã có người thay thì dùng &quot;Đổi quản lý&quot; thay vì gỡ</li>
              </ul>

              {!contractsKnown && (
                <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  <b>Chưa kiểm tra được hợp đồng</b> — nên tải lại trang trước khi gỡ.
                </p>
              )}

              {assignable.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Tôi hiểu {assignable.length} nhà sẽ tạm không có người phụ trách.</span>
                </label>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              {blocked ? 'Đóng' : 'Hủy'}
            </button>
            {blocked ? (
              <button
                onClick={onSwitchToAssign}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-indigo-700"
              >
                <UserCog className="h-4 w-4" /> Đổi quản lý
              </button>
            ) : (
              <button
                onClick={handleRemove}
                disabled={busy || (assignable.length > 0 && !ack)}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-rose-500/30 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Gỡ quản lý
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
};

// ── Một dòng khu vực + phần chi tiết mở rộng ─────────────────────────────────
const ZoneRow = ({ group, userMap, loads, mgrNames, canAssign, impact, registryGap, open, onToggle, onAssign, onRemove, tenants, tenantsKnown }: {
  group: ZoneGroup;
  /** propertyId → khách có hợp đồng chưa kết thúc. */
  tenants: Map<number, TenantLite[]>;
  /** false = không tải được hợp đồng → không kết luận "chưa có khách". */
  tenantsKnown: boolean;
  userMap: Map<string, UserResponse>;
  loads: Map<string, ManagerLoad>;
  /** id → tên hiển thị lấy từ danh sách tài khoản quản lý, dùng khi property trả tên rỗng. */
  mgrNames: Map<string, string>;
  /** Chỉ Host được gán/đổi; Admin xem thôi. */
  canAssign: boolean;
  /** Bán kính ảnh hưởng nếu gỡ quản lý — dùng để báo trước ngay trên nút Gỡ. */
  impact: RemovalImpact;
  /** Khu vực có quản lý trên nhà nhưng chưa có bản ghi phân công — nhà mới sẽ không tự gán. */
  registryGap: boolean;
  open: boolean;
  onToggle: () => void;
  onAssign: () => void;
  /** Gỡ quản lý — chỉ truyền khi vai hiện tại được phép sửa phân công. */
  onRemove?: () => void;
}) => {
  const meta = ZONE_STATE_META[group.state];
  const nameFor = (id?: string, fromProperty?: string) =>
    fromProperty || (id ? mgrNames.get(id) : undefined) || '—';

  // Khu vực có quản lý nhưng tài khoản người đó đang không dùng được → khu vực coi như
  // treo dù nhìn "đã gán". Đây là chỗ Admin cần thấy để nhắc Host đổi người.
  const brokenAccount = group.managerBreakdown.some((b) => !isUsableAccount(userMap.get(b.managerId)));
  // Nút vẫn bấm được để hộp thoại giải thích, chỉ làm nhạt đi để báo trước là sẽ không gỡ được.
  const removeBlocked = impact.blocked || registryGap;

  /*
   * Dòng phụ chỉ còn nói về KHU VỰC. Tên người phụ trách tách hẳn ra cột riêng bên
   * phải: đó là câu trả lời chính của cả trang này, mà bản cũ nhét nó vào cuối một
   * chuỗi "1 nhà · 1 đơn vị · QL: …" cỡ 12px màu xám — muốn biết ai quản khu nào
   * phải đọc hết từng dòng chứ không quét dọc được.
   */
  /** Số nhà trong khu vực đang mang ĐÚNG quản lý của khu vực — trả lời "người này giữ mấy căn ở đây". */
  const ownHouses = group.managerId
    ? group.properties.filter((p) => p.operationManagerId === group.managerId).length
    : 0;
  /** Nhà chưa mang id quản lý (thường đang chờ Host duyệt giá) — sẽ tự về tay người giữ khu vực. */
  const waitingHouses = group.properties.filter((p) => !p.operationManagerId).length;
  const occupied = occupiedIn(group.properties, tenants);

  const subtitle =
    group.assignableCount === 0
      ? 'không có nhà nào đổi quản lý được lúc này'
      : group.state === 'MIXED'
        ? `${group.managerBreakdown.length} quản lý đang lẫn nhau`
        : group.state === 'PARTIAL'
          ? `${group.unassignedCount} nhà chưa nhận quản lý`
          : registryGap ? 'chưa đăng ký phân công' : '';

  return (
    <div>
      <div className={`flex items-center gap-4 px-4 py-3 transition ${open ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <MapPin className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-bold text-slate-900">
              {group.zoneName}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              {brokenAccount && (
                <span
                  title="Tài khoản quản lý của khu vực này đang không hoạt động"
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700"
                >
                  <AlertTriangle className="h-3 w-3" /> QL ngưng hoạt động
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {group.properties.length} nhà · {group.units} đơn vị
              {tenantsKnown && (
                <span className={occupied > 0 ? 'font-semibold text-emerald-600' : ''}>
                  {' · '}{occupied > 0 ? `${occupied} khách đang ở` : 'chưa có khách ở'}
                </span>
              )}
              {subtitle && <span> · {subtitle}</span>}
              {group.blockedCount > 0 && group.assignableCount > 0 && (
                <span> · {group.blockedCount} nhà chưa đổi được</span>
              )}
            </p>
          </div>
        </button>

        {/* Người phụ trách — cột riêng, có avatar, để quét dọc cả danh sách là ra
            ngay ai quản khu nào. */}
        <div className="hidden min-w-0 shrink-0 items-center gap-2 md:flex md:w-52">
          {group.managerId ? (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white">
                {nameFor(group.managerId, group.managerName).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-700">
                  {nameFor(group.managerId, group.managerName)}
                </p>
                <p className="text-[11px] text-slate-400">
                  giữ <b className="text-slate-600">{ownHouses}/{group.properties.length}</b> nhà ở đây
                  {waitingHouses > 0 && ownHouses < group.properties.length && (
                    <span title="Nhà chưa nhận quản lý (thường đang chờ Host duyệt giá) — sẽ tự về tay người này">
                      {' '}· {waitingHouses} chờ nhận
                    </span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <UserRound className="h-4 w-4" /> Chưa có quản lý
            </span>
          )}
        </div>

        {canAssign ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onAssign}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                group.state === 'ASSIGNED'
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
              }`}
            >
              {group.state === 'ASSIGNED' ? 'Đổi quản lý' : group.state === 'MIXED' ? 'Chốt quản lý' : 'Gán quản lý'}
            </button>

            {/* GỠ QUẢN LÝ — để ngay hàng chính cho thấy được.
                Bản trước giấu trong hàng mở rộng, in 11px màu xám: người dùng gán nhầm rồi
                không tìm ra đường lùi. Một lối thoát mà không ai thấy thì coi như không có.
                An toàn đã được lo bằng hộp xác nhận (bán kính ảnh hưởng + bắt tick), nên ở
                đây chỉ cần khác biệt về sắc thái: viền nhạt, chữ đỏ, không phải nút đặc. */}
            {group.managerId && onRemove && (
              <button
                onClick={onRemove}
                title={
                  registryGap
                    ? 'Không gỡ được — khu vực chưa đăng ký phân công. Bấm "Gán quản lý" một lần trước.'
                    : impact.blocked
                      ? `Không gỡ được — khu vực còn ${impact.active + impact.pending + impact.draft} hợp đồng chưa kết thúc. Hãy đổi sang quản lý khác.`
                      : 'Gỡ quản lý — khu vực về trạng thái chưa gán'
                }
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                  removeBlocked
                    ? 'cursor-help border-slate-200 text-slate-300'
                    : 'border-slate-200 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
                }`}
              >
                Gỡ
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={onToggle}
            className="shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
          >
            {open ? 'Thu gọn' : 'Xem chi tiết'}
          </button>
        )}

        <button onClick={onToggle} className="shrink-0 p-1">
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-4 bg-slate-50/60 px-4 pb-4 pt-3">
          {/* Ai đang quản lý khu vực này */}
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quản lý phụ trách
            </p>
            {group.managerBreakdown.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
                <UserRound className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
                <p className="text-xs italic text-slate-400">
                  Khu vực chưa có quản lý — {group.properties.length} nhà đang chờ.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {group.managerBreakdown.map((b) => (
                  <div key={b.managerId}>
                    <ManagerCard
                      managerId={b.managerId}
                      managerName={nameFor(b.managerId, b.managerName)}
                      user={userMap.get(b.managerId)}
                      load={loads.get(b.managerId)}
                    />
                    {group.state === 'MIXED' && (
                      <p className="mt-1 px-1 text-[11px] font-semibold text-rose-600">
                        Đang giữ {b.count}/{group.assignableCount} nhà đổi được của khu vực này
                      </p>
                    )}
                  </div>
                ))}
                {registryGap && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <p className="flex items-center gap-2 text-xs font-black text-amber-900">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Khu vực chưa được đăng ký phân công
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                      Các nhà ở đây đang mang tên {nameFor(group.managerId, group.managerName)}, nhưng
                      khu vực <b>chưa có bản ghi phân công</b> — nên nhà mới host duyệt xong sẽ rơi vào{' '}
                      <b>&quot;Chờ gán quản lý&quot;</b> thay vì tự vào tay người này.
                      {canAssign
                        ? ' Bấm "Gán quản lý" một lần để đăng ký, các lần duyệt sau sẽ tự động.'
                        : ' Host cần bấm "Gán quản lý" một lần để đăng ký.'}
                    </p>
                  </div>
                )}
                {group.unassignedCount > 0 && (
                  <p className="px-1 text-[11px] font-semibold text-amber-600">
                    {group.unassignedCount} nhà trong khu vực chưa có quản lý.
                  </p>
                )}

                {/* GỠ QUẢN LÝ — thao tác phá, cố ý để ở vị trí phụ trong hàng mở rộng,
                    không đặt cạnh nút chính. Đa số trường hợp nên ĐỔI sang người mới chứ
                    không gỡ: gỡ là khách mất luôn đầu mối liên hệ. */}
                {/* Nút gỡ đã chuyển lên hàng chính cho dễ thấy — xem ghi chú ở đó. */}
              </div>
            )}
          </div>

          {/* Nhà bên trong */}
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nhà trong khu vực ({group.properties.length})
            </p>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {group.properties.map((p) => {
                const badge = STATUS_BADGE[p.status];
                const locked = !isAssignable(p);
                return (
                  <div
                    key={p.id}
                    title={locked ? 'Trạng thái này chưa đổi được quản lý' : undefined}
                    className={`rounded-xl p-3 ring-1 ${
                      locked ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        {p.propertyName}
                      </p>
                      {badge && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {p.shortAddress || p.fullAddress || '—'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="flex items-center gap-1 text-slate-500">
                        <DoorOpen className="h-3 w-3" />
                        {typeLabel(p)}{p.wholeHouse === false ? ` · ${p.totalRooms || 0} phòng` : ''}
                      </span>
                      <span className={`flex items-center gap-1 font-semibold ${
                        p.operationManagerId ? 'text-slate-600' : 'text-rose-500'
                      }`}>
                        <UserCog className="h-3 w-3" />
                        {p.operationManagerId
                          ? nameFor(p.operationManagerId, p.operationManagerName)
                          : 'Chưa có quản lý'}
                      </span>
                    </div>
                    <HouseTenants property={p} list={tenants.get(p.id) ?? []} known={tenantsKnown} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Khách đang thuê của một nhà ─────────────────────────────────────────────
/**
 * Chỉ hiện trong phần MỞ RỘNG của khu vực: danh sách chính giữ gọn để quét "ai giữ khu
 * nào", còn ai đang ở phòng nào là câu hỏi của người đã chọn xem một khu cụ thể.
 * Quá 3 khách thì gập bớt — nhà chia phòng 10 phòng không được đẩy cả lưới xuống.
 */
const HouseTenants = ({ property, list, known }: {
  property: PropertyResponse; list: TenantLite[]; known: boolean;
}) => {
  const [showAll, setShowAll] = useState(false);
  if (!known) return null;

  const active = list.filter((t) => t.status === 'ACTIVE');
  const split = property.wholeHouse === false && (property.totalRooms ?? 0) > 0;
  const occupiedRooms = new Set(active.map((t) => t.room).filter(Boolean)).size;
  const shown = showAll ? list : list.slice(0, 3);

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        <Users className="h-3 w-3" />
        {list.length === 0
          ? 'Chưa có khách'
          : split
            ? `Khách thuê · ${occupiedRooms}/${property.totalRooms} phòng có người ở`
            : `Khách thuê (${list.length})`}
      </p>
      {list.length > 0 && (
        <ul className="mt-1 space-y-1">
          {shown.map((t) => {
            const st = TENANT_STATUS[t.status];
            return (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-[4.5rem] shrink-0 whitespace-nowrap font-semibold text-slate-500">
                  {t.room ? `P.${t.room}` : 'Nguyên căn'}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800" title={t.phone}>
                  {t.name}
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                {t.endDate && (
                  <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">hết {fmtDate(t.endDate)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 text-[11px] font-bold text-indigo-600 hover:underline"
        >
          {showAll ? 'Thu gọn' : `Xem thêm ${list.length - 3} khách`}
        </button>
      )}
    </div>
  );
};

// ── Tổng quan theo quản lý: ai giữ khu vực nào, mấy căn ─────────────────────
/**
 * Trả lời thẳng câu hỏi chính của trang theo chiều NGƯỢC LẠI với danh sách khu vực:
 * danh sách bên dưới là "khu này ai giữ", khối này là "người này giữ những khu nào, mỗi
 * khu mấy căn". Bấm tên khu vực là nhảy xuống đúng dòng đó và mở ra.
 */
const ManagerOverview = ({ groups, managers, userMap, tenants, tenantsKnown, onOpenZone, onFilter, activeFilter }: {
  groups: ZoneGroup[];
  managers: ManagerItem[];
  userMap: Map<string, UserResponse>;
  tenants: Map<number, TenantLite[]>;
  tenantsKnown: boolean;
  onOpenZone: (zoneId: string) => void;
  onFilter: (managerId: string) => void;
  activeFilter: string;
}) => {
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => managers.map((m) => {
    const zones = groups
      .filter((g) => g.managerId === m.id || g.managerBreakdown.some((b) => b.managerId === m.id))
      .map((g) => {
        const own = g.properties.filter((p) => p.operationManagerId === m.id);
        // Nhà chưa có id quản lý sẽ tự về tay người GIỮ khu vực — tính riêng cho người đó.
        const waiting = g.managerId === m.id ? g.properties.filter((p) => !p.operationManagerId) : [];
        return { g, own: own.length, waiting: waiting.length, houses: [...own, ...waiting] };
      });
    const houses = zones.flatMap((z) => z.houses);
    return {
      m,
      zones,
      houseCount: zones.reduce((s, z) => s + z.own, 0),
      waitingCount: zones.reduce((s, z) => s + z.waiting, 0),
      units: houses.reduce((s, p) => s + unitsOf(p), 0),
      occupied: occupiedIn(houses, tenants),
    };
  })
    .filter((r) => r.zones.length > 0)
    .sort((a, b) => b.houseCount - a.houseCount || nameOf(a.m).localeCompare(nameOf(b.m), 'vi')),
  [groups, managers, tenants]);

  const unassignedZones = groups.filter((g) => !g.managerId);

  if (rows.length === 0 && unassignedZones.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
          <UserCog className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Phân công theo quản lý</p>
          <p className="text-xs text-slate-500">
            {rows.length} quản lý đang phụ trách{unassignedZones.length > 0 && ` · ${unassignedZones.length} khu vực chưa có người`}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const phone = userMap.get(r.m.id)?.phoneNumber;
            const on = activeFilter === r.m.id;
            return (
              <div
                key={r.m.id}
                className={`rounded-xl border p-3.5 transition ${on ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-200' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">
                    {nameOf(r.m).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{nameOf(r.m)}</p>
                    {phone && (
                      <p className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Phone className="h-3 w-3" />{phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onFilter(r.m.id)}
                    className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                      on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {on ? 'Bỏ lọc' : 'Chỉ xem'}
                  </button>
                </div>

                {/* Ba con số chính — nhìn là biết tải việc của người này */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-1.5">
                    <p className="text-base font-black tabular-nums text-slate-900">{r.houseCount}</p>
                    <p className="text-[10px] font-semibold text-slate-500">nhà</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-1.5">
                    <p className="text-base font-black tabular-nums text-slate-900">{r.units}</p>
                    <p className="text-[10px] font-semibold text-slate-500">đơn vị</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 py-1.5">
                    <p className="text-base font-black tabular-nums text-emerald-700">
                      {tenantsKnown ? r.occupied : '—'}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-700">khách đang ở</p>
                  </div>
                </div>

                {/* Khu vực người này giữ — mỗi chip một khu, kèm số căn của chính họ ở đó */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.zones.map((z) => (
                    <button
                      key={z.g.zoneId}
                      type="button"
                      onClick={() => onOpenZone(z.g.zoneId)}
                      title="Mở khu vực này bên dưới"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <MapPin className="h-3 w-3 text-indigo-500" />
                      {z.g.zoneName}
                      <span className="text-slate-400">· {z.own} nhà</span>
                      {z.waiting > 0 && <span className="text-amber-600">+{z.waiting} chờ</span>}
                    </button>
                  ))}
                </div>
                {r.waitingCount > 0 && (
                  <p className="mt-2 text-[10px] text-slate-400">
                    &quot;chờ&quot; = nhà chưa nhận quản lý (đang chờ Host duyệt giá), sẽ tự về tay người này.
                  </p>
                )}
              </div>
            );
          })}

          {unassignedZones.length > 0 && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
                <UserRound className="h-4 w-4" /> Chưa có quản lý
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unassignedZones.map((g) => (
                  <button
                    key={g.zoneId}
                    type="button"
                    onClick={() => onOpenZone(g.zoneId)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
                  >
                    <MapPin className="h-3 w-3" />{g.zoneName}
                    <span className="text-amber-500">· {g.properties.length} nhà</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Trang ────────────────────────────────────────────────────────────────────
export const ZoneOverview = ({ audience }: { audience: 'admin' | 'host' }) => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [userMap, setUserMap] = useState<Map<string, UserResponse>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [managerFilter, setManagerFilter] = useState<string>('all'); // 'all' | 'none' | managerId
  const [sortBy, setSortBy] = useState<SortKey>('todo');
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ZoneGroup | null>(null);
  /** Khu vực đang chờ xác nhận GỠ quản lý — mở hộp cảnh báo bán kính ảnh hưởng. */
  const [removing, setRemoving] = useState<ZoneGroup | null>(null);
  /**
   * Số hợp đồng còn hiệu lực của TỪNG NHÀ.
   *
   * Không thể suy khách thuê từ `property.status`: nhà chia phòng có khách vẫn mang
   * `ACTIVE`, chỉ từng PHÒNG mới lên `RENTED`. Đoán theo status là bỏ sót đúng loại nhà
   * đông khách nhất — nên phải đếm hợp đồng thật.
   */
  const [contractLoad, setContractLoad] = useState<Map<number, ContractLoad>>(new Map());
  /** false = chưa xác minh được hợp đồng (API lỗi) → không được kết luận "không có khách". */
  const [contractsKnown, setContractsKnown] = useState(false);
  /** propertyId → khách có hợp đồng chưa kết thúc (hiện trong chi tiết khu vực). */
  const [tenantsByProperty, setTenantsByProperty] = useState<Map<number, TenantLite[]>>(new Map());
  /**
   * Các khu vực CÓ BẢN GHI trong bảng phân công `zone_managers` (GET /zones/assignments).
   *
   * Khác với `group.managerId` — cái đó FE suy ra từ `operationManagerId` của từng nhà.
   * Hai thứ này lệch nhau được, và khi lệch thì việc tự gán quản lý lúc host duyệt nhà sẽ
   * không chạy (xem `registryGap` bên dưới).
   */
  const [registeredZones, setRegisteredZones] = useState<Set<string>>(new Set());
  /** zoneId → quản lý đang ĐĂNG KÝ phụ trách. Khác `group.managerId` (suy từ nhà đã duyệt). */
  const [registryManagerOf, setRegistryManagerOf] = useState<Map<string, string>>(new Map());
  /** false = chưa đọc được bảng phân công → không kết luận khu vực nào thiếu đăng ký. */
  const [registryKnown, setRegistryKnown] = useState(false);

  const canAssign = audience === 'host';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, propsRes] = await Promise.all([
        propertyService.getManagers(),
        propertyService.getAllProperties(),
      ]);
      setManagers(mgrs);
      setProperties(propsRes);

      // Bảng phân công thật. Cả Admin lẫn Host đều đọc được, và cả hai đều cần thấy khu vực
      // nào chưa đăng ký để biết vì sao nhà mới duyệt không tự vào tay ai.
      try {
        const assignments = await zoneAssignmentService.list();
        setRegisteredZones(new Set(assignments.map((a) => a.zoneId)));
        setRegistryManagerOf(new Map(assignments.map((a) => [a.zoneId, a.managerId])));
        setRegistryKnown(true);
      } catch {
        setRegisteredZones(new Set());
        setRegistryManagerOf(new Map());
        setRegistryKnown(false);
      }

      // Hợp đồng chưa kết thúc của từng nhà — vừa để đếm bán kính ảnh hưởng khi gỡ quản lý,
      // vừa để hiện ai đang thuê. Host đọc `/host/contracts`; Admin KHÔNG gọi được endpoint
      // đó nên đọc `/tenant-contracts`. Hai DTO khác tên trường → chuẩn hoá về TenantLite.
      try {
        const lite: (TenantLite & { propertyId: number })[] = canAssign
          ? (await hostService.listAllContracts())
            .filter((c) => c.propertyId != null && LIVE_STATUSES.has(c.status))
            .map((c) => ({
              id: String(c.id), propertyId: c.propertyId as number,
              name: c.lesseeName?.trim() || '(chưa có tên)', phone: c.tenantPhone,
              room: c.roomCode && c.roomCode !== 'NGUYEN_CAN' ? c.roomCode : undefined,
              status: c.status as TenantLite['status'], endDate: c.endDate,
            }))
          : ((await tenantService.listByStatus()) ?? [])
            .filter((c) => c.propertyId != null && LIVE_STATUSES.has(String(c.status)))
            .map((c) => ({
              id: String(c.id), propertyId: c.propertyId,
              name: c.tenantFullName?.trim() || '(chưa có tên)', phone: c.tenantPhone,
              room: c.roomNumber || undefined,
              status: String(c.status) as TenantLite['status'], endDate: c.endDate,
            }));

        const load = new Map<number, ContractLoad>();
        const byProp = new Map<number, TenantLite[]>();
        for (const t of lite) {
          const cur = load.get(t.propertyId) ?? { active: 0, pending: 0, draft: 0 };
          if (t.status === 'ACTIVE') cur.active += 1;
          else if (t.status === 'PENDING') cur.pending += 1;
          else cur.draft += 1;
          load.set(t.propertyId, cur);
          byProp.set(t.propertyId, [...(byProp.get(t.propertyId) ?? []), t]);
        }
        // Phòng tăng dần, nguyên căn đứng đầu — đọc như sơ đồ nhà.
        byProp.forEach((arr) => arr.sort((a, b) =>
          (a.room ?? '').localeCompare(b.room ?? '', 'vi', { numeric: true })));
        setContractLoad(load);
        setTenantsByProperty(byProp);
        setContractsKnown(true);
      } catch {
        setContractLoad(new Map());
        setTenantsByProperty(new Map());
        setContractsKnown(false); // hộp gỡ sẽ tự chuyển sang giọng "chưa xác minh được"
      }

      // SĐT / trạng thái tài khoản quản lý — host có thể không đủ quyền, không có thì thôi.
      try {
        const users = await userService.getAllUsers();
        const map = new Map<string, UserResponse>();
        users.filter((u) => u.role === 'ROLE_MANAGER').forEach((u) => map.set(u.id, u));
        setUserMap(map);
      } catch { /* bỏ qua — ManagerCard tự hiện ghi chú thiếu quyền */ }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Không tải được dữ liệu khu vực.');
    } finally {
      setLoading(false);
    }
  }, [canAssign]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const mgrNames = useMemo(
    () => new Map(managers.map((m) => [m.id, nameOf(m)])),
    [managers],
  );

  /**
   * Khu vực, có bù thêm BẢNG PHÂN CÔNG cho trường hợp chưa nhà nào mang quản lý.
   *
   * `groupByZone` suy quản lý từ `property.operationManagerId`, mà nhà chỉ nhận id đó SAU
   * khi Host duyệt giá. Nên ở đúng bước đầu của quy trình — admin vừa gửi nhà, Host gán
   * quản lý khu vực rồi mới đi duyệt — khu vực vẫn hiện "Chưa gán" dù vừa gán xong. Host
   * bấm gán, thấy không có gì đổi, tưởng hỏng.
   *
   * Chỉ bù khi **không có nhà nào đổi được** (`assignableCount === 0`): lúc đó bảng phân
   * công là nguồn tin duy nhất. Còn nếu có nhà đổi được mà chúng vẫn trống quản lý thì đó
   * là lệch thật giữa hai nơi — giữ nguyên để `registryGap` cảnh báo, đừng che đi.
   */
  const groups = useMemo(() => {
    const raw = groupByZone(properties);
    if (!registryKnown) return raw;
    return raw.map((g) => {
      const regId = registryManagerOf.get(g.zoneId);
      if (!regId || g.managerId || g.assignableCount > 0) return g;
      return {
        ...g,
        managerId: regId,
        managerName: mgrNames.get(regId) ?? '',
        managerBreakdown: [{ managerId: regId, managerName: mgrNames.get(regId) ?? '', count: 0 }],
        state: 'ASSIGNED' as const,
      };
    });
  }, [properties, registryKnown, registryManagerOf, mgrNames]);
  const loads = useMemo(() => loadByManager(groups), [groups]);

  /**
   * Quản lý có tài khoản nhưng KHÔNG phụ trách khu vực nào.
   *
   * Hay xuất hiện ngay sau một lần đổi quản lý: người bị thay ra rơi về 0 khu vực mà không
   * ai nhắc, nên cứ nằm đó không việc. Đây là "việc còn dang dở" của thao tác vừa rồi.
   */
  const idleManagers = useMemo(() => {
    const busyIds = new Set<string>();
    groups.forEach((g) => g.managerBreakdown.forEach((b) => busyIds.add(b.managerId)));
    return managers.filter((m) => !busyIds.has(m.id));
  }, [groups, managers]);

  /** Đếm khu vực theo trạng thái — hiện trên chip lọc. */
  const stateCounts = useMemo(() => {
    const acc: Record<string, number> = { all: groups.length };
    groups.forEach((g) => { acc[g.state] = (acc[g.state] ?? 0) + 1; });
    return acc;
  }, [groups]);

  /** Quản lý nào đang thực sự phụ trách khu vực — chỉ hiện những người này trong ô lọc. */
  const managersInUse = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => g.managerBreakdown.forEach((b) => ids.add(b.managerId)));
    return managers
      .filter((m) => ids.has(m.id))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'vi'));
  }, [groups, managers]);

  const filtered = useMemo(() => {
    const kw = normalizeVi(search.trim());
    const list = groups.filter((g) => {
      if (stateFilter !== 'all' && g.state !== stateFilter) return false;
      if (managerFilter === 'none') {
        if (g.managerBreakdown.length > 0 && g.unassignedCount === 0) return false;
      } else if (managerFilter !== 'all') {
        if (!g.managerBreakdown.some((b) => b.managerId === managerFilter)) return false;
      }
      if (kw) {
        const hay = [g.zoneName, ...g.managerBreakdown.map((b) => b.managerName || mgrNames.get(b.managerId) || '')]
          .map((v) => normalizeVi(String(v)))
          .join(' ');
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    // `groups` đã sắp sẵn theo mức ưu tiên xử lý — 'todo' giữ nguyên thứ tự đó.
    if (sortBy === 'todo') return list;
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'properties': return b.properties.length - a.properties.length;
        case 'units':      return b.units - a.units;
        default:           return a.zoneName.localeCompare(b.zoneName, 'vi');
      }
    });
  }, [groups, search, stateFilter, managerFilter, sortBy, mgrNames]);

  const mixedCount = stateCounts.MIXED ?? 0;
  const doneCount = stateCounts.ASSIGNED ?? 0;
  const waitingHouses = groups.reduce((s, g) => s + g.unassignedCount, 0);

  /**
   * Số chip trạng thái có dữ liệu, KHÔNG tính chip "Tất cả".
   *
   * Còn đúng một chip nghĩa là cả danh sách chung một trạng thái — lúc đó "Tất cả N"
   * và chip kia là cùng một tập, cùng một con số. Hàng chip không lọc được gì nữa.
   */
  const visibleStateChips = STATE_CHIPS.filter(
    (c) => c.key !== 'all' && (stateCounts[c.key] ?? 0) > 0,
  ).length;

  const filterCount =
    (stateFilter !== 'all' ? 1 : 0) + (managerFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);
  const resetFilters = () => { setStateFilter('all'); setManagerFilter('all'); setSearch(''); };

  /** Bấm thẻ thống kê = bật/tắt bộ lọc tương ứng. */
  const toggleState = (s: StateFilter) => setStateFilter((cur) => (cur === s ? 'all' : s));

  // Lấy lại khu vực đang mở từ `groups` để sau khi áp dụng xong + refetch thì
  // modal không giữ dữ liệu cũ.
  const assigningGroup = assigning ? groups.find((g) => g.zoneId === assigning.zoneId) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khu vực &amp; Quản lý</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mỗi quận/huyện do <b>một</b> quản lý vận hành phụ trách — gán cho khu vực là gán cho mọi nhà bên trong.
            {audience === 'admin' && ' Xem toàn hệ thống; việc gán/đổi quản lý do Host quyết định.'}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      </div>

      {/*
        Thống kê — bấm để lọc nhanh.

        Hai ô cảnh báo CHỈ dựng khi thật sự có việc. Mọi khu vực đã gán xong thì bản cũ
        vẫn chiếm nửa hàng để hiện hai số 0, cộng thêm "Đã gán xong 5" lặp y hệt
        "Tổng khu vực 5" — bốn ô to mà không ô nào nói được điều gì mới. Lọc theo một
        trạng thái đang rỗng cũng chẳng để làm gì, nên ẩn đi không mất chức năng nào.
      */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={MapPin} label="Tổng khu vực" value={groups.length} tone="indigo"
          active={stateFilter === 'all' && managerFilter === 'all'}
          onClick={resetFilters}
        />
        <StatCard
          icon={ShieldCheck}
          label={doneCount === groups.length ? 'Đều đã có quản lý' : 'Đã gán xong'}
          value={`${doneCount}/${groups.length}`} tone="emerald"
          active={stateFilter === 'ASSIGNED'} onClick={() => toggleState('ASSIGNED')}
        />
        {waitingHouses > 0 && (
          <StatCard
            icon={Building2} label="Nhà chờ quản lý" value={waitingHouses} tone="amber"
            active={managerFilter === 'none'}
            onClick={() => setManagerFilter((cur) => (cur === 'none' ? 'all' : 'none'))}
          />
        )}
        {mixedCount > 0 && (
          <StatCard
            icon={AlertTriangle} label="Khu vực cần chốt" value={mixedCount} tone="rose"
            active={stateFilter === 'MIXED'} onClick={() => toggleState('MIXED')}
          />
        )}
      </div>

      {/* Nhắc đối chiếu dữ liệu cũ */}
      {mixedCount > 0 && (
        <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="text-sm leading-relaxed text-rose-800">
            <p className="font-bold">{mixedCount} khu vực đang có nhiều quản lý</p>
            <p className="mt-0.5">
              Đây là nhà được gán tay từng căn trước đây. Mở từng khu vực bên dưới, chọn một quản lý cho cả
              vùng — hệ thống sẽ cho xem trước căn nào đổi người phụ trách trước khi áp dụng.
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <ManagerOverview
          groups={groups}
          managers={managers}
          userMap={userMap}
          tenants={tenantsByProperty}
          tenantsKnown={contractsKnown}
          activeFilter={managerFilter}
          onFilter={(id) => setManagerFilter((cur) => (cur === id ? 'all' : id))}
          onOpenZone={(zoneId) => {
            resetFilters();
            setOpenZone(zoneId);
            // Chờ React dựng lại danh sách (bộ lọc vừa xoá) rồi mới cuộn tới dòng.
            setTimeout(() => {
              document.getElementById(`zone-${zoneId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }}
        />
      )}

      {/* Tìm kiếm & bộ lọc */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên quận/huyện hoặc tên quản lý..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm font-medium outline-none transition placeholder:font-normal focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                title="Xóa từ khóa"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Lọc theo người phụ trách */}
          <div className="relative w-full sm:w-[230px]">
            <UserCog className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
            >
              <option value="all">Tất cả quản lý</option>
              <option value="none">Còn nhà chưa có quản lý</option>
              {managersInUse.map((m) => (
                <option key={m.id} value={m.id}>{nameOf(m)}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
          </div>

          {/* Sắp xếp */}
          <div className="relative w-full sm:w-[210px]">
            <ArrowDownWideNarrow className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-8 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
          </div>
        </div>

        {/* Quản lý đang rảnh — thường là việc còn sót lại sau một lần đổi quản lý */}
        {canAssign && idleManagers.length > 0 && (
          <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-800">
              <b>{idleManagers.length} quản lý chưa phụ trách khu vực nào</b>
              {' — '}{idleManagers.map((m) => nameOf(m)).join(', ')}.
              {(stateCounts.UNASSIGNED ?? 0) > 0
                ? ` Đang có ${stateCounts.UNASSIGNED} khu vực chưa có quản lý — cân nhắc gán cho họ.`
                : ' Mọi khu vực đều đã có người, nhưng những tài khoản này đang không có việc.'}
            </p>
          </div>
        )}

        {/* Chip trạng thái + nút xoá lọc.
            Cả danh sách cùng một trạng thái thì hàng chip chỉ còn "Tất cả N" và
            "<trạng thái đó> N" — hai chip cùng một con số, bấm cái nào cũng ra y
            hệt nhau. Ẩn cả hàng, không mất gì. */}
        <div className={`flex flex-wrap items-center gap-1.5 ${visibleStateChips <= 1 ? 'hidden' : ''}`}>
          {STATE_CHIPS.map((c) => {
            const count = stateCounts[c.key] ?? 0;
            if (c.key !== 'all' && count === 0) return null; // ẩn chip rỗng cho đỡ rối
            const on = stateFilter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setStateFilter(c.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  on ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.label}
                <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  on ? 'bg-white/25' : 'bg-white text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          {filterCount > 0 && (
            <button
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
            >
              <RotateCcw className="h-3 w-3" /> Xóa {filterCount} bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Danh sách khu vực */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-500">
          <MapPin className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm">
            {search
              ? `Không tìm thấy khu vực khớp "${search}"`
              : 'Chưa có nhà nào — khu vực sẽ hiện ở đây ngay khi admin gửi nhà cho Host duyệt giá.'}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden p-0">
          {filtered.map((g) => (
            <div key={g.zoneId} id={`zone-${g.zoneId}`} className="scroll-mt-20">
            <ZoneRow
              group={g}
              tenants={tenantsByProperty}
              tenantsKnown={contractsKnown}
              userMap={userMap}
              loads={loads}
              mgrNames={mgrNames}
              canAssign={canAssign}
              impact={removalImpact(g, contractLoad, contractsKnown)}
              registryGap={hasRegistryGap(g, registeredZones, registryKnown)}
              open={openZone === g.zoneId}
              onToggle={() => setOpenZone(openZone === g.zoneId ? null : g.zoneId)}
              onAssign={() => setAssigning(g)}
              onRemove={() => setRemoving(g)}
            />
            </div>
          ))}
        </div>
      )}

      {assigningGroup && canAssign && (
        <AssignModal
          group={assigningGroup}
          allGroups={groups}
          managers={managers}
          userMap={userMap}
          loads={loads}
          mgrNames={mgrNames}
          registeredManagerId={registryManagerOf.get(assigningGroup.zoneId)}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); fetchData(); }}
        />
      )}

      {removing && canAssign && (
        <RemoveManagerModal
          group={removing}
          mgrNames={mgrNames}
          impact={removalImpact(removing, contractLoad, contractsKnown)}
          contractsKnown={contractsKnown}
          registryGap={hasRegistryGap(removing, registeredZones, registryKnown)}
          onClose={() => setRemoving(null)}
          onDone={() => { setRemoving(null); fetchData(); }}
          onSwitchToAssign={() => { setAssigning(removing); setRemoving(null); }}
        />
      )}
    </div>
  );
};

export const HostZoneOverview = () => <ZoneOverview audience="host" />;
export const AdminZoneOverview = () => <ZoneOverview audience="admin" />;
