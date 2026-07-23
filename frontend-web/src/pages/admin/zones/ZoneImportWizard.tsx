import { useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { zoneService } from '@/services/zone.service';
import type { ZoneBulkImportResponse, BulkImportError } from '@/types/api.types';

type Step = 'select' | 'checking' | 'preview' | 'structural-error' | 'importing' | 'result';

interface Props {
  onClose: () => void;
  /** Gọi ngay sau khi import thật thành công — parent tự refresh danh sách zone. */
  onImported: (result: ZoneBulkImportResponse) => void;
  /** Bấm "Bổ sung tọa độ ngay" ở bước kết quả — parent tự đóng wizard & mở modal geocode hàng loạt. */
  onRequestGeocodeMissing: () => void;
}

const SAMPLE_FILE_URL = '/SLMS2026_import_zones.xlsx';

const actionLabel: Record<string, string> = {
  CREATED: 'Tạo mới',
  SKIPPED: 'Bỏ qua',
  UPDATED: 'Cập nhật',
};
const actionColor: Record<string, string> = {
  CREATED: 'bg-emerald-50 text-emerald-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
  UPDATED: 'bg-amber-50 text-amber-700',
};

export const ZoneImportWizard = ({ onClose, onImported, onRequestGeocodeMissing }: Props) => {
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ZoneBulkImportResponse | null>(null);
  const [validationErrors, setValidationErrors] = useState<BulkImportError[] | null>(null);
  const [structuralError, setStructuralError] = useState('');
  const [finalResult, setFinalResult] = useState<ZoneBulkImportResponse | null>(null);

  const handleFilePick = (f: File | null) => {
    setFile(f);
    setDryRunResult(null);
    setValidationErrors(null);
    setStructuralError('');
  };

  // BE hiện trả 500 thô (không phải 422 thân thiện) khi file KHÔNG PHẢI Excel hợp lệ
  // (đã verify sống 19/07 — NotOfficeXmlFileException lộ nguyên văn). Bọc lại ở FE
  // thành message dễ hiểu thay vì hiện lỗi exception nội bộ cho admin.
  const readImportError = (err: any): { kind: '400' | '422-or-500'; errors?: BulkImportError[]; message: string } => {
    const status = err?.response?.status;
    if (status === 400) {
      return { kind: '400', errors: err.response?.data?.errors ?? [], message: err.response?.data?.message ?? '' };
    }
    if (status === 422) {
      return { kind: '422-or-500', message: err.response?.data?.error || 'File không hợp lệ.' };
    }
    return { kind: '422-or-500', message: 'File không đọc được — kiểm tra lại có đúng là file Excel (.xlsx/.xls) hợp lệ không.' };
  };

  const handleCheck = async () => {
    if (!file) return;
    setStep('checking');
    try {
      const result = await zoneService.importZonesExcel(file, true);
      setDryRunResult(result);
      setStep('preview');
    } catch (err: any) {
      const parsed = readImportError(err);
      if (parsed.kind === '400') {
        setValidationErrors(parsed.errors ?? []);
        setStep('structural-error');
      } else {
        setStructuralError(parsed.message);
        setValidationErrors(null);
        setStep('structural-error');
      }
    }
  };

  const handleImportReal = async () => {
    if (!file) return;
    setStep('importing');
    try {
      const result = await zoneService.importZonesExcel(file, false);
      setFinalResult(result);
      onImported(result);
      setStep('result');
    } catch (err: any) {
      const parsed = readImportError(err);
      if (parsed.kind === '400') {
        setValidationErrors(parsed.errors ?? []);
      } else {
        setStructuralError(parsed.message);
        setValidationErrors(null);
      }
      setStep('structural-error');
    }
  };

  const resetToSelect = () => {
    setFile(null);
    setDryRunResult(null);
    setValidationErrors(null);
    setStructuralError('');
    setStep('select');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">Import khu vực từ Excel</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Bước 1 — chọn file */}
          {step === 'select' && (
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-cyan-400">
                {file ? (
                  <>
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <FileSpreadsheet className="h-4 w-4" /> {file.name}
                    </span>
                    <span className="text-xs text-slate-400">Bấm để chọn file khác</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-7 w-7 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">Kéo thả .xlsx vào đây hoặc chọn file</span>
                    <span className="text-xs text-slate-400">File 2 sheet: 1. Tinh_Thanh · 2. Quan_Huyen</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
                />
              </label>
              <a
                href={SAMPLE_FILE_URL}
                download
                className="flex items-center gap-1.5 text-sm font-semibold text-cyan-600 hover:underline"
              >
                <Download className="h-4 w-4" /> Tải file mẫu SLMS2026_import_zones.xlsx
              </a>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Hủy
                </button>
                <button
                  onClick={handleCheck}
                  disabled={!file}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                >
                  Kiểm tra file →
                </button>
              </div>
            </div>
          )}

          {/* Đang kiểm tra / đang import */}
          {(step === 'checking' || step === 'importing') && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
              <p className="text-sm">{step === 'checking' ? 'Đang kiểm tra file…' : 'Đang import vào hệ thống…'}</p>
            </div>
          )}

          {/* Lỗi cấu trúc / validation */}
          {step === 'structural-error' && (
            <div className="space-y-4">
              {validationErrors ? (
                <>
                  <div className="flex items-center gap-2 text-rose-600 font-semibold">
                    <AlertTriangle className="h-5 w-5" /> File có {validationErrors.length} lỗi — sửa Excel rồi tải lại.
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Sheet</th>
                          <th className="px-3 py-2">Dòng</th>
                          <th className="px-3 py-2">Cột</th>
                          <th className="px-3 py-2">Thông báo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validationErrors.map((e, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-600">{e.sheet}</td>
                            <td className="px-3 py-2 text-slate-600">{e.rowNumber}</td>
                            <td className="px-3 py-2 text-slate-600">{e.field ?? '—'}</td>
                            <td className="px-3 py-2 text-rose-600">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p>{structuralError}</p>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button onClick={resetToSelect} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900">
                  ← Chọn lại file
                </button>
              </div>
            </div>
          )}

          {/* Bước 2 — preview dry-run */}
          {step === 'preview' && dryRunResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-5 w-5" /> File hợp lệ — xem trước rồi import
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="font-bold text-slate-800">Tỉnh/TP</p>
                  <p className="text-slate-500">Sẽ tạo {dryRunResult.citiesCreated} · bỏ qua {dryRunResult.citiesSkipped}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="font-bold text-slate-800">Quận/Huyện</p>
                  <p className="text-slate-500">
                    Sẽ tạo {dryRunResult.districtsCreated} · bỏ qua {dryRunResult.districtsSkipped} · cập nhật toạ độ {dryRunResult.districtsUpdated}
                  </p>
                </div>
              </div>
              {dryRunResult.districtsMissingCoords > 0 && (
                <p className="text-sm text-amber-600">
                  ⚠ {dryRunResult.districtsMissingCoords} quận sẽ thiếu toạ độ (có thể Geocode sau).
                </p>
              )}
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Sheet</th>
                      <th className="px-3 py-2">Khu vực</th>
                      <th className="px-3 py-2">Hành động</th>
                      <th className="px-3 py-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dryRunResult.results.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-500">{r.sheet}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">{r.zoneName}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${actionColor[r.action]}`}>
                            {actionLabel[r.action] ?? r.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetToSelect} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  ← Chọn lại
                </button>
                <button
                  onClick={handleImportReal}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700"
                >
                  Import vào hệ thống
                </button>
              </div>
            </div>
          )}

          {/* Bước 3 — kết quả sau import thật */}
          {step === 'result' && finalResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <CheckCircle2 className="h-5 w-5" /> Đã import khu vực
              </div>
              <p className="text-sm text-slate-600">
                Tạo {finalResult.citiesCreated} tỉnh · {finalResult.districtsCreated} quận · Bỏ qua{' '}
                {finalResult.citiesSkipped + finalResult.districtsSkipped} · Cập nhật toạ độ {finalResult.districtsUpdated}
              </p>
              {finalResult.districtsMissingCoords > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p>{finalResult.districtsMissingCoords} quận còn thiếu toạ độ tâm — nên bổ sung để gợi ý vị trí sau này.</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Về danh sách khu vực
                </button>
                {finalResult.districtsMissingCoords > 0 && (
                  <button
                    onClick={onRequestGeocodeMissing}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700"
                  >
                    Bổ sung toạ độ ngay
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
