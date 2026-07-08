import { useEffect, useState } from 'react';
import {
  FilePlus, RefreshCw, UserPlus, Trash2, Building2, Phone, CalendarClock, CheckCircle2, X, FileDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { TenantContractResponse } from '../../types/api.types';
import { tenantService } from '../../services/tenant.service';
import { propertyService } from '../../services/property.service';
import { formatCurrency } from '../../utils';
import { DraftContractFormModal } from './DraftContractFormModal';

type ManagerItem = { id: string; fullName: string; username: string };

/**
 * Trang "Đón khách — Hợp đồng nháp" (admin).
 * Liệt kê các hợp đồng ở trạng thái DRAFT; tạo mới; gán quản lý (gửi thông báo); hủy.
 */
export const DraftOnboardingList = () => {
  const [drafts, setDrafts] = useState<TenantContractResponse[]>([]);
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [assigning, setAssigning] = useState<TenantContractResponse | null>(null);
  const [assignManagerId, setAssignManagerId] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [list, mgrs] = await Promise.all([
        tenantService.listDrafts().catch(() => [] as TenantContractResponse[]),
        propertyService.getManagers().catch(() => [] as ManagerItem[]),
      ]);
      setDrafts(Array.isArray(list) ? list : []);
      setManagers(mgrs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openAssign = (d: TenantContractResponse) => {
    setAssigning(d);
    setAssignManagerId(d.assignedManagerId ?? '');
    setAssignDate(d.expectedReceptionDate ?? '');
  };

  const submitAssign = async () => {
    if (!assigning || !assignManagerId) return toast.error('Chọn quản lý để gán');
    setAssignBusy(true);
    try {
      await tenantService.assignManager(assigning.id, {
        assignedManagerId: assignManagerId,
        expectedReceptionDate: assignDate || undefined,
      });
      toast.success('Đã gán & gửi thông báo cho quản lý.');
      setAssigning(null);
      fetchData();
    } catch {
      /* interceptor toast */
    } finally {
      setAssignBusy(false);
    }
  };

  const cancelDraft = async (d: TenantContractResponse) => {
    if (!window.confirm(`Hủy hợp đồng nháp ${d.contractCode || d.tenantFullName}?`)) return;
    try {
      await tenantService.cancel(d.id);
      toast.success('Đã hủy hợp đồng nháp.');
      fetchData();
    } catch {
      /* interceptor toast */
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đón khách — Hợp đồng nháp</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tạo hợp đồng nháp sau khi khách xem nhà, rồi gán cho quản lý vận hành đón khách & thu cọc.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <FilePlus className="h-4 w-4" /> Tạo hợp đồng nháp
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-20">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Đang tải...</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center text-slate-500">
          <FilePlus className="mb-3 h-12 w-12 text-slate-300" />
          <p className="font-medium">Chưa có hợp đồng nháp nào.</p>
          <p className="mt-1 text-sm text-slate-400">Bấm "Tạo hợp đồng nháp" để bắt đầu đón khách.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {drafts.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{d.tenantFullName || 'Khách chưa đặt tên'}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone className="h-3 w-3" /> {d.tenantPhone || '—'}
                    {d.contractCode && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{d.contractCode}</span>}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Nháp</span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                <p className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                  {d.roomNumber ? `Phòng ${d.roomNumber}` : 'Nguyên căn'} · {formatCurrency(d.rentAmount)}/tháng · cọc {formatCurrency(d.deposit)}
                </p>
                {d.expectedReceptionDate && (
                  <p className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Dự kiến đón: {d.expectedReceptionDate}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  {d.assignedManagerId ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Đã gán: {d.assignedManagerName || managers.find((m) => m.id === d.assignedManagerId)?.fullName || 'Quản lý'}
                    </>
                  ) : (
                    <span className="italic text-amber-600">Chưa gán quản lý</span>
                  )}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => openAssign(d)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                >
                  <UserPlus className="h-3.5 w-3.5" /> {d.assignedManagerId ? 'Đổi quản lý' : 'Gán quản lý'}
                </button>
                {d.draftContractFileUrl && (
                  <a
                    href={d.draftContractFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    <FileDown className="h-3.5 w-3.5" /> File HĐ
                  </a>
                )}
                <button
                  onClick={() => cancelDraft(d)}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hủy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <DraftContractFormModal onClose={() => setShowCreate(false)} onSuccess={fetchData} />
      )}

      {/* Assign modal */}
      {assigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAssigning(null)} />
          <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Gán quản lý đón khách</h3>
              <button onClick={() => setAssigning(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Khách: <strong className="text-slate-700">{assigning.tenantFullName}</strong> — {assigning.tenantPhone}
            </p>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Quản lý vận hành</label>
            <select value={assignManagerId} onChange={(e) => setAssignManagerId(e.target.value)} className="input-field">
              <option value="">Chọn quản lý...</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName || m.username}</option>
              ))}
            </select>
            <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">Ngày dự kiến đón (tuỳ chọn)</label>
            <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} className="input-field" />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAssigning(null)} className="btn-secondary">Hủy</button>
              <button onClick={submitAssign} disabled={assignBusy} className="btn-primary">
                {assignBusy ? 'Đang gán...' : 'Gán & gửi thông báo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
