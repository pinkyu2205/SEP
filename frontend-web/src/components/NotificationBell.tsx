import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Loader2, Radio, RefreshCw } from 'lucide-react';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';
import type { AppNotificationDto } from '@/services/notification.service';

/**
 * KHAY THÔNG BÁO (chuông) — dùng chung cho cổng Admin và cổng Host.
 *
 * Trước 13/08/2026: chuông bên Admin chỉ là cái icon trỏ sang trang nhật ký bảo mật,
 * không có dữ liệu gì; bên Host có badge nhưng chỉ đếm MỘT LẦN lúc mở trang, mở app
 * cả buổi cũng không đổi số. Giờ cả hai dùng chung `useRealtimeNotifications` nên số
 * tự cập nhật, và bấm vào là đọc được nội dung tại chỗ, không phải chuyển trang.
 *
 * Nhãn "Trực tiếp / Tự làm mới" là cố ý cho người dùng thấy: đang nhận đẩy thật (SSE)
 * hay đang tự hỏi lại theo nhịp. Không giấu, để lúc BE bật SSE thì biết nó đã chạy.
 */

const fmtWhen = (iso?: string) => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  return new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Màu theo mức độ — loại nào chứa OVERDUE/QUÁ HẠN thì đỏ, còn lại trung tính. */
const toneOf = (type: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('OVERDUE')) return 'border-l-rose-500';
  if (t.includes('REMINDER') || t.includes('DUE')) return 'border-l-amber-500';
  return 'border-l-slate-300';
};

export const NotificationBell = ({
  /** Trang xem tất cả — khác nhau giữa admin và host. */
  seeAllTo,
  /** Chỉ hiện các loại này. Bỏ trống = tất cả. */
  types,
  accent = 'green',
}: {
  seeAllTo: string;
  types?: string[];
  accent?: 'green' | 'red';
}) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { items, unreadCount: listUnread, loading, mode, refresh, markRead, markAllRead } =
    useRealtimeNotifications(types);

  /**
   * Số trên badge lấy từ CONTEXT, không từ danh sách trong khay.
   *
   * Hai chỗ đang đếm hai nguồn khác nhau: khay chỉ đọc bảng `notifications`, còn trang
   * thông báo (và badge sidebar bên host) gộp thêm `host_notifications`. Để badge tự
   * đếm thì chuông hiện trống trong khi trang báo hàng chục việc đang chờ — người dùng
   * tưởng chuông hỏng. Context đã gộp sẵn hai nguồn nên lấy thẳng từ đó cho khớp.
   *
   * `|| listUnread` để phòng context chưa kịp nạp (count = 0) mà khay đã có dữ liệu.
   */
  const { count: badgeCount, refresh: refreshBadge } = useUnreadNotifications();
  const unreadCount = badgeCount || listUnread;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ring = accent === 'red' ? 'focus:ring-brand-red-200' : 'focus:ring-brand-green-200';

  const onRowClick = (n: AppNotificationDto) => {
    // Đánh dấu đã đọc phải làm mới CẢ badge của context, không thì số trên chuông
    // đứng yên trong khi dòng trong khay đã mất chấm xanh.
    if (!n.read) markRead(n.id).then(refreshBadge);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Thông báo"
        className={`relative rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 ${ring}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">Thông báo</span>
              {/* Cho người dùng biết số đang tới bằng đường nào. */}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  mode === 'sse' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
                title={mode === 'sse'
                  ? 'Máy chủ đang đẩy thông báo tới ngay khi có'
                  : 'Tự hỏi lại máy chủ mỗi 20 giây'}
              >
                {mode === 'sse'
                  ? <><Radio className="h-2.5 w-2.5" /> Trực tiếp</>
                  : <><RefreshCw className="h-2.5 w-2.5" /> Tự làm mới</>}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { refresh(); refreshBadge(); }}
                title="Tải lại"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead().then(refreshBadge)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Check className="h-3 w-3" /> Đọc hết
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-slate-200" />
                <p className="mt-2 text-sm text-slate-400">Chưa có thông báo nào.</p>
              </div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onRowClick(n)}
                  className={`flex w-full gap-2 border-b border-l-4 border-slate-50 px-3 py-2.5 text-left transition last:border-b-0 ${toneOf(n.type)} ${
                    n.read ? 'bg-white hover:bg-slate-50' : 'bg-sky-50/60 hover:bg-sky-50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5">
                      <span className={`flex-1 text-[13px] leading-snug ${n.read ? 'font-semibold text-slate-600' : 'font-bold text-slate-900'}`}>
                        {n.title}
                      </span>
                      {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                    </span>
                    {n.content && (
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">{n.content}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-slate-400">{fmtWhen(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link
            to={seeAllTo}
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2.5 text-center text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            Xem tất cả
          </Link>
        </div>
      )}
    </div>
  );
};
