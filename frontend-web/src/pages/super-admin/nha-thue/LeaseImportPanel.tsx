import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Download, FileArchive, FileSpreadsheet, FileWarning,
  Loader2, MapPin, RotateCcw, Trash2, Upload, X,
} from 'lucide-react';
import { importService, isBulkImportError } from '../../../services/import.service';
import { zoneService } from '../../../services/zone.service';
import type { BulkImportError, BulkImportResponse, BulkImportImagesResponse } from '../../../types/api.types';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { inspectZipImages, type ZipImagePreview } from '../../../utils/zipImageInspect';

const TEMPLATE_URL = '/templates/SLMS2026_import_dot1_khoi_tao.xlsx';
const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const MAX_ZIP_BYTES = 200 * 1024 * 1024; // BE multipart max-file-size = 200MB

type Phase = 'idle' | 'validating' | 'validated' | 'importing' | 'done';

const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);
const isZip = (f: File) => /\.zip$/i.test(f.name);
const formatBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

// ── Phát hiện Khu vực (Tỉnh/TP + Quận/Huyện) chưa tồn tại từ message lỗi dry-run của BE ──
// BE chỉ có 2 cấp zone; message khi thiếu:
//   "Không tìm thấy Tỉnh/Thành phố (Zone level 1): <tỉnh>"
//   "Không tìm thấy Quận/Huyện (Zone level 2) '<quận>' thuộc <tỉnh>"
type MissingZones = { cities: string[]; districts: { district: string; city: string }[] };
const normZone = (s: string) =>
  s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const CITY_NOT_FOUND_RE = /Không tìm thấy Tỉnh\/Thành phố \(Zone level 1\):\s*(.+?)\s*$/;
const DISTRICT_NOT_FOUND_RE = /Không tìm thấy Quận\/Huyện \(Zone level 2\)\s*'(.+?)'\s*thuộc\s*(.+?)\s*$/;

function parseMissingZones(errs: BulkImportError[]): MissingZones {
  const cities = new Map<string, string>();
  const districts = new Map<string, { district: string; city: string }>();
  for (const e of errs) {
    const msg = e.message ?? '';
    const dm = msg.match(DISTRICT_NOT_FOUND_RE);
    if (dm) {
      const district = dm[1].trim();
      const city = dm[2].trim();
      districts.set(`${normZone(city)}|${normZone(district)}`, { district, city });
      continue;
    }
    const cm = msg.match(CITY_NOT_FOUND_RE);
    if (cm) {
      const city = cm[1].trim();
      cities.set(normZone(city), city);
    }
  }
  return { cities: [...cities.values()], districts: [...districts.values()] };
}

const StepDot = ({ n, done }: { n: number; done?: boolean }) => (
  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
    done ? 'bg-emerald-500 text-white' : 'bg-indigo-100 text-indigo-700'
  }`}>
    {done ? <CheckCircle2 className="h-4 w-4" /> : n}
  </span>
);

/**
 * Panel "Nhập nhà từ Excel" — module Khởi tạo nhà.
 * Luồng: 1) Kiểm tra file → 2) Kiểm tra ảnh (.zip, tùy chọn) → 3) Nhập nhà.
 * Nút "Nhập nhà" CHỈ bật khi file hợp lệ và (không kèm zip HOẶC đã kiểm tra ảnh xong).
 * Khi nhập thật: tạo nhà (lease-excel) rồi tự gắn ảnh (property-images-zip).
 */
export const LeaseImportPanel = ({ onImported }: { onImported?: () => void }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<BulkImportResponse | null>(null);
  const [errors, setErrors] = useState<BulkImportError[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  // Khu vực (Tỉnh/Quận) trong file chưa có trong Quản lý Khu vực
  const [missingZones, setMissingZones] = useState<MissingZones>({ cities: [], districts: [] });
  const [zoneConfirmOpen, setZoneConfirmOpen] = useState(false);
  const [creatingZones, setCreatingZones] = useState(false);

  // Ảnh (.zip) — kiểm tra client-side TRƯỚC khi nhập, gắn thật khi bấm "Nhập nhà".
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipDragOver, setZipDragOver] = useState(false);
  const [zipPreview, setZipPreview] = useState<ZipImagePreview | null>(null);
  const [zipChecking, setZipChecking] = useState(false);
  const [zipCheckError, setZipCheckError] = useState('');
  const [zipResult, setZipResult] = useState<BulkImportImagesResponse | null>(null);

  const resetZip = () => {
    setZipFile(null); setZipPreview(null); setZipCheckError(''); setZipResult(null);
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  const resetZones = () => { setMissingZones({ cities: [], districts: [] }); setZoneConfirmOpen(false); };

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!isExcel(f)) { toast.error('Chỉ chấp nhận file Excel (.xlsx hoặc .xls)'); return; }
    setFile(f); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    resetZip(); resetZones();
  };

  const resetAll = () => {
    setFile(null); setPhase('idle'); setResult(null); setErrors([]); setErrorMessage('');
    if (inputRef.current) inputRef.current.value = '';
    resetZip(); resetZones();
  };

  const pickZip = (f: File | null | undefined) => {
    if (!f) return;
    if (!isZip(f)) { toast.error('Chỉ chấp nhận file .zip'); return; }
    if (f.size > MAX_ZIP_BYTES) { toast.error('File ZIP vượt 200MB'); return; }
    setZipFile(f); setZipPreview(null); setZipCheckError('');
  };

  // Bước 1: kiểm tra file Excel (dry-run, không ghi DB).
  const validate = async () => {
    if (!file) return;
    setPhase('validating'); setErrors([]); setErrorMessage(''); setZipPreview(null); resetZones();
    try {
      const res = await importService.importLeaseExcel(file, true);
      setResult(res);
      setPhase('validated');
      toast.success(`File hợp lệ — ${res.contractsProcessed} căn sẵn sàng nhập`);
    } catch (err) {
      if (isBulkImportError(err)) {
        setErrors(err.errors);
        setErrorMessage(err.errors.length ? '' : err.message);
        // Tách riêng lỗi "khu vực chưa tồn tại" → mời tạo tự động
        const mz = parseMissingZones(err.errors);
        if (mz.cities.length || mz.districts.length) {
          setMissingZones(mz);
          setZoneConfirmOpen(true);
          toast.error('Có khu vực trong file chưa tồn tại trong hệ thống');
        } else {
          toast.error(err.errors.length ? `File có ${err.errors.length} lỗi cần sửa` : err.message);
        }
      } else {
        setErrorMessage('Có lỗi không xác định khi xử lý file.');
        toast.error('Có lỗi không xác định khi xử lý file.');
      }
      setPhase('idle');
    }
  };

  // Tạo các khu vực còn thiếu (Tỉnh/TP trước → Quận/Huyện) rồi tự kiểm tra lại file.
  const handleAutoCreateZones = async () => {
    if (!file) return;
    setCreatingZones(true);
    const created: string[] = [];
    try {
      let pending = missingZones;
      for (let round = 0; round < 4; round++) {
        if (pending.cities.length === 0 && pending.districts.length === 0) break;

        const roots = await zoneService.getRootZones();
        const cityIdByName = new Map(roots.map((z) => [normZone(z.name), z.id]));

        // 1) Tỉnh/TP (level 1)
        for (const city of pending.cities) {
          if (!cityIdByName.has(normZone(city))) {
            const z = await zoneService.createZone({ name: city, level: 1 });
            cityIdByName.set(normZone(city), z.id);
            created.push(`Tỉnh/TP: ${city}`);
          }
        }

        // 2) Quận/Huyện (level 2, parent = Tỉnh; tạo cả Tỉnh nếu vẫn thiếu)
        for (const d of pending.districts) {
          let cityId = cityIdByName.get(normZone(d.city));
          if (!cityId) {
            const z = await zoneService.createZone({ name: d.city, level: 1 });
            cityId = z.id;
            cityIdByName.set(normZone(d.city), z.id);
            created.push(`Tỉnh/TP: ${d.city}`);
          }
          const children = await zoneService.getChildrenZones(cityId);
          if (!children.some((c) => normZone(c.name) === normZone(d.district))) {
            await zoneService.createZone({ name: d.district, level: 2, parentId: cityId });
            created.push(`Quận/Huyện: ${d.district} (thuộc ${d.city})`);
          }
        }

        // 3) Kiểm tra lại file
        try {
          const res = await importService.importLeaseExcel(file, true);
          setResult(res); setErrors([]); setErrorMessage('');
          setMissingZones({ cities: [], districts: [] });
          setPhase('validated');
          pending = { cities: [], districts: [] };
          break;
        } catch (err) {
          if (isBulkImportError(err)) {
            setErrors(err.errors);
            setErrorMessage(err.errors.length ? '' : err.message);
            pending = parseMissingZones(err.errors);
            setMissingZones(pending);
            setPhase('idle');
          } else {
            throw err;
          }
        }
      }

      if (created.length) toast.success(`Đã tạo ${created.length} khu vực mới vào Quản lý Khu vực`);
      if (pending.cities.length || pending.districts.length) {
        toast.error('Vẫn còn khu vực chưa tạo được — vui lòng kiểm tra Quản lý Khu vực.');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Lỗi khi tạo khu vực');
    } finally {
      setCreatingZones(false);
      setZoneConfirmOpen(false);
    }
  };

  // Bước 2: kiểm tra ảnh ngay trên web (đối chiếu mã HĐ trong file Excel đã dry-run).
  const checkZip = async () => {
    if (!zipFile || !result) return;
    setZipChecking(true); setZipCheckError('');
    try {
      const codes = result.results.map((r) => r.contractCode).filter(Boolean);
      const preview = await inspectZipImages(zipFile, codes);
      setZipPreview(preview);
      if (preview.matched.length === 0) toast.error('Không folder ảnh nào khớp mã hợp đồng trong file');
      else toast.success(`Khớp ${preview.matched.length} căn — ${preview.totalImages} ảnh sẽ gắn`);
    } catch {
      setZipCheckError('Không đọc được file ZIP. Kiểm tra lại định dạng .zip.');
      toast.error('Không đọc được file ZIP');
    } finally {
      setZipChecking(false);
    }
  };

  // Bước 3: nhập thật — tạo nhà rồi gắn ảnh (nếu có).
  const doImport = async () => {
    if (!file) return;
    setPhase('importing'); setErrors([]); setErrorMessage('');
    try {
      const res = await importService.importLeaseExcel(file, false);
      setResult(res);
      if (zipFile) {
        try {
          const zr = await importService.importPropertyImagesZip(zipFile, false);
          setZipResult(zr);
        } catch (zerr) {
          toast.error(isBulkImportError(zerr) ? zerr.message : 'Nhập nhà OK nhưng gắn ảnh lỗi.');
        }
      }
      setPhase('done');
      toast.success(`Đã nhập ${res.contractsProcessed} căn nhà`);
      onImported?.();
    } catch (err) {
      if (isBulkImportError(err)) {
        setErrors(err.errors);
        setErrorMessage(err.errors.length ? '' : err.message);
        toast.error(err.errors.length ? `File có ${err.errors.length} lỗi cần sửa` : err.message);
      } else {
        setErrorMessage('Có lỗi không xác định khi xử lý file.');
        toast.error('Có lỗi không xác định khi xử lý file.');
      }
      setPhase('validated');
    }
  };

  const rollback = async (contractCode: string) => {
    if (!window.confirm(`Xóa căn vừa nhập theo mã HĐ "${contractCode}"?`)) return;
    setRollingBack(contractCode);
    try {
      const res = await importService.deleteImportedContract(contractCode);
      toast.success(`Đã xóa "${res.propertyName}"`);
      setResult(prev => prev ? { ...prev, results: prev.results.filter(x => x.contractCode !== contractCode) } : prev);
      onImported?.();
    } catch (err) {
      toast.error(isBulkImportError(err) ? err.message : 'Lỗi khi xóa căn đã import');
    } finally {
      setRollingBack(null);
    }
  };

  const busy = phase === 'validating' || phase === 'importing';
  const validOk = (phase === 'validated' || phase === 'importing') && !!result && errors.length === 0 && result.errors.length === 0 && !errorMessage;
  const zipReady = !zipFile || !!zipPreview;            // chưa kèm zip thì coi như sẵn sàng
  const canImport = validOk && zipReady && !busy;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Nhập nhà từ Excel</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            File gồm hợp đồng thuê và thiết bị bàn giao. Kiểm tra file (và ảnh nếu có) rồi mới nhập.
          </p>
        </div>
        <a href={TEMPLATE_URL} download
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition">
          <Download className="h-4 w-4" /> Tải template
        </a>
      </div>

      {/* ── BƯỚC 1: Chọn & kiểm tra file ───────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2.5 text-sm font-bold text-slate-900">
          <StepDot n={1} done={phase === 'validated' || phase === 'importing' || phase === 'done'} /> Kiểm tra file Excel
        </div>

        {!file ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}>
            <Upload className="h-8 w-8 text-slate-300" />
            <span className="text-sm font-semibold text-slate-600">Kéo thả hoặc bấm để chọn file Excel</span>
            <span className="text-xs text-slate-400">.xlsx · .xls</span>
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
                  <tr><th className="px-4 py-2">Sheet</th><th className="px-4 py-2">Dòng</th><th className="px-4 py-2">Cột</th><th className="px-4 py-2">Lỗi</th></tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{e.sheet}</td>
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

        {(missingZones.cities.length > 0 || missingZones.districts.length > 0) && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">
                {missingZones.cities.length + missingZones.districts.length} khu vực trong file chưa có trong Quản lý Khu vực
              </p>
              <p className="mt-0.5 text-xs text-amber-700">Hệ thống có thể tự tạo các khu vực này để tiếp tục nhập.</p>
            </div>
            <button onClick={() => setZoneConfirmOpen(true)}
              className="shrink-0 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-700 transition">
              Tạo tự động
            </button>
          </div>
        )}

        {phase !== 'done' && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {validOk && (
              <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> File hợp lệ — {result!.contractsProcessed} căn · {result!.equipmentRowsImported} thiết bị bàn giao
                {result!.contractsSkipped > 0 && ` · ${result!.contractsSkipped} bỏ qua`}
              </p>
            )}
            <button
              onClick={validate}
              disabled={!file || busy}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {phase === 'validating'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                : <><CheckCircle2 className="h-4 w-4" /> {validOk ? 'Kiểm tra lại' : 'Kiểm tra file'}</>}
            </button>
          </div>
        )}
      </div>

      {/* ── BƯỚC 2: Kiểm tra ảnh (.zip) — tùy chọn ─────────────────────────── */}
      {validOk && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <StepDot n={2} done={!!zipPreview} /> Kiểm tra ảnh (.zip) <span className="font-medium text-slate-400">— tùy chọn</span>
          </div>
          <p className="mb-4 ml-8 text-xs text-slate-500">
            Nén folder ảnh thành .zip, mỗi folder con đặt tên đúng <b>mã hợp đồng</b>. Tối đa 200MB · thay thế ảnh hiện có.
          </p>

          {!zipFile ? (
            <label
              onDragOver={(e) => { e.preventDefault(); setZipDragOver(true); }}
              onDragLeave={() => setZipDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setZipDragOver(false); pickZip(e.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm font-semibold text-slate-500 transition ${
                zipDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}>
              <FileArchive className="h-5 w-5 text-slate-300" /> Kéo thả hoặc bấm để chọn file .zip
              <input ref={zipInputRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
                onChange={(e) => pickZip(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <FileArchive className="h-5 w-5 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{zipFile.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(zipFile.size)}</p>
              </div>
              {!busy && (
                <button onClick={resetZip} title="Bỏ chọn zip"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-600 transition">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {zipCheckError && <p className="mt-3 text-xs font-semibold text-rose-600">{zipCheckError}</p>}

          {zipPreview && (
            <div className="mt-3 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-semibold text-emerald-700">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Khớp {zipPreview.matched.length} căn · {zipPreview.totalImages} ảnh sẽ gắn
              </p>
              {zipPreview.extra.length > 0 && (
                <p className="text-amber-700">⚠️ Folder không khớp (bỏ qua): {zipPreview.extra.map(e => e.code).join(', ')}</p>
              )}
              {zipPreview.missingCodes.length > 0 && (
                <p className="text-amber-700">⚠️ {zipPreview.missingCodes.length} căn chưa có ảnh: {zipPreview.missingCodes.join(', ')}</p>
              )}
            </div>
          )}

          {zipFile && (
            <div className="mt-4 flex justify-end">
              <button onClick={checkZip} disabled={zipChecking || busy}
                className="flex items-center gap-2 rounded-xl border border-indigo-300 bg-white px-5 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition">
                {zipChecking ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</> : <><CheckCircle2 className="h-4 w-4" /> {zipPreview ? 'Kiểm tra lại ảnh' : 'Kiểm tra ảnh'}</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BƯỚC 3: Nhập nhà ───────────────────────────────────────────────── */}
      {validOk && (
        <div className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <StepDot n={3} />
            <div>
              <p className="text-sm font-bold text-slate-800">Nhập nhà vào hệ thống</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {!zipReady
                  ? 'Bạn đã đính kèm ảnh — hãy bấm “Kiểm tra ảnh” ở bước 2 trước khi nhập.'
                  : zipFile
                    ? <>Tạo <b>{result!.contractsProcessed} căn</b> và gắn <b>{zipPreview?.totalImages ?? 0} ảnh</b>.</>
                    : <>Tạo <b>{result!.contractsProcessed} căn</b> vào hệ thống.</>}
              </p>
            </div>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canImport}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition">
            {phase === 'importing'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang nhập...</>
              : <><Upload className="h-4 w-4" /> Nhập {result!.contractsProcessed} căn</>}
          </button>
        </div>
      )}

      {/* ── Kết quả ────────────────────────────────────────────────────────── */}
      {phase === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Đã nhập {result.contractsProcessed} căn nhà
            {result.contractsSkipped > 0 && ` · ${result.contractsSkipped} bỏ qua`}
            {zipResult && ` · gắn ${zipResult.imagesAttached} ảnh`} — sang Cấu hình khai thác để nhập cải tạo.
          </div>

          {result.results.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5">Căn nhà</th><th className="px-4 py-2.5">Mã HĐ</th><th className="px-4 py-2.5">Trạng thái</th><th className="px-4 py-2.5 text-right">Bước tiếp theo</th></tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.contractCode} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.propertyName ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.contractCode}</td>
                      <td className="px-4 py-3">
                        {r.importStatus === 'SKIPPED' ? (
                          <span title={r.message ?? ''} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Bỏ qua</span>
                        ) : (
                          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">Đã khởi tạo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.importStatus === 'IMPORTED' && r.propertyId != null ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => navigate(`/admin/buildings/configuration/${r.propertyId}`)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition">
                              Cấu hình khai thác <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => rollback(r.contractCode)} disabled={rollingBack === r.contractCode}
                              title="Xóa căn vừa nhập" className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 disabled:opacity-50 transition">
                              {rollingBack === r.contractCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-xs text-slate-400">{r.message ?? '—'}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={resetAll}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              <RotateCcw className="h-4 w-4" /> Nhập file khác
            </button>
            <button onClick={() => navigate('/admin/buildings/configuration')}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
              Đến Cấu hình khai thác <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title="Xác nhận nhập dữ liệu?"
        message={
          <>Hệ thống sẽ tạo <b className="text-slate-700">{result?.contractsProcessed ?? 0} căn nhà</b> từ
          file <b className="text-slate-700">{file?.name}</b>
          {zipFile && <> và gắn <b className="text-slate-700">{zipPreview?.totalImages ?? 0} ảnh</b> theo mã hợp đồng</>}.
          {' '}Thao tác này ghi trực tiếp vào hệ thống.</>
        }
        confirmText="Nhập ngay"
        loading={phase === 'importing'}
        onConfirm={() => { setConfirmOpen(false); doImport(); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Popup: khu vực chưa tồn tại → tạo tự động */}
      <ConfirmDialog
        open={zoneConfirmOpen}
        tone="warning"
        title="Một số khu vực chưa có trong hệ thống"
        message={
          <div className="space-y-2">
            <p>Các khu vực sau trong file <b className="text-slate-700">chưa có</b> trong module <b className="text-slate-700">Quản lý Khu vực</b>:</p>
            <ul className="max-h-44 space-y-1.5 overflow-auto rounded-lg bg-slate-50 p-3">
              {missingZones.cities.map((c) => (
                <li key={`c-${c}`} className="flex items-center gap-2 text-slate-700">
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">TỈNH/TP</span>
                  <b>{c}</b>
                </li>
              ))}
              {missingZones.districts.map((d) => (
                <li key={`d-${d.city}-${d.district}`} className="flex items-center gap-2 text-slate-700">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">QUẬN/HUYỆN</span>
                  <b>{d.district}</b> <span className="text-xs text-slate-400">thuộc {d.city}</span>
                </li>
              ))}
            </ul>
            <p>Bạn có muốn hệ thống <b className="text-slate-700">tự động tạo</b> các khu vực này (kèm quận/huyện liên quan nếu cần) rồi <b className="text-slate-700">kiểm tra lại file</b> không?</p>
          </div>
        }
        confirmText="Tạo khu vực & kiểm tra lại"
        cancelText="Để tôi tự thêm"
        loading={creatingZones}
        onConfirm={handleAutoCreateZones}
        onCancel={() => setZoneConfirmOpen(false)}
      />
    </div>
  );
};
