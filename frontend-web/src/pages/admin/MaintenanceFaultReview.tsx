import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { maintenanceService } from '@/services/maintenance.service';
import type { MaintenanceRequestResponse } from '@/types/api.types';

// ══════════════════════════════════════════════════════════════════════════════
// Báo lỗi do khách — Admin duyệt. Redesign 01/09/2026: manager chỉ gửi mô tả +
// ảnh bằng chứng qua PUT /report-fault (không còn tự chọn "Hướng xử lý" —
// faultResolutionPath luôn null cho phiếu đi đường này). Admin xem, bấm Duyệt/
// Không duyệt qua PUT /admin-review — đó là bước CUỐI CÙNG app theo dõi, việc
// sửa chữa/thu tiền tiếp theo xử lý ngoài hệ thống.
//
// Phiếu có faultResolutionPath khác null là thuộc luồng reject-fault CŨ (vẫn còn
// trên BE cho tương thích ngược) — không thuộc phạm vi trang này, lọc bỏ.
// Xem docs/BE-YEUCAU-luong-loi-do-khach-admin-duyet-2026-09-01.md.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

export const MaintenanceFaultReview = () => {
  const [rows, setRows] = useState<MaintenanceRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending');
  const [target, setTarget] = useState<MaintenanceRequestResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await maintenanceService.getRequests({ status: 'TENANT_FAULT' }, 0, 200);
      setRows(page.content ?? []);
    } catch (e: unknown) {
      const res = (e as { response?: { status?: number; data?: { message?: string } } })?.response;
      setRows([]);
      setLoadError(res?.status === 403
        ? 'Tài khoản này không có quyền xem báo lỗi do khách (403).'
        : res?.data?.message ?? `Không gọi được API${res?.status ? ` (lỗi ${res.status})` : ' — kiểm tra kết nối máy chủ'}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // faultResolutionPath có giá trị = phiếu thuộc luồng reject-fault cũ (mobile tự xử lý,
  // không qua admin) — không hiện ở đây dù cùng status TENANT_FAULT.
  const reviewable = useMemo(() => rows.filter(r => !r.faultResolutionPath), [rows]);
  const pendingList = useMemo(
    () => reviewable.filter(r => !r.adminReviewedAt)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [reviewable],
  );
  const reviewedList = useMemo(
    () => reviewable.filter(r => r.adminReviewedAt)
      .sort((a, b) => (b.adminReviewedAt ?? '').localeCompare(a.adminReviewedAt ?? '')),
    [reviewable],
  );
  const list = tab === 'pending' ? pendingList : reviewedList;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Báo lỗi do khách — Duyệt</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Manager báo cáo lỗi do khách gây ra kèm ảnh bằng chứng. Xem xét rồi duyệt/không
            duyệt — đây là bước cuối app theo dõi, việc sửa chữa/thu tiền xử lý ngoài hệ thống.
          </p>
        </div>
        <button onClick={load}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      </div>

      <div className="mt-5 flex gap-2">
        {([
          ['pending', 'Chờ duyệt', pendingList.length],
          ['reviewed', 'Đã xử lý', reviewedList.length],
        ] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === k ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label} <span className={tab === k ? 'text-white/70' : 'text-slate-400'}>{n}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : loadError ? (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 py-14 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <p className="mt-3 font-bold text-rose-800">Không tải được dữ liệu</p>
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-bold text-slate-700">
            {tab === 'pending' ? 'Không có báo cáo nào đang chờ duyệt' : 'Chưa duyệt phiếu nào'}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map(r => (
            <div key={r.id} className={`rounded-2xl border bg-white shadow-sm ${
              tab === 'pending' ? 'border-rose-200' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`h-4 w-4 shrink-0 ${tab === 'pending' ? 'text-rose-500' : 'text-slate-400'}`} />
                    <p className="font-bold text-slate-900">{r.requestCode}</p>
                    {tab === 'reviewed' && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.adminApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {r.adminApproved ? 'Đã duyệt' : 'Không duyệt'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {r.propertyName}{r.roomName ? ` · ${r.roomName}` : ''} · {r.tenantName}
                    {r.tenantPhone ? ` · ${r.tenantPhone}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {r.equipmentName ? `${r.equipmentName} · ` : ''}Báo cáo lúc {fmtDate(r.createdAt)}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Mô tả lỗi</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {r.faultReason || '(không có mô tả)'}
                </p>
                {(r.faultEvidenceImages?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.faultEvidenceImages!.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`bằng chứng ${i + 1}`}
                          className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {tab === 'pending' ? (
                <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                  <button onClick={() => setTarget(r)}
                    className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                    Xem xét & duyệt
                  </button>
                </div>
              ) : (
                <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
                  {r.adminReviewedByName ?? 'Quản trị viên'} kết luận lúc {fmtDate(r.adminReviewedAt)}
                  {r.adminReviewNote ? ` — "${r.adminReviewNote}"` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <ReviewDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); }}
        />
      )}
    </div>
  );
};

const ReviewDialog = ({ row, onClose, onDone }: {
  row: MaintenanceRequestResponse; onClose: () => void; onDone: () => void;
}) => {
  const [decision, setDecision] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (decision === null) return toast.error('Chọn Duyệt hoặc Không duyệt trước.');
    setBusy(true);
    try {
      await maintenanceService.adminReviewFault(row.id, { approved: decision, note: note.trim() || undefined });
      toast.success(decision ? 'Đã duyệt báo cáo.' : 'Đã ghi nhận không duyệt.');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không ghi nhận được quyết định.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Duyệt báo lỗi do khách</h3>
            <p className="mt-1 text-sm text-slate-500">{row.requestCode} · {row.tenantName}</p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Mô tả lỗi</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">{row.faultReason}</p>
            </div>

            <div className="space-y-3">
              <button type="button" onClick={() => setDecision(true)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  decision === true ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Duyệt
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Đồng ý đây là lỗi do khách gây ra. Không đổi trạng thái phiếu, không tạo hoá đơn —
                  chỉ ghi nhận kết luận để tra cứu sau này.
                </p>
              </button>
              <button type="button" onClick={() => setDecision(false)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  decision === false ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <XCircle className="h-4 w-4 text-rose-600" /> Không duyệt
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Không đủ căn cứ xác định lỗi do khách.
                </p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Ghi chú (không bắt buộc)
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="Căn cứ kết luận — lưu lại để tra cứu khi cần." />
            </div>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-slate-200 px-7 py-4">
            <button onClick={onClose} disabled={busy}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Huỷ
            </button>
            <button onClick={submit} disabled={busy || decision === null}
              className="flex-[2] rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
              {busy ? 'Đang lưu…' : 'Ghi nhận quyết định'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
};
