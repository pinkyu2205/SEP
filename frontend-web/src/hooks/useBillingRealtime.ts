import { useEffect, useRef } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';

/**
 * Realtime hoá đơn chuyển PAID — STOMP over native WebSocket.
 *
 * BE: `WebSocketConfig` mở endpoint `/ws` (KHÔNG có SockJS), auth bằng JWT ở header
 * STOMP `CONNECT`, đẩy theo user vào `/user/queue/billing`. ADMIN nhận mọi hoá đơn PAID,
 * MANAGER chỉ nhận nhà mình quản lý — FE không phải lọc lại.
 *
 * Từ BE `276b613` (12/08/2026) cả hoá đơn onboard (`HD-ONBOARD-*`) và tiền nhà chu kỳ
 * đầu cũng bắn event này.
 *
 * ⚠️ Payload KHÔNG có số tiền (chính sách ẩn tiền khỏi manager) — dùng để đổi trạng
 * thái dòng hoặc gọi refetch, đừng mong lấy `grandTotal` từ đây.
 */

export interface BillingRealtimeEvent {
  event: 'INVOICE_PAID' | string;
  invoiceId: number;
  invoiceCode?: string;
  invoiceType?: string;
  status?: string;
  propertyName?: string;
  roomNumber?: string;
  tenantName?: string;
  paymentMethod?: string;
  transactionId?: string;
  paidAt?: string;
}

/**
 * `VITE_API_URL` là http(s) → đổi sang ws(s). Để trống (dev dùng proxy Vite) thì lấy
 * origin hiện tại; lúc đó `vite.config.ts` phải proxy `/ws` với `ws: true`, không thì
 * kết nối rơi vào dev-server thay vì backend.
 */
const resolveWsUrl = (): string => {
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
};

/**
 * @param onEvent chạy mỗi khi có event. Giữ tham chiếu qua ref nên truyền hàm inline
 *                cũng không làm kết nối dựng lại — nếu để `onEvent` vào deps thì mỗi
 *                lần component render lại là một lần ngắt/nối WebSocket.
 * @param enabled false (vd chưa đăng nhập) thì không kết nối.
 */
export const useBillingRealtime = (
  onEvent: (event: BillingRealtimeEvent) => void,
  enabled = true,
) => {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem('access_token');
    if (!token || token === 'mock-jwt-token-demo') return;

    const client = new Client({
      brokerURL: resolveWsUrl(),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      // Mặc định stompjs log ra console mỗi frame — ồn và lộ token trong header CONNECT.
      debug: () => {},
      onConnect: () => {
        client.subscribe('/user/queue/billing', (message: IMessage) => {
          try {
            handlerRef.current(JSON.parse(message.body) as BillingRealtimeEvent);
          } catch {
            // Frame lỗi định dạng — bỏ qua, không để một message hỏng giết cả kết nối.
          }
        });
      },
    });

    client.activate();
    return () => {
      void client.deactivate();
    };
  }, [enabled]);
};
