import { useEffect, useState } from 'react';
import { History, Inbox, X } from 'lucide-react';
import { Overlay } from '@/components/Overlay';

/**
 * Nút "Lịch sử phân công" + cửa sổ (modal) đè lên màn hình khi bấm.
 *
 * Hiện chưa có dữ liệu: BE chưa lưu vết các lần đổi phân công quản lý khu vực
 * (xem doc/BE-NEED-zone-manager-assignment-2026-08-14.md). Cố tình để trống kèm lý do
 * thay vì dựng dữ liệu giả.
 *
 * Khi BE xong `GET /api/v1/users/{userId}/assignment-history`, thay phần thân modal
 * bằng danh sách mốc thật; hai cổng Admin và Host tự động cùng hiện vì dùng chung file này.
 *
 * z-index: modal để `z-[60]` vì nó phải nổi trên cả drawer chi tiết tài khoản (z-50).
 */
export const AssignmentHistoryButton = ({ subjectName, extraNote }: {
  /** Tên người đang xem — hiện trên tiêu đề cửa sổ. */
  subjectName?: string;
  extraNote?: string;
}) => {
  const [open, setOpen] = useState(false);

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

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* Trạng thái rỗng THẬT — không dựng mốc giả cho có */}
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Chưa có dữ liệu lịch sử</p>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                  Hệ thống <b>chưa lưu vết</b> các lần đổi phân công nên không hiện lại được
                  “trước đây phụ trách khu vực nào, đổi lúc nào”. Thông tin đang hiển thị ở màn
                  ngoài chỉ là <b>tình trạng hiện tại</b>.
                </p>
              </div>

              {extraNote && (
                <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
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
