/**
 * PHÁT HÀNH HOÁ ĐƠN ĐIỆN / NƯỚC (Admin) — một trang cho cả hai loại, khác nhau ở `KINDS`.
 *
 * Luồng ba bước, đúng thứ tự admin làm với tờ giấy trên tay:
 *   1. Chọn nhà   → hồ sơ hiện ngay: mã khách hàng điện/nước, chỉ số đầu kỳ hệ thống đang
 *                   giữ (nguyên căn) hoặc tiến độ chốt phòng (chia phòng), kỳ trước tính bao nhiêu.
 *   2. Tải ảnh    → máy đọc mã, chỉ số, tiêu thụ, tổng tiền, kỳ rồi điền sẵn.
 *   3. Đối chiếu  → từng mục đặt cạnh nhau "hồ sơ ↔ giấy", sai đâu chỉ đúng chỗ đó.
 *
 * Phát hành xong thì:
 *   • nguyên căn → máy chủ lập luôn hoá đơn cho khách trong cùng lệnh (`createFromWholeHouseBill`);
 *   • chia phòng → máy chủ nhân đơn giá với chỉ số quản lý đã chốt và gửi từng phòng.
 *
 * Bỏ lệnh gọi thứ hai `createForWholeHouse` mà trang cũ còn giữ "phòng BE chưa lên bản mới":
 * máy chủ đã tự lập hoá đơn trong cùng transaction từ 17/08/2026, lệnh đó chỉ còn ăn lỗi
 * `INVOICE_ALREADY_EXISTS` (kèm một toast đỏ vô nghĩa sau mỗi lần phát hành nguyên căn).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, FileArchive, FileUp, Loader2, RefreshCw, Send, X, ZoomIn,
} from 'lucide-react';
import { uploadToCloudinary } from '@/services/upload.service';
import { propertyService } from '@/services/property.service';
import { useOccupiedProperties } from '@/services/useOccupiedProperties';
import {
  loadUtilityCycle, pickLastBill, type LastBill, type UtilityCycle,
} from '@/services/utilityCycle';
import type { PropertyResponse } from '@/types/api.types';
import { arrearsPeriod, monthPeriod } from '@/utils/evnInvoiceParser';
import { matchBillToProperty } from '@/utils/billPropertyMatch';
import { serverNow } from '@/utils/serverTime';
import { SectionShell, MissingBillsBanner } from '../shared';
import { KINDS, type BillReadout, type PublishedBill, type UtilityKind } from './kinds';
import { refreshAdminBadges } from '@/utils/adminBadges';
import {
  EMPTY_DRAFT, evaluateBill, loadRoomReadings, normCode, pickPaperCode, publishErrorMessage,
  summarizeRooms, warnCount, type BillDraft, type RoomReading,
} from './billChecks';
import { PropertyCombobox } from './PropertyCombobox';
import { PropertyDossier } from './PropertyDossier';
import { BillComparison } from './BillComparison';
import { RoomReadingsPanel } from './RoomReadingsPanel';
import { PublishedBillsSection } from './PublishedBillsSection';
import { UtilityBillZipImport } from './UtilityBillZipImport';
import { ImageLightbox, StepTitle, fmtNum, fmtVnd } from './ui';

type ScanState = 'idle' | 'uploading' | 'reading' | 'done' | 'failed';

const READ_LABELS: { key: keyof BillDraft; label: string }[] = [
  { key: 'customerCode', label: 'mã' },
  { key: 'paperPrev', label: 'chỉ số cũ' },
  { key: 'paperNew', label: 'chỉ số mới' },
  { key: 'qty', label: 'tiêu thụ' },
  { key: 'amount', label: 'tổng tiền' },
  { key: 'period', label: 'kỳ' },
];

export const UtilityBillPublishPage = ({ kind }: { kind: UtilityKind }) => {
  const cfg = KINDS[kind];

  // Điện/nước TRẢ SAU: mở màn giữa tháng 9 thì kỳ đang làm là tháng 8 — xem `arrearsPeriod`.
  const [month, setMonth] = useState(() => arrearsPeriod(serverNow()).month);
  const [year, setYear] = useState(() => arrearsPeriod(serverNow()).year);
  const monthPeriodText = useMemo(() => monthPeriod(0, new Date(year, month - 1, 1)), [month, year]);
  const prevMonthPeriodText = useMemo(() => monthPeriod(-1, new Date(year, month - 1, 1)), [month, year]);

  // ── Danh sách nhà + hoá đơn đã phát hành của kỳ ──────────────────────────────
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [bills, setBills] = useState<PublishedBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billsError, setBillsError] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    setPropsError(null);
    try {
      setProperties((await propertyService.getAllProperties()) ?? []);
    } catch (e: any) {
      setPropsError(e?.response?.data?.message || e?.message || 'Không tải được danh sách nhà.');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  /**
   * Một lệnh cho cả kỳ — máy chủ đã cho `propertyId` thành tuỳ chọn (badge trên menu cũng
   * gọi đúng kiểu này), nên bỏ được vòng hỏi từng nhà mà trang điện cũ phải làm.
   */
  const loadBills = useCallback(async () => {
    setLoadingBills(true);
    setBillsError(null);
    try {
      const rows = await cfg.list({ month, year });
      setBills(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      // Nói thẳng là không tải được, đừng hiện "chưa phát hành gì" — admin sẽ phát hành trùng.
      setBills([]);
      setBillsError(e?.response?.data?.message || e?.message || `Không tải được danh sách hoá đơn ${cfg.noun}.`);
    } finally {
      setLoadingBills(false);
    }
  }, [cfg, month, year]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadBills(); }, [loadBills]);

  /**
   * Ô chọn nhà CHỈ hiện căn đang có khách — hoá đơn điện/nước chỉ có nghĩa với căn có người
   * ở (xem `useOccupiedProperties`). Chỉ lọc ô chọn: bảng đã phát hành vẫn tra được nhà cũ.
   */
  const { occupiedIds } = useOccupiedProperties();
  const occupiedProperties = useMemo(
    () => (occupiedIds ? properties.filter((p) => occupiedIds.has(p.id)) : properties),
    [properties, occupiedIds],
  );
  const hiddenEmptyCount = properties.length - occupiedProperties.length;
  const publishedIds = useMemo(
    () => new Set(bills.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [bills],
  );

  // ── Phát hành (khai báo sớm — bước tải ảnh cũng báo lỗi vào đây) ────────────
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState<{
    bill: PublishedBill; whole: boolean; pending: number; missing: number;
  } | null>(null);

  // ── Nhà đang chọn + hồ sơ của nó ─────────────────────────────────────────────
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const property = properties.find((p) => p.id === propertyId) ?? null;
  const whole = property?.wholeHouse === true;
  const storedCode = property ? cfg.storedCode(property) : undefined;
  const existingBill = bills.find((b) => b.propertyId === propertyId && b.status !== 'REVOKED');

  /**
   * Hồ sơ gắn với MỘT cặp (nhà, kỳ). Mỗi mảnh nhớ nó được tải cho khoá nào; khoá không khớp
   * nghĩa là đang tải — nhờ vậy vừa đổi nhà thì không loé lên hồ sơ của nhà cũ, cũng không
   * loé lên một kết luận "không tra được" trong tích tắc trước khi lệnh tra kịp chạy.
   */
  const [reloadTick, setReloadTick] = useState(0);
  const dossierKey = property ? `${property.id}|${month}|${year}|${reloadTick}` : '';
  const [cycleState, setCycleState] = useState<{ key: string; cycle: UtilityCycle | null }>({ key: '', cycle: null });
  const [lastBillState, setLastBillState] = useState<{ key: string; bill: LastBill | null }>({ key: '', bill: null });
  const [roomState, setRoomState] = useState<{ key: string; rows: RoomReading[] | null }>({ key: '', rows: null });

  const cycleLoading = whole && cycleState.key !== dossierKey;
  const cycle = whole && !cycleLoading ? cycleState.cycle : null;
  const lastBillLoading = !!property && lastBillState.key !== dossierKey;
  const lastBill = lastBillLoading ? null : lastBillState.bill;
  const roomsLoading = !!property && !whole && roomState.key !== dossierKey;
  const roomRows = !whole && !roomsLoading ? roomState.rows : null;

  /**
   * Tra hồ sơ mỗi lần đổi nhà hoặc đổi kỳ.
   *
   * Nguyên căn: `loadUtilityCycle` trả lời kỳ này là KỲ ĐẦU hay KỲ TIẾP — hai kỳ lấy chỉ số
   * cũ ở hai chỗ khác hẳn (mốc đón khách / chốt kỳ trước) — kèm luôn hoá đơn kỳ trước.
   * Chia phòng: bảng chỉ số quản lý đã chốt + hoá đơn kỳ trước.
   */
  useEffect(() => {
    if (!property) return;
    const key = dossierKey;
    if (property.wholeHouse) {
      loadUtilityCycle(property.id, kind, month, year)
        .catch(() => null)
        .then((c) => {
          setCycleState({ key, cycle: c });
          setLastBillState({ key, bill: c?.lastBill ?? null });
        });
    } else {
      cfg.list({ propertyId: property.id })
        .then((rows) => pickLastBill(rows, month, year))
        .catch(() => null)
        .then((bill) => setLastBillState({ key, bill }));
      loadRoomReadings(kind, property.id, month, year)
        .catch(() => [] as RoomReading[])
        .then((rows) => setRoomState({ key, rows }));
    }
    // Kết quả về muộn của nhà cũ tự bị bỏ qua: nó mang khoá cũ, không khớp `dossierKey`.
    // `property` đổi danh tính mỗi lần tải lại danh sách nhà — bám theo khoá là đủ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierKey, property?.wholeHouse, kind]);

  const rooms = useMemo(() => summarizeRooms(roomRows), [roomRows]);

  // ── Tờ hoá đơn đang soát ─────────────────────────────────────────────────────
  const [draft, setDraft] = useState<BillDraft>({ ...EMPTY_DRAFT, period: monthPeriodText });
  const [fromImage, setFromImage] = useState<Partial<Record<keyof BillDraft, boolean>>>({});
  const [touched, setTouched] = useState(false);
  /** Kỳ đang là kỳ mặc định (chưa đọc từ giấy, chưa ai gõ) — đổi tháng thì kéo theo. */
  const periodAuto = useRef(true);
  /** Admin đã tự sửa ô mã — đổi nhà thì không chọn lại mã từ ảnh đè lên. */
  const codeEdited = useRef(false);

  const [imageUrl, setImageUrl] = useState('');
  const [readout, setReadout] = useState<BillReadout | null>(null);
  const [scan, setScan] = useState<ScanState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (periodAuto.current) setDraft((d) => ({ ...d, period: monthPeriodText }));
  }, [monthPeriodText]);

  /**
   * Đổi nhà sau khi đã có ảnh: chọn lại mã trong các ứng viên đọc được, theo hồ sơ của nhà
   * MỚI. Ảnh và các số khác giữ nguyên — tải ảnh trước rồi mới chọn nhà là cách làm hợp lệ,
   * và chính lúc đó bảng đối chiếu bắt được "chọn nhầm nhà".
   */
  useEffect(() => {
    if (!readout || codeEdited.current) return;
    setDraft((d) => ({ ...d, customerCode: pickPaperCode(readout.codeCandidates, storedCode) }));
  }, [propertyId, readout, storedCode]);

  const patchDraft = (patch: Partial<BillDraft>) => {
    setTouched(true);
    if ('period' in patch) periodAuto.current = false;
    if ('customerCode' in patch) codeEdited.current = true;
    setDraft((d) => ({ ...d, ...patch }));
    setFromImage((f) => {
      const next = { ...f };
      (Object.keys(patch) as (keyof BillDraft)[]).forEach((k) => { next[k] = false; });
      return next;
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPublishError('Chỉ nhận file ảnh (JPG, PNG).');
      return;
    }
    setPublishError(null);
    setScan('uploading');
    try {
      const url = await uploadToCloudinary(file, 'image');
      setImageUrl(url);
      setScan('reading');
      try {
        const r = await cfg.read(url);
        setReadout(r);
        codeEdited.current = false;
        /*
          Ảnh MỚI thì số đọc được thay số cũ — chúng thuộc một tờ giấy khác. Mục nào máy
          không đọc ra thì giữ số admin đã gõ, không xoá trắng công người ta.
        */
        const read: Partial<BillDraft> = {
          customerCode: pickPaperCode(r.codeCandidates, storedCode),
          paperPrev: r.prev,
          paperNew: r.next,
          qty: r.qty,
          amount: r.amount,
          period: r.period,
        };
        const filled: Partial<Record<keyof BillDraft, boolean>> = {};
        (Object.keys(read) as (keyof BillDraft)[]).forEach((k) => { filled[k] = read[k] !== ''; });
        if (r.period) periodAuto.current = false;
        setDraft((d) => {
          const next = { ...d };
          (Object.keys(read) as (keyof BillDraft)[]).forEach((k) => { if (read[k]) next[k] = read[k]!; });
          return next;
        });
        setFromImage(filled);
        setScan('done');
      } catch {
        setReadout(null);
        setFromImage({});
        setScan('failed');
      }
    } catch (e: any) {
      setScan('idle');
      setPublishError(e?.message || 'Không tải được ảnh lên.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearImage = () => {
    setImageUrl('');
    setReadout(null);
    setFromImage({});
    setScan('idle');
  };

  const resetAll = () => {
    clearImage();
    setDraft({ ...EMPTY_DRAFT, period: monthPeriodText });
    periodAuto.current = true;
    codeEdited.current = false;
    setTouched(false);
    setPublishError(null);
  };

  // ── Đánh giá ─────────────────────────────────────────────────────────────────
  const ev = evaluateBill(draft, {
    cfg,
    wholeHouse: whole,
    storedCode,
    cycle,
    cycleLoading,
    month,
    year,
    roomPendingQty: rooms?.pendingQty ?? null,
    lastQty: lastBill?.totalQuantity ?? null,
    paperOtherTotals: readout?.otherTotals ?? null,
  });
  const active = !!imageUrl || touched;
  const billMatch = useMemo(
    () => matchBillToProperty(readout?.rawText, property?.fullAddress || property?.shortAddress),
    [readout, property],
  );
  const busyScan = scan === 'uploading' || scan === 'reading';
  /** Lưu ý không chặn (chưa khai mã, đơn giá lạ, địa chỉ không khớp…) — đếm để nói ra ở đầu bước 3. */
  const notes = warnCount(ev) + (billMatch.verdict === 'weak' || billMatch.verdict === 'mismatch' ? 1 : 0);

  // ── Phát hành ────────────────────────────────────────────────────────────────
  const canPublish = !!property && ev.ready && !existingBill && !publishing && !busyScan;

  const publish = async () => {
    if (!canPublish || !property) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const created = await cfg.publish({
        propertyId: property.id,
        billingPeriod: draft.period.trim(),
        month,
        year,
        qty: Number(draft.qty),
        amount: Number(draft.amount),
        imageUrl: imageUrl || undefined,
        prevReading: whole ? ev.sendPrev ?? undefined : undefined,
        newReading: whole ? ev.sendNew ?? undefined : undefined,
        // Bắt buộc gửi khi nhà đã khai mã — máy chủ đối chiếu và CHẶN khi lệch.
        customerCode: normCode(draft.customerCode) ? draft.customerCode.trim() : undefined,
        ocrConfirmed: true,
      });
      setJustPublished({
        bill: { ...created, propertyName: created.propertyName ?? property.propertyName },
        whole,
        pending: rooms?.pending ?? 0,
        missing: rooms?.missing ?? 0,
      });
      resetAll();
      setPropertyId(null);
      setReloadTick((t) => t + 1);
      loadBills();
      // Số "nhà còn thiếu hoá đơn" trên menu giảm ngay lúc bấm, không đợi lượt hỏi định kỳ.
      refreshAdminBadges();
    } catch (e: any) {
      // Giữ nguyên mọi ô: lỗi mã chỉ cần sửa một chuỗi rồi bấm lại, không phải quét lại ảnh.
      setPublishError(publishErrorMessage(e, cfg));
    } finally {
      setPublishing(false);
    }
  };

  const [zoom, setZoom] = useState<string | null>(null);
  const [zipOpen, setZipOpen] = useState(false);
  const formTopRef = useRef<HTMLDivElement>(null);
  const closeZoom = useCallback(() => setZoom(null), []);

  const readSummary = READ_LABELS.filter((x) => fromImage[x.key]).map((x) => x.label);

  return (
    <div className="space-y-6">
      <SectionShell
        title={`Phát hành hoá đơn ${cfg.noun}`}
        subtitle={`Chọn nhà, tải ảnh ${cfg.paperName} rồi đối chiếu với hồ sơ trước khi phát hành.`}
        icon={cfg.icon}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {/* Kỳ TIÊU THỤ, không phải tháng đang phát hành — điện/nước trả sau nên lệch một tháng. */}
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
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { loadProperties(); loadBills(); setReloadTick((t) => t + 1); }}
              title="Tải lại"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {/* Nhập lô — một .zip cho cả danh mục, thay vì lặp ba bước × N nhà. */}
            <button
              type="button"
              onClick={() => setZipOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <FileArchive className="h-4 w-4" /> Nhập lô .zip
            </button>
          </div>
        )}
      >
        <MissingBillsBanner
          kindLabel={cfg.menuLabel}
          periodLabel={`${month}/${year}`}
          loading={loadingProps || loadingBills}
          missing={occupiedProperties
            .filter((p) => !publishedIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.propertyName }))}
          onPick={(id) => {
            setPropertyId(id);
            formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />

        {justPublished && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-emerald-800">
                {justPublished.whole
                  ? 'Đã phát hành và gửi cho khách thuê'
                  : justPublished.pending > 0
                    ? `Đã phát hành — gửi ngay cho ${justPublished.pending} phòng`
                    : 'Đã phát hành đơn giá cho kỳ này'}
                {' — '}{justPublished.bill.propertyName ?? `nhà #${justPublished.bill.propertyId}`}
              </p>
              <p className="tabular-nums text-emerald-700">
                {fmtNum(justPublished.bill.totalQuantity)} {cfg.unit} · {fmtVnd(justPublished.bill.totalAmount)} · đơn giá{' '}
                {fmtVnd(justPublished.bill.unitPrice ?? cfg.unitPrice(justPublished.bill.totalAmount, justPublished.bill.totalQuantity))}/{cfg.unit}
              </p>
              {!justPublished.whole && (
                <p className="mt-1 text-xs text-emerald-700">
                  {justPublished.pending === 0
                    ? 'Chưa phòng nào chốt số nên chưa gửi được hoá đơn nào. Hoá đơn tự đi ngay khi quản lý chốt, không cần đẩy lại giấy.'
                    : justPublished.missing > 0
                      ? `${justPublished.missing} phòng chưa chốt sẽ tự phát hành ngay khi quản lý chốt số.`
                      : 'Cả nhà đã đủ chỉ số.'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setJustPublished(null)}
              className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div ref={formTopRef} className="grid scroll-mt-24 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* ── Cột trái: nhà + ảnh ── */}
          <div className="space-y-6">
            <section>
              <StepTitle n={1} title="Chọn nhà" done={!!property} />
              {loadingProps ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách nhà…
                </p>
              ) : propsError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {propsError}
                  <button type="button" onClick={loadProperties} className="ml-2 font-semibold underline">Thử lại</button>
                </div>
              ) : (
                <>
                  <PropertyCombobox
                    properties={occupiedProperties}
                    value={propertyId}
                    onChange={setPropertyId}
                    publishedIds={publishedIds}
                    codeOf={cfg.storedCode}
                    accentChip={cfg.accent.chipOn}
                  />
                  {/* Nói rõ đã giấu bớt — im lặng thì tìm một căn quen không thấy, tưởng bị xoá. */}
                  {hiddenEmptyCount > 0 && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      Chỉ hiện nhà đang có khách ở — {hiddenEmptyCount} nhà trống đã được ẩn.
                    </p>
                  )}
                </>
              )}

              {existingBill && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  Nhà này đã có {cfg.paperName} kỳ {month}/{year} ({fmtNum(existingBill.totalQuantity)} {cfg.unit} ·{' '}
                  {fmtVnd(existingBill.totalAmount)}). Muốn làm lại thì thu hồi bản cũ ở bảng bên dưới trước.
                </p>
              )}

              {property && (
                <div className="mt-3">
                  <PropertyDossier
                    cfg={cfg}
                    property={property}
                    cycle={cycle}
                    cycleLoading={cycleLoading}
                    lastBill={lastBill}
                    lastBillLoading={lastBillLoading}
                    rooms={rooms}
                    roomsLoading={roomsLoading}
                  />
                </div>
              )}
            </section>

            <section>
              <StepTitle n={2} title={`Ảnh ${cfg.paperName}`} done={!!imageUrl} />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {!imageUrl ? (
                <button
                  type="button"
                  disabled={busyScan}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-9 text-slate-500 transition disabled:opacity-60 ${
                    dragOver ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/60'}`}
                >
                  {busyScan ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
                      <span className="text-sm font-semibold">
                        {scan === 'uploading' ? 'Đang tải ảnh lên…' : 'Đang đọc hoá đơn…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-7 w-7" strokeWidth={1.75} />
                      <span className="text-sm font-bold text-slate-700">Chọn hoặc kéo thả ảnh {cfg.paperName}</span>
                      <span className="text-xs text-slate-400">Máy tự đọc mã, chỉ số, tiêu thụ, tổng tiền và kỳ để đối chiếu</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {/* Bấm để phóng to — chữ trên hoá đơn nhỏ, xem ở khung này không đọc nổi số. */}
                  <button
                    type="button"
                    onClick={() => setZoom(imageUrl)}
                    className="group relative block w-full cursor-zoom-in bg-slate-50"
                  >
                    <img src={imageUrl} alt={cfg.paperName} className="max-h-[420px] w-full object-contain" />
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                      <ZoomIn className="h-3.5 w-3.5" /> Phóng to
                    </span>
                    {scan === 'reading' && (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-semibold text-slate-600">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang đọc hoá đơn…
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {scan === 'failed'
                        ? <span className="font-semibold text-amber-700">Dịch vụ đọc hoá đơn lỗi — nhập tay theo tờ giấy.</span>
                        : scan === 'done'
                          ? readSummary.length > 0
                            ? <>Đã đọc: {readSummary.join(', ')}</>
                            : <span className="font-semibold text-amber-700">Không đọc được số nào — nhập tay theo tờ giấy.</span>
                          : null}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={busyScan}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Đổi ảnh
                    </button>
                    <button
                      type="button"
                      onClick={clearImage}
                      disabled={busyScan}
                      className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Xoá ảnh
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ── Cột phải: đối chiếu + phát hành ── */}
          <section className="min-w-0">
            <StepTitle
              n={3}
              title="Đối chiếu với hồ sơ"
              done={!!property && active && ev.ready}
              aside={property && active ? (
                !ev.ready
                  ? <span className="text-xs font-bold text-rose-600">Còn {ev.blockers.length} mục cần xử lý</span>
                  : notes > 0
                    ? <span className="text-xs font-bold text-amber-600">Phát hành được · {notes} lưu ý nên xem lại</span>
                    : <span className="text-xs font-bold text-emerald-600">Khớp hồ sơ — sẵn sàng</span>
              ) : null}
            />

            {!property ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 text-center">
                <cfg.icon className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-semibold text-slate-600">Chọn nhà ở bước 1 để bắt đầu</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                  Hệ thống sẽ đặt số trên {cfg.paperName} cạnh hồ sơ của nhà — mã khách hàng, chỉ số đầu kỳ,
                  kỳ trước đã tính — để thấy ngay chỗ nào lệch.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {!active && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Tải ảnh hoá đơn ở bước 2 để máy tự đọc số, hoặc gõ thẳng vào cột "Trên hoá đơn".
                  </p>
                )}

                <BillComparison
                  cfg={cfg}
                  property={property}
                  draft={draft}
                  onChange={patchDraft}
                  ev={ev}
                  cycle={cycle}
                  lastBill={lastBill}
                  rooms={rooms}
                  active={active}
                  fromImage={fromImage}
                  month={month}
                  year={year}
                  monthPeriodText={monthPeriodText}
                  prevMonthPeriodText={prevMonthPeriodText}
                  billMatch={billMatch}
                />

                {!whole && roomRows && rooms && rooms.total > 0 && (
                  <RoomReadingsPanel cfg={cfg} rows={roomRows} summary={rooms} onZoom={setZoom} />
                )}

                {/* ── Đơn giá + nút phát hành ── */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p
                        className="text-[11px] font-bold uppercase tracking-wider text-slate-400"
                        title={`= tổng tiền ÷ tổng ${cfg.unit}. Giấy tính bậc thang nên không in sẵn đơn giá; mọi hoá đơn của nhà kỳ này nhân với số này.`}
                      >
                        Đơn giá hệ thống sẽ dùng
                      </p>
                      <p className={`mt-0.5 text-3xl font-black tabular-nums ${ev.unitPrice > 0 ? cfg.accent.text : 'text-slate-300'}`}>
                        {ev.unitPrice > 0 ? <>{fmtVnd(ev.unitPrice)}<span className="text-base font-bold">/{cfg.unit}</span></> : '—'}
                      </p>
                      {ev.unitPrice > 0 && (
                        <p className="text-xs tabular-nums text-slate-400">
                          = {fmtVnd(Number(draft.amount))} ÷ {fmtNum(Number(draft.qty))} {cfg.unit}
                        </p>
                      )}
                    </div>
                    <p className="max-w-xs text-right text-xs leading-relaxed text-slate-500">
                      {whole
                        ? 'Nguyên căn: phát hành là hoá đơn tới tay khách ngay, quản lý nhận thông báo.'
                        : rooms && rooms.pending > 0
                          ? `Chia phòng: tính tiền và gửi ngay cho ${rooms.pending} phòng đã chốt số.`
                          : 'Chia phòng: chưa phòng nào chờ phát hành — hoá đơn tự đi khi quản lý chốt số.'}
                    </p>
                  </div>

                  {publishError && (
                    <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {publishError}
                    </p>
                  )}

                  {active && ev.blockers.length > 0 && (
                    <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      {ev.blockers.map((b) => (
                        <li key={b.field} className="flex gap-1.5">
                          <span className="text-rose-500">•</span>
                          <span><b className="text-slate-700">{b.field}:</b> {b.label.toLowerCase()}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    disabled={!canPublish}
                    onClick={publish}
                    className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${cfg.accent.button}`}
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {existingBill
                      ? 'Kỳ này đã phát hành'
                      : whole
                        ? 'Phát hành & gửi cho khách thuê'
                        : rooms && rooms.pending > 0
                          ? `Phát hành & gửi cho ${rooms.pending} phòng`
                          : 'Phát hành đơn giá cho kỳ này'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </SectionShell>

      <PublishedBillsSection
        cfg={cfg}
        month={month}
        year={year}
        bills={bills}
        loading={loadingBills}
        error={billsError}
        onChanged={loadBills}
        onZoom={setZoom}
      />

      <ImageLightbox src={zoom} alt={cfg.paperName} onClose={closeZoom} />

      {zipOpen && (
        <UtilityBillZipImport
          cfg={cfg}
          properties={properties}
          month={month}
          year={year}
          defaultPeriod={monthPeriodText}
          existing={bills}
          onClose={() => setZipOpen(false)}
          onDone={() => { loadBills(); refreshAdminBadges(); }}
        />
      )}
    </div>
  );
};
