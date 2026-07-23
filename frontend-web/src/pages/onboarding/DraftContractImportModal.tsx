import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileWarning,
  Loader2, RotateCcw, Send, Upload, X, Printer,
} from 'lucide-react';
import { importService, isBulkImportError } from '@/services/import.service';
import { tenantService } from '@/services/tenant.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { draftBlobToFile } from '@/utils/contractFile';
import type { BulkImportError, BulkImportResponse } from '@/types/api.types';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const TEMPLATE_URL = '/templates/SLMS2026_import_tenant_draft_contracts.xlsx';
const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

type Phase = 'idle' | 'validating' | 'validated' | 'importing' | 'done';
type PrintPhase = 'idle' | 'printing' | 'done';

const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);
const formatBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * Modal "Import hợp đồng nháp từ Excel" — luồng Đón khách.
 * Mỗi dòng file = 1 HĐ DRAFT (BE tự gắn nội thất, tự gán quản lý phụ trách của
 * nhà và gửi thông báo). Import xong FE tự động render + upload PDF cho từng HĐ
 * (autoPrintFiles) — admin chỉ cần vào "Sửa" nếu muốn CHỈNH nội dung (sửa xong tự
 * render lại file), không cần tự tạo file tay như trước (FE-import-tenant-draft-contracts.md).
 */
export const DraftContractImportModal = ({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [errors, setErrors] = useState<BulkImportError[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Tự động render + upload PDF cho từng HĐ vừa import (hướng A — giữ nguyên kiến
  // trúc "BE chỉ render, FE tự upload Cloudinary" đã dùng cho luồng "Sửa" 1 HĐ,
  // không cần BE thêm khả năng upload). Chạy tuần tự (không phải để tránh quá tải
  // BE cùng lúc N request render+upload nặng).
  const [printPhase, setPrintPhase] = useState<PrintPhase>('idle');
  const [printDone, setPrintDone] = useState(0);
  const [printTotal, setPrintTotal] = useState(0);
  const [printFailed, setPrintFailed] = useState<string[]>([]);

  const autoPrintFiles = async (importResult: BulkImportResponse) => {
    const imported = importResult.results.filter((r) => r.importStatus === 'IMPORTED');
    if (imported.length === 0) return;
    setPrintPhase('printing');
    setPrintDone(0);
    setPrintTotal(imported.length);
    setPrintFailed([]);

    let drafts;
    try {
      drafts = await tenantService.listDrafts();
    } catch {
      setPrintFailed(imported.map((r) => r.contractCode));
      setPrintPhase('done');
      return;
    }
    const byCode = new Map(drafts.map((d) => [d.contractCode, d]));

    const failed: string[] = [];
    for (const r of imported) {
      const draft = byCode.get(r.contractCode);
      if (!draft) {
        failed.push(r.contractCode);
        setPrintDone((n) => n + 1);
        continue;
      }
      try {
        const blob = await tenantService.generateDraftDocument(draft.id);
        const pdfFile = await draftBlobToFile(blob, draft.contractCode);
        const url = await uploadToCloudinary(pdfFile, 'raw');
        await tenantService.updateDraft(draft.id, { draftContractFileUrl: url });
      } catch {
        failed.push(r.contractCode);
      }
      setPrintDone((n) => n + 1);
    }
    setPrintFailed(failed);
    setPrintPhase('done');
    if (failed.length === 0) {
      toast.success('Đã tự động tạo file hợp đồng cho toàn bộ.');
    } else {
      toast.error(`Tạo file thất bại cho ${failed.length} hợp đồng — vào "Sửa" từng dòng để tạo lại.`);
    }
    onImported?.();
  };

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isExcel(f)) { toast.error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)'); return; }
    setFile(f); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
  };

  const resetAll = () => {
    setFile(null); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    setPrintPhase('idle'); setPrintDone(0); setPrintTotal(0); setPrintFailed([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setPhase(dryRun ? 'validating' : 'importing');
    setErrors([]); setErrorMessage('');
    try {
      const res = await importService.importTenantDraftContractsExcel(file, dryRun);
      setResult(res);
      if (dryRun) {
        setPhase('validated');
        toast.success(`File hợp lệ — ${res.contractsProcessed} hợp đồng sẵn sàng`);
      } else {
        setPhase('done');
        toast.success(`Đã tạo ${res.results.length} hợp đồng nháp.`);
        onImported?.();
        void autoPrintFiles(res);
      }
    } catch (err) {
      if (isBulkImportError(err)) {
        setErrors(err.errors);
        setErrorMessage(err.errors.length ? '' : err.message);
        toast.error(err.errors.length ? `File có ${err.errors.length} lỗi cần sửa` : err.message);
      } else {
        setErrorMessage('Có lỗi không xác định khi xử lý file.');
        toast.error('Có lỗi không xác định khi xử lý file.');
      }
      setPhase(dryRun ? 'idle' : 'validated');
    }
  };

  const busy = phase === 'validating' || phase === 'importing';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Import hợp đồng nháp từ Excel</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Mỗi dòng = 1 hợp đồng nháp. BĐS phải <b className="text-slate-600">đang hoạt động và đã có quản lý phụ trách</b> (map
              theo Mã HĐ inbound / Mã BĐS / Tên tòa nhà) — hệ thống tự gán quản lý phụ trách của nhà
              và gửi thông báo, đồng thời <b className="text-slate-600">tự tạo file PDF hợp đồng</b> cho từng dòng.
              Muốn chỉnh nội dung thì mở <b className="text-slate-600">Sửa</b> — sửa xong tự render lại file.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a href={TEMPLATE_URL} download
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition">
              <Download className="h-4 w-4" /> Tải file mẫu
            </a>
            <button onClick={onClose} disabled={busy} title="Đóng"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {!file ? (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}>
              <Upload className="h-8 w-8 text-slate-300" />
              <span className="text-sm font-semibold text-slate-600">Kéo thả hoặc bấm để chọn file Excel hợp đồng nháp</span>
              <span className="text-xs text-slate-400">.xlsx · .xls — sheet "1. Hop_Dong_Nhap_Khach"</span>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
              </div>
              {!busy && phase !== 'done' && (
                <button onClick={resetAll} title="Bỏ chọn file"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-600 transition">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-rose-200">
              <div className="flex items-center gap-2 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
                <AlertTriangle className="h-4 w-4" /> {errors.length} lỗi — sửa file rồi kiểm tra lại
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <tr><th className="px-4 py-2">Dòng</th><th className="px-4 py-2">Cột</th><th className="px-4 py-2">Lỗi</th></tr>
                  </thead>
                  <tbody>
                    {errors.map((e, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-semibold text-slate-700">{e.rowNumber}</td>
                        <td className="px-4 py-2 text-slate-500">{e.field ?? '—'}</td>
                        <td className="px-4 py-2 text-rose-600">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {phase !== 'done' && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              {phase === 'validated' && result && errors.length === 0 && !errorMessage && (
                <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> File hợp lệ — {result.contractsProcessed} hợp đồng sẵn sàng import
                </p>
              )}
              <button
                onClick={() => run(true)}
                disabled={!file || busy}
                className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {phase === 'validating'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                  : <><CheckCircle2 className="h-4 w-4" /> {phase === 'validated' ? 'Kiểm tra lại' : 'Kiểm tra file'}</>}
              </button>
              {(phase === 'validated' || phase === 'importing') && result && errors.length === 0 && !errorMessage && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                  {phase === 'importing'
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang import...</>
                    : <><Send className="h-4 w-4" /> Import {result.contractsProcessed} hợp đồng</>}
                </button>
              )}
            </div>
          )}

          {/* Kết quả */}
          {phase === 'done' && result && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Đã tạo {result.contractsProcessed} hợp đồng nháp.
              </div>

              {printPhase === 'printing' && (
                <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tự động tạo file hợp đồng: {printDone}/{printTotal}...
                </div>
              )}
              {printPhase === 'done' && (
                printFailed.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <Printer className="h-4 w-4" /> Đã tự động tạo file PDF cho toàn bộ {printTotal} hợp đồng.
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <p className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> Tạo file thất bại cho {printFailed.length}/{printTotal} hợp đồng — vào "Sửa" từng dòng để tạo lại:
                    </p>
                    <p className="mt-1 font-mono text-xs">{printFailed.join(', ')}</p>
                  </div>
                )
              )}

              {result.results.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <tr><th className="px-4 py-2.5">Mã HĐ</th><th className="px-4 py-2.5">Kết quả</th></tr>
                    </thead>
                    <tbody>
                      {result.results.map((r) => (
                        <tr key={r.contractCode} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.contractCode}</td>
                          <td className="px-4 py-3 text-slate-700">{r.message ?? r.propertyName ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={resetAll}
                  className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                  <RotateCcw className="h-4 w-4" /> Import file khác
                </button>
                <button onClick={onClose}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
                  Xong
                </button>
              </div>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmOpen}
          tone="primary"
          title="Xác nhận import hợp đồng nháp?"
          message={
            <>Hệ thống sẽ tạo <b className="text-slate-700">{result?.contractsProcessed ?? 0} hợp đồng nháp</b> từ
            file <b className="text-slate-700">{file?.name}</b>. Quản lý phụ trách của từng nhà sẽ nhận thông báo đón khách.</>
          }
          confirmText="Import"
          loading={phase === 'importing'}
          onConfirm={() => { setConfirmOpen(false); run(false); }}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </div>
  );
};
