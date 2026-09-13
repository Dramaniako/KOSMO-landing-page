import React from 'react';

interface Props {
  className?: string;
  variant?: 'default' | 'white';
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string;
  showTagline?: boolean;
}

export default function JuraganKostLogo({
  className = '',
  variant = 'default',
  size = 'md',
  subtitle,
  showTagline = false
}: Props) {
  const isWhite = variant === 'white';

  const iconSizes = {
    sm: { box: 'w-7 h-7', icon: 16 },
    md: { box: 'w-9 h-9', icon: 20 },
    lg: { box: 'w-11 h-11', icon: 24 }
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  const currentIcon = iconSizes[size];

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Brand Icon (Stylized Modern House with chimney and window) */}
      <div
        className={`${currentIcon.box} rounded-xl flex items-center justify-center transition-transform duration-200 ${
          isWhite
            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-900/30'
            : 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400'
        }`}
      >
        <svg
          width={currentIcon.icon}
          height={currentIcon.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* House body & roof */}
          <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20v-9.5z" />
          {/* Doorway */}
          <path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6" />
          {/* Chimney */}
          <path d="M18 4.5v3" />
        </svg>
      </div>

      {/* Brand Name */}
      <div className="flex flex-col">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`${textSizes[size]} font-black tracking-tight ${
              isWhite
                ? 'text-white'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            juragan<span className="text-emerald-600 dark:text-emerald-400">kost</span>
          </span>
          {subtitle && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                isWhite
                  ? 'bg-emerald-800/80 text-emerald-200 border border-emerald-700'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
        {showTagline && (
          <span
            className={`text-[10px] font-semibold tracking-wide ${
              isWhite ? 'text-emerald-200/80' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            CARI KOST JADI MUDAH
          </span>
        )}
      </div>
    </div>
  );
}
