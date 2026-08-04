import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Kho THÔNG BÁO DO CHÍNH APP SINH RA (không phải của BE).
 *
 * Hai nguồn hiện có:
 *   • `checkout` — luồng trả phòng: bên kia vừa thao tác (services/shared/checkoutNotifier)
 *   • `billing`  — hoá đơn: tiền phòng tự động, điện/nước quản lý vừa gửi, nhắc nợ
 *                  (services/shared/billingNotifier)
 *
 * Vì sao cần kho riêng: BE chưa ghi thông báo cho 2 luồng này. Danh sách ở đây được
 * TRỘN vào trung tâm thông báo và tính chung vào badge chuông nên người dùng không
 * phân biệt được đâu là của server — đúng như mong đợi.
 *
 * Dữ liệu lưu theo TỪNG TÀI KHOẢN (key kèm userId) để máy dùng chung không lẫn.
 */

export type LocalAlertKind = 'checkout' | 'billing';

export interface LocalAlert {
  /** Khoá duy nhất của SỰ KIỆN, vd `checkout:12:APPROVED|...` hay `rent:2026-08:DUE_TODAY`.
   *  Trùng id = đã báo rồi, không báo lại dù vòng kiểm tra chạy nhiều lần. */
  id: string;
  kind: LocalAlertKind;
  /** Id đối tượng liên quan (hồ sơ trả phòng / hoá đơn) để đánh dấu đã đọc theo nhóm. */
  refId?: number;
  title: string;
  body: string;
  /** Route mở khi bấm vào thông báo. */
  screen: string;
  params?: Record<string, any>;
  createdAt: string;
  read: boolean;
}

const KEY_PREFIX = 'local_alerts_v1:';
const MAX_KEEP = 50;

let currentKey: string | null = null;
let alerts: LocalAlert[] = [];

type Listener = (list: LocalAlert[]) => void;
const listeners = new Set<Listener>();
/** Nghe RIÊNG thông báo vừa tới (cho toast trong app) — không bắn lại khi đánh dấu đã đọc. */
type IncomingListener = (alert: LocalAlert) => void;
const incomingListeners = new Set<IncomingListener>();

const emit = () => { listeners.forEach(fn => fn(alerts)); };

const persist = async () => {
  if (!currentKey) return;
  try {
    await AsyncStorage.setItem(currentKey, JSON.stringify(alerts));
  } catch { /* hết chỗ lưu / lỗi storage: giữ trong RAM là đủ dùng phiên này */ }
};

export const localAlertStore = {
  /** Nạp thông báo đã lưu của user (gọi khi đăng nhập / đổi tài khoản). */
  load: async (userId: string) => {
    const key = KEY_PREFIX + userId;
    if (currentKey === key) return;
    currentKey = key;
    try {
      const raw = await AsyncStorage.getItem(key);
      alerts = raw ? (JSON.parse(raw) as LocalAlert[]) : [];
    } catch {
      alerts = [];
    }
    emit();
  },

  /** Thêm thông báo mới (bỏ qua id đã có). Trả về những cái thật sự mới. */
  add: (incoming: LocalAlert[]): LocalAlert[] => {
    const known = new Set(alerts.map(a => a.id));
    const fresh = incoming.filter(a => !known.has(a.id));
    if (fresh.length === 0) return [];
    alerts = [...fresh, ...alerts].slice(0, MAX_KEEP);
    persist();
    emit();
    fresh.forEach(a => incomingListeners.forEach(fn => fn(a)));
    return fresh;
  },

  list: () => alerts,
  unreadCount: () => alerts.filter(a => !a.read).length,

  markRead: (id: string) => {
    alerts = alerts.map(a => (a.id === id ? { ...a, read: true } : a));
    persist();
    emit();
  },

  /** Mở hồ sơ/hoá đơn nào thì thông báo của cái đó coi như đã xem. */
  markReadByRef: (kind: LocalAlertKind, refId: number) => {
    if (!alerts.some(a => a.kind === kind && a.refId === refId && !a.read)) return;
    alerts = alerts.map(a => (a.kind === kind && a.refId === refId ? { ...a, read: true } : a));
    persist();
    emit();
  },

  /** Đánh dấu đã đọc cả nhóm (vd khách mở màn hoá đơn = đã thấy mọi nhắc nợ). */
  markReadByKind: (kind: LocalAlertKind) => {
    if (!alerts.some(a => a.kind === kind && !a.read)) return;
    alerts = alerts.map(a => (a.kind === kind ? { ...a, read: true } : a));
    persist();
    emit();
  },

  markAllRead: () => {
    if (!alerts.some(a => !a.read)) return;
    alerts = alerts.map(a => ({ ...a, read: true }));
    persist();
    emit();
  },

  /** Đăng xuất: quên hết để tài khoản sau không thấy thông báo của người trước. */
  reset: () => {
    currentKey = null;
    alerts = [];
    emit();
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  subscribeIncoming: (fn: IncomingListener): (() => void) => {
    incomingListeners.add(fn);
    return () => { incomingListeners.delete(fn); };
  },
};

/**
 * Hook cho màn hình: danh sách + số chưa đọc, tự cập nhật khi có thông báo mới.
 * Truyền `kind` nếu chỉ quan tâm một loại (vd màn hoá đơn chỉ cần nhắc tiền phòng).
 */
export function useLocalAlerts(kind?: LocalAlertKind) {
  const [list, setList] = useState<LocalAlert[]>(localAlertStore.list());

  useEffect(() => localAlertStore.subscribe(setList), []);

  const scoped = kind ? list.filter(a => a.kind === kind) : list;
  return {
    alerts: scoped,
    unreadCount: scoped.filter(a => !a.read).length,
    markRead: localAlertStore.markRead,
    markAllRead: localAlertStore.markAllRead,
  };
}
