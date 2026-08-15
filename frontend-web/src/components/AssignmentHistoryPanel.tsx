import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, History, Inbox, Loader2, X } from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import {
  zoneAssignmentService,
  type ZoneHandover,
  type UserAssignmentHistoryItem,
} from '@/services/zoneAssignment.service';

/**
 * Nút "Lịch sử phân công" + cửa sổ đè lên màn hình khi bấm.
 *
 * Dùng được ở hai chỗ với hai nguồn khác nhau:
 *   • `zoneId`  → `GET /zones/{zoneId}/handovers`            (lịch sử của MỘT khu vực)
 *   • `userId`  → `GET /users/{userId}/assignment-history`   (các mốc của MỘT tài khoản)
 *
 * Trước 15/08/2026 chỗ này là ô trống kèm ghi chú "BE chưa lưu vết". BE đã làm xong,
 * giờ đọc dữ liệu thật.
 *
 * z-index: modal để `z-[60]` vì phải nổi trên cả drawer chi tiết tài khoản (z-50).
 */

type Entry = {
  key: string;
  at?: string;
  title: string;
  from?: string | null;
  to?: string;
  by?: string;
  meta?: string;
};

const fmtAt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fromZoneHandover = (h: ZoneHandover): Entry => ({
  key: `z-${h.id}`,
  at: h.changedAt,
  title: h.fromManagerUsername ? 'Bàn giao khu vực' : 'Gán quản lý lần đầu',
  from: h.fromManagerUsername,
  to: h.toManagerUsername,
  by: h.changedByUsername,
  meta: [
    h.affectedProperties ? `${h.affectedProperties} nhà` : null,
    h.affectedContracts ? `${h.affectedContracts} hợp đồng` : null,
  ].filter(Boolean).join(' · '),
});

const fromUserHistory = (u: UserAssignmentHistoryItem, i: number): Entry => {
  const revoked = (u.action || '').toUpperCase() === 'REVOKED';
  return {
    key: `u-${i}-${u.zoneId}`,
    at: u.at ?? u.changedAt,
    title: revoked ? `Rời khu vực ${u.zoneName ?? ''}`.trim() : `Nhận khu vực ${u.zoneName ?? ''}`.trim(),
    by: u.byUsername ?? u.changedByUsername,
    meta: (u.properties ?? u.affectedProperties) ? `${u.properties ?? u.affectedProperties} nhà` : undefined,
  };
};

export const AssignmentHistoryButton = ({ subjectName, zoneId, userId, extraNote }: {
  /** Tên người/khu vực đang xem — hiện trên tiêu đề cửa sổ. */
  subjectName?: string;
  /** Truyền MỘT trong hai: khu vực hoặc tài khoản. */
  zoneId?: string;
  userId?: string;
  extraNote?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!zoneId && !userId) return;
    setLoading(true);
    setError(null);
    try {
      if (zoneId) {
        const rows = await zoneAssignmentService.handovers(zoneId);
        setEntries(rows.map(fromZoneHandover));
      } else {
        const rows = await zoneAssignmentService.userHistory(userId!);
        setEntries(rows.map(fromUserHistory));
      }
    } catch (e: any) {
      setEntries([]);
      setError(e?.response?.data?.message || e?.message || 'Không tải được lịch sử.');
    } finally {
      setLoading(false);
    }
  }, [zoneId, userId]);

  // Chỉ gọi API khi người dùng thực sự mở — đừng tải sẵn cho hàng chục dòng danh sách.
  useEffect(() => { if (open) load(); }, [open, load]);

  // Esc để đóng — modal không có ô nhập nên đây là đường thoát nhanh nhất.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700"
      >
        <History className="h-3.5 w-3.5" />
        Xem lịch sử phân công
      </button>

      {open && (
        <Overlay>
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            aria-label="Đóng"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
                  <History className="h-4 w-4 text-indigo-500" />
                  Lịch sử phân công
                </h3>
                {subjectName && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{subjectName}</p>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lịch sử…
                </div>
              ) : error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
                  <p className="text-sm font-bold text-rose-800">Không tải được lịch sử</p>
                  <p className="mt-1 text-xs text-rose-700">{error}</p>
                  <button
                    onClick={load}
                    className="mt-3 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    Thử lại
                  </button>
                </div>
              ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                  <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">Chưa có thay đổi nào</p>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                    Khu vực/tài khoản này chưa từng đổi phân công kể từ khi hệ thống bắt đầu lưu vết.
                  </p>
                </div>
              ) : (
                <ul>
                  {entries.map((e, i) => (
                    <li key={e.key} className="relative pb-4 pl-7 last:pb-0">
                      {i < entries.length - 1 && (
                        <span className="absolute bottom-0 left-[7px] top-5 w-px bg-slate-200" aria-hidden />
                      )}
                      <span className="absolute left-0 top-[7px] h-[15px] w-[15px] rounded-full bg-indigo-500 ring-[3px] ring-white" aria-hidden />

                      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{e.title}</p>
                          <span className="text-[11px] font-semibold text-slate-400">{fmtAt(e.at)}</span>
                        </div>

                        {e.to && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                            {e.from ? (
                              <>
                                <span className="text-slate-400">{e.from}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                              </>
                            ) : null}
                            <span className="font-semibold text-slate-800">{e.to}</span>
                          </p>
                        )}

                        <p className="mt-1 text-[11px] text-slate-400">
                          {e.meta ? `${e.meta} · ` : ''}{e.by ? `thực hiện bởi ${e.by}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {extraNote && !loading && (
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                  {extraNote}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100 px-6 py-3.5 text-right">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
        </Overlay>
      )}
    </>
  );
};
