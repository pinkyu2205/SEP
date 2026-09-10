import { Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, Headphones, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { PropertySearchBar } from './PropertySearchBar';
import { ROUTES } from '@/utils/routes';
import { COMPANY } from '@/utils/constants';

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`;

/**
 * Ba con số của khối đầu trang.
 *
 * Trước đây ba con số này nằm rải ba chỗ khác nhau — "1.850+ khách thuê" ở hàng huy hiệu,
 * "320+ bất động sản" và "Còn trống 120+" ở hai thẻ nổi trên ảnh — nên mắt phải nhặt từng
 * mẩu và không cái nào đọng lại. Gom thành một dải thì chúng đọc như một mệnh đề: quy mô,
 * lượng khách, mức phục vụ.
 *
 * Chỉ còn "Còn trống 120+" ở lại trên ảnh: đó là con số DUY NHẤT dẫn tới một hành động
 * (bấm xem nhà), phần còn lại là bối cảnh.
 */
const STATS = [
  { value: '320+', label: 'Bất động sản đang quản lý' },
  { value: '1.850+', label: 'Khách thuê đã đồng hành' },
  { value: '24/7', label: 'Hỗ trợ khi bạn cần' },
] as const;

/** Ba cam kết, thay cho hàng avatar giả trước đây (bốn chấm gradient không đại diện cho ai). */
const PROMISES = [
  { icon: FileCheck2, text: 'Hợp đồng điện tử' },
  { icon: ShieldCheck, text: 'Giá minh bạch' },
  { icon: Headphones, text: 'Quản lý đồng hành' },
] as const;

/** Ảnh minh hoạ Unsplash — hỏng mạng thì ẩn hẳn, đừng để khung ảnh vỡ giữa khối đầu trang. */
const CollageImage = ({ id, className }: { id: string; className: string }) => (
  <img
    src={img(id)}
    alt=""
    className={className}
    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
  />
);

export const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      {/* Mesh + grid background */}
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-green-600/30 blur-3xl animate-float" />
      <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-red-500/20 blur-3xl animate-float [animation-delay:1.5s]" />

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

            {/* Cam kết — đặt NGAY dưới đoạn mô tả và TRÊN nút bấm: đây là ba câu trả lời cho
                nỗi ngại lớn nhất của người đi thuê, đọc xong mới đủ tự tin bấm nút. */}
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
              {PROMISES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-sm text-slate-300">
                  <Icon className="h-4 w-4 text-emerald-300" />
                  {text}
                </li>
              ))}
            </ul>

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

            {/* Dải số liệu */}
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              {STATS.map((s) => (
                <div key={s.label} className="bg-slate-950/60 px-4 py-4 backdrop-blur">
                  <dt className="text-2xl font-extrabold tracking-tight text-white sm:text-[28px]">
                    {s.value}
                  </dt>
                  <dd className="mt-1 text-[11px] leading-snug text-slate-400">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right: image collage */}
          <div className="relative hidden lg:block animate-fade-in [animation-delay:0.2s]">
            <div className="relative grid grid-cols-2 gap-4">
              <div className="space-y-4 pt-10">
                <CollageImage id="photo-1505873242700-f289a29e1e0f" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
                <CollageImage id="photo-1502672260266-1c1ef2d93688" className="aspect-square w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
              </div>
              <div className="space-y-4">
                <CollageImage id="photo-1568605114967-8130f3a36994" className="aspect-square w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
                <CollageImage id="photo-1554995207-c18c203602cb" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
              </div>
            </div>

            {/* Thẻ nổi DUY NHẤT còn lại, và nó bấm được — con số này dẫn thẳng tới danh sách. */}
            <Link
              to={ROUTES.PROPERTIES}
              className="group absolute -right-4 top-6 glass-dark animate-float rounded-2xl px-4 py-3 shadow-2xl transition-colors hover:bg-white/[0.12] [animation-delay:1s]"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Còn trống 120+
                <ArrowRight className="h-3.5 w-3.5 text-emerald-300 transition-transform group-hover:translate-x-0.5" />
              </p>
            </Link>
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
