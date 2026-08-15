import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { hostService } from '@/services/host.service';
import { notificationService } from '@/services/notification.service';
import { useWebAuth } from '@/auth/WebAuthContext';

/**
 * Badge chuông thông báo cho web (host + admin).
 *
 * Đếm GỘP hai nguồn vì BE lưu ở hai bảng khác nhau:
 *   • `notifications`      — thông báo nghiệp vụ do cron/service bắn (nhắc hạn, quá hạn,
 *                            khách đã thanh toán, cần chụp công tơ…). CÓ realtime qua SSE.
 *   • `host_notifications` — nhắc việc riêng của host (căn chờ duyệt giá, HĐ chờ duyệt,
 *                            master lease sắp hết hạn). KHÔNG có event, phải poll.
 *
 * Trước 13/08/2026 chỗ này chỉ đếm `host_notifications`, nên nối SSE vào cũng vô ích:
 * event bắn từ bảng `notifications` mà badge lại đọc bảng kia — số không bao giờ nhúc nhích.
 */

/** Nhịp poll cho nguồn host (BE không có event cho bảng này). */
const HOST_POLL_MS = 60_000;

interface UnreadContextValue {
  count: number;
  /** Gọi lại sau khi đánh dấu đã đọc để badge cập nhật ngay. */
  refresh: () => void;
}

const UnreadContext = createContext<UnreadContextValue>({ count: 0, refresh: () => {} });

export const UnreadNotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useWebAuth();
  const [appUnread, setAppUnread] = useState(0);
  const [hostUnread, setHostUnread] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  /**
   * `allSettled` chứ không phải `all`: một nguồn lỗi (BE chưa bật endpoint, host
   * notifications 500 — xem docs/BE-HANDOFF-host-notifications-500) thì vẫn hiện được
   * số của nguồn còn lại, thay vì badge tụt về 0 và người dùng tưởng hết việc.
   */
  const refresh = useCallback(async () => {
    const [app, host] = await Promise.allSettled([
      notificationService.unreadCount(),
      hostService.getUnreadCount(),
    ]);
    if (app.status === 'fulfilled') setAppUnread(Number(app.value?.count) || 0);
    if (host.status === 'fulfilled') setHostUnread(Number(host.value) || 0);
  }, []);

  // Nạp lần đầu + poll nguồn host. Chạy lại khi đổi tài khoản để không giữ số của
  // người đăng nhập trước.
  useEffect(() => {
    if (!user) {
      setAppUnread(0);
      setHostUnread(0);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), HOST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [user, refresh]);

  /**
   * SSE cho nguồn `notifications` — BE `GET /api/v1/notifications/stream` (commit d12a5b5).
   *
   * Token đi bằng QUERY PARAM chứ không phải header: `EventSource` của trình duyệt
   * không cho set header, nên BE đọc `?token=` riêng cho đúng path này (JwtFilter).
   * Kèm hệ quả: token nằm trong URL, sẽ vào access log của server/proxy.
   *
   * Không tự dựng lại kết nối bằng tay — `EventSource` tự reconnect khi đứt. Tài khoản
   * demo offline dùng token giả sẽ lỗi liên tục, nên đóng luôn để khỏi retry vô tận.
   */
  useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    if (!user) return;

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const base = import.meta.env.VITE_API_URL || '';
    const es = new EventSource(
      `${base}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`,
    );
    esRef.current = es;

    es.addEventListener('notification', () => void refresh());
    es.onerror = () => {
      // EventSource tự thử lại; chỉ đóng hẳn khi server đã chốt kết nối (CLOSED).
      if (es.readyState === EventSource.CLOSED) {
        esRef.current = null;
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [user, refresh]);

  return (
    <UnreadContext.Provider value={{ count: appUnread + hostUnread, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
};

export const useUnreadNotifications = () => useContext(UnreadContext);
