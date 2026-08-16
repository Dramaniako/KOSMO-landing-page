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

  const isFull = property.occupiedRooms >= property.totalRooms;
  const availableRooms = Math.max(0, property.totalRooms - property.occupiedRooms);

  return (
    <div className="card property-card" onClick={() => onOpenDetail(property)}>
      <div className="property-img-wrapper">
        <img
          src={property.image}
          alt={property.name}
          className="property-img"
          loading="lazy"
        />
        <div className="property-badge flex-center">
          <Star size={12} fill="currentColor" />
          <span>{property.rating > 0 ? property.rating.toFixed(1) : 'Baru'}</span>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            backgroundColor: isFull ? 'rgba(239, 68, 68, 0.85)' : 'rgba(16, 185, 129, 0.85)',
            backdropFilter: 'blur(4px)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            fontWeight: 700,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {isFull ? 'Penuh' : `Sisa ${availableRooms} Kamar`}
        </div>
      </div>

      <div className="property-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h3 className="property-title">{property.name}</h3>
            <div className="property-location">
              <MapPin size={14} style={{ flexShrink: 0 }} />
              <span>{property.district}, Bali</span>
            </div>
          </div>
        </div>

        <div className="property-facilities">
          {property.facilities.slice(0, 4).map((fac, idx) => (
            <span key={idx} className="facility-pill">
              {renderFacilityIcon(fac)}
              {fac}
            </span>
          ))}
          {property.facilities.length > 4 && (
            <span className="facility-pill">+{property.facilities.length - 4}</span>
          )}
        </div>

        <div className="property-footer">
          <div>
            <span className="property-price">{formatRupiah(property.price)}</span>
            <span className="property-period">/bulan</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
              <Sparkles size={11} />
              <span>All-Inclusive</span>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: '13px' }}
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
