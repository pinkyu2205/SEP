import type { ReactNode } from 'react';
import { CalendarPlus, ChevronDown } from 'lucide-react';
import {
  EXTENSION_STATUS_META,
  type AdminExtensionRequest,
} from '@/services/extensionRequest.service';

/**
 * MỘT ĐƠN GIA HẠN THU GỌN — dùng chung cho cổng Admin (duyệt) và Host (chỉ xem).
 *
 * Dòng thu gọn giữ đúng thứ đủ để xếp việc: ai, nhà/phòng nào, xin mấy tháng, gửi bao lâu
 * rồi và còn mấy ngày thì đơn tự đóng. Lời khách nhắn, ý kiến quản lý và nút duyệt nằm
 * trong phần mở rộng (`children`) — bấm dòng mới hiện.
 *
 * Vì sao phải thu gọn: mỗi đơn đầy đủ cao ~300px, mười đơn là cuộn ba màn mới thấy đơn
 * cuối — mà đơn cuối lại là đơn sắp tự đóng (cũ nhất). Nhìn một lượt được cả danh sách
 * thì mới biết nên xử đơn nào trước.
 */

/** Máy chủ tự đóng đơn PENDING sau ngần này ngày (EXPIRED) — xem extensionRequest.service. */
const AUTO_CLOSE_DAYS = 7;

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';

/** Số ngày từ lúc gửi — kẹp về 0 để giờ máy chủ lệch múi không ra số âm. */
const daysSince = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

export const ExtensionRequestRow = ({ r, expanded, onToggle, actions, children }: {
  r: AdminExtensionRequest;
  expanded: boolean;
  onToggle: () => void;
  /** Nút luôn hiện bên phải dòng thu gọn (VD "Duyệt" của admin). */
  actions?: ReactNode;
  /** Chi tiết — chỉ render khi mở. */
  children: ReactNode;
}) => {
  const meta = EXTENSION_STATUS_META[r.status];
  const pending = r.status === 'PENDING';
  const age = daysSince(r.createdAt);
  const left = age === null ? null : Math.max(0, AUTO_CLOSE_DAYS - age);
  // Còn ≤ 2 ngày là sắp tự đóng — khách mất quyền gia hạn nếu không ai xử kịp.
  const urgent = pending && left !== null && left <= 2;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
      expanded ? 'border-slate-300 ring-1 ring-slate-200' : urgent ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
        <button type="button" onClick={onToggle} aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
          <span className={`shrink-0 rounded-xl p-2.5 ${
            urgent ? 'bg-rose-100 text-rose-700' : 'bg-cyan-50 text-cyan-700'}`}>
            <CalendarPlus className="h-4 w-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-slate-900">{r.tenantFullName ?? '(chưa có tên)'}</span>
              {pending && left !== null ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  urgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {left === 0 ? 'tự đóng hôm nay' : `tự đóng sau ${left} ngày`}
                </span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-sm text-slate-500">
              {[
                r.propertyName,
                r.roomNumber ? `P.${r.roomNumber}` : 'Nguyên căn',
                r.contractCode,
                `gửi ${fmtDate(r.createdAt)}`,
              ].filter(Boolean).join(' · ')}
            </span>
          </span>

          <span className="hidden shrink-0 text-right sm:block">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Xin thêm</span>
            <span className="block text-lg font-extrabold tabular-nums text-slate-900">{r.months} tháng</span>
            {!!r.newEndDate && <span className="block text-[11px] text-slate-500">→ {fmtDate(r.newEndDate)}</span>}
          </span>

          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {actions}
      </div>

      {expanded && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
};

/** Bộ nhớ đơn nào đang mở — tách ra để hai trang dùng chung một kiểu. */
export const toggleInSet = (prev: Set<number>, id: number) => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};
