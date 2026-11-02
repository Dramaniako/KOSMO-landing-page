import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, Phone, ArrowLeft, Eye, EyeOff, AlertCircle, Building } from 'lucide-react';
import { User } from '../types/index';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle';
import KosmoLogo from '../components/KosmoLogo';
import { useTranslation } from '../context/LanguageContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSessionExpired = searchParams.get('expired') === '1';
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [role, setRole] = useState<'tenant' | 'landlord'>('tenant');
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
      : { email, password, name, phone, role };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as AuthResponse;

      if (!res.ok) {
        throw new Error(data.message || 'Terjadi kesalahan');
      }

      // Save to localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);

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
    <div className="flex-center" style={{ minHeight: '100vh', padding: '24px', background: 'radial-gradient(circle at bottom left, rgba(37, 99, 235, 0.05), transparent 70%)' }}>
      <div className="card glass-panel dark:bg-slate-900 dark:border-slate-800" style={{ maxWidth: '440px', width: '100%', padding: '40px' }}>

        {/* Top Controls: Back Link & Theme/Language Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', transition: 'var(--transition)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--primary)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={16} />
            {t('nav.home')}
          </button>
          <ThemeLanguageToggle />
        </div>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ marginBottom: '12px' }}>
            <KosmoLogo size={56} showText={false} title="KOSMO Portal" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800 }}>KOSMO Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px', textAlign: 'center' }}>
            {isLogin ? t('auth.loginTitle') : t('auth.registerTitle')}
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: '13px', marginBottom: '20px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {isSessionExpired && !error && (
          <div
            data-testid="session-expired-banner"
            role="alert"
            style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, color: '#f59e0b' }} />
            <span>{t('auth.sessionExpired') || 'Sesi Anda telah berakhir. Silakan masuk kembali.'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label className="form-label">{t('auth.role') || 'Peran Akun'}</label>
                <div
                  data-testid="role-selector"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
                >
                  <button
                    type="button"
                    data-testid="role-tenant-btn"
                    className={`btn ${role === 'tenant' ? 'btn-primary' : 'btn-outline'}`}
                    style={{
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: role === 'tenant' ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    onClick={() => setRole('tenant')}
                  >
                    <UserIcon size={15} />
                    {t('auth.tenantRole') || 'Penyewa Kos (Tenant)'}
                  </button>
                  <button
                    type="button"
                    data-testid="role-landlord-btn"
                    className={`btn ${role === 'landlord' ? 'btn-primary' : 'btn-outline'}`}
                    style={{
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: role === 'landlord' ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    onClick={() => setRole('landlord')}
                  >
                    <Building size={15} />
                    {t('auth.landlordRole') || 'Pemilik Kos (Landlord)'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('auth.name')}</label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Bayu Nugroho"
                    style={{ paddingLeft: '42px' }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t('auth.phone')} <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="Contoh: 08123456789 atau +62812..."
                    style={{ paddingLeft: '42px' }}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">{t('auth.email')}</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                type="email"
                className="form-input"
                placeholder="nama@email.com"
                style={{ paddingLeft: '42px' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">{t('auth.password')}</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Masukkan password"
                style={{ paddingLeft: '42px', paddingRight: '42px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                data-testid="toggle-password-visibility"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>


          <button
            type="submit"
            className="btn btn-primary min-h-[44px]"
            style={{ width: '100%', padding: '12px', fontSize: '15px' }}
            disabled={loading}
          >
            {loading ? t('modal.processing') : isLogin ? t('auth.loginSubmit') : t('auth.registerSubmit')}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}
          </span>{' '}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? t('auth.registerSubmit') : t('auth.loginSubmit')}
          </button>
        </div>

      </div>
    </div>
  );
}
