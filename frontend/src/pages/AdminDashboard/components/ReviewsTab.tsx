import React from 'react';
import { Star } from 'lucide-react';
import { Review } from '../../../types/index';

export interface ReviewsTabProps {
  reviews: Review[];
  loading: boolean;
  onEditReview: (rev: Review) => void;
  onDeleteReview: (id: string) => void;
}

export default function ReviewsTab({
  reviews,
  loading,
  onEditReview,
  onDeleteReview
}: ReviewsTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Ulasan Pelanggan Secara Global ({reviews.length})</h3>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat ulasan pelanggan...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.map((r) => (
            <div key={r.id} className="card" style={{ padding: '20px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditReview(r)}>
                  Edit
                </button>
                <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => onDeleteReview(r.id)}>
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
