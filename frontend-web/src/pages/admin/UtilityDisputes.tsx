import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, RefreshCw, CheckCircle2, XCircle, Flag, Zap, Droplets, Camera,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { formatCurrency } from '@/utils';
import {
  invoiceDisputeService,
  REASON_LABEL, REASON_CHECK,
  type AdminInvoiceDispute,
  type InvoiceDisputeOutcome,
} from '@/services/invoiceDispute.service';

// ══════════════════════════════════════════════════════════════════════════════
// Khiếu nại hoá đơn điện / nước — admin phân xử.
//
// Đây là lớp hậu kiểm của hai chỗ dễ sai nhất trong luồng tiện ích:
//   • Nguyên căn — admin chọn nhầm nhà lúc phát hành, khách nhận hoá đơn EVN của căn
//     khác. Trang phát hành đã cảnh báo trước khi gửi (đối chiếu địa chỉ trên ảnh OCR
//     với địa chỉ nhà), nhưng đó là chặn MỀM — bỏ qua được, nên vẫn phải có đường này.
//   • Chia phòng — quản lý đọc nhầm mặt đồng hồ (thiếu/thừa một chữ số).
//
// Vì sao admin xử chứ không phải quản lý: xem đầu `services/invoiceDispute.service.ts`.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN') : '—';

/** Số ngày kể từ lúc khách gửi — treo càng lâu càng phải xử gấp. */
const daysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
};

const isElectric = (d: AdminInvoiceDispute) =>
  (d.invoiceType ?? '').toUpperCase().startsWith('ELECTRIC');

/**
 * Hiệu hai chỉ số có khớp lượng đã tính tiền không.
 *
 * Làm sẵn phép trừ này vì nó là thứ kết luận được vụ "đọc nhầm đồng hồ" nhanh nhất, mà
 * lại đúng thứ người ngồi phân xử hay lười làm. Lệch = gần như chắc chắn khách đúng.
 */
const readingGap = (d: AdminInvoiceDispute): number | null => {
  if (d.prevReading == null || d.newReading == null || d.consumption == null) return null;
  const delta = d.newReading - d.prevReading;
  return Math.abs(delta - d.consumption) > 0.001 ? delta - d.consumption : null;
};

const UtilityDisputes = () => {
  const [rows, setRows] = useState<AdminInvoiceDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [target, setTarget] = useState<AdminInvoiceDispute | null>(null);
  const [zoom, setZoom] = useState<{ url: string; caption: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await invoiceDisputeService.list());
    } catch (e: unknown) {
      const res = (e as { response?: { status?: number; data?: { message?: string } } })?.response;
      setRows([]);
      setLoadError(
        res?.status === 403
          ? 'Tài khoản này không có quyền phân xử khiếu nại hoá đơn (403).'
          : res?.status === 404
            ? 'Backend chưa có endpoint khiếu nại hoá đơn (404) — xem doc-be/BE-NEED-khieu-nai-hoa-don-dien-nuoc-2026-08-24.md.'
            : res?.data?.message
              ?? `Không gọi được API${res?.status ? ` (lỗi ${res.status})` : ' — kiểm tra kết nối máy chủ'}.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Đang chờ: cũ nhất lên đầu — treo lâu nhất là gấp nhất, và khách đang bị treo hoá đơn.
  const openList = useMemo(
    () => rows.filter(r => r.status === 'OPEN')
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [rows],
  );
  // Lịch sử: mới nhất lên đầu — tra cứu thì thường tìm vụ gần đây.
  const closedList = useMemo(
    () => rows.filter(r => r.status !== 'OPEN')
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [rows],
  );
  const list = tab === 'open' ? openList : closedList;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khiếu nại hoá đơn điện / nước</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
            Khách thuê báo hoá đơn không phải của nhà mình, hoặc chỉ số không khớp với ảnh
            đồng hồ. Đối chiếu ảnh gốc rồi kết luận — trong lúc chờ, hoá đơn đã tạm ngừng
            tính quá hạn nên đừng để treo lâu.
          </p>
        </div>
        <button onClick={load}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      </div>

      <div className="mt-5 flex gap-2">
        {([
          ['open', 'Đang chờ xử lý', openList.length],
          ['closed', 'Lịch sử đã xử lý', closedList.length],
        ] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === k
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label} <span className={tab === k ? 'text-white/70' : 'text-slate-400'}>{n}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-10 text-center text-sm text-slate-400">Đang tải…</p>
      ) : loadError ? (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 py-14 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
          <p className="mt-3 font-bold text-rose-800">Không tải được dữ liệu</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-rose-700">{loadError}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-bold text-slate-700">
            {tab === 'open' ? 'Không có khiếu nại nào đang chờ' : 'Chưa có khiếu nại nào từng xảy ra'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {tab === 'open'
              ? 'Mọi hoá đơn điện/nước đều đang được khách chấp nhận.'
              : 'Khiếu nại đã kết luận sẽ được lưu lại ở đây để tra cứu.'}
          </p>
          <p className="mt-4 text-xs text-slate-400">Đã quét <b>{rows.length}</b> khiếu nại</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {list.map(d => (
            <DisputeCard
              key={d.id}
              d={d}
              open={tab === 'open'}
              onResolve={() => setTarget(d)}
              onZoom={(url, caption) => setZoom({ url, caption })}
            />
          ))}
        </div>
      )}

      {target && (
        <ResolveDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); }}
        />
      )}

      {zoom && <Lightbox {...zoom} onClose={() => setZoom(null)} />}
    </div>
  );
};

// ── Một thẻ khiếu nại ────────────────────────────────────────────────────────
const DisputeCard = ({ d, open, onResolve, onZoom }: {
  d: AdminInvoiceDispute;
  open: boolean;
  onResolve: () => void;
  onZoom: (url: string, caption: string) => void;
}) => {
  const days = daysSince(d.createdAt);
  const gap = readingGap(d);
  const electric = isElectric(d);
  const unit = electric ? 'kWh' : 'm³';
  const Icon = electric ? Zap : Droplets;

  /** Ảnh của HỆ THỐNG: nguyên căn là tờ hoá đơn gốc, chia phòng là mặt đồng hồ. */
  const systemPhotoLabel = d.wholeHouse
    ? `Hoá đơn ${electric ? 'EVN' : 'nước'} admin đã tải lên`
    : 'Ảnh đồng hồ quản lý chụp';

  return (
    <div className={`rounded-2xl border bg-white shadow-sm ${open ? 'border-rose-200' : 'border-slate-200'}`}>
      {/* ── Đầu thẻ: ai · nhà nào · bao nhiêu tiền ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${open ? 'text-rose-500' : 'text-slate-400'}`} />
            <p className="font-bold text-slate-900">{d.tenantName ?? '(chưa có tên)'}</p>

            {open ? (days !== null && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                days >= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                treo {days} ngày
              </span>
            )) : (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                d.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700'
                : d.status === 'REJECTED' ? 'bg-slate-200 text-slate-600'
                : 'bg-slate-100 text-slate-500'}`}>
                {d.status === 'ACCEPTED' ? 'Đã công nhận sai'
                  : d.status === 'REJECTED' ? 'Đã bác khiếu nại'
                  : 'Khách tự rút'}
              </span>
            )}

            {/* Nguyên căn = nghi ngờ phát hành nhầm nhà; chia phòng = nghi ngờ đọc nhầm số.
                Hai hướng điều tra khác hẳn nhau nên phải phân biệt ngay từ đầu thẻ. */}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              d.wholeHouse ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'}`}>
              {d.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {d.propertyName}{d.roomNumber ? ` · Phòng ${d.roomNumber}` : ''} · {d.invoiceCode}
            {d.billingPeriod ? ` · kỳ ${d.billingPeriod}` : ''}
            {d.tenantPhone ? ` · ${d.tenantPhone}` : ''}
          </p>
          {!!d.managerName && !d.wholeHouse && (
            <p className="mt-0.5 text-xs text-slate-400">Quản lý đọc số: {d.managerName}</p>
          )}
        </div>

        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Số tiền</p>
          <p className="text-xl font-extrabold text-slate-900">{formatCurrency(d.amount)}</p>
          {d.invoiceStatus === 'PAID' && (
            /* Đã trả rồi thì công nhận sai KHÔNG đủ — còn phải hoàn hoặc trừ kỳ sau.
               Nhắc ngay đây để admin không kết luận xong rồi quên mất phần tiền. */
            <p className="mt-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              Khách đã thanh toán
            </p>
          )}
        </div>
      </div>

      {/* ── Lời khách + việc cần kiểm ── */}
      <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-600">
            <Flag className="h-3.5 w-3.5" />
            {REASON_LABEL[d.reason]} · {fmtDate(d.createdAt)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">
            {d.note || '(không ghi nội dung)'}
          </p>
          {/* Gợi ý việc phải làm — người phân xử không phải tự nhớ mỗi lý do thì soi cái gì. */}
          <p className="mt-3 border-t border-rose-200 pt-2 text-xs leading-relaxed text-rose-700">
            <b>Cần kiểm:</b> {REASON_CHECK[d.reason]}
          </p>
        </div>

        {/* ── Số liệu hệ thống ── */}
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Số liệu trên hoá đơn
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            {d.prevReading != null && d.newReading != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Chỉ số</dt>
                <dd className="font-mono font-bold text-slate-900">
                  {d.prevReading} → {d.newReading}
                </dd>
              </div>
            )}
            {d.consumption != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Lượng tính tiền</dt>
                <dd className="font-mono font-bold text-slate-900">{d.consumption} {unit}</dd>
              </div>
            )}
            {d.unitPrice != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Đơn giá</dt>
                <dd className="font-mono font-bold text-slate-900">
                  {d.unitPrice.toLocaleString('vi-VN')}đ/{unit}
                </dd>
              </div>
            )}
            {!!d.billingAddress && (
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Địa chỉ trên hoá đơn</dt>
                <dd className="text-right font-semibold text-slate-900">{d.billingAddress}</dd>
              </div>
            )}
            {!!d.propertyAddress && (
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Địa chỉ căn nhà</dt>
                <dd className="text-right font-semibold text-slate-900">{d.propertyAddress}</dd>
              </div>
            )}
            {!!d.customerCode && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Mã khách hàng</dt>
                <dd className="font-mono font-bold text-slate-900">{d.customerCode}</dd>
              </div>
            )}
          </dl>

          {/* Phép trừ tự làm sẵn — dấu hiệu rõ nhất của đọc nhầm mặt đồng hồ. */}
          {gap !== null && (
            <p className="mt-2 rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700">
              ⚠️ Hiệu hai chỉ số lệch {gap > 0 ? '+' : ''}{gap} {unit} so với lượng đang
              tính tiền — nhiều khả năng khách đúng.
            </p>
          )}
        </div>
      </div>

      {/* ── Ảnh: hệ thống vs khách, đặt cạnh nhau để so ── */}
      {(!!d.meterImageUrl || !!d.utilityBillImageUrl || !!d.photos?.length) && (
        <div className="grid gap-4 border-t border-slate-100 px-6 py-4 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Bằng chứng của hệ thống
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.meterImageUrl ? (
                <Thumb url={d.meterImageUrl} caption={systemPhotoLabel}
                  sub={d.meterCapturedAt ? fmtDateTime(d.meterCapturedAt) : undefined}
                  onZoom={onZoom} />
              ) : (
                /* Không có ảnh thì gần như tự động thắng cho khách — BE đã bắt buộc phải
                   có ảnh mới cho phát hành (METER_PHOTO_REQUIRED), thiếu là bất thường. */
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Hoá đơn này KHÔNG có ảnh chỉ số
                </p>
              )}
              {/* Ảnh hoá đơn tổng chỉ có nghĩa với nhà chia phòng — nguyên căn thì nó
                  trùng làm một với ảnh trên. */}
              {!d.wholeHouse && !!d.utilityBillImageUrl && (
                <Thumb url={d.utilityBillImageUrl} caption="Hoá đơn tổng cả nhà" onZoom={onZoom} />
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ảnh khách gửi kèm
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.photos?.length
                ? d.photos.map((p, i) => (
                    <Thumb key={p} url={p} caption={`Ảnh khách #${i + 1}`} onZoom={onZoom} />
                  ))
                : <p className="text-sm text-slate-400">Khách không gửi ảnh</p>}
            </div>
          </div>
        </div>
      )}

      {open ? (
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onResolve}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
            Kết luận khiếu nại
          </button>
        </div>
      ) : (
        /* Đã khép thì KHÔNG có nút — tránh mở lại một vụ đã kết luận. */
        <div className="border-t border-slate-100 px-6 py-3">
          <p className="text-xs text-slate-500">
            {d.resolvedAt
              ? `${d.resolvedByName ?? 'Quản trị viên'} kết luận ngày ${fmtDate(d.resolvedAt)}`
              : 'Khách tự rút yêu cầu'}
            {d.replacementInvoiceCode ? ` · hoá đơn thay thế ${d.replacementInvoiceCode}` : ''}
          </p>
          {!!d.resolutionNote && (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">
              Căn cứ: {d.resolutionNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Thumb = ({ url, caption, sub, onZoom }: {
  url: string; caption: string; sub?: string;
  onZoom: (url: string, caption: string) => void;
}) => (
  <button type="button" onClick={() => onZoom(url, caption)}
    className="group w-32 shrink-0 text-left">
    <img src={url} alt={caption}
      className="h-24 w-32 rounded-lg border border-slate-200 bg-slate-50 object-cover transition group-hover:border-indigo-400" />
    <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-600">{caption}</p>
    {!!sub && <p className="text-[10px] text-slate-400">{sub}</p>}
  </button>
);

/**
 * Xem ảnh cỡ lớn.
 *
 * Bắt buộc phải có, không thể chỉ mở tab mới: cả vụ khiếu nại xoay quanh việc đọc cho
 * ra con số trên mặt đồng hồ, mà ở cỡ thumbnail thì không đọc nổi.
 */
const Lightbox = ({ url, caption, onClose }: {
  url: string; caption: string; onClose: () => void;
}) => (
  <Overlay>
    <div onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-6">
      <img src={url} alt={caption}
        onClick={e => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-lg object-contain" />
      <p className="text-sm font-semibold text-white/80">
        {caption} · <a href={url} target="_blank" rel="noreferrer" className="underline"
          onClick={e => e.stopPropagation()}>mở ảnh gốc</a> · bấm nền để đóng
      </p>
    </div>
  </Overlay>
);

// ── Kết luận ─────────────────────────────────────────────────────────────────
const ResolveDialog = ({ row, onClose, onDone }: {
  row: AdminInvoiceDispute; onClose: () => void; onDone: () => void;
}) => {
  const [outcome, setOutcome] = useState<InvoiceDisputeOutcome | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Số ĐÚNG admin nhập khi công nhận khách đúng — điền sẵn số cũ để chỉ phải sửa ô sai.
   * Chuỗi chứ không phải number: ô rỗng trong lúc gõ mà ép về 0 thì thành tiền nhảy loạn.
   */
  const [fix, setFix] = useState({
    prev: String(row.prevReading ?? ''),
    next: String(row.newReading ?? ''),
    unit: String(row.unitPrice ?? ''),
  });

  const num = (s: string) => Number(String(s).replace(/[^\d.]/g, ''));
  const fixPrev = num(fix.prev), fixNext = num(fix.next), fixUnit = num(fix.unit);
  const fixConsumption = fixNext - fixPrev;
  const fixAmount = fixConsumption > 0 && fixUnit > 0 ? Math.round(fixConsumption * fixUnit) : 0;
  /** Có đủ ba số và hợp lệ thì mới gửi kèm — xem `DisputeCorrection`. */
  const fixValid = fixPrev >= 0 && fixNext > fixPrev && fixUnit > 0;
  /** Không đổi gì so với hoá đơn hiện tại → khỏi gửi, tránh ghi đè bằng chính nó. */
  const fixChanged = fixValid && fixAmount !== Math.round(row.amount ?? 0);

  const submit = async () => {
    if (!outcome) return toast.error('Chọn kết luận trước.');
    if (note.trim().length < 10) {
      return toast.error('Ghi rõ căn cứ (ít nhất 10 ký tự) — khách sẽ đọc được nội dung này.');
    }
    if (outcome === 'ACCEPTED' && !fixValid) {
      return toast.error('Nhập đủ chỉ số cũ / mới / đơn giá, và chỉ số mới phải lớn hơn chỉ số cũ.');
    }
    setBusy(true);
    try {
      await invoiceDisputeService.resolve(row.id, {
        outcome,
        note: note.trim(),
        // BE chỉ áp dụng khi có ĐỦ cụm ba số — gửi thiếu là nó bỏ qua lặng lẽ.
        ...(outcome === 'ACCEPTED' && fixChanged
          ? { correctedPrevReading: fixPrev, correctedNewReading: fixNext, correctedUnitPrice: fixUnit }
          : {}),
      });
      toast.success(outcome === 'ACCEPTED'
        ? (fixChanged ? 'Đã sửa lại hoá đơn theo số đúng và báo cho khách.'
                      : 'Đã công nhận khiếu nại và báo cho khách.')
        : 'Đã bác khiếu nại và báo cho khách.');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không ghi nhận được kết luận.');
    } finally {
      setBusy(false);
    }
  };

  const electric = isElectric(row);
  const unitLabel = electric ? 'kWh' : 'm³';

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Kết luận khiếu nại hoá đơn</h3>
            <p className="mt-1 text-sm text-slate-500">
              {row.invoiceCode} · {row.tenantName ?? '—'} · {formatCurrency(row.amount)}
            </p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
            {/*
              Hai lối ra, tách rõ HỆ QUẢ. Không dùng dropdown: đây là quyết định có hậu quả
              tiền bạc, người bấm phải đọc được cả hai phương án cùng lúc rồi mới chọn.
            */}
            <div className="space-y-3">
              <button type="button" onClick={() => setOutcome('ACCEPTED')}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  outcome === 'ACCEPTED' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Khách đúng — hoá đơn sai
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Nhập số đúng ở dưới, hệ thống <b>sửa thẳng hoá đơn này</b> — giữ nguyên mã,
                  không phát hành bản khác.
                  {row.invoiceStatus === 'PAID' && (
                    <> Khách <b>đã thanh toán</b>, phần chênh sẽ tự trừ vào kỳ sau.</>
                  )}
                </p>
              </button>

              <button type="button" onClick={() => setOutcome('REJECTED')}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  outcome === 'REJECTED' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <XCircle className="h-4 w-4 text-rose-600" /> Bác khiếu nại — hoá đơn đúng
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Ảnh và chỉ số khớp. Hoá đơn giữ nguyên, hạn thanh toán chạy lại và khách
                  được <b>cộng thêm 3 ngày</b> để trả — không phạt vì đã đi hỏi.
                </p>
              </button>
            </div>

            {/* Ô nhập số ĐÚNG — chỉ hiện khi công nhận khách đúng.
                Không có ô "thành tiền": để admin gõ tay thành tiền là mở đường cho con số
                không khớp với chỉ số ngay cạnh nó, đúng loại mâu thuẫn khiếu nại này sinh
                ra để sửa. Hệ thống tự nhân, hiện ngay bên dưới để đối chiếu. */}
            {outcome === 'ACCEPTED' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  Số đúng của hoá đơn này
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    { key: 'prev' as const, label: 'Chỉ số cũ', suffix: unitLabel },
                    { key: 'next' as const, label: 'Chỉ số mới', suffix: unitLabel },
                    { key: 'unit' as const, label: 'Đơn giá', suffix: '₫' },
                  ]).map(f => (
                    <label key={f.key} className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{f.label}</span>
                      <div className="relative">
                        <input
                          inputMode="decimal"
                          value={fix[f.key]}
                          onChange={e => setFix(s => ({ ...s, [f.key]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 pr-9 text-sm font-bold tabular-nums outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                          {f.suffix}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-emerald-200 pt-2.5">
                  <span className="text-xs font-semibold text-slate-600">
                    {fixValid
                      ? <>Tiêu thụ <b className="tabular-nums">{fixConsumption.toLocaleString('vi-VN')}</b> {unitLabel} × {fixUnit.toLocaleString('vi-VN')}₫</>
                      : <span className="text-rose-600">Chỉ số mới phải lớn hơn chỉ số cũ, đơn giá phải &gt; 0</span>}
                  </span>
                  {fixValid && (
                    <span className="text-sm font-black tabular-nums text-emerald-700">
                      {formatCurrency(fixAmount)}
                    </span>
                  )}
                </div>

                {fixValid && (
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    {!fixChanged
                      ? 'Bằng đúng số cũ — hoá đơn giữ nguyên, chỉ ghi nhận khách khiếu nại đúng.'
                      : fixAmount < Math.round(row.amount ?? 0)
                        ? <>Giảm <b className="text-emerald-700">{formatCurrency(Math.round(row.amount ?? 0) - fixAmount)}</b> so với hoá đơn hiện tại
                            {row.invoiceStatus === 'PAID' && ' — phần này trừ vào kỳ sau.'}</>
                        : <>Tăng <b className="text-amber-700">{formatCurrency(fixAmount - Math.round(row.amount ?? 0))}</b> so với hoá đơn hiện tại
                            {row.invoiceStatus === 'PAID' && ' — khách còn thiếu phần chênh, hạn thu được gia hạn.'}</>}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Căn cứ kết luận <span className="text-rose-500">*</span>
              </label>
              {/* Bắt buộc ghi lý do: gửi thẳng cho khách đọc, nên phải giải trình được. */}
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder={outcome === 'ACCEPTED'
                  ? 'VD: Đã phóng to ảnh đồng hồ, chỉ số thật là 1250 chứ không phải 1750 như đã ghi. Đã sửa lại hoá đơn theo số đúng.'
                  : 'VD: Ảnh đồng hồ chụp ngày 05/08 đọc rõ 1750, khớp với chỉ số cuối kỳ trên hoá đơn. Địa chỉ trên hoá đơn EVN đúng là căn khách đang thuê.'} />
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-400">
                <Camera className="mt-0.5 h-3 w-3 shrink-0" />
                Nội dung này hiện thẳng trên app của khách và lưu vào lịch sử hoá đơn.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-slate-200 px-7 py-4">
            <button onClick={onClose} disabled={busy}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Huỷ
            </button>
            <button onClick={submit} disabled={busy || !outcome}
              className="flex-[2] rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
              {busy ? 'Đang lưu…' : 'Ghi nhận kết luận'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
};

export default UtilityDisputes;
