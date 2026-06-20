import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileArchive, FileSpreadsheet,
  FileWarning, Images, Loader2, MapPin, Package, RefreshCw, RotateCcw, ShieldCheck,
  Sparkles, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import { importService, isBulkImportError } from '../../../services/import.service';
import { catalogService } from '../../../services/catalog.service';
import { zoneService } from '../../../services/zone.service';
import type { BulkImportError, BulkImportResponse, BulkImportImagesResponse } from '../../../types/api.types';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { inspectZipImages, type ZipImagePreview } from '../../../utils/zipImageInspect';

const TEMPLATE_URL = '/templates/SLMS2026_v2.xlsx';
const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const MAX_ZIP_BYTES = 200 * 1024 * 1024; // BE multipart max-file-size = 200MB

type Phase = 'idle' | 'validating' | 'validated' | 'importing' | 'done';
type ZipPhase = 'idle' | 'checking' | 'checked' | 'attaching' | 'attached';

const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);
const isZip = (f: File) => /\.zip$/i.test(f.name);

const formatBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

// ─── Một dòng trong "Dữ liệu master cần có" ──────────────────────────────────
type MasterItem = { loading: boolean; count: number | null; error: boolean };
const emptyMaster = (): MasterItem => ({ loading: true, count: null, error: false });

export const ImportExcelPage = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [errors, setErrors] = useState<BulkImportError[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  // ─── Bước 2: gắn ảnh từ ZIP ─────────────────────────────────────────────────
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipDragOver, setZipDragOver] = useState(false);
  const [zipPhase, setZipPhase] = useState<ZipPhase>('idle');
  const [zipResult, setZipResult] = useState<BulkImportImagesResponse | null>(null);
  const [zipError, setZipError] = useState('');
  // Kiểm tra ảnh CLIENT-SIDE (đọc zip trên web) ở bước trước khi nhập.
  const [zipPreview, setZipPreview] = useState<ZipImagePreview | null>(null);
  const [zipChecking, setZipChecking] = useState(false);
  const [zipCheckError, setZipCheckError] = useState('');

  // ─── Master data readiness ─────────────────────────────────────────────────
  const [zones, setZones] = useState<MasterItem>(emptyMaster());
  const [renoCats, setRenoCats] = useState<MasterItem>(emptyMaster());
  const [equipment, setEquipment] = useState<MasterItem>(emptyMaster());

  const loadMaster = () => {
    setZones(emptyMaster()); setRenoCats(emptyMaster()); setEquipment(emptyMaster());
    zoneService.getRootZones()
      .then(z => setZones({ loading: false, count: z.length, error: false }))
      .catch(() => setZones({ loading: false, count: null, error: true }));
    catalogService.getRenovationCategories()
      .then(r => setRenoCats({ loading: false, count: r.length, error: false }))
      .catch(() => setRenoCats({ loading: false, count: null, error: true }));
    catalogService.getEquipmentCatalog()
      .then(e => setEquipment({ loading: false, count: e.length, error: false }))
      .catch(() => setEquipment({ loading: false, count: null, error: true }));
  };

  useEffect(() => { loadMaster(); }, []);

  // ─── File handling ──────────────────────────────────────────────────────────
  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isExcel(f)) {
      toast.error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)');
      return;
    }
    setFile(f);
    setPhase('idle');
    setResult(null);
    setErrors([]);
    setErrorMessage('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const resetZip = () => {
    setZipFile(null);
    setZipPhase('idle');
    setZipResult(null);
    setZipError('');
    setZipPreview(null);
    setZipCheckError('');
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  const resetAll = () => {
    setFile(null);
    setPhase('idle');
    setResult(null);
    setErrors([]);
    setErrorMessage('');
    if (inputRef.current) inputRef.current.value = '';
    resetZip();
  };

  // ─── ZIP file handling ──────────────────────────────────────────────────────
  const pickZip = (f: File | null | undefined) => {
    if (!f) return;
    if (!isZip(f)) { toast.error('Chỉ chấp nhận file .zip'); return; }
    if (f.size > MAX_ZIP_BYTES) {
      toast.error('File ZIP vượt 200MB — hãy tách thành nhiều file nhỏ hơn');
      return;
    }
    setZipFile(f);
    setZipPhase('idle');
    setZipResult(null);
    setZipError('');
    setZipPreview(null);
    setZipCheckError('');
  };

  const handleZipDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setZipDragOver(false);
    pickZip(e.dataTransfer.files?.[0]);
  };

  // Kiểm tra ảnh ngay trên web: đọc zip + đối chiếu mã hợp đồng trong file Excel (dryRun).
  const runZipCheck = async () => {
    if (!zipFile || !result) return;
    setZipChecking(true);
    setZipCheckError('');
    try {
      const codes = result.results.map((r) => r.contractCode).filter(Boolean);
      const preview = await inspectZipImages(zipFile, codes);
      setZipPreview(preview);
      if (preview.matched.length === 0) {
        toast.error('Không có folder ảnh nào khớp mã hợp đồng trong file Excel');
      } else {
        toast.success(`Khớp ${preview.matched.length} căn — ${preview.totalImages} ảnh sẽ gắn`);
      }
    } catch {
      setZipCheckError('Không đọc được file ZIP. Kiểm tra lại file có đúng định dạng .zip không.');
      toast.error('Không đọc được file ZIP');
    } finally {
      setZipChecking(false);
    }
  };

  const runZip = async (dryRun: boolean) => {
    if (!zipFile) return;
    setZipPhase(dryRun ? 'checking' : 'attaching');
    setZipError('');
    try {
      const res = await importService.importPropertyImagesZip(zipFile, dryRun);
      setZipResult(res);
      setZipPhase(dryRun ? 'checked' : 'attached');
      if (dryRun) {
        toast.success(`Đã kiểm tra — ${res.contractsMatched} căn khớp, ${res.imagesAttached} ảnh sẽ gán`);
      } else {
        toast.success(`Đã gắn ${res.imagesAttached} ảnh cho ${res.contractsMatched} căn`);
      }
    } catch (err) {
      const msg = isBulkImportError(err) ? err.message : 'Có lỗi không xác định khi xử lý file ZIP.';
      setZipError(msg);
      toast.error('Không xử lý được file ZIP');
      setZipPhase('idle');
    }
  };

  // Rollback 1 căn vừa import theo mã hợp đồng (BE: DELETE .../contracts/{contractCode})
  const rollback = async (contractCode: string) => {
    if (!window.confirm(`Xóa căn vừa nhập theo mã HĐ "${contractCode}"? Toàn bộ dữ liệu của căn này sẽ bị xóa.`)) return;
    setRollingBack(contractCode);
    try {
      const res = await importService.deleteImportedContract(contractCode);
      toast.success(`Đã xóa "${res.propertyName}" — ${res.roomsDeleted} phòng, ${res.equipmentsDeleted} thiết bị`);
      setResult((prev) =>
        prev ? { ...prev, results: prev.results.filter((x) => x.contractCode !== contractCode) } : prev,
      );
    } catch (err) {
      toast.error(isBulkImportError(err) ? err.message : 'Lỗi khi xóa căn đã import');
    } finally {
      setRollingBack(null);
    }
  };

  // ─── Call API ─────────────────────────────────────────────────────────────
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setPhase(dryRun ? 'validating' : 'importing');
    setErrors([]);
    setErrorMessage('');
    try {
      const res = await importService.importOnboardingExcel(file, dryRun);
      setResult(res);
      if (dryRun) {
        setPhase('validated');
        toast.success(`File hợp lệ — ${res.contractsProcessed} căn nhà sẵn sàng nhập`);
      } else {
        setPhase('done');
        toast.success(`Đã nhập ${res.results.length} căn nhà`);
        // Người dùng đã kiểm tra ảnh client-side trước khi xác nhận → giờ gắn thật luôn.
        if (zipFile) await runZip(false);
      }
    } catch (err) {
      if (isBulkImportError(err)) {
        setErrors(err.errors);
        setErrorMessage(err.errors.length ? '' : err.message);
        if (!err.errors.length) toast.error(err.message);
        else toast.error(`File có ${err.errors.length} lỗi cần sửa`);
      } else {
        setErrorMessage('Có lỗi không xác định khi xử lý file.');
        toast.error('Có lỗi không xác định khi xử lý file.');
      }
      // Quay về trạng thái cho phép kiểm tra / import lại
      setPhase(dryRun ? 'idle' : 'validated');
    }
  };

  const busy = phase === 'validating' || phase === 'importing';
  // Có zip thì PHẢI kiểm tra ảnh xong (zipPreview) mới cho xác nhận; không kèm zip thì khỏi.
  const zipReady = !zipFile || !!zipPreview;
  // Thanh "Xác nhận" ở dưới cùng — hiện khi đã kiểm tra file + (kiểm tra ảnh nếu có zip).
  const showConfirmBar = (phase === 'validated' || phase === 'importing')
    && errors.length === 0 && !!result && !result.errors.length && zipReady;

  const zipBusy = zipPhase === 'checking' || zipPhase === 'attaching';
  const canAttachZip = zipPhase === 'checked' && !!zipResult && zipResult.contractsMatched > 0;
  // Gap 2 (BE không báo): căn đã import Excel nhưng thiếu folder ảnh trong zip.
  const importedCodes = result?.results.map((r) => r.contractCode) ?? [];
  const zipMatchedCodes = new Set(
    (zipResult?.results ?? []).filter((r) => r.status !== 'NOT_FOUND').map((r) => r.contractCode.toLowerCase()),
  );
  const missingImageCodes = zipResult ? importedCodes.filter((c) => !zipMatchedCodes.has(c.toLowerCase())) : [];

  // Dropzone chọn .zip — dùng chung cho cả bước "trước khi nhập" lẫn "sau khi nhập".
  const renderZipDropzone = () => (
    !zipFile ? (
      <label
        onDragOver={(e) => { e.preventDefault(); setZipDragOver(true); }}
        onDragLeave={() => setZipDragOver(false)}
        onDrop={handleZipDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          zipDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50'
        }`}>
        <FileArchive className="h-8 w-8 text-slate-300" />
        <span className="text-sm font-bold text-slate-600">Kéo thả file .zip vào đây hoặc bấm để chọn</span>
        <span className="text-xs text-slate-400">Tối đa 200MB · jpg, jpeg, png, webp</span>
        <input ref={zipInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
          onChange={(e) => pickZip(e.target.files?.[0])} />
      </label>
    ) : (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <FileArchive className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{zipFile.name}</p>
          <p className="text-xs text-slate-500">{formatBytes(zipFile.size)}</p>
        </div>
        {!zipBusy && (
          <button onClick={resetZip} title="Bỏ chọn file zip"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-600 transition">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <button onClick={() => navigate('/admin/buildings')}
        className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
        <ArrowLeft className="h-4 w-4" /> Quay về Nhà thuê Admin
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
          <span className="text-xs font-black uppercase tracking-widest text-cyan-700">Nhập hàng loạt</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Nhập nhà hàng loạt từ Excel</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Tải 1 file Excel theo mẫu để tạo nhiều căn nhà cùng lúc — bao gồm hợp đồng đầu vào,
          chi phí cải tạo và phân bổ thiết bị. Không cần nhập tay từng bước như trước.
          Sau khi nhập, mỗi căn dừng ở trạng thái <b className="text-slate-700">Đã hoàn tất cải tạo</b> —
          chỉ cần gửi Host để định giá.
        </p>
      </div>

      {/* ── Dữ liệu master cần có ───────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Dữ liệu master cần có
          </h3>
          <button onClick={loadMaster}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 transition">
            <RefreshCw className="h-3.5 w-3.5" /> Làm mới
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MasterCard icon={MapPin} label="Khu vực (Tỉnh/TP)" item={zones} unit="tỉnh/TP" />
          <MasterCard icon={Wrench} label="Danh mục cải tạo" item={renoCats} unit="mục" />
          <MasterCard icon={Package} label="Danh mục thiết bị" item={equipment} unit="thiết bị" />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          File Excel phải dùng đúng mã khu vực / cải tạo / thiết bị đã có trong hệ thống. Sheet
          <span className="font-semibold text-slate-500"> “0. Danh_Muc_Tham_Khao”</span> trong template giúp tra cứu mã.
        </p>
      </div>

      {/* ── Khối chọn file + hành động ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900">1. Chọn file Excel</h3>
            <p className="mt-0.5 text-sm text-slate-500">Dùng đúng template để tránh lỗi sai tên sheet / cột.</p>
          </div>
          <a href={TEMPLATE_URL} download
            className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition">
            <Download className="h-4 w-4" /> Tải template mẫu
          </a>
        </div>

        {/* Dropzone */}
        {!file ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
            }`}>
            <Upload className="h-9 w-9 text-slate-300" />
            <span className="text-sm font-bold text-slate-600">Kéo thả file vào đây hoặc bấm để chọn</span>
            <span className="text-xs text-slate-400">Chỉ chấp nhận .xlsx · .xls</span>
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            </div>
            {!busy && (
              <button onClick={resetAll} title="Bỏ chọn file"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-600 transition">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Actions — chỉ còn nút Kiểm tra file; nút Xác nhận nằm dưới cùng */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {phase === 'validated'
              ? 'Đã kiểm tra — cuộn xuống dưới để xác nhận nhập.'
              : 'Bước 1: Kiểm tra file trước (không ghi dữ liệu).'}
          </p>
          <button
            onClick={() => run(true)}
            disabled={!file || busy}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {phase === 'validating'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
              : <><CheckCircle2 className="h-4 w-4" /> {phase === 'validated' ? 'Kiểm tra lại' : 'Kiểm tra file'}</>}
          </button>
        </div>
      </div>

      {/* ── Banner lỗi tổng quát (thiếu sheet/cột, runtime, 403...) ──────────── */}
      {errorMessage && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="text-sm font-black text-rose-700">Không thể xử lý file</p>
            <p className="mt-0.5 text-sm text-rose-600">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* ── Bảng lỗi validate ───────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <p className="text-sm font-black text-rose-700">
              Phát hiện {errors.length} lỗi — vui lòng sửa file Excel rồi kiểm tra lại
            </p>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Sheet</th>
                  <th className="px-4 py-2.5">Dòng</th>
                  <th className="px-4 py-2.5">Mã HĐ</th>
                  <th className="px-4 py-2.5">Cột</th>
                  <th className="px-4 py-2.5">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-rose-50/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.sheet}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-700">{e.rowNumber}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.contractCode ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.field ?? '—'}</td>
                    <td className="px-4 py-2.5 text-rose-600">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tóm tắt dry-run (file hợp lệ) ───────────────────────────────────── */}
      {phase === 'validated' && result && errors.length === 0 && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-black text-emerald-700">File hợp lệ — sẵn sàng nhập</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <SummaryStat value={result.contractsProcessed} label="Căn nhà / hợp đồng" />
            <SummaryStat value={result.renovationLinesImported} label="Dòng cải tạo" />
            <SummaryStat value={result.equipmentRowsImported} label="Dòng thiết bị" />
          </div>
          <p className="mt-4 text-sm text-emerald-700">
            Bấm <b>“Nhập dữ liệu”</b> ở trên để ghi vào hệ thống.
          </p>

          {/* Đính kèm ảnh (.zip) — tùy chọn: add → Kiểm tra ảnh → mới hiện nút Xác nhận */}
          <div className="mt-4 rounded-xl border border-dashed border-emerald-300 bg-white/70 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Images className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-black text-slate-800">
                Đính kèm ảnh (.zip) <span className="font-semibold text-slate-400">— tùy chọn</span>
              </p>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Nén folder ảnh thành <b>.zip</b>, mỗi folder con đặt tên đúng <b>mã hợp đồng</b> trong Excel. Bấm
              <b> Kiểm tra ảnh</b> để đối chiếu trước; ảnh sẽ được gắn khi bạn <b>Xác nhận nhập</b>. Tối đa 200MB · thay thế ảnh hiện có.
            </p>
            {renderZipDropzone()}

            {zipFile && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={runZipCheck}
                  disabled={zipChecking}
                  className="flex items-center gap-2 rounded-xl border border-indigo-300 bg-white px-5 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {zipChecking
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                    : <><CheckCircle2 className="h-4 w-4" /> {zipPreview ? 'Kiểm tra lại' : 'Kiểm tra ảnh'}</>}
                </button>
              </div>
            )}

            {zipCheckError && <p className="mt-3 text-xs font-semibold text-rose-600">{zipCheckError}</p>}

            {zipPreview && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <ZipStat value={zipPreview.matched.length} label="Căn có ảnh" tone="emerald" />
                  <ZipStat value={zipPreview.totalImages} label="Ảnh sẽ gắn" tone="indigo" />
                  <ZipStat value={zipPreview.extra.length} label="Folder thừa" tone={zipPreview.extra.length > 0 ? 'rose' : 'slate'} />
                </div>
                {zipPreview.matched.length > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ảnh hợp lệ — bấm “Xác nhận nhập dữ liệu &amp; gắn ảnh” ở dưới.
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-rose-600">
                    Không folder nào khớp mã hợp đồng — kiểm tra lại tên folder con trong zip.
                  </p>
                )}
                {zipPreview.extra.length > 0 && (
                  <p className="text-xs text-amber-700">
                    ⚠️ Folder không khớp mã nào (sẽ bỏ qua): {zipPreview.extra.map((e) => e.code).join(', ')}
                  </p>
                )}
                {zipPreview.missingCodes.length > 0 && (
                  <p className="text-xs text-amber-700">
                    ⚠️ {zipPreview.missingCodes.length} căn chưa có ảnh: {zipPreview.missingCodes.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Thanh XÁC NHẬN cuối cùng — chỉ hiện sau khi kiểm tra file hợp lệ ──── */}
      {showConfirmBar && (
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-800">Sẵn sàng ghi vào hệ thống</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {zipFile
                ? <>Tạo <b>{result?.contractsProcessed ?? 0} căn nhà</b> và gắn <b>{zipPreview?.totalImages ?? 0} ảnh</b> từ <b>{zipFile.name}</b>.</>
                : <>Tạo <b>{result?.contractsProcessed ?? 0} căn nhà</b> vào hệ thống.</>}
            </p>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition">
            {phase === 'importing'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang nhập...</>
              : <><Upload className="h-4 w-4" /> {zipFile ? 'Xác nhận nhập & gắn ảnh' : 'Xác nhận nhập dữ liệu'}</>}
          </button>
        </div>
      )}

      {/* ── Kết quả import thật ─────────────────────────────────────────────── */}
      {phase === 'done' && result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-black text-emerald-700">
                Nhập thành công {result.results.length} căn nhà
              </p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <SummaryStat value={result.contractsProcessed} label="Căn nhà / hợp đồng" />
              <SummaryStat value={result.renovationLinesImported} label="Dòng cải tạo" />
              <SummaryStat value={result.equipmentRowsImported} label="Dòng thiết bị" />
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-emerald-700">
              <span className="mt-0.5">ℹ️</span>
              <span>
                Các căn vừa nhập đang ở trạng thái <b>Đã hoàn tất cải tạo</b> và <b>chưa có giá cho thuê</b>.
                Hãy mở từng căn ở bước <b>Định giá &amp; Phê duyệt</b> để gửi Host xác nhận giá.
              </span>
            </p>
          </div>

          {result.results.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Căn nhà</th>
                    <th className="px-4 py-2.5">Mã HĐ</th>
                    <th className="px-4 py-2.5">Trạng thái</th>
                    <th className="px-4 py-2.5 text-right">Bước tiếp theo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.propertyId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-bold text-slate-800">{r.propertyName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.contractCode}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                          Đã hoàn tất cải tạo
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/admin/buildings/pricing-approval/${r.propertyId}`)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition">
                            Định giá &amp; gửi Host <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => rollback(r.contractCode)}
                            disabled={rollingBack === r.contractCode}
                            title="Xóa căn vừa nhập (rollback)"
                            className="inline-flex items-center rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition">
                            {rollingBack === r.contractCode
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── BƯỚC 2: Gắn ảnh theo mã hợp đồng (.zip) ──────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Images className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-black text-slate-900">2. Gắn ảnh cho các căn <span className="font-semibold text-slate-400">(tùy chọn)</span></h3>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-slate-500">
              Nén 1 folder ảnh thành <b>.zip</b>, mỗi <b>folder con đặt tên đúng mã hợp đồng</b> trong file Excel.
              Ảnh sẽ tự gán vào căn tương ứng. Tối đa <b>200MB</b>.
            </p>

            {/* Cấu trúc mẫu */}
            <pre className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
{`anh-cac-toa-nha.zip
├── HD-HCM-WH-RENO-01/   →  01-mat-tien.jpg, 02-phong-khach.jpg
└── HD-HCM-ROOM-RENO-01/ →  01-tong-the.png`}
            </pre>

            {/* Cảnh báo ghi đè */}
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Gắn ảnh sẽ <b>thay thế toàn bộ</b> ảnh hiện có của căn (không nối thêm).
                Chỉ nhận <b>jpg, jpeg, png, webp</b>; nên đặt tiền tố <code className="rounded bg-amber-100 px-1">01-</code>, <code className="rounded bg-amber-100 px-1">02-</code> để xếp thứ tự.
              </span>
            </div>

            {/* Chọn file zip */}
            {renderZipDropzone()}

            {/* Hành động zip */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                onClick={() => runZip(true)}
                disabled={!zipFile || zipBusy}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {zipPhase === 'checking'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                  : <><CheckCircle2 className="h-4 w-4" /> Kiểm tra ảnh</>}
              </button>
              <button
                onClick={() => runZip(false)}
                disabled={!canAttachZip || zipBusy}
                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition">
                {zipPhase === 'attaching'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang gắn ảnh...</>
                  : <><Upload className="h-4 w-4" /> Gắn ảnh</>}
              </button>
            </div>

            {/* Lỗi zip */}
            {zipError && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-black text-rose-700">Không thể xử lý file ZIP</p>
                  <p className="mt-0.5 text-sm text-rose-600">{zipError}</p>
                </div>
              </div>
            )}

            {/* Kết quả zip */}
            {zipResult && (
              <div className="mt-5 space-y-4">
                <div className={`rounded-2xl border p-5 ${zipResult.dryRun ? 'border-sky-200 bg-sky-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-5 w-5 ${zipResult.dryRun ? 'text-sky-600' : 'text-emerald-600'}`} />
                    <p className={`text-sm font-black ${zipResult.dryRun ? 'text-sky-700' : 'text-emerald-700'}`}>
                      {zipResult.dryRun
                        ? `Xem trước — ${zipResult.imagesAttached} ảnh sẽ gán cho ${zipResult.contractsMatched} căn`
                        : `Đã gắn ${zipResult.imagesAttached} ảnh cho ${zipResult.contractsMatched} căn`}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ZipStat value={zipResult.contractsInZip} label="Mã trong zip" tone="slate" />
                    <ZipStat value={zipResult.contractsMatched} label="Căn khớp" tone="emerald" />
                    <ZipStat value={zipResult.contractsNotFound} label="Mã không có trong DB" tone={zipResult.contractsNotFound > 0 ? 'rose' : 'slate'} />
                    <ZipStat value={zipResult.imagesAttached} label={zipResult.dryRun ? 'Ảnh sẽ gán' : 'Ảnh đã gán'} tone="indigo" />
                  </div>
                  {zipResult.dryRun && zipResult.contractsMatched > 0 && (
                    <p className="mt-3 text-xs font-bold text-sky-700">
                      → Kiểm tra xong. Bấm <b>“Gắn ảnh”</b> ở trên để xác nhận gắn vào hệ thống.
                    </p>
                  )}
                </div>

                {/* Căn thiếu ảnh (gap 2 — FE tự đối chiếu) */}
                {missingImageCodes.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><b>{missingImageCodes.length} căn chưa có ảnh</b> trong zip: {missingImageCodes.join(', ')}</span>
                  </div>
                )}

                {/* Cảnh báo từ BE (mã trong zip không khớp DB) */}
                {zipResult.warnings.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    {zipResult.warnings.map((w, i) => (
                      <p key={i} className="flex items-start gap-2"><span className="mt-0.5">⚠️</span><span>{w}</span></p>
                    ))}
                  </div>
                )}

                {/* Chi tiết từng mã */}
                {zipResult.results.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5">Mã HĐ</th>
                          <th className="px-4 py-2.5">Căn nhà</th>
                          <th className="px-4 py-2.5">Trạng thái</th>
                          <th className="px-4 py-2.5 text-right">Số ảnh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zipResult.results.map((r, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.contractCode}</td>
                            <td className="px-4 py-2.5 text-slate-700">{r.propertyName ?? '—'}</td>
                            <td className="px-4 py-2.5"><ZipStatusBadge status={r.status} /></td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-700">{r.imagesAttached}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={resetAll}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
              <RotateCcw className="h-4 w-4" /> Nhập file khác
            </button>
            <button onClick={() => navigate('/admin/buildings/pricing-approval')}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition">
              Đến Định giá &amp; Phê duyệt <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title="Xác nhận nhập dữ liệu?"
        message={
          <>
            Hệ thống sẽ tạo <b className="text-slate-700">{result?.contractsProcessed ?? 0} căn nhà</b> cùng hợp đồng,
            chi phí cải tạo và thiết bị từ file <b className="text-slate-700">{file?.name}</b>.
            {zipFile && <> Sau đó tự động <b className="text-slate-700">gắn {zipPreview?.totalImages ?? 0} ảnh</b> từ <b className="text-slate-700">{zipFile.name}</b> theo mã hợp đồng.</>}
            {' '}Thao tác này ghi trực tiếp vào hệ thống.
          </>
        }
        confirmText="Nhập ngay"
        loading={phase === 'importing'}
        onConfirm={() => { setConfirmOpen(false); run(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SummaryStat = ({ value, label }: { value: number; label: string }) => (
  <div className="rounded-xl border border-emerald-200 bg-white p-4 text-center">
    <p className="text-2xl font-black text-emerald-700">{value}</p>
    <p className="mt-0.5 text-xs font-semibold text-emerald-600">{label}</p>
  </div>
);

const ZIP_STAT_TONE = {
  slate: 'text-slate-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-600',
  indigo: 'text-indigo-700',
} as const;

const ZipStat = ({ value, label, tone }: { value: number; label: string; tone: keyof typeof ZIP_STAT_TONE }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
    <p className={`text-xl font-black ${ZIP_STAT_TONE[tone]}`}>{value}</p>
    <p className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-500">{label}</p>
  </div>
);

const ZipStatusBadge = ({ status }: { status: BulkImportImagesResponse['results'][number]['status'] }) => {
  const map: Record<string, { cls: string; label: string }> = {
    ATTACHED: { cls: 'bg-emerald-100 text-emerald-800', label: 'Đã gán' },
    PREVIEW: { cls: 'bg-sky-100 text-sky-800', label: 'Sẽ gán' },
    NOT_FOUND: { cls: 'bg-rose-100 text-rose-800', label: 'Không khớp căn' },
    NO_IMAGES: { cls: 'bg-slate-100 text-slate-700', label: 'Không có ảnh' },
  };
  const { cls, label } = map[status] ?? map.NO_IMAGES;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{label}</span>;
};

const MasterCard = ({
  icon: Icon, label, item, unit,
}: { icon: typeof MapPin; label: string; item: MasterItem; unit: string }) => {
  const ok = !item.loading && !item.error && (item.count ?? 0) > 0;
  const empty = !item.loading && !item.error && (item.count ?? 0) === 0;
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${
      item.error ? 'border-rose-200 bg-rose-50' : empty ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
    }`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        item.error ? 'bg-rose-100 text-rose-600' : empty ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
      }`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {item.loading ? (
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải...
          </p>
        ) : item.error ? (
          <p className="text-sm font-bold text-rose-600">Không tải được</p>
        ) : (
          <p className={`text-sm font-black ${ok ? 'text-slate-800' : 'text-amber-700'}`}>
            {item.count} {unit}{empty ? ' — cần khai báo' : ''}
          </p>
        )}
      </div>
    </div>
  );
};
