import { useEffect, useRef, useState } from 'react';
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
 * ─── BA LỚP ĐỂ BẢNG LUÔN TỰ CẬP NHẬT ─────────────────────────────────────────
 *
 * WebSocket một mình là chưa đủ, và ta đã trả giá cho chuyện đó: nginx trên VPS không
 * chuyển tiếp header `Upgrade` nên STOMP chưa từng kết nối được ở môi trường thật —
 * client cứ thử lại mỗi 5 giây trong im lặng, event phát ra lúc chưa nối là mất luôn
 * (STOMP không replay), còn người dùng chỉ thấy "phải F5 mới đổi". Không một dòng log
 * nào cho biết realtime đang chết.
 *
 * Nên hook này nay có ba lớp, xếp theo độ tức thì:
 *
 *  1. **WebSocket** — có event là gọi `onRefresh` ngay (dưới 1 giây).
 *  2. **Poll dự phòng** — chỉ chạy khi WS CHƯA nối được, nhịp `pollMs` (mặc định 20s).
 *     Nối được thì tự tắt. Nhờ vậy hạ tầng có hỏng thì màn hình vẫn đúng, chỉ chậm hơn.
 *  3. **Quay lại tab** — mỗi lần tab được hiện lại thì nạp một lần, vì trong lúc tab ẩn
 *     ta cố tình không poll (đỡ request rác) nên dữ liệu có thể đã cũ.
 *
 * `connected` trả ra để UI nói thật với người dùng đang ở lớp nào (xem `RealtimeBadge`),
 * thay vì để họ tự đoán tại sao số không nhảy.
 *
 * @param arg  hàm nhận event (dạng cũ), hoặc object cấu hình đầy đủ.
 */
export interface UseBillingRealtimeOptions {
  /** Gọi khi CẦN NẠP LẠI: có event thật, hết nhịp poll, hoặc vừa quay lại tab. */
  onRefresh?: () => void;
  /** Gọi riêng khi có event thật — dùng cho toast, vì poll không có event để hiện. */
  onEvent?: (event: BillingRealtimeEvent) => void;
  /** false (vd chưa đăng nhập) thì không kết nối, không poll. */
  enabled?: boolean;
  /** Nhịp poll khi WS chưa nối được. 0 = tắt hẳn lớp dự phòng. */
  pollMs?: number;
}

export interface BillingRealtimeState {
  /** true = đang nhận đẩy thật qua WebSocket. false = đang chạy bằng poll dự phòng. */
  connected: boolean;
}

const DEFAULT_POLL_MS = 20_000;

/**
 * Nạp lại BAO NHIÊU LẦN sau một event, cách nhau bao lâu (ms).
 *
 * Vì sao không nạp một lần: BE bắn event **trước khi commit** transaction —
 * `TenantBillingServiceImpl.saveAndPublishPaidInvoice` gọi `publishInvoicePaid` ngay sau
 * `repository.save()`, mà cả hai nằm trong `@Transactional markInvoicePaidByPayosOrderCode`.
 * Nên FE nhận event chỉ vài ms sau `save`, nạp lại lúc đó thì query (kết nối khác) vẫn
 * đọc được BẢN CHƯA COMMIT = trạng thái cũ. Kết quả: toast "Vừa thanh toán" hiện đúng
 * mà dòng trong bảng vẫn "Chờ thanh toán" cho tới lần nạp sau (đổi tab, poll).
 *
 * Nạp thêm ở 1.2s và 3.5s là đủ phủ độ trễ commit thực tế mà không thành spam.
 * Sửa gốc là ở BE: publish sau commit — xem doc/BE-BUG-realtime-publish-truoc-commit.
 */
const SETTLE_DELAYS_MS = [1_200, 3_500];

export const useBillingRealtime = (
  arg: ((event: BillingRealtimeEvent) => void) | UseBillingRealtimeOptions,
  /** Chỉ dùng với dạng gọi cũ `useBillingRealtime(fn, enabled)`. */
  enabledLegacy = true,
): BillingRealtimeState => {
  const opts: UseBillingRealtimeOptions = typeof arg === 'function'
    ? { onEvent: arg, onRefresh: undefined, enabled: enabledLegacy }
    : arg;
  const enabled = opts.enabled ?? true;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  const [connected, setConnected] = useState(false);

  // Giữ callback trong ref: truyền hàm inline cũng không làm dựng lại kết nối. Nếu để
  // callback vào deps thì mỗi lần component render là một lần ngắt/nối WebSocket.
  /** Hẹn giờ nạp lại sau event — clear khi unmount để không setState trên component đã chết. */
  const settleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    settleTimers.current.forEach(clearTimeout);
    settleTimers.current = [];
  }, []);

  const onEventRef = useRef(opts.onEvent);
  const onRefreshRef = useRef(opts.onRefresh);
  onEventRef.current = opts.onEvent;
  onRefreshRef.current = opts.onRefresh;

  // ── Lớp 1: WebSocket ──
  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const client = new Client({
      brokerURL: resolveWsUrl(),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      // Mặc định stompjs log ra console mỗi frame — ồn và lộ token trong header CONNECT.
      debug: () => {},
      onConnect: () => {
        setConnected(true);
        // Nạp lại ngay khi (re)connect: khoảng thời gian mất kết nối có thể đã có
        // thanh toán mà ta không nghe được — STOMP không gửi lại event cũ.
            // Nạp ngay + nạp lại vài nhịp nữa (xem SETTLE_DELAYS_MS).
            onRefreshRef.current?.();
            SETTLE_DELAYS_MS.forEach((ms) => {
              settleTimers.current.push(setTimeout(() => onRefreshRef.current?.(), ms));
            });
        client.subscribe('/user/queue/billing', (message: IMessage) => {
          try {
            const event = JSON.parse(message.body) as BillingRealtimeEvent;
            onEventRef.current?.(event);
            onRefreshRef.current?.();
          } catch {
            // Frame lỗi định dạng — bỏ qua, không để một message hỏng giết cả kết nối.
          }
        });
      },
      onWebSocketClose: () => setConnected(false),
      onStompError: () => setConnected(false),
    });

    client.activate();
    return () => {
      setConnected(false);
      void client.deactivate();
    };
  }, [enabled]);

  // ── Lớp 2: poll dự phòng, CHỈ khi WS chưa nối ──
  useEffect(() => {
    if (!enabled || connected || pollMs <= 0) return;
    if (!onRefreshRef.current) return;
    const tick = () => {
      // Tab ẩn thì không hỏi — lớp 3 lo lúc quay lại.
      if (document.visibilityState === 'visible') onRefreshRef.current?.();
    };
    const t = setInterval(tick, pollMs);
    return () => clearInterval(t);
  }, [enabled, connected, pollMs]);

  // ── Lớp 3: quay lại tab ──
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') onRefreshRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);

  return { connected };
};
