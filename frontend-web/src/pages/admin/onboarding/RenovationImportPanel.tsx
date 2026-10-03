import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileWarning, Info,
  Loader2, RotateCcw, Send, Upload, X,
} from 'lucide-react';
import { importService, isBulkImportError } from '@/services/import.service';
import type { BulkImportContractResult, BulkImportError, BulkImportResponse } from '@/types/api.types';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const TEMPLATE_URL = '/templates/SLMS2026_import_matrix_dot2.xlsx';
const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

type Phase = 'idle' | 'validating' | 'validated' | 'importing' | 'done';

const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);
const formatBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Nhà đang ở đâu trong quy trình — để câu "đã nhập trước đó" nói được nhà đang chờ ai. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'chưa cấu hình',
  PENDING: 'chưa cấu hình',
  UNDER_RENOVATION: 'đang cải tạo',
  PENDING_EQUIPMENT_INSTALLATION: 'chờ lắp thiết bị',
  RENOVATION_COMPLETED: 'đã cải tạo xong',
  PENDING_HOST_REVIEW: 'đang chờ Owner duyệt giá',
  PENDING_OPERATION_MANAGER: 'chờ gán quản lý',
  ACTIVE: 'đang kinh doanh',
  RENTED: 'đã cho thuê',
};

/** Căn bị bỏ qua vì sao — máy chủ chỉ có hai lý do, viết lại cho admin biết phải làm gì. */
const skipText = (r: BulkImportContractResult) => {
  if (/chưa khởi tạo/i.test(r.message ?? '')) return 'Chưa khởi tạo nhà — nhập file Khởi tạo nhà trước';
  const st = r.finalStatus ? STATUS_LABEL[r.finalStatus] ?? r.finalStatus : '';
  return `Đã nhập cải tạo trước đó${st ? ` · ${st}` : ''} — không nhập lại`;
};

/**
 * Hai lỗi chặn CẢ FILE khi nhập lại file cũ, mà câu gốc của máy chủ chỉ có người viết code
 * hiểu ("phải ở trạng thái UNDER_RENOVATION", "dùng POST /import/renovation-supplement-excel").
 * Cả hai đều có chung một cách gỡ: bỏ dòng của nhà đó khỏi file rồi kiểm tra lại.
 */
const friendlyError = (message: string): string => {
  if (/cải tạo bổ sung/i.test(message)) {
    return 'Nhà đang cải tạo bổ sung (cải tạo lại sau khi đã kinh doanh) — nhập ở mục Cải tạo bổ sung trong trang của nhà, '
      + 'không nhập ở đây. Xoá dòng của nhà này khỏi file rồi kiểm tra lại.';
  }
  const m = message.match(/UNDER_RENOVATION.*hiện tại:\s*([A-Z_]+)/);
  if (m) {
    return `Nhà đang ở bước "${STATUS_LABEL[m[1]] ?? m[1]}", không nhận file cải tạo nữa. `
      + 'Xoá dòng của nhà này khỏi file rồi kiểm tra lại.';
  }
  return message;
};

/**
 * Panel "Nhập hợp đồng cải tạo từ Excel" — module Cấu hình khai thác.
 * File chỉ chứa cải tạo (sheet 2), khớp theo mã HĐ thuê của căn đã khởi tạo.
 * Import thật xong BE TỰ ĐỘNG gửi Owner (PENDING_HOST_REVIEW). Gọi importRenovationExcel.
 */
export const RenovationImportPanel = ({ onImported }: { onImported?: () => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [errors, setErrors] = useState<BulkImportError[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isExcel(f)) { toast.error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)'); return; }
    setFile(f); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
  };

  const resetAll = () => {
    setFile(null); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setPhase(dryRun ? 'validating' : 'importing');
    setErrors([]); setErrorMessage('');
    try {
      const res = await importService.importRenovationExcel(file, dryRun);
      setResult(res);
      if (dryRun) {
        setPhase('validated');
        if (res.contractsProcessed > 0) {
          toast.success(`File hợp lệ — ${res.contractsProcessed} căn sẵn sàng`);
        } else {
          // Nhập lại file cũ: mọi căn đã qua bước này. Không phải "hợp lệ — 0 căn".
          toast('Không có căn nào cần nhập — file này đã được nhập trước đó', {
            icon: <Info className="h-5 w-5 shrink-0 text-sky-600" />,
          });
        }
      } else {
        setPhase('done');
        // `contractsProcessed`, KHÔNG phải `results.length` — `results` gồm cả căn bị bỏ qua.
        toast.success(`Đã nhập cải tạo cho ${res.contractsProcessed} căn — đã gửi Owner`);
        onImported?.();
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
  const validOk = (phase === 'validated' || phase === 'importing') && !!result && errors.length === 0 && !errorMessage;
  /** Căn sẽ được nhập cải tạo lần này — 0 khi nhập lại đúng file cũ. */
  const newCount = result?.contractsProcessed ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cấu hình khai thác từ Excel</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            File gồm cấu hình khai thác (nguyên căn / chia phòng), danh sách phòng, hợp đồng cải tạo
            và thiết bị mua mới — khớp theo mã HĐ thuê của căn đã khởi tạo.
            Nhập xong, các căn <b className="text-slate-600">tự động được gửi Owner</b> duyệt.
          </p>
        </div>
        <a href={TEMPLATE_URL} download
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition">
          <Download className="h-4 w-4" /> Tải template
        </a>
      </div>

      {/* Card chính */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!file ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}>
            <Upload className="h-8 w-8 text-slate-300" />
            <span className="text-sm font-semibold text-slate-600">Kéo thả hoặc bấm để chọn file Excel cải tạo</span>
            <span className="text-xs text-slate-400">.xlsx · .xls</span>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
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
                  <tr><th className="px-4 py-2">Dòng</th><th className="px-4 py-2">Mã HĐ</th><th className="px-4 py-2">Cột</th><th className="px-4 py-2">Lỗi</th></tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-semibold text-slate-700">{e.rowNumber}</td>
                      <td className="px-4 py-2 text-slate-500">{e.contractCode ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{e.field ?? '—'}</td>
                      <td className="px-4 py-2 text-rose-600">{friendlyError(e.message)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {phase !== 'done' && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {validOk && newCount > 0 && (
              <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> File hợp lệ — {newCount} căn · {result!.renovationLinesImported} dòng cải tạo · {result!.equipmentRowsImported} thiết bị mua mới
                {result!.contractsSkipped > 0 && ` · ${result!.contractsSkipped} căn không nhập`}
              </p>
            )}
            {validOk && newCount === 0 && (
              <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-sky-700">
                <Info className="h-4 w-4" /> Không có căn nào cần nhập — cả {result!.contractsSkipped} căn đã nhập trước đó hoặc chưa khởi tạo
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
            {/* Không có căn mới thì không có nút — bấm vào chỉ để nhận "Đã nhập cải tạo cho 0 căn". */}
            {(phase === 'validated' || phase === 'importing') && result && errors.length === 0 && !errorMessage && newCount > 0 && (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                {phase === 'importing'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang nhập...</>
                  : <><Send className="h-4 w-4" /> Nhập & gửi Owner</>}
              </button>
            )}
          </div>
        )}

        {/* Từng căn sẽ ra sao — trước đây chỉ có con số "N bỏ qua", không biết căn nào, vì sao. */}
        {validOk && result!.results.length > 0 && (
          <ul className="mt-4 max-h-60 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 text-sm">
            {result!.results.map((r) => (
              <li key={r.contractCode} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-slate-800">{r.propertyName ?? r.contractCode}</span>
                  {r.propertyName && <span className="ml-2 font-mono text-xs text-slate-400">{r.contractCode}</span>}
                </span>
                <span className={`shrink-0 text-xs ${r.importStatus === 'SKIPPED' ? 'text-slate-500' : 'font-semibold text-emerald-700'}`}>
                  {r.importStatus === 'SKIPPED' ? skipText(r) : 'Sẽ nhập cải tạo & gửi Owner'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kết quả */}
      {phase === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Đã nhập cải tạo cho {result.contractsProcessed} căn — đã gửi Owner duyệt
            {result.contractsSkipped > 0 && ` · ${result.contractsSkipped} căn không nhập lại`}.
          </div>

          {result.results.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5">Căn nhà</th><th className="px-4 py-2.5">Mã HĐ</th><th className="px-4 py-2.5 text-right">Trạng thái</th></tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.contractCode} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.propertyName ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.contractCode}</td>
                      <td className="px-4 py-3 text-right">
                        {r.importStatus === 'SKIPPED' ? (
                          <span className="text-xs text-slate-500">{skipText(r)}</span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">Đã gửi Owner</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={resetAll}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            <RotateCcw className="h-4 w-4" /> Nhập file khác
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title="Xác nhận nhập cải tạo & gửi Owner?"
        message={
          <>Hệ thống sẽ nhập cải tạo & thiết bị mua mới cho <b className="text-slate-700">{result?.contractsProcessed ?? 0} căn nhà</b> từ
          file <b className="text-slate-700">{file?.name}</b>, sau đó tự động gửi Owner duyệt.</>
        }
        confirmText="Nhập & gửi Owner"
        loading={phase === 'importing'}
        onConfirm={() => { setConfirmOpen(false); run(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
