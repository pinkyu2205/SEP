import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { BILLING_POLL_MS } from '@/constants/rentCycle';
import { realTenantBillingService } from '@/services/tenant/billingService';
import { runRentAutoBilling } from '@/services/manager/rentAutoBilling';
import {
  processTenantBilling, loadBillingSnapshot, resetBillingSnapshot,
} from '@/services/shared/billingNotifier';
import { localAlertStore } from '@/store/localAlertStore';

/**
 * Vòng chạy nền cho HOÁ ĐƠN.
 *
 *   • Khách thuê: phát hiện hoá đơn mới (tiền phòng tự động, điện/nước quản lý vừa
 *     gửi) → bắn thông báo về máy; và nhắc đóng tiền phòng theo lịch 28 · 1–5 · 7.
 *   • Quản lý  : chạy đợt PHÁT HÀNH TỰ ĐỘNG tiền phòng (không phải bấm gửi tay) và
 *     báo các hợp đồng quá hạn tới mức được quyền chấm dứt.
 *
 * Chỉ chạy khi app đang mở. Khi BE có cron thật thì gỡ hook này đi là xong
 * (xem docs/BE-NEED-rent-auto-cycle-2026-08-04.md).
 */
export function useBillingWatcher(): void {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  const role = user?.role === 'manager' ? 'manager' : user?.role === 'tenant' ? 'tenant' : null;

  useEffect(() => {
    if (!isAuthenticated || !userId || !role) {
      resetBillingSnapshot();
      return;
    }

    let stopped = false;

    const sync = async () => {
      if (stopped) return;
      try {
        if (role === 'tenant') {
          const invoices = await realTenantBillingService.listInvoices();
          if (stopped) return;
          await processTenantBilling(userId, invoices ?? []);
        } else {
          // Tự phát hành hộ manager; bên trong có giãn cách 30 phút nên gọi thường
          // xuyên cũng không dội API.
          await runRentAutoBilling(userId);
        }
      } catch {
        // Mất mạng / BE chưa có endpoint: bỏ qua vòng này, thử lại sau.
      }
    };

    (async () => {
      await localAlertStore.load(userId);
      await loadBillingSnapshot(userId);
      sync();
    })();

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') sync();
    }, BILLING_POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [isAuthenticated, userId, role]);
}
