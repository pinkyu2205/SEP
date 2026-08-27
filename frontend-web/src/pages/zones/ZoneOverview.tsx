import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownWideNarrow, ArrowRight, Building2, Check, ChevronDown, DoorOpen,
  Loader2, MapPin, Phone, RefreshCw, RotateCcw, Search, ShieldCheck, UserCog, UserRound, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '@/services/property.service';
import { userService } from '@/services/user.service';
import type { PropertyResponse, UserResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import { Overlay } from '@/components/Overlay';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
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
  group, managers, userMap, loads, mgrNames, onClose, onDone,
}: {
  group: ZoneGroup;
  managers: ManagerItem[];
  userMap: Map<string, UserResponse>;
  loads: Map<string, ManagerLoad>;
  mgrNames: Map<string, string>;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [picked, setPicked] = useState<string>(group.managerId ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const preview = useMemo(() => (picked ? previewAssign(group, picked) : null), [group, picked]);
  const pickedManager = managers.find((m) => m.id === picked);

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
   * MỘT lệnh cho cả khu vực. Bản trước gọi lặp `PATCH /properties/{id}/operation-manager`
   * cho từng nhà vì BE chưa có API gán theo lô — chết giữa chừng là khu vực nửa nạc nửa mỡ.
   * BE đã làm endpoint atomic (15/08/2026): đổi bảng phân công + mọi nhà + hợp đồng trong
   * một transaction, và trả về số nhà/hợp đồng đã ảnh hưởng.
   */
  const handleApply = async () => {
    if (!preview || !pickedManager || changeCount === 0) return;
    setProgress({ done: 0, total: changeCount });
    try {
      const res = await zoneAssignmentService.assign(group.zoneId, pickedManager.id);
      const parts = [`${res.affectedProperties} nhà`];
      if (res.affectedContracts > 0) parts.push(`${res.affectedContracts} hợp đồng`);
      toast.success(`Đã gán ${nameOf(pickedManager)} cho ${group.zoneName} — ${parts.join(' · ')}.`);
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
              {group.properties.length} nhà · {group.units} đơn vị cho thuê — toàn bộ sẽ do một quản lý phụ trách.
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Khu vực đang lẫn nhiều quản lý — nói rõ để người dùng biết đang chốt cái gì */}
          {group.state === 'MIXED' && (
            <div className="mb-5 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div className="text-xs leading-relaxed text-rose-800">
                <p className="font-bold">Khu vực này đang có {group.managerBreakdown.length} quản lý</p>
                <p className="mt-0.5">
                  {group.managerBreakdown
                    .map((b) => `${b.managerName || mgrNames.get(b.managerId) || '—'} (${b.count} nhà)`)
                    .join(' · ')}
                  {group.unassignedCount > 0 && ` · chưa gán (${group.unassignedCount} nhà)`}
                </p>
                <p className="mt-1">Đây là dữ liệu cũ từ thời gán từng căn. Chọn một người cho cả khu vực.</p>
              </div>
            </div>
          )}

          {/* Chọn quản lý */}
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Chọn quản lý</p>
          {managers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
              Chưa có tài khoản quản lý vận hành nào.
            </p>
          ) : (
            <div className="space-y-1.5">
              {managers.map((m) => {
                const load = loads.get(m.id);
                const on = picked === m.id;
                const phone = userMap.get(m.id)?.phoneNumber;
                return (
                  <button
                    key={m.id}
                    onClick={() => setPicked(m.id)}
                    disabled={busy}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-50 ${
                      on ? 'border-indigo-600 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {nameOf(m).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{nameOf(m)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {phone ? `${phone} · ` : ''}
                        {load
                          ? `đang giữ ${load.zones} khu vực · ${load.properties} nhà · ${load.units} đơn vị`
                          : 'chưa phụ trách khu vực nào'}
                      </p>
                    </div>
                    {on && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Xem trước thay đổi */}
          {preview && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                Sẽ thay đổi những gì
              </p>

              {changeCount === 0 && preview.blocked.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Cả khu vực đã do {pickedManager ? nameOf(pickedManager) : 'người này'} phụ trách — không có gì để đổi.
                </p>
              ) : (
                <div className="space-y-3">
                  {changeCount === 0 && (
                    <p className="text-sm text-slate-500">
                      Không có nhà nào đổi được lúc này.
                    </p>
                  )}

                  {preview.unchanged.length > 0 && (
                    <p className="text-xs text-slate-500">
                      <span className="font-bold text-slate-700">{preview.unchanged.length} nhà</span> giữ nguyên.
                    </p>
                  )}

                  {preview.fresh.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-emerald-700">
                        Gán mới — {preview.fresh.length} nhà chưa có quản lý
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {preview.fresh.map((p) => (
                          <li key={p.id} className="truncate text-xs text-slate-600">· {p.propertyName}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {preview.blocked.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500">
                        Chưa đổi được — {preview.blocked.length} nhà
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {preview.blocked.map((p) => (
                          <li key={p.id} className="truncate text-xs text-slate-500">
                            · {p.propertyName}
                            <span className="ml-1 text-slate-400">
                              ({STATUS_BADGE[p.status]?.label ?? p.status})
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600">
                        Hệ thống chỉ đổi quản lý được khi nhà đang hoạt động, đã cho thuê hoặc
                        chờ gán. Số nhà này giữ quản lý cũ — quay lại đây gán tiếp khi nhà hoạt động lại.
                      </p>
                    </div>
                  )}

                  {preview.handover.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-700">
                        Bàn giao — {preview.handover.length} nhà đổi người phụ trách
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {preview.handover.map((p) => (
                          <li key={p.id} className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                            · {p.propertyName}
                            <span className="text-slate-400">
                              {p.operationManagerName || mgrNames.get(p.operationManagerId ?? '') || '—'}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                            <span className="font-semibold text-slate-700">
                              {pickedManager ? nameOf(pickedManager) : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                        Hợp đồng, hoá đơn và việc đang dở của {preview.handover.length} nhà này sẽ do quản lý mới
                        làm tiếp. Lịch sử cũ vẫn ghi tên người đã làm.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cảnh báo tải — chỉ nhắc, không chặn */}
          {overloaded && projected && (
            <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-amber-800">
                Sau khi gán, {pickedManager ? nameOf(pickedManager) : 'quản lý này'} sẽ phụ trách{' '}
                <b>{projected.properties} nhà · {projected.units} đơn vị</b> — vượt mức khuyến nghị
                ({WARN_PROPERTIES_PER_MANAGER} nhà / {WARN_ROOMS_PER_MANAGER} đơn vị). Vẫn gán được, nhưng
                cân nhắc tách khu vực hoặc chia bớt cho người khác.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-400">
            {busy ? 'Đang cập nhật cả khu vực…' : 'Một khu vực chỉ có một quản lý.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              onClick={handleApply}
              disabled={busy || !picked || changeCount === 0}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {changeCount > 0 ? `Áp dụng cho ${changeCount} nhà` : 'Không có thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Overlay>
  );
};

// ── Một dòng khu vực + phần chi tiết mở rộng ─────────────────────────────────
const ZoneRow = ({ group, userMap, loads, mgrNames, canAssign, open, onToggle, onAssign }: {
  group: ZoneGroup;
  userMap: Map<string, UserResponse>;
  loads: Map<string, ManagerLoad>;
  /** id → tên hiển thị lấy từ danh sách tài khoản quản lý, dùng khi property trả tên rỗng. */
  mgrNames: Map<string, string>;
  /** Chỉ Host được gán/đổi; Admin xem thôi. */
  canAssign: boolean;
  open: boolean;
  onToggle: () => void;
  onAssign: () => void;
}) => {
  const meta = ZONE_STATE_META[group.state];
  const nameFor = (id?: string, fromProperty?: string) =>
    fromProperty || (id ? mgrNames.get(id) : undefined) || '—';

  // Khu vực có quản lý nhưng tài khoản người đó đang không dùng được → khu vực coi như
  // treo dù nhìn "đã gán". Đây là chỗ Admin cần thấy để nhắc Host đổi người.
  const brokenAccount = group.managerBreakdown.some((b) => !isUsableAccount(userMap.get(b.managerId)));

  const subtitle =
    group.assignableCount === 0
      ? 'không có nhà nào đổi quản lý được lúc này'
      : group.state === 'UNASSIGNED'
        ? 'chưa có quản lý'
        : group.state === 'MIXED'
          ? `${group.managerBreakdown.length} quản lý đang lẫn nhau`
          : `QL: ${nameFor(group.managerId, group.managerName)}${
              group.state === 'PARTIAL' ? ` · ${group.unassignedCount} nhà chưa nhận` : ''
            }`;

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
              {group.properties.length} nhà · {group.units} đơn vị · {subtitle}
              {group.blockedCount > 0 && group.assignableCount > 0 && (
                <span className="text-slate-400"> · {group.blockedCount} nhà chưa đổi được</span>
              )}
            </p>
          </div>
        </button>

        {canAssign ? (
          <button
            onClick={onAssign}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              group.state === 'ASSIGNED'
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
            }`}
          >
            {group.state === 'ASSIGNED' ? 'Đổi quản lý' : group.state === 'MIXED' ? 'Chốt quản lý' : 'Gán quản lý'}
          </button>
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
                {group.unassignedCount > 0 && (
                  <p className="px-1 text-[11px] font-semibold text-amber-600">
                    {group.unassignedCount} nhà trong khu vực chưa có quản lý.
                  </p>
                )}
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

  const canAssign = audience === 'host';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, propsRes] = await Promise.all([
        propertyService.getManagers(),
        propertyService.getProperties(0, 200),
      ]);
      setManagers(mgrs);
      setProperties(propsRes.content);

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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = useMemo(() => groupByZone(properties), [properties]);
  const loads = useMemo(() => loadByManager(groups), [groups]);
  const mgrNames = useMemo(
    () => new Map(managers.map((m) => [m.id, nameOf(m)])),
    [managers],
  );

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

      {/* Thống kê — bấm để lọc nhanh */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={MapPin} label="Tổng khu vực" value={groups.length} tone="indigo"
          active={stateFilter === 'all' && managerFilter === 'all'}
          onClick={resetFilters}
        />
        <StatCard
          icon={ShieldCheck} label="Đã gán xong" value={doneCount} tone="emerald"
          active={stateFilter === 'ASSIGNED'} onClick={() => toggleState('ASSIGNED')}
        />
        <StatCard
          icon={Building2} label="Nhà chờ quản lý" value={waitingHouses} tone="amber"
          active={managerFilter === 'none'}
          onClick={() => setManagerFilter((cur) => (cur === 'none' ? 'all' : 'none'))}
        />
        <StatCard
          icon={AlertTriangle} label="Khu vực cần chốt" value={mixedCount} tone="rose"
          active={stateFilter === 'MIXED'} onClick={() => toggleState('MIXED')}
        />
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

        {/* Chip trạng thái + nút xoá lọc */}
        <div className="flex flex-wrap items-center gap-1.5">
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
              : 'Chưa có nhà nào được duyệt giá — khu vực sẽ hiện ở đây sau khi Host duyệt giá.'}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden p-0">
          {filtered.map((g) => (
            <ZoneRow
              key={g.zoneId}
              group={g}
              userMap={userMap}
              loads={loads}
              mgrNames={mgrNames}
              canAssign={canAssign}
              open={openZone === g.zoneId}
              onToggle={() => setOpenZone(openZone === g.zoneId ? null : g.zoneId)}
              onAssign={() => setAssigning(g)}
            />
          ))}
        </div>
      )}

      {assigningGroup && canAssign && (
        <AssignModal
          group={assigningGroup}
          managers={managers}
          userMap={userMap}
          loads={loads}
          mgrNames={mgrNames}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); fetchData(); }}
        />
      )}
    </div>
  );
};

export const HostZoneOverview = () => <ZoneOverview audience="host" />;
export const AdminZoneOverview = () => <ZoneOverview audience="admin" />;
