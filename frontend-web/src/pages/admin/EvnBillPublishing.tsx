import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, Check, ChevronDown, FileArchive, FileUp, Loader2, RefreshCw,
  Search, Send, Trash2, Zap,
} from 'lucide-react';
import {
  evnBillService, evnUnitPrice, type EvnBill,
} from '@/services/evnBill.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { propertyService } from '@/services/property.service';
import { useOccupiedProperties } from '@/services/useOccupiedProperties';
import { groupThousands } from '@/utils';
import { UtilityBillZipImport } from './UtilityBillZipImport';


import { utilityInvoiceService } from '@/services/utilityInvoice.service';
import { meterReadingService, type SavedMeterReading } from '@/services/meterReading.service';
import {
  loadUtilityCycle, continuityGap, firstPeriodNote, type UtilityCycle,
} from '@/services/utilityCycle';
import type { PropertyResponse } from '@/types/api.types';
import { parseEvnInvoice, monthPeriod, onlyDigits, periodProblem, arrearsPeriod } from '@/utils/evnInvoiceParser';
import { matchBillToProperty } from '@/utils/billPropertyMatch';
import { SectionShell, StatusPill, EmptyState, formatVnd, MissingBillsBanner } from './shared';
import { serverNow } from '@/utils/serverTime';

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

/** Số dòng mỗi trang ở bảng "Đã phát hành". */
const BILLS_PER_PAGE = 10;

/**
 * TIẾN ĐỘ GHI CHỈ SỐ của một tờ hoá đơn tổng đã phát hành.
 *
 * ─── Vì sao cột này quan trọng hơn mọi cột khác ────────────────────────────────
 * Bảng "đã phát hành" cũ chỉ lặp lại thứ admin vừa gõ: tổng kWh, tổng tiền, đơn giá.
 * Phát hành cả lô thì mọi dòng mang cùng một kỳ và số liệu na ná nhau — nhìn xuống là
 * một bức tường số giống hệt, không dòng nào đáng dừng lại.
 *
 * Nhưng phát hành hoá đơn tổng mới chỉ là ĐẦU VÀO. Với nhà chia phòng, tiền chỉ thật sự
 * tới khách sau khi quản lý đi đọc đủ đồng hồ từng phòng — và đó là bước hay tắc. Cột
 * này là chỗ duy nhất trong bảng thật sự KHÁC NHAU giữa các dòng, nên nó trả lời được
 * câu admin cần: nhà nào đang kẹt.
 *
 * Nhà nguyên căn (`roomsTotal = 0`) không có gì phải chờ — hoá đơn đi thẳng tới khách.
 */
export const ReadingProgress = ({ bill }: { bill: ProgressBill; unit?: string }) => {
  const total = bill.roomsTotal ?? 0;
  const done = bill.roomsDone ?? 0;

  // BE cũ chưa trả hai field này → đừng bịa ra "0/0 phòng", nói thẳng là không biết.
  if (bill.roomsTotal == null) return <span className="text-xs text-slate-300">—</span>;

  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
        Nguyên căn · đã tới khách
      </span>
    );
  }

  const full = done >= total;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="min-w-[132px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs font-black tabular-nums ${
          full ? 'text-emerald-600' : bill.overdue ? 'text-rose-600' : 'text-amber-600'}`}>
          {done}/{total} phòng
        </span>
        {full
          ? <span className="text-[11px] font-bold text-emerald-600">xong</span>
          : bill.overdue
            ? <span className="text-[11px] font-bold text-rose-600">quá hạn</span>
            : bill.readingDeadline
              ? <span className="text-[11px] text-slate-400">hạn {fmtDate(bill.readingDeadline)}</span>
              : null}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            full ? 'bg-emerald-500' : bill.overdue ? 'bg-rose-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Chỗ giao nhau giữa `EvnBill` và `WaterBill` mà `ReadingProgress` cần.
 *
 * Cố ý KHÔNG nhận nguyên kiểu của bên nào: hai kiểu đó khác nhau ở tên trường sản lượng
 * (`totalKwh` vs `totalQuantity`), mà thanh tiến độ không quan tâm tới sản lượng.
 */
export type ProgressBill = {
  roomsTotal?: number; roomsDone?: number;
  readingDeadline?: string | null; overdue?: boolean;
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—';

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

interface BillForm {
  totalKwh: string;
  totalAmount: string;
  billingPeriod: string;
  /**
   * Chỉ số công tơ CŨ / MỚI in trên giấy EVN. Chỉ bắt buộc với NHÀ NGUYÊN CĂN, vì
   * loại đó phát hành thẳng cho khách nên hoá đơn khách nhận phải mang đúng hai số
   * này (BE cũng chặn: consumption phải bằng newReading − prevReading).
   * Nhà chia phòng thì bỏ trống — quản lý đọc đồng hồ từng phòng, số của cả nhà
   * không dùng để tính cho ai.
   */
  prevReading: string;
  newReading: string;
  /**
   * Chỉ số cũ IN TRÊN GIẤY, giữ RIÊNG với `prevReading`.
   *
   * Từ kỳ thứ 2, `prevReading` bị khoá theo chốt của sổ hệ thống. Không giữ lại số của
   * giấy thì hai con số đáng lẽ phải bằng nhau không bao giờ được đem ra so — giấy ghi
   * 18.616 trong khi kỳ trước chốt 18.610 thì 6 kWh ở giữa rơi ra ngoài mọi hoá đơn, và
   * màn hình hiện y như lúc mọi thứ đều đúng. Kỳ đầu không dùng ô này (chưa có gì để nối).
   */
  paperPrev: string;
  /** Mã khách hàng EVN trên tờ giấy — OCR điền sẵn, admin soát lại rồi mới gửi. */
  customerCode: string;
}

const EMPTY_FORM: BillForm = {
  totalKwh: '', totalAmount: '', billingPeriod: '', prevReading: '', newReading: '',
  paperPrev: '', customerCode: '',
};

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
/**
 * Ô chọn nhà có tìm kiếm + lọc theo loại. Export để trang hoá đơn NƯỚC dùng chung —
 * danh sách nhà dài hàng chục dòng, `<select>` trần là phải cuộn tay để mò.
 */
export const PropertyCombobox = ({
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
  const now = serverNow();
  // Điện/nước TRẢ SAU: mở màn giữa tháng 9 thì kỳ đang làm là tháng 8 — xem `arrearsPeriod`.
  const [month, setMonth] = useState(() => arrearsPeriod(now).month);
  const [year, setYear] = useState(() => arrearsPeriod(now).year);

  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(null);

  const [bills, setBills] = useState<EvnBill[]>([]);
  /** Mở hộp nhập lô từ file .zip. */
  const [zipOpen, setZipOpen] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  /**
   * BE chưa có endpoint evn-bills → list() ném lỗi. Phân biệt "chưa có BE" với "kỳ này
   * chưa phát hành gì" để admin không tưởng mình bấm hụt.
   */
  const [billsUnavailable, setBillsUnavailable] = useState(false);

  const [imageUrl, setImageUrl] = useState('');
  /**
   * Chữ OCR đọc được từ ảnh, GIỮ LẠI để đối chiếu với căn nhà đang chọn.
   *
   * Phải là state chứ không phải một phép kiểm chạy một lần lúc upload: lỗi cần bắt là
   * "chọn nhầm nhà", mà admin hoàn toàn có thể tải ảnh trước rồi mới đổi ô chọn nhà sau.
   * Giữ rawText rồi tính lại bằng useMemo thì đổi nhà lúc nào cảnh báo cũng đúng lúc đó.
   */
  const [ocrRawText, setOcrRawText] = useState('');
  /** Mã khách hàng EVN đọc được từ ảnh — xem chú thích ở nơi hiển thị. */
  const [ocrCustomerCode, setOcrCustomerCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [form, setForm] = useState<BillForm>(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState<EvnBill | null>(null);
  /** Lần phát hành vừa rồi có gửi thẳng cho khách thuê không (chỉ nguyên căn). */
  const [issuedToTenant, setIssuedToTenant] = useState(false);
  /** Bộ lọc bảng 'Đã phát hành'. */
  const [billSearch, setBillSearch] = useState('');
  const [billStatus, setBillStatus] = useState<'all' | 'published' | 'revoked'>('all');
  /** Bản ghi đang chờ xác nhận thu hồi (null = hộp thoại đóng). */
  const [revokeTarget, setRevokeTarget] = useState<EvnBill | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [billPage, setBillPage] = useState(1);
  /** Ảnh đang xem phóng to (null = đóng). */
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  /** Bản ghi đang mở chi tiết (null = đóng). */
  const [detailBill, setDetailBill] = useState<EvnBill | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /**
   * Ô chọn nhà CHỈ hiện căn đang có khách ở.
   *
   * Hoá đơn điện/nước chỉ có nghĩa với căn có người ở; đổ ra cả nhà chưa ai thuê thì
   * admin phải tự nhớ căn nào đang có khách, chọn nhầm là phát hành một hoá đơn không
   * gửi cho ai. Xem `useOccupiedProperties` để biết vì sao phải hỏi `handover-status`
   * chứ không dùng được field nào trong danh sách nhà.
   *
   * CHỈ lọc ô chọn, KHÔNG lọc `properties` gốc: bảng "đã phát hành" bên dưới vẫn phải
   * tra được hoá đơn cũ của căn mà khách đã trả phòng.
   */
  const { occupiedIds } = useOccupiedProperties();
  const occupiedProperties = useMemo(
    () => (occupiedIds ? properties.filter((p) => occupiedIds.has(p.id)) : properties),
    [properties, occupiedIds],
  );
  const hiddenEmptyCount = properties.length - occupiedProperties.length;


  // ── Tải danh sách nhà ──────────────────────────────────────────────────────
  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    setPropsError(null);
    try {
      const page = await propertyService.getAllProperties();
      setProperties(page ?? []);
    } catch (e: any) {
      setPropsError(e?.response?.data?.message || e?.message || 'Không tải được danh sách nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  /**
   * Nạp danh sách đã phát hành của kỳ đang xem.
   *
   * Phải hỏi TỪNG NHÀ rồi gộp, vì BE bắt buộc `propertyId` (xem `listForPeriod`).
   * Do đó hàm này chỉ chạy được SAU khi có danh sách nhà — `properties` nằm trong deps.
   */
  const loadBills = useCallback(async () => {
    if (properties.length === 0) { setBills([]); return; }
    setLoadingBills(true);
    try {
      const rows = await evnBillService.listForPeriod(properties.map(p => p.id), month, year);
      // Lưới an toàn cuối: một object lọt xuống đây là `bills.length` thành undefined và
      // bảng im lặng báo "chưa phát hành gì" — đúng lỗi đã xảy ra 13/08/2026.
      setBills(Array.isArray(rows) ? rows : []);
      setBillsUnavailable(false);
    } catch {
      setBills([]);
      setBillsUnavailable(true);
    } finally {
      setLoadingBills(false);
    }
  }, [month, year, properties]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadBills(); }, [loadBills]);

  /**
   * Kỳ trọn tháng theo tháng/năm đang chọn ở đầu trang, và kỳ liền trước.
   * Dùng cho cả giá trị mặc định lẫn 2 nút "Điền nhanh" cạnh ô Kỳ thanh toán.
   */
  const selectedMonthPeriod = useMemo(
    () => monthPeriod(0, new Date(year, month - 1, 1)),
    [month, year],
  );
  const prevMonthPeriod = useMemo(
    () => monthPeriod(-1, new Date(year, month - 1, 1)),
    [month, year],
  );

  /**
   * Chuỗi kỳ đang gõ có vẻ KHÔNG thuộc tháng đang phát hành.
   *
   * KHÔNG so bằng với `selectedMonthPeriod`: kỳ EVN thật là chu kỳ chốt số
   * ("07/08/2026 – 06/09/2026"), gần như không bao giờ trùng chuỗi trọn tháng — so bằng
   * là cảnh báo đỏ suốt, admin nhìn quen rồi bỏ qua cả lúc sai thật.
   * Chỉ soi xem chuỗi có nhắc tới tháng/năm đang chọn hay không. Ảnh EVN của kỳ khác
   * (vd "07/04/2026 – 06/05/2026" khi đang phát hành kỳ 9) sẽ rơi vào đây.
   */
  const periodLooksWrong = useMemo(() => {
    const raw = form.billingPeriod.trim();
    if (!raw) return false;
    const mm = String(month).padStart(2, '0');
    return !raw.includes(`/${mm}`) || !raw.includes(String(year));
  }, [form.billingPeriod, month, year]);

  // Kỳ mặc định bám theo tháng/năm đang chọn, nhưng chỉ ghi đè khi admin chưa gõ tay.
  useEffect(() => {
    setForm((f) => (f.billingPeriod ? f : { ...f, billingPeriod: selectedMonthPeriod }));
  }, [selectedMonthPeriod]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  /**
   * Nguyên căn đi luồng KHÁC HẲN: phát hành thẳng cho khách thuê, quản lý chỉ nhận
   * thông báo. Xem services/utilityInvoice.service.ts để biết vì sao tách theo loại nhà.
   */
  const isWholeHouse = selectedProperty?.wholeHouse === true;

  /**
   * Ảnh hoá đơn này có phải của căn nhà đang chọn không (xem @/utils/billPropertyMatch).
   *
   * Đáng giá nhất với NGUYÊN CĂN: ở loại nhà đó, bấm phát hành là hoá đơn đi thẳng tới
   * khách trong cùng thao tác — không còn ai đứng giữa để phát hiện nhầm nhà.
   */
  const billMatch = useMemo(
    () => matchBillToProperty(
      ocrRawText,
      selectedProperty?.fullAddress || selectedProperty?.shortAddress,
    ),
    [ocrRawText, selectedProperty],
  );

  /** Nhà đã có bản PUBLISHED của kỳ này → chặn phát hành lần hai (BE cũng phải chặn). */
  const existingBill = useMemo(
    () => bills.find((b) => b.propertyId === propertyId && b.status !== 'REVOKED'),
    [bills, propertyId],
  );

  /** Gắn nhãn "Đã phát hành" ngay trong danh sách chọn — thấy trước khi chọn, đỡ mất công. */
  /** Đầu form — khối "nhà còn thiếu hoá đơn" cuộn về đây sau khi chọn nhà. */
  const formTopRef = useRef<HTMLDivElement>(null);
  const publishedIds = useMemo(
    () => new Set(bills.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [bills],
  );

  /**
   * Lọc bảng đã phát hành. Một kỳ có thể hàng chục nhà, cuộn tìm rất mệt.
   * Tìm được cả theo tên nhà lẫn chuỗi kỳ (khách hay hỏi theo kỳ in trên giấy).
   */
  const visibleBills = useMemo(() => {
    const q = normalizeVi(billSearch.trim());
    return bills
      .filter((b) => {
        if (billStatus === 'published' && b.status === 'REVOKED') return false;
        if (billStatus === 'revoked' && b.status !== 'REVOKED') return false;
        if (!q) return true;
        return normalizeVi(`${b.propertyName ?? ''} ${b.billingPeriod ?? ''}`).includes(q);
      })
      /**
       * MỚI PHÁT HÀNH LÊN ĐẦU.
       *
       * Trước đây thứ tự là do gom từ nhiều nhà (`listForPeriod` chạy theo lô) nên phụ
       * thuộc thứ tự nhà — admin vừa bấm gửi xong phải đi tìm dòng của mình. Sắp theo
       * `createdAt` giảm dần để bản vừa tạo luôn nằm trên cùng.
       * Thiếu `createdAt` thì đẩy xuống cuối chứ không cho lên đầu nhầm.
       */
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [bills, billSearch, billStatus]);

  /** Cắt trang — một kỳ có thể hàng trăm nhà, đổ hết ra một bảng thì không đọc nổi. */
  const totalPages = Math.max(1, Math.ceil(visibleBills.length / BILLS_PER_PAGE));
  const pagedBills = useMemo(
    () => visibleBills.slice((billPage - 1) * BILLS_PER_PAGE, billPage * BILLS_PER_PAGE),
    [visibleBills, billPage],
  );

  // Đổi bộ lọc / đổi kỳ mà đang đứng ở trang 5 thì bảng trống trơn — kéo về trang 1.
  useEffect(() => { setBillPage(1); }, [billSearch, billStatus, month, year]);

  // Esc đóng ảnh phóng to — người dùng quen phím này ở mọi trình xem ảnh.
  useEffect(() => {
    if (!zoomImage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomImage(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomImage]);

  const unitPrice = evnUnitPrice(Number(onlyDigits(form.totalAmount)), Number(onlyDigits(form.totalKwh)));


  const prevReadingNum = Number(onlyDigits(form.prevReading));
  const newReadingNum = Number(onlyDigits(form.newReading));
  const totalKwhNum = Number(onlyDigits(form.totalKwh));

  /**
   * Với nguyên căn: hiệu hai chỉ số PHẢI bằng tổng kWh. Kiểm ở đây thay vì để BE ném
   * 422 — vì lúc đó hoá đơn tổng đã tạo xong rồi, admin phải thu hồi rồi làm lại.
   */
  const readingMismatch = isWholeHouse
    && !!form.prevReading && !!form.newReading
    && newReadingNum - prevReadingNum !== totalKwhNum;

  /**
   * Chỉ số mới hệ thống tự tính = chỉ số cũ + lượng tiêu thụ trên giấy EVN.
   *
   * Chỉ hiện khi có đủ cả hai vế; `null` nghĩa là chưa đủ dữ kiện để gợi ý.
   */
  const autoNewReading = isWholeHouse && prevReadingNum > 0 && totalKwhNum > 0
    ? prevReadingNum + totalKwhNum
    : null;

  /**
   * ── Bối cảnh chỉ số của căn đang chọn — xem `loadUtilityCycle` ───────────────
   *
   * Trả lời đúng một câu mà màn hình này phải biết trước khi cho phát hành: kỳ đang làm
   * là KỲ ĐẦU của khách hay KỲ TIẾP THEO. Hai kỳ đi hai đường khác hẳn:
   *
   *  • Kỳ tiếp theo → chỉ số cũ lấy theo chốt kỳ trước và KHOÁ ô. Đó là số đã chốt với
   *    khách và đã thu tiền theo nó; cho sửa nghĩa là cho phép hai kỳ không nối tiếp —
   *    kỳ trước kết ở A mà kỳ này khai bắt đầu từ B, phần chênh biến mất khỏi mọi hoá đơn.
   *
   *  • Kỳ đầu → chưa có gì để nối, mở ô cho nhập theo giấy, và hiện thêm mốc đồng hồ lúc
   *    đón khách để admin thấy phần khách bị tính dư (giấy tính trọn tháng).
   *
   * ⚠️ CỐ Ý không điền mốc đón khách vào ô chỉ số cũ, dù đó mới là điểm đúng để bắt đầu
   * tính tiền: máy chủ ép `mới − cũ = tổng kWh trên giấy` (`CONSUMPTION_MISMATCH`), điền
   * mốc đón khách vào là hiệu nhỏ hơn tổng → không phát hành được hoá đơn nào cả. Phần
   * khách bị tính dư bày ra bằng cảnh báo bên dưới thay vì im lặng; máy chủ tự cắt khi
   * lập hoá đơn cho khách (BE 27/08/2026).
   */
  const [cycle, setCycle] = useState<UtilityCycle | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const prevLocked = isWholeHouse && !!cycle?.prevClose;

  useEffect(() => {
    if (!propertyId || !isWholeHouse) {
      setCycle(null);
      return;
    }
    let alive = true;
    setLoadingPrev(true);
    loadUtilityCycle(propertyId, 'ELECTRIC', month, year)
      .then((c) => {
        if (!alive) return;
        setCycle(c);
        if (c.prevClose) {
          setForm((f) => ({ ...f, prevReading: String(c.prevClose!.reading) }));
        }
      })
      .catch(() => { if (alive) setCycle(null); })
      .finally(() => { if (alive) setLoadingPrev(false); });
    return () => { alive = false; };
  }, [propertyId, isWholeHouse, month, year]);

  /**
   * ── PHÒNG NÀO ĐÃ CHỐT CHỈ SỐ ĐIỆN (10/09/2026) ─────────────────────────────
   *
   * Luồng điện của nhà chia phòng đã đảo chiều: quản lý chốt chỉ số vào ngày cuối tháng,
   * rồi admin đẩy giấy EVN lên và máy chủ TỰ tính tiền, TỰ gửi hoá đơn cho từng khách.
   *
   * Nghĩa là nút phát hành ở đây không còn là "giao việc cho quản lý" nữa — nó là lệnh
   * gửi tiền tới tay khách. Phòng chưa chốt số thì bị bỏ qua, và máy chủ KHÔNG trả về con
   * số đó trong phản hồi. Không có bảng này thì admin bấm xong không biết mình vừa gửi
   * cho mấy phòng, cũng không biết còn ai chưa chốt để mà nhắc.
   *
   * Nhà nguyên căn không có bảng này: hoá đơn EVN chính là hoá đơn của căn đó.
   */
  const [savedReadings, setSavedReadings] = useState<SavedMeterReading[] | null>(null);
  const [loadingReadings, setLoadingReadings] = useState(false);
  /** Mở danh sách chỉ số từng phòng. Mặc định thu gọn — phần lớn lần vào chỉ cần con số đếm. */
  const [readingsOpen, setReadingsOpen] = useState(false);

  useEffect(() => {
    if (!propertyId || isWholeHouse) {
      setSavedReadings(null);
      return;
    }
    let alive = true;
    setLoadingReadings(true);
    const period = `${year}-${String(month).padStart(2, '0')}`;
    meterReadingService
      .listSavedForPeriod(propertyId, period, 'ELECTRICITY')
      .then((rows) => { if (alive) setSavedReadings(rows); })
      .finally(() => { if (alive) setLoadingReadings(false); });
    return () => { alive = false; };
  }, [propertyId, isWholeHouse, month, year]);

  const lockedRooms = savedReadings?.filter((r) => r.newReading != null) ?? [];
  const missingRooms = savedReadings?.filter((r) => r.newReading == null) ?? [];

  /**
   * ── Kỳ trước chốt ở đâu, giấy kỳ này bắt đầu từ đâu ─────────────────────────
   *
   * Hai số này PHẢI bằng nhau. Lệch nghĩa là phần tiêu thụ giữa hai mốc không nằm trên
   * hoá đơn nào: không ai thu, và về sau không truy ngược được nó thuộc kỳ nào. Nên lệch
   * thì chặn phát hành, để admin mở ảnh soi lại — hoặc đọc nhầm số trên giấy, hoặc sổ
   * đang sai và phải sửa sổ trước đã.
   */
  const paperPrevNum = form.paperPrev === '' ? null : Number(onlyDigits(form.paperPrev));
  const readingGap = continuityGap(cycle, paperPrevNum);
  const needsPaperPrev = isWholeHouse && !!cycle?.prevClose;
  const continuityBlocked = needsPaperPrev && (paperPrevNum == null || !!readingGap);
  /** Đối chiếu đầu kỳ trên giấy với mốc đón khách — chỉ có nghĩa ở kỳ đầu. */
  const firstNote = firstPeriodNote(cycle, prevReadingNum > 0 ? prevReadingNum : null, totalKwhNum);

  /**
   * Chỉ số mới là số DẪN XUẤT: cũ + tổng kWh. Tính lại mỗi lần một trong hai đầu vào đổi.
   *
   * BUG 01/09/2026 — bản trước chỉ điền khi ô còn TRỐNG, với lý do "admin sửa tay rồi thì
   * tôn trọng". Nghe hợp lý mà sai: OCR điền sẵn một số vào đó ngay từ đầu, nên ô không
   * bao giờ trống, nên sửa tổng kWh xong chỉ số mới đứng im. Màn hình rơi vào trạng thái
   * tự mâu thuẫn — dòng gợi ý in "18.616 + 123 = 18.739" ngay dưới một ô đang ghi 18.617,
   * kèm câu báo đỏ không khớp, mà không ô nào tự sửa được.
   *
   * Không có gì để "tôn trọng" cả: máy chủ ép `mới − cũ = tổng kWh` (`CONSUMPTION_MISMATCH`),
   * nên mọi con số khác công thức này đều bị từ chối. Số ĐÚNG duy nhất là số tự tính.
   */
  useEffect(() => {
    if (autoNewReading == null) return;
    const next = String(autoNewReading);
    setForm((f) => (f.newReading === next ? f : { ...f, newReading: next }));
  }, [autoNewReading]);

  const periodIssue = periodProblem(form.billingPeriod);

  const formReady =
    !!propertyId &&
    totalKwhNum > 0 &&
    Number(onlyDigits(form.totalAmount)) > 0 &&
    !periodIssue &&
    !continuityBlocked &&
    firstNote?.kind !== 'bad-prev' &&
    (!isWholeHouse || (!!form.prevReading && !!form.newReading && !readingMismatch));

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
        setOcrRawText(ocr?.rawText ?? '');
        // Tin mã của MÁY CHỦ trước parser của app: máy chủ đọc cùng tấm ảnh nhưng bằng
        // Google Vision, và nó cũng là bên sẽ đối chiếu nên lấy đúng số nó thấy là khớp nhất.
        const code = ocr?.customerCode || parsed.customerCode || '';
        setOcrCustomerCode(code);

        // Ưu tiên parser FE trên rawText: BE lấy "số dài nhất trong 80 ký tự sau nhãn" nên
        // với dòng "kWh 199 - 369.986" nó trả 369.986 làm số kWh. Số của BE chỉ dùng để bù
        // ô còn trống.
        if (!parsed.totalKwh && Number(ocr?.totalKwh) > 0) parsed.totalKwh = String(ocr.totalKwh);
        if (!parsed.totalAmount && Number(ocr?.totalAmount) > 0) parsed.totalAmount = String(ocr.totalAmount);
        if (!parsed.billingPeriod && ocr?.billingPeriod) parsed.billingPeriod = ocr.billingPeriod;

        setForm((f) => ({
          ...f,
          totalKwh: parsed.totalKwh || f.totalKwh,
          totalAmount: parsed.totalAmount || f.totalAmount,
          billingPeriod: parsed.billingPeriod || f.billingPeriod,
          // Chỉ số công tơ: parser đọc được từ bộ ba tự khớp phép trừ. Chỉ điền vào ô
          // còn trống — admin đã gõ tay thì không đè lên.
          prevReading: f.prevReading || parsed.prevReading || '',
          newReading: f.newReading || parsed.newReading || '',
          /*
            Ô "chỉ số cũ in trên giấy" cũng điền từ OCR — trước đây bỏ quên, admin phải tự
            gõ lại đúng con số vừa đọc được khỏi chính tấm ảnh đó.

            Nó KHÔNG trùng vai với `prevReading`: `prevReading` là số của sổ hệ thống (kỳ 2
            trở đi bị khoá theo chốt kỳ trước), còn ô này là số của tờ giấy. Cả màn hình tồn
            tại một phép so giữa hai số đó (`continuityGap`) để bắt phần kWh rơi ra ngoài
            mọi hoá đơn — tự điền một bên thì phép so vẫn còn nguyên ý nghĩa, chỉ đỡ cho
            admin một lần gõ.
          */
          paperPrev: f.paperPrev || parsed.prevReading || '',
          // Đè lên ô mã: quét ảnh MỚI thì mã cũ không còn nghĩa gì. Khác các ô số ở trên,
          // vốn giữ giá trị admin đã gõ tay.
          customerCode: code || f.customerCode,
        }));

        /*
          LIỆT KÊ ĐÚNG NHỮNG SỐ VỪA ĐỌC ĐƯỢC, thay cho câu chung chung cũ.

          Câu cũ ("Đã đọc sơ bộ từ ảnh — KIỂM TRA lại...") không nói đọc được cái gì, nên
          muốn kiểm thì phải tự dò từng ô rồi đối chiếu ngược lên ảnh. Ghi thẳng bốn con số
          ra đây thì admin liếc một cái là so xong với tờ giấy.

          Nêu cả thứ KHÔNG đọc được: hai ô chỉ số bỏ trống là có chủ ý (bộ ba không khớp
          tổng kWh nên parser từ chối đoán), không phải app quên điền.
        */
        const readParts = [
          parsed.newReading && `chỉ số mới ${Number(parsed.newReading).toLocaleString('vi-VN')}`,
          parsed.prevReading && `chỉ số cũ ${Number(parsed.prevReading).toLocaleString('vi-VN')}`,
          parsed.totalKwh && `${Number(parsed.totalKwh).toLocaleString('vi-VN')} kWh`,
          parsed.totalAmount && `${Number(parsed.totalAmount).toLocaleString('vi-VN')}đ`,
          parsed.billingPeriod && `kỳ ${parsed.billingPeriod}`,
          parsed.customerCode && `mã KH ${parsed.customerCode}`,
        ].filter(Boolean);
        setScanNote(
          readParts.length
            ? `Đọc được: ${readParts.join(' · ')}.`
              + (parsed.prevReading ? '' : ' Không đọc chắc được chỉ số công tơ — nhập tay giúp.')
              + ' Đối chiếu lại với ảnh trước khi phát hành.'
            : 'Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay.',
        );
      } catch {
        // OCR hỏng thì cũng mất luôn đường đối chiếu địa chỉ — xoá rawText cũ để không
        // đem chữ của ẢNH TRƯỚC ra kết luận cho ảnh này.
        setOcrRawText('');
        setOcrCustomerCode('');
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
    setOcrRawText('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, billingPeriod: selectedMonthPeriod });
    clearImage();
    setPublishError(null);
  };

  // ── Phát hành ──────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!formReady || !propertyId) return;
    setPublishing(true);
    setPublishError(null);
    setIssuedToTenant(false);
    const totalKwh = Number(onlyDigits(form.totalKwh));
    const totalAmount = Number(onlyDigits(form.totalAmount));
    const period = form.billingPeriod.trim();
    try {
      const created = await evnBillService.publish({
        propertyId,
        billingPeriod: period,
        month,
        year,
        totalKwh,
        totalAmount,
        imageUrl: imageUrl || undefined,
        // Nguyên căn: BE (bản 2 luồng) dùng luôn 2 số này để TỰ phát hành hoá đơn
        // cho khách trong cùng transaction. BE bản cũ bỏ qua field lạ nên gửi kèm
        // an toàn cho cả hai bản.
        prevReading: isWholeHouse ? Number(onlyDigits(form.prevReading)) : undefined,
        newReading: isWholeHouse ? Number(onlyDigits(form.newReading)) : undefined,
        /*
          MÃ KHÁCH HÀNG — bắt buộc gửi, không phải tuỳ chọn.

          Máy chủ đối chiếu với mã đã lưu của căn nhà và CHẶN phát hành khi lệch
          (`CUSTOMER_CODE_MISMATCH`) hoặc khi thiếu mà nhà đã có mã
          (`CUSTOMER_CODE_REQUIRED`). Không gửi thì mọi căn đã khai mã đều không phát
          hành được — mà lỗi lại hiện ra như một sự cố chứ không như một ô còn trống.
        */
        customerCode: form.customerCode.trim() || undefined,
        ocrConfirmed: true,
      });

      /**
       * NGUYÊN CĂN — phát hành thẳng cho khách thuê ngay tại đây.
       *
       * Giấy EVN của căn nhà đã có đủ chỉ số cũ / mới / tổng tiền của đúng khách đó,
       * không còn gì phải chia nên không cần ai đi đọc đồng hồ. Quản lý chỉ nhận
       * thông báo (BE `notifyManagerBillPublished` đã gửi khi tạo hoá đơn tổng).
       *
       * ⚠️ HAI BƯỚC KHÔNG NGUYÊN TỬ: nếu bước dưới lỗi thì hoá đơn tổng đã tạo rồi
       * mà khách chưa nhận gì. Nên báo lỗi RÕ là "tổng đã tạo, chưa gửi được cho
       * khách" chứ không nói chung là thất bại — admin cần biết đừng phát hành lại.
       * Sửa gốc là BE tự phát hành trong cùng transaction:
       * xem doc/BE-NEED-nguyen-can-tu-phat-hanh-hoa-don-tien-ich.
       */
      if (isWholeHouse) {
        const prevReading = Number(onlyDigits(form.prevReading));
        const newReading = Number(onlyDigits(form.newReading));
        try {
          await utilityInvoiceService.createForWholeHouse(propertyId, {
            type: 'ELECTRIC',
            billingPeriod: period,
            prevReading,
            newReading,
            consumption: totalKwh,
            // Đơn giá lấy từ bản BE trả về nếu có — BE tính ở scale 8, FE tự chia
            // sẽ lệch và rơi vào AMOUNT_MISMATCH.
            unitPrice: created.unitPrice ?? evnUnitPrice(totalAmount, totalKwh),
            amount: totalAmount,
            meterImageUrl: imageUrl || undefined,
          });
          setIssuedToTenant(true);
        } catch (e: any) {
          /**
           * `INVOICE_ALREADY_EXISTS` ở đây KHÔNG phải lỗi — nghĩa là BE (bản 2 luồng) đã
           * tự phát hành hoá đơn cho khách trong lúc tạo hoá đơn tổng, nên lệnh gọi này
           * thành ra dư. Khách đã có hoá đơn → coi như thành công, đừng hiện lỗi đỏ.
           *
           * Vì sao vẫn giữ lệnh gọi: BE và FE không deploy cùng lúc. Bỏ hẳn bây giờ mà BE
           * chưa lên thì nguyên căn tạo hoá đơn tổng rồi im lặng KHÔNG gửi cho khách —
           * hỏng nặng hơn. Khi BE bản mới đã chạy ở mọi môi trường thì XOÁ cả khối này
           * (BE đã yêu cầu 17/08/2026).
           */
          const code = e?.response?.data?.code;
          const msg = e?.response?.data?.message || e?.message || '';
          if (code === 'INVOICE_ALREADY_EXISTS' || /da ton tai|đã tồn tại/i.test(msg)) {
            setIssuedToTenant(true);
          } else {
            setPublishError(
              'Đã tạo hoá đơn tổng nhưng CHƯA gửi được cho khách thuê: '
              + (msg || 'lỗi không rõ')
              + '. Đừng phát hành lại — vào mục Đã phát hành để gửi lại cho khách.',
            );
          }
        }
      }

      setJustPublished(created);
      resetForm();
      setPropertyId(null);
      loadBills();
    } catch (e: any) {
      /*
        HAI LỖI MÃ KHÁCH HÀNG có cách gỡ rõ ràng, nói thẳng ra thay vì để nguyên câu của
        máy chủ rồi admin ngồi đoán.

        Quan trọng nhất: KHÔNG mất dữ liệu đang nhập. Máy chủ chỉ định cách gỡ là "sửa mã
        rồi gửi lại, không cần quét lại ảnh" — nên form phải giữ nguyên mọi ô, admin chỉ
        cần đổi một chuỗi rồi bấm lại.
      */
      const code = e?.response?.data?.code;
      const expected = e?.response?.data?.details?.expectedCustomerCode;
      if (code === 'CUSTOMER_CODE_MISMATCH') {
        /*
          IN HAI MÃ THEO CÙNG MỘT DẠNG thì mới thấy chúng khác nhau ở đâu.

          Máy chủ trả `expectedCustomerCode` đã chuẩn hoá (thường + bỏ hết khoảng trắng và
          dấu gạch), còn ô nhập thì giữ nguyên chữ admin gõ. Đặt cạnh nhau thô thì
          "PE 0500 0222239" và "pe05000222239" trông như hai thứ khác hẳn dù chỉ khác cách
          gõ — người đọc sẽ đi sửa nhầm chỗ.
        */
        const norm = (s?: string) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        setPublishError(
          `Mã khách hàng không khớp. Trên giấy đọc được "${norm(form.customerCode)}", `
          + `còn mã đã lưu của căn nhà này là "${norm(expected) || '—'}".\n\n`
          + 'Hoặc OCR đọc lệch — sửa ô mã ở trên rồi bấm lại, không cần quét lại ảnh. '
          + 'Hoặc đang chọn nhầm căn nhà — kiểm lại ô chọn nhà. '
          + 'Hoặc mã lưu trong hệ thống sai từ lúc tiếp nhận nhà — vào hồ sơ căn nhà sửa mã ở đó.',
        );
      } else if (code === 'CUSTOMER_CODE_REQUIRED') {
        setPublishError(
          'Căn nhà này đã khai mã khách hàng, nên phải điền mã trên tờ giấy để đối chiếu. '
          + 'Nhập vào ô "Mã khách hàng trên giấy" ở trên rồi bấm lại.',
        );
      } else {
        setPublishError(
          e?.response?.data?.message
            || e?.message
            || 'Không phát hành được hoá đơn.',
        );
      }
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Thu hồi — mở hộp xác nhận riêng thay cho `window.confirm`.
   *
   * `window.confirm` của trình duyệt không style được, hiện chuỗi "localhost:5173 cho
   * biết" ở tiêu đề và khoá cả tab cho tới khi bấm — với một thao tác phá huỷ thì nó
   * vừa xấu vừa không nêu rõ hậu quả. Hộp riêng cho phép làm nổi nút nguy hiểm và
   * hiện đúng thông tin bản ghi sắp thu hồi.
   */
  const doRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await evnBillService.revoke(revokeTarget.id);
      setRevokeTarget(null);
      loadBills();
    } catch (e: any) {
      setRevokeError(e?.response?.data?.message || e?.message || 'Không thu hồi được.');
    } finally {
      setRevoking(false);
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
            {/* Nhập lô — một .zip cho cả danh mục, thay vì lặp 5 thao tác × N nhà. */}
            <button
              type="button"
              onClick={() => setZipOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              <FileArchive className="h-4 w-4" /> Nhập từ .zip
            </button>
            {/* Nhãn này KHÔNG thừa: hai ô chọn dưới đây là kỳ TIÊU THỤ, không phải tháng
                đang phát hành — điện/nước trả sau nên hai thứ đó lệch nhau một tháng. */}
            <span
              className="text-[11px] font-black uppercase tracking-wider text-slate-400"
              title="Điện/nước trả sau: giữa tháng 9 thì hoá đơn đang phát hành là của kỳ tháng 8."
            >
              Kỳ tiêu thụ
            </span>
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
        <MissingBillsBanner
          kindLabel="điện EVN"
          periodLabel={`${month}/${year}`}
          loading={loadingProps || loadingBills}
          missing={occupiedProperties
            .filter(p => !publishedIds.has(p.id))
            .map(p => ({ id: p.id, name: p.propertyName }))}
          onPick={(id) => {
            setPropertyId(id);
            formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        {justPublished && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="text-sm">
              {/*
                Nói đúng việc VỪA XẢY RA. Câu cũ cho nhà chia phòng là "Đã giao cho quản lý
                đọc đồng hồ" — đúng với luồng trước 10/09/2026, khi phát hành chỉ là giao
                việc. Nay chỉ số đã được chốt từ cuối tháng, nên bấm phát hành là hoá đơn đi
                thẳng tới khách của những phòng đã chốt.
              */}
              <p className="font-bold text-emerald-800">
                {issuedToTenant
                  ? 'Đã phát hành cho khách thuê'
                  : lockedRooms.length > 0
                    ? `Đã phát hành cho ${lockedRooms.length} phòng`
                    : 'Đã chốt đơn giá cho kỳ này'}
                {' — '}{justPublished.propertyName ?? `nhà #${justPublished.propertyId}`}
              </p>
              <p className="text-emerald-700">
                {justPublished.totalKwh.toLocaleString('vi-VN')} kWh · {formatVnd(justPublished.totalAmount)} ·
                đơn giá {formatVnd(justPublished.unitPrice ?? evnUnitPrice(justPublished.totalAmount, justPublished.totalKwh))}/kWh
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {issuedToTenant
                  ? 'Khách đã nhận hoá đơn và có thể thanh toán. Quản lý nhận thông báo để vào xem.'
                  : lockedRooms.length > 0
                    ? `Khách của ${lockedRooms.length} phòng đã nhận hoá đơn và có thể thanh toán.`
                      + (missingRooms.length > 0
                        ? ` ${missingRooms.length} phòng chưa chốt số sẽ tự phát hành ngay khi quản lý chốt.`
                        : '')
                    : 'Chưa phòng nào chốt chỉ số nên chưa gửi được hoá đơn. Hoá đơn sẽ tự đi ngay khi '
                      + 'quản lý chốt số, bạn không cần đẩy lại giấy.'}
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

        <div ref={formTopRef} className="grid gap-6 lg:grid-cols-2 scroll-mt-24">
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
                <>
                  <PropertyCombobox
                    properties={occupiedProperties}
                    value={propertyId}
                    onChange={setPropertyId}
                    publishedIds={publishedIds}
                  />
                  {/* Nói rõ đã giấu bớt — im lặng thì admin tìm một căn quen thuộc,
                      không thấy, tưởng nhà bị xoá khỏi hệ thống. */}
                  {hiddenEmptyCount > 0 && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Chỉ hiện nhà đang có khách ở — {hiddenEmptyCount} nhà trống đã được ẩn.
                    </p>
                  )}
                </>
              )}

              {selectedProperty && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {isWholeHouse
                    ? 'Nhà nguyên căn — quản lý sẽ gửi thẳng đúng tổng tiền hoá đơn này cho khách.'
                    : 'Nhà cho thuê theo phòng — quản lý đã chốt chỉ số từ cuối tháng, hệ thống nhân với đơn giá bên dưới rồi gửi thẳng cho từng khách.'}
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
                  {/* Bấm để phóng to — ảnh hoá đơn EVN chữ nhỏ, xem ở khung 288px thì
                      không đọc nổi số để đối chiếu với ô nhập bên cạnh. */}
                  <button
                    type="button"
                    onClick={() => setZoomImage(imageUrl)}
                    title="Bấm để phóng to"
                    className="group relative block w-full cursor-zoom-in"
                  >
                    <img src={imageUrl} alt="Hoá đơn EVN" className="max-h-72 w-full bg-slate-50 object-contain" />
                    <span className="absolute right-2 top-2 rounded-lg bg-slate-900/70 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                      🔍 Phóng to
                    </span>
                  </button>
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
                className={`w-full rounded-lg border px-3 py-2.5 text-sm ${
                  periodIssue ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200'}`}
                placeholder="01/08 – 31/08/2026"
                value={form.billingPeriod}
                onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
              />
              {/* Ô chữ tự do nhưng KHÔNG phải muốn gõ gì cũng được — xem `periodProblem`. */}
              {periodIssue && (
                <p className="mt-1 text-xs font-bold text-rose-600">⚠ {periodIssue}</p>
              )}
              {/* Điền nhanh kỳ trọn tháng.
                  OCR đọc kỳ in trên giấy EVN, mà giấy hay là hoá đơn của kỳ khác (ảnh mẫu
                  cũ, hoặc kỳ chốt số 07/04 – 06/05 lệch hẳn tháng đang phát hành) — sửa
                  tay từng con số thì lâu và dễ gõ nhầm. Hai nút này ghi đè thẳng. */}
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
                {periodLooksWrong && (
                  <span className="text-xs text-amber-600">
                    Chuỗi này không nhắc tới {String(month).padStart(2, '0')}/{year} — kiểm lại,
                    ảnh EVN có thể là của kỳ khác.
                  </span>
                )}
              </div>
            </div>

            {/*
              ── Phát hành xong thì chuyện gì xảy ra ──
              Hai loại nhà ra hai kết quả khác hẳn nhau nên vẫn phải nói, nhưng nói bằng MỘT
              dòng. Đoạn bốn dòng cũ giải thích cả cơ chế phía sau — thứ luôn đúng, không đổi
              theo lần bấm nào, nên lần thứ hai trở đi chỉ còn là chữ chắn đường. Phần giải
              thích chuyển hết vào `title`, ai cần thì rê chuột.
            */}
            {!!propertyId && (
              <p
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  isWholeHouse
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
                    : 'border-violet-200 bg-violet-50 text-violet-800'}`}
                title={isWholeHouse
                  ? 'Cả căn chỉ một khách thuê và giấy EVN đã ghi đủ chỉ số cũ · mới · tổng tiền của chính căn đó, không còn gì phải chia. Quản lý chỉ nhận thông báo để vào xem, không phải làm bước nào.'
                  : 'Giấy EVN chỉ có tổng của cả nhà nên phải chia về từng phòng theo đồng hồ riêng. Quản lý đã chốt chỉ số vào ngày cuối tháng; phát hành là hệ thống nhân đơn giá rồi gửi hoá đơn cho từng khách. Phòng chốt muộn được phát hành ngay lúc chốt.'}
              >
                {isWholeHouse
                  ? <>⚡ <b>Nguyên căn</b> — phát hành là hoá đơn tới tay khách ngay.</>
                  : <>⚡ <b>Chia phòng</b> — phát hành là tính tiền theo chỉ số quản lý đã chốt và gửi cho khách.</>}
              </p>
            )}

            {/* ── Chỉ số công tơ — CHỈ nguyên căn ──
                Hoá đơn nguyên căn đi thẳng tới khách nên phải mang đúng hai số in trên giấy
                EVN, không được bịa. Nhà chia phòng thì hai số này vô nghĩa: mỗi phòng có đồng
                hồ riêng, quản lý đọc từng cái. */}
            {isWholeHouse && (
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Chỉ số cũ KHOÁ khi máy chủ đã có số của kỳ trước.
                    Đây là số đã chốt với khách kỳ trước rồi — sửa nó nghĩa là sửa lại một
                    kỳ đã thu tiền xong, và làm hai kỳ liền nhau không còn nối tiếp: kỳ
                    trước kết ở A, kỳ này lại khai bắt đầu từ B. Chỉ mở khoá khi nhà chưa
                    từng có chỉ số nào (nhà mới, chưa kỳ nào) — lúc đó phải gõ tay số đầu. */}
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Chỉ số cũ (kWh) {!prevLocked && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    className={`input-field w-full tabular-nums ${
                      prevLocked ? 'bg-slate-100 text-slate-600' : ''
                    }`}
                    inputMode="numeric"
                    readOnly={prevLocked}
                    placeholder={loadingPrev ? 'Đang lấy chỉ số kỳ trước…' : 'Số đầu kỳ trên giấy EVN'}
                    value={form.prevReading}
                    onChange={(e) => setForm((f) => ({ ...f, prevReading: e.target.value }))}
                  />
                  {prevLocked ? (
                    <p className="mt-1 text-xs text-slate-500"
                      title="Số đã chốt với khách ở kỳ trước và đã thu tiền theo nó. Sửa được nghĩa là cho phép hai kỳ không nối tiếp, phần chênh biến mất khỏi mọi hoá đơn.">
                      🔒 Chốt kỳ trước{cycle?.prevClose?.at ? ` (${cycle.prevClose.at.slice(0, 7)})` : ''}
                    </p>
                  ) : !loadingPrev && propertyId && cycle?.firstPeriod ? (
                    <p className="mt-1 text-xs font-semibold text-indigo-600"
                      title="Chưa có kỳ trước để nối nên ô này mở. Từ kỳ sau hệ thống tự điền và khoá lại.">
                      Kỳ đầu — nhập số đầu kỳ trên giấy EVN
                    </p>
                  ) : !loadingPrev && propertyId ? (
                    <p className="mt-1 text-xs text-amber-600">Chưa có chỉ số kỳ nào — nhập số đầu kỳ</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Chỉ số mới (kWh) <span className="text-rose-500">*</span>
                  </label>
                  {/* Ô DẪN XUẤT, không cho gõ — xem effect `autoNewReading`. Máy chủ ép
                      `mới − cũ = tổng kWh` nên mọi số khác công thức đều bị từ chối. */}
                  <input
                    className="input-field w-full bg-slate-100 tabular-nums text-slate-600"
                    inputMode="numeric"
                    readOnly
                    placeholder={prevReadingNum > 0 ? 'Nhập tổng kWh để tự tính' : 'Cần chỉ số cũ + tổng kWh'}
                    value={form.newReading}
                    onChange={(e) => setForm((f) => ({ ...f, newReading: e.target.value }))}
                  />
                  {/* Chỉ nêu PHÉP TÍNH, không dặn dò. Câu "giấy ghi khác thì sửa ô tổng"
                      chuyển vào `title` của ô — ai định gõ vào đây mới cần tới nó. */}
                  <p className="mt-1 text-xs text-slate-400" title="Giấy EVN ghi khác thì sửa ô tổng kWh, không sửa ở đây — máy chủ ép hiệu hai chỉ số phải bằng đúng tổng kWh.">
                    {autoNewReading != null
                      ? <>= {prevReadingNum.toLocaleString('vi-VN')} + {totalKwhNum.toLocaleString('vi-VN')} kWh</>
                      : 'Tự tính = chỉ số cũ + tổng kWh'}
                  </p>
                </div>
                {/* ── KỲ ĐẦU: bày đủ hai mốc ─────────────────────────────────
                    Chỉ hiện ở kỳ đầu của khách. Từ kỳ 2 khối này biến mất — lúc đó mốc đón
                    khách không còn liên quan, thứ duy nhất cần soi là nối tiếp với kỳ trước.

                    Hai ô chỉ số ở trên vẫn giữ số trên giấy EVN (trọn tháng): đó là chi phí
                    công ty trả nhà nước, không được sửa. Máy chủ tự cắt phần trước mốc đón
                    khách khi lập hoá đơn cho khách (BE 27/08/2026) — hiện khối này để admin
                    biết TRƯỚC con số khách nhận sẽ khác giấy, không thì phát hành xong thấy
                    lệch lại tưởng hệ thống tính sai. */}
                {cycle?.firstPeriod && (
                  <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    {/* KHÔNG in lại số cũ / số mới ở đây — chúng đang nằm trong hai ô ngay
                        phía trên, cách vài chục pixel. Khối này chỉ thêm đúng một dữ kiện
                        mà chỗ khác không có: mốc đồng hồ lúc đón khách. */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-bold text-indigo-800">
                        Kỳ đầu tiên của khách này
                        <span className="ml-1.5 font-normal text-indigo-600">
                          · đồng hồ lúc đón khách
                          {cycle.handover?.at
                            ? ` ${cycle.handover.at.slice(0, 10).split('-').reverse().join('/')}`
                            : ''}
                        </span>
                      </p>
                      <p className="text-lg font-black tabular-nums text-indigo-800">
                        {cycle.handover
                          ? `${Math.round(cycle.handover.reading).toLocaleString('vi-VN')} kWh`
                          : <span className="text-sm font-semibold text-indigo-500">hợp đồng không ghi</span>}
                      </p>
                    </div>
                    {firstNote?.kind === 'pre-move-in' && newReadingNum > 0 && (
                      <p className="mt-2 flex gap-2 rounded-lg bg-white/70 p-2 text-xs leading-relaxed text-indigo-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        <span>
                          Giấy EVN tính trọn tháng nhưng khách dọn vào giữa kỳ: khách trả{' '}
                          <b>{(newReadingNum - firstNote.handover).toLocaleString('vi-VN')} kWh</b>,
                          còn <b>{firstNote.amount.toLocaleString('vi-VN')} kWh</b> trước khi họ dọn tới là
                          chi phí công ty. Máy chủ tự cắt phần này khi lập hoá đơn cho khách.
                        </span>
                      </p>
                    )}
                    {/* Chênh lớn hơn cả lượng tiêu thụ của kỳ → không phải "dọn vào giữa kỳ"
                        mà là đọc sai ô đầu kỳ — xem `firstPeriodNote`. */}
                    {firstNote?.kind === 'bad-prev' && (
                      <p className="mt-2 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs leading-relaxed text-rose-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                        <span>
                          Chỉ số cũ đang nhỏ hơn mốc đón khách tới{' '}
                          <b>{(firstNote.handover - prevReadingNum).toLocaleString('vi-VN')} kWh</b> — nhiều
                          hơn cả lượng tiêu thụ của kỳ này. Gần như chắc chắn ô <b>chỉ số cũ</b> đọc sai;
                          mở ảnh soi lại số đầu kỳ trên giấy EVN.
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* ── KỲ 2 TRỞ ĐI: đối chiếu giấy với sổ ─────────────────────
                    Ô chỉ số cũ ở trên đã khoá theo sổ, nên việc còn lại là kiểm xem tờ giấy
                    kỳ này có bắt đầu đúng chỗ kỳ trước kết thúc không. Xem `continuityGap`. */}
                {needsPaperPrev && (
                  <div className={`sm:col-span-2 rounded-xl border p-3 ${
                    readingGap ? 'border-rose-200 bg-rose-50'
                      : paperPrevNum == null ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-bold text-slate-700">
                        Số cũ IN TRÊN GIẤY EVN kỳ này <span className="text-rose-500">*</span>
                      </label>
                      <input
                        className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs font-bold tabular-nums outline-none focus:border-indigo-400"
                        inputMode="numeric"
                        placeholder="—"
                        value={form.paperPrev}
                        onChange={(e) => setForm((f) => ({ ...f, paperPrev: onlyDigits(e.target.value) }))}
                      />
                      {readingGap ? (
                        <span className="text-xs font-black text-rose-700">
                          ⚠ lệch {Math.abs(readingGap.diff).toLocaleString('vi-VN')} kWh
                        </span>
                      ) : paperPrevNum != null ? (
                        <span className="text-xs font-black text-emerald-700">✓ nối liền kỳ trước</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {readingGap ? (
                        <>
                          Kỳ trước chốt <b>{readingGap.expected.toLocaleString('vi-VN')}</b>, giấy kỳ này bắt
                          đầu từ <b>{readingGap.found.toLocaleString('vi-VN')}</b> — phần ở giữa không nằm
                          trên hoá đơn nào. <b>Chưa phát hành được.</b>
                        </>
                      ) : paperPrevNum == null ? (
                        <>Phải bằng chốt kỳ trước ({cycle?.prevClose?.reading.toLocaleString('vi-VN')}) mới phát hành được.</>
                      ) : (
                        <>Hai kỳ nối liền nhau.</>
                      )}
                    </p>
                  </div>
                )}
                {readingMismatch ? (
                  <p className="sm:col-span-2 text-xs font-semibold text-rose-600">
                    Chỉ số mới − chỉ số cũ = {(newReadingNum - prevReadingNum).toLocaleString('vi-VN')} kWh,
                    không khớp tổng {totalKwhNum.toLocaleString('vi-VN')} kWh ở trên. Sửa cho khớp rồi
                    mới phát hành được — hoá đơn khách nhận phải đúng số trên giấy EVN.
                  </p>
                ) : null}
              </div>
            )}

            {/* Đơn giá là con số quan trọng nhất trang này: mọi hoá đơn phòng đều nhân với nó. */}
            <div className={`rounded-xl border p-4 ${unitPrice > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}>
              {/* Câu "= tổng tiền ÷ tổng kWh…" chuyển vào `title`: nó luôn đúng, không đổi
                  theo lần bấm nào, nên đứng thường trực dưới con số chỉ là chữ chắn đường. */}
              <p
                className="text-xs font-bold uppercase tracking-wide text-slate-500"
                title="= tổng tiền ÷ tổng kWh. EVN tính bậc thang nên hoá đơn không in sẵn đơn giá. Quản lý dựng hoá đơn từng phòng trên chính con số này."
              >
                Đơn giá hệ thống sẽ dùng
              </p>
              <p className={`mt-1 text-3xl font-black tabular-nums ${unitPrice > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                {unitPrice > 0 ? `${formatVnd(unitPrice)}/kWh` : '—'}
              </p>
            </div>

            {publishError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {publishError}
              </div>
            )}

            {/*
              ── Chặn nhầm nhà (24/08/2026) ──
              Đặt SÁT NÚT PHÁT HÀNH, không phải cạnh ô tải ảnh: đây là thứ cuối cùng cần
              đọc trước khi tiền đi tới khách, và admin thường chọn nhà xong mới tải ảnh
              (hoặc ngược lại) nên cảnh báo cạnh ô ảnh dễ bị cuộn qua mất.

              CẢNH BÁO chứ không chặn — OCR ảnh chụp điện thoại sai nhiều, chặn cứng sẽ
              có ngày admin cầm đúng hoá đơn mà không phát hành được. Lớp hậu kiểm là
              quyền khiếu nại của khách (trang "Khiếu nại hoá đơn điện/nước").
            */}
            {billMatch.verdict === 'mismatch' && (
              <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-rose-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Ảnh có vẻ KHÔNG phải của căn nhà này
                </p>
                <p className="mt-1 text-xs leading-relaxed text-rose-700">{billMatch.message}</p>
                <p className="mt-1.5 text-xs text-rose-600">
                  Đang chọn: <b>{selectedProperty?.propertyName}</b>
                  {selectedProperty?.shortAddress ? ` — ${selectedProperty.shortAddress}` : ''}
                </p>
              </div>
            )}

            {billMatch.verdict === 'weak' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Nên kiểm lại địa chỉ trên ảnh
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">{billMatch.message}</p>
              </div>
            )}

            {/*
              MÃ KHÁCH HÀNG ĐỌC ĐƯỢC — đặt NGAY TRÊN khối đối chiếu địa chỉ, vì nó là bằng
              chứng mạnh hơn hẳn.

              Đối chiếu địa chỉ là so chữ mờ: địa chỉ hay viết tắt, phường vừa đổi tên hàng
              loạt, OCR đọc rụng dấu — nên nó cảnh báo nhầm nhiều, mà cảnh báo nhầm nhiều thì
              người ta bấm bỏ qua theo phản xạ. Mã khách hàng thì đúng-hoặc-sai, không có
              vùng xám, và admin liếc một cái là so xong với tờ giấy đang cầm.

              Chưa tự so được vì máy chủ chưa lưu mã của từng căn nhà (kiểm 11/09/2026:
              `Property` và `InboundContract` đều không có trường nào). Nói thẳng chỗ đó ra
              thay vì im lặng, để admin biết phần kiểm này vẫn đang do mắt người làm.
            */}
            {!!propertyId && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  Mã khách hàng trên giấy
                </label>
                <input
                  value={form.customerCode}
                  onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
                  placeholder="VD: PE05000222239"
                  className="mt-1 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-base font-extrabold tracking-wide text-indigo-900 outline-none focus:border-indigo-400"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-indigo-700">
                  {ocrCustomerCode
                    ? 'Đã đọc từ ảnh. Soát lại với tờ giấy đang cầm rồi sửa nếu OCR đọc lệch — số 0 hay bị đọc thành chữ O.'
                    : 'Không đọc được từ ảnh — gõ tay theo tờ giấy.'}
                </p>
                {/*
                  Ô SỬA ĐƯỢC chứ không phải dòng chỉ đọc.

                  Máy chủ CHẶN phát hành khi mã lệch mã đã lưu của căn nhà, và cách gỡ mà nó
                  chỉ định là "sửa mã rồi gửi lại, không cần quét lại ảnh". Bày một dòng chỉ
                  đọc thì admin gặp lỗi mà không có chỗ nào để sửa, chỉ còn nước quét lại ảnh
                  và nhận đúng con số cũ.
                */}
              </div>
            )}

            {billMatch.verdict === 'match' && (
              /* Nói cả khi ĐÚNG: cảnh báo chỉ đáng tin khi người dùng thấy nó có chạy
                 thật. Im lặng lúc đúng thì lúc sai họ sẽ tưởng hệ thống lỗi. */
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Địa chỉ trên ảnh khớp với căn nhà đang chọn.
              </p>
            )}

            {/*
              CHỈ SỐ TỪNG PHÒNG QUẢN LÝ ĐÃ CHỐT — chỉ nhà chia phòng.

              Trước đây admin không có chỗ nào xem thứ này. Bấm phát hành là gửi tiền tới
              tay khách, tính từ những con số admin chưa từng nhìn thấy: sai một chữ số là
              hoá đơn lệch hàng trăm nghìn, và chỉ vỡ ra khi khách khiếu nại — lúc đó tiền
              đã đòi rồi. Ảnh mặt đồng hồ nằm sẵn trong dữ liệu ngay từ đầu, chỉ là chưa có
              màn nào bày nó ra trước lúc phát hành.

              Hiện CẢ SAU khi đã phát hành (không còn chặn bằng `!existingBill`): lúc đó nó
              là hồ sơ để đối chiếu khi khách gọi lên hỏi "sao tháng này cao thế".
            */}
            {!isWholeHouse && propertyId && (
              loadingReadings ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xem phòng nào đã chốt chỉ số...
                </p>
              ) : savedReadings && savedReadings.length > 0 ? (
                <div
                  className={`rounded-lg border ${
                    lockedRooms.length === 0
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  <div className="p-3">
                    <p
                      className={`flex items-center gap-1.5 text-sm font-bold ${
                        lockedRooms.length === 0 ? 'text-amber-800' : 'text-emerald-800'
                      }`}
                    >
                      {lockedRooms.length === 0
                        ? <AlertTriangle className="h-4 w-4 shrink-0" />
                        : <Check className="h-4 w-4 shrink-0" />}
                      {lockedRooms.length}/{savedReadings.length} phòng đã chốt chỉ số kỳ {month}/{year}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {existingBill
                        ? `Đã phát hành hoá đơn cho ${lockedRooms.filter((r) => r.invoiceId != null).length} phòng. `
                        : lockedRooms.length === 0
                          ? 'Phát hành bây giờ sẽ không gửi được hoá đơn nào — chưa phòng nào có chỉ số. '
                          : `Phát hành sẽ tính tiền và gửi hoá đơn cho ${lockedRooms.length} phòng này ngay. `}
                      {missingRooms.length > 0
                        ? `${missingRooms.length} phòng còn lại sẽ tự phát hành ngay khi quản lý chốt số, `
                          + 'không cần bạn đẩy lại giấy.'
                        : 'Cả nhà đã đủ chỉ số.'}
                    </p>

                    <button
                      type="button"
                      onClick={() => setReadingsOpen((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900"
                    >
                      {readingsOpen ? 'Thu gọn' : 'Xem chỉ số & ảnh đồng hồ từng phòng'}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${readingsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {readingsOpen && (
                    <div className="space-y-2 border-t border-white/60 bg-white/70 p-3">
                      {savedReadings.map((r) => {
                        const locked = r.newReading != null;
                        const used = locked ? Number(r.newReading) - Number(r.prevReading) : null;
                        return (
                          <div
                            key={r.roomId ?? r.roomNumber ?? Math.random()}
                            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-2.5"
                          >
                            {/* Ảnh là BẰNG CHỨNG của con số, nên đứng ngay cạnh con số chứ
                                không nhét xuống cuối. Bấm để phóng to — chỉ số trên mặt
                                đồng hồ không đọc nổi ở cỡ thumbnail. */}
                            {r.meterImageUrl ? (
                              <button
                                type="button"
                                onClick={() => setZoomImage(r.meterImageUrl!)}
                                className="shrink-0 overflow-hidden rounded-md border border-slate-200"
                              >
                                <img
                                  src={r.meterImageUrl}
                                  alt={`Đồng hồ phòng ${r.roomNumber ?? ''}`}
                                  className="h-14 w-14 object-cover transition hover:scale-105"
                                />
                              </button>
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400">
                                {locked ? 'Mã admin' : 'Chưa có'}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-slate-800">
                                {r.roomNumber ? `Phòng ${r.roomNumber}` : `#${r.roomId}`}
                                {r.tenantName && (
                                  <span className="text-xs font-medium text-slate-500">{r.tenantName}</span>
                                )}
                                {r.invoiceId != null && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    Đã gửi khách
                                  </span>
                                )}
                              </p>
                              {locked ? (
                                <>
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    {Number(r.prevReading).toLocaleString('vi-VN')} →{' '}
                                    <b className="text-slate-900">{Number(r.newReading).toLocaleString('vi-VN')}</b>
                                    {used != null && ` · ${used.toLocaleString('vi-VN')} kWh`}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    Chốt lúc {fmtDateTime(r.capturedAt)}
                                    {r.prevSource === 'HANDOVER' && ' · chỉ số cũ lấy từ lúc đón khách'}
                                  </p>
                                </>
                              ) : (
                                <p className="mt-0.5 text-xs font-semibold text-amber-700">
                                  Quản lý chưa chốt chỉ số phòng này.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null
            )}

            <button
              type="button"
              disabled={!formReady || publishing || !!existingBill}
              onClick={publish}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {/*
                Nhãn cũ của nhà chia phòng là "Gửi cho quản lý đọc đồng hồ" — mô tả đúng
                luồng TRƯỚC 10/09/2026, khi phát hành chỉ là giao việc. Nay bấm nút này là
                tiền tới tay khách, nên nhãn phải nói ra điều đó, kèm số phòng để admin biết
                mình đang gửi cho bao nhiêu người.
              */}
              {existingBill
                ? 'Kỳ này đã phát hành'
                : isWholeHouse
                  ? 'Phát hành & gửi cho khách thuê'
                  : lockedRooms.length > 0
                    ? `Phát hành & gửi cho ${lockedRooms.length} phòng`
                    : 'Phát hành đơn giá cho kỳ này'}
            </button>
          </div>
        </div>
      </SectionShell>

      {/* ── Bảng đã phát hành ── */}
      <SectionShell
        title={`Đã phát hành — kỳ ${month}/${year}`}
        subtitle="Các nhà dưới đây đã có đơn giá điện của kỳ. Hoá đơn đã gửi tới khách của mọi phòng đã chốt chỉ số."
        icon={Zap}
        action={
          bills.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Tìm nhà hoặc kỳ..."
                  value={billSearch}
                  onChange={(e) => setBillSearch(e.target.value)}
                />
              </div>
              {([
                { key: 'all',       label: `Tất cả ${bills.length}` },
                { key: 'published', label: `Đang hiệu lực ${bills.filter(b => b.status !== 'REVOKED').length}` },
                { key: 'revoked',   label: `Đã thu hồi ${bills.filter(b => b.status === 'REVOKED').length}` },
              ] as { key: typeof billStatus; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setBillStatus(t.key)}
                  className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                    billStatus === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
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
        ) : visibleBills.length === 0 ? (
          // Phân biệt "kỳ này chưa phát hành gì" với "có nhưng bộ lọc đang che" —
          // dùng chung một câu là người dùng tưởng mất dữ liệu.
          <EmptyState text="Không có bản ghi nào khớp bộ lọc." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  {/* Gộp tổng kWh · tổng tiền · đơn giá vào MỘT cột: ba con số đó là một
                      phép chia, tách ra ba cột thì mắt phải ghép lại. Chỗ tiết kiệm được
                      dành cho cột TIẾN ĐỘ — thứ duy nhất khác nhau giữa các dòng. */}
                  <th className="pb-2 pr-3 font-bold">Nhà · kỳ</th>
                  <th className="pb-2 pr-3 text-right font-bold">Số liệu tờ hoá đơn</th>
                  <th className="pb-2 pr-3 font-bold">Tiến độ ghi chỉ số</th>
                  <th className="pb-2 pr-3 font-bold">Phát hành</th>
                  <th className="pb-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {pagedBills.map((b) => {
                  const revoked = b.status === 'REVOKED';
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailBill(b)}
                      className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${revoked ? 'opacity-50' : ''}`}
                      title="Bấm để xem chi tiết"
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          {b.imageUrl && (
                            <img src={b.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">
                              {b.propertyName ?? `#${b.propertyId}`}
                              {revoked && (
                                <span className="ml-2 align-middle">
                                  <StatusPill label="Đã thu hồi" color="bg-slate-200 text-slate-600" />
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-400">{b.billingPeriod}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right">
                        <p className="font-bold tabular-nums text-slate-800">{formatVnd(b.totalAmount)}</p>
                        <p className="text-xs tabular-nums text-slate-400">
                          {b.totalKwh.toLocaleString('vi-VN')} kWh ·{' '}
                          <span className="font-bold text-indigo-600">
                            {formatVnd(b.unitPrice ?? evnUnitPrice(b.totalAmount, b.totalKwh))}/kWh
                          </span>
                        </p>
                      </td>
                      <td className="py-3 pr-3"><ReadingProgress bill={b} /></td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {fmtDateTime(b.createdAt)}
                        {b.createdBy ? ` · ${b.createdBy}` : ''}
                      </td>
                      <td className="py-3 text-right">
                        {/* Thu hồi là hành động MỘT CHIỀU và hiếm khi đúng — để nó thành nút
                            viền đỏ to bằng mọi dòng là mời bấm nhầm. Thu về đúng một icon,
                            hiện rõ khi rê chuột vào dòng. */}
                        {!revoked && (
                          <button
                            type="button"
                            title="Thu hồi hoá đơn này"
                            onClick={(e) => { e.stopPropagation(); setRevokeTarget(b); setRevokeError(null); }}
                            className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Thanh phân trang — chỉ hiện khi thật sự có hơn 1 trang. */}
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  Hiển thị <span className="font-bold text-slate-700">{(billPage - 1) * BILLS_PER_PAGE + 1}
                  –{Math.min(billPage * BILLS_PER_PAGE, visibleBills.length)}</span> trên{' '}
                  <span className="font-bold text-slate-700">{visibleBills.length}</span> bản ghi
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={billPage === 1}
                    onClick={() => setBillPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ‹ Trước
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBillPage(p)}
                      className={`min-w-[32px] rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        p === billPage
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={billPage === totalPages}
                    onClick={() => setBillPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sau ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SectionShell>

      {/* ── Chi tiết hoá đơn đã phát hành ──
          Bảng chỉ đủ chỗ cho vài cột; ảnh hoá đơn gốc và các mốc thời gian phải mở
          riêng mới xem được. Bấm bất kỳ dòng nào trong bảng để vào đây. */}
      {detailBill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setDetailBill(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold text-slate-900">
                  {detailBill.propertyName ?? `Nhà #${detailBill.propertyId}`}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">Kỳ {detailBill.billingPeriod}</p>
              </div>
              {detailBill.status === 'REVOKED'
                ? <StatusPill label="Đã thu hồi" color="bg-slate-200 text-slate-600" />
                : <StatusPill label="Đang hiệu lực" color="bg-emerald-100 text-emerald-700" />}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tổng kWh</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
                  {detailBill.totalKwh.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tổng tiền</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
                  {formatVnd(detailBill.totalAmount)}
                </p>
              </div>
              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-400">Đơn giá</p>
                <p className="mt-1 text-lg font-black tabular-nums text-indigo-700">
                  {formatVnd(detailBill.unitPrice ?? evnUnitPrice(detailBill.totalAmount, detailBill.totalKwh))}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Phát hành lúc</span>
                <span className="font-semibold text-slate-800">{fmtDateTime(detailBill.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Người phát hành</span>
                <span className="font-semibold text-slate-800">{detailBill.createdBy ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Kỳ (tháng/năm)</span>
                <span className="font-semibold text-slate-800">{detailBill.month}/{detailBill.year}</span>
              </div>
            </div>

            <p className="mt-4 mb-1.5 text-sm font-bold text-slate-700">Ảnh hoá đơn gốc</p>
            {detailBill.imageUrl ? (
              <button
                type="button"
                onClick={() => setZoomImage(detailBill.imageUrl!)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200"
              >
                <img src={detailBill.imageUrl} alt="Hoá đơn EVN" className="max-h-80 w-full bg-slate-50 object-contain" />
              </button>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                Bản ghi này phát hành không kèm ảnh.
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailBill(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Xem ảnh phóng to ──
          Bấm nền hoặc Esc để đóng. Ảnh để `max-h/max-w` theo viewport nên luôn vừa
          màn hình, không phải cuộn. */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setZoomImage(null)}
        >
          <img
            src={zoomImage}
            alt="Hoá đơn EVN phóng to"
            className="max-h-[92vh] max-w-[92vw] rounded-lg bg-white object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoomImage(null)}
            className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-white"
          >
            ✕ Đóng
          </button>
        </div>
      )}

      {/* ── Hộp xác nhận thu hồi ──
          Thay `window.confirm`: hộp của trình duyệt không style được, gắn thêm dòng
          "localhost:5173 cho biết" và khoá cả tab. Với một thao tác phá huỷ thì cần
          nêu rõ đang thu hồi bản ghi NÀO và hậu quả ra sao. */}
      {revokeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => !revoking && setRevokeTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-100 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold text-slate-900">Thu hồi hoá đơn EVN?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Quản lý sẽ không dùng được đơn giá này nữa. Hoá đơn ĐÃ gửi cho khách thì
                  không bị ảnh hưởng.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold text-slate-800">
                {revokeTarget.propertyName ?? `Nhà #${revokeTarget.propertyId}`}
              </p>
              <p className="text-slate-500">Kỳ {revokeTarget.billingPeriod}</p>
              <p className="text-slate-500">
                {revokeTarget.totalKwh.toLocaleString('vi-VN')} kWh · {formatVnd(revokeTarget.totalAmount)} ·
                {' '}{formatVnd(revokeTarget.unitPrice ?? evnUnitPrice(revokeTarget.totalAmount, revokeTarget.totalKwh))}/kWh
              </p>
            </div>

            {revokeError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
                {revokeError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={revoking}
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={doRevoke}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Thu hồi
              </button>
            </div>
          </div>
        </div>
      )}

      {zipOpen && (
        <UtilityBillZipImport
          kind="ELECTRIC"
          properties={properties}
          month={month}
          year={year}
          defaultPeriod={selectedMonthPeriod}
          existing={bills}
          onClose={() => setZipOpen(false)}
          onDone={loadBills}
        />
      )}
    </div>
  );
};
