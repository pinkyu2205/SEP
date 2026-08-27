import { useState } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

/**
 * Hiển thị dữ liệu định danh (SĐT, CCCD) ở dạng CHE, bấm mắt mới hiện đủ.
 *
 * Host và Admin đều có quyền xem đầy đủ — che ở đây không phải để chặn quyền, mà để dữ liệu
 * không nằm phơi trên màn hình mọi lúc (chụp màn hình, share màn hình khi họp, người ngồi
 * cạnh liếc thấy). Một cú bấm là ra đủ.
 *
 * ⚠️ Đây KHÔNG phải bảo mật: response từ BE vẫn chứa giá trị đầy đủ, mở DevTools là thấy.
 * Muốn chặn thật thì BE phải trả sẵn dạng đã che + có endpoint riêng để xin xem đầy đủ
 * (BE đang làm vậy với ROLE_MANAGER). Xem doc/ nếu cần siết.
 */

/** Giữ `head` ký tự đầu và `tail` ký tự cuối, phần giữa thay bằng dấu chấm. */
export const maskMiddle = (value: string, head = 3, tail = 2): string => {
  const v = value.trim();
  if (v.length <= head + tail) return v;
  return `${v.slice(0, head)}${'•'.repeat(Math.max(3, v.length - head - tail))}${v.slice(-tail)}`;
};

export const MaskedField = ({
  value, icon: Icon, prefix, emptyText, head = 3, tail = 2, className = '',
}: {
  value?: string | null;
  icon?: LucideIcon;
  /** Nhãn ngắn đứng trước giá trị, vd "CCCD". */
  prefix?: string;
  emptyText: string;
  head?: number;
  tail?: number;
  className?: string;
}) => {
  const [shown, setShown] = useState(false);
  const raw = value?.trim();

  if (!raw) {
    return (
      <span className={`inline-flex items-center gap-1 text-slate-400 ${className}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {emptyText}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0 text-slate-400" />}
      {prefix && <span className="text-slate-400">{prefix}</span>}
      {/* tabular-nums + chiều rộng theo nội dung dài nhất để không nhảy layout khi đổi trạng thái */}
      <span className="font-medium tabular-nums">{shown ? raw : maskMiddle(raw, head, tail)}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShown((v) => !v); }}
        title={shown ? 'Ẩn đi' : 'Xem đầy đủ'}
        className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  );
};
