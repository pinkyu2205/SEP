import { useEffect, useRef, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';

/**
 * Realtime cập nhật phiếu bảo trì — STOMP over native WebSocket, cùng hạ tầng với
 * `useBillingRealtime` (endpoint `/ws`, JWT ở header `CONNECT`) nhưng queue riêng
 * `/user/queue/maintenance` để không lẫn với event hoá đơn.
 *
 * BE đã ship 03/09/2026 (commit `3381711`, repo BE `docs/maintenance-realtime-socket-spec.md`)
 * — `MaintenanceServiceImpl` publish sau mỗi thao tác đổi trạng thái (9 điểm: create,
 * approve, reject-fault, report-fault, admin-review, submit-self-repair, verify-repair,
 * complete, cancel). Field payload khớp đúng interface dưới đây.
 */

export interface MaintenanceRealtimeEvent {
  event: 'MAINTENANCE_CREATED' | 'MAINTENANCE_APPROVED' | 'MAINTENANCE_REJECT_FAULT'
    | 'MAINTENANCE_FAULT_REPORTED' | 'MAINTENANCE_ADMIN_REVIEWED'
    | 'MAINTENANCE_SELF_REPAIR_SUBMITTED' | 'MAINTENANCE_VERIFY_REPAIR'
    | 'MAINTENANCE_COMPLETED' | 'MAINTENANCE_CANCELLED_BY_TENANT'
    | 'MAINTENANCE_CANCELLED_BY_MANAGER' | string;
  requestId: number;
  requestCode?: string;
  status?: string;
  propertyId?: number;
  propertyName?: string;
  roomId?: number;
  roomNumber?: string;
  tenantUserId?: string;
  assignedManagerId?: string;
  adminApproved?: boolean | null;
}

const resolveWsUrl = (): string => {
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  return `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
};

export interface UseMaintenanceRealtimeOptions {
  /** Gọi khi CẦN NẠP LẠI: có event thật, hết nhịp poll, hoặc vừa quay lại tab. */
  onRefresh?: () => void;
  /** Gọi riêng khi có event thật — dùng cho toast, vì poll không có event để hiện. */
  onEvent?: (event: MaintenanceRealtimeEvent) => void;
  /** false (vd chưa đăng nhập) thì không kết nối, không poll. */
  enabled?: boolean;
  /** Nhịp poll khi WS chưa nối được. 0 = tắt hẳn lớp dự phòng. */
  pollMs?: number;
}

export interface MaintenanceRealtimeState {
  /** true = đang nhận đẩy thật qua WebSocket. false = đang chạy bằng poll dự phòng. */
  connected: boolean;
}

const DEFAULT_POLL_MS = 20_000;
const SETTLE_DELAYS_MS = [1_200, 3_500];

export const useMaintenanceRealtime = (
  opts: UseMaintenanceRealtimeOptions = {},
): MaintenanceRealtimeState => {
  const enabled = opts.enabled ?? true;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  const [connected, setConnected] = useState(false);

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
      debug: () => {},
      onConnect: () => {
        setConnected(true);
        onRefreshRef.current?.();
        SETTLE_DELAYS_MS.forEach((ms) => {
          settleTimers.current.push(setTimeout(() => onRefreshRef.current?.(), ms));
        });
        client.subscribe('/user/queue/maintenance', (message: IMessage) => {
          try {
            const event = JSON.parse(message.body) as MaintenanceRealtimeEvent;
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
