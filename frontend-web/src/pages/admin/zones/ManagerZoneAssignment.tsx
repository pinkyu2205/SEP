import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { managerZoneService } from '@/services/managerZone.service';
import { zoneService } from '@/services/zone.service';
import type { ManagerZonesResponse, ZoneResponse } from '@/types/api.types';
import { EmptyState, StatusPill } from '../shared';

const statusMap: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Đang hoạt động', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Chưa kích hoạt', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  PENDING: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  DISABLE: { label: 'Vô hiệu hóa', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

type AssignFilter = 'all' | 'assigned' | 'unassigned';

const ZONE_CHIP_LIMIT = 3;

// ─── Chip khu vực trên bảng list — hiện tối đa N, còn lại gộp +N ──────────────
const ZoneChips = ({ zones, onOpen }: { zones: ZoneResponse[]; onOpen: () => void }) => {
  if (zones.length === 0) {
    return <span className="text-sm font-medium text-slate-400">Chưa gán khu vực</span>;
  }
  const shown = zones.slice(0, ZONE_CHIP_LIMIT);
  const rest = zones.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((z) => (
        <span key={z.id} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          {z.fullName}
        </span>
      ))}
      {rest > 0 && (
        <button
          onClick={onOpen}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
        >
          +{rest}
        </button>
      )}
    </div>
  );
};

// ─── Drawer gán khu vực cho 1 manager — picker 2 cấp Tỉnh → Quận/Huyện ───────
const AssignZoneDrawer = ({
  manager,
  onClose,
  onSaved,
}: {
  manager: ManagerZonesResponse;
  onClose: () => void;
  onSaved: (updated: ManagerZonesResponse) => void;
}) => {
  const [provinces, setProvinces] = useState<ZoneResponse[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [activeProvinceId, setActiveProvinceId] = useState<string | null>(null);
  const [districtsByProvince, setDistrictsByProvince] = useState<Record<string, ZoneResponse[]>>({});
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [districtSearch, setDistrictSearch] = useState('');

  // Map id -> ZoneResponse cho toàn bộ zone đang được chọn (để hiện chip đúng
  // fullName kể cả khi tỉnh đó không phải tỉnh đang xem trong picker).
  const [selectedZones, setSelectedZones] = useState<Map<string, ZoneResponse>>(
    () => new Map(manager.zones.map((z) => [z.id, z])),
  );
  const [saving, setSaving] = useState(false);

  const originalIds = useMemo(() => new Set(manager.zones.map((z) => z.id)), [manager.zones]);
  const dirty = useMemo(() => {
    if (selectedZones.size !== originalIds.size) return true;
    for (const id of selectedZones.keys()) if (!originalIds.has(id)) return true;
    return false;
  }, [selectedZones, originalIds]);

  useEffect(() => {
    let cancelled = false;
    setLoadingProvinces(true);
    zoneService
      .getRootZones()
      .then((data) => {
        if (cancelled) return;
        setProvinces(data);
        // Mở sẵn tỉnh đầu tiên trong các zone đã gán (nếu có), để admin thấy ngay context.
        const firstAssignedProvince = manager.zones.find((z) => z.parentId)?.parentId ?? data[0]?.id ?? null;
        setActiveProvinceId(firstAssignedProvince);
      })
      .catch(() => toast.error('Không tải được danh sách khu vực. Thử lại.'))
      .finally(() => !cancelled && setLoadingProvinces(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeProvinceId || districtsByProvince[activeProvinceId]) return;
    let cancelled = false;
    setLoadingDistricts(true);
    zoneService
      .getChildrenZones(activeProvinceId)
      .then((data) => {
        if (!cancelled) setDistrictsByProvince((prev) => ({ ...prev, [activeProvinceId]: data }));
      })
      .catch(() => toast.error('Không tải được danh sách khu vực. Thử lại.'))
      .finally(() => !cancelled && setLoadingDistricts(false));
    return () => { cancelled = true; };
  }, [activeProvinceId, districtsByProvince]);

  const districts = activeProvinceId ? districtsByProvince[activeProvinceId] ?? [] : [];
  const filteredDistricts = districtSearch.trim()
    ? districts.filter((d) => d.name.toLowerCase().includes(districtSearch.trim().toLowerCase()))
    : districts;

  const toggleZone = (zone: ZoneResponse) => {
    setSelectedZones((prev) => {
      const next = new Map(prev);
      if (next.has(zone.id)) next.delete(zone.id);
      else next.set(zone.id, zone);
      return next;
    });
  };

  const selectAllInProvince = () => {
    setSelectedZones((prev) => {
      const next = new Map(prev);
      districts.forEach((d) => next.set(d.id, d));
      return next;
    });
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Đóng và hủy?')) return;
    onClose();
  };

  const handleClearAll = async () => {
    if (!window.confirm(`Gỡ toàn bộ khu vực phụ trách của ${manager.fullName}?`)) return;
    setSaving(true);
    try {
      const updated = await managerZoneService.assignZones(manager.managerId, { zoneIds: [] });
      toast.success(`Đã gỡ toàn bộ khu vực của ${manager.fullName}`);
      onSaved(updated);
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Không tải được danh sách khu vực. Thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await managerZoneService.assignZones(manager.managerId, {
        zoneIds: [...selectedZones.keys()],
      });
      toast.success(`Đã cập nhật khu vực cho ${manager.fullName}`);
      onSaved(updated);
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Lưu thất bại, thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = statusMap[manager.status] ?? statusMap.INACTIVE;
  const selectedList = [...selectedZones.values()];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <div className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-950">Gán khu vực</h2>
            <p className="mt-1 truncate text-sm text-slate-600">
              {manager.fullName} · {manager.phoneNumber} ·{' '}
              <span className={`font-semibold ${statusInfo.color.includes('rose') ? 'text-rose-600' : 'text-slate-500'}`}>
                {statusInfo.label}
              </span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">Đang chọn: {selectedZones.size} khu vực</p>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {manager.status !== 'ACTIVE' && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
            Tài khoản đang không hoạt động — vẫn có thể gán khu vực.
          </div>
        )}

        {/* Đã chọn */}
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Đã chọn</p>
          {selectedList.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa chọn khu vực nào.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((z) => (
                <span
                  key={z.id}
                  className="flex items-center gap-1 rounded-full bg-indigo-100 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-indigo-700"
                >
                  {z.fullName}
                  <button onClick={() => toggleZone(z)} className="rounded-full p-0.5 hover:bg-indigo-200">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Picker 2 cấp */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Tỉnh / Thành phố</p>
          {loadingProvinces ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {provinces.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProvinceId(p.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    activeProvinceId === p.id
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Quận / Huyện</p>
            {districts.length > 0 && (
              <button onClick={selectAllInProvince} className="text-xs font-bold text-indigo-600 hover:underline">
                Chọn tất cả quận trong tỉnh này
              </button>
            )}
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={districtSearch}
              onChange={(e) => setDistrictSearch(e.target.value)}
              placeholder="Lọc quận..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="mt-3 space-y-1">
            {loadingDistricts ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
              </div>
            ) : filteredDistricts.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">
                {activeProvinceId ? 'Không khớp kết quả.' : 'Chọn 1 tỉnh/thành phố để xem quận/huyện.'}
              </p>
            ) : (
              filteredDistricts.map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedZones.has(d.id)}
                    onChange={() => toggleZone(d)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {d.name}
                </label>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={handleClearAll}
            disabled={saving || manager.zones.length === 0}
            className="flex items-center gap-1.5 text-sm font-bold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Gỡ hết
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ManagerZoneAssignment = () => {
  const [managers, setManagers] = useState<ManagerZonesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AssignFilter>('all');
  const [activeManager, setActiveManager] = useState<ManagerZonesResponse | null>(null);

  const fetchManagers = async () => {
    setLoading(true);
    try {
      const data = await managerZoneService.listManagersWithZones();
      setManagers(data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Không tải được danh sách quản lý.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchManagers(); }, []);

  const filtered = useMemo(() => {
    let list = managers;
    if (filter === 'assigned') list = list.filter((m) => m.zones.length > 0);
    if (filter === 'unassigned') list = list.filter((m) => m.zones.length === 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.phoneNumber?.toLowerCase().includes(q) ||
          m.username?.toLowerCase().includes(q),
      );
    }
    // Chưa gán lên trên trước (ưu tiên việc admin cần làm), rồi theo tên.
    return [...list].sort((a, b) => {
      const aUnassigned = a.zones.length === 0;
      const bUnassigned = b.zones.length === 0;
      if (aUnassigned !== bUnassigned) return aUnassigned ? -1 : 1;
      return a.fullName.localeCompare(b.fullName, 'vi');
    });
  }, [managers, search, filter]);

  const handleSaved = (updated: ManagerZonesResponse) => {
    setManagers((prev) => prev.map((m) => (m.managerId === updated.managerId ? updated : m)));
    setActiveManager(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khu vực Manager</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gán quận/huyện phụ trách cho từng quản lý vận hành — dùng để gợi ý manager gần khi import/đón khách.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên / SĐT..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ['all', 'Tất cả'],
              ['assigned', 'Đã gán'],
              ['unassigned', 'Chưa gán'],
            ] as [AssignFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-xl border px-3.5 py-2 text-sm font-bold transition ${
                filter === value
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : managers.length === 0 ? (
          <div className="p-5">
            <EmptyState text="Chưa có tài khoản quản lý vận hành — tạo manager trước tại màn User." />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState text="Không khớp kết quả." />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Manager</th>
                <th className="px-5 py-3">SĐT</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3">Khu vực phụ trách</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => {
                const statusInfo = statusMap[m.status] ?? statusMap.INACTIVE;
                return (
                  <tr key={m.managerId} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                          <UserRound className="h-4 w-4 text-indigo-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{m.fullName}</p>
                          <p className="truncate text-xs text-slate-400">{m.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{m.phoneNumber}</td>
                    <td className="px-5 py-4">
                      <StatusPill label={statusInfo.label} color={statusInfo.color} dot={statusInfo.dot} />
                    </td>
                    <td className="px-5 py-4">
                      <ZoneChips zones={m.zones} onOpen={() => setActiveManager(m)} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setActiveManager(m)}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      >
                        {m.zones.length > 0 ? 'Đổi khu vực' : 'Gán khu vực'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {activeManager && (
        <AssignZoneDrawer manager={activeManager} onClose={() => setActiveManager(null)} onSaved={handleSaved} />
      )}
    </div>
  );
};
