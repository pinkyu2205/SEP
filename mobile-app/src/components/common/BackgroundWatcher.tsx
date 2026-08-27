import { useNotificationToasts } from '@/hooks/useNotificationToasts';

/**
 * Component "chạy ngầm" (không vẽ gì) của app.
 *
 * Mọi thông báo đều do BE bắn (push + /api/v1/notifications). Chỗ này chỉ lo hiện lại
 * thông báo mới ngay trong app ở môi trường không có push (Expo Go / web) — xem
 * hooks/useNotificationToasts.
 *
 * Trước 13/08/2026 còn gọi thêm useFirstCycleReminder để nhắc hoá đơn tiền phòng kỳ
 * đầu. Bỏ hẳn: tiền kỳ đầu giờ thu chung với tiền cọc trong mã QR lúc đón khách nên
 * không còn hoá đơn kỳ đầu nào chờ thanh toán để mà nhắc.
 *
 * Phải nằm BÊN TRONG AuthProvider mới đọc được user đang đăng nhập — vì vậy không
 * gọi hook thẳng trong App.tsx được.
 */
export const BackgroundWatcher: React.FC = () => {
  useNotificationToasts();
  return null;
};
