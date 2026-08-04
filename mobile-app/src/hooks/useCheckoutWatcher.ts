import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { CHECKOUT_POLL_MS } from '@/constants/checkout';
import { checkoutService } from '@/services/manager/checkoutService';
import { realTenantSelfService } from '@/services/tenant/selfService';
import {
  processCheckoutSnapshot, loadCheckoutSnapshot, resetCheckoutSnapshot, CheckoutViewerRole,
} from '@/services/shared/checkoutNotifier';
import { localAlertStore } from '@/store/localAlertStore';

/**
 * Vòng theo dõi luồng TRẢ PHÒNG của tài khoản đang đăng nhập.
 *
 * Cứ CHECKOUT_POLL_MS một lần (và mỗi lần mở lại app) thì tải hồ sơ trả phòng, so với
 * lần trước; đối phương vừa thao tác thì bắn thông báo lên máy + lưu vào trung tâm
 * thông báo (xem services/shared/checkoutNotifier).
 *
 * Chỉ chạy khi app đang mở — BE chưa bắn push cho các bước này nên khi app bị tắt hẳn
 * thông báo sẽ tới ở lần mở app kế tiếp (đã ghi lại trong doc/ để BE bổ sung push thật).
 */
export function useCheckoutWatcher(): void {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  const role: CheckoutViewerRole | null =
    user?.role === 'manager' ? 'manager' : user?.role === 'tenant' ? 'tenant' : null;

  useEffect(() => {
    // Đăng xuất: quên hết để tài khoản đăng nhập sau không thấy thông báo người trước.
    if (!isAuthenticated || !userId || !role) {
      resetCheckoutSnapshot();
      localAlertStore.reset();
      return;
    }

    let stopped = false;

    const sync = async () => {
      if (stopped) return;
      try {
        const list = role === 'manager'
          ? await checkoutService.list()
          : await realTenantSelfService.listMyCheckoutRequests();
        if (stopped) return;
        await processCheckoutSnapshot(userId, role, list ?? []);
      } catch {
        // Mất mạng / tài khoản demo không gọi được BE: bỏ qua vòng này, thử lại sau.
      }
    };

    (async () => {
      await localAlertStore.load(userId);
      await loadCheckoutSnapshot(userId);
      sync();
    })();

    // Chỉ hỏi BE khi app đang mở — đỡ tốn pin và tránh gọi API lúc máy ngủ.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') sync();
    }, CHECKOUT_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [isAuthenticated, userId, role]);
}
