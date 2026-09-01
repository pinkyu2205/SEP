/**
 * NHẬP HOÁ ĐƠN ĐIỆN / NƯỚC THEO LÔ — một file .zip cho cả danh mục nhà.
 *
 * Dùng chung cho cả hai trang phát hành, chọn bằng prop `kind`. Toàn bộ khác biệt giữa
 * điện và nước nằm gọn trong bảng `KIND` bên dưới.
 *
 * ─── Vì sao có màn này ───────────────────────────────────────────────────────
 * Luồng lẻ bắt admin lặp đúng 5 thao tác cho MỖI nhà: chọn nhà → tải ảnh → chờ OCR →
 * xác nhận số → phát hành. Ba chục nhà là ba chục vòng, và giữa chừng rất dễ bỏ sót
 * một căn mà không có gì nhắc.
 *
 * ─── Vì sao KHÔNG tự phát hành ngay sau khi đọc ──────────────────────────────
 * OCR ở đây là best-effort, doc của cả hai parser đều ghi rõ "kết quả LUÔN cần người
 * xác nhận lại". Các lỗi đã gặp trên hoá đơn thật: mã công tơ 18.006.996 bị đọc thành
 * kWh, năm trong "06/05/2022" bị đọc thành kWh, mã số thuế lớn hơn cả tổng tiền; riêng
 * hoá đơn nước còn bẫy hai con số tiền — lấy nhầm "cộng tiền hàng" là thu thiếu ~15%.
 *
 * Đọc sai sản lượng là hỏng dây chuyền — đơn giá = tiền ÷ sản lượng, mà manager dựng
 * hoá đơn TỪNG PHÒNG trên đúng đơn giá đó. Làm lẻ thì admin thấy ngay; nhập lô rồi tự
 * phát hành thì sai lặng lẽ cho cả chục nhà.
 *
 * Nên màn này chia làm ba chặng rõ rệt: đối chiếu → đọc số → DUYỆT rồi mới phát hành.
 */
import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileArchive, Loader2, RotateCcw, Upload, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadToCloudinary } from '@/services/upload.service';
import { evnBillService, evnUnitPrice } from '@/services/evnBill.service';
import { waterBillService, waterUnitPrice } from '@/services/waterBill.service';
import { utilityInvoiceService } from '@/services/utilityInvoice.service';
import { parseEvnInvoice, onlyDigits } from '@/utils/evnInvoiceParser';
import { parseWaterInvoice } from '@/utils/waterInvoiceParser';
import { groupThousands } from '@/utils';
import { formatCurrency } from '@/utils';
import { inspectZipBills, type ZipBillPreview } from '@/utils/zipUtilityBills';
import type { PropertyResponse } from '@/types/api.types';

type Stage = 'pick' | 'preview' | 'reading' | 'review';

/** Kiểu tiện ích — quyết định parser, endpoint và cách tính đơn giá. */
export type UtilityKind = 'ELECTRIC' | 'WATER';

/** Số liệu một tờ hoá đơn, đã chuẩn hoá về chuỗi chữ số để đổ thẳng vào ô nhập. */
interface ParsedBill {
  qty: string;
  amount: string;
  period: string;
  prevReading: string;
  newReading: string;
}

const num = (v: number | undefined) => (v != null && v > 0 ? String(v) : '');

/**
 * TOÀN BỘ khác biệt điện ↔ nước gom vào đây.
 *
 * Hai tờ hoá đơn khác hẳn nhau (xem đầu `waterInvoiceParser`: hoá đơn nước có HAI con số
 * tiền, lấy nhầm "cộng tiền hàng" thay vì "tổng tiền thanh toán" là thu thiếu ~15%), và
 * đơn giá nước KHÔNG được làm tròn trong khi điện thì có. Nhân đôi cả màn hình cho hai
 * kiểu là chắc chắn sẽ có ngày sửa một bên quên bên kia — nên chỉ nhân đôi đúng bảng này.
 */
const KIND: Record<UtilityKind, {
  title: string;
  /** Danh từ ngắn ghép vào câu: "hoá đơn {noun}". */
  noun: string;
  /** Slug không dấu, dùng trong tên file mẫu. */
  slug: string;
  unit: string;
  qtyLabel: string;
  readingLabel: string;
  parse: (ocr: { rawText?: string; numbers?: string[] }) => ParsedBill;
  ocr: (url: string) => Promise<{ rawText?: string; numbers?: string[]; totalAmount?: number; billingPeriod?: string }>;
  unitPrice: (amount: number, qty: number) => number;
  publish: (input: {
    propertyId: number; billingPeriod: string; month: number; year: number;
    qty: number; amount: number; imageUrl?: string;
    prevReading?: number; newReading?: number;
  }) => Promise<{ unitPrice?: number }>;
}> = {
  ELECTRIC: {
    title: 'Hoá đơn điện từ file .zip',
    noun: 'điện',
    slug: 'dien',
    unit: 'kWh',
    qtyLabel: 'Tổng kWh',
    readingLabel: 'Chỉ số công tơ',
    parse: (ocr) => {
      const p = parseEvnInvoice(ocr);
      return {
        qty: p.totalKwh, amount: p.totalAmount, period: p.billingPeriod,
        prevReading: p.prevReading ?? '', newReading: p.newReading ?? '',
      };
    },
    ocr: (url) => evnBillService.ocr(url),
    unitPrice: evnUnitPrice,
    publish: ({ qty, amount, ...rest }) =>
      evnBillService.publish({ ...rest, totalKwh: qty, totalAmount: amount }),
  },
  WATER: {
    title: 'Hoá đơn nước từ file .zip',
    noun: 'nước',
    slug: 'nuoc',
    unit: 'm³',
    qtyLabel: 'Tổng m³',
    readingLabel: 'Chỉ số đồng hồ',
    parse: (ocr) => {
      const p = parseWaterInvoice(ocr);
      return {
        qty: num(p.totalQuantity), amount: num(p.totalAmount), period: p.billingPeriod ?? '',
        prevReading: num(p.prevReading), newReading: num(p.newReading),
      };
    },
    ocr: (url) => waterBillService.ocr(url),
    unitPrice: waterUnitPrice,
    publish: ({ qty, amount, ...rest }) =>
      waterBillService.create({ ...rest, totalQuantity: qty, totalAmount: amount }),
  },
};

/** Một nhà trong lô, kèm số liệu đọc được và kết quả phát hành. */
interface Row {
  property: PropertyResponse;
  folder: string;
  file: File;
  imageUrl?: string;
  /** kWh với điện, m³ với nước. */
  totalQty: string;
  totalAmount: string;
  billingPeriod: string;
  /**
   * Kỳ này ĐỌC ĐƯỢC từ tờ hoá đơn, hay rơi về kỳ mặc định của tháng đang chọn.
   *
   * Phải phân biệt: kỳ là khoá mà quản lý đối chiếu, và kỳ EVN/nước thật là chu kỳ
   * chốt số (vd 07/08 – 06/09) chứ không trùng tháng dương lịch. Rơi về mặc định
   * nghĩa là con số đó do hệ thống ĐOÁN, không phải in trên giấy — admin cần biết
   * để đối chiếu lại, chứ nhìn vào thì hai trường hợp giống hệt nhau.
   */
  periodFromOcr?: boolean;
  /** Chỉ nhà nguyên căn mới dùng — cần để phát hành thẳng cho khách. */
  prevReading: string;
  newReading: string;
  /** Ghi chú của bước đọc: OCR hỏng, không ra số… */
  note?: string;
  /** Kỳ này nhà đó đã có hoá đơn PUBLISHED — bỏ qua để khỏi phát hành trùng. */
  already?: boolean;
  state: 'idle' | 'publishing' | 'done' | 'error';
  error?: string;
}

const isWhole = (p: PropertyResponse) => p.wholeHouse === true;

/**
 * Dòng đã đủ dữ liệu để phát hành chưa.
 * Nguyên căn cần thêm cặp chỉ số, và chỉ số mới phải lớn hơn chỉ số cũ.
 */
const rowReady = (r: Row): boolean => {
  if (r.already || r.state === 'done') return false;
  if (!(Number(onlyDigits(r.totalQty)) > 0)) return false;
  if (!(Number(onlyDigits(r.totalAmount)) > 0)) return false;
  if (!r.billingPeriod.trim()) return false;
  if (!isWhole(r.property)) return true;
  const prev = Number(onlyDigits(r.prevReading));
  const next = Number(onlyDigits(r.newReading));
  return r.prevReading !== '' && r.newReading !== '' && next > prev;
};

export const UtilityBillZipImport = ({
  kind, properties, month, year, defaultPeriod, existing, onClose, onDone,
}: {
  kind: UtilityKind;
  /** Danh mục nhà để đối chiếu tên folder. */
  properties: PropertyResponse[];
  month: number;
  year: number;
  /** Kỳ mặc định điền sẵn, vd "01/08 – 31/08/2026". */
  defaultPeriod: string;
  /** Hoá đơn kỳ này đã phát hành — để đánh dấu nhà nào khỏi làm lại. */
  existing: { propertyId: number; status?: 'PUBLISHED' | 'REVOKED' }[];
  onClose: () => void;
  /** Gọi sau khi phát hành xong ít nhất một nhà, để trang cha tải lại. */
  onDone: () => void;
}) => {
  const cfg = KIND[kind];
  /** Đơn giá của dòng — dùng để soi OCR đọc lệch. */
  const rowUnitPrice = (r: Row): number =>
    cfg.unitPrice(Number(onlyDigits(r.totalAmount)), Number(onlyDigits(r.totalQty)));
  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<ZipBillPreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  /**
   * Bước xác nhận trước khi phát hành.
   *
   * Phát hành là hành động MỘT CHIỀU với hàng chục nhà cùng lúc: hoá đơn tổng đã tạo thì
   * phải đi thu hồi từng cái, và với nguyên căn thì khách đã nhận hoá đơn rồi. Bấm một
   * nút mà chạy thẳng cả lô là quá dễ lỡ tay.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);

  const publishedIds = new Set(
    existing.filter(b => b.status !== 'REVOKED').map(b => b.propertyId),
  );

  // ── Chặng 1: đọc zip, đối chiếu tên folder ────────────────────────────────
  const handleZip = async (file: File) => {
    setBusy(true);
    setZipError(null);
    try {
      const p = await inspectZipBills(file, properties);
      setPreview(p);
      setStage('preview');
    } catch (e: any) {
      setZipError(e?.message || 'Không đọc được file .zip — kiểm tra lại file có hỏng không.');
    } finally {
      setBusy(false);
    }
  };

  // ── Chặng 2: tải ảnh + OCR TUẦN TỰ từng nhà ───────────────────────────────
  //
  // Cố tình KHÔNG bắn song song: OCR là dịch vụ ngoài, hai chục request cùng lúc dễ bị
  // chặn hoặc timeout cả loạt, mà lúc đó không phân biệt được nhà nào hỏng thật.
  const runReading = async () => {
    if (!preview) return;
    setStage('reading');
    setProgress({ done: 0, total: preview.matched.length });
    const out: Row[] = [];

    for (const m of preview.matched) {
      const base: Row = {
        property: m.property,
        folder: m.folder,
        file: m.file,
        totalQty: '', totalAmount: '', billingPeriod: defaultPeriod,
        prevReading: '', newReading: '',
        already: publishedIds.has(m.property.id),
        state: 'idle',
      };
      try {
        const url = await uploadToCloudinary(m.file, 'image');
        base.imageUrl = url;
        try {
          const ocr = await cfg.ocr(url);
          const parsed = cfg.parse(ocr);
          // Số của BE chỉ dùng bù ô còn trống — parser FE đọc rawText chuẩn hơn
          // (xem ghi chú ở luồng phát hành lẻ).
          base.totalQty = parsed.qty;
          base.totalAmount = parsed.amount
            || (Number(ocr?.totalAmount) > 0 ? String(ocr.totalAmount) : '');
          const readPeriod = parsed.period || ocr?.billingPeriod || '';
          base.billingPeriod = readPeriod || defaultPeriod;
          base.periodFromOcr = !!readPeriod;
          base.prevReading = parsed.prevReading;
          base.newReading = parsed.newReading;
          if (!base.totalQty && !base.totalAmount) base.note = 'Không đọc được số — nhập tay';
        } catch {
          base.note = 'Dịch vụ đọc hoá đơn lỗi — nhập tay';
        }
      } catch {
        base.note = 'Không tải được ảnh lên';
      }
      out.push(base);
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setRows(out);
    setStage('review');
  };

  const patch = (idx: number, next: Partial<Row>) =>
    setRows(rs => rs.map((r, i) => (i === idx ? { ...r, ...next } : r)));

  // ── Chặng 3: phát hành TUẦN TỰ, giữ lại dòng lỗi ──────────────────────────
  const publishAll = async () => {
    const targets = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowReady(r));
    if (targets.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;

    for (const { r, i } of targets) {
      patch(i, { state: 'publishing', error: undefined });
      const qty = Number(onlyDigits(r.totalQty));
      const totalAmount = Number(onlyDigits(r.totalAmount));
      const period = r.billingPeriod.trim();
      try {
        const created = await cfg.publish({
          propertyId: r.property.id,
          billingPeriod: period,
          month, year, qty, amount: totalAmount,
          imageUrl: r.imageUrl || undefined,
          prevReading: isWhole(r.property) ? Number(onlyDigits(r.prevReading)) : undefined,
          newReading: isWhole(r.property) ? Number(onlyDigits(r.newReading)) : undefined,
        });

        /*
         * NGUYÊN CĂN — phát hành thẳng cho khách. HAI LỆNH KHÔNG NGUYÊN TỬ: hoá đơn
         * tổng đã tạo xong rồi mới gọi lệnh này. Lỗi ở đây phải nói RÕ là "tổng đã tạo,
         * chưa gửi được cho khách" — admin cần biết ĐỪNG phát hành lại nhà đó.
         */
        if (isWhole(r.property)) {
          try {
            await utilityInvoiceService.createForWholeHouse(r.property.id, {
              type: kind,
              billingPeriod: period,
              prevReading: Number(onlyDigits(r.prevReading)),
              newReading: Number(onlyDigits(r.newReading)),
              consumption: qty,
              // Ưu tiên đơn giá BE trả về: BE tính ở scale 8, FE tự chia sẽ lệch
              // và rơi vào AMOUNT_MISMATCH.
              unitPrice: created.unitPrice ?? cfg.unitPrice(totalAmount, qty),
              amount: totalAmount,
              meterImageUrl: r.imageUrl || undefined,
            });
          } catch (e: any) {
            const code = e?.response?.data?.error || '';
            // BE bản 2 luồng đã tự phát hành trong cùng transaction → lệnh này thành dư.
            if (code !== 'INVOICE_ALREADY_EXISTS') {
              patch(i, {
                state: 'error',
                error: 'Hoá đơn tổng ĐÃ tạo nhưng chưa gửi được cho khách — đừng phát hành lại, vào màn lẻ gửi tiếp.',
              });
              setProgress(p => ({ ...p, done: p.done + 1 }));
              continue;
            }
          }
        }

        patch(i, { state: 'done' });
        ok += 1;
      } catch (e: any) {
        const msg = e?.response?.data?.error === 'BILL_ALREADY_EXISTS'
          ? 'Kỳ này nhà đã có hoá đơn rồi'
          : (e?.response?.data?.message || e?.message || 'Phát hành thất bại');
        patch(i, { state: 'error', error: msg });
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setBusy(false);
    if (ok > 0) {
      toast.success(`Đã phát hành hoá đơn ${cfg.noun} cho ${ok} nhà`);
      onDone();
    }
  };

  /**
   * Đơn giá "bình thường" của cả lô = TRUNG VỊ, không phải trung bình.
   *
   * Chính con số bị OCR đọc nhầm là con số lệch nhất, mà trung bình thì bị nó kéo theo —
   * một dòng đọc mã công tơ thành sản lượng là đủ làm mốc so sánh vô dụng. Trung vị
   * không nhúc nhích vì vài dòng hỏng.
   */
  const medianPrice = (() => {
    const xs = rows.map(rowUnitPrice).filter(p => p > 0).sort((a, b) => a - b);
    if (xs.length < 3) return 0; // quá ít dòng thì không có "mặt bằng chung" để so
    return xs[Math.floor(xs.length / 2)];
  })();

  /** Lệch quá nửa so với mặt bằng chung → gần như chắc chắn đọc nhầm một trong hai số. */
  const isOutlier = (r: Row): boolean => {
    const p = rowUnitPrice(r);
    if (p <= 0 || medianPrice <= 0) return false;
    return Math.abs(p - medianPrice) / medianPrice > 0.5;
  };

  const readyCount = rows.filter(rowReady).length;
  const doneCount = rows.filter(r => r.state === 'done').length;
  const errCount = rows.filter(r => r.state === 'error').length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:py-10">
        <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nhập theo lô</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-slate-950">
                <FileArchive className="h-5 w-5 text-indigo-500" /> {cfg.title}
              </h2>
            </div>
            <button onClick={onClose} disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-40">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5">
            {/* ── Chặng 1: chọn file ── */}
            {stage === 'pick' && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Mỗi nhà một folder, tên folder là <b className="text-slate-800">mã đứng đầu tên nhà</b>.
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs text-slate-600">{`MTX#124/
  └ hoa-don.jpg
MTX#125/
  └ hoa-don.png`}</pre>
                </div>

                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-10 transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  {busy
                    ? <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                    : <Upload className="h-7 w-7 text-slate-400" />}
                  <span className="text-sm font-bold text-slate-700">
                    {busy ? 'Đang đọc file .zip…' : 'Chọn file .zip'}
                  </span>
                  <input type="file" accept=".zip" className="hidden" disabled={busy}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleZip(f); }} />
                </label>

                {zipError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {zipError}
                  </p>
                )}
              </>
            )}

            {/* ── Chặng 2: bảng đối chiếu ── */}
            {stage === 'preview' && preview && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Tally n={preview.matched.length} label="Nhà khớp mã" tone="emerald" />
                  <Tally n={preview.unknownFolders.length} label="Folder không khớp nhà nào" tone="amber" />
                  <Tally n={preview.ambiguous.length} label="Mã trùng — phải sửa tên nhà" tone="rose" />
                </div>

                {preview.matched.length > 0 && (
                  <ListBlock title={`Sẽ nhập cho ${preview.matched.length} nhà`}>
                    {preview.matched.map(m => (
                      <li key={m.property.id} className="flex items-center gap-2 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="font-mono text-xs text-slate-500">{m.folder}/</span>
                        <span className="truncate font-semibold text-slate-700">{m.property.propertyName}</span>
                        {publishedIds.has(m.property.id) && (
                          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                            KỲ NÀY ĐÃ CÓ
                          </span>
                        )}
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.ambiguous.length > 0 && (
                  <ListBlock title="Mã trùng — bỏ qua" tone="rose">
                    {preview.ambiguous.map(a => (
                      <li key={a.folder} className="py-1">
                        <span className="font-mono text-xs">{a.folder}/</span> khớp{' '}
                        {a.propertyNames.length} nhà: {a.propertyNames.join(' · ')}
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.unknownFolders.length > 0 && (
                  <ListBlock title="Không khớp nhà nào — bỏ qua" tone="amber">
                    {preview.unknownFolders.map(u => (
                      <li key={u.folder} className="py-1">
                        <span className="font-mono text-xs">{u.folder}/</span> ({u.imageCount} ảnh)
                      </li>
                    ))}
                  </ListBlock>
                )}

                {preview.emptyFolders.length > 0 && (
                  <ListBlock title="Folder không có ảnh nào" tone="amber">
                    {preview.emptyFolders.map(f => <li key={f} className="py-1 font-mono text-xs">{f}/</li>)}
                  </ListBlock>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button onClick={() => { setStage('pick'); setPreview(null); }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
                    Chọn file khác
                  </button>
                  <button onClick={runReading} disabled={preview.matched.length === 0}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
                    Đọc số liệu {preview.matched.length} nhà →
                  </button>
                </div>
              </>
            )}

            {/* ── Chặng 3: đang đọc ── */}
            {stage === 'reading' && (
              <div className="py-14 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  Đang tải ảnh & đọc hoá đơn… {progress.done}/{progress.total}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Chạy tuần tự từng nhà để dịch vụ đọc hoá đơn không bị quá tải.
                </p>
                <div className="mx-auto mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* ── Chặng 4: bảng duyệt ── */}
            {stage === 'review' && (
              <>
                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-amber-800">
                    Số liệu do máy đọc từ ảnh nên <b>phải kiểm lại trước khi phát hành</b>. Sai tổng
                    {cfg.unit} là sai đơn giá, mà quản lý dựng hoá đơn từng phòng trên chính đơn giá đó.
                    Đối chiếu nhanh bằng cột <b>đơn giá</b> — lệch xa các nhà khác là dấu hiệu đọc nhầm.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[1060px] text-sm">
                    <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Nhà</th>
                        <th className="px-3 py-2">Kỳ hoá đơn</th>
                        <th className="px-3 py-2 text-right">{cfg.qtyLabel}</th>
                        <th className="px-3 py-2 text-right">Tổng tiền</th>
                        <th className="px-3 py-2 text-right">Đơn giá</th>
                        <th className="px-3 py-2">{cfg.readingLabel} (nguyên căn)</th>
                        <th className="px-3 py-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r, i) => {
                        const whole = isWhole(r.property);
                        const price = rowUnitPrice(r);
                        const skip = r.already || r.state === 'done';
                        return (
                          <tr key={r.property.id} className={
                            r.state === 'done' ? 'bg-emerald-50/50'
                            : r.state === 'error' ? 'bg-rose-50/50'
                            : r.already ? 'bg-slate-50' : undefined}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {r.imageUrl && (
                                  <a href={r.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                                    <img src={r.imageUrl} alt="" className="h-9 w-9 rounded border border-slate-200 object-cover" />
                                  </a>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold text-slate-800">{r.property.propertyName}</p>
                                  <p className="truncate text-[11px] text-slate-400">
                                    {whole ? 'Nguyên căn' : 'Chia phòng'}
                                    {/* Tên folder — đường lần ngược về đúng file trong zip khi
                                        thấy số liệu lạ, khỏi phải mở lại cả file đi dò. */}
                                    <span className="font-mono"> · {r.folder}/</span>
                                    {r.note && <span className="text-amber-600"> · {r.note}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {/* Kỳ hoá đơn — khoá mà quản lý đối chiếu, và kỳ thật của EVN/nước
                                là chu kỳ chốt số (07/08 – 06/09) chứ không trùng tháng dương
                                lịch. Cho sửa được vì OCR đọc kỳ hay trượt nhất. */}
                            <td className="px-3 py-2">
                              <input
                                value={r.billingPeriod}
                                disabled={skip}
                                placeholder="Chưa có kỳ"
                                onChange={e => patch(i, { billingPeriod: e.target.value, periodFromOcr: true })}
                                className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                              />
                              <span className={`mt-1 block text-[10px] font-bold ${
                                r.periodFromOcr ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {r.periodFromOcr ? '✓ đọc từ ảnh' : '⚠ mặc định — không có trên giấy'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <NumCell value={r.totalQty} disabled={skip}
                                onChange={v => patch(i, { totalQty: v })} />
                            </td>
                            <td className="px-3 py-2">
                              <NumCell value={r.totalAmount} disabled={skip}
                                onChange={v => patch(i, { totalAmount: v })} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`text-xs font-black tabular-nums ${
                                isOutlier(r) ? 'text-rose-600' : 'text-indigo-700'}`}>
                                {price > 0 ? formatCurrency(price) : '—'}
                              </span>
                              {isOutlier(r) && (
                                <span className="mt-0.5 block text-[10px] font-bold text-rose-600">
                                  lệch mặt bằng
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {whole ? (
                                <div className="flex items-center gap-1">
                                  <NumCell value={r.prevReading} disabled={skip} width="w-20"
                                    onChange={v => patch(i, { prevReading: v })} />
                                  <span className="text-slate-300">→</span>
                                  <NumCell value={r.newReading} disabled={skip} width="w-20"
                                    onChange={v => patch(i, { newReading: v })} />
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-300">quản lý ghi từng phòng</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {r.already ? (
                                <span className="whitespace-nowrap text-[11px] font-bold text-slate-500">Kỳ này đã có</span>
                              ) : r.state === 'done' ? (
                                <span className="whitespace-nowrap text-[11px] font-bold text-emerald-600">✓ Đã phát hành</span>
                              ) : r.state === 'publishing' ? (
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                              ) : r.state === 'error' ? (
                                <span className="text-[11px] font-semibold text-rose-600">{r.error}</span>
                              ) : rowReady(r) ? (
                                <span className="whitespace-nowrap text-[11px] font-bold text-slate-500">Sẵn sàng</span>
                              ) : (
                                <span className="whitespace-nowrap text-[11px] font-bold text-amber-600">Thiếu dữ liệu</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {busy
                      ? `Đang phát hành… ${progress.done}/${progress.total}`
                      : <>Sẵn sàng <b className="text-slate-800">{readyCount}</b> nhà
                          {doneCount > 0 && <> · đã xong {doneCount}</>}
                          {errCount > 0 && <span className="text-rose-600"> · lỗi {errCount}</span>}</>}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={onClose} disabled={busy}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                      Đóng
                    </button>
                    <button onClick={() => setConfirmOpen(true)} disabled={busy || readyCount === 0}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Phát hành {readyCount} nhà
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {confirmOpen && (
            <ConfirmPublish
              noun={cfg.noun}
              rows={rows.filter(rowReady).map(r => ({
                name: r.property.propertyName,
                period: r.billingPeriod,
                whole: isWhole(r.property),
                outlier: isOutlier(r),
                defaultPeriod: !r.periodFromOcr,
              }))}
              skipped={rows.filter(r => !rowReady(r) && !r.already && r.state !== 'done').length}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={publishAll}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Xác nhận trước khi phát hành cả lô.
 *
 * Chỉ nhắc lại đúng những thứ SAI THÌ KHÓ GỠ, không kể lể lại cả bảng: nhà nào sẽ được
 * phát hành, kỳ nào, và hai loại rủi ro mà bảng trên dễ lướt qua — kỳ do hệ thống đoán,
 * và đơn giá lệch mặt bằng.
 */
const ConfirmPublish = ({ noun, rows, skipped, onCancel, onConfirm }: {
  noun: string;
  rows: { name: string; period: string; whole: boolean; outlier: boolean; defaultPeriod: boolean }[];
  /** Số nhà bị bỏ lại vì thiếu dữ liệu — nói ra để admin biết mình chưa làm hết. */
  skipped: number;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const wholeCount = rows.filter(r => r.whole).length;
  const outliers = rows.filter(r => r.outlier);
  const guessed = rows.filter(r => r.defaultPeriod);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/40 p-4"
      onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-black text-slate-950">
            Phát hành hoá đơn {noun} cho {rows.length} nhà?
          </h3>
        </div>

        <div className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {rows.map(r => (
              <div key={r.name} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{r.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{r.period}</span>
              </div>
            ))}
          </div>

          {outliers.length > 0 && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
              <b>{outliers.length} nhà có đơn giá lệch mặt bằng</b> ({outliers.map(r => r.name.split(/\s+/)[0]).join(', ')}).
              Thường là do đọc nhầm một trong hai số — nên xem lại trước khi gửi.
            </p>
          )}

          {guessed.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <b>{guessed.length} nhà dùng kỳ mặc định</b> — không đọc được kỳ trên giấy. Kỳ là khoá
              quản lý đối chiếu, sai thì phải thu hồi hoá đơn.
            </p>
          )}

          {wholeCount > 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <b>{wholeCount} nhà nguyên căn</b> sẽ gửi hoá đơn <b>thẳng cho khách thuê</b> ngay sau
              khi phát hành. Nhà chia phòng thì quản lý đi ghi chỉ số từng phòng.
            </p>
          )}

          {skipped > 0 && (
            <p className="text-xs text-slate-500">
              {skipped} nhà còn thiếu dữ liệu sẽ được giữ lại trong bảng, không phát hành.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            Xem lại
          </button>
          <button onClick={onConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">
            Phát hành {rows.length} nhà
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Thành phần nhỏ ──────────────────────────────────────────────────────────
const Tally = ({ n, label, tone }: { n: number; label: string; tone: 'emerald' | 'amber' | 'rose' }) => {
  const cls = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${n === 0 ? 'border-slate-200 bg-slate-50 text-slate-400' : cls}`}>
      <p className="text-2xl font-black leading-none tabular-nums">{n}</p>
      <p className="mt-1 text-xs font-semibold">{label}</p>
    </div>
  );
};

const ListBlock = ({ title, tone, children }: {
  title: string; tone?: 'amber' | 'rose'; children: React.ReactNode;
}) => (
  <div className={`mt-4 rounded-xl border p-3 ${
    tone === 'rose' ? 'border-rose-200 bg-rose-50/60'
    : tone === 'amber' ? 'border-amber-200 bg-amber-50/60'
    : 'border-slate-200 bg-white'}`}>
    <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
    <ul className="max-h-52 overflow-y-auto text-xs text-slate-600">{children}</ul>
  </div>
);

/** Ô nhập số có phân cách nghìn — cùng cách gõ với màn phát hành lẻ. */
const NumCell = ({ value, onChange, disabled, width = 'w-28' }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; width?: string;
}) => (
  <input
    inputMode="numeric"
    value={value ? groupThousands(value) : ''}
    disabled={disabled}
    placeholder="—"
    onChange={e => onChange(onlyDigits(e.target.value))}
    className={`${width} rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs font-bold tabular-nums outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400`}
  />
);
