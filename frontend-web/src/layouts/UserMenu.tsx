import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import clsx from 'clsx';

/**
 * Chip tài khoản ở góc phải header — bấm mở menu (Cài đặt / Đăng xuất).
 *
 * Trước đây header có một nút đăng xuất trần nằm cạnh tên người dùng. Từ khi
 * AppSidebar có sẵn nút đăng xuất ở thẻ người dùng dưới chân menu, hai nút đăng
 * xuất trần cùng lúc vừa thừa vừa dễ bấm nhầm. Gom về đúng một chip tài khoản:
 * bấm vào mới hiện các hành động, giống cách các app quản trị vẫn làm.
 */
export const UserMenu = ({
  name, subtitle, initials, settingsTo, onLogout, accent = 'indigo',
}: {
  name: string;
  subtitle?: string;
  initials: string;
  settingsTo: string;
  onLogout: () => void;
  accent?: 'indigo' | 'cyan';
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc Esc thì đóng.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatar = accent === 'cyan'
    ? 'from-cyan-500 to-cyan-700'
    : 'from-primary-500 to-primary-700';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          'flex items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-2 transition-colors',
          open ? 'border-slate-300 bg-slate-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
        )}
      >
        <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-black text-white shadow-sm', avatar)}>
          {initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-xs font-bold leading-tight text-slate-900">{name}</span>
          {subtitle && <span className="block truncate text-[10px] leading-tight text-slate-500">{subtitle}</span>}
        </span>
        <ChevronDown className={clsx('h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="truncate text-sm font-bold text-slate-900">{name}</p>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <Link
            to={settingsTo}
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Settings className="h-4 w-4 text-slate-400" /> Cài đặt tài khoản
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            role="menuitem"
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
};
