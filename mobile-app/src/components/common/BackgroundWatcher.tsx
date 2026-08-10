import { useNotificationToasts } from '@/hooks/useNotificationToasts';
import { useFirstCycleReminder } from '@/hooks/useFirstCycleReminder';

/**
 * Component "chạy ngầm" (không vẽ gì) của app.
 *
 * Mọi thông báo đều do BE bắn (push + /api/v1/notifications). Chỗ này chỉ lo hiện lại
 * thông báo mới ngay trong app ở môi trường không có push (Expo Go / web) — xem
 * hooks/useNotificationToasts — và nhắc hoá đơn tiền phòng kỳ đầu mỗi lần khách thuê
 * đăng nhập (hooks/useFirstCycleReminder).
 *
 * Phải nằm BÊN TRONG AuthProvider mới đọc được user đang đăng nhập — vì vậy không
 * gọi hook thẳng trong App.tsx được.
 */
export const BackgroundWatcher: React.FC = () => {
  useNotificationToasts();
  useFirstCycleReminder();
  return null;
};
