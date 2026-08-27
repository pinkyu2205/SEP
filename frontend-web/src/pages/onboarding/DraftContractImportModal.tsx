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
import { splitErrorRows, type RowSplit } from './draftImportFilter';
import { propertyService } from '@/services/property.service';
import { loadPropertyOccupancy } from '@/services/propertyOccupancy.service';
import { runImportPreflight, type PreflightReport } from './importPreflight';
import { ImportCapacityPanel } from './ImportCapacityPanel';

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
  /** Phần bị để lại ngoài lần import này — hiện lên cho admin biết, không phải để chặn. */
  const [dropped, setDropped] = useState<RowSplit | null>(null);

  /**
   * Soát sức chứa NGAY KHI CHỌN FILE, chạy hoàn toàn trên trình duyệt.
   *
   * Vì sao không đợi dry-run: dry-run trả lời "dòng nào sai", còn thứ admin thiếu là
   * "căn nhà này có chứa nổi ngần này khách không". Một file 6 dòng cho căn còn 2 phòng
   * thì kể cả mọi dòng đều hợp lệ về mặt dữ liệu, vẫn có 4 người không có chỗ — và
   * không lỗi từng-dòng nào nói ra điều đó. Xem đầu `importPreflight.ts`.
   */
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [preflighting, setPreflighting] = useState(false);

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

  /**
   * Đọc file bằng SheetJS rồi đối chiếu với số phòng thực tế của từng nhà.
   *
   * Hai lượt gọi `runImportPreflight` là cố ý: lượt đầu chỉ để biết file nhắc tới NHỮNG
   * NHÀ NÀO, lượt sau mới soát thật với sức chứa đã nạp. Nạp phòng của toàn bộ nhà trong
   * hệ thống chỉ để soát một file vài dòng thì quá phí.
   *
   * Hỏng ở bất kỳ bước nào cũng chỉ tắt bảng soát, KHÔNG chặn import: đây là lớp cảnh báo
   * sớm, dry-run của BE mới là nơi phán quyết.
   */
  const runPreflight = async (f: File) => {
    setPreflighting(true);
    setPreflight(null);
    try {
      const [propPage, drafts] = await Promise.all([
        propertyService.getProperties(0, 200),
        tenantService.listDrafts().catch(() => []),
      ]);
      const properties = propPage.content ?? [];

      const scan = await runImportPreflight(f, properties);
      if (scan.parseError) { setPreflight(scan); return; }

      const involved = properties.filter((p) => scan.propertyIds.includes(p.id));
      const occupancy = await loadPropertyOccupancy(involved, drafts);
      setPreflight(await runImportPreflight(f, properties, occupancy));
    } catch {
      setPreflight(null);
    } finally {
      setPreflighting(false);
    }
  };

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isExcel(f)) { toast.error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)'); return; }
    setFile(f); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    setDropped(null);
    void runPreflight(f);
  };

  const resetAll = () => {
    setFile(null); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    setDropped(null);
    setPreflight(null); setPreflighting(false);
    setPrintPhase('idle'); setPrintDone(0); setPrintTotal(0); setPrintFailed([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  /**
   * Gọi BE với `skipInvalidRows=true`: BE tự import những dòng hợp lệ và trả kèm danh sách
   * lỗi của các dòng bị bỏ, thay vì ném lỗi chặn cả file (BE làm 20/08/2026).
   *
   * Trước đó FE phải tự dựng lại file Excel đã lọc rồi gửi lại nhiều vòng — cách đó đã bỏ,
   * kèm luôn cả cái bẫy làm hỏng ô ngày khi ghi lại workbook.
   */
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setPhase(dryRun ? 'validating' : 'importing');
    setErrors([]); setErrorMessage('');
    try {
      const res = await importService.importTenantDraftContractsExcel(file, dryRun, true);
      setResult(res);

      // BE trả `errors` KÈM kết quả thành công — đó là các dòng bị bỏ, không phải lỗi chặn.
      const skipped = res.errors ?? [];
      setDropped(skipped.length > 0 ? splitErrorRows(skipped) : null);

      if (dryRun) {
        setPhase('validated');
        toast.success(
          skipped.length > 0
            ? `${res.contractsProcessed} hợp đồng sẵn sàng · ${res.contractsSkipped} dòng để lại`
            : `File hợp lệ — ${res.contractsProcessed} hợp đồng sẵn sàng`,
        );
      } else {
        setPhase('done');
        toast.success(`Đã tạo ${res.results.length} hợp đồng nháp.`);
        onImported?.();
        void autoPrintFiles(res);
      }
    } catch (err) {
      if (isBulkImportError(err)) {
        // Tới đây nghĩa là KHÔNG còn dòng nào hợp lệ ("Không có dòng nào hợp lệ để import").
        // Vẫn gom theo nhà để admin biết đang kẹt ở đâu, thay vì đổ bảng lỗi thô.
        const split = err.errors.length > 0 ? splitErrorRows(err.errors) : null;
        setDropped(split);
        setResult(null);
        setErrors(split && split.waiting.length > 0 ? [] : err.errors);
        setErrorMessage(err.errors.length ? '' : err.message);
        toast.error(
          err.errors.length
            ? 'Chưa có dòng nào import được — xem chi tiết bên dưới.'
            : err.message,
        );
      } else {
        setErrorMessage('Có lỗi không xác định khi xử lý file.');
        toast.error('Có lỗi không xác định khi xử lý file.');
      }
      setPhase(dryRun ? 'idle' : 'validated');
    }
  };

  const busy = phase === 'validating' || phase === 'importing';
  /** Nhà không đủ phòng cho số khách trong file — nhắc lại lúc xác nhận import. */
  const overCapacityGroups = preflight?.groups.filter((g) => g.overCapacity > 0) ?? [];

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

          {/* Soát sức chứa — hiện trước mọi kết quả từ BE vì nó có ngay, không cần bấm gì. */}
          {!!file && phase !== 'done' && (
            <ImportCapacityPanel loading={preflighting} report={preflight} />
          )}

          {dropped && (dropped.waiting.length > 0 || dropped.broken.length > 0) && (
            <div className="mt-4 space-y-3">
              {dropped.waiting.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">
                    {result
                      ? `${dropped.waiting.length} hợp đồng thuộc nhà chưa hoạt động — để lại lần này`
                      : `Chưa import được: cả ${dropped.waiting.length} hợp đồng đều thuộc nhà chưa hoạt động`}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    Những dòng này <b>không sai</b>, chỉ là nhập trước khi nhà sẵn sàng. Xử lý xong
                    phần dưới thì import lại chính file gốc, chúng sẽ vào bình thường.
                  </p>
                  <ul className="mt-2.5 space-y-2 border-t border-amber-200 pt-2.5">
                    {dropped.waitingByProperty.map((p) => (
                      <li key={p.propertyName} className="text-xs">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <b className="text-amber-900">{p.propertyName}</b>
                          <span className="text-amber-700">
                            {p.rows.length} hợp đồng · dòng {p.rows.join(', ')}
                          </span>
                        </div>
                        <div className="mt-0.5 font-semibold text-amber-800">→ {p.todo}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dropped.broken.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-rose-200">
                  <div className="bg-rose-50 px-4 py-2.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-rose-800">
                      <AlertTriangle className="h-4 w-4" /> {dropped.broken.length} dòng sai dữ liệu —
                      phải sửa file mới import được
                    </p>
                    <p className="mt-1 text-xs text-rose-700">
                      Khác với nhóm trên: host duyệt nhà cũng không cứu được, phải mở file sửa.
                    </p>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <tr><th className="px-4 py-2">Dòng</th><th className="px-4 py-2">Cột</th><th className="px-4 py-2">Lỗi</th></tr>
                      </thead>
                      <tbody>
                        {dropped.brokenErrors.map((e, i) => (
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

              <p className="text-[11px] text-slate-500">
                File gốc trong máy bạn không bị đổi — việc để lại chỉ áp dụng cho lần import này.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" /> {errorMessage}
            </div>
          )}

          {/* Không dòng nào import được và cũng không phải kiểu "chờ đến lượt"
              → hiện nguyên danh sách lỗi để admin sửa file. */}
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
            <>
              <p>
                Hệ thống sẽ tạo <b className="text-slate-700">{result?.contractsProcessed ?? 0} hợp đồng nháp</b> từ
                file <b className="text-slate-700">{file?.name}</b>. Quản lý phụ trách của từng nhà sẽ nhận thông báo đón khách.
              </p>
              {/*
                Nhắc lại cảnh báo sức chứa NGAY TRONG hộp xác nhận.
                Bảng soát nằm phía trên đã cuộn khuất từ lâu khi admin tới được nút này, mà
                đây là điểm không quay lại được: import xong là quản lý đã nhận thông báo
                đi đón khách vào những căn nhà không đủ phòng.
              */}
              {overCapacityGroups.length > 0 && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-800">
                  ⚠ {overCapacityGroups.map((g) => `${g.label} (thừa ${g.overCapacity} khách)`).join(' · ')}
                  {' '}— những căn này không đủ phòng cho số khách trong file. Nên hỏi lại chủ nhà
                  trước khi import.
                </p>
              )}
            </>
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
