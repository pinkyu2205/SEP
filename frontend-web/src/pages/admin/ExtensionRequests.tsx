import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarPlus, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import {
  extensionRequestService, EXTENSION_STATUS_META,
  type AdminExtensionRequest,
} from '@/services/extensionRequest.service';
import { SectionShell, EmptyState } from './shared';
import { HistoryList } from './HistoryList';
import { refreshAdminBadges } from '@/utils/adminBadges';
import { ExtensionRequestRow, toggleInSet } from '@/components/contract/ExtensionRequestRow';

// ══════════════════════════════════════════════════════════════════════════════
// Đơn xin gia hạn hợp đồng — admin duyệt.
//
// Vì sao admin chứ không phải quản lý: thứ quyết định gia hạn được hay không là hợp đồng
// của công ty với chủ nhà còn bao lâu, mà quan hệ đó quản lý không nắm. Xem đầu
// `services/extensionRequest.service.ts`.
//
// Gia hạn KHÔNG đổi giá — chỉ kéo dài thời gian ở. Nên màn này không có ô nhập tiền nào,
// và cũng không cần: duyệt là dời `endDate`, hết.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

export const ExtensionRequests = () => {
  const [rows, setRows] = useState<AdminExtensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  /** Đơn đang mở hộp từ chối. */
  const [rejecting, setRejecting] = useState<AdminExtensionRequest | null>(null);
  /** Id đang gửi lệnh — chặn bấm hai lần vào cùng một đơn. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Lấy TẤT CẢ rồi tự chia tab: hai tab luôn cần số đếm của nhau, hỏi hai lần là
      // hai lần chờ mạng cho một thứ dùng chung.
      setRows(await extensionRequestService.list());
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Cũ nhất lên đầu: đơn gửi lâu nhất là đơn sắp tự đóng nhất.
  const openList = useMemo(
    () => rows.filter(r => r.status === 'PENDING')
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [rows],
  );
  /** Đơn nào đang mở chi tiết — mặc định thu gọn hết (xem ExtensionRequestRow). */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const closedList = useMemo(() => rows.filter(r => r.status !== 'PENDING'), [rows]);

  const approve = async (r: AdminExtensionRequest) => {
    setBusyId(r.id);
    try {
      await extensionRequestService.approve(r.id);
      refreshAdminBadges();
      toast.success(`Đã gia hạn hợp đồng thêm ${r.months} tháng.`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không duyệt được đơn.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionShell
      title="Đơn xin gia hạn hợp đồng"
      subtitle="Khách xin ở thêm. Duyệt là dời ngày kết thúc — giá thuê giữ nguyên, không đổi gì khác."
      icon={CalendarPlus}
      action={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Làm mới
        </button>
      }
    >
      <div className="mt-1 flex gap-2">
        {([
          ['open', 'Chờ duyệt', openList.length],
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
        <p className="mt-10 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Đang tải đơn…
        </p>
      ) : error ? (
        <div className="mt-6"><EmptyState text="Không tải được danh sách đơn. Bấm Làm mới để thử lại." /></div>
      ) : tab === 'open' ? (
        openList.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-16 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-bold text-slate-700">Không có đơn nào chờ duyệt</p>
            <p className="mt-1 text-sm text-slate-400">
              Đơn khách gửi sẽ hiện ở đây. Đơn treo quá 7 ngày sẽ tự đóng và hợp đồng chạy tiếp
              luồng hết hạn.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {openList.map(r => (
              <ExtensionRequestRow
                key={r.id}
                r={r}
                expanded={expanded.has(r.id)}
                onToggle={() => setExpanded(prev => toggleInSet(prev, r.id))}
              >
                <RequestCard
                  r={r}
                  bare
                  busy={busyId === r.id}
                  onApprove={() => approve(r)}
                  onReject={() => setRejecting(r)}
                />
              </ExtensionRequestRow>
            ))}
          </div>
        )
      ) : (
        /* Lịch sử chỉ tăng, không giảm → mỗi đơn một dòng, bấm mới mở. Xem `HistoryList`. */
        <HistoryList
          searchPlaceholder="Tìm theo tên khách, SĐT, tên nhà…"
          emptyText="Không có đơn nào khớp từ khoá."
          rows={closedList.map(r => ({
            key: r.id,
            title: r.tenantFullName ?? '(chưa có tên)',
            subtitle: [
              r.propertyName,
              r.roomNumber ? `P.${r.roomNumber}` : 'Nguyên căn',
              `xin ${r.months} tháng`,
            ].filter(Boolean).join(' · '),
            status: EXTENSION_STATUS_META[r.status],
            date: fmtDate(r.reviewedAt ?? r.createdAt),
            search: [r.tenantFullName, r.tenantPhone, r.propertyName, r.roomNumber, r.contractCode]
              .filter(Boolean).join(' '),
            detail: () => <div className="p-3"><RequestCard r={r} readOnly /></div>,
          }))}
        />
      )}

      {rejecting && (
        <RejectDialog
          row={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); void load(); refreshAdminBadges(); }}
        />
      )}
    </SectionShell>
  );
};

/** Thẻ một đơn — dùng cho cả tab chờ duyệt lẫn phần mở rộng của lịch sử. */
const RequestCard = ({ r, busy, readOnly, bare = false, onApprove, onReject }: {
  r: AdminExtensionRequest;
  busy?: boolean;
  readOnly?: boolean;
  /** Bỏ viền + đầu thẻ — dùng trong `ExtensionRequestRow`, nơi dòng thu gọn đã là đầu thẻ. */
  bare?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) => {
  const meta = EXTENSION_STATUS_META[r.status];
  return (
    <div className={bare ? 'bg-slate-50/40' : 'rounded-2xl border border-slate-200 bg-white shadow-sm'}>
      {bare && !!r.tenantPhone && (
        <p className="px-6 pt-4 text-xs text-slate-500">
          SĐT khách: <b className="text-slate-700">{r.tenantPhone}</b>
        </p>
      )}
      {!bare && (
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-slate-900">{r.tenantFullName ?? '(chưa có tên)'}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[
              r.propertyName,
              r.roomNumber ? `Phòng ${r.roomNumber}` : 'Nguyên căn',
              r.contractCode,
              r.tenantPhone,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Xin thêm</p>
          <p className="text-2xl font-extrabold text-slate-900">{r.months} tháng</p>
          {!!r.newEndDate && (
            <p className="text-xs text-slate-500">→ {fmtDate(r.newEndDate)}</p>
          )}
        </div>
      </div>
      )}

      <div className="grid gap-4 px-6 py-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Khách nhắn · {fmtDate(r.createdAt)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {r.note || '(không ghi gì)'}
          </p>
        </div>

        {/*
          Ý kiến quản lý — thứ admin KHÔNG tự biết được: khách có nợ treo không, phòng có
          bị phàn nàn không. Đây là ghi chú nội bộ, máy chủ đã xoá khỏi bản trả cho khách.
        */}
        <div className={`rounded-xl border p-4 ${
          r.managerNote ? 'border-sky-200 bg-sky-50' : 'border-dashed border-slate-200'}`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Ý kiến quản lý
          </p>
          {r.managerNote ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-sky-900">
              {r.managerNote}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              Quản lý chưa góp ý. Họ nắm tình hình khách rõ hơn — cân nhắc hỏi trước khi duyệt.
            </p>
          )}
        </div>
      </div>

      {!!r.rejectReason && (
        <div className="border-t border-slate-100 px-6 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Lý do từ chối</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.rejectReason}</p>
        </div>
      )}

      {!readOnly && r.status === 'PENDING' && (
        <div className="flex flex-wrap gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onApprove}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Duyệt gia hạn {r.months} tháng
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" /> Từ chối
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Hộp từ chối — lý do BẮT BUỘC.
 *
 * Khách đọc nguyên văn câu này, và đây là lần cuối họ được trả lời trước khi hợp đồng
 * kết thúc. Từ chối không kèm lý do là để khách nhận một cánh cửa đóng sập không giải thích.
 */
const RejectDialog = ({ row, onClose, onDone }: {
  row: AdminExtensionRequest; onClose: () => void; onDone: () => void;
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 10) {
      return toast.error('Ghi rõ lý do (ít nhất 10 ký tự) — khách sẽ đọc được nội dung này.');
    }
    setBusy(true);
    try {
      await extensionRequestService.reject(row.id, reason);
      toast.success('Đã từ chối đơn và báo cho khách.');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Không ghi nhận được.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
          <div className="border-b border-slate-200 px-7 py-5">
            <h3 className="text-lg font-bold text-slate-900">Từ chối đơn gia hạn</h3>
            <p className="mt-1 text-sm text-slate-500">
              {row.tenantFullName} · xin thêm {row.months} tháng
            </p>
          </div>

          <div className="px-7 py-5">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Lý do <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="VD: Căn nhà đã có kế hoạch sửa chữa từ tháng sau nên không nhận gia hạn. Rất tiếc và cảm ơn anh/chị đã ở cùng chúng tôi."
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Khách đọc nguyên văn câu này. Hợp đồng sẽ kết thúc đúng hạn cũ.
            </p>
          </div>

          <div className="flex gap-3 border-t border-slate-200 px-7 py-4">
            <button onClick={onClose} disabled={busy}
              className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Huỷ
            </button>
            <button onClick={submit} disabled={busy}
              className="flex-[2] rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50">
              {busy ? 'Đang lưu…' : 'Từ chối đơn'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
};

export default ExtensionRequests;
