import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Phone, Sparkles } from 'lucide-react';
import { PropertySearchBar } from './PropertySearchBar';
import { ROUTES } from '../../utils/routes';
import { COMPANY } from '../../utils/constants';

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

export const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      {/* Mesh + grid background */}
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary-600/30 blur-3xl animate-float" />
      <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-accent-500/20 blur-3xl animate-float [animation-delay:1.5s]" />

      <div className="pub-container relative py-16 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left: copy */}
          <div className="animate-fade-up">
            <span className="pub-chip">
              <Sparkles className="h-3.5 w-3.5" />
              {COMPANY.name} · Nền tảng cho thuê uy tín
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl text-balance">
              Giải pháp thuê phòng & nhà ở{' '}
              <span className="text-gradient-light">hiện đại</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
              {COMPANY.name} cung cấp dịch vụ cho thuê phòng trọ, căn hộ và nhà nguyên căn với quy trình
              minh bạch, hợp đồng điện tử và hỗ trợ quản lý chuyên nghiệp.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to={ROUTES.PROPERTIES} className="pub-btn-primary">
                Xem nhà đang cho thuê
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={ROUTES.CONTACT}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/10"
              >
                <Phone className="h-4 w-4" />
                Liên hệ tư vấn
              </Link>
            </div>

            {/* trust badges */}
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-2 text-sm">
                <BadgeCheck className="h-5 w-5 text-cyan-300" />
                <span className="text-slate-300">Hợp đồng điện tử</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex -space-x-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-6 w-6 rounded-full border-2 border-slate-950 bg-gradient-to-br from-primary-400 to-violet-500" />
                  ))}
                </div>
                <span className="text-slate-300"><b className="text-white">1.850+</b> khách thuê</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BadgeCheck className="h-5 w-5 text-cyan-300" />
                <span className="text-slate-300">Hỗ trợ 24/7</span>
              </div>
            </div>
          </div>

          {/* Right: image collage */}
          <div className="relative hidden lg:block animate-fade-in [animation-delay:0.2s]">
            <div className="relative grid grid-cols-2 gap-4">
              <div className="space-y-4 pt-10">
                <img src={img('photo-1505873242700-f289a29e1e0f')} alt="" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
                <img src={img('photo-1502672260266-1c1ef2d93688')} alt="" className="aspect-square w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
              </div>
              <div className="space-y-4">
                <img src={img('photo-1568605114967-8130f3a36994')} alt="" className="aspect-square w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
                <img src={img('photo-1554995207-c18c203602cb')} alt="" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
              </div>
            </div>

            {/* floating stat card */}
            <div className="absolute -left-6 bottom-12 glass-dark animate-float rounded-2xl px-5 py-4 shadow-2xl">
              <p className="text-3xl font-extrabold text-white">320+</p>
              <p className="text-xs text-slate-300">Bất động sản đang quản lý</p>
            </div>
            <div className="absolute -right-4 top-6 glass-dark animate-float rounded-2xl px-4 py-3 shadow-2xl [animation-delay:1s]">
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Còn trống 120+
              </p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-12 lg:mt-16 animate-fade-up [animation-delay:0.15s]">
          <PropertySearchBar />
        </div>
      </div>

      {/* bottom fade to next section */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />
    </section>
  );
};
