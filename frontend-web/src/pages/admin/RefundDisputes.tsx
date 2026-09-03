import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { HistoryList } from './HistoryList';
import { formatCurrency } from '@/utils';
import {
  checkoutAdminService,
  type AdminCheckoutRequest,
  type DisputeOutcome,
} from '@/services/checkoutAdmin.service';

// ══════════════════════════════════════════════════════════════════════════════
// Khiếu nại hoàn cọc — admin phân xử.
//
// Vì sao màn này thuộc ADMIN chứ không phải host: khiếu nại là lời tố của khách
// NHẮM VÀO HOST ("tôi chưa nhận được tiền anh nói đã chuyển"). Để host tự bác lời
// tố nhắm vào mình thì cơ chế đối chứng mất sạch ý nghĩa. BE cũng gác
// `@PreAuthorize("hasRole('ADMIN')")` ở endpoint.
//
// Trước khi có màn này, khiếu nại treo vĩnh viễn: endpoint đã có nhưng không ai
// gọi được, khách thì thấy mãi dòng "đang tra soát".
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Khiếu nại ĐANG MỞ = khách đã báo chưa nhận · admin CHƯA kết luận · khách chưa xác nhận.
 *
 * Phải xét `refundDisputeResolvedAt` vì BE cố ý giữ nguyên `refundDisputedAt` sau khi xử lý
 * (để lưu lịch sử). Thiếu điều kiện này thì khiếu nại đã kết luận vẫn nằm lại trong danh
 * sách chờ, admin bấm xử lý bao nhiêu lần cũng không biến mất.
 */
const isOpenDispute = (r: AdminCheckoutRequest): boolean =>
  !!r.settlement?.refundDisputedAt
  && !r.settlement?.refundDisputeResolvedAt
  && !r.settlement?.refundConfirmedAt;

/**
 * Khiếu nại ĐÃ KHÉP — từng có tranh chấp và nay đã xong.
 *
 * Hai đường khép: admin kết luận (`refundDisputeResolvedAt`), hoặc khách tự xác nhận đã
 * nhận được tiền sau đó (`refundConfirmedAt`) — trường hợp thứ hai hay xảy ra khi tiền về
 * chậm vài tiếng rồi khách kiểm lại thấy có.
 */
const isClosedDispute = (r: AdminCheckoutRequest): boolean =>
  !!r.settlement?.refundDisputedAt && !isOpenDispute(r);

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

/** Số ngày kể từ lúc khách khiếu nại — càng lâu càng phải xử gấp. */
const daysSince = (iso?: string): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
};

/**
 * Thẻ chi tiết một hồ sơ hoàn cọc.
 *
 * Tách khỏi vòng lặp để tab LỊCH SỬ dùng lại được: ở đó mỗi hồ sơ là một dòng gọn,
 * bấm mới dựng thẻ này ra. Xem `HistoryList` để biết vì sao hai tab phải khác nhau.
 */
const RefundCard = ({ r, open, onResolve }: {
  r: AdminCheckoutRequest; open: boolean; onResolve: () => void;
}) => {
  const s = r.settlement!;
  const days = daysSince(s.refundDisputedAt);
  return (
  <div className={`rounded-2xl border bg-white shadow-sm ${
    open ? 'border-rose-200' : 'border-slate-200'}`}>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-4 w-4 shrink-0 ${
            open ? 'text-rose-500' : 'text-slate-400'}`} />
          <p className="font-bold text-slate-900">{r.tenantFullName ?? '(chưa có tên)'}</p>
          {/* Số ngày treo: khiếu nại càng lâu càng dễ thành tranh chấp thật. */}
          {open ? (days !== null && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              days >= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              treo {days} ngày
            </span>
          )) : (
            /* Đã khép: nhãn nói KẾT QUẢ, vì đó mới là thứ người tra cứu cần thấy. */
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              s.refundConfirmedAt
                ? 'bg-emerald-100 text-emerald-700'
                : s.refundDisputeOutcome === 'RETRANSFERRED'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-200 text-slate-600'}`}>
              {s.refundConfirmedAt
                ? 'Khách đã xác nhận nhận đủ'
                : s.refundDisputeOutcome === 'RETRANSFERRED'
                  ? 'Đã chuyển lại'
                  : 'Đã bác khiếu nại'}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {r.propertyName}{r.roomNumber ? ` · Phòng ${r.roomNumber}` : ''} · {r.contractCode}
          {r.tenantPhone ? ` · ${r.tenantPhone}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tiền cọc</p>
        <p className="text-xl font-extrabold text-slate-900">
          {formatCurrency(s.depositAmount ?? 0)}
        </p>
      </div>
    </div>

    <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
      {/* Lời khách — đặt trước, vì đây là thứ cần xác minh. */}
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
          Khách phản ánh · {fmtDate(s.refundDisputedAt)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">
          {s.refundDisputeReason || '(không ghi nội dung)'}
        </p>
      </div>

      {/* Bằng chứng phía host — số tài khoản khách khai + biên lai đã tải. */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Chủ nhà khai đã chuyển · {fmtDate(s.refundPaidAt)}
        </p>
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-slate-600">
            Tài khoản khách khai:{' '}
            <span className="font-mono font-bold text-slate-900">
              {[r.refundBankName, r.refundBankAccount, r.refundAccountHolder]
                .filter(Boolean).join(' — ') || '(khách không điền)'}
            </span>
          </p>
          {s.refundProofUrl ? (
            <a href={s.refundProofUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline">
              📎 Xem ảnh biên lai
            </a>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Không có ảnh biên lai
            </p>
          )}
        </div>
      </div>
    </div>

    {open ? (
      <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
        <button onClick={() => onResolve()}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
          Kết luận khiếu nại
        </button>
      </div>
    ) : (
      /* Đã khép thì KHÔNG có nút — tránh mở lại một vụ đã kết luận. */
      <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
        {s.refundDisputeResolvedAt
          ? `Quản trị viên kết luận ngày ${fmtDate(s.refundDisputeResolvedAt)}`
          : s.refundConfirmedAt
            ? `Khách tự xác nhận đã nhận đủ ngày ${fmtDate(s.refundConfirmedAt)} — không cần phân xử`
            : 'Đã khép'}
      </p>
    )}
  </div>
  );
};

const RefundDisputes = () => {
  const [rows, setRows] = useState<AdminCheckoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AdminCheckoutRequest | null>(null);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  /**
   * Lỗi tải, giữ nguyên trên màn thay vì chỉ toast.
   *
   * Trang này lọc client-side nên 'gọi API hỏng' và 'không có khiếu nại nào' ra CÙNG một
   * màn hình trống — không phân biệt được. Toast thì tắt sau vài giây rồi mất dấu.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await checkoutAdminService.list());
    } catch (e: unknown) {
      const res = (e as { response?: { status?: number; data?: { message?: string } } })?.response;
      setRows([]);
      setLoadError(res?.status === 403
        ? 'Tài khoản này không có quyền xem hồ sơ trả phòng (403).'
        : res?.data?.message ?? `Không gọi được API${res?.status ? ` (lỗi ${res.status})` : ' — kiểm tra kết nối máy chủ'}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Đang chờ: cũ nhất lên đầu (treo lâu nhất = gấp nhất).
  const openList = useMemo(
    () => rows.filter(isOpenDispute)
      .sort((a, b) => (a.settlement?.refundDisputedAt ?? '').localeCompare(b.settlement?.refundDisputedAt ?? '')),
    [rows],
  );
  // Lịch sử: mới nhất lên đầu — tra cứu thì thường tìm vụ gần đây.
  const closedList = useMemo(
    () => rows.filter(isClosedDispute)
      .sort((a, b) => (b.settlement?.refundDisputedAt ?? '').localeCompare(a.settlement?.refundDisputedAt ?? '')),
    [rows],
  );
  const disputes = tab === 'open' ? openList : closedList;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Khiếu nại hoàn cọc</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Khách báo chưa nhận được tiền cọc dù chủ nhà đã ghi nhận đã chuyển.
            Đối chiếu sao kê rồi kết luận — chỉ quản trị viên xử lý được việc này.
          </p>
        </div>
        <button onClick={load}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      </div>

      {/* Hai tab: việc phải làm · và lịch sử để tra lại khi cần đối chứng về sau. */}
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
          <p className="mt-1 text-sm text-rose-700">{loadError}</p>
        </div>
      ) : disputes.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-bold text-slate-700">
            {tab === 'open' ? 'Không có khiếu nại nào đang chờ' : 'Chưa có khiếu nại nào từng xảy ra'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {tab === 'open'
              ? 'Mọi khoản hoàn cọc đều đã được khách xác nhận hoặc chưa phát sinh tranh chấp.'
              : 'Khiếu nại đã kết luận sẽ được lưu lại ở đây để tra cứu.'}
          </p>
          {/* Nói rõ đã quét bao nhiêu: 0 hồ sơ = API trả rỗng, còn >0 = lọc không ra ai. */}
          <p className="mt-4 text-xs text-slate-400">
            Đã quét <b>{rows.length}</b> hồ sơ trả phòng ·{' '}
            {rows.filter(r => !!r.settlement).length} hồ sơ có bảng quyết toán
          </p>
        </div>
      ) : tab === 'open' ? (
        // Đang chờ: vài hồ sơ, mỗi hồ sơ là một việc phải làm → bày hết chi tiết.
        <div className="mt-6 space-y-4">
          {disputes.map(r => (
            <RefundCard key={r.id} r={r} open onResolve={() => setTarget(r)} />
          ))}
        </div>
      ) : (
        /* Lịch sử: kho tra cứu chỉ tăng → mỗi hồ sơ MỘT DÒNG, bấm mới mở thẻ. */
        <HistoryList
          searchPlaceholder="Tìm theo tên khách, SĐT, tên nhà…"
          emptyText="Không có hồ sơ nào khớp từ khoá."
          rows={disputes.map(r => {
            const s = r.settlement!;
            return {
              key: r.id,
              icon: <ShieldAlert className="h-4 w-4 text-slate-400" />,
              title: r.tenantFullName ?? '(chưa có tên)',
              subtitle: [r.propertyName, r.roomNumber ? `P.${r.roomNumber}` : null]
                .filter(Boolean).join(' · '),
              status: s.refundDisputeResolvedAt
                ? { label: 'Đã phân xử', cls: 'bg-slate-200 text-slate-600' }
                : { label: 'Khách tự xác nhận', cls: 'bg-emerald-100 text-emerald-700' },
              amount: s.depositAmount ?? 0,
              date: fmtDate(s.refundDisputeResolvedAt ?? s.refundConfirmedAt),
              search: [r.tenantFullName, r.tenantPhone, r.propertyName, r.roomNumber]
                .filter(Boolean).join(' '),
              detail: () => (
                <div className="p-3">
                  <RefundCard r={r} open={false} onResolve={() => setTarget(r)} />
                </div>
              ),
            };
          })}
        />
      )}

      {target && (
        <ResolveDialog
          row={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); }}
        />
      )}
    </div>
  );
};

const ResolveDialog = ({ row, onClose, onDone }: {
  row: AdminCheckoutRequest; onClose: () => void; onDone: () => void;
}) => {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!outcome) return toast.error('Chọn kết luận trước.');
    if (note.trim().length < 10) {
      return toast.error('Ghi rõ căn cứ (ít nhất 10 ký tự) — nội dung này lưu vào nhật ký.');
    }
    setBusy(true);
    try {
      await checkoutAdminService.resolveDispute(row.id, { outcome, note: note.trim() });
      toast.success(outcome === 'RETRANSFERRED'
        ? 'Đã ghi nhận chuyển lại. Khách sẽ được mời xác nhận lần nữa.'
        : 'Đã bác khiếu nại và thông báo cho khách.');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không ghi nhận được kết luận.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="shrink-0 border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Kết luận khiếu nại hoàn cọc</h3>
            <p className="mt-1 text-sm text-slate-500">
              {row.tenantFullName} · {formatCurrency(row.settlement?.depositAmount ?? 0)}
            </p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
            {/*
              Hai lối ra, tách rõ hệ quả. Không dùng dropdown: đây là quyết định có hậu quả
              tiền bạc, người bấm phải đọc được cả hai phương án cùng lúc rồi mới chọn.
            */}
            <div className="space-y-3">
              <button type="button" onClick={() => setOutcome('RETRANSFERRED')}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  outcome === 'RETRANSFERRED'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Đã chuyển lại cho khách
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Tra ra tiền chưa đi hoặc đi nhầm số, đã chuyển bù. Hồ sơ quay lại bước
                  <b> chờ khách xác nhận</b> — khách vẫn phải tự bấm xác nhận đã nhận đủ.
                </p>
              </button>

              <button type="button" onClick={() => setOutcome('REJECTED')}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  outcome === 'REJECTED'
                    ? 'border-rose-500 bg-rose-50'
                    : 'border-slate-200 hover:bg-slate-50'}`}>
                <p className="flex items-center gap-2 font-bold text-slate-900">
                  <XCircle className="h-4 w-4 text-rose-600" /> Bác khiếu nại
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Có sao kê chứng minh tiền đã tới đúng tài khoản. Lịch sử khiếu nại vẫn được
                  giữ lại, và hệ thống <b>không</b> tự đánh dấu khách đã nhận.
                </p>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Căn cứ kết luận <span className="text-rose-500">*</span>
              </label>
              {/* Bắt buộc ghi lý do: đây là quyết định về tiền của người khác, phải giải trình được. */}
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="VD: Đối chiếu sao kê VCB ngày 20/08, giao dịch 11.200.000đ tới STK 1020902831 thành công lúc 14:32. Đã gửi khách ảnh sao kê." />
              <p className="mt-1.5 text-xs text-slate-400">
                Nội dung này gửi cho khách và lưu vào nhật ký tiền cọc.
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

export default RefundDisputes;
