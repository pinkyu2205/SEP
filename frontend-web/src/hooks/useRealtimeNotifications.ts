import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';
import { notificationService, type AppNotificationDto } from '@/services/notification.service';
import { hostService } from '@/services/host.service';

/**
 * THÔNG BÁO REALTIME — dùng chung cho cổng Admin và cổng Host.
 *
 * ─── Vì sao viết theo kiểu "tự nâng cấp" ──────────────────────────────────────
 * BE hiện KHÔNG có kênh đẩy (13/08/2026: dò `/notifications/stream`, `/ws`,
 * `/sse/notifications`… đều 403; toàn bộ web lẫn mobile không có một dòng
 * EventSource/WebSocket nào). Nên realtime thật phải chờ BE.
 *
 * Hook này chạy được NGAY hôm nay bằng POLLING, và TỰ CHUYỂN sang SSE khi BE dựng
 * xong endpoint — không phải sửa lại một dòng UI nào. Cụ thể: mở `EventSource` trước;
 * kết nối được thì dùng luôn và tắt polling; lỗi/không có thì im lặng rơi về polling.
 *
 * ─── Vì sao polling là đủ dùng ────────────────────────────────────────────────
 * Người dùng cảm nhận "realtime" ở mức vài giây, không phải mili-giây. Poll 20s khi
 * tab đang mở, DỪNG HẲN khi tab bị ẩn, và refresh ngay khi quay lại tab — nên vừa
 * giống realtime vừa không bắn request rác lúc không ai nhìn.
 *
 * ⚠️ EventSource KHÔNG gửi được header `Authorization`. BE phải nhận token qua query
 * param `?token=`. Xem doc/BE-HANDOFF-realtime-notifications-2026-08-13.md.
 */

/** Nhịp poll khi tab đang hiển thị. Tab ẩn thì không poll. */
const POLL_MS = 20_000;

/** Bao nhiêu thông báo tải về cho khay chuông. */
const PAGE_SIZE = 20;

// `SSE_PATH` và `apiBase` đã bỏ 13/08/2026 — kết nối SSE nay do
// `UnreadNotificationsContext` giữ, hook này chỉ nghe tín hiệu từ đó.

export type RealtimeMode = 'sse' | 'polling';

export interface RealtimeNotifications {
  items: AppNotificationDto[];
  unreadCount: number;
  loading: boolean;
  /** 'sse' = BE đang đẩy thật; 'polling' = tự hỏi lại theo nhịp. */
  mode: RealtimeMode;
  refresh: () => void;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useRealtimeNotifications = (
  /** Lọc theo loại thông báo. Bỏ trống = lấy tất cả. */
  types?: string[],
): RealtimeNotifications => {
  const [items, setItems] = useState<AppNotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<RealtimeMode>('polling');

  // Giữ trong ref để interval/SSE không phải tạo lại mỗi lần state đổi.
  const typesRef = useRef(types);
  typesRef.current = types;

  /**
   * Đọc CẢ HAI nguồn, giống hệt badge và trang "Xem tất cả".
   *
   * ─── Vì sao ──────────────────────────────────────────────────────────────
   * Hệ thống có hai bảng thông báo: `notifications` (sự kiện gửi cho một người) và
   * `host_notifications` (hàng việc còn tồn: căn chờ duyệt giá, HĐ chờ duyệt…).
   *
   * Badge lấy TỔNG hai nguồn (`UnreadNotificationsContext` = appUnread + hostUnread) và
   * trang "Xem tất cả" cũng gộp cả hai. Riêng khay chuông trước đây chỉ đọc nguồn thứ
   * nhất — nên chuông báo "9+" mà mở ra thì "Chưa có thông báo nào". Đúng cái hiểu nhầm
   * mà việc gộp badge sinh ra để tránh, chỉ là lộn ngược đầu.
   *
   * Một nguồn hỏng thì vẫn hiện nguồn kia (`allSettled`) — thà thiếu còn hơn trống trơn.
   */
  const load = useCallback(async () => {
    try {
      const [appRes, hostRes] = await Promise.allSettled([
        notificationService.list({ size: PAGE_SIZE }),
        hostService.listNotifications({ page: 0, size: PAGE_SIZE }),
      ]);

      const appRows: AppNotificationDto[] =
        appRes.status === 'fulfilled' ? (appRes.value?.content ?? []) : [];

      // `host_notifications` khác tên field — quy về cùng một shape để khay chỉ có
      // một đường vẽ. `id` để âm: hai bảng đánh số độc lập nên id trùng nhau là
      // chuyện thường, đụng id là bấm đọc cái này lại xoá chấm đỏ của cái kia.
      const hostRows: AppNotificationDto[] =
        hostRes.status === 'fulfilled'
          ? (hostRes.value?.content ?? []).map(h => ({
              id: -Math.abs(Number(h.id) || 0),
              title: h.title,
              content: h.message,
              type: h.type,
              read: h.isRead,
              createdAt: h.createdAt,
            }))
          : [];

      // Cả hai nguồn cùng hỏng → GIỮ danh sách cũ, đừng xoá trắng khay.
      if (appRes.status === 'rejected' && hostRes.status === 'rejected') return;

      const rows = [...appRows, ...hostRows]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      const filtered = typesRef.current?.length
        ? rows.filter(n => typesRef.current!.includes(n.type))
        : rows;
      setItems(filtered);
      setUnreadCount(filtered.filter(n => !n.read).length);
    } catch {
      // BE lỗi/mạng rớt: GIỮ danh sách cũ. Xoá trắng khay chuông vì một request hỏng
      // làm người dùng tưởng thông báo đã biến mất.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * ── Kênh đẩy: DÙNG NHỜ SSE CỦA `UnreadNotificationsContext` ────────────────
   *
   * Trước 13/08/2026 hook này tự mở `EventSource` riêng tới cùng endpoint mà context
   * đã mở → MỖI PHIÊN 2 KẾT NỐI tới `/notifications/stream` (dev còn nhân đôi nữa vì
   * StrictMode), BE phải giữ gấp đôi số emitter mà chẳng thêm thông tin gì.
   *
   * Nay chỉ context giữ kết nối. Số chưa đọc của context đổi = có thông báo mới →
   * hook tải lại danh sách. Một kết nối, một nguồn sự thật.
   */
  const { count: unreadSignal } = useUnreadNotifications();
  const firstSignal = useRef(true);
  useEffect(() => {
    // Bỏ qua lần đầu: `load()` ở trên đã chạy rồi, gọi thêm là thừa một request.
    if (firstSignal.current) { firstSignal.current = false; return; }
    setMode('sse');
    load();
  }, [unreadSignal, load]);

  // ── Polling — chỉ chạy khi CHƯA có SSE và tab đang hiển thị ───────────────
  useEffect(() => {
    if (mode === 'sse') return;

    let timer: number | undefined;
    const start = () => {
      stop();
      timer = window.setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load();   // quay lại tab là thấy số mới ngay, không đợi hết nhịp
        start();
      } else {
        stop();   // tab ẩn thì ngừng hẳn, đừng bắn request lúc không ai nhìn
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', load);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', load);
    };
  }, [mode, load]);

  const markRead = useCallback(async (id: number) => {
    // Cập nhật lạc quan: bấm vào là mất chấm đỏ ngay, không đợi server trả lời.
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount(c => Math.max(0, c - 1));
    try {
      // id âm = dòng của `host_notifications` (xem `load`) — phải gọi đúng endpoint
      // của bảng đó, gọi nhầm sang `/notifications/{id}` là 404 hoặc tệ hơn: đánh dấu
      // đã đọc nhầm một thông báo khác cùng số.
      if (id < 0) await hostService.markNotificationRead(String(Math.abs(id)));
      else await notificationService.markRead(id);
    } catch {
      load(); // hỏng thì lấy lại sự thật từ server
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      // Đánh dấu ở CẢ HAI bảng, không thì "Đọc hết" xong badge vẫn còn số của bảng kia.
      await Promise.allSettled([
        notificationService.markAllRead(),
        hostService.markAllNotificationsRead(),
      ]);
    } catch {
      load();
    }
  }, [load]);

  return { items, unreadCount, loading, mode, refresh: load, markRead, markAllRead };
};
