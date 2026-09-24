import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, RefreshCw, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import {
  extensionRequestService, EXTENSION_STATUS_META,
  type AdminExtensionRequest,
} from '@/services/extensionRequest.service';
import { SectionShell, EmptyState } from '@/pages/admin/shared';
import { HistoryList } from '@/pages/admin/HistoryList';
import { ExtensionRequestRow, toggleInSet } from '@/components/contract/ExtensionRequestRow';

// ══════════════════════════════════════════════════════════════════════════════
// Đơn xin gia hạn — cổng HOST, CHỈ ĐỌC.
//
// Host xem chứ không duyệt: máy chủ mở `GET /admin/extension-requests` cho
// `hasAnyRole('ADMIN','OWNER')`, còn `approve` / `reject` vẫn chỉ `ADMIN`. Màn này bám
// đúng ranh giới đó — không có nút hành động nào, và cũng không nên có.
//
// Vì sao host vẫn cần thấy: thứ quyết định gia hạn được hay không là **hợp đồng của công
// ty với chủ nhà còn bao lâu** — quan hệ đó là của host. Thấy đơn nào đang chờ thì host
// còn chủ động đi gia hạn hợp đồng gốc trước khi trần chạm đáy.
// ══════════════════════════════════════════════════════════════════════════════

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

export const ExtensionRequestsHost = () => {
  const [rows, setRows] = useState<AdminExtensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
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
  const pending = useMemo(
    () => rows.filter(r => r.status === 'PENDING')
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [rows],
  );
  /** Đơn nào đang mở chi tiết — mặc định thu gọn hết (xem ExtensionRequestRow). */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const closed = useMemo(() => rows.filter(r => r.status !== 'PENDING'), [rows]);

  return (
    <SectionShell
      title="Đơn xin gia hạn hợp đồng"
      subtitle="Khách xin ở thêm. Quản trị viên là người duyệt — bạn theo dõi để còn chủ động gia hạn hợp đồng với chủ nhà."
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
      {loading ? (
        <p className="mt-10 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Đang tải đơn…
        </p>
      ) : error ? (
        <div className="mt-6"><EmptyState text="Không tải được danh sách đơn. Bấm Làm mới để thử lại." /></div>
      ) : (
        <>
          {/* Đơn đang chờ đứng riêng phía trên: đó là thứ có thể cần host hành động
              (gia hạn hợp đồng gốc), phần còn lại chỉ để tra cứu. */}
          <div className="mt-2">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Đang chờ quản trị viên duyệt · {pending.length}
            </h3>

            {pending.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white py-12 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
                <p className="mt-2 font-bold text-slate-700">Không có đơn nào đang chờ</p>
                <p className="mt-1 text-sm text-slate-400">
                  Đơn khách gửi sẽ hiện ở đây. Đơn treo quá 7 ngày sẽ tự đóng.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {pending.map(r => (
                  <ExtensionRequestRow
                    key={r.id}
                    r={r}
                    expanded={expanded.has(r.id)}
                    onToggle={() => setExpanded(prev => toggleInSet(prev, r.id))}
                  >
                    <div className="grid gap-3 bg-slate-50/40 px-6 py-4 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Khách nhắn · {fmtDate(r.createdAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.note || '(không ghi gì)'}</p>
                      </div>
                      <div className={`rounded-xl border p-4 ${
                        r.managerNote ? 'border-sky-200 bg-sky-50' : 'border-dashed border-slate-200 bg-white'}`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Ý kiến quản lý
                        </p>
                        <p className={`mt-1 whitespace-pre-wrap text-sm ${r.managerNote ? 'text-sky-900' : 'text-slate-400'}`}>
                          {r.managerNote || 'Quản lý chưa góp ý.'}
                        </p>
                      </div>
                      {!!r.newEndDate && (
                        <p className="text-sm text-slate-600 md:col-span-2">
                          Nếu được duyệt, hợp đồng kéo dài tới <b className="text-slate-900">{fmtDate(r.newEndDate)}</b>
                          {' '}— kiểm tra hợp đồng gốc với chủ nhà còn đủ hạn không.
                        </p>
                      )}
                    </div>
                  </ExtensionRequestRow>
                ))}

                {/* Việc duy nhất host có thể làm với đơn đang chờ — nói thẳng ra thay vì
                    để họ đi tìm nút duyệt không tồn tại trên cổng này. */}
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Bạn không duyệt đơn ở đây — quản trị viên làm việc đó. Nếu khách xin dài
                    hơn thời hạn hợp đồng của công ty với chủ nhà, hãy gia hạn hợp đồng gốc
                    trước; số tháng khách được xin sẽ tự nới theo.
                  </span>
                </p>
              </div>
            )}
          </div>

          {closed.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Đã xử lý
              </h3>
              <HistoryList
                searchPlaceholder="Tìm theo tên khách, tên nhà…"
                emptyText="Không có đơn nào khớp từ khoá."
                rows={closed.map(r => ({
                  key: r.id,
                  title: r.tenantFullName ?? '(chưa có tên)',
                  subtitle: [
                    r.propertyName,
                    r.roomNumber ? `P.${r.roomNumber}` : 'Nguyên căn',
                    `xin ${r.months} tháng`,
                  ].filter(Boolean).join(' · '),
                  status: EXTENSION_STATUS_META[r.status],
                  date: fmtDate(r.reviewedAt ?? r.createdAt),
                  search: [r.tenantFullName, r.propertyName, r.roomNumber, r.contractCode]
                    .filter(Boolean).join(' '),
                  detail: () => (
                    <div className="space-y-3 p-4 text-sm">
                      {!!r.newEndDate && (
                        <p className="text-slate-600">
                          Hạn mới nếu duyệt: <b className="text-slate-900">{fmtDate(r.newEndDate)}</b>
                        </p>
                      )}
                      {!!r.note && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Khách nhắn</p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.note}</p>
                        </div>
                      )}
                      {!!r.managerNote && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ý kiến quản lý</p>
                          <p className="mt-1 whitespace-pre-wrap text-sky-900">{r.managerNote}</p>
                        </div>
                      )}
                      {!!r.rejectReason && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Lý do từ chối</p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.rejectReason}</p>
                        </div>
                      )}
                      {!!r.reviewedByName && (
                        <p className="text-xs text-slate-400">
                          {r.reviewedByName} xử lý ngày {fmtDate(r.reviewedAt)}
                        </p>
                      )}
                    </div>
                  ),
                }))}
              />
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
};

export default ExtensionRequestsHost;
