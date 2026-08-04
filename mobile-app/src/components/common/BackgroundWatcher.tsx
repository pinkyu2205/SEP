import { useCheckoutWatcher } from '@/hooks/useCheckoutWatcher';
import { useBillingWatcher } from '@/hooks/useBillingWatcher';

/**
 * Component "chạy ngầm" (không vẽ gì) bật các vòng theo dõi của app:
 *   • trả phòng — bên kia thao tác thì báo ngay (useCheckoutWatcher)
 *   • hoá đơn   — tiền phòng tự phát hành + nhắc nợ + hoá đơn điện/nước mới
 *                 (useBillingWatcher)
 *
 * Phải nằm BÊN TRONG AuthProvider mới đọc được user đang đăng nhập — vì vậy không
 * gọi hook thẳng trong App.tsx được.
 */
export const BackgroundWatcher: React.FC = () => {
  useCheckoutWatcher();
  useBillingWatcher();
  return null;
};
