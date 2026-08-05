/**
 * Kênh phát THÔNG BÁO TỨC THỜI trong app (in-app toast).
 *
 * Thông báo thật do BE gửi (push + /api/v1/notifications). Bus này chỉ để HIỆN LẠI
 * thông báo mới ngay trong app ở những môi trường KHÔNG có push hệ thống — Expo Go
 * (SDK 53+ đã gỡ remote push) và bản chạy web. Trên máy thật có push thì banner của
 * hệ điện thoại lo, bus này không chạy (xem hooks/useNotificationToasts).
 *
 * Không lưu trữ gì: badge chuông và danh sách thông báo vẫn lấy thẳng từ BE.
 */

export interface ToastNotice {
  /** id thông báo của BE — dùng làm key, không hiện lại 2 lần. */
  id: number;
  title: string;
  body: string;
  /** type thô của BE (CHECKOUT_APPROVED, BILLING_OVERDUE...) để chọn icon + màn mở. */
  type: string;
}

type Listener = (notice: ToastNotice) => void;
const listeners = new Set<Listener>();

export const toastBus = {
  emit: (notice: ToastNotice) => { listeners.forEach(fn => fn(notice)); },
  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
