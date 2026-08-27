import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
 * ⚠️ Ba điểm khác hẳn bản web:
 *  1. Token nằm ở AsyncStorage (bất đồng bộ) chứ không phải localStorage.
 *  2. `@stomp/stompjs` v7 cần `TextEncoder`/`TextDecoder` — Hermes không chắc có sẵn,
 *     nên nạp polyfill có kiểm tra ở đầu file.
 *  3. App vào nền là hệ điều hành cắt WebSocket. Phải nối lại khi quay ra foreground,
 *     nếu không màn hình đứng im mà người dùng tưởng vẫn đang nghe.
 *
 * ⚠️ Payload KHÔNG có số tiền (BE cố ý ẩn tiền khỏi manager) — dùng để đổi trạng thái
 * dòng hoặc gọi refetch, đừng mong lấy `grandTotal` từ đây.
 */

// Polyfill có guard: RN mới có thể đã kèm sẵn, khi đó bỏ qua để khỏi ghi đè bản gốc.
if (typeof (global as any).TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TextEncoder, TextDecoder } = require('text-encoding');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
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
 * @param onEvent chạy mỗi khi có event. Giữ qua ref nên truyền hàm inline cũng không làm
 *                kết nối dựng lại — để `onEvent` vào deps thì mỗi lần render là một lần
 *                ngắt/nối WebSocket.
 * @param enabled false (vd chưa đăng nhập, màn chưa cần) thì không kết nối.
 */
export const useBillingRealtime = (
  onEvent: (event: BillingRealtimeEvent) => void,
  enabled = true,
) => {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let client: Client | null = null;
    let cancelled = false;

    const connect = async () => {
      const token = await AsyncStorage.getItem(SESSION_KEYS.accessToken);
      // Chưa đăng nhập thì thôi; cancelled = effect đã cleanup trong lúc chờ đọc token.
      if (!token || cancelled) return;

      client = new Client({
        brokerURL: resolveWsUrl(),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        // Mặc định stompjs log mỗi frame — ồn và in cả token trong header CONNECT.
        debug: () => {},
        onConnect: () => {
          client?.subscribe('/user/queue/billing', (message: IMessage) => {
            try {
              handlerRef.current(JSON.parse(message.body) as BillingRealtimeEvent);
            } catch {
              // Frame lỗi định dạng — bỏ qua, đừng để một message hỏng giết cả kết nối.
            }
          });
        },
      });
      client.activate();
    };

    connect();

    /**
     * iOS/Android ngắt WebSocket khi app xuống nền. `reconnectDelay` của stompjs chỉ chạy
     * khi socket báo đóng — quay ra foreground mà socket đã chết im thì không tự dậy,
     * nên chủ động activate lại.
     */
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active' && client && !client.connected) client.activate();
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      sub.remove();
      void client?.deactivate();
    };
  }, [enabled]);
};
