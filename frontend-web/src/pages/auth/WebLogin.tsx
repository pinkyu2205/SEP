import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useWebAuth } from '../../auth/WebAuthContext';

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'Phân quyền theo vai trò',
    desc: 'Admin và Host/Admin System tách biệt phạm vi truy cập.',
  },
  {
    icon: Building2,
    title: 'Quản lý tập trung',
    desc: 'Toà nhà, hợp đồng, khách thuê và tài chính trong một nơi.',
  },
  {
    icon: BarChart3,
    title: 'Báo cáo realtime',
    desc: 'Dòng tiền, tỷ lệ lấp đầy và KPI cập nhật tức thì.',
  },
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
    <div className="min-h-screen bg-slate-950 text-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* HERO TRÁI */}
      <section className="relative overflow-hidden px-6 py-12 md:px-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.22),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.22),transparent_28%)]" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500 shadow-lg shadow-cyan-950/40">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-black leading-tight">Hoàng Bình Land</p>
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200">Web Admin Portal</p>
            </div>
          </div>

          <div className="mt-16 max-w-2xl lg:mt-20">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin &amp; Host/Admin System
            </p>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Đăng nhập đúng vai trò để vào đúng cổng quản trị.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-300">
              Admin quản trị toàn hệ thống web. Host/Admin System chỉ quản lý dữ liệu thuộc phạm vi được gán.
            </p>
          </div>
        </div>

        {/* Điểm nổi bật + footer (chỉ hiện ở màn lớn) */}
        <div className="relative mt-16 hidden lg:block">
          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <Icon className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-400">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xs text-slate-500">© 2026 Hoàng Bình Land. Bảo lưu mọi quyền.</p>
        </div>
      </section>

      {/* FORM PHẢI */}
      <section className="flex items-center justify-center bg-slate-100 px-6 py-12 text-slate-900">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-950/10">
            <div className="mb-7">
              <h2 className="text-2xl font-black text-slate-950">Đăng nhập</h2>
              <p className="mt-2 text-sm text-slate-500">Truy cập bảng điều khiển quản trị Hoàng Bình Land.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên đăng nhập</span>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    className="input-field pl-9"
                    placeholder="Nhập tên đăng nhập"
                    type="text"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="input-field pl-9 pr-10"
                    placeholder="Nhập mật khẩu"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-60"
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Chỉ dành cho quản trị viên được cấp quyền truy cập hệ thống.
          </p>
        </div>
      </section>
    </div>
  );
};
