import React from 'react';
import { Star } from 'lucide-react';
import { Review } from '../../../types/index';
import { shimmerStyle } from '../types';

export interface ReviewsTabProps {
  reviews: Review[];
  loading: boolean;
}

export default function ReviewsTab({ reviews, loading }: ReviewsTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Ulasan Properti Saya ({reviews.length})</h3>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: '96px', ...shimmerStyle }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.map((r) => (
            <div
              key={r.id}
              className="card"
              style={{
                padding: '20px',
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}
            >
              <div style={{ flex: 1, marginRight: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '15px' }}>{r.userName}</strong>
                  <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                    {r.propertyName}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.date}</span>
                </div>

                <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      style={{
                        fill: i < r.rating ? '#f59e0b' : 'transparent',
                        color: i < r.rating ? '#f59e0b' : '#cbd5e1'
                      }}
                    />
                  ))}
                </div>

                <p style={{ fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                  "{r.comment}"
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
