import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from 'lucide-react';
import { normalizeVi } from '@/utils/helpers';
import { refreshAdminBadges } from '@/utils/adminBadges';
import { SectionShell, StatusPill, EmptyState } from '../shared';
import type { KindConfig, PublishedBill } from './kinds';
import { ReadingProgress } from './ReadingProgress';
import { fmtBillPeriod, fmtDateTime, fmtNum, fmtVnd } from './ui';

const PER_PAGE = 10;

type StatusFilter = 'all' | 'published' | 'revoked';

const unitPriceOf = (cfg: KindConfig, b: PublishedBill) =>
  Math.round(b.unitPrice ?? cfg.unitPrice(b.totalAmount, b.totalQuantity));

/**
 * BẢNG ĐÃ PHÁT HÀNH của kỳ đang xem — kèm chi tiết từng tờ và thu hồi.
 *
 * Cột tiến độ đứng giữa bảng vì nó là thứ duy nhất KHÁC NHAU giữa các dòng (xem
 * `ReadingProgress`); ba con số của tờ giấy gộp vào một cột vì chúng là một phép chia.
 * Thu hồi luôn đi qua hộp xác nhận — trước đây trang nước bấm icon là thu hồi luôn.
 */
export const PublishedBillsSection = ({
  cfg, month, year, bills, loading, error, onChanged, onZoom,
}: {
  cfg: KindConfig;
  month: number;
  year: number;
  bills: PublishedBill[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
  onZoom: (url: string) => void;
}) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<PublishedBill | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PublishedBill | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = normalizeVi(search.trim());
    return bills
      .filter((b) => {
        if (status === 'published' && b.status === 'REVOKED') return false;
        if (status === 'revoked' && b.status !== 'REVOKED') return false;
        if (!q) return true;
        return normalizeVi(`${b.propertyName ?? ''} ${b.billingPeriod ?? ''}`).includes(q);
      })
      // Mới phát hành lên đầu — vừa bấm gửi xong không phải đi tìm dòng của mình.
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [bills, search, status]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const paged = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // Đổi bộ lọc / đổi kỳ mà đang đứng trang 5 thì bảng trống trơn — kéo về trang 1.
  useEffect(() => { setPage(1); }, [search, status, month, year]);

  const doRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await cfg.revoke(revokeTarget.id);
      setRevokeTarget(null);
      onChanged();
      refreshAdminBadges();
    } catch (e: any) {
      setRevokeError(e?.response?.data?.message || e?.message || 'Không thu hồi được.');
    } finally {
      setRevoking(false);
    }
  };

  const activeCount = bills.filter((b) => b.status !== 'REVOKED').length;

  return (
    <>
      <SectionShell
        title={`Đã phát hành — kỳ ${month}/${year}`}
        subtitle={`Các nhà đã có hoá đơn ${cfg.noun} của kỳ. Bấm một dòng để xem ảnh gốc và chi tiết.`}
        icon={cfg.icon}
        action={bills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Tìm nhà hoặc kỳ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {([
              { key: 'all', label: `Tất cả ${bills.length}` },
              { key: 'published', label: `Hiệu lực ${activeCount}` },
              { key: 'revoked', label: `Đã thu hồi ${bills.length - activeCount}` },
            ] as { key: StatusFilter; label: string }[]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                  status === t.key ? cfg.accent.chipOn : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : undefined}
      >
        {loading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </p>
        ) : error ? (
          <p className="flex items-start gap-1.5 py-6 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        ) : bills.length === 0 ? (
          <EmptyState text={`Chưa phát hành hoá đơn ${cfg.noun} nào cho kỳ ${month}/${year}.`} />
        ) : visible.length === 0 ? (
          // Lọc không ra KHÁC HẲN chưa phát hành gì — nói chung một câu thì tưởng mất dữ liệu.
          <EmptyState text="Không có hoá đơn nào khớp bộ lọc." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-bold">Nhà · kỳ</th>
                  <th className="pb-2 pr-3 text-right font-bold">Số liệu tờ hoá đơn</th>
                  <th className="pb-2 pr-3 font-bold">Tiến độ gửi khách</th>
                  <th className="pb-2 pr-3 font-bold">Phát hành</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {paged.map((b) => {
                  const revoked = b.status === 'REVOKED';
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetail(b)}
                      className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${revoked ? 'opacity-50' : ''}`}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          {b.imageUrl
                            ? <img src={b.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover" />
                            : <div className="h-9 w-9 shrink-0 rounded border border-dashed border-slate-200" />}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">
                              {b.propertyName ?? `#${b.propertyId}`}
                              {revoked && (
                                <span className="ml-2 align-middle">
                                  <StatusPill label="Đã thu hồi" color="bg-slate-200 text-slate-600" />
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-400">{fmtBillPeriod(b.billingPeriod)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right">
                        <p className="font-bold tabular-nums text-slate-800">{fmtVnd(b.totalAmount)}</p>
                        <p className="text-xs tabular-nums text-slate-400">
                          {fmtNum(b.totalQuantity)} {cfg.unit} ·{' '}
                          <span className={`font-bold ${cfg.accent.text}`}>{fmtVnd(unitPriceOf(cfg, b))}/{cfg.unit}</span>
                        </p>
                      </td>
                      <td className="py-3 pr-3"><ReadingProgress bill={b} /></td>
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {fmtDateTime(b.createdAt)}
                        {b.createdBy ? ` · ${b.createdBy}` : ''}
                      </td>
                      <td className="py-3 text-right">
                        {/* Thu hồi là việc MỘT CHIỀU và hiếm khi đúng — một icon mờ, rê vào
                            mới rõ, thay vì nút viền đỏ to bằng mọi dòng mời bấm nhầm. */}
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

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  <b className="text-slate-700">{(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, visible.length)}</b>
                  {' '}trên <b className="text-slate-700">{visible.length}</b> hoá đơn
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Trước
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`min-w-[32px] rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                        p === page ? cfg.accent.chipOn : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sau <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SectionShell>

      {/* ── Chi tiết một tờ đã phát hành ── */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold text-slate-900">
                  {detail.propertyName ?? `Nhà #${detail.propertyId}`}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">Kỳ {fmtBillPeriod(detail.billingPeriod)}</p>
              </div>
              {detail.status === 'REVOKED'
                ? <StatusPill label="Đã thu hồi" color="bg-slate-200 text-slate-600" />
                : <StatusPill label="Đang hiệu lực" color="bg-emerald-100 text-emerald-700" />}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tiêu thụ</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
                  {fmtNum(detail.totalQuantity)} <span className="text-xs text-slate-400">{cfg.unit}</span>
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tổng tiền</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-800">{fmtVnd(detail.totalAmount)}</p>
              </div>
              <div className={`rounded-xl border p-3 ${cfg.accent.soft}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">Đơn giá</p>
                <p className="mt-1 text-lg font-black tabular-nums">{fmtVnd(unitPriceOf(cfg, detail))}</p>
              </div>
            </div>

            {/* Nhà nguyên căn kỳ đầu: khách chỉ trả phần từ lúc dọn vào — nói rõ chia thế nào. */}
            {detail.companyBornQuantity != null && Number(detail.companyBornQuantity) > 0 && (
              <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
                Khách trả <b>{fmtNum(Number(detail.billedToTenantQuantity ?? 0))} {cfg.unit}</b>, công ty chịu{' '}
                <b>{fmtNum(Number(detail.companyBornQuantity))} {cfg.unit}</b> (quãng trước khi khách dọn vào).
              </p>
            )}

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Phát hành lúc</span>
                <span className="font-semibold text-slate-800">{fmtDateTime(detail.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Người phát hành</span>
                <span className="font-semibold text-slate-800">{detail.createdBy ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Tiến độ gửi khách</span>
                <ReadingProgress bill={detail} />
              </div>
            </div>

            <p className="mb-1.5 mt-4 text-sm font-bold text-slate-700">Ảnh hoá đơn gốc</p>
            {detail.imageUrl ? (
              <button
                type="button"
                onClick={() => onZoom(detail.imageUrl!)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200"
              >
                <img src={detail.imageUrl} alt="Hoá đơn gốc" className="max-h-80 w-full bg-slate-50 object-contain" />
              </button>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                Bản ghi này phát hành không kèm ảnh.
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Xác nhận thu hồi ──
          Hộp riêng thay `window.confirm`: hộp của trình duyệt không nói được đang thu hồi tờ
          NÀO và hậu quả ra sao, lại khoá cả tab. */}
      {revokeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => !revoking && setRevokeTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-100 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold text-slate-900">Thu hồi {cfg.paperName}?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Đơn giá của tờ này thôi được dùng. Máy chủ không cho thu hồi nếu đã có hoá đơn
                  gửi tới khách trong kỳ.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold text-slate-800">{revokeTarget.propertyName ?? `Nhà #${revokeTarget.propertyId}`}</p>
              <p className="text-slate-500">Kỳ {fmtBillPeriod(revokeTarget.billingPeriod)}</p>
              <p className="tabular-nums text-slate-500">
                {fmtNum(revokeTarget.totalQuantity)} {cfg.unit} · {fmtVnd(revokeTarget.totalAmount)} ·{' '}
                {fmtVnd(unitPriceOf(cfg, revokeTarget))}/{cfg.unit}
              </p>
            </div>

            {revokeError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{revokeError}</p>
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
    </>
  );
};
