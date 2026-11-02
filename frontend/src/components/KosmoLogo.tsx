import React, { useId } from 'react';

export interface KosmoLogoProps {
  size?: number;
  variant?: 'primary' | 'danger' | 'emerald';
  showText?: boolean;
  title?: string;
  badgeText?: string;
  subtitle?: string;
  textTheme?: 'auto' | 'light';
  className?: string;
}

export const KosmoLogo: React.FC<KosmoLogoProps> = ({
  size = 38,
  variant = 'primary',
  showText = true,
  title = 'KOSMO',
  badgeText,
  subtitle,
  textTheme = 'auto',
  className = ''
}) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `kosmo-bg-${uid}`;
  const roofGradId = `kosmo-roof-${uid}`;
  const sunGradId = `kosmo-sun-${uid}`;

  const gradientStops =
    variant === 'danger'
      ? { start: '#EF4444', mid: '#DC2626', end: '#991B1B', accent: '#FCA5A5' }
      : variant === 'emerald'
        ? { start: '#10B981', mid: '#059669', end: '#065F46', accent: '#6EE7B7' }
        : { start: '#2563EB', mid: '#1D4ED8', end: '#1E3A8A', accent: '#38BDF8' };

  const badgeColors =
    variant === 'danger'
      ? { color: 'var(--danger, #ef4444)' }
      : variant === 'emerald'
        ? { color: 'var(--success, #10b981)' }
        : { color: 'var(--primary, #2563eb)' };

  return (
    <div
      data-testid="kosmo-logo"
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${title}${badgeText ? ` ${badgeText}` : ''} Logo`}
        style={{ flexShrink: 0, filter: 'drop-shadow(0 4px 10px rgba(37, 99, 235, 0.22))' }}
      >
        <defs>
          <linearGradient id={bgGradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientStops.start} />
            <stop offset="55%" stopColor={gradientStops.mid} />
            <stop offset="100%" stopColor={gradientStops.end} />
          </linearGradient>
          <linearGradient id={roofGradId} x1="12" y1="12" x2="52" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={gradientStops.accent} />
            <stop offset="100%" stopColor="#BAE6FD" />
          </linearGradient>
          <linearGradient id={sunGradId} x1="28" y1="8" x2="36" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${bgGradId})`} />
        <rect x="3" y="3" width="58" height="58" rx="15" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="1.5" />
        <circle cx="32" cy="13.5" r="3.5" fill={`url(#${sunGradId})`} />
        <path d="M11 26.5L32 14.5L53 26.5L50.2 30.2L32 19.8L13.8 30.2L11 26.5Z" fill={`url(#${roofGradId})`} />
        <path d="M19 27H25.5V50H19V27Z" fill="#FFFFFF" />
        <path d="M27.5 38L40 27H47.5L34.5 38.2L48 50H40.2L27.5 38Z" fill="#FFFFFF" />
        <rect x="17" y="48.5" width="30" height="2.5" rx="1.25" fill={gradientStops.accent} fillOpacity="0.9" />
      </svg>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span
            className={
              textTheme === 'light'
                ? 'font-extrabold tracking-tight text-white'
                : 'font-extrabold tracking-tight text-slate-900 dark:text-white'
            }
            style={{
              fontSize: size >= 40 ? '21px' : '18px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: textTheme === 'light' ? '#ffffff' : undefined
            }}
          >
            {title}
            {badgeText && (
              <span style={{ ...badgeColors, fontWeight: 600, fontSize: '14px', marginLeft: '5px' }}>
                {badgeText}
              </span>
            )}
          </span>
          {subtitle && (
            <span
              className="text-[10px] font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: '2px'
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default KosmoLogo;
