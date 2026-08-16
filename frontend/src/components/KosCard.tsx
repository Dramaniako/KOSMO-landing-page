import React from 'react';
import { MapPin, Star, Sparkles } from 'lucide-react';
import { Property } from '../types/index.ts';

export interface Props {
  property: Property;
  onOpenDetail: (property: Property) => void;
  renderFacilityIcon: (facility: string) => React.ReactNode;
}

export default function KosCard({ property, onOpenDetail, renderFacilityIcon }: Props) {
  const formatRupiah = (val: number): string => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const price = Number(property.price) || 0;
  const rating = Number(property.rating) || 0;
  const totalRooms = Number(property.totalRooms) || 0;
  const occupiedRooms = Number(property.occupiedRooms) || 0;
  const facilities = Array.isArray(property.facilities) ? property.facilities : [];
  const image = property.image && property.image.trim() !== ''
    ? property.image
    : 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';

  const isFull = totalRooms > 0 && occupiedRooms >= totalRooms;
  const availableRooms = Math.max(0, totalRooms - occupiedRooms);

  return (
    <div
      className="group relative bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer property-card kos-card"
      onClick={() => onOpenDetail(property)}
    >
      {/* Top Image Container with Fixed Dimensions */}
      <div className="relative w-full h-52 overflow-hidden bg-slate-100 property-img-wrapper">
        <img
          src={image}
          alt={property.name || 'Kosmo Property'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 property-img"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';
          }}
        />

        {/* Floating Vacancy Badge (Top-Left) */}
        <div
          className={`absolute top-3 left-3 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5 ${
            isFull
              ? 'bg-rose-500/90 text-white'
              : 'bg-emerald-500/90 text-white'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isFull ? 'bg-rose-200' : 'bg-emerald-200'} animate-pulse`} />
          <span>{isFull ? 'Penuh' : `Sisa ${availableRooms} Kamar`}</span>
        </div>

        {/* Floating Rating Chip (Top-Right) */}
        <div className="absolute top-3 right-3 backdrop-blur-md bg-white/90 text-slate-800 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1 property-badge">
          <Star size={13} className="text-amber-500 fill-amber-500" />
          <span>{rating > 0 ? rating.toFixed(1) : 'Baru'}</span>
        </div>
      </div>

      {/* Card Content Body */}
      <div className="p-5 flex-1 flex flex-col justify-between property-body">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lg text-slate-900 line-clamp-1 property-title group-hover:text-blue-600 transition-colors">
              {property.name || 'Properti KOSMO'}
            </h3>
          </div>

          <div className="flex items-center text-sm text-slate-500 gap-1.5 mt-1.5 property-location">
            <MapPin size={14} className="text-blue-500 flex-shrink-0" />
            <span className="line-clamp-1">{property.district || 'Bali'}, Bali</span>
          </div>

          {/* Facility Pills */}
          <div className="flex flex-wrap gap-1.5 mt-3.5 property-facilities">
            {facilities.slice(0, 4).map((fac, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-xs px-2.5 py-1 rounded-full border border-slate-200/60 font-medium facility-pill"
              >
                {renderFacilityIcon(fac)}
                {fac}
              </span>
            ))}
            {facilities.length > 4 && (
              <span className="inline-flex items-center bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full font-medium facility-pill">
                +{facilities.length - 4}
              </span>
            )}
          </div>
        </div>

        {/* Card Footer with Price and Detail Button */}
        <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between property-footer">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-blue-600 font-bold text-lg property-price">{formatRupiah(price)}</span>
              <span className="text-slate-400 text-xs font-normal property-period">/bulan</span>
            </div>
            <div className="flex items-center gap-1 text-emerald-600 text-[11px] font-semibold mt-0.5">
              <Sparkles size={11} />
              <span>All-Inclusive</span>
            </div>
          </div>

          <button
            className="btn btn-secondary px-3.5 py-2 text-xs font-semibold rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(property);
            }}
          >
            Detail
          </button>
        </div>
      </div>
    </div>
  );
}
