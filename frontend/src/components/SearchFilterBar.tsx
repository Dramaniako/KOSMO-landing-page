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
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80 mb-8 filter-wrapper">
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* District selector */}
          <div className="form-group flex flex-col gap-2">
            <label htmlFor="district-select" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 form-label">
              <MapPin size={14} className="text-blue-500" />
              Wilayah di Bali
            </label>
            <div className="relative">
              <select
                id="district-select"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer font-medium form-select"
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
          </div>

          {/* Max Price Range Slider */}
          <div className="form-group flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 form-label">
                <DollarSign size={14} className="text-emerald-500" />
                Maksimal Budget
              </label>
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                {formatRupiah(priceMax)}
              </span>
            </div>
            <div className="py-2">
              <input
                type="range"
                min="1000000"
                max="15000000"
                step="500000"
                value={priceMax}
                onChange={(e) => setPriceMax(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium mt-1">
                <span>Rp 1 Jt</span>
                <span>Rp 7.5 Jt</span>
                <span>Rp 15 Jt</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5">
            <button
              type="submit"
              className="btn btn-primary flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-5 rounded-xl shadow-sm hover:shadow transition-all text-sm"
            >
              <Search size={16} />
              <span>Cari Kos</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all text-sm border border-slate-200/60"
              onClick={resetFilters}
            >
              <RotateCcw size={15} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Facility Filter Pills */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fasilitas Termasuk (All-Inclusive):
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(facilities) as (keyof FacilityFilterState)[]).map((fac) => {
              const active = facilities[fac];
              return (
                <button
                  type="button"
                  key={String(fac)}
                  onClick={() => toggleFacility(String(fac))}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer facility-pill ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-500/20 shadow-sm'
                      : 'bg-slate-50/80 text-slate-600 border-slate-200/70 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  {renderFacilityIcon(String(fac))}
                  <span>{String(fac)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
}
