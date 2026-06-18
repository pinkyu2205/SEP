import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet,
  FileWarning, Loader2, MapPin, Package, RefreshCw, RotateCcw, ShieldCheck,
  Sparkles, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import { importService, isBulkImportError } from '../../../services/import.service';
import { catalogService } from '../../../services/catalog.service';
import { zoneService } from '../../../services/zone.service';
import type { BulkImportError, BulkImportResponse } from '../../../types/api.types';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

const TEMPLATE_URL = '/templates/SLMS2026_v2.xlsx';
const ACCEPT = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

type Phase = 'idle' | 'validating' | 'validated' | 'importing' | 'done';

const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);

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

  const resetAll = () => {
    setFile(null);
    setPhase('idle');
    setResult(null);
    setErrors([]);
    setErrorMessage('');
    if (inputRef.current) inputRef.current.value = '';
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
  const canImport = phase === 'validated' && errors.length === 0 && !!result && !result.errors.length;

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

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {phase === 'validated'
              ? 'Bước 2: Bấm “Nhập dữ liệu” để ghi vào hệ thống.'
              : 'Bước 1: Kiểm tra file trước (không ghi dữ liệu).'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => run(true)}
              disabled={!file || busy}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {phase === 'validating'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...</>
                : <><CheckCircle2 className="h-4 w-4" /> Kiểm tra file</>}
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canImport || busy}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition">
              {phase === 'importing'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang nhập...</>
                : <><Upload className="h-4 w-4" /> Nhập dữ liệu</>}
            </button>
          </div>
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
            Thao tác này ghi trực tiếp vào hệ thống.
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
