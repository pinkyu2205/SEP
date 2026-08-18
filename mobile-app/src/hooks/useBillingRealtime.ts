import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Client, type IMessage } from '@stomp/stompjs';
import { API_CONFIG } from '@/constants/api';
import { SESSION_KEYS } from '@/services/core/session';

/**
 * Realtime hoá đơn chuyển PAID — STOMP over native WebSocket (bản mobile).
 *
 * Bám đúng doc BE `BE-DONE-websocket-hoa-don-realtime-2026-08-15.md`:
 *   • endpoint `/ws`, KHÔNG dùng SockJS
 *   • auth bằng header `Authorization: Bearer` trong frame STOMP `CONNECT`
 *   • FE chỉ subscribe `/user/queue/billing`, không publish `/app/...`
 *
 * BE tự fan-out theo quyền (tenant của hoá đơn, manager của toà, admin, host) nên
 * màn hình KHÔNG phải lọc lại theo user.
 *
 * ⚠️ Payload KHÔNG có số tiền (BE cố ý ẩn tiền khỏi manager) — dùng để đổi trạng thái
 * dòng hoặc gọi refetch, đừng mong lấy `grandTotal` từ đây.
 */

/**
 * `@stomp/stompjs` v7 mã hoá/giải mã frame bằng `TextEncoder`/`TextDecoder`.
 *
 * ⚠️ Phải kiểm tra RIÊNG từng cái. Hermes có bản `TextEncoder` nhưng KHÔNG có
 * `TextDecoder`; guard cũ chỉ hỏi `TextEncoder` nên thấy có là bỏ qua cả cụm →
 * `TextDecoder` vẫn undefined → stompjs ném lỗi ngay khi giải mã frame `CONNECTED`
 * đầu tiên. Kết quả: socket mở được nhưng `onConnect` KHÔNG BAO GIỜ chạy, không
 * subscribe được, và vì `debug` bị bịt nên không có một dòng log nào.
 */
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const encoding = require('text-encoding');
  const g = global as any;
  if (typeof g.TextEncoder === 'undefined') g.TextEncoder = encoding.TextEncoder;
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = encoding.TextDecoder;
}

export interface BillingRealtimeEvent {
  event: 'INVOICE_PAID' | string;
  invoiceId: number;
  invoiceCode?: string;
  /** RENT · ELECTRICITY · WATER · SERVICE · MAINTENANCE · OTHER (= cọc onboard) */
  invoiceType?: string;
  /** `FIRST` khi là tiền nhà chu kỳ đầu (onboard); có thể null. */
  cycleType?: string | null;
  status?: string;
  propertyId?: number;
  propertyName?: string;
  roomNumber?: string;
  contractId?: number;
  tenantUserId?: string;
  tenantName?: string;
  billingMonth?: number;
  billingYear?: number;
  billingPeriod?: string;
  /** Có giá trị khi là hoá đơn điện/nước — dùng để patch list utility. */
  utilityInvoiceId?: number | null;
  paymentMethod?: string;
  transactionId?: string;
  paidAt?: string;
}

/** Base URL là http(s) → đổi sang ws(s). Web (Metro proxy) để trống thì lấy origin. */
const resolveWsUrl = (): string => {
  const base = API_CONFIG.REAL_BASE_URL
    || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
};

/**
 * ─── MỘT KẾT NỐI DÙNG CHUNG CHO CẢ APP ───────────────────────────────────────
 *
 * Trước đây mỗi màn gọi hook là mở MỘT WebSocket riêng. Stack của React Navigation giữ
 * màn cũ còn mounted, nên quản lý đi Trang chủ → Hoá đơn → Thu & đối soát là có 3 socket
 * cùng sống, 3 lần CONNECT, 3 lần handshake mỗi khi mạng chớp. Nay client là singleton
 * đếm số người nghe: người đầu tiên mở, người cuối cùng đóng.
 *
 * Kèm theo đó là trạng thái `connected` dùng chung — màn mới mở biết ngay đang có
 * realtime hay không, không phải chờ nối lại từ đầu.
 */
type EventListener = (event: BillingRealtimeEvent) => void;
type ConnListener = (connected: boolean) => void;

const eventListeners = new Set<EventListener>();
const connListeners = new Set<ConnListener>();

let client: Client | null = null;
/** Đang đọc token để dựng client — chặn 2 màn mount cùng lúc tạo 2 kết nối. */
let starting = false;
let socketConnected = false;
let appStateSub: { remove: () => void } | null = null;

const publishConnected = (value: boolean) => {
  if (socketConnected === value) return;
  socketConnected = value;
  connListeners.forEach((l) => l(value));
};

const startClient = async () => {
  if (client || starting) return;
  starting = true;
  try {
    const token = await AsyncStorage.getItem(SESSION_KEYS.accessToken);
    // Chưa đăng nhập thì thôi; size === 0 = màn cuối đã unmount trong lúc chờ đọc token.
    if (!token || eventListeners.size === 0) return;

    const url = resolveWsUrl();
    const c = new Client({
      brokerURL: url,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      // Mặc định stompjs log MỌI frame — ồn và in cả token trong header CONNECT.
      // Nhưng bịt hẳn thì realtime chết cũng không ai biết (đúng chuyện đã xảy ra),
      // nên ở dev vẫn in, chỉ che token.
      debug: __DEV__
        ? (msg) => console.log('[billing-ws]', msg.replace(/Bearer [\w.\-]+/g, 'Bearer ***'))
        : () => {},
      onConnect: () => {
        publishConnected(true);
        c.subscribe('/user/queue/billing', (message: IMessage) => {
          try {
            const event = JSON.parse(message.body) as BillingRealtimeEvent;
            eventListeners.forEach((l) => l(event));
          } catch {
            // Frame lỗi định dạng — bỏ qua, đừng để một message hỏng giết cả kết nối.
          }
        });
      },
      onWebSocketClose: () => publishConnected(false),
      // Ba nhánh hỏng dưới đây trước kia im lặng tuyệt đối: socket không mở được (sai
      // URL / cert / mạng), BE trả ERROR frame (JWT hết hạn, không có quyền), hoặc
      // stompjs ném khi giải mã. Không log thì chỉ thấy "app không tự cập nhật".
      onWebSocketError: (evt: any) => {
        publishConnected(false);
        console.warn('[billing-ws] không mở được WebSocket', url, evt?.message ?? evt);
      },
      onStompError: (frame) => {
        publishConnected(false);
        console.warn('[billing-ws] BE trả ERROR frame:', frame.headers?.message, frame.body);
      },
    });
    client = c;

    /**
     * iOS/Android ngắt WebSocket khi app xuống nền. `reconnectDelay` của stompjs chỉ chạy
     * khi socket báo đóng — quay ra foreground mà socket đã chết im thì không tự dậy,
     * nên chủ động activate lại.
     */
    appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && client && !client.connected) client.activate();
    });

    c.activate();
  } finally {
    starting = false;
  }
};

const stopClient = () => {
  appStateSub?.remove();
  appStateSub = null;
  const c = client;
  client = null;
  publishConnected(false);
  void c?.deactivate();
};

/**
 * ─── BA LỚP ĐỂ MÀN HÌNH LUÔN TỰ CẬP NHẬT ─────────────────────────────────────
 *
 * WebSocket một mình là chưa đủ, và bản web đã trả giá cho chuyện đó: nginx trên VPS
 * không chuyển tiếp header `Upgrade` nên STOMP chưa từng nối được ở môi trường thật —
 * client cứ thử lại mỗi 5 giây trong im lặng, event phát ra lúc chưa nối là mất luôn
 * (STOMP không replay), còn người dùng chỉ thấy "phải thoát ra vào lại mới đổi".
 * Trên mobile còn thêm mấy đường đứt riêng: đổi Wi-Fi ↔ 4G, máy ngủ, proxy LAN.
 *
 * Nên hook này có ba lớp, xếp theo độ tức thì:
 *
 *  1. **WebSocket** — có event là gọi `onRefresh` ngay (dưới 1 giây).
 *  2. **Poll dự phòng** — chỉ chạy khi WS CHƯA nối được và màn đang hiển thị, nhịp
 *     `pollMs` (mặc định 20s). Nối được thì tự tắt.
 *  3. **App trở lại foreground** — nạp một lần, vì lúc app ở nền ta cố tình không poll.
 *
 * `connected` trả ra để UI nói thật với người dùng đang ở lớp nào (xem `RealtimeBadge`),
 * thay vì để họ tự đoán tại sao trạng thái không nhảy.
 */
export interface UseBillingRealtimeOptions {
  /** Gọi khi CẦN NẠP LẠI: có event thật, hết nhịp poll, vừa nối lại, hoặc app trở lại. */
  onRefresh?: () => void;
  /** Gọi riêng khi có event thật — cho toast / vá thẳng một dòng; poll không có event. */
  onEvent?: (event: BillingRealtimeEvent) => void;
  /** Lọc event trước khi xử lý, vd chỉ quan tâm toà đang xem. Không truyền = nhận hết. */
  filter?: (event: BillingRealtimeEvent) => boolean;
  /** false (vd chưa đăng nhập, màn chưa cần) thì không kết nối, không poll. */
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
 * đọc BẢN CHƯA COMMIT = trạng thái cũ. Kết quả đúng như quản lý mô tả: khách trả xong mà
 * dòng vẫn "Chờ thanh toán", phải thoát ra vào lại màn mới thấy "Đã thanh toán".
 *
 * Nạp thêm ở 1.2s và 3.5s là đủ phủ độ trễ commit thực tế mà không thành spam.
 * Sửa gốc nằm ở BE: publish sau commit — xem BE-BUG-realtime-publish-truoc-commit.
 */
const SETTLE_DELAYS_MS = [1_200, 3_500];

export const useBillingRealtime = (
  arg: ((event: BillingRealtimeEvent) => void) | UseBillingRealtimeOptions,
  /** Chỉ dùng với dạng gọi cũ `useBillingRealtime(fn, enabled)`. */
  enabledLegacy = true,
): BillingRealtimeState => {
  const opts: UseBillingRealtimeOptions = typeof arg === 'function'
    ? { onEvent: arg, enabled: enabledLegacy }
    : arg;
  const enabled = opts.enabled ?? true;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  // Màn bị che (đi sang màn khác) vẫn còn mounted trong stack. Nó tự nạp lại khi quay
  // về (mọi màn dùng hook này đều có useFocusEffect), nên lúc bị che thì đừng nạp.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  const [connected, setConnected] = useState(socketConnected);

  // Giữ callback trong ref: truyền hàm inline cũng không làm dựng lại kết nối. Nếu để
  // callback vào deps thì mỗi lần component render là một lần ngắt/nối WebSocket.
  const onEventRef = useRef(opts.onEvent);
  const onRefreshRef = useRef(opts.onRefresh);
  const filterRef = useRef(opts.filter);
  onEventRef.current = opts.onEvent;
  onRefreshRef.current = opts.onRefresh;
  filterRef.current = opts.filter;

  /** Hẹn giờ nạp lại sau event — clear khi unmount để không setState trên màn đã chết. */
  const settleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    settleTimers.current.forEach(clearTimeout);
    settleTimers.current = [];
  }, []);

  /** Nạp ngay + nạp lại vài nhịp nữa (xem SETTLE_DELAYS_MS). */
  const refreshWithSettle = useCallback(() => {
    if (!focusedRef.current || !onRefreshRef.current) return;
    onRefreshRef.current();
    SETTLE_DELAYS_MS.forEach((ms) => {
      settleTimers.current.push(setTimeout(() => {
        if (focusedRef.current) onRefreshRef.current?.();
      }, ms));
    });
  }, []);

  // ── Lớp 1: WebSocket (kết nối dùng chung, xem startClient) ──
  useEffect(() => {
    if (!enabled) return;

    const onEvent: EventListener = (event) => {
      if (filterRef.current && !filterRef.current(event)) return;
      onEventRef.current?.(event);
      refreshWithSettle();
    };
    // Nối lại được thì nạp một lần: lúc mất kết nối có thể đã có thanh toán mà ta không
    // nghe được — STOMP không gửi lại event cũ.
    const onConn: ConnListener = (value) => {
      setConnected(value);
      if (value) refreshWithSettle();
    };

    eventListeners.add(onEvent);
    connListeners.add(onConn);
    setConnected(socketConnected);
    void startClient();

    return () => {
      eventListeners.delete(onEvent);
      connListeners.delete(onConn);
      if (eventListeners.size === 0) stopClient();
    };
  }, [enabled, refreshWithSettle]);

  // ── Lớp 2: poll dự phòng, CHỈ khi WS chưa nối và màn đang hiển thị ──
  useEffect(() => {
    if (!enabled || connected || pollMs <= 0 || !focused) return;
    if (!onRefreshRef.current) return;
    const t = setInterval(() => {
      // App ở nền thì không hỏi — lớp 3 lo lúc quay lại.
      if (AppState.currentState === 'active') onRefreshRef.current?.();
    }, pollMs);
    return () => clearInterval(t);
  }, [enabled, connected, pollMs, focused]);

  // ── Lớp 3: app quay lại foreground ──
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && focusedRef.current) onRefreshRef.current?.();
    });
    return () => sub.remove();
  }, [enabled]);

  return { connected };
};
