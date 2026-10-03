/**
 * NHẬP HOÁ ĐƠN ĐIỆN / NƯỚC THEO LÔ — một file .zip cho cả danh mục nhà.
 *
 * Bốn chặng: chọn file → khớp folder với nhà (hiện luôn mã khách hàng trong hồ sơ của từng
 * nhà) → đọc ảnh → DUYỆT rồi mới phát hành. Không tự phát hành sau khi đọc: OCR là best-effort
 * (đã gặp mã công tơ bị đọc thành kWh, năm "2022" thành kWh, mã số thuế lớn hơn cả tổng tiền),
 * mà sai sản lượng là sai đơn giá của mọi phòng trong nhà.
 *
 * Bảng duyệt dùng ĐÚNG bộ luật của màn phát hành lẻ (`evaluateBill`) — bản cũ tự viết một
 * bộ riêng nên cùng một tờ giấy, màn lẻ cho qua còn màn lô báo đỏ. Mỗi nhà là một thẻ đặt
 * hồ sơ cạnh số trên giấy: mã khách hàng, chỉ số đầu kỳ (nguyên căn) hoặc tiến độ chốt phòng
 * (chia phòng), tiêu thụ so với kỳ trước, tổng tiền, kỳ.
 *
 * Thêm một phép kiểm chỉ lô mới có: CÙNG MỘT MÃ trên giấy xuất hiện ở hai nhà. Một mã là một
 * công tơ, không thể thuộc hai nhà — gần như chắc chắn một tờ giấy bị chép vào nhiều folder.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileArchive, Loader2, Send, Upload, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadToCloudinary } from '@/services/upload.service';
import { loadUtilityCycle, pickLastBill, type LastBill, type UtilityCycle } from '@/services/utilityCycle';
import { periodProblem } from '@/utils/evnInvoiceParser';
import { inspectZipBills, type ZipBillPreview } from '@/utils/zipUtilityBills';
import type { PropertyResponse } from '@/types/api.types';
import type { KindConfig } from './kinds';
import {
  EMPTY_DRAFT, evaluateBill, loadRoomReadings, normCode, pickPaperCode, publishErrorMessage,
  showCode, summarizeRooms, type BillDraft, type BillEvaluation, type Check, type RoomSummary,
} from './billChecks';
import { CheckBadge, ImageLightbox, NumInput, TONE_INPUT, fmtNum, fmtPeriodTag, fmtVnd } from './ui';

type Stage = 'pick' | 'preview' | 'reading' | 'review';

interface Row {
  property: PropertyResponse;
  folder: string;
  file: File;
  imageUrl?: string;
  draft: BillDraft;
  /**
   * Kỳ của dòng TỪ ĐÂU RA: `ocr` in trên giấy (giữ nguyên khi đổi kỳ chung), `manual` admin
   * gõ (cũng giữ), `default` hệ thống đoán theo tháng — đổi kỳ chung là chảy xuống những dòng này.
   */
  periodSource: 'ocr' | 'manual' | 'default';
  cycle?: UtilityCycle | null;
  lastBill?: LastBill | null;
  rooms?: RoomSummary | null;
  /** Ghi chú của bước đọc: OCR hỏng, không ra số… */
  note?: string;
  /** Kỳ này nhà đã có hoá đơn — bỏ qua, khỏi phát hành trùng. */
  already: boolean;
  /** Admin bỏ tick — không phát hành nhà này trong lượt này. */
  include: boolean;
  state: 'idle' | 'publishing' | 'done' | 'error';
  error?: string;
}

/**
 * Đọc song song CÓ GIỚI HẠN: nhanh gần gấp ba so với tuần tự mà không lúc nào có quá ba
 * request bay tới dịch vụ OCR — bắn nhiều hơn là rủi ro bị chặn hoặc timeout cả loạt.
 */
const READ_CONCURRENCY = 3;

async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type FilterKey = 'all' | 'issue' | 'ready' | 'skip';

export const UtilityBillZipImport = ({
  cfg, properties, month, year, defaultPeriod, existing, onClose, onDone,
}: {
  cfg: KindConfig;
  properties: PropertyResponse[];
  month: number;
  year: number;
  /** Kỳ điền sẵn cho nhà không đọc được kỳ trên giấy, vd "01/09 – 30/09/2026". */
  defaultPeriod: string;
  /** Hoá đơn kỳ này đã phát hành — để đánh dấu nhà nào khỏi làm lại. */
  existing: { propertyId: number; status?: string }[];
  onClose: () => void;
  /** Gọi sau khi phát hành xong ít nhất một nhà, để trang cha tải lại. */
  onDone: () => void;
}) => {
  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<ZipBillPreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [batchPeriod, setBatchPeriod] = useState(defaultPeriod);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [busy, setBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const publishedIds = useMemo(
    () => new Set(existing.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [existing],
  );

  // ── Chặng 1: đọc zip, khớp folder với nhà ─────────────────────────────────────
  const handleZip = async (file: File) => {
    setBusy(true);
    setZipError(null);
    try {
      setPreview(await inspectZipBills(file, properties));
      setStage('preview');
    } catch (e: any) {
      setZipError(e?.message || 'Không đọc được file .zip — kiểm tra lại file có hỏng không.');
    } finally {
      setBusy(false);
    }
  };

  // ── Chặng 2: tải ảnh + đọc + tra hồ sơ từng nhà ───────────────────────────────
  const runReading = async () => {
    if (!preview) return;
    setStage('reading');
    setProgress({ done: 0, total: preview.matched.length });

    const readOne = async (m: ZipBillPreview['matched'][number]): Promise<Row> => {
      const row: Row = {
        property: m.property,
        folder: m.folder,
        file: m.file,
        draft: { ...EMPTY_DRAFT, period: batchPeriod },
        periodSource: 'default',
        already: publishedIds.has(m.property.id),
        include: true,
        state: 'idle',
      };
      // Kỳ này đã có thì bỏ qua cả upload lẫn OCR — tốn quota cho một kết quả không ai dùng.
      if (row.already) {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        return row;
      }
      const whole = m.property.wholeHouse === true;
      const dossier = whole
        ? loadUtilityCycle(m.property.id, cfg.kind, month, year)
          .then((c) => { row.cycle = c; row.lastBill = c.lastBill ?? null; })
          .catch(() => { row.cycle = null; })
        : Promise.all([
          cfg.list({ propertyId: m.property.id })
            .then((bills) => { row.lastBill = pickLastBill(bills, month, year); })
            .catch(() => { row.lastBill = null; }),
          loadRoomReadings(cfg.kind, m.property.id, month, year)
            .then((rs) => { row.rooms = summarizeRooms(rs); })
            .catch(() => { row.rooms = null; }),
        ]);

      const reading = (async () => {
        try {
          row.imageUrl = await uploadToCloudinary(m.file, 'image');
        } catch {
          row.note = 'Không tải được ảnh lên';
          return;
        }
        try {
          const r = await cfg.read(row.imageUrl);
          row.draft = {
            customerCode: pickPaperCode(r.codeCandidates, cfg.storedCode(m.property)),
            paperPrev: r.prev,
            paperNew: r.next,
            qty: r.qty,
            amount: r.amount,
            period: r.period || batchPeriod,
          };
          row.periodSource = r.period ? 'ocr' : 'default';
          if (!r.qty && !r.amount) row.note = 'Không đọc được số — nhập tay';
        } catch {
          row.note = 'Dịch vụ đọc hoá đơn lỗi — nhập tay';
        }
      })();

      await Promise.all([dossier, reading]);
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      return row;
    };

    // Giữ đúng thứ tự như bảng khớp folder, dù nhà nào đọc xong trước.
    setRows(await mapWithLimit(preview.matched, READ_CONCURRENCY, readOne));
    setStage('review');
  };

  // ── Chặng 3: duyệt ────────────────────────────────────────────────────────────
  const patchRow = (idx: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const patchDraft = (idx: number, patch: Partial<BillDraft>, extra?: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...extra, draft: { ...r.draft, ...patch } } : r)));

  /** Đổi kỳ chung → chảy xuống mọi dòng còn đang dùng kỳ đoán (chừa dòng đọc được / tự gõ / đã xong). */
  const changeBatchPeriod = (value: string) => {
    setBatchPeriod(value);
    setRows((rs) => rs.map((r) => (r.periodSource === 'default' && !r.already && r.state !== 'done'
      ? { ...r, draft: { ...r.draft, period: value } }
      : r)));
  };

  /** Mã trên giấy → các dòng đang mang mã đó. Hai dòng trở lên là trùng. */
  const codeOwners = useMemo(() => {
    const map = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (r.already) return;
      const c = normCode(r.draft.customerCode);
      if (c) map.set(c, [...(map.get(c) ?? []), i]);
    });
    return map;
  }, [rows]);

  const evals: BillEvaluation[] = useMemo(() => rows.map((r, i) => {
    const ev = evaluateBill(r.draft, {
      cfg,
      wholeHouse: r.property.wholeHouse === true,
      storedCode: cfg.storedCode(r.property),
      cycle: r.cycle ?? null,
      month,
      year,
      roomPendingQty: r.rooms?.pendingQty ?? null,
      lastQty: r.lastBill?.totalQuantity ?? null,
    });
    const owners = codeOwners.get(normCode(r.draft.customerCode)) ?? [];
    if (owners.length > 1) {
      const others = owners.filter((j) => j !== i).map((j) => rows[j].folder).join(', ');
      const stored = showCode(cfg.storedCode(r.property));
      const dup: Check = {
        tone: 'block',
        label: 'Trùng mã trong lô',
        detail: `Cùng mã với ${others} — một mã là một ${cfg.meterWord}, không thể thuộc hai nhà. `
          + 'Nhiều khả năng một tờ giấy bị chép vào nhiều folder.'
          + (ev.code.tone === 'block' && stored ? ` Hồ sơ của nhà này là ${stored}.` : ''),
      };
      return {
        ...ev,
        code: dup,
        blockers: [{ field: cfg.codeLabel, label: dup.label }, ...ev.blockers.filter((b) => b.field !== cfg.codeLabel)],
        ready: false,
      };
    }
    return ev;
  }), [rows, cfg, month, year, codeOwners]);

  const isDone = (r: Row) => r.already || r.state === 'done';
  const isReady = (i: number) => {
    const r = rows[i];
    return !isDone(r) && r.include && evals[i]?.ready;
  };
  const FILTERS: { key: FilterKey; label: string; on: string; match: (i: number) => boolean }[] = [
    { key: 'all', label: 'Tất cả', on: 'bg-slate-900 text-white', match: () => true },
    {
      key: 'issue', label: 'Cần sửa', on: 'bg-rose-600 text-white',
      match: (i) => !isDone(rows[i]) && !evals[i]?.ready,
    },
    { key: 'ready', label: 'Sẵn sàng', on: 'bg-emerald-600 text-white', match: isReady },
    {
      key: 'skip', label: 'Đã có / bỏ qua', on: 'bg-slate-500 text-white',
      match: (i) => isDone(rows[i]) || !rows[i].include,
    },
  ];
  const readyIdx = rows.map((_, i) => i).filter(isReady);
  const doneCount = rows.filter((r) => r.state === 'done').length;
  const errCount = rows.filter((r) => r.state === 'error').length;
  const followingBatch = rows.filter((r) => r.periodSource === 'default' && !isDone(r)).length;
  const batchIssue = periodProblem(batchPeriod);

  // ── Chặng 4: phát hành TUẦN TỰ, dòng lỗi ở lại để sửa ──────────────────────────
  const publishAll = async () => {
    const targets = readyIdx.slice();
    if (targets.length === 0) return;
    setConfirmOpen(false);
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    let ok = 0;
    for (const i of targets) {
      const r = rows[i];
      const ev = evals[i];
      const whole = r.property.wholeHouse === true;
      patchRow(i, { state: 'publishing', error: undefined });
      try {
        await cfg.publish({
          propertyId: r.property.id,
          billingPeriod: r.draft.period.trim(),
          month,
          year,
          qty: Number(r.draft.qty),
          amount: Number(r.draft.amount),
          imageUrl: r.imageUrl || undefined,
          prevReading: whole ? ev.sendPrev ?? undefined : undefined,
          newReading: whole ? ev.sendNew ?? undefined : undefined,
          customerCode: normCode(r.draft.customerCode) ? r.draft.customerCode.trim() : undefined,
          ocrConfirmed: true,
        });
        patchRow(i, { state: 'done' });
        ok += 1;
      } catch (e: any) {
        patchRow(i, { state: 'error', error: publishErrorMessage(e, cfg) });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBusy(false);
    if (ok > 0) {
      toast.success(`Đã phát hành hoá đơn ${cfg.noun} cho ${ok} nhà`);
      onDone();
    }
  };

  const visibleIdx = rows.map((_, i) => i).filter((i) => FILTERS.find((f) => f.key === filter)!.match(i));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:py-8">
        <div className="relative w-full max-w-7xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nhập theo lô · kỳ {month}/{year}</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-extrabold text-slate-950">
                <FileArchive className="h-5 w-5 text-slate-500" /> Hoá đơn {cfg.noun} từ file .zip
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <StageDots stage={stage} />
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-40"
                title="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5">
            {/* ── Chọn file ── */}
            {stage === 'pick' && (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-600">
                      Mỗi nhà một folder, tên folder là <b className="text-slate-800">mã nhà</b> (cụm đầu tên nhà).
                      Lồng bao nhiêu tầng cũng được.
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs text-slate-600">{`hoa-don-${cfg.kind === 'WATER' ? 'nuoc' : 'dien'}-thang-${month}.zip
├─ MTX#141/
│  └─ hoa-don.jpg
└─ MTX#143/
   └─ hoa-don.png`}</pre>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
                    <p className="font-bold text-slate-800">Sau khi đọc, mỗi nhà được đối chiếu:</p>
                    <ul className="mt-1.5 space-y-1 text-xs leading-relaxed">
                      <li>• {cfg.codeLabel} trên giấy với mã trong hồ sơ nhà</li>
                      <li>• Nguyên căn: chỉ số đầu kỳ với số chốt kỳ trước / lúc đón khách</li>
                      <li>• Chia phòng: số phòng quản lý đã chốt, tổng các phòng so với giấy</li>
                      <li>• Tiêu thụ so với kỳ trước, đơn giá có nằm trong khoảng thực tế</li>
                    </ul>
                  </div>
                </div>

                <label
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleZip(f);
                  }}
                  className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-10 transition ${
                    dragOver ? 'border-slate-500 bg-slate-100' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
                >
                  {busy
                    ? <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
                    : <Upload className="h-7 w-7 text-slate-400" strokeWidth={1.75} />}
                  <span className="text-sm font-bold text-slate-700">
                    {busy ? 'Đang đọc file .zip…' : 'Chọn hoặc kéo thả file .zip'}
                  </span>
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleZip(f); }}
                  />
                </label>

                {zipError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {zipError}
                  </p>
                )}
              </>
            )}

            {/* ── Khớp folder với nhà ── */}
            {stage === 'preview' && preview && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Tally n={preview.matched.length} label="Folder khớp nhà" tone="emerald" />
                  <Tally n={preview.unknownFolders.length + preview.emptyFolders.length} label="Folder không dùng được" tone="amber" />
                  <Tally n={preview.ambiguous.length} label="Mã nhà trùng — phải sửa tên nhà" tone="rose" />
                </div>

                {preview.matched.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,11rem)_minmax(0,9rem)] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                      <span>Folder</span><span>Nhà</span><span>{cfg.codeLabel} (hồ sơ)</span><span />
                    </div>
                    <ul className="max-h-[46vh] divide-y divide-slate-100 overflow-y-auto">
                      {preview.matched.map((m) => {
                        const code = showCode(cfg.storedCode(m.property));
                        return (
                          <li
                            key={m.property.id}
                            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,11rem)_minmax(0,9rem)] items-center gap-3 px-4 py-2 text-sm"
                          >
                            <span className="truncate font-mono text-xs text-slate-500">{m.folder}/</span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-800">{m.property.propertyName}</span>
                              <span className="text-xs text-slate-400">
                                {m.property.wholeHouse ? 'Nguyên căn' : `${m.property.totalRooms ?? 0} phòng`}
                                {m.imageCount > 1 && ` · ${m.imageCount} ảnh, lấy ảnh đầu`}
                              </span>
                            </span>
                            {code
                              ? <span className="truncate font-mono text-xs font-bold text-slate-700">{code}</span>
                              : <span className="text-xs font-semibold text-amber-600">Chưa khai mã</span>}
                            <span className="text-right">
                              {publishedIds.has(m.property.id) && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                                  KỲ NÀY ĐÃ CÓ
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {preview.ambiguous.length > 0 && (
                  <ListBlock title="Mã nhà trùng — bỏ qua" tone="rose">
                    {preview.ambiguous.map((a) => (
                      <li key={a.folder} className="py-1">
                        <span className="font-mono text-xs">{a.folder}/</span> khớp {a.propertyNames.length} nhà:{' '}
                        {a.propertyNames.join(' · ')}
                      </li>
                    ))}
                  </ListBlock>
                )}
                {preview.unknownFolders.length > 0 && (
                  <ListBlock title="Không khớp nhà nào — bỏ qua" tone="amber">
                    {preview.unknownFolders.map((u) => (
                      <li key={u.folder} className="py-1">
                        <span className="font-mono text-xs">{u.folder}/</span> ({u.imageCount} ảnh)
                      </li>
                    ))}
                  </ListBlock>
                )}
                {preview.emptyFolders.length > 0 && (
                  <ListBlock title="Folder không có ảnh" tone="amber">
                    {preview.emptyFolders.map((f) => <li key={f} className="py-1 font-mono text-xs">{f}/</li>)}
                  </ListBlock>
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setStage('pick'); setPreview(null); }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Chọn file khác
                  </button>
                  <button
                    type="button"
                    onClick={runReading}
                    disabled={preview.matched.length === 0}
                    className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${cfg.accent.button}`}
                  >
                    Đọc và đối chiếu {preview.matched.length} nhà
                  </button>
                </div>
              </>
            )}

            {/* ── Đang đọc ── */}
            {stage === 'reading' && (
              <div className="py-14 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
                <p className="mt-3 text-sm font-bold text-slate-700">
                  Đang đọc hoá đơn và tra hồ sơ… {progress.done}/{progress.total}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {READ_CONCURRENCY} nhà một lượt — nhanh hơn mà dịch vụ đọc hoá đơn không quá tải.
                </p>
                <div className="mx-auto mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-700 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Duyệt ── */}
            {stage === 'review' && (
              <>
                {/* Kỳ chung + bộ lọc trên một hàng — lô 50–100 nhà thì vào bảng càng nhanh càng tốt. */}
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kỳ chung</span>
                    <input
                      value={batchPeriod}
                      onChange={(e) => changeBatchPeriod(e.target.value)}
                      placeholder="01/09 – 30/09/2026"
                      title="Áp cho các nhà không đọc được kỳ trên giấy. Nhà có kỳ in trên giấy hoặc đã tự gõ thì giữ nguyên."
                      className={`w-44 rounded-lg border bg-white px-2 py-1.5 text-xs font-bold tabular-nums outline-none transition focus:ring-2 ${
                        batchIssue ? 'border-rose-300 text-rose-700 focus:ring-rose-100' : 'border-slate-300 text-slate-800 focus:ring-slate-100'}`}
                    />
                    <span className="text-xs text-slate-500">
                      {batchIssue
                        ? <b className="text-rose-600">{batchIssue}</b>
                        : <>áp cho <b className="text-slate-700">{followingBatch}</b>/{rows.length} nhà</>}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {FILTERS.map((f) => {
                      const n = rows.filter((_, i) => f.match(i)).length;
                      const on = filter === f.key;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFilter(f.key)}
                          disabled={n === 0 && !on}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-30 ${on ? f.on : 'text-slate-500 hover:bg-white'}`}
                        >
                          {f.label} {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {visibleIdx.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-400">Không có nhà nào trong mục này.</p>
                  ) : visibleIdx.map((i) => (
                    <ZipRowCard
                      key={rows[i].property.id}
                      cfg={cfg}
                      row={rows[i]}
                      ev={evals[i]}
                      month={month}
                      onDraft={(patch, extra) => patchDraft(i, patch, extra)}
                      onToggle={() => patchRow(i, { include: !rows[i].include })}
                      onZoom={setZoom}
                      locked={busy}
                    />
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {busy
                      ? `Đang phát hành… ${progress.done}/${progress.total}`
                      : <>Sẵn sàng <b className="text-slate-800">{readyIdx.length}</b> nhà
                          {doneCount > 0 && <> · đã xong {doneCount}</>}
                          {errCount > 0 && <span className="text-rose-600"> · lỗi {errCount}</span>}</>}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={busy}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={busy || readyIdx.length === 0}
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${cfg.accent.button}`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Phát hành {readyIdx.length} nhà
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {confirmOpen && (
            <ConfirmPublish
              cfg={cfg}
              items={readyIdx.map((i) => ({
                name: rows[i].property.propertyName,
                period: rows[i].draft.period,
                whole: rows[i].property.wholeHouse === true,
                warns: [evals[i].code, evals[i].prev, evals[i].qty, evals[i].amount, evals[i].period]
                  .filter((c): c is Check => c?.tone === 'warn')
                  .map((c) => c.label),
                guessedPeriod: rows[i].periodSource === 'default',
              }))}
              heldBack={rows.filter((r, i) => !isDone(r) && !isReady(i)).length}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={publishAll}
            />
          )}
        </div>
      </div>
      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
};

// ─── Một nhà trong bảng duyệt ─────────────────────────────────────────────────

const Cell = ({ label, system, children, check }: {
  label: string;
  system?: React.ReactNode;
  children: React.ReactNode;
  check?: Check | null;
}) => (
  <div className="min-w-0">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-0.5 h-4 truncate text-[11px] tabular-nums text-slate-400">{system}</p>
    <div className="mt-1">{children}</div>
    <div className="mt-1 h-4" title={check?.detail}>
      {check && <CheckBadge check={check} />}
    </div>
  </div>
);

const ZipRowCard = ({ cfg, row, ev, month, onDraft, onToggle, onZoom, locked }: {
  cfg: KindConfig;
  row: Row;
  ev: BillEvaluation;
  month: number;
  onDraft: (patch: Partial<BillDraft>, extra?: Partial<Row>) => void;
  onToggle: () => void;
  onZoom: (url: string) => void;
  locked: boolean;
}) => {
  const whole = row.property.wholeHouse === true;
  const done = row.already || row.state === 'done';
  const disabled = done || locked;
  const stored = showCode(cfg.storedCode(row.property));
  const d = row.draft;
  const firstBlock = ev.blockers[0];
  const detail = [ev.code, ev.prev, ev.next, ev.qty, ev.amount, ev.period]
    .find((c) => c && (c.tone === 'block' || c.tone === 'warn') && c.detail);

  return (
    <div className={`rounded-xl border transition ${
      row.state === 'done' ? 'border-emerald-200 bg-emerald-50/40'
        : row.state === 'error' ? 'border-rose-200 bg-rose-50/30'
          : row.already || !row.include ? 'border-slate-200 bg-slate-50/70 opacity-70'
            : ev.ready ? 'border-slate-200 bg-white' : 'border-rose-200 bg-white'}`}
    >
      {/* Dòng đầu: ảnh · nhà · trạng thái */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        {!done && (
          <input
            type="checkbox"
            checked={row.include}
            onChange={onToggle}
            disabled={locked}
            title="Bỏ tick để không phát hành nhà này trong lượt này"
            className="h-4 w-4 shrink-0 accent-slate-800"
          />
        )}
        {row.imageUrl ? (
          <button type="button" onClick={() => onZoom(row.imageUrl!)} className="shrink-0" title="Phóng to ảnh">
            <img src={row.imageUrl} alt="" className="h-10 w-10 rounded-md border border-slate-200 object-cover" />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md border border-dashed border-slate-300" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{row.property.propertyName}</p>
          <p className="truncate text-xs text-slate-400">
            {whole ? 'Nguyên căn' : `${row.property.totalRooms ?? 0} phòng`}
            <span className="font-mono"> · {row.folder}/</span>
            {row.note && <span className="text-amber-600"> · {row.note}</span>}
            {row.lastBill && (
              <span> · kỳ trước {fmtNum(row.lastBill.totalQuantity)} {cfg.unit} / {fmtVnd(row.lastBill.totalAmount)}</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {row.already ? (
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">Kỳ này đã có</span>
          ) : row.state === 'done' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã phát hành
            </span>
          ) : row.state === 'publishing' ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          ) : !row.include ? (
            <span className="text-xs font-bold text-slate-500">Không phát hành lượt này</span>
          ) : ev.ready ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {ev.blockers.length > 1 ? `Còn ${ev.blockers.length} mục` : `${firstBlock?.field}: ${firstBlock?.label.toLowerCase()}`}
            </span>
          )}
        </div>
      </div>

      {/* Thân: hồ sơ ↔ giấy, từng mục */}
      {!row.already && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-3 xl:grid-cols-6">
          <Cell
            label={cfg.codeLabel}
            system={stored ? <>hồ sơ <span className="font-mono font-semibold text-slate-500">{stored}</span></> : 'hồ sơ chưa khai mã'}
            check={ev.code}
          >
            <input
              value={d.customerCode}
              disabled={disabled}
              onChange={(e) => onDraft({ customerCode: e.target.value })}
              placeholder={`VD: ${cfg.codePlaceholder}`}
              className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wide outline-none transition placeholder:font-normal placeholder:normal-case placeholder:text-slate-300 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400 ${TONE_INPUT[ev.code.tone]}`}
            />
          </Cell>

          {whole ? (
            <>
              <Cell
                label="Chỉ số cũ"
                system={row.cycle?.prevClose
                  ? <>hồ sơ <b className="text-slate-500">{fmtNum(row.cycle.prevClose.reading)}</b>{row.cycle.prevClose.at ? ` · ${fmtPeriodTag(row.cycle.prevClose.at)}` : ''}</>
                  : row.cycle?.firstPeriod && row.cycle.handover
                    ? <>đón khách <b className="text-slate-500">{fmtNum(Math.round(row.cycle.handover.reading))}</b></>
                    : 'không có số hồ sơ'}
                check={ev.prev}
              >
                <NumInput
                  value={d.paperPrev}
                  disabled={disabled}
                  onChange={(v) => onDraft({ paperPrev: v })}
                  tone={ev.prev?.tone ?? 'idle'}
                  className="px-2.5 py-1.5 text-xs"
                />
              </Cell>
              <Cell label="Chỉ số mới" system={ev.computedNew != null ? `= cũ + tiêu thụ ${fmtNum(ev.computedNew)}` : '= cũ + tiêu thụ'} check={ev.next}>
                <NumInput
                  value={d.paperNew}
                  disabled={disabled}
                  onChange={(v) => onDraft({ paperNew: v })}
                  placeholder={ev.computedNew != null ? fmtNum(ev.computedNew) : '—'}
                  tone={ev.next?.tone ?? 'idle'}
                  className="px-2.5 py-1.5 text-xs"
                />
              </Cell>
            </>
          ) : (
            <div className="col-span-2 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Chỉ số từng phòng</p>
              {row.rooms && row.rooms.total > 0 ? (
                <>
                  <p className="mt-1.5 text-sm font-bold tabular-nums text-slate-800">
                    {row.rooms.pending + row.rooms.issued}/{row.rooms.total} phòng đã chốt
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.rooms.pending > 0
                      ? `${row.rooms.pending} phòng sẽ nhận hoá đơn · ${fmtNum(row.rooms.pendingQty)} ${cfg.unit}`
                      : 'Chưa phòng nào chờ phát hành — hoá đơn tự đi khi quản lý chốt'}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">Quản lý chốt chỉ số từng phòng trên app.</p>
              )}
            </div>
          )}

          <Cell
            label={`${cfg.qtyLabel} (${cfg.unit})`}
            system={row.lastBill ? `kỳ trước ${fmtNum(row.lastBill.totalQuantity)}` : ''}
            check={ev.qty}
          >
            <NumInput
              value={d.qty}
              disabled={disabled}
              onChange={(v) => onDraft({ qty: v })}
              tone={ev.qty.tone}
              className="px-2.5 py-1.5 text-xs"
            />
          </Cell>

          <Cell
            label="Tổng tiền"
            system={ev.unitPrice > 0 ? `${fmtVnd(ev.unitPrice)}/${cfg.unit}` : ''}
            check={ev.amount}
          >
            <NumInput
              value={d.amount}
              disabled={disabled}
              onChange={(v) => onDraft({ amount: v })}
              tone={ev.amount.tone}
              className="px-2.5 py-1.5 text-xs"
            />
          </Cell>

          <Cell
            label="Kỳ hoá đơn"
            system={row.periodSource === 'ocr' ? 'in trên giấy' : row.periodSource === 'manual' ? 'tự nhập' : `theo kỳ chung · tháng ${month}`}
            check={ev.period}
          >
            <input
              value={d.period}
              disabled={disabled}
              onChange={(e) => onDraft({ period: e.target.value }, { periodSource: 'manual' })}
              placeholder="01/09 – 30/09/2026"
              className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold tabular-nums outline-none transition focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400 ${
                row.periodSource === 'default' && ev.period.tone !== 'block' ? 'border-slate-200 text-slate-500' : TONE_INPUT[ev.period.tone]}`}
            />
          </Cell>
        </div>
      )}

      {/* Lời giải thích của mục sai đầu tiên — đủ để biết sửa ô nào, không thành bức tường chữ. */}
      {!done && row.state !== 'error' && detail?.detail && (
        <p className={`mx-4 mb-3 rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
          detail.tone === 'block' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}
        >
          {detail.detail}
        </p>
      )}
      {row.state === 'error' && row.error && (
        <p className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">{row.error}</p>
      )}
    </div>
  );
};

// ─── Xác nhận trước khi phát hành cả lô ───────────────────────────────────────

/**
 * Nhắc lại đúng những thứ SAI THÌ KHÓ GỠ: bao nhiêu nhà, kỳ nào, nhà nào còn cảnh báo, nhà
 * nào đang theo kỳ đoán, và bao nhiêu nhà nguyên căn sẽ tới tay khách ngay.
 */
const ConfirmPublish = ({ cfg, items, heldBack, onCancel, onConfirm }: {
  cfg: KindConfig;
  items: { name: string; period: string; whole: boolean; warns: string[]; guessedPeriod: boolean }[];
  heldBack: number;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const wholeCount = items.filter((r) => r.whole).length;
  const warned = items.filter((r) => r.warns.length > 0);
  const guessed = items.filter((r) => r.guessedPeriod);
  // Kỳ chiếm đa số in một lần ở tiêu đề; dòng nào khác kỳ đó mới hiện kỳ riêng.
  const mainPeriod = (() => {
    const tally = new Map<string, number>();
    items.forEach((r) => tally.set(r.period, (tally.get(r.period) ?? 0) + 1));
    let best = '';
    let top = 0;
    tally.forEach((count, p) => { if (count > top) { top = count; best = p; } });
    return top > 1 ? best : '';
  })();

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/40 p-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-black text-slate-950">Phát hành hoá đơn {cfg.noun} cho {items.length} nhà?</h3>
          {mainPeriod && <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-500">Kỳ {mainPeriod}</p>}
        </div>

        <div className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {items.map((r) => (
              <div key={r.name} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{r.name}</span>
                {r.warns.length > 0 && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                    {r.warns[0]}
                  </span>
                )}
                {r.period !== mainPeriod && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                    {r.period || 'chưa có kỳ'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {warned.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <b>{warned.length} nhà còn cảnh báo</b> (chưa khai mã, đơn giá bất thường, tiêu thụ lệch kỳ trước…).
              Không chặn phát hành, nhưng nên xem lại trước khi gửi.
            </p>
          )}
          {guessed.length > 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              <b>{guessed.length} nhà theo kỳ chung</b> vì không đọc được kỳ trên giấy. Kỳ là khoá để quản lý đối chiếu —
              sai thì phải thu hồi hoá đơn.
            </p>
          )}
          {wholeCount > 0 && (
            <p className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
              <b>{wholeCount} nhà nguyên căn</b> sẽ có hoá đơn tới tay khách thuê ngay khi phát hành.
            </p>
          )}
          {heldBack > 0 && (
            <p className="text-xs text-slate-500">{heldBack} nhà chưa sẵn sàng hoặc đã bỏ tick sẽ ở lại bảng, không phát hành.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Xem lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition ${cfg.accent.button}`}
          >
            Phát hành {items.length} nhà
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Mảnh nhỏ ─────────────────────────────────────────────────────────────────

const STAGES: { key: Stage; label: string }[] = [
  { key: 'pick', label: 'Chọn file' },
  { key: 'preview', label: 'Khớp nhà' },
  { key: 'reading', label: 'Đọc ảnh' },
  { key: 'review', label: 'Duyệt' },
];

const StageDots = ({ stage }: { stage: Stage }) => {
  const at = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="hidden items-center gap-1.5 md:flex">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            i === at ? 'bg-slate-900 text-white' : i < at ? 'bg-slate-200 text-slate-600' : 'text-slate-400'}`}
          >
            {s.label}
          </span>
          {i < STAGES.length - 1 && <span className="h-px w-3 bg-slate-200" />}
        </li>
      ))}
    </ol>
  );
};

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

const ListBlock = ({ title, tone, children }: { title: string; tone?: 'amber' | 'rose'; children: React.ReactNode }) => (
  <div className={`mt-4 rounded-xl border p-3 ${
    tone === 'rose' ? 'border-rose-200 bg-rose-50/60' : tone === 'amber' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}
  >
    <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
    <ul className="max-h-52 overflow-y-auto text-xs text-slate-600">{children}</ul>
  </div>
);
