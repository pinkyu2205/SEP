import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Droplets, FileUp, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  waterBillService, waterUnitPrice, type WaterBill,
} from '@/services/waterBill.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import { monthPeriod, onlyDigits } from '@/utils/evnInvoiceParser';
import { SectionShell, StatusPill, EmptyState, formatVnd } from './shared';
import { PropertyCombobox } from './EvnBillPublishing';
import { parseWaterInvoice } from '@/utils/waterInvoiceParser';
import { serverNow } from '@/utils/serverTime';

/**
 * PHÁT HÀNH HOÁ ĐƠN NƯỚC (admin) — song sinh với `EvnBillPublishing`.
 *
 * Cùng mô hình đã áp cho điện 13/08/2026: admin chốt hoá đơn của cả nhà, hệ thống suy
 * đơn giá m³, manager chỉ ĐỌC rồi ghi chỉ số từng phòng. Trước đó manager tự khai đơn giá
 * nước ngay trong app — không ai kiểm được.
 *
 * ⚠️ BE CHƯA CÓ ENDPOINT (14/08/2026) — xem doc/BE-NEED-water-bill-admin-2026-08-14.md.
 * Trang dựng sẵn theo contract đã chốt trong doc; BE ship là chạy, không phải sửa FE.
 * Trong lúc chờ, mọi lời gọi sẽ 404 và trang hiện đúng thông báo lỗi chứ không vỡ.
 *
 * Cố ý KHÔNG clone nguyên 1148 dòng của trang EVN: trang này giữ đúng luồng chính
 * (chọn nhà → nhập tổng m³/tổng tiền → kỳ → ảnh → phát hành → danh sách đã phát hành).
 * Việc gộp hai trang thành một component dùng chung nên làm khi cả hai đã chạy thật —
 * gộp lúc một bên còn chưa có API là tối ưu hoá dựa trên phỏng đoán.
 */

interface BillForm {
  totalQuantity: string;
  totalAmount: string;
  billingPeriod: string;
}
const EMPTY_FORM: BillForm = { totalQuantity: '', totalAmount: '', billingPeriod: '' };

const PROPERTY_PAGE_SIZE = 200;

export const WaterBillPublishing = () => {
  const now = serverNow();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propertyId, setPropertyId] = useState<number | null>(null);

  const [bills, setBills] = useState<WaterBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billsError, setBillsError] = useState<string | null>(null);

  const [form, setForm] = useState<BillForm>(EMPTY_FORM);
  const [imageUrl, setImageUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Câu nhắc sau khi đọc ảnh — OCR chỉ là gợi ý, admin vẫn phải soát. */
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Ảnh đang xem phóng to. Hoá đơn nước chữ nhỏ, xem ở khung thumbnail không đọc nổi số. */
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const selectedMonthPeriod = useMemo(
    () => monthPeriod(0, new Date(year, month - 1, 1)),
    [month, year],
  );
  const prevMonthPeriod = useMemo(
    () => monthPeriod(-1, new Date(year, month - 1, 1)),
    [month, year],
  );

  useEffect(() => {
    setForm((f) => (f.billingPeriod ? f : { ...f, billingPeriod: selectedMonthPeriod }));
  }, [selectedMonthPeriod]);

  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    try {
      const page = await propertyService.getProperties(0, PROPERTY_PAGE_SIZE);
      setProperties(page?.content ?? []);
    } catch {
      setProperties([]);
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadBills = useCallback(async () => {
    setLoadingBills(true);
    setBillsError(null);
    try {
      setBills(await waterBillService.list({ month, year }));
    } catch (e: any) {
      // BE chưa có endpoint thì rơi vào đây — nói thẳng chứ đừng hiện "chưa có hoá đơn
      // nào", admin sẽ tưởng dữ liệu trống trong khi thực ra chưa gọi được API.
      setBillsError(e?.response?.data?.message || e?.message || 'Không tải được danh sách hoá đơn nước.');
      setBills([]);
    } finally {
      setLoadingBills(false);
    }
  }, [month, year]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadBills(); }, [loadBills]);

  const quantity = Number(onlyDigits(form.totalQuantity) || 0);
  const amount = Number(onlyDigits(form.totalAmount) || 0);
  /** Đơn giá CHƯA làm tròn — xem chú thích ở waterUnitPrice. Chỉ làm tròn khi in ra. */
  const unitPrice = waterUnitPrice(amount, quantity);

  /** Nhà đã có hoá đơn nước kỳ này — combobox gắn nhãn để admin khỏi chọn trùng. */
  const publishedIds = useMemo(
    () => new Set(bills.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [bills],
  );

  const existingBill = useMemo(
    () => bills.find((b) => b.propertyId === propertyId && b.status !== 'REVOKED'),
    [bills, propertyId],
  );

  const formReady = !!propertyId && quantity > 0 && amount > 0
    && !!form.billingPeriod.trim() && !existingBill;

  /**
   * Upload ảnh rồi ĐỌC THỬ để điền sẵn 3 ô. Chỉ điền vào ô còn TRỐNG — admin đã gõ tay
   * thì OCR không được đè lên, mất số vừa gõ vì một lần đổi ảnh là lỗi khó chịu.
   */
  const pickImage = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setScanNote(null);
    try {
      const url = await uploadToCloudinary(file);
      setImageUrl(url);
      try {
        const parsed = parseWaterInvoice(await waterBillService.ocr(url));
        setForm((f) => ({
          totalQuantity: f.totalQuantity || (parsed.totalQuantity != null ? String(parsed.totalQuantity) : ''),
          totalAmount: f.totalAmount || (parsed.totalAmount != null ? String(parsed.totalAmount) : ''),
          billingPeriod: parsed.billingPeriod || f.billingPeriod,
        }));
        const got = parsed.totalQuantity != null || parsed.totalAmount != null;
        setScanNote(got
          ? 'Đã đọc sơ bộ từ ảnh — KIỂM TRA lại tổng m³ / tổng tiền / kỳ trước khi gửi.'
          : 'Không đọc được số từ ảnh — nhập tay giúp mình.');
      } catch {
        // OCR hỏng không được làm hỏng luôn việc đính ảnh: ảnh đã lên rồi, admin gõ tay.
        setScanNote('Không đọc được ảnh — nhập tay giúp mình.');
      }
    } catch (e: any) {
      setPublishError(e?.message || 'Không tải được ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    if (!formReady || !propertyId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await waterBillService.create({
        propertyId,
        billingPeriod: form.billingPeriod.trim(),
        month, year,
        totalQuantity: quantity,
        totalAmount: amount,
        imageUrl: imageUrl || undefined,
      });
      setForm({ ...EMPTY_FORM, billingPeriod: selectedMonthPeriod });
      setImageUrl('');
      setPropertyId(null);
      await loadBills();
    } catch (e: any) {
      setPublishError(e?.response?.data?.message || e?.message || 'Không phát hành được hoá đơn nước.');
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      await waterBillService.revoke(id);
      await loadBills();
    } catch (e: any) {
      setBillsError(e?.response?.data?.message || e?.message || 'Không thu hồi được hoá đơn.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Lightbox — bấm bất kỳ đâu hoặc Esc để đóng. */}
      {!!zoomImage && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setZoomImage(null)}
          onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setZoomImage(null); }}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
          <img src={zoomImage} alt="Hoá đơn nước" className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <SectionShell
        icon={Droplets}
        title="Phát hành hoá đơn nước"
        subtitle="Admin chốt hoá đơn nước của từng nhà, hệ thống tính đơn giá rồi đẩy xuống cho quản lý."
        action={(
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadBills}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Tải lại
            </button>
          </div>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Nhà / toà nhà <span className="text-rose-500">*</span>
              </label>
              {/* Dùng chung ô chọn nhà của trang EVN: có ô tìm + lọc theo loại. Danh sách
                  nhà dài hàng chục dòng nên `<select>` trần là phải cuộn tay để mò. */}
              <PropertyCombobox
                properties={properties}
                value={propertyId}
                onChange={setPropertyId}
                publishedIds={publishedIds}
                disabled={loadingProps}
              />
              {!!existingBill && (
                <p className="mt-1 text-xs font-semibold text-amber-600">
                  Nhà này đã có hoá đơn nước kỳ {month}/{year} — thu hồi bản cũ trước nếu muốn phát hành lại.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">Ảnh hoá đơn nước</label>
              {/* Input gốc bị ẩn: control mặc định của trình duyệt ("Chọn tệp · Không có
                  tệp nào được chọn") lạc hẳn với phần còn lại của trang. */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />

              {imageUrl ? (
                <div className="rounded-xl border border-slate-200 p-2">
                  <button
                    type="button"
                    onClick={() => setZoomImage(imageUrl)}
                    className="block w-full cursor-zoom-in"
                    title="Bấm để phóng to"
                  >
                    <img
                      src={imageUrl}
                      alt="Hoá đơn nước"
                      className="max-h-64 w-full rounded-lg object-contain"
                    />
                  </button>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Đổi ảnh khác
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Xoá ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-slate-500 hover:border-sky-300 hover:bg-sky-50/50 disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                      <span className="text-sm font-semibold">Đang tải ảnh…</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-6 w-6" />
                      <span className="text-sm font-semibold">Chọn ảnh hoá đơn nước</span>
                      <span className="text-xs text-slate-400">PNG, JPG — chụp hoặc tải từ máy</span>
                    </>
                  )}
                </button>
              )}

              {!!scanNote && (
                <p className="mt-1.5 text-xs font-semibold text-sky-700">{scanNote}</p>
              )}
              <p className="mt-1.5 text-xs text-slate-400">
                Không có ảnh vẫn phát hành được — ảnh chỉ để quản lý đối chiếu khi khách thắc mắc.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng m³ <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                  inputMode="numeric"
                  value={form.totalQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, totalQuantity: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng tiền (đ) <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                  inputMode="numeric"
                  value={form.totalAmount}
                  onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                />
                {/* Nhập "Tổng tiền thanh toán" trên giấy (đã gồm VAT + phí BVMT), không
                    phải "Cộng tiền hàng". Không ghi chú lên UI — admin nắm nghiệp vụ
                    này, bày thêm chữ chỉ làm rối form. */}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Kỳ thanh toán <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="01/09 – 30/09/2026"
                value={form.billingPeriod}
                onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Điền nhanh:</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billingPeriod: selectedMonthPeriod }))}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Kỳ {month}/{year}
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billingPeriod: prevMonthPeriod }))}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tháng trước
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Chuỗi này hiện nguyên văn trên hoá đơn khách nhận — ghi đúng kỳ in trên giấy.
              </p>
            </div>

            <div className={`rounded-xl border p-4 ${unitPrice > 0 ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đơn giá hệ thống sẽ dùng</p>
              <p className={`mt-1 text-3xl font-black tabular-nums ${unitPrice > 0 ? 'text-sky-700' : 'text-slate-300'}`}>
                {unitPrice > 0 ? `${formatVnd(Math.round(unitPrice))}/m³` : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                = tổng tiền ÷ tổng m³. Số đem đi tính giữ nguyên phần thập phân, chỉ chỗ hiển thị mới làm tròn.
              </p>
              {/* Số này cao hơn đơn giá in trên hoá đơn (vd 29.000đ/m³) vì giá in là giá
                  trước thuế, còn đây đã gánh VAT + phí BVMT để thu đủ tổng. Cũng không
                  ghi lên UI — cùng lý do với ô Tổng tiền. */}
            </div>

            {!!publishError && (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-rose-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {publishError}
              </p>
            )}

            <button
              type="button"
              onClick={publish}
              disabled={!formReady || publishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gửi cho quản lý
            </button>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        icon={Droplets}
        title={`Đã phát hành — kỳ ${month}/${year}`}
      >
        {loadingBills ? (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </p>
        ) : billsError ? (
          <p className="flex items-start gap-1.5 py-6 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {billsError}
          </p>
        ) : bills.length === 0 ? (
          <EmptyState text={`Chưa phát hành hoá đơn nước nào cho kỳ ${month}/${year}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Nhà</th>
                  <th className="py-2 pr-3">Kỳ</th>
                  <th className="py-2 pr-3 text-right">Tổng m³</th>
                  <th className="py-2 pr-3 text-right">Tổng tiền</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-semibold text-slate-700">{b.propertyName ?? `#${b.propertyId}`}</td>
                    <td className="py-3 pr-3 text-slate-600">{b.billingPeriod}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{b.totalQuantity?.toLocaleString('vi-VN')}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{formatVnd(b.totalAmount)}</td>
                    <td className="py-3 pr-3">
                      <StatusPill label={b.status === 'REVOKED' ? 'Đã thu hồi' : 'Đang hiệu lực'} color={b.status === 'REVOKED' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'} />
                    </td>
                    <td className="py-3 text-right">
                      {b.status !== 'REVOKED' && (
                        <button
                          type="button"
                          onClick={() => revoke(b.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Thu hồi
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  );
};
