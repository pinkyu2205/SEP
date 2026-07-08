import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Eye, EyeOff, Loader2, Lock, ShieldCheck, User } from 'lucide-react';
import { useWebAuth } from '@/auth/WebAuthContext';

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f8f3] px-4 py-10">
      {/* keyframes tự chứa (không đụng file global) */}
      <style>{`
        @keyframes hbl-float-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,-32px) scale(1.08); } }
        @keyframes hbl-float-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px,24px) scale(1.1); } }
        @keyframes hbl-float-c { 0%,100% { transform: translate(0,0); } 50% { transform: translate(20px,26px); } }
        @keyframes hbl-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* đốm màu thương hiệu trôi nhẹ: xanh lá + đỏ */}
      <div className="pointer-events-none absolute -left-20 -top-16 h-80 w-80 rounded-full bg-green-400/35 blur-[90px]" style={{ animation: 'hbl-float-a 13s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-red-400/25 blur-[100px]" style={{ animation: 'hbl-float-b 16s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-emerald-300/30 blur-[90px]" style={{ animation: 'hbl-float-c 19s ease-in-out infinite' }} />
      {/* lưới mờ tan dần */}
      <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] bg-[linear-gradient(to_right,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />

      {/* Thẻ đăng nhập */}
      <div className="relative w-full max-w-sm" style={{ animation: 'hbl-rise 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
        <div className="overflow-hidden rounded-[26px] bg-white shadow-[0_35px_80px_-30px_rgba(20,60,30,0.45)] ring-1 ring-green-900/5">
          {/* thanh nhấn đỏ → xanh (2 màu logo) */}
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-rose-500 to-green-500" />

          <div className="p-8">
            {/* Logo + brand */}
            <div className="mb-7 flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 ring-1 ring-red-500/20">
                <Building2 className="h-7 w-7" />
              </div>
              <h1 className="mt-4 text-xl font-black tracking-tight">
                <span className="text-green-700">Hoàng Bình</span> <span className="text-red-600">Land</span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">Đăng nhập vào bảng điều khiển quản trị</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="group relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-600" />
                <input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/15"
                  placeholder="Tên đăng nhập"
                  type="text"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-green-600" />
                <input
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-11 text-sm font-medium text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/15"
                  placeholder="Mật khẩu"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-sm font-bold text-white shadow-lg shadow-green-600/25 transition-all hover:shadow-xl hover:shadow-green-600/35 focus:outline-none focus:ring-4 focus:ring-green-500/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Đang đăng nhập...</>
                ) : (
                  <>Đăng nhập <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <Lock className="h-3 w-3" />
          Chỉ dành cho quản trị viên được cấp quyền.
        </p>
      </div>
    </div>
  );
};
