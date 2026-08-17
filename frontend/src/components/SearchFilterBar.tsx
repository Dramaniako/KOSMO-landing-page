import React from 'react';
import { Search, RotateCcw, SlidersHorizontal, MapPin, DollarSign } from 'lucide-react';
import { FacilityFilterState } from '../types/index.ts';

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
    <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-100 border border-slate-200/60 -mt-8 relative z-10 max-w-5xl mx-auto filter-wrapper">
      <form onSubmit={handleSearch}>
        {/* Top Row: 12-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* District Selector (col-span-4) */}
          <div className="form-group md:col-span-4 flex flex-col gap-1.5 mb-0">
            <label htmlFor="district-select" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 form-label">
              <MapPin size={14} className="text-blue-600" />
              Wilayah di Bali
            </label>
            <select
              id="district-select"
              aria-label="Wilayah di Bali"
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-slate-50 text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors form-select"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="Semua">Semua Wilayah</option>
              <option value="Denpasar">Denpasar</option>
              <option value="Badung">Badung (Kuta, Seminyak, Canggu)</option>
              <option value="Gianyar">Gianyar (Ubud)</option>
              <option value="Tabanan">Tabanan</option>
            </select>
          </div>

          {/* Minimum Price Input (col-span-3) */}
          <div className="form-group md:col-span-3 flex flex-col gap-1.5 mb-0">
            <label htmlFor="min-price-input" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 form-label">
              <DollarSign size={14} className="text-emerald-600" />
              Harga Minimum
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold select-none pointer-events-none">
                Rp
              </span>
              <input
                id="min-price-input"
                aria-label="Harga Minimum"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatDisplay(priceMin)}
                onChange={handleMinChange}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition form-input"
              />
            </div>
          </div>

          {/* Maximum Price Input (col-span-3) */}
          <div className="form-group md:col-span-3 flex flex-col gap-1.5 mb-0">
            <label htmlFor="max-price-input" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 form-label">
              <DollarSign size={14} className="text-emerald-600" />
              Harga Maksimum
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold select-none pointer-events-none">
                Rp
              </span>
              <input
                id="max-price-input"
                aria-label="Harga Maksimum"
                type="text"
                inputMode="numeric"
                placeholder="10.000.000"
                value={formatDisplay(priceMax)}
                onChange={handleMaxChange}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition form-input"
              />
            </div>
          </div>

          {/* Search & Reset Actions (col-span-2) */}
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={isSearching}
              className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white font-semibold py-2.5 px-3 rounded-xl shadow-sm hover:shadow transition text-sm whitespace-nowrap"
            >
              {isSearching ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search size={15} />
              )}
              <span>Cari Kos</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-3 rounded-xl transition text-sm border border-slate-200/60"
              onClick={resetFilters}
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Amenities Toggle Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 mt-3">
          <div className="flex items-center gap-1.5 mr-1 text-slate-400">
            <SlidersHorizontal size={13} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Fasilitas Termasuk:
            </span>
          </div>
          {Object.keys(facilities).map((fac) => {
            const active = facilities[fac as keyof FacilityFilterState];
            return (
              <button
                type="button"
                key={fac}
                onClick={() => toggleFacility(fac)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 facility-pill ${
                  active
                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold shadow-xs ring-1 ring-blue-500/20'
                    : 'bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100 hover:border-slate-300'
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
