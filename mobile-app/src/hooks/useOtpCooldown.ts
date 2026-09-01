import { useCallback, useEffect, useRef, useState } from 'react';

/** Khoảng chờ mặc định giữa hai lần xin mã — khớp cooldown chống spam SMS của BE. */
export const RESEND_COOLDOWN_SEC = 60;

/**
 * Đếm ngược "gửi lại mã sau N giây" cho các màn có OTP.
 *
 * Tách ra từ `TenantActivateScreen` (27/08/2026) vì màn "Xác nhận hợp đồng" của khách
 * và panel OTP của quản lý đều cần đúng hành vi này. Copy-paste sang từng màn thì chỗ
 * dọn `clearInterval` là thứ đầu tiên bị quên, và khi ấy timer chạy tiếp sau khi màn
 * đã unmount, gọi `setState` trên component đã chết.
 *
 * Cố tình KHÔNG dùng `Date.now()` để tính phần còn lại: dự án lấy giờ từ server
 * (`utils/serverTime`) vì giờ máy manager từng lệch, mà ở đây chỉ cần đếm lùi tương
 * đối nên đếm theo tick là đủ và không kéo thêm phụ thuộc.
 */
export function useOtpCooldown(seconds: number = RESEND_COOLDOWN_SEC) {
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback((customSeconds?: number) => {
    const total = Math.max(0, Math.floor(customSeconds ?? seconds));
    clear();
    setCooldown(total);
    if (total === 0) return;
    timer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clear();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, [clear, seconds]);

  return { cooldown, startCooldown: start, clearCooldown: clear, canResend: cooldown <= 0 };
}
