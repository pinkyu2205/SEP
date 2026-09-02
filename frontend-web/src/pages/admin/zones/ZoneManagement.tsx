import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Plus, Trash2, Building2, Search, FileSpreadsheet,
  Pencil, Loader2, UserCog, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { zoneService } from '@/services/zone.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse, ZoneResponse, ZoneRequest } from '@/types/api.types';
import { ZoneFormModal } from './ZoneFormModal';
import { ZoneImportWizard } from './ZoneImportWizard';

/**
 * Danh mục khu vực (Tỉnh/TP → Quận/Huyện).
 *
 * Khu vực là đơn vị phân công quản lý vận hành: một quận chỉ có MỘT quản lý, và
 * mọi nhà trong quận theo người đó. Vì vậy bảng quận hiển thị luôn số nhà và ai
 * đang phụ trách — việc gán/đổi làm ở màn "Khu vực & Quản lý".
 *
 * Đã bỏ hoàn toàn phần toạ độ tâm / geocode (Goong): hệ thống không dùng toạ độ
 * khu vực cho việc gì, giữ lại chỉ làm rối màn hình và tốn quota bản đồ.
 */

/** Tóm tắt tình hình một quận, suy ra từ danh sách bất động sản. */
interface ZoneUsage {
  total: number;
  managerNames: string[];
  unassigned: number;
}

export const ZoneManagement = () => {
  const [provinces, setProvinces] = useState<ZoneResponse[]>([]);
  const [provinceCounts, setProvinceCounts] = useState<Record<string, number>>({});
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [districts, setDistricts] = useState<ZoneResponse[]>([]);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [search, setSearch] = useState('');

  const [formModal, setFormModal] = useState<
    { level: number; parentId: string | null; parentName?: string; editZone?: ZoneResponse | null } | null
  >(null);
  const [showImportWizard, setShowImportWizard] = useState(false);

  const fetchProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const roots = await zoneService.getRootZones();
      setProvinces(roots);
      const counts = await Promise.all(
        roots.map((p) => zoneService.getChildrenZones(p.id).then((c) => [p.id, c.length] as const)),
      );
      setProvinceCounts(Object.fromEntries(counts));
      if (roots.length > 0 && !selectedProvinceId) setSelectedProvinceId(roots[0].id);
    } catch {
      toast.error('Lỗi khi tải danh sách Tỉnh/Thành phố');
    } finally {
      setLoadingProvinces(false);
    }
  };

  const fetchDistricts = async (provinceId: string) => {
    setLoadingDistricts(true);
    try {
      const children = await zoneService.getChildrenZones(provinceId);
      setDistricts(children);
    } catch {
      toast.error('Lỗi khi tải danh sách Quận/Huyện');
    } finally {
      setLoadingDistricts(false);
    }
  };

  // Nhà chỉ dùng để hiển thị số liệu — hỏng thì bảng vẫn chạy, chỉ thiếu cột thống kê.
  const fetchProperties = async () => {
    try {
      const res = await propertyService.getAllProperties();
      setProperties(res);
    } catch { /* bỏ qua */ }
  };

  useEffect(() => { fetchProvinces(); fetchProperties(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedProvinceId) fetchDistricts(selectedProvinceId); }, [selectedProvinceId]);

  const refreshAll = async () => {
    await fetchProvinces();
    if (selectedProvinceId) await fetchDistricts(selectedProvinceId);
    await fetchProperties();
  };

  const selectedProvince = provinces.find((p) => p.id === selectedProvinceId);

  /** zoneId → số nhà + ai đang quản lý. */
  const usageByZone = useMemo(() => {
    const map = new Map<string, ZoneUsage>();
    properties.forEach((p) => {
      if (!p.zoneId) return;
      const cur = map.get(p.zoneId) ?? { total: 0, managerNames: [], unassigned: 0 };
      cur.total += 1;
      if (p.operationManagerId) {
        const label = p.operationManagerName || p.operationManagerId;
        if (!cur.managerNames.includes(label)) cur.managerNames.push(label);
      } else {
        cur.unassigned += 1;
      }
      map.set(p.zoneId, cur);
    });
    return map;
  }, [properties]);

  const filteredDistricts = search.trim()
    ? districts.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()))
    : districts;

  const handleCreateOrUpdate = async (data: ZoneRequest) => {
    if (!formModal) return;
    try {
      if (formModal.editZone) {
        await zoneService.updateZone(formModal.editZone.id, data);
        toast.success('Đã cập nhật khu vực');
      } else {
        await zoneService.createZone(data);
        toast.success('Thêm khu vực thành công!');
      }
      await refreshAll();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi lưu khu vực');
      throw error;
    }
  };

  const handleDeleteZone = async (id: string, isProvince: boolean) => {
    try {
      await zoneService.deleteZone(id);
      toast.success('Xóa khu vực thành công!');
      if (isProvince && id === selectedProvinceId) setSelectedProvinceId(null);
      await refreshAll();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa khu vực này (có thể đang chứa dữ liệu)');
    }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khu vực</h1>
          <p className="mt-1 text-sm text-slate-500">
            Danh mục tỉnh/thành và quận/huyện — dùng khi import bất động sản và phân công quản lý vận hành.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Excel
          </button>
          <button
            onClick={() => setFormModal({ level: 1, parentId: null })}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition-all hover:bg-indigo-700 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Thêm Tỉnh/Thành phố
          </button>
        </div>
      </div>

      {loadingProvinces ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-indigo-500" />
          <p className="text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : provinces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
            <MapPin className="h-8 w-8 text-indigo-300" />
          </div>
          <p className="font-semibold text-slate-600">Chưa có dữ liệu khu vực nào</p>
          <p className="mb-4 mt-1 text-sm text-slate-400">Hãy bắt đầu bằng Import Excel hoặc thêm Tỉnh/Thành phố mới.</p>
          <button
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Excel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
          {/* Cột trái — Tỉnh/TP */}
          <div className="space-y-1.5">
            {provinces.map((p) => (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => setSelectedProvinceId(p.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                    selectedProvinceId === p.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    selectedProvinceId === p.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {provinceCounts[p.id] ?? 0}
                  </span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Xoá ${p.name}? (không xoá được nếu còn quận/huyện hoặc bất động sản bên trong)`)) {
                      handleDeleteZone(p.id, true);
                    }
                  }}
                  title="Xoá tỉnh/thành phố"
                  className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-white text-slate-300 shadow ring-1 ring-slate-200 hover:text-rose-500 group-hover:flex"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Cột phải — Quận/Huyện */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
              <p className="text-sm font-bold text-slate-900">Quận / Huyện · {selectedProvince?.name}</p>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm quận..."
                    className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() =>
                    selectedProvinceId &&
                    setFormModal({ level: 2, parentId: selectedProvinceId, parentName: selectedProvince?.name })
                  }
                  disabled={!selectedProvinceId}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm Quận/Huyện
                </button>
              </div>
            </div>

            {loadingDistricts ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredDistricts.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                {districts.length === 0 ? 'Chưa có Quận/Huyện nào' : 'Không khớp kết quả.'}
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Quận</th>
                    <th className="px-5 py-3">Bất động sản</th>
                    <th className="px-5 py-3">Quản lý phụ trách</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDistricts.map((d) => {
                    const usage = usageByZone.get(d.id);
                    const managers = usage?.managerNames ?? [];
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50">
                              <Building2 className="h-3.5 w-3.5 text-cyan-500" />
                            </div>
                            <span className="font-medium text-slate-700">{d.name}</span>
                          </div>
                        </td>

                        <td className="px-5 py-3 text-sm text-slate-600">
                          {usage ? (
                            <>
                              <b className="tabular-nums text-slate-800">{usage.total}</b> nhà
                              {usage.unassigned > 0 && (
                                <span className="ml-1.5 text-xs text-amber-600">
                                  ({usage.unassigned} chưa gán)
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-5 py-3 text-sm">
                          {managers.length === 0 ? (
                            <span className="text-slate-400">Chưa có quản lý</span>
                          ) : managers.length === 1 ? (
                            <span className="flex items-center gap-1.5 font-medium text-slate-700">
                              <UserCog className="h-3.5 w-3.5 text-indigo-500" />
                              {managers[0]}
                            </span>
                          ) : (
                            // Sai quy tắc "1 quận 1 quản lý" — di sản của thời gán từng nhà.
                            <Link
                              to="/admin/zones/assignment"
                              className="flex items-center gap-1.5 font-semibold text-rose-600 hover:underline"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {managers.length} quản lý — cần chốt
                            </Link>
                          )}
                        </td>

                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() =>
                                setFormModal({
                                  level: 2,
                                  parentId: selectedProvinceId,
                                  parentName: selectedProvince?.name,
                                  editZone: d,
                                })
                              }
                              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Sửa
                            </button>
                            <button
                              onClick={() => { if (window.confirm(`Xóa ${d.name}?`)) handleDeleteZone(d.id, false); }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-500">
              Gán / đổi quản lý cho khu vực tại{' '}
              <Link to="/admin/zones/assignment" className="font-semibold text-indigo-600 hover:underline">
                Khu vực &amp; Quản lý
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      {formModal && (
        <ZoneFormModal
          // key ép remount mỗi lần đổi zone đang sửa/tạo — nếu không, component giữ
          // nguyên state cũ (useState lazy init chỉ chạy 1 lần ở lần mount đầu tiên),
          // dẫn tới bug modal "Sửa" không prefill khi bấm sửa zone khác.
          key={formModal.editZone?.id ?? `create-${formModal.level}-${formModal.parentId ?? 'root'}`}
          isOpen
          onClose={() => setFormModal(null)}
          onSubmit={handleCreateOrUpdate}
          level={formModal.level}
          parentId={formModal.parentId}
          parentName={formModal.parentName}
          editZone={formModal.editZone}
        />
      )}

      {showImportWizard && (
        <ZoneImportWizard onClose={() => setShowImportWizard(false)} onImported={() => { refreshAll(); }} />
      )}
    </div>
  );
};
