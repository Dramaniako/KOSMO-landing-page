import React, { useState } from 'react';
import { Sun, Moon, Globe, DollarSign } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export type CurrencyPreference = 'idr' | 'usd' | 'both';

export interface CurrencyToggleProps {
  preference?: CurrencyPreference;
  onToggle?: (next: CurrencyPreference) => void;
  className?: string;
}

export function CurrencyToggle({
  preference = 'both',
  onToggle,
  className = ''
}: CurrencyToggleProps) {
  const [pref, setPref] = useState<CurrencyPreference>(() => {
    try {
      return (localStorage.getItem('kosmo_currency') as CurrencyPreference) || preference;
    } catch {
      return preference;
    }
  });

  const handleCycle = () => {
    const next: CurrencyPreference = pref === 'idr' ? 'usd' : pref === 'usd' ? 'both' : 'idr';
    setPref(next);
    try {
      localStorage.setItem('kosmo_currency', next);
    } catch {
      // safe fallback for restricted storage environments
    }
    onToggle?.(next);
  };

  const label = pref === 'idr' ? 'IDR' : pref === 'usd' ? 'USD' : 'IDR/USD';

  return (
    <button
      type="button"
      onClick={handleCycle}
      className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl flex items-center justify-center gap-1 text-xs font-bold transition-all duration-200 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${className}`}
      title="Ubah preferensi mata uang (IDR / USD / Dual)"
      aria-label="Ubah preferensi mata uang"
    >
      <DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />
      <span className="uppercase tracking-wider font-extrabold">{label}</span>
    </button>
  );
}

interface Props {
  className?: string;
  showLabels?: boolean;
  showCurrencyToggle?: boolean;
  currencyPreference?: CurrencyPreference;
  onCurrencyToggle?: (pref: CurrencyPreference) => void;
}

export default function ThemeLanguageToggle({
  className = '',
  showLabels = false,
  showCurrencyToggle = false,
  currencyPreference = 'both',
  onCurrencyToggle
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useTranslation();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Optional Currency Preference Toggle */}
      {showCurrencyToggle && (
        <CurrencyToggle preference={currencyPreference} onToggle={onCurrencyToggle} />
      )}

      {/* Language Toggle Button */}
      <button
        type="button"
        onClick={toggleLanguage}
        className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-200 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        title={t('nav.switchLang')}
        aria-label={t('nav.switchLang')}
      >
        <Globe size={15} className="text-blue-600 dark:text-blue-400" />
        <span className="uppercase tracking-wider font-extrabold">{language}</span>
        {showLabels && <span className="hidden sm:inline font-normal text-slate-500 dark:text-slate-400">({language === 'id' ? 'ID' : 'EN'})</span>}
      </button>

      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        title={t('nav.switchTheme')}
        aria-label={t('nav.switchTheme')}
      >
        {theme === 'dark' ? (
          <Sun size={18} className="text-amber-400 animate-in spin-in-90 duration-200" />
        ) : (
          <Moon size={18} className="text-slate-600 animate-in spin-in-90 duration-200" />
        )}
      </button>
    </div>
  );
}

