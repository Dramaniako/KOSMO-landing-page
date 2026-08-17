import React from 'react';
import { Search, RotateCcw, SlidersHorizontal, MapPin, DollarSign } from 'lucide-react';
import { FacilityFilterState } from '../types/index.ts';
import { useTranslation } from '../context/LanguageContext.tsx';

export interface Props {
  district: string;
  setDistrict: (district: string) => void;
  priceMin: number;
  setPriceMin: (price: number) => void;
  priceMax: number;
  setPriceMax: (price: number) => void;
  facilities: FacilityFilterState;
  toggleFacility: (facilityName: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  resetFilters: () => void;
  renderFacilityIcon: (facilityName: string) => React.ReactNode;
  isSearching?: boolean;
}

export default function SearchFilterBar({
  district,
  setDistrict,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  facilities,
  toggleFacility,
  handleSearch,
  resetFilters,
  renderFacilityIcon,
  isSearching = false
}: Props) {
  const { t } = useTranslation();

  const formatDisplay = (val: number): string => {
    if (val === 0) return '';
    return new Intl.NumberFormat('id-ID').format(val);
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const digits = e.target.value.replace(/\D/g, '');
    setPriceMin(digits ? parseInt(digits, 10) : 0);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const digits = e.target.value.replace(/\D/g, '');
    setPriceMax(digits ? parseInt(digits, 10) : 0);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-lg shadow-slate-100 dark:shadow-none border border-slate-200/60 dark:border-slate-800 -mt-8 relative z-10 max-w-5xl mx-auto filter-wrapper transition-colors duration-200">
      <form onSubmit={handleSearch}>
        {/* Top Row: 12-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* District Selector (col-span-4) */}
          <div className="form-group md:col-span-4 flex flex-col gap-1.5 mb-0">
            <label htmlFor="district-select" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 form-label">
              <MapPin size={14} className="text-blue-600 dark:text-blue-400" />
              {t('filter.district')}
            </label>
            <select
              id="district-select"
              aria-label={t('filter.district')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors form-select"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="Semua">{t('filter.allDistricts')}</option>
              <option value="Denpasar">Denpasar</option>
              <option value="Badung">Badung (Kuta, Seminyak, Canggu)</option>
              <option value="Gianyar">Gianyar (Ubud)</option>
              <option value="Tabanan">Tabanan</option>
            </select>
          </div>

          {/* Minimum Price Input (col-span-3) */}
          <div className="form-group md:col-span-3 flex flex-col gap-1.5 mb-0">
            <label htmlFor="min-price-input" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 form-label">
              <DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />
              {t('filter.minPrice')}
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs font-semibold select-none pointer-events-none">
                Rp
              </span>
              <input
                id="min-price-input"
                aria-label={t('filter.minPrice')}
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatDisplay(priceMin)}
                onChange={handleMinChange}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition form-input"
              />
            </div>
          </div>

          {/* Maximum Price Input (col-span-3) */}
          <div className="form-group md:col-span-3 flex flex-col gap-1.5 mb-0">
            <label htmlFor="max-price-input" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 form-label">
              <DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />
              {t('filter.maxPrice')}
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs font-semibold select-none pointer-events-none">
                Rp
              </span>
              <input
                id="max-price-input"
                aria-label={t('filter.maxPrice')}
                type="text"
                inputMode="numeric"
                placeholder="10.000.000"
                value={formatDisplay(priceMax)}
                onChange={handleMaxChange}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition form-input"
              />
            </div>
          </div>

          {/* Search & Reset Actions (col-span-2) */}
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={isSearching}
              className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white font-semibold py-2.5 px-3 rounded-xl shadow-sm hover:shadow transition text-sm whitespace-nowrap min-h-[44px]"
            >
              {isSearching ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search size={15} />
              )}
              <span>{t('filter.searchBtn')}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2.5 px-3 rounded-xl transition text-sm border border-slate-200/60 dark:border-slate-700 min-h-[44px]"
              onClick={resetFilters}
            >
              <RotateCcw size={14} />
              <span>{t('filter.resetBtn')}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Amenities Toggle Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-3">
          <div className="flex items-center gap-1.5 mr-1 text-slate-400 dark:text-slate-500">
            <SlidersHorizontal size={13} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('filter.facilities')}:
            </span>
          </div>
          {Object.keys(facilities).map((fac) => {
            const active = facilities[fac as keyof FacilityFilterState];
            return (
              <button
                type="button"
                key={fac}
                onClick={() => toggleFacility(fac)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 facility-pill min-h-[32px] ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-semibold shadow-xs ring-1 ring-blue-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300'
                }`}
              >
                {renderFacilityIcon(fac)}
                <span>{fac}</span>
              </button>
            );
          })}
        </div>
      </form>
    </div>
  );
}
