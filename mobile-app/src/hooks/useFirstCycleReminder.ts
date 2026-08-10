import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import {
  FIRST_RENT_CYCLE,
  firstCycleDaysLeft,
  firstCycleStage,
  isFirstRentCycleInvoice,
} from '@/constants';
import { toastBus } from '@/store/toastBus';

/**
 * Nhắc TRONG APP về hoá đơn tiền phòng KỲ ĐẦU mỗi lần khách thuê đăng nhập.
 *
 * Kỳ đầu là khoản khách dễ quên nhất: vừa nhận phòng, chưa quen app, và hoá đơn
 * không rơi vào nhịp "ngày 1 phát hành" quen thuộc. Chính sách (xem
 * constants/rentCycle.ts → FIRST_RENT_CYCLE): nhắc mỗi ngày trong 3 ngày, quá 3
 * ngày thì báo quản lý.
 *
 * Push điện thoại do BE lo (cron RENT_FIRST_CYCLE_REMINDER, 08:00 mỗi ngày — BE
 * commit a52c370). Hook này lo phần "thông báo trong app mỗi khi tenant đăng nhập":
 * bắn 1 lần cho mỗi phiên, và bắn lại nếu app nằm nền qua ngày mới rồi mở lại.
 * Hai kênh không đụng nhau: push là của hệ điều hành, cái này là băng toast trong app.
 */

/** id âm để không đụng id thông báo thật của BE (luôn dương). */
const TOAST_ID = -101;

export function useFirstCycleReminder(): void {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  const isTenant = user?.role === 'tenant';
  /** Ngày đã nhắc gần nhất ("YYYY-MM-DD") — chặn nhắc 2 lần trong cùng một ngày. */
  const remindedOn = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isTenant || !userId) return;

    let stopped = false;
    remindedOn.current = null; // đổi tài khoản → nhắc lại từ đầu

    const check = async () => {
      const today = new Date().toISOString().slice(0, 10);
      if (stopped || remindedOn.current === today) return;
      try {
        const bills = (await realTenantBillingService.listInvoices()).map(toSharedBill);
        if (stopped) return;

        const firstCycle = bills.find(
          b =>
            (b.status === 'pending' || b.status === 'overdue' || b.status === 'partial') &&
            isFirstRentCycleInvoice(b),
        );
        if (!firstCycle) return;

        remindedOn.current = today;
        const daysLeft = firstCycleDaysLeft(firstCycle);
        const expired = firstCycleStage(firstCycle) === 'expired';

        toastBus.emit({
          id: TOAST_ID,
          type: expired ? 'RENT_FIRST_CYCLE_OVERDUE' : 'RENT_FIRST_CYCLE_REMINDER',
          title: expired
            ? '⛔ Hoá đơn đầu tiên đã quá hạn'
            : '🧾 Hoá đơn đầu tiên chưa thanh toán',
          body: expired
            ? 'Quản lý đã được thông báo và có quyền chấm dứt hợp đồng. Vui lòng thanh toán ngay.'
            : `Còn ${daysLeft} ngày để thanh toán tiền phòng kỳ đầu (hạn ${FIRST_RENT_CYCLE.graceDays} ngày kể từ ngày nhận phòng).`,
        });
      } catch {
        // Mất mạng: bỏ qua, lần mở app sau nhắc lại.
      }
    };

    check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });

    return () => {
      stopped = true;
      subscription.remove();
    };
  }, [isAuthenticated, isTenant, userId]);
}
