import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * PHIÊN ĐĂNG NHẬP lưu trên máy.
 *
 * App giữ đăng nhập: tắt app mở lại KHÔNG phải đăng nhập lại, chỉ khi bấm Đăng xuất
 * (hoặc token hết hạn) mới thoát. Muốn vậy phải lưu đủ 2 thứ xuống AsyncStorage:
 *   • `accessToken` — để gọi API (realApiClient tự gắn Bearer).
 *   • `user`        — hồ sơ hiển thị, để mở app là vào thẳng, không phải chờ gọi API.
 * Thiếu một trong hai thì lần mở sau coi như chưa đăng nhập.
 */

export const SESSION_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  user: 'user',
  /** Lựa chọn "nhà đang thuê" của tenant — thuộc về phiên, đăng xuất là bỏ. */
  selectedContract: 'tenant_selected_contract_id',
  /** Lần cuối mở/dùng app — mốc để tự đăng xuất khi bỏ lâu không dùng. */
  lastActiveAt: 'session_last_active_at',
} as const;

/**
 * Bỏ app bao lâu thì tự đăng xuất. Đúng 10 ngày KHÔNG MỞ APP (không phải 10 ngày kể
 * từ lúc đăng nhập) — mỗi lần mở app lại tính lại từ đầu.
 */
export const SESSION_IDLE_DAYS = 10;
const SESSION_IDLE_MS = SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000;

/** Ghi nhận "vừa dùng app" — gọi khi đăng nhập và mỗi lần app trở lại foreground. */
export async function touchSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEYS.lastActiveAt, String(Date.now()));
  } catch { /* không quan trọng */ }
}

/** Đã quá hạn không dùng chưa (chưa từng ghi mốc thì coi như còn hạn). */
export async function isSessionIdleExpired(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEYS.lastActiveAt);
    if (!raw) return false;
    const last = Number(raw);
    if (!Number.isFinite(last)) return false;
    return Date.now() - last > SESSION_IDLE_MS;
  } catch {
    return false;
  }
}

/** Xoá sạch phiên trên máy (đăng xuất / token hết hạn). */
export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      SESSION_KEYS.accessToken,
      SESSION_KEYS.refreshToken,
      SESSION_KEYS.user,
      SESSION_KEYS.selectedContract,
      SESSION_KEYS.lastActiveAt,
    ]);
  } catch {
    // Storage lỗi thì thôi — state trong RAM vẫn được reset ở AuthProvider.
  }
}

/**
 * Báo cho AuthProvider biết token không còn dùng được (BE trả 401) để đưa app về
 * màn đăng nhập, thay vì để người dùng ngồi nhìn màn hình lỗi mà tưởng vẫn đang đăng nhập.
 */
type ExpiredHandler = () => void;
let expiredHandler: ExpiredHandler | null = null;

export function registerSessionExpiredHandler(fn: ExpiredHandler): () => void {
  expiredHandler = fn;
  return () => { if (expiredHandler === fn) expiredHandler = null; };
}

export function notifySessionExpired(): void {
  expiredHandler?.();
}
