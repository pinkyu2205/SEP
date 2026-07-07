import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { HeroSection } from '@/components/public/HeroSection';
import { HotlineBanner } from '@/components/public/HotlineBanner';
import { PropertyCard } from '@/components/public/PropertyCard';
import { Reveal } from '@/components/public/Reveal';
import { getFeaturedProperties } from '@/services/public-property.service';
import type { PublicProperty } from '@/types/property';
import { ROUTES } from '@/utils/routes';

const CardSkeleton = () => (
  <div className="animate-pulse overflow-hidden rounded-3xl bg-white ring-1 ring-slate-100">
    <div className="aspect-[4/3] bg-slate-200" />
    <div className="space-y-3 p-5">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-1/2 rounded bg-slate-200" />
      <div className="h-9 w-full rounded bg-slate-100" />
    </div>
  </div>
);

export const HomePage = () => {
  const [featured, setFeatured] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeaturedProperties(6).then((props) => {
      setFeatured(props);
      setLoading(false);
    });
  }, []);

  return (
    <>
      <HeroSection />

      {/* Bất động sản nổi bật */}
      <section className="bg-slate-50">
        <div className="pub-container py-20">
          <Reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="pub-eyebrow">Nổi bật</span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Bất động sản <span className="text-gradient">được quan tâm nhất</span>
              </h2>
              <p className="mt-3 max-w-xl text-slate-500">Những lựa chọn chất lượng, sẵn sàng cho bạn dọn vào ngay.</p>
            </div>
            <Link to={ROUTES.PROPERTIES} className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-primary-600 transition-all hover:-translate-y-0.5 hover:border-primary-200">
              Xem tất cả <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>

          <div className="mt-12 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
              : featured.map((p, i) => (
                  <Reveal key={p.id} delay={i * 80}>
                    <PropertyCard property={p} />
                  </Reveal>
                ))}
          </div>

          <div className="mt-10 text-center sm:hidden">
            <Link to={ROUTES.PROPERTIES} className="pub-btn-primary">
              Xem tất cả <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <HotlineBanner />
    </>
  );
};

export default HomePage;
