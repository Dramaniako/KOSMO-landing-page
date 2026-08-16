import React from 'react';
import { Search } from 'lucide-react';
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
    <div className="filter-wrapper glass-panel">
      <form onSubmit={handleSearch}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', alignItems: 'flex-end' }}>

          {/* District selector */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="district-select" className="form-label">Wilayah di Bali</label>
            <select
              id="district-select"
              className="form-select"
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

          {/* Max Price Range */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Maksimal Budget</label>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
                {formatRupiah(priceMax)}
              </span>
            </div>
            <input
              type="range"
              min="1000000"
              max="15000000"
              step="500000"
              value={priceMax}
              onChange={(e) => setPriceMax(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
          </div>

          {/* Search Button */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              <Search size={16} />
              Cari Kos
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetFilters}
              style={{ padding: '10px 14px' }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Facilities Filter Checkboxes */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Fasilitas Termasuk (All-Inclusive):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
            {(Object.keys(facilities) as (keyof FacilityFilterState)[]).map((fac) => {
              const active = facilities[fac];
              return (
                <button
                  type="button"
                  key={String(fac)}
                  onClick={() => toggleFacility(String(fac))}
                  className="facility-pill"
                  style={{
                    cursor: 'pointer',
                    backgroundColor: active ? 'var(--primary-light)' : 'white',
                    color: active ? 'var(--primary)' : 'var(--text-muted)',
                    borderColor: active ? 'var(--primary)' : 'var(--border-color)',
                    fontWeight: active ? 700 : 500
                  }}
                >
                  {renderFacilityIcon(String(fac))}
                  {String(fac)}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
}
