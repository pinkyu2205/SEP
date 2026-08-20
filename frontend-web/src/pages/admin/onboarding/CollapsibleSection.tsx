import { useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * Vỏ thu gọn cho các khối danh sách dài — mặc định ĐÓNG, bấm tiêu đề mới mở.
 *
 * Lý do có: mấy panel thiết bị nằm giữa những trang vốn đã dài (duyệt giá, chi tiết toà nhà).
 * Một toà 50 phòng dễ có vài trăm thiết bị; kể cả đã phân trang 10 dòng thì khối đó vẫn chiếm
 * cả màn hình và đẩy phần quan trọng hơn (chốt giá) xuống tít dưới. Đóng sẵn thì trang gọn
 * lại còn vài dòng, ai cần chi tiết mới bấm mở.
 *
 * Tiêu đề luôn hiện `summary` — số lượng, tổng giá trị… — nên đóng vẫn nắm được ý chính,
 * không phải mở ra chỉ để biết có bao nhiêu món.
 */
export const CollapsibleSection = ({
  icon: Icon, iconClass = 'text-indigo-500', title, subtitle, summary, defaultOpen = false, children,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  subtitle?: string;
  /** Thông tin tóm tắt hiện ngay trên tiêu đề, đọc được khi vẫn đang đóng. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black uppercase tracking-widest text-slate-600">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs font-normal normal-case tracking-normal text-slate-400">{subtitle}</span>}
        </span>
        {summary && <span className="shrink-0 text-xs">{summary}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="border-t border-slate-100 p-5 pt-4">{children}</div>}
    </section>
  );
};
