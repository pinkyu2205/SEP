import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogIn, Menu, Phone, X } from 'lucide-react';
import { BrandMark } from '@/components/common/BrandLogo';
import clsx from 'clsx';
import { ROUTES } from '@/utils/routes';
import { COMPANY, CONTACT } from '@/utils/constants';
import { telHref } from '@/utils/helpers';

const NAV_ITEMS = [
  { label: 'Trang chủ', to: ROUTES.HOME, end: true },
  { label: 'Nhà cho thuê', to: ROUTES.PROPERTIES, end: false },
  { label: 'Liên hệ', to: ROUTES.CONTACT, end: false },
];

export const PublicHeader = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'relative px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors',
      isActive ? 'text-green-600' : 'text-slate-600 hover:text-green-600',
      'after:absolute after:left-3.5 after:right-3.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-green-600 after:to-emerald-500 after:transition-all after:duration-300',
      isActive ? 'after:opacity-100 after:scale-x-100' : 'after:opacity-0 after:scale-x-0',
    );

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 backdrop-blur-xl transition-all duration-300',
        scrolled ? 'border-b border-slate-200/70 bg-white/90 shadow-sm' : 'border-b border-slate-100/60 bg-white/75',
      )}
    >
      <div className="pub-container">
        <div className="flex h-[68px] items-center justify-between gap-4">
          {/* Logo */}
          <Link to={ROUTES.HOME} className="group flex items-center gap-2.5 flex-shrink-0">
            {/* Logo để trần trên nền trắng, không bọc ô gradient xanh: ô xanh nuốt mất
                nửa đỏ của logo, mà đỏ/xanh mới là điểm nhận diện. */}
            <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105">
              <BrandMark size={38} />
            </div>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight text-slate-900">{COMPANY.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-green-500">Cho thuê nhà & phòng</p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 px-1.5 py-1 backdrop-blur">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-3">
            <a href={telHref(CONTACT.hotline)} className="group flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-600 transition-colors group-hover:bg-green-600 group-hover:text-white">
                <Phone className="h-4 w-4" />
              </span>
              <span className="leading-tight">
                <span className="block text-[10px] font-medium text-slate-400">Hotline 24/7</span>
                <span className="text-sm font-extrabold text-slate-900">{CONTACT.hotline}</span>
              </span>
            </a>
            <span className="h-8 w-px bg-slate-200" />
            <Link
              to={ROUTES.LOGIN}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-600/25 transition-all hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-xl hover:shadow-green-600/35"
            >
              <LogIn className="h-4 w-4" />
              Đăng nhập
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 backdrop-blur"
            aria-label="Mở menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-slate-200 bg-white/95 backdrop-blur-xl animate-fade-in">
          <nav className="pub-container py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'block px-3 py-3 text-sm font-semibold rounded-xl transition-colors',
                    isActive ? 'text-green-600 bg-green-50' : 'text-slate-700 hover:bg-slate-50',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
              <a href={telHref(CONTACT.hotline)} className="flex items-center gap-2 px-3 py-3 text-sm font-bold text-green-700">
                <Phone className="h-4 w-4" /> Hotline: {CONTACT.hotline}
              </a>
              <Link
                to={ROUTES.LOGIN}
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-green-600/25"
              >
                <LogIn className="h-4 w-4" /> Đăng nhập
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
