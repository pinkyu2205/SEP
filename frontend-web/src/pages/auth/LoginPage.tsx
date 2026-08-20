import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/common/BrandLogo';
import {
  ArrowRight, Building2, Eye, EyeOff, FileText, Loader2, Lock,
  ShieldCheck, User, Wallet, Zap,
} from 'lucide-react';
import { useWebAuth } from '@/auth/WebAuthContext';

// Ảnh nền panel trái. Nếu ảnh không tải được (mất mạng / chặn hotlink) thì lớp
// gradient thương hiệu phía dưới vẫn hiển thị nên panel không bao giờ bị trắng trơn.
const SLIDES = [
  { url: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1600&q=80', caption: 'Nhà nguyên căn' },
  { url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1600&q=80', caption: 'Biệt thự cho thuê' },
  { url: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1600&q=80', caption: 'Căn hộ cao cấp' },
  { url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80', caption: 'Nhà phố hiện đại' },
];

const SLIDE_MS = 6000;

const FEATURES = [
  { icon: Building2, label: 'Toà nhà & phòng' },
  { icon: FileText,  label: 'Hợp đồng' },
  { icon: Zap,       label: 'Điện nước' },
  { icon: Wallet,    label: 'Dòng tiền' },
];

export const WebLogin = () => {
  const { login } = useWebAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);

  // Tự chuyển ảnh nền panel trái.
  useEffect(() => {
    const timer = setInterval(() => setSlide(prev => (prev + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      const from = (location.state as { from?: string } | null)?.from;
      const defaultPath = user.role === 'admin' ? '/admin' : '/host';
      const validFrom = from && from !== '/login' && (
        user.role === 'admin' ? from.startsWith('/admin') : !from.startsWith('/admin')
      );
      navigate(validFrom ? from : defaultPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-[#f4f8f3]">
      {/* keyframes tự chứa (không đụng file global) */}
      <style>{`
        @keyframes hbl-ken { from { transform: scale(1) translate3d(0,0,0); } to { transform: scale(1.14) translate3d(-1.5%,-2%,0); } }
        @keyframes hbl-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hbl-rise-sm { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hbl-float-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,-32px) scale(1.08); } }
        @keyframes hbl-float-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px,24px) scale(1.1); } }
        @keyframes hbl-float-c { 0%,100% { transform: translate(0,0); } 50% { transform: translate(20px,26px); } }
        @keyframes hbl-shine { 0% { transform: translateX(-130%) skewX(-18deg); } 55%,100% { transform: translateX(230%) skewX(-18deg); } }
        @keyframes hbl-bar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .hbl-anim { animation-fill-mode: both; }
        @media (prefers-reduced-motion: reduce) {
          .hbl-anim, [style*="hbl-"] { animation: none !important; }
        }
      `}</style>

      {/* ══════════════ PANEL TRÁI — ảnh nhà ══════════════ */}
      {/* Tấm ảnh "nổi": bo đều 4 góc + đổ bóng. Lề đặt RIÊNG ở đây (lg:m-4) chứ không
          padding cả trang — nếu padding container thì nền panel phải bị cắt cụt,
          hở một viền sáng dọc mép màn hình. */}
      <div className="relative z-10 hidden w-[54%] shrink-0 overflow-hidden rounded-[2.25rem] shadow-[0_30px_80px_-28px_rgba(2,6,23,0.6)] lg:m-4 lg:block xl:w-[56%]">
        {/* nền dự phòng khi ảnh lỗi */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-800 via-emerald-900 to-slate-900" />

        {/* carousel ảnh + hiệu ứng Ken Burns */}
        {SLIDES.map((s, i) => (
          <div
            key={s.url}
            className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
              i === slide ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src={s.url}
              alt={s.caption}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover"
              style={{ animation: i === slide ? 'hbl-ken 7.5s ease-out both' : 'none' }}
              onError={event => { (event.currentTarget as HTMLImageElement).style.opacity = '0'; }}
            />
          </div>
        ))}

        {/* Lớp phủ đặt đúng chỗ có chữ: tối ở đỉnh (logo) và đáy (tiêu đề), chừa
            khoảng giữa sáng để còn nhìn thấy ngôi nhà. Phủ tối đều tay sẽ biến ảnh
            thành một mảng đen xấu. */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-950/25 via-transparent to-red-950/15" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_70%)]" />

        {/* nội dung trên ảnh */}
        {/* pt lớn để không đụng nút "Về trang chủ" của AuthLayout (absolute top-4 left-4) */}
        <div className="relative flex h-full flex-col justify-between px-10 pb-10 pt-24 xl:px-14 xl:pb-14 xl:pt-28">
          {/* thương hiệu */}
          <div className="hbl-anim flex items-center gap-3" style={{ animation: 'hbl-rise 0.7s cubic-bezier(0.22,1,0.36,1)' }}>
            {/* Trên ảnh nền tối, logo 2 màu bị chìm và bẩn — đổ trắng một màu (`mono`). */}
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 shadow-lg ring-1 ring-white/25 backdrop-blur-md">
              <BrandMark size={30} mono />
            </div>
            <div>
              <p className="text-lg font-black leading-tight text-white">
                Hoàng Bình <span className="text-red-300">Land</span>
              </p>
              <p className="text-xs font-medium text-white/75">Nền tảng quản lý cho thuê</p>
            </div>
          </div>

          {/* tiêu đề + tính năng */}
          <div className="max-w-xl">
            <h2
              className="hbl-anim text-4xl font-black leading-[1.12] tracking-tight text-white [text-shadow:0_2px_20px_rgba(2,6,23,0.55)] xl:text-[2.9rem]"
              style={{ animation: 'hbl-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s' }}
            >
              Quản lý cho thuê,
              <br />
              <span className="bg-gradient-to-r from-green-300 via-emerald-200 to-red-200 bg-clip-text text-transparent">
                gọn trong một nền tảng.
              </span>
            </h2>

            <p
              className="hbl-anim mt-4 max-w-md text-[15px] leading-relaxed text-white/85 [text-shadow:0_1px_12px_rgba(2,6,23,0.6)]"
              style={{ animation: 'hbl-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.3s' }}
            >
              Theo dõi toà nhà, hợp đồng, chỉ số điện nước và dòng tiền của toàn hệ thống — dành riêng cho Quản trị viên và Chủ nhà.
            </p>

            <div
              className="hbl-anim mt-7 flex flex-wrap gap-2.5"
              style={{ animation: 'hbl-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.45s' }}
            >
              {FEATURES.map(f => {
                const Icon = f.icon;
                return (
                  <span
                    key={f.label}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white/90 ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/20"
                  >
                    <Icon className="h-3.5 w-3.5 text-green-300" />
                    {f.label}
                  </span>
                );
              })}
            </div>

            {/* chỉ báo ảnh */}
            <div
              className="hbl-anim mt-9 flex items-center gap-3"
              style={{ animation: 'hbl-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.6s' }}
            >
              <div className="flex items-center gap-2">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.url}
                    type="button"
                    onClick={() => setSlide(i)}
                    aria-label={`Xem ảnh ${i + 1}: ${s.caption}`}
                    className={`h-1.5 overflow-hidden rounded-full transition-all duration-500 ${
                      i === slide ? 'w-10 bg-white/30' : 'w-4 bg-white/25 hover:bg-white/45'
                    }`}
                  >
                    {i === slide && (
                      <span
                        key={`bar-${slide}`}
                        className="block h-full w-full origin-left rounded-full bg-white"
                        style={{ animation: `hbl-bar ${SLIDE_MS}ms linear both` }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <span className="text-xs font-semibold text-white/80 [text-shadow:0_1px_10px_rgba(2,6,23,0.7)]">{SLIDES[slide].caption}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ PANEL PHẢI — form đăng nhập ══════════════ */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        {/* đốm màu thương hiệu trôi nhẹ */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-green-400/45 blur-[90px]" style={{ animation: 'hbl-float-a 13s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-red-400/30 blur-[100px]" style={{ animation: 'hbl-float-b 16s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-64 w-64 rounded-full bg-emerald-300/35 blur-[90px]" style={{ animation: 'hbl-float-c 19s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div
          className="hbl-anim relative w-full max-w-[400px]"
          style={{ animation: 'hbl-rise 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        >
          <div className="overflow-hidden rounded-[26px] bg-white/95 shadow-[0_40px_90px_-28px_rgba(20,60,30,0.55)] ring-1 ring-green-900/[0.07] backdrop-blur-xl">
            {/* thanh nhấn đỏ → xanh (2 màu logo) */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-rose-500 to-green-500" />

            <div className="p-8">
              {/* Logo + brand */}
              <div className="mb-7 flex flex-col items-center text-center">
                {/* Nền TRẮNG để logo giữ nguyên đỏ/xanh — nền gradient xanh cũ nuốt mất
                    nửa đỏ của logo. */}
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200">
                  <BrandMark size={44} />
                </div>
                <h1 className="mt-4 text-xl font-black tracking-tight">
                  <span className="text-green-700">Hoàng Bình</span> <span className="text-red-600">Land</span>
                </h1>
                <p className="mt-1 text-sm text-slate-500">Đăng nhập vào bảng điều khiển quản trị</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div
                  className="hbl-anim group relative"
                  style={{ animation: 'hbl-rise-sm 0.5s cubic-bezier(0.22,1,0.36,1) 0.2s' }}
                >
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-600" />
                  <input
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/15"
                    placeholder="Tên đăng nhập"
                    type="text"
                    autoComplete="username"
                    aria-label="Tên đăng nhập"
                    autoFocus
                  />
                </div>

                <div
                  className="hbl-anim group relative"
                  style={{ animation: 'hbl-rise-sm 0.5s cubic-bezier(0.22,1,0.36,1) 0.3s' }}
                >
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-600" />
                  <input
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm font-medium text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/15"
                    placeholder="Mật khẩu"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-label="Mật khẩu"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <div
                    className="hbl-anim flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700"
                    style={{ animation: 'hbl-rise-sm 0.35s cubic-bezier(0.22,1,0.36,1)' }}
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="hbl-anim group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-sm font-bold text-white shadow-lg shadow-green-600/25 transition-all hover:shadow-xl hover:shadow-green-600/35 focus:outline-none focus:ring-4 focus:ring-green-500/30 disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ animation: 'hbl-rise-sm 0.5s cubic-bezier(0.22,1,0.36,1) 0.4s' }}
                >
                  {/* vệt sáng quét ngang khi hover */}
                  <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 bg-white/25 blur-md group-hover:[animation:hbl-shine_1.1s_ease-out]" />
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Đang đăng nhập...</>
                  ) : (
                    <>Đăng nhập <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                  )}
                </button>
              </form>
            </div>
          </div>

          <p
            className="hbl-anim mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"
            style={{ animation: 'hbl-rise-sm 0.5s cubic-bezier(0.22,1,0.36,1) 0.5s' }}
          >
            <Lock className="h-3 w-3" />
            Chỉ dành cho quản trị viên được cấp quyền.
          </p>
        </div>
      </div>
    </div>
  );
};
