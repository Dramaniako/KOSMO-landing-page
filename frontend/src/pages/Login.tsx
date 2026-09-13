import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, Phone, ArrowLeft } from 'lucide-react';
import { User } from '../types/index';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle';
import JuraganKostLogo from '../components/JuraganKostLogo';
import { useTranslation } from '../context/LanguageContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [roleTab, setRoleTab] = useState<'tenant' | 'landlord'>('tenant');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    const payload = isLogin
      ? { email, password }
      : { email, password, name, phone };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as AuthResponse;

      if (!res.ok) {
        throw new Error(data.message || 'Terjadi kesalahan autentikasi.');
      }

      // Save to localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
      localStorage.setItem('juragankost_token', data.token);

      // Redirect based on role
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else if (data.user.role === 'landlord') {
        navigate('/landlord');
      } else {
        navigate('/tenant');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center min-h-screen p-4 sm:p-6 bg-gradient-to-br from-emerald-50/50 via-slate-50 to-slate-100 dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-950 transition-colors duration-200">
      <div className="card glass-panel dark:bg-slate-900/95 dark:border-slate-800 max-w-[460px] w-full p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-200/80 dark:border-slate-800">

        {/* Top Controls: Back Link & Theme/Language Toggle */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400 transition"
          >
            <ArrowLeft size={16} />
            <span>{t('nav.home')}</span>
          </button>
          <ThemeLanguageToggle />
        </div>

        {/* Brand Logo & Welcome Heading (Mockup Screen 1 & 2) */}
        <div className="flex flex-col items-center text-center mb-6">
          <JuraganKostLogo size="lg" showTagline />
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-4 tracking-tight">
            Selamat datang di juragan<span className="text-emerald-700 dark:text-emerald-400">kost</span> 👋
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Masuk untuk pengalaman pencarian dan sewa terbaik
          </p>
        </div>

        {/* Role Switcher Tabs (Mockup Screen 2: Mahasiswa / Penyewa vs Pemilik Kost) */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setRoleTab('tenant')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              roleTab === 'tenant'
                ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Mahasiswa / Penyewa
          </button>
          <button
            type="button"
            onClick={() => setRoleTab('landlord')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              roleTab === 'landlord'
                ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Pemilik Kost
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 px-4 py-2.5 rounded-xl text-xs font-semibold mb-5 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div className="form-group mb-0">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.name')}
                </label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    placeholder="Contoh: Bayu Nugroho"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('auth.phone')} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                    placeholder="Contoh: 08123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group mb-0">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {isLogin ? 'Nomor HP / Email' : t('auth.email')}
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                placeholder={isLogin ? 'Masukkan email akun Anda (contoh@email.com)' : 'contoh@email.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Kata Sandi
              </label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => alert("Silakan hubungi admin untuk reset kata sandi akun Anda.")}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Lupa?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                placeholder="Masukkan kata sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm shadow-md hover:shadow-lg transition duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isLogin ? (
              'Masuk'
            ) : (
              t('auth.registerSubmit')
            )}
          </button>
        </form>

        {/* Social Login Options (Mockup Screen 2) */}
        {isLogin && (
          <div className="mt-6">
            <div className="relative flex items-center justify-center mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <span className="relative px-3 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                atau masuk dengan
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => alert("Fitur login Google akan segera hadir!")}
                className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => alert("Fitur login Apple akan segera hadir!")}
                className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 transition"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.07.65-2.73 1.42-.56.65-.99 1.7-1.01 2.76 1.07.08 2.12-.56 2.73-1.31" />
                </svg>
                <span>Apple</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Link */}
        <div className="mt-6 text-center text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {isLogin ? 'Belum punya akun?' : 'Sudah punya akun?'}
          </span>{' '}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 hover:underline cursor-pointer ml-1"
          >
            {isLogin ? 'Daftar sekarang' : 'Masuk sekarang'}
          </button>
        </div>

      </div>
    </div>
  );
}
