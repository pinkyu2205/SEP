import { Link } from 'react-router-dom';
import { MapPin, Phone } from 'lucide-react';
import { BrandMark } from '@/components/common/BrandLogo';
import { ROUTES } from '@/utils/routes';
import { COMPANY, CONTACT } from '@/utils/constants';
import { telHref } from '@/utils/helpers';
import { serverNow } from '@/utils/serverTime';

const QUICK_LINKS = [
  { label: 'Trang chủ', to: ROUTES.HOME },
  { label: 'Nhà cho thuê', to: ROUTES.PROPERTIES },
  { label: 'Liên hệ', to: ROUTES.CONTACT },
];

export const PublicFooter = () => {
  return (
    <footer className="relative overflow-hidden bg-slate-950 text-slate-300">
      <div className="absolute inset-0 bg-mesh opacity-40" />
      <div className="pub-container relative pt-16 pb-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              {/* Chân trang nền tối → nền trắng bọc logo để giữ đúng hai màu. */}
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white">
                <BrandMark size={32} />
              </div>
              <p className="text-xl font-extrabold text-white">{COMPANY.name}</p>
            </div>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
              {COMPANY.slogan}. Cho thuê phòng trọ, căn hộ và nhà nguyên căn với quy trình minh bạch,
              hợp đồng điện tử và hỗ trợ quản lý chuyên nghiệp.
            </p>
            <div className="mt-6">
              <a href={telHref(CONTACT.hotline)} className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/10 transition-colors hover:bg-green-600">
                <Phone className="h-4 w-4" /> Hotline: {CONTACT.hotline}
              </a>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Liên hệ</h3>
            <ul className="mt-5 space-y-3.5 text-sm">
              <li>
                <a href={telHref(CONTACT.hotline)} className="flex items-center gap-3 text-slate-400 hover:text-white">
                  <Phone className="h-4 w-4 text-green-400 flex-shrink-0" />
                  {CONTACT.hotline}
                </a>
              </li>
              <li className="flex items-start gap-3 text-slate-400">
                <MapPin className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                {CONTACT.address}
              </li>
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Liên kết nhanh</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {QUICK_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-slate-400 transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          © {serverNow().getFullYear()} {COMPANY.name}. Bảo lưu mọi quyền.
        </div>
      </div>
    </footer>
  );
};
