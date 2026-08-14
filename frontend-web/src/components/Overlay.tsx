import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bọc mọi modal / drawer toàn màn hình.
 *
 * Lý do phải có: `position: fixed` KHÔNG bám viewport nữa nếu có bất kỳ tổ tiên nào
 * mang `transform` / `filter` / `backdrop-filter` / `perspective` / `contain` — khi đó
 * tổ tiên ấy thành khối chứa, và overlay bị cắt cụt (hụt phần header, không phủ hết màn).
 * Layout của app có sticky header dùng `backdrop-blur`, nên rất dễ dính.
 *
 * Đẩy thẳng ra `document.body` là cách chắc chắn: overlay luôn phủ đúng toàn màn hình và
 * nằm trên mọi thứ, bất kể nó được render từ chỗ nào trong cây component.
 *
 * Kèm luôn việc khoá cuộn nền — mở drawer mà nền vẫn cuộn được thì rất khó chịu.
 */
export const Overlay = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(children, document.body);
};
