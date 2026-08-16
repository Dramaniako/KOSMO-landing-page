import React from 'react';
import { Search, RotateCcw, SlidersHorizontal, MapPin, DollarSign } from 'lucide-react';
import { FacilityFilterState } from '../types/index.ts';

export interface Props {
  district: string;
  setDistrict: (district: string) => void;
  priceMax: number;
  setPriceMax: (price: number) => void;
  facilities: FacilityFilterState;
  toggleFacility: (facilityName: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  resetFilters: () => void;
  renderFacilityIcon: (facilityName: string) => React.ReactNode;
}

export default function SearchFilterBar({
  district,
  setDistrict,
  priceMax,
  setPriceMax,
  facilities,
  toggleFacility,
  handleSearch,
  resetFilters,
  renderFacilityIcon
}: Props) {
  const formatRupiah = (val: number): string => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-100 border border-slate-200/60 -mt-8 relative z-10 max-w-5xl mx-auto filter-wrapper">
      <form onSubmit={handleSearch}>
        {/* Top Row: 12-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* District Selector (col-span-5) */}
          <div className="form-group md:col-span-5 flex flex-col gap-1.5 mb-0">
            <label htmlFor="district-select" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 form-label">
              <MapPin size={14} className="text-blue-600" />
              Wilayah di Bali
            </label>
            <select
              id="district-select"
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

          {/* Budget Range (col-span-4) */}
          <div className="form-group md:col-span-4 flex flex-col gap-1.5 mb-0">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 form-label">
                <DollarSign size={14} className="text-emerald-600" />
                Maksimal Budget
              </label>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {formatRupiah(priceMax)}
              </span>
            </div>
            <div className="py-1">
              <input
                type="range"
                min="1000000"
                max="15000000"
                step="500000"
                value={priceMax}
                onChange={(e) => setPriceMax(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* Search & Reset Actions (col-span-3) */}
          <div className="md:col-span-3 flex gap-2">
            <button
              type="submit"
              className="btn btn-primary flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:shadow transition text-sm"
            >
              <Search size={15} />
              <span>Cari Kos</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-3.5 rounded-xl transition text-sm border border-slate-200/60"
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
