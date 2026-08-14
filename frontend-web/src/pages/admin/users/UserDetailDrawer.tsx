import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AtSign, Ban, Building2, CheckCircle2, ChevronDown, Copy, CreditCard, DoorOpen,
  FileText, Loader2, MapPin, Phone, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Overlay } from '@/components/Overlay';
import { MaskedField } from '@/components/MaskedField';
import { propertyService } from '@/services/property.service';
import { hostService, type HostContractDto } from '@/services/host.service';
import type { PropertyResponse, UserResponse } from '@/types/api.types';
import { STATUS_BADGE, typeLabel } from '@/pages/host/properties/propertyListState';
import { groupByZone, unitsOf, type ZoneGroup } from '@/pages/zones/zoneAssignmentState';
import { TenantContractTimeline, contractsOfTenant } from '@/components/TenantContractTimeline';
import { AssignmentHistoryButton } from '@/components/AssignmentHistoryPanel';

/**
 * Chi tiết một tài khoản cho Admin: người này đang giữ vai gì trong hệ thống
 * (manager phụ trách khu vực nào, host có bao nhiêu nhà & ai vận hành, khách thuê ở đâu).
 *
 * ⚠️ LỊCH SỬ phân công chưa có dữ liệu thật — BE chưa lưu vết
 * (xem doc/BE-NEED-zone-manager-assignment-2026-08-14.md). Nút "Xem lịch sử phân công"
 * mở cửa sổ nói rõ điều đó, KHÔNG dựng dữ liệu giả.
 */

const roleMap: Record<string, { label: string; color: string }> = {
  ROLE_ADMIN:   { label: 'Admin Hệ Thống', color: 'bg-slate-900 text-white' },
  ROLE_OWNER:   { label: 'Chủ Nhà',        color: 'bg-cyan-100 text-cyan-800' },
  ROLE_MANAGER: { label: 'Quản Lý',        color: 'bg-indigo-100 text-indigo-700' },
  ROLE_TENANT:  { label: 'Khách thuê',     color: 'bg-emerald-100 text-emerald-700' },
};

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE:   { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Chưa kích hoạt', color: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400' },
  PENDING:  { label: 'Chờ duyệt',      color: 'bg-amber-100 text-amber-800',     dot: 'bg-amber-500' },
  DISABLE:  { label: 'Vô hiệu hóa',    color: 'bg-rose-100 text-rose-700',       dot: 'bg-rose-500' },
};

// ── Ô số liệu (gọn, cân theo số cột) ─────────────────────────────────────────
const Metric = ({ icon: Icon, value, label }: {
  icon: typeof MapPin; value: number | string; label: string;
}) => (
  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
      <Icon className="h-4 w-4 text-indigo-500" />
    </div>
    <div className="min-w-0">
      <p className="text-lg font-black leading-none text-slate-900">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, children, action }: {
  icon: typeof MapPin; children: React.ReactNode; action?: React.ReactNode;
}) => (
  <div className="mb-2.5 flex items-center justify-between gap-2">
    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </p>
    {action}
  </div>
);

// ── Một khu vực (thu gọn) — bấm mới xổ danh sách nhà ─────────────────────────
const ZoneCard = ({ zone }: { zone: ZoneGroup }) => {
  // Mặc định ĐÓNG: một manager có thể giữ nhiều quận, mỗi quận cả chục nhà —
  // bung hết ngay từ đầu thì drawer dài lê thê, không nhìn ra được bức tranh chung.
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
      >
        <MapPin className="h-4 w-4 shrink-0 text-indigo-500" />
        <span className="truncate text-sm font-bold text-slate-900">{zone.zoneName}</span>
        <span className="ml-auto shrink-0 text-xs font-semibold text-slate-500">
          {zone.properties.length} nhà · {zone.units} đơn vị
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-slate-50 border-t border-slate-100">
          {zone.properties.map((p) => {
            const badge = STATUS_BADGE[p.status];
            return (
              <li key={p.id} className="flex items-center gap-2 px-3.5 py-2 text-xs">
                <Building2 className="h-3 w-3 shrink-0 text-slate-300" />
                <span className="truncate font-medium text-slate-700">{p.propertyName}</span>
                <span className="shrink-0 text-slate-400">
                  {typeLabel(p)}{p.wholeHouse === false ? ` · ${p.totalRooms || 0}p` : ''}
                </span>
                {badge && (
                  <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:     { label: 'Đang thuê',   cls: 'bg-emerald-100 text-emerald-700' },
  PENDING:    { label: 'Chờ xử lý',   cls: 'bg-amber-100 text-amber-700' },
  DRAFT:      { label: 'Nháp',        cls: 'bg-slate-100 text-slate-500' },
  EXPIRED:    { label: 'Hết hạn',     cls: 'bg-slate-100 text-slate-500' },
  TERMINATED: { label: 'Đã chấm dứt', cls: 'bg-rose-100 text-rose-600' },
};

/**
 * Hợp đồng trong phạm vi phụ trách — mặc định chỉ hiện một dòng tổng hợp.
 * Một manager giữ vài quận thì con số này lên hàng chục, bung sẵn ra là drawer ngập
 * toàn hợp đồng nháp, che mất phần khu vực vốn quan trọng hơn.
 */
const ContractsSection = ({ contracts }: { contracts: HostContractDto[] }) => {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    contracts.forEach((c) => byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1));
    // Đang thuê lên trước, phần còn lại theo số lượng giảm dần.
    return [...byStatus.entries()].sort((a, b) =>
      a[0] === 'ACTIVE' ? -1 : b[0] === 'ACTIVE' ? 1 : b[1] - a[1],
    );
  }, [contracts]);

  return (
    <section>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
        >
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="shrink-0 text-sm font-bold text-slate-900">
            Hợp đồng phụ trách
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {contracts.length}
          </span>

          {/* Tách theo trạng thái ngay trên dòng tiêu đề — không mở cũng nắm được */}
          <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {summary.map(([status, count]) => {
              const st = CONTRACT_STATUS[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
              return (
                <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                  {count} {st.label.toLowerCase()}
                </span>
              );
            })}
          </span>

          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="max-h-56 overflow-y-auto border-t border-slate-100">
            {contracts.map((c) => {
              const st = CONTRACT_STATUS[c.status] ?? { label: c.status, cls: 'bg-slate-100 text-slate-500' };
              return (
                <div key={c.id} className="flex items-center gap-2 border-b border-slate-50 px-3.5 py-2 text-xs last:border-0">
                  <span className="w-28 shrink-0 truncate font-medium text-slate-700">
                    {c.lesseeName || <span className="italic text-slate-400">Chưa có tên</span>}
                  </span>
                  <span className="truncate text-slate-500">{c.propertyName}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export const UserDetailDrawer = ({ user, displayName, onClose, onStatusChange }: {
  user: UserResponse;
  /** Tên thật đã tra được ở màn danh sách — BE không trả fullName trong UserResponse. */
  displayName?: string | null;
  onClose: () => void;
  onStatusChange: (id: string, status: 'ACTIVE' | 'DISABLE') => void;
}) => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [loading, setLoading] = useState(true);

  const role = user.role;
  const isManager = role === 'ROLE_MANAGER';
  const isOwner = role === 'ROLE_OWNER';
  const isTenant = role === 'ROLE_TENANT';

  const load = useCallback(async () => {
    setLoading(true);
    const [props, ctrs] = await Promise.all([
      propertyService.getProperties(0, 200).then((r) => r.content).catch(() => [] as PropertyResponse[]),
      // /host/contracts là endpoint của OWNER — admin có thể bị 403, khi đó bỏ phần hợp đồng.
      hostService.listContracts({ size: 500 }).then((p) => p.content).catch(() => [] as HostContractDto[]),
    ]);
    setProperties(props);
    setContracts(ctrs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, user.id]);

  /** Nhà người này đang phụ trách (manager) — nguồn của mọi số liệu bên dưới. */
  const managed = useMemo(
    () => (isManager ? properties.filter((p) => p.operationManagerId === user.id) : []),
    [isManager, properties, user.id],
  );

  const managedZones = useMemo(() => (isManager ? groupByZone(managed) : []), [isManager, managed]);

  /** Toàn hệ thống gom theo khu vực — dùng cho tài khoản Chủ Nhà. */
  const allZones = useMemo(() => (isOwner ? groupByZone(properties) : []), [isOwner, properties]);

  /** Hợp đồng liên quan: manager → HĐ của nhà mình; khách thuê → khớp theo SĐT. */
  const relatedContracts = useMemo(() => {
    if (isManager) {
      const ids = new Set(managed.map((p) => p.id));
      const names = new Set(managed.map((p) => p.propertyName));
      return contracts.filter((c) => (c.propertyId != null ? ids.has(c.propertyId) : names.has(c.propertyName)));
    }
    // BE không trả tenantUserId trên HĐ nên chỉ khớp được theo SĐT (dùng chung helper
    // với màn Khách thuê của Host để hai nơi không lệch cách ghép).
    if (isTenant) return contractsOfTenant(contracts, { phone: user.phoneNumber });
    return [];
  }, [isManager, isTenant, managed, contracts, user.phoneNumber]);

  const activeContracts = relatedContracts.filter((c) => c.status === 'ACTIVE');
  // Tài khoản không lưu CCCD — lấy từ hợp đồng gần nhất có dữ liệu.
  const tenantCccd = useMemo(
    () => (isTenant ? relatedContracts.find((c) => c.tenantCccd)?.tenantCccd : undefined),
    [isTenant, relatedContracts],
  );
  const roleInfo = roleMap[role] ?? { label: role, color: 'bg-slate-100 text-slate-700' };
  const statusInfo = statusMap[user.status] ?? statusMap.INACTIVE;
  const disabled = user.status !== 'ACTIVE';

  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-[620px] flex-col bg-slate-50 shadow-2xl">
        {/* ── Header ── */}
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-black text-white">
                {(displayName || user.username).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black leading-tight text-slate-950">
                  {displayName || user.username}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusInfo.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {/* Username thuộc thông tin TÀI KHOẢN nên nằm ở hàng này, không tranh chỗ với tên người dùng */}
              <span className="flex items-center gap-1">
                <AtSign className="h-3 w-3 text-slate-400" />
                {user.username}
              </span>
              <MaskedField value={user.phoneNumber} icon={Phone} emptyText="chưa có SĐT" head={3} tail={2} />
              {/* CCCD chỉ có ở khách thuê — lấy từ hợp đồng, tài khoản không lưu trường này */}
              {isTenant && (
                <MaskedField value={tenantCccd} icon={CreditCard} prefix="CCCD" emptyText="chưa có CCCD" head={3} tail={3} />
              )}
              {/* ID tài khoản — bấm để copy ĐẦY ĐỦ, dùng khi báo lỗi cho team BE. */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(user.id)
                    .then(() => toast.success('Đã copy ID tài khoản'))
                    .catch(() => toast.error('Trình duyệt chặn copy — bôi đen để chép tay.'));
                }}
                title={`Bấm để copy: ${user.id}`}
                className="inline-flex items-center gap-1 rounded font-mono text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <Copy className="h-3 w-3" />
                {user.id.slice(0, 8)}…
              </button>
            </div>
            {(isManager || isOwner) && (
              <AssignmentHistoryButton
                subjectName={`${user.username} · ${roleInfo.label}`}
                extraNote="Cần Backend bổ sung bảng lưu vết: thời điểm, khu vực, người cũ → người mới, ai thực hiện."
              />
            )}
          </div>
        </div>

        {/* ── Nội dung ── */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải dữ liệu vận hành…
            </div>
          ) : (
            <>
              {/* ── MANAGER ── */}
              {isManager && (
                <section>
                  <SectionTitle
                    icon={ShieldCheck}
                    action={
                      <Link to="/admin/zones/assignment" className="text-xs font-bold text-indigo-600 hover:underline">
                        Xem phân công →
                      </Link>
                    }
                  >
                    Khu vực đang phụ trách
                  </SectionTitle>

                  {managedZones.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                      <UserCog className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">Chưa được phân công khu vực</p>
                      <p className="mt-1 text-xs text-slate-400">Host gán tại màn Khu vực &amp; Quản lý.</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Metric icon={MapPin} value={managedZones.length} label="khu vực" />
                        <Metric icon={Building2} value={managed.length} label="nhà" />
                        <Metric icon={DoorOpen} value={managed.reduce((s, p) => s + unitsOf(p), 0)} label="đơn vị" />
                        <Metric icon={Users} value={activeContracts.length} label="khách đang thuê" />
                      </div>
                      <div className="space-y-2">
                        {managedZones.map((z) => <ZoneCard key={z.zoneId} zone={z} />)}
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* ── OWNER: toàn hệ thống, gom theo khu vực + ai vận hành ── */}
              {isOwner && (
                <section>
                  <SectionTitle icon={ShieldCheck}>Tài sản đang sở hữu</SectionTitle>

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <Metric icon={Building2} value={properties.length} label="bất động sản" />
                    <Metric icon={MapPin} value={allZones.length} label="khu vực" />
                    <Metric
                      icon={DoorOpen}
                      value={properties.reduce((s, p) => s + unitsOf(p), 0)}
                      label="đơn vị cho thuê"
                    />
                  </div>

                  <SectionTitle
                    icon={MapPin}
                    action={
                      <Link to="/admin/zones/assignment" className="text-xs font-bold text-indigo-600 hover:underline">
                        Xem phân công →
                      </Link>
                    }
                  >
                    Phân bố theo khu vực
                  </SectionTitle>

                  {allZones.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                      <Building2 className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">Chưa có bất động sản nào được duyệt giá</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {allZones.map((z) => (
                        <div
                          key={z.zoneId}
                          className="flex items-center gap-3 border-b border-slate-50 px-3.5 py-2.5 last:border-0"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          <span className="w-28 shrink-0 truncate text-sm font-bold text-slate-800">
                            {z.zoneName}
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {z.properties.length} nhà · {z.units} đơn vị
                          </span>
                          <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs">
                            <UserCog className="h-3 w-3 shrink-0 text-slate-300" />
                            {z.managerBreakdown.length === 0 ? (
                              <span className="font-semibold text-rose-500">Chưa có quản lý</span>
                            ) : z.managerBreakdown.length === 1 ? (
                              <span className="truncate font-semibold text-slate-600">
                                {z.managerName || '—'}
                              </span>
                            ) : (
                              <span className="font-semibold text-rose-600">
                                {z.managerBreakdown.length} quản lý
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── TENANT ── */}
              {isTenant && (
                <section>
                  <SectionTitle icon={FileText}>Dòng thời gian thuê</SectionTitle>
                  <TenantContractTimeline contracts={relatedContracts} />
                </section>
              )}

              {/* ── ADMIN ── */}
              {role === 'ROLE_ADMIN' && (
                <section>
                  <SectionTitle icon={ShieldCheck}>Đang giữ vai gì trong hệ thống</SectionTitle>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center">
                    <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                    <p className="text-sm font-bold text-slate-600">Quản trị toàn hệ thống</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
                      Tài khoản admin không gắn với khu vực hay bất động sản cụ thể.
                    </p>
                  </div>
                </section>
              )}

              {/* ── Hợp đồng thuộc phạm vi quản lý (manager) — thu gọn, bấm mới xổ ── */}
              {isManager && relatedContracts.length > 0 && (
                <ContractsSection contracts={relatedContracts} />
              )}
            </>
          )}
        </div>

        {/* ── Chân: hành động ── */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3.5">
          <p className="text-[11px] text-slate-400">
            {disabled ? 'Tài khoản đang không đăng nhập được.' : 'Tài khoản đang hoạt động bình thường.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Đóng
            </button>
            {disabled ? (
              <button
                onClick={() => onStatusChange(user.id, 'ACTIVE')}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" /> Kích hoạt
              </button>
            ) : (
              <button
                onClick={() => onStatusChange(user.id, 'DISABLE')}
                className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
              >
                <Ban className="h-4 w-4" /> Vô hiệu hóa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </Overlay>
  );
};
