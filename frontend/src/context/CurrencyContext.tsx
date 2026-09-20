import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  formatDualCurrency,
  DualCurrencyOptions,
  DEFAULT_IDR_TO_USD_RATE
} from '../utils/format';

export type CurrencyPreference = 'idr' | 'usd' | 'both';

export interface CurrencyContextType {
  currency: CurrencyPreference;
  setCurrency: (pref: CurrencyPreference) => void;
  toggleCurrency: () => void;
  formatPrice: (val: number | string | undefined | null, options?: DualCurrencyOptions) => string;
  rate: number;
}

const defaultCurrencyContext: CurrencyContextType = {
  currency: 'both',
  setCurrency: () => {},
  toggleCurrency: () => {},
  formatPrice: (val, options) => formatDualCurrency(val, { ...options, mode: options?.mode || 'both' }),
  rate: DEFAULT_IDR_TO_USD_RATE
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<CurrencyPreference>(() => {
    try {
      const saved = localStorage.getItem('kosmo_currency');
      if (saved === 'idr' || saved === 'usd' || saved === 'both') {
        return saved;
      }
    } catch {
      // safe fallback for restricted storage environments
    }
    return 'both';
  });

  useEffect(() => {
    try {
      localStorage.setItem('kosmo_currency', currency);
    } catch {
      // safe fallback for restricted storage environments
    }
  }, [currency]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kosmo_currency' && e.newValue) {
        const val = e.newValue as CurrencyPreference;
        if (val === 'idr' || val === 'usd' || val === 'both') {
          setCurrencyState(val);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleCurrency = () => {
    setCurrencyState((prev) => {
      const next: CurrencyPreference = prev === 'idr' ? 'usd' : prev === 'usd' ? 'both' : 'idr';
      return next;
    });
  };

  const setCurrency = (next: CurrencyPreference) => {
    setCurrencyState(next);
  };

  const formatPrice = (val: number | string | undefined | null, options?: DualCurrencyOptions) => {
    return formatDualCurrency(val, {
      ...options,
      mode: options?.mode || currency,
      rate: options?.rate || DEFAULT_IDR_TO_USD_RATE
    });
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, toggleCurrency, formatPrice, rate: DEFAULT_IDR_TO_USD_RATE }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  return context || defaultCurrencyContext;
};
