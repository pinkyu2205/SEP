import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { realNotificationService } from '@/services/shared/notificationService';

/**
 * Số thông báo chưa đọc (thật, từ BE) cho badge chuông ở Home.
 * Tự refetch mỗi khi màn focus (vd quay lại Home sau khi đọc thông báo).
 * Trả về `null` khi chưa tải/offline → màn hình tự fallback về số sẵn có.
 */
export function useUnreadNotifications(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      realNotificationService.unreadCount()
        .then(c => { if (active) setCount(c); })
        .catch(() => { /* offline: giữ null để fallback */ });
      return () => { active = false; };
    }, []),
  );

  return count;
}
