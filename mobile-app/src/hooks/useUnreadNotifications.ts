import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { realNotificationService } from '@/services/shared/notificationService';
import { useLocalAlerts } from '@/store/localAlertStore';

/**
 * Số thông báo chưa đọc cho badge chuông ở Home = thông báo BE + thông báo trả phòng
 * do app tự sinh (localAlertStore) — với người dùng chỉ có MỘT con số duy nhất.
 * Tự refetch mỗi khi màn focus (vd quay lại Home sau khi đọc thông báo).
 * Trả về `null` khi chưa tải được và cũng không có thông báo nội bộ → màn hình tự
 * fallback về số sẵn có của nó.
 */
export function useUnreadNotifications(): number | null {
  const [count, setCount] = useState<number | null>(null);
  const { unreadCount: localUnread } = useLocalAlerts();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      realNotificationService.unreadCount()
        .then(c => { if (active) setCount(c); })
        .catch(() => { /* offline: giữ null để fallback */ });
      return () => { active = false; };
    }, []),
  );

  if (count === null && localUnread === 0) return null;
  return (count ?? 0) + localUnread;
}
