import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, Check, ChevronDown, FileUp, Loader2, RefreshCw,
  Search, Send, Trash2, Zap,
} from 'lucide-react';
import {
  evnBillService, evnUnitPrice, type EvnBill,
} from '@/services/evnBill.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import { parseEvnInvoice, monthPeriod, onlyDigits } from '@/utils/evnInvoiceParser';
import { SectionShell, StatusPill, EmptyState, formatVnd } from './shared';

/**
 * PHÁT HÀNH HOÁ ĐƠN ĐIỆN EVN (Admin).
 *
 * Chốt 13/08/2026: người tải hoá đơn EVN lên hệ thống là ADMIN, không còn là manager.
 * Lý do đổi — xem đầu file `services/evnBill.service.ts`.
 *
 * Sau khi admin bấm "Gửi cho quản lý", manager mở app thấy sẵn tổng kWh / tổng tiền /
 * đơn giá của kỳ đó và KHÔNG sửa được. Việc còn lại của manager:
 *   • nhà nguyên căn → bấm gửi thẳng cho khách (đúng tổng tiền hoá đơn EVN)
 *   • nhà theo phòng → chụp đồng hồ từng phòng, ghi chỉ số, hệ thống nhân đơn giá
 *
 * Nước không đi qua trang này — manager vẫn tự nhập hoá đơn nước trên app như cũ.
 */

const PROPERTY_PAGE_SIZE = 200;

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Hiển thị số có dấu phân cách nghìn khi gõ ("400000" -> "400.000"). */
const groupThousands = (s: string) => {
  const d = onlyDigits(s);
  return d ? Number(d).toLocaleString('vi-VN') : '';
};

interface BillForm {
  totalKwh: string;
  totalAmount: string;
  billingPeriod: string;
}

const EMPTY_FORM: BillForm = { totalKwh: '', totalAmount: '', billingPeriod: '' };

// Dải dấu thanh Unicode mà NFD tách ra. Viết bằng escape ASCII để dấu tổ hợp không nằm
// trần trong source (nhìn như ô trống, dễ bị editor/merge làm hỏng).
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt để gõ "nguyen can" vẫn ra "Nguyên căn" (cùng cách buildingFilterState làm). */
const normalizeVi = (s: string) =>
  (s || '').normalize('NFD').replace(COMBINING_MARKS, '').replace(/[đĐ]/g, 'd').toLowerCase();

type KindFilter = 'all' | 'whole' | 'rooms';

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: 'all',   label: 'Tất cả' },
  { key: 'whole', label: 'Nguyên căn' },
  { key: 'rooms', label: 'Theo phòng' },
];

/**
 * Bộ chọn nhà có tìm kiếm.
 *
 * Thay cho `<select>` thường: hệ thống đang có hàng trăm nhà, tên lại na ná nhau
 * ("MTX#05 NGUYEN_CAN NONE") nên cuộn tay là không tìm nổi. Ở đây gõ được tên/địa chỉ/
 * khu vực (không dấu cũng ra), lọc nhanh theo loại nhà, và nhà nào đã phát hành hoá đơn
 * kỳ này thì gắn nhãn ngay trong danh sách — đỡ phải chọn rồi mới biết là trùng.
 */
const PropertyCombobox = ({
  properties, value, onChange, publishedIds, disabled,
}: {
  properties: PropertyResponse[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Nhà đã có hoá đơn EVN kỳ đang xem — chỉ để gắn nhãn, vẫn chọn được để xem lại. */
  publishedIds: Set<number>;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Bấm ra ngoài / Esc thì đóng — panel che mất form bên dưới nếu cứ mở mãi.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  const selected = properties.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = normalizeVi(query.trim());
    return properties.filter((p) => {
      if (kind === 'whole' && p.wholeHouse !== true) return false;
      if (kind === 'rooms' && p.wholeHouse === true) return false;
      if (!q) return true;
      return normalizeVi(
        `${p.propertyName} ${p.shortAddress ?? ''} ${p.fullAddress ?? ''} ${p.zoneName ?? ''}`,
      ).includes(q);
    });
  }, [properties, query, kind]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:bg-slate-50 ${
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-slate-800">{selected.propertyName}</span>
            <span className="block truncate text-xs text-slate-500">
              {selected.wholeHouse ? 'Nguyên căn' : `${selected.totalRooms ?? 0} phòng`}
              {selected.shortAddress ? ` · ${selected.shortAddress}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">— Chọn nhà —</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Tìm theo tên, địa chỉ, khu vực..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Xoá
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1">
              {KIND_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setKind(t.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                    kind === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400">{filtered.length} nhà</span>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Không có nhà nào khớp “{query}”.
              </p>
            ) : (
              filtered.map((p) => {
                const isSel = p.id === value;
                const published = publishedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    className={`flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-b-0 ${
                      isSel ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-800">{p.propertyName}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.wholeHouse ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {p.wholeHouse ? 'Nguyên căn' : `${p.totalRooms ?? 0} phòng`}
                        </span>
                        {published && (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Đã phát hành
                          </span>
                        )}
                      </span>
                      {(p.shortAddress || p.zoneName) && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {[p.shortAddress, p.zoneName].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const EvnBillPublishing = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(null);

  const [bills, setBills] = useState<EvnBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  /**
   * BE chưa có endpoint evn-bills → list() ném lỗi. Phân biệt "chưa có BE" với "kỳ này
   * chưa phát hành gì" để admin không tưởng mình bấm hụt.
   */
  const [billsUnavailable, setBillsUnavailable] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [form, setForm] = useState<BillForm>(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState<EvnBill | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Tải danh sách nhà ──────────────────────────────────────────────────────
  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    setPropsError(null);
    try {
      const page = await propertyService.getProperties(0, PROPERTY_PAGE_SIZE);
      setProperties(page?.content ?? []);
    } catch (e: any) {
      setPropsError(e?.response?.data?.message || e?.message || 'Không tải được danh sách nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadBills = useCallback(async () => {
    setLoadingBills(true);
    try {
      const rows = await evnBillService.list({ month, year });
      setBills(rows);
      setBillsUnavailable(false);
    } catch {
      setBills([]);
      setBillsUnavailable(true);
    } finally {
      setLoadingBills(false);
    }
  }, [month, year]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadBills(); }, [loadBills]);

  // Kỳ mặc định bám theo tháng/năm đang chọn, nhưng chỉ ghi đè khi admin chưa gõ tay.
  useEffect(() => {
    setForm((f) => (f.billingPeriod ? f : { ...f, billingPeriod: monthPeriod(0, new Date(year, month - 1, 1)) }));
  }, [month, year]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const isWholeHouse = selectedProperty?.wholeHouse === true;

  /** Nhà đã có bản PUBLISHED của kỳ này → chặn phát hành lần hai (BE cũng phải chặn). */
  const existingBill = useMemo(
    () => bills.find((b) => b.propertyId === propertyId && b.status !== 'REVOKED'),
    [bills, propertyId],
  );

  /** Gắn nhãn "Đã phát hành" ngay trong danh sách chọn — thấy trước khi chọn, đỡ mất công. */
  const publishedIds = useMemo(
    () => new Set(bills.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [bills],
  );

  const unitPrice = evnUnitPrice(Number(onlyDigits(form.totalAmount)), Number(onlyDigits(form.totalKwh)));

  const formReady =
    !!propertyId &&
    Number(onlyDigits(form.totalKwh)) > 0 &&
    Number(onlyDigits(form.totalAmount)) > 0 &&
    !!form.billingPeriod.trim();

  // ── Upload + OCR ───────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setScanning(true);
    setScanNote(null);
    setPublishError(null);
    try {
      const url = await uploadToCloudinary(file, 'image');
      setImageUrl(url);

      try {
        const ocr = await evnBillService.ocr(url);
        const parsed = parseEvnInvoice(ocr);

        // Ưu tiên parser FE trên rawText: BE lấy "số dài nhất trong 80 ký tự sau nhãn" nên
        // với dòng "kWh 199 - 369.986" nó trả 369.986 làm số kWh. Số của BE chỉ dùng để bù
        // ô còn trống.
        if (!parsed.totalKwh && Number(ocr?.totalKwh) > 0) parsed.totalKwh = String(ocr.totalKwh);
        if (!parsed.totalAmount && Number(ocr?.totalAmount) > 0) parsed.totalAmount = String(ocr.totalAmount);
        if (!parsed.billingPeriod && ocr?.billingPeriod) parsed.billingPeriod = ocr.billingPeriod;

        setForm((f) => ({
          totalKwh: parsed.totalKwh || f.totalKwh,
          totalAmount: parsed.totalAmount || f.totalAmount,
          billingPeriod: parsed.billingPeriod || f.billingPeriod,
        }));

        const got = parsed.totalKwh || parsed.totalAmount || parsed.billingPeriod;
        setScanNote(
          got
            ? 'Đã đọc sơ bộ từ ảnh — KIỂM TRA lại tổng kWh / tổng tiền / kỳ trước khi gửi.'
            : 'Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay.',
        );
      } catch {
        setScanNote('Đã tải ảnh nhưng dịch vụ đọc hoá đơn đang lỗi. Vui lòng nhập tay số liệu.');
      }
    } catch (e: any) {
      setPublishError(e?.message || 'Không tải được ảnh lên.');
    } finally {
      setScanning(false);
    }
  };

  const clearImage = () => {
    setImageUrl('');
    setScanNote(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, billingPeriod: monthPeriod(0, new Date(year, month - 1, 1)) });
    clearImage();
    setPublishError(null);
  };

  // ── Phát hành ──────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!formReady || !propertyId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const created = await evnBillService.publish({
        propertyId,
        billingPeriod: form.billingPeriod.trim(),
        month,
        year,
        totalKwh: Number(onlyDigits(form.totalKwh)),
        totalAmount: Number(onlyDigits(form.totalAmount)),
        imageUrl: imageUrl || undefined,
      });
      setJustPublished(created);
      resetForm();
      setPropertyId(null);
      loadBills();
    } catch (e: any) {
      setPublishError(
        e?.response?.data?.message
          || e?.message
          || 'Không gửi được hoá đơn cho quản lý.',
      );
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async (bill: EvnBill) => {
    if (!window.confirm(
      `Thu hồi hoá đơn EVN của "${bill.propertyName ?? `nhà #${bill.propertyId}`}" kỳ ${bill.billingPeriod}?\n\n`
      + 'Quản lý sẽ không dùng được đơn giá này nữa. Hoá đơn ĐÃ gửi cho khách thì không bị ảnh hưởng.',
    )) return;
    try {
      await evnBillService.revoke(bill.id);
      loadBills();
    } catch (e: any) {
      window.alert(e?.response?.data?.message || e?.message || 'Không thu hồi được.');
    }
  };

  // ───────────────────────────── RENDER ──────────────────────────────────────
  return (
    <div className="space-y-6">
      <SectionShell
        title="Phát hành hoá đơn điện EVN"
        subtitle="Admin tải hoá đơn EVN của từng nhà, hệ thống tính đơn giá rồi đẩy xuống cho quản lý."
        icon={Zap}
        action={
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { loadProperties(); loadBills(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Tải lại
            </button>
          </div>
        }
      >
        {justPublished && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              <p className="font-bold text-emerald-800">
                Đã gửi cho quản lý — {justPublished.propertyName ?? `nhà #${justPublished.propertyId}`}
              </p>
              <p className="text-emerald-700">
                {justPublished.totalKwh.toLocaleString('vi-VN')} kWh · {formatVnd(justPublished.totalAmount)} ·
                đơn giá {formatVnd(justPublished.unitPrice ?? evnUnitPrice(justPublished.totalAmount, justPublished.totalKwh))}/kWh
              </p>
            </div>
            <button
              type="button"
              onClick={() => setJustPublished(null)}
              className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
            >
              Đóng
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Cột trái: chọn nhà + ảnh hoá đơn ── */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Nhà / toà nhà <span className="text-rose-500">*</span>
              </label>
              {loadingProps ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách nhà...
                </div>
              ) : propsError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {propsError}
                  <button type="button" onClick={loadProperties} className="ml-2 font-semibold underline">
                    Thử lại
                  </button>
                </div>
              ) : (
                <PropertyCombobox
                  properties={properties}
                  value={propertyId}
                  onChange={setPropertyId}
                  publishedIds={publishedIds}
                />
              )}

              {selectedProperty && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {isWholeHouse
                    ? 'Nhà nguyên căn — quản lý sẽ gửi thẳng đúng tổng tiền hoá đơn này cho khách.'
                    : 'Nhà cho thuê theo phòng — quản lý sẽ chụp đồng hồ từng phòng rồi nhân với đơn giá bên dưới.'}
                </p>
              )}

              {existingBill && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Nhà này đã có hoá đơn EVN kỳ {month}/{year} ({existingBill.totalKwh.toLocaleString('vi-VN')} kWh ·
                    {' '}{formatVnd(existingBill.totalAmount)}). Thu hồi bản cũ ở bảng dưới trước khi phát hành bản mới.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">Ảnh hoá đơn EVN</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {!imageUrl ? (
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 disabled:opacity-60"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                      <span className="text-sm font-semibold">Đang tải & đọc hoá đơn...</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-7 w-7" />
                      <span className="text-sm font-semibold">Chọn ảnh hoá đơn EVN</span>
                      <span className="text-xs">Hệ thống tự đọc tổng kWh · tổng tiền · kỳ</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <img src={imageUrl} alt="Hoá đơn EVN" className="max-h-72 w-full bg-slate-50 object-contain" />
                  <div className="flex gap-2 border-t border-slate-100 p-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={scanning}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Đổi ảnh khác
                    </button>
                    <button
                      type="button"
                      onClick={clearImage}
                      className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Xoá ảnh
                    </button>
                  </div>
                </div>
              )}
              {scanNote && <p className="mt-2 text-xs text-slate-500">{scanNote}</p>}
              <p className="mt-1 text-xs text-slate-400">
                Không có ảnh vẫn phát hành được — ảnh chỉ để quản lý đối chiếu khi khách thắc mắc.
              </p>
            </div>
          </div>

          {/* ── Cột phải: số liệu + phát hành ── */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng kWh <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                  inputMode="numeric"
                  placeholder="1.250"
                  value={groupThousands(form.totalKwh)}
                  onChange={(e) => setForm((f) => ({ ...f, totalKwh: onlyDigits(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng tiền (đ) <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                  inputMode="numeric"
                  placeholder="3.500.000"
                  value={groupThousands(form.totalAmount)}
                  onChange={(e) => setForm((f) => ({ ...f, totalAmount: onlyDigits(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Kỳ thanh toán <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="01/08 – 31/08/2026"
                value={form.billingPeriod}
                onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-400">
                Chuỗi này hiện nguyên văn trên hoá đơn khách nhận — ghi đúng kỳ in trên giấy EVN.
              </p>
            </div>

            {/* Đơn giá là con số quan trọng nhất trang này: mọi hoá đơn phòng đều nhân với nó. */}
            <div className={`rounded-xl border p-4 ${unitPrice > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đơn giá hệ thống sẽ dùng</p>
              <p className={`mt-1 text-3xl font-black tabular-nums ${unitPrice > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                {unitPrice > 0 ? `${formatVnd(unitPrice)}/kWh` : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                = tổng tiền ÷ tổng kWh. EVN tính bậc thang nên hoá đơn không in sẵn đơn giá.
              </p>
            </div>

            {publishError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {publishError}
              </div>
            )}

            <button
              type="button"
              disabled={!formReady || publishing || !!existingBill}
              onClick={publish}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {existingBill ? 'Kỳ này đã phát hành' : 'Gửi cho quản lý'}
            </button>
          </div>
        </div>
      </SectionShell>

      {/* ── Bảng đã phát hành ── */}
      <SectionShell
        title={`Đã phát hành — kỳ ${month}/${year}`}
        subtitle="Quản lý của các nhà dưới đây đã nhận được đơn giá điện và có thể gửi hoá đơn cho khách."
        icon={Zap}
      >
        {billsUnavailable ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Backend chưa có API hoá đơn EVN</p>
              <p>
                Trang đã sẵn sàng, chờ BE dựng <code className="font-mono">/api/v1/admin/evn-bills</code>.
                Chi tiết hợp đồng API xem <code className="font-mono">doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md</code>.
              </p>
            </div>
          </div>
        ) : loadingBills ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
          </div>
        ) : bills.length === 0 ? (
          <EmptyState text={`Chưa phát hành hoá đơn EVN nào cho kỳ ${month}/${year}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-bold">Nhà</th>
                  <th className="pb-2 pr-3 font-bold">Kỳ</th>
                  <th className="pb-2 pr-3 text-right font-bold">Tổng kWh</th>
                  <th className="pb-2 pr-3 text-right font-bold">Tổng tiền</th>
                  <th className="pb-2 pr-3 text-right font-bold">Đơn giá</th>
                  <th className="pb-2 pr-3 font-bold">Phát hành</th>
                  <th className="pb-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const revoked = b.status === 'REVOKED';
                  return (
                    <tr key={b.id} className={`border-b border-slate-100 ${revoked ? 'opacity-50' : ''}`}>
                      <td className="py-3 pr-3 font-semibold text-slate-800">
                        {b.propertyName ?? `#${b.propertyId}`}
                        {revoked && (
                          <span className="ml-2 align-middle">
                            <StatusPill label="Đã thu hồi" color="bg-slate-200 text-slate-600" />
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{b.billingPeriod}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-700">
                        {b.totalKwh.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-700">{formatVnd(b.totalAmount)}</td>
                      <td className="py-3 pr-3 text-right font-bold tabular-nums text-indigo-700">
                        {formatVnd(b.unitPrice ?? evnUnitPrice(b.totalAmount, b.totalKwh))}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {fmtDateTime(b.createdAt)}
                        {b.createdBy ? ` · ${b.createdBy}` : ''}
                      </td>
                      <td className="py-3 text-right">
                        {!revoked && (
                          <button
                            type="button"
                            onClick={() => revoke(b)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Thu hồi
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  );
};
