import React from 'react';
import { Plus, Star, Edit, Trash2 } from 'lucide-react';
import { Review } from '../../../types/index';

interface TenantReviewsListProps {
  reviews: Review[];
  propertiesCount: number;
  isLoading: boolean;
  isLoaded: boolean;
  onOpenNewReview: () => Promise<void>;
  onEditReview: (rev: Review) => Promise<void>;
  onDeleteReview: (id: string) => Promise<void>;
}

export const TenantReviewsList: React.FC<TenantReviewsListProps> = ({
  reviews,
  propertiesCount,
  isLoading,
  isLoaded,
  onOpenNewReview,
  onEditReview,
  onDeleteReview
}) => {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px' }}>Ulasan Sewa Saya ({reviews.length})</h3>
        <button 
          className="btn btn-primary" 
          onClick={onOpenNewReview}
          disabled={propertiesCount === 0}
        >
          <Plus size={16} />
          Tulis Review Baru
        </button>
      </div>

      {isLoading && !isLoaded ? (
        <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat ulasan saya...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Anda belum menulis ulasan apapun.</p>
          <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={onOpenNewReview}>
            Tulis Review Pertama Anda
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.map((rev) => (
            <div key={rev.id} style={{ padding: '20px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }} className="flex-between">
              <div style={{ flex: 1, marginRight: '24px' }}>
                <div className="flex-between" style={{ marginBottom: '6px' }}>
                  <strong style={{ fontSize: '15px' }}>{rev.propertyName}</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rev.date}</span>
                </div>

                <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      size={12} 
                      style={{ 
                        fill: i < rev.rating ? '#f59e0b' : 'transparent', 
                        color: i < rev.rating ? '#f59e0b' : '#cbd5e1' 
                      }} 
                    />
                  ))}
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                  "{rev.comment}"
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditReview(rev)}>
                  <Edit size={14} />
                </button>
                <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => onDeleteReview(rev.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
