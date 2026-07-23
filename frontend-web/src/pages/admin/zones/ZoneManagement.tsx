import { useEffect, useState } from 'react';
import {
  MapPin, Plus, Trash2, Building2, Search, FileSpreadsheet, Sparkles,
  Pencil, Loader2, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { zoneService } from '@/services/zone.service';
import type { ZoneResponse, ZoneRequest, ZoneGeocodeBatchResponse } from '@/types/api.types';
import { ZoneFormModal } from './ZoneFormModal';
import { ZoneImportWizard } from './ZoneImportWizard';

const isMissingCoords = (z: ZoneResponse) => z.level === 2 && (z.latitude == null || z.longitude == null);

// ─── Modal geocode hàng loạt — phạm vi Tỉnh đang chọn / Toàn hệ thống ────────
const BulkGeocodeModal = ({
  defaultParentId,
  defaultParentName,
  onClose,
  onDone,
}: {
  defaultParentId: string | null;
  defaultParentName?: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [scope, setScope] = useState<'province' | 'all'>(defaultParentId ? 'province' : 'all');
  const [force, setForce] = useState(false);
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ZoneGeocodeBatchResponse | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await zoneService.geocodeMissingCenters({
        parentId: scope === 'province' ? defaultParentId : null,
        force,
        limit,
      });
      setResult(res);
      onDone();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không gọi được dịch vụ bản đồ. Liên hệ admin BE kiểm tra GOONG_API_KEY.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">Bổ sung toạ độ</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!result && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phạm vi</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'province' | 'all')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 outline-none"
                  disabled={running}
                >
                  {defaultParentId && <option value="province">Tỉnh đang chọn ({defaultParentName})</option>}
                  <option value="all">Toàn hệ thống</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Limit (tối đa 200)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-cyan-500 outline-none"
                  disabled={running}
                />
              </div>
              <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={running} className="mt-0.5" />
                <span>
                  <strong>Ghi đè toạ độ đã có</strong> (force) — áp dụng cho <em>toàn bộ</em> quận trong phạm vi đã chọn ở
                  trên, kể cả quận đã sửa tay trước đó. Chỉ bật khi chắc chắn.
                </span>
              </label>
              {running && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang gọi Goong… việc này có thể mất vài chục giây, đừng bấm lại.
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} disabled={running} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Đóng
                </button>
                <button
                  onClick={run}
                  disabled={running}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                >
                  {running ? 'Đang chạy...' : 'Bắt đầu'}
                </button>
              </div>
            </>
          )}

          {result && (
            <>
              <p className="text-sm font-semibold text-slate-700">
                Đã geocode: {result.succeeded} thành công · {result.failed} thất bại · {result.skipped} bỏ qua
              </p>
              {result.requested === limit && (
                <p className="text-xs text-amber-600">Còn zone chưa xử lý — bấm thêm lần nữa nếu cần.</p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Quận</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Toạ độ / Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.results.map((r) => (
                      <tr key={r.zoneId}>
                        <td className="px-3 py-2 font-medium text-slate-700">{r.zoneName}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            r.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'FAILED' ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {r.status === 'SUCCESS' ? `${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}` : (r.message ?? '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900">
                  Đóng
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ZoneManagement = () => {
  const [provinces, setProvinces] = useState<ZoneResponse[]>([]);
  const [provinceCounts, setProvinceCounts] = useState<Record<string, number>>({});
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [districts, setDistricts] = useState<ZoneResponse[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [search, setSearch] = useState('');

  const [formModal, setFormModal] = useState<{ level: number; parentId: string | null; parentName?: string; editZone?: ZoneResponse | null } | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [bulkGeocodeScope, setBulkGeocodeScope] = useState<'province' | 'all' | null>(null);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);

  const fetchProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const roots = await zoneService.getRootZones();
      setProvinces(roots);
      const counts = await Promise.all(roots.map((p) => zoneService.getChildrenZones(p.id).then((c) => [p.id, c.length] as const)));
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

  useEffect(() => { fetchProvinces(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedProvinceId) fetchDistricts(selectedProvinceId); }, [selectedProvinceId]);

  const refreshAll = async () => {
    await fetchProvinces();
    if (selectedProvinceId) await fetchDistricts(selectedProvinceId);
  };

  const selectedProvince = provinces.find((p) => p.id === selectedProvinceId);
  const missingInView = districts.filter(isMissingCoords).length;

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
    if (!window.confirm('Xoá khu vực này? (không xoá được nếu đang có BĐS/con)')) return;
    try {
      await zoneService.deleteZone(id);
      toast.success('Xóa khu vực thành công!');
      if (isProvince && id === selectedProvinceId) setSelectedProvinceId(null);
      await refreshAll();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa khu vực này (có thể đang chứa dữ liệu)');
    }
  };

  const applyGeocodeResult = (updated: { id: string; latitude: number; longitude: number }) => {
    setDistricts((prev) => prev.map((d) => (d.id === updated.id ? { ...d, latitude: updated.latitude, longitude: updated.longitude } : d)));
  };

  const handleGeocode = async (zone: ZoneResponse, force = false) => {
    setGeocodingId(zone.id);
    try {
      const res = await zoneService.geocodeCenter(zone.id, force);
      applyGeocodeResult(res);
      toast.success(`Đã cập nhật tọa độ ${res.fullName}`);
    } catch (err: any) {
      if (err.response?.status === 409) {
        if (window.confirm('Quận này đã có tọa độ. Ghi đè?')) {
          await handleGeocode(zone, true);
          return;
        }
      } else {
        toast.error(err.response?.data?.error || err.response?.data?.message || 'Không tải được. Thử lại.');
      }
    } finally {
      setGeocodingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khu vực</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý tỉnh/thành và quận/huyện — dùng cho import BĐS & gán manager.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import Excel
          </button>
          {missingInView > 0 && (
            <button
              onClick={() => setBulkGeocodeScope('province')}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold rounded-xl transition-all"
            >
              <Sparkles className="w-4 h-4" /> Bổ sung tọa độ thiếu ({missingInView})
            </button>
          )}
          <button
            onClick={() => setFormModal({ level: 1, parentId: null })}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-500/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm Tỉnh/Thành phố
          </button>
        </div>
      </div>

      {loadingProvinces ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : provinces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-indigo-300" />
          </div>
          <p className="font-semibold text-slate-600">Chưa có dữ liệu khu vực nào</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Hãy bắt đầu bằng Import Excel hoặc thêm Tỉnh/Thành phố mới.</p>
          <button
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import Excel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          {/* Cột trái — Tỉnh/TP */}
          <div className="space-y-1.5">
            {provinces.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvinceId(p.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  selectedProvinceId === p.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300'
                }`}
              >
                <span className="truncate">{p.name}</span>
                <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                  selectedProvinceId === p.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {provinceCounts[p.id] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Cột phải — Quận/Huyện */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Quận / Huyện · {selectedProvince?.name}</p>
                {missingInView > 0 && <p className="text-xs text-amber-600">{missingInView} thiếu toạ độ</p>}
              </div>
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
                  onClick={() => selectedProvinceId && setFormModal({ level: 2, parentId: selectedProvinceId, parentName: selectedProvince?.name })}
                  disabled={!selectedProvinceId}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm Quận/Huyện
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
                    <th className="px-5 py-3">Toạ độ tâm</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDistricts.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50">
                            <Building2 className="w-3.5 h-3.5 text-cyan-500" />
                          </div>
                          <span className="font-medium text-slate-700">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {isMissingCoords(d) ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Thiếu tọa độ
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            {d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {isMissingCoords(d) && (
                            <button
                              onClick={() => handleGeocode(d)}
                              disabled={geocodingId === d.id}
                              className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {geocodingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              Geocode
                            </button>
                          )}
                          <button
                            onClick={() => setFormModal({ level: 2, parentId: selectedProvinceId, parentName: selectedProvince?.name, editZone: d })}
                            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </button>
                          <button
                            onClick={() => { if (window.confirm(`Xóa ${d.name}?`)) handleDeleteZone(d.id, false); }}
                            className="flex h-7 w-7 items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
        <ZoneImportWizard
          onClose={() => setShowImportWizard(false)}
          onImported={() => { refreshAll(); }}
          onRequestGeocodeMissing={() => { setShowImportWizard(false); setBulkGeocodeScope('all'); }}
        />
      )}

      {bulkGeocodeScope && (
        <BulkGeocodeModal
          defaultParentId={bulkGeocodeScope === 'province' ? selectedProvinceId : null}
          defaultParentName={selectedProvince?.name}
          onClose={() => setBulkGeocodeScope(null)}
          onDone={refreshAll}
        />
      )}
    </div>
  );
};
