import { Link } from 'react-router-dom';
import { CalendarCheck, Phone } from 'lucide-react';
import { CONTACT } from '../../utils/constants';
import { telHref } from '../../utils/helpers';
import { ROUTES } from '../../utils/routes';
import { Reveal } from './Reveal';

export const HotlineBanner = () => {
  return (
    <section className="bg-white">
      <div className="pub-container py-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-14 text-center text-white shadow-2xl sm:px-12">
            {/* animated mesh */}
            <div className="absolute inset-0 bg-mesh" />
            <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div className="absolute -left-16 top-0 h-56 w-56 rounded-full bg-primary-600/30 blur-3xl animate-float" />
            <div className="absolute -right-10 bottom-0 h-56 w-56 rounded-full bg-accent-500/20 blur-3xl animate-float [animation-delay:1.2s]" />

            <div className="relative">
              <span className="pub-chip">Cần hỗ trợ ngay?</span>
              <p className="mt-5 text-2xl font-semibold text-slate-300">Gọi ngay hotline tư vấn miễn phí</p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight text-gradient-light sm:text-6xl">{CONTACT.hotline}</p>
              <p className="mt-4 text-sm text-white/70">
                Đội ngũ Hoàng Bình Land luôn sẵn sàng hỗ trợ bạn 7 ngày trong tuần.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href={telHref(CONTACT.hotline)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-primary-700 shadow-lg transition-all hover:-translate-y-0.5 sm:w-auto">
                  <Phone className="h-4 w-4" />
                  Gọi ngay
                </a>
                <Link to={ROUTES.CONTACT} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/10 sm:w-auto">
                  <CalendarCheck className="h-4 w-4" />
                  Đặt lịch xem nhà
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
