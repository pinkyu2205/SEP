import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useWebAuth } from '../../auth/WebAuthContext';

export const WebLogin = () => {
  const { login } = useWebAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('superadmin@roomrent.vn');
  const [password, setPassword] = useState('super123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      const fallback = user.role === 'super_admin' ? '/super-admin' : '/';
      navigate(from && from !== '/login' ? from : fallback, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role: 'super_admin' | 'host') => {
    if (role === 'super_admin') {
      setEmail('superadmin@gmail.com');
      setPassword('123456');
    } else {
      setEmail('host@gmail.com');
      setPassword('123456');
    }
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative overflow-hidden px-6 py-10 md:px-10 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.22),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.22),transparent_28%)]" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500 shadow-lg shadow-cyan-950/40">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-black leading-tight">RoomRent OS</p>
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200">Web Admin Portal</p>
            </div>
          </div>

          <div className="mt-20 max-w-2xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-cyan-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Super Admin & Host/Admin System
            </p>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">
              Đăng nhập đúng vai trò để vào đúng cổng quản trị.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-300">
              Super Admin quản trị toàn hệ thống web. Host/Admin System chỉ quản lý dữ liệu thuộc phạm vi được gán.
            </p>
          </div>
        </div>

        <div className="relative mt-16 grid gap-3 text-sm md:grid-cols-3">
          {[
            ['Super Admin', 'Toàn quyền hệ thống'],
            ['Host/Admin System', 'Quản lý phạm vi Host'],
            ['RBAC Guard', 'Chặn truy cập sai role'],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="font-bold text-white">{title}</p>
              <p className="mt-1 text-xs text-slate-300">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center bg-slate-100 px-6 py-10 text-slate-900">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/10">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-950">Đăng nhập Web Dashboard</h2>
            <p className="mt-2 text-sm text-slate-500">Chọn tài khoản demo hoặc nhập thông tin của bạn.</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('super_admin')}
              className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-left hover:bg-cyan-100"
            >
              <p className="text-sm font-black text-cyan-900">Super Admin</p>
              <p className="mt-1 text-xs text-cyan-700">superadmin@gmail.com</p>
            </button>
            <button
              type="button"
              onClick={() => fillDemo('host')}
              className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100"
            >
              <p className="text-sm font-black text-indigo-900">Host</p>
              <p className="mt-1 text-xs text-indigo-700">host@gmail.com</p>
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Email</span>
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="input-field"
                placeholder="you@company.vn"
                type="email"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Mật khẩu</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-bold text-slate-800">Tài khoản demo</p>
            <p className="mt-1">Super Admin: superadmin@gmail.com / 123456</p>
            <p>Host: host@gmail.com / 123456</p>
          </div>
        </div>
      </section>
    </div>
  );
};
