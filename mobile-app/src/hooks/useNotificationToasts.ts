import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { isExpoGo } from '@/services/core/notifications';
import { realNotificationService } from '@/services/shared/notificationService';
import { toastBus } from '@/store/toastBus';

/**
 * Hiện thông báo mới của BE ngay trong app (băng trượt từ trên xuống).
 *
 * BE đã bắn push thật cho mọi sự kiện (trả phòng, tiền phòng, điện/nước) nên trên
 * MÁY THẬT không cần gì thêm — hệ điều hành tự hiện banner. Hook này chỉ chạy ở nơi
 * KHÔNG có push: Expo Go (SDK 53+ gỡ remote push) và bản chạy web — nếu không thì
 * demo trên web sẽ không thấy thông báo nào nhảy ra.
 *
 * Chỉ ĐỌC danh sách thông báo của BE; badge chuông và trung tâm thông báo vẫn dùng
 * chung nguồn đó, nên không có chuyện đếm trùng hay hiện 2 lần.
 */

/** Nhịp hỏi BE khi không có push — đủ nhanh để cảm giác "gửi là bên kia thấy". */
const POLL_MS = 20_000;

/** Môi trường không nhận được push hệ thống → cần toast thay thế. */
const NEEDS_IN_APP_TOAST = Platform.OS === 'web' || isExpoGo;

export function useNotificationToasts(): void {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!NEEDS_IN_APP_TOAST || !isAuthenticated || !userId) return;

    let stopped = false;
    let seeded = false;                 // vòng đầu chỉ ghi nhận, không dội thông báo cũ
    const seen = new Set<number>();

    const tick = async () => {
      if (stopped) return;
      try {
        const rows = await realNotificationService.list();
        if (stopped) return;
        if (!seeded) {
          rows.forEach(r => seen.add(r.id));
          seeded = true;
          return;
        }
        const fresh = rows.filter(r => !seen.has(r.id));
        fresh.forEach(r => seen.add(r.id));
        // BE trả mới nhất trước → đảo lại để hiện đúng thứ tự xảy ra.
        [...fresh].reverse().forEach(r => toastBus.emit({
          id: r.id, title: r.title, body: r.body, type: r.type,
        }));
      } catch {
        // Mất mạng: bỏ qua vòng này, thử lại sau.
      }
    };

    tick();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') tick();
    }, POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [isAuthenticated, userId]);
}
